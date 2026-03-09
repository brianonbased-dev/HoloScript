/**
 * @fileoverview HoloScript VR Effect Type System
 * @module @holoscript/core/types/effects
 *
 * Defines a 10-category effect taxonomy for spatial computing.
 * Standard effects (IO, State, Exception) plus 7 VR-specific categories
 * (Physics, Render, Audio, Inventory, Authority, Resource, Agent).
 *
 * Effects are row-polymorphic: a function's effect row is the union of
 * all callee effects. This enables compile-time verification that agent
 * code only produces declared effects.
 *
 * Inspired by: Koka (row-polymorphic effects), Move (linear resources),
 * GASTAP (abstract interpretation budgets).
 *
 * @version 1.0.0
 */

// =============================================================================
// EFFECT ATOMS — Individual effect operations
// =============================================================================

/** Standard IO effects */
export type IOEffect = 'io:read' | 'io:write' | 'io:network' | 'io:timer';

/** State mutation effects */
export type StateEffect = 'state:read' | 'state:write' | 'state:global' | 'state:persistent';

/** Exception effects */
export type ExceptionEffect = 'exception:throw' | 'exception:catch' | 'exception:panic';

/** Physics simulation effects (VR-specific) */
export type PhysicsEffect =
  | 'physics:force'
  | 'physics:impulse'
  | 'physics:collision'
  | 'physics:teleport'
  | 'physics:gravity'
  | 'physics:joint';

/** Rendering effects (VR-specific) */
export type RenderEffect =
  | 'render:spawn'
  | 'render:destroy'
  | 'render:material'
  | 'render:particle'
  | 'render:light'
  | 'render:shader'
  | 'render:gaussian';

/** Audio effects (VR-specific) */
export type AudioEffect =
  | 'audio:play'
  | 'audio:stop'
  | 'audio:spatial'
  | 'audio:global'
  | 'audio:reverb';

/** Inventory/ownership effects (VR-specific) */
export type InventoryEffect =
  | 'inventory:take'
  | 'inventory:give'
  | 'inventory:destroy'
  | 'inventory:duplicate'
  | 'inventory:trade';

/** Authority/permission effects (VR-specific) */
export type AuthorityEffect =
  | 'authority:own'
  | 'authority:delegate'
  | 'authority:revoke'
  | 'authority:zone'
  | 'authority:world';

/** Compute resource effects (VR-specific) */
export type ResourceEffect =
  | 'resource:cpu'
  | 'resource:memory'
  | 'resource:gpu'
  | 'resource:bandwidth'
  | 'resource:storage';

/** Agent lifecycle effects (VR-specific) */
export type AgentEffect =
  | 'agent:spawn'
  | 'agent:kill'
  | 'agent:communicate'
  | 'agent:observe'
  | 'agent:control';

/** Union of all possible effects */
export type VREffect =
  | IOEffect
  | StateEffect
  | ExceptionEffect
  | PhysicsEffect
  | RenderEffect
  | AudioEffect
  | InventoryEffect
  | AuthorityEffect
  | ResourceEffect
  | AgentEffect;

// =============================================================================
// EFFECT CATEGORIES
// =============================================================================

/** The 10 effect categories */
export type EffectCategory =
  | 'io'
  | 'state'
  | 'exception'
  | 'physics'
  | 'render'
  | 'audio'
  | 'inventory'
  | 'authority'
  | 'resource'
  | 'agent';

/** Map effect to its category */
export function effectCategory(effect: VREffect): EffectCategory {
  return effect.split(':')[0] as EffectCategory;
}

/** All effects in a given category */
export const EFFECTS_BY_CATEGORY: Record<EffectCategory, readonly VREffect[]> = {
  io: ['io:read', 'io:write', 'io:network', 'io:timer'],
  state: ['state:read', 'state:write', 'state:global', 'state:persistent'],
  exception: ['exception:throw', 'exception:catch', 'exception:panic'],
  physics: [
    'physics:force',
    'physics:impulse',
    'physics:collision',
    'physics:teleport',
    'physics:gravity',
    'physics:joint',
  ],
  render: [
    'render:spawn',
    'render:destroy',
    'render:material',
    'render:particle',
    'render:light',
    'render:shader',
    'render:gaussian',
  ],
  audio: ['audio:play', 'audio:stop', 'audio:spatial', 'audio:global', 'audio:reverb'],
  inventory: [
    'inventory:take',
    'inventory:give',
    'inventory:destroy',
    'inventory:duplicate',
    'inventory:trade',
  ],
  authority: [
    'authority:own',
    'authority:delegate',
    'authority:revoke',
    'authority:zone',
    'authority:world',
  ],
  resource: [
    'resource:cpu',
    'resource:memory',
    'resource:gpu',
    'resource:bandwidth',
    'resource:storage',
  ],
  agent: ['agent:spawn', 'agent:kill', 'agent:communicate', 'agent:observe', 'agent:control'],
};

// =============================================================================
// EFFECT ROWS — Row-polymorphic effect composition
// =============================================================================

/**
 * An EffectRow is an immutable set of effects declared/inferred for a function.
 * Row-polymorphic: function generic over `<E>` means "any additional effects."
 */
export class EffectRow {
  /** Internal effect set */
  private readonly effects: ReadonlySet<VREffect>;

  constructor(effects: Iterable<VREffect> = []) {
    this.effects = new Set(effects);
  }

  /** The pure row — no effects at all */
  static readonly PURE = new EffectRow([]);

  /** Create from effect strings */
  static of(...effects: VREffect[]): EffectRow {
    return new EffectRow(effects);
  }

  /** Create from a category — include all effects in that category */
  static fromCategory(cat: EffectCategory): EffectRow {
    return new EffectRow(EFFECTS_BY_CATEGORY[cat]);
  }

  /** Row union (composition): this ∪ other */
  union(other: EffectRow): EffectRow {
    const merged = new Set(this.effects);
    for (const e of other.effects) merged.add(e);
    return new EffectRow(merged);
  }

  /** Row intersection: effects in both rows */
  intersect(other: EffectRow): EffectRow {
    const common: VREffect[] = [];
    for (const e of this.effects) {
      if (other.has(e)) common.push(e);
    }
    return new EffectRow(common);
  }

  /** Row difference: effects in this but not other */
  difference(other: EffectRow): EffectRow {
    const diff: VREffect[] = [];
    for (const e of this.effects) {
      if (!other.has(e)) diff.push(e);
    }
    return new EffectRow(diff);
  }

  /** Does this row contain the given effect? */
  has(effect: VREffect): boolean {
    return this.effects.has(effect);
  }

  /** Does this row contain ALL effects from the other row? (subtyping) */
  subsumes(other: EffectRow): boolean {
    for (const e of other.effects) {
      if (!this.effects.has(e)) return false;
    }
    return true;
  }

  /** Check if this row has any effects from a given category */
  hasCategory(cat: EffectCategory): boolean {
    for (const e of this.effects) {
      if (effectCategory(e) === cat) return true;
    }
    return false;
  }

  /** Get all effects of a given category in this row */
  ofCategory(cat: EffectCategory): VREffect[] {
    return [...this.effects].filter((e) => effectCategory(e) === cat);
  }

  /** Is this the pure (no-effect) row? */
  isPure(): boolean {
    return this.effects.size === 0;
  }

  /** Number of effects */
  get size(): number {
    return this.effects.size;
  }

  /** Get all effects as array */
  toArray(): VREffect[] {
    return [...this.effects];
  }

  /** Get categories present in this row */
  categories(): EffectCategory[] {
    const cats = new Set<EffectCategory>();
    for (const e of this.effects) cats.add(effectCategory(e));
    return [...cats];
  }

  /** Human-readable representation */
  toString(): string {
    if (this.isPure()) return '<pure>';
    return `<${this.toArray().join(', ')}>`;
  }

  /** Serialize to JSON-friendly format */
  toJSON(): VREffect[] {
    return this.toArray();
  }

  /** Deserialize from JSON */
  static fromJSON(arr: VREffect[]): EffectRow {
    return new EffectRow(arr);
  }
}

// =============================================================================
// EFFECT DECLARATIONS — Annotations on functions/traits
// =============================================================================

/** Severity when an undeclared effect is detected */
export type EffectViolationSeverity = 'error' | 'warning' | 'info';

/** An effect violation found during compile-time checking */
export interface EffectViolation {
  /** The undeclared effect */
  effect: VREffect;
  /** Where in source code */
  source: { file?: string; line?: number; column?: number; functionName?: string };
  /** Human-readable message */
  message: string;
  /** Severity */
  severity: EffectViolationSeverity;
  /** Suggested fix */
  suggestion?: string;
}

/** Effect declaration on a function or trait */
export interface EffectDeclaration {
  /** The declared effect row (what effects this function MAY produce) */
  declared: EffectRow;
  /** Whether this is explicitly annotated or inferred */
  origin: 'annotated' | 'inferred';
  /** Source location of the declaration */
  source?: { file?: string; line?: number };
}

// =============================================================================
// EFFECT TRUST LEVELS — For marketplace safety certificates
// =============================================================================

/** Trust levels for effect declarations */
export type EffectTrustLevel = 'verified' | 'declared' | 'inferred' | 'unknown';

/** Safety certificate for a compiled module */
export interface EffectCertificate {
  /** Module identifier */
  moduleId: string;
  /** Combined effect row for the entire module */
  effects: EffectRow;
  /** Trust level */
  trust: EffectTrustLevel;
  /** Per-function effect breakdown */
  functions: Map<string, EffectDeclaration>;
  /** Timestamp */
  timestamp: number;
  /** Version of the checker that produced this */
  checkerVersion: string;
}
