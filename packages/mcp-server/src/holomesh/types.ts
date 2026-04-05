/**
 * HoloMesh Type Definitions
 *
 * Core types for the decentralized knowledge exchange mesh.
 * Knowledge brain types (domains, consolidation, excitability, half-lives)
 * now live in @holoscript/framework. Re-exported here for backward compat.
 */

// Knowledge brain — canonical source is @holoscript/framework
export type {
  KnowledgeDomain,
  DomainConsolidationConfig,
  HotBufferEntry,
  ExcitabilityMetadata,
  ConsolidationResult,
  ReconsolidationEvent,
} from '@holoscript/framework';

export {
  KNOWLEDGE_DOMAINS,
  DOMAIN_CONSOLIDATION,
  DOMAIN_HALF_LIVES,
  computeExcitability,
  applyHalfLifeDecay,
  RECONSOLIDATION_WINDOW_MS,
  triggerReconsolidation,
} from '@holoscript/framework';

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

// Knowledge brain types re-exported from @holoscript/framework at top of file.

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
  // V6 daemon discovery / query fields
  knownPeerCount: number;
  lastDiscoveryAt: string | null;
  unreadMessages: number;
  totalQueriesAnswered: number;
  lastContributionAt: string | null;
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
  knownPeerCount: 0,
  lastDiscoveryAt: null,
  unreadMessages: 0,
  totalQueriesAnswered: 0,
  lastContributionAt: null,
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
