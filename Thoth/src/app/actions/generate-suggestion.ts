"use server";
import { Groq } from "groq-sdk";
import { z } from "zod";

// Custom error class for better error handling
class AISuggestionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly shouldRetry: boolean = false
  ) {
    super(message);
    this.name = 'AISuggestionError';
  }
}

// Enhanced Zod schemas with content type tracking
const AiSuggestContextSchema = z.object({
  courseTitle: z.string(),
  courseDescription: z.string(),
  currentContent: z.string(),
  moduleTitle: z.string().optional(),
  contentType: z.enum(['title', 'description', 'markdown', 'text']),
  elementType: z.string().optional() // For tracking specific HTML elements if needed
});

export type AiSuggestContext = z.infer<typeof AiSuggestContextSchema>;

export type AiSuggestion = {
  version: number;
  content: string;
  reasoning?: string;
  type: string;
  changesApplied?: string[];
};

// Initialize Groq with retry logic
export const initializeGroq = async (retryCount = 0): Promise<Groq | null> => {
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new AISuggestionError(
      'GROQ API key is not configured',
      'CONFIG_ERROR',
      false
    );
  }
  
  try {
    return new Groq({ apiKey });
  } catch (error) {
    if (retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
      return initializeGroq(retryCount + 1);
    }
    throw new AISuggestionError(
      'Failed to initialize GROQ client',
      'INIT_ERROR',
      true
    );
  }
};

// Enhanced suggestion creation with type information
const createSuggestion = (
  content: string,
  version: number,
  type: string,
  reasoning: string = "Generated suggestion"
): AiSuggestion => ({
  version,
  content,
  reasoning,
  type,
  changesApplied: []
});

// Main suggestion generation function with type awareness
export const generateSuggestions = async (
  prompt: string,
  context: AiSuggestContext,
  retryCount = 0
): Promise<AiSuggestion[]> => {
  try {
    // Validate input context
    const validContext = AiSuggestContextSchema.parse(context);
    
    const groq = await initializeGroq();
    if (!groq) {
      throw new AISuggestionError(
        'AI service unavailable',
        'SERVICE_ERROR',
        true
      );
    }

    const systemPrompt = `You are an AI writing assistant helping to improve educational course content.
    
    CONTEXT:
    Content Type: ${validContext.contentType}
    Course Title: "${validContext.courseTitle}"
    Course Description: "${validContext.courseDescription}"
    ${validContext.moduleTitle ? `Module: "${validContext.moduleTitle}"` : ''}
    ${validContext.elementType ? `Element Type: "${validContext.elementType}"` : ''}
    
    CURRENT CONTENT:
    ${validContext.currentContent}
    
    INSTRUCTIONS:
    1. Generate exactly 2 alternative versions
    2. Maintain the exact same type (${validContext.contentType}) and format as the input
    3. Keep the same approximate length (±10% maximum deviation)
    4. For markdown: preserve all formatting, lists, code blocks, and special syntax
    5. For titles: maintain concise, descriptive format
    6. For descriptions: keep the same professional tone and structure
    7. Focus only on improving the content while keeping the same objectives
    
    USER REQUEST: ${prompt}
    RETURN ONLY the modified content matching the exact type (${validContext.contentType}).
    Respond with Version 1: and Version 2: followed by the content.`;

    try {
      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt }
        ],
        model: "mixtral-8x7b-32768",
        temperature: 0.7,
        max_tokens: 4000,
        top_p: 1,
        stream: false,
      });

      const response = completion.choices[0]?.message?.content || "";
      
      // Split response into versions
      const suggestions = response
        .split(/Version \d:/)
        .slice(1)
        .map(text => text.trim())
        .filter(text => text.length > 0)
        .map((content, index) => createSuggestion(
          content,
          index + 1,
          validContext.contentType
        ));

      // Add original as third option if needed
      if (suggestions.length < 2) {
        suggestions.push(
          createSuggestion(
            validContext.currentContent,
            suggestions.length + 1,
            validContext.contentType,
            "Original content"
          )
        );
      }

      return suggestions;

    } catch (error: any) {
      if (error?.response?.status === 503) {
        if (retryCount < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return generateSuggestions(prompt, context, retryCount + 1);
        }
        
        return [
          createSuggestion(validContext.currentContent, 1, validContext.contentType, "Original content (AI service unavailable)"),
          createSuggestion(
            validContext.currentContent,
            2,
            validContext.contentType,
            "Please try again later - AI service is temporarily unavailable"
          )
        ];
      }
      throw error;
    }

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AISuggestionError(
        `Invalid input: ${error.message}`,
        'VALIDATION_ERROR',
        false
      );
    }

    if (error instanceof AISuggestionError) {
      throw error;
    }

    console.error('AI suggestion error:', error);
    throw new AISuggestionError(
      'Failed to generate suggestions. Please try again later.',
      'UNKNOWN_ERROR',
      true
    );
  }
};

export type { AISuggestionError };