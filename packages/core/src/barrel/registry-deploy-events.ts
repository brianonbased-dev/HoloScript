// ============================================================================
// Gap 2: Unified Trait Definition & Registry
// ============================================================================

import { lazyPeerSymbol } from './lazy-peer';

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

  // parse — convenience re-export for dynamic importers (e.g. protocol-tools)
  export { parse } from '../parser/HoloScriptPlusParser';

// ============================================================================
// Pillar 2: Native Neural Streaming & Splat Transport
// ============================================================================

// Mesh components explicitly removed as part of Phase 6 consumer hardening.
// Consumers must now import from @holoscript/mesh natively.

// Lazy: @holoscript/engine, @holoscript/framework, @holoscript/mesh value
// symbols deferred to first use so importing @holoscript/core does not eager-
// resolve optional peers (task_1780207572551_ax8w). `export type` / inline
// `type` re-exports are erased at build and stay static.
export const GaussianSplatExtractor = lazyPeerSymbol(
  '@holoscript/engine/gpu',
  'GaussianSplatExtractor'
) as typeof import('@holoscript/engine/gpu').GaussianSplatExtractor;
export type { ExtractorOptions } from '@holoscript/engine/gpu';

// ModalitySelector already exported explicitly above (~line 2605)

// ============================================================================
// SNN Sparsity Monitoring (Self-Improvement)
// ============================================================================
export const SparsityMonitor = lazyPeerSymbol(
  '@holoscript/framework/training',
  'SparsityMonitor'
) as typeof import('@holoscript/framework/training').SparsityMonitor;
export const createSparsityMonitor = lazyPeerSymbol(
  '@holoscript/framework/training',
  'createSparsityMonitor'
) as typeof import('@holoscript/framework/training').createSparsityMonitor;
export type { LayerActivityInput } from '@holoscript/framework/training';
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
export const WebRTCTransport = lazyPeerSymbol(
  '@holoscript/mesh',
  'WebRTCTransport'
) as typeof import('@holoscript/mesh').WebRTCTransport;

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
