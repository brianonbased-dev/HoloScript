/**
 * Server-side authentication helper for API routes.
 *
 * Provides getSession() for route handlers, a requireAuth() guard,
 * and forwardAuthHeaders() for proxying identity to backend services.
 */

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from './auth';

/**
 * Get the current session in a server component or API route.
 * Returns null if not authenticated.
 */
export async function getSession() {
  return getServerSession(authOptions);
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
