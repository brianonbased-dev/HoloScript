/**
 * Volumetric Window Trait (V43 Tier 2)
 *
 * visionOS-specific window management for spatial computing experiences.
 * Supports bounded, unbounded, volumetric, and immersive window types
 * with configurable scale modes (tabletop → world scale).
 *
 * @version 1.0.0 (V43 Tier 2)
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export type WindowType = 'bounded' | 'unbounded' | 'volumetric' | 'immersive' | 'mixed';
export type ScaleMode = 'tabletop' | 'room' | 'world' | 'object';
export type ImmersionStyle = 'full' | 'progressive' | 'mixed';

export interface VolumetricWindowConfig {
  window_type: WindowType;
  scale_mode: ScaleMode;
  immersion_style: ImmersionStyle;
  initial_width: number; // meters
  initial_height: number; // meters
  initial_depth: number; // meters (volumetric only)
  resizable: boolean;
  min_scale: number; // scale multiplier
  max_scale: number;
  default_placement: 'front' | 'hand' | 'scene';
  ornament_visibility: boolean; // show window chrome/controls
}

interface VolumetricWindowState {
  isOpen: boolean;
  currentWidth: number;
  currentHeight: number;
  currentDepth: number;
  currentScale: number;
  placement: [number, number, number] | null;
  isImmersive: boolean;
  immersionProgress: number; // 0–1 for progressive immersion
}

// =============================================================================
// HANDLER
// =============================================================================

export const volumetricWindowHandler: TraitHandler<VolumetricWindowConfig> = {
  name: 'volumetric_window' as any,

  defaultConfig: {
    window_type: 'bounded',
    scale_mode: 'tabletop',
    immersion_style: 'mixed',
    initial_width: 0.6,
    initial_height: 0.4,
    initial_depth: 0.3,
    resizable: true,
    min_scale: 0.1,
    max_scale: 10.0,
    default_placement: 'front',
    ornament_visibility: true,
  },

  onAttach(node, config, context) {
    const state: VolumetricWindowState = {
      isOpen: false,
      currentWidth: config.initial_width,
      currentHeight: config.initial_height,
      currentDepth: config.initial_depth,
      currentScale: 1.0,
      placement: null,
      isImmersive: config.window_type === 'immersive',
      immersionProgress: config.window_type === 'immersive' ? 1 : 0,
    };
    context.setState({ volumetricWindow: state });
    context.emit('vWindow:init', {
      type: config.window_type,
      scale_mode: config.scale_mode,
    });
  },

  onDetach(node, config, context) {
    const state = context.getState().volumetricWindow as VolumetricWindowState | undefined;
    if (state?.isOpen) {
      context.emit('vWindow:closed');
    }
  },

  onEvent(node, config, context, event) {
    const state = context.getState().volumetricWindow as VolumetricWindowState | undefined;
    if (!state) return;

    if (event.type === 'vWindow:open') {
      state.isOpen = true;
      const payload = event.payload as any;
      if (payload?.position) state.placement = payload.position;
      context.emit('vWindow:opened', { type: config.window_type });
    } else if (event.type === 'vWindow:close') {
      state.isOpen = false;
      context.emit('vWindow:closed');
    } else if (event.type === 'vWindow:resize') {
      const payload = event.payload as any;
      if (!config.resizable) return;
      if (payload?.width !== undefined) state.currentWidth = payload.width;
      if (payload?.height !== undefined) state.currentHeight = payload.height;
      if (payload?.depth !== undefined) state.currentDepth = payload.depth;
      context.emit('vWindow:resized', {
        width: state.currentWidth,
        height: state.currentHeight,
        depth: state.currentDepth,
      });
    } else if (event.type === 'vWindow:scale') {
      const scale = Math.max(
        config.min_scale,
        Math.min(config.max_scale, (event.payload as any)?.scale ?? 1)
      );
      state.currentScale = scale;
      context.emit('vWindow:scaled', { scale });
    } else if (event.type === 'vWindow:immersion_change') {
      state.immersionProgress = Math.max(0, Math.min(1, (event.payload as any)?.progress ?? 0));
      state.isImmersive = state.immersionProgress >= 1;
    }
  },
};
