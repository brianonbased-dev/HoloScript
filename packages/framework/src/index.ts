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
  type MemoryRetentionState,
  type MemoryHashAlgorithm,
  type DomainConsolidationConfig,
  DOMAIN_CONSOLIDATION,
  DOMAIN_HALF_LIVES,
  type HotBufferEntry,
  type MemorySourceHash,
  type MemoryModelIdentity,
  type MemoryToolIdentity,
  type MemoryReceipt,
  type ExcitabilityMetadata,
  computeExcitability,
  applyHalfLifeDecay,
  type ConsolidationResult,
  type ReconsolidationEvent,
  RECONSOLIDATION_WINDOW_MS,
  triggerReconsolidation,
  hashString,
} from './knowledge/brain';

// Consolidation engine (absorbed from mcp-server/holomesh/crdt-sync — pure state machine)
export { ConsolidationEngine, validateMemoryReceipt } from './knowledge/consolidation';
export type {
  ColdStoreEntry,
  QuarantinedMemoryEntry,
  RetainedMemoryEvidence,
  CrossDomainMatch,
} from './knowledge/consolidation';

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

export { ProtocolPhase, isPattern, isWisdom, isGotcha } from './types';

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
  ServiceManager,
} from './protocol/implementations';

export type { ServiceHealth, ServiceManagerHealth } from './protocol/implementations';

// Goal synthesizer types (FW-0.2 — autonomous goal creation)
export type { GoalContext, SynthesizedGoal } from './protocol/goal-synthesizer';
export { GENERIC_GOALS, DOMAIN_GOALS } from './protocol/goal-synthesizer';

// Smart micro-phase decomposer (FW-0.2 — LLM-powered parallel task decomposition)
export { SmartMicroPhaseDecomposer, createLLMAdapter } from './protocol/micro-phase-decomposer';
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
  ARTIFACT_RECEIPT_TYPES,
  type ArtifactReceiptType,
  type ArtifactHashAlgorithm,
  type ArtifactVerificationStatus,
  type ArtifactVerificationCommand,
  type ArtifactOutputReceipt,
  type ArtifactProvenanceLink,
  type ArtifactReceipt,
  TASK_ENVIRONMENT_PROFILE_KINDS,
  TASK_ENVIRONMENT_NETWORK_ACCESS,
  TASK_ENVIRONMENT_PACKAGE_MANAGERS,
  TASK_ORCHESTRATION_EVENT_TYPES,
  TASK_ORCHESTRATION_AGENT_SURFACES,
  type TaskEnvironmentProfileKind,
  type TaskEnvironmentNetworkAccess,
  type TaskEnvironmentPackageManager,
  type TaskEnvironmentGpuBackend,
  type TaskEnvironmentStep,
  type TaskEnvironmentNetworkPolicy,
  type TaskEnvironmentGpuRequirement,
  type TaskEnvironmentWasmRequirement,
  type TaskEnvironmentProfile,
  type TaskEnvironmentFingerprint,
  type CodexHardwareAuditReceipt,
  type TaskEnvironmentReceipt,
  TASK_POLICY_ACTION_KINDS,
  TASK_POLICY_DECISIONS,
  type TaskPolicyActionKind,
  type TaskPolicyDecisionType,
  type TaskPolicyEnforcementMode,
  type TaskFilesystemAccessMode,
  type TaskEscalationTrigger,
  type TaskEscalationTarget,
  type TaskFilesystemPolicy,
  type TaskSecretPolicy,
  type TaskSpendCap,
  type TaskEscalationRule,
  type TaskPolicyProfile,
  type TaskPolicyAction,
  type TaskPolicyEvent,
  type TaskPolicyEvaluationContext,
  type TaskPolicyDecision,
  type TaskOrchestrationEventType,
  type TaskOrchestrationAgentSurface,
  type TaskDecompositionStrategy,
  type TaskSubagentStatus,
  type TaskOrchestrationAgentRef,
  type TaskDecompositionChild,
  type TaskDecompositionWave,
  type TaskDecompositionPlan,
  type SubagentEvent,
  type TaskCoordinationTimeline,
  type SuggestionCategory,
  type SuggestionVote,
  type TeamSuggestion,
  type RoomPreset,
  type AIProvider,
  type TeamAgentProfile,
  ROOM_PRESETS,
  TEAM_MODES,
  type TeamModeId,
  PRIMARY_ASSISTANT_AGENT,
  BRITTNEY_AGENT,
  DAEMON_AGENT,
  ABSORB_AGENT,
  ORACLE_AGENT,
  TEAM_AGENT_PROFILES,
  getAllProfiles,
  getProfileById,
  getProfilesByClaimRole,
  getProfilesByDomain,
  isSupportedArtifactReceiptType,
  validateArtifactReceipt,
  cloneArtifactReceipt,
  isSupportedTaskEnvironmentProfileKind,
  validateTaskEnvironmentProfile,
  validateTaskEnvironmentReceipt,
  cloneTaskEnvironmentProfile,
  cloneTaskEnvironmentReceipt,
  validateTaskPolicyProfile,
  cloneTaskPolicyProfile,
  cloneTaskPolicyEvent,
  evaluateTaskPolicyAction,
  isSupportedTaskOrchestrationEventType,
  isSupportedTaskOrchestrationAgentSurface,
  validateTaskDecompositionPlan,
  validateSubagentEvent,
  cloneTaskOrchestrationAgentRef,
  cloneTaskDecompositionPlan,
  cloneSubagentEvent,
  replayTaskCoordination,
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
  type SkippedTaskReason,
  type SkippedTaskEntry,
  hasDefinitionOfDone,
  normalizeTaskDescription,
  claimTask,
  completeTask,
  blockTask,
  reopenTask,
  attachTaskArtifacts,
  attachTaskEnvironmentReceipt,
  recordTaskPolicyEvent,
  attachTaskDecomposition,
  recordSubagentEvent,
  addTasksToBoard,
  createSuggestion,
  voteSuggestion,
  promoteSuggestion,
  dismissSuggestion,
  delegateTask,
  deleteTask,
} from './board';

// HoloLand receipt model (task_1778186605462_4z0o)
export {
  HARDWARE_RECEIPT_KINDS,
  AGENT_ACTION_KINDS,
  type HardwareReceiptKind,
  type HardwareReceipt,
  type ReplayInput,
  type ReplayOutcome,
  type AgentActionKind,
  type AgentActionReceipt,
  type ValidationReceipt,
  validateHardwareReceipt,
  validateReplayInput,
  validateReplayOutcome,
  validateAgentActionReceipt,
  validateValidationReceipt,
  isSupportedHardwareReceiptKind,
  isSupportedAgentActionKind,
  isSupportedReplayOutcomeStatus,
  isSupportedValidationStatus,
  cloneHardwareReceipt,
  cloneReplayInput,
  cloneReplayOutcome,
  cloneAgentActionReceipt,
  cloneValidationReceipt,
} from './board';

// HoloWeb Network Reality Schema Pack (HWEB-B3)
export {
  HOLOWEB_NETWORK_REALITY_SCHEMA_VERSION,
  HOLOWEB_NODE_ROLES,
  HOLOWEB_PRIVACY_SCOPES,
  HOLOWEB_RESOURCE_KINDS,
  HOLOWEB_LOCATION_PROOF_SCOPES,
  HOLOWEB_LOCATION_PROOF_METHODS,
  HOLOWEB_LOCATION_PRECISIONS,
  HOLOWEB_UNDERLAY_CLASSIFICATIONS,
  HOLOWEB_CONFIDENCE_LEVELS,
  HOLOWEB_OWNER_DECLARED_KINDS,
  HOLOWEB_OWNER_DECLARED_SOURCES,
  HOLOWEB_INTERFACE_KINDS,
  HOLOWEB_VPN_STATES,
  HOLOWEB_HEALTH_STATES,
  HOLOWEB_PROCESS_KINDS,
  HOLOWEB_BANDWIDTH_POSTURES,
  HOLOWEB_HEAVY_WORK_POLICIES,
  HOLOWEB_AGENT_ACTIONS,
  HOLOWEB_BRITTNEY_STANCES,
  HOLOWEB_RECEIPT_TYPES,
  HOLOWEB_RECEIPT_ACTIONS,
  type HoloWebNetworkRealitySchemaVersion,
  type HoloWebJsonValue,
  type HoloWebNodeRole,
  type HoloWebPrivacyScope,
  type HoloWebResourceKind,
  type HoloWebLocationProofScope,
  type HoloWebLocationProofMethod,
  type HoloWebLocationPrecision,
  type HoloWebUnderlayClassification,
  type HoloWebConfidenceLevel,
  type HoloWebOwnerDeclaredKind,
  type HoloWebOwnerDeclaredSource,
  type HoloWebInterfaceKind,
  type HoloWebVpnState,
  type HoloWebHealthState,
  type HoloWebProcessKind,
  type HoloWebBandwidthPosture,
  type HoloWebHeavyWorkPolicy,
  type HoloWebAgentAction,
  type HoloWebBrittneyStance,
  type HoloWebReceiptType,
  type HoloWebReceiptAction,
  type HoloWebSourceAnchors,
  type HoloWebLocationProof,
  type HoloWebNode,
  type HoloWebWifiEvidence,
  type HoloWebCostEvidence,
  type HoloWebAdapterEvidence,
  type HoloWebUnderlay,
  type HoloWebHealth,
  type HoloWebNetworkConsumer,
  type HoloWebAgentLane,
  type HoloWebPolicy,
  type HoloWebBrittneyPolicy,
  type HoloWebRedactionPolicy,
  type HoloWebReceipt,
  type HoloWebNetworkRealitySnapshot,
  isSupportedHoloWebNodeRole,
  isSupportedHoloWebUnderlayClassification,
  isSupportedHoloWebPrivacyScope,
  isSupportedHoloWebLocationPrecision,
  isSupportedHoloWebReceiptType,
  validateHoloWebLocationProof,
  validateHoloWebNetworkRealitySnapshot,
  cloneHoloWebNetworkRealitySnapshot,
} from './board';

// HoloShell Legacy App Reality Schema Pack
export {
  HOLOSHELL_LEGACY_APP_REALITY_SCHEMA_VERSION,
  HOLOSHELL_LEGACY_PROCESS_ROLES,
  HOLOSHELL_LEGACY_NETWORK_POSTURES,
  HOLOSHELL_LEGACY_CUSTODY_STATUSES,
  HOLOSHELL_LEGACY_LANE_COLORS,
  HOLOSHELL_LEGACY_RECEIPT_ACTIONS,
  type HoloShellLegacyAppRealitySchemaVersion,
  type HoloShellLegacyJsonValue,
  type HoloShellLegacyProcessRole,
  type HoloShellLegacyNetworkPosture,
  type HoloShellLegacyCustodyStatus,
  type HoloShellLegacyLaneColor,
  type HoloShellLegacyReceiptAction,
  type HoloShellLegacySourceAnchors,
  type HoloShellLegacySummary,
  type HoloShellLegacyLane,
  type HoloShellLegacyProcess,
  type HoloShellLegacyWindow,
  type HoloShellLegacyNetworkConsumer,
  type HoloShellLegacyRedactionPolicy,
  type HoloShellLegacyReceipt,
  type HoloShellLegacyAppRealitySnapshot,
  isSupportedHoloShellLegacyProcessRole,
  isSupportedHoloShellLegacyLaneColor,
  validateHoloShellLegacyAppRealitySnapshot,
  cloneHoloShellLegacyAppRealitySnapshot,
} from './board';

// Frontier Shard 0 primitives (task_1778186605462_2mlp)
export {
  SKILL_RARITIES,
  ITEM_CATEGORIES,
  ENCOUNTER_TRIGGER_KINDS,
  ZONE_BIOMES,
  type SkillRarity,
  type Skill,
  type ItemCategory,
  type Item,
  type LootTableEntry,
  type LootTable,
  type EncounterTriggerKind,
  type Encounter,
  type QuestStep,
  type Quest,
  type ZoneBiome,
  type Zone,
  type Shard,
  type ShardReceipt,
  isSupportedSkillRarity,
  isSupportedItemCategory,
  isSupportedEncounterTrigger,
  isSupportedZoneBiome,
  isSupportedShardReceiptStatus,
  validateSkill,
  validateItem,
  validateLootTableEntry,
  validateLootTable,
  validateEncounter,
  validateQuestStep,
  validateQuest,
  validateZone,
  validateShard,
  validateShardReceipt,
  cloneSkill,
  cloneItem,
  cloneLootTableEntry,
  cloneLootTable,
  cloneEncounter,
  cloneQuestStep,
  cloneQuest,
  cloneZone,
  cloneShard,
  cloneShardReceipt,
} from './board';

// Creator Playable-Template Pipeline (task_1778186605462_muzd)
export {
  TEMPLATE_PARAMETER_KINDS,
  DEFAULT_PLAYABILITY_REQUIREMENTS,
  type TemplateParameterKind,
  type TemplateParameter,
  type PlayabilityRequirements,
  type CreatorTemplate,
  type PlayableChallenge,
  type PublishReview,
  isSupportedTemplateParameterKind,
  validateTemplateParameter,
  validatePlayabilityRequirements,
  validateCreatorTemplate,
  validatePlayableChallenge,
  validatePublishReview,
  checkPlayability,
  cloneTemplateParameter,
  clonePlayabilityRequirements,
  cloneCreatorTemplate,
  clonePlayableChallenge,
  clonePublishReview,
} from './board';

export {
  BOARD_WEBHOOK_EVENT_TYPES,
  BOARD_WEBHOOK_ORDERING_GUARANTEE,
  BOARD_WEBHOOK_FETCH_BY_ID_BEHAVIOR,
  type BoardWebhookEventType,
  type BoardWebhookDeliveryStatus,
  type BoardWebhookOrderingScope,
  type BoardWebhookRetryPolicy,
  type BoardWebhookSigningConfig,
  type BoardWebhookSubscription,
  type BoardWebhookFetchById,
  type BoardWebhookEnvelope,
  type CreateBoardWebhookEnvelopeOptions,
  type BoardWebhookRequest,
  type BoardWebhookDelivery,
  validateBoardWebhookSubscription,
  createBoardWebhookEnvelope,
  canonicalBoardWebhookBody,
  shouldDeliverBoardWebhook,
  signBoardWebhookEnvelope,
  verifyBoardWebhookSignature,
  buildBoardWebhookRequest,
  nextBoardWebhookRetry,
  recordBoardWebhookDeliveryFailure,
} from './board';

// Twin Earth Substrate Contract (task_1778618552503_3zqx + task_1778618552503_aw8w)
export {
  type ParticipationMode,
  type TwinEarthRole,
  type TwinEarthKind,
  type TwinEarthIdentity,
  type TwinEarthAction,
  type PermissionGrant,
  type SafetyEnvelope,
  type TwinEarthReceiptKind,
  type TwinEarthReceiptStatus,
  type TwinEarthReceipt,
  type ParticipationModeConfig,
  type ModeTransitionReceipt,
  type TwinEarthSubstrateStatus,
  type ActuationResult,
  validateTwinEarthIdentity,
  validatePermissionGrant,
  validateSafetyEnvelope,
  validateTwinEarthReceipt,
  validateModeTransitionReceipt,
  evaluateActuation,
  isSupportedTwinEarthRole,
  isSupportedParticipationMode,
  isSupportedTwinEarthKind,
  isSupportedTwinEarthReceiptKind,
  isSupportedTwinEarthReceiptStatus,
  cloneTwinEarthIdentity,
  clonePermissionGrant,
  cloneSafetyEnvelope,
  cloneTwinEarthReceipt,
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
export type {
  ClaimResult as DistributedClaimResult,
  ClaimRecord,
  DistributedClaimerConfig,
} from './distributed-claimer';

// Skill-based routing (FW-0.6)
export { SkillRouter } from './skill-router';
export type { RoutingResult, ScoredCandidate, RoutingPolicy } from './skill-router';

// Cross-team delegation (FW-0.6)
export { DelegationManager, InProcessBoardAdapter } from './delegation';
export type {
  DelegationResult,
  DelegationRecord,
  DelegationPolicy,
  TeamBoardAdapter,
} from './delegation';

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
  scanImprovementMarkers,
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
export { OrchestratorAgent, type OrchestratorConfig } from './agents/OrchestratorAgent';

export * from './swarm';

// AI module (A.011.02c)
export * from './ai';

// Training module (A.011.02d)
export * from './training';

// Learning module (A.011.02d)
export * from './learning';

// Resolve ambiguous exports between swarm and negotiation
export type { Vote, VotingResult } from './negotiation';

export * from './training/index.js';
export * from './learning/index.js';
