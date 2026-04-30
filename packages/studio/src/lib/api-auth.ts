/**
 * Server-side authentication helper for API routes.
 *
 * Provides getSession() for route handlers, a requireAuth() guard,
 * and forwardAuthHeaders() for proxying identity to backend services.
 */

import { getServerSession } from 'next-auth';
import { getToken } from 'next-auth/jwt';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';

/**
 * Get the current session in a server component or API route.
 * Returns null if not authenticated.
 *
 * In Next.js App Router, getServerSession() without req/res can fail
 * to read cookies. We fallback to getToken() from next-auth/jwt which
 * reads cookies via next/headers.
 */
export async function getSession() {
  const session = await getServerSession(authOptions);
  if (session) return session;

  // Fallback for App Router: decode JWT directly from cookies
  const cookieStore = await cookies();
  const token = await getToken({
    req: { cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])) } as any,
    secret: process.env.NEXTAUTH_SECRET,
  });
  if (!token) return null;

  return {
    user: {
      id: token.sub ?? '',
      name: token.name ?? null,
      email: token.email ?? null,
      image: token.picture ?? null,
      githubUsername: (token.githubUsername as string) ?? '',
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Guard that returns the session or a 401 response.
 * Use in API route handlers:
 *
 * ```ts
 * export async function GET() {
 *   const auth = await requireAuth();
 *   if (auth instanceof NextResponse) return auth;
 *   const { user } = auth;
 *   // ... use user.id, user.email, etc.
 * }
 * ```
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }
  return session;
}

/**
 * Extract Authorization header from an incoming request for forwarding
 * to backend services (absorb-service, MCP orchestrator, etc.).
 *
 * Returns headers object suitable for spreading into a fetch() call.
 */
export function forwardAuthHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  const auth = request.headers.get('authorization');
  if (auth) {
    headers['Authorization'] = auth;
  }
  return headers;
}
