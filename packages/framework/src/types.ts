/**
 * HoloScript Framework Types
 *
 * Canonical home for all agent types. No circular dependencies.
 */

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

export {
  ProtocolPhase,
  isPattern,
  isWisdom,
  isGotcha,
} from './protocol/implementations';

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

export interface Suggestion {
  id: string;
  title: string;
  description?: string;
  category?: string;
  evidence?: string;
  status: SuggestionStatus;
  votes: number;
  createdBy?: string;
  createdAt: string;
}

export interface SuggestionCreateResult {
  suggestion: Suggestion;
}

export interface SuggestionVoteResult {
  suggestion: Suggestion;
}

export interface SuggestionListResult {
  suggestions: Suggestion[];
}

// ── Team Mode ──

export type TeamMode = 'audit' | 'research' | 'build' | 'review';

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
