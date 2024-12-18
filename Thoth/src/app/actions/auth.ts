"use server";

import { ExpertiseLevel, PrismaClient } from "@prisma/client";
import { hash, compare } from "bcryptjs";
import { z } from "zod";

const prisma = new PrismaClient();

// Validation schemas
const signUpSchema = z.object({
  username: z.string().min(3).max(30),
  password: z.string().min(6),
  rawPreferences: z.string().optional(),
});

const signInSchema = z.object({
  username: z.string(),
  password: z.string(),
});

// Function to analyze user preferences and generate interests
async function analyzePreferences(rawPreferences: string) {
  // This would integrate with your AI service
  // For now, returning a simple structure
  return {
    interests: [
      {
        name: "Web Development",
        category: "Technology",
        confidence: 0.9,
        keywords: ["JavaScript", "React", "Web Design"],
      },
    ],
    expertiseLevel: "BEGINNER",
  };
}

export async function signUp(formData: FormData) {
  const parsed = signUpSchema.parse({
    username: formData.get("username"),
    password: formData.get("password"),
    rawPreferences: formData.get("rawPreferences"),
  });

  try {
    // Check if user exists
    const existingUser = await prisma.user.findUnique({
      where: { username: parsed.username },
    });

    if (existingUser) {
      throw new Error("Username already taken");
    }

    // Hash password
    const hashedPassword = await hash(parsed.password, 12);

    // Analyze preferences if provided
    let interests: {
      name: string;
      category: string;
      confidence: number;
      keywords: string[];
    }[] = [];
    let expertiseLevel = "BEGINNER";

    if (parsed.rawPreferences) {
      const analysis = await analyzePreferences(parsed.rawPreferences);
      interests = analysis.interests;
      expertiseLevel = analysis.expertiseLevel;
    }

    // Create user with interests
    const user = await prisma.user.create({
      data: {
        username: parsed.username,
        password: hashedPassword,
        rawPreferences: parsed.rawPreferences,
        expertiseLevel: expertiseLevel as ExpertiseLevel,
        interests: {
          create: interests,
        },
      },
    });

    return { success: true, userId: user.id };
  } catch (error) {
    console.error("SignUp error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to sign up"
    );
  }
}

export async function signInAction(formData: FormData) {
    try {
      const parsed = signInSchema.parse({
        username: formData.get('username'),
        password: formData.get('password'),
      })
  
      const user = await prisma.user.findUnique({
        where: { username: parsed.username },
      })
  
      if (!user) {
        return { success: false, error: 'Invalid credentials' }
      }
  
      const isValidPassword = await compare(parsed.password, user.password)
      if (!isValidPassword) {
        return { success: false, error: 'Invalid credentials' }
      }
  
      // Here you would typically set up a session
      return { success: true, userId: user.id }
    } catch (error) {
      console.error('SignIn error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to sign in'
      }
    }
  }

export async function checkUsername(username: string) {
  const existingUser = await prisma.user.findUnique({
    where: { username },
  });
  return !!existingUser;
}

export async function signUpAction(formData: FormData) {
  const parsed = signUpSchema.parse({
    username: formData.get("username"),
    password: formData.get("password"),
    rawPreferences: formData.get("rawPreferences"),
  });

  // Check if user exists
  const userExists = await checkUsername(parsed.username);
  if (userExists) {
    throw new Error("Username already taken. Please choose a different one.");
  }

  try {
    // Hash password
    const hashedPassword = await hash(parsed.password, 12);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: parsed.username,
        password: hashedPassword,
        rawPreferences: parsed.rawPreferences,
      },
    });

    return { success: true, userId: user.id };
  } catch (error) {
    console.error("SignUp error:", error);
    throw new Error(
      error instanceof Error ? error.message : "Failed to sign up"
    );
  }
}
