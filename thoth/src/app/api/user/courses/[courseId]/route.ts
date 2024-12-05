import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
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
      where: { id: params.courseId },
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
          courseId: params.courseId
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