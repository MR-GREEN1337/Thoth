// src/lib/auth.ts

import { cookies } from "next/headers";
import { type NextRequest } from "next/server";

// Constants for token handling
const TOKEN_NAME = "authToken";
const TOKEN_MAX_AGE = 30 * 24 * 60 * 60; // 30 days in seconds

interface TokenData {
  userId: string;
  exp: number;
}

// Parse JWT without external libraries
export const parseJwt = (token: string): TokenData | null => {
  try {
    const base64Payload = token.split('.')[1];
    const payload = Buffer.from(base64Payload, 'base64').toString('ascii');
    return JSON.parse(payload);
  } catch (e) {
    return null;
  }
};

// Get user ID from server context
export const getUserId = async () => {
  const cookieStore = cookies();
  const token = (await cookieStore).get(TOKEN_NAME)?.value;
  
  if (!token) return null;
  
  const tokenData = parseJwt(token);
  if (!tokenData || Date.now() >= tokenData.exp * 1000) return null;
  
  return tokenData.userId;
};

// Get user ID from request (for middleware)
export const getUserIdFromRequest = (request: NextRequest): string | null => {
  const token = request.cookies.get(TOKEN_NAME)?.value;
  
  if (!token) return null;
  
  const tokenData = parseJwt(token);
  if (!tokenData || Date.now() >= tokenData.exp * 1000) return null;
  
  return tokenData.userId;
};

// Client-side functions
export const setAuthToken = (token: string) => {
  document.cookie = `${TOKEN_NAME}=${token}; path=/; max-age=${TOKEN_MAX_AGE}; SameSite=Lax`;
};

export const clearAuthToken = () => {
  document.cookie = `${TOKEN_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
};

export const getAuthToken = (): string | null => {
  const cookies = document.cookie.split(';');
  const tokenCookie = cookies.find(cookie => cookie.trim().startsWith(`${TOKEN_NAME}=`));
  return tokenCookie ? tokenCookie.split('=')[1] : null;
};