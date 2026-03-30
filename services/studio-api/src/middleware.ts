import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// ─── CSRF Protection Middleware ─────────────────────────────────────────────
// Validates Origin header on state-changing requests to prevent cross-site
// request forgery. Allows same-origin and configured Studio frontend origins.
// ─────────────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGINS = new Set([
  process.env.NEXT_PUBLIC_STUDIO_URL || 'http://localhost:3100',
  process.env.NEXTAUTH_URL || 'http://localhost:3105',
  // Allow same-origin requests (no Origin header = same-origin in most browsers)
]);

// Add any additional configured origins
if (process.env.ALLOWED_ORIGINS) {
  process.env.ALLOWED_ORIGINS.split(',').forEach((o) => ALLOWED_ORIGINS.add(o.trim()));
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function middleware(request: NextRequest) {
  // Skip CSRF check for safe (read-only) methods
  if (SAFE_METHODS.has(request.method)) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Skip CSRF for NextAuth routes (they have their own CSRF token)
  if (request.nextUrl.pathname.startsWith('/api/auth/')) {
    return addSecurityHeaders(NextResponse.next());
  }

  const origin = request.headers.get('origin');

  // No Origin header typically means same-origin navigation — allow
  if (!origin) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Check if origin is allowed
  if (!ALLOWED_ORIGINS.has(origin)) {
    return new NextResponse(JSON.stringify({ error: 'CSRF validation failed: origin not allowed' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return addSecurityHeaders(NextResponse.next());
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return response;
}

export const config = {
  matcher: '/api/:path*',
};
