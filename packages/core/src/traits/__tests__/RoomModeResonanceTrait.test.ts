/**
 * RoomModeResonanceTrait — determinism + physics correctness tests
 *
 * The trait's load-bearing contract: room-mode frequencies are pure
 * functions of (room dimensions, mode indices) via the canonical
 * Rayleigh formula. Q-factors derive from the Sabine reverb time.
 * These tests pin:
 *   - Pure helpers (modalFrequencyHz, classifyMode, sabineT60,
 *     qFactor, totalAbsorptionSabin, enumerateRoomModes,
 *     analyzeRoomModes) against hand-computed reference values
 *   - Mode classification edge cases (axial / tangential / oblique)
 *   - Frequency-ascending sort with stable tiebreak
 *   - Filtering by max_frequency_hz
 *   - Degenerate inputs (zero dimensions, zero absorption,
 *     mode_order=0)
 *   - Handler attach / query / recompute / detach lifecycle
 */

import { describe, it, expect } from 'vitest';
import {
  roomModeResonanceHandler,
  modalFrequencyHz,
  classifyMode,
  sabineT60,
  qFactor,
  totalAbsorptionSabin,
  enumerateRoomModes,
  analyzeRoomModes,
  SPEED_OF_SOUND_MS,
  SABINE_CONSTANT_METRIC,
  type RoomMode,
  type RoomModeAnalysis,
  type MaterialsAbsorption,
} from '../RoomModeResonanceTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Constants — sanity
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — constants', () => {
  it('uses 343 m/s for the speed of sound (20°C dry air, ISO 9613-1)', () => {
    expect(SPEED_OF_SOUND_MS).toBe(343);
  });

  it('uses 0.161 for the metric Sabine constant', () => {
    expect(SABINE_CONSTANT_METRIC).toBe(0.161);
  });
});

// ---------------------------------------------------------------------------
// modalFrequencyHz — Rayleigh formula
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — modalFrequencyHz (pure)', () => {
  it('returns 0 for the trivial mode (0,0,0)', () => {
    expect(modalFrequencyHz(0, 0, 0, 10, 7, 4)).toBe(0);
  });

  it('returns 0 for any non-positive dimension', () => {
    expect(modalFrequencyHz(1, 0, 0, 0, 7, 4)).toBe(0);
    expect(modalFrequencyHz(1, 0, 0, 10, -1, 4)).toBe(0);
    expect(modalFrequencyHz(1, 0, 0, 10, 7, 0)).toBe(0);
  });

  it('computes the (1,0,0) axial mode for a 10m room', () => {
    // f = (343 / 2) * sqrt((1/10)^2) = 171.5 * 0.1 = 17.15 Hz
    expect(modalFrequencyHz(1, 0, 0, 10, 7, 4)).toBeCloseTo(17.15, 6);
  });

  it('computes the (0,1,0) axial mode for a 7m room', () => {
    // f = (343 / 2) * (1/7) = 24.5 Hz
    expect(modalFrequencyHz(0, 1, 0, 10, 7, 4)).toBeCloseTo(24.5, 6);
  });

  it('computes the (0,0,1) axial mode for a 4m room', () => {
    // f = (343 / 2) * (1/4) = 42.875 Hz
    expect(modalFrequencyHz(0, 0, 1, 10, 7, 4)).toBeCloseTo(42.875, 6);
  });

  it('computes a tangential mode (1,1,0)', () => {
    // f = (343/2) * sqrt(0.01 + 1/49) ≈ 171.5 * sqrt(0.030408...)
    //   = 171.5 * 0.17438... ≈ 29.906 Hz
    const expected = (343 / 2) * Math.sqrt(1 / 100 + 1 / 49);
    expect(modalFrequencyHz(1, 1, 0, 10, 7, 4)).toBeCloseTo(expected, 12);
  });

  it('computes an oblique mode (1,1,1)', () => {
    const expected = (343 / 2) * Math.sqrt(1 / 100 + 1 / 49 + 1 / 16);
    expect(modalFrequencyHz(1, 1, 1, 10, 7, 4)).toBeCloseTo(expected, 12);
  });

  it('honours custom speed-of-sound (e.g. helium atmosphere)', () => {
    // Helium speed of sound ≈ 1007 m/s (~3x air). All frequencies scale.
    const air = modalFrequencyHz(1, 0, 0, 10, 7, 4, 343);
    const helium = modalFrequencyHz(1, 0, 0, 10, 7, 4, 1007);
    expect(helium / air).toBeCloseTo(1007 / 343, 12);
  });

  it('is deterministic — same inputs → byte-identical output', () => {
    const a = modalFrequencyHz(2, 1, 1, 10, 7, 4);
    const b = modalFrequencyHz(2, 1, 1, 10, 7, 4);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// classifyMode
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — classifyMode (pure)', () => {
  it('classifies single-axis modes as axial', () => {
    expect(classifyMode(1, 0, 0)).toBe('axial');
    expect(classifyMode(0, 2, 0)).toBe('axial');
    expect(classifyMode(0, 0, 5)).toBe('axial');
  });

  it('classifies two-axis modes as tangential', () => {
    expect(classifyMode(1, 1, 0)).toBe('tangential');
    expect(classifyMode(2, 0, 1)).toBe('tangential');
    expect(classifyMode(0, 3, 4)).toBe('tangential');
  });

  it('classifies three-axis modes as oblique', () => {
    expect(classifyMode(1, 1, 1)).toBe('oblique');
    expect(classifyMode(2, 3, 1)).toBe('oblique');
  });

  it('classifies the trivial (0,0,0) mode as oblique (degenerate, but defined)', () => {
    // The trivial mode is filtered out upstream; classifyMode itself just
    // counts non-zeros, and 0 non-zeros falls through to the oblique branch.
    expect(classifyMode(0, 0, 0)).toBe('oblique');
  });
});

// ---------------------------------------------------------------------------
// sabineT60
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — sabineT60 (pure)', () => {
  const abs: MaterialsAbsorption = { walls: 0.1, floor: 0.05, ceiling: 0.15 };

  it('matches hand-computed T60 for a 10×7×4 room with default absorption', () => {
    // V = 280 m³
    // Walls area = 2*(10*4 + 7*4) = 2*68 = 136 m²
    // Floor = 70, Ceiling = 70
    // A = 136*0.1 + 70*0.05 + 70*0.15 = 13.6 + 3.5 + 10.5 = 27.6 m² Sabin
    // T60 = 0.161 * 280 / 27.6 = 45.08 / 27.6 ≈ 1.6333 s
    const t60 = sabineT60(10, 7, 4, abs);
    expect(t60).toBeCloseTo((0.161 * 280) / 27.6, 12);
    expect(t60).toBeCloseTo(1.63333333, 6);
  });

  it('returns 0 for any non-positive dimension', () => {
    expect(sabineT60(0, 7, 4, abs)).toBe(0);
    expect(sabineT60(10, 0, 4, abs)).toBe(0);
    expect(sabineT60(10, 7, 0, abs)).toBe(0);
  });

  it('returns Infinity when all absorption coefficients are zero', () => {
    const noAbs: MaterialsAbsorption = { walls: 0, floor: 0, ceiling: 0 };
    expect(sabineT60(10, 7, 4, noAbs)).toBe(Number.POSITIVE_INFINITY);
  });

  it('shrinks T60 as absorption increases (monotonic)', () => {
    const low: MaterialsAbsorption = { walls: 0.05, floor: 0.05, ceiling: 0.05 };
    const high: MaterialsAbsorption = { walls: 0.5, floor: 0.5, ceiling: 0.5 };
    expect(sabineT60(10, 7, 4, high)).toBeLessThan(sabineT60(10, 7, 4, low));
  });
});

// ---------------------------------------------------------------------------
// qFactor
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — qFactor (pure)', () => {
  it('matches Q = π · f · T60 / ln(10)', () => {
    // f = 100 Hz, T60 = 1 s → Q = π * 100 * 1 / ln(10) ≈ 136.4376
    expect(qFactor(100, 1)).toBeCloseTo((Math.PI * 100) / Math.LN10, 12);
  });

  it('returns 0 when frequency is non-positive', () => {
    expect(qFactor(0, 1)).toBe(0);
    expect(qFactor(-50, 1)).toBe(0);
  });

  it('returns 0 when T60 is non-positive', () => {
    expect(qFactor(100, 0)).toBe(0);
    expect(qFactor(100, -0.5)).toBe(0);
  });

  it('returns Infinity when T60 is Infinity (perfectly reflective room)', () => {
    expect(qFactor(50, Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
  });

  it('scales linearly with both f and T60', () => {
    const base = qFactor(50, 1);
    expect(qFactor(100, 1)).toBeCloseTo(2 * base, 12);
    expect(qFactor(50, 2)).toBeCloseTo(2 * base, 12);
  });
});

// ---------------------------------------------------------------------------
// totalAbsorptionSabin
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — totalAbsorptionSabin (pure)', () => {
  it('matches hand-computed sabin area for a 10×7×4 room', () => {
    const abs: MaterialsAbsorption = { walls: 0.1, floor: 0.05, ceiling: 0.15 };
    // Walls area = 2*(10*4 + 7*4) = 136
    // Floor = 70, Ceiling = 70
    // Total = 136*0.1 + 70*0.05 + 70*0.15 = 13.6 + 3.5 + 10.5 = 27.6
    expect(totalAbsorptionSabin(10, 7, 4, abs)).toBeCloseTo(27.6, 12);
  });

  it('returns 0 for any non-positive dimension', () => {
    const abs: MaterialsAbsorption = { walls: 0.1, floor: 0.05, ceiling: 0.15 };
    expect(totalAbsorptionSabin(0, 7, 4, abs)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// enumerateRoomModes
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — enumerateRoomModes (pure)', () => {
  it('returns empty list when mode_order < 1', () => {
    expect(enumerateRoomModes(10, 7, 4, 0, 200, 1.6)).toEqual([]);
  });

  it('returns empty list when any dimension is non-positive', () => {
    expect(enumerateRoomModes(0, 7, 4, 3, 200, 1.6)).toEqual([]);
  });

  it('enumerates mode_order=1 cube minus (0,0,0) → 7 modes (no filter)', () => {
    // (nx,ny,nz) in {0,1}^3 minus (0,0,0) = 7 modes. With max_freq=999
    // (effectively no cap), all 7 should pass.
    const modes = enumerateRoomModes(10, 7, 4, 1, 999, 1.6);
    expect(modes).toHaveLength(7);
    // Lowest frequency = (1,0,0) at 17.15 Hz
    expect(modes[0].nx).toBe(1);
    expect(modes[0].ny).toBe(0);
    expect(modes[0].nz).toBe(0);
    expect(modes[0].frequency_hz).toBeCloseTo(17.15, 6);
  });

  it('sorts modes by frequency ascending', () => {
    const modes = enumerateRoomModes(10, 7, 4, 3, 999, 1.6);
    for (let i = 1; i < modes.length; i++) {
      expect(modes[i].frequency_hz).toBeGreaterThanOrEqual(modes[i - 1].frequency_hz);
    }
  });

  it('filters out modes above max_frequency_hz', () => {
    // For 10×7×4 at mode_order=3, sub-200Hz region. The first mode is 17.15 Hz.
    const all = enumerateRoomModes(10, 7, 4, 3, 999, 1.6);
    const filtered = enumerateRoomModes(10, 7, 4, 3, 50, 1.6);
    expect(filtered.length).toBeLessThan(all.length);
    for (const m of filtered) {
      expect(m.frequency_hz).toBeLessThanOrEqual(50);
    }
  });

  it('classifies each mode correctly', () => {
    const modes = enumerateRoomModes(10, 7, 4, 1, 999, 1.6);
    const m100 = modes.find((m) => m.nx === 1 && m.ny === 0 && m.nz === 0);
    const m110 = modes.find((m) => m.nx === 1 && m.ny === 1 && m.nz === 0);
    const m111 = modes.find((m) => m.nx === 1 && m.ny === 1 && m.nz === 1);
    expect(m100?.kind).toBe('axial');
    expect(m110?.kind).toBe('tangential');
    expect(m111?.kind).toBe('oblique');
  });

  it('attaches Q-factors derived from the supplied T60', () => {
    const modes = enumerateRoomModes(10, 7, 4, 1, 999, 1.6);
    const m100 = modes.find((m) => m.nx === 1 && m.ny === 0 && m.nz === 0)!;
    // Q = π · f · T60 / ln(10), f ≈ 17.15, T60 = 1.6
    expect(m100.q_factor).toBeCloseTo((Math.PI * 17.15 * 1.6) / Math.LN10, 6);
  });

  it('is deterministic — same inputs → identical mode list', () => {
    const a = enumerateRoomModes(10, 7, 4, 3, 200, 1.6);
    const b = enumerateRoomModes(10, 7, 4, 3, 200, 1.6);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// analyzeRoomModes
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — analyzeRoomModes (pure integrative)', () => {
  it('returns the full analysis pack for default 10×7×4 config', () => {
    const analysis: RoomModeAnalysis = analyzeRoomModes({
      room_dimensions: [10, 7, 4],
      mode_order: 3,
      materials_absorption: { walls: 0.1, floor: 0.05, ceiling: 0.15 },
      max_frequency_hz: 200,
    });
    expect(analysis.volume_m3).toBe(280);
    expect(analysis.total_absorption_sabin).toBeCloseTo(27.6, 12);
    expect(analysis.t60_seconds).toBeCloseTo(1.63333333, 6);
    expect(analysis.modes.length).toBeGreaterThan(0);
    // Lowest mode = (1,0,0) at 17.15 Hz
    expect(analysis.modes[0].frequency_hz).toBeCloseTo(17.15, 6);
  });

  it('returns zero volume + empty modes for degenerate room', () => {
    const analysis = analyzeRoomModes({
      room_dimensions: [0, 7, 4],
      mode_order: 3,
      materials_absorption: { walls: 0.1, floor: 0.05, ceiling: 0.15 },
      max_frequency_hz: 200,
    });
    expect(analysis.volume_m3).toBe(0);
    expect(analysis.modes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Handler — attach
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — onAttach', () => {
  it('emits room_mode_attached with mode summary', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(roomModeResonanceHandler, node, {}, ctx);
    expect(getEventCount(ctx, 'room_mode_attached')).toBe(1);
    const evt = getLastEvent(ctx, 'room_mode_attached') as {
      modeCount: number;
      t60Seconds: number;
      volumeM3: number;
      lowestModeHz: number;
    };
    expect(evt.modeCount).toBeGreaterThan(0);
    expect(evt.t60Seconds).toBeCloseTo(1.63333333, 6);
    expect(evt.volumeM3).toBe(280);
    expect(evt.lowestModeHz).toBeCloseTo(17.15, 6);
  });

  it('honours emit_attach_event: false', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(roomModeResonanceHandler, node, { emit_attach_event: false }, ctx);
    expect(getEventCount(ctx, 'room_mode_attached')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Handler — query + recompute + detach
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — query + recompute + detach', () => {
  it('responds to room_mode_query with the cached analysis', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(roomModeResonanceHandler, node, {}, ctx);
    ctx.clearEvents();

    sendEvent(roomModeResonanceHandler, node, {}, ctx, {
      type: 'room_mode_query',
      queryId: 'q1',
    });

    expect(getEventCount(ctx, 'room_mode_response')).toBe(1);
    const evt = getLastEvent(ctx, 'room_mode_response') as {
      queryId: string;
      analysis: RoomModeAnalysis;
    };
    expect(evt.queryId).toBe('q1');
    expect(evt.analysis.volume_m3).toBe(280);
    expect(evt.analysis.modes.length).toBeGreaterThan(0);
  });

  it('recomputes on room_mode_recompute (e.g. partition opened)', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(roomModeResonanceHandler, node, {}, ctx);
    ctx.clearEvents();

    // Sub-200Hz cap by default, so a smaller room shifts the mode population.
    sendEvent(
      roomModeResonanceHandler,
      node,
      { room_dimensions: [5, 4, 3], mode_order: 2, max_frequency_hz: 200 },
      ctx,
      { type: 'room_mode_recompute' }
    );

    expect(getEventCount(ctx, 'room_mode_recomputed')).toBe(1);
  });

  it('emits room_mode_detached and clears node state on detach', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(roomModeResonanceHandler, node, {}, ctx);
    expect((node as Record<string, unknown>).__roomModeResonanceState).toBeDefined();

    roomModeResonanceHandler.onDetach?.(
      node as never,
      roomModeResonanceHandler.defaultConfig,
      ctx as never
    );

    expect(getEventCount(ctx, 'room_mode_detached')).toBe(1);
    expect((node as Record<string, unknown>).__roomModeResonanceState).toBeUndefined();
  });

  it('is no-op on event when not attached (defensive)', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    sendEvent(roomModeResonanceHandler, node, {}, ctx, {
      type: 'room_mode_query',
      queryId: 'q1',
    });
    expect(getEventCount(ctx, 'room_mode_response')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Acoustic-physics sanity (regression guard)
// ---------------------------------------------------------------------------

describe('RoomModeResonanceTrait — acoustic-physics sanity', () => {
  it('lowest mode of a small room is higher than that of a large room', () => {
    // Larger room → longer wavelengths fit → lower fundamental.
    const small = enumerateRoomModes(3, 2, 2, 1, 999, 1.0);
    const large = enumerateRoomModes(20, 15, 8, 1, 999, 1.0);
    expect(small[0].frequency_hz).toBeGreaterThan(large[0].frequency_hz);
  });

  it('the two lowest modes of a wide elongated room are axial along the longest axes', () => {
    // For 10×7×4 the lowest modes are:
    //   (1,0,0) axial      = 17.15 Hz
    //   (0,1,0) axial      = 24.5  Hz
    //   (1,1,0) tangential = 29.9  Hz   ← arrives BEFORE (0,0,1) axial
    //   (0,0,1) axial      = 42.875 Hz
    // So the first TWO modes are guaranteed axial; the third is tangential
    // when the longest pair of dimensions are far enough apart from the
    // shortest dimension (the typical "long, low" room shape).
    const modes = enumerateRoomModes(10, 7, 4, 2, 100, 1.6);
    expect(modes[0].kind).toBe('axial');
    expect(modes[1].kind).toBe('axial');
    expect(modes[0].nx).toBe(1);
    expect(modes[1].ny).toBe(1);
    // And the (0,0,1) ceiling-axis axial DOES exist in the list, just not
    // in the first three slots — verify it's present and correctly classed.
    const ceilAxial = modes.find((m) => m.nx === 0 && m.ny === 0 && m.nz === 1);
    expect(ceilAxial?.kind).toBe('axial');
    expect(ceilAxial?.frequency_hz).toBeCloseTo(42.875, 6);
  });

  it('cubic room produces degenerate modes at the same frequency', () => {
    // For a 5×5×5 cube, (1,0,0), (0,1,0), (0,0,1) all have f = 343/10 = 34.3 Hz.
    const modes = enumerateRoomModes(5, 5, 5, 1, 999, 1.0);
    const at343over10 = modes.filter((m) => Math.abs(m.frequency_hz - 34.3) < 1e-6);
    expect(at343over10).toHaveLength(3);
  });
});
