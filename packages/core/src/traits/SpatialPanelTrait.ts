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

export interface SpatialPanelViewfinder {
  height_dp: number;
}

export interface SpatialPanelConfig {
  /** Panel placement in meters (left-handed, +Z forward — positive z is in front of the user). */
  place: SpatialPanelPlace;
  /** Panel quad size in meters. */
  size: SpatialPanelSize;
  /** Billboarding behavior ('soft' gently faces the user). */
  billboard: string;
  /** Panel title. */
  title: string;
  /** Show a status line. */
  status_line: boolean;
  /** Show an aiming reticle over the live viewfinder. */
  reticle: boolean;
  /** Reticle box size as a fraction of the viewfinder. */
  reticle_fraction: number;
  /** Live camera viewfinder shown on the panel. */
  viewfinder: SpatialPanelViewfinder;
}

// =============================================================================
// HANDLER
// =============================================================================

export const spatialPanelHandler: TraitHandler<SpatialPanelConfig> = {
  name: 'spatial_panel',

  defaultConfig: {
    place: { x: 0.0, y: 1.3, z: 1.5 },
    size: { width: 1.2, height: 1.2 },
    billboard: 'soft',
    title: 'Universal QR Scanner',
    status_line: true,
    reticle: true,
    reticle_fraction: 0.62,
    viewfinder: { height_dp: 360 },
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
