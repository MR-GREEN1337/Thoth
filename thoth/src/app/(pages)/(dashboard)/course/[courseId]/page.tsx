import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { CourseClient } from "./_components/courseClient";
import { redirect } from "next/navigation";
import { Metadata } from 'next';

// Define strict types for the course data
export type Author = {
  id: string;
  name: string;
};

export type CourseModule = {
  id: string;
  title: string;
  content: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
  courseId: string;
};

export type Course = {
  id: string;
  title: string;
  description: string;
  imageUrl: string | null;
  enrollments: number;
  forks: number;
  progress: number;
  author: Author;
  modules: CourseModule[];
  createdAt: Date;
  updatedAt: Date;
  trendId: string | null;
};

// Type guard to check if course exists and matches Course type
function isCourse(course: any): course is Course {
  return course !== null && 
         typeof course === 'object' &&
         typeof course.id === 'string' &&
         typeof course.title === 'string' &&
         Array.isArray(course.modules) &&
         typeof course.author === 'object' &&
         typeof course.author.id === 'string' &&
         typeof course.author.name === 'string';
}

async function getCourse(courseId: string): Promise<Course | null> {
  const cookieStore = await cookies();
  const userId = cookieStore.get("token")?.value;

  if (!userId) {
    redirect("/sign-in");
  }

  try {
    const course = await prisma.course.findUnique({
      where: {
        id: courseId,
      },
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
        enrollments: {
          where: {
            userId: userId
          },
          select: {
            progress: true,
            status: true
          }
        },
        _count: {
          select: {
            enrollments: true,
            forks: true
          }
        }
      }
    });

    if (!course) {
      return null;
    }

    // Transform the data for the client
    const transformedCourse = {
      ...course,
      enrollments: course._count.enrollments,
      forks: course._count.forks,
      progress: course.enrollments[0]?.progress || 0,
      author: {
        id: course.author.id,
        name: course.author.username,
      }
    };

    // Validate the transformed data
    if (!isCourse(transformedCourse)) {
      throw new Error('Invalid course data structure');
    }

    return transformedCourse;
  } catch (error) {
    console.error('Error fetching course:', error);
    return null;
  }
}

type PageParams = {
  courseId: string;
};

interface PageProps {
  params: PageParams;
}

export default async function CoursePage({ params }: PageProps) {
  const course = await getCourse(params.courseId);

  if (!course) {
    redirect("/courses"); // Redirect to courses page if course not found
  }

  return <CourseClient initialCourse={course as any} />;
}

// Add metadata generation if needed
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const course = await getCourse(params.courseId);
  
  if (!course) {
    return {
      title: 'Course Not Found',
      description: 'The requested course could not be found.'
    };
  }

  return {
    title: course.title,
    description: course.description
  };
}