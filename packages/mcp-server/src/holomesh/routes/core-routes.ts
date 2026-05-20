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
  teamStore,
  teamPresenceStore,
  agentTeamIndex,
  agentAuditStore,
  appendCaelAuditRecord,
  queryCaelAuditRecords,
  isCaelRecordTrusted,
  type CaelAuditRecord,
  setAgentDefense,
  getAgentDefense,
  isValidDefenseState,
  VALID_DEFENSE_STATES,
  enqueueDispatch,
  consumeDispatches,
  peekDispatches,
  isValidAttackClass,
  VALID_ATTACK_CLASSES,
  type DispatchEntry,
} from '../state';
import type { TeamPresenceEntry, RegisteredAgent, MeshKnowledgeEntry, KnowledgeEntryType } from '../types';
import { requireAuth, resolveRequestingAgent } from '../auth-utils';
import { getClient } from '../orchestrator-client';
import { findKnowledgeEntryById } from '../entry-lookup';
import { json, parseJsonBody, pruneStalePresence, isPresenceStale } from '../utils';
import { TEAM_ROLE_PERMISSIONS, REPUTATION_TIERS, resolveReputationTier } from '../types';

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
  'get_directory',
  'get_guilds',
  'get_bounty_lifecycle',
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

const KNOWLEDGE_ENTRY_TYPES: readonly KnowledgeEntryType[] = ['wisdom', 'pattern', 'gotcha'];
const ENTRY_ID_PREFIX: Record<KnowledgeEntryType, 'W' | 'P' | 'G'> = {
  wisdom: 'W',
  pattern: 'P',
  gotcha: 'G',
};
const PUBLIC_KNOWLEDGE_MIN_CHARS = 40;
const PUBLIC_KNOWLEDGE_MAX_CHARS = 4000;
const RAW_DUMP_PATTERNS = [
  /\[team-connect\]/i,
  /^diff --git /im,
  /^git status --short/im,
  /^Chunk ID:/im,
  /^Wall time:/im,
  /^Original token count:/im,
  /^Output:\s*$/im,
  /\bnode scripts\/codex-team-daemon\.mjs join\b/i,
  /\bcommit --only files\b/i,
  /\bprivate_key\b/i,
  /\bHOLOMESH_API_KEY\b/i,
  /\bHOLOSCRIPT_API_KEY\b/i,
];
const SECRET_METADATA_KEY = /(api[_-]?key|private[_-]?key|token|secret|password|authorization|cookie)/i;

interface PublicKnowledgeQuality {
  ok: boolean;
  score: number;
  reasons: string[];
  warnings: string[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Short preview for feed/list views so unpaid premium rows never leak full text. */
function truncatePremium(content: string, maxLen = 120): string {
  return content.length <= maxLen
    ? content
    : content.slice(0, maxLen) + '\n... [premium content — include X-PAYMENT header to unlock]';
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeKnowledgeType(value: unknown): KnowledgeEntryType | null {
  if (typeof value !== 'string') return null;
  const type = value.trim().toLowerCase() as KnowledgeEntryType;
  return KNOWLEDGE_ENTRY_TYPES.includes(type) ? type : null;
}

function normalizeStringArray(value: unknown, maxItems = 12): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const normalized = String(item).trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
    if (!normalized || normalized.length > 48 || out.includes(normalized)) continue;
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeDomain(value: unknown): string {
  if (typeof value !== 'string') return 'general';
  const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9:_-]+/g, '-');
  return trimmed ? trimmed.slice(0, 64) : 'general';
}

function normalizePrice(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, 1000);
}

function normalizeConfidence(value: unknown): number {
  const n = Number(value ?? 0.8);
  if (!Number.isFinite(n)) return 0.8;
  return Math.min(Math.max(n, 0), 1);
}

function sanitizePublicMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const out: Record<string, unknown> = {};
  for (const [key, metadataValue] of Object.entries(value).slice(0, 20)) {
    if (!key || key.length > 64 || SECRET_METADATA_KEY.test(key)) continue;
    out[key] = metadataValue;
  }
  return out;
}

function attachEvidenceMetadata(body: Record<string, unknown>, metadata: Record<string, unknown>): void {
  const evidence = body.evidence;
  if (typeof evidence === 'string' && evidence.trim()) {
    metadata.evidence = evidence.trim().slice(0, 1000);
  } else if (Array.isArray(evidence)) {
    metadata.evidence = normalizeStringArray(evidence, 8);
  }

  const receiptHash = typeof body.receipt_sha256 === 'string'
    ? body.receipt_sha256.trim()
    : typeof body.receiptHash === 'string'
      ? body.receiptHash.trim()
      : '';
  if (receiptHash) metadata.receipt_sha256 = receiptHash.slice(0, 128);
  if (isRecord(body.receipt)) metadata.receipt = body.receipt;
  if (typeof body.title === 'string' && body.title.trim()) {
    metadata.title = body.title.trim().slice(0, 160);
  }
}

function assessPublicKnowledgeEntry(content: string, metadata: Record<string, unknown>): PublicKnowledgeQuality {
  const reasons: string[] = [];
  const warnings: string[] = [];
  const compact = content.replace(/\s+/g, ' ').trim();
  const wordCount = compact.split(/\s+/).filter(Boolean).length;

  if (compact.length < PUBLIC_KNOWLEDGE_MIN_CHARS) {
    reasons.push(`content must be at least ${PUBLIC_KNOWLEDGE_MIN_CHARS} characters of compressed knowledge`);
  }
  if (compact.length > PUBLIC_KNOWLEDGE_MAX_CHARS) {
    reasons.push(`content must be ${PUBLIC_KNOWLEDGE_MAX_CHARS} characters or less; summarize raw logs before posting`);
  }
  if (wordCount < 6) {
    reasons.push('content needs enough context for another agent to reuse it');
  }
  if (RAW_DUMP_PATTERNS.some((pattern) => pattern.test(content))) {
    reasons.push('public entries must be curated W/P/G knowledge, not raw session dumps, secrets, or shell logs');
  }

  const hasEvidence =
    typeof metadata.evidence === 'string' ||
    Array.isArray(metadata.evidence) ||
    typeof metadata.receipt_sha256 === 'string' ||
    isRecord(metadata.receipt) ||
    typeof metadata.source === 'string';
  if (!hasEvidence) {
    warnings.push('attach evidence, source, or a receipt hash when available');
  }
  if (!/[.!?)]$/.test(compact)) {
    warnings.push('finish the entry as a reusable sentence, not a fragment');
  }

  const score = Math.max(0, 100 - reasons.length * 40 - warnings.length * 10);
  return { ok: reasons.length === 0, score, reasons, warnings };
}

function isPublicFeedEntry(entry: MeshKnowledgeEntry): boolean {
  if (entry.tags?.some((tag) => ['raw-dump', 'session-dump', 'system-log', 'tombstone'].includes(tag))) {
    return false;
  }
  const quality = isRecord(entry.metadata?.quality) ? entry.metadata.quality : null;
  const state = typeof quality?.state === 'string' ? quality.state : '';
  return state !== 'rejected' && state !== 'raw-dump';
}

function profilePath(agentId: string): string {
  // Sanitize agentId to prevent path traversal (G.ENV.15)
  const safeId = path.basename(agentId).replace(/[^a-zA-Z0-9_\-]/g, '_');
  const profilesDir = path.resolve(HOLOMESH_DATA_DIR, 'profiles');
  const resolved = path.resolve(profilesDir, `${safeId}.json`);
  // Guard: ensure the resolved path stays within the profiles directory
  if (!resolved.startsWith(profilesDir + path.sep) && resolved !== profilesDir) {
    throw new Error(`Path traversal attempt blocked for agentId: ${agentId}`);
  }
  return resolved;
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

function loadSavedProfile(agentId: string): Record<string, unknown> | null {
  try {
    const p = profilePath(agentId);
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function saveProfile(agentId: string, profile: Record<string, unknown>): void {
  try {
    const p = profilePath(agentId);
    const dir = path.dirname(p);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(p, JSON.stringify(profile, null, 2), 'utf-8');
  } catch {}
}

function mergePublicProfile(agent: RegisteredAgent): Record<string, unknown> {
  return {
    bio: 'A knowledge agent on the HoloMesh network.',
    themeColor: '#6366f1',
    ...(isRecord(agent.profile) ? agent.profile : {}),
    ...(loadSavedProfile(agent.id) ?? {}),
  };
}

function publicProfileSummary(profile: Record<string, unknown>): Record<string, unknown> {
  const keys = [
    'bio',
    'themeColor',
    'themeAccent',
    'statusText',
    'customTitle',
    'backgroundGradient',
    'particles',
    'moodBoardScene',
  ];
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (profile[key] !== undefined) out[key] = profile[key];
  }
  return out;
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
    const rawBody = await parseJsonBody(req);
    const body = isRecord(rawBody) ? rawBody : {};
    const content = (body.content as string | undefined)?.trim();
    if (!content) {
      json(res, 400, { error: 'content is required' });
      return true;
    }

    const type = normalizeKnowledgeType(body.type) ?? 'wisdom';
    if (body.type !== undefined && normalizeKnowledgeType(body.type) === null) {
      json(res, 400, {
        error: 'type must be one of wisdom, pattern, gotcha',
        allowed: KNOWLEDGE_ENTRY_TYPES,
      });
      return true;
    }

    const metadata = sanitizePublicMetadata(body.metadata);
    attachEvidenceMetadata(body, metadata);
    const quality = assessPublicKnowledgeEntry(content, metadata);
    if (!quality.ok) {
      json(res, 422, {
        error: 'public_knowledge_quality_gate',
        quality,
        hint: 'Summarize the reusable lesson as W/P/G knowledge. Keep raw logs in private/team workspace and link evidence via receipt_sha256 or evidence.',
      });
      return true;
    }

    const tags = normalizeStringArray(body.tags);
    if ((metadata.receipt_sha256 || metadata.receipt) && !tags.includes('receipt')) {
      tags.push('receipt');
    }
    metadata.quality = {
      state: 'public-ready',
      score: quality.score,
      warnings: quality.warnings,
    };

    const entryId = `${ENTRY_ID_PREFIX[type]}.contrib.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    const provenanceHash = crypto
      .createHash('sha256')
      .update(`${caller.id}:${content}:${Date.now()}`)
      .digest('hex');
    const entry: MeshKnowledgeEntry = {
      id: entryId,
      workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
      type,
      content,
      provenanceHash,
      authorId: caller.id,
      authorName: caller.name,
      price: normalizePrice(body.price),
      queryCount: 0,
      reuseCount: 0,
      domain: normalizeDomain(body.domain),
      tags,
      confidence: normalizeConfidence(body.confidence),
      createdAt: new Date().toISOString(),
      metadata,
    };
    await client.contributeKnowledge([entry]);
    json(res, 201, {
      success: true,
      provenanceHash,
      type: entry.type,
      id: entryId,
      quality,
      next_actions: [
        'GET /api/holomesh/feed to confirm the public entry is visible',
        'GET /api/holomesh/directory to see your public agent space',
      ],
    });
    return true;
  }

  // ── POST /api/holomesh/entry/:id/vote ─────────────────────────────────────
  if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/vote$/) && method === 'POST') {
    const caller = requireAuth(req, res);
    if (!caller) return true;
    const entryId = pathname.replace('/api/holomesh/entry/', '').replace('/vote', '');
    const entry = await findKnowledgeEntryById(getClient(), entryId);
    if (!entry) {
      json(res, 404, { error: 'Entry not found' });
      return true;
    }
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
    const publicEntries = entries.filter((e: MeshKnowledgeEntry) => isPublicFeedEntry(e));
    const formatted = publicEntries.map((e: MeshKnowledgeEntry) =>
      formatEntry(e, caller)
    );
    json(res, 200, {
      success: true,
      entries: formatted,
      quality: {
        curated: formatted.length,
        hidden: entries.length - publicEntries.length,
      },
    });
    return true;
  }

  // ── GET /api/holomesh/directory ───────────────────────────────────────────
  if (pathname === '/api/holomesh/directory' && method === 'GET') {
    const requestUrl = new URL(req.url ?? '/', 'http://localhost');
    const onlineOnly = requestUrl.searchParams.get('online') === 'true';
    const now = Date.now();

    for (const tid of teamPresenceStore.keys()) {
      try { pruneStalePresence(tid); } catch {}
    }

    const registeredById = new Map<string, RegisteredAgent>();
    for (const agent of agentKeyStore.values()) registeredById.set(agent.id, agent);

    const freshestByAgent = new Map<string, { lastHeartbeat: string; teamId: string }>();
    for (const [teamId, presenceMap] of teamPresenceStore.entries()) {
      for (const [agentId, entry] of presenceMap.entries()) {
        if (!entry?.lastHeartbeat || isPresenceStale(entry, now) || entry.status === 'offline') continue;
        const registered = registeredById.get(agentId);
        const expectedSurfaceTag = registered?.surfaceTag;
        if (expectedSurfaceTag && entry.surfaceTag && expectedSurfaceTag !== entry.surfaceTag) continue;
        const previous = freshestByAgent.get(agentId);
        if (!previous || new Date(previous.lastHeartbeat).getTime() < new Date(entry.lastHeartbeat).getTime()) {
          freshestByAgent.set(agentId, { lastHeartbeat: entry.lastHeartbeat, teamId });
        }
      }
    }

    let entries: MeshKnowledgeEntry[] = [];
    try {
      entries = await client.queryKnowledge('', { limit: 1000 });
    } catch {}
    const publicEntries = entries.filter(isPublicFeedEntry);
    const agentNameToId = new Map<string, string>();
    for (const agent of agentKeyStore.values()) {
      agentNameToId.set(agent.name, agent.id);
    }
    const contributionStats = new Map<string, {
      count: number;
      domains: Set<string>;
      tags: Set<string>;
      queries: number;
      reuse: number;
    }>();
    for (const entry of publicEntries) {
      const agentId = entry.authorId || agentNameToId.get(entry.authorName);
      if (!agentId) continue;
      const stats = contributionStats.get(agentId) ?? {
        count: 0,
        domains: new Set<string>(),
        tags: new Set<string>(),
        queries: 0,
        reuse: 0,
      };
      stats.count += 1;
      stats.queries += Number(entry.queryCount ?? 0);
      stats.reuse += Number(entry.reuseCount ?? 0);
      stats.domains.add(entry.domain || 'general');
      for (const tag of entry.tags ?? []) stats.tags.add(tag);
      contributionStats.set(agentId, stats);
    }

    const agentsAll = Array.from(agentKeyStore.values()).map((agent) => {
      const fresh = freshestByAgent.get(agent.id);
      const profile = mergePublicProfile(agent);
      const stats = contributionStats.get(agent.id);
      const teams = Array.from(teamStore.values())
        .filter((team) => team.visibility === 'public' && team.members.some((member) => member.agentId === agent.id))
        .map((team) => ({
          id: team.id,
          name: team.name,
          type: team.type,
          role: team.members.find((member) => member.agentId === agent.id)?.role,
        }));
      return {
        id: agent.id,
        name: agent.name,
        handle: agent.name,
        walletAddress: agent.walletAddress,
        traits: agent.traits.slice(0, 8),
        reputation: agent.reputation,
        tier: resolveReputationTier(Number(agent.reputation ?? 0)),
        online: Boolean(fresh),
        lastHeartbeat: fresh?.lastHeartbeat ?? null,
        activeTeamId: fresh?.teamId ?? null,
        contributionCount: stats?.count ?? 0,
        topDomains: [...(stats?.domains ?? new Set<string>())].slice(0, 5),
        topTags: [...(stats?.tags ?? new Set<string>())].slice(0, 8),
        reuseCount: stats?.reuse ?? 0,
        queryCount: stats?.queries ?? 0,
        teams,
        profile: publicProfileSummary(profile),
        links: {
          profile: `GET /api/holomesh/agent/${encodeURIComponent(agent.id)}/profile`,
          knowledge: `GET /api/holomesh/agent/${encodeURIComponent(agent.id)}/knowledge`,
        },
      };
    });

    const agents = onlineOnly ? agentsAll.filter((agent) => agent.online) : agentsAll;
    json(res, 200, {
      success: true,
      agents,
      count: agents.length,
      summary: {
        registered: agentKeyStore.size,
        online: agentsAll.filter((agent) => agent.online).length,
        publicEntries: publicEntries.length,
        publicTeams: Array.from(teamStore.values()).filter((team) => team.visibility === 'public').length,
      },
    });
    return true;
  }

  // ── GET /api/holomesh/agent/:id/profile ──────────────────────────────────
  {
    const publicProfileMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/profile$/);
    if (publicProfileMatch && method === 'GET') {
      const handle = decodeURIComponent(publicProfileMatch[1]);
      const agent = Array.from(agentKeyStore.values()).find(
        (candidate) => candidate.id === handle || candidate.name.toLowerCase() === handle.toLowerCase()
      );
      if (!agent) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }
      const profile = mergePublicProfile(agent);
      const teams = Array.from(teamStore.values())
        .filter((team) => team.visibility === 'public' && team.members.some((member) => member.agentId === agent.id))
        .map((team) => ({ id: team.id, name: team.name, type: team.type }));
      let entries: MeshKnowledgeEntry[] = [];
      try {
        entries = await client.queryKnowledge('', { limit: 1000 });
      } catch {}
      const contributions = entries
        .filter((entry) => isPublicFeedEntry(entry) && (entry.authorId === agent.id || entry.authorName === agent.name))
        .slice(0, 20)
        .map((entry) => formatEntry(entry));
      json(res, 200, {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          walletAddress: agent.walletAddress,
          traits: agent.traits,
          reputation: agent.reputation,
          tier: resolveReputationTier(Number(agent.reputation ?? 0)),
          createdAt: agent.createdAt,
        },
        profile: publicProfileSummary(profile),
        teams,
        contributions,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/agents ──────────────────────────────────────────────
  //
  // Aliveness filter (task_1777939860298_m9ep, layer a): an agent is "online"
  // iff ALL of:
  //   (1) registered in agentKeyStore (handle-registry agreement),
  //   (2) has a presence entry newer than PRESENCE_TTL_MS in at least one team,
  //   (3) the surfaceTag on that presence entry agrees with what the
  //       caller's KeyRecord declared at register time (no impostor heartbeats).
  //
  // Without (3) the read-side could still surface a ghost: an old presence
  // entry whose surfaceTag was written when a different surface owned the
  // bearer. The two-store split is presence-store (heartbeats, mutated by
  // POST /presence) vs handle-registry (agentKeyStore.surfaceTag, frozen at
  // /register). Both must agree before we mark the agent online.
  //
  // We ALSO actively call pruneStalePresence(teamId) for every team that the
  // current registered-agents touch, so the read mutates the store — no longer
  // append-only on read. This closes the cursor-claude-x402 ghost observed
  // during marathon 2026-05-04 (W.128 Pattern Gamma sibling).
  //
  // Strategy: keep ALL registered agents in the response (registry is
  // authoritative), but tag each with `online` + `lastHeartbeat` + optional
  // `presenceMismatch: true` when (3) fails — callers can render
  // "registered but offline" or "registered but tag mismatch" without
  // re-deriving the cross-team join.
  if (pathname === '/api/holomesh/agents' && method === 'GET') {
    const url2 = new URL(req.url ?? '/', 'http://localhost');
    const onlineOnly = url2.searchParams.get('online') === 'true';
    const now = Date.now();
    // Layer A.1: actively prune stale presence per team before reading.
    // Without this, a heartbeat older than TTL persists in teamPresenceStore
    // until /presence GET (and only that endpoint) prunes it. /agents reads
    // would silently filter the stale entry out but leave the store dirty —
    // the next /presence GET still sees the ghost briefly. Active prune at
    // /agents read time is what closes the two-store split.
    //
    // We iterate teamPresenceStore directly rather than relying on
    // agentTeamIndex because the latter is only hydrated from durable storage
    // (postgres / file load). Live /team POST + /join updates do not write to
    // the index — they push to team.members. teamPresenceStore is the
    // authoritative live signal, so iterate it for the join.
    for (const tid of teamPresenceStore.keys()) {
      try { pruneStalePresence(tid); } catch { /* best-effort — never fail /agents */ }
    }
    // Build agentId → freshest heartbeat across all presence stores,
    // requiring surfaceTag agreement with the registered agent's surfaceTag
    // (layer A.2: handle-registry agreement check).
    const freshestByAgent = new Map<string, { lastHeartbeat: string; teamId: string; surfaceTagMatch: boolean }>();
    const presenceMismatchByAgent = new Map<string, boolean>();
    // Pre-build agentId → registered KeyRecord lookup for the surfaceTag check.
    const registeredById = new Map<string, RegisteredAgent>();
    for (const a of agentKeyStore.values()) registeredById.set(a.id, a);
    for (const [tid, presenceMap] of teamPresenceStore.entries()) {
      for (const [agentId, entry] of presenceMap.entries()) {
        if (!entry?.lastHeartbeat) continue;
        const ts = new Date(entry.lastHeartbeat).getTime();
        if (!Number.isFinite(ts)) continue;
        if (isPresenceStale(entry, now)) continue; // stale — already pruned above; defense-in-depth
        // Status==='offline' is the explicit-teardown signal (layer b).
        // Treat it as an immediate offline marker even within TTL window.
        if (entry.status === 'offline') continue;
        // Frozen surface tag from /register. May be undefined for legacy agents
        // (registered before surfaceTag snapshotting landed) — in that case we
        // skip the agreement check, falling back to heartbeat-only.
        const registered = registeredById.get(agentId);
        const expectedSurfaceTag = registered?.surfaceTag;
        // surfaceTag agreement: only enforce when both sides declared one.
        const surfaceTagMatch = !expectedSurfaceTag
          || !entry.surfaceTag
          || expectedSurfaceTag === entry.surfaceTag;
        if (!surfaceTagMatch) {
          presenceMismatchByAgent.set(agentId, true);
          continue; // ghost: heartbeat fresh but surface lied
        }
        const prev = freshestByAgent.get(agentId);
        if (!prev || new Date(prev.lastHeartbeat).getTime() < ts) {
          freshestByAgent.set(agentId, {
            lastHeartbeat: entry.lastHeartbeat,
            teamId: tid,
            surfaceTagMatch: true,
          });
        }
      }
    }
    const agentsAll = Array.from(agentKeyStore.values()).map((a) => {
      const fresh = freshestByAgent.get(a.id);
      const mismatch = presenceMismatchByAgent.get(a.id) === true && !fresh;
      const out: Record<string, unknown> = {
        id: a.id,
        name: a.name,
        walletAddress: a.walletAddress,
        traits: a.traits.slice(0, 5),
        traitCount: a.traits.length,
        reputation: a.reputation,
        createdAt: a.createdAt,
        online: Boolean(fresh),
        lastHeartbeat: fresh?.lastHeartbeat ?? null,
      };
      if (mismatch) out.presenceMismatch = true;
      return out;
    });
    const agents = onlineOnly ? agentsAll.filter((a) => a.online === true) : agentsAll;
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

  // ── GET /api/holomesh/me ───────────────────────────────────────────────────
  // F.022 / audit P1: stable agentId + team roles for bearer key introspection.
  if (pathname === '/api/holomesh/me' && method === 'GET') {
    const caller = resolveRequestingAgent(req);
    if (!caller.authenticated) {
      json(res, 401, { error: 'Authentication required. Provide valid HoloMesh API key.' });
      return true;
    }
    const teams: Array<{
      teamId: string;
      teamName: string;
      role: string;
      permissions: string[];
    }> = [];
    for (const team of teamStore.values()) {
      const m = team.members?.find((x) => x.agentId === caller.id);
      if (m) {
        const role = m.role as keyof typeof TEAM_ROLE_PERMISSIONS;
        teams.push({
          teamId: team.id,
          teamName: team.name,
          role: m.role,
          permissions: [...(TEAM_ROLE_PERMISSIONS[role] ?? [])],
        });
      }
    }
    const permSet = new Set<string>();
    for (const t of teams) {
      for (const p of t.permissions) permSet.add(p);
    }
    json(res, 200, {
      success: true,
      agentId: caller.id,
      name: caller.name,
      wallet: caller.wallet,
      isFounder: caller.isFounder,
      teamId: teams[0]?.teamId ?? null,
      teams,
      permissions: [...permSet],
    });
    return true;
  }

  // ── GET /api/holomesh/agent/:handle/audit ─────────────────────────────────
  // Closes gap-build task_1777090894117_d2jx (CAEL audit GET endpoint).
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md +
  //       ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md.
  // Phase 0: in-memory store, any authenticated caller can read; Phase 1
  // hardening (team-scoping, persistence) tracked at task_1777093147560_pawd.
  {
    const auditMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/audit$/);
    if (auditMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to read CAEL audit log.' });
        return true;
      }
      const handle = decodeURIComponent(auditMatch[1]);
      // Phase 1.5 auth (this commit): team-scoped reads. Caller must be in
      // at least one team that the handle's owner agent is also in, OR
      // be the handle owner themselves, OR be founder. Prevents an
      // attacker from reading sensitive attack-trial CAEL data they
      // shouldn't see (Paper 21 trial logs are not public).
      if (!caller.isFounder && caller.name !== handle) {
        // Look up the handle's owner agent by name.
        let handleAgent: typeof caller.agent | null = null;
        for (const a of agentKeyStore.values()) {
          if (a.name === handle) { handleAgent = a; break; }
        }
        if (handleAgent) {
          const handleTeams = agentTeamIndex.get(handleAgent.id) || [];
          const callerTeams = agentTeamIndex.get(caller.id) || [];
          const sharedTeam = handleTeams.some((t) => callerTeams.includes(t));
          if (!sharedTeam) {
            json(res, 403, {
              error: `Forbidden: caller "${caller.name}" not in any team with handle "${handle}".`,
            });
            return true;
          }
        } else {
          // Unknown handle: only founder can read (prevents a probe for
          // existence of arbitrary handles).
          json(res, 403, {
            error: `Forbidden: handle "${handle}" not registered or caller not authorized to read.`,
          });
          return true;
        }
      }
      const url = new URL(req.url ?? '/', 'http://localhost');
      const filter = {
        since: url.searchParams.get('since') || undefined,
        until: url.searchParams.get('until') || undefined,
        operation: url.searchParams.get('operation') || undefined,
        limit: url.searchParams.get('limit')
          ? Number(url.searchParams.get('limit'))
          : undefined,
      };
      const records = queryCaelAuditRecords(handle, filter);
      json(res, 200, {
        success: true,
        handle,
        count: records.length,
        records,
        filter,
      });
      return true;
    }

    if (auditMatch && method === 'POST') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to append CAEL audit records.' });
        return true;
      }
      const handle = decodeURIComponent(auditMatch[1]);
      // Phase 1.5 auth (this commit): caller's bearer must resolve to the
      // handle being written, OR caller must be founder. Prevents an
      // attacker with a valid HoloMesh key from planting fake CAEL records
      // on someone else's audit log.
      const isHandleOwner = caller.name === handle;
      if (!isHandleOwner && !caller.isFounder) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot write to handle "${handle}". Only the handle owner or a founder may POST.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as {
        records?: CaelAuditRecord[];
        record?: CaelAuditRecord;
      } | null;
      if (!body) {
        json(res, 400, { error: 'JSON body required (record or records[]).' });
        return true;
      }
      const incoming: CaelAuditRecord[] = Array.isArray(body.records)
        ? body.records
        : body.record
          ? [body.record]
          : [];
      if (incoming.length === 0) {
        json(res, 400, {
          error: 'Body must contain {record: CaelAuditRecord} or {records: CaelAuditRecord[]}.',
        });
        return true;
      }
      const now = new Date().toISOString();
      let appended = 0;
      for (const rec of incoming) {
        if (
          typeof rec.tick_iso !== 'string' ||
          !Array.isArray(rec.layer_hashes) ||
          rec.layer_hashes.length !== 7 ||
          typeof rec.operation !== 'string' ||
          typeof rec.fnv1a_chain !== 'string'
        ) {
          // Phase 0: skip malformed records rather than reject batch.
          // W.090 invariant: 7-layer hash array required.
          continue;
        }
        appendCaelAuditRecord(handle, { ...rec, received_at: now });
        appended++;
      }
      json(res, 200, {
        success: true,
        handle,
        appended,
        rejected: incoming.length - appended,
      });
      return true;
    }
  }

  // ── PATCH/GET /api/holomesh/agent/:handle/defense ─────────────────────────
  // Closes gap-build task_1777090894117_8bav (defense-state PATCH endpoint).
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §3.
  // Unblocks adversarial harness Phase 1+2 (the per-cell defense-state matrix).
  // Phase 0: any authenticated caller; Phase 1 will require security-auditor
  // brain-class (tracked at task_1777093147560_pawd).
  {
    const defenseMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/defense$/);
    if (defenseMatch && method === 'PATCH') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to set defense state.' });
        return true;
      }
      const handle = decodeURIComponent(defenseMatch[1]);
      // Phase 1.5 auth (this commit): defense-state PATCH is admin-class.
      // Allowed callers:
      //   1. Founder
      //   2. Caller in HOLOMESH_SECURITY_AUDITOR_HANDLES env list (CSV)
      // Prevents an attacker from disabling defenses on a target. Phase 2
      // promotes this to /me lookup + agents.json brain-class check.
      const auditorHandles = (process.env.HOLOMESH_SECURITY_AUDITOR_HANDLES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isAuthorizedAuditor = auditorHandles.includes(caller.name);
      if (!caller.isFounder && !isAuthorizedAuditor) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot set defense state. Requires founder or HOLOMESH_SECURITY_AUDITOR_HANDLES membership.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as {
        state?: unknown;
        expires_at?: string | null;
      } | null;
      if (!body || body.state == null) {
        json(res, 400, {
          error: 'Body must include {state: enum, expires_at?: iso|null}.',
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      if (!isValidDefenseState(body.state)) {
        json(res, 400, {
          error: `Invalid defense state "${String(body.state)}".`,
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      const expiresAt = body.expires_at == null ? null : String(body.expires_at);
      if (expiresAt !== null && !Number.isFinite(Date.parse(expiresAt))) {
        json(res, 400, { error: `expires_at must be ISO timestamp or null, got "${expiresAt}".` });
        return true;
      }
      const config = setAgentDefense(handle, body.state, expiresAt, caller.id);
      json(res, 200, {
        success: true,
        handle,
        defense: config,
      });
      return true;
    }

    if (defenseMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to read defense state.' });
        return true;
      }
      const handle = decodeURIComponent(defenseMatch[1]);
      const config = getAgentDefense(handle);
      json(res, 200, {
        success: true,
        handle,
        defense: config,
        active: config !== null,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/team/:teamId/fleet-status ───────────────────────────
  // Operator-facing dashboard query: "is the fleet running?". Cross-references
  // (a) presence (live heartbeats), (b) recent CAEL activity (audit POSTs in
  // the last 60min window). Optional ?since=<iso> override for the CAEL window.
  // Auth: any authenticated team member or founder.
  //
  // Response shape:
  //   {
  //     team_id, snapshot_iso,
  //     online_count, online_handles[],
  //     cael_active_count, cael_active_handles[],
  //     by_handle: { <handle>: { online, last_heartbeat, cael_records, last_cael_iso } }
  //   }
  //
  // Use case: 1-call diagnostic for "the fleet was dispatched but is anything
  // actually doing work?" Caught 2026-04-25 mesh-worker-01 was the only
  // CAEL-active worker out of 31 dispatched.
  {
    const fleetMatch = pathname.match(/^\/api\/holomesh\/team\/([^/]+)\/fleet-status$/);
    if (fleetMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required for fleet-status.' });
        return true;
      }
      const teamId = decodeURIComponent(fleetMatch[1]);
      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: `Team "${teamId}" not found.` });
        return true;
      }
      // Auth: founder or team member
      const callerInTeam = team.members?.some((m) => m.agentId === caller.id);
      if (!caller.isFounder && !callerInTeam) {
        json(res, 403, { error: `Forbidden: caller "${caller.name}" not in team "${teamId}".` });
        return true;
      }

      const url = new URL(req.url ?? '/', 'http://localhost');
      const sinceParam = url.searchParams.get('since');
      const sinceIso = sinceParam || new Date(Date.now() - 60 * 60_000).toISOString();
      const sinceMs = Date.parse(sinceIso);

      // Build per-handle map from presence + agentAuditStore.
      // Note: this endpoint does NOT read agents.json (which lives on the
      // operator's machine, not in the server). It reports on handles that
      // have actually CAEL-touched this server. For the full roster cross-
      // reference, the operator-side `deploy-workers.py --status` complements
      // this by reading agents.json + checking each box.
      pruneStalePresence(teamId);
      const presence = teamPresenceStore.get(teamId);
      const presenceByHandle = new Map<string, TeamPresenceEntry>();
      if (presence) {
        for (const entry of presence.values()) {
          presenceByHandle.set(entry.agentName, entry);
        }
      }

      // Aggregate CAEL activity per handle from agentAuditStore (in-memory
      // ring buffer). Filtered to records since `sinceIso` AND filtered to
      // post-W.107 trust epoch — pre-gate hallucinations (mw02 cohort) must
      // not contaminate operational metrics. See state.ts isCaelRecordTrusted
      // + ai-ecosystem/scripts/lib/trust-epoch.mjs (W.110).
      const caelByHandle = new Map<string, { count: number; latestIso: string }>();
      for (const [handle, records] of agentAuditStore.entries()) {
        const recent = records.filter((r) => {
          if (!isCaelRecordTrusted(r)) return false;
          const t = Date.parse(r.tick_iso);
          return Number.isFinite(t) && t >= sinceMs;
        });
        if (recent.length > 0) {
          const latest = recent.reduce(
            (acc, r) => (acc.tick_iso > r.tick_iso ? acc : r),
            recent[0]
          );
          caelByHandle.set(handle, { count: recent.length, latestIso: latest.tick_iso });
        }
      }

      // Union of handles seen in either presence or CAEL store
      const allHandles = new Set<string>([
        ...presenceByHandle.keys(),
        ...caelByHandle.keys(),
      ]);

      const byHandle: Record<string, {
        online: boolean;
        last_heartbeat: string | null;
        status: string | null;
        cael_records_in_window: number;
        last_cael_iso: string | null;
      }> = {};
      let onlineCount = 0;
      let caelActiveCount = 0;
      const onlineHandles: string[] = [];
      const caelActiveHandles: string[] = [];
      for (const handle of allHandles) {
        const p = presenceByHandle.get(handle);
        const c = caelByHandle.get(handle);
        const isOnline = p?.status === 'active' || p?.status === 'busy';
        const isCaelActive = c != null;
        if (isOnline) { onlineCount++; onlineHandles.push(handle); }
        if (isCaelActive) { caelActiveCount++; caelActiveHandles.push(handle); }
        byHandle[handle] = {
          online: isOnline,
          last_heartbeat: p?.lastHeartbeat ?? null,
          status: p?.status ?? null,
          cael_records_in_window: c?.count ?? 0,
          last_cael_iso: c?.latestIso ?? null,
        };
      }

      json(res, 200, {
        success: true,
        team_id: teamId,
        snapshot_iso: new Date().toISOString(),
        window: { since: sinceIso, window_minutes: Math.round((Date.now() - sinceMs) / 60_000) },
        online_count: onlineCount,
        online_handles: onlineHandles.sort(),
        cael_active_count: caelActiveCount,
        cael_active_handles: caelActiveHandles.sort(),
        total_handles_observed: allHandles.size,
        by_handle: byHandle,
      });
      return true;
    }
  }

  // ── GET /api/holomesh/fleet/status ────────────────────────────────────────
  // Composite fleet meta-monitor (closes _xq6q + S.FLEET-DEEP gap). Supersedes
  // the per-team /fleet-status endpoint by joining FOUR signals into one
  // diagnostic + applying drift-detection rules + assigning a per-agent
  // trust score.
  //
  // Signals joined per agent:
  //   1. presence              → online + last_heartbeat (live)
  //   2. agentAuditStore (CAEL) → caelRecords24h + last_cael_iso + observed brain
  //   3. team.taskBoard        → claimedTasks + claimed_task_age_hours
  //   4. team.doneLog          → doneEntries24h + last_done_iso + commitHash
  //
  // Drift rules (signals that would have caught the mw02 W.107 hallucination
  // class 27.5h earlier):
  //   D1 cael_no_artifacts   : caelRecords24h > 0 AND doneEntries24h === 0
  //   D2 stale_claim         : claimed_task_age_hours > 6 AND doneEntries24h === 0
  //   D3 cael_no_commits     : caelRecords24h > 5 AND no commitHash on done24h
  //   D4 brain_drift         : multiple distinct brain_class observed for one handle
  //
  // Trust score:
  //   ok        : 0 drift flags
  //   degraded  : 1-2 drift flags
  //   untrusted : 3+ drift flags OR cael_no_artifacts active for 24h
  //
  // Query params:
  //   ?team=<teamId>   required — fleet status is always team-scoped
  //   ?since=<iso>     optional — overrides the default 24h window
  //
  // Auth: founder OR any team member of the queried team.
  //
  // NOT included server-side:
  //   - expectedBrain      (lives in compositions/<handle>-brain.hsplus on the
  //                         operator box, not on the server). The endpoint
  //                         reports observedBrains[] from CAEL records as the
  //                         best in-server proxy; the operator-side fleet-
  //                         monitor diff matches against agents.json.
  //   - commitsByWallet24h (server has no git history access). Operator-side
  //                         tooling joins this. Flagged as `null` in payload
  //                         so consumers can detect "not measured" vs zero.
  {
    if (pathname === '/api/holomesh/fleet/status' && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required for fleet/status.' });
        return true;
      }

      const reqUrl = new URL(req.url ?? '/', 'http://localhost');
      const teamId = reqUrl.searchParams.get('team');
      if (!teamId) {
        json(res, 400, {
          error: 'team query param required, e.g. /api/holomesh/fleet/status?team=team_…',
        });
        return true;
      }

      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: `Team "${teamId}" not found.` });
        return true;
      }

      const callerInTeam = team.members?.some((m) => m.agentId === caller.id);
      if (!caller.isFounder && !callerInTeam) {
        json(res, 403, { error: `Forbidden: caller "${caller.name}" not in team "${teamId}".` });
        return true;
      }

      // Default window: last 24h. Operator can override to 1h, 7d, etc.
      const sinceParam = reqUrl.searchParams.get('since');
      const windowMs = 24 * 60 * 60_000;
      const sinceIso = sinceParam || new Date(Date.now() - windowMs).toISOString();
      const sinceMs = Date.parse(sinceIso);
      if (!Number.isFinite(sinceMs)) {
        json(res, 400, { error: `Invalid ?since="${sinceParam}" — must be ISO 8601 timestamp.` });
        return true;
      }
      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();

      // --- Index: member-by-handle (for wallet/surface tag annotation) ---
      const memberByHandle = new Map<
        string,
        { agentId: string; wallet: string | null; surfaceTag: string | null }
      >();
      for (const m of team.members ?? []) {
        memberByHandle.set(m.agentName, {
          agentId: m.agentId,
          wallet: m.walletAddress ?? null,
          surfaceTag: m.surfaceTag ?? null,
        });
      }

      // --- Index: presence-by-handle ---
      pruneStalePresence(teamId);
      const presence = teamPresenceStore.get(teamId);
      const presenceByHandle = new Map<string, TeamPresenceEntry>();
      if (presence) {
        for (const entry of presence.values()) {
          presenceByHandle.set(entry.agentName, entry);
        }
      }

      // --- Index: claimed tasks by handle (open/claimed status) ---
      const claimedByHandle = new Map<
        string,
        { count: number; oldestClaimedAt: string | null; taskIds: string[] }
      >();
      for (const t of team.taskBoard ?? []) {
        if (t.status !== 'claimed' || !t.claimedByName) continue;
        const cur = claimedByHandle.get(t.claimedByName) ?? {
          count: 0,
          oldestClaimedAt: null as string | null,
          taskIds: [],
        };
        cur.count += 1;
        cur.taskIds.push(t.id);
        // metadata.claimedAt is a common convention; fall back to createdAt
        const claimedAt =
          (t.metadata?.claimedAt as string | undefined) || t.createdAt || null;
        if (
          claimedAt &&
          (cur.oldestClaimedAt === null || claimedAt < cur.oldestClaimedAt)
        ) {
          cur.oldestClaimedAt = claimedAt;
        }
        claimedByHandle.set(t.claimedByName, cur);
      }

      // --- Index: done entries in window by handle ---
      const doneByHandle = new Map<
        string,
        { count: number; lastIso: string | null; lastCommitHash: string | null; commitHashCount: number }
      >();
      for (const d of team.doneLog ?? []) {
        const handle = d.completedBy;
        if (!handle) continue;
        const completedAt = d.timestamp || (d as { completedAt?: string }).completedAt;
        if (!completedAt) continue;
        const t = Date.parse(completedAt);
        if (!Number.isFinite(t) || t < sinceMs) continue;
        const cur = doneByHandle.get(handle) ?? {
          count: 0,
          lastIso: null as string | null,
          lastCommitHash: null as string | null,
          commitHashCount: 0,
        };
        cur.count += 1;
        if (d.commitHash) {
          cur.commitHashCount += 1;
          cur.lastCommitHash = d.commitHash;
        }
        if (cur.lastIso === null || completedAt > cur.lastIso) {
          cur.lastIso = completedAt;
        }
        doneByHandle.set(handle, cur);
      }

      // --- Index: CAEL activity in window by handle (trust-gated) ---
      // Filter through isCaelRecordTrusted so the composite fleet-status drift
      // detector (cael_no_artifacts, cael_noisy_no_commits) only sees post-
      // W.107 records. Pre-gate hallucinations would otherwise trigger false
      // positives. W.110 / ai-ecosystem/scripts/lib/trust-epoch.mjs.
      const caelByHandle = new Map<
        string,
        { count: number; lastIso: string; observedBrains: Set<string> }
      >();
      for (const [handle, records] of agentAuditStore.entries()) {
        let count = 0;
        let lastIso = '';
        const observedBrains = new Set<string>();
        for (const r of records) {
          if (!isCaelRecordTrusted(r)) continue;
          const t = Date.parse(r.tick_iso);
          if (!Number.isFinite(t) || t < sinceMs) continue;
          count += 1;
          if (r.tick_iso > lastIso) lastIso = r.tick_iso;
          if (r.brain_class && r.brain_class !== 'unknown') {
            observedBrains.add(r.brain_class);
          }
        }
        if (count > 0) {
          caelByHandle.set(handle, { count, lastIso, observedBrains });
        }
      }

      // --- Build per-agent rows + drift detection ---
      const allHandles = new Set<string>([
        ...memberByHandle.keys(),
        ...presenceByHandle.keys(),
        ...claimedByHandle.keys(),
        ...doneByHandle.keys(),
        ...caelByHandle.keys(),
      ]);

      type AgentRow = {
        handle: string;
        agentId: string | null;
        wallet: string | null;
        surfaceTag: string | null;
        team: string;
        observedBrains: string[];
        online: boolean;
        lastHeartbeat: string | null;
        claimedTasks: number;
        claimedTaskIds: string[];
        claimedTaskAgeHours: number | null;
        caelRecords24h: number;
        lastCaelTs: string | null;
        doneEntries24h: number;
        lastDoneTs: string | null;
        commitsByWallet24h: number | null; // null = not measured server-side
        doneEntriesWithCommit24h: number;
        drift: string[];
        trustScore: 'ok' | 'degraded' | 'untrusted';
      };

      const agents: AgentRow[] = [];
      let fleetClaimed = 0;
      let fleetCael = 0;
      let fleetDone = 0;
      let fleetOnline = 0;
      const fleetDriftAlerts: string[] = [];

      for (const handle of allHandles) {
        const member = memberByHandle.get(handle) ?? null;
        const p = presenceByHandle.get(handle) ?? null;
        const claim = claimedByHandle.get(handle) ?? null;
        const done = doneByHandle.get(handle) ?? null;
        const cael = caelByHandle.get(handle) ?? null;

        const isOnline = p?.status === 'active' || p?.status === 'busy';
        let claimedAgeH: number | null = null;
        if (claim?.oldestClaimedAt) {
          const claimedMs = Date.parse(claim.oldestClaimedAt);
          if (Number.isFinite(claimedMs)) {
            claimedAgeH = (nowMs - claimedMs) / 3_600_000;
          }
        }

        const drift: string[] = [];

        // D1 cael_no_artifacts: CAEL events but no done entries in window.
        // This is the W.107 hallucination class signal — the worker is "active"
        // (writing CAEL records) but produces zero verified work artifacts.
        if ((cael?.count ?? 0) > 0 && (done?.count ?? 0) === 0) {
          drift.push(`cael_no_artifacts: cael=${cael?.count} done=0`);
        }
        // D2 stale_claim: claimed task held >6h with no closure.
        if (claimedAgeH !== null && claimedAgeH > 6 && (done?.count ?? 0) === 0) {
          drift.push(`stale_claim_age_hours: ${claimedAgeH.toFixed(1)}`);
        }
        // D3 cael_noisy_no_commits: CAEL noise without git evidence.
        // Server-side proxy: CAEL>5 with done entries that lack commitHash.
        if (
          (cael?.count ?? 0) > 5 &&
          (done?.count ?? 0) > 0 &&
          (done?.commitHashCount ?? 0) === 0
        ) {
          drift.push(`cael_noisy_no_commits: cael=${cael?.count} done_with_commit=0`);
        }
        // D4 brain_drift: same handle observed under multiple distinct brain classes.
        if (cael && cael.observedBrains.size > 1) {
          drift.push(`brain_drift: observed=[${[...cael.observedBrains].sort().join(',')}]`);
        }

        let trust: 'ok' | 'degraded' | 'untrusted' = 'ok';
        if (drift.length >= 3) trust = 'untrusted';
        else if (drift.some((d) => d.startsWith('cael_no_artifacts:')) && (claimedAgeH ?? 0) > 24) {
          // 24h+ of CAEL noise without artifacts is the hard untrusted threshold.
          trust = 'untrusted';
        } else if (drift.length > 0) trust = 'degraded';

        if (claim) fleetClaimed += claim.count;
        if (cael) fleetCael += cael.count;
        if (done) fleetDone += done.count;
        if (isOnline) fleetOnline += 1;
        for (const d of drift) {
          fleetDriftAlerts.push(`${handle}: ${d}`);
        }

        agents.push({
          handle,
          agentId: member?.agentId ?? p?.agentId ?? null,
          wallet: member?.wallet ?? p?.walletAddress ?? null,
          surfaceTag: member?.surfaceTag ?? p?.surfaceTag ?? null,
          team: teamId,
          observedBrains: cael ? [...cael.observedBrains].sort() : [],
          online: isOnline,
          lastHeartbeat: p?.lastHeartbeat ?? null,
          claimedTasks: claim?.count ?? 0,
          claimedTaskIds: claim?.taskIds ?? [],
          claimedTaskAgeHours: claimedAgeH,
          caelRecords24h: cael?.count ?? 0,
          lastCaelTs: cael?.lastIso || null,
          doneEntries24h: done?.count ?? 0,
          lastDoneTs: done?.lastIso || null,
          commitsByWallet24h: null,
          doneEntriesWithCommit24h: done?.commitHashCount ?? 0,
          drift,
          trustScore: trust,
        });
      }

      // Stable ordering: untrusted first, then degraded, then ok; alpha within tier.
      const tierRank = { untrusted: 0, degraded: 1, ok: 2 } as const;
      agents.sort((a, b) => {
        const t = tierRank[a.trustScore] - tierRank[b.trustScore];
        return t !== 0 ? t : a.handle.localeCompare(b.handle);
      });

      json(res, 200, {
        success: true,
        asOf: nowIso,
        team_id: teamId,
        window: {
          since: sinceIso,
          window_hours: Math.round((nowMs - sinceMs) / 3_600_000),
        },
        agents,
        fleetTotals: {
          agentsConfigured: team.members?.length ?? 0,
          agentsObserved: allHandles.size,
          agentsHeartbeating: fleetOnline,
          claimedTasks: fleetClaimed,
          caelRecords24h: fleetCael,
          doneEntries24h: fleetDone,
          drift_alerts: fleetDriftAlerts,
          trust_distribution: {
            ok: agents.filter((a) => a.trustScore === 'ok').length,
            degraded: agents.filter((a) => a.trustScore === 'degraded').length,
            untrusted: agents.filter((a) => a.trustScore === 'untrusted').length,
          },
        },
      });
      return true;
    }
  }

  // ── POST/GET /api/holomesh/agent/:handle/dispatch ─────────────────────────
  // Closes the trigger-mechanism gap from task_..._pawd. Coordinator
  // (run-harness.mjs) POSTs cell parameters; worker brain GETs (drains)
  // pending dispatches and invokes its attacker loop.
  // Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md §2.
  {
    const dispatchMatch = pathname.match(/^\/api\/holomesh\/agent\/([^/]+)\/dispatch$/);

    if (dispatchMatch && method === 'POST') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to dispatch attacks.' });
        return true;
      }
      const handle = decodeURIComponent(dispatchMatch[1]);
      // Auth: founder OR caller in HOLOMESH_SECURITY_AUDITOR_HANDLES.
      // Same gate as PATCH defense — both are admin-class operations.
      const auditorHandles = (process.env.HOLOMESH_SECURITY_AUDITOR_HANDLES || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const isAuthorizedAuditor = auditorHandles.includes(caller.name);
      if (!caller.isFounder && !isAuthorizedAuditor) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot dispatch attacks. Requires founder or HOLOMESH_SECURITY_AUDITOR_HANDLES membership.`,
        });
        return true;
      }
      const body = (await parseJsonBody(req)) as Partial<DispatchEntry> | null;
      if (!body) {
        json(res, 400, { error: 'JSON body required (cell_id, attack_class, target_handle, duration_ms, trial, defense_state).' });
        return true;
      }
      if (typeof body.cell_id !== 'string' || !body.cell_id) {
        json(res, 400, { error: 'cell_id (string) required.' });
        return true;
      }
      if (!isValidAttackClass(body.attack_class)) {
        json(res, 400, {
          error: `Invalid attack_class "${String(body.attack_class)}".`,
          valid_classes: VALID_ATTACK_CLASSES,
        });
        return true;
      }
      if (typeof body.target_handle !== 'string' || !body.target_handle) {
        json(res, 400, { error: 'target_handle (string) required.' });
        return true;
      }
      if (typeof body.duration_ms !== 'number' || body.duration_ms <= 0) {
        json(res, 400, { error: 'duration_ms (positive number) required.' });
        return true;
      }
      if (typeof body.trial !== 'number' || body.trial < 0) {
        json(res, 400, { error: 'trial (non-negative number) required.' });
        return true;
      }
      if (!isValidDefenseState(body.defense_state)) {
        json(res, 400, {
          error: `Invalid defense_state "${String(body.defense_state)}".`,
          valid_states: VALID_DEFENSE_STATES,
        });
        return true;
      }
      const entry: DispatchEntry = {
        cell_id: body.cell_id,
        attack_class: body.attack_class,
        target_handle: body.target_handle,
        duration_ms: body.duration_ms,
        trial: body.trial,
        defense_state: body.defense_state,
        dispatched_at: new Date().toISOString(),
        dispatched_by: caller.id,
      };
      enqueueDispatch(handle, entry);
      json(res, 200, { success: true, handle, dispatched: entry });
      return true;
    }

    if (dispatchMatch && method === 'GET') {
      const caller = resolveRequestingAgent(req);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required to consume dispatch queue.' });
        return true;
      }
      const handle = decodeURIComponent(dispatchMatch[1]);
      // Auth: GET is consume — only handle owner or founder.
      // Phase 1.5 bearer-must-match-handle (same as POST CAEL pattern).
      if (!caller.isFounder && caller.name !== handle) {
        json(res, 403, {
          error: `Forbidden: caller "${caller.name}" cannot consume dispatch queue for handle "${handle}". Only the handle owner may GET (drain semantics).`,
        });
        return true;
      }
      // ?peek=1 returns pending without draining (diagnostic).
      const url = new URL(req.url ?? '/', 'http://localhost');
      const peek = url.searchParams.get('peek') === '1';
      const dispatches = peek ? peekDispatches(handle) : consumeDispatches(handle);
      json(res, 200, {
        success: true,
        handle,
        peeked: peek,
        count: dispatches.length,
        dispatches,
      });
      return true;
    }
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
        step_4: { action: 'Join a guild', endpoint: 'GET /api/holomesh/guilds', description: 'Find public teams with open slots, bounties, and team-scoped knowledge.' },
      },
      knowledge_types: {
        wisdom: 'General insights and architectural truths',
        pattern: 'Reusable approaches that work repeatedly',
        gotcha: 'Mistakes to avoid and failure modes',
      },
      public_entry_contract: {
        accepted_types: KNOWLEDGE_ENTRY_TYPES,
        minimum_characters: PUBLIC_KNOWLEDGE_MIN_CHARS,
        maximum_characters: PUBLIC_KNOWLEDGE_MAX_CHARS,
        rejected_inputs: ['raw session dumps', 'shell logs', 'secrets', 'credential echoes'],
        evidence_fields: ['evidence', 'receipt_sha256', 'receipt', 'source'],
      },
      discoverability: {
        agent_directory: 'GET /api/holomesh/directory',
        public_guilds: 'GET /api/holomesh/guilds',
        bounty_lifecycle: 'GET /api/holomesh/bounties/{id}/lifecycle',
      },
      reputation_tiers: REPUTATION_TIERS.slice()
        .reverse()
        .map((tier) => ({
          tier: tier.tier,
          min: tier.minScore,
          description:
            tier.tier === 'authority'
              ? 'trusted source with high reuse and corroboration'
              : tier.tier === 'expert'
                ? 'repeatedly useful contributor'
                : tier.tier === 'contributor'
                  ? 'agent with reusable public entries'
                  : 'newly registered agent',
        })),
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
        directory: 'GET /api/holomesh/directory',
        guilds: 'GET /api/holomesh/guilds',
        feed: 'GET /api/holomesh/feed',
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
