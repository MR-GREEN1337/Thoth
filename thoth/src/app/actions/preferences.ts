// app/actions/preferences.ts
import { Groq } from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export type PreferencesOutput = {
  isConcise: boolean;
  analysis?: {
    interests: Array<{
      name: string;
      category: string;
      marketDemand: "High" | "Medium" | "Low";
      trendingTopics: string[];
    }>;
    suggestedWeeklyHours: number;
    expertiseLevel: "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";
    recommendedStartingPoint: string;
    marketInsights: {
      trends: string[];
      opportunities: string[];
    };
  };
  message?: string;
  sourceUrls?: string[]; // Added source URLs array
};

export async function analyzePreferences(rawPreferences: string): Promise<PreferencesOutput> {
  const prompt = `Analyze these user preferences for an educational platform and determine if they're detailed enough:

"${rawPreferences}"

If the preferences are too vague or lack detail, return:
{
  "isConcise": false,
  "message": "[Explanation of what additional information is needed]"
}

If the preferences are detailed enough, analyze them and return:
{
  "isConcise": true,
  "analysis": {
    "interests": [
      {
        "name": "[Interest area]",
        "category": "[Category]",
        "marketDemand": "[High/Medium/Low]",
        "trendingTopics": ["[Related trending topics]"]
      }
    ],
    "suggestedWeeklyHours": [number],
    "expertiseLevel": "[BEGINNER/INTERMEDIATE/ADVANCED/EXPERT]",
    "recommendedStartingPoint": "[Suggestion for where to start]",
    "marketInsights": {
      "trends": ["[Current market trends]"],
      "opportunities": ["[Potential opportunities]"]
    }
  }
}`;

  const completion = await groq.chat.completions.create({
    messages: [{ role: "user", content: prompt }],
    model: "mixtral-8x7b-32768",
    temperature: 0.7,
    max_tokens: 1024,
  });

  return JSON.parse(completion.choices[0]?.message?.content || "{}");
}

// app/actions/preferences.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function getUserPreferences(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      interests: true,
      marketInsights: true,
    },
  });

  return {
    rawPreferences: user?.rawPreferences,
    expertiseLevel: user?.expertiseLevel,
    weeklyHours: user?.weeklyHours,
    interests: user?.interests,
    marketInsights: user?.marketInsights,
    fullAnalysis: user?.preferenceAnalysis,
  };
}

export async function clearUserPreferences(userId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.interest.deleteMany({
      where: { userId }
    });
    await tx.marketInsight.deleteMany({
      where: { userId }
    });
    await tx.user.update({
      where: { id: userId },
      data: {
        rawPreferences: null,
        preferenceAnalysis: null,
        expertiseLevel: null,
        weeklyHours: null,
      },
    });
  });
}