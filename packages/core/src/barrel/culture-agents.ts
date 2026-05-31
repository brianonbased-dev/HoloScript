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

// VALUE export (CulturalMemory) moved to '@holoscript/core/runtime'
// (optional peer @holoscript/framework).
export type { EpisodicMemory, StigmergicTrace, SemanticSOP } from '@holoscript/framework/agents';

// VALUE export (NormEngine) moved to '@holoscript/core/runtime'.
export type { NormViolation, NormProposal } from '@holoscript/framework/agents';

// ═══════════════════════════════════════════════════════════════════
// Cross-Reality Handoff + Authenticated CRDTs
// ═══════════════════════════════════════════════════════════════════

// VALUE exports (negotiateHandoff, createMVCPayload, estimatePayloadSize,
// validatePayloadBudget) moved to '@holoscript/core/runtime'.
export type {
  MVCPayload,
  DecisionEntry,
  TaskState as AgentTaskState,
  UserPreferences,
  SpatialContext,
  EvidenceEntry,
  HandoffNegotiation,
} from '@holoscript/framework/agents';

// VALUE exports (signOperation, verifyOperation, LWWRegister, GCounter, ORSet,
// createAgentState, setRegister, getRegister, incrementCounter, getCounter,
// mergeStates) moved to '@holoscript/core/runtime'.
export type { DID, SignedOperation, AuthenticatedAgentState } from '@holoscript/framework/agents';
