import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { CourseClient } from "./_components/courseClient";
import { redirect } from "next/navigation";
import { Metadata } from 'next';

async function getCourse(courseId: string) {
  const cookieStore = cookies();
  const userId = (await cookieStore).get("token")?.value;

  if (!userId) {
    redirect("/sign-in");
  }

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
  return {
    ...course,
    enrollments: course._count.enrollments,
    forks: course._count.forks,
    progress: course.enrollments[0]?.progress || 0,
    author: {
      id: course.author.id,
      name: course.author.username,
    }
  };
}

type PageProps = Promise<{courseId: string}>
export default async function CoursePage(props: { params: PageProps}) {
  const { courseId } = await props.params;
  const course = await getCourse(courseId);

  return <CourseClient initialCourse={course} />;
}