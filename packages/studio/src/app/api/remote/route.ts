export const maxDuration = 300;

import { NextResponse, NextRequest } from 'next/server';
import crypto from 'crypto';

/**
 * Mobile Remote Session API
 *
 * POST /api/remote       — create a new remote session (returns token + QR url)
 * GET  /api/remote?t=<token> — get session state (viewport command queue)
 * PUT  /api/remote?t=<token> — send a viewport command from mobile
 * DELETE /api/remote?t=<token> — end session
 */

interface RemoteCommand {
  type: 'orbit' | 'zoom' | 'pan' | 'reset' | 'select';
  dx?: number;
  dy?: number;
  delta?: number;
  ts: number;
}

interface RemoteSession {
  token: string;
  createdAt: string;
  expiresAt: string;
  commands: RemoteCommand[];
  lastPing: number;
}

declare global {
  var __remoteSessionStore__: Map<string, RemoteSession> | undefined;
}
const sessions: Map<string, RemoteSession> =
  globalThis.__remoteSessionStore__ ?? (globalThis.__remoteSessionStore__ = new Map());

function pruneExpired() {
  const now = Date.now();
  for (const [token, session] of sessions) {
    if (new Date(session.expiresAt).getTime() < now) sessions.delete(token);
  }
}

export async function POST() {
  pruneExpired();
  const token = crypto.randomBytes(12).toString('hex');
  const session: RemoteSession = {
    token,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(), // 30 min TTL
    commands: [],
    lastPing: Date.now(),
  };
  sessions.set(token, session);

  const baseUrl = process.env.NEXT_PUBLIC_URL ?? 'http://localhost:3000';
  const remoteUrl = `${baseUrl}/remote/${token}`;

  return NextResponse.json({ token, remoteUrl, expiresAt: session.expiresAt }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  // Return and flush the command queue
  const commands = [...session.commands];
  session.commands = [];
  session.lastPing = Date.now();

  return NextResponse.json({ commands, token, expiresAt: session.expiresAt });
}

export async function PUT(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  const session = sessions.get(token);
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  let cmd: Omit<RemoteCommand, 'ts'>;
  try {
    cmd = (await request.json()) as Omit<RemoteCommand, 'ts'>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  session.commands.push({ ...cmd, ts: Date.now() });
  session.lastPing = Date.now();
  // Keep queue bounded
  if (session.commands.length > 100) session.commands.shift();

  return NextResponse.json({ ok: true, queued: session.commands.length });
}

export async function DELETE(request: NextRequest) {
  const token = new URL(request.url).searchParams.get('t') ?? '';
  sessions.delete(token);
  return NextResponse.json({ ok: true });
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
