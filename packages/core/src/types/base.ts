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
 * Top-level game event block: `on_combat`, `on_death`, `on_spawn`, `on_cast`.
 * Returns a structured node the downstream compiler maps to the target runtime's event system.
 */
export interface GameEventBlockNode extends ASTNode {
  type: 'game-event-block';
  name: string;
  params: string[];
  body: string;
  properties: Record<string, unknown>;
}
