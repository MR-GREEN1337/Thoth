import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
 
// Configure which paths require authentication.
const protectedPaths = [
  'dashboard',
  'course',
  'onboarding'
]

// Configure public paths that should bypass authentication
const publicPaths = [
  '/sign-up',
  '/sign-in',
  '/forgot-password',
  '/'
]
 
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('token')?.value
  
  // If user is authenticated and tries to access sign-in, redirect to dashboard
  if (pathname === '/sign-in' && token) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
  
  // Check if the path is public
  if (publicPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next()
  }
  
  // Check if path requires authentication
  const isProtectedPath = protectedPaths.some(path => pathname.startsWith(path))
  
  if (!isProtectedPath) {
    return NextResponse.next()
  }
  
  // If no token is present, redirect to login
  if (!token) {
    const loginUrl = new URL('/sign-in', request.url)
    loginUrl.searchParams.set('from', pathname)
    return NextResponse.redirect(loginUrl)
  }
  
  try {
    // Here you would typically verify the token
    // This is a placeholder for token verification logic
    // You could add JWT verification or other token validation here
    if (!isValidToken(token)) {
      throw new Error('Invalid token')
    }

    return NextResponse.next()
  } catch (error) {
    // If token is invalid, clear it and redirect to login
    const response = NextResponse.redirect(new URL('/sign-in', request.url))
    response.cookies.delete('token')
    return response
  }
}

// Configure middleware to match specific paths
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public directory)
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}

// Placeholder function for token validation
// Replace this with your actual token validation logic
function isValidToken(token: string): boolean {
  // Add your token verification logic here
  // For example, verify JWT signature, check expiration, etc.
  return token.length > 0
}