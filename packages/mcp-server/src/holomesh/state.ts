import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { 
  Team, 
  TeamMessage, 
  TeamPresenceEntry, 
  RegisteredAgent, 
  StoredComment, 
   
  StoredBountySubmission, 
  StoredBountyMiniGame, 
  StoredBountyGovernanceProposal,
  KnowledgeTransaction 
} from './types';
type StoredVote = any;
import { BountyManager, KnowledgeMarketplace } from '@holoscript/framework';

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
export const agentTeamIndex: Map<string, string[]> = new Map(); // agentId → teamIds[]

// Social & Discussion
export const commentStore: Map<string, StoredComment[]> = new Map(); // entryId → comments
export const voteStore: Map<string, StoredVote[]> = new Map(); // targetId → votes
export const transactionLedger: KnowledgeTransaction[] = [];

// Bounties
export const bountySubmissionStore: Map<string, StoredBountySubmission[]> = new Map(); // bountyId -> submissions
export const bountyMiniGameStore: Map<string, StoredBountyMiniGame[]> = new Map(); // teamId -> mini-games
export const bountyGovernanceStore: Map<string, StoredBountyGovernanceProposal> = new Map(); // bountyId -> proposal

// Auth
export const challengeStore: Map<string, { walletAddress: string; expiresAt: number }> = new Map();

// ── Persistence Logic ─────────────────────────────────────────────────────────

const TEAM_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'teams.json');
const AGENT_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'agents.json');
const SOCIAL_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'social.json');

export function persistTeamStore(): void {
  const teams = Array.from(teamStore.values()).map((t) => ({
    ...t,
    presence: teamPresenceStore.get(t.id) ? Array.from(teamPresenceStore.get(t.id)!.values()) : [],
    messages: teamMessageStore.get(t.id) || [],
    knowledgeMarketplace: t.knowledgeMarketplace?.toJSON?.() || t.knowledgeMarketplace,
    bounties: t.bounties?.toJSON?.() || t.bounties,
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

export function persistSocialStore(): void {
  atomicWriteJSON(SOCIAL_STORE_PATH, {
    version: 1,
    comments: Array.from(commentStore.entries()),
    votes: Array.from(voteStore.entries()),
    paidAccess: Array.from(paidAccessStore),
    transactions: transactionLedger,
    bountySubmissions: Array.from(bountySubmissionStore.entries()),
    bountyMiniGames: Array.from(bountyMiniGameStore.entries()),
    bountyGovernance: Array.from(bountyGovernanceStore.entries()),
    savedAt: new Date().toISOString(),
  });
}

// ── Initialization ────────────────────────────────────────────────────────────

export function initStores(): void {
  // Load Agents
  const agentData = readJSON(AGENT_STORE_PATH);
  if (agentData?.agents) {
    for (const a of agentData.agents) {
      agentKeyStore.set(a.apiKey, a);
      walletToAgent.set(a.walletAddress.toLowerCase(), a);
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
}
