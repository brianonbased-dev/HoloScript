export const maxDuration = 300;

/**
 * Catch-all proxy for /api/absorb/* -> absorb.holoscript.net
 *
 * Forwards GET/POST/PUT/DELETE and the request body using ONLY the signed-in
 * user's own credential, resolved server-side from the Studio session (cookie
 * or JWT), as #654 does. It never attaches the server's ABSORB_API_KEY: doing so let an
 * anonymous POST to /api/absorb/absorb/scan run an uncharged scan upstream.
 * Scan paths are refused outright; paid scans go through
 * /api/absorb/projects/{id}/absorb, which checks the session and charges the user.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE } from '@/lib/services/absorb-client';
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

function isRefusedPath(segments: string[]): boolean {
  return segments.some((raw) => {
    // Decode until stable so %2573can (double-encoded) is caught too.
    let seg = raw;
    for (let i = 0; i < 5; i++) {
      let next: string;
      try {
        next = decodeURIComponent(seg);
      } catch {
        return true;
      }
      if (next === seg) break;
      seg = next;
    }
    if (seg.includes('%')) return true;
    const s = seg.trim().toLowerCase();
    return s === '..' || s === '.' || s.includes('/') || s.includes('\\') || s.includes('scan');
  });
}

async function proxyToAbsorb(req: NextRequest, segments: string[]) {
  if (isRefusedPath(segments)) {
    return NextResponse.json(
      {
        error: 'Scans are not available through this proxy',
        hint: 'Start a scan with POST /api/absorb/projects/{id}/absorb',
      },
      { status: 403 }
    );
  }

  // Forward only the session user's own credential. Never the server's ABSORB_API_KEY.
  const userToken = await getGitHubToken(req, { userOnly: true }).catch(() => null);
  if (!userToken) {
    return NextResponse.json(
      { error: 'Sign in to use Absorb.', reason: 'absorb_no_user_credential' },
      { status: 401 }
    );
  }
  const userAuth = `Bearer ${userToken}`;

  const targetUrl = `${ABSORB_BASE}${upstreamApiPath(segments)}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  headers['Authorization'] = userAuth;
  headers['X-User-Authorization'] = userAuth;

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
