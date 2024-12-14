import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
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

    const course = await prisma.course.findUnique({
      where: { id: (await params).courseId },
      include: {
        modules: {
          orderBy: { order: 'asc' }
        },
        author: {
          select: {
            id: true,
            username: true,
          }
        },
        enrollments: true,
        _count: {
          select: {
            enrollments: true,
            forks: true,
          }
        }
      }
    });

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // Get user's progress if enrolled
    const enrollment = await prisma.enrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: (await params).courseId
        }
      }
    });

    return NextResponse.json({
      ...course,
      enrollments: course._count.enrollments,
      forks: course._count.forks,
      progress: enrollment?.progress || 0
    });
  } catch (error) {
    console.error("Failed to fetch course:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("token");

    if (!token?.value) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = token.value;
    const courseId = (await params).courseId;

    // Verify course exists and user owns it
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { 
        id: true,
        authorId: true,
        modules: true,
        enrollments: true,
        CourseMessage: true,
        forks: true,
        forkedFrom: true
      }
    });

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    if (course.authorId !== userId) {
      return NextResponse.json(
        { error: "You are not authorized to delete this course" },
        { status: 403 }
      );
    }

    // Delete all related data in the correct order to handle foreign key constraints
    await prisma.$transaction(async (tx) => {
      // Delete course messages first
      if (course.CourseMessage.length > 0) {
        await tx.courseMessage.deleteMany({
          where: { courseId: course.id }
        });
      }

      // Delete enrollments
      if (course.enrollments.length > 0) {
        await tx.enrollment.deleteMany({
          where: { courseId: course.id }
        });
      }

      // Handle course forks
      if (course.forks.length > 0) {
        await tx.courseFork.deleteMany({
          where: { originalCourseId: course.id }
        });
      }

      if (course.forkedFrom.length > 0) {
        await tx.courseFork.deleteMany({
          where: { forkedCourseId: course.id }
        });
      }

      // Delete modules
      if (course.modules.length > 0) {
        await tx.module.deleteMany({
          where: { courseId: course.id }
        });
      }

      // Finally delete the course itself
      await tx.course.delete({
        where: { id: course.id }
      });
    });

    return NextResponse.json(
      { message: "Course deleted successfully" },
      { status: 200 }
    );
  } catch (error) {
    console.error("[COURSE_DELETE]", error);
    return NextResponse.json(
      { error: "An error occurred while deleting the course" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  try {
    const cookieStore = cookies();
    const userId = (await cookieStore).get("token")?.value;
    const courseId = (await params).courseId;
  
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { authorId: true }
    });

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    if (course.authorId !== userId) {
      return NextResponse.json(
        { error: "Forbidden - only the course author can modify this course" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const allowedFields = [
      'title',
      'description',
      'status',
      'marketRelevance',
      'trendAlignment',
      'keyTakeaways',
      'prerequisites',
      'estimatedHours'
    ];

    // Filter out any fields that aren't in the allowedFields list
    const updateData = Object.keys(body).reduce((acc, key) => {
      if (allowedFields.includes(key)) {
        acc[key] = body[key];
      }
      return acc;
    }, {} as Record<string, any>);

    // Validate required fields if they're being updated
    if (updateData.title && typeof updateData.title !== 'string') {
      return NextResponse.json(
        { error: "Title must be a string" },
        { status: 400 }
      );
    }

    if (updateData.status && !['DRAFT', 'PUBLISHED', 'ARCHIVED'].includes(updateData.status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    if (updateData.marketRelevance && (
      typeof updateData.marketRelevance !== 'number' ||
      updateData.marketRelevance < 0 ||
      updateData.marketRelevance > 1
    )) {
      return NextResponse.json(
        { error: "Market relevance must be a number between 0 and 1" },
        { status: 400 }
      );
    }

    // Update the course
    const updatedCourse = await prisma.course.update({
      where: { id: courseId },
      data: updateData,
      include: {
        modules: {
          orderBy: { order: 'asc' }
        },
        author: {
          select: {
            id: true,
            username: true,
          }
        },
        _count: {
          select: {
            enrollments: true,
            forks: true,
          }
        }
      }
    });

    return NextResponse.json({
      ...updatedCourse,
      enrollments: updatedCourse._count.enrollments,
      forks: updatedCourse._count.forks,
    });
  } catch (error) {
    console.error("[COURSE_PATCH]", error);
    return NextResponse.json(
      { error: "Failed to update course" },
      { status: 500 }
    );
  }
}