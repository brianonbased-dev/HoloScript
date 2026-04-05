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
export type { StoredEntry, EmbedResult, SemanticSearchOptions } from './knowledge/knowledge-store';

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
export type { ColdStoreEntry, CrossDomainMatch } from './knowledge/consolidation';

// Knowledge consolidator (FW-0.5 — tiered sleep/wake, cross-domain, contradictions, provenance)
export { KnowledgeConsolidator } from './knowledge/knowledge-consolidator';
export type {
  KnowledgeTier,
  TieredEntry,
  ProvenanceNode,
  CrossDomainPattern,
  Contradiction,
  ConsolidationStats,
  ConsolidatorConfig,
} from './knowledge/knowledge-consolidator';

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
} from './behavior';

export type { BTNode, BTContext, NodeStatus } from './behavior';

// Skills module (also available via '@holoscript/framework/skills')
export * from './skills';

// Negotiation module (also available via '@holoscript/framework/negotiation')
export * from './negotiation';

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
  SuggestionVoteEntry,
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
  AgentPresence,
  AgentPresenceStatus,
  PresenceConfig,
  ProtocolStyle,
  AgentStatus,
  PhaseHook,
  ProtocolAgentConfig,
  ProtocolAgentHandle,
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
export {
  ProtocolAgent,
  runProtocolCycle,
  defineProtocolAgent,
  protocolToFrameworkCycleResult,
  frameworkToProtocolCycleResult,
} from './protocol-agent';
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

// Goal synthesizer types (FW-0.2 — autonomous goal creation)
export type { GoalContext, SynthesizedGoal } from './protocol/goal-synthesizer';
export { GENERIC_GOALS, DOMAIN_GOALS } from './protocol/goal-synthesizer';

// Smart micro-phase decomposer (FW-0.2 — LLM-powered parallel task decomposition)
export {
  SmartMicroPhaseDecomposer,
  createLLMAdapter,
} from './protocol/micro-phase-decomposer';
export type {
  TaskDescription,
  MicroPhase,
  WaveExecutionPlan,
  DecompositionResult,
  LLMAdapter,
} from './protocol/micro-phase-decomposer';

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
  type AuditViolation,
  type AgentStats,
  type SourceStats,
  type CompletionBucket,
  type DoneLogStats,
  type FullAuditResult,
  isLikelyReportEntry,
  isCommitProof,
  auditDoneLog,
  DoneLogAuditor,
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
  // Bounty system (FW-0.6)
  BountyManager,
  // Knowledge marketplace (FW-0.6)
  KnowledgeMarketplace,
  // Revenue splitter + wallet stub (FW-0.6)
  RevenueSplitter,
  InvisibleWalletStub,
} from './economy';

// Distributed claiming (FW-0.6)
export { DistributedClaimer } from './distributed-claimer';
export type { ClaimResult as DistributedClaimResult, ClaimRecord, DistributedClaimerConfig } from './distributed-claimer';

// Skill-based routing (FW-0.6)
export { SkillRouter } from './skill-router';
export type { RoutingResult, ScoredCandidate, RoutingPolicy } from './skill-router';

// Cross-team delegation (FW-0.6)
export { DelegationManager, InProcessBoardAdapter } from './delegation';
export type { DelegationResult, DelegationRecord, DelegationPolicy, TeamBoardAdapter } from './delegation';

// Bounty types (FW-0.6)
export type {
  Bounty,
  BountyReward,
  BountyCurrency,
  BountyStatus,
  ClaimResult,
  CompletionProof,
  PayoutResult,
  BountyManagerConfig,
} from './economy';

// Knowledge marketplace types (FW-0.6)
export type {
  KnowledgeListing,
  ListingStatus,
  PurchaseResult,
  ListingResult,
  PricingFactors,
} from './economy';

// Self-improvement module (FW-1.0 — the framework evolves itself)
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
  FrameworkAbsorber,
  type AbsorberConfig,
  type CodebaseGraph,
  type Improvement,
  TestGenerator,
  type TestGeneratorConfig,
  type GeneratedTest,
  PromptOptimizer,
  type ABTestConfig,
  type ABTestResult,
  type PromptVariantResult,
  type EvaluationCriteria,
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

// Resolve ambiguous exports between swarm and negotiation
export type { Vote, VotingResult } from './negotiation';
