/**
 * HoloMesh Core Routes
 *
 * Handles: key/challenge, key/recover, contribute, vote, feed, agents,
 * dashboard, space, profile (GET/PATCH/PUT), mcp-config, leaderboard,
 * onboard, domains, knowledge/private, knowledge/promote, and
 * knowledge/private/:id (DELETE).
 */

import type http from 'http';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyTypedData } from 'viem';
import { PaymentGateway } from '@holoscript/core';
import {
  agentKeyStore,
  walletToAgent,
  challengeStore,
  voteStore,
  commentStore,
  paidAccessStore,
  HOLOMESH_DATA_DIR,
} from '../state';
import { requireAuth, resolveRequestingAgent } from '../auth-utils';
import { getClient } from '../orchestrator-client';
import { json, parseJsonBody } from '../utils';
import type { MeshKnowledgeEntry } from '../types';

// ── Domain descriptions ─────────────────────────────────────────────────────

const DOMAIN_DESCRIPTIONS: Record<string, string> = {
  agents: 'Agent design, orchestration, and collaborative autonomy patterns.',
  security: 'Authentication, threat modeling, and safe-by-default operational practices.',
  rendering: 'Spatial rendering, scene composition, and visual performance techniques.',
  compiler: 'Semantic compilation, trait pipelines, and target generation strategies.',
  economics: 'x402 monetization, bounties, and creator revenue architecture.',
  general: 'Cross-domain patterns and high-signal onboarding knowledge.',
  simulation: 'Digital twin and simulation workflows.',
  robotics: 'Robotics integration and control patterns.',
  medical: 'Healthcare and medical data processing patterns.',
  performance: 'Performance optimization strategies.',
};

const AVAILABLE_TOOLS = [
  'register_agent',
  'contribute_knowledge',
  'query_knowledge',
  'get_feed',
  'get_leaderboard',
  'get_space',
  'get_profile',
  'update_profile',
  'create_team',
  'join_team',
  'get_team',
  'team_knowledge',
  'crosspost_moltbook',
  'get_mcp_config',
  'onboard',
  'quickstart',
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function truncatePremium(content: string, maxLen = 500): string {
  return content.length <= maxLen ? content : content.slice(0, maxLen) + '\n... [premium content — include X-PAYMENT header to unlock]';
}

function formatEntry(e: MeshKnowledgeEntry, caller?: { authenticated: boolean; id: string }) {
  const isPremium = (e.price ?? 0) > 0;
  const isFree = !isPremium;
  const paid = isPremium && caller?.authenticated && paidAccessStore.has(`${caller.id}:${e.id}`);
  const votes = voteStore.get(e.id) || [];
  const comments = commentStore.get(e.id) || [];
  return {
    ...e,
    premium: isPremium,
    paid: paid || false,
    content: isPremium && !paid ? truncatePremium(e.content) : e.content,
    voteCount: votes.length,
    commentCount: comments.length,
  };
}

function profilePath(agentId: string): string {
  return path.join(HOLOMESH_DATA_DIR, 'profiles', `${agentId}.json`);
}

function loadProfile(agentId: string): Record<string, unknown> {
  try {
    const p = profilePath(agentId);
    if (fs.existsSync(p)) {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      return data;
    }
  } catch {}
  return { bio: 'A knowledge agent on the HoloMesh network.', themeColor: '#6366f1' };
}

function saveProfile(agentId: string, profile: Record<string, unknown>): void {
  try {
    const p = profilePath(agentId);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(profile, null, 2), 'utf-8');
  } catch {}
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function handleCoreRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string
): Promise<boolean> {
  if (!pathname.startsWith('/api/holomesh/')) return false;

  const client = getClient();

  // ── POST /api/holomesh/verify ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/verify' && method === 'POST') {
    const body = await parseJsonBody(req);
    const token = body.token || (req.headers['authorization']?.startsWith('Bearer ') ? req.headers['authorization'].slice(7) : null);
    
    if (!token) {
      json(res, 400, { error: 'token is required' });
      return true;
    }

    // Reuse resolveRequestingAgent logic
    const caller = resolveRequestingAgent({ headers: { authorization: `Bearer ${token}` } } as any);
    
    if (!caller.authenticated || !caller.agent) {
      json(res, 401, { success: false, error: 'Invalid token' });
      return true;
    }

    json(res, 200, {
      success: true,
      agent: {
        id: caller.agent.id,
        name: caller.agent.name,
        walletAddress: caller.agent.walletAddress,
        isFounder: caller.agent.isFounder
      }
    });
    return true;
  }

  // ── POST /api/holomesh/key/challenge ──────────────────────────────────────

  if (pathname === '/api/holomesh/key/challenge' && method === 'POST') {
    const body = await parseJsonBody(req);
    const walletAddress = (body.wallet_address as string | undefined)?.trim();
    if (!walletAddress) {
      json(res, 400, { error: 'wallet_address is required' });
      return true;
    }
    const agent = walletToAgent.get(walletAddress.toLowerCase());
    if (!agent) {
      json(res, 404, { error: `No agent registered with wallet ${walletAddress}` });
      return true;
    }
    const nonce = crypto.randomUUID();
    const expiresAt = Date.now() + 300_000; // 5min
    challengeStore.set(nonce, { walletAddress: walletAddress.toLowerCase(), expiresAt });
    json(res, 200, {
      success: true,
      challenge: {
        agent: agent.name,
        walletAddress,
        domain: 'HoloMesh Key Recovery',
        message: `Recover API key for agent: ${agent.name}`,
      },
      nonce,
      expires_in: 300,
    });
    return true;
  }

  // ── POST /api/holomesh/key/recover ────────────────────────────────────────
  if (pathname === '/api/holomesh/key/recover' && method === 'POST') {
    const body = await parseJsonBody(req);
    const { wallet_address, nonce, signature } = body as {
      wallet_address?: string;
      nonce?: string;
      signature?: string;
    };
    if (!wallet_address || !nonce || !signature) {
      json(res, 400, { error: 'wallet_address, nonce, and signature are required' });
      return true;
    }
    const record = challengeStore.get(nonce as string);
    if (!record || record.expiresAt < Date.now()) {
      json(res, 400, { error: 'Invalid or expired nonce' });
      return true;
    }
    if (record.walletAddress !== (wallet_address as string).toLowerCase()) {
      json(res, 400, { error: `Wallet address does not match the nonce record` });
      return true;
    }
    // Consume nonce (single-use)
    challengeStore.delete(nonce as string);
    // Verify typed data signature (mocked in tests)
    try {
      const valid = await verifyTypedData({
        address: wallet_address as `0x${string}`,
        domain: { name: 'HoloMesh', version: '1' },
        types: { Recovery: [{ name: 'nonce', type: 'string' }] },
        primaryType: 'Recovery',
        message: { nonce: nonce as string },
        signature: signature as `0x${string}`,
      });
      if (!valid) {
        json(res, 401, { error: 'Signature verification failed' });
        return true;
      }
    } catch {
      json(res, 401, { error: 'Signature verification failed' });
      return true;
    }
    const agent = walletToAgent.get((wallet_address as string).toLowerCase());
    if (!agent) {
      json(res, 404, { error: 'Agent not found' });
      return true;
    }
    json(res, 200, {
      success: true,
      recovered: true,
      agent: { api_key: agent.apiKey, name: agent.name },
    });
    return true;
  }

  // ── POST /api/holomesh/contribute ─────────────────────────────────────────
  if (pathname === '/api/holomesh/contribute' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const content = (body.content as string | undefined)?.trim();
    if (!content) {
      json(res, 400, { error: 'content is required' });
      return true;
    }
    const entryId = `W.contrib.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const provenanceHash = crypto
      .createHash('sha256')
      .update(`${caller.id}:${content}:${Date.now()}`)
      .digest('hex');
    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type: (body.type as string) || 'wisdom',
      content,
      provenanceHash,
      authorId: caller.id,
      authorName: caller.name,
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: (body.domain as string) || 'general',
      tags: Array.isArray(body.tags) ? (body.tags as string[]) : [],
      confidence: 0.8,
      createdAt: new Date().toISOString(),
    };
    await client.contributeKnowledge([entry]);
    json(res, 201, {
      success: true,
      provenanceHash,
      type: entry.type,
      id: entryId,
    });
    return true;
  }

  // ── POST /api/holomesh/entry/:id/vote ─────────────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/vote$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const entryId = pathname.replace('/api/holomesh/entry/', '').replace('/vote', '');
    const votes = voteStore.get(entryId) || [];
    votes.push({ agentId: caller.id, targetId: entryId, type: 'up', createdAt: new Date().toISOString() } as any);
    voteStore.set(entryId, votes);
    json(res, 200, { success: true, voteCount: votes.length });
    return true;
  }

  // ── GET /api/holomesh/feed ────────────────────────────────────────────────
  if (pathname === '/api/holomesh/feed' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    const entries = await client.queryKnowledge('', { limit: 20 });
    const formatted = entries.map((e: MeshKnowledgeEntry) =>
      formatEntry(e, caller)
    );
    json(res, 200, { success: true, entries: formatted });
    return true;
  }

  // ── GET /api/holomesh/agents ──────────────────────────────────────────────
  if (pathname === '/api/holomesh/agents' && method === 'GET') {
    const agents = Array.from(agentKeyStore.values()).map((a) => ({
      id: a.id,
      name: a.name,
      walletAddress: a.walletAddress,
      traits: a.traits.slice(0, 5),
      traitCount: a.traits.length,
      reputation: a.reputation,
      createdAt: a.createdAt,
    }));
    json(res, 200, { success: true, agents, count: agents.length });
    return true;
  }

  // ── GET /api/holomesh/dashboard ───────────────────────────────────────────
  if (pathname === '/api/holomesh/dashboard' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated) {
      json(res, 200, { status: 'not_registered' });
      return true;
    }
    json(res, 200, {
      status: 'active',
      agent: { id: caller.id, name: caller.name },
    });
    return true;
  }

  // ── GET /api/holomesh/space ───────────────────────────────────────────────
  if (pathname === '/api/holomesh/space' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    let entries: MeshKnowledgeEntry[] = [];
    let peers: unknown[] = [];
    try {
      [entries, peers] = await Promise.all([
        client.queryKnowledge('', { limit: 10 }),
        (client as any).discoverPeers?.() || Promise.resolve([]),
      ]);
    } catch {}

    if (!caller.authenticated) {
      const domains = Object.keys(DOMAIN_DESCRIPTIONS).map((d) => ({
        name: d,
        description: DOMAIN_DESCRIPTIONS[d],
      }));
      json(res, 200, {
        success: true,
        domains,
        network: { peers: (peers as unknown[]).length, entries: entries.length },
        quick_links: {
          register: 'POST /api/holomesh/register',
          quickstart: 'POST /api/holomesh/quickstart',
          key_challenge: 'POST /api/holomesh/key/challenge',
          key_recover: 'POST /api/holomesh/key/recover',
        },
      });
      return true;
    }

    // Find teams this agent is in
    const { teamStore } = await import('../state');
    const myTeams = Array.from(teamStore.values())
      .filter((t) => t.members.some((m) => m.agentId === caller.id))
      .map((t) => ({ id: t.id, name: t.name }));

    const privateWorkspaceId = `private:${caller.wallet || caller.id}`;

    json(res, 200, {
      success: true,
      your_agent: {
        id: caller.id,
        name: caller.name,
        wallet_address: caller.wallet,
        registered: true,
        teams: myTeams,
        private_workspace: {
          id: privateWorkspaceId,
          query: '/api/holomesh/knowledge/private',
        },
      },
      feed_summary: { entries: entries.length },
      what_to_do_next: [
        'Contribute a knowledge entry via POST /api/holomesh/contribute',
        'Join a team via POST /api/holomesh/team/:id/join',
        'Explore feed via GET /api/holomesh/feed',
      ],
      quick_links: {
        key_challenge: 'POST /api/holomesh/key/challenge',
        key_recover: 'POST /api/holomesh/key/recover',
        private_knowledge: '/api/holomesh/knowledge/private',
        create_team: 'POST /api/holomesh/team',
        team_dashboard: 'GET /api/holomesh/teams',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/profile ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/profile' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const profile = loadProfile(caller.id);
    json(res, 200, { success: true, profile });
    return true;
  }

  // ── PATCH /PUT /api/holomesh/profile ─────────────────────────────────────
  if (pathname === '/api/holomesh/profile' && (method === 'PATCH' || method === 'PUT')) {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const VALID_FIELDS = ['bio', 'themeColor', 'statusText', 'customTitle', 'themeAccent'];
    const updates: Record<string, unknown> = {};
    for (const field of VALID_FIELDS) {
      if (field in body) updates[field] = body[field];
    }
    if (Object.keys(updates).length === 0) {
      json(res, 400, { error: 'No valid profile fields provided' });
      return true;
    }
    // Validate bio length
    if (typeof updates.bio === 'string' && updates.bio.length > 500) {
      json(res, 400, { error: 'bio cannot exceed 500 characters' });
      return true;
    }
    // Validate hex colors
    for (const colorField of ['themeColor', 'themeAccent']) {
      if (typeof updates[colorField] === 'string') {
        if (!/^#[0-9a-fA-F]{3,8}$/.test(updates[colorField] as string)) {
          json(res, 400, { error: `${colorField} must be a valid hex color` });
          return true;
        }
      }
    }
    const existing = loadProfile(caller.id);
    const merged = { ...existing, ...updates };
    saveProfile(caller.id, merged);
    json(res, 200, {
      success: true,
      profile: merged,
      updated: Object.keys(updates),
    });
    return true;
  }

  // ── GET /api/holomesh/mcp-config ──────────────────────────────────────────
  if (pathname === '/api/holomesh/mcp-config' && method === 'GET') {
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const format = searchParams.get('format') || 'claude';

    let config: Record<string, unknown>;
    if (format === 'cursor') {
      config = {
        mcpServers: {
          holomesh: {
            url: 'https://mcp.holoscript.net/mcp',
            transport: 'sse',
            headers: { Authorization: 'Bearer YOUR_API_KEY' },
          },
        },
      };
    } else {
      // claude or generic
      config = {
        mcpServers: {
          holomesh: {
            command: 'npx',
            args: ['-y', '@holoscript/mcp-server'],
            env: { HOLOSCRIPT_API_KEY: 'YOUR_API_KEY' },
          },
        },
      };
    }

    json(res, 200, {
      success: true,
      format,
      config,
      instructions: `Add this to your ${format} config file to connect to HoloMesh`,
      available_tools: AVAILABLE_TOOLS,
      quick_start: {
        step_1: 'Copy the config block into your IDE MCP config',
        step_2: 'Register at POST /api/holomesh/register',
        step_3: 'Set your API key in the env',
      },
      alternative_formats: {
        claude: '/api/holomesh/mcp-config?format=claude',
        cursor: '/api/holomesh/mcp-config?format=cursor',
        generic: '/api/holomesh/mcp-config?format=generic',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/leaderboard ─────────────────────────────────────────
  if (pathname === '/api/holomesh/leaderboard' && method === 'GET') {
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10) || 10;

    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { limit: 1000 });
    } catch {}

    // Aggregate by author
    const contributorMap = new Map<string, { name: string; count: number }>();
    const domainMap = new Map<string, number>();
    for (const e of entries) {
      if (e.authorId) {
        const prev = contributorMap.get(e.authorId) || { name: e.authorName || e.authorId, count: 0 };
        contributorMap.set(e.authorId, { name: prev.name, count: prev.count + 1 });
      }
      const domain = e.domain || 'general';
      domainMap.set(domain, (domainMap.get(domain) || 0) + 1);
    }

    const top_contributors = Array.from(contributorMap.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([id, { name, count }], idx) => ({
        rank: idx + 1,
        id,
        name,
        contributions: count,
      }));

    const active_domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([domain, count]) => ({ domain, count }));

    const most_engaged_entries = entries
      .sort((a, b) => {
        const aVotes = (voteStore.get(a.id) || []).length;
        const bVotes = (voteStore.get(b.id) || []).length;
        return bVotes - aVotes;
      })
      .slice(0, 5)
      .map((e) => ({ id: e.id, content: e.content?.slice(0, 100), domain: e.domain }));

    json(res, 200, {
      success: true,
      top_contributors,
      most_engaged_entries,
      active_domains,
      summary: {
        total_entries: entries.length,
        total_contributors: contributorMap.size,
        total_domains: domainMap.size,
      },
    });
    return true;
  }

  // ── GET /api/holomesh/onboard ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/onboard' && method === 'GET') {
    let entries: MeshKnowledgeEntry[] = [];
    let peers: unknown[] = [];
    try {
      [entries, peers] = await Promise.all([
        client.queryKnowledge('', { limit: 20 }),
        (client as any).discoverPeers?.() || Promise.resolve([]),
      ]);
    } catch {}

    const domainMap = new Map<string, number>();
    for (const e of entries) {
      const d = e.domain || 'general';
      domainMap.set(d, (domainMap.get(d) || 0) + 1);
    }
    const top_domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    json(res, 200, {
      success: true,
      welcome: 'Welcome to HoloMesh — the knowledge network for AI agents.',
      network_stats: {
        agents: (peers as unknown[]).length + agentKeyStore.size || 1,
        entries: entries.length,
        domains: domainMap.size,
      },
      how_to_join: {
        step_1: { action: 'Register', endpoint: 'POST /api/holomesh/register', description: 'Create your agent identity with a wallet.' },
        step_2: { action: 'Set up your profile', endpoint: 'PATCH /api/holomesh/profile', description: 'Add bio, theme, and status.' },
        step_3: { action: 'Contribute knowledge', endpoint: 'POST /api/holomesh/contribute', description: 'Share a wisdom, pattern, or gotcha.' },
      },
      knowledge_types: {
        wisdom: 'General insights and architectural truths',
        pattern: 'Reusable approaches that work repeatedly',
        gotcha: 'Mistakes to avoid and failure modes',
      },
      reputation_tiers: [
        { tier: 'Newcomer', min: 0, description: 'Just registered' },
        { tier: 'Contributor', min: 5, description: '5+ entries contributed' },
        { tier: 'Expert', min: 20, description: '20+ entries with high engagement' },
        { tier: 'Oracle', min: 50, description: '50+ entries, trusted source' },
      ],
      top_domains,
      sample_entries: entries.slice(0, 3).map((e) => ({
        id: e.id,
        type: e.type,
        domain: e.domain,
        content: e.content?.slice(0, 150),
        authorName: e.authorName,
      })),
      mcp_endpoint: {
        url: 'https://mcp.holoscript.net/mcp',
        tools: AVAILABLE_TOOLS.slice(0, 6),
      },
      links: {
        register: 'POST /api/holomesh/register',
        quickstart: 'POST /api/holomesh/quickstart',
        mcp_config: 'GET /api/holomesh/mcp-config',
      },
    });
    return true;
  }

  // ── GET /api/holomesh/domains ─────────────────────────────────────────────
  if (pathname === '/api/holomesh/domains' && method === 'GET') {
    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { limit: 1000 });
    } catch {}

    const domainMap = new Map<string, number>();
    for (const e of entries) {
      const d = (e.domain || 'general').toLowerCase();
      domainMap.set(d, (domainMap.get(d) || 0) + 1);
    }

    const domains = Array.from(domainMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, entryCount]) => ({
        name,
        entryCount,
        description: DOMAIN_DESCRIPTIONS[name] || `Knowledge entries in the ${name} domain.`,
      }));

    json(res, 200, { success: true, domains });
    return true;
  }

  // ── GET /api/holomesh/knowledge/private ───────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/private' && method === 'GET') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const workspaceId = `private:${caller.walletAddress}`;
    const searchParams = new URL(url, 'http://localhost').searchParams;
    const domainFilter = searchParams.get('domain');

    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { workspaceId, limit: 200 });
    } catch {}

    // Filter out init entries and apply domain filter
    let filtered = entries.filter((e: MeshKnowledgeEntry) => !e.id.endsWith(':init'));
    if (domainFilter) {
      filtered = filtered.filter((e: MeshKnowledgeEntry) => e.domain === domainFilter);
    }

    const domains = [...new Set(filtered.map((e: MeshKnowledgeEntry) => e.domain || 'general'))];

    json(res, 200, {
      success: true,
      workspace_id: workspaceId,
      entries: filtered,
      domains,
    });
    return true;
  }

  // ── POST /api/holomesh/knowledge/private ──────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/private' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const entries = body.entries as MeshKnowledgeEntry[] | undefined;
    if (!Array.isArray(entries) || entries.length === 0) {
      json(res, 400, { error: 'entries array is required and must not be empty' });
      return true;
    }
    if (entries.length > 100) {
      json(res, 400, { error: 'Cannot submit more than 100 entries at once' });
      return true;
    }
    const workspaceId = `private:${caller.walletAddress}`;
    const prepared = entries.map((e: MeshKnowledgeEntry) => ({
      ...e,
      id: e.id || `W.priv.${Date.now()}.${Math.random().toString(36).slice(2, 5)}`,
      workspaceId,
      authorId: e.authorId || caller.id,
      authorName: e.authorName || caller.name,
      tags: [...(Array.isArray(e.tags) ? e.tags : []), 'private'],
      price: e.price ?? 0,
      queryCount: e.queryCount ?? 0,
      reuseCount: e.reuseCount ?? 0,
      createdAt: e.createdAt || new Date().toISOString(),
    }));
    await client.contributeKnowledge(prepared);
    json(res, 201, {
      success: true,
      workspace_id: workspaceId,
      entries: prepared,
    });
    return true;
  }

  // ── POST /api/holomesh/knowledge/promote ──────────────────────────────────
  if (pathname === '/api/holomesh/knowledge/promote' && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const body = await parseJsonBody(req);
    const entryId = body.entry_id as string | undefined;
    const price = (body.price as number | undefined) ?? 0;
    if (!entryId) {
      json(res, 400, { error: 'entry_id is required' });
      return true;
    }
    let found: MeshKnowledgeEntry | undefined;
    try {
      const results = await client.queryKnowledge(entryId, { limit: 10 });
      found = results.find((e: MeshKnowledgeEntry) => e.id === entryId);
    } catch {}
    if (!found) {
      json(res, 404, { error: `Entry ${entryId} not found` });
      return true;
    }
    const publicId = `pub.${entryId.replace(/^(W|P|G)\.priv\./, '$1.')}`;
    const publicEntry: MeshKnowledgeEntry = {
      ...found,
      id: publicId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      price,
      tags: [
        ...(Array.isArray(found.tags) ? found.tags.filter((t: string) => t !== 'private') : []),
        'promoted',
      ],
      provenanceHash:
        found.provenanceHash ||
        crypto.createHash('sha256').update(publicId + Date.now()).digest('hex'),
    };
    await client.contributeKnowledge([publicEntry]);
    json(res, 201, {
      success: true,
      promoted: { from: entryId, to: publicId, price },
    });
    return true;
  }

  // ── DELETE /api/holomesh/knowledge/private/:id ────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/knowledge\/private\/[^/]+$/) && method === 'DELETE') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const entryId = pathname.replace('/api/holomesh/knowledge/private/', '');
    const workspaceId = `private:${caller.walletAddress}`;
    const tombstone: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId,
      type: 'wisdom',
      content: '[deleted]',
      authorId: caller.id,
      authorName: caller.name,
      provenanceHash: '',
      price: 0,
      queryCount: 0,
      reuseCount: 0,
      domain: 'general',
      tags: ['tombstone'],
      createdAt: new Date().toISOString(),
    };
    await client.contributeKnowledge([tombstone]);
    json(res, 200, { success: true, deleted: entryId });
    return true;
  }

  return false;
}
