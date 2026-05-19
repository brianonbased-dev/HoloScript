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
  type QualcommNIRRuntimeTarget,
  type QualcommNIRModelExportReceipt,
  type HardwareCompilationTargetKind,
  type CrossHardwareCompilationReceipt,
  validateHardwareReceipt,
  validateReplayInput,
  validateReplayOutcome,
  validateAgentActionReceipt,
  validateQualcommNIRModelExportReceipt,
  validateCrossHardwareCompilationReceipt,
  validateValidationReceipt,
  isSupportedHardwareReceiptKind,
  isSupportedAgentActionKind,
  isSupportedReplayOutcomeStatus,
  isSupportedQualcommNIRRuntimeTarget,
  isSupportedValidationStatus,
  isSupportedHardwareCompilationTarget,
  cloneHardwareReceipt,
  cloneReplayInput,
  cloneReplayOutcome,
  cloneAgentActionReceipt,
  cloneQualcommNIRModelExportReceipt,
  cloneCrossHardwareCompilationReceipt,
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

// HoloShell Work-File Custody Receipt (task_1778868513735_mv51)
export {
  WORKFILE_KINDS,
  WORKFILE_PRIVACY_CLASSES,
  WORKFILE_ADAPTER_KINDS,
  WORKFILE_PARSE_STATUSES,
  WORKFILE_WARNING_KINDS,
  WORKFILE_WARNING_SEVERITIES,
  WORKFILE_PREVIEW_KINDS,
  WORKFILE_OUTPUT_KINDS,
  WORKFILE_CUSTODY_OUTCOMES,
  type WorkFileKind,
  type WorkFilePrivacyClass,
  type WorkFileAdapterKind,
  type WorkFileParseStatus,
  type WorkFileWarningKind,
  type WorkFileWarningSeverity,
  type WorkFilePreviewKind,
  type WorkFileOutputKind,
  type WorkFileCustodyOutcome,
  type WorkFileHashAlgorithm,
  type WorkFileWarning,
  type WorkFileSnapshot,
  type WorkFileParserEvidence,
  type WorkFilePreviewReceipt,
  type WorkFileExportReceipt,
  type WorkFileReceiptMetadataValue,
  type HoloShellWorkFileCustodyReceipt,
  isSupportedWorkFileKind,
  isSupportedWorkFileAdapterKind,
  isSupportedWorkFileCustodyOutcome,
  validateHoloShellWorkFileCustodyReceipt,
  cloneHoloShellWorkFileCustodyReceipt,
} from './board';

// HoloShell Asset Shard Receipts (task_1779092479438_6pk4)
export {
  ASSET_SHARD_KINDS,
  ASSET_SHARD_STATUSES,
  ASSET_SHARD_PERMISSION_ENVELOPES,
  ASSET_INTAKE_STATUSES,
  ASSET_INTAKE_KINDS,
  ASSET_CONVERSION_KINDS,
  ASSET_CONVERSION_STATUSES,
  PREVIEW_SOURCE_STATUSES,
  type AssetShardKind,
  type AssetShardStatus,
  type AssetShardPermissionEnvelope,
  type AssetShardFileProxy,
  type AssetShardWorkflowReceipt,
  type AssetShardImportApprovalReceipt,
  type AssetShardImportReceipt,
  type PlayableShardWitnessReceipt,
  type AssetIntakeStatus,
  type AssetIntakeKind,
  type AssetIntakeReceipt,
  type AssetConversionKind,
  type AssetConversionStatus,
  type AssetConversionReceipt,
  type PreviewSourceStatus,
  type PreviewShardSourceReceipt,
  type AssetShardRollbackContract,
  isSupportedAssetShardKind,
  isSupportedAssetShardStatus,
  isSupportedAssetIntakeKind,
  isSupportedAssetIntakeStatus,
  isSupportedAssetConversionKind,
  isSupportedAssetConversionStatus,
  isSupportedPreviewSourceStatus,
  validateAssetShardWorkflowReceipt,
  validateAssetShardImportApprovalReceipt,
  validateAssetShardImportReceipt,
  validatePlayableShardWitnessReceipt,
  validateAssetShardReceiptBundle,
  validateAssetIntakeReceipt,
  validateAssetConversionReceipt,
  validatePreviewShardSourceReceipt,
  validateAssetShardRollbackContract,
  validateAssetShardFullReceiptChain,
  cloneAssetIntakeReceipt,
  cloneAssetConversionReceipt,
  clonePreviewShardSourceReceipt,
  cloneAssetShardRollbackContract,
  cloneAssetShardWorkflowReceipt,
} from './board';

// HoloShell Account Export Receipts (task_1779135531091_h53w)
export {
  ACCOUNT_EXPORT_PROVIDERS,
  ACCOUNT_EXPORT_DELIVERY_METHODS,
  ACCOUNT_EXPORT_ARCHIVE_FORMATS,
  ACCOUNT_EXPORT_STATUSES,
  PROVIDER_EXPORT_WAIT_STATES,
  ACCOUNT_EXPORT_PERMISSION_ENVELOPES,
  ACCOUNT_EXPORT_WARNING_KINDS,
  type AccountExportProvider,
  type AccountExportDeliveryMethod,
  type AccountExportArchiveFormat,
  type AccountExportStatus,
  type ProviderExportWaitState,
  type AccountExportPermissionEnvelope,
  type AccountExportWarningKind,
  type AccountExportWarning,
  type ProviderExportProductSelection,
  type ProviderExportPlanReceipt,
  type ProviderExportRequestReceipt,
  type ProviderExportReadyReceipt,
  type AccountExportArchivePart,
  type LocalArchiveDownloadReceipt,
  type BrowserAccountBoundaryReceipt,
  type AccountExportApprovalReceipt,
  type ProviderExportWaitReceipt,
  type LocalDownloadQuarantineReceipt,
  type ProviderExportRollbackLimitReceipt,
  type AccountExportArchiveReceipt,
  type AccountExportReplayReceipt,
  type HoloShellAccountExportReceiptPack,
  isSupportedAccountExportProvider,
  isSupportedAccountExportDeliveryMethod,
  isSupportedAccountExportArchiveFormat,
  isSupportedAccountExportStatus,
  isSupportedProviderExportWaitState,
  validateBrowserAccountBoundaryReceipt,
  validateAccountExportApprovalReceipt,
  validateProviderExportWaitReceipt,
  validateLocalDownloadQuarantineReceipt,
  validateProviderExportRollbackLimitReceipt,
  validateProviderExportPlanReceipt,
  validateProviderExportRequestReceipt,
  validateProviderExportReadyReceipt,
  validateLocalArchiveDownloadReceipt,
  validateAccountExportArchiveReceipt,
  validateAccountExportReplayReceipt,
  validateHoloShellAccountExportReceiptPack,
  cloneProviderExportPlanReceipt,
  cloneHoloShellAccountExportReceiptPack,
} from './board';

// HoloShell Package Mutation Receipts (holoshell-human-os-frontier)
export {
  HOLOSHELL_PACKAGE_MUTATION_RECEIPT_VERSION,
  PACKAGE_MUTATION_KINDS,
  PACKAGE_MUTATION_STATUSES,
  PACKAGE_PERMISSION_ENVELOPES,
  PACKAGE_MANAGERS,
  PACKAGE_PREFLIGHT_STATUSES,
  type PackageMutationKind,
  type PackageMutationStatus,
  type PackagePermissionEnvelope,
  type PackageManagerKind,
  type PackagePreflightStatus,
  type PackageCandidate,
  type PackagePreflightReceipt,
  type PackageMutationApproval,
  type PackageLaunchVerification,
  type PackageMutationSourceAnchors,
  type PackageMutationSummary,
  type PackageMutationOutputRefs,
  type PackageMutationMetadata,
  type HoloShellPackageMutationReceipt,
  isSupportedPackageMutationKind,
  isSupportedPackageMutationStatus,
  isSupportedPackagePermissionEnvelope,
  isSupportedPackageManagerKind,
  validateHoloShellPackageMutationReceipt,
  clonePackageCandidate,
  cloneHoloShellPackageMutationReceipt,
} from './board';

// HoloShell Provider Export Repair Receipts (task_1779178784570_91vx)
export {
  PROVIDER_EXPORT_FAILURE_RECEIPT_VERSION,
  PARTIAL_ARCHIVE_EVIDENCE_RECEIPT_VERSION,
  PROVIDER_EXPORT_REPAIR_PLAN_RECEIPT_VERSION,
  EXPORT_REPAIR_REPLAY_RECEIPT_VERSION,
  PROVIDER_EXPORT_REPAIR_RECEIPT_PACK_VERSION,
  PROVIDER_EXPORT_FAILURE_KINDS,
  PROVIDER_EXPORT_REPAIR_ACTIONS,
  PROVIDER_EXPORT_REPAIR_STATUSES,
  type ProviderExportFailureKind,
  type ProviderExportRepairAction,
  type ProviderExportRepairStatus,
  type ProviderExportFailureReceipt,
  type PartialArchivePartEvidence,
  type PartialArchiveEvidenceReceipt,
  type ProviderExportRepairPlanReceipt,
  type ExportRepairReplayReceipt,
  type HoloShellProviderExportRepairReceiptPack,
  type BuildProviderExportRepairPlanOptions,
  isSupportedProviderExportFailureKind,
  isSupportedProviderExportRepairAction,
  isSupportedProviderExportRepairStatus,
  validateProviderExportFailureReceipt,
  validatePartialArchiveEvidenceReceipt,
  validateProviderExportRepairPlanReceipt,
  validateExportRepairReplayReceipt,
  validateHoloShellProviderExportRepairReceiptPack,
  buildProviderExportRepairPlanReceipt,
  cloneProviderExportFailureReceipt,
  clonePartialArchiveEvidenceReceipt,
  cloneProviderExportRepairPlanReceipt,
  cloneExportRepairReplayReceipt,
  cloneHoloShellProviderExportRepairReceiptPack,
} from './board';

// Device Lab Warning Tokens (task_1778739828973_47f5)
export {
  WARNING_SEVERITY,
  WARNING_ACTION_TYPE,
  type WarningSeverity,
  type WarningActionType,
  type DeviceLabWarningToken,
  type DeviceLabWarningAction,
  deriveWarningTokens,
  getWarningColorClass,
  getWarningIcon,
  formatWarningForHoloShell,
  summarizeWarningTokens,
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
  cloneModeTransitionReceipt,
  appendFollowUpCommit,
} from './board';

// Receipt Capability Registry (task_1779157196014_yx3r)
export {
  type ReceiptCapabilityEntry,
  RECEIPT_CAPABILITY_REGISTRY,
  queryReceiptCapabilities,
  getReceiptCapability,
  listReceiptCapabilities,
  listReceiptSubjects,
  receiptCapabilityCount,
} from './board';

// Capability module (Phase 1 — canonical definitions + validators + tests)
// Exported as namespace to avoid AgentCapability collision with mesh/index.ts.
// Phase 2 will unify the shapes and promote to direct export.
export * as capability from './capability';

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
