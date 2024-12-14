import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { MarketDemand, ExpertiseLevel } from "@prisma/client";
import { cookies } from "next/headers";

// Custom error class for better error handling
class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Define the schemas
const InterestSchema = z.object({
  name: z.string().min(1, "Interest name is required"),
  category: z.string().min(1, "Category is required"),
  marketDemand: z.enum(["High", "Medium", "Low"]).transform(val => {
    const mapping = {
      "High": "HIGH",
      "Medium": "MEDIUM",
      "Low": "LOW"
    } as const;
    return mapping[val] as MarketDemand;
  }),
  trendingTopics: z.array(z.string()).default([]),
  description: z.string().optional()
});

const MarketInsightsSchema = z.object({
  trends: z.array(z.string().min(1, "Trend cannot be empty")),
  opportunities: z.array(z.string().min(1, "Opportunity cannot be empty"))
});

const LearningPathSchema = z.object({
  fundamentals: z.array(z.string().min(1)),
  intermediate: z.array(z.string().min(1)),
  advanced: z.array(z.string().min(1)),
  estimatedTimeMonths: z.number().positive("Estimated time must be positive")
});

const AnalysisSchema = z.object({
  interests: z.array(InterestSchema).min(1, "At least one interest is required"),
  expertiseLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  suggestedWeeklyHours: z.number().positive("Weekly hours must be positive"),
  marketInsights: MarketInsightsSchema,
  learningPath: LearningPathSchema
});

const SavePreferencesSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
  preferences: z.string().min(1, "Preferences are required"),
  analysis: z.object({
    analysis: AnalysisSchema
  })
});

// Type for the successful response
interface SuccessResponse {
  success: true;
  user: any; // Replace with proper user type from your Prisma schema
}

// Type for the error response
interface ErrorResponse {
  error: string;
  details?: unknown;
  message?: string;
}

export async function POST(
  req: Request
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  try {
    // Verify authentication
    const cookieStore = await cookies();
    const token = cookieStore.get("token");

    if (!token?.value) {
      throw new APIError(
        "Unauthorized",
        401,
        "UNAUTHORIZED"
      );
    }

    // Parse and validate request body
    const body = await req.json().catch(() => {
      throw new APIError(
        "Invalid JSON",
        400,
        "INVALID_JSON"
      );
    });

    console.log('Received body:', JSON.stringify(body, null, 2));

    const validationResult = SavePreferencesSchema.safeParse(body);
    
    if (!validationResult.success) {
      throw new APIError(
        "Validation failed",
        400,
        "VALIDATION_ERROR",
        validationResult.error.errors
      );
    }

    const { userId, preferences, analysis } = validationResult.data;

    // Verify user matches token
    if (userId !== token.value) {
      throw new APIError(
        "Unauthorized",
        401,
        "USER_MISMATCH"
      );
    }

    // Start transaction with retry logic
    const user = await prisma.$transaction(async (tx) => {
      // Verify user exists
      const existingUser = await tx.user.findUnique({
        where: { id: userId }
      });

      if (!existingUser) {
        throw new APIError(
          "User not found",
          404,
          "USER_NOT_FOUND"
        );
      }

      // Delete existing relations
      await tx.interest.deleteMany({
        where: { userId }
      });
      
      await tx.marketInsight.deleteMany({
        where: { userId }
      });

      // Update user with transformed data
      return tx.user.update({
        where: { id: userId },
        data: {
          rawPreferences: preferences,
          preferenceAnalysis: analysis,
          expertiseLevel: analysis.analysis.expertiseLevel,
          weeklyHours: analysis.analysis.suggestedWeeklyHours,
          interests: {
            create: analysis.analysis.interests.map(interest => ({
              name: interest.name,
              category: interest.category,
              marketDemand: interest.marketDemand,
              trendingTopics: interest.trendingTopics
            }))
          },
          marketInsights: {
            create: [
              ...analysis.analysis.marketInsights.trends.map(trend => ({
                type: "TREND" as const,
                content: trend
              })),
              ...analysis.analysis.marketInsights.opportunities.map(opportunity => ({
                type: "OPPORTUNITY" as const,
                content: opportunity
              }))
            ]
          }
        },
        include: {
          interests: true,
          marketInsights: true
        }
      });
    }, {
      maxWait: 5000, // 5 seconds
      timeout: 10000 // 10 seconds
    });

    return NextResponse.json({ 
      success: true, 
      user 
    });

  } catch (error) {
    console.error("Error saving preferences:", error);
    
    if (error instanceof APIError) {
      return NextResponse.json({
        error: error.code,
        details: error.details
      }, { status: error.status });
    }
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Validation error",
        details: error.errors
      }, { status: 400 });
    }

    if (error instanceof Error) {
      // Don't expose error stack in production
      const details = process.env.NODE_ENV === 'development' ? error.stack : undefined;
      
      return NextResponse.json({
        error: "Server error",
        message: error.message,
        details
      }, { status: 500 });
    }
    
    return NextResponse.json({
      error: "Unknown error occurred"
    }, { status: 500 });
  }
}