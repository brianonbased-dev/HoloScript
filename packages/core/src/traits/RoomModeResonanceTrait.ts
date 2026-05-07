/**
 * RoomModeResonance Trait
 *
 * Sub-200Hz room-mode eigenfrequency simulation. Computes the standing-wave
 * resonant frequencies of a rectangular room from its dimensions, plus a
 * Q-factor per mode derived from per-surface absorption coefficients.
 *
 * Replaces the gap left by @reverb_zone, which handles broadband RT60 +
 * impulse-response convolution well but exposes no way to specify or
 * visualise the discrete modal structure of a room. The bass region
 * (sub-200Hz) is dominated by a small number of resonant modes spaced
 * far apart in frequency — they're audible as boomy "bass nodes" in
 * corners and as bass-cancellation nulls between them.
 *
 * Canonical use: examples/audio/spatial-audio-showcase.refreshed.holo —
 *   @room_mode_resonance {
 *     room_dimensions: [10.0, 7.0, 4.0]    # x, y, z in metres
 *     mode_order: 3                          # enumerate (nx,ny,nz) ≤ 3
 *     materials_absorption: {
 *       walls: 0.1, floor: 0.05, ceiling: 0.15
 *     }
 *     max_frequency_hz: 200                  # filter to sub-200Hz
 *     emit_heatmap: true
 *     heatmap_resolution: [12, 8, 4]
 *   }
 *
 * Determinism contract:
 *   - Mode frequencies are computed from the canonical Rayleigh formula:
 *       f(nx, ny, nz) = (c/2) * sqrt((nx/Lx)^2 + (ny/Ly)^2 + (nz/Lz)^2)
 *     where c = SPEED_OF_SOUND_MS (343 m/s at 20°C, exposed as a constant)
 *     and (nx, ny, nz) are non-negative integers, not all zero.
 *   - Mode enumeration is exhaustive over the cube max(nx,ny,nz) ≤ mode_order
 *     minus the (0,0,0) trivial mode, then filtered by max_frequency_hz.
 *   - Output mode list is sorted by frequency ascending; ties broken by
 *     stable enumeration order.
 *   - Q-factor uses the canonical resonance-quality form:
 *       Q = π · f · T60 / ln(10) ≈ 1.36 · f · T60
 *     where T60 is the Sabine reverb time:
 *       T60 = 0.161 · V / A
 *     with V = Lx·Ly·Lz and A = Σ(surface_area_i · absorption_coefficient_i).
 *     Higher absorption → shorter T60 → lower Q → broader resonance peak.
 *   - All arithmetic is IEEE-754 double-precision; no Math.random, no
 *     wall-clock, no platform-dependent randomness. Same inputs →
 *     byte-identical output across runs and platforms.
 *
 * Mode classification (axial / tangential / oblique):
 *   - Axial:      exactly 1 of (nx, ny, nz) is non-zero.
 *   - Tangential: exactly 2 are non-zero.
 *   - Oblique:    all 3 are non-zero.
 *   Axial modes are loudest; oblique are weakest. Audio engines place
 *   stronger correction filters at axial frequencies.
 *
 * Trait usage in .holo composition:
 *
 *   object "ConcertHall" {
 *     @room_mode_resonance {
 *       room_dimensions: [22.0, 14.0, 9.0]
 *       mode_order: 4
 *       materials_absorption: {
 *         walls: 0.08, floor: 0.04, ceiling: 0.20
 *       }
 *       max_frequency_hz: 200
 *       emit_heatmap: true
 *     }
 *   }
 *
 * Trait name: room_mode_resonance
 * Category: acoustics
 * Compile targets: all
 *
 * @version 1.0.0
 * @cites task_1778061290860_jbv2 (A-009 example-driven request),
 *        examples/audio/spatial-audio-showcase.refreshed.holo,
 *        Rayleigh, J.W.S. (1894) — Theory of Sound, Vol. II §267,
 *        Sabine, W.C. (1922) — Collected Papers on Acoustics
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Speed of sound in dry air at 20°C, in metres per second.
 * Used in the Rayleigh modal formula. ISO 9613-1 reference value.
 */
export const SPEED_OF_SOUND_MS = 343;

/**
 * Sabine's empirical constant for T60 = K · V / A in metric units.
 * (Imperial Sabine value is 0.049; metric is 0.161.)
 */
export const SABINE_CONSTANT_METRIC = 0.161;

/**
 * Coefficient mapping T60 to resonance Q-factor at frequency f:
 *   Q = π · f · T60 / ln(10)
 * π / ln(10) ≈ 1.3643763538418414
 */
const Q_PER_F_T60 = Math.PI / Math.LN10;

/**
 * Canonical surface keys used by `materials_absorption`. All three are
 * required; the trait normalises arbitrary author input to these.
 */
export type RoomSurfaceKey = 'walls' | 'floor' | 'ceiling';

/** Canonical mode classification by dimensionality of motion. */
export type RoomModeKind = 'axial' | 'tangential' | 'oblique';

// =============================================================================
// TYPES
// =============================================================================

export interface RoomDimensions {
  /** Room length along x in metres. Must be > 0. */
  x: number;
  /** Room length along y in metres. Must be > 0. */
  y: number;
  /** Room length along z (height) in metres. Must be > 0. */
  z: number;
}

export interface MaterialsAbsorption {
  /** Avg absorption coefficient for the four walls. 0..1. */
  walls: number;
  /** Avg absorption coefficient for the floor. 0..1. */
  floor: number;
  /** Avg absorption coefficient for the ceiling. 0..1. */
  ceiling: number;
}

export interface RoomModeResonanceConfig {
  /** Room dimensions [x, y, z] in metres. */
  room_dimensions: [number, number, number];
  /** Maximum integer mode order. Enumerate (nx,ny,nz) with each in [0, mode_order]. */
  mode_order: number;
  /** Per-surface absorption coefficients (0..1). */
  materials_absorption: MaterialsAbsorption;
  /** Filter modes above this frequency (Hz). Default 200 (sub-200Hz problem region). */
  max_frequency_hz: number;
  /** Whether to emit a normalized modal-pressure heatmap on attach/recompute. */
  emit_heatmap: boolean;
  /** Heatmap sample resolution [x, y, z]. Values are clamped to [1, 24]. */
  heatmap_resolution: [number, number, number];
  /** Whether to emit room_mode_attached on attach. */
  emit_attach_event: boolean;
}

export interface RoomMode {
  /** Mode index along x. 0 = no nodes along that axis. */
  nx: number;
  /** Mode index along y. */
  ny: number;
  /** Mode index along z. */
  nz: number;
  /** Resonant frequency in Hz. */
  frequency_hz: number;
  /** Quality factor (dimensionless). Higher = sharper / more boomy. */
  q_factor: number;
  /** Classification by motion dimensionality. */
  kind: RoomModeKind;
}

export interface RoomModeAnalysis {
  /** Modes sorted by frequency ascending. Filtered by max_frequency_hz. */
  modes: RoomMode[];
  /** Sabine reverb time in seconds for this room geometry + materials. */
  t60_seconds: number;
  /** Room volume in m³. */
  volume_m3: number;
  /** Total absorbing area (Σ surface · absorption) in m² Sabin. */
  total_absorption_sabin: number;
}

export interface RoomModeHeatmapPoint {
  /** Sample position in room-local metres, [x, y, z]. */
  position: [number, number, number];
  /** Normalized modal-pressure buildup in [0, 1]. */
  value: number;
}

export interface RoomModeHeatmap {
  /** Effective sample resolution after clamping. */
  resolution: [number, number, number];
  /** Maximum pre-normalization value, useful for legends/debugging. */
  max_value: number;
  /** Deterministically ordered x-major sample points. */
  points: RoomModeHeatmapPoint[];
}

interface RoomModeResonanceState {
  /** Cached analysis result; recomputed only when config materially changes. */
  analysis: RoomModeAnalysis;
}

// =============================================================================
// PURE HELPERS
// =============================================================================

/**
 * Compute the Rayleigh modal frequency for a single (nx, ny, nz) triple.
 *
 * Pure function — exposed so tests can pin determinism without going
 * through the trait handler lifecycle.
 *
 *   f = (c/2) * sqrt((nx/Lx)^2 + (ny/Ly)^2 + (nz/Lz)^2)
 *
 * Returns 0 when (nx, ny, nz) is all-zero (the trivial mode); callers
 * should filter that out. Returns 0 when any dimension is non-positive
 * (degenerate room).
 */
export function modalFrequencyHz(
  nx: number,
  ny: number,
  nz: number,
  Lx: number,
  Ly: number,
  Lz: number,
  speedOfSound: number = SPEED_OF_SOUND_MS
): number {
  if (Lx <= 0 || Ly <= 0 || Lz <= 0) return 0;
  if (nx === 0 && ny === 0 && nz === 0) return 0;
  const ax = nx / Lx;
  const ay = ny / Ly;
  const az = nz / Lz;
  return (speedOfSound / 2) * Math.sqrt(ax * ax + ay * ay + az * az);
}

/**
 * Classify a mode by how many of its indices are non-zero.
 *
 * Pure function. Required by axial-stronger-than-oblique acoustic theory.
 */
export function classifyMode(nx: number, ny: number, nz: number): RoomModeKind {
  const nonZero = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
  if (nonZero === 1) return 'axial';
  if (nonZero === 2) return 'tangential';
  return 'oblique';
}

/**
 * Compute the Sabine reverb time T60 in seconds for a rectangular room
 * with per-surface absorption.
 *
 * Pure function. Volume V = Lx·Ly·Lz. Total absorption A = Σ(area · α).
 *
 *   T60 = 0.161 · V / A
 *
 * Returns Infinity when total absorption is zero (perfectly reflective
 * room, no decay). Returns 0 when volume is zero (degenerate room).
 */
export function sabineT60(
  Lx: number,
  Ly: number,
  Lz: number,
  abs: MaterialsAbsorption
): number {
  if (Lx <= 0 || Ly <= 0 || Lz <= 0) return 0;
  const V = Lx * Ly * Lz;
  // Surface areas: 2 walls of (Lx·Lz), 2 walls of (Ly·Lz), 1 floor (Lx·Ly),
  // 1 ceiling (Lx·Ly). Authors specify a single 'walls' coefficient for
  // all four side walls — standard simplification.
  const wallsArea = 2 * (Lx * Lz + Ly * Lz);
  const floorArea = Lx * Ly;
  const ceilingArea = Lx * Ly;
  const A =
    wallsArea * abs.walls + floorArea * abs.floor + ceilingArea * abs.ceiling;
  if (A <= 0) return Number.POSITIVE_INFINITY;
  return (SABINE_CONSTANT_METRIC * V) / A;
}

/**
 * Compute the resonance Q-factor at frequency f (Hz) given T60 (s).
 *
 * Pure function.
 *   Q = π · f · T60 / ln(10)
 *
 * When T60 is Infinity (perfectly reflective room), returns Infinity
 * — the resonance is undamped. When f or T60 is non-positive, returns 0.
 */
export function qFactor(frequencyHz: number, t60Seconds: number): number {
  if (frequencyHz <= 0 || t60Seconds <= 0) return 0;
  if (!Number.isFinite(t60Seconds)) return Number.POSITIVE_INFINITY;
  return Q_PER_F_T60 * frequencyHz * t60Seconds;
}

/**
 * Compute the total absorbing surface area in m² Sabin (the A in T60 = 0.161·V/A).
 *
 * Pure function. Useful for visualisers and debugging.
 */
export function totalAbsorptionSabin(
  Lx: number,
  Ly: number,
  Lz: number,
  abs: MaterialsAbsorption
): number {
  if (Lx <= 0 || Ly <= 0 || Lz <= 0) return 0;
  const wallsArea = 2 * (Lx * Lz + Ly * Lz);
  const floorArea = Lx * Ly;
  const ceilingArea = Lx * Ly;
  return wallsArea * abs.walls + floorArea * abs.floor + ceilingArea * abs.ceiling;
}

/**
 * Enumerate all room modes up to mode_order, filter by max_frequency_hz,
 * sort by frequency ascending.
 *
 * Pure function — the load-bearing determinism contract lives here.
 * Same inputs → byte-identical output across V8 / SpiderMonkey / WASM.
 *
 * Enumeration walks (nx, ny, nz) in lex order over [0, modeOrder]^3
 * and skips (0,0,0). Sort is stable on (frequency, lex order) so two
 * modes at exactly the same frequency keep their enumeration order.
 */
export function enumerateRoomModes(
  Lx: number,
  Ly: number,
  Lz: number,
  modeOrder: number,
  maxFrequencyHz: number,
  t60Seconds: number,
  speedOfSound: number = SPEED_OF_SOUND_MS
): RoomMode[] {
  if (modeOrder < 1 || Lx <= 0 || Ly <= 0 || Lz <= 0) return [];

  const out: Array<RoomMode & { _enumIndex: number }> = [];
  let enumIndex = 0;

  for (let nx = 0; nx <= modeOrder; nx++) {
    for (let ny = 0; ny <= modeOrder; ny++) {
      for (let nz = 0; nz <= modeOrder; nz++) {
        if (nx === 0 && ny === 0 && nz === 0) continue;
        const f = modalFrequencyHz(nx, ny, nz, Lx, Ly, Lz, speedOfSound);
        if (f > maxFrequencyHz) {
          enumIndex++;
          continue;
        }
        out.push({
          nx,
          ny,
          nz,
          frequency_hz: f,
          q_factor: qFactor(f, t60Seconds),
          kind: classifyMode(nx, ny, nz),
          _enumIndex: enumIndex++,
        });
      }
    }
  }

  // Stable sort by frequency, ties broken by enumeration order.
  out.sort((a, b) => {
    if (a.frequency_hz !== b.frequency_hz) return a.frequency_hz - b.frequency_hz;
    return a._enumIndex - b._enumIndex;
  });

  return out.map(({ _enumIndex, ...m }) => m);
}

/**
 * Compute the full RoomModeAnalysis for a config.
 *
 * Pure function — the integrative entry point that drives the trait
 * handler. Unit-testable in isolation.
 */
export function analyzeRoomModes(
  config: Pick<
    RoomModeResonanceConfig,
    'room_dimensions' | 'mode_order' | 'materials_absorption' | 'max_frequency_hz'
  >
): RoomModeAnalysis {
  const [Lx, Ly, Lz] = config.room_dimensions;
  const t60 = sabineT60(Lx, Ly, Lz, config.materials_absorption);
  const modes = enumerateRoomModes(
    Lx,
    Ly,
    Lz,
    config.mode_order,
    config.max_frequency_hz,
    t60
  );
  return {
    modes,
    t60_seconds: t60,
    volume_m3: Lx > 0 && Ly > 0 && Lz > 0 ? Lx * Ly * Lz : 0,
    total_absorption_sabin: totalAbsorptionSabin(
      Lx,
      Ly,
      Lz,
      config.materials_absorption
    ),
  };
}

function clampHeatmapResolution(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(24, Math.floor(value)));
}

function modeKindWeight(kind: RoomModeKind): number {
  if (kind === 'axial') return 1.0;
  if (kind === 'tangential') return 0.62;
  return 0.38;
}

function modalPressureMagnitude(
  mode: RoomMode,
  position: [number, number, number],
  roomDimensions: [number, number, number]
): number {
  const [x, y, z] = position;
  const [Lx, Ly, Lz] = roomDimensions;
  if (Lx <= 0 || Ly <= 0 || Lz <= 0) return 0;
  const px = Math.cos((mode.nx * Math.PI * x) / Lx);
  const py = Math.cos((mode.ny * Math.PI * y) / Ly);
  const pz = Math.cos((mode.nz * Math.PI * z) / Lz);
  return Math.abs(px * py * pz);
}

/**
 * Generate a normalized room-local modal-pressure heatmap from an analysis.
 *
 * The heatmap is deterministic and renderer-neutral: each sample sums modal
 * pressure magnitudes weighted by mode kind and bounded Q. Axial modes carry
 * the highest perceptual weight because they are usually the loudest room
 * resonances; tangential and oblique modes contribute less.
 */
export function generateRoomModeHeatmap(
  analysis: RoomModeAnalysis,
  roomDimensions: [number, number, number],
  resolution: [number, number, number]
): RoomModeHeatmap {
  const [Lx, Ly, Lz] = roomDimensions;
  const rx = clampHeatmapResolution(resolution[0]);
  const ry = clampHeatmapResolution(resolution[1]);
  const rz = clampHeatmapResolution(resolution[2]);

  if (Lx <= 0 || Ly <= 0 || Lz <= 0 || analysis.modes.length === 0) {
    return { resolution: [rx, ry, rz], max_value: 0, points: [] };
  }

  const raw: RoomModeHeatmapPoint[] = [];
  let maxValue = 0;

  for (let ix = 0; ix < rx; ix++) {
    const x = rx === 1 ? Lx / 2 : (ix / (rx - 1)) * Lx;
    for (let iy = 0; iy < ry; iy++) {
      const y = ry === 1 ? Ly / 2 : (iy / (ry - 1)) * Ly;
      for (let iz = 0; iz < rz; iz++) {
        const z = rz === 1 ? Lz / 2 : (iz / (rz - 1)) * Lz;
        const position: [number, number, number] = [x, y, z];
        let value = 0;
        for (const mode of analysis.modes) {
          const qWeight = Number.isFinite(mode.q_factor)
            ? Math.min(1, mode.q_factor / 200)
            : 1;
          value +=
            modalPressureMagnitude(mode, position, roomDimensions) *
            modeKindWeight(mode.kind) *
            qWeight;
        }
        maxValue = Math.max(maxValue, value);
        raw.push({ position, value });
      }
    }
  }

  if (maxValue <= 0) {
    return { resolution: [rx, ry, rz], max_value: 0, points: raw };
  }

  return {
    resolution: [rx, ry, rz],
    max_value: maxValue,
    points: raw.map((point) => ({
      position: point.position,
      value: point.value / maxValue,
    })),
  };
}

// =============================================================================
// HANDLER
// =============================================================================

export const roomModeResonanceHandler: TraitHandler<RoomModeResonanceConfig> = {
  name: 'room_mode_resonance',

  defaultConfig: {
    room_dimensions: [10.0, 7.0, 4.0],
    mode_order: 3,
    materials_absorption: {
      walls: 0.1,
      floor: 0.05,
      ceiling: 0.15,
    },
    max_frequency_hz: 200,
    emit_heatmap: false,
    heatmap_resolution: [8, 6, 4],
    emit_attach_event: true,
  },

  onAttach(node, config, context) {
    const analysis = analyzeRoomModes(config);
    const state: RoomModeResonanceState = { analysis };
    (node as unknown as Record<string, unknown>).__roomModeResonanceState = state;

    if (config.emit_attach_event) {
      context.emit?.('room_mode_attached', {
        node,
        modeCount: analysis.modes.length,
        t60Seconds: analysis.t60_seconds,
        volumeM3: analysis.volume_m3,
        lowestModeHz: analysis.modes[0]?.frequency_hz ?? 0,
      });
    }

    if (config.emit_heatmap) {
      context.emit?.('room_mode_heatmap', {
        node,
        heatmap: generateRoomModeHeatmap(
          analysis,
          config.room_dimensions,
          config.heatmap_resolution
        ),
      });
    }
  },

  onDetach(node, _config, context) {
    context.emit?.('room_mode_detached', { node });
    delete (node as unknown as Record<string, unknown>).__roomModeResonanceState;
  },

  onEvent(node, config, context, event) {
    const state = (node as unknown as Record<string, unknown>).__roomModeResonanceState as
      | RoomModeResonanceState
      | undefined;
    if (!state) return;

    if (event.type === 'room_mode_query') {
      const response: {
        queryId: unknown;
        node: unknown;
        analysis: RoomModeAnalysis;
        heatmap?: RoomModeHeatmap;
      } = {
        queryId: event.queryId,
        node,
        analysis: state.analysis,
      };
      if (event.includeHeatmap === true) {
        response.heatmap = generateRoomModeHeatmap(
          state.analysis,
          config.room_dimensions,
          config.heatmap_resolution
        );
      }
      context.emit?.('room_mode_response', response);
      return;
    }

    if (event.type === 'room_mode_recompute') {
      // Re-derive from CURRENT config (substrate may have updated dimensions
      // or absorption mid-session, e.g. partition opened).
      state.analysis = analyzeRoomModes(config);
      context.emit?.('room_mode_recomputed', {
        node,
        modeCount: state.analysis.modes.length,
        t60Seconds: state.analysis.t60_seconds,
      });
      if (config.emit_heatmap) {
        context.emit?.('room_mode_heatmap', {
          node,
          heatmap: generateRoomModeHeatmap(
            state.analysis,
            config.room_dimensions,
            config.heatmap_resolution
          ),
        });
      }
      return;
    }
  },
};
