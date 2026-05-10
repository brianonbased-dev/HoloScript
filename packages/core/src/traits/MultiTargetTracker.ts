/**
 * MultiTargetTracker
 *
 * Pure deterministic runtime for the `@multiTargetTracking` trait. Implements:
 *   - Kalman filter (9-state constant-acceleration motion model;
 *     position-only measurement) for per-track state prediction + update
 *   - Hungarian algorithm (Munkres O(n^3)) for optimal frame-to-frame
 *     detection-to-track assignment with rejection threshold
 *   - ReID cosine similarity for persistent identity recovery across
 *     occlusion windows
 *
 * The 9-state choice and parameter defaults mirror uaa2-service's
 * DIRECTIVE_XRG_001 v1.1.0 MTT block ("Logan's AR research"). No external
 * dependencies; pure JS math for clarity and zero-deps portability across
 * web / glasses / node compile targets.
 *
 * Out of scope for this first slice (named extension points):
 *   - Live SLAM adapter (caller supplies detections)
 *   - Live person-detection + pose-estimation adapter
 *   - Adaptive process-noise tuning per motion mode (walking/running/stationary)
 *   - WGSL/WebGPU vectorized acceleration of the matrix math
 *
 * @version 0.1.0
 * @internal
 */

import type { MultiTargetTrackingConfig, ReidFeature } from './MultiTargetTrackingTrait';

// =============================================================================
// PUBLIC TYPES
// =============================================================================

/** 3D point [x, y, z] in meters. */
export type Vec3 = [number, number, number];

/** A detection observed in a single frame. */
export interface Detection {
  /** 3D position in world coordinates (meters). */
  position: Vec3;
  /**
   * ReID appearance embedding. Should be unit-normalized; the tracker will
   * normalize if it isn't. Length must equal `reid_embedding_dim`.
   */
  appearance_embedding: number[];
}

/** Persistent identity tracked across frames. */
export interface Track {
  /** Stable identity assigned at spawn. */
  id: string;
  /** Kalman state [px, py, pz, vx, vy, vz, ax, ay, az]. */
  state: number[];
  /** Kalman covariance (9x9 row-major). */
  covariance: number[];
  /** ReID embedding (running average across observations). */
  reid_embedding: number[];
  /** Frame in which the track was last successfully matched to a detection. */
  last_seen_frame: number;
  /** Number of consecutive frames without a match. */
  occluded_frames: number;
  /** Tracking lifecycle status. */
  status: 'tentative' | 'confirmed' | 'lost';
  /** Frame in which the track was spawned. */
  spawned_frame: number;
}

/** Mutable tracker state across frames. */
export interface TrackerState {
  config: Required<MultiTargetTrackingConfig>;
  tracks: Track[];
  next_id: number;
}

/** Per-frame association result. */
export interface FrameAssociation {
  /** Track id matched to a detection index. */
  track_id: string;
  detection_index: number;
  /** Combined cost (lower = better; 0 = perfect match). */
  cost: number;
}

/** Per-frame re-identification result (lost track recovered via ReID). */
export interface FrameReidentification {
  track_id: string;
  detection_index: number;
  /** Cosine similarity at the moment of recovery (>= reid_similarity_threshold). */
  similarity: number;
}

/** Result of a single tracker step. */
export interface FrameStepResult {
  state: TrackerState;
  associations: FrameAssociation[];
  reidentified: FrameReidentification[];
  spawned: string[];
  lost: string[];
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Construct a fresh tracker. Caller supplies resolved (post-default-fill)
 * config; the trait's `compile()` output handles resolution.
 */
export function createTracker(config: Required<MultiTargetTrackingConfig>): TrackerState {
  return {
    config,
    tracks: [],
    next_id: 1,
  };
}

/**
 * Advance the tracker by one frame. Pure: returns a NEW TrackerState (the
 * input is not mutated). Caller passes detections observed at `frame_index`
 * (monotonically increasing) along with the wall-clock dt since the last
 * frame in seconds.
 */
export function stepTracker(
  state: TrackerState,
  detections: Detection[],
  frame_index: number,
  dt_seconds = 1 / state.config.update_rate_hz
): FrameStepResult {
  validateDetections(detections, state.config);

  // 1. Predict all existing tracks forward by dt.
  const predicted = state.tracks.map((t) => kalmanPredict(t, dt_seconds));

  // 2. Compute cost matrix between predicted tracks and detections.
  const cost = buildCostMatrix(predicted, detections, state.config);

  // 3. Hungarian assignment with rejection threshold.
  const assignment = hungarianAssign(cost, state.config.hungarian_cost_threshold);

  // 4. Update matched tracks; track which tracks + detections are still unassigned.
  const associations: FrameAssociation[] = [];
  const matchedTrackIds = new Set<string>();
  const matchedDetectionIdx = new Set<number>();
  const updatedTracks: Track[] = [];
  for (let i = 0; i < predicted.length; i++) {
    const detIdx = assignment[i];
    if (detIdx >= 0 && detIdx < detections.length) {
      const det = detections[detIdx];
      const updated = kalmanUpdate(predicted[i], det, state.config, frame_index);
      updatedTracks.push(updated);
      matchedTrackIds.add(updated.id);
      matchedDetectionIdx.add(detIdx);
      associations.push({ track_id: updated.id, detection_index: detIdx, cost: cost[i][detIdx] });
    } else {
      // Track unmatched this frame: age it as occluded.
      updatedTracks.push(ageOccludedTrack(predicted[i], state.config));
    }
  }

  // 5. ReID recovery: try to match unmatched detections against lost tracks.
  const reidentified: FrameReidentification[] = [];
  const lostTracks = updatedTracks.filter((t) => t.status === 'lost');
  for (let detIdx = 0; detIdx < detections.length; detIdx++) {
    if (matchedDetectionIdx.has(detIdx)) continue;
    const det = detections[detIdx];
    const bestMatch = findBestReidMatch(det, lostTracks, state.config);
    if (bestMatch !== null) {
      const recovered = reactivateTrack(bestMatch.track, det, state.config, frame_index);
      // Replace the lost track in updatedTracks with the recovered version.
      const idx = updatedTracks.findIndex((t) => t.id === bestMatch.track.id);
      if (idx >= 0) updatedTracks[idx] = recovered;
      matchedDetectionIdx.add(detIdx);
      reidentified.push({
        track_id: recovered.id,
        detection_index: detIdx,
        similarity: bestMatch.similarity,
      });
    }
  }

  // 6. Spawn new tracks for any still-unmatched detections.
  const spawned: string[] = [];
  let next_id = state.next_id;
  for (let detIdx = 0; detIdx < detections.length; detIdx++) {
    if (matchedDetectionIdx.has(detIdx)) continue;
    const newId = `t${next_id++}`;
    updatedTracks.push(spawnTrack(newId, detections[detIdx], state.config, frame_index));
    spawned.push(newId);
  }

  // 7. Collect newly-lost tracks for the result.
  const previouslyLost = new Set(state.tracks.filter((t) => t.status === 'lost').map((t) => t.id));
  const lost: string[] = [];
  for (const t of updatedTracks) {
    if (t.status === 'lost' && !previouslyLost.has(t.id)) lost.push(t.id);
  }

  return {
    state: { config: state.config, tracks: updatedTracks, next_id },
    associations,
    reidentified,
    spawned,
    lost,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateDetections(detections: Detection[], config: Required<MultiTargetTrackingConfig>): void {
  for (let i = 0; i < detections.length; i++) {
    const det = detections[i];
    if (!Array.isArray(det.position) || det.position.length !== 3) {
      throw new Error(`MultiTargetTracker: detection[${i}].position must be a length-3 array`);
    }
    for (const v of det.position) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        throw new Error(`MultiTargetTracker: detection[${i}].position has non-finite component`);
      }
    }
    if (!Array.isArray(det.appearance_embedding) || det.appearance_embedding.length !== config.reid_embedding_dim) {
      throw new Error(
        `MultiTargetTracker: detection[${i}].appearance_embedding must have length=${config.reid_embedding_dim}`
      );
    }
  }
}

// =============================================================================
// KALMAN FILTER (9-state constant-acceleration; position-only measurement)
// =============================================================================

// State layout: [px, py, pz, vx, vy, vz, ax, ay, az]
//
// Transition (constant acceleration):
//   p' = p + v*dt + 0.5*a*dt^2
//   v' = v + a*dt
//   a' = a
//
// Measurement: position only (H = [I_3 | 0_3 | 0_3])

const STATE_DIM = 9;
const MEAS_DIM = 3;

// Process noise (Q): small for position/velocity, larger for acceleration.
const Q_POS = 0.01;
const Q_VEL = 0.1;
const Q_ACC = 1.0;

// Measurement noise (R): per-sensor calibrated in production; constant here.
const R_MEAS = 0.05;

function kalmanPredict(track: Track, dt: number): Track {
  const x = track.state;
  const P = track.covariance;
  const F = transitionMatrix(dt);
  const FT = transpose(F, STATE_DIM, STATE_DIM);
  const Q = processNoise(dt);

  const x_pred = matvec(F, x, STATE_DIM, STATE_DIM);
  const FP = matmul(F, P, STATE_DIM, STATE_DIM, STATE_DIM);
  const P_pred = matadd(matmul(FP, FT, STATE_DIM, STATE_DIM, STATE_DIM), Q, STATE_DIM * STATE_DIM);

  return { ...track, state: x_pred, covariance: P_pred };
}

function kalmanUpdate(
  predicted: Track,
  detection: Detection,
  config: Required<MultiTargetTrackingConfig>,
  frame_index: number
): Track {
  const x = predicted.state;
  const P = predicted.covariance;
  const z = detection.position;

  // Innovation: y = z - H*x  (H projects state to position).
  const y = [z[0] - x[0], z[1] - x[1], z[2] - x[2]];

  // Innovation covariance: S = H * P * H^T + R = top-left 3x3 of P, plus R*I.
  const S = [
    P[0 * STATE_DIM + 0] + R_MEAS,
    P[0 * STATE_DIM + 1],
    P[0 * STATE_DIM + 2],
    P[1 * STATE_DIM + 0],
    P[1 * STATE_DIM + 1] + R_MEAS,
    P[1 * STATE_DIM + 2],
    P[2 * STATE_DIM + 0],
    P[2 * STATE_DIM + 1],
    P[2 * STATE_DIM + 2] + R_MEAS,
  ];
  const S_inv = invert3x3(S);

  // Kalman gain: K = P * H^T * S^-1. H^T extracts first 3 columns of P (i.e. first 3 of each row).
  const K = new Array(STATE_DIM * MEAS_DIM);
  for (let i = 0; i < STATE_DIM; i++) {
    for (let j = 0; j < MEAS_DIM; j++) {
      let sum = 0;
      for (let k = 0; k < MEAS_DIM; k++) {
        sum += P[i * STATE_DIM + k] * S_inv[k * MEAS_DIM + j];
      }
      K[i * MEAS_DIM + j] = sum;
    }
  }

  // State update: x_new = x + K*y
  const x_new = x.slice();
  for (let i = 0; i < STATE_DIM; i++) {
    x_new[i] = x[i] + K[i * MEAS_DIM + 0] * y[0] + K[i * MEAS_DIM + 1] * y[1] + K[i * MEAS_DIM + 2] * y[2];
  }

  // Covariance update: P_new = (I - K*H) * P
  const P_new = new Array(STATE_DIM * STATE_DIM);
  for (let i = 0; i < STATE_DIM; i++) {
    for (let j = 0; j < STATE_DIM; j++) {
      let sum = P[i * STATE_DIM + j];
      // Subtract K * H * P; H picks columns 0..2.
      for (let k = 0; k < MEAS_DIM; k++) {
        sum -= K[i * MEAS_DIM + k] * P[k * STATE_DIM + j];
      }
      P_new[i * STATE_DIM + j] = sum;
    }
  }

  // Update ReID embedding as running average (alpha=0.3 toward new observation).
  const alpha = 0.3;
  const reid_new = predicted.reid_embedding.map(
    (v, k) => (1 - alpha) * v + alpha * detection.appearance_embedding[k]
  );
  const reid_normalized = normalize(reid_new);

  const newStatus: Track['status'] =
    predicted.status === 'tentative' && frame_index - predicted.spawned_frame >= 3
      ? 'confirmed'
      : predicted.status === 'lost'
        ? 'confirmed'
        : predicted.status;

  return {
    ...predicted,
    state: x_new,
    covariance: P_new,
    reid_embedding: reid_normalized,
    last_seen_frame: frame_index,
    occluded_frames: 0,
    status: newStatus,
  };
}

function transitionMatrix(dt: number): number[] {
  // F is 9x9 row-major.
  const F = new Array(STATE_DIM * STATE_DIM).fill(0);
  // Identity diagonal.
  for (let i = 0; i < STATE_DIM; i++) F[i * STATE_DIM + i] = 1;
  // Position += velocity * dt + 0.5 * acceleration * dt^2.
  // Indices: pos = 0..2, vel = 3..5, acc = 6..8.
  const dt2 = 0.5 * dt * dt;
  for (let k = 0; k < 3; k++) {
    F[k * STATE_DIM + (3 + k)] = dt;
    F[k * STATE_DIM + (6 + k)] = dt2;
    F[(3 + k) * STATE_DIM + (6 + k)] = dt;
  }
  return F;
}

function processNoise(dt: number): number[] {
  const Q = new Array(STATE_DIM * STATE_DIM).fill(0);
  for (let k = 0; k < 3; k++) {
    Q[k * STATE_DIM + k] = Q_POS * dt * dt;
    Q[(3 + k) * STATE_DIM + (3 + k)] = Q_VEL * dt * dt;
    Q[(6 + k) * STATE_DIM + (6 + k)] = Q_ACC * dt * dt;
  }
  return Q;
}

// =============================================================================
// COST MATRIX
// =============================================================================

function buildCostMatrix(
  tracks: Track[],
  detections: Detection[],
  config: Required<MultiTargetTrackingConfig>
): number[][] {
  const cost: number[][] = [];
  const wPos = config.position_vs_reid_weight;
  const wReid = 1 - wPos;
  for (let i = 0; i < tracks.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < detections.length; j++) {
      const dPos = positionDistance(tracks[i].state, detections[j].position);
      const sim = cosineSimilarity(tracks[i].reid_embedding, detections[j].appearance_embedding);
      const reidCost = 1 - Math.max(0, sim); // similarity in [0,1] → cost in [0,1]
      const total = wPos * normalizedPosCost(dPos) + wReid * reidCost;
      row.push(total);
    }
    cost.push(row);
  }
  return cost;
}

function positionDistance(state: number[], position: Vec3): number {
  const dx = state[0] - position[0];
  const dy = state[1] - position[1];
  const dz = state[2] - position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Maps a Euclidean distance (meters) to a cost in [0, 1] via a saturating
// 1m-scale function: cost = d / (d + 1). Distance 0 → cost 0; distance 1m
// → cost 0.5; distance 4m → cost 0.8.
function normalizedPosCost(d: number): number {
  return d / (d + 1);
}

// =============================================================================
// HUNGARIAN ASSIGNMENT (Munkres O(n^3))
// =============================================================================

/**
 * Solve the optimal assignment problem for a rectangular cost matrix. Returns
 * an array `assignment` of length `tracks` where `assignment[i] = j` means
 * track i is matched to detection j (or -1 if rejected by threshold or no
 * available detection).
 *
 * Standard Munkres / Hungarian algorithm with row/column padding to handle
 * non-square matrices. Costs at or above `threshold` are rejected post-
 * assignment.
 */
export function hungarianAssign(cost: number[][], threshold: number): number[] {
  const nRows = cost.length;
  if (nRows === 0) return [];
  const nCols = cost[0].length;
  if (nCols === 0) return new Array(nRows).fill(-1);

  // Pad to square with large-cost dummy entries.
  const n = Math.max(nRows, nCols);
  const BIG = 1e9;
  const padded: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) {
      if (i < nRows && j < nCols) row.push(cost[i][j]);
      else row.push(BIG);
    }
    padded.push(row);
  }

  // Step 1: subtract row minima.
  for (let i = 0; i < n; i++) {
    const min = Math.min(...padded[i]);
    for (let j = 0; j < n; j++) padded[i][j] -= min;
  }
  // Step 2: subtract column minima.
  for (let j = 0; j < n; j++) {
    let min = Infinity;
    for (let i = 0; i < n; i++) if (padded[i][j] < min) min = padded[i][j];
    if (min > 0 && min < BIG) for (let i = 0; i < n; i++) padded[i][j] -= min;
  }

  // Step 3: cover all zeros with the minimum number of lines.
  // Use the standard Munkres mark-cover-uncover loop.
  const mark: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const rowCovered = new Array(n).fill(false);
  const colCovered = new Array(n).fill(false);

  // Star initial uncovered zeros.
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (padded[i][j] === 0 && !rowCovered[i] && !colCovered[j]) {
        mark[i][j] = 1;
        rowCovered[i] = true;
        colCovered[j] = true;
      }
    }
  }
  for (let i = 0; i < n; i++) rowCovered[i] = false;
  for (let j = 0; j < n; j++) colCovered[j] = false;

  // Cover columns with starred zeros.
  function coverStarredColumns(): number {
    let count = 0;
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        if (mark[i][j] === 1) {
          colCovered[j] = true;
          count++;
          break;
        }
      }
    }
    return count;
  }

  function findUncoveredZero(): { i: number; j: number } | null {
    for (let i = 0; i < n; i++) {
      if (rowCovered[i]) continue;
      for (let j = 0; j < n; j++) {
        if (!colCovered[j] && padded[i][j] === 0) return { i, j };
      }
    }
    return null;
  }

  function starInRow(i: number): number {
    for (let j = 0; j < n; j++) if (mark[i][j] === 1) return j;
    return -1;
  }

  function starInCol(j: number): number {
    for (let i = 0; i < n; i++) if (mark[i][j] === 1) return i;
    return -1;
  }

  function primeInRow(i: number): number {
    for (let j = 0; j < n; j++) if (mark[i][j] === 2) return j;
    return -1;
  }

  function step5(initialI: number, initialJ: number) {
    // Build alternating series of primes and stars.
    const path: Array<[number, number]> = [[initialI, initialJ]];
    while (true) {
      const lastJ = path[path.length - 1][1];
      const starRow = starInCol(lastJ);
      if (starRow < 0) break;
      path.push([starRow, lastJ]);
      const primeCol = primeInRow(starRow);
      path.push([starRow, primeCol]);
    }
    // Toggle: unstar each star, star each prime; clear all primes; uncover all.
    for (const [i, j] of path) {
      if (mark[i][j] === 1) mark[i][j] = 0;
      else if (mark[i][j] === 2) mark[i][j] = 1;
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (mark[i][j] === 2) mark[i][j] = 0;
    for (let i = 0; i < n; i++) rowCovered[i] = false;
    for (let j = 0; j < n; j++) colCovered[j] = false;
  }

  function step6() {
    let min = Infinity;
    for (let i = 0; i < n; i++) {
      if (rowCovered[i]) continue;
      for (let j = 0; j < n; j++) {
        if (!colCovered[j] && padded[i][j] < min) min = padded[i][j];
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (rowCovered[i]) padded[i][j] += min;
        if (!colCovered[j]) padded[i][j] -= min;
      }
    }
  }

  let safety = 0;
  while (coverStarredColumns() < n) {
    if (safety++ > n * n * 4) break; // theoretical max iterations; safety bound
    let done = false;
    while (!done) {
      const z = findUncoveredZero();
      if (z === null) {
        step6();
        continue;
      }
      mark[z.i][z.j] = 2; // prime
      const starJ = starInRow(z.i);
      if (starJ < 0) {
        step5(z.i, z.j);
        done = true;
      } else {
        rowCovered[z.i] = true;
        colCovered[starJ] = false;
      }
    }
  }

  // Read assignment from starred zeros, respecting threshold and original bounds.
  const assignment = new Array(nRows).fill(-1);
  for (let i = 0; i < nRows; i++) {
    for (let j = 0; j < nCols; j++) {
      if (mark[i][j] === 1 && cost[i][j] < threshold) {
        assignment[i] = j;
        break;
      }
    }
  }
  return assignment;
}

// =============================================================================
// REID
// =============================================================================

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  if (sum === 0) return v.slice();
  const inv = 1 / Math.sqrt(sum);
  return v.map((x) => x * inv);
}

function findBestReidMatch(
  detection: Detection,
  lostTracks: Track[],
  config: Required<MultiTargetTrackingConfig>
): { track: Track; similarity: number } | null {
  let best: { track: Track; similarity: number } | null = null;
  for (const t of lostTracks) {
    const sim = cosineSimilarity(t.reid_embedding, detection.appearance_embedding);
    if (sim >= config.reid_similarity_threshold && (best === null || sim > best.similarity)) {
      best = { track: t, similarity: sim };
    }
  }
  return best;
}

// =============================================================================
// TRACK LIFECYCLE
// =============================================================================

function spawnTrack(
  id: string,
  detection: Detection,
  config: Required<MultiTargetTrackingConfig>,
  frame_index: number
): Track {
  // Initial state: position from detection, zero velocity/acceleration.
  const state = new Array(STATE_DIM).fill(0);
  state[0] = detection.position[0];
  state[1] = detection.position[1];
  state[2] = detection.position[2];

  // Initial covariance: high uncertainty until convergence.
  const covariance = new Array(STATE_DIM * STATE_DIM).fill(0);
  for (let i = 0; i < STATE_DIM; i++) covariance[i * STATE_DIM + i] = i < 3 ? 1.0 : 10.0;

  return {
    id,
    state,
    covariance,
    reid_embedding: normalize(detection.appearance_embedding.slice()),
    last_seen_frame: frame_index,
    occluded_frames: 0,
    status: 'tentative',
    spawned_frame: frame_index,
  };
}

function ageOccludedTrack(track: Track, config: Required<MultiTargetTrackingConfig>): Track {
  const occluded_frames = track.occluded_frames + 1;
  const status: Track['status'] = occluded_frames >= config.max_occluded_frames ? 'lost' : track.status;
  return { ...track, occluded_frames, status };
}

function reactivateTrack(
  track: Track,
  detection: Detection,
  config: Required<MultiTargetTrackingConfig>,
  frame_index: number
): Track {
  const state = track.state.slice();
  // Snap position to detection (best estimate after re-acquisition).
  state[0] = detection.position[0];
  state[1] = detection.position[1];
  state[2] = detection.position[2];
  // Reset velocity/acceleration; re-converge from this observation.
  for (let i = 3; i < STATE_DIM; i++) state[i] = 0;

  // Bump covariance back up for fast re-convergence.
  const covariance = new Array(STATE_DIM * STATE_DIM).fill(0);
  for (let i = 0; i < STATE_DIM; i++) covariance[i * STATE_DIM + i] = i < 3 ? 0.5 : 5.0;

  // Update ReID embedding with new observation (alpha=0.5 — heavier weighting after recovery).
  const alpha = 0.5;
  const reid_new = track.reid_embedding.map(
    (v, k) => (1 - alpha) * v + alpha * detection.appearance_embedding[k]
  );

  return {
    ...track,
    state,
    covariance,
    reid_embedding: normalize(reid_new),
    last_seen_frame: frame_index,
    occluded_frames: 0,
    status: 'confirmed',
  };
}

// =============================================================================
// MATRIX UTILITIES (row-major dense, pure JS)
// =============================================================================

function matmul(a: number[], b: number[], aRows: number, aCols: number, bCols: number): number[] {
  const out = new Array(aRows * bCols).fill(0);
  for (let i = 0; i < aRows; i++) {
    for (let k = 0; k < aCols; k++) {
      const aik = a[i * aCols + k];
      if (aik === 0) continue;
      for (let j = 0; j < bCols; j++) {
        out[i * bCols + j] += aik * b[k * bCols + j];
      }
    }
  }
  return out;
}

function matvec(a: number[], v: number[], aRows: number, aCols: number): number[] {
  const out = new Array(aRows).fill(0);
  for (let i = 0; i < aRows; i++) {
    let sum = 0;
    for (let j = 0; j < aCols; j++) sum += a[i * aCols + j] * v[j];
    out[i] = sum;
  }
  return out;
}

function matadd(a: number[], b: number[], length: number): number[] {
  const out = new Array(length);
  for (let i = 0; i < length; i++) out[i] = a[i] + b[i];
  return out;
}

function transpose(a: number[], rows: number, cols: number): number[] {
  const out = new Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      out[j * rows + i] = a[i * cols + j];
    }
  }
  return out;
}

function invert3x3(m: number[]): number[] {
  const a = m[0], b = m[1], c = m[2];
  const d = m[3], e = m[4], f = m[5];
  const g = m[6], h = m[7], i = m[8];
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) {
    // Near-singular: return identity scaled down to avoid blowup.
    return [1e6, 0, 0, 0, 1e6, 0, 0, 0, 1e6];
  }
  const invDet = 1 / det;
  return [
    A * invDet,
    -(b * i - c * h) * invDet,
    (b * f - c * e) * invDet,
    B * invDet,
    (a * i - c * g) * invDet,
    -(a * f - c * d) * invDet,
    C * invDet,
    -(a * h - b * g) * invDet,
    (a * e - b * d) * invDet,
  ];
}

// =============================================================================
// EXPORTS (for tests / advanced consumers)
// =============================================================================

export const _internal = {
  kalmanPredict,
  kalmanUpdate,
  buildCostMatrix,
  spawnTrack,
  ageOccludedTrack,
  reactivateTrack,
  positionDistance,
  normalizedPosCost,
  normalize,
};
