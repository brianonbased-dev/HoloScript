// =============================================================================
// GraphQL Circuit Breaker (v3.44.0 - Frontend Reliability)
// =============================================================================

export {
  CircuitBreaker as GraphQLCircuitBreaker,
  CircuitBreakerManager as GraphQLCircuitBreakerManager,
  CircuitState as GraphQLCircuitState,
  type CircuitBreakerConfig as GraphQLCircuitBreakerConfig,
  type CircuitMetrics as GraphQLCircuitMetrics,
  type RequestResult as GraphQLRequestResult,
} from '../CircuitBreaker';

export {
  GraphQLCircuitBreakerClient,
  FallbackDataProvider,
  createApolloCircuitBreakerLink,
  createUrqlCircuitBreakerExchange,
  type GraphQLClientOptions,
  type GraphQLRequest,
  type GraphQLResponse,
  type CircuitBreakerStats as GraphQLCircuitStats,
} from '../GraphQLCircuitBreakerClient';

export {
  CircuitBreakerMetrics as GraphQLMetrics,
  MetricsMonitor as GraphQLMetricsMonitor,
  type MetricsSnapshot as GraphQLMetricsSnapshot,
  type CircuitMetricsReport as GraphQLCircuitMetricsReport,
  type AggregateMetrics as GraphQLAggregateMetrics,
  type HealthScore as GraphQLHealthScore,
  type MetricsExportOptions as GraphQLMetricsExportOptions,
} from '../CircuitBreakerMetrics';

// DegradedModeBanner requires React — do NOT export from core barrel.
// Import directly from '@holoscript/core/DegradedModeBanner' if needed in React apps.
export type { DegradedModeBannerProps } from '../DegradedModeBanner';

// ═══════════════════════════════════════════════════════════════════
// Compile-Time Safety System (Sprint CXXIV - 5-Layer Safety Stack)
// ═══════════════════════════════════════════════════════════════════

export { EffectRow } from '../types/effects';
export * from '../types/effects';
export type { VREffect } from '../types/effects';

export {
  TRAIT_EFFECTS,
  inferFromTraits,
  inferFromBuiltins,
  knownTraits,
  knownBuiltins,
} from '../compiler/safety/EffectInference';
export type { InferredEffects } from '../compiler/safety/EffectInference';

export {
  EffectChecker,
  createEffectChecker,
  isSafeTraitSet,
  dangerLevel,
} from '../compiler/safety/EffectChecker';
export type {
  EffectCheckerConfig,
  EffectCheckResult,
  ModuleEffectCheckResult,
  EffectASTNode,
} from '../compiler/safety/EffectChecker';

export {
  ResourceBudgetAnalyzer,
  PLATFORM_BUDGETS,
  TRAIT_RESOURCE_COSTS,
} from '../compiler/safety/ResourceBudgetAnalyzer';
export type {
  ResourceCategory,
  BudgetAnalysisResult,
  BudgetDiagnostic,
  ResourceUsageNode,
} from '../compiler/safety/ResourceBudgetAnalyzer';

export {
  checkCapabilities,
  expandCapabilities,
  deriveRequirements,
  TRUST_LEVEL_CAPABILITIES,
  EFFECT_TO_CAPABILITY,
  CAPABILITY_HIERARCHY,
} from '../compiler/safety/CapabilityTypes';
export type { CapabilityScope, CapabilityRequirement } from '../compiler/safety/CapabilityTypes';

export { runSafetyPass, quickSafetyCheck } from '../compiler/safety/CompilerSafetyPass';
export type { SafetyPassResult, SafetyPassConfig } from '../compiler/safety/CompilerSafetyPass';

export {
  buildSafetyReport,
  formatReport,
  generateCertificate,
} from '../compiler/safety/SafetyReport';
export type { SafetyReport, SafetyVerdict } from '../compiler/safety/SafetyReport';

// Linear Resource Types (Layer 6 — Move-inspired ownership)
export {
  LinearTypeChecker,
  BUILTIN_RESOURCES,
  TRAIT_RESOURCE_MAP,
} from '../compiler/safety/LinearTypeChecker';
export type { LinearCheckerConfig } from '../compiler/safety/LinearTypeChecker';
export type {
  ResourceType,
  ResourceAbility,
  OwnershipState,
  LinearViolation,
  LinearCheckResult,
} from '../types/linear';
