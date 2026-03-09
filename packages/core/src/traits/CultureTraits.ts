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
 * Includes `cultural_profile` trait type for compile-time cultural compatibility
 * checking between agent compositions. The compiler can detect incompatible
 * agent team compositions before runtime via CulturalCompatibilityChecker.
 *
 * References:
 * - IJCAI 2024: Emergence of Social Norms in Generative Agent Societies
 * - Science Advances 2025: Emergent Social Conventions in LLM Populations
 * - AAMAS 2026: Molt Dynamics in Autonomous AI Agent Populations
 *
 * @version 2.0.0
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
  | 'cooperation' // Resource sharing, mutual aid
  | 'communication' // Greeting conventions, language norms
  | 'territory' // Zone ownership, movement conventions
  | 'exchange' // Trade conventions, fair pricing
  | 'authority' // Hierarchy, decision-making protocols
  | 'safety' // Anti-griefing, non-aggression
  | 'ritual' // Repeated group behaviors, ceremonies
  | 'identity'; // Group markers, naming conventions

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
    id: 'no_griefing',
    name: 'No Griefing',
    category: 'safety',
    description: 'Agents must not intentionally harm or obstruct others',
    enforcement: 'hard',
    scope: 'world',
    activationThreshold: 0,
    strength: 'strong',
    forbiddenEffects: ['agent:kill', 'inventory:destroy', 'physics:teleport'],
  },
  {
    id: 'resource_sharing',
    name: 'Resource Sharing',
    category: 'cooperation',
    description: 'Agents should share resources when others are in need',
    enforcement: 'soft',
    scope: 'zone',
    activationThreshold: 0.5,
    strength: 'moderate',
    requiredEffects: ['inventory:give'],
  },
  {
    id: 'zone_respect',
    name: 'Zone Respect',
    category: 'territory',
    description: 'Agents must request permission before entering owned zones',
    enforcement: 'soft',
    scope: 'zone',
    activationThreshold: 0.3,
    strength: 'moderate',
    requiredEffects: ['agent:communicate'],
    forbiddenEffects: ['authority:zone'],
  },
  {
    id: 'fair_trade',
    name: 'Fair Trade',
    category: 'exchange',
    description: 'Trade exchanges must be mutually agreed upon',
    enforcement: 'hard',
    scope: 'world',
    activationThreshold: 0,
    strength: 'strong',
    requiredEffects: ['inventory:trade', 'agent:communicate'],
  },
  {
    id: 'greeting_convention',
    name: 'Greeting Convention',
    category: 'communication',
    description: 'Agents should acknowledge each other when first meeting in a session',
    enforcement: 'advisory',
    scope: 'session',
    activationThreshold: 0.6,
    strength: 'weak',
    requiredEffects: ['agent:communicate'],
  },
  {
    id: 'noise_courtesy',
    name: 'Noise Courtesy',
    category: 'safety',
    description: 'Agents should not play global audio without zone permission',
    enforcement: 'soft',
    scope: 'zone',
    activationThreshold: 0.4,
    strength: 'moderate',
    forbiddenEffects: ['audio:global'],
  },
  {
    id: 'spawn_limits',
    name: 'Spawn Limits',
    category: 'cooperation',
    description: 'Agents should not spawn excessive objects in shared spaces',
    enforcement: 'hard',
    scope: 'zone',
    activationThreshold: 0,
    strength: 'strong',
    forbiddenEffects: ['render:spawn'], // Catches excessive spawning via budget
  },
  {
    id: 'metanorm_enforcement',
    name: 'Meta-Norm: Enforce Norms',
    category: 'authority',
    description:
      'Agents who witness norm violations should report them (norm about enforcing norms)',
    enforcement: 'advisory',
    scope: 'world',
    activationThreshold: 0.7,
    strength: 'weak',
    requiredEffects: ['agent:communicate', 'agent:observe'],
  },
];

/**
 * Get a built-in norm by ID.
 */
export function getBuiltinNorm(id: string): CulturalNorm | undefined {
  return BUILTIN_NORMS.find((n) => n.id === id);
}

/**
 * Get all norms of a given category.
 */
export function normsByCategory(category: NormCategory): CulturalNorm[] {
  return BUILTIN_NORMS.filter((n) => n.category === category);
}

/**
 * Calculate the critical mass needed to overturn a norm.
 * Based on research: weak norms ≈ 2%, strong norms ≈ 25-67%.
 */
export function criticalMassForChange(norm: CulturalNorm, populationSize: number): number {
  const percentages = { weak: 0.02, moderate: 0.25, strong: 0.5 };
  return Math.ceil(populationSize * percentages[norm.strength]);
}

// =============================================================================
// CULTURAL PROFILE TRAIT — COMPILE-TIME COMPATIBILITY CHECKING
// =============================================================================

/**
 * Cultural family classification.
 * Determines baseline behavioral conventions and interaction protocols.
 * Families within the same group are generally compatible; cross-group
 * compositions require explicit compatibility declarations.
 */
export type CulturalFamily =
  | 'cooperative' // Mutual aid, consensus-seeking, shared goals
  | 'competitive' // Individual achievement, ranking, resource contest
  | 'hierarchical' // Authority-driven, chain of command, delegated tasks
  | 'egalitarian' // Flat structure, equal voice, collective decision
  | 'isolationist' // Self-sufficient, minimal interaction, independent
  | 'mercantile' // Trade-oriented, value exchange, contract-based
  | 'exploratory' // Discovery-driven, knowledge-seeking, adaptive
  | 'ritualistic'; // Tradition-preserving, ceremony-driven, pattern-following

/**
 * Prompt dialect — the communication style and instruction format
 * an agent uses internally and when interacting with other agents.
 * Mismatched dialects produce warnings (not errors) since agents
 * can often adapt, but performance degrades.
 */
export type PromptDialect =
  | 'directive' // Command-oriented: "Do X. Then Y."
  | 'socratic' // Question-oriented: "What if we...? How about...?"
  | 'narrative' // Story-oriented: "The agent finds itself needing to..."
  | 'structured' // Schema-oriented: "{ task: X, priority: Y }"
  | 'consensus' // Proposal-oriented: "I propose we... Do you agree?"
  | 'reactive'; // Event-oriented: "When X happens, respond with Y."

/**
 * @cultural_profile trait configuration.
 *
 * Declares the cultural identity of an agent so the compiler can detect
 * incompatible team compositions at compile time. Every agent bearing
 * this trait exposes four dimensions:
 *
 * 1. `cooperation_index` — numeric willingness to cooperate (0 = hostile, 1 = fully cooperative)
 * 2. `cultural_family` — behavioral archetype classification
 * 3. `prompt_dialect` — communication style for inter-agent messaging
 * 4. `norm_set` — array of norm IDs this agent subscribes to
 *
 * Example HoloScript:
 * ```holoscript
 * object "TeamLeader" {
 *   @cultural_profile {
 *     cooperation_index: 0.9
 *     cultural_family: "hierarchical"
 *     prompt_dialect: "directive"
 *     norm_set: ["no_griefing", "resource_sharing", "fair_trade"]
 *   }
 * }
 * ```
 */
export interface CulturalProfileTrait {
  /**
   * Willingness to cooperate, 0-1.
   * - 0.0 = fully adversarial (will not share, will compete)
   * - 0.5 = neutral (situational cooperation)
   * - 1.0 = fully cooperative (always shares, never competes)
   *
   * The compiler flags agent pairs whose cooperation_index delta exceeds
   * the configurable threshold (default 0.5).
   */
  cooperation_index: number;

  /**
   * The cultural family this agent belongs to.
   * Used for compile-time compatibility matrix checks.
   */
  cultural_family: CulturalFamily;

  /**
   * The prompt/communication dialect this agent uses.
   * Mismatched dialects produce warnings since inter-agent
   * communication may degrade.
   */
  prompt_dialect: PromptDialect;

  /**
   * Array of norm IDs this agent subscribes to.
   * References norms from BUILTIN_NORMS or custom-registered norms.
   * The compiler checks for contradictory norms within a composition.
   */
  norm_set: string[];
}

// =============================================================================
// CULTURAL FAMILY COMPATIBILITY MATRIX
// =============================================================================

/**
 * Compatibility rating between cultural families.
 * - 'compatible' — agents can work together without issues
 * - 'cautious' — agents can work together but need mediation (warning)
 * - 'incompatible' — agents will conflict at runtime (error)
 */
export type CompatibilityRating = 'compatible' | 'cautious' | 'incompatible';

/**
 * Known incompatibility pairs between cultural families.
 * This matrix is symmetric: if A is incompatible with B, then B is incompatible with A.
 *
 * Reasoning:
 * - competitive + cooperative: fundamental goal misalignment
 * - competitive + egalitarian: ranking vs. equal voice
 * - hierarchical + egalitarian: authority vs. flat structure
 * - isolationist + cooperative: self-sufficiency vs. mutual aid
 * - isolationist + ritualistic: independence vs. group ceremonies
 */
export const CULTURAL_FAMILY_COMPATIBILITY: ReadonlyArray<{
  familyA: CulturalFamily;
  familyB: CulturalFamily;
  rating: CompatibilityRating;
  reason: string;
}> = [
  // Incompatible pairs
  {
    familyA: 'competitive',
    familyB: 'cooperative',
    rating: 'incompatible',
    reason:
      'Competitive agents pursue individual gain, cooperative agents pursue shared goals. Fundamental goal misalignment.',
  },
  {
    familyA: 'hierarchical',
    familyB: 'egalitarian',
    rating: 'incompatible',
    reason:
      'Hierarchical agents expect chain of command, egalitarian agents reject authority structures.',
  },
  {
    familyA: 'isolationist',
    familyB: 'cooperative',
    rating: 'incompatible',
    reason: 'Isolationist agents refuse interaction, cooperative agents require mutual engagement.',
  },

  // Cautious pairs (can work with mediation)
  {
    familyA: 'competitive',
    familyB: 'egalitarian',
    rating: 'cautious',
    reason: 'Competitive ranking conflicts with equal-voice principles. Needs mediation.',
  },
  {
    familyA: 'isolationist',
    familyB: 'ritualistic',
    rating: 'cautious',
    reason:
      'Isolationist independence conflicts with group ceremony requirements. Needs mediation.',
  },
  {
    familyA: 'mercantile',
    familyB: 'cooperative',
    rating: 'cautious',
    reason:
      'Mercantile agents expect value exchange, cooperative agents share freely. Needs mediation.',
  },
  {
    familyA: 'competitive',
    familyB: 'hierarchical',
    rating: 'cautious',
    reason: 'Competitive agents may challenge authority. Needs clear ranking rules.',
  },
  {
    familyA: 'isolationist',
    familyB: 'hierarchical',
    rating: 'cautious',
    reason: 'Isolationist agents resist authority. Needs minimal supervision protocols.',
  },
];

/**
 * Norm pairs that are mutually contradictory.
 * If two agents in a composition subscribe to contradictory norms,
 * the compiler emits an error.
 */
export const CONTRADICTORY_NORM_PAIRS: ReadonlyArray<{
  normA: string;
  normB: string;
  reason: string;
}> = [
  {
    normA: 'resource_sharing',
    normB: 'spawn_limits',
    reason: 'Resource sharing may require spawning items, but spawn limits restrict it.',
  },
  // Users can extend this set via registerContradictoryNorms()
];

/**
 * Registry for user-defined contradictory norm pairs.
 */
const customContradictoryNorms: Array<{ normA: string; normB: string; reason: string }> = [];

/**
 * Register a custom contradictory norm pair.
 * The compiler will emit an error when both norms appear in a composition.
 */
export function registerContradictoryNorms(normA: string, normB: string, reason: string): void {
  customContradictoryNorms.push({ normA, normB, reason });
}

/**
 * Get all contradictory norm pairs (built-in + custom).
 */
export function getAllContradictoryNorms(): ReadonlyArray<{
  normA: string;
  normB: string;
  reason: string;
}> {
  return [...CONTRADICTORY_NORM_PAIRS, ...customContradictoryNorms];
}

/**
 * Look up the compatibility rating between two cultural families.
 * Returns 'compatible' if no explicit entry exists in the matrix.
 */
export function getFamilyCompatibility(
  familyA: CulturalFamily,
  familyB: CulturalFamily
): { rating: CompatibilityRating; reason: string } {
  if (familyA === familyB) {
    return { rating: 'compatible', reason: 'Same cultural family.' };
  }

  for (const entry of CULTURAL_FAMILY_COMPATIBILITY) {
    if (
      (entry.familyA === familyA && entry.familyB === familyB) ||
      (entry.familyA === familyB && entry.familyB === familyA)
    ) {
      return { rating: entry.rating, reason: entry.reason };
    }
  }

  return { rating: 'compatible', reason: 'No known incompatibility between these families.' };
}
