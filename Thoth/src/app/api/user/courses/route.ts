import { NextResponse } from "next/server";
import { cookies, headers } from "next/headers";
import prisma from "@/lib/prisma";

export async function GET() {
  try {
    const cookieStore = cookies();
    const userId = (await cookieStore).get("token")?.value;

    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const courses = await prisma.course.findMany({
      where: {
        authorId: userId,
      },
      include: {
        modules: {
          orderBy: {
            order: 'asc'
          },
          select: {
            id: true,
            title: true,
            duration: true,
            order: true,
          }
        },
        interests: {
          select: {
            id: true,
            name: true,
            category: true,
          }
        },
        enrollments: {
          where: {
            userId: userId
          },
          select: {
            progress: true,
            status: true,
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    // Transform the data to include progress information
    const transformedCourses = courses.map(course => ({
      ...course,
      progress: course.enrollments[0]?.progress ?? 0,
      enrollmentStatus: course.enrollments[0]?.status ?? null,
      totalDuration: course.modules.reduce((acc, module) => acc + module.duration, 0),
      moduleCount: course.modules.length,
      enrollments: undefined // Remove the enrollments array from the response
    }));

    return NextResponse.json({ courses: transformedCourses });
  } catch (error) {
    console.error("Error fetching user courses:", error);
    return NextResponse.json(
      { error: "Failed to fetch courses" },
      { status: 500 }
    );
  }
}