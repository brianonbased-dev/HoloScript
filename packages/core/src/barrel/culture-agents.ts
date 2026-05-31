// ═══════════════════════════════════════════════════════════════════
// Culture Traits (Emergent Agent Culture)
// ═══════════════════════════════════════════════════════════════════

export {
  BUILTIN_NORMS,
  BUILTIN_NORM_PROVENANCE,
  UNKNOWN_NORM_PROVENANCE,
  getBuiltinNorm,
  normsByCategory,
  criticalMassForChange,
  normalizeNormProvenance,
  serializeNormProvenance,
  deserializeNormProvenance,
} from '../traits/CultureTraits';
export type {
  CulturalNorm,
  NormCategory,
  NormEnforcement,
  NormScope,
  NormProvenance,
  NormProvenanceSource,
} from '../traits/CultureTraits';

// Lazy: @holoscript/framework is an OPTIONAL peer not pulled by a bare
// `npm install @holoscript/core`. Eager value re-exports here crashed the
// README on-ramp with ERR_MODULE_NOT_FOUND (task_1780207572551_ax8w).
// lazyPeerSymbol defers peer resolution to first use; `export type` lines are
// erased at build and stay static.
import { lazyPeerSymbol } from './lazy-peer';

const FW_AGENTS = '@holoscript/framework/agents';

export const CulturalMemory = lazyPeerSymbol(
  FW_AGENTS,
  'CulturalMemory'
) as typeof import('@holoscript/framework/agents').CulturalMemory;
export type { EpisodicMemory, StigmergicTrace, SemanticSOP } from '@holoscript/framework/agents';

export const NormEngine = lazyPeerSymbol(
  FW_AGENTS,
  'NormEngine'
) as typeof import('@holoscript/framework/agents').NormEngine;
export type { NormViolation, NormProposal } from '@holoscript/framework/agents';

// ═══════════════════════════════════════════════════════════════════
// Cross-Reality Handoff + Authenticated CRDTs
// ═══════════════════════════════════════════════════════════════════

export const negotiateHandoff = lazyPeerSymbol(
  FW_AGENTS,
  'negotiateHandoff'
) as typeof import('@holoscript/framework/agents').negotiateHandoff;
export const createMVCPayload = lazyPeerSymbol(
  FW_AGENTS,
  'createMVCPayload'
) as typeof import('@holoscript/framework/agents').createMVCPayload;
export const estimatePayloadSize = lazyPeerSymbol(
  FW_AGENTS,
  'estimatePayloadSize'
) as typeof import('@holoscript/framework/agents').estimatePayloadSize;
export const validatePayloadBudget = lazyPeerSymbol(
  FW_AGENTS,
  'validatePayloadBudget'
) as typeof import('@holoscript/framework/agents').validatePayloadBudget;
export type {
  MVCPayload,
  DecisionEntry,
  TaskState as AgentTaskState,
  UserPreferences,
  SpatialContext,
  EvidenceEntry,
  HandoffNegotiation,
} from '@holoscript/framework/agents';

export const signOperation = lazyPeerSymbol(
  FW_AGENTS,
  'signOperation'
) as typeof import('@holoscript/framework/agents').signOperation;
export const verifyOperation = lazyPeerSymbol(
  FW_AGENTS,
  'verifyOperation'
) as typeof import('@holoscript/framework/agents').verifyOperation;
export const LWWRegister = lazyPeerSymbol(
  FW_AGENTS,
  'LWWRegister'
) as typeof import('@holoscript/framework/agents').LWWRegister;
export const GCounter = lazyPeerSymbol(
  FW_AGENTS,
  'GCounter'
) as typeof import('@holoscript/framework/agents').GCounter;
export const ORSet = lazyPeerSymbol(
  FW_AGENTS,
  'ORSet'
) as typeof import('@holoscript/framework/agents').ORSet;
export const createAgentState = lazyPeerSymbol(
  FW_AGENTS,
  'createAgentState'
) as typeof import('@holoscript/framework/agents').createAgentState;
export const setRegister = lazyPeerSymbol(
  FW_AGENTS,
  'setRegister'
) as typeof import('@holoscript/framework/agents').setRegister;
export const getRegister = lazyPeerSymbol(
  FW_AGENTS,
  'getRegister'
) as typeof import('@holoscript/framework/agents').getRegister;
export const incrementCounter = lazyPeerSymbol(
  FW_AGENTS,
  'incrementCounter'
) as typeof import('@holoscript/framework/agents').incrementCounter;
export const getCounter = lazyPeerSymbol(
  FW_AGENTS,
  'getCounter'
) as typeof import('@holoscript/framework/agents').getCounter;
export const mergeStates = lazyPeerSymbol(
  FW_AGENTS,
  'mergeStates'
) as typeof import('@holoscript/framework/agents').mergeStates;
export type { DID, SignedOperation, AuthenticatedAgentState } from '@holoscript/framework/agents';
