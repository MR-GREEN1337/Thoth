import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

// Initialize API clients
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const tavilyTool = new TavilySearchResults({ maxResults: 5 });

// Enhanced Schema Definitions
const ModuleSchema = z.object({
  title: z.string(),
  content: z.string(),
  duration: z.number(),
  order: z.number(),
  aiGenerated: z.boolean(),
  aiPrompt: z.string().optional(),
  searchResults: z.array(z.any()).optional(),
  qualityScore: z.number().optional(),
  revisionHistory: z.array(z.string()).optional(),
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
  searchResults: z.array(z.any()).optional(),
  marketResearch: z.any().optional(),
  qualityMetrics: z.record(z.number()).optional(),
});

class IntelligentCourseAgent {
  private static async getCompletion(
    prompt: string,
    temperature: number = 0.7
  ): Promise<string> {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-90b-vision-preview",
      temperature,
      max_tokens: 8192,
    });
    return completion.choices[0]?.message?.content || "";
  }

  private static async searchContent(query: string): Promise<any[]> {
    try {
      const results = await tavilyTool.invoke(query);
      return Array.isArray(results) ? results : [results];
    } catch (error) {
      console.error("Search failed:", error);
      return [];
    }
  }

  static async createStructure(state: typeof AgentState.State) {
    try {
      const userContext = await this.getUserContext(state.userId);

      const structurePrompt = `Create an innovative course structure based on:
Market Research: ${JSON.stringify(state.marketResearch)}
User Context: ${JSON.stringify(userContext)}
Analysis: ${state.analysis}

Return a JSON object with EXACTLY this structure:
{
  "title": "Clear, specific course title",
  "description": "Detailed course description",
  "status": "DRAFT",
  "marketRelevance": 0.6,
  "trendAlignment": 0.7,
  "keyTakeaways": ["specific takeaway 1", "specific takeaway 2"],
  "prerequisites": ["prerequisite 1", "prerequisite 2"],
  "estimatedHours": 10,
  "modules": [
    {
      "title": "Module 1 Title",
      "content": "Brief module overview",
      "duration": 60,
      "order": 1,
      "aiGenerated": true
    }
  ]
}

Requirements:
1. ALL fields must be included exactly as shown
2. Numbers must be actual numbers, not strings
3. Arrays must have at least one item
4. Status must be exactly "DRAFT"
5. marketRelevance and trendAlignment must be between 0 and 1
6. estimatedHours must be a positive number
7. Each module must have all required fields

Generate ONLY the JSON object with no additional text or explanations.`;

      let response = await this.getCompletion(structurePrompt, 0.3); // Lower temperature for more consistent output
      
      // Clean up response to ensure it's valid JSON
      response = response.trim();
      
      // Log the raw response for debugging
      console.log("Raw structure response:", response);

      // Enhanced JSON extraction
      let structure;
      try {
        // First attempt: direct parse
        structure = JSON.parse(response);
      } catch (error) {
        // Second attempt: find JSON between markers
        const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                         response.match(/{[\s\S]*?}/);
                         
        if (!jsonMatch) {
          console.error("No valid JSON found in response:", response);
          throw new Error("Failed to extract valid JSON");
        }
        
        try {
          structure = JSON.parse(jsonMatch[1]);
        } catch (innerError) {
          console.error("Failed to parse extracted JSON:", jsonMatch[1]);
          throw new Error("Invalid JSON format");
        }
      }

      // Validate the structure before parsing with Zod
      const defaultStructure = {
        status: "DRAFT",
        marketRelevance: 0.6,
        trendAlignment: 0.7,
        keyTakeaways: [],
        prerequisites: [],
        estimatedHours: 10,
        modules: [],
      };

      // Merge with defaults and ensure required fields
      const completeStructure = {
        ...defaultStructure,
        ...structure,
        // Ensure required fields are present
        title: structure.title || "Untitled Course",
        description: structure.description || "Course description pending",
        modules: structure.modules?.map((m: any, i: number) => ({
          title: m.title || `Module ${i + 1}`,
          content: m.content || "Content pending",
          duration: m.duration || 60,
          order: m.order || i + 1,
          aiGenerated: true
        })) || [],
      };

      console.log("Processed structure:", completeStructure);

      // Now validate with Zod
      const validatedStructure = CourseSchema.parse(completeStructure);

      return {
        messages: [new HumanMessage("Course structure created")],
        courseStructure: validatedStructure,
        next: "CONTENT",
      };
    } catch (error) {
      console.error("Structure creation failed:", error);
      
      // Return to supervisor with error for retry
      return {
        messages: [new HumanMessage(`Structure creation failed: ${error}`)],
        next: "ERROR",
      };
    }
  }

  // Also update the JSON extraction utility
  private static extractJSON(text: string): any {
    try {
      // Clean up the text
      const cleaned = text.trim();
      
      // First try: direct parse
      try {
        return JSON.parse(cleaned);
      } catch (e) {
        // Second try: find JSON between markers
        const jsonMatch = cleaned.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) || 
                         cleaned.match(/{[\s\S]*?}/);
                         
        if (!jsonMatch) {
          throw new Error("No valid JSON found in response");
        }
        
        return JSON.parse(jsonMatch[1].trim());
      }
    } catch (error) {
      console.error("JSON extraction failed:", error);
      console.error("Original text:", text);
      throw new Error("Failed to extract valid JSON from response");
    }
  }

  static async marketResearch(state: typeof AgentState.State) {
    try {
      const userContext = await this.getUserContext(state.userId);

      // Perform market research using search tool
      const marketQuery = `${userContext?.expertiseLevel} level course curriculum ${state.analysis} industry trends 2024`;
      const searchResults = await this.searchContent(marketQuery);

      const researchPrompt = `Analyze these market research results and create a course strategy:
${JSON.stringify(searchResults)}

Current context:
- User Level: ${userContext?.expertiseLevel}
- Analysis: ${state.analysis}

Generate market insights in this JSON structure:
{
  "marketTrends": [string],
  "competitorAnalysis": [string],
  "demandIndicators": { trend: string, score: number },
  "recommendedApproach": string,
  "uniqueSellingPoints": [string],
  "targetAudience": string,
  "estimatedMarketSize": string
}`;

      const response = await this.getCompletion(researchPrompt);
      const marketResearch = this.extractJSON(response);

      return {
        messages: [new HumanMessage("Market research completed")],
        marketResearch,
        searchResults,
        next: "STRUCTURE",
      };
    } catch (error) {
      console.error("Market research failed:", error);
      return {
        messages: [new HumanMessage(`Market research failed: ${error}`)],
        next: "ERROR",
      };
    }
  }

  static async generateContent(state: typeof AgentState.State) {
    try {
      const { courseStructure } = state;

      const enrichedModules = await Promise.all(
        courseStructure.modules.map(async (module: any, index: number) => {
          // Search for relevant content
          const searchResults = await this.searchContent(
            `${module.title} course content tutorial examples projects`
          );

          const contentPrompt = `Create comprehensive module content:
Title: "${module.title}"
Search Results: ${JSON.stringify(searchResults)}
Market Research: ${JSON.stringify(state.marketResearch)}

Requirements:
1. Create engaging MARKDOWN content
2. Include code examples and projects
3. Add interactive exercises
4. Incorporate real-world applications
5. Include knowledge checks
6. Reference current industry practices

Content should be highly detailed and practical.`;

          const content = await this.getCompletion(contentPrompt);

          return {
            ...module,
            content,
            searchResults,
            aiGenerated: true,
            aiPrompt: contentPrompt,
            qualityScore: 0, // Will be updated in quality check
            revisionHistory: [],
          };
        })
      );

      const enrichedCourse = {
        ...courseStructure,
        modules: enrichedModules,
      };

      return {
        messages: [new HumanMessage("Course content generated")],
        courseContent: enrichedCourse,
        next: "QUALITY_CHECK",
      };
    } catch (error) {
      console.error("Content generation failed:", error);
      return {
        messages: [new HumanMessage("Content generation failed")],
        next: "ERROR",
      };
    }
  }

  static async qualityCheck(state: typeof AgentState.State) {
    try {
      const { courseContent } = state;

      // Check each module individually
      const moduleQualityChecks = await Promise.all(
        courseContent.modules.map(async (module: any, index: number) => {
          const modulePrompt = `Evaluate this course module quality:
Title: ${module.title}
Duration: ${module.duration} minutes
Order: ${module.order}

Content Summary: ${module.content.substring(0, 1000)}... (truncated)

Rate each metric from 0-1:
1. Content Depth: Comprehensiveness and detail
2. Practical Value: Real-world applicability
3. Clarity: Easy to understand
4. Engagement: Interactive and interesting
5. Market Alignment: Matches industry needs

Return ONLY a JSON object with scores and specific improvement suggestions:
{
  "scores": {
    "contentDepth": number,
    "practicalValue": number,
    "clarity": number,
    "engagement": number,
    "marketAlignment": number
  },
  "suggestions": [string],
  "criticalIssues": [string]
}`;

          const response = await this.getCompletion(modulePrompt);
          const moduleAnalysis = this.extractJSON(response);
          
          return {
            moduleId: index,
            ...moduleAnalysis,
            averageScore: Object.values(moduleAnalysis.scores as Record<string, number>)
              .reduce((a, b) => a + b, 0) / 5
          };
        })
      );

      // Overall course quality assessment
      const courseOverviewPrompt = `Evaluate overall course quality:
Title: ${courseContent.title}
Description: ${courseContent.description}
Total Modules: ${courseContent.modules.length}
Estimated Hours: ${courseContent.estimatedHours}

Individual module scores: ${JSON.stringify(moduleQualityChecks.map(m => ({
  moduleId: m.moduleId,
  averageScore: m.averageScore
})))}

Return ONLY a JSON quality analysis:
{
  "overallScore": number,
  "strengths": [string],
  "weaknesses": [string],
  "recommendedImprovements": [string],
  "marketFit": number
}`;

      const overallResponse = await this.getCompletion(courseOverviewPrompt);
      const overallAnalysis = this.extractJSON(overallResponse);

      // Combine module and overall analysis
      const qualityAnalysis = {
        modules: moduleQualityChecks,
        overall: overallAnalysis,
        averageScore: moduleQualityChecks.reduce((sum, m) => sum + m.averageScore, 0) / 
          moduleQualityChecks.length,
        needsRefinement: moduleQualityChecks.some(m => m.averageScore < 0.6) || 
          overallAnalysis.overallScore < 0.6
      };

      return {
        messages: [new HumanMessage("Quality check completed")],
        qualityAnalysis,
        next: qualityAnalysis.needsRefinement ? "REFINE_CONTENT" : "FINISH",
      };
    } catch (error) {
      console.error("Quality check failed:", error);
      return {
        messages: [new HumanMessage(`Quality check failed: ${error}`)],
        next: "ERROR",
      };
    }
  }

  // Update refineContent to handle chunked content
  static async refineContent(state: typeof AgentState.State) {
    try {
      const { courseContent, qualityAnalysis } = state;

      // Only refine modules that need improvement
      const modulesToRefine = qualityAnalysis.modules
        .filter((m: { averageScore: number; }) => m.averageScore < 0.6)
        .map((m: { moduleId: any; }) => m.moduleId);

      const refinedModules = await Promise.all(
        courseContent.modules.map(async (module: any, index: number) => {
          if (!modulesToRefine.includes(index)) {
            return module; // Skip modules that don't need refinement
          }

          const moduleAnalysis = qualityAnalysis.modules.find((m: { moduleId: number; }) => m.moduleId === index);
          
          const refinementPrompt = `Improve this module content based on quality analysis:
Title: ${module.title}
Current Quality Score: ${moduleAnalysis?.averageScore}

Main issues to address:
${moduleAnalysis?.suggestions.join('\n')}

Critical issues:
${moduleAnalysis?.criticalIssues.join('\n')}

Focus areas:
1. ${moduleAnalysis?.scores.contentDepth < 0.7 ? 'Enhance content depth and detail' : 'Maintain content depth'}
2. ${moduleAnalysis?.scores.practicalValue < 0.7 ? 'Add more practical examples' : 'Maintain practical value'}
3. ${moduleAnalysis?.scores.clarity < 0.7 ? 'Improve clarity and explanation' : 'Maintain clarity'}
4. ${moduleAnalysis?.scores.engagement < 0.7 ? 'Increase engagement and interactivity' : 'Maintain engagement'}
5. ${moduleAnalysis?.scores.marketAlignment < 0.7 ? 'Better align with market needs' : 'Maintain market alignment'}

Original content summary: ${module.content.substring(0, 500)}...

Return improved MARKDOWN content that addresses these issues.`;

          const improvedContent = await this.getCompletion(refinementPrompt);
          
          return {
            ...module,
            content: improvedContent,
            revisionHistory: [...(module.revisionHistory || []), module.content],
            qualityScore: (module.qualityScore || 0) + 0.1,
          };
        })
      );

      const refinedCourse = {
        ...courseContent,
        modules: refinedModules,
      };

      return {
        messages: [new HumanMessage("Content refined")],
        courseContent: refinedCourse,
        next: "QUALITY_CHECK",
      };
    } catch (error) {
      console.error("Content refinement failed:", error);
      return {
        messages: [new HumanMessage("Content refinement failed")],
        next: "ERROR",
      };
    }
  }
  
  static async supervise(state: typeof AgentState.State) {
    try {
      const supervisorPrompt = `Analyze current course generation state and determine next action. Be inclinced to generating high quality content.

Current State:
${JSON.stringify({
  hasMarketResearch: !!state.marketResearch,
  hasStructure: !!state.courseStructure,
  hasContent: !!state.courseContent,
  hasQualityAnalysis: !!state.qualityAnalysis,
  currentStep: state.next,
  qualityScore: state.qualityAnalysis?.averageScore,
  retryCount: state.retryCount || 0,
  previousMessages: state.messages.slice(-3) // Last 3 messages for context
}, null, 2)}

Available Actions:
- MARKET_RESEARCH: Initial market analysis
- STRUCTURE: Create course structure
- CONTENT: Generate module content
- QUALITY_CHECK: Evaluate content quality
- REFINE_CONTENT: Improve content quality
- FINISH: Complete generation
- ERROR: Handle failures

Requirements:
1. MARKET_RESEARCH must complete successfully before STRUCTURE
2. STRUCTURE requires valid market research
3. CONTENT requires valid structure
4. QUALITY_CHECK requires content
5. REFINE_CONTENT triggers if quality score < 0.6
6. FINISH requires all steps complete with good quality

Return a JSON object with:
{
  "next": "ACTION_NAME",
  "reasoning": "Detailed explanation of decision",
  "suggestions": ["improvement suggestions if needed"]
}`;

      const response = await this.getCompletion(supervisorPrompt, 0.2); // Lower temperature for more consistent decisions
      const decision = this.extractJSON(response);

      // State transition logic
      switch (state.next) {
        case "MARKET_RESEARCH":
          if (!state.marketResearch) {
            return {
              next: "MARKET_RESEARCH",
              messages: [new HumanMessage("Retrying market research")],
              retryCount: (state.retryCount || 0) + 1,
            };
          }
          return {
            next: "STRUCTURE",
            messages: [new HumanMessage(decision.reasoning)],
            retryCount: 0,
          };

        case "STRUCTURE":
          if (!state.courseStructure) {
            return {
              next: "STRUCTURE",
              messages: [new HumanMessage("Retrying structure creation")],
              retryCount: (state.retryCount || 0) + 1,
            };
          }
          return {
            next: "CONTENT",
            messages: [new HumanMessage(decision.reasoning)],
            retryCount: 0,
          };

        case "CONTENT":
          if (!state.courseContent) {
            return {
              next: "CONTENT",
              messages: [new HumanMessage("Retrying content generation")],
              retryCount: (state.retryCount || 0) + 1,
            };
          }
          return {
            next: "QUALITY_CHECK",
            messages: [new HumanMessage(decision.reasoning)],
            retryCount: 0,
          };

        case "QUALITY_CHECK":
          if (!state.qualityAnalysis) {
            return {
              next: "QUALITY_CHECK",
              messages: [new HumanMessage("Retrying quality check")],
              retryCount: (state.retryCount || 0) + 1,
            };
          }
          const qualityScore = state.qualityAnalysis.averageScore || 0;
          return {
            next: qualityScore < 0.6 ? "REFINE_CONTENT" : "FINISH",
            messages: [new HumanMessage(decision.reasoning)],
            retryCount: 0,
          };

        case "REFINE_CONTENT":
          if (!state.courseContent) {
            return {
              next: "ERROR",
              messages: [new HumanMessage("Content missing during refinement")],
              retryCount: state.retryCount,
            };
          }
          return {
            next: "QUALITY_CHECK",
            messages: [new HumanMessage(decision.reasoning)],
            retryCount: (state.retryCount || 0) + 1,
          };

        default:
          return {
            next: "ERROR",
            messages: [new HumanMessage(`Invalid state: ${state.next}`)],
            retryCount: state.retryCount,
          };
      }
    } catch (error) {
      console.error("Supervision failed:", error);
      return {
        next: "ERROR",
        messages: [new HumanMessage(`Supervision failed: ${error}`)],
        retryCount: state.retryCount,
      };
    }
  }

  private static async getUserContext(userId: string) {
    return await prisma.user.findUnique({
      where: { id: userId },
      include: {
        courses: {
          select: {
            title: true,
            keyTakeaways: true,
          },
        },
        interests: {
          include: {
            marketTrends: true,
          },
        },
      },
    });
  }
}

// State management
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "MARKET_RESEARCH",
  }),
  userId: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  analysis: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  marketResearch: Annotation<any>({
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
  qualityAnalysis: Annotation<any>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
  retryCount: Annotation<number>({
    reducer: (x, y) => y ?? x,
    default: () => 0,
  }),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;

    if (!body.analysis || !userId) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    let state: typeof AgentState.State = {
      messages: [],
      userId,
      analysis: body.analysis,
      marketResearch: null,
      courseStructure: null,
      courseContent: null,
      qualityAnalysis: null,
      next: "MARKET_RESEARCH",
      retryCount: 0,
    };

    const maxSteps = 10;
    let steps = 0;

    while (
      state.next !== "FINISH" &&
      state.next !== "ERROR" &&
      steps < maxSteps
    ) {
      console.log(`Step ${steps + 1}: ${state.next}`);

      switch (state.next) {
        case "MARKET_RESEARCH":
          state = {
            ...state,
            ...(await IntelligentCourseAgent.marketResearch(state)),
          };
          break;
        case "STRUCTURE":
          state = {
            ...state,
            ...(await IntelligentCourseAgent.createStructure(state)),
          };
          break;
        case "CONTENT":
          state = {
            ...state,
            ...(await IntelligentCourseAgent.generateContent(state)),
          };
          break;
        case "QUALITY_CHECK":
          state = {
            ...state,
            ...(await IntelligentCourseAgent.qualityCheck(state)),
          };
          break;
        case "REFINE_CONTENT":
          state = {
            ...state,
            ...(await IntelligentCourseAgent.refineContent(state)),
          };
          break;
        case "FINISH":
          // Exit the loop when we're done
          break;
        case "ERROR":
          throw new Error(
            (state.messages[state.messages.length - 1]?.content as string) ||
              "Unknown error"
          );
      }

      // Only call supervise if we're not in FINISH state
      if (state.next !== "FINISH") {
        const nextState = await IntelligentCourseAgent.supervise(state);
        state = { ...state, ...nextState };
      }
      steps++;
    }

    // Check for max steps reached
    if (steps >= maxSteps) {
      console.warn("Max steps reached, forcing completion");
      state.next = "FINISH";
    }

    // Handle invalid state
    if (!state.courseContent && state.next === "FINISH") {
      throw new Error("Failed to generate course content");
    }

    const marketInsight = await prisma.marketInsight.create({
      data: {
        type: "TREND",
        content: JSON.stringify(state.marketResearch),
        userId: userId,
        marketTrend: {
          connect:
            state.marketResearch.trends?.map((trend: any) => ({
              id: trend.id,
            })) || [],
        },
      },
    });
    // Create course in database with all metadata
    const course = await prisma.course.create({
      data: {
        title: state.courseContent.title,
        description: state.courseContent.description,
        status: "DRAFT" as const,
        marketRelevance: state.courseContent.marketRelevance,
        trendAlignment: state.courseContent.trendAlignment,
        keyTakeaways: state.courseContent.keyTakeaways,
        prerequisites: state.courseContent.prerequisites,
        estimatedHours: state.courseContent.estimatedHours,
        authorId: userId,

        // Create modules with enhanced metadata
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

        // Link to relevant market trends if available
        marketTrend: state.marketResearch.primaryTrendId
          ? {
              connect: {
                id: state.marketResearch.primaryTrendId,
              },
            }
          : undefined,

        // Link to user interests if available
        interests: state.marketResearch.relevantInterests?.length
          ? {
              connect: state.marketResearch.relevantInterests.map(
                (id: string) => ({ id })
              ),
            }
          : undefined,
      },
      include: {
        modules: true,
        interests: true,
        marketTrend: true,
      },
    });

    // Format and return the final response
    const response = {
      course,
      marketInsight,
      qualityMetrics: state.qualityAnalysis,
      marketResearch: state.marketResearch,
      generationMetadata: {
        steps: steps,
        refinements: state.retryCount,
        qualityScore: state.qualityAnalysis?.averageScore,
        marketAlignment: state.marketResearch?.alignmentScore,
        generationTime: new Date().toISOString(),
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Course generation failed:", error);
    return NextResponse.json(
      {
        error: "Failed to generate course",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Export additional utility types if needed
export type CourseGenerationResponse = z.infer<typeof CourseSchema> & {
  qualityMetrics: Record<string, number>;
  marketResearch: any;
  generationMetadata: {
    steps: number;
    refinements: number;
    qualityScore: number;
    marketAlignment: number;
    generationTime: string;
  };
};
