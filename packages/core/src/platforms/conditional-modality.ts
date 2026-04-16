/**
 * @platform() conditional compilation — XR targets, modality selection, platform mixins.
 */

export {
  PLATFORM_CATEGORIES as XR_PLATFORM_CATEGORIES,
  ALL_PLATFORMS as XR_ALL_PLATFORMS,
  PLATFORM_CAPABILITIES as XR_PLATFORM_CAPABILITIES,
  platformCategory,
  embodimentFor,
  agentBudgetFor,
  hasCapability,
  resolvePlatforms,
  matchesPlatform,
  selectBlock,
  DEFAULT_EMBODIMENT,
} from '../compiler/platform/PlatformConditional';
export type {
  PlatformTarget as XRPlatformTarget,
  PlatformCategory as XRPlatformCategory,
  PlatformCapabilities as XRPlatformCapabilities,
  EmbodimentType,
  PlatformCondition,
  PlatformBlock,
} from '../compiler/platform/PlatformConditional';

// Canonical (non-aliased) re-exports for engine backward compatibility (A.011)
export {
  PLATFORM_CAPABILITIES,
  PLATFORM_CATEGORIES,
  ALL_PLATFORMS,
} from '../compiler/platform/PlatformConditional';
export type { PlatformTarget, PlatformCapabilities } from '../compiler/platform/PlatformConditional';

// @platform() Compiler Mixin (Composition-level filtering)
export {
  PlatformConditionalCompilerMixin,
  matchesPlatformConstraint,
  createPlatformTarget,
} from '../compiler/PlatformConditionalCompilerMixin';
export type { CompilePlatformTarget } from '../compiler/PlatformConditionalCompilerMixin';

// @platform() Annotation Compiler (Block-level dead-code elimination)
export {
  PlatformConditionalCompiler,
  createPlatformConditionalCompiler,
} from '../compiler/platform/PlatformConditionalCompiler';
export type {
  PlatformBlock as PlatformAnnotationBlock,
  PlatformConditionalResult,
} from '../compiler/platform/PlatformConditionalCompiler';

// Modality Selector (Pillar 1: Transliteration, not degradation)
export {
  selectModality,
  selectModalityForAll,
  bestCategoryForTraits,
} from '../compiler/platform/ModalitySelector';
export type {
  ModalitySelection,
  ModalitySelectorOptions,
} from '../compiler/platform/ModalitySelector';
