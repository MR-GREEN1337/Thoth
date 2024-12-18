"use server"

import prisma from '@/lib/prisma';
import { initializeGroq } from './generate-suggestion';

export async function generateAIResponse(
  userMessage: string,
  courseId: string,
) {
  try {
    const groq = await initializeGroq();
    //console.log(groq);
    if (!groq) {
      throw new Error('AI suggestions are not available - missing API key');
    }
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        modules: {
          select: {
            title: true,
            content: true,
          },
        },
      },
    });

    if (!course) {
      throw new Error("Course not found");
    }

    const systemPrompt = `You are an intelligent course assistant helping students with the course "${course.title}". 
    Your role is to provide accurate, helpful responses related to the course material.
    
    Course description: ${course.description}
    
    Key course topics:
    ${course.modules.map((m: any) => `- ${m.title}`).join('\n')}
    
    Provide clear, concise answers that help students understand the course material better.`;

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userMessage
        }
      ],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 1024,
      top_p: 1,
      stream: false,
    });

    return completion.choices[0]?.message?.content || "I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error("Error generating AI response:", error);
    return "I apologize, but I encountered an error while processing your request. Please try again later.";
  }
}