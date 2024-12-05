"use server";

import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const prisma = new PrismaClient();

const OnboardingFormSchema = z.object({
  expertiseLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"]),
  weeklyHours: z.number().min(1).max(168),
  primaryLanguage: z.string().min(2),
  teachingGoals: z.array(z.string()),
  interests: z.array(z.object({
    name: z.string(),
    category: z.string(),
    confidence: z.number(),
    keywords: z.array(z.string())
  }))
});

export type OnboardingFormData = z.infer<typeof OnboardingFormSchema>;

export async function completeOnboarding(
  userId: string,
  formData: OnboardingFormData
) {
  try {
    // Validate the form data
    const validatedData = OnboardingFormSchema.parse(formData);

    // Start a transaction to ensure all updates happen together
    await prisma.$transaction(async (tx) => {
      // Update user profile
      await tx.user.update({
        where: { id: userId },
        data: {
          onboardingCompleted: true,
          expertiseLevel: validatedData.expertiseLevel,
          weeklyHours: validatedData.weeklyHours,
          primaryLanguage: validatedData.primaryLanguage,
          teachingGoals: validatedData.teachingGoals,
        },
      });

      // Clear existing interests and create new ones
      await tx.interest.deleteMany({
        where: { users: { some: { id: userId } } },
      });

      // Create new interests and connect them to the user
      for (const interest of validatedData.interests) {
        await tx.interest.create({
          data: {
            name: interest.name,
            category: interest.category,
            confidence: interest.confidence,
            keywords: interest.keywords,
            users: {
              connect: { id: userId }
            }
          },
        });
      }
    });

    // Revalidate the cache for user-related pages
    revalidatePath('/dashboard');
    revalidatePath('/profile');

    return { success: true };
  } catch (error) {
    console.error("Error completing onboarding:", error);
    throw error instanceof Error 
      ? error 
      : new Error("Failed to complete onboarding");
  }
}

// Helper function to check onboarding status
export async function checkOnboardingStatus(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { onboardingCompleted: true }
    });
    
    return user?.onboardingCompleted ?? false;
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    return false;
  }
}

// Middleware to enforce onboarding completion
export async function enforceOnboarding(userId: string) {
  const isOnboardingCompleted = await checkOnboardingStatus(userId);
  
  if (!isOnboardingCompleted) {
    redirect('/onboarding');
  }
}

// Function to get user's current onboarding data
export async function getCurrentOnboardingData(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        interests: {
          select: {
            name: true,
            category: true,
            confidence: true,
            keywords: true
          }
        }
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    return {
      expertiseLevel: user.expertiseLevel,
      weeklyHours: user.weeklyHours ?? 5, // Default to 5 hours if not set
      primaryLanguage: user.primaryLanguage ?? "English",
      teachingGoals: user.teachingGoals ?? [],
      interests: user.interests
    };
  } catch (error) {
    console.error("Error fetching current onboarding data:", error);
    throw error instanceof Error 
      ? error 
      : new Error("Failed to fetch onboarding data");
  }
}