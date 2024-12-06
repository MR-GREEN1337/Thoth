import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;

    if (!userId) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const sort = searchParams.get("sort") || "popular"; 

    const skip = (page - 1) * limit;

    // Build the base where clause
    const where = {
      status: "PUBLISHED",
      ...(query && {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      }),
    };

    // Build the orderBy based on sort parameter
    let orderBy = [];
    switch (sort) {
      case "popular":
        orderBy.push({ enrollments: { _count: "desc" } });
        break;
      case "recent":
        orderBy.push({ createdAt: "desc" });
        break;
      case "trending":
        orderBy.push({ trendAlignment: "desc" });
        break;
      default:
        orderBy.push({ marketRelevance: "desc" });
    }

    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where: {
          status: "PUBLISHED",
          ...(query && {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
            ],
          }),
        },
        include: {
          author: {
            select: {
              id: true,
              username: true,
            },
          },
          enrollments: true,
          modules: true,
          forks: true,
          _count: {
            select: {
              enrollments: true,
              modules: true,
              forks: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.course.count({ where: { // Use same where clause as findMany
          status: "PUBLISHED",
          ...(query && {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
            ],
          }),
      } }),
    ]);

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
        name: course.author.username,
      },
      enrollmentCount: course._count.enrollments,
      moduleCount: course._count.modules,
      forkCount: course._count.forks,
    }));

    return NextResponse.json({
      courses: transformedCourses,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + courses.length < total,
      },
    });
  } catch (error) {
    console.error("[COURSES_PUBLISHED_SEARCH]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}