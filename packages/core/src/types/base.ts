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
