// app/api/user/courses/[courseid]/fork/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { courseid: string } }
) {
  try {
    const cookieStore = cookies();
    const userId = (await cookieStore).get("token")?.value;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the original course with all necessary relations
    const originalCourse = await prisma.course.findUnique({
      where: { 
        id: params.courseid 
      },
      include: {
        modules: true,
        interests: true,
        marketTrend: true,
      }
    });

    if (!originalCourse) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // Check if user already has a fork of this course
    const existingFork = await prisma.course.findFirst({
      where: {
        authorId: userId,
        forks: {
          some: {
            originalCourseId: params.courseid
          }
        }
      }
    });

    if (existingFork) {
      return NextResponse.json(
        { error: "You already have a fork of this course" },
        { status: 400 }
      );
    }

    // Create new course as a fork
    const forkedCourse = await prisma.course.create({
      data: {
        title: `${originalCourse.title} (Fork)`,
        description: originalCourse.description,
        status: "DRAFT", // Always start as draft
        marketRelevance: originalCourse.marketRelevance,
        trendAlignment: originalCourse.trendAlignment,
        keyTakeaways: originalCourse.keyTakeaways,
        prerequisites: originalCourse.prerequisites,
        estimatedHours: originalCourse.estimatedHours,
        authorId: userId,

        // Recreate modules
        modules: {
          create: originalCourse.modules.map((module) => ({
            title: module.title,
            content: module.content,
            order: module.order,
            duration: module.duration,
            aiGenerated: module.aiGenerated,
            aiPrompt: module.aiPrompt,
          })),
        },

        // Connect same interests
        interests: {
          connect: originalCourse.interests.map((interest) => ({
            id: interest.id,
          })),
        },

        // Connect same market trend if exists
        marketTrend: originalCourse.marketTrend 
          ? {
              connect: {
                id: originalCourse.marketTrendId!
              }
            }
          : undefined,
      },
    });

    // Create fork relationship record
    await prisma.courseFork.create({
      data: {
        originalCourseId: params.courseid,
        forkedCourseId: forkedCourse.id,
        forkerId: userId,
      },
    });

    // Return complete forked course with relations
    const completeFork = await prisma.course.findUnique({
      where: { id: forkedCourse.id },
      include: {
        modules: {
          orderBy: {
            order: 'asc'
          }
        },
        author: {
          select: {
            id: true,
            username: true,
          }
        },
        forks: true,
        _count: {
          select: {
            enrollments: true,
            forks: true
          }
        }
      }
    });

    return NextResponse.json(completeFork);
  } catch (error) {
    console.error("Failed to fork course:", error);
    return NextResponse.json(
      { error: "Failed to fork course" },
      { status: 500 }
    );
  }
}