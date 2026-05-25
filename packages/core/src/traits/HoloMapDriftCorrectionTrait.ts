/**
 * HoloMap Drift Correction Trait
 *
 * Declares drift-correction policy for a HoloMap reconstruction session.
 * Triggers loop-closure detection, keyframe matching, and trajectory
 * realignment when drift exceeds the configured threshold.
 *
 * Scope (Sprint 1): stub handler. Loop-closure logic lands in Sprint 2.
 *
 * @version 0.0.1 (scaffold)
 */

import type { TraitHandler } from './TraitTypes';

export interface HoloMapDriftCorrectionConfig {
  /** Drift threshold (meters) before correction runs */
  maxDriftMeters: number;
  /** Minimum confidence on a loop-closure match to accept */
  loopClosureThreshold: number;
  /** If true, rewrite past poses on correction (else correct only forward) */
  rewriteHistory: boolean;
}

function readEstimatedDriftMeters(payload: Record<string, unknown>): number {
  if (typeof payload.estimatedDriftMeters === 'number' && Number.isFinite(payload.estimatedDriftMeters)) {
    return payload.estimatedDriftMeters;
  }

  const trajectory = payload.trajectory;
  if (trajectory && typeof trajectory === 'object') {
    const drift = (trajectory as Record<string, unknown>).estimatedDriftMeters;
    if (typeof drift === 'number' && Number.isFinite(drift)) {
      return drift;
    }
  }

  return 0;
}

export const holomapDriftCorrectionHandler: TraitHandler<HoloMapDriftCorrectionConfig> = {
  name: 'holomap_drift_correction',

  defaultConfig: {
    maxDriftMeters: 1.0,
    loopClosureThreshold: 0.92,
    rewriteHistory: false,
  },

  onAttach(_node, _config, context) {
    context.emit?.('holomap:drift_monitor_start', {});
  },

  onEvent(_node, config, context, event) {
    if (event.type !== 'holomap:step_result' && event.type !== 'holomap:drift_update') return;
    const payload = event.payload ?? {};
    const drift = readEstimatedDriftMeters(payload);

    if (drift >= config.maxDriftMeters) {
      context.emit?.('holomap:drift_correction_requested', {
        estimatedDriftMeters: drift,
        loopClosureThreshold: config.loopClosureThreshold,
        rewriteHistory: config.rewriteHistory,
      });
    }
  },
};
