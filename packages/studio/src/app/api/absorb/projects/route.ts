/**
 * GET /api/absorb/projects   -- List projects
 * POST /api/absorb/projects  -- Create project
 *
 * Gap 6: Studio API split -- standalone project management route.
 * Proxies to absorb service with proper auth, falls back to in-memory
 * storage for standalone/local development.
 */

import { NextRequest, NextResponse } from 'next/server';

const ABSORB_BASE =
  process.env.ABSORB_SERVICE_URL || 'https://absorb.holoscript.net';
const ABSORB_API_KEY = process.env.ABSORB_API_KEY || process.env.MCP_API_KEY || '';

// In-memory project store for standalone mode
const localProjects = new Map<string, {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl?: string;
  status: string;
  totalSpentCents: number;
  totalOperations: number;
  lastAbsorbedAt: string | null;
  createdAt: string;
}>();

async function proxyToAbsorb(
  path: string,
  method: string,
  body?: string,
  userAuth?: string | null,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${ABSORB_API_KEY}`,
    };
    if (userAuth) {
      headers['X-User-Authorization'] = userAuth;
    }

    const res = await fetch(`${ABSORB_BASE}${path}`, {
      method,
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 502, data: null };
  }
}

export async function GET(req: NextRequest) {
  const userAuth = req.headers.get('authorization');

  // Try absorb service
  const result = await proxyToAbsorb('/api/projects', 'GET', undefined, userAuth);
  if (result.ok) {
    return NextResponse.json(result.data);
  }

  // Fallback: return local projects
  return NextResponse.json({
    projects: Array.from(localProjects.values()),
    count: localProjects.size,
    standalone: true,
  });
}

export async function POST(req: NextRequest) {
  const userAuth = req.headers.get('authorization');
  const body = await req.text();

  // Try absorb service
  const result = await proxyToAbsorb('/api/projects', 'POST', body, userAuth);
  if (result.ok) {
    return NextResponse.json(result.data, { status: 201 });
  }

  // Fallback: create project locally
  try {
    const parsed = JSON.parse(body);
    const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const project = {
      id,
      name: parsed.name || 'Untitled',
      sourceType: parsed.source_type || 'github',
      sourceUrl: parsed.source_url,
      status: 'pending',
      totalSpentCents: 0,
      totalOperations: 0,
      lastAbsorbedAt: null,
      createdAt: new Date().toISOString(),
    };
    localProjects.set(id, project);
    return NextResponse.json({ project, standalone: true }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    );
  }
}
