import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { FALLBACK_REPOS, SupportedLanguage } from "@/lib/fallbackRepos";
import {
  CodeContentGenerator,
  LanguageDetector,
} from "@/helpers/LanguageDetector";
import { Prisma } from "@prisma/client";

// Initialize API clients
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const tavilyTool = new TavilySearchResults({ maxResults: 5 });
const wikipediaTool = new WikipediaQueryRun();

// Enhanced Schema Definitions with strict types
const ModuleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  content: z.string().min(1, "Content is required"),
  duration: z.number().positive("Duration must be positive"),
  order: z.number().nonnegative("Order must be non-negative"),
  aiGenerated: z.boolean(),
  aiPrompt: z.string().optional(),
  searchResults: z.array(z.any()).optional(),
  qualityScore: z.number().optional(),
  revisionHistory: z.array(z.string()).optional(),
  contentType: z.enum(["MARKDOWN", "LATEX", "CODE", "MIXED"]).optional(),
  codeExamples: z
    .array(
      z.object({
        language: z.string(),
        code: z.string(),
        explanation: z.string(),
      })
    )
    .optional(),
  latexContent: z
    .array(
      z.object({
        equation: z.string(),
        explanation: z.string(),
        context: z.string(),
      })
    )
    .optional(),
  interactiveElements: z
    .array(
      z.object({
        type: z.string(),
        content: z.string(),
        solution: z.string().optional(),
      })
    )
    .optional(),
});

const CourseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]),
  marketRelevance: z.number().min(0).max(1),
  trendAlignment: z.number().min(0).max(1),
  keyTakeaways: z.array(z.string()),
  prerequisites: z.array(z.string()),
  estimatedHours: z.number().positive(),
  modules: z.array(ModuleSchema),
  searchResults: z.array(z.any()).optional(),
  marketResearch: z.any().optional(),
  qualityMetrics: z.record(z.number()).optional(),
});

interface GitHubRepo {
  url: string;
  name: string;
  description: string;
  language: string;
  stars: number;
}

class SearchResultsHandler {
  static normalizeSearchResults(results: any): any[] {
    try {
      // If already null/undefined, return empty array
      if (!results) {
        return [];
      }

      // If already an array of objects with required fields, validate and clean
      if (Array.isArray(results)) {
        return results
          .map((result) => ({
            url: String(result.url || ""),
            title: String(result.title || ""),
            content: String(result.content || ""),
            score: Number(result.score || 0),
          }))
          .filter((result) => result.url && result.title);
      }

      // If string, try to parse it
      if (typeof results === "string") {
        try {
          const parsed = JSON.parse(this.cleanJsonResponse(results));
          return this.normalizeSearchResults(parsed);
        } catch {
          console.warn("Failed to parse search results string");
          return [];
        }
      }

      // If single object, wrap in array
      if (typeof results === "object" && !Array.isArray(results)) {
        return this.normalizeSearchResults([results]);
      }

      return [];
    } catch (error) {
      console.error("Search results normalization failed:", error);
      return [];
    }
  }

  static cleanJsonResponse(text: string): string {
    if (!text || typeof text !== "string") {
      return "[]";
    }

    try {
      // First handle code block format
      if (text.includes("```")) {
        const matches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches && matches[1]) {
          text = matches[1].trim();
        }
      }

      // Check if we already have valid JSON
      try {
        JSON.parse(text);
        return text;
      } catch {
        // Continue with cleaning if direct parse fails
      }

      // Clean the text while preserving structure
      let cleaned = text
        .replace(/^```(?:json)?\s*|\s*```$/g, "")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'")
        .replace(/\r?\n/g, " ")
        .replace(/,\s*([\]}])/g, "$1")
        .trim();

      // Make sure it starts and ends properly
      if (!cleaned.startsWith("{") && !cleaned.startsWith("[")) {
        const firstBrace = cleaned.indexOf("{");
        const firstBracket = cleaned.indexOf("[");
        if (firstBrace >= 0 || firstBracket >= 0) {
          const startIndex = Math.min(
            firstBrace >= 0 ? firstBrace : Infinity,
            firstBracket >= 0 ? firstBracket : Infinity
          );
          cleaned = cleaned.substring(startIndex);
        }
      }

      // Test parse before returning
      JSON.parse(cleaned);
      return cleaned;
    } catch (error) {
      // If cleaning fails, return valid empty JSON structure based on context
      console.warn("JSON cleaning failed:", error);
      return text.includes("[") ? "[]" : "{}";
    }
  }

  static safeParseJson<T>(text: string, context: string = ""): T | null {
    try {
      // Handle code block format explicitly
      if (text.includes("```")) {
        const matches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches && matches[1]) {
          text = matches[1].trim();
        }
      }

      const cleaned = this.cleanJsonResponse(text);

      // Additional validation for empty or invalid JSON
      if (cleaned === "{}" || cleaned === "[]" || !cleaned) {
        console.warn(`Empty or invalid JSON for ${context}`);
        return null;
      }

      return JSON.parse(cleaned) as T;
    } catch (error) {
      console.warn(`JSON parsing failed for ${context}:`, error);
      return null;
    }
  }

  static extractJSON(text: string): any {
    try {
      // Handle code block format first
      if (text.includes("```")) {
        const matches = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches && matches[1]) {
          text = matches[1].trim();
        }
      }

      // Try direct parse first
      try {
        return JSON.parse(text);
      } catch {
        // Continue with cleaning if direct parse fails
      }

      // Find JSON structure
      const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
      if (!jsonMatch) {
        throw new Error("No JSON structure found");
      }

      const cleaned = this.cleanJsonResponse(jsonMatch[1]);
      return JSON.parse(cleaned);
    } catch (error) {
      console.error("JSON extraction failed:", error);
      // Return appropriate empty structure
      return text.includes("[") ? [] : {};
    }
  }

  static validateStructure(json: any, requiredFields: string[]): boolean {
    if (!json || typeof json !== "object") {
      return false;
    }

    return requiredFields.every((field) => {
      const value = json[field];
      return value !== undefined && value !== null;
    });
  }
}

// Content type detection and processing functions
class ContentTypeDetector {
  static async detectSubjectType(topic: string): Promise<{
    requiresLatex: boolean;
    requiresCode: boolean;
    primaryContentType: "MARKDOWN" | "LATEX" | "CODE" | "MIXED";
    suggestedTools: string[];
  }> {
    const prompt = `Analyze this educational topic and determine content requirements:
Topic: ${topic}
  
Return JSON with these fields:
{
  "requiresLatex": boolean,
  "requiresCode": boolean,
  "primaryContentType": "MARKDOWN" | "LATEX" | "CODE" | "MIXED",
  "suggestedTools": [string],
  "subjectArea": string,
  "complexityLevel": number (1-5),
  "visualizationNeeds": [string]
}

REQUIRE ONLY LATEX OR CODE, NEVER BOTH
RETURN ONLY THE JSON, NOTHING ELSE!!! NO EXPLANATORY TEXT, JUST A PLAIN JSON!!!!`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama3-groq-70b-8192-tool-use-preview",
      temperature: 0.3,
    });

    const result = SearchResultsHandler.safeParseJson(
      completion.choices[0]?.message?.content || "{}",
      "detectSubjectType"
    );

    // Validate required fields and provide defaults if missing
    if (
      !result ||
      !SearchResultsHandler.validateStructure(result, [
        "requiresLatex",
        "requiresCode",
        "primaryContentType",
        "suggestedTools",
      ])
    ) {
      return {
        requiresLatex: false,
        requiresCode: false,
        primaryContentType: "MARKDOWN",
        suggestedTools: [],
      };
    }

    return {
      requiresLatex: (result as any).requiresLatex,
      requiresCode: (result as any).requiresCode,
      primaryContentType: (result as any).primaryContentType,
      suggestedTools: (result as any).suggestedTools,
    };
  }

  static async generateLatexContent(topic: string, context: any): Promise<any> {
    const wikipediaResult = (
      await wikipediaTool.invoke(`${topic} mathematical formulation equations`)
    ).substring(0, 1000);

    const academicSearch = (
      await withRetry(
        () => tavilyTool.invoke(`${topic} mathematical equations formulas academic`),
        3,
        1000
      )
    ).substring(0, 1000);

    const prompt = `Generate LaTeX content for this mathematical/scientific topic:
Topic: ${topic}
Wikipedia Context: ${wikipediaResult}
Academic Sources: ${JSON.stringify(academicSearch)}

Requirements:
1. Generate precise LaTeX equations
2. Include step-by-step derivations
3. Provide clear explanations
4. Add practical examples
5. Include visualization suggestions

Return JSON with:
{
  "equations": [
    {
      "latex": "LaTeX equation",
      "explanation": "Clear explanation",
      "context": "When/how to use",
      "visualizationHint": "How to visualize"
    }
  ],
  "conceptualBreakdown": [
    {
      "concept": "Key concept",
      "explanation": "Simple explanation",
      "relatedEquations": ["equation indices"]
    }
  ]
}

RETURN ONLY THE JSON, NOTHING ELSE, NO TEXT OR ANYTHING, JUST A JSON!!!!`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.2,
    });

    const result = SearchResultsHandler.safeParseJson(
      completion.choices[0]?.message?.content || "{}",
      "generateLatexContent"
    );

    console.log("Generating LaTeX content\n", result);

    // Validate LaTeX content structure and provide defaults if missing
    if (
      !result ||
      !SearchResultsHandler.validateStructure(result, [
        "equations",
        "conceptualBreakdown",
      ])
    ) {
      return {
        equations: [],
        conceptualBreakdown: [],
      };
    }

    return result;
  }
}

class IntelligentCourseAgent {
  private static async getCompletion(
    prompt: string,
    temperature: number = 0.7
  ): Promise<string> {
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content:
            "You must return ONLY valid JSON without any additional text, code blocks, or markdown. The response should be parseable by JSON.parse().",
        },
        {
          role: "user",
          content: `${prompt}\n\nIMPORTANT: Return ONLY valid JSON without any explanation or code blocks.`,
        },
      ],
      model: "llama-3.2-90b-vision-preview",
      temperature,
      max_tokens: 8192,
    });

    let content = completion.choices[0]?.message?.content || "";
    content = content.replace(/```(?:json)?\s*|\s*```/g, "").trim();

    try {
      JSON.parse(content);
      return content;
    } catch {
      // Return minimal valid JSON if parsing fails
      return "{}";
    }
  }
static async searchContent(query: string): Promise<any[]> {
  try {
    const results = await withRetry(
      () => tavilyTool.invoke(query),
      3,
      1000
    );
    return SearchResultsHandler.normalizeSearchResults(results);
  } catch (error) {
    console.error("Search failed:", error);
    return [];
  }
}
  static async createStructure(state: typeof AgentState.State) {
    try {
      const userContext = await this.getUserContext(state.userId);

      const structurePrompt = `Create an innovative course structure for:
Course Idea: ${state.courseIdea}
Market Research: ${JSON.stringify(state.marketResearch)}
User Context: ${JSON.stringify(userContext)}
Analysis: ${state.analysis}

Return a JSON object with EXACTLY this structure:
{
  "title": "Clear, specific course title based on the course idea",
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
1. Title and description should directly relate to the course idea
2. ALL fields must be included exactly as shown
3. Numbers must be actual numbers, not strings
4. Arrays must have at least one item
5. Status must be exactly "DRAFT"
6. marketRelevance and trendAlignment must be between 0 and 1
7. estimatedHours must be a positive number
8. Each module must have all required fields
9. Module progression should follow a logical learning path

Generate ONLY the JSON object with no additional text or explanations.`;

      let response = await this.getCompletion(structurePrompt, 0.3);
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
        const jsonMatch =
          response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) ||
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
        modules:
          structure.modules?.map((m: any, i: number) => ({
            title: m.title || `Module ${i + 1}`,
            content: m.content || "Content pending",
            duration: m.duration || 60,
            order: m.order || i + 1,
            aiGenerated: true,
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
        const jsonMatch =
          cleaned.match(/```(?:json)?\s*({[\s\S]*?})\s*```/) ||
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
      const userAnalysis = await this.analyzeUserHistory(state.userId);

      // Enhanced market query using course idea and user context
      const marketQuery = `
        ${state.courseIdea} 
        ${state.analysis} 
        expertise:${userAnalysis.preferences.expertiseLevel} 
        ${userAnalysis.gaps.suggestedTopics.join(" ")} 
        industry trends 2024
      `;

      const searchResults = await this.searchContent(marketQuery);
      const wikiContext = await wikipediaTool
        .invoke(state.courseIdea)
        .catch(() => null);

      // Check for content overlap
      const existingContent = new Set(userAnalysis.expertise.knownConcepts);
      const filteredResults = searchResults.filter(
        (result) =>
          !Array.from(existingContent).some((concept) =>
            result.content
              .toLowerCase()
              .includes((concept as any).toLowerCase())
          )
      );

      const researchPrompt = `
Analyze market research for course creation:
Course Idea: ${state.courseIdea}
Wikipedia Context: ${wikiContext}
Search Results: ${JSON.stringify(filteredResults)}

User Context:
${JSON.stringify(userAnalysis)}

Current focus: ${state.analysis}

Return a JSON strategy that:
1. Evaluates the specific course idea viability
2. Avoids duplicating user's known concepts: ${Array.from(existingContent).join(
        ", "
      )}
3. Fills knowledge gaps: ${userAnalysis.gaps.missingConcepts.join(", ")}
4. Aligns with interest areas: ${userAnalysis.preferences.interests
        .map((i: any) => i.name)
        .join(", ")}
5. Matches expertise level: ${userAnalysis.preferences.expertiseLevel}

Include:
{
  "marketTrends": [string],
  "competitorAnalysis": [string],
  "demandIndicators": { trend: string, score: number },
  "recommendedApproach": string,
  "uniqueSellingPoints": [string],
  "targetAudience": string,
  "estimatedMarketSize": string,
  "differentiators": [string],
  "prerequisiteAlignment": number,
  "gapCoverage": number,
  "ideaViability": {
    "score": number,
    "reasoning": string,
    "suggestions": [string]
  }
}

PLEASE RETURN ONLY A JSON, NOTHING ELSE, NO EXPLANATORY TEXT, JUST THE PLAIN JSON, MY LIFE DEPENDS ON THIS!!!
`;

      const response = await this.getCompletion(researchPrompt);
      const marketResearch = this.extractJSON(response);

      return {
        messages: [
          new HumanMessage(
            "Market research completed with course idea analysis"
          ),
        ],
        marketResearch: {
          ...marketResearch,
          userContext: userAnalysis,
          courseIdea: state.courseIdea,
        },
        searchResults: filteredResults,
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

// Replace the generateContent method in IntelligentCourseAgent class

static async generateContent(state: typeof AgentState.State) {
  try {
    const { courseStructure } = state;

    const metrics = {
      startTime: Date.now(),
      successfulModules: 0,
      failedModules: 0,
      totalTokensUsed: 0,
      codeGenerationStats: {
        totalPatterns: 0,
        totalExamples: 0,
        averageQuality: 0,
      },
      errors: [] as string[],
      duration: 0,
    };

    const enrichedModules = await Promise.all(
      courseStructure.modules.map(async (module: any, index: number) => {
        console.log(`Generating content for module ${index + 1}: ${module.title}`);

        try {
          // 1. Detect content type
          const contentType = await ContentTypeDetector.detectSubjectType(
            module.title
          ).catch((error) => {
            console.warn(
              `Content type detection failed for module ${index}, using defaults:`,
              error
            );
            return {
              requiresLatex: false,
              requiresCode: false,
              primaryContentType: "MARKDOWN",
              suggestedTools: [],
            };
          });

          // 2. Gather reference content
          const [searchResults, wikiContent] = await Promise.all([
            this.searchContent(
              `${module.title} course content tutorial examples projects`
            ),
            wikipediaTool.invoke(module.title).catch(() => null),
          ]);

          let specializedContent = null;
          let contentPrompt = "";
          let codeExamples = null;
          let latexContent = [];
          let integratedContentPrompt = "";

          // 3. Generate specialized content if needed
          if (contentType.requiresCode) {
            try {
              const languageAnalysis = await LanguageDetector.detectLanguage(
                module.title
              );

              const codeContent = await CodeContentGenerator.generateEducationalCode(
                module.title,
                languageAnalysis.language as SupportedLanguage,
                {
                  difficulty:
                    (state.analysis as any)?.expertiseLevel === "BEGINNER"
                      ? "BEGINNER"
                      : (state.analysis as any)?.expertiseLevel === "ADVANCED"
                      ? "ADVANCED"
                      : "INTERMEDIATE",
                  includeTests: true,
                }
              );

              specializedContent = codeContent;
              codeExamples = codeContent;

              // Create integrated prompt that uses the code content
              integratedContentPrompt = `Create a comprehensive programming tutorial that explains and builds upon this code:

Code Content:
${JSON.stringify(codeContent, null, 2)}

Context from search results:
${searchResults.map(r => r.content).join('\n').substring(0, 500)}

Requirements:
1. Start with a clear introduction to the topic and learning objectives
2. Explain the purpose and context of the code
3. Break down the code into logical sections and explain each part:
   - Purpose of each major component
   - How the components work together
   - Key programming concepts demonstrated
4. Include the code examples in appropriate places using markdown code blocks
5. Explain the test cases and their importance
6. Add practical examples of how to use and modify the code
7. Include best practices and common pitfalls
8. End with practical exercises that build on the concepts

Format Guidelines:
- Use clear markdown formatting
- Use code blocks with appropriate language tags
- Include section headings
- Add inline code references where appropriate
- Include callouts for important concepts

Return ONLY the formatted markdown content.`;

            } catch (error) {
              console.error(
                `Code content generation failed for module ${index}:`,
                error
              );
              metrics.errors.push(
                `Module ${index} code generation: ${error}`
              );
            }
          } else if (contentType.requiresLatex) {
            const latexResult = await ContentTypeDetector.generateLatexContent(
              module.title,
              {
                searchResults,
                wikiContent,
              }
            ).catch((error) => {
              console.warn(
                `LaTeX generation failed for module ${index}:`,
                error
              );
              return null;
            });

            if (latexResult) {
              specializedContent = latexResult;
              latexContent = latexResult.equations || [];

              // Create integrated prompt that uses the LaTeX content
              integratedContentPrompt = `Create a comprehensive mathematical explanation that incorporates these equations and concepts:

Mathematical Content:
${JSON.stringify(latexResult.equations, null, 2)}

Conceptual Breakdown:
${JSON.stringify(latexResult.conceptualBreakdown, null, 2)}

Context from sources:
${wikiContent ? wikiContent.substring(0, 500) : ''}
${searchResults.map(r => r.content).join('\n').substring(0, 500)}

Requirements:
1. Start with an intuitive overview of the mathematical concepts
2. For each equation:
   - Explain its components and meaning
   - Provide context for when and why it's used
   - Include the LaTeX in a proper math block
   - Add a practical example or application
3. Connect the equations to show how they relate to each other
4. Include step-by-step derivations where helpful
5. Provide worked examples using the equations
6. End with practice problems and their solutions

Format Guidelines:
- Use clear markdown formatting
- Use proper LaTeX math blocks
- Include section headings
- Add visual descriptions where helpful
- Include callouts for important concepts

Return ONLY the formatted markdown content.`;
            }
          } else {
            integratedContentPrompt = `Create comprehensive module content for:
Title: "${module.title}"
Duration: ${module.duration} minutes
Content Type: ${contentType.primaryContentType}
Primary Audience Level: ${(state.analysis as any)?.expertiseLevel || "BEGINNER"}

Context from sources:
${wikiContent ? wikiContent.substring(0, 500) : ''}
${searchResults.map(r => r.content).join('\n').substring(0, 500)}

Include:
1. Clear learning objectives
2. Detailed explanations
3. Real-world examples
4. Best practices
5. Common pitfalls
6. Practice exercises

Format in clear MARKDOWN.`;
          }

          // 4. Generate main content using the integrated prompt
          const completion = await groq.chat.completions.create({
            messages: [
              {
                role: "system",
                content:
                  "You are a course content generator. Create clear, engaging educational content formatted in Markdown.",
              },
              {
                role: "user",
                content: integratedContentPrompt,
              },
            ],
            model: "llama-3.2-90b-vision-preview",
            temperature: 0.3,
            max_tokens: 8192,
          });

          const content = completion.choices[0]?.message?.content || "";
          metrics.totalTokensUsed += completion.usage?.total_tokens || 0;

          // 5. Generate interactive elements
          const interactiveElements = await this.generateInteractiveElements(
            module.title,
            content,
            contentType
          ).catch((error) => {
            console.warn(
              `Interactive elements generation failed for module ${index}:`,
              error
            );
            return [];
          });

          // 6. Assemble final module content
          metrics.successfulModules++;

          return {
            ...module,
            content,
            searchResults,
            aiGenerated: true,
            aiPrompt: integratedContentPrompt,
            qualityScore: 0,
            revisionHistory: [],
            contentType: contentType.primaryContentType,
            specializedContent,
            codeExamples: contentType.requiresCode ? codeExamples : undefined,
            latexContent: contentType.requiresLatex ? latexContent : undefined,
            interactiveElements,
            metadata: {
              generatedAt: new Date().toISOString(),
              contentLength: content.length,
              hasSpecializedContent: !!specializedContent,
              programmingLanguage: contentType.requiresCode ? 
                specializedContent?.metadata?.language : undefined,
              interactiveElementsCount: interactiveElements.length
            }
          };
        } catch (moduleError) {
          console.error(
            `Error generating content for module ${index}:`,
            moduleError
          );
          metrics.failedModules++;
          metrics.errors.push(
            `Module ${index} (${module.title}): ${
              (moduleError as any).message
            }`
          );

          return {
            ...module,
            content:
              "Content generation failed. Please retry generation for this module.",
            aiGenerated: true,
            qualityScore: 0,
            contentType: "MARKDOWN",
            interactiveElements: [],
            generationError: (moduleError as any).message,
            metadata: {
              generatedAt: new Date().toISOString(),
              error: true,
              errorType: (moduleError as any).name,
              errorMessage: (moduleError as any).message,
            },
          };
        }
      })
    );

    metrics.duration = Date.now() - metrics.startTime;

    const enrichedCourse = {
      ...courseStructure,
      modules: enrichedModules,
      generationMetrics: {
        ...metrics,
        successRate: metrics.successfulModules / courseStructure.modules.length,
        averageTokensPerModule:
          metrics.totalTokensUsed / courseStructure.modules.length,
        totalInteractiveElements: enrichedModules.reduce(
          (sum, module) => sum + (module.interactiveElements?.length || 0),
          0
        ),
        timestamp: new Date().toISOString(),
      },
    };

    const successThreshold = 0.7;
    const next =
      enrichedCourse.generationMetrics.successRate >= successThreshold
        ? "QUALITY_CHECK"
        : "ERROR";

    return {
      messages: [
        new HumanMessage(
          next === "QUALITY_CHECK"
            ? `Course content generated successfully (${Math.round(
                enrichedCourse.generationMetrics.successRate * 100
              )}% success rate)`
            : `Course generation partially failed (${Math.round(
                enrichedCourse.generationMetrics.successRate * 100
              )}% success rate)`
        ),
      ],
      courseContent: enrichedCourse,
      next,
    };
  } catch (error) {
    console.error("Content generation failed:", error);
    return {
      messages: [
        new HumanMessage(`Content generation failed: ${(error as any).message}`),
      ],
      next: "ERROR",
      courseContent: null,
    };
  }
}

  private static async analyzeUserHistory(userId: string): Promise<{
    preferences: any;
    expertise: any;
    gaps: any;
  }> {
    const userContext = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        courses: {
          include: {
            modules: true,
            interests: true,
            marketTrend: true,
          },
        },
        interests: {
          include: {
            marketTrends: true,
          },
        },
        enrollments: {
          include: {
            course: true,
          },
        },
        marketInsights: true,
      },
    });

    // Analyze completed courses
    const completedCourses =
      userContext?.enrollments?.filter((e) => e.status === "COMPLETED") || [];

    // Extract key topics and concepts
    const knownConcepts = new Set(
      completedCourses.flatMap((e) =>
        e.course.keyTakeaways.concat(e.course.prerequisites)
      )
    );

    // Analyze authored courses for expertise areas
    const authoredTopics = new Set(
      userContext?.courses?.flatMap((c) =>
        c.keyTakeaways.concat(c.prerequisites)
      ) || []
    );

    // Find gaps in knowledge
    const relatedTopics = new Set(
      userContext?.interests?.flatMap((i) =>
        i.trendingTopics.concat(i.marketTrends.map((t) => t.name))
      ) || []
    );

    const knowledgeGaps = Array.from(relatedTopics).filter(
      (topic) => !knownConcepts.has(topic)
    );

    return {
      preferences: {
        expertiseLevel: userContext?.expertiseLevel,
        weeklyHours: userContext?.weeklyHours,
        interests: userContext?.interests,
        preferenceAnalysis: userContext?.preferenceAnalysis,
      },
      expertise: {
        completedCourses: completedCourses.length,
        authoredCourses: userContext?.courses?.length || 0,
        knownConcepts: Array.from(knownConcepts),
        expertiseAreas: Array.from(authoredTopics),
      },
      gaps: {
        missingConcepts: knowledgeGaps,
        suggestedTopics:
          userContext?.interests
            ?.filter((i) => i.marketDemand === "HIGH")
            .map((i) => i.name) || [],
      },
    };
  }

  // Improve interactive elements generation
  static async generateInteractiveElements(
    title: string,
    content: string,
    contentType: any
  ): Promise<any[]> {
    const prompt = `Create interactive elements for: ${title} \n $${content}$ \n Content type: ${contentType} \n
Format as valid JSON array:
{
  "elements": [
    {
      "type": "quiz|exercise|discussion",
      "title": "string",
      "content": "string",
      "solution": "string"
    }
  ]
}

GENERATE AND JSON AND ONLY JSON, NO EXPLANATORY TEXT!!! SO I CAN JSON.PARSE() IT
`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          {
            role: "system",
            content: "Return only valid JSON array of interactive elements.",
          },
          { role: "user", content: prompt },
        ],
        model: "llama-3.2-11b-vision-preview",
        temperature: 0.3,
      });

      const result = SearchResultsHandler.safeParseJson(
        completion.choices[0]?.message?.content || "{}",
        "Interactive elements"
      );

      return (result as any)?.elements || [];
    } catch (error) {
      console.error("Failed to generate interactive elements:", error);
      return [];
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
}
  
Return ONLY a JSON object, NO TEXT, MY LIFE DEPENDS ON THIS
`;

          const response = await this.getCompletion(modulePrompt);
          const moduleAnalysis = this.extractJSON(response);

          return {
            moduleId: index,
            ...moduleAnalysis,
            averageScore:
              Object.values(
                moduleAnalysis.scores as Record<string, number>
              ).reduce((a, b) => a + b, 0) / 5,
          };
        })
      );

      // Overall course quality assessment
      const courseOverviewPrompt = `Evaluate overall course quality:
Title: ${courseContent.title}
Description: ${courseContent.description}
Total Modules: ${courseContent.modules.length}
Estimated Hours: ${courseContent.estimatedHours}

Individual module scores: ${JSON.stringify(
        moduleQualityChecks.map((m) => ({
          moduleId: m.moduleId,
          averageScore: m.averageScore,
        }))
      )}

Return ONLY a JSON quality analysis:
{
  "overallScore": number,
  "strengths": [string],
  "weaknesses": [string],
  "recommendedImprovements": [string],
  "marketFit": number
}

Return ONLY a JSON object, NO TEXT, MY LIFE DEPENDS ON THIS
  
  `;

      const overallResponse = await this.getCompletion(courseOverviewPrompt);
      const overallAnalysis = this.extractJSON(overallResponse);

      // Combine module and overall analysis
      const qualityAnalysis = {
        modules: moduleQualityChecks,
        overall: overallAnalysis,
        averageScore:
          moduleQualityChecks.reduce((sum, m) => sum + m.averageScore, 0) /
          moduleQualityChecks.length,
        needsRefinement:
          moduleQualityChecks.some((m) => m.averageScore < 0.6) ||
          overallAnalysis.overallScore < 0.6,
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
        .filter((m: { averageScore: number }) => m.averageScore < 0.6)
        .map((m: { moduleId: any }) => m.moduleId);

      const refinedModules = await Promise.all(
        courseContent.modules.map(async (module: any, index: number) => {
          if (!modulesToRefine.includes(index)) {
            return module; // Skip modules that don't need refinement
          }

          const moduleAnalysis = qualityAnalysis.modules.find(
            (m: { moduleId: number }) => m.moduleId === index
          );

          const refinementPrompt = `Improve this module content based on quality analysis:
Title: ${module.title}
Current Quality Score: ${moduleAnalysis?.averageScore}

Main issues to address:
${moduleAnalysis?.suggestions.join("\n")}

Critical issues:
${moduleAnalysis?.criticalIssues.join("\n")}

Focus areas:
1. ${
            moduleAnalysis?.scores.contentDepth < 0.7
              ? "Enhance content depth and detail"
              : "Maintain content depth"
          }
2. ${
            moduleAnalysis?.scores.practicalValue < 0.7
              ? "Add more practical examples"
              : "Maintain practical value"
          }
3. ${
            moduleAnalysis?.scores.clarity < 0.7
              ? "Improve clarity and explanation"
              : "Maintain clarity"
          }
4. ${
            moduleAnalysis?.scores.engagement < 0.7
              ? "Increase engagement and interactivity"
              : "Maintain engagement"
          }
5. ${
            moduleAnalysis?.scores.marketAlignment < 0.7
              ? "Better align with market needs"
              : "Maintain market alignment"
          }

Original content summary: ${module.content.substring(0, 1000)}...

Return improved MARKDOWN content that addresses these issues.`;

          const improvedContent = await this.getCompletion(refinementPrompt);

          return {
            ...module,
            content: improvedContent,
            revisionHistory: [
              ...(module.revisionHistory || []),
              module.content,
            ],
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
      const supervisorPrompt = `Analyze current course generation state and determine next action.

Current State:
${JSON.stringify(
  {
    courseIdea: state.courseIdea,
    hasMarketResearch: !!state.marketResearch,
    hasStructure: !!state.courseStructure,
    hasContent: !!state.courseContent,
    hasQualityAnalysis: !!state.qualityAnalysis,
    currentStep: state.next,
    qualityScore: state.qualityAnalysis?.averageScore,
    retryCount: state.retryCount || 0,
    previousMessages: state.messages.slice(-3),
  },
  null,
  2
)}

Available Actions:
- MARKET_RESEARCH: Initial market analysis
- STRUCTURE: Create course structure
- CONTENT: Generate module content
- QUALITY_CHECK: Evaluate content quality
- REFINE_CONTENT: Improve content quality
- FINISH: Complete generation
- ERROR: Handle failures

Requirements:
1. Validate course idea exists before proceeding
2. MARKET_RESEARCH must complete successfully before STRUCTURE
3. STRUCTURE requires valid market research
4. CONTENT requires valid structure
5. QUALITY_CHECK requires content
6. REFINE_CONTENT triggers if quality score < 0.6
7. FINISH requires all steps complete with good quality

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
  courseIdea: Annotation<string>({
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

// Type the request schema
const RequestSchema = z.object({
  analysis: z.any(),
  courseIdea: z.string().optional(),
});

// Utility function for safe async operations
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
class CourseGenerationError extends Error {
  constructor(
    message: string,
    public status: number = 500,
    public code: string = "UNKNOWN_ERROR",
    public details?: unknown
  ) {
    super(message);
    this.name = "CourseGenerationError";
  }
}
export async function POST(req: Request) {
  try {
    // Validate request
    const body = await req.json().catch(() => {
      throw new CourseGenerationError(
        "Invalid JSON in request body",
        400,
        "INVALID_JSON"
      );
    });

    // Get user token
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;

    if (!userId) {
      throw new CourseGenerationError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Validate request data
    const validationResult = RequestSchema.safeParse(body);
    if (!validationResult.success) {
      throw new CourseGenerationError(
        "Invalid request data",
        400,
        "VALIDATION_ERROR",
        validationResult.error.errors
      );
    }

    const { analysis, courseIdea } = validationResult.data;

    // Initialize state
    let state: typeof AgentState.State = {
      messages: [],
      userId,
      analysis,
      courseIdea: courseIdea || "",
      marketResearch: null,
      courseStructure: null,
      courseContent: null,
      qualityAnalysis: null,
      next: "MARKET_RESEARCH",
      retryCount: 0,
    };

    // Main course generation loop with error handling
    const maxSteps = 10;
    let steps = 0;

    while (
      state.next !== "FINISH" &&
      state.next !== "ERROR" &&
      steps < maxSteps
    ) {
      console.log(`Step ${steps + 1}: ${state.next}`);

      try {
        state = await withRetry(async () => {
          switch (state.next) {
            case "MARKET_RESEARCH":
              return {
                ...state,
                ...(await IntelligentCourseAgent.marketResearch(state)),
              };
            case "STRUCTURE":
              return {
                ...state,
                ...(await IntelligentCourseAgent.createStructure(state)),
              };
            case "CONTENT":
              return {
                ...state,
                ...(await IntelligentCourseAgent.generateContent(state)),
              };
            case "QUALITY_CHECK":
              return {
                ...state,
                ...(await IntelligentCourseAgent.qualityCheck(state)),
              };
            case "REFINE_CONTENT":
              return {
                ...state,
                ...(await IntelligentCourseAgent.refineContent(state)),
              };
            default:
              return state;
          }
        });

        if (state.next !== "FINISH") {
          const nextState = await IntelligentCourseAgent.supervise(state);
          state = { ...state, ...nextState };
        }
      } catch (error) {
        console.error(`Error in step ${state.next}:`, error);

        if (state.retryCount >= 3) {
          throw new CourseGenerationError(
            `Failed after 3 retries at step: ${state.next}`,
            500,
            "MAX_RETRIES_EXCEEDED"
          );
        }

        state = {
          ...state,
          retryCount: state.retryCount + 1,
          messages: [
            ...state.messages,
            new HumanMessage(`Error in ${state.next}: ${error}`),
          ],
        };
      }

      steps++;
    }

    // Handle completion
    if (steps >= maxSteps) {
      throw new CourseGenerationError(
        "Max steps reached without completion",
        500,
        "MAX_STEPS_EXCEEDED"
      );
    }

    if (!state.courseContent) {
      throw new CourseGenerationError(
        "Failed to generate course content",
        500,
        "CONTENT_GENERATION_FAILED"
      );
    }

    // Create course in database with transaction
    const [marketInsight, course] = await prisma.$transaction(async (tx) => {
      const insight = await tx.marketInsight.create({
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

      const newCourse = await tx.course.create({
        //@ts-ignore
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
              interactiveElements: module.interactiveElements,
            })),
          },
          marketTrend: state.marketResearch.primaryTrendId
            ? {
                connect: {
                  id: state.marketResearch.primaryTrendId,
                },
              }
            : undefined,
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

      return [insight, newCourse];
    });

    return NextResponse.json({
      course,
      marketInsight,
      qualityMetrics: state.qualityAnalysis,
      marketResearch: state.marketResearch,
      generationMetadata: {
        steps,
        refinements: state.retryCount,
        qualityScore: state.qualityAnalysis?.averageScore,
        marketAlignment: state.marketResearch?.alignmentScore,
        generationTime: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Course generation failed:", error);

    if (error instanceof CourseGenerationError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
          details: error.details,
        },
        { status: error.status }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: "Database error",
          code: error.code,
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
