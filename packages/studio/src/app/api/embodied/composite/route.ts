/**
 * /api/embodied/composite — server-side cache for embodied composite snapshots.
 *
 * GET  → returns the latest composite (or { stale: true } if older than 10min)
 * POST → updates the cached composite (called by ai-ecosystem voice.mjs adapter)
 *
 * Single in-memory cache shared across requests in one Next.js process. On
 * Railway with one instance per deploy this is fine; if we scale to multiple
 * instances the cache becomes per-instance and we'd want Redis or a KV store.
 *
 * Read by:
 *   - Brittney's `read_embodied_status` tool (EmbodiedTools.ts)
 *   - any client wanting "is everything ok?" — Studio dashboard tile, future
 *     Quest 3 widget, future mobile glyph
 *
 * Wired from:
 *   ~/.claude/skills/embodied/adapters/voice.mjs  (when EMBODIED_NOTIFY_URL is set)
 *
 * Auth: optional Bearer token via EMBODIED_NOTIFY_KEY env. If unset, anyone
 * on the network can POST — fine for personal/dev use, NOT for multi-tenant.
 */

import { NextRequest, NextResponse } from 'next/server';

interface EmbodiedComposite {
  composite_health: 'ok' | 'warn' | 'down' | 'unknown';
  composite_urgency: number;
  composite_glyph: string;
  composite_summary: string;
  composite_voice: string;
  state_flip: boolean;
  participating_count: number;
  cycle_ms: number;
  skills: unknown[];
  ts: string;
  schema_version: string;
  [key: string]: unknown;
}

interface CacheEntry {
  composite: EmbodiedComposite;
  received_at: number;
}

// Process-local cache. Bumped on each POST.
let cache: CacheEntry | null = null;

const STALE_AFTER_MS = 10 * 60 * 1000; // 10 minutes

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET() {
  if (!cache) {
    return NextResponse.json(
      { stale: true, composite: null, reason: 'no composite received yet' },
      { status: 200, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } },
    );
  }

  const age_ms = Date.now() - cache.received_at;
  const stale = age_ms > STALE_AFTER_MS;

  return NextResponse.json(
    {
      stale,
      age_ms,
      composite: cache.composite,
    },
    {
      status: 200,
      headers: { ...corsHeaders, 'Cache-Control': 'max-age=15' },
    },
  );
}

export async function POST(req: NextRequest) {
  // Optional auth — gated behind env var. When unset, accept all (dev mode).
  const requiredKey = process.env.EMBODIED_NOTIFY_KEY;
  if (requiredKey) {
    const auth = req.headers.get('authorization');
    if (!auth?.startsWith('Bearer ') || auth.slice(7) !== requiredKey) {
      return NextResponse.json(
        { error: 'unauthorized' },
        { status: 401, headers: corsHeaders },
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'invalid json' },
      { status: 400, headers: corsHeaders },
    );
  }

  const composite = body as EmbodiedComposite;
  const required = ['composite_health', 'composite_summary', 'ts', 'schema_version'] as const;
  for (const k of required) {
    if (!composite[k]) {
      return NextResponse.json(
        { error: `missing required field: ${k}` },
        { status: 400, headers: corsHeaders },
      );
    }
  }

  cache = { composite, received_at: Date.now() };

  return NextResponse.json(
    { ok: true, received_at: cache.received_at },
    { status: 200, headers: corsHeaders },
  );
}
