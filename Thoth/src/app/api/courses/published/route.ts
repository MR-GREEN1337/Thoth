import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const cookieStore = cookies();
    const userId = (await cookieStore).get("token")?.value;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        estimatedHours: true,
        marketRelevance: true,
        trendAlignment: true,
        createdAt: true,
        updatedAt: true,
        keyTakeaways: true,
        prerequisites: true,
        authorId: true,
        enrollments: {
          select: {
            id: true,
          },
        },
        modules: {
          select: {
            id: true,
          },
        },
        forks: {
          select: {
            id: true,
            forkedCourseId: true,
          },
        },
        author: {
          select: {
            id: true,
            username: true,
          },
        },
        _count: {
          select: {
            enrollments: true,
            modules: true,
            forks: true,
          },
        },
      },
      orderBy: [
        {
          marketRelevance: 'desc',
        },
        {
          createdAt: 'desc',
        }
      ],
      take: 50,
    });

    // Transform the data
    const transformedCourses = courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status,
      estimatedHours: course.estimatedHours,
      marketRelevance: course.marketRelevance,
      trendAlignment: course.trendAlignment,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      keyTakeaways: course.keyTakeaways,
      prerequisites: course.prerequisites,
      authorId: course.authorId,
      author: {
        id: course.author.id,
        name: course.author.username, // Changed from name to username
      },
      enrollmentCount: course._count.enrollments,
      moduleCount: course._count.modules,
      forkCount: course._count.forks,
    }));

    return NextResponse.json(transformedCourses);
  } catch (error) {
    console.error("[COURSES_PUBLISHED]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}