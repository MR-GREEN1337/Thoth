import { Groq } from "groq-sdk";
import { Prisma, PrismaClient } from "@prisma/client";
import { cookies } from "next/headers";
import { z } from "zod";

// Strict type definitions
export const ExpertiseLevelEnum = z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]);
export const MarketDemandEnum = z.enum(["High", "Medium", "Low"]);
export type ExpertiseLevel = z.infer<typeof ExpertiseLevelEnum>;
export type MarketDemand = z.infer<typeof MarketDemandEnum>;

// Zod schema for validation
const PreferencesOutputSchema = z.object({
  isConcise: z.boolean(),
  analysis: z.optional(z.object({
    interests: z.array(z.object({
      name: z.string(),
      category: z.string(),
      marketDemand: MarketDemandEnum,
      trendingTopics: z.array(z.string())
    })),
    suggestedWeeklyHours: z.number(),
    expertiseLevel: ExpertiseLevelEnum,
    recommendedStartingPoint: z.string(),
    marketInsights: z.object({
      trends: z.array(z.string()),
      opportunities: z.array(z.string())
    })
  })),
  message: z.string().optional(),
  sourceUrls: z.array(z.string()).optional()
});

export type PreferencesOutput = z.infer<typeof PreferencesOutputSchema>;

// Custom error types
class PreferencesError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'PreferencesError';
  }
}

// Initialize Prisma with singleton pattern
const prismaClientSingleton = () => {
  return new PrismaClient({
    errorFormat: 'minimal',
    log: ['error', 'warn'],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Initialize Groq with error handling
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY ?? (() => {
    throw new PreferencesError(
      'GROQ_API_KEY is not defined',
      'MISSING_API_KEY',
      500
    );
  })(),
});

export async function analyzePreferences(rawPreferences: string): Promise<PreferencesOutput> {
  if (!rawPreferences?.trim()) {
    throw new PreferencesError(
      'Raw preferences cannot be empty',
      'INVALID_INPUT',
      400
    );
  }

  try {
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

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new PreferencesError(
        'No response from Groq API',
        'EMPTY_RESPONSE',
        500
      );
    }

    const parsedResponse = JSON.parse(content);
    return PreferencesOutputSchema.parse(parsedResponse);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new PreferencesError(
        'Invalid API response format',
        'INVALID_RESPONSE',
        500,
        error.errors
      );
    }
    if (error instanceof SyntaxError) {
      throw new PreferencesError(
        'Failed to parse API response',
        'PARSE_ERROR',
        500,
        error
      );
    }
    throw error;
  }
}

type UserPreferencesResult = {
  preferences: PreferencesOutput & {
    preferenceAnalysis: Prisma.JsonValue | null;
  };
  hasCompletedOnboarding: boolean;
};

export async function getUserPreferences(): Promise<UserPreferencesResult> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token")?.value;

    if (!token) {
      throw new PreferencesError(
        "Unauthorized",
        "UNAUTHORIZED",
        401
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: token },
      select: {
        expertiseLevel: true,
        weeklyHours: true,
        preferenceAnalysis: true,
        rawPreferences: true,
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
      throw new PreferencesError(
        "User not found",
        "NOT_FOUND",
        404
      );
    }

    const preferences: PreferencesOutput & { preferenceAnalysis: Prisma.JsonValue | null } = {
      isConcise: true,
      analysis: {
        interests: user.interests.map(interest => ({
          name: interest.name,
          category: interest.category,
          marketDemand: interest.marketDemand as MarketDemand,
          trendingTopics: interest.trendingTopics ?? [],
        })),
        suggestedWeeklyHours: user.weeklyHours ?? 0,
        expertiseLevel: (user.expertiseLevel ?? "BEGINNER") as ExpertiseLevel,
        recommendedStartingPoint: (user.preferenceAnalysis as any)?.recommendedStartingPoint ?? "",
        marketInsights: {
          trends: user.marketInsights
            .filter(insight => insight.type === "TREND")
            .map(insight => insight.content),
          opportunities: user.marketInsights
            .filter(insight => insight.type === "OPPORTUNITY")
            .map(insight => insight.content),
        }
      },
      preferenceAnalysis: user.preferenceAnalysis
    };

    return {
      preferences,
      hasCompletedOnboarding: user.preferenceAnalysis !== null
    };

  } catch (error) {
    if (error instanceof PreferencesError) {
      throw error;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new PreferencesError(
        "Database error",
        error.code,
        500,
        error
      );
    }
    throw new PreferencesError(
      "Failed to fetch user preferences",
      "UNKNOWN_ERROR",
      500,
      error
    );
  }
}

export async function clearUserPreferences(userId: string): Promise<void> {
  if (!userId) {
    throw new PreferencesError(
      "User ID is required",
      "INVALID_INPUT",
      400
    );
  }

  try {
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
          expertiseLevel: null,
          weeklyHours: 0,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new PreferencesError(
        "Database error",
        error.code,
        500,
        error
      );
    }
    throw new PreferencesError(
      "Failed to clear user preferences",
      "UNKNOWN_ERROR",
      500,
      error
    );
  }
}