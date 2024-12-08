import { Groq } from "groq-sdk";
import { NextResponse } from "next/server";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { Annotation } from "@langchain/langgraph";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { WikipediaQueryRun } from "@langchain/community/tools/wikipedia_query_run";
import { GithubRepoLoader } from "@langchain/community/document_loaders/web/github";

// Initialize API clients
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY!,
});

const tavilyTool = new TavilySearchResults({ maxResults: 5 });
const wikipediaTool = new WikipediaQueryRun();

// Enhanced Schema Definitions with new fields for subject-specific content
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
  contentType: z.enum(["MARKDOWN", "LATEX", "CODE", "MIXED"]).optional(),
  codeExamples: z.array(z.object({
    language: z.string(),
    code: z.string(),
    explanation: z.string()
  })).optional(),
  latexContent: z.array(z.object({
    equation: z.string(),
    explanation: z.string(),
    context: z.string()
  })).optional(),
  interactiveElements: z.array(z.object({
    type: z.string(),
    content: z.string(),
    solution: z.string().optional()
  })).optional()
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
        return results.map(result => ({
          url: String(result.url || ''),
          title: String(result.title || ''),
          content: String(result.content || ''),
          score: Number(result.score || 0)
        })).filter(result => result.url && result.title);
      }

      // If string, try to parse it
      if (typeof results === 'string') {
        try {
          const parsed = JSON.parse(results);
          return this.normalizeSearchResults(parsed);
        } catch {
          console.warn('Failed to parse search results string');
          return [];
        }
      }

      // If single object, wrap in array
      if (typeof results === 'object' && !Array.isArray(results)) {
        return this.normalizeSearchResults([results]);
      }

      return [];
    } catch (error) {
      console.error('Search results normalization failed:', error);
      return [];
    }
  }

  static cleanJsonResponse(text: string): string {
    if (!text || typeof text !== 'string') {
        return '{}';
    }

    try {
        // Remove markdown code block markers and language indicators
        let cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '');

        // Enhanced cleaning
        cleaned = cleaned
            .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
            .replace(/\\(?!["\\/bfnrt])/g, '\\\\')  // Fix invalid escape sequences
            .replace(/[\u201C\u201D]/g, '"')  // Fix smart quotes
            .replace(/[\u2018\u2019]/g, "'")  // Fix smart single quotes
            .replace(/(\r\n|\n|\r)/gm, '')    // Remove newlines
            .replace(/\s+/g, ' ')             // Normalize whitespace
            .trim();

        // More robust JSON object extraction
        const jsonMatch = cleaned.match(/(\{[\s\S]*\})/);
        if (jsonMatch) {
            cleaned = jsonMatch[1];
            // Validate structure by counting braces
            let openBraces = 0;
            let isValid = true;
            for (let char of cleaned) {
                if (char === '{') openBraces++;
                if (char === '}') openBraces--;
                if (openBraces < 0) {
                    isValid = false;
                    break;
                }
            }
            if (!isValid || openBraces !== 0) {
                throw new Error('Unbalanced braces in JSON');
            }
        }

        // Test parse
        JSON.parse(cleaned);
        return cleaned;
    } catch (error) {
        console.error('JSON cleaning failed:', error);
        console.error('Original text:\n', text);
        return '{}';
    }
}

static safeParseJson<T>(text: string, context: string = ''): T | null {
    try {
        const cleaned = this.cleanJsonResponse(text);
        
        // Additional validation for empty or invalid JSON
        if (cleaned === '{}' || !cleaned) {
            console.error(`Empty or invalid JSON for ${context}`);
            return null;
        }

        const parsed = JSON.parse(cleaned) as T;
        
        // Basic structure validation
        if (!parsed || typeof parsed !== 'object') {
            throw new Error('Parsed result is not an object');
        }

        return parsed;
    } catch (error) {
        console.error(`JSON parsing failed for ${context}:`, error);
        console.error('Original text:', text);
        return null;
    }
}
}

// Content type detection and processing functions
class ContentTypeDetector {
  private static extractJSON(text: string, context: string = ""): any {
    if (!text || typeof text !== "string") {
      console.warn(`Empty or invalid input for JSON parsing: ${context}`);
      return null;
    }

    // Clean up the text
    const cleanedText = text.trim();

    // Define parsing strategies
    const strategies = [
      // Strategy 1: Direct parse
      (input: string) => {
        try {
          return JSON.parse(input);
        } catch (e) {
          return null;
        }
      },
      // Strategy 2: Find JSON between code blocks
      (input: string) => {
        const matches = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (matches?.[1]) {
          try {
            return JSON.parse(matches[1].trim());
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      // Strategy 3: Find first JSON-like structure
      (input: string) => {
        const matches = input.match(/{[\s\S]*?}/);
        if (matches?.[0]) {
          try {
            return JSON.parse(matches[0]);
          } catch (e) {
            return null;
          }
        }
        return null;
      },
      // Strategy 4: Fix common JSON issues
      (input: string) => {
        try {
          // Replace common issues
          let fixed = input
            .replace(/[\u201C\u201D]/g, '"') // Fix smart quotes
            .replace(/[\u2018\u2019]/g, "'") // Fix smart single quotes
            .replace(/\n/g, "\\n") // Handle newlines
            .replace(/\r/g, "\\r") // Handle carriage returns
            .replace(/\t/g, "\\t") // Handle tabs
            .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":') // Fix unquoted property names
            .replace(/,\s*([\]}])/g, "$1"); // Remove trailing commas

          return JSON.parse(fixed);
        } catch (e) {
          return null;
        }
      }
    ];

    // Try each strategy
    for (const strategy of strategies) {
      const result = strategy(cleanedText);
      if (result !== null) {
        return result;
      }
    }

    // If all strategies fail, log error and return null
    console.error(`Failed to parse JSON in context: ${context}`);
    console.error("Original text:", text);
    return null;
  }

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
RETURN ONLY THE JSON, NOTHING ELSE!!! NO EXPLANATORY TEXT, JUST A PLAIN JSON!!!!  
`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.3,
    });

    const result = this.extractJSON(
      completion.choices[0]?.message?.content || "{}",
      "detectSubjectType"
    );

    // Provide default values if parsing fails
    return result || {
      requiresLatex: false,
      requiresCode: false,
      primaryContentType: "MARKDOWN",
      suggestedTools: [],
    };
  }

  static async generateLatexContent(topic: string, context: any): Promise<any> {
    const wikipediaResult = (await wikipediaTool.invoke(
      `${topic} mathematical formulation equations`
    )).substring(0, 1000);

    const academicSearch = (await tavilyTool.invoke(
      `${topic} mathematical equations formulas academic`
    )).substring(0, 1000);

    console.log("Academic search Result:", academicSearch);

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
  
  RETURN ONLY THE JSON, NOTHING ELSE, NO TEXT OR ANYTHING, JUST A JSON!!!! 
  
  `;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.2,
    });

    return this.extractJSON(
      completion.choices[0]?.message?.content || "{}",
      "generateLatexContent"
    );
  }

  private static async findRelevantRepositories(
    topic: string,
    language: string,
    maxResults: number = 3
  ): Promise<GitHubRepo[]> {
    try {
      const tavilyTool = new TavilySearchResults({ maxResults: 30 });
      const searchQuery = `site:github.com ${topic} ${language} programming "stars:" "README.md"`;
      
      let searchResults;
      try {
        searchResults = await tavilyTool.invoke(searchQuery);
      } catch (error) {
        console.error('Search failed:', error);
        return [];
      }
      
      const repos: GitHubRepo[] = [];

      
      for (const result of searchResults) {
        if (!result?.url || typeof result.url !== 'string') {
          continue;
        }
  
        try {
          // Parse the GitHub URL
          const url = new URL(result.url);
          const pathParts = url.pathname.split('/').filter(part => part);
          
          // We need at least owner/repo in the path
          if (pathParts.length < 2) {
            continue;
          }
          
          const owner = pathParts[0];
          const name = pathParts[1];
          
          // Skip if this is not a repository URL
          if (!owner || !name || name === 'search' || name === 'trending') {
            continue;
          }
          
          // Construct clean repository URL
          const cleanUrl = `https://github.com/${owner}/${name}`;
          
          // Parse stars from content with improved regex
          let stars = 0;
          if (result.content) {
            const starsMatch = result.content.match(/(\d+(?:\.\d+)?k?)\s*stars?/i);
            if (starsMatch) {
              const starCount = starsMatch[1].toLowerCase();
              if (starCount.includes('k')) {
                stars = Math.round(parseFloat(starCount.replace('k', '')) * 1000);
              } else {
                stars = parseInt(starCount, 10);
              }
            }
          }
          
          // Only add repositories that have some metadata
          if (stars > 0 || result.content) {
            repos.push({
              url: cleanUrl,
              name,
              description: result.content || '',
              language,
              stars
            });
          }
        } catch (error) {
          console.error('Error processing repository:', result.url, error);
          continue;
        }
      }
      
      // Sort by stars and return top results
      return repos
        .sort((a, b) => b.stars - a.stars)
        .slice(0, maxResults);
        
    } catch (error) {
      console.error('Error finding repositories:', error);
      return [];
    }
  }

  static async generateCodeContent(topic: string, language: string): Promise<any> {
    try {
      // Find relevant repositories
      const repos = await this.findRelevantRepositories(topic, language);
      console.log('Found repositories:', repos);

      // Load content from each repository
      const repoContents = await Promise.all(
        repos.map(async (repo) => {
          try {
            const repoLoader = new GithubRepoLoader(
              repo.url,
              {
                branch: "main",
                recursive: false,
                maxConcurrency: 5,
                ignorePaths: [
                  "*.md",
                  "*.json",
                  "*.git*",
                  "test*",
                  "docs*",
                  "example*"
                ]
              }
            );
            
            const docs = await repoLoader.load();
            return {
              repo,
              content: docs,
              error: null
            };
          } catch (error) {
            console.error(`Error loading repo ${repo.url}:`, error);
            return {
              repo,
              content: [],
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );

      // Additional search for best practices and tutorials
      const searchResults = await tavilyTool.invoke(
        `${topic} ${language} programming tutorial best practices 2024`
      );

      const prompt = `Generate programming content for:
Topic: ${topic}
Language: ${language}
Found Repositories: ${JSON.stringify(repos)}
Repository Contents: ${JSON.stringify(repoContents.map(rc => ({
  repo: rc.repo.name,
  contentSummary: rc.content.slice(0, 500)
})))}
Current Best Practices: ${JSON.stringify(searchResults)}

Requirements:
1. Modern, production-quality code examples
2. Clear explanations and comments
3. Best practices and patterns
4. Common pitfalls to avoid
5. Testing approaches
6. Performance considerations

Return JSON with:
{
  "examples": [
    {
      "code": "code snippet",
      "explanation": "detailed explanation",
      "bestPractices": ["practices used"],
      "commonMistakes": ["things to avoid"],
      "testingApproach": "how to test",
      "sourceRepo": "repository name if derived from example"
    }
  ],
  "conceptualFramework": {
    "keyIdeas": ["main concepts"],
    "designPatterns": ["relevant patterns"],
    "architecturalConsiderations": ["important considerations"]
  },
  "referencedRepositories": [{
    "name": "repo name",
    "url": "repo url",
    "usageContext": "how this repo's patterns were used"
  }]
}
  
RETURN ONLY THE JSON, JUST THE JSON, NOTHING ELSE. MY LIFE DEPENDS ON THIS.
`;

      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.2-90b-vision-preview",
        temperature: 0.3,
      });

      return this.extractJSON(
        completion.choices[0]?.message?.content || "{}",
        "generateCodeContent"
      );
    } catch (error) {
      console.error("Error generating code content:", error);
      throw error;
    }
  }
}

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

  static async searchContent(query: string): Promise<any[]> {
    try {
      const results = await tavilyTool.invoke(query);
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
      const userAnalysis = await this.analyzeUserHistory(state.userId);
      
      // Enhanced market query using course idea and user context
      const marketQuery = `
        ${state.courseIdea} 
        ${state.analysis} 
        expertise:${userAnalysis.preferences.expertiseLevel} 
        ${userAnalysis.gaps.suggestedTopics.join(' ')} 
        industry trends 2024
      `;
      
      const searchResults = await this.searchContent(marketQuery);
      const wikiContext = await wikipediaTool.invoke(state.courseIdea).catch(() => null);
  
      // Check for content overlap
      const existingContent = new Set(userAnalysis.expertise.knownConcepts);
      const filteredResults = searchResults.filter(result => 
        !Array.from(existingContent).some(concept => 
          result.content.toLowerCase().includes((concept as any).toLowerCase())
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
2. Avoids duplicating user's known concepts: ${Array.from(existingContent).join(', ')}
3. Fills knowledge gaps: ${userAnalysis.gaps.missingConcepts.join(', ')}
4. Aligns with interest areas: ${userAnalysis.preferences.interests.map((i: any) => i.name).join(', ')}
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
        messages: [new HumanMessage("Market research completed with course idea analysis")],
        marketResearch: {
          ...marketResearch,
          userContext: userAnalysis,
          courseIdea: state.courseIdea
        },
        searchResults: filteredResults,
        next: "STRUCTURE"
      };
    } catch (error) {
      console.error("Market research failed:", error);
      return {
        messages: [new HumanMessage(`Market research failed: ${error}`)],
        next: "ERROR"
      };
    }
  }

  static async generateContent(state: typeof AgentState.State) {
    try {
      const { courseStructure } = state;
  
      // Track generation metrics
      const metrics = {
        startTime: Date.now(),
        successfulModules: 0,
        failedModules: 0,
        totalTokensUsed: 0,
        errors: [] as string[]
      };
  
      const enrichedModules = await Promise.all(
        courseStructure.modules.map(async (module: any, index: number) => {
          console.log(`Generating content for module ${index + 1}: ${module.title}`);
          
          try {
            // 1. Detect content type requirements
            const contentType = await ContentTypeDetector.detectSubjectType(
              module.title
            ).catch(error => {
              console.warn(`Content type detection failed for module ${index}, using defaults:`, error);
              return {
                requiresLatex: false,
                requiresCode: false,
                primaryContentType: "MARKDOWN",
                suggestedTools: []
              };
            });
  
            // 2. Gather relevant content from multiple sources
            const [searchResults, wikiContent] = await Promise.all([
              // Search for tutorials and examples
              this.searchContent(`${module.title} course content tutorial examples projects`),
              
              // Get Wikipedia context if available
              wikipediaTool.invoke(module.title).catch(() => null)
            ]);
  
            let specializedContent = null;
            let contentPrompt = "";
            let codeExamples = [];
            let latexContent = [];
  
            // 3. Generate specialized content based on type
            if (contentType.requiresLatex) {
              const latexResult = await ContentTypeDetector.generateLatexContent(
                module.title,
                {
                  searchResults,
                  wikiContent
                }
              ).catch(error => {
                console.warn(`LaTeX generation failed for module ${index}:`, error);
                return null;
              });
  
              if (latexResult) {
                specializedContent = SearchResultsHandler.safeParseJson(
                  latexResult,
                  'LaTeX content'
                );
                latexContent = specializedContent?.equations || [];
              }
  
              contentPrompt = `Create comprehensive module content combining LaTeX and explanations:
  Title: "${module.title}"
  Duration: ${module.duration} minutes
  Content Type: Mathematics/Science
  Primary Audience Level: ${state.analysis?.expertiseLevel || 'BEGINNER'}
  
  LaTeX Content: ${JSON.stringify(specializedContent)}
  Wikipedia Context: ${wikiContent}
  Search Results: ${JSON.stringify(searchResults)}
  
  Requirements:
  1. Start with fundamental concepts
  2. Include step-by-step derivations
  3. Provide practical examples
  4. Add knowledge check questions
  5. Include visual suggestions
  6. Reference real-world applications
  
  Format in clear MARKDOWN with LaTeX equations.`;
  
            } else if (contentType.requiresCode) {
              // Find relevant code repositories
              const codeResult = await ContentTypeDetector.generateCodeContent(
                module.title,
                "python" // Could be dynamic based on course needs
              ).catch(error => {
                console.warn(`Code generation failed for module ${index}:`, error);
                return null;
              });
  
              if (codeResult) {
                specializedContent = SearchResultsHandler.safeParseJson(
                  codeResult,
                  'Code content'
                );
                codeExamples = specializedContent?.examples || [];
              }
  
              contentPrompt = `Create comprehensive programming module content:
  Title: "${module.title}"
  Duration: ${module.duration} minutes
  Content Type: Programming/Technical
  Primary Audience Level: ${state.analysis?.expertiseLevel || 'BEGINNER'}
  
  Code Examples: ${JSON.stringify(codeExamples)}
  Search Results: ${JSON.stringify(searchResults)}
  
  Requirements:
  1. Start with concept explanation
  2. Provide working code examples
  3. Include best practices
  4. Add debugging tips
  5. Include practical exercises
  6. Reference industry standards
  
  Format in clear MARKDOWN with code blocks.`;
  
            } else {
              // General content
              contentPrompt = `Create comprehensive module content:
  Title: "${module.title}"
  Duration: ${module.duration} minutes
  Content Type: ${contentType.primaryContentType}
  Primary Audience Level: ${state.analysis?.expertiseLevel || 'BEGINNER'}
  
  Context:
  ${wikiContent ? `Wikipedia: ${wikiContent}\n` : ''}
  Search Results: ${JSON.stringify(searchResults)}
  
  Requirements:
  1. Clear learning objectives
  2. Engaging explanations
  3. Real-world examples
  4. Interactive exercises
  5. Knowledge checks
  6. Industry relevance
  7. Clear section structure
  
  Format in clear, well-structured MARKDOWN.`;
            }
  
            // 4. Generate main content with retries
            let content = '';
            let attempts = 0;
            const maxAttempts = 3;

            const userAnalysis = state.marketResearch.userContext;
            const existingKnowledge = new Set(userAnalysis.expertise.knownConcepts);
            
            contentPrompt = `${contentPrompt}

User Context:
- Expertise Level: ${userAnalysis.preferences.expertiseLevel}
- Known Concepts: ${Array.from(existingKnowledge).join(', ')}
- Knowledge Gaps: ${userAnalysis.gaps.missingConcepts.join(', ')}
- Weekly Study Hours: ${userAnalysis.preferences.weeklyHours}

Requirements:
1. Focus on filling knowledge gaps
2. Avoid repeating known concepts
3. Match expertise level
4. Align with available study time
5. Build on existing knowledge
6. Provide unique insights`;
  
            while (!content && attempts < maxAttempts) {
              try {
                const completion = await groq.chat.completions.create({
                  messages: [{ role: "user", content: contentPrompt }],
                  model: "llama-3.2-90b-vision-preview",
                  temperature: 0.3,
                  max_tokens: 8192,
                });
  
                content = completion.choices[0]?.message?.content || '';
                metrics.totalTokensUsed += completion.usage?.total_tokens || 0;
                
                // Validate content
                if (content.length < 100) {
                  throw new Error('Generated content too short');
                }
              } catch (error) {
                console.warn(`Content generation attempt ${attempts + 1} failed:`, error);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000 * attempts)); // Exponential backoff
              }
            }
  
            if (!content) {
              throw new Error(`Failed to generate content after ${maxAttempts} attempts`);
            }
  
            // 5. Generate interactive elements
            const interactiveElements = await this.generateInteractiveElements(
              module.title,
              content,
              contentType
            ).catch(error => {
              console.warn(`Interactive elements generation failed for module ${index}:`, error);
              return [];
            });
  
            // 6. Assemble final module content
            metrics.successfulModules++;
            
            return {
              ...module,
              content,
              searchResults,
              aiGenerated: true,
              aiPrompt: contentPrompt,
              qualityScore: 0,
              revisionHistory: [],
              contentType: contentType.primaryContentType,
              specializedContent,
              latexContent,
              codeExamples,
              interactiveElements,
              metadata: {
                generatedAt: new Date().toISOString(),
                contentLength: content.length,
                attempts,
                hasSpecializedContent: !!specializedContent
              }
            };
  
          } catch (moduleError) {
            console.error(`Error generating content for module ${index}:`, moduleError);
            metrics.failedModules++;
            metrics.errors.push(`Module ${index} (${module.title}): ${(moduleError as any).message}`);
  
            // Return module with error state
            return {
              ...module,
              content: "Content generation failed. Please retry generation for this module.",
              aiGenerated: true,
              qualityScore: 0,
              contentType: "MARKDOWN",
              generationError: (moduleError as any).message,
              metadata: {
                generatedAt: new Date().toISOString(),
                error: true,
                errorType: (moduleError as any).name,
                errorMessage: (moduleError as any).message
              }
            };
          }
        })
      );
  
      // Calculate generation metrics
      metrics.duration = Date.now() - metrics.startTime;
      
      const enrichedCourse = {
        ...courseStructure,
        modules: enrichedModules,
        generationMetrics: {
          ...metrics,
          successRate: metrics.successfulModules / courseStructure.modules.length,
          averageTokensPerModule: metrics.totalTokensUsed / courseStructure.modules.length,
          timestamp: new Date().toISOString()
        }
      };
  
      // Determine next step based on success rate
      const successThreshold = 0.7; // 70% success rate required
      const next = enrichedCourse.generationMetrics.successRate >= successThreshold 
        ? "QUALITY_CHECK" 
        : "ERROR";
  
      return {
        messages: [new HumanMessage(
          next === "QUALITY_CHECK"
            ? `Course content generated successfully (${Math.round(enrichedCourse.generationMetrics.successRate * 100)}% success rate)`
            : `Course generation partially failed (${Math.round(enrichedCourse.generationMetrics.successRate * 100)}% success rate)`
        )],
        courseContent: enrichedCourse,
        next
      };
  
    } catch (error) {
      console.error("Content generation failed:", error);
      return {
        messages: [new HumanMessage(`Content generation failed: ${(error as any).message}`)],
        next: "ERROR",
        courseContent: null
      };
    }
  }
  
private static async analyzeUserHistory(userId: string): Promise<{
  preferences: any,
  expertise: any,
  gaps: any
}> {
  const userContext = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      courses: {
        include: {
          modules: true,
          interests: true,
          marketTrend: true
        }
      },
      interests: {
        include: {
          marketTrends: true
        }
      },
      enrollments: {
        include: {
          course: true
        }
      },
      marketInsights: true
    }
  });

  // Analyze completed courses
  const completedCourses = userContext?.enrollments?.filter(
    e => e.status === 'COMPLETED'
  ) || [];

  // Extract key topics and concepts
  const knownConcepts = new Set(
    completedCourses.flatMap(e => 
      e.course.keyTakeaways.concat(e.course.prerequisites)
    )
  );

  // Analyze authored courses for expertise areas
  const authoredTopics = new Set(
    userContext?.courses?.flatMap(c => 
      c.keyTakeaways.concat(c.prerequisites)
    ) || []
  );

  // Find gaps in knowledge
  const relatedTopics = new Set(
    userContext?.interests?.flatMap(i => 
      i.trendingTopics.concat(
        i.marketTrends.map(t => t.name)
      )
    ) || []
  );

  const knowledgeGaps = Array.from(relatedTopics)
    .filter(topic => !knownConcepts.has(topic));

  return {
    preferences: {
      expertiseLevel: userContext?.expertiseLevel,
      weeklyHours: userContext?.weeklyHours,
      interests: userContext?.interests,
      preferenceAnalysis: userContext?.preferenceAnalysis
    },
    expertise: {
      completedCourses: completedCourses.length,
      authoredCourses: userContext?.courses?.length || 0,
      knownConcepts: Array.from(knownConcepts),
      expertiseAreas: Array.from(authoredTopics)
    },
    gaps: {
      missingConcepts: knowledgeGaps,
      suggestedTopics: userContext?.interests
        ?.filter(i => i.marketDemand === 'HIGH')
        .map(i => i.name) || []
    }
  };
}

  // Helper method for generating interactive elements
  static async generateInteractiveElements(
    title: string,
    content: string,
    contentType: any
  ): Promise<any[]> {
    try {
      const prompt = `Create interactive elements for module: ${title}
  Type: ${contentType.primaryContentType}
  Summary: ${content.substring(0, 300)}
  
  Generate 3-7 elements in this format:
  {
    "elements": [
      {
        "type": "quiz|exercise|discussion",
        "title": "string",
        "content": "string",
        "solution": "string",
        "difficulty": "beginner|intermediate|advanced"
      }
    ]
  }
    
  RETURN ONLY A JSON, NO OTHER TEXT OR EXPLANATION, JUST THE JSON.  
  
  `;
  
      const completion = await groq.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: "llama-3.2-90b-vision-preview",
        temperature: 0.3,
        max_tokens: 1024
      });
  
      const result = SearchResultsHandler.safeParseJson(
        completion.choices[0]?.message?.content || "{}",
        'Interactive elements'
      );
  
      return result?.elements || [];
    } catch (error) {
      console.error("Failed to generate interactive elements:", error);
      return [];
    }
  };

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

Original content summary: ${module.content.substring(0, 1000)}...

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
      const supervisorPrompt = `Analyze current course generation state and determine next action.

Current State:
${JSON.stringify({
  courseIdea: state.courseIdea,
  hasMarketResearch: !!state.marketResearch,
  hasStructure: !!state.courseStructure,
  hasContent: !!state.courseContent,
  hasQualityAnalysis: !!state.qualityAnalysis,
  currentStep: state.next,
  qualityScore: state.qualityAnalysis?.averageScore,
  retryCount: state.retryCount || 0,
  previousMessages: state.messages.slice(-3)
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

const RequestSchema = z.object({
  analysis: z.any(),
  courseIdea: z.string().min(1, "Course idea is required")
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

    console.log(body)

    const { analysis, courseIdea } = RequestSchema.parse(body);

    let state: typeof AgentState.State = {
      messages: [],
      userId,
      analysis,
      courseIdea, // Add course idea to initial state
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
