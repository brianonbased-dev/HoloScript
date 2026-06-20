/**
 * Spatial Panel Trait
 *
 * Declares a 3D-placed Compose panel (Meta Spatial SDK) as DATA (F.126). Consumed by compile targets
 * — the Quest target reads placement/size/reticle/viewfinder to emit the panel entity + Compose UI.
 * Spatial SDK is left-handed, +Z forward: a negative z places the panel behind the user. The handler
 * holds no platform code; emit lives in the compiler walking the trait.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface SpatialPanelPlace {
  x: number;
  y: number;
  z: number;
}

export interface SpatialPanelSize {
  width: number;
  height: number;
}

export interface SpatialPanelConfig {
  /** Initial placement in meters (left-handed, +Z forward); head-lock overrides it at runtime. */
  place: SpatialPanelPlace;
  /** Panel quad size in meters. */
  size: SpatialPanelSize;
  /** Panel title. */
  title: string;
  /** HUD follows the head pose (not world-fixed) — moves with the user's gaze. */
  follow_head: boolean;
  /** Distance in meters in front of the head when head-locked. */
  follow_distance: number;
  /** Ambient: nothing is shown while scanning; a result card appears only on a successful read. */
  ambient: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const spatialPanelHandler: TraitHandler<SpatialPanelConfig> = {
  name: 'spatial_panel',

  defaultConfig: {
    place: { x: 0.0, y: 1.3, z: 1.5 },
    size: { width: 1.2, height: 1.2 },
    title: 'Universal QR Scanner',
    follow_head: true,
    follow_distance: 1.2,
    ambient: true,
  },

  onAttach(node, _config, context) {
    context.emit?.('panel:mount', { node: node.id });
  },

  onEvent(node, _config, context, event) {
    if (event.type === 'qr:result') {
      context.emit?.('panel:show_result', { node: node.id, text: event.payload?.text });
    }
  },
};

export default spatialPanelHandler;
