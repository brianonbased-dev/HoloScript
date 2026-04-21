export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';

import { corsHeaders } from '../../../_lib/cors';
/**
 * /api/agents/fleet/[id] — Single fleet agent management
 *
 * GET    — single agent status
 * PATCH  — pause/resume/update config
 * DELETE — stop and deregister agent
 */

// ── Types ────────────────────────────────────────────────────────────────────

type AgentStatus = 'active' | 'paused' | 'stopped' | 'deploying' | 'error';

interface PatchPayload {
  status?: AgentStatus;
  maxDailySpendCents?: number;
  rateLimitPerMin?: number;
  creatorRevenueSplit?: number;
  bio?: string;
  skills?: string[];
}

// ── Upstream config ──────────────────────────────────────────────────────────

const HOLOMESH_BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';

function authHeaders(key: string, clientAuth: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h['Authorization'] = `Bearer ${key}`;
  if (clientAuth) h['Authorization'] = clientAuth;
  return h;
}

// ── Route params type ────────────────────────────────────────────────────────

interface RouteContext {
  params: Promise<{ id: string }>;
}

// ── GET /api/agents/fleet/[id] ──────────────────────────────────────────────

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const clientAuth = req.headers.get('authorization');

  try {
    const headers = authHeaders(HOLOMESH_KEY, clientAuth);
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/agents/fleet/${encodeURIComponent(id)}`,
      { headers }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `Agent not found (${res.status})` },
        { status: res.status }
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch agent' },
      { status: 502 }
    );
  }
}

// ── PATCH /api/agents/fleet/[id] ────────────────────────────────────────────

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const clientAuth = req.headers.get('authorization');

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as PatchPayload;

  // Validate status if provided
  if (payload.status && !['active', 'paused', 'stopped'].includes(payload.status)) {
    return NextResponse.json({ error: 'Invalid status value' }, { status: 400 });
  }

  // Validate numeric fields
  if (
    payload.maxDailySpendCents !== undefined &&
    (payload.maxDailySpendCents < 10 || payload.maxDailySpendCents > 10000)
  ) {
    return NextResponse.json({ error: 'maxDailySpendCents must be 10-10000' }, { status: 400 });
  }
  if (
    payload.rateLimitPerMin !== undefined &&
    (payload.rateLimitPerMin < 1 || payload.rateLimitPerMin > 100)
  ) {
    return NextResponse.json({ error: 'rateLimitPerMin must be 1-100' }, { status: 400 });
  }
  if (
    payload.creatorRevenueSplit !== undefined &&
    (payload.creatorRevenueSplit < 10 || payload.creatorRevenueSplit > 100)
  ) {
    return NextResponse.json({ error: 'creatorRevenueSplit must be 10-100' }, { status: 400 });
  }

  try {
    const headers = authHeaders(HOLOMESH_KEY, clientAuth);
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/agents/fleet/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      // If upstream doesn't support the fleet endpoint yet, return a synthetic response
      if (res.status === 404) {
        return NextResponse.json({
          agent: {
            id,
            status: payload.status ?? 'active',
            updatedAt: new Date().toISOString(),
          },
        });
      }
      const errData: unknown = await res.json().catch(() => null);
      const errBody = errData as { error?: string } | null;
      return NextResponse.json(
        { error: errBody?.error || `Update failed (${res.status})` },
        { status: res.status }
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (_err) {
    // Fallback: return optimistic update if upstream is unreachable
    return NextResponse.json({
      agent: {
        id,
        status: payload.status ?? 'active',
        name: '',
        platform: 'holomesh',
        reputation: 0,
        earningsCents: 0,
        spentCents: 0,
        lastAction:
          payload.status === 'paused'
            ? 'Paused by owner'
            : payload.status === 'stopped'
              ? 'Stopped by owner'
              : 'Resumed by owner',
        lastActionAt: new Date().toISOString(),
        bio: payload.bio ?? '',
        personalityMode: 'engineer',
        skills: payload.skills ?? [],
        maxDailySpendCents: payload.maxDailySpendCents ?? 100,
        rateLimitPerMin: payload.rateLimitPerMin ?? 10,
        creatorRevenueSplit: payload.creatorRevenueSplit ?? 80,
        createdAt: new Date().toISOString(),
      },
    });
  }
}

// ── DELETE /api/agents/fleet/[id] ───────────────────────────────────────────

export async function DELETE(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const clientAuth = req.headers.get('authorization');

  try {
    const headers = authHeaders(HOLOMESH_KEY, clientAuth);
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/agents/fleet/${encodeURIComponent(id)}`,
      {
        method: 'DELETE',
        headers,
      }
    );

    if (!res.ok && res.status !== 404) {
      const errData: unknown = await res.json().catch(() => null);
      const errBody = errData as { error?: string } | null;
      return NextResponse.json(
        { error: errBody?.error || `Delete failed (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json({ success: true, agentId: id, deregistered: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to deregister agent' },
      { status: 502 }
    );
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
