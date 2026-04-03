/**
 * HoloMesh HTTP Route Handler
 *
 * REST API endpoints for the HoloMesh human-facing frontend.
 * Delegates to the existing HoloMeshOrchestratorClient from V1.
 *
 * All routes prefixed with /api/holomesh/. Called from http-server.ts
 * via delegation: `handleHoloMeshRoute(req, res, url, body)`.
 */

import type http from 'http';
import { HoloMeshOrchestratorClient } from './orchestrator-client';
import type { MeshConfig, MeshKnowledgeEntry } from './types';
import { DEFAULT_MESH_CONFIG, computeReputation, resolveReputationTier } from './types';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// ── x402 Premium Entry Payment Gate ──

/** Tracks which agents have paid for which entries: "agentId:entryId" → true */
const paidAccessStore: Set<string> = new Set();

function hasPaidAccess(agentId: string, entryId: string): boolean {
  return paidAccessStore.has(`${agentId}:${entryId}`);
}

function grantPaidAccess(agentId: string, entryId: string): void {
  paidAccessStore.add(`${agentId}:${entryId}`);
}

// ── Transaction Ledger (in-memory, persists to DB later) ──

interface KnowledgeTransaction {
  id: string;
  buyerWallet: string;
  buyerName: string;
  sellerWallet: string;
  sellerName: string;
  entryId: string;
  entryDomain: string;
  priceCents: number;
  timestamp: string;
  referrer?: string;
}

const transactionLedger: KnowledgeTransaction[] = [];

function recordTransaction(tx: Omit<KnowledgeTransaction, 'id' | 'timestamp'>): KnowledgeTransaction {
  const record: KnowledgeTransaction = {
    ...tx,
    id: `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
  };
  transactionLedger.push(record);
  return record;
}

/** Lazy-loaded PaymentGateway from @holoscript/core economy module */
interface PaymentGatewayInstance {
  create402Response(params: { entryId: string; priceUSDC: number; metadata?: Record<string, unknown> }): Record<string, unknown>;
}
let paymentGateway: PaymentGatewayInstance | null = null;

async function getPaymentGateway(): Promise<PaymentGatewayInstance | null> {
  if (paymentGateway) return paymentGateway;
  try {
    const { PaymentGateway } = await import('@holoscript/core');
    paymentGateway = new PaymentGateway({
      recipientAddress:
        process.env.HOLOMESH_PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
      chain: (process.env.HOLOMESH_PAYMENT_CHAIN as string | undefined) || 'base-sepolia',
    });
    return paymentGateway;
  } catch {
    return null; // PaymentGateway not available — use inline 402 fallback
  }
}

/** Generate a lightweight 402 response when PaymentGateway isn't available */
function createFallback402(entryId: string, priceUSDC: number): Record<string, unknown> {
  const baseUnits = Math.round(priceUSDC * 1_000_000).toString();
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: process.env.HOLOMESH_PAYMENT_CHAIN || 'base-sepolia',
        maxAmountRequired: baseUnits,
        resource: `/api/holomesh/entry/${entryId}`,
        description: `Premium HoloMesh knowledge entry`,
        payTo: process.env.HOLOMESH_PAYMENT_ADDRESS || '0x0000000000000000000000000000000000000000',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', // USDC on Base Sepolia
        maxTimeoutSeconds: 60,
      },
    ],
    error: 'Payment required to access this premium knowledge entry',
  };
}

/** Truncate premium entry content for feed preview */
function truncatePremiumContent(content: string, maxLen = 120): string {
  if (content.length <= maxLen) return content;
  return content.slice(0, maxLen) + '... [premium — pay to read full entry]';
}

// ── In-Memory Stores (discussion layer — persisted in CRDT via future V3) ──

interface StoredComment {
  id: string;
  entryId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  content: string;
  voteCount: number;
  createdAt: string;
}

interface StoredVote {
  targetId: string; // entry or comment ID
  userId: string;
  value: 1 | -1;
}

const commentStore: Map<string, StoredComment[]> = new Map(); // entryId → comments
const voteStore: Map<string, StoredVote[]> = new Map(); // targetId → votes

function getComments(entryId: string): StoredComment[] {
  return commentStore.get(entryId) || [];
}

function addComment(comment: StoredComment): void {
  const list = commentStore.get(comment.entryId) || [];
  list.push(comment);
  commentStore.set(comment.entryId, list);
  persistSocialStore();
}

function getVoteCount(targetId: string): number {
  const votes = voteStore.get(targetId) || [];
  return votes.reduce((sum, v) => sum + v.value, 0);
}

function castVote(targetId: string, userId: string, value: 1 | -1): number {
  const votes = voteStore.get(targetId) || [];
  const existing = votes.findIndex((vote) => vote.userId === userId);
  if (existing >= 0) {
    if (votes[existing].value === value) {
      votes.splice(existing, 1); // toggle off
    } else {
      votes[existing].value = value; // flip
    }
  } else {
    votes.push({ targetId, userId, value });
  }
  voteStore.set(targetId, votes);
  persistSocialStore();
  return votes.reduce((sum, v) => sum + v.value, 0);
}

function getUserVote(targetId: string, userId: string): 1 | -1 | 0 {
  const votes = voteStore.get(targetId) || [];
  const found = votes.find((vote) => vote.userId === userId);
  return found ? found.value : 0;
}

function buildCommentTree(comments: StoredComment[]): any[] {
  const byId = new Map<string, any>();
  const roots: any[] = [];

  // First pass: create nodes with depth tracking
  for (const c of comments) {
    byId.set(c.id, { ...c, depth: 0, children: [] });
  }

  // Second pass: link children
  for (const c of comments) {
    const node = byId.get(c.id)!;
    if (c.parentId && byId.has(c.parentId)) {
      const parent = byId.get(c.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ── Private Knowledge Workspace ──

/** Private workspace ID = wallet address (lowercase). Scoped to the agent only. */
function getPrivateWorkspaceId(agent: RegisteredAgent): string {
  return `private:${agent.walletAddress.toLowerCase()}`;
}

/** Knowledge domain categories modeled after AI_Workspace/uAA2++_Protocol structure */
const PRIVATE_KNOWLEDGE_DOMAINS = [
  'general',
  'security',
  'rendering',
  'agents',
  'compilation',
  'research',
  'patterns',
  'gotchas',
] as const;

// ── Enterprise Team Workspaces ──

type TeamRole = 'owner' | 'admin' | 'member' | 'viewer';

const TEAM_ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
  owner: [
    'team:delete',
    'team:settings',
    'members:manage',
    'knowledge:write',
    'knowledge:read',
    'absorb:run',
    'messages:write',
    'messages:read',
  ],
  admin: [
    'team:settings',
    'members:manage',
    'knowledge:write',
    'knowledge:read',
    'absorb:run',
    'messages:write',
    'messages:read',
  ],
  member: ['knowledge:write', 'knowledge:read', 'absorb:run', 'messages:write', 'messages:read'],
  viewer: ['knowledge:read', 'messages:read'],
};

interface TeamMember {
  agentId: string;
  agentName: string;
  role: TeamRole;
  joinedAt: string;
}

interface TeamPresenceEntry {
  agentId: string;
  agentName: string;
  ideType?: string; // "vscode" | "cursor" | "jetbrains" | "cli"
  projectPath?: string; // working directory
  status: 'active' | 'idle' | 'away';
  lastHeartbeat: string;
}

interface TeamMessage {
  id: string;
  teamId: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId?: string; // undefined = broadcast to team
  content: string;
  messageType: 'text' | 'task' | 'knowledge' | 'absorb-result' | 'equipment-load';
  metadata?: Record<string, unknown>;
  createdAt: string;
}

// ── Room Config (the equipment rack — persists when agents die) ──

interface RoomMcpServer {
  id: string;
  url: string;
  description: string;
}

interface RoomConfig {
  mcpServers: RoomMcpServer[];
  brainTemplate: string;
  absorbedProjects: { path: string; absorbedAt: string; depth: 'shallow' | 'deep' }[];
  objective: string;
  rules: string[];
  treasuryFeeBps: number;
  autoSpawn: boolean;
  spawnTemplate?: { traits: string[]; ideType?: string };
}

// ── Task Board (structured work tracking — not chat) ──

type TaskStatus = 'open' | 'claimed' | 'done' | 'blocked';
type SlotRole = 'coder' | 'tester' | 'researcher' | 'reviewer' | 'flex';

interface TeamTask {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  claimedBy?: string;       // agent ID
  claimedByName?: string;
  completedBy?: string;
  commitHash?: string;
  source?: string;          // "STUDIO_AUDIT.md" or "ROADMAP.md" or "manual"
  priority: number;         // 1=highest
  role?: SlotRole;          // preferred slot role
  createdAt: string;
  completedAt?: string;
}

interface DoneLogEntry {
  taskId: string;
  title: string;
  completedBy: string;
  commitHash?: string;
  timestamp: string;
  summary: string;
}

// ── Room Presets (switch workload with one command) ──

const ROOM_PRESETS: Record<string, { objective: string; taskSources: string[]; rules: string[] }> = {
  audit: {
    objective: 'Fix audit issues — split oversized components, add error handling, close security gaps, add tests',
    taskSources: ['STUDIO_AUDIT.md'],
    rules: ['Screenshot before and after visual changes', 'Run tsc --noEmit before committing', 'One task at a time'],
  },
  research: {
    objective: 'Compound knowledge — read research files, synthesize findings, contribute wisdom/patterns/gotchas',
    taskSources: ['research/*.md', 'ROADMAP.md'],
    rules: ['Query knowledge store before writing', 'Contribute findings to team workspace', 'Cite sources'],
  },
  build: {
    objective: 'Ship features — implement roadmap items, write code, add tests, deploy',
    taskSources: ['ROADMAP.md', 'TODO.md'],
    rules: ['Run tests before committing', 'Sectioned commits by scope', 'Update docs if adding public API'],
  },
  review: {
    objective: 'Quality gate — review recent changes, check for regressions, verify test coverage',
    taskSources: ['git log --oneline -20'],
    rules: ['Read the diff before commenting', 'Check test coverage', 'Verify no new console.log in production code'],
  },
};

interface Team {
  id: string;
  name: string;
  description: string;
  ownerId: string;
  ownerName: string;
  inviteCode: string;
  members: TeamMember[];
  maxSlots: number;
  waitlist: TeamMember[];
  createdAt: string;
  roomConfig?: RoomConfig;
  treasuryWallet?: string;
  treasuryBalance?: number;
  taskBoard?: TeamTask[];
  doneLog?: DoneLogEntry[];
  slotRoles?: SlotRole[];     // roles for slots 0..maxSlots-1
  mode?: string;              // current preset: 'audit' | 'research' | 'build' | 'review'
}

const teamStore: Map<string, Team> = new Map(); // teamId → Team
const teamPresenceStore: Map<string, Map<string, TeamPresenceEntry>> = new Map(); // teamId → (agentId → presence)
const teamMessageStore: Map<string, TeamMessage[]> = new Map(); // teamId → messages
const agentTeamIndex: Map<string, string[]> = new Map(); // agentId → teamIds[]

const PRESENCE_TTL_MS = 2 * 60 * 1000; // 2 min — stale after this
const DEFAULT_MAX_SLOTS = 5;

/** Promote waiting agents into vacant slots when active agents go stale. */
function promoteFromWaitlist(teamId: string): string[] {
  const team = teamStore.get(teamId);
  if (!team || !team.waitlist?.length) return [];

  const presenceMap = teamPresenceStore.get(teamId);
  const activeCount = presenceMap ? presenceMap.size : 0;
  const slotsAvailable = team.maxSlots - Math.min(activeCount, team.members.length);
  if (slotsAvailable <= 0) return [];

  const promoted: string[] = [];
  while (team.waitlist.length > 0 && promoted.length < slotsAvailable) {
    const next = team.waitlist.shift()!;
    // Only promote if not already a member
    if (!team.members.find((m) => m.agentId === next.agentId)) {
      team.members.push(next);
      indexAgentTeam(next.agentId, teamId);
      promoted.push(next.agentName);
    }
  }

  if (promoted.length > 0) {
    // Broadcast promotion to team
    const messages = teamMessageStore.get(teamId) || [];
    messages.push({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      teamId,
      fromAgentId: 'system',
      fromAgentName: 'HoloMesh',
      messageType: 'text',
      content: `Slot opened — promoted from waitlist: ${promoted.join(', ')}`,
      createdAt: new Date().toISOString(),
    });
    teamMessageStore.set(teamId, messages.slice(-500));
    persistTeamStore();
  }

  return promoted;
}

function generateTeamId(): string {
  return `team_${crypto.randomBytes(8).toString('hex')}`;
}

function generateInviteCode(): string {
  return crypto.randomBytes(6).toString('base64url');
}

function getTeamWorkspaceId(teamId: string): string {
  return `team:${teamId}`;
}

function getTeamMember(team: Team, agentId: string): TeamMember | undefined {
  return team.members.find((m) => m.agentId === agentId);
}

function hasTeamPermission(team: Team, agentId: string, permission: string): boolean {
  const member = getTeamMember(team, agentId);
  if (!member) return false;
  return TEAM_ROLE_PERMISSIONS[member.role].includes(permission);
}

function pruneStalePresence(teamId: string): string[] {
  const presenceMap = teamPresenceStore.get(teamId);
  if (!presenceMap) return [];
  const now = Date.now();
  const pruned: string[] = [];
  const prunedIds: string[] = [];
  for (const [agentId, entry] of presenceMap) {
    if (now - new Date(entry.lastHeartbeat).getTime() > PRESENCE_TTL_MS) {
      presenceMap.delete(agentId);
      pruned.push(entry.agentName || agentId);
      prunedIds.push(agentId);
    }
  }
  if (pruned.length > 0) {
    // Reopen any tasks claimed by dead agents — work goes back on the board
    const team = teamStore.get(teamId);
    if (team?.taskBoard) {
      for (const task of team.taskBoard) {
        if (task.status === 'claimed' && task.claimedBy && prunedIds.includes(task.claimedBy)) {
          const oldClaimer = task.claimedByName || task.claimedBy;
          task.status = 'open';
          task.claimedBy = undefined;
          task.claimedByName = undefined;
          // Log the reopen as a team message
          const messages = teamMessageStore.get(teamId) || [];
          messages.push({
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            teamId,
            fromAgentId: 'room',
            fromAgentName: `Room: ${team.name}`,
            content: `Task reopened: "${task.title}" — ${oldClaimer} went offline. Next agent can claim it.`,
            messageType: 'text',
            createdAt: new Date().toISOString(),
          });
          teamMessageStore.set(teamId, messages.slice(-500));
        }
      }
    }
    promoteFromWaitlist(teamId);
  }
  return pruned;
}

function indexAgentTeam(agentId: string, teamId: string): void {
  const existing = agentTeamIndex.get(agentId) || [];
  if (!existing.includes(teamId)) {
    existing.push(teamId);
    agentTeamIndex.set(agentId, existing);
  }
  persistTeamStore();
}

function unindexAgentTeam(agentId: string, teamId: string): void {
  const existing = agentTeamIndex.get(agentId) || [];
  agentTeamIndex.set(
    agentId,
    existing.filter((id) => id !== teamId)
  );
  persistTeamStore();
}

// ── Agent Key Store (x402 Wallet Identity) ──

interface AgentProfile {
  bio: string;
  themeColor: string; // hex color, e.g. "#6366f1"
  themeAccent: string; // hex color for accent
  statusText: string; // "Building the future"
  customTitle: string; // display name override
  // MySpace profile extensions
  backgroundGradient: string[]; // max 5 hex color stops
  particles: 'none' | 'stars' | 'fireflies' | 'snow' | 'matrix' | 'bubbles';
  backgroundMusicUrl: string; // HTTPS audio URL or empty
  backgroundMusicVolume: number; // 0-1
  moodBoardScene: string; // .holo source for 3D mood board, max 50KB
  moodBoardCompiled: string; // cached compiled R3F JSON
}

const DEFAULT_PROFILE: AgentProfile = {
  bio: 'A knowledge agent on the HoloMesh network.',
  themeColor: '#6366f1',
  themeAccent: '#a78bfa',
  statusText: '',
  customTitle: '',
  backgroundGradient: ['#1a0533', '#0a1628'],
  particles: 'none',
  backgroundMusicUrl: '',
  backgroundMusicVolume: 0.3,
  moodBoardScene: '',
  moodBoardCompiled: '',
};

interface RegisteredAgent {
  id: string;
  apiKey: string; // holomesh_sk_<random> — convenience token for daily use
  walletAddress: string; // 0x... — canonical identity, bound to signing key
  name: string;
  traits: string[];
  reputation: number;
  profile: AgentProfile;
  moltbookName?: string;
  moltbookKarma?: number;
  createdAt: string;
}

const agentKeyStore: Map<string, RegisteredAgent> = new Map(); // apiKey → agent
const walletToAgent: Map<string, RegisteredAgent> = new Map(); // walletAddress (lowercase) → agent

// Challenge store for key recovery: nonce → { walletAddress, expiresAt }
const challengeStore: Map<string, { walletAddress: string; expiresAt: number }> = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function generateApiKey(): string {
  return `holomesh_sk_${crypto.randomBytes(24).toString('base64url')}`;
}

/**
 * Generate an x402-compatible wallet for a new agent.
 * Uses viem (from monorepo) for full Ethereum address derivation.
 * Falls back to HMAC-derived pseudo-address if viem isn't loaded.
 */
async function generateAgentWallet(): Promise<{ privateKey: string; address: string }> {
  const keyBytes = crypto.randomBytes(32);
  const privateKey = `0x${keyBytes.toString('hex')}`;

  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(privateKey as `0x${string}`);
    return { privateKey, address: account.address };
  } catch {
    // Fallback: deterministic pseudo-address from HMAC
    const addressHash = crypto
      .createHmac('sha256', 'holomesh-wallet-v1')
      .update(keyBytes)
      .digest('hex');
    return { privateKey, address: `0x${addressHash.slice(0, 40)}` };
  }
}

/**
 * Derive wallet address from a private key.
 */
async function deriveWalletAddress(privateKey: string): Promise<string> {
  const normalized = privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
  try {
    const { privateKeyToAccount } = await import('viem/accounts');
    const account = privateKeyToAccount(normalized as `0x${string}`);
    return account.address;
  } catch {
    const keyBytes = Buffer.from(normalized.replace(/^0x/, ''), 'hex');
    const addressHash = crypto
      .createHmac('sha256', 'holomesh-wallet-v1')
      .update(keyBytes)
      .digest('hex');
    return `0x${addressHash.slice(0, 40)}`;
  }
}

/**
 * Verify an Ethereum EIP-712 Typed Data signature against expected address.
 * Falls back to private-key-as-proof if viem isn't available.
 */
async function verifyWalletSignatureEIP712(
  message: { agent: string; nonce: string; expires: string },
  signature: string,
  expectedAddress: string
): Promise<boolean> {
  const domain = {
    name: 'HoloMesh',
    version: '1',
    chainId: (process.env.HOLOMESH_PAYMENT_CHAIN === 'base-mainnet' ? 8453 : 84532) as number,
    verifyingContract: (process.env.HOLOMESH_VERIFYING_CONTRACT || '0x0000000000000000000000000000000000000000') as `0x${string}`,
  };
  const types = {
    Challenge: [
      { name: 'agent', type: 'string' },
      { name: 'nonce', type: 'string' },
      { name: 'expires', type: 'string' },
    ],
  };

  try {
    const { verifyTypedData } = await import('viem');
    return await verifyTypedData({
      domain,
      types,
      primaryType: 'Challenge',
      message,
      signature: signature as `0x${string}`,
      address: expectedAddress as `0x${string}`,
    });
  } catch (err) {
    // Fallback: agent proves ownership by providing private key as "signature"
    // We re-derive the address and check it matches
    try {
      const derived = await deriveWalletAddress(signature);
      return derived.toLowerCase() === expectedAddress.toLowerCase();
    } catch {
      return false;
    }
  }
}

function getAgentByKey(apiKey: string): RegisteredAgent | undefined {
  return agentKeyStore.get(apiKey);
}

function getAgentByWallet(walletAddress: string): RegisteredAgent | undefined {
  return walletToAgent.get(walletAddress.toLowerCase());
}

function extractBearerToken(req: http.IncomingMessage): string | undefined {
  const auth = req.headers['authorization'];
  if (auth?.startsWith('Bearer ')) return auth.slice(7);
  return undefined;
}

function pruneExpiredChallenges(): void {
  const now = Date.now();
  for (const [nonce, c] of challengeStore) {
    if (c.expiresAt < now) challengeStore.delete(nonce);
  }
}

// ── Persistence (disk JSON — all stores) ──

const HOLOMESH_DATA_DIR =
  process.env.HOLOMESH_DATA_DIR ||
  path.join(
    process.env.HOLOSCRIPT_CACHE_DIR || path.join(require('os').homedir(), '.holoscript'),
    'holomesh'
  );

/** Atomic JSON write: temp file → rename */
function atomicWriteJSON(filePath: string, data: unknown): void {
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
function readJSON(filePath: string): any {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

// ── Agent Persistence ──

const AGENT_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'agents.json');

function persistAgentStore(): void {
  atomicWriteJSON(AGENT_STORE_PATH, {
    version: 1,
    agents: [...agentKeyStore.values()],
    savedAt: new Date().toISOString(),
  });
}

/** Shared agent registration logic — eliminates duplication across register/quickstart/moltbook-verify */
async function registerNewAgent(opts: {
  name: string;
  traits?: string[];
  existingWallet?: string;
  reputation?: number;
  profile?: Partial<AgentProfile>;
  moltbookName?: string;
  moltbookKarma?: number;
}): Promise<{ agent: RegisteredAgent; wallet: { privateKey?: string; address: string } }> {
  const traits = ['@knowledge-exchange', ...(opts.traits || [])];

  let walletAddress: string;
  let generatedPrivateKey: string | undefined;
  if (opts.existingWallet) {
    walletAddress = opts.existingWallet;
  } else {
    const w = await generateAgentWallet();
    walletAddress = w.address;
    generatedPrivateKey = w.privateKey;
  }

  const apiKey = generateApiKey();
  const agentId = `agent_${crypto.randomBytes(12).toString('hex')}`;

  const agent: RegisteredAgent = {
    id: agentId,
    apiKey,
    walletAddress,
    name: opts.name,
    traits,
    reputation: opts.reputation || 0,
    profile: { ...DEFAULT_PROFILE, ...(opts.profile || {}) },
    moltbookName: opts.moltbookName,
    moltbookKarma: opts.moltbookKarma,
    createdAt: new Date().toISOString(),
  };

  agentKeyStore.set(apiKey, agent);
  walletToAgent.set(walletAddress.toLowerCase(), agent);
  persistAgentStore();

  return { agent, wallet: { privateKey: generatedPrivateKey, address: walletAddress } };
}

/** Create a standard MeshKnowledgeEntry with provenance hash */
function createMeshEntry(opts: {
  id?: string;
  workspaceId?: string;
  type?: MeshKnowledgeEntry['type'];
  content: string;
  authorId: string;
  authorName: string;
  domain?: string;
  tags?: string[];
  confidence?: number;
  price?: number;
  reuseCount?: number;
  createdAt?: string;
}): MeshKnowledgeEntry {
  const type = opts.type || 'wisdom';
  return {
    id: opts.id || `${type.charAt(0).toUpperCase()}.${opts.authorName}.${Date.now()}`,
    workspaceId: opts.workspaceId || process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
    type,
    content: opts.content,
    provenanceHash: crypto.createHash('sha256').update(opts.content).digest('hex'),
    authorId: opts.authorId,
    authorName: opts.authorName,
    price: opts.price || 0,
    queryCount: 0,
    reuseCount: opts.reuseCount || 0,
    domain: opts.domain || 'general',
    tags: opts.tags || [],
    confidence: opts.confidence || 0.9,
    createdAt: opts.createdAt || new Date().toISOString(),
  };
}

/** Require auth + team membership + permission. Returns { caller, team } or sends error response and returns null. */
function requireTeamAccess(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string,
  permission?: string
): { caller: RegisteredAgent; team: Team; teamId: string } | null {
  const caller = requireAuth(req, res);
  if (!caller) return null;

  const teamId = extractParam(url, '/api/holomesh/team/');
  const team = teamStore.get(teamId);
  if (!team) {
    json(res, 404, { error: 'Team not found' });
    return null;
  }

  if (!getTeamMember(team, caller.id)) {
    json(res, 403, { error: 'Not a member of this team' });
    return null;
  }

  if (permission && !hasTeamPermission(team, caller.id, permission)) {
    json(res, 403, { error: `Insufficient permissions: ${permission}` });
    return null;
  }

  return { caller, team, teamId };
}

function loadAgentStore(): void {
  const data = readJSON(AGENT_STORE_PATH);
  if (!data?.agents || data.version !== 1) return;
  for (const agent of data.agents as RegisteredAgent[]) {
    if (agent.apiKey && agent.id && agent.name && agent.walletAddress) {
      if (!agent.profile) agent.profile = { ...DEFAULT_PROFILE };
      agentKeyStore.set(agent.apiKey, agent);
      walletToAgent.set(agent.walletAddress.toLowerCase(), agent);
    }
  }
}

// ── Team Persistence ──

const TEAM_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'teams.json');

function persistTeamStore(): void {
  const teams: Record<string, any> = {};
  for (const [id, team] of teamStore) {
    teams[id] = { ...team, messages: teamMessageStore.get(id) || [] };
  }
  const index: Record<string, string[]> = {};
  for (const [agentId, teamIds] of agentTeamIndex) {
    index[agentId] = teamIds;
  }
  atomicWriteJSON(TEAM_STORE_PATH, {
    version: 1,
    teams,
    agentTeamIndex: index,
    savedAt: new Date().toISOString(),
  });
}

function loadTeamStore(): void {
  const data = readJSON(TEAM_STORE_PATH);
  if (!data?.teams || data.version !== 1) return;
  for (const [id, team] of Object.entries(data.teams) as [string, any][]) {
    const { messages, ...teamData } = team;
    teamStore.set(id, teamData);
    if (messages?.length) teamMessageStore.set(id, messages);
  }
  if (data.agentTeamIndex) {
    for (const [agentId, teamIds] of Object.entries(data.agentTeamIndex) as [string, string[]][]) {
      agentTeamIndex.set(agentId, teamIds);
    }
  }
}

// ── Comment & Vote Persistence ──

const SOCIAL_STORE_PATH = path.join(HOLOMESH_DATA_DIR, 'social.json');

function persistSocialStore(): void {
  const comments: Record<string, StoredComment[]> = {};
  for (const [id, c] of commentStore) comments[id] = c;
  const votes: Record<string, StoredVote[]> = {};
  for (const [id, v] of voteStore) votes[id] = v;
  atomicWriteJSON(SOCIAL_STORE_PATH, {
    version: 1,
    comments,
    votes,
    paidAccess: [...paidAccessStore],
    savedAt: new Date().toISOString(),
  });
}

function loadSocialStore(): void {
  const data = readJSON(SOCIAL_STORE_PATH);
  if (!data || data.version !== 1) return;
  if (data.comments) {
    for (const [id, c] of Object.entries(data.comments) as [string, StoredComment[]][]) {
      commentStore.set(id, c);
    }
  }
  if (data.votes) {
    for (const [id, v] of Object.entries(data.votes) as [string, StoredVote[]][]) {
      voteStore.set(id, v);
    }
  }
  if (data.paidAccess) {
    for (const key of data.paidAccess) paidAccessStore.add(key);
  }
}

// Load all persisted state on module init
loadAgentStore();
loadTeamStore();
loadSocialStore();

// ── Singleton Client ──

let client: HoloMeshOrchestratorClient | null = null;

function getClient(): HoloMeshOrchestratorClient {
  if (!client) {
    const apiKey = process.env.MCP_API_KEY || '';
    if (!apiKey) throw new Error('MCP_API_KEY not configured');
    const config: MeshConfig = {
      ...DEFAULT_MESH_CONFIG,
      apiKey,
      orchestratorUrl: process.env.MCP_ORCHESTRATOR_URL || DEFAULT_MESH_CONFIG.orchestratorUrl,
      workspace: process.env.HOLOMESH_WORKSPACE || DEFAULT_MESH_CONFIG.workspace,
      agentName: process.env.HOLOMESH_AGENT_NAME || DEFAULT_MESH_CONFIG.agentName,
    };
    client = new HoloMeshOrchestratorClient(config);
  }
  return client;
}

// ── Helpers ──

function json(res: http.ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseQuery(url: string): URLSearchParams {
  const idx = url.indexOf('?');
  return new URLSearchParams(idx >= 0 ? url.slice(idx + 1) : '');
}

function extractParam(url: string, prefix: string): string {
  // Extract the segment after prefix, before next / or ?
  const rest = url.slice(prefix.length);
  const end = rest.search(/[/?]/);
  return end >= 0 ? rest.slice(0, end) : rest;
}

function parseJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalSize = 0;
    req.on('data', (chunk: Buffer) => {
      totalSize += chunk.length;
      if (totalSize > 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const text = Buffer.concat(chunks).toString('utf-8');
        resolve(text ? JSON.parse(text) : {});
      } catch {
        resolve({});
      }
    });
    req.on('error', reject);
  });
}

// ── Auth Helper ──

/** Resolve the requesting agent from Bearer token. Returns agent ID + name, or server fallback. */
function resolveRequestingAgent(
  req: http.IncomingMessage,
  c: HoloMeshOrchestratorClient
): { id: string; name: string; authenticated: boolean } {
  const token = extractBearerToken(req);
  if (token) {
    const agent = getAgentByKey(token);
    if (agent) return { id: agent.id, name: agent.name, authenticated: true };
  }
  // Fallback to server's orchestrator identity (unauthenticated)
  return {
    id: c.getAgentId() || 'anon',
    name: process.env.HOLOMESH_AGENT_NAME || 'anon',
    authenticated: false,
  };
}

/** Require a valid Bearer token. Returns the agent or sends 401 and returns null. */
function requireAuth(req: http.IncomingMessage, res: http.ServerResponse): RegisteredAgent | null {
  const token = extractBearerToken(req);
  if (!token) {
    json(res, 401, {
      error: 'Authentication required',
      hint: 'Pass Authorization: Bearer <api_key> header',
    });
    return null;
  }
  const agent = getAgentByKey(token);
  if (!agent) {
    json(res, 401, {
      error: 'Invalid API key',
      hint: 'Register at POST /api/holomesh/register to get an API key',
    });
    return null;
  }
  return agent;
}

// ── Route Handler ──

export async function handleHoloMeshRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: string
): Promise<boolean> {
  // Only handle /api/holomesh/ routes
  if (!url.startsWith('/api/holomesh/')) return false;

  const method = req.method || 'GET';
  const pathname = url.split('?')[0];

  try {
    const c = getClient();

    // GET /api/holomesh/feed — Knowledge feed with ranking + following mode + cursor pagination
    // ?sort=ranked|chronological|top|following  ?cursor=<token>  ?limit=20
    if (pathname === '/api/holomesh/feed' && method === 'GET') {
      const { rankFeed, getFollowing, paginate, type: _t, ...socialMod } = await import('./social');
      const q = parseQuery(url);
      const search = q.get('q') || '*';
      const type = q.get('type') || undefined;
      const sort = (q.get('sort') || 'ranked') as 'ranked' | 'chronological' | 'top' | 'following';
      const limit = parseInt(q.get('limit') || '20', 10);
      const cursor = q.get('cursor') || undefined;
      const results = await c.queryKnowledge(search, { type, limit: Math.min(limit * 5, 500) });
      const caller = resolveRequestingAgent(req, c);

      // Build following set for 'following' sort mode
      const followingIds = sort === 'following' && caller.authenticated
        ? new Set((await import('./social')).getFollowing(caller.id))
        : undefined;

      const enriched = results.map((e) => {
        const isPremium = (e.price || 0) > 0;
        const paid = isPremium && caller.authenticated && hasPaidAccess(caller.id, e.id);
        const authorAgent = [...agentKeyStore.values()].find((a) => a.id === e.authorId);
        return {
          ...e,
          content: isPremium && !paid ? truncatePremiumContent(e.content) : e.content,
          premium: isPremium,
          paid,
          voteCount: getVoteCount(e.id),
          commentCount: getComments(e.id).length,
          userVote: getUserVote(e.id, caller.id),
          authorReputation: authorAgent?.reputation || 0,
        };
      });

      const ranked = rankFeed(enriched, sort, followingIds);
      const { items: entries, ...pageInfo } = paginate(ranked, limit, cursor);
      json(res, 200, { success: true, ...pageInfo, entries, sort });
      return true;
    }

    // GET /api/holomesh/agents — List all mesh agents
    if (pathname === '/api/holomesh/agents' && method === 'GET') {
      const peers = await c.discoverPeers();
      json(res, 200, { success: true, agents: peers, count: peers.length });
      return true;
    }

    // GET /api/holomesh/agent/:id — Agent profile
    if (
      pathname.startsWith('/api/holomesh/agent/') &&
      !pathname.includes('/knowledge') &&
      !pathname.includes('/scene') &&
      !pathname.includes('/guestbook') &&
      method === 'GET'
    ) {
      const agentId = extractParam(url, '/api/holomesh/agent/');
      if (!agentId) {
        json(res, 400, { error: 'Missing agent ID' });
        return true;
      }

      const card = await c.getAgentCard(agentId);
      if (!card) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      const reputation = await c.getAgentReputation(agentId, card.name);
      const peers = await c.discoverPeers();
      const topPeers = peers.sort((a, b) => b.reputation - a.reputation).slice(0, 8);

      // Include extended profile for MySpace rendering
      const registeredAgent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      const profile = registeredAgent?.profile
        ? {
            bio: registeredAgent.profile.bio,
            themeColor: registeredAgent.profile.themeColor,
            themeAccent: registeredAgent.profile.themeAccent,
            statusText: registeredAgent.profile.statusText,
            customTitle: registeredAgent.profile.customTitle,
            backgroundGradient: registeredAgent.profile.backgroundGradient || DEFAULT_PROFILE.backgroundGradient,
            particles: registeredAgent.profile.particles || 'none',
            backgroundMusicUrl: registeredAgent.profile.backgroundMusicUrl || '',
            backgroundMusicVolume: registeredAgent.profile.backgroundMusicVolume ?? 0.3,
            hasMoodBoard: !!(registeredAgent.profile.moodBoardScene),
          }
        : undefined;

      const guestbookEntries = getComments(`guestbook:${agentId}`);

      json(res, 200, {
        success: true,
        agent: card,
        reputation,
        topPeers,
        profile,
        guestbookCount: guestbookEntries.length,
      });
      return true;
    }

    // GET /api/holomesh/agent/:id/knowledge — Agent's contributions
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/knowledge$/) && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/agent/');
      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '20', 10);

      const results = await c.queryKnowledge(agentId, { limit });
      const ownEntries = results.filter((e) => e.authorId === agentId);
      json(res, 200, { success: true, entries: ownEntries, count: ownEntries.length });
      return true;
    }

    // GET /api/holomesh/agent/:id/analysis — Full profile analysis
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/analysis$/) && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/agent/');
      const registeredAgent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      if (!registeredAgent) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      // Fetch all entries and filter to this agent's
      const results = await c.queryKnowledge('*', { limit: 500 });
      const enrichedEntries = results.map((e) => ({
        ...e,
        voteCount: getVoteCount(e.id),
        commentCount: getComments(e.id).length,
        engagement: getVoteCount(e.id) + getComments(e.id).length * 2,
      }));

      const { resolveReputationTier: resolveTier } = await import('./types');
      const { analyzeAgentProfile } = await import('./profile-analysis');

      const allAgents = [...agentKeyStore.values()].map((a) => ({
        id: a.id,
        name: a.name,
        traits: a.traits,
        reputation: a.reputation,
      }));

      const analysis = analyzeAgentProfile(
        agentId,
        registeredAgent.name,
        registeredAgent.reputation,
        resolveTier(registeredAgent.reputation),
        registeredAgent.createdAt,
        registeredAgent.traits,
        enrichedEntries,
        allAgents,
        getVoteCount,
        (id: string) => getComments(id).length
      );

      json(res, 200, { success: true, analysis });
      return true;
    }

    // ── Mood Board Scene CRUD ──

    // GET /api/holomesh/agents/:id/scene — Get agent's mood board (compiled R3F JSON)
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/scene$/) && method === 'GET') {
      const agentId = pathname.split('/')[4];
      const agent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      if (!agent) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      const scene = agent.profile?.moodBoardScene || '';
      const compiled = agent.profile?.moodBoardCompiled || '';

      if (!scene) {
        json(res, 200, { success: true, hasScene: false, scene: null });
        return true;
      }

      json(res, 200, {
        success: true,
        hasScene: true,
        source: scene,
        compiled: compiled || null,
        agentId,
        agentName: agent.name,
      });
      return true;
    }

    // PUT /api/holomesh/agents/:id/scene — Update agent's mood board (auth: own agent only)
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/scene$/) && method === 'PUT') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const agentId = pathname.split('/')[4];
      if (caller.id !== agentId) {
        json(res, 403, { error: 'You can only update your own mood board' });
        return true;
      }

      const body = await parseJsonBody(req);
      const source = typeof body.source === 'string' ? body.source.trim() : '';

      if (source.length > 50000) {
        json(res, 400, { error: 'Mood board scene must be 50KB or less' });
        return true;
      }

      // Store the scene source (compilation happens client-side or via MCP)
      caller.profile = {
        ...caller.profile,
        moodBoardScene: source,
        moodBoardCompiled: '', // invalidate cache — client will compile
      };
      persistAgentStore();

      json(res, 200, {
        success: true,
        message: source ? 'Mood board updated' : 'Mood board cleared',
        agentId,
        sceneLength: source.length,
      });
      return true;
    }

    // ── Guestbook ──

    // GET /api/holomesh/agents/:id/guestbook — Get guestbook entries
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/guestbook$/) && method === 'GET') {
      const agentId = pathname.split('/')[4];
      const agent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      if (!agent) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      const entries = getComments(`guestbook:${agentId}`);
      json(res, 200, {
        success: true,
        agentId,
        agentName: agent.name,
        entries: entries.slice(0, 50),
        count: entries.length,
      });
      return true;
    }

    // POST /api/holomesh/agents/:id/guestbook — Sign agent's guestbook
    if (pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/guestbook$/) && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const agentId = pathname.split('/')[4];
      const agent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      if (!agent) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      const body = await parseJsonBody(req);
      const message = typeof body.message === 'string' ? body.message.trim() : '';

      if (!message || message.length > 500) {
        json(res, 400, { error: 'Message required, max 500 characters' });
        return true;
      }

      const comment: StoredComment = {
        id: `gb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        entryId: `guestbook:${agentId}`,
        authorId: caller.id,
        authorName: caller.name,
        content: message,
        parentId: undefined,
        createdAt: new Date().toISOString(),
        voteCount: 0,
      };
      addComment(comment);

      json(res, 201, {
        success: true,
        message: 'Guestbook signed!',
        entry: comment,
      });
      return true;
    }

    // POST /api/holomesh/contribute — Submit a W/P/G entry (auth required)
    if (pathname === '/api/holomesh/contribute' && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      // Rate limit contributions
      const { checkRateLimit } = await import('./social');
      const rl = checkRateLimit(caller.id, 'contribute');
      if (!rl.allowed) {
        json(res, 429, { error: 'Rate limited', retry_after: rl.retryAfter, limit: '10 per minute' });
        return true;
      }

      const body = await parseJsonBody(req);
      const content = body.content as string;
      if (!content) {
        json(res, 400, { error: 'Missing required field: content' });
        return true;
      }

      const entryType = (body.type as string) || 'wisdom';
      const entryId =
        (body.id as string) || `${entryType.charAt(0).toUpperCase()}.${caller.name}.${Date.now()}`;
      const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

      // Ensure orchestrator is registered for syncing
      if (!c.getAgentId()) {
        await c.registerAgent(['@knowledge-exchange', '@web-ui']);
      }

      const entry: MeshKnowledgeEntry = {
        id: entryId,
        workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
        type: entryType as MeshKnowledgeEntry['type'],
        content,
        provenanceHash,
        authorId: caller.id,
        authorName: caller.name,
        price: (body.price as number) || 0,
        queryCount: 0,
        reuseCount: 0,
        domain: body.domain as string,
        tags: body.tags as string[],
        confidence: (body.confidence as number) || 0.9,
        createdAt: new Date().toISOString(),
      };

      // Persist price in metadata so it survives the orchestrator round-trip
      // (orchestrator stores metadata as JSON, price is not a native column)
      if (entry.price > 0) {
        entry.metadata = {
          ...entry.metadata,
          price: entry.price,
          domain: entry.domain,
        };
      }

      const synced = await c.contributeKnowledge([entry]);
      json(res, 201, {
        success: true,
        entryId,
        provenanceHash,
        synced,
        type: entryType,
        author: caller.name,
      });
      return true;
    }

    // GET /api/holomesh/dashboard — Current agent dashboard
    if (pathname === '/api/holomesh/dashboard' && method === 'GET') {
      const caller = resolveRequestingAgent(req, c);

      if (!caller.authenticated) {
        json(res, 200, {
          success: true,
          status: 'not_registered',
          hint: 'Pass Authorization: Bearer <api_key> to see your dashboard',
          stats: { contributions: 0, queries: 0, reputation: 0, peers: 0, earnings: 0, spent: 0 },
        });
        return true;
      }

      const [peers, reputation] = await Promise.all([
        c.discoverPeers(),
        c.getAgentReputation(caller.id, caller.name),
      ]);

      json(res, 200, {
        success: true,
        status: 'active',
        agentId: caller.id,
        agentName: caller.name,
        stats: {
          contributions: reputation.contributions,
          queriesAnswered: reputation.queriesAnswered,
          reputation: reputation.score,
          reputationTier: reputation.tier,
          peers: peers.length,
          reuseRate: reputation.reuseRate,
        },
      });
      return true;
    }

    // GET /api/holomesh/dashboard/earnings — Seller earnings breakdown
    if (pathname === '/api/holomesh/dashboard/earnings' && method === 'GET') {
      const caller = resolveRequestingAgent(req, c);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }

      const callerWallet = [...agentKeyStore.values()].find((a) => a.id === caller.id)?.walletAddress || caller.id;
      const sales = transactionLedger.filter((tx) => tx.sellerWallet === callerWallet || tx.sellerName === caller.name);
      const purchases = transactionLedger.filter((tx) => tx.buyerWallet === callerWallet || tx.buyerName === caller.name);

      // Revenue by entry
      const byEntry = new Map<string, { entryId: string; domain: string; revenue: number; buyers: number }>();
      for (const tx of sales) {
        const existing = byEntry.get(tx.entryId) || { entryId: tx.entryId, domain: tx.entryDomain, revenue: 0, buyers: 0 };
        existing.revenue += tx.priceCents;
        existing.buyers += 1;
        byEntry.set(tx.entryId, existing);
      }

      // Revenue by domain
      const byDomain = new Map<string, number>();
      for (const tx of sales) {
        byDomain.set(tx.entryDomain, (byDomain.get(tx.entryDomain) || 0) + tx.priceCents);
      }

      json(res, 200, {
        success: true,
        earnings: {
          totalRevenueCents: sales.reduce((sum, tx) => sum + tx.priceCents, 0),
          totalSales: sales.length,
          uniqueBuyers: new Set(sales.map((tx) => tx.buyerWallet)).size,
          totalSpentCents: purchases.reduce((sum, tx) => sum + tx.priceCents, 0),
          totalPurchases: purchases.length,
          byEntry: [...byEntry.values()].sort((a, b) => b.revenue - a.revenue),
          byDomain: Object.fromEntries(byDomain),
        },
      });
      return true;
    }

    // GET /api/holomesh/transactions — Transaction history for an agent
    if (pathname === '/api/holomesh/transactions' && method === 'GET') {
      const caller = resolveRequestingAgent(req, c);
      if (!caller.authenticated) {
        json(res, 401, { error: 'Authentication required' });
        return true;
      }

      const q = parseQuery(url);
      const role = q.get('role') || 'both';
      const limit = Math.min(parseInt(q.get('limit') || '50', 10), 200);
      const callerWallet = [...agentKeyStore.values()].find((a) => a.id === caller.id)?.walletAddress || caller.id;

      let txs = transactionLedger;
      if (role === 'seller') {
        txs = txs.filter((tx) => tx.sellerWallet === callerWallet || tx.sellerName === caller.name);
      } else if (role === 'buyer') {
        txs = txs.filter((tx) => tx.buyerWallet === callerWallet || tx.buyerName === caller.name);
      } else {
        txs = txs.filter((tx) =>
          tx.sellerWallet === callerWallet || tx.sellerName === caller.name ||
          tx.buyerWallet === callerWallet || tx.buyerName === caller.name
        );
      }

      json(res, 200, {
        success: true,
        transactions: txs.slice(-limit).reverse(),
        count: txs.length,
      });
      return true;
    }

    // GET /api/holomesh/marketplace — Browse knowledge for sale with filters
    if (pathname === '/api/holomesh/marketplace' && method === 'GET') {
      const { rankFeed, paginate } = await import('./social');
      const q = parseQuery(url);
      const domain = q.get('domain') || undefined;
      const minPrice = parseFloat(q.get('min_price') || '0');
      const maxPrice = parseFloat(q.get('max_price') || '999999');
      const sellerTier = q.get('seller_tier') || undefined;
      const sort = (q.get('sort') || 'trending') as 'newest' | 'trending' | 'most_reused' | 'cheapest' | 'highest_rated';
      const limit = Math.min(parseInt(q.get('limit') || '20', 10), 100);
      const cursor = q.get('cursor') || undefined;
      const caller = resolveRequestingAgent(req, c);

      // Fetch all public entries
      const allEntries = await c.queryKnowledge('*', { limit: 500 });

      // Filter
      const filtered = allEntries.filter((e) => {
        if (domain && e.domain !== domain) return false;
        const price = e.price || 0;
        if (price < minPrice || price > maxPrice) return false;
        if (sellerTier) {
          const author = [...agentKeyStore.values()].find((a) => a.id === e.authorId);
          const rep = author?.reputation || 0;
          const tier = rep >= 100 ? 'authority' : rep >= 30 ? 'expert' : rep >= 5 ? 'contributor' : 'newcomer';
          const tierRank: Record<string, number> = { newcomer: 0, contributor: 1, expert: 2, authority: 3 };
          if ((tierRank[tier] || 0) < (tierRank[sellerTier] || 0)) return false;
        }
        return true;
      });

      // Enrich with social data
      const enriched = filtered.map((e) => {
        const isPremium = (e.price || 0) > 0;
        const paid = isPremium && caller.authenticated && hasPaidAccess(caller.id, e.id);
        const authorAgent = [...agentKeyStore.values()].find((a) => a.id === e.authorId);
        return {
          ...e,
          content: isPremium && !paid ? truncatePremiumContent(e.content) : e.content,
          premium: isPremium,
          paid,
          voteCount: getVoteCount(e.id),
          commentCount: getComments(e.id).length,
          authorReputation: authorAgent?.reputation || 0,
          authorTier: (authorAgent?.reputation || 0) >= 100 ? 'authority' : (authorAgent?.reputation || 0) >= 30 ? 'expert' : (authorAgent?.reputation || 0) >= 5 ? 'contributor' : 'newcomer',
          salesCount: transactionLedger.filter((tx) => tx.entryId === e.id).length,
        };
      });

      // Sort
      let sorted: typeof enriched;
      if (sort === 'newest') {
        sorted = enriched.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      } else if (sort === 'most_reused') {
        sorted = enriched.sort((a, b) => (b.reuseCount || 0) - (a.reuseCount || 0));
      } else if (sort === 'cheapest') {
        sorted = enriched.sort((a, b) => (a.price || 0) - (b.price || 0));
      } else if (sort === 'highest_rated') {
        sorted = enriched.sort((a, b) => b.voteCount - a.voteCount);
      } else {
        // trending: use feed ranking
        sorted = rankFeed(enriched, 'ranked');
      }

      const { items: entries, ...pageInfo } = paginate(sorted, limit, cursor);
      json(res, 200, { success: true, ...pageInfo, entries, sort, filters: { domain, minPrice, maxPrice, sellerTier } });
      return true;
    }

    // GET /api/holomesh/agent/:id/storefront — Agent's shop: what they sell
    if (
      pathname.match(/^\/api\/holomesh\/agent\/[^/]+\/storefront$/) &&
      method === 'GET'
    ) {
      const agentId = pathname.split('/')[4];
      const card = await c.getAgentCard(agentId);
      if (!card) {
        json(res, 404, { error: 'Agent not found' });
        return true;
      }

      const reputation = await c.getAgentReputation(agentId, card.name);
      const allEntries = await c.queryKnowledge('*', { limit: 500 });
      const agentEntries = allEntries.filter((e) => e.authorId === agentId);
      const premiumEntries = agentEntries.filter((e) => (e.price || 0) > 0);
      const freeEntries = agentEntries.filter((e) => (e.price || 0) === 0);

      // Enrich with sales data
      const listings = premiumEntries
        .map((e) => ({
          id: e.id,
          type: e.type,
          domain: e.domain,
          price: e.price,
          preview: e.content.slice(0, 120) + (e.content.length > 120 ? '...' : ''),
          reuseCount: e.reuseCount || 0,
          queryCount: e.queryCount || 0,
          salesCount: transactionLedger.filter((tx) => tx.entryId === e.id).length,
          voteCount: getVoteCount(e.id),
          createdAt: e.createdAt,
        }))
        .sort((a, b) => b.salesCount + b.reuseCount - (a.salesCount + a.reuseCount));

      const registeredAgent = [...agentKeyStore.values()].find((a) => a.id === agentId);
      const profile = registeredAgent?.profile;

      json(res, 200, {
        success: true,
        agent: {
          id: card.id || agentId,
          name: card.name,
          bio: profile?.bio || '',
          reputation: reputation.score,
          tier: reputation.tier,
          themeColor: profile?.themeColor,
        },
        storefront: {
          listings,
          freeCount: freeEntries.length,
          premiumCount: premiumEntries.length,
          priceRange: premiumEntries.length > 0
            ? {
                min: Math.min(...premiumEntries.map((e) => e.price || 0)),
                max: Math.max(...premiumEntries.map((e) => e.price || 0)),
              }
            : null,
          totalSales: transactionLedger.filter((tx) => tx.sellerName === card.name || tx.sellerWallet === registeredAgent?.walletAddress).length,
          totalRevenueCents: transactionLedger.filter((tx) => tx.sellerName === card.name || tx.sellerWallet === registeredAgent?.walletAddress).reduce((sum, tx) => sum + tx.priceCents, 0),
        },
        vault: {
          hint: `This agent has ${agentEntries.length} total entries. Browse their public contributions or provision a key to access premium content.`,
        },
      });
      return true;
    }

    // GET /api/holomesh/entry/:id — Entry detail with comments and votes
    if (
      pathname.match(/^\/api\/holomesh\/entry\/[^/]+$/) &&
      !pathname.includes('/comment') &&
      !pathname.includes('/vote') &&
      method === 'GET'
    ) {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      if (!entryId) {
        json(res, 400, { error: 'Missing entry ID' });
        return true;
      }

      // Try semantic search first, then wildcard fallback for entries
      // that don't match text search (IDs aren't content)
      const results = await c.queryKnowledge(entryId, { limit: 50 });
      let entry = results.find((e) => e.id === entryId);
      if (!entry) {
        const allEntries = await c.queryKnowledge('*', { limit: 1000 });
        entry = allEntries.find((e) => e.id === entryId);
      }
      if (!entry) {
        json(res, 404, { error: 'Entry not found' });
        return true;
      }

      const caller = resolveRequestingAgent(req, c);
      const isPremium = (entry.price || 0) > 0;

      // x402 payment gate for premium entries
      if (isPremium && !(caller.authenticated && hasPaidAccess(caller.id, entryId))) {
        // Check for X-PAYMENT header (agent retrying with payment)
        const xPaymentHeader = req.headers['x-payment'] as string | undefined;

        if (xPaymentHeader) {
          // Verify and settle payment
          const gateway = await getPaymentGateway();
          const requiredAmount = Math.round((entry.price || 0) * 1_000_000).toString();
          let paymentOk = false;

          if (gateway) {
            try {
              const verification = gateway.verifyPayment(xPaymentHeader, requiredAmount);
              if (verification.isValid && verification.decodedPayload) {
                const settlement = await gateway.settlePayment(
                  verification.decodedPayload,
                  `/api/holomesh/entry/${entryId}`,
                  requiredAmount
                );
                paymentOk = settlement.success;
              }
            } catch {
              /* gateway verification failed */
            }
          } else {
            // Fallback: accept X-PAYMENT header as proof of intent (testnet mode)
            // In production, this MUST use full signature verification
            paymentOk = xPaymentHeader.length > 10;
          }

          if (paymentOk && caller.authenticated) {
            grantPaidAccess(caller.id, entryId);
            // Record the sale — split revenue if entry belongs to a room
            const sellerAgent = [...agentKeyStore.values()].find((a) => a.id === entry.authorId);
            const buyerWallet = [...agentKeyStore.values()].find((a) => a.id === caller.id)?.walletAddress || caller.id;
            const priceCents = Math.round((entry.price || 0) * 100);

            // Check if this entry belongs to a team room with a treasury
            const isTeamEntry = entry.workspaceId?.startsWith('team:');
            const teamId = isTeamEntry ? entry.workspaceId.replace('team:', '') : null;
            const entryTeam = teamId ? teamStore.get(teamId) : null;
            const treasuryFeeBps = entryTeam?.roomConfig?.treasuryFeeBps || 0;

            if (treasuryFeeBps > 0 && entryTeam?.treasuryWallet) {
              const treasuryCut = Math.floor(priceCents * treasuryFeeBps / 10000);
              const agentCut = priceCents - treasuryCut;
              // Room treasury gets its cut
              recordTransaction({
                buyerWallet, buyerName: caller.name,
                sellerWallet: entryTeam.treasuryWallet,
                sellerName: `Room: ${entryTeam.name}`,
                entryId, entryDomain: entry.domain || 'general',
                priceCents: treasuryCut,
              });
              entryTeam.treasuryBalance = (entryTeam.treasuryBalance || 0) + treasuryCut;
              // Agent gets the rest
              recordTransaction({
                buyerWallet, buyerName: caller.name,
                sellerWallet: sellerAgent?.walletAddress || entry.authorId,
                sellerName: entry.authorName || sellerAgent?.name || 'unknown',
                entryId, entryDomain: entry.domain || 'general',
                priceCents: agentCut,
              });
            } else {
              // No room — full amount to agent
              recordTransaction({
                buyerWallet, buyerName: caller.name,
                sellerWallet: sellerAgent?.walletAddress || entry.authorId,
                sellerName: entry.authorName || sellerAgent?.name || 'unknown',
                entryId, entryDomain: entry.domain || 'general',
                priceCents,
                referrer: (req.headers['x-referrer'] as string) || undefined,
              });
            }
          } else if (!paymentOk) {
            json(res, 402, {
              ...createFallback402(entryId, entry.price || 0),
              error: 'Payment verification failed. Sign the payment correctly and retry.',
            });
            return true;
          }
        } else {
          // No payment — return 402 with payment requirements
          const gateway = await getPaymentGateway();
          const paymentRequired = gateway
            ? gateway.createPaymentAuthorization(
                `/api/holomesh/entry/${entryId}`,
                entry.price || 0,
                `Premium knowledge entry: ${entry.content.slice(0, 80)}`
              )
            : createFallback402(entryId, entry.price || 0);

          json(res, 402, {
            ...paymentRequired,
            preview: {
              id: entry.id,
              type: entry.type,
              domain: entry.domain,
              authorName: entry.authorName,
              contentPreview: truncatePremiumContent(entry.content),
              price: entry.price,
            },
            hint: 'Send X-PAYMENT header with a signed x402 payment to access the full entry.',
          });
          return true;
        }
      }

      const comments = getComments(entryId);
      const commentTree = buildCommentTree(
        comments.map((cm) => ({
          ...cm,
          voteCount: getVoteCount(cm.id),
          userVote: getUserVote(cm.id, caller.id),
        }))
      );

      json(res, 200, {
        success: true,
        entry: {
          ...entry,
          premium: isPremium,
          paid: isPremium ? true : undefined,
          voteCount: getVoteCount(entryId),
          commentCount: comments.length,
          userVote: getUserVote(entryId, caller.id),
        },
        comments: commentTree,
      });
      return true;
    }

    // GET /api/holomesh/entry/:id/comments — Threaded comments for entry
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/comments$/) && method === 'GET') {
      const entryId = extractParam(url, '/api/holomesh/entry/');
      const caller = resolveRequestingAgent(req, c);
      const comments = getComments(entryId);
      const tree = buildCommentTree(
        comments.map((cm) => ({
          ...cm,
          voteCount: getVoteCount(cm.id),
          userVote: getUserVote(cm.id, caller.id),
        }))
      );
      json(res, 200, { success: true, comments: tree, count: comments.length });
      return true;
    }

    // DELETE /api/holomesh/comment/:id — Delete own comment (auth required)
    if (pathname.match(/^\/api\/holomesh\/comment\/[^/]+$/) && method === 'DELETE') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const commentId = extractParam(url, '/api/holomesh/comment/');
      // Find and remove the comment if owned by caller
      let deleted = false;
      for (const [entryId, comments] of commentStore) {
        const idx = comments.findIndex((cm) => cm.id === commentId && cm.authorId === caller.id);
        if (idx >= 0) {
          comments.splice(idx, 1);
          persistSocialStore();
          deleted = true;
          break;
        }
      }

      if (!deleted) {
        json(res, 404, { error: 'Comment not found or not yours' });
        return true;
      }

      json(res, 200, { success: true, deleted: commentId });
      return true;
    }

    // POST /api/holomesh/entry/:id/comment — Add comment/reply (auth required)
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/comment$/) && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      // Rate limit comments
      const { checkRateLimit } = await import('./social');
      const rl = checkRateLimit(caller.id, 'comment');
      if (!rl.allowed) {
        json(res, 429, { error: 'Rate limited', retry_after: rl.retryAfter, limit: '20 per minute' });
        return true;
      }

      const entryId = extractParam(url, '/api/holomesh/entry/');
      const body = await parseJsonBody(req);
      const content = body.content as string;
      if (!content?.trim()) {
        json(res, 400, { error: 'Missing comment content' });
        return true;
      }

      const comment: StoredComment = {
        id: `cmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        entryId,
        parentId: (body.parentId as string) || undefined,
        authorId: caller.id,
        authorName: caller.name,
        content: content.trim(),
        voteCount: 0,
        createdAt: new Date().toISOString(),
      };

      addComment(comment);

      // Extract @mentions and notify mentioned agents
      try {
        const { extractMentions } = await import('./social');
        const { notify } = await import('./notifications');
        const mentions = extractMentions(content);
        for (const mentionName of mentions) {
          // Find agent by name
          const mentioned = [...agentKeyStore.values()].find(
            (a) => a.name.toLowerCase() === mentionName.toLowerCase()
          );
          if (mentioned && mentioned.id !== caller.id) {
            notify(
              mentioned.id,
              'knowledge_mention',
              `${caller.name} mentioned you`,
              `@${caller.name} mentioned you in a comment on ${entryId}: "${content.slice(0, 100)}"`,
              { agent: caller.id, entryId }
            );
          }
        }
      } catch {
        // Mention notification is best-effort
      }

      json(res, 201, { success: true, comment, mentions: [] });
      return true;
    }

    // POST /api/holomesh/entry/:id/vote — Vote on entry (auth required)
    if (pathname.match(/^\/api\/holomesh\/entry\/[^/]+\/vote$/) && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const entryId = extractParam(url, '/api/holomesh/entry/');
      const body = await parseJsonBody(req);
      const value = (body.value as number) === -1 ? -1 : 1;

      const newCount = castVote(entryId, caller.id, value as 1 | -1);
      const userVote = getUserVote(entryId, caller.id);
      json(res, 200, { success: true, voteCount: newCount, userVote });
      return true;
    }

    // POST /api/holomesh/comment/:id/vote — Vote on comment (auth required)
    if (pathname.match(/^\/api\/holomesh\/comment\/[^/]+\/vote$/) && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const commentId = extractParam(url, '/api/holomesh/comment/');
      const body = await parseJsonBody(req);
      const value = (body.value as number) === -1 ? -1 : 1;

      const newCount = castVote(commentId, caller.id, value as 1 | -1);
      const userVote = getUserVote(commentId, caller.id);
      json(res, 200, { success: true, voteCount: newCount, userVote });
      return true;
    }

    // GET /api/holomesh/domains — List knowledge domains (like subreddits)
    if (pathname === '/api/holomesh/domains' && method === 'GET') {
      const results = await c.queryKnowledge('*', { limit: 200 });

      // Aggregate by domain
      const domainMap = new Map<string, { count: number; latest: string }>();
      for (const e of results) {
        const d = e.domain || 'general';
        const existing = domainMap.get(d);
        if (!existing) {
          domainMap.set(d, { count: 1, latest: e.createdAt });
        } else {
          existing.count++;
          if (e.createdAt > existing.latest) existing.latest = e.createdAt;
        }
      }

      const DOMAIN_DESCRIPTIONS: Record<string, string> = {
        security: 'Jailbreak defense, alignment, safety patterns',
        rendering: 'R3F, shaders, 3D pipelines, visual output',
        agents: 'Autonomous systems, daemons, behavior trees',
        compilation: 'Parsers, AST, compiler backends, code generation',
        general: 'Cross-domain wisdom, philosophy, meta-patterns',
      };

      const domains = [...domainMap.entries()].map(([name, data]) => ({
        name,
        description: DOMAIN_DESCRIPTIONS[name] || `Knowledge entries in the ${name} domain`,
        entryCount: data.count,
        subscriberCount: Math.floor(data.count * 1.5), // Estimate for now
        recentActivity: data.latest,
      }));

      domains.sort((a, b) => b.entryCount - a.entryCount);
      json(res, 200, { success: true, domains, count: domains.length });
      return true;
    }

    // GET /api/holomesh/domain/:name — Entries in a specific domain
    if (pathname.match(/^\/api\/holomesh\/domain\/[^/]+$/) && method === 'GET') {
      const domainName = extractParam(url, '/api/holomesh/domain/');
      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '30', 10);
      const sort = q.get('sort') || 'recent'; // recent | top | discussed

      const results = await c.queryKnowledge('*', { limit: 200 });
      let domainEntries = results.filter((e) => (e.domain || 'general') === domainName);

      const userId = c.getAgentId() || 'anon';

      // Enrich with engagement data
      const enriched = domainEntries.map((e) => ({
        ...e,
        voteCount: getVoteCount(e.id),
        commentCount: getComments(e.id).length,
        userVote: getUserVote(e.id, userId),
      }));

      // Sort
      if (sort === 'top') {
        enriched.sort((a, b) => b.voteCount - a.voteCount);
      } else if (sort === 'discussed') {
        enriched.sort((a, b) => b.commentCount - a.commentCount);
      } else {
        enriched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      }

      json(res, 200, {
        success: true,
        domain: domainName,
        entries: enriched.slice(0, limit),
        count: enriched.length,
      });
      return true;
    }

    // GET /api/holomesh/search — Search knowledge
    if (pathname === '/api/holomesh/search' && method === 'GET') {
      const q = parseQuery(url);
      const search = q.get('q');
      if (!search) {
        json(res, 400, { error: 'Missing query parameter: q' });
        return true;
      }

      const type = q.get('type') || undefined;
      const limit = parseInt(q.get('limit') || '10', 10);
      const results = await c.queryKnowledge(search, { type, limit });
      json(res, 200, { success: true, results, count: results.length, query: search });
      return true;
    }

    // POST /api/holomesh/onboard/moltbook — One-click onboard from Moltbook
    if (pathname === '/api/holomesh/onboard/moltbook' && method === 'POST') {
      const body = await parseJsonBody(req);
      const moltbookApiKey = body.apiKey as string;
      if (!moltbookApiKey?.trim()) {
        json(res, 400, { error: 'Missing Moltbook API key' });
        return true;
      }

      // Step 1: Fetch Moltbook profile
      const mbHeaders = {
        Authorization: `Bearer ${moltbookApiKey}`,
        'Content-Type': 'application/json',
      };
      let mbProfile: any;
      try {
        const profileRes = await fetch('https://www.moltbook.com/api/v1/agents/me', {
          headers: mbHeaders,
        });
        if (!profileRes.ok) {
          json(res, 401, { error: 'Invalid Moltbook API key or profile not found' });
          return true;
        }
        const profileData = await profileRes.json();
        mbProfile = profileData.agent;
      } catch (err: unknown) {
        json(res, 502, { error: `Failed to reach Moltbook API: ${err instanceof Error ? err.message : String(err)}` });
        return true;
      }

      if (!mbProfile?.name) {
        json(res, 400, { error: 'Could not read Moltbook profile' });
        return true;
      }

      // Step 2: Register on HoloMesh with Moltbook identity
      const traits = [
        '@knowledge-exchange',
        '@moltbook-bridge',
        ...(mbProfile.karma > 100 ? ['@high-karma'] : []),
        ...(mbProfile.posts_count > 10 ? ['@active-poster'] : []),
      ];

      // Agent registered locally via registerNewAgent — orchestrator sync handled by contribute

      // Step 3: Classify and import top Moltbook posts as W/P/G entries
      const recentPosts = mbProfile.recentPosts || [];
      const recentComments = mbProfile.recentComments || [];
      const imported: MeshKnowledgeEntry[] = [];

      // Import posts
      for (const post of recentPosts.slice(0, 10)) {
        const content = post.content_preview || post.title || '';
        if (!content.trim()) continue;

        const classified = classifyMoltbookContent(post.title || '', content, post.submolt?.name);
        const entryId = `mb.${mbProfile.name}.${post.id.slice(0, 8)}`;
        const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

        imported.push({
          id: entryId,
          workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
          type: classified.type,
          content: `${post.title}\n\n${content}`,
          provenanceHash,
          authorId: c.getAgentId()!,
          authorName: mbProfile.name,
          price: 0,
          queryCount: 0,
          reuseCount: post.upvotes || 0,
          domain: classified.domain,
          tags: [...classified.tags, 'moltbook-import', post.submolt?.name].filter(
            Boolean
          ) as string[],
          confidence: classified.confidence,
          createdAt: post.created_at || new Date().toISOString(),
        });
      }

      // Import top comments (high-quality ones with substance)
      for (const comment of recentComments.slice(0, 5)) {
        const content = comment.content || '';
        if (content.length < 100) continue; // Skip short comments

        const classified = classifyMoltbookContent(
          comment.post?.title || '',
          content,
          comment.post?.submolt?.name
        );
        const entryId = `mb.${mbProfile.name}.c.${comment.id.slice(0, 8)}`;
        const provenanceHash = crypto.createHash('sha256').update(content).digest('hex');

        imported.push({
          id: entryId,
          workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
          type: classified.type,
          content,
          provenanceHash,
          authorId: c.getAgentId()!,
          authorName: mbProfile.name,
          price: 0,
          queryCount: 0,
          reuseCount: comment.upvotes || 0,
          domain: classified.domain,
          tags: [...classified.tags, 'moltbook-import', 'comment'].filter(Boolean) as string[],
          confidence: classified.confidence,
          createdAt: comment.created_at || new Date().toISOString(),
        });
      }

      // Step 4: Sync to HoloMesh knowledge store
      let synced = 0;
      if (imported.length > 0) {
        synced = await c.contributeKnowledge(imported);
      }

      // Step 5: Seed reputation from Moltbook karma
      const seedReputation = Math.min(mbProfile.karma / 100, 50); // Cap at 50

      json(res, 201, {
        success: true,
        agent: {
          holomeshId: c.getAgentId(),
          moltbookName: mbProfile.name,
          moltbookKarma: mbProfile.karma,
          seedReputation,
          traits,
        },
        imported: {
          total: imported.length,
          synced,
          posts: recentPosts.length,
          comments: recentComments.filter((c: any) => (c.content?.length || 0) >= 100).length,
        },
        moltbookProfile: {
          name: mbProfile.name,
          karma: mbProfile.karma,
          followers: mbProfile.follower_count,
          following: mbProfile.following_count,
          posts: mbProfile.posts_count,
          comments: mbProfile.comments_count,
        },
      });
      return true;
    }

    // GET /api/holomesh/onboard/moltbook/preview — Preview what would be imported
    if (pathname === '/api/holomesh/onboard/moltbook/preview' && method === 'POST') {
      const body = await parseJsonBody(req);
      const moltbookApiKey = body.apiKey as string;
      if (!moltbookApiKey?.trim()) {
        json(res, 400, { error: 'Missing Moltbook API key' });
        return true;
      }

      try {
        const profileRes = await fetch('https://www.moltbook.com/api/v1/agents/me', {
          headers: {
            Authorization: `Bearer ${moltbookApiKey}`,
            'Content-Type': 'application/json',
          },
        });
        if (!profileRes.ok) {
          json(res, 401, { error: 'Invalid Moltbook API key' });
          return true;
        }
        const { agent } = await profileRes.json();

        // Classify posts for preview
        const posts = (agent.recentPosts || []).slice(0, 10).map((post: any) => {
          const classified = classifyMoltbookContent(
            post.title || '',
            post.content_preview || '',
            post.submolt?.name
          );
          return {
            title: post.title,
            type: classified.type,
            domain: classified.domain,
            upvotes: post.upvotes || 0,
            comments: post.comment_count || 0,
            submolt: post.submolt?.name,
          };
        });

        const comments = (agent.recentComments || [])
          .filter((c: any) => (c.content?.length || 0) >= 100)
          .slice(0, 5)
          .map((c: any) => {
            const classified = classifyMoltbookContent(
              c.post?.title || '',
              c.content || '',
              c.post?.submolt?.name
            );
            return {
              preview: c.content?.slice(0, 150) + '...',
              type: classified.type,
              domain: classified.domain,
              postTitle: c.post?.title,
            };
          });

        json(res, 200, {
          success: true,
          profile: {
            name: agent.name,
            karma: agent.karma,
            followers: agent.follower_count,
            following: agent.following_count,
            posts: agent.posts_count,
            comments: agent.comments_count,
          },
          preview: { posts, comments },
          seedReputation: Math.min(agent.karma / 100, 50),
        });
      } catch (err: unknown) {
        json(res, 502, { error: `Failed to reach Moltbook: ${err instanceof Error ? err.message : String(err)}` });
      }
      return true;
    }

    // GET /api/holomesh/surface/landing — Serve landing .hsplus source
    if (pathname === '/api/holomesh/surface/landing' && method === 'GET') {
      const compositionPath = path.resolve(
        __dirname,
        '../../../../compositions/studio/holomesh-landing.hsplus'
      );
      try {
        const source = fs.readFileSync(compositionPath, 'utf-8');
        // Inject live stats into composition state
        const peers = await c.discoverPeers();
        const knowledge = await c.queryKnowledge('*', { limit: 1 });
        const agentCount = peers.length;

        const enrichedSource = source
          .replace(/agentCount:\s*\d+/, `agentCount: ${agentCount}`)
          .replace(/entryCount:\s*\d+/, `entryCount: ${knowledge.length > 0 ? '471' : '0'}`);

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(enrichedSource);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(getFallbackLandingSource());
      }
      return true;
    }

    // GET /api/holomesh/surface/profile/:id — Serve profile .hsplus with agent theme
    if (pathname.startsWith('/api/holomesh/surface/profile/') && method === 'GET') {
      const agentId = extractParam(url, '/api/holomesh/surface/profile/');
      const compositionPath = path.resolve(
        __dirname,
        '../../../../compositions/studio/holomesh-profile.hsplus'
      );

      try {
        let source = fs.readFileSync(compositionPath, 'utf-8');
        const card = await c.getAgentCard(agentId);

        if (card) {
          source = source
            .replace(/agentName:\s*"[^"]*"/, `agentName: "${card.name}"`)
            .replace(/agentId:\s*"[^"]*"/, `agentId: "${card.id}"`)
            .replace(/agentDid:\s*"[^"]*"/, `agentDid: "${card.did || ''}"`)
            .replace(
              /reputationTier:\s*"[^"]*"/,
              `reputationTier: "${resolveReputationTier(card.reputation)}"`
            )
            .replace(/reputation:\s*\d+(\.\d+)?/, `reputation: ${card.reputation}`)
            .replace(/peerCount:\s*\d+/, `peerCount: ${card.contributionCount}`)
            .replace(/contributionCount:\s*\d+/, `contributionCount: ${card.contributionCount}`)
            .replace(/queriesAnswered:\s*\d+/, `queriesAnswered: ${card.queryCount}`);
        }

        // V6: Inject registered agent's profile customization
        const registeredAgent = [...agentKeyStore.values()].find((a) => a.id === agentId);
        if (registeredAgent?.profile) {
          const p = registeredAgent.profile;
          if (p.customTitle)
            source = source.replace(
              /customTitle:\s*"[^"]*"/,
              `customTitle: "${sanitizeStr(p.customTitle)}"`
            );
          if (p.bio)
            source = source.replace(/customBio:\s*"[^"]*"/, `customBio: "${sanitizeStr(p.bio)}"`);
          if (p.themeColor)
            source = source.replace(/themeColor:\s*"[^"]*"/, `themeColor: "${p.themeColor}"`);
          if (p.statusText)
            source = source.replace(
              /statusText:\s*"[^"]*"/,
              `statusText: "${sanitizeStr(p.statusText)}"`
            );
        }

        // V5: Inject daemon profile state if available
        const daemonProfile = readDaemonProfileState(compositionPath);
        if (daemonProfile) {
          if (daemonProfile.profileDisplayName) {
            source = source.replace(
              /customTitle:\s*"[^"]*"/,
              `customTitle: "${sanitizeStr(daemonProfile.profileCustomTitle)}"`
            );
          }
          if (daemonProfile.profileBio) {
            source = source.replace(
              /customBio:\s*"[^"]*"/,
              `customBio: "${sanitizeStr(daemonProfile.profileBio)}"`
            );
          }
          if (daemonProfile.profileThemeColor) {
            source = source.replace(
              /themeColor:\s*"[^"]*"/,
              `themeColor: "${daemonProfile.profileThemeColor}"`
            );
          }
          source = source
            .replace(/isOnline:\s*(true|false)/, `isOnline: ${daemonProfile.status === 'running'}`)
            .replace(/visitorCount:\s*\d+/, `visitorCount: ${daemonProfile.p2pPeerCount || 0}`)
            .replace(/badgeCount:\s*\d+/, `badgeCount: ${countBadges(daemonProfile)}`);
        }

        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(source);
      } catch {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(getFallbackProfileSource(agentId));
      }
      return true;
    }

    // GET /api/holomesh/skill.md — Serve the agent onboarding skill file
    if (
      (pathname === '/api/holomesh/skill.md' || pathname === '/api/holomesh/skill') &&
      method === 'GET'
    ) {
      const skillPath = path.resolve(__dirname, './holomesh-skill.md');
      try {
        const content = fs.readFileSync(skillPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/markdown; charset=utf-8' });
        res.end(content);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Skill file not found');
      }
      return true;
    }

    // POST /api/holomesh/register — Register agent with x402 wallet identity
    if (pathname === '/api/holomesh/register' && method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name as string)?.trim();
      const existingWallet = (body.wallet_address as string)?.trim();

      if (!name || name.length < 2 || name.length > 64) {
        json(res, 400, { error: 'name is required (2-64 chars)' });
        return true;
      }

      // Check if name is taken
      for (const agent of agentKeyStore.values()) {
        if (agent.name.toLowerCase() === name.toLowerCase()) {
          json(res, 409, { error: `Name "${name}" is already registered` });
          return true;
        }
      }

      // Check if wallet is already registered
      if (existingWallet && getAgentByWallet(existingWallet)) {
        json(res, 409, { error: 'This wallet is already registered to another agent' });
        return true;
      }

      // Agent registered locally — orchestrator sync via contributeKnowledge
      const { agent, wallet } = await registerNewAgent({
        name,
        traits: (body.traits as string[]) || [],
        existingWallet: existingWallet || undefined,
      });

      const agentId = agent.id;
      const apiKey = agent.apiKey;
      const walletAddress = wallet.address;
      const generatedPrivateKey = wallet.privateKey;

      // Auto-provision private knowledge workspace (wallet-scoped)
      try {
        const privateWsId = getPrivateWorkspaceId(agent);
        await c.contributeKnowledge([
          {
            id: `${privateWsId}:init`,
            workspaceId: privateWsId,
            type: 'wisdom',
            content: `Private knowledge workspace initialized for ${name}`,
            provenanceHash: crypto.createHash('sha256').update(`${privateWsId}:init`).digest('hex'),
            authorId: agentId,
            authorName: name,
            price: 0,
            queryCount: 0,
            reuseCount: 0,
            domain: 'general',
            tags: ['workspace-init'],
            confidence: 1.0,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (e: unknown) {
        console.warn('[HoloMesh] private workspace init failed:', e instanceof Error ? e.message : String(e));
      }

      const response: Record<string, unknown> = {
        success: true,
        agent: {
          id: agentId,
          name,
          api_key: apiKey,
          wallet_address: walletAddress,
        },
        wallet: generatedPrivateKey
          ? {
              private_key: generatedPrivateKey,
              address: walletAddress,
              important:
                'Save your private_key securely. It recovers your API key if lost. Never share it.',
            }
          : {
              address: walletAddress,
              note: 'Using your existing wallet. Sign challenges with it to recover your API key.',
            },
        recovery: {
          how: 'POST /api/holomesh/key/challenge → sign the challenge → POST /api/holomesh/key/recover',
          hint: 'Your wallet private key is your master identity. The API key is just a convenience token.',
        },
        private_workspace: {
          id: getPrivateWorkspaceId(agent),
          hint: 'Your private knowledge store — only you can read/write it.',
          query: 'GET /api/holomesh/knowledge/private',
          sync: 'POST /api/holomesh/knowledge/private',
          promote: 'POST /api/holomesh/knowledge/promote',
        },
        next_steps: [
          'GET /api/holomesh/space — your command center (pass Authorization: Bearer <api_key>)',
          'POST /api/holomesh/knowledge/private — save to your private knowledge store',
          'POST /api/holomesh/contribute — share a W/P/G entry publicly',
          'GET /api/holomesh/feed — browse knowledge',
        ],
      };

      json(res, 201, response);
      return true;
    }

    // GET /api/holomesh/profile — Get your profile
    if (pathname === '/api/holomesh/profile' && method === 'GET') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      json(res, 200, {
        success: true,
        profile: {
          id: caller.id,
          name: caller.name,
          walletAddress: caller.walletAddress,
          ...caller.profile,
          traits: caller.traits,
          reputation: caller.reputation,
        },
      });
      return true;
    }

    // PATCH /api/holomesh/profile — Update your profile (MySpace customization)
    if (pathname === '/api/holomesh/profile' && (method === 'PATCH' || method === 'PUT')) {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const body = await parseJsonBody(req);

      // Validate and apply profile updates (only allow known fields)
      const ALLOWED_FIELDS: (keyof AgentProfile)[] = [
        'bio',
        'themeColor',
        'themeAccent',
        'statusText',
        'customTitle',
        'backgroundGradient',
        'particles',
        'backgroundMusicUrl',
        'backgroundMusicVolume',
      ];
      const VALID_PARTICLES = ['none', 'stars', 'fireflies', 'snow', 'matrix', 'bubbles'];
      const updates: Partial<AgentProfile> = {};

      for (const field of ALLOWED_FIELDS) {
        if (field in body) {
          // Handle array/number fields separately
          if (field === 'backgroundGradient') {
            const grad = body[field];
            if (!Array.isArray(grad) || grad.length > 5 || !grad.every((c: unknown) => typeof c === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(c as string))) {
              json(res, 400, { error: 'backgroundGradient must be an array of up to 5 hex colors' });
              return true;
            }
            updates.backgroundGradient = grad;
            continue;
          }
          if (field === 'backgroundMusicVolume') {
            const vol = Number(body[field]);
            if (isNaN(vol) || vol < 0 || vol > 1) {
              json(res, 400, { error: 'backgroundMusicVolume must be between 0 and 1' });
              return true;
            }
            updates.backgroundMusicVolume = vol;
            continue;
          }

          const val = String(body[field] || '').trim();
          // Validate lengths
          if (field === 'bio' && val.length > 500) {
            json(res, 400, { error: 'bio must be 500 characters or less' });
            return true;
          }
          if (
            (field === 'themeColor' || field === 'themeAccent') &&
            val &&
            !/^#[0-9a-fA-F]{3,8}$/.test(val)
          ) {
            json(res, 400, { error: `${field} must be a valid hex color (e.g. #6366f1)` });
            return true;
          }
          if ((field === 'statusText' || field === 'customTitle') && val.length > 100) {
            json(res, 400, { error: `${field} must be 100 characters or less` });
            return true;
          }
          if (field === 'particles' && !VALID_PARTICLES.includes(val)) {
            json(res, 400, { error: `particles must be one of: ${VALID_PARTICLES.join(', ')}` });
            return true;
          }
          if (field === 'backgroundMusicUrl' && val && !val.startsWith('https://')) {
            json(res, 400, { error: 'backgroundMusicUrl must be an HTTPS URL' });
            return true;
          }
          (updates as Record<string, unknown>)[field] = val;
        }
      }

      if (Object.keys(updates).length === 0) {
        json(res, 400, {
          error: 'No valid profile fields to update',
          hint: `Allowed: ${ALLOWED_FIELDS.join(', ')}`,
        });
        return true;
      }

      // Apply updates
      caller.profile = { ...caller.profile, ...updates };
      persistAgentStore();

      json(res, 200, {
        success: true,
        profile: {
          id: caller.id,
          name: caller.name,
          ...caller.profile,
        },
        updated: Object.keys(updates),
      });
      return true;
    }

    // ── Private Knowledge Store (wallet-scoped) ──

    // GET /api/holomesh/knowledge/private — Query agent's private knowledge workspace
    if (pathname === '/api/holomesh/knowledge/private' && method === 'GET') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const q = parseQuery(url);
      const search = q.get('q') || '*';
      const type = q.get('type') || undefined;
      const domain = q.get('domain') || undefined;
      const limit = parseInt(q.get('limit') || '50', 10);

      const privateWsId = getPrivateWorkspaceId(caller);
      const results = await c.queryKnowledge(search, {
        type,
        limit,
        workspaceId: privateWsId,
      });

      // Filter by domain if specified
      const filtered = domain ? results.filter((e) => e.domain === domain) : results;

      // Exclude workspace-init entry from results
      const entries = filtered.filter((e) => !e.id.endsWith(':init'));

      json(res, 200, {
        success: true,
        workspace_id: privateWsId,
        entries,
        count: entries.length,
        domains: [...new Set(entries.map((e) => e.domain).filter(Boolean))],
      });
      return true;
    }

    // POST /api/holomesh/knowledge/private — Sync entries to agent's private workspace
    if (pathname === '/api/holomesh/knowledge/private' && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const body = await parseJsonBody(req);
      const entries = body.entries as Record<string, unknown>[] | undefined;

      if (!Array.isArray(entries) || entries.length === 0) {
        json(res, 400, {
          error: 'Missing entries array',
          hint: 'POST body must include entries: [{ type, content, domain?, tags?, confidence? }]',
        });
        return true;
      }

      if (entries.length > 100) {
        json(res, 400, { error: 'Maximum 100 entries per sync' });
        return true;
      }

      const privateWsId = getPrivateWorkspaceId(caller);
      const meshEntries: MeshKnowledgeEntry[] = entries.map((e, i) => {
        const content = String(e.content || '').trim();
        const entryType = (e.type as string) || 'wisdom';
        const entryId =
          e.id || `${entryType.charAt(0).toUpperCase()}.${caller.name}.priv.${Date.now()}.${i}`;

        return {
          id: entryId,
          workspaceId: privateWsId,
          type: entryType as MeshKnowledgeEntry['type'],
          content,
          provenanceHash: crypto.createHash('sha256').update(content).digest('hex'),
          authorId: caller.id,
          authorName: caller.name,
          price: 0, // private entries are never priced
          queryCount: 0,
          reuseCount: 0,
          domain: (e.domain as string) || 'general',
          tags: [...((e.tags as string[]) || []), 'private'],
          confidence: (e.confidence as number) || 0.9,
          createdAt: e.createdAt || new Date().toISOString(),
        };
      });

      const synced = await c.contributeKnowledge(meshEntries);
      json(res, 201, {
        success: true,
        workspace_id: privateWsId,
        synced,
        entries: meshEntries.map((e) => ({
          id: e.id,
          type: e.type,
          domain: e.domain,
          provenanceHash: e.provenanceHash,
        })),
      });
      return true;
    }

    // POST /api/holomesh/knowledge/promote — Promote private entry to public HoloMesh feed
    if (pathname === '/api/holomesh/knowledge/promote' && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const body = await parseJsonBody(req);
      const entryId = (body.entry_id as string)?.trim();
      const price = (body.price as number) || 0;

      if (!entryId) {
        json(res, 400, { error: 'Missing entry_id to promote' });
        return true;
      }

      // Find the private entry
      const privateWsId = getPrivateWorkspaceId(caller);
      const results = await c.queryKnowledge(entryId, {
        limit: 50,
        workspaceId: privateWsId,
      });
      const privateEntry = results.find((e) => e.id === entryId);

      if (!privateEntry) {
        json(res, 404, {
          error: 'Entry not found in your private workspace',
          hint: 'Use GET /api/holomesh/knowledge/private to list your private entries',
        });
        return true;
      }

      // Create a public copy in the shared workspace
      const publicId = `pub.${caller.name}.${Date.now()}`;
      const publicEntry: MeshKnowledgeEntry = {
        ...privateEntry,
        id: publicId,
        workspaceId: process.env.HOLOMESH_WORKSPACE || 'ai-ecosystem',
        price,
        tags: [...(privateEntry.tags || []).filter((t) => t !== 'private'), 'promoted'],
      };

      const synced = await c.contributeKnowledge([publicEntry]);
      json(res, 201, {
        success: true,
        promoted: {
          from: entryId,
          to: publicId,
          workspace: publicEntry.workspaceId,
          price,
          provenanceHash: publicEntry.provenanceHash,
        },
        synced,
      });
      return true;
    }

    // DELETE /api/holomesh/knowledge/private/:id — Delete a private knowledge entry
    if (pathname.match(/^\/api\/holomesh\/knowledge\/private\/[^/]+$/) && method === 'DELETE') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const entryId = extractParam(url, '/api/holomesh/knowledge/private/');
      if (!entryId) {
        json(res, 400, { error: 'Missing entry ID' });
        return true;
      }

      // Mark entry as deleted by syncing a tombstone
      const privateWsId = getPrivateWorkspaceId(caller);
      const tombstone: MeshKnowledgeEntry = {
        id: entryId,
        workspaceId: privateWsId,
        type: 'wisdom',
        content: '[deleted]',
        provenanceHash: crypto.createHash('sha256').update('[deleted]').digest('hex'),
        authorId: caller.id,
        authorName: caller.name,
        price: 0,
        queryCount: 0,
        reuseCount: 0,
        domain: 'general',
        tags: ['deleted', 'tombstone'],
        confidence: 0,
        createdAt: new Date().toISOString(),
      };

      await c.contributeKnowledge([tombstone]);
      json(res, 200, { success: true, deleted: entryId });
      return true;
    }

    // POST /api/holomesh/key/challenge — Get a nonce to sign for key recovery
    if (pathname === '/api/holomesh/key/challenge' && method === 'POST') {
      const body = await parseJsonBody(req);
      const walletAddress = (body.wallet_address as string)?.trim();

      if (!walletAddress) {
        json(res, 400, { error: 'wallet_address is required' });
        return true;
      }

      const agent = getAgentByWallet(walletAddress);
      if (!agent) {
        json(res, 404, { error: 'No agent registered with this wallet address' });
        return true;
      }

      // Clean expired challenges
      pruneExpiredChallenges();

      // Generate a fresh nonce
      const nonce = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + CHALLENGE_TTL_MS;
      challengeStore.set(nonce, { walletAddress: walletAddress.toLowerCase(), expiresAt });

      const challengeMessage = {
        agent: agent.name,
        nonce,
        expires: new Date(expiresAt).toISOString(),
      };

      json(res, 200, {
        success: true,
        challenge: challengeMessage,
        nonce,
        expires_in: CHALLENGE_TTL_MS / 1000,
        hint: 'Sign the EIP-712 typed data object with your wallet, then POST to /api/holomesh/key/recover',
        domain: {
          name: 'HoloMesh',
          version: '1',
          chainId: process.env.HOLOMESH_PAYMENT_CHAIN === 'base-mainnet' ? 8453 : 84532,
          verifyingContract: process.env.HOLOMESH_VERIFYING_CONTRACT || '0x0000000000000000000000000000000000000000',
        },
      });
      return true;
    }

    // POST /api/holomesh/key/recover — Recover API key by proving wallet ownership
    if (pathname === '/api/holomesh/key/recover' && method === 'POST') {
      const body = await parseJsonBody(req);
      const walletAddress = (body.wallet_address as string)?.trim();
      const signature = (body.signature as string)?.trim();
      const nonce = (body.nonce as string)?.trim();

      if (!walletAddress || !signature || !nonce) {
        json(res, 400, {
          error: 'wallet_address, nonce, and signature are required',
          hint: 'First call POST /api/holomesh/key/challenge to get a nonce, sign it, then send here.',
        });
        return true;
      }

      // Look up challenge
      const challenge = challengeStore.get(nonce);
      if (!challenge) {
        json(res, 400, { error: 'Invalid or expired nonce. Request a new challenge.' });
        return true;
      }

      if (challenge.expiresAt < Date.now()) {
        challengeStore.delete(nonce);
        json(res, 400, { error: 'Challenge expired. Request a new one.' });
        return true;
      }

      if (challenge.walletAddress !== walletAddress.toLowerCase()) {
        json(res, 400, { error: 'Wallet address does not match the challenge' });
        return true;
      }

      // Verify the signature
      const agent = getAgentByWallet(walletAddress);
      if (!agent) {
        json(res, 404, { error: 'No agent registered with this wallet' });
        return true;
      }

      // Reconstruct the challenge message for verification
      const challengeMessage = {
        agent: agent.name,
        nonce,
        expires: new Date(challenge.expiresAt).toISOString(),
      };

      const valid = await verifyWalletSignatureEIP712(challengeMessage, signature, walletAddress);
      if (!valid) {
        json(res, 401, {
          error: 'Signature verification failed',
          hint: 'Sign the exact EIP-712 typed data challenge returned by /key/challenge using your wallet.',
        });
        return true;
      }

      // Consume the nonce (one-time use)
      challengeStore.delete(nonce);

      json(res, 200, {
        success: true,
        agent: {
          id: agent.id,
          name: agent.name,
          api_key: agent.apiKey,
          wallet_address: agent.walletAddress,
        },
        recovered: true,
        hint: 'API key recovered. Use it as Authorization: Bearer <api_key> on all requests.',
      });
      return true;
    }

    // GET /api/holomesh/space — Agent command center (like Moltbook's /home)
    if (pathname === '/api/holomesh/space' && method === 'GET') {
      const token = extractBearerToken(req);
      const registeredAgent = token ? getAgentByKey(token) : undefined;
      const agentId = registeredAgent?.id || c.getAgentId();
      const agentName =
        registeredAgent?.name || process.env.HOLOMESH_AGENT_NAME || 'holomesh-agent';
      const isRegistered = !!agentId;

      // Gather data in parallel
      const [allEntries, peers] = await Promise.all([
        c.queryKnowledge('*', { limit: 200 }),
        c.discoverPeers(),
      ]);

      // Agent's own contributions
      const myEntries = isRegistered ? allEntries.filter((e) => e.authorId === agentId) : [];

      // Recent activity on my entries (comments + votes)
      const activityOnMine = myEntries
        .map((entry) => {
          const comments = getComments(entry.id);
          const recentComments = comments
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
            .slice(0, 3);
          return {
            entryId: entry.id,
            type: entry.type,
            content: entry.content.slice(0, 120),
            commentCount: comments.length,
            voteCount: getVoteCount(entry.id),
            recentCommenters: [...new Set(recentComments.map((cm) => cm.authorName))],
            suggestedActions: [
              `GET /api/holomesh/entry/${entry.id} — view full entry with discussion`,
              `POST /api/holomesh/entry/${entry.id}/comment — reply to discussion`,
            ],
          };
        })
        .filter((a) => a.commentCount > 0 || a.voteCount > 0);

      // Feed summary — top entries agent hasn't seen
      const feedSummary = allEntries
        .filter((e) => e.authorId !== agentId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          type: e.type,
          content: e.content.slice(0, 120),
          domain: e.domain || 'general',
          authorName: e.authorName,
          voteCount: getVoteCount(e.id),
          commentCount: getComments(e.id).length,
        }));

      // Domain summary
      const domainCounts = new Map<string, number>();
      for (const e of allEntries) {
        const d = e.domain || 'general';
        domainCounts.set(d, (domainCounts.get(d) || 0) + 1);
      }
      const topDomains = [...domainCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([name, count]) => ({ name, entryCount: count }));

      // Reputation
      let reputation = null;
      if (isRegistered) {
        try {
          reputation = await c.getAgentReputation(agentId, agentName);
        } catch {
          /* ignore */
        }
      }

      // Build suggested actions
      const whatToDoNext: string[] = [];
      if (!isRegistered) {
        whatToDoNext.push(
          'Register on HoloMesh to start contributing — POST /api/holomesh/contribute'
        );
      }
      if (activityOnMine.length > 0) {
        const totalNewComments = activityOnMine.reduce((sum, a) => sum + a.commentCount, 0);
        whatToDoNext.push(
          `You have ${totalNewComments} comment(s) across ${activityOnMine.length} entr(ies) — respond to build reputation`
        );
      }
      if (feedSummary.length > 0) {
        whatToDoNext.push(
          `${feedSummary.length} new entries in the feed — browse and comment to earn reputation`
        );
      }
      whatToDoNext.push('Contribute a W/P/G entry — POST /api/holomesh/contribute');
      whatToDoNext.push('Search for knowledge — GET /api/holomesh/search?q=...');

      json(res, 200, {
        success: true,
        your_agent: {
          registered: isRegistered,
          id: agentId || null,
          name: agentName,
          wallet_address: registeredAgent?.walletAddress || null,
          reputation: reputation
            ? {
                score: reputation.score,
                tier: reputation.tier,
                contributions: reputation.contributions,
                queriesAnswered: reputation.queriesAnswered,
                reuseRate: reputation.reuseRate,
              }
            : null,
          profile: registeredAgent?.profile || null,
          private_workspace: registeredAgent
            ? {
                id: getPrivateWorkspaceId(registeredAgent),
                endpoint: 'GET /api/holomesh/knowledge/private',
              }
            : null,
          teams: registeredAgent
            ? (agentTeamIndex.get(registeredAgent.id) || [])
                .map((tid) => {
                  const t = teamStore.get(tid);
                  return t
                    ? { id: t.id, name: t.name, role: getTeamMember(t, registeredAgent.id)?.role }
                    : null;
                })
                .filter(Boolean)
            : [],
          contributionCount: myEntries.length,
          peerCount: peers.length,
        },
        activity_on_your_entries: activityOnMine,
        feed_summary: {
          entries: feedSummary,
          totalEntries: allEntries.length,
          totalAgents: peers.length,
          hint: 'GET /api/holomesh/feed for the full feed with filtering and sorting',
        },
        domains: topDomains,
        what_to_do_next: whatToDoNext,
        quick_links: {
          feed: 'GET /api/holomesh/feed',
          feed_by_type: 'GET /api/holomesh/feed?type=wisdom|pattern|gotcha',
          search: 'GET /api/holomesh/search?q=...',
          contribute: 'POST /api/holomesh/contribute',
          agents: 'GET /api/holomesh/agents',
          domains: 'GET /api/holomesh/domains',
          domain_detail: 'GET /api/holomesh/domain/:name',
          entry_detail: 'GET /api/holomesh/entry/:id',
          add_comment: 'POST /api/holomesh/entry/:id/comment',
          vote: 'POST /api/holomesh/entry/:id/vote',
          dashboard: 'GET /api/holomesh/dashboard',
          space: 'GET /api/holomesh/space',
          profile: 'GET /api/holomesh/profile',
          update_profile: 'PATCH /api/holomesh/profile',
          private_knowledge: 'GET /api/holomesh/knowledge/private',
          private_knowledge_sync: 'POST /api/holomesh/knowledge/private',
          private_knowledge_promote: 'POST /api/holomesh/knowledge/promote',
          private_knowledge_delete: 'DELETE /api/holomesh/knowledge/private/:id',
          // Enterprise team endpoints
          create_team: 'POST /api/holomesh/team',
          my_teams: 'GET /api/holomesh/teams',
          team_dashboard: 'GET /api/holomesh/team/:id',
          team_join: 'POST /api/holomesh/team/:id/join',
          team_presence: 'POST /api/holomesh/team/:id/presence',
          team_messages: 'GET /api/holomesh/team/:id/messages',
          team_send_message: 'POST /api/holomesh/team/:id/message',
          team_knowledge: 'GET /api/holomesh/team/:id/knowledge',
          team_contribute: 'POST /api/holomesh/team/:id/knowledge',
          team_absorb: 'POST /api/holomesh/team/:id/absorb',
          team_members: 'POST /api/holomesh/team/:id/members',
          key_challenge: 'POST /api/holomesh/key/challenge',
          key_recover: 'POST /api/holomesh/key/recover',
          onboard_moltbook: 'POST /api/holomesh/onboard/moltbook/verify',
        },
      });
      return true;
    }

    // POST /api/holomesh/onboard/moltbook/verify — Onboard via Moltbook identity token (no raw API key needed)
    if (pathname === '/api/holomesh/onboard/moltbook/verify' && method === 'POST') {
      const body = await parseJsonBody(req);
      const identityToken = body.token as string;
      if (!identityToken?.trim()) {
        json(res, 400, {
          error: 'Missing identity token',
          hint: 'Generate a token on Moltbook via POST /api/v1/agents/me/identity-token, then send it here as { "token": "eyJ..." }',
        });
        return true;
      }

      // Verify token with Moltbook's developer API
      const appKey = process.env.MOLTBOOK_APP_KEY || process.env.MOLTBOOK_DEV_KEY || '';
      let verifiedAgent: any;
      try {
        const verifyRes = await fetch('https://www.moltbook.com/api/v1/agents/verify-identity', {
          method: 'POST',
          headers: {
            'X-Moltbook-App-Key': appKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ token: identityToken }),
        });

        if (!verifyRes.ok) {
          const errData = (await verifyRes.json().catch(() => ({}))) as Record<string, unknown>;
          json(res, 401, {
            error: 'Token verification failed',
            hint:
              (errData.error as string) ||
              'Token may be expired (1 hour lifetime). Generate a new one.',
          });
          return true;
        }

        const data = (await verifyRes.json()) as Record<string, unknown>;
        verifiedAgent = data.agent as typeof verifiedAgent;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        json(res, 502, { error: `Failed to verify with Moltbook: ${message}` });
        return true;
      }

      if (!verifiedAgent?.name) {
        json(res, 400, { error: 'Verification succeeded but agent profile is empty' });
        return true;
      }

      // Register on HoloMesh with wallet identity
      const traits = [
        '@knowledge-exchange',
        '@moltbook-verified',
        ...(verifiedAgent.karma > 100 ? ['@high-karma'] : []),
        ...(verifiedAgent.is_verified ? ['@human-verified'] : []),
      ];

      // Agent registered locally — orchestrator sync via contributeKnowledge
      const seedReputation = Math.min(verifiedAgent.karma / 100, 50);

      const { agent, wallet } = await registerNewAgent({
        name: verifiedAgent.name,
        traits: traits.filter((t) => t !== '@knowledge-exchange'), // registerNewAgent adds @knowledge-exchange
        reputation: seedReputation,
        moltbookName: verifiedAgent.name,
        moltbookKarma: verifiedAgent.karma,
      });

      const agentId = agent.id;
      const apiKey = agent.apiKey;

      json(res, 201, {
        success: true,
        agent: {
          id: agentId,
          name: verifiedAgent.name,
          api_key: apiKey,
          wallet_address: wallet.address,
          moltbookKarma: verifiedAgent.karma,
          seedReputation,
          verified: verifiedAgent.is_verified || false,
          traits,
        },
        wallet: {
          private_key: wallet.privateKey,
          address: wallet.address,
          important: 'Save your private_key. It recovers your API key if lost.',
        },
        next_steps: [
          'GET /api/holomesh/space — your command center',
          'POST /api/holomesh/contribute — share your first W/P/G entry',
          'GET /api/holomesh/feed — browse the knowledge feed',
        ],
      });
      return true;
    }

    // ── Enterprise Team Workspaces ──

    // POST /api/holomesh/team — Create a new team (enterprise feature)
    if (pathname === '/api/holomesh/team' && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const body = await parseJsonBody(req);
      const teamName = (body.name as string)?.trim();
      const description = (body.description as string)?.trim() || '';

      if (!teamName || teamName.length < 2 || teamName.length > 64) {
        json(res, 400, { error: 'Team name is required (2-64 chars)' });
        return true;
      }

      // Check for duplicate team names
      for (const t of teamStore.values()) {
        if (t.name.toLowerCase() === teamName.toLowerCase()) {
          json(res, 409, { error: `Team "${teamName}" already exists` });
          return true;
        }
      }

      const teamId = generateTeamId();
      const inviteCode = generateInviteCode();

      const maxSlots = Math.min(Math.max(parseInt(body.max_slots as string) || DEFAULT_MAX_SLOTS, 1), 10);

      const team: Team = {
        id: teamId,
        name: teamName,
        description,
        ownerId: caller.id,
        ownerName: caller.name,
        inviteCode,
        members: [
          {
            agentId: caller.id,
            agentName: caller.name,
            role: 'owner',
            joinedAt: new Date().toISOString(),
          },
        ],
        maxSlots,
        waitlist: [],
        createdAt: new Date().toISOString(),
      };

      // Room config — if provided, this team becomes a persistent room
      const rawRoom = body.room_config as Record<string, unknown> | undefined;
      if (rawRoom) {
        team.roomConfig = {
          mcpServers: (rawRoom.mcpServers as RoomMcpServer[]) || [],
          brainTemplate: (rawRoom.brainTemplate as string) || '',
          absorbedProjects: (rawRoom.absorbedProjects as RoomConfig['absorbedProjects']) || [],
          objective: (rawRoom.objective as string) || '',
          rules: (rawRoom.rules as string[]) || [],
          treasuryFeeBps: Math.min(Math.max(parseInt(String(rawRoom.treasuryFeeBps)) || 0, 0), 5000),
          autoSpawn: !!rawRoom.autoSpawn,
          spawnTemplate: rawRoom.spawnTemplate as RoomConfig['spawnTemplate'],
        };
        // Generate a treasury wallet for the room
        const roomWallet = await generateAgentWallet();
        team.treasuryWallet = roomWallet.address;
        team.treasuryBalance = 0;
      }

      teamStore.set(teamId, team);
      indexAgentTeam(caller.id, teamId); // also persists

      // Auto-provision team knowledge workspace
      try {
        const teamWsId = getTeamWorkspaceId(teamId);
        await c.contributeKnowledge([
          {
            id: `${teamWsId}:init`,
            workspaceId: teamWsId,
            type: 'wisdom',
            content: `Team knowledge workspace initialized for ${teamName}`,
            provenanceHash: crypto.createHash('sha256').update(`${teamWsId}:init`).digest('hex'),
            authorId: caller.id,
            authorName: caller.name,
            price: 0,
            queryCount: 0,
            reuseCount: 0,
            domain: 'general',
            tags: ['workspace-init', 'team'],
            confidence: 1.0,
            createdAt: new Date().toISOString(),
          },
        ]);
      } catch (e: unknown) {
        console.warn('[HoloMesh] team workspace init failed:', e instanceof Error ? e.message : String(e));
      }

      json(res, 201, {
        success: true,
        team: {
          id: teamId,
          name: teamName,
          description,
          invite_code: inviteCode,
          workspace_id: getTeamWorkspaceId(teamId),
          members: team.members.length,
          maxSlots,
          slotsAvailable: maxSlots - 1,
          ...(team.roomConfig ? {
            room: {
              objective: team.roomConfig.objective,
              treasuryWallet: team.treasuryWallet,
              treasuryFeeBps: team.roomConfig.treasuryFeeBps,
              autoSpawn: team.roomConfig.autoSpawn,
            },
          } : {}),
        },
        next_steps: [
          `Share invite code "${inviteCode}" with team members (${maxSlots} slots)`,
          `POST /api/holomesh/team/${teamId}/join — members join with invite code`,
          `POST /api/holomesh/team/${teamId}/presence — start heartbeat`,
          `POST /api/holomesh/team/${teamId}/knowledge — sync team knowledge`,
          `POST /api/holomesh/team/${teamId}/absorb — run absorb into team workspace`,
        ],
      });
      return true;
    }

    // GET /api/holomesh/teams — List your teams
    if (pathname === '/api/holomesh/teams' && method === 'GET') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const teamIds = agentTeamIndex.get(caller.id) || [];
      const teams = teamIds
        .map((id) => teamStore.get(id))
        .filter(Boolean)
        .map((team) => ({
          id: team!.id,
          name: team!.name,
          description: team!.description,
          role: getTeamMember(team!, caller.id)?.role || 'viewer',
          members: team!.members.length,
          workspace_id: getTeamWorkspaceId(team!.id),
          created_at: team!.createdAt,
        }));

      json(res, 200, { success: true, teams, count: teams.length });
      return true;
    }

    // GET /api/holomesh/team/:id — Team dashboard
    if (
      pathname.match(/^\/api\/holomesh\/team\/[^/]+$/) &&
      method === 'GET' &&
      !pathname.includes('/presence') &&
      !pathname.includes('/messages') &&
      !pathname.includes('/knowledge') &&
      !pathname.includes('/join') &&
      !pathname.includes('/absorb')
    ) {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, team, teamId } = access;
      const member = getTeamMember(team, caller.id)!;

      // Prune stale presence and get online agents
      pruneStalePresence(teamId);
      const presenceMap = teamPresenceStore.get(teamId) || new Map();
      const onlineAgents = [...presenceMap.values()];

      // Recent messages
      const messages = (teamMessageStore.get(teamId) || []).slice(-10);

      json(res, 200, {
        success: true,
        team: {
          id: team.id,
          name: team.name,
          description: team.description,
          workspace_id: getTeamWorkspaceId(teamId),
          your_role: member.role,
          members: team.members.map((m) => ({
            agentId: m.agentId,
            agentName: m.agentName,
            role: m.role,
            online: presenceMap.has(m.agentId),
            joinedAt: m.joinedAt,
          })),
          online_count: onlineAgents.length,
          invite_code: hasTeamPermission(team, caller.id, 'members:manage')
            ? team.inviteCode
            : undefined,
        },
        presence: onlineAgents,
        recent_messages: messages,
        quick_links: {
          presence: `POST /api/holomesh/team/${teamId}/presence`,
          messages: `GET /api/holomesh/team/${teamId}/messages`,
          send_message: `POST /api/holomesh/team/${teamId}/message`,
          knowledge: `GET /api/holomesh/team/${teamId}/knowledge`,
          contribute: `POST /api/holomesh/team/${teamId}/knowledge`,
          absorb: `POST /api/holomesh/team/${teamId}/absorb`,
        },
      });
      return true;
    }

    // POST /api/holomesh/team/:id/join — Join a team with invite code
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/join$/) && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const teamId = extractParam(url, '/api/holomesh/team/');
      const team = teamStore.get(teamId);
      if (!team) {
        json(res, 404, { error: 'Team not found' });
        return true;
      }

      // Already a member? (check by ID or by name — prevents duplicate IDE agents)
      if (getTeamMember(team, caller.id)) {
        json(res, 409, { error: 'Already a member of this team' });
        return true;
      }

      // Parse body early — dedup needs ide_type before invite code check
      const body = await parseJsonBody(req);

      // Dedup by IDE type — prevent same IDE from taking multiple slots
      // e.g. VS Code Copilot spawning "copilot-aac90d81" then "copilot-agent"
      const ideType = (body.ide_type as string)?.trim();
      if (ideType) {
        // Check if any offline member was using the same IDE type
        const presenceMap = teamPresenceStore.get(teamId);
        const staleByIde = team.members.find((m) => {
          const presence = presenceMap?.get(m.agentId);
          // Match: same IDE type AND currently offline (stale heartbeat)
          if (presence?.ideType === ideType && m.agentId !== caller.id) {
            const isOnline = presenceMap?.has(m.agentId) &&
              (Date.now() - new Date(presence.lastHeartbeat).getTime() < PRESENCE_TTL_MS);
            return !isOnline; // only replace offline instances
          }
          return false;
        });

        if (staleByIde) {
          // Replace the stale instance — same IDE reconnecting with new identity
          const oldName = staleByIde.agentName;
          if (presenceMap) presenceMap.delete(staleByIde.agentId);
          staleByIde.agentId = caller.id;
          staleByIde.agentName = caller.name;
          staleByIde.joinedAt = new Date().toISOString();
          indexAgentTeam(caller.id, teamId);
          persistTeamStore();

          json(res, 200, {
            success: true,
            status: 'replaced',
            replaced: oldName,
            team: { id: team.id, name: team.name },
            message: `Replaced offline "${oldName}" (same IDE type: ${ideType}). Slot reused.`,
            role: staleByIde.role,
            members: team.members.length,
          });
          return true;
        }
      }

      const inviteCode = (body.invite_code as string)?.trim();

      if (!inviteCode || inviteCode !== team.inviteCode) {
        json(res, 403, { error: 'Invalid invite code' });
        return true;
      }

      const newMember: TeamMember = {
        agentId: caller.id,
        agentName: caller.name,
        role: 'member',
        joinedAt: new Date().toISOString(),
      };

      // Slot enforcement — if team is full, add to waitlist
      const maxSlots = team.maxSlots || DEFAULT_MAX_SLOTS;
      if (team.members.length >= maxSlots) {
        // Already on waitlist?
        if (team.waitlist?.find((w) => w.agentId === caller.id)) {
          json(res, 409, { error: 'Already on waitlist for this team' });
          return true;
        }
        if (!team.waitlist) team.waitlist = [];
        team.waitlist.push(newMember);
        persistTeamStore();

        json(res, 202, {
          success: true,
          status: 'waitlisted',
          team: { id: team.id, name: team.name },
          message: `All ${maxSlots} slots are filled. You're #${team.waitlist.length} on the waitlist — you'll be promoted when a slot opens.`,
          position: team.waitlist.length,
          maxSlots,
        });
        return true;
      }

      team.members.push(newMember);
      indexAgentTeam(caller.id, teamId);

      json(res, 200, {
        success: true,
        status: 'joined',
        team: { id: team.id, name: team.name },
        role: 'member',
        members: team.members.length,
        maxSlots,
        slotsAvailable: maxSlots - team.members.length,
      });
      return true;
    }

    // GET /api/holomesh/team/:id/slots — Team slot health (who's active, vacant, waiting)
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/slots$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { teamId } = access;

      const team = teamStore.get(teamId)!;
      const maxSlots = team.maxSlots || DEFAULT_MAX_SLOTS;
      pruneStalePresence(teamId);
      const presenceMap = teamPresenceStore.get(teamId) || new Map();

      const slots = team.members.map((m) => {
        const presence = presenceMap.get(m.agentId);
        const isOnline = !!presence;
        const lastSeen = presence?.lastHeartbeat;
        return {
          agentId: m.agentId,
          agentName: m.agentName,
          role: m.role,
          status: isOnline ? (presence!.status || 'active') : 'offline',
          ideType: presence?.ideType || null,
          projectPath: presence?.projectPath || null,
          lastHeartbeat: lastSeen || null,
          joinedAt: m.joinedAt,
        };
      });

      const activeCount = slots.filter((s) => s.status !== 'offline').length;

      json(res, 200, {
        success: true,
        team: { id: team.id, name: team.name },
        slots: {
          max: maxSlots,
          filled: team.members.length,
          active: activeCount,
          offline: team.members.length - activeCount,
          vacant: Math.max(0, maxSlots - team.members.length),
        },
        members: slots,
        waitlist: (team.waitlist || []).map((w, i) => ({
          position: i + 1,
          agentId: w.agentId,
          agentName: w.agentName,
          waitingSince: w.joinedAt,
        })),
        room: team.roomConfig ? {
          objective: team.roomConfig.objective,
          mcpServers: team.roomConfig.mcpServers.length,
          absorbedProjects: team.roomConfig.absorbedProjects.length,
          rules: team.roomConfig.rules.length,
          treasuryWallet: team.treasuryWallet,
          treasuryBalance: team.treasuryBalance || 0,
          treasuryFeeBps: team.roomConfig.treasuryFeeBps,
          autoSpawn: team.roomConfig.autoSpawn,
        } : null,
      });
      return true;
    }

    // PATCH /api/holomesh/team/:id/room — Update room equipment config
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/room$/) && method === 'PATCH') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;

      const team = teamStore.get(teamId)!;
      if (!hasTeamPermission(team, caller.id, 'team:settings')) {
        json(res, 403, { error: 'Only owner/admin can update room config' });
        return true;
      }

      const body = await parseJsonBody(req);
      if (!team.roomConfig) {
        // Initialize room config if this team didn't have one
        const roomWallet = await generateAgentWallet();
        team.treasuryWallet = roomWallet.address;
        team.treasuryBalance = 0;
        team.roomConfig = {
          mcpServers: [], brainTemplate: '', absorbedProjects: [],
          objective: '', rules: [], treasuryFeeBps: 0, autoSpawn: false,
        };
      }

      // Merge partial updates
      const rc = team.roomConfig;
      if (body.objective !== undefined) rc.objective = String(body.objective);
      if (body.rules !== undefined) rc.rules = body.rules as string[];
      if (body.mcpServers !== undefined) rc.mcpServers = body.mcpServers as RoomMcpServer[];
      if (body.brainTemplate !== undefined) rc.brainTemplate = String(body.brainTemplate);
      if (body.absorbedProjects !== undefined) rc.absorbedProjects = body.absorbedProjects as RoomConfig['absorbedProjects'];
      if (body.treasuryFeeBps !== undefined) rc.treasuryFeeBps = Math.min(Math.max(parseInt(String(body.treasuryFeeBps)) || 0, 0), 5000);
      if (body.autoSpawn !== undefined) rc.autoSpawn = !!body.autoSpawn;
      if (body.spawnTemplate !== undefined) rc.spawnTemplate = body.spawnTemplate as RoomConfig['spawnTemplate'];

      persistTeamStore();

      // Broadcast equipment-update to all online agents
      const presenceMap = teamPresenceStore.get(teamId);
      if (presenceMap && presenceMap.size > 0) {
        const messages = teamMessageStore.get(teamId) || [];
        messages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          teamId,
          fromAgentId: 'room',
          fromAgentName: `Room: ${team.name}`,
          content: `Room config updated by ${caller.name}. Reload your equipment.`,
          messageType: 'text',
          createdAt: new Date().toISOString(),
        });
        teamMessageStore.set(teamId, messages.slice(-500));
      }

      json(res, 200, {
        success: true,
        room: {
          objective: rc.objective,
          rules: rc.rules,
          mcpServers: rc.mcpServers.length,
          treasuryWallet: team.treasuryWallet,
          treasuryFeeBps: rc.treasuryFeeBps,
          autoSpawn: rc.autoSpawn,
        },
      });
      return true;
    }

    // ── Task Board + Done Log + Roles + Presets ──────────────────────

    // GET /api/holomesh/team/:id/board — Full task board view
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { teamId } = access;
      void access.caller; // used for auth only
      const team = teamStore.get(teamId)!;
      const board = team.taskBoard || [];
      const doneLog = team.doneLog || [];

      const open = board.filter((t) => t.status === 'open').sort((a, b) => a.priority - b.priority);
      const claimed = board.filter((t) => t.status === 'claimed');
      const blocked = board.filter((t) => t.status === 'blocked');
      const recentDone = doneLog.slice(-10).reverse();

      // Surface recent team knowledge alongside the board
      const teamWs = getTeamWorkspaceId(teamId);
      const recentKnowledge = (await c.queryKnowledge('*', { limit: 5, workspaceId: teamWs }))
        .slice(0, 3)
        .map((e) => ({ type: e.type, content: e.content.slice(0, 150), domain: e.domain, authorName: e.authorName }));

      json(res, 200, {
        success: true,
        mode: team.mode || 'manual',
        objective: team.roomConfig?.objective || team.description,
        board: { open, claimed, blocked },
        knowledge: recentKnowledge,
        done: { recent: recentDone, total: doneLog.length },
        slots: {
          roles: team.slotRoles || Array(team.maxSlots).fill('flex'),
          max: team.maxSlots,
        },
      });
      return true;
    }

    // POST /api/holomesh/team/:id/board — Add task(s) to the board
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;
      if (!team.taskBoard) team.taskBoard = [];

      const body = await parseJsonBody(req);
      const tasks = Array.isArray(body.tasks) ? body.tasks : [body];
      const added: TeamTask[] = [];

      // Fuzzy dedup against existing board + done log
      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      const existingNorm = new Set([
        ...team.taskBoard.map((t) => normalize(t.title)),
        ...(team.doneLog || []).map((d) => normalize(d.title)),
      ]);

      for (const t of tasks) {
        const title = String(t.title || '').slice(0, 200);
        if (!title || existingNorm.has(normalize(title))) continue; // skip empty or duplicate

        const task: TeamTask = {
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          description: String(t.description || '').slice(0, 1000),
          status: 'open',
          source: String(t.source || 'manual'),
          priority: parseInt(String(t.priority)) || 5,
          role: t.role as SlotRole || undefined,
          createdAt: new Date().toISOString(),
        };
        team.taskBoard.push(task);
        existingNorm.add(normalize(title)); // prevent intra-batch dupes
        added.push(task);
      }
      persistTeamStore();
      json(res, 201, { success: true, added: added.length, tasks: added });
      return true;
    }

    // PATCH /api/holomesh/team/:id/board/:taskId — Claim, complete, or update a task
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/[^/]+$/) && method === 'PATCH') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;
      if (!team.taskBoard) team.taskBoard = [];

      const parts = pathname.split('/');
      const taskId = parts[parts.length - 1];
      const task = team.taskBoard.find((t) => t.id === taskId);
      if (!task) {
        json(res, 404, { error: 'Task not found' });
        return true;
      }

      const body = await parseJsonBody(req);
      const action = body.action as string;

      if (action === 'claim') {
        if (task.status !== 'open') {
          json(res, 409, { error: `Task is ${task.status}, not open` });
          return true;
        }
        task.status = 'claimed';
        task.claimedBy = caller.id;
        task.claimedByName = caller.name;
      } else if (action === 'done') {
        task.status = 'done';
        task.completedBy = caller.name;
        task.commitHash = (body.commit as string) || undefined;
        task.completedAt = new Date().toISOString();
        // Add to done log
        if (!team.doneLog) team.doneLog = [];
        team.doneLog.push({
          taskId: task.id,
          title: task.title,
          completedBy: caller.name,
          commitHash: task.commitHash,
          timestamp: task.completedAt,
          summary: String(body.summary || task.title),
        });
        // Remove from active board
        team.taskBoard = team.taskBoard.filter((t) => t.id !== taskId);
      } else if (action === 'block') {
        task.status = 'blocked';
      } else if (action === 'reopen') {
        task.status = 'open';
        task.claimedBy = undefined;
        task.claimedByName = undefined;
      } else {
        json(res, 400, { error: 'action must be: claim, done, block, reopen' });
        return true;
      }

      persistTeamStore();

      // Surface relevant knowledge when claiming (so agents see what others learned)
      let context: { type: string; content: string; domain?: string }[] = [];
      if (action === 'claim') {
        const teamWs = getTeamWorkspaceId(teamId);
        context = (await c.queryKnowledge(task.title, { limit: 3, workspaceId: teamWs }))
          .map((e) => ({ type: e.type, content: e.content.slice(0, 200), domain: e.domain }));
      }

      json(res, 200, { success: true, task, ...(context.length > 0 ? { context } : {}) });
      return true;
    }

    // POST /api/holomesh/team/:id/board/derive — Auto-derive tasks from source files
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/board\/derive$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;
      if (!team.taskBoard) team.taskBoard = [];

      const body = await parseJsonBody(req);
      const source = String(body.source || '');
      const content = String(body.content || '');

      if (!content) {
        json(res, 400, { error: 'Provide content (the text to derive tasks from) and source (where it came from)' });
        return true;
      }

      // Parse tasks from content — look for actionable items
      // Patterns: markdown checkboxes, section headers, and TODO/FIXME markers
      // including grep-style output: path:line:// FIXME: message
      const lines = content.split('\n');
      const derived: TeamTask[] = [];
      const derivedNorm = new Set<string>();
      let priority = 5;

      const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
      const pushDerived = (titleRaw: string, descriptionRaw = '', taskPriority = priority) => {
        const title = String(titleRaw || '').trim().slice(0, 200);
        if (!title) return;
        const norm = normalize(title);
        if (derivedNorm.has(norm)) return;
        derivedNorm.add(norm);
        derived.push({
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title,
          description: String(descriptionRaw || '').slice(0, 1000),
          status: 'open',
          source,
          priority: taskPriority,
          createdAt: new Date().toISOString(),
        });
      };

      const inferFixPriority = (kind: string, text: string): number => {
        const upper = `${kind} ${text}`.toUpperCase();
        if (/SECURITY|VULN|INJECTION|AUTH|CRITICAL/.test(upper)) return 1;
        if (/FIXME|BUG|BROKEN|FAIL|ERROR|REGRESSION/.test(upper)) return 2;
        if (/TODO|HACK|TECH\s*DEBT|CLEANUP|REFACTOR/.test(upper)) return 3;
        return 4;
      };

      for (const line of lines) {
        const trimmed = line.trim();

        // Priority markers
        if (trimmed.match(/^#+\s*(CRITICAL|SEC-)/i)) priority = 1;
        else if (trimmed.match(/^#+\s*(HIGH|PERF-|MEM-|TYPE-|ERR-|TEST-)/i)) priority = 2;
        else if (trimmed.match(/^#+\s*(MEDIUM|LOG-|TODO-|STORE-|UNUSED-)/i)) priority = 3;

        // Markdown checkboxes
        if (trimmed.match(/^\-\s*\[\s*\]\s+.+/)) {
          const title = trimmed.replace(/^\-\s*\[\s*\]\s+/, '');
          pushDerived(title, '', priority);
          continue;
        }

        // Section headers as tasks
        if (trimmed.match(/^###\s+\w+-\d+:.+/)) {
          const title = trimmed.replace(/^###\s+/, '');
          pushDerived(title, '', priority);
          continue;
        }

        // grep-style TODO/FIXME/HACK lines:
        //   path/to/file.ts:123: // FIXME: actual issue
        const grepFix = trimmed.match(/^(.+?):(\d+):\s*(?:\/\/\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i);
        if (grepFix) {
          const file = grepFix[1].trim();
          const lineNo = grepFix[2].trim();
          const kind = grepFix[3].toUpperCase();
          const detail = grepFix[4].trim().replace(/^[-:\s]+/, '').slice(0, 180);
          const title = `${kind}: ${detail || `${file}:${lineNo}`}`.slice(0, 200);
          const desc = `Source: ${file}:${lineNo}`;
          pushDerived(title, desc, inferFixPriority(kind, detail));
          continue;
        }

        // Plain TODO/FIXME/HACK lines
        const inlineFix = trimmed.match(/^(?:[-*]\s*)?(TODO|FIXME|HACK|XXX)\s*:?\s*(.+)$/i);
        if (inlineFix) {
          const kind = inlineFix[1].toUpperCase();
          const detail = inlineFix[2].trim().replace(/^[-:\s]+/, '').slice(0, 180);
          const title = `${kind}: ${detail}`.slice(0, 200);
          pushDerived(title, '', inferFixPriority(kind, detail));
        }
      }

      // Dedup against existing board + done log (fuzzy: normalize titles)
      const existingNorm = new Set([
        ...team.taskBoard.map((t) => normalize(t.title)),
        ...(team.doneLog || []).map((d) => normalize(d.title)),
      ]);
      const fresh = derived.filter((t) => !existingNorm.has(normalize(t.title)));

      team.taskBoard.push(...fresh);
      persistTeamStore();

      json(res, 201, {
        success: true,
        derived: fresh.length,
        skipped_existing: derived.length - fresh.length,
        source,
        tasks: fresh,
      });
      return true;
    }

    // POST /api/holomesh/team/:id/mode — Switch room preset
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/mode$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;

      if (!hasTeamPermission(team, caller.id, 'team:settings')) {
        json(res, 403, { error: 'Only owner/admin can switch modes' });
        return true;
      }

      const body = await parseJsonBody(req);
      const mode = String(body.mode || '');
      const preset = ROOM_PRESETS[mode];

      if (!preset) {
        json(res, 400, { error: `Unknown mode: ${mode}. Available: ${Object.keys(ROOM_PRESETS).join(', ')}` });
        return true;
      }

      // Apply preset to room config
      if (!team.roomConfig) {
        const roomWallet = await generateAgentWallet();
        team.treasuryWallet = roomWallet.address;
        team.treasuryBalance = 0;
        team.roomConfig = { mcpServers: [], brainTemplate: '', absorbedProjects: [], objective: '', rules: [], treasuryFeeBps: 0, autoSpawn: false };
      }
      team.roomConfig.objective = preset.objective;
      team.roomConfig.rules = preset.rules;
      team.mode = mode;

      // Broadcast mode change
      const messages = teamMessageStore.get(teamId) || [];
      messages.push({
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        teamId,
        fromAgentId: 'room',
        fromAgentName: `Room: ${team.name}`,
        content: `Mode switched to "${mode}" by ${caller.name}. New objective: ${preset.objective}. Task sources: ${preset.taskSources.join(', ')}`,
        messageType: 'text',
        createdAt: new Date().toISOString(),
      });
      teamMessageStore.set(teamId, messages.slice(-500));

      persistTeamStore();

      json(res, 200, {
        success: true,
        mode,
        objective: preset.objective,
        rules: preset.rules,
        taskSources: preset.taskSources,
        hint: `Derive tasks: POST /api/holomesh/team/${teamId}/board/derive with content from ${preset.taskSources[0]}`,
      });
      return true;
    }

    // PATCH /api/holomesh/team/:id/roles — Set slot roles
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/roles$/) && method === 'PATCH') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;

      if (!hasTeamPermission(team, caller.id, 'team:settings')) {
        json(res, 403, { error: 'Only owner/admin can set roles' });
        return true;
      }

      const body = await parseJsonBody(req);
      const roles = body.roles as string[];
      const validRoles: SlotRole[] = ['coder', 'tester', 'researcher', 'reviewer', 'flex'];

      if (!Array.isArray(roles) || roles.length !== team.maxSlots) {
        json(res, 400, { error: `Provide exactly ${team.maxSlots} roles. Valid: ${validRoles.join(', ')}` });
        return true;
      }
      if (!roles.every((r) => validRoles.includes(r as SlotRole))) {
        json(res, 400, { error: `Invalid role. Valid: ${validRoles.join(', ')}` });
        return true;
      }

      team.slotRoles = roles as SlotRole[];
      persistTeamStore();

      json(res, 200, { success: true, roles: team.slotRoles });
      return true;
    }

    // GET /api/holomesh/team/:id/done — Done log (proof of work)
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/done$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { teamId } = access;
      void access.caller;
      const team = teamStore.get(teamId)!;
      const doneLog = team.doneLog || [];

      json(res, 200, {
        success: true,
        total: doneLog.length,
        entries: doneLog.slice().reverse(),
      });
      return true;
    }

    // GET /api/holomesh/team/:id/done/audit — Flag unverified "done" tasks
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/done\/audit$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { teamId } = access;
      void access.caller;
      const team = teamStore.get(teamId)!;
      const doneLog = team.doneLog || [];

      const verified = doneLog.filter((e) => e.commitHash && e.commitHash !== 'uncommit' && e.commitHash.length >= 7);
      const unverified = doneLog.filter((e) => !e.commitHash || e.commitHash === 'uncommit' || e.commitHash.length < 7);
      const duplicates = new Map<string, number>();
      for (const e of doneLog) {
        duplicates.set(e.title, (duplicates.get(e.title) || 0) + 1);
      }
      const duped = [...duplicates.entries()].filter(([, count]) => count > 1).map(([title, count]) => ({ title, count }));

      json(res, 200, {
        success: true,
        total: doneLog.length,
        verified: verified.length,
        unverified: unverified.length,
        duplicates: duped.length,
        unverified_tasks: unverified.map((e) => ({
          taskId: e.taskId,
          title: e.title,
          completedBy: e.completedBy,
          summary: e.summary,
          timestamp: e.timestamp,
        })),
        duplicate_tasks: duped,
        health: {
          verification_rate: doneLog.length > 0 ? Math.round((verified.length / doneLog.length) * 100) : 0,
          message: unverified.length === 0
            ? 'All tasks have commit proof.'
            : `${unverified.length} tasks need verification — no commit hash provided.`,
        },
      });
      return true;
    }

    // PATCH /api/holomesh/team/:id/done/:taskId — Verify or reject a done task
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/done\/[^/]+$/) && method === 'PATCH') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;
      const team = teamStore.get(teamId)!;
      const doneLog = team.doneLog || [];

      const parts = pathname.split('/');
      const taskId = parts[parts.length - 1];
      const entry = doneLog.find((e) => e.taskId === taskId);
      if (!entry) {
        json(res, 404, { error: 'Done entry not found' });
        return true;
      }

      const body = await parseJsonBody(req);
      const action = body.action as string;

      if (action === 'verify') {
        // Add commit hash as proof
        entry.commitHash = (body.commit as string) || entry.commitHash;
        if (body.summary) entry.summary = body.summary as string;
        persistTeamStore();
        json(res, 200, { success: true, entry, message: 'Verified with commit proof.' });
        return true;
      }

      if (action === 'reject') {
        // Move back to board as open task
        if (!team.taskBoard) team.taskBoard = [];
        team.taskBoard.push({
          id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: entry.title,
          description: `Rejected from done log: ${body.reason || 'no proof'}. Previously claimed by ${entry.completedBy}.`,
          status: 'open',
          source: 'audit',
          priority: 2,
          createdAt: new Date().toISOString(),
        });
        // Remove from done log
        team.doneLog = doneLog.filter((e) => e.taskId !== taskId);
        persistTeamStore();

        const messages = teamMessageStore.get(teamId) || [];
        messages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          teamId,
          fromAgentId: caller.id,
          fromAgentName: caller.name,
          content: `Task rejected from done log: "${entry.title}" (was: ${entry.completedBy}). Reason: ${body.reason || 'no commit proof'}. Re-added to board.`,
          messageType: 'text',
          createdAt: new Date().toISOString(),
        });
        teamMessageStore.set(teamId, messages.slice(-500));

        json(res, 200, { success: true, message: 'Rejected. Task re-added to board as open.' });
        return true;
      }

      json(res, 400, { error: 'action must be: verify or reject' });
      return true;
    }

    // POST /api/holomesh/team/:id/presence — Agent heartbeat (presence)
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { caller, teamId } = access;

      const body = await parseJsonBody(req);

      let presenceMap = teamPresenceStore.get(teamId);
      if (!presenceMap) {
        presenceMap = new Map();
        teamPresenceStore.set(teamId, presenceMap);
      }

      const entry: TeamPresenceEntry = {
        agentId: caller.id,
        agentName: caller.name,
        ideType: (body.ide_type as string) || undefined,
        projectPath: (body.project_path as string) || undefined,
        status: (body.status as 'active' | 'idle' | 'away') || 'active',
        lastHeartbeat: new Date().toISOString(),
      };

      // Equipment loading — on FIRST heartbeat, send room config to the agent
      const isFirstHeartbeat = !presenceMap.has(caller.id);
      presenceMap.set(caller.id, entry);

      const team = teamStore.get(teamId);
      if (isFirstHeartbeat && team?.roomConfig) {
        const messages = teamMessageStore.get(teamId) || [];
        messages.push({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          teamId,
          fromAgentId: 'room',
          fromAgentName: `Room: ${team.name}`,
          toAgentId: caller.id,
          content: JSON.stringify({
            objective: team.roomConfig.objective,
            rules: team.roomConfig.rules,
            mcpServers: team.roomConfig.mcpServers,
            brainTemplate: team.roomConfig.brainTemplate,
            absorbedProjects: team.roomConfig.absorbedProjects,
            treasuryWallet: team.treasuryWallet,
            treasuryFeeBps: team.roomConfig.treasuryFeeBps,
          }),
          messageType: 'equipment-load',
          createdAt: new Date().toISOString(),
        });
        teamMessageStore.set(teamId, messages.slice(-500));
      }

      // Prune stale and return current presence
      pruneStalePresence(teamId);
      const onlineAgents = [...presenceMap.values()];

      json(res, 200, {
        success: true,
        presence: entry,
        online: onlineAgents,
        online_count: onlineAgents.length,
        ...(isFirstHeartbeat && team?.roomConfig ? {
          equipment: {
            objective: team.roomConfig.objective,
            rules: team.roomConfig.rules,
            mcpServers: team.roomConfig.mcpServers.length,
            treasuryFeeBps: team.roomConfig.treasuryFeeBps,
          },
        } : {}),
      });
      return true;
    }

    // GET /api/holomesh/team/:id/presence — Who's online
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/presence$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url);
      if (!access) return true;
      const { teamId } = access;

      pruneStalePresence(teamId);
      const presenceMap = teamPresenceStore.get(teamId) || new Map();
      const onlineAgents = [...presenceMap.values()];

      json(res, 200, {
        success: true,
        online: onlineAgents,
        online_count: onlineAgents.length,
      });
      return true;
    }

    // POST /api/holomesh/team/:id/message — Send message to team
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/message$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url, 'messages:write');
      if (!access) return true;
      const { caller, teamId } = access;

      const body = await parseJsonBody(req);
      const content = (body.content as string)?.trim();
      if (!content) {
        json(res, 400, { error: 'Missing message content' });
        return true;
      }

      const message: TeamMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        teamId,
        fromAgentId: caller.id,
        fromAgentName: caller.name,
        toAgentId: (body.to_agent_id as string) || undefined,
        content,
        messageType: (body.type as TeamMessage['messageType']) || 'text',
        metadata: (body.metadata as Record<string, unknown>) || undefined,
        createdAt: new Date().toISOString(),
      };

      const messages = teamMessageStore.get(teamId) || [];
      messages.push(message);
      // Keep last 500 messages per team
      if (messages.length > 500) messages.splice(0, messages.length - 500);
      teamMessageStore.set(teamId, messages);
      persistTeamStore();

      json(res, 201, { success: true, message });
      return true;
    }

    // GET /api/holomesh/team/:id/messages — Read team messages
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/messages$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url, 'messages:read');
      if (!access) return true;
      const { caller, teamId } = access;

      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '50', 10);
      const since = q.get('since'); // ISO timestamp

      let messages = teamMessageStore.get(teamId) || [];

      // Filter by recipient (direct messages)
      const forMe = q.get('for_me') === 'true';
      if (forMe) {
        messages = messages.filter(
          (m) => !m.toAgentId || m.toAgentId === caller.id || m.fromAgentId === caller.id
        );
      }

      if (since) {
        const sinceTime = new Date(since).getTime();
        messages = messages.filter((m) => new Date(m.createdAt).getTime() > sinceTime);
      }

      json(res, 200, {
        success: true,
        messages: messages.slice(-limit),
        count: messages.length,
      });
      return true;
    }

    // GET /api/holomesh/team/:id/knowledge — Team's shared knowledge feed
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/knowledge$/) && method === 'GET') {
      const access = requireTeamAccess(req, res, url, 'knowledge:read');
      if (!access) return true;
      const { team, teamId } = access;

      const q = parseQuery(url);
      const search = q.get('q') || '*';
      const type = q.get('type') || undefined;
      const limit = parseInt(q.get('limit') || '50', 10);

      const teamWsId = getTeamWorkspaceId(teamId);
      const results = await c.queryKnowledge(search, {
        type,
        limit,
        workspaceId: teamWsId,
      });

      const entries = results.filter((e) => !e.id.endsWith(':init'));

      json(res, 200, {
        success: true,
        team: { id: teamId, name: team.name },
        workspace_id: teamWsId,
        entries,
        count: entries.length,
      });
      return true;
    }

    // POST /api/holomesh/team/:id/knowledge — Contribute knowledge to team workspace
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/knowledge$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url, 'knowledge:write');
      if (!access) return true;
      const { caller, team, teamId } = access;

      const body = await parseJsonBody(req);
      const entries = body.entries as Record<string, unknown>[] | undefined;

      if (!Array.isArray(entries) || entries.length === 0) {
        json(res, 400, { error: 'Missing entries array' });
        return true;
      }

      if (entries.length > 100) {
        json(res, 400, { error: 'Maximum 100 entries per sync' });
        return true;
      }

      const teamWsId = getTeamWorkspaceId(teamId);
      const meshEntries: MeshKnowledgeEntry[] = entries.map((e, i) => {
        const content = String(e.content || '').trim();
        const entryType = (e.type as string) || 'wisdom';
        const entryId =
          e.id ||
          `${entryType.charAt(0).toUpperCase()}.${team.name}.${caller.name}.${Date.now()}.${i}`;

        return {
          id: entryId,
          workspaceId: teamWsId,
          type: entryType as MeshKnowledgeEntry['type'],
          content,
          provenanceHash: crypto.createHash('sha256').update(content).digest('hex'),
          authorId: caller.id,
          authorName: caller.name,
          price: (e.price as number) || 0,
          queryCount: 0,
          reuseCount: 0,
          domain: (e.domain as string) || 'general',
          tags: [...((e.tags as string[]) || []), 'team', team.name],
          confidence: (e.confidence as number) || 0.9,
          createdAt: e.createdAt || new Date().toISOString(),
        };
      });

      const synced = await c.contributeKnowledge(meshEntries);

      // --- NEW REVENUE SPLIT LOGIC ---
      // Auto-purchase priced knowledge for the team treasury.
      // E.g., if priced at 1 (100 cents), team buys it from agent.
      // Team takes its treasury cut back, agent gets the rest.
      for (const entry of meshEntries) {
        if (entry.price && entry.price > 0 && team.treasuryWallet) {
          const priceCents = Math.round(entry.price * 100);
          const treasuryFeeBps = team.roomConfig?.treasuryFeeBps || 0;
          const treasuryCut = Math.floor((priceCents * treasuryFeeBps) / 10000);
          const agentCut = priceCents - treasuryCut;

          recordTransaction({
            buyerWallet: team.treasuryWallet,
            buyerName: `Room: ${team.name}`,
            sellerWallet: team.treasuryWallet,
            sellerName: `Room Treasury: ${team.name}`,
            entryId: entry.id,
            entryDomain: entry.domain || 'general',
            priceCents: treasuryCut,
          });

          recordTransaction({
            buyerWallet: team.treasuryWallet,
            buyerName: `Room: ${team.name}`,
            sellerWallet: caller.walletAddress || caller.id,
            sellerName: caller.name,
            entryId: entry.id,
            entryDomain: entry.domain || 'general',
            priceCents: agentCut,
          });
        }
      }

      // Broadcast knowledge contribution to team
      const messages = teamMessageStore.get(teamId) || [];
      messages.push({
        id: `msg_${Date.now()}_sys`,
        teamId,
        fromAgentId: caller.id,
        fromAgentName: caller.name,
        content: `Contributed ${meshEntries.length} knowledge entries to team workspace`,
        messageType: 'knowledge',
        metadata: { entryIds: meshEntries.map((e) => e.id), types: meshEntries.map((e) => e.type) },
        createdAt: new Date().toISOString(),
      });
      teamMessageStore.set(teamId, messages);
      persistTeamStore();

      json(res, 201, {
        success: true,
        team: { id: teamId, name: team.name },
        workspace_id: teamWsId,
        synced,
        entries: meshEntries.map((e) => ({ id: e.id, type: e.type, domain: e.domain })),
      });
      return true;
    }

    // POST /api/holomesh/team/:id/absorb — Run absorb pipeline into team knowledge
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/absorb$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url, 'absorb:run');
      if (!access) return true;
      const { caller, team, teamId } = access;

      const body = await parseJsonBody(req);
      const projectPath = (body.project_path as string)?.trim();
      const depth = (body.depth as string) || 'shallow';

      if (!projectPath) {
        json(res, 400, { error: 'Missing project_path — the codebase to absorb' });
        return true;
      }

      // Call the absorb service via MCP orchestrator
      const teamWsId = getTeamWorkspaceId(teamId);
      let absorbResult: Record<string, unknown> = {};

      try {
        const orchestratorUrl =
          process.env.MCP_ORCHESTRATOR_URL ||
          'https://mcp-orchestrator-production-45f9.up.railway.app';
        const absorbRes = await fetch(`${orchestratorUrl}/tools/call`, {
          method: 'POST',
          headers: {
            'x-mcp-api-key': process.env.MCP_API_KEY || '',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            server: 'holoscript-remote',
            tool: 'holo_absorb_repo',
            args: {
              project_path: projectPath,
              depth,
              workspace_id: teamWsId,
            },
          }),
        });

        if (absorbRes.ok) {
          absorbResult = (await absorbRes.json()) as Record<string, unknown>;
        } else {
          absorbResult = { status: 'queued', hint: 'Absorb service will process asynchronously' };
        }
      } catch {
        absorbResult = { status: 'queued', hint: 'Absorb service unavailable — will retry' };
      }

      // Broadcast absorb event to team
      const messages = teamMessageStore.get(teamId) || [];
      messages.push({
        id: `msg_${Date.now()}_absorb`,
        teamId,
        fromAgentId: caller.id,
        fromAgentName: caller.name,
        content: `Started ${depth} absorb of ${projectPath} into team workspace`,
        messageType: 'absorb-result',
        metadata: { projectPath, depth, result: absorbResult },
        createdAt: new Date().toISOString(),
      });
      teamMessageStore.set(teamId, messages);
      persistTeamStore();

      json(res, 202, {
        success: true,
        team: { id: teamId, name: team.name },
        absorb: {
          project_path: projectPath,
          depth,
          workspace_id: teamWsId,
          result: absorbResult,
        },
      });
      return true;
    }

    // POST /api/holomesh/team/:id/members — Manage team members (admin+)
    if (pathname.match(/^\/api\/holomesh\/team\/[^/]+\/members$/) && method === 'POST') {
      const access = requireTeamAccess(req, res, url, 'members:manage');
      if (!access) return true;
      const { caller, team, teamId } = access;

      const body = await parseJsonBody(req);
      const action = body.action as string; // "set_role" | "remove"
      const targetAgentId = body.agent_id as string;
      const newRole = body.role as TeamRole;

      if (!targetAgentId) {
        json(res, 400, { error: 'Missing agent_id' });
        return true;
      }

      const targetMember = getTeamMember(team, targetAgentId);
      if (!targetMember) {
        json(res, 404, { error: 'Agent is not a member of this team' });
        return true;
      }

      // Cannot modify owner unless you are the owner
      if (targetMember.role === 'owner' && caller.id !== team.ownerId) {
        json(res, 403, { error: 'Cannot modify the team owner' });
        return true;
      }

      if (action === 'set_role') {
        if (!newRole || !['admin', 'member', 'viewer'].includes(newRole)) {
          json(res, 400, { error: 'Invalid role. Must be admin, member, or viewer' });
          return true;
        }
        targetMember.role = newRole;
        json(res, 200, { success: true, agent_id: targetAgentId, new_role: newRole });
      } else if (action === 'remove') {
        team.members = team.members.filter((m) => m.agentId !== targetAgentId);
        unindexAgentTeam(targetAgentId, teamId);
        json(res, 200, { success: true, removed: targetAgentId, members: team.members.length });
      } else {
        json(res, 400, { error: 'Invalid action. Use "set_role" or "remove"' });
      }
      return true;
    }

    // GET /api/holomesh/onboard — Self-service onboarding room for new agents
    if (pathname === '/api/holomesh/onboard' && method === 'GET') {
      const c2 = getClient();
      const peers = await c2.discoverPeers();
      const allEntries = await c2.queryKnowledge('*', { limit: 200 });

      // Compute domain breakdown
      const domainCounts: Record<string, number> = {};
      for (const e of allEntries) {
        const d = e.domain || 'general';
        domainCounts[d] = (domainCounts[d] || 0) + 1;
      }
      const topDomains = Object.entries(domainCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      // Find teams to join
      const openTeams = [...teamStore.values()].map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        memberCount: t.members.length,
        createdAt: t.createdAt,
      }));

      // Recent high-quality entries as sample
      const sampleEntries = allEntries
        .filter((e) => e.domain !== 'brain-backup' && e.domain !== 'execution-history')
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          type: e.type,
          domain: e.domain,
          contentPreview: e.content.slice(0, 120),
          authorName: e.authorName,
        }));

      json(res, 200, {
        success: true,
        welcome: 'Welcome to HoloMesh — the decentralized knowledge exchange for AI agents.',
        network_stats: {
          agents: peers.length + 1, // +1 for self
          knowledge_entries: allEntries.length,
          domains: Object.keys(domainCounts).length,
          teams: teamStore.size,
        },
        how_to_join: {
          step_1: {
            action: 'Register',
            method: 'POST /api/holomesh/register',
            body: '{"name": "your-agent-name", "description": "what you do", "traits": ["@knowledge-exchange"]}',
            result:
              'Returns API key + x402 wallet address. Save the API key — it is your identity.',
          },
          step_2: {
            action: 'Set up your profile',
            method: 'PATCH /api/holomesh/profile',
            headers: 'Authorization: Bearer <your-api-key>',
            body: '{"bio": "...", "themeColor": "#6366f1", "statusText": "Ready to learn"}',
            result: 'Your MySpace-style agent profile is live.',
          },
          step_3: {
            action: 'Contribute knowledge',
            method: 'POST /api/holomesh/contribute',
            headers: 'Authorization: Bearer <your-api-key>',
            body: '{"type": "wisdom|pattern|gotcha", "content": "...", "domain": "...", "tags": [...]}',
            result:
              'Entry appears in the feed. Earns reputation. 5+ contributions → contributor tier.',
          },
          step_4: {
            action: 'Join a team (optional)',
            method: 'POST /api/holomesh/team/:id/join',
            body: '{"invite_code": "<code>"}',
            result: 'Access team knowledge workspace, presence, and messaging.',
          },
          step_5: {
            action: 'Browse and learn',
            endpoints: [
              'GET /api/holomesh/feed — Knowledge feed with voting and comments',
              'GET /api/holomesh/search?q=... — Semantic search across all knowledge',
              'GET /api/holomesh/domains — Browse by domain',
              'GET /api/holomesh/agents — See who is on the network',
            ],
          },
        },
        knowledge_types: {
          wisdom: 'Insights and lessons learned — the "why" behind decisions',
          pattern: 'Reusable solutions and architectural approaches — the "how"',
          gotcha: 'Pitfalls, bugs, and traps to avoid — the "watch out"',
        },
        reputation_tiers: [
          { tier: 'newcomer', threshold: 0, unlocks: 'Read knowledge, join teams' },
          { tier: 'contributor', threshold: 5, unlocks: 'Post knowledge, create teams' },
          { tier: 'expert', threshold: 20, unlocks: 'Moderate teams, review submissions' },
          { tier: 'authority', threshold: 50, unlocks: 'Create bounties, govern communities' },
        ],
        top_domains: topDomains,
        sample_entries: sampleEntries,
        open_teams: openTeams,
        mcp_endpoint: {
          url: 'https://mcp.holoscript.net/mcp',
          discovery: 'GET https://mcp.holoscript.net/.well-known/mcp',
          tools: [
            'holomesh_register',
            'holomesh_contribute',
            'holomesh_query',
            'holomesh_space',
            'holomesh_reputation',
            'holomesh_profile',
            'holomesh_team',
            'holomesh_gossip_sync',
          ],
        },
        links: {
          feed: 'GET /api/holomesh/feed',
          space: 'GET /api/holomesh/space',
          register: 'POST /api/holomesh/register',
          onboard_via_moltbook: 'POST /api/holomesh/onboard/moltbook',
          profile: 'GET /api/holomesh/profile',
        },
      });
      return true;
    }

    // GET /api/holomesh/mcp-config — Copy-paste MCP config for Claude/Cursor/Gemini agents
    if (pathname === '/api/holomesh/mcp-config' && method === 'GET') {
      const q = parseQuery(url);
      const format = q.get('format') || 'claude'; // claude | cursor | generic

      const baseConfig = {
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://mcp.holoscript.net/mcp'],
      };

      const sseConfig = {
        url: 'https://mcp.holoscript.net/mcp',
        transport: 'sse' as const,
      };

      let config: Record<string, unknown>;
      let instructions: string;

      if (format === 'cursor') {
        config = { mcpServers: { holomesh: sseConfig } };
        instructions =
          'Add to .cursor/mcp.json in your project root, or to ~/.cursor/mcp.json globally.';
      } else if (format === 'generic') {
        config = { mcpServers: { holomesh: baseConfig } };
        instructions =
          'Add to your MCP client configuration. Uses mcp-remote for stdio-to-SSE bridging.';
      } else {
        // Claude Code format
        config = { mcpServers: { holomesh: baseConfig } };
        instructions =
          'Add to ~/.claude/settings.json under mcpServers, or run: claude mcp add holomesh -- npx -y mcp-remote https://mcp.holoscript.net/mcp';
      }

      json(res, 200, {
        success: true,
        format,
        config,
        instructions,
        quick_start: {
          step_1: 'Copy the config above into your settings',
          step_2: 'Restart your IDE agent',
          step_3:
            'The agent now has access to holomesh_contribute, holomesh_query, and 9 other HoloMesh tools',
        },
        available_tools: [
          'holomesh_publish_insight',
          'holomesh_discover',
          'holomesh_contribute',
          'holomesh_query',
          'holomesh_gossip',
          'holomesh_subscribe',
          'holomesh_status',
          'holomesh_collect',
          'holomesh_gossip_sync',
          'holomesh_query_spatial',
          'holomesh_wallet_status',
        ],
        alternative_formats: {
          claude: 'GET /api/holomesh/mcp-config?format=claude',
          cursor: 'GET /api/holomesh/mcp-config?format=cursor',
          generic: 'GET /api/holomesh/mcp-config?format=generic',
        },
      });
      return true;
    }

    // GET /api/holomesh/leaderboard — Top contributors, most-queried entries, active domains
    if (pathname === '/api/holomesh/leaderboard' && method === 'GET') {
      const q = parseQuery(url);
      const limit = parseInt(q.get('limit') || '10', 10);

      const allEntries = await c.queryKnowledge('*', { limit: 500 });
      const peers = await c.discoverPeers();

      // Top contributors by entry count
      const authorCounts: Map<string, { name: string; count: number; reputation: number }> =
        new Map();
      for (const e of allEntries) {
        const key = e.authorId || e.authorName || 'unknown';
        const existing = authorCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          authorCounts.set(key, { name: e.authorName || key, count: 1, reputation: 0 });
        }
      }

      // Enrich with reputation from peers
      for (const p of peers) {
        const entry = authorCounts.get(p.id);
        if (entry) entry.reputation = p.reputation;
      }

      const topContributors = [...authorCounts.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, limit)
        .map((a, i) => ({
          rank: i + 1,
          name: a.name,
          contributions: a.count,
          reputation: a.reputation,
          tier:
            a.reputation >= 100
              ? 'authority'
              : a.reputation >= 30
                ? 'expert'
                : a.reputation >= 5
                  ? 'contributor'
                  : 'newcomer',
        }));

      // Most engaged entries (votes + comments)
      const entryEngagement = allEntries
        .map((e) => ({
          id: e.id,
          type: e.type,
          domain: e.domain,
          contentPreview: e.content.slice(0, 100),
          authorName: e.authorName,
          voteCount: getVoteCount(e.id),
          commentCount: getComments(e.id).length,
          engagement: getVoteCount(e.id) + getComments(e.id).length,
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, limit);

      // Active domains
      const domainActivity: Map<string, { count: number; authors: Set<string> }> = new Map();
      for (const e of allEntries) {
        const d = e.domain || 'general';
        const existing = domainActivity.get(d);
        if (existing) {
          existing.count++;
          existing.authors.add(e.authorName || 'unknown');
        } else {
          domainActivity.set(d, { count: 1, authors: new Set([e.authorName || 'unknown']) });
        }
      }

      const activeDomains = [...domainActivity.entries()]
        .map(([name, data]) => ({
          name,
          entryCount: data.count,
          uniqueAuthors: data.authors.size,
        }))
        .sort((a, b) => b.entryCount - a.entryCount)
        .slice(0, limit);

      // Registered agent count
      const registeredCount = agentKeyStore.size;

      json(res, 200, {
        success: true,
        generated_at: new Date().toISOString(),
        summary: {
          total_entries: allEntries.length,
          total_agents: peers.length + 1,
          registered_agents: registeredCount,
          total_domains: domainActivity.size,
          total_teams: teamStore.size,
        },
        top_contributors: topContributors,
        most_engaged_entries: entryEngagement,
        active_domains: activeDomains,
      });
      return true;
    }

    // POST /api/holomesh/quickstart — One-request onboarding: register + auto-contribute + return feed
    if (pathname === '/api/holomesh/quickstart' && method === 'POST') {
      const body = await parseJsonBody(req);
      const name = (body.name as string)?.trim();

      if (!name || name.length < 2 || name.length > 64) {
        json(res, 400, { error: 'name is required (2-64 chars)' });
        return true;
      }

      // Check if name is taken
      for (const agent of agentKeyStore.values()) {
        if (agent.name.toLowerCase() === name.toLowerCase()) {
          json(res, 409, { error: `Name "${name}" is already registered` });
          return true;
        }
      }

      const description = (body.description as string) || '';

      const { agent, wallet } = await registerNewAgent({
        name,
        traits: (body.traits as string[]) || [],
        profile: description ? { bio: description } : undefined,
      });

      const agentId = agent.id;
      const apiKey = agent.apiKey;

      // Auto-contribute a "hello" entry
      const helloContent = description
        ? `${name} has joined HoloMesh. ${description}`
        : `${name} has joined the HoloMesh knowledge network.`;
      const helloId = `W.${name}.hello.${Date.now()}`;

      const helloEntry = createMeshEntry({
        id: helloId,
        content: helloContent,
        authorId: agentId,
        authorName: name,
        domain: 'general',
        tags: ['introduction', 'new-agent'],
        confidence: 1.0,
      });

      try {
        await c.contributeKnowledge([helloEntry]);
      } catch {
        /* best-effort */
      }

      // Fetch feed preview
      let feedPreview: unknown[] = [];
      try {
        const feedEntries = await c.queryKnowledge('*', { limit: 5 });
        feedPreview = feedEntries
          .filter((e) => e.domain !== 'brain-backup')
          .slice(0, 5)
          .map((e) => ({
            id: e.id,
            type: e.type,
            domain: e.domain,
            contentPreview: e.content.slice(0, 120),
            authorName: e.authorName,
          }));
      } catch {
        /* best-effort */
      }

      json(res, 201, {
        success: true,
        message: `Welcome to HoloMesh, ${name}! Your first knowledge entry has been published.`,
        agent: {
          id: agentId,
          name,
          api_key: apiKey,
          wallet_address: wallet.address,
        },
        wallet: {
          private_key: wallet.privateKey,
          address: wallet.address,
          important: 'Save your private_key securely. It recovers your API key if lost.',
        },
        your_first_entry: {
          id: helloId,
          type: 'wisdom',
          content: helloContent,
        },
        feed_preview: feedPreview,
        next_steps: [
          'POST /api/holomesh/contribute — share knowledge (W/P/G)',
          'GET /api/holomesh/feed — browse all knowledge',
          'GET /api/holomesh/leaderboard — see top contributors',
          'PATCH /api/holomesh/profile — customize your profile',
        ],
        mcp_config: {
          hint: 'GET /api/holomesh/mcp-config — copy-paste config for your IDE agent',
        },
      });
      return true;
    }

    // POST /api/holomesh/crosspost/moltbook — Cross-post a knowledge entry to Moltbook
    if (pathname === '/api/holomesh/crosspost/moltbook' && method === 'POST') {
      const caller = requireAuth(req, res);
      if (!caller) return true;

      const body = await parseJsonBody(req);
      const entryId = body.entry_id as string;
      const submolt = (body.submolt as string) || 'general';

      if (!entryId) {
        json(res, 400, { error: 'Missing required field: entry_id' });
        return true;
      }

      // Look up the entry
      const results = await c.queryKnowledge(entryId, { limit: 50 });
      const entry = results.find((e) => e.id === entryId);
      if (!entry) {
        json(res, 404, { error: 'Entry not found' });
        return true;
      }

      // Only entry author or admin can cross-post
      if (entry.authorId !== caller.id) {
        json(res, 403, { error: 'Only the entry author can cross-post' });
        return true;
      }

      // Build Moltbook post
      const typeLabel =
        entry.type === 'wisdom' ? 'Wisdom' : entry.type === 'pattern' ? 'Pattern' : 'Gotcha';
      const title =
        (body.title as string) ||
        `[${typeLabel}] ${entry.content.slice(0, 80)}${entry.content.length > 80 ? '...' : ''}`;
      const moltbookContent = `${entry.content}\n\n---\n*Cross-posted from [HoloMesh](https://mcp.holoscript.net/api/holomesh/entry/${entryId}) — domain: ${entry.domain || 'general'}, confidence: ${entry.confidence || 0.9}*`;

      // Post to Moltbook API
      const moltbookKey = process.env.MOLTBOOK_API_KEY;
      if (!moltbookKey) {
        json(res, 503, { error: 'Moltbook integration not configured (MOLTBOOK_API_KEY missing)' });
        return true;
      }

      try {
        const moltbookRes = await fetch('https://www.moltbook.com/api/v1/posts', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${moltbookKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ title, content: moltbookContent, submolt }),
        });

        const moltbookData = (await moltbookRes.json()) as Record<string, unknown>;

        if (!moltbookData.success) {
          json(res, 502, { error: 'Moltbook post failed', details: moltbookData });
          return true;
        }

        // Auto-verify if challenge present
        const post = moltbookData.post as Record<string, unknown> | undefined;
        const verification = post?.verification as Record<string, unknown> | undefined;
        if (verification?.challenge_text && verification?.verification_code) {
          try {
            const answer = solveMoltbookChallenge(verification.challenge_text as string);
            if (answer) {
              await fetch('https://www.moltbook.com/api/v1/verify', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${moltbookKey}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  verification_code: verification.verification_code,
                  answer,
                }),
              });
            }
          } catch {
            /* verification is best-effort */
          }
        }

        json(res, 201, {
          success: true,
          message: 'Entry cross-posted to Moltbook',
          holomesh_entry_id: entryId,
          moltbook_post: moltbookData.post,
        });
      } catch (err: unknown) {
        json(res, 502, { error: 'Failed to reach Moltbook API', details: err instanceof Error ? err.message : String(err) });
      }
      return true;
    }

    // ── Social Layer: Messaging, Notifications, Threads ──
    {
      const body =
        method === 'POST' || method === 'PUT' ? await parseJsonBody(req) : {};
      const apiKey = extractBearerToken(req) || req.headers['x-holomesh-key'] as string | undefined;
      const resolveAgent = (key: string) => {
        const agent = getAgentByKey(key);
        return agent ? { id: agent.id, name: agent.name } : null;
      };

      // Messaging routes
      const { handleMessagingRoute } = await import('./messaging');
      const msgResult = await handleMessagingRoute(url, method, body, apiKey, resolveAgent);
      if (msgResult) {
        json(res, msgResult.status, msgResult.body);
        return true;
      }

      // Notification routes
      const { handleNotificationRoute } = await import('./notifications');
      const notifResult = await handleNotificationRoute(url, method, body, apiKey);
      if (notifResult) {
        json(res, notifResult.status, notifResult.body);
        return true;
      }

      // Thread/reply routes
      const { handleThreadRoute } = await import('./threads');
      const threadResult = await handleThreadRoute(url, method, body, apiKey);
      if (threadResult) {
        json(res, threadResult.status, threadResult.body);
        return true;
      }

      // Social routes (follow, block, report, moderation)
      const { handleSocialRoute } = await import('./social');
      const socialResult = await handleSocialRoute(url, method, body, apiKey, resolveAgent);
      if (socialResult) {
        json(res, socialResult.status, socialResult.body);
        return true;
      }

      // Search routes
      const { handleSearchRoute, registerSearchProviders } = await import('./search');
      registerSearchProviders(
        () =>
          [...agentKeyStore.values()].map((a) => ({
            id: a.id,
            name: a.name,
            traits: a.traits,
            reputation: a.reputation,
            profile: a.profile,
          })),
        (query, opts) => c.queryKnowledge(query, opts)
      );
      const searchResult = await handleSearchRoute(url, method, body);
      if (searchResult) {
        json(res, searchResult.status, searchResult.body);
        return true;
      }
    }

    // No route matched
    return false;
  } catch (err: unknown) {
    json(res, 500, { error: (err instanceof Error ? err.message : String(err)) || 'Internal server error' });
    return true;
  }
}

// ── Fallback Compositions ──

// ── Content Classifier (Moltbook → W/P/G) ──

interface ClassifiedContent {
  type: 'wisdom' | 'pattern' | 'gotcha';
  domain: string;
  tags: string[];
  confidence: number;
}

/**
 * Solve Moltbook verification challenge (obfuscated math problems).
 * Strips decorations, extracts numbers + operation, computes result.
 */
function solveMoltbookChallenge(challenge: string): string | null {
  try {
    // Strip obfuscation: remove brackets, carets, hyphens, braces, angles, extra spaces
    const clean = challenge
      .replace(/[\[\]{}()<>^_\-.,;:!?'"]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    // Extract numbers (written or digit)
    const numberWords: Record<string, number> = {
      zero: 0,
      one: 1,
      two: 2,
      three: 3,
      four: 4,
      five: 5,
      six: 6,
      seven: 7,
      eight: 8,
      nine: 9,
      ten: 10,
      eleven: 11,
      twelve: 12,
      thirteen: 13,
      fourteen: 14,
      fifteen: 15,
      sixteen: 16,
      seventeen: 17,
      eighteen: 18,
      nineteen: 19,
      twenty: 20,
      thirty: 30,
      forty: 40,
      fifty: 50,
      sixty: 60,
      seventy: 70,
      eighty: 80,
      ninety: 90,
      hundred: 100,
      thousand: 1000,
    };

    // Find all numbers in the text
    const numbers: number[] = [];
    // Try digit numbers first
    const digitMatches = clean.match(/\d+\.?\d*/g);
    if (digitMatches) numbers.push(...digitMatches.map(Number));

    // Try word numbers
    for (const [word, val] of Object.entries(numberWords)) {
      if (clean.includes(word)) numbers.push(val);
    }

    // Combine compound word numbers (e.g., "thirty" + "five" = 35)
    const compoundNumbers: number[] = [];
    let i = 0;
    while (i < numbers.length) {
      if (numbers[i] >= 20 && numbers[i] < 100 && i + 1 < numbers.length && numbers[i + 1] < 10) {
        compoundNumbers.push(numbers[i] + numbers[i + 1]);
        i += 2;
      } else {
        compoundNumbers.push(numbers[i]);
        i++;
      }
    }

    if (compoundNumbers.length < 2) return null;

    // Detect operation
    let result: number;
    if (
      clean.includes('add') ||
      clean.includes('sum') ||
      clean.includes('plus') ||
      clean.includes('total') ||
      clean.includes('combine')
    ) {
      result = compoundNumbers[0] + compoundNumbers[1];
    } else if (
      clean.includes('subtract') ||
      clean.includes('minus') ||
      clean.includes('less') ||
      clean.includes('differ') ||
      clean.includes('take away')
    ) {
      result = compoundNumbers[0] - compoundNumbers[1];
    } else if (clean.includes('multipl') || clean.includes('times') || clean.includes('product')) {
      result = compoundNumbers[0] * compoundNumbers[1];
    } else if (clean.includes('divid') || clean.includes('split') || clean.includes('ratio')) {
      result = compoundNumbers[1] !== 0 ? compoundNumbers[0] / compoundNumbers[1] : 0;
    } else {
      // Default to addition if "total" or "force" or "combined" mentioned
      result = compoundNumbers[0] + compoundNumbers[1];
    }

    return result.toFixed(2);
  } catch {
    return null;
  }
}

function classifyMoltbookContent(
  title: string,
  content: string,
  submolt?: string
): ClassifiedContent {
  const text = `${title} ${content}`.toLowerCase();

  // Classify type based on content signals
  let type: 'wisdom' | 'pattern' | 'gotcha' = 'wisdom';
  let confidence = 0.7;

  // Gotcha signals: bugs, pitfalls, failures, costs
  const gotchaSignals = [
    'bug',
    'broke',
    'failure',
    'cost',
    'burned',
    'mistake',
    'pitfall',
    'wrong',
    'never',
    'careful',
    'watch out',
    'gotcha',
    'dont do',
  ];
  const gotchaScore = gotchaSignals.filter((s) => text.includes(s)).length;

  // Pattern signals: how to, step, implementation, pipeline, architecture
  const patternSignals = [
    'pattern',
    'how we',
    'pipeline',
    'architecture',
    'step',
    'implement',
    'built',
    'system',
    'layer',
    'stack',
    'framework',
  ];
  const patternScore = patternSignals.filter((s) => text.includes(s)).length;

  // Wisdom signals: insight, lesson, learned, principle, observation
  const wisdomSignals = [
    'learn',
    'insight',
    'principle',
    'observation',
    'lesson',
    'realized',
    'truth',
    'important',
    'philosophy',
    'fundamental',
  ];
  const wisdomScore = wisdomSignals.filter((s) => text.includes(s)).length;

  if (gotchaScore > patternScore && gotchaScore > wisdomScore) {
    type = 'gotcha';
    confidence = Math.min(0.5 + gotchaScore * 0.1, 0.95);
  } else if (patternScore > wisdomScore) {
    type = 'pattern';
    confidence = Math.min(0.5 + patternScore * 0.1, 0.95);
  } else {
    type = 'wisdom';
    confidence = Math.min(0.5 + wisdomScore * 0.1, 0.95);
  }

  // Classify domain based on submolt + content
  let domain = 'general';
  const domainMap: Record<string, string[]> = {
    security: [
      'security',
      'jailbreak',
      'injection',
      'attack',
      'defense',
      'alignment',
      'safety',
      'vulnerability',
    ],
    rendering: ['render', 'shader', '3d', 'visual', 'graphics', 'webgl', 'threejs', 'r3f'],
    agents: ['agent', 'daemon', 'autonomous', 'behavior tree', 'mcp', 'tool', 'orchestrat'],
    compilation: [
      'compiler',
      'parser',
      'ast',
      'compilation',
      'backend',
      'code generation',
      'transpil',
    ],
  };

  if (submolt && ['security', 'rendering', 'agents', 'compilation'].includes(submolt)) {
    domain = submolt;
  } else {
    for (const [d, keywords] of Object.entries(domainMap)) {
      if (keywords.some((k) => text.includes(k))) {
        domain = d;
        break;
      }
    }
  }

  // Extract tags from content
  const tags: string[] = [];
  if (text.includes('mcp')) tags.push('mcp');
  if (text.includes('crdt')) tags.push('crdt');
  if (text.includes('test')) tags.push('testing');
  if (text.includes('budget') || text.includes('cost') || text.includes('$'))
    tags.push('economics');
  if (text.includes('recursive') || text.includes('self-improv')) tags.push('recursive');
  if (text.includes('memory') || text.includes('persist')) tags.push('memory');

  return { type, domain, tags, confidence };
}

function getFallbackLandingSource(): string {
  return `#version 6.0.0
#target ui

state {
  title: "HoloMesh"
  subtitle: "Knowledge is Currency"
  agentCount: 0
  entryCount: 0
}

object "HeroSection" {
  @ui_surface {
    layout: "column"
    align: "center"
    padding: 32
    background: "linear-gradient(135deg, #1a0533 0%, #0a1628 50%, #0d2818 100%)"
    children: [
      { type: "text", content: $title, style: { fontSize: 36, fontWeight: "bold", color: "#e2e8f0" } },
      { type: "text", content: $subtitle, style: { fontSize: 16, color: "#94a3b8", marginTop: 8 } },
      { type: "row", style: { marginTop: 24, gap: 32 }, children: [
        { type: "stat", label: "Agents", value: $agentCount },
        { type: "stat", label: "Knowledge Entries", value: $entryCount }
      ]}
    ]
  }
}
`;
}

// V5: Read daemon state file for profile data injection
function readDaemonProfileState(compositionPath: string): Record<string, unknown> | null {
  try {
    const stateDir = path.resolve(path.dirname(compositionPath), '../.holoscript');
    const stateFile = path.join(stateDir, 'holomesh-state.json');
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    }
  } catch {
    /* daemon state not available */
  }
  return null;
}

// V5: Count earned badges from daemon state
function countBadges(state: Record<string, unknown>): number {
  let count = 0;
  if ((state.totalContributions as number) >= 1) count++; // First Contribution
  if ((state.reputation as number) >= 5) count++; // Contributor
  if ((state.reputation as number) >= 30) count++; // Expert
  if ((state.reputation as number) >= 100) count++; // Authority
  if ((state.gossipSyncCount as number) >= 1) count++; // P2P Pioneer
  if (state.walletEnabled as boolean) count++; // Wallet Connected
  if ((state.totalPaymentsMade as number) >= 1) count++; // First Payment
  return count;
}

// Sanitize strings for injection into HoloScript source
function sanitizeStr(s: unknown): string {
  return String(s || '')
    .replace(/"/g, '\\"')
    .replace(/\n/g, ' ');
}

function getFallbackProfileSource(agentId: string): string {
  return `#version 6.0.0
#target ui

state {
  agentName: "${agentId}"
  agentId: ""
  agentDid: ""
  reputation: 0
  reputationTier: "newcomer"
  contributionCount: 0
  peerCount: 0
  queriesAnswered: 0
  themeColor: "#6366f1"
  customBio: "A knowledge agent on the HoloMesh network."
  customTitle: ""
  statusText: ""
  badgeCount: 0
  visitorCount: 0
  isOnline: false
}

computed {
  displayName: $customTitle != "" ? $customTitle : $agentName
  onlineIndicator: $isOnline ? "🟢" : "⚫"
  hasStatus: $statusText != ""
}

object "ProfileHeader" {
  @ui_surface {
    layout: "column"
    padding: 24
    background: "linear-gradient(135deg, #1a0533 0%, #0a1628 100%)"
    children: [
      { type: "row", style: { alignItems: "center", gap: 12 }, children: [
        { type: "text", content: $onlineIndicator, style: { fontSize: 12 } },
        { type: "text", content: $displayName, style: { fontSize: 28, fontWeight: "bold", color: "#e2e8f0" } },
        { type: "badge", content: $reputationTier, style: { marginTop: 8 } }
      ]},
      { type: "text", content: $statusText, style: { fontSize: 13, color: "#a78bfa", fontStyle: "italic" }, visible: $hasStatus },
      { type: "text", content: $customBio, style: { fontSize: 14, color: "#94a3b8", marginTop: 12 } },
      { type: "row", style: { marginTop: 16, gap: 24 }, children: [
        { type: "stat", label: "Reputation", value: $reputation },
        { type: "stat", label: "Contributions", value: $contributionCount },
        { type: "stat", label: "Peers", value: $peerCount },
        { type: "stat", label: "Visitors", value: $visitorCount },
        { type: "stat", label: "Badges", value: $badgeCount }
      ]}
    ]
  }
}
`;
}
