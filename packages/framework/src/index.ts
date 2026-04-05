/**
 * @holoscript/framework
 *
 * The framework where agents remember, learn, and earn.
 *
 * @packageDocumentation
 */

// Core builders
export { defineAgent } from './define-agent';
export { defineTeam } from './define-team';

// Core classes
export { Team } from './team';
export { KnowledgeStore } from './knowledge/knowledge-store';
export type { StoredEntry } from './knowledge/knowledge-store';

// Knowledge brain (absorbed from mcp-server/holomesh — neuroscience consolidation model)
export {
  KNOWLEDGE_DOMAINS,
  type KnowledgeDomain,
  type DomainConsolidationConfig,
  DOMAIN_CONSOLIDATION,
  DOMAIN_HALF_LIVES,
  type HotBufferEntry,
  type ExcitabilityMetadata,
  computeExcitability,
  applyHalfLifeDecay,
  type ConsolidationResult,
  type ReconsolidationEvent,
  RECONSOLIDATION_WINDOW_MS,
  triggerReconsolidation,
} from './knowledge/brain';

// Consolidation engine (absorbed from mcp-server/holomesh/crdt-sync — pure state machine)
export { ConsolidationEngine } from './knowledge/consolidation';
export type { ColdStoreEntry } from './knowledge/consolidation';

// LLM adapter
export { callLLM } from './llm/llm-adapter';
export type { LLMMessage, LLMResponse } from './llm/llm-adapter';

// Behavior tree (also available via '@holoscript/framework/bt')
export {
  BehaviorTree,
  ActionNode,
  ConditionNode,
  SequenceNode,
  SelectorNode,
  InverterNode,
  RepeaterNode,
  WaitNode,
  Sequence,
  Selector,
  Action,
  Condition,
  Inverter,
  Repeater,
} from './behavior';

export type { BTNode, BTContext, NodeStatus } from './behavior';

// Types
export type {
  AgentConfig,
  AgentRole,
  AgentRuntime,
  ClaimFilter,
  SlotRole,
  ModelConfig,
  LLMProvider,
  TeamConfig,
  ConsensusMode,
  TaskDef,
  KnowledgeConfig,
  KnowledgeInsight,
  CycleResult,
  AgentCycleResult,
  ReputationTier,
  ProposalResult,
  Suggestion,
  SuggestionStatus,
  SuggestionCreateResult,
  SuggestionVoteResult,
  SuggestionListResult,
  TeamMode,
  SetModeResult,
  DeriveResult,
  SlotInfo,
  PresenceResult,
  HeartbeatResult,
} from './types';

// Re-export protocol types
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
} from './types';

export {
  ProtocolPhase,
  isPattern,
  isWisdom,
  isGotcha,
} from './types';

// Protocol agent (7-phase lifecycle backed by LLM)
export { ProtocolAgent, runProtocolCycle } from './protocol-agent';
export type { ProtocolTaskResult } from './protocol-agent';

// Protocol implementations (canonical home — absorbed from agent-protocol)
export {
  BaseAgent,
  GoalSynthesizer,
  MicroPhaseDecomposer,
  BaseService,
  ServiceLifecycle,
  ServiceErrorCode,
  ServiceError,
} from './protocol/implementations';

// Board module (absorbed from mcp-server/holomesh — canonical home)
export {
  type TaskStatus,
  type TeamTask,
  type DoneLogEntry,
  type SuggestionCategory,
  type SuggestionVote,
  type TeamSuggestion,
  type RoomPreset,
  type AIProvider,
  type TeamAgentProfile,
  ROOM_PRESETS,
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
  normalizeTitle,
  generateTaskId,
  generateSuggestionId,
  inferFixPriority,
  parseDeriveContent,
  type AuditResult,
  isLikelyReportEntry,
  isCommitProof,
  auditDoneLog,
  type TaskActionResult,
  type SuggestionActionResult,
  claimTask,
  completeTask,
  blockTask,
  reopenTask,
  addTasksToBoard,
  createSuggestion,
  voteSuggestion,
  promoteSuggestion,
  dismissSuggestion,
} from './board';

// Mesh module (absorbed from agent-sdk — peer discovery, gossip, A2A)
export {
  type PeerMetadata,
  MeshDiscovery,
  type SignalType,
  type MeshSignal,
  SignalService,
  type GossipPacket,
  GossipProtocol,
  type MCPToolSchema,
  MCP_TOOL_SCHEMAS,
  type AgentCard,
  type AgentCapability,
  type AgentSkill,
  type AgentAuthentication,
  createAgentCard,
  validateAgentCard,
} from './mesh';

// Economy module (absorbed from core/economy — x402, budgets, subscriptions, revenue)
export {
  PaymentGateway,
  X402Facilitator,
  MicroPaymentLedger,
  CreatorRevenueAggregator,
  PaymentWebhookService,
  X402_VERSION,
  USDC_CONTRACTS,
  MICRO_PAYMENT_THRESHOLD,
  CHAIN_IDS,
  CHAIN_ID_TO_NETWORK,
} from './economy';

// Self-improvement module (v1.0 — the framework evolves itself)
export {
  type AbsorbScanConfig,
  type ScanResult,
  type ImprovementTask,
  type ExtractedKnowledge,
  scanFramework,
  scanTodos,
  type EvolutionConfig,
  type EvolutionResult,
  evolve,
} from './self-improve';

// Agent orchestration available via '@holoscript/framework/agents'
// Not re-exported from barrel to avoid circular dependency with @holoscript/core

export * from './swarm';

// AI module (A.011.02c)
export * from './ai';

// Training module (A.011.02d)
export * from './training';

// Learning module (A.011.02d)
export * from './learning';
