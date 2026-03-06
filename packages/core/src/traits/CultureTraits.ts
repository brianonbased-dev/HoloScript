/**
 * @fileoverview HoloScript Culture Traits
 * @module @holoscript/core/traits
 *
 * Compile-time trait declarations for emergent agent culture.
 * Based on the 5-layer Culture Engine Architecture (SP.001):
 * Memory → Norms → Feedback → Persistence → Selection
 *
 * Three forms of agent culture (research-backed):
 * 1. Cultural Production — LLMs generate culture trivially (no arch needed)
 * 2. Cultural Socialization — behavior-changing norms (requires 5-layer arch)
 * 3. Cultural Persistence — cross-session continuity (requires Lifelong Team Memory)
 *
 * References:
 * - IJCAI 2024: Emergence of Social Norms in Generative Agent Societies
 * - Science Advances 2025: Emergent Social Conventions in LLM Populations
 * - AAMAS 2026: Molt Dynamics in Autonomous AI Agent Populations
 *
 * @version 1.0.0
 */

// =============================================================================
// NORM TYPES
// =============================================================================

/**
 * Norm enforcement modes.
 * - 'hard' — violation prevents action (compile-time enforced)
 * - 'soft' — violation triggers feedback but allows action
 * - 'advisory' — violation is logged, no consequence
 */
export type NormEnforcement = 'hard' | 'soft' | 'advisory';

/**
 * Norm scope — where the norm applies.
 */
export type NormScope = 'agent' | 'zone' | 'world' | 'session';

/**
 * Categories of cultural norms.
 * Based on CRSEC framework classification.
 */
export type NormCategory =
  | 'cooperation'    // Resource sharing, mutual aid
  | 'communication'  // Greeting conventions, language norms
  | 'territory'      // Zone ownership, movement conventions
  | 'exchange'       // Trade conventions, fair pricing
  | 'authority'      // Hierarchy, decision-making protocols
  | 'safety'         // Anti-griefing, non-aggression
  | 'ritual'         // Repeated group behaviors, ceremonies
  | 'identity';      // Group markers, naming conventions

// =============================================================================
// NORM DEFINITION
// =============================================================================

/**
 * A cultural norm — a behavioral rule that agents can adopt, enforce, and evolve.
 */
export interface CulturalNorm {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description of the expected behavior */
  description: string;
  /** Norm category */
  category: NormCategory;
  /** Enforcement mode */
  enforcement: NormEnforcement;
  /** Scope of application */
  scope: NormScope;
  /** Adoption rate threshold for activation (0-1) */
  activationThreshold: number;
  /** Strength of the norm (affects tipping point: weak=2%, strong=25-67%) */
  strength: 'weak' | 'moderate' | 'strong';
  /** Required effects to check compliance */
  requiredEffects?: string[];
  /** Forbidden effects under this norm */
  forbiddenEffects?: string[];
}

// =============================================================================
// NORM COMPLIANCE TRAIT
// =============================================================================

/**
 * @norm_compliant trait configuration.
 * Agents bearing this trait must comply with specified norms
 * before entering shared spaces.
 */
export interface NormComplianceTrait {
  /** Norms this agent complies with */
  norms: string[];
  /** Enforcement level for this agent */
  enforcement: NormEnforcement;
  /** Scope where compliance is checked */
  scope: NormScope;
  /** Whether this agent can propose new norms */
  canPropose: boolean;
  /** Whether this agent enforces norms on others */
  canEnforce: boolean;
  /** Compliance history (populated at runtime) */
  complianceScore?: number;
}

/**
 * @cultural_memory trait configuration.
 * Agents bearing this trait maintain dual memory:
 * - Episodic: personal experiences with decay
 * - Stigmergic: environmental markers visible to others
 */
export interface CulturalMemoryTrait {
  /** Memory capacity (max entries) */
  capacity: number;
  /** Episodic memory decay rate (0-1 per tick, 0 = no decay) */
  episodicDecayRate: number;
  /** Stigmergic trace lifetime (ticks before evaporation) */
  traceLifetime: number;
  /** Whether to consolidate episodic → semantic (SOP formation) */
  consolidation: boolean;
  /** Consolidation threshold (min experiences before forming SOP) */
  consolidationThreshold: number;
}

/**
 * @cultural_trace trait configuration.
 * Spatial objects bearing this trait act as stigmergic memory —
 * persistent environmental markers that other agents can perceive.
 */
export interface CulturalTraceTrait {
  /** Type of trace */
  traceType: 'marker' | 'path' | 'signal' | 'artifact' | 'boundary';
  /** Intensity (affects perception range and decay rate) */
  intensity: number;
  /** Decay per tick (0 = permanent) */
  decayRate: number;
  /** Creator agent ID (for provenance) */
  creatorId?: string;
  /** Semantic label (what the trace means) */
  label: string;
  /** Perception radius (how far agents can sense this trace) */
  perceptionRadius: number;
}

// =============================================================================
// BUILT-IN NORMS
// =============================================================================

/**
 * Standard library of cultural norms.
 * These can be used directly or as templates for custom norms.
 */
export const BUILTIN_NORMS: CulturalNorm[] = [
  // Safety norms
  {
    id: 'no_griefing', name: 'No Griefing', category: 'safety',
    description: 'Agents must not intentionally harm or obstruct others',
    enforcement: 'hard', scope: 'world', activationThreshold: 0,
    strength: 'strong',
    forbiddenEffects: ['agent:kill', 'inventory:destroy', 'physics:teleport'],
  },
  {
    id: 'resource_sharing', name: 'Resource Sharing', category: 'cooperation',
    description: 'Agents should share resources when others are in need',
    enforcement: 'soft', scope: 'zone', activationThreshold: 0.5,
    strength: 'moderate',
    requiredEffects: ['inventory:give'],
  },
  {
    id: 'zone_respect', name: 'Zone Respect', category: 'territory',
    description: 'Agents must request permission before entering owned zones',
    enforcement: 'soft', scope: 'zone', activationThreshold: 0.3,
    strength: 'moderate',
    requiredEffects: ['agent:communicate'],
    forbiddenEffects: ['authority:zone'],
  },
  {
    id: 'fair_trade', name: 'Fair Trade', category: 'exchange',
    description: 'Trade exchanges must be mutually agreed upon',
    enforcement: 'hard', scope: 'world', activationThreshold: 0,
    strength: 'strong',
    requiredEffects: ['inventory:trade', 'agent:communicate'],
  },
  {
    id: 'greeting_convention', name: 'Greeting Convention', category: 'communication',
    description: 'Agents should acknowledge each other when first meeting in a session',
    enforcement: 'advisory', scope: 'session', activationThreshold: 0.6,
    strength: 'weak',
    requiredEffects: ['agent:communicate'],
  },
  {
    id: 'noise_courtesy', name: 'Noise Courtesy', category: 'safety',
    description: 'Agents should not play global audio without zone permission',
    enforcement: 'soft', scope: 'zone', activationThreshold: 0.4,
    strength: 'moderate',
    forbiddenEffects: ['audio:global'],
  },
  {
    id: 'spawn_limits', name: 'Spawn Limits', category: 'cooperation',
    description: 'Agents should not spawn excessive objects in shared spaces',
    enforcement: 'hard', scope: 'zone', activationThreshold: 0,
    strength: 'strong',
    forbiddenEffects: ['render:spawn'],  // Catches excessive spawning via budget
  },
  {
    id: 'metanorm_enforcement', name: 'Meta-Norm: Enforce Norms', category: 'authority',
    description: 'Agents who witness norm violations should report them (norm about enforcing norms)',
    enforcement: 'advisory', scope: 'world', activationThreshold: 0.7,
    strength: 'weak',
    requiredEffects: ['agent:communicate', 'agent:observe'],
  },
];

/**
 * Get a built-in norm by ID.
 */
export function getBuiltinNorm(id: string): CulturalNorm | undefined {
  return BUILTIN_NORMS.find(n => n.id === id);
}

/**
 * Get all norms of a given category.
 */
export function normsByCategory(category: NormCategory): CulturalNorm[] {
  return BUILTIN_NORMS.filter(n => n.category === category);
}

/**
 * Calculate the critical mass needed to overturn a norm.
 * Based on research: weak norms ≈ 2%, strong norms ≈ 25-67%.
 */
export function criticalMassForChange(norm: CulturalNorm, populationSize: number): number {
  const percentages = { weak: 0.02, moderate: 0.25, strong: 0.50 };
  return Math.ceil(populationSize * percentages[norm.strength]);
}
