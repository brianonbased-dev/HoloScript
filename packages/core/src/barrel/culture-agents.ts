// ═══════════════════════════════════════════════════════════════════
// Culture Traits (Emergent Agent Culture)
// ═══════════════════════════════════════════════════════════════════

export {
  BUILTIN_NORMS,
  getBuiltinNorm,
  normsByCategory,
  criticalMassForChange,
} from '../traits/CultureTraits';
export type {
  CulturalNorm,
  NormCategory,
  NormEnforcement,
  NormScope,
} from '../traits/CultureTraits';

export { CulturalMemory } from '@holoscript/framework/agents';
export type { EpisodicMemory, StigmergicTrace, SemanticSOP } from '@holoscript/framework/agents';

export { NormEngine } from '@holoscript/framework/agents';
export type { NormViolation, NormProposal } from '@holoscript/framework/agents';

// ═══════════════════════════════════════════════════════════════════
// Cross-Reality Handoff + Authenticated CRDTs
// ═══════════════════════════════════════════════════════════════════

export {
  negotiateHandoff,
  createMVCPayload,
  estimatePayloadSize,
  validatePayloadBudget,
} from '@holoscript/framework/agents';
export type {
  MVCPayload,
  DecisionEntry,
  TaskState as AgentTaskState,
  UserPreferences,
  SpatialContext,
  EvidenceEntry,
  HandoffNegotiation,
} from '@holoscript/framework/agents';

export {
  signOperation,
  verifyOperation,
  LWWRegister,
  GCounter,
  ORSet,
  createAgentState,
  setRegister,
  getRegister,
  incrementCounter,
  getCounter,
  mergeStates,
} from '@holoscript/framework/agents';
export type { DID, SignedOperation, AuthenticatedAgentState } from '@holoscript/framework/agents';
