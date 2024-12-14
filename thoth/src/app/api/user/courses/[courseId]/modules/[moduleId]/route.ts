import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { cookies } from "next/headers";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { courseId: string; moduleId: string } }
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

    // Get course ownership
    const course = await prisma.course.findUnique({
      where: {
        id: (await params).courseId,
        authorId: userId,
      },
    });

    if (!course) {
      return new NextResponse("Course not found or unauthorized", { status: 404 });
    }

    // Parse the request body
    const body = await req.json();
    
    // Validate required fields
    if (!body.content && !body.title && !body.duration && body.order === undefined) {
      return new NextResponse("No valid update fields provided", { status: 400 });
    }

    // Update the module
    const updatedModule = await prisma.module.update({
      where: {
        id: (await params).moduleId,
        courseId: (await params).courseId,
      },
      data: {
        ...(body.title && { title: body.title }),
        ...(body.content && { content: body.content }),
        ...(body.duration && { duration: body.duration }),
        ...(body.order !== undefined && { order: body.order }),
        ...(body.interactiveElements && { 
          interactiveElements: body.interactiveElements 
        }),
        updatedAt: new Date(),
      },
    });

    // Update course's updatedAt timestamp
    await prisma.course.update({
      where: {
        id: (await params).courseId,
      },
      data: {
        updatedAt: new Date(),
      },
    });

    return NextResponse.json(updatedModule);
  } catch (error) {
    console.error("[MODULE_PATCH]", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}