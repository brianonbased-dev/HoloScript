export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

interface ScanSession {
  token: string;
  createdAt: string;
  expiresAt: string;
  desktopUser?: string;
  status: 'pending-phone' | 'capturing' | 'uploaded' | 'processing' | 'done' | 'error';
  weightStrategy: 'distill' | 'fine-tune' | 'from-scratch';
  frameCount?: number;
  videoBytes?: number;
  lastError?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __reconstructionScanSessions__: Map<string, ScanSession> | undefined;
}

const sessions: Map<string, ScanSession> =
  globalThis.__reconstructionScanSessions__ ??
  (globalThis.__reconstructionScanSessions__ = new Map());

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

export async function POST(request: NextRequest): Promise<NextResponse> {
  pruneExpired();

  let payload: { user?: string; weightStrategy?: 'distill' | 'fine-tune' | 'from-scratch' } = {};
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    // optional body
  }

  const token = crypto.randomBytes(12).toString('hex');
  const session: ScanSession = {
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(),
    desktopUser: payload.user,
    status: 'pending-phone',
    weightStrategy: payload.weightStrategy ?? 'distill',
  };
  sessions.set(token, session);

  const url = `${baseUrl(request)}/scan-room/mobile/${token}`;
  return NextResponse.json({ token, mobileUrl: url, expiresAt: session.expiresAt }, { status: 201 });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  pruneExpired();
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session);
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  let body: { status?: ScanSession['status']; frameCount?: number; videoBytes?: number; error?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (body.status) session.status = body.status;
  if (typeof body.frameCount === 'number') session.frameCount = body.frameCount;
  if (typeof body.videoBytes === 'number') session.videoBytes = body.videoBytes;
  if (typeof body.error === 'string') {
    session.lastError = body.error;
    session.status = 'error';
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
