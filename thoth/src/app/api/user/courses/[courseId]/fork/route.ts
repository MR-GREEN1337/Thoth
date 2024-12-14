import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { Prisma } from "@prisma/client";

// Custom error class for better error handling
class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;
    const { courseId } = await params;

    if (!userId) {
      throw new APIError("Unauthorized", 401, "UNAUTHORIZED");
    }

    if (!courseId) {
      throw new APIError("Course ID is required", 400, "MISSING_COURSE_ID");
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
      throw new APIError("Course not found", 404, "COURSE_NOT_FOUND");
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
      throw new APIError(
        "You already have a fork of this course",
        400,
        "DUPLICATE_FORK"
      );
    }

    // Prepare create input with proper type handling
    const createInput: Prisma.CourseCreateInput = {
      title: `${originalCourse.title} (Fork)`,
      description: originalCourse.description,
      status: "DRAFT",
      marketRelevance: originalCourse.marketRelevance,
      trendAlignment: originalCourse.trendAlignment,
      keyTakeaways: originalCourse.keyTakeaways,
      prerequisites: originalCourse.prerequisites,
      estimatedHours: originalCourse.estimatedHours,
      author: {
        connect: { id: userId }
      },
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
      interests: {
        connect: originalCourse.interests.map((interest) => ({
          id: interest.id,
        })),
      },
      ...(originalCourse.marketTrend && {
        marketTrend: {
          connect: {
            id: originalCourse.marketTrend.id
          }
        }
      })
    };

    // Use a transaction to ensure all operations complete together
    const result = await prisma.$transaction(async (tx) => {
      // Create new course as a fork with type-safe input
      const forkedCourse = await tx.course.create({
        data: createInput,
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
      const completeFork = await tx.course.findUniqueOrThrow({
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
          // Any additional stats updates can go here
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
    }, {
      maxWait: 5000, // 5 seconds
      timeout: 10000 // 10 seconds
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error("Failed to fork course:", error);

    if (error instanceof APIError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        { error: "Database error", code: error.code },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Internal server error", code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}