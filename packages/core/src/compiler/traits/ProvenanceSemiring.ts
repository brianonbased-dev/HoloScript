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

import { strategyToSemiring } from './Semiring';

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
    if (reputationScore >= 100)
      baseWeight *= 3.0; // authority tier weight
    else if (reputationScore >= 30)
      baseWeight *= 2.0; // expert tier weight
    else if (reputationScore >= 5) baseWeight *= 1.5; // contributor tier weight
  }

  return baseWeight;
}

/**
 * CRDT-01: deterministic winner when authority-weighted scaled scores tie.
 * Lexicographic: agentId → opId → trait source → canonical value. Ensures ⊗
 * does not depend on argument order when weights and scaled products coincide.
 */
function tieBreakProvenance(a: ProvenanceValue, b: ProvenanceValue): ProvenanceValue {
  const aid = String(a.context?.agentId ?? '');
  const bid = String(b.context?.agentId ?? '');
  if (aid !== bid) return aid < bid ? a : b;
  const opA = String(a.context?.opId ?? '');
  const opB = String(b.context?.opId ?? '');
  if (opA !== opB) return opA < opB ? a : b;
  const srcA = String(a.source ?? '');
  const srcB = String(b.source ?? '');
  if (srcA !== srcB) return srcA < srcB ? a : b;
  const ja = canonicalTieValue(a.value);
  const jb = canonicalTieValue(b.value);
  if (ja !== jb) return ja <= jb ? a : b;
  return a;
}

function canonicalTieValue(value: unknown, seen = new WeakSet<object>()): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
      return `string:${JSON.stringify(value)}`;
    case 'number':
      return Number.isFinite(value) ? `number:${value}` : `number:${String(value)}`;
    case 'bigint':
      return `bigint:${value.toString()}`;
    case 'boolean':
      return `boolean:${value}`;
    case 'undefined':
      return 'undefined';
    case 'symbol':
      return `symbol:${String(value)}`;
    case 'function':
      return `function:${value.name}`;
    case 'object':
      break;
  }

  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  let canonical: string;
  if (value instanceof Date) {
    const millis = value.getTime();
    canonical = Number.isNaN(millis) ? 'date:Invalid' : `date:${value.toISOString()}`;
  } else if (Array.isArray(value)) {
    canonical = `array:[${value.map((item) => canonicalTieValue(item, seen)).join(',')}]`;
  } else {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
      left.localeCompare(right)
    );
    canonical = `object:{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalTieValue(item, seen)}`)
      .join(',')}}`;
  }

  seen.delete(value);
  return canonical;
}

/**
 * Canonical JSON for hashing a provenance map (task_1790058854739_97yq).
 *
 * Each provenance entry carries the caller's `value` and `context` by
 * reference with their own key order intact, so `JSON.stringify(provenance)`
 * gave two agents that built the same logical context as {authorityLevel,
 * agentId} and {agentId, authorityLevel} different bytes and a different
 * stateHash. add() deliberately does not deep-sort (a deep clone is lossy for
 * Dates, which do reach here); the hash site sorts instead.
 *
 * JSON applies its own semantics FIRST (toJSON, so a Date is its ISO string;
 * boxed primitives unwrap; a cycle or a BigInt throws the TypeError JSON
 * throws; an own "__proto__" key stays an own key), and only the keys of that
 * plain result are then sorted at every depth. Sorting inside a replacer
 * broke all four (claude3's review of #318): an own "__proto__" key vanished,
 * boxed primitives became {}, and a cycle threw RangeError instead.
 */
export function canonicalProvenanceJson(value: unknown): string {
  const text = JSON.stringify(value);
  return text === undefined ? text : JSON.stringify(sortKeysDeep(JSON.parse(text)));
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeysDeep(record[key])])
    );
  }
  return value;
}

/**
 * The leaves behind a value: a merged value carries the contributions it was
 * built from; a plain value is its own single leaf, context included.
 */
function leavesOf(p: ProvenanceValue): ProvenanceLeaf[] {
  if (Array.isArray(p.contributions) && p.contributions.length > 0) return p.contributions;
  const leaf: ProvenanceLeaf = { source: String(p.source), value: p.value };
  if (p.context !== undefined) leaf.context = p.context;
  return [leaf];
}

/** A leaf's canonical value, computed once per leaf (sorting re-reads it). */
const leafKeys = new WeakMap<ProvenanceLeaf, string>();
function leafKey(leaf: ProvenanceLeaf): string {
  let key = leafKeys.get(leaf);
  if (key === undefined) {
    key = canonicalTieValue(leaf.value);
    leafKeys.set(leaf, key);
  }
  return key;
}

/** The order leaves are kept in and reduced in: source, then canonical value. */
function leafOrder(x: ProvenanceLeaf, y: ProvenanceLeaf): number {
  if (x.source !== y.source) return x.source < y.source ? -1 : 1;
  const vx = leafKey(x);
  const vy = leafKey(y);
  return vx < vy ? -1 : vx > vy ? 1 : 0;
}

/** tieBreakProvenance's order, applied to two leaves: agentId, opId, source, canonical value. */
function tieBreakLeaf(x: ProvenanceLeaf, y: ProvenanceLeaf): ProvenanceLeaf {
  const agentX = String(x.context?.agentId ?? '');
  const agentY = String(y.context?.agentId ?? '');
  if (agentX !== agentY) return agentX < agentY ? x : y;
  const opX = String(x.context?.opId ?? '');
  const opY = String(y.context?.opId ?? '');
  if (opX !== opY) return opX < opY ? x : y;
  if (x.source !== y.source) return x.source < y.source ? x : y;
  const vx = leafKey(x);
  const vy = leafKey(y);
  if (vx !== vy) return vx <= vy ? x : y;
  return x;
}

/**
 * The context a tropical merge carries, chosen over EVERY leaf: the highest
 * authority weight, the leaf tie-break among equals. It used to be chosen
 * pairwise against a running total whose joined source name sorts unlike its
 * leaves ('a⊗b1' against 'a1': U+2297 sorts after '1'), so it forked on
 * arrival order (claude3's review of #318). For two plain operands this is
 * exactly the pairwise choice.
 */
function contextOverLeaves(leaves: ProvenanceLeaf[]): ProvenanceContext | undefined {
  let best = leaves[0];
  let bestWeight = authorityWeight(best.context?.authorityLevel ?? 0, best.context?.reputationScore);
  for (let i = 1; i < leaves.length; i += 1) {
    const leaf = leaves[i];
    const weight = authorityWeight(leaf.context?.authorityLevel ?? 0, leaf.context?.reputationScore);
    if (weight > bestWeight || (weight === bestWeight && tieBreakLeaf(best, leaf) === leaf)) {
      best = leaf;
      bestWeight = weight;
    }
  }
  return best.context;
}

/**
 * Canonical n-ary merge (task_1790058854739_8jh1, adversarial review of #312).
 *
 * add() left-folds multiply() in trait arrival order, and every merging
 * strategy used to build its result pairwise: source `srcA < srcB ? A+B : B+A`,
 * value `a + b`. That is commutative for two operands and NOT associative for
 * three: fold(A,B,C) wrote 'A+B+C' while fold(A,C,B) wrote 'A+C+B', and float
 * addition moved the value with the order. vec-component-sum is a default rule
 * (velocity, acceleration, angularVelocity) and DistributedTransformGraph
 * hashes provenance, so two agents composing the same traits in a different
 * order could disagree about a hash.
 *
 * Here a merge is rebuilt from the sorted set of LEAF contributions: the source
 * is the sorted leaf names joined by the operator and the value is the
 * reduction in that same order, so every arrival order yields one
 * serialisation. Leaves sharing a name are ordered by their canonical value.
 *
 * Equal values are one fact over the LEAF set: leaves whose values are equal
 * (the `a.value === b.value` rule multiply() applies to two plain operands)
 * collapse to their tie-break winner before the reduction. The pairwise rule
 * used to run against the running total instead, so sum(A=2, B=3, C=5) dropped
 * C in two arrival orders of six (5 === 5) and summed it in the other four,
 * and the value and the hash forked (claude3's review of #318). Two plain
 * operands give exactly what main gave: sum(2, 2) is still 2.
 *
 * A merged value's leaf list is kept sorted and free of equal values, so a
 * step only places the new leaves into a copy of it (a scan for an equal
 * value, a binary search, one splice) instead of rebuilding and re-sorting
 * the whole set: add() of 1,000 contributions was 40-80x main's time.
 */
function mergeCanonical(
  a: ProvenanceValue,
  b: ProvenanceValue,
  operator: string,
  reduce: (acc: unknown, next: unknown) => unknown,
  extra: (leaves: ProvenanceLeaf[]) => Partial<ProvenanceValue> = () => ({})
): ProvenanceValue {
  const aLeaves = leavesOf(a);
  const bLeaves = leavesOf(b);
  const aCanonical = canonicalLeafLists.has(aLeaves);
  const base = aCanonical ? aLeaves : canonicalLeafLists.has(bLeaves) ? bLeaves : [];
  const rest = aCanonical ? bLeaves : base === bLeaves ? aLeaves : [...aLeaves, ...bLeaves];
  const leaves = base.slice();
  for (const leaf of rest) insertLeaf(leaves, leaf);
  canonicalLeafLists.add(leaves);
  let value = leaves[0].value;
  for (let i = 1; i < leaves.length; i += 1) value = reduce(value, leaves[i].value);
  return {
    ...extra(leaves),
    value,
    source: leaves.map((leaf) => leaf.source).join(operator),
    contributions: leaves,
  };
}

/** Leaf lists built by mergeCanonical: sorted by leafOrder, no two values equal. */
const canonicalLeafLists = new WeakSet<ProvenanceLeaf[]>();

/**
 * Place one leaf into a canonical list. A leaf whose value equals one already
 * there is the same fact: the tie-break winner of the two stays. `===` never
 * matches NaN, so NaN never collapses.
 */
function insertLeaf(leaves: ProvenanceLeaf[], leaf: ProvenanceLeaf): void {
  let placing = leaf;
  const isNaNValue = typeof leaf.value === 'number' && Number.isNaN(leaf.value);
  if (!isNaNValue) {
    const twin = leaves.findIndex((existing) => existing.value === leaf.value);
    if (twin !== -1) {
      const winner = tieBreakLeaf(leaves[twin], leaf);
      if (winner === leaves[twin]) return;
      leaves.splice(twin, 1);
      placing = winner;
    }
  }
  let lo = 0;
  let hi = leaves.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (leafOrder(leaves[mid], placing) <= 0) lo = mid + 1;
    else hi = mid;
  }
  leaves.splice(lo, 0, placing);
}

export interface ProvenanceContext {
  /** Authority weight (e.g., Founder=100, Agent=50, Guest=0) */
  authorityLevel: number;
  agentId?: string;
  /** Stable operation identifier for deterministic CRDT tie-breaking. */
  opId?: string;
  sourceType?: 'user' | 'agent' | 'system';
  /** Optional reputation score from HoloMesh (0-100) — threads reputation into algebra */
  reputationScore?: number;
}

/** One trait's own contribution to a merged value: the leaf a merging strategy folds over. */
export interface ProvenanceLeaf {
  source: string;
  value: unknown;
  /** The contributing trait's context, so tie-breaks and context choices see every leaf. */
  context?: ProvenanceContext;
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
  /**
   * For a value built by a merging strategy (sum, multiply, tropical, the
   * vector component strategies): the leaf contributions it was reduced from,
   * sorted by source. Carried so a later merge can rebuild the result from
   * every leaf instead of folding onto an intermediate (see mergeCanonical).
   */
  contributions?: ProvenanceLeaf[];
}

export type ProvenanceConfig = Record<string, ProvenanceValue>;

export interface TraitApplication {
  name: string;
  config: Record<string, unknown>;
  layer?: number; // Priority layer (e.g., visual > physics)
  context?: ProvenanceContext;
}

// =============================================================================
// VECTOR VALUE SUPPORT (paper-3 §5.2 extension)
// =============================================================================

/**
 * A numeric vector (fixed-length array of numbers).
 * Used for stress tensors, velocity fields, displacement vectors, etc.
 */
export type VectorValue = number[];

/** Return true when value is a non-empty VectorValue (array of numbers). */
export function isVectorValue(v: unknown): v is VectorValue {
  return Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number');
}

/** L2-magnitude of a VectorValue. */
export function vecMagnitude(v: VectorValue): number {
  let sum = 0;
  for (const x of v) sum += x * x;
  return Math.sqrt(sum);
}

/** Component-wise addition: a + b (same dimensionality required). */
export function vecAdd(a: VectorValue, b: VectorValue): VectorValue {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensionality mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((ai, i) => ai + b[i]);
}

/** Component-wise max: max(a_i, b_i). */
export function vecComponentMax(a: VectorValue, b: VectorValue): VectorValue {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensionality mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((ai, i) => Math.max(ai, b[i]));
}

/** Component-wise min: min(a_i, b_i). */
export function vecComponentMin(a: VectorValue, b: VectorValue): VectorValue {
  if (a.length !== b.length) {
    throw new Error(`Vector dimensionality mismatch: ${a.length} vs ${b.length}`);
  }
  return a.map((ai, i) => Math.min(ai, b[i]));
}

/**
 * Authority-weighted blend: picks the vector from the higher-authority source.
 * When authority is equal, falls back to magnitude tiebreak then lexicographic.
 */
export function vecAuthorityPick(
  a: VectorValue,
  weightA: number,
  b: VectorValue,
  weightB: number
): VectorValue {
  const eps = 1e-12;
  if (Math.abs(weightA - weightB) > eps) return weightA > weightB ? a : b;
  // Tiebreak: larger magnitude wins (physical dominance)
  const magA = vecMagnitude(a);
  const magB = vecMagnitude(b);
  if (Math.abs(magA - magB) > eps) return magA >= magB ? a : b;
  // Final tiebreak: lexicographic on stringified values
  return JSON.stringify(a) <= JSON.stringify(b) ? a : b;
}

export interface ConflictResolutionRule {
  /** Domain property (e.g., 'type', 'mass', 'color') */
  property: string;
  /** Strategy to apply when settling values */
  strategy:
    | 'max'
    | 'min'
    | 'sum'
    | 'multiply'
    | 'tropical-min-plus'
    | 'tropical-max-plus'
    | 'strict-error'
    | 'domain-override'
    | 'authority-weighted'
    // ── vector strategies (paper-3 §5.2) ──
    | 'vec-component-max'
    | 'vec-component-min'
    | 'vec-component-sum'
    | 'vec-magnitude-max'
    | 'vec-authority-weighted';
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
    this.rules.set('type', {
      property: 'type',
      strategy: 'domain-override',
      precedence: ['kinematic', 'physics', 'collidable', 'static'],
    });
    this.rules.set('mass', { property: 'mass', strategy: 'authority-weighted' });
    this.rules.set('friction', { property: 'friction', strategy: 'max' });
    this.rules.set('restitution', { property: 'restitution', strategy: 'min' });
    // Visual conflict resolution (borrowed from TraitCompositor)
    this.rules.set('color', {
      property: 'color',
      strategy: 'domain-override',
      precedence: ['material', 'color', 'hoverable', 'glowing'],
    });
    this.rules.set('opacity', { property: 'opacity', strategy: 'min' });
    // Vector physics properties (paper-3 §5.2)
    this.rules.set('velocity', { property: 'velocity', strategy: 'vec-component-sum' });
    this.rules.set('acceleration', { property: 'acceleration', strategy: 'vec-component-sum' });
    this.rules.set('angularVelocity', {
      property: 'angularVelocity',
      strategy: 'vec-component-sum',
    });
    this.rules.set('stressTensor', { property: 'stressTensor', strategy: 'vec-component-max' });
    this.rules.set('displacementField', {
      property: 'displacementField',
      strategy: 'vec-magnitude-max',
    });
    this.rules.set('forceField', { property: 'forceField', strategy: 'vec-authority-weighted' });
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
          deadElements.push(
            createDeadElement(
              'semiring',
              `${trait.name}.${key}`,
              `TRAIT_ZERO encountered during addition: property '${key}' from @${trait.name}`
            )
          );
          continue; // A ⊕ 0 = A (Identity)
        }

        if (!(key in acc)) {
          // Zero element identity
          acc[key] = { value, source: trait.name, context: trait.context };
        } else {
          // Conflict detected, apply Semiring multiplication (⊗)
          const existing = acc[key];
          try {
            acc[key] = this.multiply(
              existing,
              { value, source: trait.name, context: trait.context },
              key
            );
            conflicts.push(
              `Resolved conflict on property '${key}' between @${existing.source} and @${trait.name}`
            );
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
    // Idempotent value, deterministic provenance, for two PLAIN operands. When either
    // side is a merged value (it carries contributions) the merging strategy decides
    // equality over its leaves (mergeCanonical): a running total that happens to equal
    // the next value is not the same fact.
    if (a.value === b.value && !a.contributions?.length && !b.contributions?.length) {
      return tieBreakProvenance(a, b);
    }

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
      throw new Error(
        `Unresolved conflict on '${property}': @${a.source} (${a.value}) vs @${b.source} (${b.value})`
      );
    }

    // Authority weights for modulating numeric strategies
    const weightA = authorityWeight(a.context?.authorityLevel ?? 0, a.context?.reputationScore);
    const weightB = authorityWeight(b.context?.authorityLevel ?? 0, b.context?.reputationScore);

    if (rule && (rule.strategy === 'tropical-min-plus' || rule.strategy === 'tropical-max-plus')) {
      const semiring = strategyToSemiring(rule.strategy);
      if (!semiring) {
        throw new Error(`No semiring adapter available for strategy '${rule.strategy}'`);
      }
      return mergeCanonical(
        a,
        b,
        '⊗',
        (x, y) => semiring.mul(x as number, y as number),
        (leaves) => ({ context: contextOverLeaves(leaves) })
      );
    }

    switch (rule.strategy) {
      case 'max': {
        const valA = a.value as number;
        const valB = b.value as number;
        if (valA === valB) return tieBreakProvenance(a, b);
        return {
          value: Math.max(valA, valB),
          source: valA > valB ? a.source : b.source,
        };
      }
      case 'min': {
        const valA = a.value as number;
        const valB = b.value as number;
        if (valA === valB) return tieBreakProvenance(a, b);
        return {
          value: Math.min(valA, valB),
          source: valA < valB ? a.source : b.source,
        };
      }
      case 'sum':
        return mergeCanonical(a, b, '+', (x, y) => (x as number) + (y as number));
      case 'multiply':
        return mergeCanonical(a, b, '*', (x, y) => (x as number) * (y as number));

      case 'authority-weighted': {
        // C1: Authority MODULATES the numeric outcome instead of bypassing rules.
        // Each value is scaled by its authority weight, then compared.
        const scaledA = (a.value as number) * weightA;
        const scaledB = (b.value as number) * weightB;
        const eps = 1e-12;
        if (Math.abs(scaledA - scaledB) <= eps) {
          return tieBreakProvenance(a, b);
        }
        return scaledA > scaledB
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
            if (weightA !== weightB) return weightA > weightB ? a : b;
            return tieBreakProvenance(a, b);
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
          return tieBreakProvenance(a, b);
        }
      }

      // ── vector strategies (paper-3 §5.2) ────────────────────────────────
      case 'vec-component-max': {
        if (!isVectorValue(a.value) || !isVectorValue(b.value)) {
          throw new Error(
            `vec-component-max requires VectorValue on property '${property}': ` +
              `got ${JSON.stringify(a.value)} and ${JSON.stringify(b.value)}`
          );
        }
        return mergeCanonical(a, b, '⊕max', (x, y) => vecComponentMax(x as VectorValue, y as VectorValue));
      }

      case 'vec-component-min': {
        if (!isVectorValue(a.value) || !isVectorValue(b.value)) {
          throw new Error(
            `vec-component-min requires VectorValue on property '${property}': ` +
              `got ${JSON.stringify(a.value)} and ${JSON.stringify(b.value)}`
          );
        }
        return mergeCanonical(a, b, '⊕min', (x, y) => vecComponentMin(x as VectorValue, y as VectorValue));
      }

      case 'vec-component-sum': {
        if (!isVectorValue(a.value) || !isVectorValue(b.value)) {
          throw new Error(
            `vec-component-sum requires VectorValue on property '${property}': ` +
              `got ${JSON.stringify(a.value)} and ${JSON.stringify(b.value)}`
          );
        }
        return mergeCanonical(a, b, '+', (x, y) => vecAdd(x as VectorValue, y as VectorValue));
      }

      case 'vec-magnitude-max': {
        if (!isVectorValue(a.value) || !isVectorValue(b.value)) {
          throw new Error(
            `vec-magnitude-max requires VectorValue on property '${property}': ` +
              `got ${JSON.stringify(a.value)} and ${JSON.stringify(b.value)}`
          );
        }
        const magA = vecMagnitude(a.value);
        const magB = vecMagnitude(b.value);
        const eps = 1e-12;
        if (Math.abs(magA - magB) <= eps) {
          // Equal magnitude: pick by lexicographic source for commutativity
          const srcA = String(a.source);
          const srcB = String(b.source);
          return srcA <= srcB ? a : b;
        }
        return magA > magB ? a : b;
      }

      case 'vec-authority-weighted': {
        if (!isVectorValue(a.value) || !isVectorValue(b.value)) {
          throw new Error(
            `vec-authority-weighted requires VectorValue on property '${property}': ` +
              `got ${JSON.stringify(a.value)} and ${JSON.stringify(b.value)}`
          );
        }
        const winner = vecAuthorityPick(a.value, weightA, b.value, weightB);
        const isA = winner === a.value;
        return isA
          ? { value: a.value, source: a.source, context: a.context }
          : { value: b.value, source: b.source, context: b.context };
      }

      case 'strict-error':
      default:
        throw new Error(
          `Composition conflict: @${a.source} and @${b.source} both supply '${property}' = ${a.value} vs ${b.value}`
        );
    }
  }
}
