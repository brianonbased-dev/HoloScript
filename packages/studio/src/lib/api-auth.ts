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
import { eq } from 'drizzle-orm';
import { authOptions } from './auth';
import { isFounderWorkspaceIdentity } from './workspace/workspaceIdentity';
import { getDb } from '../db/client';
import { users as usersTable } from '../db/schema';

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
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;
  const cookieStore = await cookies();
  type GetTokenReq = Parameters<typeof getToken>[0]['req'];
  const token = await getToken({
    req: {
      cookies: Object.fromEntries(cookieStore.getAll().map((c) => [c.name, c.value])),
    } as GetTokenReq,
    secret,
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
    // Use actual JWT expiry (token.exp is Unix seconds); fall back to 30 days
    // only when the claim is absent so we don't extend a near-expiry token.
    expires:
      typeof token.exp === 'number'
        ? new Date(token.exp * 1000).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
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
export async function requireAuth(request?: Request) {
  // Benchmark bypass: if BRITTNEY_BENCHMARK_KEY is configured and the
  // request carries a matching x-benchmark-key header, skip NextAuth.
  // This is strictly opt-in via env var — never active by default.
  if (request && process.env.BRITTNEY_BENCHMARK_KEY) {
    const benchKey = request.headers.get('x-benchmark-key');
    if (benchKey === process.env.BRITTNEY_BENCHMARK_KEY) {
      return {
        user: {
          id: 'benchmark',
          name: 'Benchmark Runner',
          email: '',
          image: null,
          githubUsername: '',
        },
      };
    }
  }

  const session = await getSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  return session;
}

/**
 * Guard that returns the session or a 401/403 response — like requireAuth, but
 * additionally requires the caller to be the founder. THIS is the real gate for
 * operate/admin endpoints that trigger spend or privileged actions (fleet
 * provision, CI dispatch, etc.); hiding the nav for non-founders is only
 * cosmetic. F.095 class-1: a public caller must never reach a spend action.
 *
 * ```ts
 * export async function POST(request: Request) {
 *   const auth = await requireFounder(request);
 *   if (auth instanceof NextResponse) return auth; // 401 or 403
 *   // ... founder-only action
 * }
 * ```
 */
export async function requireFounder(request?: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  if (!isFounderWorkspaceIdentity(auth.user)) {
    return NextResponse.json({ error: 'Founder access required' }, { status: 403 });
  }
  return auth;
}

/**
 * Guard that accepts either a NextAuth session OR a Brittney API key
 * (`Authorization: Bearer bk_*`). API-key callers get a synthetic session
 * built from their DB user row so the Brittney route can treat both paths
 * identically (credits, rate-limiting, BYOK vault, workspace resolution).
 *
 * ```ts
 * export async function POST(request: Request) {
 *   const auth = await requireAuthOrApiKey(request);
 *   if (auth instanceof NextResponse) return auth; // 401 / 503
 *   const { user } = auth;
 *   // ...
 * }
 * ```
 */
export async function requireAuthOrApiKey(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer bk_')) {
    const rawKey = authHeader.slice('Bearer '.length);
    // Lazy import avoids circular dep at module parse time.
    const { validateApiKey } = await import('./brittney/userApiKeys');
    const keyResult = await validateApiKey(rawKey);
    if (!keyResult) {
      return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
    }
    const db = getDb();
    if (!db) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    const rows = await db
      .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, image: usersTable.image })
      .from(usersTable)
      .where(eq(usersTable.id, keyResult.userId))
      .limit(1);
    if (!rows.length) {
      return NextResponse.json({ error: 'Invalid or revoked API key' }, { status: 401 });
    }
    const u = rows[0];
    return {
      user: {
        id: u.id,
        name: u.name ?? null,
        email: u.email ?? null,
        image: u.image ?? null,
        githubUsername: '',
      },
    };
  }
  return requireAuth(request);
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
