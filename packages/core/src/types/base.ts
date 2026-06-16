/**
 * Base Type Definitions
 * Extracted to avoid circular dependencies between types.ts, AdvancedTypeSystem.ts, and HoloScriptPlus.ts
 *
 */
import type { HSPlusDirective } from './AdvancedTypeSystem';
import type { ProvenanceContext } from '../compiler/traits/ProvenanceSemiring';

// ============================================================================
// Spatial Types (canonical definitions — re-exported by types.ts)
// ============================================================================

export type SpatialPosition = [number, number, number];

/** Runtime trait behavior handle (mesh / agent interop). */
export interface TraitBehavior {
  traitId?: string;
  name?: string;
  enabled?: boolean;
}

export type HologramShape =
  | 'orb'
  | 'cube'
  | 'cylinder'
  | 'pyramid'
  | 'sphere'
  | 'function'
  | 'gate'
  | 'stream'
  | 'server'
  | 'database'
  | 'fetch';

export interface HologramProperties {
  shape: HologramShape;
  color: string;
  size: number;
  glow: boolean;
  interactive: boolean;
}

// ============================================================================
// VR Trait Names
// ============================================================================

export type VRTraitName =
  | 'grabbable'
  | 'throwable'
  | 'pointable'
  | 'hoverable'
  | 'scalable'
  | 'rotatable'
  | 'stackable'
  | 'snappable'
  | 'breakable'
  | 'skeleton'
  | 'body'
  | 'haptic'
  | 'gaussian_splat'
  | 'holomap_reconstruct'
  | 'holomap_camera_trajectory'
  | 'holomap_anchor_context'
  | 'holomap_drift_correction'
  | 'holomap_splat_output'
  | 'nerf'
  | 'volumetric_video'
  | 'orbital'
  | 'mitosis'
  | 'portal'
  | 'vfx'
  | 'raycast'
  | 'speech'
  | 'gesture'
  | 'emoji'
  | 'audio'
  | 'video'
  | 'networked'
  | 'synced'
  | 'compute'
  | 'hidd'
  | 'seated'
  | 'eye_tracked'
  | 'hitl'
  | 'interactive_graph'
  | 'draft'
  | 'hot_reload'
  | 'motion_source'
  | (string & {}); // Allow any string for extensibility while preserving autocomplete

// ============================================================================
// VR Effect Types
// ============================================================================

export type VREffect = string;

// ============================================================================
// Base AST Node
// ============================================================================

export interface BaseASTNode {
  type: string;
  id?: string;
  position?: SpatialPosition;
  hologram?: HologramProperties;
  /** Source line number (1-indexed) */
  line?: number;
  /** Source column number (0-indexed) */
  column?: number;
}

/**
 * Full ASTNode with directives and traits.
 * Uses import type for HSPlusDirective (erased at compile time, no circular dependency).
 */
export interface ASTNode extends BaseASTNode {
  /** HS+ Directives */
  directives?: HSPlusDirective[];
  /** HS+ Traits (Pre-processed map) */
  traits?: Map<VRTraitName, Record<string, unknown>>;
  /** Spatial Feed Provenance */
  provenance?: {
    author: string;
    timestamp: number;
    provenanceHash: string;
    context?: ProvenanceContext; // Algebraic weight threading
  };
}

// ============================================================================
// Game-Logic AST Nodes (MMO / game constructs for .hs game-logic files)
// ============================================================================

/** A single event sub-block inside an ability: on_cast, on_hit, on_miss, etc. */
export interface AbilityEventBlock {
  event: string;
  params: string[];
  body: string;
}

/**
 * `ability <name> { ... }` — declares a combat or gameplay ability.
 * Compiles to CombatAbilityTrait handler entries; server-authoritative by default.
 */
export interface GameAbilityNode extends ASTNode {
  type: 'game-ability';
  name: string;
  properties: Record<string, unknown>;
  eventBlocks?: AbilityEventBlock[];
}

/**
 * A single entry inside a `loot_table` block.
 */
export interface LootTableEntry {
  kind: string;
  name: string;
  properties: Record<string, unknown>;
  directives: HSPlusDirective[];
}

/**
 * `loot_table <name> { ... }` — declares a typed loot drop table.
 */
export interface GameLootTableNode extends ASTNode {
  type: 'game-loot-table';
  name: string;
  entries: LootTableEntry[];
}

/**
 * `spawn <name> { ... }` — server-authoritative entity spawn rule.
 * Binds an entity type to a zone with respawn interval, max count, loot table, and faction.
 */
export interface GameSpawnNode extends ASTNode {
  type: 'game-spawn';
  name: string;
  properties: Record<string, unknown>;
}

/**
 * `authority <name> { ... }` — multiplayer authority declaration.
 * Maps to the correct authority model per target runtime (Unreal / Unity / R3F).
 */
export interface GameAuthorityNode extends ASTNode {
  type: 'game-authority';
  name: string;
  properties: Record<string, unknown>;
}

/**
 * Reaction category — lets a downstream compiler route a reaction block to the
 * right runtime surface without hardcoding a domain vocabulary into core.
 * - `interaction`: player/agent-driven (on_interact, on_grab, on_use, on_hover…)
 * - `collision`:   physics contacts (on_collision, on_proximity)
 * - `lifecycle`:   spawn/despawn/tick (on_spawn, on_death, on_enter, on_exit, on_tick)
 * - `movement`:    locomotion events (on_move, on_walk, on_run, on_land, on_teleport…)
 * - `combat`:      MMO combat events (on_combat, on_cast) — kept for back-compat
 * - `signal`:      generic named bus events (on_signal, on_input)
 * - `custom`:      anything not in the known set
 */
export type ReactionCategory =
  | 'interaction'
  | 'collision'
  | 'lifecycle'
  | 'movement'
  | 'combat'
  | 'signal'
  | 'custom';

/**
 * Top-level reaction / event block: `on_combat`, `on_death`, `on_spawn`, `on_cast`,
 * plus the domain-neutral interaction & lifecycle triggers (`on_interact`,
 * `on_collision`, `on_proximity`, `on_grab`, `on_release`, `on_use`, `on_hover`,
 * `on_enter`, `on_exit`, `on_signal`, `on_input`, `on_tick`).
 * Returns a structured node the downstream compiler maps to the target runtime's
 * event system. `category` is inferred from the trigger name.
 */
export interface GameEventBlockNode extends ASTNode {
  type: 'game-event-block';
  name: string;
  params: string[];
  body: string;
  /** Inferred routing bucket for the trigger (see ReactionCategory). */
  category?: ReactionCategory;
  properties: Record<string, unknown>;
}

/**
 * `move <target> to <dest> [over <duration>] [via <mode>] [easing <ease>]`
 * — a first-class movement statement. `dest` is either a `[x, y, z]` position
 * literal or the id of another entity (follow/seek). `mode` selects the
 * locomotion style the compiler emits (glide | teleport | walk | fly | path |
 * orbit | snap). Serves the always-add-VR-locomotion requirement (F.118): VR
 * targets get glide + snap-turn + teleport from a single declaration.
 */
export interface MovementStatementNode extends ASTNode {
  type: 'movement';
  /** Entity being moved (`self` when omitted). */
  target: string;
  /** Destination: a position triple, or an entity id to follow/seek. */
  destination: [number, number, number] | string;
  /** Seconds the movement takes; 0/undefined = instant. */
  duration?: number;
  /** Locomotion style: glide | teleport | walk | run | fly | swim | path | orbit | snap | follow. */
  mode?: string;
  /** Easing curve name (linear | ease_in | ease_out | ease_in_out | spring). */
  easing?: string;
  properties: Record<string, unknown>;
}

/** A single declarative requirement/effect line inside an `action` block. */
export interface ActionClause {
  /** Clause kind: requires | cost | cooldown | effect | animation | grants | emits. */
  kind: string;
  /** Raw clause body (expression or block contents). */
  body: string;
}

/**
 * `action <name>(params) { @requires {…} @cost {…} @cooldown <t> effect {…}
 *  animation: <clip> }` — a domain-neutral verb an entity can perform. This is
 * the general form the MMO `ability` is one specialization of: any interaction
 * verb (open, craft, harvest, plant, cast, interact) with preconditions,
 * resource cost, cooldown, effects, and an animation binding.
 */
export interface ActionDeclNode extends ASTNode {
  type: 'action-decl';
  name: string;
  params: string[];
  /** Parsed `@requires`/`@cost`/effect/etc. clauses. */
  clauses: ActionClause[];
  /** Authority/replication flags such as server_side / client_side / replicated. */
  flags: string[];
  properties: Record<string, unknown>;
}

// ============================================================================
// AbilityDirectives — typed, safely-coerced view of GameAbilityNode.properties
// ============================================================================

/**
 * Typed combat-ability directives extracted from a `GameAbilityNode`'s
 * untyped `properties` bag.  All fields are optional at the source level;
 * `getAbilityDirectives` fills every field with a safe default so consumers
 * never need to re-coerce or guard for `undefined`.
 *
 * Property alias map (any alias is accepted; first match wins):
 * - `cooldownMs`    ← `cooldown` | `cooldown_ms` | `cooldownMs`
 * - `manaCost`      ← `mana_cost` | `manaCost`
 * - `gcdMs`         ← `gcd` | `gcd_ms` | `gcdMs`
 * - `range`         ← `range`
 * - `damageType`    ← `damage_type` | `damageType`
 * - `authorityEnvelope` ← `authority` | `authority_envelope` | `authorityEnvelope`
 * - `castTimeMs`    ← `cast_time` | `cast_time_ms` | `castTimeMs`
 */
export interface AbilityDirectives {
  /** Cooldown before the ability may be used again, in milliseconds. Default 0. */
  cooldownMs: number;
  /** Mana (or equivalent resource) cost per use. Default 0. */
  manaCost: number;
  /** Global Cooldown duration in milliseconds; 0 means no GCD. Default 0. */
  gcdMs: number;
  /** Maximum effective range in world-units. Default 0 (unlimited / melee). */
  range: number;
  /** Damage archetype used by the combat resolver. Default 'physical'. */
  damageType: string;
  /**
   * Which authority layer resolves this ability.
   * - `'server'`           — fully server-authoritative (safe default).
   * - `'client_predicted'` — client sends intent, server reconciles.
   * - `'client'`           — client-resolved only (cosmetic / local feedback).
   * Default 'server'.
   */
  authorityEnvelope: 'server' | 'client_predicted' | 'client';
  /** Cast / channel time before the ability fires, in milliseconds. Default 0. */
  castTimeMs: number;
}

// ---------------------------------------------------------------------------
// Private coercion helpers (module-scoped, not exported)
// ---------------------------------------------------------------------------

/** Coerce an unknown property value to a number, or return `fallback`. */
function coerceNumber(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Coerce an unknown property value to a string, or return `fallback`.
 * Strips a single layer of surrounding single- or double-quotes if present.
 */
function coerceString(v: unknown, fallback: string): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  let s = String(v).trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.length > 0 ? s : fallback;
}

/** The exhaustive set of valid `authorityEnvelope` literal values. */
const AUTHORITY_VALUES = new Set<AbilityDirectives['authorityEnvelope']>([
  'server',
  'client_predicted',
  'client',
]);

// ---------------------------------------------------------------------------
// Public accessor
// ---------------------------------------------------------------------------

/**
 * Extract typed, safely-coerced {@link AbilityDirectives} from a
 * {@link GameAbilityNode}.  All fields carry a sensible default so callers
 * in the combat pass can read `directives.cooldownMs` without re-coercing or
 * guarding for `undefined`.
 *
 * @pure — reads `node.properties` but never mutates the node.
 */
export function getAbilityDirectives(node: GameAbilityNode): AbilityDirectives {
  const p = node.properties;

  // cooldownMs: cooldown | cooldown_ms | cooldownMs
  const cooldownMs = coerceNumber(
    p['cooldown'] ?? p['cooldown_ms'] ?? p['cooldownMs'],
    0,
  );

  // manaCost: mana_cost | manaCost
  const manaCost = coerceNumber(p['mana_cost'] ?? p['manaCost'], 0);

  // gcdMs: gcd | gcd_ms | gcdMs
  const gcdMs = coerceNumber(p['gcd'] ?? p['gcd_ms'] ?? p['gcdMs'], 0);

  // range
  const range = coerceNumber(p['range'], 0);

  // damageType: damage_type | damageType
  const damageType = coerceString(
    p['damage_type'] ?? p['damageType'],
    'physical',
  );

  // authorityEnvelope: authority | authority_envelope | authorityEnvelope
  const rawAuthority = coerceString(
    p['authority'] ?? p['authority_envelope'] ?? p['authorityEnvelope'],
    'server',
  );
  const authorityEnvelope: AbilityDirectives['authorityEnvelope'] =
    AUTHORITY_VALUES.has(rawAuthority as AbilityDirectives['authorityEnvelope'])
      ? (rawAuthority as AbilityDirectives['authorityEnvelope'])
      : 'server';

  // castTimeMs: cast_time | cast_time_ms | castTimeMs
  const castTimeMs = coerceNumber(
    p['cast_time'] ?? p['cast_time_ms'] ?? p['castTimeMs'],
    0,
  );

  return {
    cooldownMs,
    manaCost,
    gcdMs,
    range,
    damageType,
    authorityEnvelope,
    castTimeMs,
  };
}
