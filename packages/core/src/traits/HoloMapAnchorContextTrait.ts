/**
 * HoloMap Anchor Context Trait
 *
 * Declares the coordinate-frame anchor used by a HoloMap reconstruction
 * session. Exposes AnchorContextState to downstream consumers (manifest
 * export, provenance UI, Studio viewers).
 *
 * Scope (Sprint 1): stub handler. Anchor policy binding lands in Sprint 2.
 *
 * @version 0.0.1 (scaffold)
 */

import type { TraitHandler } from './TraitTypes';
import type { AnchorContextConfig } from '../reconstruction/AnchorContext';

export interface HoloMapAnchorContextTraitConfig {
  /** Override AnchorContext defaults */
  runtime?: Partial<AnchorContextConfig>;
  /** If true, re-anchor automatically when drift exceeds threshold */
  autoReanchor: boolean;
}

export const holomapAnchorContextHandler: TraitHandler<HoloMapAnchorContextTraitConfig> = {
  name: 'holomap_anchor_context',

  defaultConfig: {
    autoReanchor: true,
  },

  onAttach(_node, _config, context) {
    context.emit?.('holomap:anchor_ready', {});
  },

  onEvent(_node, config, context, event) {
    const payload = event.payload ?? {};
    if (event.type === 'holomap:anchor_update') {
      context.emit?.('holomap:anchor_state_changed', {
        anchorFrameIndex:
          typeof payload.anchorFrameIndex === 'number' ? payload.anchorFrameIndex : 0,
        autoReanchor: config.autoReanchor,
      });
      return;
    }

    if (event.type === 'holomap:drift_update' && config.autoReanchor) {
      const drift =
        typeof payload.estimatedDriftMeters === 'number' && Number.isFinite(payload.estimatedDriftMeters)
          ? payload.estimatedDriftMeters
          : 0;
      const threshold =
        payload.maxDriftBeforeReanchor && typeof payload.maxDriftBeforeReanchor === 'number'
          ? payload.maxDriftBeforeReanchor
          : undefined;
      if (threshold != null && drift >= threshold) {
        context.emit?.('holomap:reanchor_requested', {
          estimatedDriftMeters: drift,
          maxDriftBeforeReanchor: threshold,
        });
      }
      return;
    }

    // Surface placement: a scanned surface is ready to receive anchored objects
    if (event.type === 'holomap:surface_detected') {
      const surfaceAnchorId = typeof payload.surfaceAnchorId === 'string' ? payload.surfaceAnchorId : undefined;
      const surfaceNormal = Array.isArray(payload.surfaceNormal) ? payload.surfaceNormal : undefined;
      const worldPosition = Array.isArray(payload.worldPosition) ? payload.worldPosition : undefined;
      if (surfaceAnchorId) {
        context.emit?.('holomap:surface_anchor_placed', {
          surfaceAnchorId,
          surfaceNormal,
          worldPosition,
        });
      }
      return;
    }

    // Lighting update: broadcast lighting conditions to anchored objects
    if (event.type === 'holomap:lighting_detected') {
      const referenceId = typeof payload.referenceId === 'string' ? payload.referenceId : undefined;
      const estimatedLux = typeof payload.estimatedLux === 'number' && Number.isFinite(payload.estimatedLux) ? payload.estimatedLux : undefined;
      const colorTemperatureK = typeof payload.colorTemperatureK === 'number' && Number.isFinite(payload.colorTemperatureK) ? payload.colorTemperatureK : undefined;
      const dominantDirection = Array.isArray(payload.dominantDirection) ? payload.dominantDirection : undefined;
      if (referenceId) {
        context.emit?.('holomap:lighting_update', {
          referenceId,
          estimatedLux,
          colorTemperatureK,
          dominantDirection,
        });
      }
      return;
    }
  },
};
