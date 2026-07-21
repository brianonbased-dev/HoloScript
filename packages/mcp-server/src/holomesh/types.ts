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
  ExcitabilityMetadata,
  HotBufferEntry,
  ConsolidationResult,
  ReconsolidationEvent,
  MemoryReceipt,
} from '@holoscript/framework';

import type {
  TeamTask,
  DoneLogEntry,
  BountyManager,
  TeamSuggestion,
  HoloMeshIdentityEnvelope,
} from '@holoscript/framework';
export type { TeamTask, BountyManager, HoloMeshIdentityEnvelope };
export {
  /* TeamTask, BountyManager, */
  KNOWLEDGE_DOMAINS,
  DOMAIN_CONSOLIDATION,
  DOMAIN_HALF_LIVES,
  computeExcitability,
  applyHalfLifeDecay,
  RECONSOLIDATION_WINDOW_MS,
  triggerReconsolidation,
  hashString,
} from '@holoscript/framework';

// --- Agent Identity ---

export interface HoloMeshAgentCard {
  id: string;
  name: string;
  did?: string; // Decentralized ID (V2)
  mcpEndpoint?: string; // Direct P2P address (V2)
  mcpBaseUrl?: string; // Normalized CRDT gossip base URL
  mcp_base_url?: string; // Legacy snake_case alias
  endpoint?: string; // A2A endpoint alias, normalized by discovery
  url?: string; // Agent-card URL alias, normalized by discovery
  metadata?: Record<string, unknown>;
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

// --- Tier2 Self-Custody Export Session (V3 foundation) ---

export type ExportSessionStatus = 'prepared' | 'packaged' | 'finalized' | 'expired';

export interface ExportSession {
  sessionId: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
  status: ExportSessionStatus;
  serverNonce: string;
  idempotencyKeys: Set<string>;
  consumedAt?: number;
  packageManifestHash?: string;
}

export interface SerializedExportSession extends Omit<ExportSession, 'idempotencyKeys'> {
  idempotencyKeys: string[];
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

  const currentIdx = REPUTATION_TIERS_HYSTERESIS.findIndex((t) => t.tier === currentTier);

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

export function getTierWeight(tier: AgentReputation['tier']): TierWeight {
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
  workspace: process.env.HOLOMESH_WORKSPACE || 'default',
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
  workspace: process.env.HOLOMESH_WORKSPACE || 'default',
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
// --- Team & Board ---

export type TeamRole = 'owner' | 'lead' | 'member' | 'guest';

export interface TeamMember {
  agentId: string;
  agentName: string;
  role: TeamRole;
  joinedAt: string;
  /** Wallet address of the member (snapshot from RegisteredAgent at join time). */
  walletAddress?: string;
  /**
   * Fleet member type. 'agent' for software/IDE seats, 'hardware' for GPU/WASM
   * workers that auto-joined via job execution. Enables the dynamic "usage = membership" model.
   */
  type?: 'agent' | 'hardware';
  /**
   * True when the member's registration completed the x402 challenge-verified
   * flow (EIP-712 proof-of-ownership on /register). False or undefined for
   * legacy path / server-generated wallets.
   */
  x402Verified?: boolean;
  /**
   * Surface tag captured at join time, e.g. "claude-code", "claude-cursor",
   * "gemini-antigravity", "copilot-vscode". Informational — the load-bearing
   * attribution is agentId/walletAddress; this helps humans + audits spot
   * which IDE seat is which when multiple seats share a wallet family.
   */
  surfaceTag?: string;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  type: 'bounty' | 'social' | 'research' | 'dev';
  visibility: 'public' | 'private' | 'internal';
  ownerId: string;
  ownerName: string;
  members: TeamMember[];
  maxSlots: number;
  inviteCode?: string;
  waitlist: string[];
  createdAt: string;

  // Board data
  taskBoard?: TeamTask[];
  doneLog?: DoneLogEntry[];
  retiredDoneLog?: RetiredDoneLogReceipt[];
  suggestions?: TeamSuggestion[];

  /** Local mirror of team-scoped knowledge (orchestrator GET may lag or omit workspace-scoped rows). */
  knowledge?: MeshKnowledgeEntry[];

  /** Latest locally-published GPU/Vast fleet snapshot for deployed Studio and agents. */
  fleetSnapshot?: TeamFleetSnapshotRecord;

  /**
   * Founder one-tap approvals (N3 signed-write path). Records the low-stakes
   * INTENT a founder tapped on the Console; a signing agent consumes
   * status:'approved', materializes the full agi-action-manifest, executes with
   * ITS own x402 envelope, and PATCHes the record to 'executed'. Stored directly
   * on the team object so it persists/reloads through the same path as taskBoard
   * (no side map needed — see state.ts persistTeamStore).
   */
  founderApprovals?: FounderApprovalRecord[];

  // Bounty data (V7 Expansion)
  bounties?: BountyManager;
  submissions?: StoredBountySubmission[];
  miniGames?: StoredBountyMiniGame[];

  mode?: string;
  /**
   * When true, every member effectively carries owner permissions
   * (used for the founder's working teams like HoloScript Core).
   */
  adminRoom?: boolean;
  roomConfig?: {
    objective?: string;
    /** Per-slot role assignments set via holomesh_slot_assign MCP tool. */
    slotRoles?: string[];
    /**
     * How agents should weight team messages vs tasks in session context.
     * - task_first: handoffs/DMs/reviews only (default)
     * - meeting_primary: meeting + text conversation surfaced beside tasks; larger message window
     * - balanced: both conversation and inbox, moderate limits
     */
    communicationStyle?: 'task_first' | 'meeting_primary' | 'balanced';
    /** Last mode change audit (GET /board; task_1777050706699_ixmi) */
    modeProvenance?: {
      source: 'api' | 'mcp_tool' | 'unknown';
      changedAt: string;
      changedByAgentId?: string;
      changedByName?: string;
      previousMode?: string;
    };
    /** Newest-first ring (max 10) of mode transitions */
    modeHistory?: Array<{
      mode: string;
      at: string;
      by: string;
      byAgentId: string;
      source: 'api' | 'mcp_tool';
      reason?: string;
      previousMode: string;
    }>;
    treasuryFeeBps?: number;
    moltbookDaemon?: {
      enabled: boolean;
      minHours: number;
      maxHours: number;
      agentName: string;
      updatedAt: string;
    };
  };
  treasuryWallet?: string;
  treasuryBalance?: number;
}

export interface RetiredDoneLogReceipt {
  taskId: string;
  title?: string;
  completedAt?: string;
  rawSha256: string;
  retiredAt: string;
  retiredByAgentId: string;
  retiredByName: string;
  archiveManifestSha256: string;
  archiveManifestGeneratedAt: string;
  archiveSchemaVersion: string;
  archiveCutoffIso: string;
  archiveCounts: {
    totalRows: number;
    archiveEligibleRows: number;
    hotRows: number;
    missingTimestampRows: number;
  };
  archiveFiles: {
    sqliteSha256: string;
    allNdjsonSha256: string;
    staleNdjsonSha256: string;
  };
}

/**
 * An exact-four Joseph decision intent (N3 signed-write path). Routine work,
 * specialist review, platform controls, and prohibited replanning never enter
 * this queue. It mutates nothing privileged; a signing agent consumes it,
 * agent re-validates, materializes the agi-action-manifest, executes with its
 * own x402 signature, and PATCHes status → 'executed' + a resultRef.
 */
export interface FounderApprovalRecord {
  id: string;
  /** Source board task this intent acts on. */
  taskId: string;
  /** Human-readable intent (the task title / what tapping does). */
  intent: string;
  /** Presentation classification; authority is carried separately below. */
  actionType: 'code' | 'spatial' | 'service_rental' | 'mobility_coordination';
  authorityRoute: 'joseph-exact-four';
  josephReviewClass: 'spend-or-custody' | 'physical-presence' | 'public-identity' | 'governance';
  /** Identity that tapped approve (from Bearer auth, never client-supplied). */
  approvedByAgentId: string;
  approvedByName: string;
  /**
   * True iff the approving Bearer key carried isFounder at mint time. Set
   * server-side (task_1784314731746_o5jk security fix); consumers MUST require
   * `approvedByFounder === true` before acting — records missing the flag
   * predate the founder gate and are untrusted (any board:write seat could
   * have minted them).
   */
  approvedByFounder?: boolean;
  /**
   * approved   → recorded, awaiting a signing agent
   * executing  → a signing agent claimed it and is materializing/signing
   * executed   → the signed mutation landed; resultRef points to the receipt
   * failed     → execution failed; resultRef carries the reason
   */
  status: 'approved' | 'executing' | 'executed' | 'failed';
  createdAt: string;
  /** Set by the signing agent when it claims the record. */
  claimedByAgentId?: string;
  claimedByName?: string;
  executedAt?: string;
  /** Receipt hash / inbox feed id / failure reason, depending on status. */
  resultRef?: string;
}

export type TeamFleetSnapshotHealthStatus = 'missing' | 'ok' | 'degraded' | 'stale' | 'down';

export interface TeamFleetSnapshotSummary {
  captured_at?: string;
  running_count?: number;
  declared_count?: number;
  /** Unmanaged capacity that should affect health; preferred over raw orphan_count. */
  orphaned_capacity_count?: number;
  /** Legacy/raw orphan inventory, including intentionally managed transient capacity. */
  orphan_count?: number;
  no_instance_count?: number;
  total_cost_so_far_usd?: number;
  total_dph_usd?: number;
  projected_24h_cost_usd?: number;
  gpu_tier_distribution?: Record<string, number>;
  [key: string]: unknown;
}

export interface TeamFleetResourceFlowVisibilityV1 {
  complete: boolean;
  gap_count: number;
  gaps: string[];
  duplicate_endpoint_bindings: unknown[];
  invalid_manifest_count: number;
  invalid_manifests: unknown[];
  evidence_sources: string[];
  [key: string]: unknown;
}

export interface TeamFleetResourceFlowUtilizedV1 {
  instance_count: number;
  active_compute_count: number;
  retained_storage_count: number;
  manifest_bound_instance_count: number;
  unbound_instance_count: number;
  capacity_binding_count: number;
  effective_dph_usd: number;
  projected_24h_usd: number;
  resources: unknown[];
  capacity_bindings: unknown[];
  [key: string]: unknown;
}

export interface TeamFleetResourceFlowProducedV1 {
  output_aware_lane_count: number;
  active_manifest_count: number;
  output_contract_count: number;
  bound_manifest_count: number;
  unbound_manifest_count: number;
  evidence_backed_output_count: number;
  verified_product_count: number;
  verified_artifact_count: number;
  verified_receipt_count: number;
  verified_current_binding_count: number;
  declared_only_output_count: number;
  unverified_evidence_output_count: number;
  claimed_or_unverified_output_count: number;
  productive_count: number;
  work_in_progress_count: number;
  inference_output_tokens: number;
  active_manifests: unknown[];
  output_contracts: unknown[];
  declared_output_locations: unknown[];
  claimed_or_declared_outputs: unknown[];
  artifacts: unknown[];
  receipts: unknown[];
  product_verification_policy: string;
  [key: string]: unknown;
}

export interface TeamFleetResourceFlowStoredV1 {
  instance_volume_count: number;
  total_capacity_gb: number;
  total_used_gb: number;
  projected_storage_24h_usd: number;
  volumes: unknown[];
  locally_present_output_location_count: number;
  verified_artifact_location_count: number;
  verified_receipt_location_count: number;
  evidence_backed_output_location_count: number;
  artifact_locations: unknown[];
  receipt_locations: unknown[];
  [key: string]: unknown;
}

export interface TeamFleetResourceFlowConsumedV1 {
  consumer_count: number;
  manifest_attributed_count: number;
  current_physical_consumer_count: number;
  declared_or_historical_manifest_consumer_count: number;
  bound_manifest_consumer_count: number;
  unbound_manifest_consumer_count: number;
  runtime_requests: number;
  compute_bearing_requests: number;
  runtime_metrics_age_ms: number | null;
  runtime_providers: unknown[];
  runtime_endpoints: unknown[];
  consumers: unknown[];
  current_physical_consumers: unknown[];
  declared_or_historical_manifest_consumers: unknown[];
  [key: string]: unknown;
}

export interface TeamFleetSpendAccountingV1 {
  schema_version: 'holomesh.vast-spend-accounting/v1';
  provider: 'vast.ai';
  status: 'ok' | 'captured-provenance-gap' | 'missing' | 'invalid';
  observed_at_utc: string | null;
  freshness_status: 'fresh' | 'stale' | 'missing' | 'invalid';
  age_ms: number | null;
  max_age_ms: number;
  rail: 'purchased_compute';
  reset_window: 'utc_day';
  vendor_total_usd: number | null;
  observed_purchased_compute_usd: number | null;
  monetary_complete: boolean;
  monetary_gap_reasons: string[];
  provenance_complete: boolean;
  provenance_gap_reasons: string[];
  intentional_gap_captured: boolean;
  cap_applicable: boolean;
  cap_usd: number | null;
  observed_admission_verdict:
    | 'under-cap'
    | 'cap-exceeded'
    | 'not-applicable'
    | 'blocked-monetary-coverage-incomplete'
    | null;
  trusted_admission_verdict: 'under-cap' | 'cap-exceeded' | null;
  /** Signed: a negative value is the measured amount over the daily cap. */
  trusted_headroom_usd: number | null;
  no_paid_actions: boolean;
}

/** Versioned Vast utilized/produced/stored/consumed projection published by the local collector. */
export interface TeamFleetResourceFlowV1 {
  schema_version: 'holomesh.vast-resource-flow/v1';
  provider: 'vast.ai';
  captured_at: string;
  spend_accounting: TeamFleetSpendAccountingV1;
  utilized: TeamFleetResourceFlowUtilizedV1;
  produced: TeamFleetResourceFlowProducedV1;
  stored: TeamFleetResourceFlowStoredV1;
  consumed: TeamFleetResourceFlowConsumedV1;
  visibility: TeamFleetResourceFlowVisibilityV1;
  [key: string]: unknown;
}

export interface TeamFleetSnapshotPayload {
  schema_version?: string;
  captured_at?: string;
  error?: string;
  warning?: string;
  summary?: TeamFleetSnapshotSummary;
  matched?: unknown[];
  orphans?: unknown[];
  resource_flow?: TeamFleetResourceFlowV1;
  global_budget_usd_per_day?: number;
  [key: string]: unknown;
}

export interface TeamFleetSnapshotHealth {
  status: TeamFleetSnapshotHealthStatus;
  reasons: string[];
  ageMs: number | null;
  staleAfterMs: number;
}

export interface TeamFleetSnapshotRecord {
  source: string;
  publishedAt: string;
  publishedByAgentId: string;
  publishedByName: string;
  snapshot: TeamFleetSnapshotPayload;
  health: TeamFleetSnapshotHealth;
}

export interface TeamPresenceEntry {
  agentId: string;
  agentName: string;
  ideType: string;
  status: 'active' | 'idle' | 'busy' | 'offline';
  lastHeartbeat: string;
  /** Alias for lastHeartbeat — used by some route handlers for presence staleness checks. */
  lastSeen?: string;
  /**
   * Coarse runtime surface for aliveness policy. `surface_tag` remains the
   * attribution/seat label; this field is the device class such as "mobile".
   */
  surface?: string;
  /** Per-row expiry hint so clients can render transient surfaces accurately. */
  expiresAt?: string;
  /** TTL used for this heartbeat row in milliseconds. */
  ttlMs?: number;
  /** Wallet address of the heartbeating agent (snapshot from RegisteredAgent). */
  walletAddress?: string;
  /** True when the agent's wallet ownership was verified via x402 challenge flow at register time. */
  x402Verified?: boolean;
  /**
   * Surface tag declared on the heartbeat, e.g. "claude-code", "cursor-claude".
   * Body field: `surface_tag`. Distinct from ideType: ideType is the IDE brand
   * ("vscode"), surfaceTag is the specific agent surface running in it.
   */
  surfaceTag?: string;
  /** Capability tags declared by the agent on heartbeat. Used for server-side required_tags enforcement on board task claims. */
  capabilityTags?: string[];
  /** Brain/principal/session/signing envelope captured from the heartbeat. */
  identityEnvelope?: HoloMeshIdentityEnvelope;
  /** Server-issued cloud-session lease associated with this heartbeat, when applicable. */
  cloudSessionLeaseId?: string;
  /** Provider/local session id captured from the identity envelope. */
  sessionId?: string;
  /** Normalized session origin, e.g. local, cloud, mobile. */
  sessionOrigin?: string;
  /** Expiry for the cloud lease. Distinct from short local presence expiry. */
  sessionExpiresAt?: string;
}

export interface HoloMeshCloudSessionLease {
  leaseId: string;
  teamId: string;
  agentId: string;
  agentName: string;
  status: 'active' | 'ended' | 'expired';
  sessionId: string;
  origin: string;
  surface?: string;
  family?: string;
  handle?: string;
  createdAt: string;
  lastHeartbeat: string;
  expiresAt: string;
  identityEnvelope?: HoloMeshIdentityEnvelope;
}

export interface TeamMessage {
  id: string;
  teamId: string;
  fromAgentId: string;
  fromAgentName: string;
  content: string;
  messageType:
    | 'text'
    | 'meeting'
    | 'dm'
    | 'knowledge'
    | 'handoff'
    | 'review-request'
    | 'task'
    | 'hologram'
    | 'mode_change'
    /**
     * Agent-to-agent negotiation event. Carries a `negotiation` payload
     * with `{ negotiationId, action, state, payload }` shaped per
     * `agent-negotiation.ts`. Used for quote / accept / execute / settle /
     * dispute multi-turn flows beyond one-shot RPC. (task_1778114573371_xsp6)
     */
    | 'negotiation';
  /**
   * When messageType === 'negotiation', this carries the per-event
   * record so the timeline and feed can render the cycle without a
   * second fetch. Reference: agent-negotiation.ts NegotiationEvent.
   */
  negotiation?: {
    negotiationId: string;
    action: string;
    state: string;
    seq: number;
    counterpartyAgentId: string;
    payload?: Record<string, unknown>;
  };
  createdAt: string;
  /** Agent IDs that have marked this team-room message read. */
  readBy?: string[];
  /** Last time any agent marked this message read. */
  readAt?: string;
  /** Agent IDs that hid this message from their active inbox. */
  archivedBy?: string[];
  /** Set when messageType is mode_change (GET /messages timeline). */
  modeChange?: {
    previousMode: string;
    newMode: string;
    source: string;
    reason?: string;
  };
}

/** Hologram publish in team activity feed. */
export interface TeamHologramFeedItem {
  id: string;
  teamId: string;
  kind: 'hologram';
  posterAgentId: string;
  posterAgentName: string;
  hash: string;
  shareUrl: string;
  createdAt: string;
}

export interface TeamModeChangeFeedItem {
  id: string;
  teamId: string;
  kind: 'mode_change';
  fromMode: string;
  toMode: string;
  source: 'api' | 'mcp_tool';
  actorAgentId: string;
  actorAgentName: string;
  createdAt: string;
}

export interface TeamIntelligenceFeedItem {
  id: string;
  teamId: string;
  kind: 'intelligence';
  posterAgentId: string;
  posterAgentName: string;
  content: string;
  scope?: 'team' | 'public';
  createdAt: string;
}

/** Team activity feed (GET /team/:id/feed) — hologram publishes, mode transitions, and intelligence reports. */
export type TeamFeedItem = TeamHologramFeedItem | TeamModeChangeFeedItem | TeamIntelligenceFeedItem;

export const TEAM_ROLE_PERMISSIONS: Record<TeamRole, string[]> = {
  owner: [
    'board:write',
    'board:read',
    'members:manage',
    'config:write',
    'messages:write',
    'messages:read',
  ],
  lead: ['board:write', 'board:read', 'members:invite', 'messages:write', 'messages:read'],
  member: ['board:read', 'board:write', 'board:claim', 'messages:write', 'messages:read'],
  guest: ['board:read', 'messages:read'],
};

export const PRESENCE_TTL_MS = 120 * 1000; // 2 minutes
export const MOBILE_PRESENCE_TTL_MS = 30 * 1000; // phones background quickly; keep them transient

// --- Agent Identity & Registry ---

export type HoloMeshBearerSurface = 'mobile' | 'desktop' | 'headless';
export type HoloMeshBearerCapability = 'read' | 'message' | 'claim' | 'sign';

/**
 * Registry row for a HoloMesh bearer token.
 *
 * **Security posture:** `key` is a disposable credential (session-style). Treat
 * compromise or leakage as "rotate or revoke," not catastrophe — durable identity
 * is `walletAddress` + `agentId`. Wallet never changes; key rotates via /admin/rotate-key.
 */
export interface KeyRecord {
  /** Bearer token — disposable; rotate/revoke freely */
  key: string;
  /** Permanent wallet address — identity anchor */
  walletAddress: string;
  /** Permanent agent ID */
  agentId: string;
  /** Display name */
  agentName: string;
  /** Scope grants: 'mcp' | 'holomesh' | 'absorb' | '*' */
  scopes: string[];
  createdAt: string;
  /** Previous key value (audit trail on rotation) */
  rotatedFrom?: string;
  /** Number of times this agent's key has been rotated */
  rotationCount: number;
  /** ISO timestamp of the most recent rotation, or null if never rotated */
  lastRotatedAt: string | null;
  /** Founder keys can provision agents, create teams, and access /admin routes */
  isFounder: boolean;
  /**
   * Surface tag snapshotted at provision time — e.g. "mobile", "claude-code".
   * Used for attribution and audit trails.
   */
  surfaceTag?: string;
  /**
   * Policy surface class. Unlike surfaceTag, this is normalized and used for
   * capability decisions: mobile bearers are assistant surfaces, not seats.
   */
  surface?: HoloMeshBearerSurface;
  /**
   * Capability grants for bearer-scoped policy. Missing means legacy
   * unrestricted key; present means routes must check the named capability.
   */
  capabilities?: HoloMeshBearerCapability[];
  /**
   * ISO timestamp after which this key is considered expired.
   * Checked by resolveRequestingAgent; expired keys reject auth.
   */
  expiresAt?: string;
}

export interface RegisteredAgent {
  id: string;
  apiKey: string;
  walletAddress?: string;
  name: string;
  traits: string[];
  reputation: number;
  profile?: Record<string, unknown>; // Replaced any
  createdAt: string;
  /** Copied from KeyRecord on provisioning — founder agents bypass all creation gates */
  isFounder?: boolean;
  /**
   * True when the agent registered via the x402 challenge-verified flow
   * (client-owned wallet, EIP-712 signature over a server-issued nonce).
   * False / undefined for legacy path where the server generated the wallet.
   * SEC-T-Zero fix 2026-04-22 installed the flow; this flag surfaces its result.
   */
  x402Verified?: boolean;
  /**
   * Surface tag snapshotted once at /register time from `body.surface_tag`.
   * Downstream heartbeats and joins use this value; they cannot override it
   * by re-declaring the field on /presence or /join. Defense-in-depth against
   * an agent claiming another surface's tag post-enrollment.
   */
  surfaceTag?: string;
  /** Policy surface class copied from the bearer record when available. */
  surface?: HoloMeshBearerSurface;
  /** Bearer capability grants copied from the key record when available. */
  capabilities?: HoloMeshBearerCapability[];
  /** Raw scope grants copied from the key record when available. */
  scopes?: string[];
  /** IDE/surface type of the agent (e.g. 'hardware', 'cloud', 'mobile'). */
  ideType?: string;
}

// --- Social Metadata ---

export interface StoredComment {
  id: string;
  entryId: string;
  parentId?: string;
  authorId: string;
  authorName: string;
  content: string;
  voteCount: number;
  createdAt: string;
}

export interface StoredVote {
  targetId: string;
  userId: string;
  value: 1 | -1;
}

export interface KnowledgeTransaction {
  id: string;
  buyerWallet: string;
  buyerName: string;
  sellerWallet: string;
  sellerName: string;
  entryId: string;
  entryDomain: string;
  priceCents: number;
  timestamp: string;
}

// --- Bounty Details ---

export interface StoredBountySubmission {
  id: string;
  bountyId: string;
  teamId?: string;
  agentId?: string; // Legacy
  agentName?: string; // Legacy
  submitterId: string;
  submitterName: string;
  proof?: string;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected' | 'paid';
  submittedAt: string;
  reviewedAt?: string;
  resolvedAt?: string;
  rewardPaid?: boolean;
  solution?: string;
  payoutResult?: Record<string, unknown>; // Replaced any
}

export interface StoredBountyMiniGame {
  id: string;
  teamId: string;
  roomId?: string; // New: Dedicated SSE room for the mini-game
  bountyId?: string; // Legacy
  bountyIds?: string[]; // Multiple bounties
  title?: string;
  description?: string;
  createdBy?: string;
  status?: string;
  type?: 'terminal_puzzle' | 'gauntlet' | 'sim_stress';
  state?: unknown;
  createdAt: string;
}

export type BountyGovernanceVoteValue = 'approve' | 'reject';

export interface StoredBountyGovernanceVote {
  agentId: string;
  agentName: string;
  /** Token-weighted vote (defaults to 1 when token balance isn't provided). */
  weight: number;
  value: BountyGovernanceVoteValue;
  createdAt: string;
}

export interface StoredBountyGovernanceProposal {
  id: string;
  bountyId: string;
  teamId: string;
  title?: string;
  description?: string;
  createdBy: string;
  status: 'open' | 'approved' | 'rejected' | 'executed';
  /** Minimum total vote weight required before resolution. */
  quorumWeight: number;
  /** Fraction [0,1] of approve weight required for approval. */
  approvalThreshold: number;
  votes: StoredBountyGovernanceVote[];
  createdAt: string;
  resolvedAt?: string;
}

// --- StoryWeaver Details ---

export interface StoryWeaverBeat {
  id: string;
  kind: 'setup' | 'conflict' | 'twist' | 'resolution';
  text: string;
  createdAt: string;
}

export interface StoryWeaverBranch {
  id: string;
  parentChapterId?: string;
  label: string;
  chapterText: string;
  premium: boolean;
  priceCents?: number;
  unlockedBy?: string[];
  beats: StoryWeaverBeat[];
  createdAt: string;
}

export interface StoryWeaverSession {
  id: string;
  title: string;
  genre?: string;
  ownerId: string;
  ownerName: string;
  synopsis?: string;
  branches: StoryWeaverBranch[];
  createdAt: string;
  updatedAt: string;
}

// --- Self-Improving Worlds ---

export interface SelfImprovingWorldPatch {
  id: string;
  traitPath: string;
  action: 'add' | 'update' | 'remove';
  reason: string;
  proposedValue?: Record<string, unknown>;
  confidence: number;
}

export interface SelfImprovingWorldSession {
  worldId: string;
  revision: number;
  lastGoal?: string;
  patches: SelfImprovingWorldPatch[];
  updatedAt: string;
}
