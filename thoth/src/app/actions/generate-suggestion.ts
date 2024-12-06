"use server";
import { Groq } from "groq-sdk";

export interface AiSuggestContext {
  courseTitle: string;
  courseDescription: string;
  currentContent: string;
  moduleTitle?: string;
}

const initializeGroq = async () => {
  const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY || process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.warn('GROQ API key is not configured');
    return null;
  }
  return new Groq({ apiKey });
};

export const generateSuggestions = async (prompt: string, context: AiSuggestContext) => {
  try {
    const groq = await initializeGroq();
    console.log(groq);
    if (!groq) {
      throw new Error('AI suggestions are not available - missing API key');
    }

    const systemPrompt = `You are an AI writing assistant helping to improve educational course content. 
    The current context is:
    - Course: "${context.courseTitle}"
    - Course Description: "${context.courseDescription}"
    ${context.moduleTitle ? `- Module: "${context.moduleTitle}"` : ""}
    
    The current content is:
    ${context.currentContent}
    
    Please provide two alternative versions of the content based on the user's request. 
    Provide only change to the current content, don't add anything, keep same format and more or less the length
    Focus on maintaining educational value while incorporating the requested changes.
    Provide only change to the current content
    `;

    const userPrompt = `Please improve this content with the following guidance: ${prompt}`;

    const completion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 4000,
      top_p: 1,
      stream: false,
    });

    const response = completion.choices[0]?.message?.content || "";

    const suggestions = response
      .split(/(?=# Version \d|# Alternative \d|# Suggestion \d|# Option \d)/)
      .filter(Boolean)
      .map((suggestion) => suggestion.trim())
      .slice(0, 2);

    if (suggestions.length < 2) {
      return [
        suggestions[0] || "# Version 1\n\nNo suggestion generated.",
        "# Version 2\n\nNo alternative suggestion generated.",
      ];
    }

    return suggestions;
  } catch (error) {
    console.error("Error generating AI suggestions:", error);
    throw error;
  }
};