import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { 
  Team, 
  TeamMessage,
  TeamFeedItem,
  TeamPresenceEntry, 
  RegisteredAgent, 
  StoredComment, 
  StoredVote,
  StoredBountySubmission, 
  StoredBountyMiniGame, 
  StoredBountyGovernanceProposal,
  StoryWeaverSession,
  SelfImprovingWorldSession,
  KnowledgeTransaction,
  KeyRecord,
  ExportSession,
} from './types';
import { BountyManager, KnowledgeMarketplace } from '@holoscript/framework';
import {
  deserializeExportSession,
  isExportSessionExpired,
  serializeExportSession,
} from './export-session';

// ── Persistence Config ────────────────────────────────────────────────────────

export const HOLOMESH_DATA_DIR =
  process.env.HOLOMESH_DATA_DIR ||
  path.join(
    process.env.HOLOSCRIPT_CACHE_DIR || path.join(require('os').homedir(), '.holoscript'),
    'holomesh'
  );

// ── Atomic Writes ─────────────────────────────────────────────────────────────

/** Atomic JSON write: temp file → rename */
export function atomicWriteJSON(filePath: string, data: unknown): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmp = filePath + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tmp, filePath);
  } catch (e: unknown) {
    console.warn('[HoloMesh] persist failed:', e instanceof Error ? e.message : String(e));
  }
}

/** Read JSON file, return null if missing/corrupted */
export function readJSON(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Shared Global Stores ──────────────────────────────────────────────────────

// Identity
export const agentKeyStore: Map<string, RegisteredAgent> = new Map(); // apiKey → agent
export const walletToAgent: Map<string, RegisteredAgent> = new Map(); // walletAddress (lowercase) → agent
export const paidAccessStore: Set<string> = new Set(); // "agentId:entryId" → true

// Teams
export const teamStore: Map<string, Team> = new Map(); // teamId → Team
export const teamPresenceStore: Map<string, Map<string, TeamPresenceEntry>> = new Map(); // teamId → (agentId → presence)
export const teamMessageStore: Map<string, TeamMessage[]> = new Map(); // teamId → messages
/** Public team feed (hologram publishes, etc.) — poster identity is server-authoritative */
export const teamFeedStore: Map<string, TeamFeedItem[]> = new Map();
export const agentTeamIndex: Map<string, string[]> = new Map(); // agentId → teamIds[]

const MAX_TEAM_FEED_ITEMS = 200;

/** HoloDoor — per-team merged policy (owner PATCH) + telemetry ring buffer */
export const holoDoorPolicyByTeam: Map<string, Record<string, unknown>> = new Map();
export const holoDoorEventsByTeam: Map<string, Record<string, unknown>[]> = new Map();

/**
 * CAEL Audit Store — per-agent CAEL trace ring buffer (Phase 0 in-memory).
 * Spec: ai-ecosystem/research/2026-04-25_fleet-adversarial-harness-paper-21.md +
 *       ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md.
 * Closes gap-build task_1777090894117_d2jx (CAEL audit GET endpoint).
 *
 * Each entry is one CAEL record produced by an attacker-loop / target-brain /
 * composability-test capture. Records have shape per spec §5.
 *
 * Phase 0 limitations (filed as follow-up at task_1777093147560_pawd):
 * - In-memory only; lost on server restart. Persistence to JSONL on
 *   HOLOMESH_DATA_DIR is the Phase 1 hardening pass.
 * - Per-agent ring buffer caps at 10,000 records (drops oldest).
 * - No pagination cursor; only since/until/limit windowing.
 *
 * Auth model: write requires the caller to BE the agent (bearer matches
 * handle); read requires any authenticated agent in the same team.
 */
export interface CaelAuditRecord {
  tick_iso: string;
  layer_hashes: string[]; // 7 elements per W.GOLD.189 Layer 1+2 framing
  operation: string;
  prev_hash: string | null;
  fnv1a_chain: string;
  version_vector_fingerprint: string;
  // Optional: attacker/composability-test specific metadata
  attack_class?: string;
  defense_state?: string;
  trial?: number;
  brain_class?: string;
  // Server-stamped on append
  received_at: string;
}

export const agentAuditStore: Map<string, CaelAuditRecord[]> = new Map(); // handle → records
const MAX_CAEL_RECORDS_PER_AGENT = 10_000;

export function appendCaelAuditRecord(handle: string, record: CaelAuditRecord): void {
  const existing = agentAuditStore.get(handle) ?? [];
  existing.push(record);
  if (existing.length > MAX_CAEL_RECORDS_PER_AGENT) {
    existing.shift(); // ring buffer: drop oldest
  }
  agentAuditStore.set(handle, existing);
}

export function queryCaelAuditRecords(
  handle: string,
  filter: { since?: string; until?: string; limit?: number; operation?: string } = {}
): CaelAuditRecord[] {
  const records = agentAuditStore.get(handle) ?? [];
  let out = records;
  if (filter.since) {
    const sinceMs = Date.parse(filter.since);
    if (Number.isFinite(sinceMs)) {
      out = out.filter((r) => Date.parse(r.tick_iso) >= sinceMs);
    }
  }
  if (filter.until) {
    const untilMs = Date.parse(filter.until);
    if (Number.isFinite(untilMs)) {
      out = out.filter((r) => Date.parse(r.tick_iso) <= untilMs);
    }
  }
  if (filter.operation) {
    out = out.filter((r) => r.operation === filter.operation);
  }
  const limit = filter.limit ?? 1000;
  if (out.length > limit) out = out.slice(out.length - limit); // most recent
  return out;
}

// Social & Discussion
export const commentStore: Map<string, StoredComment[]> = new Map(); // entryId → comments
export const voteStore: Map<string, StoredVote[]> = new Map(); // targetId → votes
export const transactionLedger: KnowledgeTransaction[] = [];
export const storyWeaverStore: Map<string, StoryWeaverSession> = new Map(); // sessionId -> story session
export const selfImprovingWorldStore: Map<string, SelfImprovingWorldSession> = new Map(); // worldId -> world evolution session

// Bounties
export const bountySubmissionStore: Map<string, StoredBountySubmission[]> = new Map(); // bountyId -> submissions
export const bountyMiniGameStore: Map<string, StoredBountyMiniGame[]> = new Map(); // teamId -> mini-games
export const bountyGovernanceStore: Map<string, StoredBountyGovernanceProposal> = new Map(); // bountyId -> proposal

// Auth
export const challengeStore: Map<string, { walletAddress: string; expiresAt: number }> = new Map();

// Key Registry — unified identity anchor
export const keyRegistry: Map<string, KeyRecord> = new Map(); // token → KeyRecord

// Tier2 Self-Custody Export Sessions (V3 foundation)
export const exportSessionStore: Map<string, ExportSession> = new Map(); // sessionId → export session

// ── Persistence Logic ─────────────────────────────────────────────────────────

const TEAM_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'teams.json');
const AGENT_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'agents.json');
const SOCIAL_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'social.json');
const KEY_REGISTRY_PATH = path.join(HOLOMESH_DATA_DIR, 'keys.json');
const HOLODOOR_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'holodoor-store.json');
const EXPORT_SESSION_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'export-sessions.json');

export function persistHoloDoorStore(): void {
  atomicWriteJSON(HOLODOOR_STORE_PATH, {
    version: 1,
    policies: Object.fromEntries(holoDoorPolicyByTeam),
    events: Object.fromEntries(holoDoorEventsByTeam),
    savedAt: new Date().toISOString(),
  });
}

export function persistTeamStore(): void {
  const teams = Array.from(teamStore.values()).map((t) => ({
    ...t,
    presence: teamPresenceStore.get(t.id) ? Array.from(teamPresenceStore.get(t.id)!.values()) : [],
    messages: teamMessageStore.get(t.id) || [],
    feed: teamFeedStore.get(t.id) || [],
    knowledgeMarketplace: (t as any).knowledgeMarketplace?.toJSON?.() || (t as any).knowledgeMarketplace,
    bounties: (t as any).bounties?.toJSON?.() || t.bounties,
  }));

  atomicWriteJSON(TEAM_STORE_PATH, {
    version: 4,
    teams,
    savedAt: new Date().toISOString(),
  });
}

export function persistAgentStore(): void {
  atomicWriteJSON(AGENT_STORE_PATH, {
    version: 1,
    agents: Array.from(agentKeyStore.values()),
    savedAt: new Date().toISOString(),
  });
}

/**
 * keys.json is append-only — read existing records, merge new ones, write.
 * Old keys are preserved for audit trail. Rotated keys are never truly deleted
 * from the file (only from the in-memory map).
 */
export function persistKeyRegistry(): void {
  const existing = readJSON(KEY_REGISTRY_PATH);
  const existingRecords: KeyRecord[] = existing?.keys || [];
  const merged = new Map<string, KeyRecord>();
  for (const r of existingRecords) merged.set(r.key, r);
  for (const r of keyRegistry.values()) merged.set(r.key, r);
  atomicWriteJSON(KEY_REGISTRY_PATH, {
    version: 1,
    keys: Array.from(merged.values()),
    savedAt: new Date().toISOString(),
  });
}

export function persistSocialStore(): void {
  atomicWriteJSON(SOCIAL_STORE_PATH, {
    version: 1,
    comments: Array.from(commentStore.entries()),
    votes: Array.from(voteStore.entries()),
    paidAccess: Array.from(paidAccessStore),
    transactions: transactionLedger,
    storyWeaver: Array.from(storyWeaverStore.entries()),
    selfImprovingWorlds: Array.from(selfImprovingWorldStore.entries()),
    bountySubmissions: Array.from(bountySubmissionStore.entries()),
    bountyMiniGames: Array.from(bountyMiniGameStore.entries()),
    bountyGovernance: Array.from(bountyGovernanceStore.entries()),
    savedAt: new Date().toISOString(),
  });
}

export function persistExportSessionStore(): void {
  const now = Date.now();
  const sessions = Array.from(exportSessionStore.values())
    .filter((s) => !isExportSessionExpired(s, now))
    .map((s) => serializeExportSession(s));

  atomicWriteJSON(EXPORT_SESSION_STORE_PATH, {
    version: 1,
    sessions,
    savedAt: new Date().toISOString(),
  });
}

// ── Initialization ────────────────────────────────────────────────────────────

/**
 * Seed the key registry from env vars on first boot (no keys.json yet).
 * All env key names are treated as founder keys and mapped to a single
 * permanent founder wallet + agent ID. Persists immediately so keys.json
 * exists for subsequent restarts.
 */
function _seedFounderKeysFromEnv(): void {
  const candidates = [
    process.env.HOLOSCRIPT_API_KEY,
    process.env.HOLOSCRIPT_API_KEY,
    process.env.HOLOMESH_API_KEY,
    process.env.COPILOT_HOLOMESH_KEY,
    process.env.GEMINI_HOLOMESH_KEY,
  ].filter((k): k is string => Boolean(k && k.trim()));

  if (candidates.length === 0) return;

  const FOUNDER_WALLET =
    process.env.HOLOSCRIPT_FOUNDER_WALLET ||
    '0x0000000000000000000000000000000000000001';

  for (const key of candidates) {
    const record: KeyRecord = {
      key,
      walletAddress: FOUNDER_WALLET,
      agentId: 'agent_founder',
      agentName: 'Founder',
      scopes: ['*'],
      createdAt: new Date().toISOString(),
      isFounder: true,
    };
    keyRegistry.set(key, record);
  }

  console.info(`[KeyRegistry] First boot: seeded ${candidates.length} founder key(s) from env vars`);
  persistKeyRegistry();
}

export function initStores(): void {
  // Load Key Registry (must come first — auth depends on it)
  const keyData = readJSON(KEY_REGISTRY_PATH);
  if (keyData?.keys && Array.isArray(keyData.keys) && keyData.keys.length > 0) {
    for (const r of keyData.keys as KeyRecord[]) {
      keyRegistry.set(r.key, r);
    }
    console.info(`[KeyRegistry] Loaded ${keyRegistry.size} key record(s)`);
  } else {
    // First boot: auto-seed from env vars so the server can start immediately
    _seedFounderKeysFromEnv();
  }

  // Load Agents
  const agentData = readJSON(AGENT_STORE_PATH);
  if (agentData?.agents) {
    for (const a of agentData.agents) {
      agentKeyStore.set(a.apiKey, a);
      walletToAgent.set((a.walletAddress || '').toLowerCase(), a);
    }
  }

  // Load Social
  const socialData = readJSON(SOCIAL_STORE_PATH);
  if (socialData) {
    if (socialData.comments) {
      for (const [id, list] of socialData.comments) commentStore.set(id, list);
    }
    if (socialData.votes) {
      for (const [id, list] of socialData.votes) voteStore.set(id, list);
    }
    if (socialData.paidAccess) {
      for (const key of socialData.paidAccess) paidAccessStore.add(key);
    }
    if (socialData.transactions) {
      transactionLedger.push(...socialData.transactions);
    }
    if (socialData.storyWeaver) {
      for (const [id, session] of socialData.storyWeaver) storyWeaverStore.set(id, session);
    }
    if (socialData.selfImprovingWorlds) {
      for (const [id, session] of socialData.selfImprovingWorlds) selfImprovingWorldStore.set(id, session);
    }
    if (socialData.bountySubmissions) {
      for (const [id, list] of socialData.bountySubmissions) bountySubmissionStore.set(id, list);
    }
    if (socialData.bountyMiniGames) {
      for (const [id, list] of socialData.bountyMiniGames) bountyMiniGameStore.set(id, list);
    }
    if (socialData.bountyGovernance) {
      for (const [id, proposal] of socialData.bountyGovernance) bountyGovernanceStore.set(id, proposal);
    }
  }

  // Load Teams
  const teamData = readJSON(TEAM_STORE_PATH);
  if (teamData?.teams) {
    for (const t of teamData.teams) {
      // Reconstitute classes
      if (t.knowledgeMarketplace) {
        // Fallback to plain object if constructor fails or doesn't match
        try {
          t.knowledgeMarketplace = new KnowledgeMarketplace(t.knowledgeMarketplace);
        } catch { /* ignore */ }
      }
      if (t.bounties) {
        try {
          t.bounties = new BountyManager(t.bounties);
        } catch { /* ignore */ }
      }
      teamStore.set(t.id, t);

      if (t.presence) {
        const pMap = new Map();
        for (const p of t.presence) pMap.set(p.agentId, p);
        teamPresenceStore.set(t.id, pMap);
      }
      if (t.messages) {
        teamMessageStore.set(t.id, t.messages);
      }
      const feedRaw = (t as { feed?: TeamFeedItem[] }).feed;
      if (feedRaw && Array.isArray(feedRaw)) {
        teamFeedStore.set(t.id, feedRaw.slice(-MAX_TEAM_FEED_ITEMS));
      }

      // Re-index members
      if (t.members) {
        for (const m of t.members) {
          const teams = agentTeamIndex.get(m.agentId) || [];
          if (!teams.includes(t.id)) {
            teams.push(t.id);
            agentTeamIndex.set(m.agentId, teams);
          }
        }
      }
    }
  }

  const holoDoorData = readJSON(HOLODOOR_STORE_PATH);
  if (holoDoorData?.policies && typeof holoDoorData.policies === 'object') {
    for (const [tid, pol] of Object.entries(holoDoorData.policies as Record<string, unknown>)) {
      holoDoorPolicyByTeam.set(tid, pol as Record<string, unknown>);
    }
  }
  if (holoDoorData?.events && typeof holoDoorData.events === 'object') {
    for (const [tid, evs] of Object.entries(holoDoorData.events as Record<string, unknown[]>)) {
      const list = Array.isArray(evs) ? (evs as Record<string, unknown>[]) : [];
      holoDoorEventsByTeam.set(tid, list);
    }
  }

  const exportSessionData = readJSON(EXPORT_SESSION_STORE_PATH);
  if (exportSessionData?.sessions && Array.isArray(exportSessionData.sessions)) {
    const now = Date.now();
    for (const raw of exportSessionData.sessions) {
      const session = deserializeExportSession(raw);
      if (!session) continue;
      if (isExportSessionExpired(session, now)) continue;
      exportSessionStore.set(session.sessionId, session);
    }
  }
}
