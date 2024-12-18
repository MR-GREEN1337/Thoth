import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

// Configuration and Initialization
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const tavilyTool = new TavilySearchResults({ maxResults: 3 });

// Schema Definitions
const InterestSchema = z.object({
  name: z.string(),
  category: z.enum(["Learning Path", "Technology", "Skill"]),
  marketDemand: z.enum(["High", "Medium", "Low"]),
  trendingTopics: z.array(z.string()),
  description: z.string(),
});

const MarketInsightsSchema = z.object({
  trends: z.array(z.string()),
  opportunities: z.array(z.string()),
});

const LearningPathDetailsSchema = z.object({
  fundamentals: z.array(z.string()),
  intermediate: z.array(z.string()),
  advanced: z.array(z.string()),
  estimatedTimeMonths: z.number(),
});

const AnalysisSchema = z.object({
  interests: z.array(InterestSchema),
  expertiseLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  suggestedWeeklyHours: z.number(),
  marketInsights: MarketInsightsSchema,
  learningPath: LearningPathDetailsSchema,
  sourceUrls: z.array(z.string()).optional(), // Add sourceUrls to the schema
});

const LearningPathResponseSchema = z
  .object({
    isConcise: z.boolean(),
    analysis: AnalysisSchema,
    sourceUrls: z.array(z.string()), // Add sourceUrls at the top level
  })
  .or(
    z.object({
      isConcise: z.literal(true),
      message: z.string(),
      sourceUrls: z.array(z.string()), // Add sourceUrls here too
    })
  );

const RequestSchema = z.object({
  userId: z.string(),
  preferences: z.string(),
  previousAnalysis: z.optional(z.any()),
  refinementNotes: z.optional(z.string()),
});

const withRetry = async <T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> => {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, delay * (attempt + 1))
        );
      }
    }
  }

  throw lastError;
};

// Agent State and Implementation
class LearningPathAgent {
  private static async getCompletion(prompt: string): Promise<string> {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.7,
      max_tokens: 8192,
    });
    return completion.choices[0]?.message?.content || "";
  }

  private static safeJsonParse(text: string) {
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}") + 1;
      if (start === -1 || end === 0) return null;
      const parsed = JSON.parse(text.slice(start, end));
      return parsed;
    } catch (error) {
      console.error("JSON parse error:", error);
      return null;
    }
  }

  static async search(state: typeof AgentState.State) {
    try {
      console.log("Starting search with preferences:", state.preferences);

      const refinementContext = state.refinementNotes
        ? `${state.preferences} ${state.refinementNotes}`
        : state.preferences;

      const searchQuery = `${refinementContext} career path learning roadmap requirements trends 2024`;
      const results = await withRetry(
        () => tavilyTool.invoke(searchQuery),
        3,
        1000
      );

      console.log("Search results received:", results);

      const formattedResults = Array.isArray(results) ? results : [results];

      // Enhanced URL extraction
      const sourceUrls = formattedResults
        .filter((result) => {
          if (!result) return false;
          const url = result.url || result.link || result.href;
          return typeof url === "string" && url.trim().length > 0;
        })
        .map((result) => result.url || result.link || result.href);

      console.log("Extracted URLs:", sourceUrls);

      return {
        messages: [
          new HumanMessage({ content: "Search completed successfully" }),
        ],
        searchResults: formattedResults,
        sourceUrls: sourceUrls,
        next: "ANALYZER",
      };
    } catch (error) {
      console.error("Search failed:", error);
      return {
        messages: [new HumanMessage({ content: `Search failed: ${error}` })],
        searchResults: [],
        sourceUrls: [],
        next: "FINISH",
      };
    }
  }

  // In the LearningPathAgent class, update the analyze method:

  static async analyze(state: typeof AgentState.State) {
    try {
      console.log("Starting analysis with:", {
        preferences: state.preferences,
        hasRefinement: !!state.refinementNotes,
        hasPreviousAnalysis: !!state.previousAnalysis
      });
  
      if (!state.searchResults.length) {
        return {
          messages: [new HumanMessage({ content: "No search results to analyze" })],
          analysis: {
            isConcise: true,
            message: "Unable to analyze without search results. Please try again.",
            sourceUrls: [],
          },
          next: "FINISH",
        };
      }
  
      const processedResults = state.searchResults
        .filter((result) => result && typeof result === "object")
        .map((result) => ({
          title: result.title || "",
          snippet: (result.snippet || "").slice(0, 300),
        }))
        .slice(0, 5);
  
      // Build base prompt
      let analysisPrompt = `Analyze this learning goal: "${state.preferences}"
  Based on market research: ${JSON.stringify(processedResults)}`;
  
      // Add refinement context if available
      if (state.previousAnalysis && state.refinementNotes) {
        analysisPrompt += `\n\nPrevious analysis: ${JSON.stringify(state.previousAnalysis, null, 2)}
  Refinement requests: ${state.refinementNotes}
  
  Please update the previous analysis based on these refinement requests while:
  1. Maintaining consistency with the original preferences
  2. Only modifying aspects mentioned in the refinement notes
  3. Keeping the same structure but updating relevant values
  4. Preserving any previous insights that aren't being refined`;
      }
  
      // Add response format instructions
      analysisPrompt += `\n\nProvide a detailed learning path analysis in JSON format that matches this structure exactly:
  {
    "isConcise": true,
    "analysis": {
      "interests": [{
        "name": string,
        "category": "Learning Path" | "Technology" | "Skill",
        "marketDemand": "High" | "Medium" | "Low",
        "trendingTopics": string[],
        "description": string
      }],
      "expertiseLevel": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
      "suggestedWeeklyHours": number,
      "marketInsights": {
        "trends": string[],
        "opportunities": string[]
      },
      "learningPath": {
        "fundamentals": string[],
        "intermediate": string[],
        "advanced": string[],
        "estimatedTimeMonths": number
      }
    }
  }`;
  
      const response = await this.getCompletion(analysisPrompt);
      console.log("Raw analysis response:", response);
  
      const parsedAnalysis = this.safeJsonParse(response);
      console.log("Parsed analysis:", parsedAnalysis);
  
      // Validate the analysis
      try {
        const validatedAnalysis = {
          isConcise: true,
          analysis: AnalysisSchema.parse(parsedAnalysis.analysis),
          sourceUrls: state.sourceUrls || [],
        };
  
        return {
          messages: [new HumanMessage({ content: "Analysis completed successfully" })],
          analysis: validatedAnalysis,
          next: "FINISH",
        };
      } catch (error) {
        console.error("Validation error:", error);
        throw error; // Let the outer try-catch handle this
      }
    } catch (error) {
      console.error("Analysis error:", error);
      return {
        messages: [new HumanMessage({ content: "Analysis failed" })],
        analysis: {
          isConcise: true,
          message: "An error occurred during analysis. Please try again.",
          sourceUrls: state.sourceUrls || [],
        },
        next: "FINISH",
      };
    }
  }

  static async supervise(state: typeof AgentState.State) {
    console.log("Supervising state:", {
      hasSearchResults: state.searchResults.length > 0,
      hasAnalysis: state.analysis !== null,
      hasRefinement: !!state.refinementNotes,
      currentMessages: state.messages,
      sourceUrls: state.sourceUrls, // Log sourceUrls in supervision
    });

    if (state.next && ["SEARCH", "ANALYZER", "FINISH"].includes(state.next)) {
      return { next: state.next };
    }

    if (!state.searchResults.length) {
      return { next: "SEARCH" };
    }
    if (!state.analysis) {
      return { next: "ANALYZER" };
    }
    return { next: "FINISH" };
  }
}

// Extended state type with explicit sourceUrls handling
const AgentState = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
    default: () => [],
  }),
  next: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "supervisor",
  }),
  preferences: Annotation<string>({
    reducer: (x, y) => y ?? x,
    default: () => "",
  }),
  refinementNotes: Annotation<string | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  previousAnalysis: Annotation<any | undefined>({
    reducer: (x, y) => y ?? x,
    default: () => undefined,
  }),
  searchResults: Annotation<any[]>({
    reducer: (x, y) => [...x, ...y],
    default: () => [],
  }),
  sourceUrls: Annotation<string[]>({
    reducer: (x, y) => [...new Set([...x, ...y])],
    default: () => [],
  }),
  analysis: Annotation<z.infer<typeof LearningPathResponseSchema> | null>({
    reducer: (x, y) => y ?? x,
    default: () => null,
  }),
});

// Main API handler
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { userId, preferences, previousAnalysis, refinementNotes } =
      RequestSchema.parse(body);

    if (!userId) {
      return NextResponse.json(
        {
          error: "Unauthorized",
          sourceUrls: [],
        },
        { status: 401 }
      );
    }

    if (
      !preferences ||
      typeof preferences !== "string" ||
      preferences.trim().length === 0
    ) {
      return NextResponse.json({
        isConcise: true,
        message: "Please describe your learning goals or career interests.",
        sourceUrls: [],
      });
    }

    let state: typeof AgentState.State = {
      messages: [new HumanMessage(preferences)],
      preferences,
      refinementNotes,
      previousAnalysis,
      searchResults: [],
      sourceUrls: [],
      analysis: null,
      next: "SEARCH",
    };

    let maxSteps = 3;
    let steps = 0;

    while (state.next !== "FINISH" && steps < maxSteps) {
      try {
        console.log(`Step ${steps + 1}: Executing ${state.next}`);

        switch (state.next) {
          case "SEARCH":
            const searchResult = await LearningPathAgent.search(state);
            state = { ...state, ...searchResult };
            break;
          case "ANALYZER":
            const analysisResult = await LearningPathAgent.analyze(state);
            //@ts-ignore
            state = { ...state, ...analysisResult };
            break;
        }
        const nextState = await LearningPathAgent.supervise(state);
        state = { ...state, ...nextState };
        steps++;
      } catch (error) {
        console.error(`Error at step ${steps}:`, error);
        return NextResponse.json({
          isConcise: true,
          message:
            "An error occurred in the analysis process. Please try again.",
          sourceUrls: [],
        });
      }
    }

    if (!state.analysis || !state.analysis.isConcise) {
      return NextResponse.json({
        isConcise: true,
        message: "Could not generate learning path. Please be more specific.",
        sourceUrls: state.sourceUrls || [],
      });
    }

    // Ensure sourceUrls are included in the final response
    const finalResponse = {
      ...state.analysis,
      sourceUrls: state.sourceUrls || [],
    };

    console.log("Final state:", finalResponse);
    return NextResponse.json(finalResponse);
  } catch (error) {
    console.error("Error in preference analysis:", error);
    return NextResponse.json(
      {
        isConcise: true,
        message:
          "An error occurred. Please try again with different learning goals.",
        sourceUrls: [],
      },
      { status: 500 }
    );
  }
}