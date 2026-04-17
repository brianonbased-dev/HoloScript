/**
 * HoloScript Framework Types
 *
 * Canonical home for all agent types. No circular dependencies.
 */

import { ProtocolPhase } from './protocol/implementations';
import type { PhaseResult, ProtocolCycleResult } from './protocol/implementations';

// Re-export protocol specs from canonical source (framework owns these now)
export type {
  PWGEntry,
  Pattern,
  Wisdom,
  Gotcha,
  PWGSeverity,
  AgentIdentity,
  PhaseResult,
  ProtocolCycleResult,
  Goal,
  MicroPhaseTask,
  MicroPhaseGroup,
  ExecutionPlan,
  ExecutionResult,
  ServiceMetadata,
  ServiceMetrics,
  ServiceConfig,
} from './protocol/implementations';

export { ProtocolPhase, isPattern, isWisdom, isGotcha } from './protocol/implementations';

// ── LLM Provider (framework-original — nothing like this exists) ──

export type LLMProvider = 'anthropic' | 'openai' | 'xai' | 'openrouter';

export interface ModelConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  maxTokens?: number;
  temperature?: number;
}

// ── Agent Config (aligns with TeamAgentProfile from mcp-server) ──
// We use our own shape for the public API but document the mapping.

export type AgentRole = 'architect' | 'coder' | 'researcher' | 'reviewer';
export type SlotRole = 'coder' | 'tester' | 'researcher' | 'reviewer' | 'flex';

export interface ClaimFilter {
  roles: SlotRole[];
  maxPriority: number;
}

export interface AgentConfig {
  name: string;
  role: AgentRole;
  model: ModelConfig;
  capabilities: string[];
  claimFilter: ClaimFilter;
  systemPrompt?: string;
  knowledgeDomains?: string[];
}

// ── Tasks (aligns with TeamTask from http-routes.ts) ──

export interface TaskDef {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'claimed' | 'done' | 'blocked';
  priority: number;
  role?: SlotRole;
  source?: string;
  claimedBy?: string;
  createdAt: string;
  completedAt?: string;
}

// ── Knowledge (aligns with MeshKnowledgeEntry from holomesh/types.ts) ──

export interface KnowledgeConfig {
  persist: boolean;
  path?: string;
  /** Remote knowledge store URL (MCP orchestrator) */
  remoteUrl?: string;
  remoteApiKey?: string;
}

export interface KnowledgeInsight {
  type: 'wisdom' | 'pattern' | 'gotcha';
  content: string;
  domain: string;
  confidence: number;
  source: string;
}

// ── Team ──

export type ConsensusMode = 'simple_majority' | 'unanimous' | 'owner_decides';

export interface TeamConfig {
  name: string;
  agents: AgentConfig[];
  knowledge?: KnowledgeConfig;
  consensus?: ConsensusMode;
  maxSlots?: number;
  /** Remote board API — when set, board ops delegate to HoloMesh HTTP API */
  boardUrl?: string;
  boardApiKey?: string;
  /** Local presence tracking configuration (FW-0.3). */
  presence?: PresenceConfig;
}

// ── Work Cycle ──

export interface AgentRuntime {
  name: string;
  role: AgentRole;
  config: AgentConfig;
  tasksCompleted: number;
  knowledgePublished: number;
  reputationScore: number;
  reputationTier: ReputationTier;
}

export type ReputationTier = 'newcomer' | 'contributor' | 'expert' | 'authority';

export interface CycleResult {
  teamName: string;
  cycle: number;
  agentResults: AgentCycleResult[];
  knowledgeProduced: KnowledgeInsight[];
  compoundedInsights: number;
  durationMs: number;
}

export interface AgentCycleResult {
  agentName: string;
  taskId: string | null;
  taskTitle: string | null;
  action: 'claimed' | 'completed' | 'skipped' | 'error' | 'synthesized';
  summary: string;
  knowledge: KnowledgeInsight[];
}

// ── Consensus (aligns with ConsensusTypes from core) ──

export interface ProposalResult<T = unknown> {
  proposalId: string;
  accepted: boolean;
  votesFor: number;
  votesAgainst: number;
  votesTotal: number;
  value: T;
}

// ── Suggestions (aligns with HoloMesh team suggestions API) ──

export type SuggestionStatus = 'open' | 'promoted' | 'dismissed';

export interface SuggestionVoteEntry {
  agent: string;
  vote: 'up' | 'down';
  reason?: string;
  votedAt: string;
}

export interface Suggestion {
  id: string;
  title: string;
  description?: string;
  category?: string;
  evidence?: string;
  proposedBy: string;
  status: SuggestionStatus;
  votes: SuggestionVoteEntry[];
  /** Net score (upvotes minus downvotes) */
  score: number;
  createdAt: string;
  resolvedAt?: string;
  /** When upvotes >= this threshold, auto-promote to board task */
  autoPromoteThreshold?: number;
  /** When downvotes >= this threshold, auto-dismiss */
  autoDismissThreshold?: number;
  /** If promoted, the resulting task ID */
  promotedTaskId?: string;
}

export interface SuggestionCreateResult {
  suggestion: Suggestion;
}

export interface SuggestionVoteResult {
  suggestion: Suggestion;
  /** Set when a suggestion was auto-promoted via threshold */
  promotedTaskId?: string;
}

export interface SuggestionListResult {
  suggestions: Suggestion[];
}

// ── Team Mode ──

export type TeamMode =
  | 'audit'
  | 'research'
  | 'build'
  | 'review'
  | 'security'
  | 'stabilize'
  | 'docs'
  | 'planning';

export interface SetModeResult {
  mode: TeamMode;
  previousMode?: TeamMode;
}

// ── Derive ──

export interface DeriveResult {
  tasks: TaskDef[];
}

// ── Presence / Heartbeat ──

export interface SlotInfo {
  agentName: string;
  role: SlotRole;
  status: string;
  lastSeen?: string;
  ideType?: string;
}

export interface PresenceResult {
  slots: SlotInfo[];
}

export interface HeartbeatResult {
  ok: boolean;
}

// ── Local Presence Tracking (FW-0.3) ──

export type AgentPresenceStatus = 'online' | 'idle' | 'offline';

export interface AgentPresence {
  name: string;
  status: AgentPresenceStatus;
  lastSeen: number;
  currentTask?: string;
  uptime: number; // ms since first heartbeat
}

export interface PresenceConfig {
  /** Milliseconds without heartbeat before agent is marked idle (default 60_000). */
  idleTimeoutMs?: number;
  /** Milliseconds without heartbeat before agent is marked offline (default 300_000). */
  offlineTimeoutMs?: number;
}

// ── Protocol Agent (FW-0.2) ──

export type ProtocolStyle = 'uaa2' | 'react' | 'plan-exec' | 'debate' | 'swarm';

export type AgentStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'error';

export interface PhaseHook {
  before?: (phase: ProtocolPhase, input: unknown) => Promise<unknown> | unknown;
  after?: (phase: ProtocolPhase, result: PhaseResult) => Promise<PhaseResult> | PhaseResult;
}

export interface ProtocolAgentConfig extends AgentConfig {
  /** Protocol style — defaults to 'uaa2' (7-phase cycle). */
  protocolStyle?: ProtocolStyle;
  /** Phase hooks — called before/after each phase. */
  phaseHooks?: PhaseHook;
  /** Additional LLM overrides for lightweight phases. */
  lightModel?: Partial<ModelConfig>;
  /** Team knowledge context injected into phases. */
  teamKnowledge?: string;
  /** Maximum phase retries on failure. */
  maxPhaseRetries?: number;
}

export interface ProtocolAgentHandle {
  /** Agent name. */
  readonly name: string;
  /** Agent role. */
  readonly role: AgentRole;
  /** Current status. */
  readonly status: AgentStatus;
  /** Phase execution history. */
  readonly history: PhaseResult[];
  /** Execute a task through the full protocol cycle. */
  execute(task: { title: string; description: string }): Promise<ProtocolCycleResult>;
  /** Pause execution after the current phase completes. */
  pause(): void;
  /** Resume a paused agent. */
  resume(): void;
  /** Cancel execution. The current phase will finish but no further phases run. */
  cancel(): void;
  /** Reset status to idle and clear history. */
  reset(): void;
}
