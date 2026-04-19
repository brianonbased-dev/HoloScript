export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildRoomScanCompletionManifest } from '@/lib/scan-session-manifest';
import { clientIpFromRequest, getScanSessionStore } from '@/lib/reconstruction-scan-store';

const POST_WINDOW_MS = 60_000;
const POST_MAX_PER_IP = 20;
const GET_WINDOW_MS = 60_000;
const GET_MAX_PER_IP = 200;
const PUT_WINDOW_MS = 60_000;
const PUT_MAX_PER_TOKEN = 90;

function baseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_STUDIO_URL || request.nextUrl.origin || 'http://localhost:3000';
}

function requireAuthForSessionCreate(): boolean {
  if (process.env.STUDIO_SCAN_SESSION_PUBLIC_POST === '1') return false;
  return process.env.NODE_ENV === 'production' || process.env.STUDIO_SCAN_SESSION_REQUIRE_AUTH === '1';
}

/**
 * CORS: default same deployment origin only. Set STUDIO_SCAN_SESSION_CORS_ORIGINS to a
 * comma-separated allowlist, or "*" for public tools (not recommended for credentialed APIs).
 */
function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');
  const base = {
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    Vary: 'Origin',
  };
  const raw = process.env.STUDIO_SCAN_SESSION_CORS_ORIGINS?.trim();
  if (raw === '*') {
    return { ...base, 'Access-Control-Allow-Origin': '*' };
  }
  if (raw) {
    const list = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (origin && list.includes(origin)) {
      return { ...base, 'Access-Control-Allow-Origin': origin };
    }
    return base;
  }
  const publicOrigin = process.env.NEXT_PUBLIC_STUDIO_URL?.trim();
  let publicOriginNorm: string | undefined;
  if (publicOrigin) {
    try {
      publicOriginNorm = new URL(publicOrigin).origin;
    } catch {
      publicOriginNorm = undefined;
    }
  }
  const allowed =
    origin &&
    (origin === request.nextUrl.origin || (!!publicOriginNorm && origin === publicOriginNorm));
  if (allowed) {
    return { ...base, 'Access-Control-Allow-Origin': origin };
  }
  return base;
}

function withCors(request: NextRequest, res: NextResponse): NextResponse {
  const h = corsHeaders(request);
  for (const [k, v] of Object.entries(h)) {
    res.headers.set(k, v);
  }
  return res;
}

function rateLimitResponse(request: NextRequest, retryAfterSec: number): NextResponse {
  return withCors(
    request,
    NextResponse.json(
      { error: 'Too many requests', retryAfter: retryAfterSec },
      { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
    ),
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const store = getScanSessionStore();
  await store.pruneExpired();

  const ip = clientIpFromRequest(request);
  const postRl = await store.rateLimitPost(ip, POST_MAX_PER_IP, Math.ceil(POST_WINDOW_MS / 1000));
  if (!postRl.ok) return rateLimitResponse(request, postRl.retryAfterSec);

  const authSession = await getServerSession(authOptions);

  if (requireAuthForSessionCreate()) {
    if (!authSession?.user?.id) {
      return withCors(request, NextResponse.json({ error: 'Unauthorized' }, { status: 401 }));
    }
  }

  let payload: { user?: string; weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch' } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // optional body
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const session = {
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    desktopUser: payload.user ?? authSession?.user?.email ?? authSession?.user?.name ?? undefined,
    status: 'pending-phone' as const,
    weightStrategy: payload.weightStrategy ?? ('distill' as const),
  };
  await store.set(token, session);

  const url = `${baseUrl(request)}/scan-room/mobile/${encodeURIComponent(token)}`;
  return withCors(
    request,
    NextResponse.json({ token, mobileUrl: url, expiresAt: session.expiresAt }, { status: 201 }),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const store = getScanSessionStore();
  await store.pruneExpired();

  const ip = clientIpFromRequest(request);
  const getRl = await store.rateLimitGet(ip, GET_MAX_PER_IP, Math.ceil(GET_WINDOW_MS / 1000));
  if (!getRl.ok) return rateLimitResponse(request, getRl.retryAfterSec);

  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = await store.get(token);
  if (!session) return withCors(request, NextResponse.json({ error: 'Session not found' }, { status: 404 }));
  return withCors(request, NextResponse.json(session));
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const store = getScanSessionStore();
  await store.pruneExpired();

  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = await store.get(token);
  if (!session) return withCors(request, NextResponse.json({ error: 'Session not found' }, { status: 404 }));

  const putRl = await store.rateLimitPut(token, PUT_MAX_PER_TOKEN, Math.ceil(PUT_WINDOW_MS / 1000));
  if (!putRl.ok) return rateLimitResponse(request, putRl.retryAfterSec);

  let body: {
    status?: (typeof session)['status'];
    frameCount?: number;
    videoBytes?: number;
    videoHash?: string;
    error?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return withCors(request, NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }));
  }

  if (body.status) session.status = body.status;
  if (typeof body.frameCount === 'number') session.frameCount = body.frameCount;
  if (typeof body.videoBytes === 'number') session.videoBytes = body.videoBytes;
  if (typeof body.videoHash === 'string' && body.videoHash.length > 0) {
    session.videoHash = body.videoHash;
  }
  if (typeof body.error === 'string') {
    session.lastError = body.error;
    session.status = 'error';
  }

  if (session.status === 'done') {
    const videoHash =
      session.videoHash ??
      (session.videoBytes !== undefined
        ? `size-only:${session.videoBytes}`
        : 'no-video-payload');
    const manifest = buildRoomScanCompletionManifest({
      token: session.token,
      weightStrategy: session.weightStrategy,
      videoHash,
      frameCount: session.frameCount ?? 0,
      videoBytes: session.videoBytes ?? 0,
      capturedAtIso: new Date().toISOString(),
    });
    session.manifest = manifest;
    session.replayFingerprint = manifest.simulationContract.replayFingerprint;
  }

  await store.set(token, session);

  return withCors(request, NextResponse.json({ ok: true, session }));
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const store = getScanSessionStore();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  await store.delete(token);
  return withCors(request, NextResponse.json({ ok: true }));
}

export function OPTIONS(request: NextRequest): Response {
  const h = corsHeaders(request);
  return new Response(null, { status: 204, headers: h });
}
