import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

// Schema Definitions
const ModuleSchema = z.object({
  title: z.string(),
  content: z.string(),
  duration: z.number(),
  order: z.number(),
  aiGenerated: z.boolean(),
  aiPrompt: z.string().optional(),
});

const CourseSchema = z.object({
  title: z.string(),
  description: z.string(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  marketRelevance: z.number(),
  trendAlignment: z.number(),
  keyTakeaways: z.array(z.string()),
  prerequisites: z.array(z.string()),
  estimatedHours: z.number(),
  modules: z.array(ModuleSchema),
});

// Agent State Definition
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "supervisor",
  }),
  analysis: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  courseStructure: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  courseContent: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

class CourseGenerationAgent {
  private static async getCompletion(prompt: string): Promise<string> {
    const completion = await groq.chat.completions.create({
      messages: [{ 
        role: "user", 
        content: prompt 
      }],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.7,
      max_tokens: 8192,
    });
    return completion.choices[0]?.message?.content || "";
  }

  private static extractJSON(text: string): any {
    try {
      // First attempt: direct JSON parse
      return JSON.parse(text);
    } catch (e) {
      try {
        // Second attempt: Find JSON between backticks or braces
        const jsonMatch = text.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                         text.match(/{[\s\S]*?}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
      } catch (e2) {
        console.error("JSON extraction failed:", e2);
      }
      throw new Error("Could not extract valid JSON from response");
    }
  }

  static async createStructure(state: typeof AgentState.State) {
    try {
      const structurePrompt = `You are a course creation assistant. Create a detailed course structure based on this learning path analysis: ${JSON.stringify(state.analysis)}

IMPORTANT: Your response must be a single valid JSON object without any additional text, markdown formatting, or explanations.

The JSON must follow this exact structure:
{
  "title": "Course Title",
  "description": "Course Description",
  "status": "DRAFT",
  "marketRelevance": 0.8,
  "trendAlignment": 0.7,
  "keyTakeaways": ["takeaway1", "takeaway2"],
  "prerequisites": ["prerequisite1", "prerequisite2"],
  "estimatedHours": 20,
  "modules": [
    {
      "title": "Module Title",
      "content": "Module Content Overview",
      "duration": 60,
      "order": 1,
      "aiGenerated": true
    }
  ]
}

Remember: Return ONLY the JSON object, with no additional text or formatting.`;

      const response = await this.getCompletion(structurePrompt);
      console.log("Raw structure response:", response);
      
      const structure = this.extractJSON(response);
      console.log("Parsed structure:", structure);
      
      // Validate against schema
      const validatedStructure = CourseSchema.parse(structure);

      return {
        messages: [new HumanMessage("Course structure created")],
        courseStructure: validatedStructure,
        next: "CONTENT",
      };
    } catch (error) {
      console.error("Structure creation failed:", error);
      return {
        messages: [new HumanMessage(`Failed to create course structure: ${error instanceof Error ? error.message : String(error)}`)],
        next: "STRUCTURE", // Retry structure creation
      };
    }
  }

  static async generateContent(state: typeof AgentState.State) {
    try {
      const { courseStructure } = state;
      const enrichedModules = await Promise.all(
        courseStructure.modules.map(async (module: any, index: number) => {
          const contentPrompt = `Create detailed content for course module: "${module.title}"
Context: This is module ${index + 1} of ${courseStructure.modules.length} in the course "${courseStructure.title}"

Your response should be MARKDOWN formatted content that includes:
1. A comprehensive explanation of the topic
2. Code examples if relevant
3. Practice exercises
4. Additional resources

Use proper markdown headings, lists, and code blocks where appropriate.
The content should match the estimated duration of ${module.duration} minutes.`;

          const content = await this.getCompletion(contentPrompt);
          return {
            ...module,
            content,
            aiGenerated: true,
            aiPrompt: contentPrompt,
          };
        })
      );

      const enrichedCourse = {
        ...courseStructure,
        modules: enrichedModules,
      };

      // Validate the entire course again
      const validatedCourse = CourseSchema.parse(enrichedCourse);

      return {
        messages: [new HumanMessage("Course content generated")],
        courseContent: validatedCourse,
        next: "FINISH",
      };
    } catch (error) {
      console.error("Content generation failed:", error);
      return {
        messages: [new HumanMessage("Failed to generate course content")],
        next: "FINISH",
      };
    }
  }

  static async supervise(state: typeof AgentState.State) {
    console.log("Current state:", {
      hasStructure: !!state.courseStructure,
      hasContent: !!state.courseContent,
      next: state.next
    });

    if (!state.courseStructure) {
      return { next: "STRUCTURE" };
    }
    if (!state.courseContent) {
      return { next: "CONTENT" };
    }
    return { next: "FINISH" };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { analysis } = body;

    const cookieStore = cookies();
    const userId = (await cookieStore).get("token")?.value;

    if (!analysis || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    let state: typeof AgentState.State = {
      messages: [],
      analysis,
      courseStructure: null,
      courseContent: null,
      next: "STRUCTURE"
    };

    const maxSteps = 3;
    let steps = 0;
    let retries = 0;
    const maxRetries = 2;

    while (state.next !== "FINISH" && steps < maxSteps && retries < maxRetries) {
      console.log(`Step ${steps + 1}: ${state.next} (Attempt ${retries + 1})`);

      const prevState = { ...state };
      
      switch (state.next) {
        case "STRUCTURE":
          state = { ...state, ...(await CourseGenerationAgent.createStructure(state)) };
          break;
        case "CONTENT":
          state = { ...state, ...(await CourseGenerationAgent.generateContent(state)) };
          break;
      }

      // If state hasn't changed, increment retries
      if (state.next === prevState.next) {
        retries++;
      } else {
        retries = 0;
      }

      const nextState = await CourseGenerationAgent.supervise(state);
      state = { ...state, ...nextState };
      steps++;
    }

    if (!state.courseContent) {
      return NextResponse.json(
        { error: "Failed to generate course after multiple attempts" },
        { status: 500 }
      );
    }

    const course = await prisma.course.create({
      data: {
        title: state.courseContent.title,
        description: state.courseContent.description,
        status: "DRAFT",
        marketRelevance: state.courseContent.marketRelevance,
        trendAlignment: state.courseContent.trendAlignment,
        keyTakeaways: state.courseContent.keyTakeaways,
        prerequisites: state.courseContent.prerequisites,
        estimatedHours: state.courseContent.estimatedHours,
        authorId: userId,
        modules: {
          create: state.courseContent.modules.map((module: any) => ({
            title: module.title,
            content: module.content,
            order: module.order,
            duration: module.duration,
            aiGenerated: module.aiGenerated,
            aiPrompt: module.aiPrompt,
          })),
        },
      },
      include: {
        modules: true,
      },
    });

    return NextResponse.json(course);
  } catch (error) {
    console.error("Course generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate course" },
      { status: 500 }
    );
  }
}