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
  /** Arbitrary metadata that survives orchestrator round-trip (stored as JSON) */
  metadata?: Record<string, unknown>;
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

// --- V11: Hysteresis for Reputation Tiers ---

export const REPUTATION_TIERS_HYSTERESIS = [
  { promote: 100, demote: 75, tier: 'authority' as const },
  { promote: 30, demote: 22, tier: 'expert' as const },
  { promote: 5, demote: 3, tier: 'contributor' as const },
  { promote: 0, demote: 0, tier: 'newcomer' as const },
] as const;

/**
 * Resolve reputation tier with hysteresis — asymmetric promote/demote thresholds.
 * Prevents oscillation when scores hover near tier boundaries.
 * Demote threshold = promote * 0.75 (requires more evidence to recover than to lose).
 */
export function resolveReputationTierWithHysteresis(
  score: number,
  currentTier?: AgentReputation['tier']
): AgentReputation['tier'] {
  if (!currentTier) return resolveReputationTier(score);

  const currentIdx = REPUTATION_TIERS_HYSTERESIS.findIndex(
    (t) => t.tier === currentTier
  );

  // Check promotion (score exceeds a higher tier's promote threshold)
  for (let i = 0; i < REPUTATION_TIERS_HYSTERESIS.length; i++) {
    if (i < currentIdx && score >= REPUTATION_TIERS_HYSTERESIS[i].promote) {
      return REPUTATION_TIERS_HYSTERESIS[i].tier;
    }
  }

  // Check demotion (score below current tier's demote threshold)
  if (currentIdx >= 0 && currentIdx < REPUTATION_TIERS_HYSTERESIS.length) {
    if (score < REPUTATION_TIERS_HYSTERESIS[currentIdx].demote) {
      for (let i = currentIdx + 1; i < REPUTATION_TIERS_HYSTERESIS.length; i++) {
        if (score >= REPUTATION_TIERS_HYSTERESIS[i].demote) {
          return REPUTATION_TIERS_HYSTERESIS[i].tier;
        }
      }
      return 'newcomer';
    }
  }

  // Score is in hysteresis band — keep current tier
  return currentTier;
}

// --- V11: Authority Tier Algebraic Consequences ---

/**
 * Material consequences of reputation tier.
 * Authority is not just a label — it changes gossip priority, decay rate,
 * and corroboration weight in the provenance algebra.
 */
export const TIER_WEIGHTS = {
  newcomer: { gossipPriority: 1.0, decayMultiplier: 1.0, corroborationWeight: 1.0 },
  contributor: {
    gossipPriority: 1.2,
    decayMultiplier: 0.95,
    corroborationWeight: 1.5,
  },
  expert: { gossipPriority: 1.5, decayMultiplier: 0.85, corroborationWeight: 2.0 },
  authority: {
    gossipPriority: 2.0,
    decayMultiplier: 0.7,
    corroborationWeight: 3.0,
  },
} as const;

export type TierWeight = (typeof TIER_WEIGHTS)[keyof typeof TIER_WEIGHTS];

export function getTierWeight(
  tier: AgentReputation['tier']
): TierWeight {
  return TIER_WEIGHTS[tier] || TIER_WEIGHTS.newcomer;
}

/**
 * Reputation = directWork + reuseWeight
 * directWork = contributions * 0.3 + queriesAnswered * 0.2
 * reuseWeight = min(effectiveReuseRate * 20, 40, directWork * 2)
 *
 * V10: Cap reuseRate at 20, require 3+ contributions.
 * V11: Bound reuseWeight by 2x direct work score — passive income
 * cannot exceed 2x active contribution. Prevents Sybil clusters
 * from reaching authority tier with minimal real work.
 */
export function computeReputation(
  contributions: number,
  queriesAnswered: number,
  reuseRate: number
): number {
  const effectiveReuseRate = contributions >= 3 ? reuseRate : 0;
  const directWorkScore = contributions * 0.3 + queriesAnswered * 0.2;
  const reuseWeight = Math.min(effectiveReuseRate * 20, 40, directWorkScore * 2);
  return Math.round((directWorkScore + reuseWeight) * 100) / 100;
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
  orchestratorUrl:
    process.env.MCP_ORCHESTRATOR_URL || 'https://mcp-orchestrator-production-45f9.up.railway.app',
  workspace: 'ai-ecosystem',
  agentName: 'holomesh-agent',
  discoveryIntervalMs: 5 * 60 * 1000, // 5 min
  inboxIntervalMs: 60 * 1000, // 1 min
  maxContributionsPerCycle: 5,
  maxQueriesPerCycle: 3,
  budgetCapUSD: 5.0,
};

// --- V2 Peer Store ---

export interface PeerStoreEntry {
  did: string;
  mcpBaseUrl: string;
  name: string;
  traits: string[];
  reputation: number;
  lastSeen: string;
  lastSyncAt: string | null;
  /** Loro frontiers from last sync (JSON-serializable) */
  lastKnownFrontiers: unknown[] | null;
  source: 'orchestrator' | 'gossip' | 'direct';
  /** Consecutive contact failures */
  failureCount: number;
  /** V4: Wallet address (verified via signature) */
  walletAddress?: string;
}

// --- V2 Gossip Exchange ---

/** V6: Health metadata transmitted as gossip side-channel */
export interface GossipHealthMetadata {
  /** Seconds since daemon started */
  uptimeSeconds: number;
  /** Consecutive gossip failures in current session */
  failureCount: number;
  /** Peer count visible to sender */
  peerCount: number;
  /** Sender's self-assessed reputation score */
  reputationScore: number;
  /** Knowledge entries contributed this session */
  contributionsThisSession: number;
  /** ISO timestamp of last daemon restart */
  lastRestartAt?: string;
}

export interface GossipDeltaRequest {
  senderDid: string;
  senderUrl: string;
  senderName: string;
  /** Loro binary delta encoded as base64 */
  deltaBase64: string;
  /** Sender's Loro frontiers for version negotiation */
  frontiers: unknown[];
  /** Peers to share via gossip */
  knownPeers?: Array<{ did: string; url: string; name: string }>;
  timestamp: string;
  /** V4: EIP-191 signature over gossip payload */
  signature?: string;
  /** V4: Sender wallet address (for signature verification) */
  senderWalletAddress?: string;
  /** V6: Health metadata piggybacked on gossip (observability side-channel) */
  senderHealth?: GossipHealthMetadata;
}

export interface GossipDeltaResponse {
  success: boolean;
  /** Receiver's delta back to sender (base64) */
  deltaBase64?: string;
  /** Receiver's Loro frontiers */
  frontiers?: unknown[];
  /** Receiver's known peers */
  knownPeers?: Array<{ did: string; url: string; name: string }>;
  /** V4: Signature verification result */
  signatureVerified?: 'verified' | 'unsigned' | 'invalid';
  /** V6: Responder's health metadata */
  responderHealth?: GossipHealthMetadata;
}

// --- V2 Knowledge Domains ---

export const KNOWLEDGE_DOMAINS = [
  'security',
  'rendering',
  'agents',
  'compilation',
  'general',
] as const;
export type KnowledgeDomain = (typeof KNOWLEDGE_DOMAINS)[number];

// --- V9: Neuroscience Memory Consolidation ---

/** Domain-specific consolidation parameters (different "brain regions" consolidate at different rates) */
export interface DomainConsolidationConfig {
  /** How long entries stay in hot buffer before eligible for consolidation (ms) */
  hotBufferTTL: number;
  /** How often sleep/consolidation cycles run (ms) */
  sleepFrequencyMs: number;
  /** Max entries in cold store per domain — capacity limit drives competition */
  maxEntries: number;
  /** What metric drives engram competition when domain is full */
  competitionMetric: 'citation_count' | 'query_frequency' | 'peer_corroboration';
  /** Proportional score reduction during downscaling (0-1, lower = more aggressive) */
  downscaleFactor: number;
  /** Min corroborations from independent peers to promote from hot → cold */
  minCorroborations: number;
}

/** Default consolidation configs per domain */
export const DOMAIN_CONSOLIDATION: Record<KnowledgeDomain, DomainConsolidationConfig> = {
  security: {
    hotBufferTTL: 1 * 60 * 60 * 1000,       // 1 hour
    sleepFrequencyMs: 6 * 60 * 60 * 1000,    // 6 hours
    maxEntries: 50,
    competitionMetric: 'peer_corroboration',
    downscaleFactor: 0.85,
    minCorroborations: 2,
  },
  rendering: {
    hotBufferTTL: 24 * 60 * 60 * 1000,      // 24 hours
    sleepFrequencyMs: 24 * 60 * 60 * 1000,   // 24 hours
    maxEntries: 200,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.95,
    minCorroborations: 1,
  },
  agents: {
    hotBufferTTL: 12 * 60 * 60 * 1000,      // 12 hours
    sleepFrequencyMs: 12 * 60 * 60 * 1000,   // 12 hours
    maxEntries: 150,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.90,
    minCorroborations: 1,
  },
  compilation: {
    hotBufferTTL: 12 * 60 * 60 * 1000,      // 12 hours
    sleepFrequencyMs: 12 * 60 * 60 * 1000,   // 12 hours
    maxEntries: 100,
    competitionMetric: 'citation_count',
    downscaleFactor: 0.90,
    minCorroborations: 1,
  },
  general: {
    hotBufferTTL: 6 * 60 * 60 * 1000,       // 6 hours
    sleepFrequencyMs: 12 * 60 * 60 * 1000,   // 12 hours
    maxEntries: 300,
    competitionMetric: 'query_frequency',
    downscaleFactor: 0.92,
    minCorroborations: 1,
  },
};

// --- V11: Domain-Specific Reputation Half-Lives ---

/**
 * Domain-specific reputation decay half-lives (ms).
 * Based on Arbesman 2012 (The Half-Life of Facts) and
 * Machlup 1962 (knowledge decay rates by domain).
 * Security decays fastest; compilation theory is most durable.
 */
export const DOMAIN_HALF_LIVES: Record<KnowledgeDomain, number> = {
  security: 2 * 24 * 60 * 60 * 1000, // 2 days
  rendering: 14 * 24 * 60 * 60 * 1000, // 14 days
  agents: 7 * 24 * 60 * 60 * 1000, // 7 days
  compilation: 21 * 24 * 60 * 60 * 1000, // 21 days
  general: 7 * 24 * 60 * 60 * 1000, // 7 days (legacy default)
};

/** A hot buffer entry — raw gossip awaiting consolidation (hippocampus) */
export interface HotBufferEntry {
  id: string;
  domain: KnowledgeDomain;
  content: string;
  type: string;
  authorDid: string;
  tags: string[];
  /** When it entered the hot buffer */
  ingestedAt: number;
  /** Independent peers that corroborated this entry */
  corroborations: string[];
  /** Source peer that gossiped this entry */
  sourcePeerDid: string;
}

/** Excitability metadata stored alongside knowledge entries in cold store */
export interface ExcitabilityMetadata {
  /** How often this entry has been retrieved (retrieval practice effect) */
  queryCount: number;
  /** How many other entries cite this one */
  citationCount: number;
  /** Independent peers that corroborated */
  corroborationCount: number;
  /** Composite excitability score (computed) */
  excitability: number;
  /** Last retrieval timestamp (for reconsolidation window) */
  lastRetrievedAt: number;
  /** Last reconsolidation timestamp */
  lastReconsolidatedAt: number;
  /** Times this entry survived a sleep cycle */
  consolidationSurvivals: number;
}

/** Result of a consolidation (sleep) cycle */
export interface ConsolidationResult {
  domain: KnowledgeDomain;
  /** Entries promoted from hot buffer to cold store */
  promoted: number;
  /** Entries merged (deduplicated) in cold store */
  merged: number;
  /** Entries evicted from cold store by competition */
  evicted: number;
  /** Entries dropped from hot buffer (unvalidated) */
  dropped: number;
  /** Downscaling factor applied */
  downscaleFactor: number;
  /** Timestamp of consolidation */
  consolidatedAt: number;
}

/** Reconsolidation event — triggered when knowledge is retrieved */
export interface ReconsolidationEvent {
  entryId: string;
  domain: KnowledgeDomain;
  retrievedAt: number;
  /** How the entry's excitability changed */
  excitabilityDelta: number;
  /** Whether the reconsolidation window is open (5 min) */
  windowOpen: boolean;
  /** Window closes at this timestamp */
  windowClosesAt: number;
}

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
  // V2 gossip fields (null/false = V1 mode)
  v2Enabled: boolean;
  p2pPeerCount: number;
  gossipSyncCount: number;
  crdtMergeCount: number;
  lastGossipSyncAt: string | null;
  // V3 wallet fields (null/false = no wallet)
  walletEnabled: boolean;
  walletAddress: string | null;
  walletChainId: number;
  walletBalanceUSDC: number;
  totalPaymentsMade: number;
  totalPaymentsReceived: number;
  microLedgerUnsettled: number;
  lastSettlementAt: string | null;
  // V4 wallet identity (null = no wallet-based DID)
  agentDid: string | null;
  // V5 agent profile (MySpace)
  profileCreated: boolean;
  profileDisplayName: string;
  profileBio: string;
  profileCustomTitle: string;
  profileThemeColor: string;
  // V7 team message dedup
  processedMessageIds: string[];
  // V11 resource pressure (L4 Blueprint 1: wire rendering to budget gate)
  resourcePressure: number;
  suggestedLOD: number;
  hardLimitBreached: boolean;
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
  processedMessageIds: [],
  v2Enabled: false,
  p2pPeerCount: 0,
  gossipSyncCount: 0,
  crdtMergeCount: 0,
  lastGossipSyncAt: null,
  walletEnabled: false,
  walletAddress: null,
  walletChainId: 0,
  walletBalanceUSDC: 0,
  totalPaymentsMade: 0,
  totalPaymentsReceived: 0,
  microLedgerUnsettled: 0,
  lastSettlementAt: null,
  agentDid: null,
  profileCreated: false,
  profileDisplayName: 'holomesh-agent',
  profileBio: '',
  profileCustomTitle: '',
  profileThemeColor: '#6366f1',
  resourcePressure: 0,
  suggestedLOD: 0,
  hardLimitBreached: false,
};
