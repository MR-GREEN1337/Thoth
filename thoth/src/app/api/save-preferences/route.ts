import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { MarketDemand, ExpertiseLevel } from "@prisma/client";

const InterestSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  marketDemand: z.enum(["High", "Medium", "Low"]).transform(val => {
    // Transform to match Prisma enum
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
  trends: z.array(z.string()),
  opportunities: z.array(z.string())
});

const LearningPathSchema = z.object({
  fundamentals: z.array(z.string()),
  intermediate: z.array(z.string()),
  advanced: z.array(z.string()),
  estimatedTimeMonths: z.number().positive()
});

const AnalysisSchema = z.object({
  interests: z.array(InterestSchema),
  expertiseLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  suggestedWeeklyHours: z.number().positive(),
  marketInsights: MarketInsightsSchema,
  learningPath: LearningPathSchema
});

const SavePreferencesSchema = z.object({
  userId: z.string().min(1),
  preferences: z.string().min(1),
  analysis: z.object({
    analysis: AnalysisSchema
  })
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('Received body:', JSON.stringify(body, null, 2));

    const validationResult = SavePreferencesSchema.safeParse(body);
    
    if (!validationResult.success) {
      console.error('Validation failed:', validationResult.error);
      return NextResponse.json({
        error: "Invalid data format",
        details: validationResult.error.errors
      }, { status: 400 });
    }

    const { userId, preferences, analysis } = validationResult.data;

    // Start transaction
    const user = await prisma.$transaction(async (tx) => {
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
              marketDemand: interest.marketDemand, // Now properly transformed
              trendingTopics: interest.trendingTopics
            }))
          },
          marketInsights: {
            create: [
              ...analysis.analysis.marketInsights.trends.map(trend => ({
                type: "TREND",
                content: trend
              })),
              ...analysis.analysis.marketInsights.opportunities.map(opportunity => ({
                type: "OPPORTUNITY",
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
    });

    return NextResponse.json({ success: true, user });
  } catch (error) {
    console.error("Error saving preferences:", error);
    
    if (error instanceof z.ZodError) {
      return NextResponse.json({
        error: "Validation error",
        details: error.errors
      }, { status: 400 });
    }

    if (error instanceof Error) {
      return NextResponse.json({
        error: "Server error",
        message: error.message,
        details: error.stack
      }, { status: 500 });
    }
    
    return NextResponse.json({
      error: "Unknown error occurred"
    }, { status: 500 });
  }
}