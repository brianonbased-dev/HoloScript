/**
 * Catch-all proxy for /api/absorb/* -> absorb.holoscript.net
 *
 * Keeps the ABSORB_API_KEY server-side. Forwards all methods (GET, POST, DELETE)
 * and the request body. Attaches the user's GitHub token if present.
 */

import { NextRequest, NextResponse } from 'next/server';
import { ABSORB_BASE, ABSORB_API_KEY } from '@/lib/services/absorb-client';

async function proxyToAbsorb(req: NextRequest, segments: string[]) {
  const path = segments.join('/');
  const targetUrl = `${ABSORB_BASE}/api/${path}${req.nextUrl.search}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (ABSORB_API_KEY) {
    headers['Authorization'] = `Bearer ${ABSORB_API_KEY}`;
  }

  // Forward the user's auth token if present (from the client's absorbFetch)
  const userAuth = req.headers.get('authorization');
  if (userAuth) {
    headers['X-User-Authorization'] = userAuth;
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

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  return proxyToAbsorb(req, path);
}
