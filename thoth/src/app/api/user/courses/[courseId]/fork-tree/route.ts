import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import prisma from '@/lib/prisma';

interface ForkNode {
  id: string;
  title: string;
  description: string;
  authorName: string;
  children: ForkNode[];
}

async function buildForkTree(courseId: string, processedIds = new Set<string>()): Promise<ForkNode | null> {
  // Prevent infinite recursion
  if (processedIds.has(courseId)) {
    return null;
  }
  processedIds.add(courseId);

  try {
    // Fetch course with author and forks
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        author: {
          select: {
            username: true,
          },
        },
        forks: {
          include: {
            forkedCourse: {
              include: {
                author: {
                  select: {
                    username: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      return null;
    }

    // Process child forks recursively
    const children = await Promise.all(
      course.forks.map(async (fork) => {
        const childTree = await buildForkTree(fork.forkedCourseId, processedIds);
        return childTree;
      })
    );

    // Filter out null values and construct node
    return {
      id: course.id,
      title: course.title,
      description: course.description,
      authorName: course.author.username,
      children: children.filter((child): child is ForkNode => child !== null),
    };
  } catch (error) {
    console.error('Error building fork tree:', error);
    return null;
  }
}

export async function GET(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('token');

    if (!token) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const courseId = (await params).courseId;

    // First, check if this course is a fork of another course
    const courseFork = await prisma.courseFork.findFirst({
      where: { forkedCourseId: courseId },
      include: {
        originalCourse: {
          include: {
            author: {
              select: {
                username: true,
              },
            },
          },
        },
      },
    });

    // If it's a fork, start from the original course
    const rootCourseId = courseFork ? courseFork.originalCourseId : courseId;

    // Build the complete fork tree
    const forkTree = await buildForkTree(rootCourseId);

    if (!forkTree) {
      return NextResponse.json(
        { error: 'Failed to build fork tree' },
        { status: 404 }
      );
    }

    // Add metadata about the tree
    const treeMetadata = {
      tree: forkTree,
      metadata: {
        totalForks: countTotalForks(forkTree),
        depth: calculateTreeDepth(forkTree),
        generatedAt: new Date().toISOString(),
      },
    };

    return NextResponse.json(treeMetadata);
  } catch (error) {
    console.error('Error fetching fork tree:', error);
    return NextResponse.json(
      { error: 'Failed to fetch fork tree' },
      { status: 500 }
    );
  }
}

// Helper function to count total number of forks
function countTotalForks(node: ForkNode): number {
  let count = node.children.length;
  for (const child of node.children) {
    count += countTotalForks(child);
  }
  return count;
}

// Helper function to calculate tree depth
function calculateTreeDepth(node: ForkNode): number {
  if (node.children.length === 0) {
    return 0;
  }
  return 1 + Math.max(...node.children.map(calculateTreeDepth));
}