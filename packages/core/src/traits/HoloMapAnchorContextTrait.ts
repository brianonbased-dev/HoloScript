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
    }
  },
};
