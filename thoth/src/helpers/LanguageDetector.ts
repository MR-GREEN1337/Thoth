import { initializeGroq } from "@/app/actions/generate-suggestion";
import { getReposByLanguage, getReposByTopic, SupportedLanguage } from "@/lib/fallbackRepos";
import { EnhancedGithubLoader } from "./GithubRepoLoader";

export class CodeContentGenerator {
    private static readonly DIFFICULTY_LEVELS = {
      BEGINNER: "beginner",
      INTERMEDIATE: "intermediate",
      ADVANCED: "advanced"
    } as const;
  
    private static readonly CONTENT_TYPES = {
      TUTORIAL: "tutorial",
      REFERENCE: "reference",
      PROJECT: "project",
      EXERCISE: "exercise"
    } as const;
  
    private static async extractRelevantCode(content: any[], topic: string) {
        const prompt = {
          role: "system",
          content: "Analyze repository code and extract relevant patterns and examples.",
          functions: [
            {
              name: "extract_patterns",
              description: "Extracts relevant code patterns and examples",
              parameters: {
                type: "object",
                properties: {
                  relevantSnippets: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string" },
                        purpose: { type: "string" },
                        patterns: { type: "array", items: { type: "string" } }
                      }
                    }
                  },
                  usefulPatterns: {
                    type: "array",
                    items: { type: "string" }
                  }
                }
              }
            }
          ]
        };
    
        const groq = await initializeGroq();
        const completion = await groq?.chat.completions.create({
          messages: [
            { role: "system", content: prompt.content },
            { 
              role: "user", 
              content: `Extract relevant code patterns for topic: ${topic}\n\nCode:\n${JSON.stringify(content)}`
            }
          ],
          model: "llama-3.2-90b-vision-preview",
          temperature: 0.3,
          functions: prompt.functions,
          function_call: { name: "extract_patterns" }
        });
    
        return JSON.parse(completion?.choices[0]?.message?.function_call?.arguments || "{}");
      }
    
      static async generateLanguageSpecificCode(
        topic: string,
        language: SupportedLanguage,
        options: {
          difficulty?: keyof typeof CodeContentGenerator.DIFFICULTY_LEVELS;
          contentType?: keyof typeof CodeContentGenerator.CONTENT_TYPES;
          includeTests?: boolean;
          topics?: string[];
        } = {}
      ) {
        // Get and load repos
        const relevantRepos = getReposByLanguage(language);
        const topicRepos = options.topics 
          ? options.topics.flatMap(topic => getReposByTopic(topic))
          : [];
    
        const allRepos = [...new Set([...relevantRepos, ...topicRepos])];
    
        // Load and analyze repository content
        const repoContents = await Promise.all(
          allRepos.map(async repo => {
            try {
              const loader = new EnhancedGithubLoader(repo.url, {
                branch: "main",
                maxConcurrency: 5,
                maxFileSize: 1000000
              });
              const docs = await loader.load();
              return {
                repo,
                content: docs,
                success: true
              };
            } catch (error) {
              console.error(`Failed to load ${repo.url}:`, error);
              return {
                repo,
                content: [],
                success: false
              };
            }
          })
        );
    
        // Extract relevant patterns from successful loads
        const relevantCode = await this.extractRelevantCode(
          repoContents
            .filter(r => r.success)
            .flatMap(r => r.content),
          topic
        );
    
        // Generate code using the extracted patterns
        const generationPrompt = {
          role: "system",
          content: `Generate ${language} code using these real-world patterns and examples from successful repositories.`,
          functions: [
            {
              name: "generate_code_content",
              description: "Generates code content using repository examples",
              parameters: {
                type: "object",
                properties: {
                  mainContent: {
                    type: "object",
                    properties: {
                      implementations: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            code: { type: "string" },
                            explanation: { type: "string" },
                            sourcePatterns: { 
                              type: "array", 
                              items: { type: "string" }
                            }
                          }
                        }
                      },
                      tests: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            code: { type: "string" },
                            description: { type: "string" }
                          }
                        }
                      }
                    }
                  }
                },
                required: ["mainContent"]
              }
            }
          ]
        };
    
        const userPrompt = {
          role: "user",
          content: `Generate ${language} implementation for: ${topic}
    
    Found Code Patterns:
    ${JSON.stringify(relevantCode.usefulPatterns, null, 2)}
    
    Relevant Code Examples:
    ${relevantCode.relevantSnippets.map((snippet: { purpose: any; code: any; }) => 
      `Purpose: ${snippet.purpose}\nCode:\n${snippet.code}\n`
    ).join('\n')}
    
    Requirements:
    - Use the discovered patterns and examples
    - Adapt the patterns to the specific use case
    - Follow the same code style and practices
    - Include similar error handling approaches
    - Match the quality level of the examples
    - Generate tests similar to the repository tests
    
    Difficulty: ${options.difficulty || 'INTERMEDIATE'}`
        };
    
        try {
          const groq = await initializeGroq();
          const completion = await groq?.chat.completions.create({
            messages: [
              { role: "system", content: generationPrompt.content },
              { role: "user", content: userPrompt.content }
            ],
            model: "llama-3.2-90b-vision-preview",
            temperature: 0.3,
            functions: generationPrompt.functions,
            function_call: { name: "generate_code_content" }
          });
    
          const result = JSON.parse(
            completion?.choices[0]?.message?.function_call?.arguments || "{}"
          );
    
          // Return final result with metadata about used patterns
          return {
            ...result,
            metadata: {
              language,
              patternsUsed: relevantCode.usefulPatterns,
              sourceRepos: repoContents
                .filter(r => r.success)
                .map(r => ({
                  name: r.repo.name,
                  url: r.repo.url,
                  stars: r.repo.stars
                })),
              generatedAt: new Date().toISOString()
            }
          };
    
        } catch (error) {
          console.error(`Failed to generate ${language} content:`, error);
          throw new Error(`Code generation failed: ${error}`);
        }
      }
    private static assessComplexity(code: any[]): 'LOW' | 'MEDIUM' | 'HIGH' {
      // Simple complexity assessment based on code characteristics
      const metrics = {
        totalLines: 0,
        functionsCount: 0,
        nestedDepth: 0
      };
  
      code.forEach(file => {
        const content = file.content;
        metrics.totalLines += content.split('\n').length;
        metrics.functionsCount += (content.match(/function/g) || []).length;
        metrics.nestedDepth = Math.max(
          metrics.nestedDepth,
          Math.max(...content.split('\n').map((line: { match: (arg0: RegExp) => (string | any[])[]; }) => 
            (line.match(/^\s+/)?.[0]?.length || 0) / 2
          ))
        );
      });
  
      if (metrics.totalLines > 200 || metrics.nestedDepth > 4) return 'HIGH';
      if (metrics.totalLines > 100 || metrics.nestedDepth > 2) return 'MEDIUM';
      return 'LOW';
    }
  }

export class LanguageDetector {
    // Language metadata with typical use cases and identifiers
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
      },
      java: {
        keywords: ["spring", "enterprise", "android", "jvm", "maven", "gradle", "jdbc", "jakarta"],
        domains: ["enterprise", "android", "large systems", "microservices"],
        frameworks: ["Spring", "Hibernate", "Android SDK"],
        typical_tasks: ["enterprise apps", "Android apps", "microservices", "large systems"]
      },
      golang: {
        keywords: ["go", "goroutines", "channels", "concurrent", "performance", "microservices"],
        domains: ["systems", "cloud", "networking", "backend"],
        frameworks: ["Gin", "Echo", "gRPC"],
        typical_tasks: ["microservices", "CLI tools", "system tools", "high-performance"]
      },
      rust: {
        keywords: ["memory-safe", "systems", "performance", "concurrent", "wasm", "cargo"],
        domains: ["systems", "WebAssembly", "CLI", "performance-critical"],
        frameworks: ["Tokio", "Rocket", "Actix"],
        typical_tasks: ["CLI tools", "systems programming", "WebAssembly", "performance"]
      }
    } as const;
  
    static async detectLanguage(topic: string): Promise<{
      language: keyof typeof LanguageDetector.LANGUAGE_METADATA;
      confidence: number;
      reasoning: string;
      suggestedFrameworks: string[];
      alternatives: string[];
    }> {
      const prompt = {
        role: "system",
        content: "Analyze the programming topic and determine the most appropriate programming language.",
        functions: [
          {
            name: "detect_language",
            description: "Determines the most suitable programming language for a topic",
            parameters: {
              type: "object",
              properties: {
                language: {
                  type: "string",
                  enum: Object.keys(this.LANGUAGE_METADATA),
                  description: "The most appropriate programming language"
                },
                confidence: {
                  type: "number",
                  description: "Confidence score between 0 and 1"
                },
                reasoning: {
                  type: "string",
                  description: "Explanation for the language choice"
                },
                suggestedFrameworks: {
                  type: "array",
                  items: { type: "string" },
                  description: "Recommended frameworks for this topic"
                },
                alternatives: {
                  type: "array",
                  items: { 
                    type: "string",
                    enum: Object.keys(this.LANGUAGE_METADATA)
                  },
                  description: "Alternative languages that could work well"
                },
                domainFocus: {
                  type: "array",
                  items: { type: "string" },
                  description: "Key domains this topic falls into"
                }
              },
              required: ["language", "confidence", "reasoning"]
            }
          }
        ]
      };
  
      const userPrompt = {
        role: "user",
        content: `Analyze this programming topic and determine the most appropriate programming language: ${topic}
  
  Consider:
  1. Required functionality and features
  2. Performance characteristics needed
  3. Ecosystem and library support
  4. Industry standards and common practices
  5. Development speed and maintainability
  6. Team and deployment considerations
  
  Available Languages and their strengths:
  ${Object.entries(this.LANGUAGE_METADATA)
    .map(([lang, meta]) => `${lang}: ${meta.domains.join(', ')}`)
    .join('\n')}`
      };
  
      try {
        const groq = await initializeGroq();
        if (groq === null) {
            throw new Error("Failed to initialize Groq");
            }
        const completion = await groq.chat.completions.create({
          messages: [
            { role: "system", content: prompt.content },
            { role: "user", content: userPrompt.content }
          ],
          model: "llama-3.2-90b-vision-preview",
          temperature: 0.3,
          functions: prompt.functions,
          function_call: { name: "detect_language" }
        });
  
        const result = JSON.parse(
          completion.choices[0]?.message?.function_call?.arguments || "{}"
        );
  
        // Enhance result with metadata
        const languageInfo = this.LANGUAGE_METADATA[result.language as keyof typeof this.LANGUAGE_METADATA];
        
        return {
          language: result.language,
          confidence: result.confidence,
          reasoning: result.reasoning,
          suggestedFrameworks: result.suggestedFrameworks || languageInfo.frameworks,
          alternatives: result.alternatives || [],
          //@ts-ignore
          metadata: {
            domains: languageInfo.domains,
            typicalTasks: languageInfo.typical_tasks,
            ecosystem: {
              frameworks: languageInfo.frameworks,
              keywords: languageInfo.keywords
            }
          }
        };
  
      } catch (error) {
        console.error("Language detection failed:", error);
        
        // Fallback to basic keyword matching
        const fallbackLanguage = this.fallbackDetection(topic);
        
        return {
          language: fallbackLanguage,
          confidence: 0.6,
          reasoning: "Fallback detection based on keyword matching",
          suggestedFrameworks: [...this.LANGUAGE_METADATA[fallbackLanguage].frameworks],
          alternatives: Object.keys(this.LANGUAGE_METADATA) as Array<keyof typeof this.LANGUAGE_METADATA>,
          //@ts-ignore
          metadata: {
            domains: this.LANGUAGE_METADATA[fallbackLanguage].domains,
            typicalTasks: this.LANGUAGE_METADATA[fallbackLanguage].typical_tasks,
            ecosystem: {
              frameworks: this.LANGUAGE_METADATA[fallbackLanguage].frameworks,
              keywords: this.LANGUAGE_METADATA[fallbackLanguage].keywords
            }
          }
        };
      }
    }
  
    private static fallbackDetection(topic: string): keyof typeof LanguageDetector.LANGUAGE_METADATA {
      const topicLower = topic.toLowerCase();
      let maxMatches = 0;
      let bestLanguage: keyof typeof this.LANGUAGE_METADATA = "javascript"; // Default fallback
  
      for (const [language, metadata] of Object.entries(this.LANGUAGE_METADATA)) {
        let matches = 0;
        
        // Check keywords
        matches += metadata.keywords.filter(keyword => 
          topicLower.includes(keyword.toLowerCase())
        ).length * 2; // Keywords are weighted more heavily
  
        // Check domains
        matches += metadata.domains.filter(domain => 
          topicLower.includes(domain.toLowerCase())
        ).length;
  
        // Check typical tasks
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
 }
