/**
 * Magnifiable Trait
 *
 * Content scaling for low-vision users.
 * Supports pinch zoom, lens mode, and smooth transitions.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ZoomTrigger = 'pinch' | 'button' | 'gaze' | 'voice' | 'gesture';

interface MagnifiableState {
  currentMagnification: number;
  targetMagnification: number;
  isZooming: boolean;
  lensPosition: { x: number; y: number } | null;
  originalScale: { x: number; y: number; z: number };
  zoomCenter: { x: number; y: number; z: number };
}

interface MagnifiableConfig {
  min_scale: number;
  max_scale: number;
  trigger: ZoomTrigger;
  smooth_zoom: boolean;
  zoom_speed: number;
  lens_mode: boolean;
  lens_size: number; // Percentage of view
  lens_border: boolean;
  preserve_aspect: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const magnifiableHandler: TraitHandler<MagnifiableConfig> = {
  name: 'magnifiable',

  defaultConfig: {
    min_scale: 1,
    max_scale: 5,
    trigger: 'pinch',
    smooth_zoom: true,
    zoom_speed: 2,
    lens_mode: false,
    lens_size: 0.3,
    lens_border: true,
    preserve_aspect: true,
  },

  onAttach(node, config, context) {
    const state: MagnifiableState = {
      currentMagnification: 1,
      targetMagnification: 1,
      isZooming: false,
      lensPosition: null,
      originalScale: { x: 1, y: 1, z: 1 },
      zoomCenter: { x: 0, y: 0, z: 0 },
    };
    node.__magnifiableState = state;

    // Store original scale
    if (node.scale) {
      const s = node.scale;
      state.originalScale = { x: s.x || 1, y: s.y || 1, z: s.z || 1 };
    }

    context.emit?.('magnifiable_register', {
      node,
      trigger: config.trigger,
      lensMode: config.lens_mode,
    });
  },

  onDetach(node, config, context) {
    const state = node.__magnifiableState as MagnifiableState;

    // Restore original scale
    if (state && node.scale) {
      node.scale.x = state.originalScale.x;
      node.scale.y = state.originalScale.y;
      node.scale.z = state.originalScale.z;
    }

    context.emit?.('magnifiable_unregister', { node });
    delete node.__magnifiableState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__magnifiableState as MagnifiableState;
    if (!state) return;

    // Smooth zoom interpolation
    if (config.smooth_zoom && state.currentMagnification !== state.targetMagnification) {
      const diff = state.targetMagnification - state.currentMagnification;
      const step = diff * config.zoom_speed * delta;

      if (Math.abs(diff) < 0.01) {
        state.currentMagnification = state.targetMagnification;
      } else {
        state.currentMagnification += step;
      }

      applyMagnification(node, config, state);
    }

    // Update lens position if in lens mode
    if (config.lens_mode && state.lensPosition) {
      context.emit?.('magnifiable_lens_update', {
        node,
        position: state.lensPosition,
        size: config.lens_size,
        magnification: state.currentMagnification,
        showBorder: config.lens_border,
      });
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__magnifiableState as MagnifiableState;
    if (!state) return;

    if (event.type === 'magnify_start' || event.type === 'pinch_start') {
      state.isZooming = true;

      if (event.center) {
        state.zoomCenter = event.center as typeof state.zoomCenter;
      }

      context.emit?.('on_magnify_start', { node });
    } else if (event.type === 'magnify_update' || event.type === 'pinch_update') {
      const scale = (event.scale as number) || 1;
      const newMag = Math.max(
        config.min_scale,
        Math.min(config.max_scale, state.currentMagnification * scale)
      );

      if (config.smooth_zoom) {
        state.targetMagnification = newMag;
      } else {
        state.currentMagnification = newMag;
        state.targetMagnification = newMag;
        applyMagnification(node, config, state);
      }

      // Update lens position
      if (config.lens_mode && event.position) {
        state.lensPosition = event.position as typeof state.lensPosition;
      }
    } else if (event.type === 'magnify_end' || event.type === 'pinch_end') {
      state.isZooming = false;
      context.emit?.('on_magnify_end', {
        node,
        magnification: state.currentMagnification,
      });
    } else if (event.type === 'magnify_set') {
      const mag = Math.max(
        config.min_scale,
        Math.min(config.max_scale, event.magnification as number)
      );

      if (config.smooth_zoom) {
        state.targetMagnification = mag;
      } else {
        state.currentMagnification = mag;
        state.targetMagnification = mag;
        applyMagnification(node, config, state);
      }
    } else if (event.type === 'magnify_reset') {
      if (config.smooth_zoom) {
        state.targetMagnification = 1;
      } else {
        state.currentMagnification = 1;
        state.targetMagnification = 1;
        applyMagnification(node, config, state);
      }
    } else if (event.type === 'magnify_query') {
      context.emit?.('magnify_info', {
        queryId: event.queryId,
        node,
        currentMagnification: state.currentMagnification,
        targetMagnification: state.targetMagnification,
        isZooming: state.isZooming,
        lensMode: config.lens_mode,
      });
    }
  },
};

function applyMagnification(node: any, config: MagnifiableConfig, state: MagnifiableState): void {
  if (!node.scale) return;

  const mag = state.currentMagnification;

  if (config.preserve_aspect) {
    node.scale.x = state.originalScale.x * mag;
    node.scale.y = state.originalScale.y * mag;
    node.scale.z = state.originalScale.z * mag;
  } else {
    node.scale.x = state.originalScale.x * mag;
    node.scale.y = state.originalScale.y * mag;
    // Keep z unchanged for 2D-style magnification
  }
}

export default magnifiableHandler;
