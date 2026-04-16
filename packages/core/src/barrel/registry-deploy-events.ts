// ============================================================================
// Gap 2: Unified Trait Definition & Registry
// ============================================================================

export {
  UnifiedTraitRegistry,
  defaultTraitRegistry,
  createTraitRegistry,
  type TraitDefinition,
  type TraitCategory,
  type PropertyDef,
  type CompileHint,
  type TraitDeprecationInfo,
  type TraitSource,
  type TraitRegistrySummary,
} from '../traits/TraitDefinition';

// ============================================================================
// Gap 3: RuleForge - Trait Composition Rule Engine
// ============================================================================

export { RuleForge, defaultRuleForge, createRuleForge } from '../rules/RuleForge';

export type {
  Rule,
  RuleType,
  RuleViolation,
  TraitSuggestion,
  ValidationResult as RuleValidationResult,
  RuleSet,
} from '../rules/types';

// ============================================================================
// Deploy & Publishing Protocol (Phase 2: HoloScript-as-Protocol)
// ============================================================================

export {
  computeContentHash,
  classifyPublishMode,
  extractImports,
  generateProvenance,
} from '../deploy/provenance';
export type {
  LicenseType,
  PublishMode,
  ProvenanceBlock,
  ProvenanceImport,
} from '../deploy/provenance';

export { checkLicenseCompatibility } from '../deploy/license-checker';
export type { ImportedLicense, LicenseCheckResult } from '../deploy/license-checker';

export { PROTOCOL_CONSTANTS } from '../deploy/protocol-types';
export type {
  HexAddress,
  RevenueReason,
  RevenueFlow,
  RevenueDistribution,
  ImportChainNode,
  ProtocolRecord,
  PublishOptions,
  PublishResult,
  CollectOptions,
  CollectResult,
  RevenueCalculatorOptions,
} from '../deploy/protocol-types';

export {
  calculateRevenueDistribution,
  resolveImportChain,
  formatRevenueDistribution,
  ethToWei,
  weiToEth,
} from '../deploy/revenue-splitter';

// ============================================================================
// Pillar 2: Native Neural Streaming & Splat Transport
// ============================================================================

// Mesh components explicitly removed as part of Phase 6 consumer hardening.
// Consumers must now import from @holoscript/mesh natively.

export { GaussianSplatExtractor, type ExtractorOptions } from '@holoscript/engine/gpu';

// ModalitySelector already exported explicitly above (~line 2605)

// ============================================================================
// SNN Sparsity Monitoring (Self-Improvement)
// ============================================================================
export {
  SparsityMonitor,
  createSparsityMonitor,
  type LayerActivityInput,
} from '@holoscript/framework/training';
export type * from '@holoscript/framework/training';

// Events
export {
  EventBus,
  getSharedEventBus,
  setSharedEventBus,
  type EventCallback,
} from '../events/EventBus';
// Analysis
// Exported via legacy-exports.ts
export { WebRTCTransport } from '@holoscript/mesh';

// ── Animation, Audio, TileMap ─────────────────────────────────────────────
export {
  AnimationEngine,
  Easing,
  type AnimClip,
  type Keyframe,
} from '../animation/AnimationEngine';

export {
  AudioEngine,
  type AudioSource,
  type AudioSourceOptions,
} from '../audio/AudioEngine';

export {
  TileMap,
  TileFlags,
  type Tile,
  type AutoTileRule,
} from '../tilemap/TileMap';
