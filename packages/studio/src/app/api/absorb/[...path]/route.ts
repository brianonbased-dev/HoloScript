export const maxDuration = 300;

/**
 * Catch-all proxy for /api/absorb/* -> absorb.holoscript.net
 *
 * Keeps the ABSORB_API_KEY server-side. Forwards all methods and the body.
 *
 * Every call needs a signed-in Studio session; with none it answers 401 and
 * forwards nothing (Mapping, #654: an anonymous POST here used to reach
 * upstream /api/absorb/scan with the service key alone). The session's own
 * credential is always forwarded. Requests that can spend credits (anything
 * other than GET/HEAD) carry ONLY the user's credential, never the service key,
 * so absorb charges that user or refuses. Reads keep the service key plus the
 * user's credential in X-User-Authorization.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';
import { getGitHubToken } from '@/app/api/github/_shared';

import { corsHeaders } from '../../_lib/cors';

function upstreamApiPath(segments: string[]): string {
  const path = segments.join('/');
  // absorbRouter is mounted at /api/absorb (services/absorb-service/src/server.ts).
  // Project ids have to keep that prefix or they miss the owner checks.
  // Sibling mounts such as moltbook stay on /api/<name>.
  if (segments[0] === 'projects') return `/api/absorb/${path}`;
  return `/api/${path}`;
}

/** GET/HEAD are reads; every other method may start paid work upstream. */
export function isPaidCapable(method: string): boolean {
  const m = method.toUpperCase();
  return m !== 'GET' && m !== 'HEAD';
}

async function proxyToAbsorb(req: NextRequest, segments: string[]) {
  const userToken = await getGitHubToken(req, { userOnly: true }).catch(() => null);
  if (!userToken) {
    return NextResponse.json(
      { error: 'Sign in to use Absorb.', reason: 'absorb_no_user_credential' },
      { status: 401 }
    );
  }

  const targetUrl = `${ABSORB_BASE}${upstreamApiPath(segments)}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (isPaidCapable(req.method) || !ABSORB_API_KEY) {
    // No service-key fallback: absorb sees only the user and charges or refuses them.
    headers['Authorization'] = `Bearer ${userToken}`;
  } else {
    headers['Authorization'] = `Bearer ${ABSORB_API_KEY}`;
    headers['X-User-Authorization'] = `Bearer ${userToken}`;
  }

  const fetchOptions: RequestInit = {
    method: req.method,
    headers,
  };

  // Forward body for non-GET requests
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    try {
      const body = await req.text();
      if (body) {
        fetchOptions.body = body;
      }
    } catch {
      // No body — that's fine
    }
  }

  try {
    const upstream = await fetch(targetUrl, fetchOptions);
    const data = await upstream.text();

    return new NextResponse(data, {
      status: upstream.status,
      headers: {
        'Content-Type': upstream.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Absorb service unavailable',
        message: error instanceof Error ? error.message : 'Unknown error',
        hint: 'Set ABSORB_SERVICE_URL env var if using a custom absorb service',
      },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
