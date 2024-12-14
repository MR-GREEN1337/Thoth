import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";

export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;
    const courseId = (await params).courseId;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the original course with all necessary relations
    const originalCourse = await prisma.course.findUnique({
      where: { 
        id: courseId,
      },
      include: {
        modules: true,
        interests: true,
        marketTrend: true,
        forks: true,
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
            originalCourseId: courseId,
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

    // Use a transaction to ensure all operations complete together
    const result = await prisma.$transaction(async (tx) => {
      // Create new course as a fork
      const forkedCourse = await tx.course.create({
        data: {
          title: `${originalCourse.title} (Fork)`,
          description: originalCourse.description,
          status: "DRAFT" as const,
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
                  id: originalCourse.marketTrend.id
                }
              }
            : undefined,
        },
      });

      // Create fork relationship record
      await tx.courseFork.create({
        data: {
          originalCourseId: courseId,
          forkedCourseId: forkedCourse.id,
          forkerId: userId,
        },
      });

      // Return complete forked course with relations
      const completeFork = await tx.course.findUnique({
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

      // Update original course stats
      const updatedOriginalCourse = await tx.course.update({
        where: { id: courseId },
        data: {
          // Any additional stats you want to update can go here
        },
        include: {
          _count: {
            select: {
              forks: true
            }
          }
        }
      });

      return {
        forkedCourse: completeFork,
        originalCourseForkCount: updatedOriginalCourse._count.forks
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to fork course:", error);
    return NextResponse.json(
      { error: "Failed to fork course" },
      { status: 500 }
    );
  }
}