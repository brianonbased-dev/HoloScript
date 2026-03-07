/**
 * CrossRealityTraitRegistry
 *
 * Registers cross-reality traits for the HoloScript compilation pipeline.
 * These traits annotate HoloScript compositions with cross-reality metadata
 * that the compiler uses for:
 *
 * 1. Dead code elimination — remove blocks for unsupported platforms
 * 2. Handoff path validation — ensure valid source→target transitions
 * 3. Embodiment mapping — map traits to platform-specific embodiments
 * 4. Capability negotiation — declare required device capabilities
 * 5. Norm enforcement — compile-time safety checks for automotive/wearable
 *
 * TRAIT CATEGORIES:
 * - @crossreality.handoff   — handoff behavior annotations
 * - @crossreality.embodiment — embodiment type declarations
 * - @crossreality.anchor     — spatial anchor requirements
 * - @crossreality.norm       — safety/accessibility/context norms
 * - @crossreality.budget     — MVC payload budget constraints
 *
 * @module @holoscript/core/compiler/platform/CrossRealityTraitRegistry
 */

import type { PlatformTarget, PlatformCategory } from './PlatformConditional';
import { PLATFORM_CATEGORIES, ALL_PLATFORMS, platformCategory } from './PlatformConditional';

// ============================================================================
// TRAIT TYPES
// ============================================================================

export type CrossRealityTraitCategory =
  | 'handoff'
  | 'embodiment'
  | 'anchor'
  | 'norm'
  | 'budget';

export interface CrossRealityTrait {
  /** Trait identifier (e.g., 'crossreality.handoff.seamless') */
  id: string;
  /** Category for grouping */
  category: CrossRealityTraitCategory;
  /** Human-readable description */
  description: string;
  /** Platforms this trait applies to (empty = all) */
  applicablePlatforms: PlatformTarget[];
  /** Platform categories this trait applies to (empty = all) */
  applicableCategories: PlatformCategory[];
  /** Whether this trait is required (vs optional) */
  required: boolean;
  /** Default value if not explicitly set */
  defaultValue: unknown;
  /** Validation function */
  validate: (value: unknown) => { valid: boolean; error?: string };
}

// ============================================================================
// EMBODIMENT TYPES (Compile-Time)
// ============================================================================

export type CompileTimeEmbodiment =
  | 'FullAvatar'      // VR: full-body avatar
  | 'FloatingAgent'   // AR: floating assistant
  | 'UI2D'            // Phone/Desktop: 2D interface
  | 'VoiceHUD'        // Car: voice + minimal HUD
  | 'Haptic'          // Watch: haptic-only
  | 'GlassOverlay';   // Glasses: AR overlay

/** Maps form factor categories to their default embodiments */
export const CATEGORY_DEFAULT_EMBODIMENT: Record<PlatformCategory, CompileTimeEmbodiment> = {
  vr: 'FullAvatar',
  mobile: 'UI2D',
  desktop: 'UI2D',
  automotive: 'VoiceHUD',
  wearable: 'Haptic',
};

/** Maps specific platforms to embodiment overrides */
export const PLATFORM_EMBODIMENT_OVERRIDES: Partial<Record<PlatformTarget, CompileTimeEmbodiment>> = {
  visionos: 'FloatingAgent',  // visionOS uses floating agent, not full avatar
  glass: 'GlassOverlay',      // Glasses use AR overlay, not haptic
};

// ============================================================================
// HANDOFF PATH RULES (Compile-Time)
// ============================================================================

export interface HandoffPathRule {
  /** Source platform category */
  from: PlatformCategory;
  /** Target platform category */
  to: PlatformCategory;
  /** Whether this handoff path is allowed */
  allowed: boolean;
  /** If not allowed, the reason */
  reason?: string;
  /** Required intermediate step (if direct handoff not allowed) */
  requiredIntermediate?: PlatformCategory;
  /** Estimated latency budget in ms */
  latencyBudgetMs: number;
}

/** Compile-time handoff path rules */
export const HANDOFF_PATH_RULES: HandoffPathRule[] = [
  // VR handoffs
  { from: 'vr', to: 'mobile', allowed: true, latencyBudgetMs: 500 },
  { from: 'vr', to: 'desktop', allowed: true, latencyBudgetMs: 300 },
  { from: 'vr', to: 'wearable', allowed: true, latencyBudgetMs: 800 },
  { from: 'vr', to: 'automotive', allowed: false, reason: 'SAFETY-003: VR↔car requires intermediate step', requiredIntermediate: 'mobile', latencyBudgetMs: 0 },
  // Mobile handoffs
  { from: 'mobile', to: 'vr', allowed: true, latencyBudgetMs: 500 },
  { from: 'mobile', to: 'desktop', allowed: true, latencyBudgetMs: 200 },
  { from: 'mobile', to: 'automotive', allowed: true, latencyBudgetMs: 600 },
  { from: 'mobile', to: 'wearable', allowed: true, latencyBudgetMs: 400 },
  // Desktop handoffs
  { from: 'desktop', to: 'vr', allowed: true, latencyBudgetMs: 400 },
  { from: 'desktop', to: 'mobile', allowed: true, latencyBudgetMs: 300 },
  { from: 'desktop', to: 'automotive', allowed: true, latencyBudgetMs: 500 },
  { from: 'desktop', to: 'wearable', allowed: true, latencyBudgetMs: 400 },
  // Automotive handoffs
  { from: 'automotive', to: 'mobile', allowed: true, latencyBudgetMs: 400 },
  { from: 'automotive', to: 'desktop', allowed: true, latencyBudgetMs: 400 },
  { from: 'automotive', to: 'vr', allowed: false, reason: 'SAFETY-003: car↔VR requires intermediate step', requiredIntermediate: 'mobile', latencyBudgetMs: 0 },
  { from: 'automotive', to: 'wearable', allowed: true, latencyBudgetMs: 600 },
  // Wearable handoffs
  { from: 'wearable', to: 'mobile', allowed: true, latencyBudgetMs: 300 },
  { from: 'wearable', to: 'vr', allowed: true, latencyBudgetMs: 600 },
  { from: 'wearable', to: 'desktop', allowed: true, latencyBudgetMs: 400 },
  { from: 'wearable', to: 'automotive', allowed: true, latencyBudgetMs: 500 },
];

// ============================================================================
// MVC BUDGET CONSTRAINTS (Compile-Time)
// ============================================================================

export interface MVCBudgetConstraint {
  category: PlatformCategory;
  maxPayloadBytes: number;
  maxObjects: number;
  compressionRequired: boolean;
}

export const MVC_BUDGET_CONSTRAINTS: MVCBudgetConstraint[] = [
  { category: 'vr', maxPayloadBytes: 10240, maxObjects: 5, compressionRequired: false },
  { category: 'mobile', maxPayloadBytes: 8192, maxObjects: 5, compressionRequired: false },
  { category: 'desktop', maxPayloadBytes: 10240, maxObjects: 5, compressionRequired: false },
  { category: 'automotive', maxPayloadBytes: 4096, maxObjects: 3, compressionRequired: true },
  { category: 'wearable', maxPayloadBytes: 2048, maxObjects: 3, compressionRequired: true },
];

// ============================================================================
// TRAIT REGISTRY
// ============================================================================

export class CrossRealityTraitRegistry {
  private traits: Map<string, CrossRealityTrait> = new Map();

  constructor() {
    this.registerBuiltinTraits();
  }

  /** Register a new trait */
  register(trait: CrossRealityTrait): void {
    this.traits.set(trait.id, trait);
  }

  /** Get a trait by ID */
  get(traitId: string): CrossRealityTrait | undefined {
    return this.traits.get(traitId);
  }

  /** Get all traits in a category */
  getByCategory(category: CrossRealityTraitCategory): CrossRealityTrait[] {
    return [...this.traits.values()].filter(t => t.category === category);
  }

  /** Get all registered trait IDs */
  getAllTraitIds(): string[] {
    return [...this.traits.keys()];
  }

  /** Check if a platform supports a specific trait */
  isTraitApplicable(traitId: string, platform: PlatformTarget): boolean {
    const trait = this.traits.get(traitId);
    if (!trait) return false;
    if (trait.applicablePlatforms.length === 0 && trait.applicableCategories.length === 0) return true;
    if (trait.applicablePlatforms.includes(platform)) return true;
    const category = platformCategory(platform);
    return trait.applicableCategories.includes(category);
  }

  /** Resolve the default embodiment for a platform */
  resolveEmbodiment(platform: PlatformTarget): CompileTimeEmbodiment {
    if (platform in PLATFORM_EMBODIMENT_OVERRIDES) {
      return PLATFORM_EMBODIMENT_OVERRIDES[platform as keyof typeof PLATFORM_EMBODIMENT_OVERRIDES]!;
    }
    const category = platformCategory(platform);
    return CATEGORY_DEFAULT_EMBODIMENT[category];
  }

  /** Validate a handoff path at compile time */
  validateHandoffPath(from: PlatformTarget, to: PlatformTarget): { allowed: boolean; reason?: string; intermediate?: PlatformCategory; latencyBudgetMs: number } {
    const fromCat = platformCategory(from);
    const toCat = platformCategory(to);
    if (fromCat === toCat) return { allowed: true, latencyBudgetMs: 100 }; // Same category always OK

    const rule = HANDOFF_PATH_RULES.find(r => r.from === fromCat && r.to === toCat);
    if (!rule) return { allowed: true, latencyBudgetMs: 500 }; // No rule = allow

    return {
      allowed: rule.allowed,
      reason: rule.reason,
      intermediate: rule.requiredIntermediate,
      latencyBudgetMs: rule.latencyBudgetMs,
    };
  }

  /** Get MVC budget for a target platform */
  getMVCBudget(platform: PlatformTarget): MVCBudgetConstraint {
    const category = platformCategory(platform);
    return MVC_BUDGET_CONSTRAINTS.find(b => b.category === category) ?? MVC_BUDGET_CONSTRAINTS[0];
  }

  /** Get total registered trait count */
  get size(): number { return this.traits.size; }

  // --- Built-in Trait Registration ---

  private registerBuiltinTraits(): void {
    // Handoff traits
    this.register({
      id: 'crossreality.handoff.seamless',
      category: 'handoff',
      description: 'Enable seamless cross-reality handoff for this composition',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: true,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });
    this.register({
      id: 'crossreality.handoff.autoDetect',
      category: 'handoff',
      description: 'Automatically detect nearby devices and suggest handoffs',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: false,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });
    this.register({
      id: 'crossreality.handoff.maxLatencyMs',
      category: 'handoff',
      description: 'Maximum acceptable handoff latency in milliseconds',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: 500,
      validate: (v) => ({ valid: typeof v === 'number' && v > 0 && v <= 10000 }),
    });

    // Embodiment traits
    this.register({
      id: 'crossreality.embodiment.type',
      category: 'embodiment',
      description: 'Override the default embodiment for this platform',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: null,
      validate: (v) => ({ valid: v === null || ['FullAvatar', 'FloatingAgent', 'UI2D', 'VoiceHUD', 'Haptic', 'GlassOverlay'].includes(v as string) }),
    });
    this.register({
      id: 'crossreality.embodiment.reducedMotion',
      category: 'embodiment',
      description: 'Support reduced motion transitions',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: true,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });

    // Anchor traits
    this.register({
      id: 'crossreality.anchor.geospatial',
      category: 'anchor',
      description: 'Require geospatial (WGS84) anchor support',
      applicablePlatforms: [], applicableCategories: ['vr', 'mobile'],
      required: false, defaultValue: false,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });
    this.register({
      id: 'crossreality.anchor.vendorCloud',
      category: 'anchor',
      description: 'Enable vendor cloud anchor resolution (ARKit/ARCore/Niantic)',
      applicablePlatforms: [], applicableCategories: ['vr', 'mobile'],
      required: false, defaultValue: false,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });

    // Norm traits
    this.register({
      id: 'crossreality.norm.automotiveSafe',
      category: 'norm',
      description: 'Enforce automotive safety norms (SAFETY-001, SAFETY-002)',
      applicablePlatforms: [], applicableCategories: ['automotive'],
      required: true, defaultValue: true,
      validate: (v) => ({ valid: v === true, error: v !== true ? 'Automotive safety norms cannot be disabled' : undefined }),
    });
    this.register({
      id: 'crossreality.norm.privacyAware',
      category: 'norm',
      description: 'Enforce privacy norms (CTX-001 through CTX-003)',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: true,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });
    this.register({
      id: 'crossreality.norm.accessible',
      category: 'norm',
      description: 'Enforce accessibility norms (A11Y-001 through A11Y-003)',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: true,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });

    // Budget traits
    this.register({
      id: 'crossreality.budget.maxPayloadBytes',
      category: 'budget',
      description: 'Override max MVC payload size in bytes',
      applicablePlatforms: [], applicableCategories: [],
      required: false, defaultValue: 10240,
      validate: (v) => ({ valid: typeof v === 'number' && v > 0 && v <= 65536 }),
    });
    this.register({
      id: 'crossreality.budget.compressionRequired',
      category: 'budget',
      description: 'Force compression for MVC payloads',
      applicablePlatforms: [], applicableCategories: ['automotive', 'wearable'],
      required: false, defaultValue: false,
      validate: (v) => ({ valid: typeof v === 'boolean' }),
    });
  }
}

// ============================================================================
// SINGLETON & FACTORY
// ============================================================================

let globalRegistry: CrossRealityTraitRegistry | null = null;

export function getCrossRealityTraitRegistry(): CrossRealityTraitRegistry {
  if (!globalRegistry) {
    globalRegistry = new CrossRealityTraitRegistry();
  }
  return globalRegistry;
}

export function resetCrossRealityTraitRegistry(): void {
  globalRegistry = null;
}

export function createCrossRealityTraitRegistry(): CrossRealityTraitRegistry {
  return new CrossRealityTraitRegistry();
}
