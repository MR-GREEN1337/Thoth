import prisma from "@/lib/prisma";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";

// Define strict types
type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
type SortOption = "popular" | "recent" | "trending" | "relevant";

interface TransformedCourse {
  id: string;
  title: string;
  description: string;
  status: CourseStatus;
  estimatedHours: number;
  marketRelevance: number;
  trendAlignment: number;
  createdAt: Date;
  updatedAt: Date;
  keyTakeaways: string[];
  prerequisites: string[];
  authorId: string;
  author: {
    id: string;
    name: string;
  };
  enrollmentCount: number;
  moduleCount: number;
  forkCount: number;
}

interface ApiResponse {
  courses: TransformedCourse[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasMore: boolean;
  };
}

// Input validation schema
const QueryParamsSchema = z.object({
  query: z.string().optional(),
  page: z.number().int().positive().default(1),
  limit: z.number().int().min(1).max(100).default(20),
  sort: z.enum(["popular", "recent", "trending", "relevant"]).default("popular")
});

// Custom error class
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

export async function GET(req: Request): Promise<NextResponse<ApiResponse>> {
  try {
    // Authenticate user
    const cookieStore = await cookies();
    const userId = cookieStore.get("token")?.value;

    if (!userId) {
      throw new APIError("Unauthorized", 401, "UNAUTHORIZED");
    }

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const validatedParams = QueryParamsSchema.parse({
      query: searchParams.get("query") || undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
      sort: searchParams.get("sort") || "popular"
    });

    const { query, page, limit, sort } = validatedParams;
    const skip = (page - 1) * limit;

    // Build the where clause
    const whereClause: Prisma.CourseWhereInput = {
      status: "PUBLISHED",
      ...(query && {
        OR: [
          { title: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
        ],
      }),
    };

    // Build the order by clause
    const orderBy: Prisma.CourseOrderByWithRelationInput[] = (() => {
      switch (sort) {
        case "popular":
          return [{ enrollments: { _count: "desc" } }];
        case "recent":
          return [{ createdAt: "desc" }];
        case "trending":
          return [{ trendAlignment: "desc" }];
        default:
          return [{ marketRelevance: "desc" }];
      }
    })();

    // Execute database queries in parallel
    const [courses, total] = await Promise.all([
      prisma.course.findMany({
        where: whereClause,
        include: {
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
        orderBy,
        skip,
        take: limit,
      }),
      prisma.course.count({ where: whereClause }),
    ]);

    // Transform the data with type safety
    const transformedCourses: TransformedCourse[] = courses.map(course => ({
      id: course.id,
      title: course.title,
      description: course.description,
      status: course.status as CourseStatus,
      estimatedHours: course.estimatedHours ?? 0,
      marketRelevance: course.marketRelevance ?? 0,
      trendAlignment: course.trendAlignment ?? 0,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      keyTakeaways: course.keyTakeaways ?? [],
      prerequisites: course.prerequisites ?? [],
      authorId: course.authorId,
      author: {
        id: course.author.id,
        name: course.author.username,
      },
      enrollmentCount: course._count.enrollments,
      moduleCount: course._count.modules,
      forkCount: course._count.forks,
    }));

    // Build and return the response
    const response: ApiResponse = {
      courses: transformedCourses,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + courses.length < total,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("[COURSES_PUBLISHED_SEARCH]", error);

    if (error instanceof APIError) {
      return new NextResponse(error.message, { status: error.status });
    }

    if (error instanceof z.ZodError) {
      return new NextResponse("Invalid request parameters", { status: 400 });
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return new NextResponse("Database error", { status: 500 });
    }

    return new NextResponse("Internal server error", { status: 500 });
  }
}