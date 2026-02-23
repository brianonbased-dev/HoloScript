import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// In-memory store for now; swap for Supabase/DB in production
const sharedScenes = new Map<
  string,
  {
    id: string;
    name: string;
    code: string;
    author: string;
    createdAt: string;
    views: number;
  }
>();

/** POST /api/share — publish a scene and get back a share token */
export async function POST(req: NextRequest) {
  let body: { name?: string; code?: string; author?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name = 'Untitled', code, author = 'Anonymous' } = body;
  if (!code) return NextResponse.json({ error: '`code` is required' }, { status: 400 });

  const id = randomUUID().slice(0, 8); // short 8-char token
  sharedScenes.set(id, { id, name, code, author, createdAt: new Date().toISOString(), views: 0 });

  return NextResponse.json({ id, url: `/shared/${id}` }, { status: 201 });
}

/** GET /api/share — list recently shared scenes (public gallery) */
export async function GET() {
  const list = Array.from(sharedScenes.values())
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50)
    .map(({ id, name, author, createdAt, views }) => ({ id, name, author, createdAt, views }));

  return NextResponse.json({ scenes: list });
}
