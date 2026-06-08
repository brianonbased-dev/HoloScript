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
    const trajectory =
      payload.trajectory && typeof payload.trajectory === 'object'
        ? (payload.trajectory as Record<string, unknown>)
        : undefined;
    const driftValue = payload.estimatedDriftMeters ?? trajectory?.estimatedDriftMeters;
    const drift = typeof driftValue === 'number' && Number.isFinite(driftValue) ? driftValue : 0;
    const nestedKeyframes = Array.isArray(trajectory?.keyframes) ? trajectory.keyframes : undefined;
    const keyframeCount =
      typeof payload.keyframeCount === 'number' && Number.isFinite(payload.keyframeCount)
        ? payload.keyframeCount
        : nestedKeyframes?.length;
    const nestedLastLoopClosureFrame = trajectory?.lastLoopClosureFrame;
    const lastLoopClosureFrame =
      typeof payload.lastLoopClosureFrame === 'number' &&
      Number.isFinite(payload.lastLoopClosureFrame)
        ? payload.lastLoopClosureFrame
        : typeof nestedLastLoopClosureFrame === 'number' &&
            Number.isFinite(nestedLastLoopClosureFrame)
          ? nestedLastLoopClosureFrame
          : undefined;

    if (drift >= config.maxDriftMeters) {
      context.emit?.('holomap:drift_correction_requested', {
        estimatedDriftMeters: drift,
        loopClosureThreshold: config.loopClosureThreshold,
        rewriteHistory: config.rewriteHistory,
        keyframeCount,
        lastLoopClosureFrame,
      });
    }
  },
};
