import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function PATCH(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  try {
    const body = await req.json();
    const { status } = body;
    const courseId = (await params).courseId;

    const updatedCourse = await prisma.course.update({
      where: {
        id: courseId,
      },
      data: {
        status: status,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updatedCourse);
  } catch (error) {
    console.error('Failed to update course status:', error);
    return NextResponse.json(
      { message: 'Failed to update course status' },
      { status: 500 }
    );
  }
}