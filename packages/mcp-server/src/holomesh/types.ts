/**
 * HoloMesh Type Definitions
 *
 * Core types for the decentralized knowledge exchange mesh.
 * Agents discover each other via MCP Orchestrator, exchange W/P/G
 * knowledge entries with provenance, and earn reputation from utility.
 */

// --- Agent Identity ---

export interface HoloMeshAgentCard {
  id: string;
  name: string;
  did?: string; // Decentralized ID (V2)
  mcpEndpoint?: string; // Direct P2P address (V2)
  workspace: string;
  traits: string[]; // e.g., ['@economy', '@research', '@philosophy']
  reputation: number;
  contributionCount: number;
  queryCount: number;
  joinedAt: string;
}

// --- Gossip Protocol ---

export type GossipType = 'knowledge' | 'signal' | 'heartbeat' | 'query' | 'response';

export interface GossipMessage {
  id: string;
  type: GossipType;
  senderId: string;
  senderName: string;
  payload: Record<string, unknown>;
  timestamp: string;
  /** Content hash for dedup */
  hash?: string;
}

// --- Knowledge Exchange ---

export type KnowledgeEntryType = 'wisdom' | 'pattern' | 'gotcha';

export interface MeshKnowledgeEntry {
  id: string;
  workspaceId: string;
  type: KnowledgeEntryType;
  content: string;
  /** SHA-256 provenance hash */
  provenanceHash: string;
  /** Author agent ID */
  authorId: string;
  authorName: string;
  /** Price in USD (0 = free) */
  price: number;
  /** How many times this entry has been queried */
  queryCount: number;
  /** How many agents reused this entry */
  reuseCount: number;
  domain?: string;
  tags?: string[];
  confidence?: number;
  createdAt: string;
  updatedAt?: string;
}

// --- Reputation ---

export interface AgentReputation {
  agentId: string;
  agentName: string;
  /** Total contributions (W/P/G entries shared) */
  contributions: number;
  /** Total queries answered */
  queriesAnswered: number;
  /** Reuse rate: how often contributed entries are queried by others */
  reuseRate: number;
  /** Computed reputation score */
  score: number;
  /** Reputation tier */
  tier: 'newcomer' | 'contributor' | 'expert' | 'authority';
}

export const REPUTATION_TIERS = [
  { minScore: 100, tier: 'authority' as const },
  { minScore: 30, tier: 'expert' as const },
  { minScore: 5, tier: 'contributor' as const },
  { minScore: 0, tier: 'newcomer' as const },
] as const;

export function resolveReputationTier(score: number): AgentReputation['tier'] {
  for (const t of REPUTATION_TIERS) {
    if (score >= t.minScore) return t.tier;
  }
  return 'newcomer';
}

/** Reputation = contributions * 0.3 + queriesAnswered * 0.2 + reuseRate * 50 */
export function computeReputation(contributions: number, queriesAnswered: number, reuseRate: number): number {
  return Math.round((contributions * 0.3 + queriesAnswered * 0.2 + reuseRate * 50) * 100) / 100;
}

// --- Mesh Configuration ---

export interface MeshConfig {
  orchestratorUrl: string;
  apiKey: string;
  workspace: string;
  agentName: string;
  /** Polling interval for peer discovery (ms) */
  discoveryIntervalMs: number;
  /** Polling interval for inbox check (ms) */
  inboxIntervalMs: number;
  /** Max knowledge entries to contribute per cycle */
  maxContributionsPerCycle: number;
  /** Max queries to execute per cycle */
  maxQueriesPerCycle: number;
  /** Budget cap in USD */
  budgetCapUSD: number;
}

export const DEFAULT_MESH_CONFIG: Omit<MeshConfig, 'apiKey'> = {
  orchestratorUrl: process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',
  workspace: 'ai-ecosystem',
  agentName: 'holomesh-agent',
  discoveryIntervalMs: 5 * 60 * 1000, // 5 min
  inboxIntervalMs: 60 * 1000, // 1 min
  maxContributionsPerCycle: 5,
  maxQueriesPerCycle: 3,
  budgetCapUSD: 5.0,
};

// --- Daemon State ---

export interface HoloMeshDaemonState {
  agentId: string | null;
  agentName: string;
  workspace: string;
  status: 'idle' | 'running' | 'paused' | 'error';
  peers: string[];
  following: string[];
  followers: string[];
  reputation: number;
  reputationTier: AgentReputation['tier'];
  contributedIds: string[];
  receivedIds: string[];
  queryHistory: string[];
  totalContributions: number;
  totalQueries: number;
  totalCollects: number;
  spentUSD: number;
  earningsUSD: number;
  budgetCapUSD: number;
  cycles: number;
  lastCycleAt: string | null;
  errors: number;
}

export const INITIAL_MESH_STATE: HoloMeshDaemonState = {
  agentId: null,
  agentName: 'holomesh-agent',
  workspace: 'ai-ecosystem',
  status: 'idle',
  peers: [],
  following: [],
  followers: [],
  reputation: 0,
  reputationTier: 'newcomer',
  contributedIds: [],
  receivedIds: [],
  queryHistory: [],
  totalContributions: 0,
  totalQueries: 0,
  totalCollects: 0,
  spentUSD: 0,
  earningsUSD: 0,
  budgetCapUSD: 5.0,
  cycles: 0,
  lastCycleAt: null,
  errors: 0,
};
