import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const cookieStore = cookies();
    const token = (await cookieStore).get("token")?.value;

    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: token },
      select: {
        expertiseLevel: true,
        weeklyHours: true,
        preferenceAnalysis: true,
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
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      preferences: user,
      hasCompletedOnboarding: user.preferenceAnalysis !== null
    });
  } catch (error) {
    console.error("Error fetching user preferences:", error);
    return NextResponse.json(
      { error: "Failed to fetch preferences" },
      { status: 500 }
    );
  }
}