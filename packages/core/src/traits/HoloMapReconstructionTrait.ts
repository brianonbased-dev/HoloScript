/**
 * HoloMap Reconstruction Trait
 *
 * Binds a node to the HoloMap WebGPU reconstruction runtime. Declares the
 * node as the target of a feed-forward RGB→3D reconstruction session.
 *
 * Now creates and drives a real HoloMapRuntime instance:
 *   - holomap:start_session → runtime.init()
 *   - holomap:frame         → runtime.step() + emits holomap:step_result
 *   - holomap:finalize      → runtime.finalize() + emits holomap:finalized
 *   - onDetach              → runtime.dispose()
 *
 * Sibling traits (camera_trajectory, anchor_context, drift_correction,
 * splat_output) consume the step_result / finalized events automatically.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';
import type { HoloMapConfig, ReconstructionManifest, ReconstructionFrame } from '../reconstruction/HoloMapRuntime';
import { createHoloMapRuntime, HOLOMAP_DEFAULTS } from '../reconstruction/HoloMapRuntime';

// =============================================================================
// CONFIG
// =============================================================================

export interface HoloMapReconstructionConfig {
  /** Source of RGB frames */
  source: 'webcam' | 'video_url' | 'frame_folder';
  /** URL or identifier for the source (ignored when source='webcam') */
  sourceRef?: string;
  /** Runtime config override */
  runtime?: Partial<HoloMapConfig>;
  /** Emit a `reconstruction:manifest` event when finalize() completes */
  autoFinalize: boolean;
}

export interface HoloMapReconstructionState {
  isActive: boolean;
  framesProcessed: number;
  lastManifest: ReconstructionManifest | null;
  lastError: string | null;
  sessionId?: string;
  replayHash?: string;
  /** Bound runtime instance (null until start_session) */
  runtime: BoundHoloMapRuntime | null;
  /** Promise that resolves when the current runtime finishes init */
  initPromise: Promise<void> | null;
  /** Serializes async operations so tests can await the latest one */
  operationChain: Promise<unknown>;
}

interface BoundHoloMapRuntime {
  initPromise: Promise<void> | null;
  dispose(): Promise<void>;
  step(frame: ReconstructionFrame): Promise<import('../reconstruction/HoloMapRuntime').ReconstructionStep | null>;
  finalize(): Promise<ReconstructionManifest>;
  replayHash(): string;
}

// =============================================================================
// HANDLER
// =============================================================================

export const holomapReconstructionHandler: TraitHandler<HoloMapReconstructionConfig> = {
  name: 'holomap_reconstruct',

  defaultConfig: {
    source: 'webcam',
    autoFinalize: true,
  },

  onAttach(node, config, context) {
    const state: HoloMapReconstructionState = {
      isActive: false,
      framesProcessed: 0,
      lastManifest: null,
      lastError: null,
      runtime: null,
      initPromise: null,
      operationChain: Promise.resolve(),
    };
    (node as unknown as Record<string, unknown>).__holomapState = state;
    // Hold the runtime instance on the node so it survives across events
    (node as unknown as Record<string, unknown>).__holomapRuntime = null;

    context.setState?.({
      holomapReconstruction: {
        source: config.source,
        sourceRef: config.sourceRef ?? null,
        autoFinalize: config.autoFinalize,
      },
    });
    context.emit?.('holomap:attached', {
      source: config.source,
      sourceRef: config.sourceRef ?? null,
      autoFinalize: config.autoFinalize,
    });
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__holomapState as
      | HoloMapReconstructionState
      | undefined;
    if (!state) return;

    const rawRuntime = (node as unknown as Record<string, unknown>).__holomapRuntime as
      | BoundHoloMapRuntime
      | null;

    // ── Session lifecycle events ─────────────────────────────────────────────

    if (event.type === 'holomap:start_session') {
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const runtime = createHoloMapRuntime();
      const sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : cryptoRandomId();
      const runtimeConfig: HoloMapConfig = {
        ...HOLOMAP_DEFAULTS,
        ...config.runtime,
        seed: typeof payload.seed === 'number' ? payload.seed : (config.runtime?.seed ?? HOLOMAP_DEFAULTS.seed),
        modelHash: typeof payload.modelHash === 'string' ? payload.modelHash : (config.runtime?.modelHash ?? 'holomap-trait-bound'),
      };

      state.runtime = runtime as unknown as BoundHoloMapRuntime;
      state.initPromise = runtime.init(runtimeConfig);
      (node as unknown as Record<string, unknown>).__holomapRuntime = runtime;

      // Mark session as logically active immediately; async init may still be in flight.
      state.isActive = true;
      state.lastError = null;
      state.sessionId = sessionId;

      // Chain onto initPromise so subsequent operations wait for init.
      state.operationChain = state.initPromise.then(() => {
        state.replayHash = runtime.replayHash();
        context.emit?.('holomap:session_started', {
          sessionId,
          replayHash: state.replayHash,
        });
        context.emit?.('reconstruction:session_started', {
          sessionId,
          replayHash: state.replayHash,
        });
      }, (err: unknown) => {
        state.isActive = false;
        state.lastError = err instanceof Error ? err.message : String(err);
        context.emit?.('holomap:error', { message: state.lastError, phase: 'init' });
      });
      return;
    }

    if (event.type === 'holomap:frame') {
      if (!state.runtime || !state.initPromise) {
        context.emit?.('holomap:error', { message: 'Runtime not ready; send holomap:start_session first' });
        return;
      }
      const payload = (event.payload ?? {}) as Record<string, unknown>;
      const frame = payload.frame as ReconstructionFrame | undefined;
      if (!frame || !isReconstructionFrame(frame)) {
        context.emit?.('holomap:error', { message: 'Invalid or missing ReconstructionFrame in holomap:frame' });
        return;
      }

      // Serialize operations: each step waits for the previous one (and init) to finish.
      state.operationChain = state.operationChain.then(() =>
        state.initPromise!.then(() => state.runtime!.step(frame))
      ).then((step) => {
        if (!step) return; // throttled
        state.framesProcessed = Math.max(state.framesProcessed, step.frame.index + 1);
        context.emit?.('holomap:step_result', {
          frameIndex: step.frame.index,
          pose: step.pose,
          points: step.points,
          trajectory: step.trajectory,
          anchor: step.anchor,
        });
        context.emit?.('reconstruction:progress', {
          framesProcessed: state.framesProcessed,
        });
        context.emit?.('holomap:drift_update', {
          estimatedDriftMeters: step.trajectory.estimatedDriftMeters,
        });
        context.emit?.('holomap:anchor_update', {
          anchorFrameIndex: step.anchor.anchorFrameIndex,
          anchorPose: step.anchor.anchorPose,
          anchorDescriptor: step.anchor.anchorDescriptor,
        });
      }, (err: unknown) => {
        state.lastError = err instanceof Error ? err.message : String(err);
        context.emit?.('holomap:error', { message: state.lastError, phase: 'feed_frame' });
      });
      return;
    }

    if (event.type === 'holomap:finalize') {
      if (!state.runtime || !state.initPromise) {
        context.emit?.('holomap:error', { message: 'Runtime not ready; send holomap:start_session first' });
        return;
      }

      state.operationChain = state.operationChain.then(() =>
        state.initPromise!.then(() => state.runtime!.finalize())
      ).then((manifest) => {
        state.isActive = false;
        state.lastManifest = manifest;
        context.emit?.('holomap:finalized', {
          manifest,
          framesProcessed: state.framesProcessed,
          replayHash: manifest.replayHash,
        });
        if (config.autoFinalize) {
          context.emit?.('reconstruction:manifest', {
            framesProcessed: state.framesProcessed,
            replayHash: manifest.replayHash,
            manifest,
          });
        }
        // Dispose after finalize (clean-up)
        void state.runtime!.dispose().then(() => {
          state.runtime = null;
          state.initPromise = null;
          (node as unknown as Record<string, unknown>).__holomapRuntime = null;
        });
      }, (err: unknown) => {
        state.lastError = err instanceof Error ? err.message : String(err);
        context.emit?.('holomap:error', { message: state.lastError, phase: 'finalize' });
      });
      return;
    }

    // ── Legacy passthrough events (for backward compat with pre-bound tests) ───

    const payload = event.payload ?? {};
    if (event.type === 'holomap:session_started') {
      state.isActive = true;
      state.lastError = null;
      state.sessionId = typeof payload.sessionId === 'string' ? payload.sessionId : state.sessionId;
      state.replayHash = typeof payload.replayHash === 'string' ? payload.replayHash : state.replayHash;
      context.emit?.('reconstruction:session_started', {
        sessionId: state.sessionId,
        replayHash: state.replayHash,
      });
      return;
    }

    if (event.type === 'holomap:step_result') {
      if (typeof payload.frameIndex === 'number' && Number.isFinite(payload.frameIndex)) {
        state.framesProcessed = Math.max(state.framesProcessed, payload.frameIndex + 1);
      } else {
        state.framesProcessed += 1;
      }
      context.emit?.('reconstruction:progress', {
        framesProcessed: state.framesProcessed,
      });
      return;
    }

    if (event.type === 'holomap:finalized') {
      state.isActive = false;
      if (payload.manifest && typeof payload.manifest === 'object') {
        state.lastManifest = payload.manifest as ReconstructionManifest;
      }
      context.emit?.('reconstruction:manifest', {
        framesProcessed: state.framesProcessed,
        replayHash: state.lastManifest?.replayHash ?? state.replayHash,
      });
      return;
    }

    if (event.type === 'holomap:error') {
      state.isActive = false;
      state.lastError = typeof payload.message === 'string' ? payload.message : 'unknown holomap error';
      context.emit?.('reconstruction:error', {
        message: state.lastError,
      });
    }
  },

  onDetach(node, _config, context) {
    const state = (node as unknown as Record<string, unknown>).__holomapState as
      | HoloMapReconstructionState
      | undefined;
    if (state?.runtime) {
      void state.runtime.dispose().then(() => {
        state.runtime = null;
        state.initPromise = null;
        (node as unknown as Record<string, unknown>).__holomapRuntime = null;
      });
    }
    if (state) {
      context.emit?.('holomap:detached', {
        framesProcessed: state.framesProcessed,
        replayHash: state.replayHash ?? null,
      });
    }
    delete (node as unknown as Record<string, unknown>).__holomapState;
  },
};

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `hm-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function isReconstructionFrame(v: unknown): v is ReconstructionFrame {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.index === 'number' &&
    typeof o.timestampMs === 'number' &&
    o.rgb instanceof Uint8Array &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    (o.stride === 3 || o.stride === 4)
  );
}

export default holomapReconstructionHandler;

