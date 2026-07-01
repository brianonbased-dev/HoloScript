/**
 * uAA2++ Protocol Specifications
 *
 * This package defines protocol CONTRACTS — interfaces, enums, type definitions.
 * Implementations live in @holoscript/framework.
 *
 * Protocol styles:
 * - uaa2: 8-phase (INTAKE->REFLECT->EXECUTE->COMPRESS->DREAMING[REINTAKE]->GROW->EVOLVE->AUTONOMIZE)
 * - react: ReAct loop (think→act→observe)
 * - plan-exec: Plan-and-execute (plan→step→replan)
 * - debate: Multi-agent debate (propose→challenge→defend→resolve)
 * - swarm: Swarm consensus (broadcast→vote→converge)
 */

// =============================================================================
// 7-PHASE PROTOCOL SPEC
// =============================================================================

export enum ProtocolPhase {
  INTAKE = 0,
  REFLECT = 1,
  EXECUTE = 2,
  COMPRESS = 3,
  REINTAKE = 4,
  GROW = 5,
  EVOLVE = 6,
  AUTONOMIZE = 7,
}

export const PHASE_NAMES: Record<ProtocolPhase, string> = {
  [ProtocolPhase.INTAKE]: 'INTAKE',
  [ProtocolPhase.REFLECT]: 'REFLECT',
  [ProtocolPhase.EXECUTE]: 'EXECUTE',
  [ProtocolPhase.COMPRESS]: 'COMPRESS',
  [ProtocolPhase.REINTAKE]: 'REINTAKE',
  [ProtocolPhase.GROW]: 'GROW',
  [ProtocolPhase.EVOLVE]: 'EVOLVE',
  [ProtocolPhase.AUTONOMIZE]: 'AUTONOMIZE',
};

export const PHASE_DISPLAY_NAMES: Record<ProtocolPhase, string> = {
  [ProtocolPhase.INTAKE]: 'INTAKE',
  [ProtocolPhase.REFLECT]: 'REFLECT',
  [ProtocolPhase.EXECUTE]: 'EXECUTE',
  [ProtocolPhase.COMPRESS]: 'COMPRESS',
  [ProtocolPhase.REINTAKE]: 'DREAMING',
  [ProtocolPhase.GROW]: 'GROW',
  [ProtocolPhase.EVOLVE]: 'EVOLVE',
  [ProtocolPhase.AUTONOMIZE]: 'AUTONOMIZE',
};

export interface PhaseResult {
  phase: ProtocolPhase;
  status: 'success' | 'failure' | 'skipped';
  data: unknown;
  durationMs: number;
  timestamp: number;
}

export interface CycleResult {
  cycleId: string;
  task: string;
  domain: string;
  phases: PhaseResult[];
  status: 'complete' | 'partial' | 'failed';
  totalDurationMs: number;
  startedAt: number;
  completedAt: number;
}

// =============================================================================
// AGENT IDENTITY SPEC
// =============================================================================

export interface AgentIdentity {
  id: string;
  name: string;
  domain: string;
  version: string;
  capabilities: string[];
}

// =============================================================================
// SERVICE SPEC (interfaces only)
// =============================================================================

export interface ServiceMetadata {
  name: string;
  version: string;
  description: string;
  dependencies?: string[];
  lifecycle: string;
  initializedAt?: Date;
  readyAt?: Date;
}

export interface ServiceMetrics {
  requestCount: number;
  errorCount: number;
  latency: { p50: number; p95: number; p99: number };
  lastRequestAt?: Date;
  lastErrorAt?: Date;
}

export interface ServiceConfig {
  enabled: boolean;
  timeout: number;
  retries: number;
  [key: string]: unknown;
}

// =============================================================================
// PWG SPEC — Pattern / Wisdom / Gotcha Knowledge Format
// =============================================================================

export type PWGSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface Pattern {
  id: string;
  domain: string;
  problem: string;
  solution: string;
  context?: string;
  tags: string[];
  confidence: number;
  createdAt: number;
  updatedAt: number;
}

export interface Wisdom {
  id: string;
  domain: string;
  insight: string;
  context: string;
  source: string;
  tags: string[];
  createdAt: number;
}

export interface Gotcha {
  id: string;
  domain: string;
  mistake: string;
  fix: string;
  severity: PWGSeverity;
  tags: string[];
  createdAt: number;
}

export type PWGEntry = Pattern | Wisdom | Gotcha;

export function isPattern(entry: PWGEntry): entry is Pattern {
  return entry.id.startsWith('P.');
}
export function isWisdom(entry: PWGEntry): entry is Wisdom {
  return entry.id.startsWith('W.');
}
export function isGotcha(entry: PWGEntry): entry is Gotcha {
  return entry.id.startsWith('G.');
}

// =============================================================================
// GOAL SPEC
// =============================================================================

export interface Goal {
  id: string;
  description: string;
  category: string;
  priority: 'low' | 'medium' | 'high';
  estimatedComplexity: number;
  generatedAt: string;
  source: 'autonomous-boredom' | 'user-instruction' | 'system-mandate';
}

// =============================================================================
// MICRO-PHASE SPEC (interfaces only)
// =============================================================================

export interface MicroPhaseTask {
  id: string;
  name: string;
  estimatedDuration: number;
  dependencies: string[];
  execute: () => Promise<unknown>;
  priority?: number;
  timeout?: number;
  retryCount?: number;
}

export interface MicroPhaseGroup {
  id: string;
  name: string;
  tasks: MicroPhaseTask[];
  parallel: boolean;
  estimatedDuration: number;
}

export interface ExecutionPlan {
  groups: MicroPhaseGroup[];
  totalEstimatedTime: number;
  parallelizationRatio: number;
}

export interface ExecutionResult {
  taskId: string;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  duration: number;
  result?: unknown;
  error?: Error;
  timestamp: number;
}

// =============================================================================
// PROTOCOL VARIATION STUBS (specs for future protocol styles)
// =============================================================================

/** ReAct protocol: think → act → observe → repeat */
export interface ReactProtocolSpec {
  maxIterations: number;
  tools: string[];
  stopCondition: (observation: unknown) => boolean;
}

/** Plan-and-execute protocol: plan → step → replan on failure */
export interface PlanExecProtocolSpec {
  maxReplans: number;
  planPrompt: string;
  stepTimeout: number;
}

/** Multi-agent debate protocol: propose → challenge → defend → resolve */
export interface DebateProtocolSpec {
  rounds: number;
  agents: string[];
  resolutionStrategy: 'majority' | 'judge' | 'consensus';
}

/** Swarm consensus protocol: broadcast → vote → converge */
export interface SwarmProtocolSpec {
  quorum: number;
  convergenceThreshold: number;
  maxRounds: number;
}

// =============================================================================
// FRAMEWORK RE-EXPORTS REMOVED (cycle break: agent-protocol must not depend on framework)
// =============================================================================
// Per ARCHITECTURE.md, agent-protocol (L1) is below framework in the runtime/value
// import order; a value re-export from '@holoscript/framework' here created the
// cycle core -> agent-protocol -> framework -> core that broke pnpm's topo build
// order. These were already @deprecated backward-compat shims with no remaining
// in-repo consumers. Import the implementations and ServiceHealth/ServiceManagerHealth
// types directly from '@holoscript/framework' instead.

// =============================================================================
// PROTOCOL IMPLEMENTATIONS
// =============================================================================

export { ReactAgent } from './react-protocol';
export type {
  ReactLLMAdapter,
  ReactToolExecutor,
  Thought,
  Observation,
  ReactStep,
  ReactResult,
} from './react-protocol';

export { PlanExecuteAgent } from './plan-execute-protocol';
export type {
  PlanLLMAdapter,
  PlanStepExecutor,
  PlanStep,
  Plan,
  StepResult as PlanStepResult,
  PlanExecResult,
} from './plan-execute-protocol';

export { DebateOrchestrator } from './debate-protocol';
export type {
  DebateParticipant,
  DebateJudge,
  Position,
  Challenge,
  Defense,
  DebateRound,
  Resolution,
  DebateResult,
} from './debate-protocol';

export { SwarmOrchestrator } from './swarm-protocol';
export type { SwarmParticipant, Signal, Vote, SwarmRound, SwarmResult } from './swarm-protocol';

export { A2AHSNAPBridge } from './A2AHSNAPBridge';
export type { BridgeEnvelopeOptions } from './A2AHSNAPBridge';

export {
  AGENT_ATTRIBUTE_CLAIM_ATTRIBUTES,
  AGENT_ATTRIBUTE_CLAIM_INTERPRETATION_BOUNDARY,
  AGENT_ATTRIBUTE_CLAIM_NULL_ASSUMPTION,
  AGENT_ATTRIBUTE_CLAIM_SCHEMA_VERSION,
  HUMAN_LIKE_AGENT_ATTRIBUTE_CLAIMS,
  normalizeAgentAttributeClaims,
  validateAgentAttributeClaims,
} from './care-attribute-claims';
export type {
  AgentAttributeClaim,
  AgentAttributeClaimAttribute,
  AgentAttributeClaimPersistence,
  AgentAttributeClaimValidation,
  HumanLikeAgentAttributeClaim,
} from './care-attribute-claims';

export {
  CANONICAL_TASK_BRIDGE_SCHEMA,
  a2aSendMessageToCanonicalTaskEnvelope,
  canonicalTaskToA2ASendMessage,
  canonicalTaskToHSNAPSource,
  createCanonicalTaskEnvelope,
  hsnapSourceToCanonicalTaskEnvelope,
} from './task-bridge-schema';
export type { A2ASendMessageRequest, CanonicalTaskEnvelope } from './task-bridge-schema';

export {
  AGENTCORE_ADAPTER_CONTRACT_SCHEMA_VERSION,
  AGENTCORE_PRIMITIVE_MAPPINGS,
  buildAgentCoreAdapterDryRun,
  validateAgentCoreAdapterReceipt,
} from './agentcore-adapter-contract';
export type {
  AgentCoreAdapterContractSchema,
  AgentCoreAdapterReceipt,
  AgentCoreAdapterReceiptInput,
  AgentCoreAdapterReceiptValidation,
  AgentCoreEvaluationReceiptRef,
  AgentCoreGatewayExposure,
  AgentCoreIdentityBoundary,
  AgentCoreManifestFields,
  AgentCoreMemoryMapping,
  AgentCorePolicyPack,
  AgentCorePrimitiveMapping,
  AgentCorePrimitiveOwnership,
  AgentCoreRegistryMetadata,
} from './agentcore-adapter-contract';

export {
  HF_ARTIFACT_PUBLISHER_SCHEMA_VERSION,
  buildHfCompatibleArtifactPublisherDryRun,
  validateHfArtifactPublisherReceipt,
} from './hf-compatible-artifact-publisher';
export type {
  HfArtifactPublisherInput,
  HfArtifactPublisherReceipt,
  HfArtifactPublisherSchema,
  HfArtifactPublisherValidation,
  HfCardMetadata,
  HfHoloHubPublishClass,
  HfSpacesDemoManifest,
  HoloHubPublisherMetadata,
  HoloScriptArtifactDescriptor,
  HoloScriptArtifactKind,
  HoloScriptArtifactProvenance,
} from './hf-compatible-artifact-publisher';
