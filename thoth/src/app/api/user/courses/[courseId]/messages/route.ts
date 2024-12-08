import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import { generateAIResponse } from '@/app/actions/generate-ai-response';

export async function GET(
  request: Request,
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

    const messages = await prisma.courseMessage.findMany({
      where: {
        courseId: (await params).courseId,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json(messages);
  } catch (error) {
    console.error("[MESSAGES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function POST(
  request: Request,
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

    const body = await request.json();
    const { content, withAI = true } = body;

    if (!content) {
      return new NextResponse("Content is required", { status: 400 });
    }

    // Create user message
    const userMessage = await prisma.courseMessage.create({
      data: {
        content,
        courseId: (await params).courseId,
        userId: userId,
        isAI: false,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
          },
        },
      },
    });

    // Only generate AI response if withAI is true
    if (withAI) {
      const aiResponse = await generateAIResponse(content, (await params).courseId);
      
      const aiMessage = await prisma.courseMessage.create({
        data: {
          content: aiResponse,
          courseId: (await params).courseId,
          userId: userId,
          isAI: true,
        },
        include: {
          user: {
            select: {
              id: true,
              username: true,
            },
          },
        },
      });

      return NextResponse.json([userMessage, aiMessage]);
    }

    // Return only user message for community posts
    return NextResponse.json([userMessage]);
  } catch (error) {
    console.error("[MESSAGES_POST]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}