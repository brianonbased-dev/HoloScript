/**
 * BakingProgressBridge
 *
 * Plumbs BakingProgressTracker events through NeuralStreamingTransport so a
 * remote viewer can watch a Render Network 3DGS training job converge live —
 * the Brush+Rerun differentiator from
 * research/2026-05-12_brush-vs-holoscript-audit-calibration.md §3.3.
 *
 * Design constraints (each is enforced by tests):
 * - Bridge is **pure adapter** — caller owns the tracker subscription slots.
 *   Reason: `BakingProgressTracker.on()` is single-slot; chaining inside the
 *   bridge would silently overwrite the caller's existing handlers. Returning
 *   handler functions instead leaves slot-ownership at the call site.
 * - Bridge emits one packet per inbound event (progress / stageTransition /
 *   complete / error) — no fan-out, no batching, no internal timers.
 * - Optional **history buffer** (defaults off) records up to `historyLimit`
 *   most-recent packets so a late-joining viewer can be replayed convergence.
 *   This is the scrubbable-history parity with Brush+Rerun.
 * - Bridge never touches the wire when transport is disconnected; it only
 *   records to history if recording is enabled. Reconnect replay is the
 *   caller's responsibility (call `getHistory()` and re-broadcast).
 *
 * @version 0.1.0
 */

import type { NeuralStreamingTransport } from './NeuralStreamingTransport';
import type { INeuralTrainingProgressPacket } from './NetworkTypes';

// =============================================================================
// CALLBACK + STATE TYPES (mirror BakingProgressTracker shape without import)
// =============================================================================

/** Minimal duck-type for the BakingJobState slice the bridge consumes. */
export interface BakingJobStateLike {
  jobId: string;
  stage: string;
  overallProgress: number;
  stageProgress: Record<string, { progress: number; message?: string; estimatedTimeRemainingMs?: number }>;
  trainingMetrics?: Record<string, unknown>;
  actualCost?: number;
  error?: { stage: string; message: string; code: string; retryable: boolean };
}

/** Minimal duck-type for the BakingPipelineError slice. */
export interface BakingPipelineErrorLike {
  message: string;
  code: string;
  stage: string;
  retryable: boolean;
}

export type ProgressCallback = (state: BakingJobStateLike) => void;
export type StageTransitionCallback = (
  previousStage: string,
  newStage: string,
  state: BakingJobStateLike
) => void;
export type CompleteCallback = (state: BakingJobStateLike) => void;
export type ErrorCallback = (error: BakingPipelineErrorLike, state: BakingJobStateLike) => void;

// =============================================================================
// CONFIG
// =============================================================================

export interface BakingProgressBridgeConfig {
  /** If true, every packet emitted is also appended to an internal ring buffer. */
  recordHistory?: boolean;
  /** Max history packets retained (default: 256 — covers ~21min at 5s poll). */
  historyLimit?: number;
  /** Optional clock for deterministic tests. Defaults to `Date.now`. */
  now?: () => number;
}

// =============================================================================
// BRIDGE
// =============================================================================

export interface BakingProgressBridge {
  /** Handler to wire via `tracker.on('progress', bridge.onProgress)`. */
  onProgress: ProgressCallback;
  /** Handler to wire via `tracker.on('stageTransition', bridge.onStageTransition)`. */
  onStageTransition: StageTransitionCallback;
  /** Handler to wire via `tracker.on('complete', bridge.onComplete)`. */
  onComplete: CompleteCallback;
  /** Handler to wire via `tracker.on('error', bridge.onError)`. */
  onError: ErrorCallback;
  /** Returns a snapshot of recorded packets when `recordHistory` is enabled. */
  getHistory: () => INeuralTrainingProgressPacket[];
  /** Clears the history buffer. */
  clearHistory: () => void;
  /** Count of packets pushed onto the wire. */
  getSentCount: () => number;
  /** Count of packets dropped because transport was disconnected. */
  getDroppedCount: () => number;
}

/**
 * Build a state -> training-progress-packet projection.
 * Pure function so tests can exercise the mapping without transport plumbing.
 */
export function projectStateToPacket(
  state: BakingJobStateLike,
  options: {
    now: number;
    previousStage?: string;
    terminal?: 'complete' | 'error';
  }
): INeuralTrainingProgressPacket {
  const stageEntry = state.stageProgress[state.stage];
  return {
    jobId: state.jobId,
    stage: state.stage,
    previousStage: options.previousStage,
    overallProgress: state.overallProgress,
    stageProgress: stageEntry?.progress ?? 0,
    message: stageEntry?.message,
    estimatedTimeRemainingMs: stageEntry?.estimatedTimeRemainingMs,
    trainingMetrics: state.trainingMetrics,
    actualCost: state.actualCost,
    timestamp: options.now,
    terminal: options.terminal,
    error: options.terminal === 'error' ? state.error : undefined,
  };
}

/**
 * Create a bridge that converts BakingProgressTracker events into training
 * progress packets and pushes them through the transport.
 *
 * Usage:
 * ```ts
 * const bridge = createBakingProgressBridge(transport, { recordHistory: true });
 * tracker.on('progress', bridge.onProgress);
 * tracker.on('stageTransition', bridge.onStageTransition);
 * tracker.on('complete', bridge.onComplete);
 * tracker.on('error', bridge.onError);
 * // ... later, when a viewer joins mid-job:
 * bridge.getHistory().forEach((p) => transport.broadcastTrainingProgress(p));
 * ```
 */
export function createBakingProgressBridge(
  transport: Pick<NeuralStreamingTransport, 'broadcastTrainingProgress'>,
  config: BakingProgressBridgeConfig = {}
): BakingProgressBridge {
  const recordHistory = config.recordHistory ?? false;
  const historyLimit = config.historyLimit ?? 256;
  const now = config.now ?? (() => Date.now());

  const history: INeuralTrainingProgressPacket[] = [];
  let sentCount = 0;
  let droppedCount = 0;

  const push = (packet: INeuralTrainingProgressPacket): void => {
    if (recordHistory) {
      history.push(packet);
      if (history.length > historyLimit) {
        history.splice(0, history.length - historyLimit);
      }
    }
    const sent = transport.broadcastTrainingProgress(packet);
    if (sent) sentCount += 1;
    else droppedCount += 1;
  };

  return {
    onProgress(state) {
      push(projectStateToPacket(state, { now: now() }));
    },
    onStageTransition(previousStage, _newStage, state) {
      push(projectStateToPacket(state, { now: now(), previousStage }));
    },
    onComplete(state) {
      push(projectStateToPacket(state, { now: now(), terminal: 'complete' }));
    },
    onError(_error, state) {
      push(projectStateToPacket(state, { now: now(), terminal: 'error' }));
    },
    getHistory: () => history.slice(),
    clearHistory: () => {
      history.length = 0;
    },
    getSentCount: () => sentCount,
    getDroppedCount: () => droppedCount,
  };
}
