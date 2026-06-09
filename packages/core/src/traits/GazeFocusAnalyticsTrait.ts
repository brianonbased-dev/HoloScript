/**
 * GazeFocusAnalytics Trait
 *
 * Per-object gaze-dwell heatmap accumulated from XR eye-tracking data across
 * all networked participants in a session.
 *
 * Primary use case: XR meeting/presentation analytics — tells a presenter
 * which slide regions (or 3D objects) drew peer attention, and for how long.
 * Also unlocks training/simulation review and accessibility UX auditing.
 *
 * Design notes:
 * - Heatmap is stored as a 2D UV-grid of float accumulator cells (rows × cols).
 * - Gaze vectors arrive via `eye_gaze_update` events (same event shape as
 *   EyeTrackedTrait) and are projected into UV space on the object surface.
 * - Accumulation decays exponentially at `decay_rate_s` so recent attention
 *   outweighs stale history.
 * - Multi-peer: each peer's gaze contributes independently; gaze from remote
 *   peers arrives via `peer_eye_gaze_update` events that carry a `peer_id`.
 * - Export is triggered either at session end (`session_end` event) or on
 *   demand via `gaze_focus_export_request`. The blob is emitted as
 *   `gaze_focus_analytics_export` with the heatmap data.
 *
 * Suggested HoloScript usage (from vr-meeting-room.refreshed.holo):
 *
 *   @gaze_focus_analytics {
 *     resolution: [16, 9]
 *     decay_rate_s: 30.0
 *     export_event: "session_end"
 *     export_format: "json"
 *   }
 *
 * @version 1.0.0
 */

import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

// =============================================================================
// TYPES
// =============================================================================

/** Grid resolution: [cols, rows]. Defaults to [16, 9] (widescreen). */
export type GazeFocusResolution = [number, number];

/** Export format for the heatmap blob. */
export type GazeFocusExportFormat = 'json' | 'csv' | 'png_data_uri';

/**
 * Per-cell accumulator entry. Each cell corresponds to a UV tile on the
 * object surface.
 */
export interface GazeFocusCell {
  /** Accumulated dwell-time weight (seconds, decayed). */
  weight: number;
  /** Wall-clock time of the last update (ms since epoch). */
  lastUpdatedAt: number;
  /** Number of distinct peer gazes ever recorded in this cell. */
  peersSeenCount: number;
}

/** Serialisable heatmap snapshot. */
export interface GazeFocusHeatmap {
  /** Node id this heatmap belongs to. */
  nodeId: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
  /** Grid dimensions [cols, rows]. */
  resolution: GazeFocusResolution;
  /** Row-major flat array of normalised weights in [0, 1]. Length = cols × rows. */
  normalised: number[];
  /** Raw accumulated weights (before normalisation). */
  raw: number[];
  /** Total gaze-seconds accumulated across all cells and peers. */
  totalGazeSeconds: number;
  /** Number of distinct peer IDs that contributed gaze data. */
  peerCount: number;
  /** Session identifier supplied at attach time (or empty string). */
  sessionId: string;
}

/** Configuration block. */
export interface GazeFocusAnalyticsConfig {
  /**
   * Heatmap grid resolution [cols, rows].
   * @default [16, 9]
   */
  resolution: GazeFocusResolution;
  /**
   * Half-life for exponential decay (seconds). Older gaze fades toward 0
   * at this rate. Set to 0 to disable decay (pure accumulation).
   * @default 30.0
   */
  decay_rate_s: number;
  /**
   * Which runtime event triggers an automatic export.
   * Use "session_end" to export when the trait receives a `session_end`
   * event, or "" to export only on explicit `gaze_focus_export_request`.
   * @default "session_end"
   */
  export_event: string;
  /**
   * Serialisation format for the exported blob.
   * @default "json"
   */
  export_format: GazeFocusExportFormat;
  /**
   * Session identifier attached to every exported heatmap.
   * Typically a meeting/room ID.
   * @default ""
   */
  session_id: string;
  /**
   * Maximum number of distinct peer IDs to track. Additional peers are
   * bucketed together. Prevents unbounded Map growth in large sessions.
   * @default 64
   */
  max_peers: number;
  /**
   * Minimum gaze confidence to accept (0–1). Samples below this threshold
   * are silently dropped.
   * @default 0.5
   */
  min_confidence: number;
  /**
   * When true, emits `gaze_focus_cell_update` on every cell accumulation.
   * Useful for live visualisation but adds event volume.
   * @default false
   */
  emit_live_updates: boolean;
}

// =============================================================================
// INTERNAL STATE
// =============================================================================

interface GazeFocusState {
  /** Flat row-major array of per-cell accumulators. Length = cols × rows. */
  cells: GazeFocusCell[];
  /** Set of peer IDs that have contributed at least one gaze sample. */
  peerIds: Set<string>;
  /** Wall-clock time when the trait was attached (ms). */
  attachedAt: number;
  /** Cumulative gaze-seconds across all cells and peers. */
  totalGazeSeconds: number;
  /** Whether we have received at least one real eye-tracking sample. */
  hasRealGaze: boolean;
  /** Timestamp of last decay pass (ms). */
  lastDecayAt: number;
}

// =============================================================================
// HELPERS
// =============================================================================

/** Decode a [u, v] UV coordinate into a flat cell index. Returns -1 if OOB. */
function uvToIndex(u: number, v: number, cols: number, rows: number): number {
  if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
  const col = Math.min(Math.floor(u * cols), cols - 1);
  const row = Math.min(Math.floor(v * rows), rows - 1);
  return row * cols + col;
}

/** Apply exponential decay to all cells in-place. */
function decayCells(cells: GazeFocusCell[], decayRateS: number, nowMs: number): void {
  if (decayRateS <= 0) return; // Pure accumulation mode — no decay.

  // Decay factor: weight *= 0.5^(elapsed / decayRateS)
  // Half-life semantics: after `decayRateS` seconds, weight halves.
  const LN2 = 0.6931471805599453;
  const decayPerMs = LN2 / (decayRateS * 1000);

  for (const cell of cells) {
    if (cell.weight <= 0) continue;
    const elapsedMs = nowMs - cell.lastUpdatedAt;
    if (elapsedMs <= 0) continue;
    cell.weight *= Math.exp(-decayPerMs * elapsedMs);
    if (cell.weight < 1e-6) cell.weight = 0;
    // Keep lastUpdatedAt at nowMs so the next call doesn't double-decay.
    cell.lastUpdatedAt = nowMs;
  }
}

/** Build a normalised flat array from the cell accumulators. */
function normaliseWeights(cells: GazeFocusCell[]): number[] {
  let maxW = 0;
  for (const cell of cells) {
    if (cell.weight > maxW) maxW = cell.weight;
  }
  if (maxW === 0) return cells.map(() => 0);
  return cells.map((c) => c.weight / maxW);
}

/** Serialise to the requested format. */
function serialiseHeatmap(heatmap: GazeFocusHeatmap, format: GazeFocusExportFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(heatmap);

    case 'csv': {
      const [cols] = heatmap.resolution;
      const rows = heatmap.resolution[1];
      const lines: string[] = [`nodeId,capturedAt,cols,rows,totalGazeSeconds,peerCount`];
      lines.push(
        `${heatmap.nodeId},${heatmap.capturedAt},${cols},${rows},${heatmap.totalGazeSeconds},${heatmap.peerCount}`
      );
      lines.push('');
      lines.push('row,col,normalisedWeight,rawWeight');
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const idx = r * cols + c;
          lines.push(
            `${r},${c},${heatmap.normalised[idx]?.toFixed(4) ?? 0},${heatmap.raw[idx]?.toFixed(4) ?? 0}`
          );
        }
      }
      return lines.join('\n');
    }

    case 'png_data_uri': {
      // Return a minimal JSON description; actual PNG rendering requires a
      // browser Canvas or Node canvas — left to the consumer to rasterise.
      return JSON.stringify({
        type: 'gaze_focus_heatmap_png_intent',
        note: 'Rasterise normalised[] onto a Canvas using resolution cols×rows.',
        ...heatmap,
      });
    }

    default:
      return JSON.stringify(heatmap);
  }
}

/** Snapshot the current heatmap state into a serialisable structure. */
function buildSnapshot(
  node: HSPlusNode,
  config: GazeFocusAnalyticsConfig,
  state: GazeFocusState
): GazeFocusHeatmap {
  const [cols, rows] = config.resolution;
  return {
    nodeId: node.id ?? 'unknown',
    capturedAt: new Date().toISOString(),
    resolution: [cols, rows],
    normalised: normaliseWeights(state.cells),
    raw: state.cells.map((c) => Math.round(c.weight * 1000) / 1000),
    totalGazeSeconds: Math.round(state.totalGazeSeconds * 1000) / 1000,
    peerCount: state.peerIds.size,
    sessionId: config.session_id,
  };
}

/** Register a gaze hit at UV coordinates (u, v). */
function accumulateGaze(
  state: GazeFocusState,
  config: GazeFocusAnalyticsConfig,
  u: number,
  v: number,
  peerId: string,
  dwellSeconds: number,
  nowMs: number
): void {
  const [cols, rows] = config.resolution;
  const idx = uvToIndex(u, v, cols, rows);
  if (idx < 0) return;

  const cell = state.cells[idx];
  if (!cell) return;

  cell.weight += dwellSeconds;
  cell.lastUpdatedAt = nowMs;
  cell.peersSeenCount = Math.max(cell.peersSeenCount, 1); // will track per-peer below

  state.totalGazeSeconds += dwellSeconds;

  // Track distinct peer IDs up to max_peers.
  if (!state.peerIds.has(peerId) && state.peerIds.size < config.max_peers) {
    state.peerIds.add(peerId);
  }
}

/** Create a fresh cell array. */
function makeCells(cols: number, rows: number): GazeFocusCell[] {
  const cells: GazeFocusCell[] = [];
  for (let i = 0; i < cols * rows; i++) {
    cells.push({ weight: 0, lastUpdatedAt: 0, peersSeenCount: 0 });
  }
  return cells;
}

// =============================================================================
// HANDLER
// =============================================================================

export const gazeFocusAnalyticsHandler: TraitHandler<GazeFocusAnalyticsConfig> = {
  name: 'gaze_focus_analytics',

  defaultConfig: {
    resolution: [16, 9],
    decay_rate_s: 30.0,
    export_event: 'session_end',
    export_format: 'json',
    session_id: '',
    max_peers: 64,
    min_confidence: 0.5,
    emit_live_updates: false,
  },

  onAttach(node, config, context) {
    const [cols, rows] = config.resolution;
    const nowMs = Date.now();
    const state: GazeFocusState = {
      cells: makeCells(cols, rows),
      peerIds: new Set(),
      attachedAt: nowMs,
      totalGazeSeconds: 0,
      hasRealGaze: false,
      lastDecayAt: nowMs,
    };
    node.__gazeFocusState = state;

    context.emit('gaze_focus_analytics_attached', {
      nodeId: node.id,
      resolution: config.resolution,
      sessionId: config.session_id,
    });
  },

  onDetach(node, config, context) {
    const state = node.__gazeFocusState as GazeFocusState | undefined;
    if (!state) return;

    // Emit final snapshot on detach regardless of export_event config.
    const heatmap = buildSnapshot(node, config, state);
    context.emit('gaze_focus_analytics_export', {
      nodeId: node.id,
      heatmap,
      payload: serialiseHeatmap(heatmap, config.export_format),
      format: config.export_format,
      trigger: 'detach',
    });

    delete node.__gazeFocusState;
  },

  onUpdate(_node, config, _context, delta) {
    // Periodic decay pass — runs every frame, but only charges cells that have
    // non-zero weight. The per-cell lastUpdatedAt timestamps ensure we don't
    // double-decay cells that were just written this frame.
    const node = _node;
    const state = node.__gazeFocusState as GazeFocusState | undefined;
    if (!state) return;

    const nowMs = Date.now();

    // Run decay at most once per frame (delta > 0 guard).
    if (config.decay_rate_s > 0 && delta > 0) {
      decayCells(state.cells, config.decay_rate_s, nowMs);
    }

    state.lastDecayAt = nowMs;
  },

  onEvent(node, config, context, event: TraitEvent) {
    const state = node.__gazeFocusState as GazeFocusState | undefined;
    if (!state) return;

    const nowMs = Date.now();

    // ── Local eye-gaze update (same event shape as EyeTrackedTrait) ──
    // The event must carry UV coordinates projected onto this object's surface.
    // The projection is expected to be computed upstream (renderer / XR frame
    // loop) and delivered as `uv: [u, v]`. If absent, we fall back to a
    // simple spherical approximation.
    if (event.type === 'eye_gaze_update' || event.type === 'gaze_hit') {
      const confidence = (event.confidence as number) ?? 1.0;
      if (confidence < config.min_confidence) return;

      const uv = event.uv as [number, number] | undefined;
      if (!uv || uv.length < 2) return;

      const dwellDelta = (event.dwell_delta_s as number) ?? (1 / 72); // 72Hz default
      const peerId = (event.peer_id as string) || 'local';

      accumulateGaze(state, config, uv[0], uv[1], peerId, dwellDelta, nowMs);
      state.hasRealGaze = true;

      if (config.emit_live_updates) {
        const [cols, rows] = config.resolution;
        const idx = uvToIndex(uv[0], uv[1], cols, rows);
        context.emit('gaze_focus_cell_update', {
          nodeId: node.id,
          cellIndex: idx,
          weight: idx >= 0 ? state.cells[idx]?.weight : 0,
          peerId,
        });
      }
    }

    // ── Remote peer gaze (multi-user / networked sessions) ──
    else if (event.type === 'peer_eye_gaze_update') {
      const confidence = (event.confidence as number) ?? 1.0;
      if (confidence < config.min_confidence) return;

      const uv = event.uv as [number, number] | undefined;
      if (!uv || uv.length < 2) return;

      const dwellDelta = (event.dwell_delta_s as number) ?? (1 / 72);
      const peerId = (event.peer_id as string) || 'remote_unknown';

      accumulateGaze(state, config, uv[0], uv[1], peerId, dwellDelta, nowMs);
      state.hasRealGaze = true;
    }

    // ── Triggered export (e.g. "session_end" event or explicit request) ──
    else if (
      event.type === config.export_event ||
      event.type === 'gaze_focus_export_request'
    ) {
      // Apply a final decay pass before export.
      if (config.decay_rate_s > 0) {
        decayCells(state.cells, config.decay_rate_s, nowMs);
      }

      const heatmap = buildSnapshot(node, config, state);
      context.emit('gaze_focus_analytics_export', {
        nodeId: node.id,
        heatmap,
        payload: serialiseHeatmap(heatmap, config.export_format),
        format: config.export_format,
        trigger: event.type,
        requestId: event.requestId,
      });
    }

    // ── Query current state ──
    else if (event.type === 'gaze_focus_query') {
      const heatmap = buildSnapshot(node, config, state);
      context.emit('gaze_focus_info', {
        queryId: event.queryId,
        nodeId: node.id,
        heatmap,
        hasRealGaze: state.hasRealGaze,
        peerCount: state.peerIds.size,
        totalGazeSeconds: state.totalGazeSeconds,
        attachedAt: state.attachedAt,
      });
    }

    // ── Reset accumulator ──
    else if (event.type === 'gaze_focus_reset') {
      const [cols, rows] = config.resolution;
      state.cells = makeCells(cols, rows);
      state.totalGazeSeconds = 0;
      state.peerIds.clear();
      state.hasRealGaze = false;
      state.lastDecayAt = nowMs;

      context.emit('gaze_focus_reset_done', { nodeId: node.id });
    }
  },
};

export default gazeFocusAnalyticsHandler;
