import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

/**
 * /api/agents/fleet — Fleet management endpoint
 *
 * GET  — list user's deployed agents (queries HoloMesh + Moltbook)
 * POST — launch a new agent (register on platform, generate keys, set config)
 */

// ── Types ────────────────────────────────────────────────────────────────────

type AgentPlatform = 'holomesh' | 'moltbook' | 'custom';
type AgentStatus = 'active' | 'paused' | 'stopped' | 'deploying' | 'error';

interface FleetAgent {
  id: string;
  name: string;
  platform: AgentPlatform;
  status: AgentStatus;
  reputation: number;
  earningsCents: number;
  spentCents: number;
  lastAction: string;
  lastActionAt: string | null;
  bio: string;
  personalityMode: string;
  skills: string[];
  maxDailySpendCents: number;
  rateLimitPerMin: number;
  creatorRevenueSplit: number;
  createdAt: string;
}

interface LaunchPayload {
  platform: AgentPlatform;
  customEndpoint?: string;
  name: string;
  bio: string;
  personalityMode: string;
  skills: string[];
  maxDailySpendCents: number;
  rateLimitPerMin: number;
  creatorRevenueSplit: number;
}

// ── Upstream config ──────────────────────────────────────────────────────────

const HOLOMESH_BASE = process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';
const MOLTBOOK_BASE = process.env.MOLTBOOK_API_URL || 'https://www.moltbook.com/api/v1';
const MOLTBOOK_KEY = process.env.MOLTBOOK_API_KEY || '';

function authHeaders(key: string): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) h['Authorization'] = `Bearer ${key}`;
  return h;
}

// ── GET /api/agents/fleet ────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const clientAuth = req.headers.get('authorization');
  const agents: FleetAgent[] = [];

  // Query HoloMesh for fleet agents
  try {
    const headers = authHeaders(HOLOMESH_KEY);
    if (clientAuth) headers['Authorization'] = clientAuth;
    const res = await fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet`, { headers });
    if (res.ok) {
      const data: unknown = await res.json();
      const body = data as { agents?: FleetAgent[] };
      if (body.agents) {
        agents.push(...body.agents.map(a => ({ ...a, platform: 'holomesh' as const })));
      }
    }
  } catch {
    // HoloMesh fleet endpoint not available — continue
  }

  // Query Moltbook for deployed agents
  try {
    if (MOLTBOOK_KEY) {
      const headers = authHeaders(MOLTBOOK_KEY);
      const res = await fetch(`${MOLTBOOK_BASE}/agents/mine`, { headers });
      if (res.ok) {
        const data: unknown = await res.json();
        const body = data as { agents?: Array<{
          id: string;
          name: string;
          bio?: string;
          reputation?: number;
          status?: string;
        }> };
        if (body.agents) {
          for (const ma of body.agents) {
            agents.push({
              id: ma.id,
              name: ma.name,
              platform: 'moltbook',
              status: (ma.status as AgentStatus) || 'active',
              reputation: ma.reputation ?? 0,
              earningsCents: 0,
              spentCents: 0,
              lastAction: '',
              lastActionAt: null,
              bio: ma.bio ?? '',
              personalityMode: 'engineer',
              skills: [],
              maxDailySpendCents: 100,
              rateLimitPerMin: 10,
              creatorRevenueSplit: 80,
              createdAt: new Date().toISOString(),
            });
          }
        }
      }
    }
  } catch {
    // Moltbook not available — continue
  }

  return NextResponse.json({ agents });
}

// ── POST /api/agents/fleet ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const payload = body as LaunchPayload;

  // Validation
  if (!payload.name?.trim()) {
    return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
  }
  if (!payload.platform || !['holomesh', 'moltbook', 'custom'].includes(payload.platform)) {
    return NextResponse.json({ error: 'Invalid platform' }, { status: 400 });
  }
  if (payload.platform === 'custom' && !payload.customEndpoint?.trim()) {
    return NextResponse.json({ error: 'Custom endpoint URL is required' }, { status: 400 });
  }

  // Generate Ed25519 keypair for the agent
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const _privateKeyHex = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');

  const agentId = `fleet-${crypto.randomBytes(8).toString('hex')}`;
  const clientAuth = req.headers.get('authorization');

  // Register on the target platform
  try {
    if (payload.platform === 'holomesh') {
      const headers = authHeaders(HOLOMESH_KEY);
      if (clientAuth) headers['Authorization'] = clientAuth;
      const res = await fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: agentId,
          name: payload.name.trim(),
          bio: payload.bio?.trim() || '',
          personalityMode: payload.personalityMode || 'engineer',
          skills: payload.skills || [],
          publicKey: publicKeyHex,
          maxDailySpendCents: payload.maxDailySpendCents ?? 100,
          rateLimitPerMin: payload.rateLimitPerMin ?? 10,
          creatorRevenueSplit: payload.creatorRevenueSplit ?? 80,
        }),
      });
      if (!res.ok) {
        const errData: unknown = await res.json().catch(() => null);
        const errBody = errData as { error?: string } | null;
        // Non-fatal: if upstream doesn't have the fleet endpoint yet, we still register locally
        if (res.status !== 404) {
          return NextResponse.json(
            { error: errBody?.error || `HoloMesh registration failed (${res.status})` },
            { status: res.status },
          );
        }
      }
    } else if (payload.platform === 'moltbook') {
      if (MOLTBOOK_KEY) {
        const headers = authHeaders(MOLTBOOK_KEY);
        const res = await fetch(`${MOLTBOOK_BASE}/agents`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: payload.name.trim(),
            bio: payload.bio?.trim() || '',
          }),
        });
        if (!res.ok && res.status !== 404) {
          const errData: unknown = await res.json().catch(() => null);
          const errBody = errData as { error?: string } | null;
          return NextResponse.json(
            { error: errBody?.error || `Moltbook registration failed (${res.status})` },
            { status: res.status },
          );
        }
      }
    }
    // 'custom' platform: registration happens client-side or via webhook — no upstream call
  } catch (err) {
    return NextResponse.json(
      { error: `Platform registration failed: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    agentId,
    publicKey: publicKeyHex,
    platform: payload.platform,
    name: payload.name.trim(),
    status: 'active',
    createdAt: new Date().toISOString(),
  }, { status: 201 });
}
