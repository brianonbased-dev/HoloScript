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

// Concrete classes and enumerations from agent-protocol
export {
  BaseAgent,
  GoalSynthesizer,
  MicroPhaseDecomposer,
  BaseService,
  ServiceLifecycle,
  ServiceErrorCode,
  ServiceError,
} from '@holoscript/agent-protocol';

// Agent orchestration (migrated from @holoscript/core — A.011.02a)
export * from './agents';
