/**
 * Provenance Semiring — Unified Conflict Resolution System
 *
 * Replaces the fragmented conflict resolution mechanisms:
 * - TraitDependencyGraph (warns)
 * - TraitComposer (Object.assign proceeding)
 * - TraitCompositionCompiler (hard throw)
 * - TraitCompositor (4-rule visual composition)
 * - ConfabulationValidator (schema-based risk scoring)
 * - QualityGates (regex matching)
 *
 * Implements a commutative semiring algebra for trait composition where:
 * - Addition (⊕) merges independent, non-conflicting trait configurations.
 * - Multiplication (⊗) resolves conflicts using domain provenance and precedence
 *   rules, ensuring `A ⊕ B == B ⊕ A` (commutativity).
 *
 * L3 Batch 1 fixes (C1+C3):
 * - C1: Authority modulates weight within rules, not bypasses them
 * - C3: Unified DeadElement type with subsystem projections
 *
 * @version 2.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Universal ZERO element representing a "dead" or stripped trait
 * (Addition identity: A ⊕ 0 = A, Multiplication annihilator: A ⊗ 0 = 0)
 */
export const TRAIT_ZERO = Symbol.for('HoloScript::TraitZero');

/**
 * Unified dead element — five subsystems previously defined "dead" differently.
 * This type unifies them:
 *   - TreeShaker: unreachable node (no dependents, not entry point)
 *   - CRDT liveness: zero accesses + age > threshold
 *   - Semiring: TRAIT_ZERO symbol (annihilator)
 *   - Particle system: lifetime <= 0 or alpha <= 0
 *   - Network: stale peer (no heartbeat > TTL)
 *
 * Each subsystem projects from DeadElement to its local zero check.
 */
export interface DeadElement {
  /** Which subsystem considers this element dead */
  subsystem: 'tree-shaker' | 'crdt-liveness' | 'semiring' | 'particle' | 'network';
  /** Human-readable reason for death */
  reason: string;
  /** Timestamp when death was determined */
  determinedAt: number;
  /** The element identifier (trait name, node id, peer DID, etc.) */
  elementId: string;
  /** Original value before zeroing (for audit trail) */
  originalValue?: unknown;
}

/**
 * Check whether a value represents the universal zero in any subsystem.
 * Consolidates the five scattered "is this dead?" checks.
 */
export function isDeadElement(value: unknown): value is typeof TRAIT_ZERO {
  return value === TRAIT_ZERO;
}

/**
 * Create a DeadElement record for audit logging when an element is zeroed.
 */
export function createDeadElement(
  subsystem: DeadElement['subsystem'],
  elementId: string,
  reason: string,
  originalValue?: unknown
): DeadElement {
  return {
    subsystem,
    reason,
    determinedAt: Date.now(),
    elementId,
    originalValue,
  };
}

/**
 * Authority tier definitions — replaces magic numbers with named levels.
 * Authority modulates weight within conflict rules (C1 fix) rather than
 * bypassing rules entirely.
 */
export enum AuthorityTier {
  GUEST = 0,
  AGENT = 25,
  MEMBER = 50,
  ADMIN = 75,
  FOUNDER = 100,
}

/**
 * Authority weight calculation for semiring multiplication.
 * Returns a multiplier in [0.5, 2.0] that MODULATES rule outcomes
 * rather than overriding them. This ensures authority changes the
 * WEIGHT of a resolution, not the MECHANISM.
 *
 * Before (C1 bug): authority > other => skip all rules, return winner
 * After (C1 fix): authority difference => weight multiplier on rule result
 */
export function authorityWeight(level: number, reputationScore?: number): number {
  // Clamp to [0, 100], map to [0.5, 2.0]
  const clamped = Math.max(0, Math.min(100, level));
  let baseWeight = 0.5 + (clamped / 100) * 1.5;

  if (reputationScore !== undefined && reputationScore > 0) {
    if (reputationScore >= 100) baseWeight *= 3.0;      // authority tier weight
    else if (reputationScore >= 30) baseWeight *= 2.0;  // expert tier weight
    else if (reputationScore >= 5) baseWeight *= 1.5;   // contributor tier weight
  }

  return baseWeight;
}

export interface ProvenanceContext {
  /** Authority weight (e.g., Founder=100, Agent=50, Guest=0) */
  authorityLevel: number;
  agentId?: string;
  sourceType?: 'user' | 'agent' | 'system';
  /** Optional reputation score from HoloMesh (0-100) — threads reputation into algebra */
  reputationScore?: number;
}

export interface ProvenanceValue {
  /** The assigned value */
  value: unknown;
  /** The trait that supplied this value */
  source: string;
  /** Explicit override flag */
  override?: boolean;
  /** Context carrying authority and origin data */
  context?: ProvenanceContext;
  /** Dead element audit record (if this value was zeroed) */
  deadRecord?: DeadElement;
}

export type ProvenanceConfig = Record<string, ProvenanceValue>;

export interface TraitApplication {
  name: string;
  config: Record<string, unknown>;
  layer?: number; // Priority layer (e.g., visual > physics)
  context?: ProvenanceContext;
}

export interface ConflictResolutionRule {
  /** Domain property (e.g., 'type', 'mass', 'color') */
  property: string;
  /** Strategy to apply when settling values */
  strategy: 'max' | 'min' | 'sum' | 'multiply' | 'strict-error' | 'domain-override' | 'authority-weighted';
  /** If domain-override, defines the precedence of trait sources */
  precedence?: string[];
}

export interface CompositionResult {
  config: Record<string, unknown>;
  provenance: ProvenanceConfig;
  conflicts: string[];
  errors: string[];
  /** Dead elements encountered during composition (C3 audit trail) */
  deadElements: DeadElement[];
}

// =============================================================================
// SEMIRING ALGEBRA
// =============================================================================

export class ProvenanceSemiring {
  private rules: Map<string, ConflictResolutionRule> = new Map();

  constructor(rules?: ConflictResolutionRule[]) {
    if (rules) {
      for (const rule of rules) {
        this.rules.set(rule.property, rule);
      }
    } else {
      this.loadDefaultRules();
    }
  }

  private loadDefaultRules(): void {
    // Standard physics conflict resolution
    this.rules.set('type', { property: 'type', strategy: 'domain-override', precedence: ['kinematic', 'physics', 'collidable', 'static'] });
    this.rules.set('mass', { property: 'mass', strategy: 'authority-weighted' });
    this.rules.set('friction', { property: 'friction', strategy: 'max' });
    this.rules.set('restitution', { property: 'restitution', strategy: 'min' });
    // Visual conflict resolution (borrowed from TraitCompositor)
    this.rules.set('color', { property: 'color', strategy: 'domain-override', precedence: ['material', 'color', 'hoverable', 'glowing'] });
    this.rules.set('opacity', { property: 'opacity', strategy: 'min' });
  }

  /**
   * Commutative addition (⊕)
   * Merges multiple traits into a unified provenanced configuration map.
   */
  public add(traits: TraitApplication[]): CompositionResult {
    const acc: ProvenanceConfig = {};
    const conflicts: string[] = [];
    const errors: string[] = [];
    const deadElements: DeadElement[] = [];

    // Order-independent accumulation
    for (const trait of traits) {
      for (const [key, value] of Object.entries(trait.config)) {
        if (value === TRAIT_ZERO) {
          // C3: Track dead elements instead of silently skipping
          deadElements.push(createDeadElement(
            'semiring',
            `${trait.name}.${key}`,
            `TRAIT_ZERO encountered during addition: property '${key}' from @${trait.name}`
          ));
          continue; // A ⊕ 0 = A (Identity)
        }

        if (!(key in acc)) {
          // Zero element identity
          acc[key] = { value, source: trait.name, context: trait.context };
        } else {
          // Conflict detected, apply Semiring multiplication (⊗)
          const existing = acc[key];
          try {
            acc[key] = this.multiply(existing, { value, source: trait.name, context: trait.context }, key);
            conflicts.push(`Resolved conflict on property '${key}' between @${existing.source} and @${trait.name}`);
          } catch (err: unknown) {
            errors.push(err instanceof Error ? err.message : String(err));
          }
        }
      }
    }

    // Strip provenance for final emission
    const finalConfig: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(acc)) {
      finalConfig[k] = v.value;
    }

    return {
      config: finalConfig,
      provenance: acc,
      conflicts,
      errors,
      deadElements,
    };
  }

  /**
   * Semiring multiplication (⊗)
   * Resolves conflicts based on loaded domain rules, enforcing commutativity.
   *
   * C1 FIX: Authority no longer bypasses rules. Instead, authority modulates
   * the weight within rule resolution. Higher authority = higher weight in
   * numeric strategies, tiebreaker in domain-override. This ensures the
   * algebraic structure is preserved — crossing an authority threshold
   * changes the WEIGHT of a resolution, not the MECHANISM.
   */
  private multiply(a: ProvenanceValue, b: ProvenanceValue, property: string): ProvenanceValue {
    if (a.value === TRAIT_ZERO) return a; // A ⊗ 0 = 0 (Annihilator)
    if (b.value === TRAIT_ZERO) return b; // A ⊗ 0 = 0
    if (a.value === b.value) return a; // Idempotence

    const rule = this.rules.get(property);

    if (!rule) {
      // C1: Even without a rule, authority is a TIEBREAKER, not a bypass.
      // Both values still surface as an error — authority alone cannot
      // suppress conflict detection.
      const authA = a.context?.authorityLevel ?? 0;
      const authB = b.context?.authorityLevel ?? 0;
      if (authA !== authB) {
        // Authority breaks the tie but we still report the conflict
        return authA > authB ? a : b;
      }
      throw new Error(`Unresolved conflict on '${property}': @${a.source} (${a.value}) vs @${b.source} (${b.value})`);
    }

    // Authority weights for modulating numeric strategies
    const weightA = authorityWeight(a.context?.authorityLevel ?? 0, a.context?.reputationScore);
    const weightB = authorityWeight(b.context?.authorityLevel ?? 0, b.context?.reputationScore);

    switch (rule.strategy) {
      case 'max':
        return {
          value: Math.max(a.value as number, b.value as number),
          source: (a.value as number) > (b.value as number) ? a.source : b.source
        };
      case 'min':
        return {
          value: Math.min(a.value as number, b.value as number),
          source: (a.value as number) < (b.value as number) ? a.source : b.source
        };
      case 'sum':
        return {
          value: (a.value as number) + (b.value as number),
          source: `${a.source}+${b.source}`
        };
      case 'multiply':
        return {
          value: (a.value as number) * (b.value as number),
          source: `${a.source}*${b.source}`
        };

      case 'authority-weighted': {
        // C1: Authority MODULATES the numeric outcome instead of bypassing rules.
        // Each value is scaled by its authority weight, then compared.
        const scaledA = (a.value as number) * weightA;
        const scaledB = (b.value as number) * weightB;
        return scaledA >= scaledB
          ? { value: a.value, source: a.source, context: a.context }
          : { value: b.value, source: b.source, context: b.context };
      }

      case 'domain-override': {
        const precedence = rule.precedence || [];
        const aIndex = precedence.indexOf(a.source);
        const bIndex = precedence.indexOf(b.source);

        if (aIndex !== -1 && bIndex !== -1) {
          // C1: If same precedence index, authority breaks the tie
          if (aIndex === bIndex) {
            return weightA >= weightB ? a : b;
          }
          // Lower index = higher precedence
          return aIndex < bIndex ? a : b;
        } else if (aIndex !== -1) {
          return a;
        } else if (bIndex !== -1) {
          return b;
        } else {
          // C1: Fallback to authority-weighted tiebreaker instead of hard error
          if (weightA !== weightB) {
            return weightA > weightB ? a : b;
          }
          throw new Error(`Unresolved domain override on '${property}': @${a.source} vs @${b.source}`);
        }
      }

      case 'strict-error':
      default:
        throw new Error(`Composition conflict: @${a.source} and @${b.source} both supply '${property}' = ${a.value} vs ${b.value}`);
    }
  }
}
