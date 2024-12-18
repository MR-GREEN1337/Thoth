import { initializeGroq } from "@/app/actions/generate-suggestion";
import { SupportedLanguage } from "@/lib/fallbackRepos";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { OpenAIEmbeddings } from "@langchain/openai";
import { Groq } from "groq-sdk";

const CONFIG = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: "text-embedding-3-small"
  },
  mongodb: {
    uri: process.env.MONGODB_ATLAS_URI,
    dbName: process.env.MONGODB_ATLAS_DB_NAME,
    collectionName: process.env.MONGODB_ATLAS_COLLECTION_NAME,
    indexName: "code_vector_index",
    textKey: "content",
    embeddingKey: "embedding"
  }
};

  interface CodePattern {
  pattern: string;
  context: string;
  applicability: string[];
  complexity: 'basic' | 'intermediate' | 'advanced';
  bestPractices: string[];
}

interface CodeExample {
  code: string;
  explanation: string;
  concepts: string[];
  learningPoints: string[];
  commonMistakes: string[];
  testCases?: string[];
}

interface LearningObjective {
  concept: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  prerequisites: string[];
  outcomes: string[];
}

const TOKEN_LIMITS = {
  SEARCH_RESULTS: 1000,
  CODE_OUTPUT: 2000,
  EXAMPLE_LENGTH: 300
};

export class CodeContentGenerator {

  static async vectorSearch(
    collection: any,
    query: string,
    filter: any,
    limit: number = 2
  ) {
      const vectorStore = new MongoDBAtlasVectorSearch(
        new OpenAIEmbeddings({
          openAIApiKey: process.env.OPENAI_API_KEY,
          modelName: "text-embedding-3-small"
        }),
        {
          collection,
          indexName: "code_index",
          textKey: "content",
          embeddingKey: "embedding",
        }
      );
  
      const results = await vectorStore.similaritySearch(query, limit, filter);
      
      // Trim each result to reduce token consumption
      return results.map(doc => ({
        ...doc,
        pageContent: this.trimContent(doc.pageContent, TOKEN_LIMITS.SEARCH_RESULTS / limit)
      }));
    }
  
    private static trimContent(content: string, maxTokens: number): string {
      // Rough approximation: 1 token ≈ 4 characters
      const maxChars = maxTokens * 4;
      if (content.length <= maxChars) return content;
      
      // Keep the first part of the content that's most relevant
      return content.substring(0, maxChars) + "...";
    }

  static async generateLearningPath(
    topic: string,
    difficulty: string
  ): Promise<LearningObjective[]> {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
    
    const prompt = `Create a detailed learning path for: ${topic}
    Difficulty: ${difficulty}
    
    Return a JSON array of learning objectives with this structure:
    [
      {
        "concept": "string",
        "difficulty": "beginner|intermediate|advanced",
        "prerequisites": ["string"],
        "outcomes": ["string"]
      }
    ]
    
    Make it comprehensive but achievable. RETURN ONLY THE JSON!`;

    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "llama-3.2-11b-vision-preview",
      temperature: 0.3,
    });

    return JSON.parse(completion.choices[0]?.message?.content || "[]");
  }

// Modify the synthesizeCode method to handle non-JSON responses
static async synthesizeCode(
  examples: CodeExample[],
  patterns: CodePattern[],
  learningPath: LearningObjective[],
  language: SupportedLanguage,
  difficulty: string
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });
  
  const synthesisPrompt = `Generate educational ${language} code that demonstrates these patterns and concepts.

Context:
${JSON.stringify({patterns, concepts: learningPath})}

Requirements:
1. Return ONLY the code with comments
2. DO NOT wrap in JSON or code blocks
3. DO NOT include any explanatory text
4. Follow ${language} best practices
5. Include error handling for ${difficulty} level
6. Add comprehensive comments

Reference Examples:
${examples.map(e => e.code).join('\n\n')}`;

  const completion = await groq.chat.completions.create({
    messages: [
      {
        role: "system",
        content: "You are a code generator. Return ONLY the code without any formatting or explanation."
      },
      { role: "user", content: synthesisPrompt }
    ],
    model: "llama-3.2-90b-vision-preview",
    temperature: 0.2
  });

  return completion.choices[0]?.message?.content || "";
}

static async generateEducationalCode(
  topic: string,
  language: SupportedLanguage,
  options: {
    difficulty: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
    includeTests?: boolean;
  }
): Promise<string> {
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY! });

  // Set up MongoDB connection
  try {
    if (!process.env.MONGODB_ATLAS_URI || !process.env.MONGODB_ATLAS_DB_NAME || !process.env.MONGODB_ATLAS_COLLECTION_NAME) {
      throw new Error("MongoDB configuration is missing");
    }

    const { MongoClient } = require('mongodb');
    const client = new MongoClient(process.env.MONGODB_ATLAS_URI);
    await client.connect();

    const db = client.db(process.env.MONGODB_ATLAS_DB_NAME);
    const collection = db.collection(process.env.MONGODB_ATLAS_COLLECTION_NAME);

    // Search for relevant code examples using vector search
    const searchQuery = `${topic} ${language} programming examples`;
    const languageFilter = { language: language.toLowerCase() };
    const searchResults = await this.vectorSearch(
      collection,
      searchQuery,
      languageFilter,
      3 // Fetch top 3 most relevant examples
    );

    // Extract and format code examples from search results
    const relevantExamples = searchResults.map(result => {
      const content = result.pageContent;
      return {
        code: content,
        source: result.metadata?.file_path || 'Unknown',
        repo: result.metadata?.repo_name || 'Unknown'
      };
    });

    // Enhance the code generation prompt with found examples
    const examplesContext = relevantExamples
      .map((ex, i) => `Example ${i + 1} (from ${ex.repo}):\n${ex.code}`)
      .join('\n\n');

    const codePrompt = `Generate ${language} code for ${topic}.

Reference these existing implementations for context:
${examplesContext}

Requirements:
1. Maximum ${TOKEN_LIMITS.CODE_OUTPUT} characters
2. Focus on core functionality
3. Include essential comments only
4. Difficulty: ${options.difficulty}
5. NO explanatory text, ONLY code
6. Include error handling
7. Follow patterns from the reference examples where appropriate
8. Maintain consistent coding style with examples

Generate code that builds upon these examples while meeting the specific requirements.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a code generator that synthesizes new code based on existing examples. Return ONLY the code, no explanations."
        },
        { role: "user", content: codePrompt }
      ],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.2,
      max_tokens: TOKEN_LIMITS.CODE_OUTPUT / 4
    });

    // Post-process the generated code to ensure it meets length limits
    let generatedCode = completion.choices[0]?.message?.content || "";
    if (generatedCode.length > TOKEN_LIMITS.CODE_OUTPUT) {
      generatedCode = this.trimContent(generatedCode, TOKEN_LIMITS.CODE_OUTPUT / 4);
    }

    // Clean up MongoDB connection
    await client.close();

    return generatedCode;

  } catch (error) {
    console.error("Error in generateEducationalCode:", error);
    
    // Fallback to generate code without examples if vector search fails
    const fallbackPrompt = `Generate ${language} code for ${topic}. Requirements:
1. Maximum ${TOKEN_LIMITS.CODE_OUTPUT} characters
2. Focus on core functionality
3. Include essential comments only
4. Difficulty: ${options.difficulty}
5. NO explanatory text, ONLY code
6. Include error handling`;

    const fallbackCompletion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: "You are a code generator. Return ONLY the code, no explanations."
        },
        { role: "user", content: fallbackPrompt }
      ],
      model: "llama-3.2-90b-vision-preview",
      temperature: 0.2,
      max_tokens: TOKEN_LIMITS.CODE_OUTPUT / 4
    });

    return fallbackCompletion.choices[0]?.message?.content || "";
  }
}
}

export class LanguageDetector {
    private static readonly LANGUAGE_METADATA = {
      javascript: {
        keywords: ["web", "frontend", "browser", "node", "react", "vue", "angular", "dom", "npm", "express"],
        domains: ["web development", "browser", "frontend", "fullstack", "server-side"],
        frameworks: ["React", "Vue", "Angular", "Node.js", "Express"],
        typical_tasks: ["web apps", "UI", "API", "server", "real-time", "SPA"]
      },
      typescript: {
        keywords: ["type-safe", "interface", "enum", "decorators", "angular", "nest", "tsc", "typed"],
        domains: ["enterprise", "large-scale", "type-safe backend", "modern web"],
        frameworks: ["Angular", "NestJS", "Next.js", "Deno"],
        typical_tasks: ["enterprise apps", "APIs", "large applications", "full-stack"]
      },
      python: {
        keywords: ["django", "flask", "data science", "ml", "ai", "numpy", "pandas", "tensorflow", "pytorch"],
        domains: ["data science", "machine learning", "web backend", "automation", "scripting"],
        frameworks: ["Django", "Flask", "FastAPI", "NumPy", "Pandas"],
        typical_tasks: ["data analysis", "ML models", "APIs", "automation", "scientific"]
      }
    } as const;
  
    static async detectLanguage(topic: string) {
      try {
        const groq = await initializeGroq();
        if (!groq) throw new Error("Failed to initialize Groq");
        
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: "Analyze the programming topic and determine the most appropriate language." },
            { role: "user", content: `Topic: ${topic}` }
          ],
          model: "llama-3.2-11b-vision-preview",
          temperature: 0.3
        });
  
        const result = completion.choices[0]?.message?.content || "";
        return this.enhanceResult(result as keyof typeof this.LANGUAGE_METADATA);
      } catch (error) {
        console.error("Language detection failed:", error);
        const fallbackLanguage = this.fallbackDetection(topic);
        return this.enhanceResult(fallbackLanguage);
      }
    }
  
    private static fallbackDetection(topic: string): keyof typeof LanguageDetector.LANGUAGE_METADATA {
      const topicLower = topic.toLowerCase();
      let maxMatches = 0;
      let bestLanguage: keyof typeof this.LANGUAGE_METADATA = "javascript";
  
      for (const [language, metadata] of Object.entries(this.LANGUAGE_METADATA)) {
        let matches = 0;
        matches += metadata.keywords.filter(keyword => 
          topicLower.includes(keyword.toLowerCase())
        ).length * 2;
        matches += metadata.domains.filter(domain => 
          topicLower.includes(domain.toLowerCase())
        ).length;
        matches += metadata.typical_tasks.filter(task => 
          topicLower.includes(task.toLowerCase())
        ).length;
  
        if (matches > maxMatches) {
          maxMatches = matches;
          bestLanguage = language as keyof typeof this.LANGUAGE_METADATA;
        }
      }
      return bestLanguage;
    }

    private static enhanceResult(language: keyof typeof LanguageDetector.LANGUAGE_METADATA) {
      const languageInfo = this.LANGUAGE_METADATA[language];
      return {
        language,
        confidence: 0.8,
        suggestedFrameworks: languageInfo?.frameworks || "Nextjs, Express, Nestjs, Django, Flask, FastAPI",
        metadata: {
          domains: languageInfo?.domains || "web development, data science, machine learning, automation",
          typicalTasks: languageInfo?.typical_tasks || "building web applications, data analysis, machine learning models, automating tasks",
          ecosystem: {
            frameworks: languageInfo?.frameworks || ["Nextjs", "Express", "Nestjs", "Django", "Flask", "FastAPI"],
            keywords: languageInfo?.keywords || ["web development", "data science", "machine learning", "automation"]
          }
        }
      };
    }
}