/**
 * Cross-reality trait registry (compile-time declarations).
 */

export {
  CrossRealityTraitRegistry,
  getCrossRealityTraitRegistry,
  resetCrossRealityTraitRegistry,
  createCrossRealityTraitRegistry,
  CATEGORY_DEFAULT_EMBODIMENT,
  PLATFORM_EMBODIMENT_OVERRIDES,
  HANDOFF_PATH_RULES,
  MVC_BUDGET_CONSTRAINTS,
} from '../compiler/platform/CrossRealityTraitRegistry';
export type {
  CrossRealityTraitCategory,
  CrossRealityTrait,
  CompileTimeEmbodiment,
  HandoffPathRule,
  MVCBudgetConstraint,
} from '../compiler/platform/CrossRealityTraitRegistry';
