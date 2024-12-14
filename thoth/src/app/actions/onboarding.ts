"use server";

import { PrismaClient, Prisma } from "@prisma/client";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

// Initialize Prisma with error handling
const prismaClientSingleton = () => {
  return new PrismaClient({
    errorFormat: 'minimal',
    log: ['error', 'warn'],
  });
};

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Custom error types
class OnboardingError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number = 500,
    public details?: unknown
  ) {
    super(message);
    this.name = 'OnboardingError';
  }
}

// Constants
const DEFAULT_WEEKLY_HOURS = 5;
const DEFAULT_LANGUAGE = "English";
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Validation schemas with custom error messages
const InterestSchema = z.object({
  name: z.string().min(2, "Interest name must be at least 2 characters"),
  category: z.string().min(2, "Category must be at least 2 characters"),
  confidence: z.number().min(0).max(100, "Confidence must be between 0 and 100"),
  keywords: z.array(z.string()).min(1, "At least one keyword is required")
});

const OnboardingFormSchema = z.object({
  expertiseLevel: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED", "EXPERT"], {
    errorMap: () => ({ message: "Invalid expertise level" })
  }),
  weeklyHours: z.number().min(1).max(168, "Weekly hours must be between 1 and 168"),
  primaryLanguage: z.string().min(2, "Language must be at least 2 characters"),
  teachingGoals: z.array(z.string()).min(1, "At least one teaching goal is required"),
  interests: z.array(InterestSchema).min(1, "At least one interest is required")
});

export type OnboardingFormData = z.infer<typeof OnboardingFormSchema>;

// Utility function for retry logic
async function withRetry<T>(
  operation: () => Promise<T>,
  retries = MAX_RETRIES
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (attempt + 1)));
      }
    }
  }

  throw lastError;
}

export async function completeOnboarding(
  userId: string,
  formData: OnboardingFormData
): Promise<{ success: boolean; message?: string }> {
  if (!userId) {
    throw new OnboardingError(
      "User ID is required",
      "INVALID_USER_ID",
      400
    );
  }

  try {
    // Validate the form data
    const validatedData = await OnboardingFormSchema.parseAsync(formData);

    // Use retry logic for the transaction
    await withRetry(async () => {
      await prisma.$transaction(async (tx) => {
        // Check if user exists first
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (!user) {
          throw new OnboardingError(
            "User not found",
            "USER_NOT_FOUND",
            404
          );
        }

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

        // Clear existing interests with error handling
        await tx.interest.deleteMany({
          where: { users: { some: { id: userId } } },
        });

        // Create new interests in batch
        await tx.interest.createMany({
          data: validatedData.interests.map(interest => ({
            ...interest,
            userId: userId
          }))
        });
      }, {
        maxWait: 5000, // 5 seconds
        timeout: 10000 // 10 seconds
      });
    });

    // Revalidate the cache for user-related pages
    revalidatePath('/dashboard');
    revalidatePath('/profile');

    return { 
      success: true,
      message: "Onboarding completed successfully" 
    };

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new OnboardingError(
        "Invalid form data",
        "VALIDATION_ERROR",
        400,
        error.errors
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new OnboardingError(
        "Database error",
        error.code,
        500,
        error
      );
    }

    if (error instanceof OnboardingError) {
      throw error;
    }

    throw new OnboardingError(
      "Failed to complete onboarding",
      "UNKNOWN_ERROR",
      500,
      error
    );
  }
}

export async function checkOnboardingStatus(
  userId: string
): Promise<boolean> {
  if (!userId) {
    throw new OnboardingError(
      "User ID is required",
      "INVALID_USER_ID",
      400
    );
  }

  try {
    const user = await withRetry(async () => {
      return await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompleted: true }
      });
    });

    return user?.onboardingCompleted ?? false;
  } catch (error) {
    console.error("Error checking onboarding status:", error);
    // Don't throw here - return false as a safe default
    return false;
  }
}

export async function enforceOnboarding(userId: string): Promise<void> {
  if (!userId) {
    redirect('/auth/login');
  }

  const isOnboardingCompleted = await checkOnboardingStatus(userId);

  if (!isOnboardingCompleted) {
    redirect('/onboarding');
  }
}

export async function getCurrentOnboardingData(
  userId: string
): Promise<OnboardingFormData> {
  if (!userId) {
    throw new OnboardingError(
      "User ID is required",
      "INVALID_USER_ID",
      400
    );
  }

  try {
    const user = await withRetry(async () => {
      return await prisma.user.findUnique({
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
    });

    if (!user) {
      throw new OnboardingError(
        "User not found",
        "USER_NOT_FOUND",
        404
      );
    }

    return {
      expertiseLevel: user.expertiseLevel ?? "BEGINNER",
      weeklyHours: user.weeklyHours ?? DEFAULT_WEEKLY_HOURS,
      primaryLanguage: user.primaryLanguage ?? DEFAULT_LANGUAGE,
      teachingGoals: user.teachingGoals ?? [],
      interests: user.interests ?? []
    };
  } catch (error) {
    if (error instanceof OnboardingError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      throw new OnboardingError(
        "Database error",
        error.code,
        500,
        error
      );
    }

    throw new OnboardingError(
      "Failed to fetch onboarding data",
      "UNKNOWN_ERROR",
      500,
      error
    );
  }
}