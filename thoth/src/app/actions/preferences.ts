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

import { Prisma, PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { ExpertiseLevel } from "@/types/preferences";

const prisma = new PrismaClient();

export async function getUserPreferences() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      throw new Error("Unauthorized");
    }

    const user = await prisma.user.findUnique({
      where: { id: token },
      select: {
        expertiseLevel: true,
        weeklyHours: true,
        preferenceAnalysis: true,
        rawPreferences: true, // Add this to select raw preferences
        interests: {
          select: {
            id: true,
            name: true,
            category: true,
            marketDemand: true,
            trendingTopics: true,
          }
        },
        marketInsights: {
          select: {
            id: true,
            type: true,
            content: true,
          }
        }
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    // Transform the data to match PreferencesOutput type
    const preferences = {
      isConcise: true,
      analysis: {
        interests: user.interests.map(interest => ({
          name: interest.name,
          category: interest.category,
          marketDemand: interest.marketDemand as "High" | "Medium" | "Low",
          trendingTopics: interest.trendingTopics || [],
        })),
        suggestedWeeklyHours: user.weeklyHours || 0,
        expertiseLevel: user.expertiseLevel as "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT",
        recommendedStartingPoint: user.preferenceAnalysis?.recommendedStartingPoint || "",
        marketInsights: {
          trends: user.marketInsights
            .filter(insight => insight.type === "TREND")
            .map(insight => insight.content),
          opportunities: user.marketInsights
            .filter(insight => insight.type === "OPPORTUNITY")
            .map(insight => insight.content),
        }
      },
      // Include the full preference analysis
      preferenceAnalysis: user.preferenceAnalysis
    };

    return {
      preferences,
      hasCompletedOnboarding: user.preferenceAnalysis !== null
    };
  } catch (error) {
    console.error("Error fetching user preferences:", error);
    throw error;
  }
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
        preferenceAnalysis: Prisma.JsonNull,
        expertiseLevel: null as unknown as ExpertiseLevel,
        weeklyHours: 0,
      },
    });
  });
}