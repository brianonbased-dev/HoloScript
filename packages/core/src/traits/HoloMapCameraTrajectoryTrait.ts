/**
 * HoloMap Camera Trajectory Trait
 *
 * Exposes the per-frame camera pose stream from a HoloMap reconstruction
 * session as a node attribute. Downstream traits (timelines, replay, Studio
 * viewers) consume this to draw trajectory paths and scrub through time.
 *
 * Scope (Sprint 1): stub handler. Pose streaming lands in Sprint 2.
 *
 * @version 0.0.1 (scaffold)
 */

import type { TraitHandler } from './TraitTypes';
import type { CameraPose } from '../reconstruction/HoloMapRuntime';
import type { TrajectoryKeyframe } from '../reconstruction/TrajectoryMemory';

export interface HoloMapCameraTrajectoryConfig {
  /** Maximum poses retained in the in-memory ring buffer */
  historyLength: number;
  /** Emit `trajectory:tick` event every N frames */
  emitEveryN: number;
}

export interface HoloMapCameraTrajectoryState {
  poses: CameraPose[];
  keyframes: TrajectoryKeyframe[];
  currentFrameIndex: number;
  estimatedDriftMeters: number;
}

export const holomapCameraTrajectoryHandler: TraitHandler<HoloMapCameraTrajectoryConfig> = {
  name: 'holomap_camera_trajectory',

  defaultConfig: {
    historyLength: 1024,
    emitEveryN: 15,
  },

  onAttach(node, config) {
    const state: HoloMapCameraTrajectoryState = {
      poses: [],
      keyframes: [],
      currentFrameIndex: 0,
      estimatedDriftMeters: 0,
    };
    (node as unknown as Record<string, unknown>).__holomapTrajectoryState = state;
    void config;
  },

  onEvent(node, config, context, event) {
    if (event.type !== 'holomap:step_result') return;
    const state = (node as unknown as Record<string, unknown>).__holomapTrajectoryState as
      | HoloMapCameraTrajectoryState
      | undefined;
    if (!state) return;

    const payload = event.payload ?? {};
    const pose = payload.pose as CameraPose | undefined;
    const trajectory =
      payload.trajectory && typeof payload.trajectory === 'object'
        ? (payload.trajectory as {
            keyframes?: TrajectoryKeyframe[];
            estimatedDriftMeters?: number;
          })
        : undefined;
    const frameIndex =
      typeof payload.frameIndex === 'number' && Number.isFinite(payload.frameIndex)
        ? payload.frameIndex
        : state.currentFrameIndex;

    if (!pose) return;
    state.currentFrameIndex = frameIndex;
    state.poses.push(pose);
    if (Array.isArray(trajectory?.keyframes)) {
      state.keyframes = trajectory.keyframes.slice(-config.historyLength);
    }
    if (
      typeof trajectory?.estimatedDriftMeters === 'number' &&
      Number.isFinite(trajectory.estimatedDriftMeters)
    ) {
      state.estimatedDriftMeters = trajectory.estimatedDriftMeters;
    }
    if (state.poses.length > config.historyLength) {
      state.poses.splice(0, state.poses.length - config.historyLength);
    }

    if (frameIndex % Math.max(1, config.emitEveryN) === 0) {
      context.emit?.('trajectory:tick', {
        frameIndex,
        pose,
        retained: state.poses.length,
        keyframes: state.keyframes.length,
        estimatedDriftMeters: state.estimatedDriftMeters,
      });
    }
  },

  onDetach(node) {
    delete (node as unknown as Record<string, unknown>).__holomapTrajectoryState;
  },
};
