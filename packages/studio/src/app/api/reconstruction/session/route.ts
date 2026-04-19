export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { buildRoomScanCompletionManifest } from '@/lib/scan-session-manifest';
import { clientIpFromRequest, takeRateLimitToken } from '@/lib/reconstruction-session-rate-limit';
import type { ReconstructionManifest } from '@holoscript/core/reconstruction';

interface ScanSession {
  token: string;
  createdAt: string;
  expiresAt: string;
  desktopUser?: string;
  status: 'pending-phone' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  frameCount?: number;
  videoBytes?: number;
  videoHash?: string;
  lastError?: string;
  /** Set when status becomes done — matches HoloMap SimulationContract replay fingerprint */
  replayFingerprint?: string;
  /** v1.0 reconstruction manifest (subset used for ingest / audit) */
  manifest?: ReconstructionManifest;
}

declare global {
  // eslint-disable-next-line no-var
  var __reconstructionScanSessions__: Map<string, ScanSession> | undefined;
}

const sessions: Map<string, ScanSession> =
  globalThis.__reconstructionScanSessions__ ??
  (globalThis.__reconstructionScanSessions__ = new Map());

const POST_WINDOW_MS = 60_000;
const POST_MAX_PER_IP = 20;
const GET_WINDOW_MS = 60_000;
const GET_MAX_PER_IP = 200;
const PUT_WINDOW_MS = 60_000;
const PUT_MAX_PER_TOKEN = 90;

function pruneExpired(): void {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (new Date(session.expiresAt).getTime() < now) {
      sessions.delete(token);
    }
  }
}

function baseUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_STUDIO_URL || request.nextUrl.origin || 'http://localhost:3000';
}

function requireAuthForSessionCreate(): boolean {
  if (process.env.STUDIO_SCAN_SESSION_PUBLIC_POST === '1') return false;
  return process.env.NODE_ENV === 'production' || process.env.STUDIO_SCAN_SESSION_REQUIRE_AUTH === '1';
}

function rateLimitResponse(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: 'Too many requests', retryAfter: retryAfterSec },
    { status: 429, headers: { 'Retry-After': String(retryAfterSec) } },
  );
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  pruneExpired();

  const ip = clientIpFromRequest(request);
  const postRl = takeRateLimitToken(`scan-session:post:${ip}`, POST_MAX_PER_IP, POST_WINDOW_MS);
  if (!postRl.ok) return rateLimitResponse(postRl.retryAfterSec);

  const authSession = await getServerSession(authOptions);

  if (requireAuthForSessionCreate()) {
    if (!authSession?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  let payload: { user?: string; weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch' } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // optional body
  }
  const token = crypto.randomBytes(24).toString('base64url');
  const session: ScanSession = {
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    desktopUser: payload.user ?? authSession?.user?.email ?? authSession?.user?.name ?? undefined,
    status: 'pending-phone',
    weightStrategy: payload.weightStrategy ?? 'distill',
  };
  sessions.set(token, session);

  const url = `${baseUrl(request)}/scan-room/mobile/${encodeURIComponent(token)}`;
  return NextResponse.json({ token, mobileUrl: url, expiresAt: session.expiresAt }, { status: 201 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneExpired();

  const ip = clientIpFromRequest(request);
  const getRl = takeRateLimitToken(`scan-session:get:${ip}`, GET_MAX_PER_IP, GET_WINDOW_MS);
  if (!getRl.ok) return rateLimitResponse(getRl.retryAfterSec);

  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  pruneExpired();

  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const putRl = takeRateLimitToken(`scan-session:put:${token}`, PUT_MAX_PER_TOKEN, PUT_WINDOW_MS);
  if (!putRl.ok) return rateLimitResponse(putRl.retryAfterSec);

  let body: {
    status?: ScanSession['status'];
    frameCount?: number;
    videoBytes?: number;
    videoHash?: string;
    error?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
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

  return NextResponse.json({ ok: true, session });
}

export async function DELETE(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  sessions.delete(token);
  return NextResponse.json({ ok: true });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
