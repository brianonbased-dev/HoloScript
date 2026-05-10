/**
 * Hungarian Assignment Trait
 *
 * Solves the assignment problem: given an n×m cost matrix between tracks and
 * detections, return the minimum-cost one-to-one matching. Unmatched rows are
 * reported as `unmatched_tracks` and unmatched columns as `new_detections`.
 *
 * Uses the O(n^3) Kuhn–Munkres algorithm with rectangular-matrix padding so
 * non-square inputs work. Cells with cost > `association_threshold` are forced
 * to "unmatched" after solving to prevent garbage assignments.
 *
 * Lifted from uaa2-service mtt-algorithm-panel.hsplus.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface AssignmentResult {
  matched_pairs: Array<{ track: number; detection: number; cost: number }>;
  unmatched_tracks: number[];
  new_detections: number[];
  total_cost: number;
  ran_at: number;
  duration_ms: number;
}

export interface HungarianAssignmentConfig {
  association_threshold: number;
  max_matrix_size: number;
  pad_cost: number;
}

interface HungarianInternalState {
  lastResult: AssignmentResult | null;
  totalRuns: number;
  totalMatches: number;
}

const INF = 1e9;

function solveSquare(cost: number[][]): number[] {
  const n = cost.length;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(INF);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) {
            minv[j] = cur;
            way[j] = j0;
          }
          if (minv[j] < delta) {
            delta = minv[j];
            j1 = j;
          }
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0 !== 0);
  }

  const assignment = new Array<number>(n).fill(-1);
  for (let j = 1; j <= n; j++) {
    if (p[j] > 0) assignment[p[j] - 1] = j - 1;
  }
  return assignment;
}

function solve(costMatrix: number[][], padCost: number): number[] {
  const rows = costMatrix.length;
  if (rows === 0) return [];
  const cols = costMatrix[0].length;
  const n = Math.max(rows, cols);
  const padded: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i < rows && j < cols) row.push(costMatrix[i][j]);
      else row.push(padCost);
    }
    padded.push(row);
  }
  const fullAssignment = solveSquare(padded);
  // Crop back to original tracks (rows). Detection index >= cols means unmatched.
  return fullAssignment.slice(0, rows).map((d) => (d >= cols ? -1 : d));
}

// =============================================================================
// HANDLER
// =============================================================================

export const hungarianAssignmentHandler: TraitHandler<HungarianAssignmentConfig> = {
  name: 'hungarian_assignment',

  defaultConfig: {
    association_threshold: 0.5,
    max_matrix_size: 64,
    pad_cost: 1.0,
  },

  onAttach(node, _config, _context) {
    const internal: HungarianInternalState = {
      lastResult: null,
      totalRuns: 0,
      totalMatches: 0,
    };
    node.__hungarianState = internal;
  },

  onDetach(node, _config, _context) {
    delete node.__hungarianState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Solver is event-driven (one run per `hungarian_solve` event).
    // No per-tick work to do.
  },

  onEvent(node, config, context, event) {
    const internal = node.__hungarianState as HungarianInternalState | undefined;
    if (!internal) return;

    if (event.type === 'hungarian_solve') {
      const costMatrix = (event.cost_matrix as number[][]) ?? [];
      const rows = costMatrix.length;
      const cols = rows > 0 ? costMatrix[0].length : 0;

      if (rows > config.max_matrix_size || cols > config.max_matrix_size) {
        context.emit?.('hungarian_rejected', {
          node,
          reason: 'matrix_too_large',
          rows,
          cols,
          max: config.max_matrix_size,
        });
        return;
      }

      const t0 = Date.now();
      const assignment = solve(costMatrix, config.pad_cost);
      const t1 = Date.now();

      const matched: AssignmentResult['matched_pairs'] = [];
      const unmatchedTracks: number[] = [];
      const matchedDetections = new Set<number>();
      let totalCost = 0;

      for (let i = 0; i < assignment.length; i++) {
        const j = assignment[i];
        if (j === -1) {
          unmatchedTracks.push(i);
          continue;
        }
        const cost = costMatrix[i][j];
        if (cost > config.association_threshold) {
          unmatchedTracks.push(i);
          continue;
        }
        matched.push({ track: i, detection: j, cost });
        matchedDetections.add(j);
        totalCost += cost;
      }

      const newDetections: number[] = [];
      for (let j = 0; j < cols; j++) {
        if (!matchedDetections.has(j)) newDetections.push(j);
      }

      const result: AssignmentResult = {
        matched_pairs: matched,
        unmatched_tracks: unmatchedTracks,
        new_detections: newDetections,
        total_cost: totalCost,
        ran_at: t0,
        duration_ms: t1 - t0,
      };

      internal.lastResult = result;
      internal.totalRuns++;
      internal.totalMatches += matched.length;

      context.emit?.('hungarian_solved', { node, ...result });
      return;
    }

    if (event.type === 'hungarian_query') {
      context.emit?.('hungarian_status', {
        queryId: event.queryId,
        node,
        totalRuns: internal.totalRuns,
        totalMatches: internal.totalMatches,
        lastResult: internal.lastResult,
      });
      return;
    }
  },
};

export default hungarianAssignmentHandler;
