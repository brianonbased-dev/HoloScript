/**
 * Base Type Definitions
 * Extracted to avoid circular dependencies between types.ts, AdvancedTypeSystem.ts, and HoloScriptPlus.ts
 *
 * @module types/base
 */

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
  | 'interactive_graph';

// ============================================================================
// Base AST Node (without directive reference to avoid circular dependency)
// ============================================================================

export interface BaseASTNode {
  type: string;
  id?: string;
  position?: any; // SpatialPosition from types.ts
  hologram?: any; // HologramProperties from types.ts
  /** Source line number (1-indexed) */
  line?: number;
  /** Source column number (0-indexed) */
  column?: number;
}

/**
 * Full ASTNode with directives and traits.
 * Can reference HSPlusDirective because it's defined in AdvancedTypeSystem.
 */
export interface ASTNode extends BaseASTNode {
  /** HS+ Directives */
  directives?: any[]; // HSPlusDirective[] - using any to avoid circular dependency
  /** HS+ Traits (Pre-processed map) */
  traits?: Map<VRTraitName, any>;
}
