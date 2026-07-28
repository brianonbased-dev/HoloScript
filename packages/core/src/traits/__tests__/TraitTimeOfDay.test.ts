/**
 * TraitTimeOfDay — determinism + correctness tests
 *
 * Load-bearing contract: all outputs are pure functions of
 * (config, elapsedSeconds, startPhaseIndex). Same inputs → identical output.
 *
 * Pins:
 *   - Pure helpers: resolveTimeOfDayPhase, lerpTod, clamp01Tod, resolvePhaseConfig,
 *     deriveTimeOfDayOutput
 *   - Phase sequencing: dawn→golden→dusk→dark→dawn cycle order
 *   - start_phase offset: golden start begins at slot 1
 *   - phase_t ∈ [0, 1) within each slot
 *   - Smoothstep interpolation: output values interpolate across phase boundaries
 *   - Output field ranges: sun_intensity, ambient_light, fog_density, sky_exposure
 *   - Determinism: same inputs → byte-equal outputs
 *   - Lifecycle: attach / update / seek / query / reset / detach events
 *   - Phase-change event: fires when current_phase changes
 *   - emit_tick=false suppresses tick events
 *   - Minimum cycle duration guard (< 6s clamped to 6s)
 */

import { describe, it, expect } from 'vitest';
import {
  timeOfDayHandler,
  resolveTimeOfDayPhase,
  lerpTod,
  clamp01Tod,
  resolvePhaseConfig,
  deriveTimeOfDayOutput,
  DEFAULT_PHASE_CONFIGS,
  TIME_OF_DAY_PHASES,
  type TimeOfDayConfig,
  type TimeOfDayOutput,
} from '../TraitTimeOfDay';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// =============================================================================
// Pure helpers — resolveTimeOfDayPhase
// =============================================================================

describe('TraitTimeOfDay — resolveTimeOfDayPhase (pure)', () => {
  it('passes through all canonical phase names', () => {
    expect(resolveTimeOfDayPhase('dawn')).toBe('dawn');
    expect(resolveTimeOfDayPhase('golden')).toBe('golden');
    expect(resolveTimeOfDayPhase('dusk')).toBe('dusk');
    expect(resolveTimeOfDayPhase('dark')).toBe('dark');
  });

  it('falls back to "golden" for unknown values', () => {
    expect(resolveTimeOfDayPhase('noon')).toBe('golden');
    expect(resolveTimeOfDayPhase('')).toBe('golden');
    expect(resolveTimeOfDayPhase('DAWN')).toBe('golden');
    expect(resolveTimeOfDayPhase('sunrise')).toBe('golden');
  });
});

// =============================================================================
// Pure helpers — lerpTod / clamp01Tod
// =============================================================================

describe('TraitTimeOfDay — lerpTod (pure)', () => {
  it('returns a at t=0', () => {
    expect(lerpTod(0.2, 0.8, 0)).toBeCloseTo(0.2, 12);
  });
  it('returns b at t=1', () => {
    expect(lerpTod(0.2, 0.8, 1)).toBeCloseTo(0.8, 12);
  });
  it('returns midpoint at t=0.5', () => {
    expect(lerpTod(0.0, 1.0, 0.5)).toBeCloseTo(0.5, 12);
  });
});

describe('TraitTimeOfDay — clamp01Tod (pure)', () => {
  it('clamps negative to 0', () => {
    expect(clamp01Tod(-0.5)).toBe(0);
    expect(clamp01Tod(-1e9)).toBe(0);
  });
  it('clamps above 1 to 1', () => {
    expect(clamp01Tod(1.5)).toBe(1);
    expect(clamp01Tod(1e9)).toBe(1);
  });
  it('passes through values in [0, 1]', () => {
    expect(clamp01Tod(0)).toBe(0);
    expect(clamp01Tod(0.5)).toBe(0.5);
    expect(clamp01Tod(1)).toBe(1);
  });
});

// =============================================================================
// Pure helpers — resolvePhaseConfig
// =============================================================================

describe('TraitTimeOfDay — resolvePhaseConfig (pure)', () => {
  it('returns default config when no override', () => {
    const cfg = resolvePhaseConfig('golden', undefined);
    expect(cfg).toEqual(DEFAULT_PHASE_CONFIGS['golden']);
  });

  it('merges partial overrides onto defaults', () => {
    const cfg = resolvePhaseConfig('golden', {
      golden: { sun_intensity: 0.99 },
    });
    expect(cfg.sun_intensity).toBe(0.99);
    // Other fields untouched
    expect(cfg.ambient_light).toBe(DEFAULT_PHASE_CONFIGS['golden'].ambient_light);
    expect(cfg.fog_density).toBe(DEFAULT_PHASE_CONFIGS['golden'].fog_density);
  });

  it('does not mutate DEFAULT_PHASE_CONFIGS', () => {
    const origSunIntensity = DEFAULT_PHASE_CONFIGS['dark'].sun_intensity;
    resolvePhaseConfig('dark', { dark: { sun_intensity: 0.5 } });
    expect(DEFAULT_PHASE_CONFIGS['dark'].sun_intensity).toBe(origSunIntensity);
  });
});

// =============================================================================
// deriveTimeOfDayOutput — phase sequencing
// =============================================================================

describe('TraitTimeOfDay — deriveTimeOfDayOutput phase sequencing', () => {
  function makeConfig(startPhase: string = 'dawn'): TimeOfDayConfig {
    return {
      cycle_duration_minutes: 4, // 240s total → 60s per phase
      start_phase: resolveTimeOfDayPhase(startPhase),
      emit_tick: true,
      emit_phase_change: true,
    };
  }

  it('starts in start_phase at t=0', () => {
    const cfg = makeConfig('dawn');
    const out = deriveTimeOfDayOutput(cfg, 0, 0); // startPhaseIndex=0 (dawn)
    expect(out.current_phase).toBe('dawn');
    expect(out.phase_t).toBeCloseTo(0, 6);
    expect(out.elapsedSeconds).toBe(0);
  });

  it('progresses through all 4 phases in order (dawn start)', () => {
    const cfg = makeConfig('dawn');
    const startIdx = 0; // dawn
    const cycleSec = cfg.cycle_duration_minutes * 60; // 240s
    const phaseSec = cycleSec / 4; // 60s

    const expected: Array<{ phase: string; midpoint: number }> = [
      { phase: 'dawn', midpoint: phaseSec * 0.5 },
      { phase: 'golden', midpoint: phaseSec * 1.5 },
      { phase: 'dusk', midpoint: phaseSec * 2.5 },
      { phase: 'dark', midpoint: phaseSec * 3.5 },
    ];

    for (const { phase, midpoint } of expected) {
      const out = deriveTimeOfDayOutput(cfg, midpoint, startIdx);
      expect(out.current_phase).toBe(phase);
      // At the midpoint phase_t should be approximately 0.5
      expect(out.phase_t).toBeCloseTo(0.5, 3);
    }
  });

  it('wraps back to dawn after one full cycle', () => {
    const cfg = makeConfig('dawn');
    const cycleSec = cfg.cycle_duration_minutes * 60; // 240s
    const out = deriveTimeOfDayOutput(cfg, cycleSec + 1, 0); // 1s into the next cycle
    expect(out.current_phase).toBe('dawn');
  });

  it('golden start: slot 0 at t=0 is golden', () => {
    const cfg = makeConfig('golden');
    const goldenIdx = TIME_OF_DAY_PHASES.indexOf('golden'); // 1
    const out = deriveTimeOfDayOutput(cfg, 0, goldenIdx);
    expect(out.current_phase).toBe('golden');
  });

  it('phase_t increases monotonically within a phase', () => {
    const cfg = makeConfig('dawn');
    const phaseSec = (cfg.cycle_duration_minutes * 60) / 4;
    let prevT = -1;
    for (let i = 0; i <= 10; i++) {
      const t = (phaseSec / 10) * i;
      const out = deriveTimeOfDayOutput(cfg, t, 0);
      if (out.current_phase === 'dawn') {
        expect(out.phase_t).toBeGreaterThan(prevT);
        prevT = out.phase_t;
      }
    }
  });

  it('phase_t is always in [0, 1]', () => {
    const cfg = makeConfig('dawn');
    const cycleSec = cfg.cycle_duration_minutes * 60;
    for (let i = 0; i <= 100; i++) {
      const t = (cycleSec * 1.5 * i) / 100;
      const out = deriveTimeOfDayOutput(cfg, t, 0);
      expect(out.phase_t).toBeGreaterThanOrEqual(0);
      expect(out.phase_t).toBeLessThanOrEqual(1);
    }
  });
});

// =============================================================================
// deriveTimeOfDayOutput — output field values
// =============================================================================

describe('TraitTimeOfDay — deriveTimeOfDayOutput interpolated outputs', () => {
  it('at phase start, output matches current phase defaults', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 4,
      start_phase: 'dawn',
      emit_tick: true,
      emit_phase_change: true,
    };
    // t=0, phase_t=0: smoothstep(0)=0 so we lerp 0% toward next → equals dawn config
    const out = deriveTimeOfDayOutput(cfg, 0, 0);
    expect(out.sun_intensity).toBeCloseTo(DEFAULT_PHASE_CONFIGS['dawn'].sun_intensity, 6);
    expect(out.ambient_light).toBeCloseTo(DEFAULT_PHASE_CONFIGS['dawn'].ambient_light, 6);
    expect(out.fog_density).toBeCloseTo(DEFAULT_PHASE_CONFIGS['dawn'].fog_density, 6);
    expect(out.sky_exposure).toBeCloseTo(DEFAULT_PHASE_CONFIGS['dawn'].sky_exposure, 6);
  });

  it('sun_intensity is always in [0, 1]', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 4,
      start_phase: 'dawn',
      emit_tick: true,
      emit_phase_change: true,
    };
    const cycleSec = cfg.cycle_duration_minutes * 60;
    for (let i = 0; i <= 200; i++) {
      const t = (cycleSec * 2 * i) / 200;
      const out = deriveTimeOfDayOutput(cfg, t, 0);
      expect(out.sun_intensity).toBeGreaterThanOrEqual(0);
      expect(out.sun_intensity).toBeLessThanOrEqual(1);
    }
  });

  it('fog_density is always positive', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 4,
      start_phase: 'dawn',
      emit_tick: true,
      emit_phase_change: true,
    };
    const cycleSec = cfg.cycle_duration_minutes * 60;
    for (let i = 0; i <= 200; i++) {
      const t = (cycleSec * 2 * i) / 200;
      const out = deriveTimeOfDayOutput(cfg, t, 0);
      expect(out.fog_density).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// deriveTimeOfDayOutput — determinism
// =============================================================================

describe('TraitTimeOfDay — deriveTimeOfDayOutput determinism', () => {
  it('same inputs → byte-equal output', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 24,
      start_phase: 'golden',
      emit_tick: true,
      emit_phase_change: true,
    };
    const a = deriveTimeOfDayOutput(cfg, 123.456, 1);
    const b = deriveTimeOfDayOutput(cfg, 123.456, 1);
    expect(a.current_phase).toBe(b.current_phase);
    expect(a.phase_t).toBe(b.phase_t);
    expect(a.sun_intensity).toBe(b.sun_intensity);
    expect(a.fog_density).toBe(b.fog_density);
  });

  it('different elapsedSeconds → different elapsedSeconds in output', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 24,
      start_phase: 'dawn',
      emit_tick: true,
      emit_phase_change: true,
    };
    const a = deriveTimeOfDayOutput(cfg, 100, 0);
    const b = deriveTimeOfDayOutput(cfg, 200, 0);
    expect(a.elapsedSeconds).not.toBe(b.elapsedSeconds);
  });
});

// =============================================================================
// Minimum cycle duration guard
// =============================================================================

describe('TraitTimeOfDay — minimum cycle guard', () => {
  it('cycle shorter than 6s is clamped to 6s (no division by zero)', () => {
    const cfg: TimeOfDayConfig = {
      cycle_duration_minutes: 0, // would be 0s without the guard
      start_phase: 'dawn',
      emit_tick: true,
      emit_phase_change: true,
    };
    // Must not throw; phase_t must be in [0, 1]
    const out = deriveTimeOfDayOutput(cfg, 10, 0);
    expect(out.phase_t).toBeGreaterThanOrEqual(0);
    expect(out.phase_t).toBeLessThanOrEqual(1);
  });
});

// =============================================================================
// Lifecycle — attach
// =============================================================================

describe('TraitTimeOfDay — handler lifecycle: attach', () => {
  it('emits time_of_day_attached on attach', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, {}, ctx);
    const evt = getLastEvent(ctx, 'time_of_day_attached');
    expect(evt).toBeDefined();
  });

  it('attached event contains current_phase and phase_t', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, { start_phase: 'dawn' }, ctx);
    const evt = getLastEvent(ctx, 'time_of_day_attached') as TimeOfDayOutput & { node: unknown };
    expect(evt).toBeDefined();
    expect(evt.current_phase).toBe('dawn');
    expect(typeof evt.phase_t).toBe('number');
  });
});

// =============================================================================
// Lifecycle — update / tick
// =============================================================================

describe('TraitTimeOfDay — handler lifecycle: update / tick', () => {
  it('emits time_of_day_tick on each update when emit_tick=true', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, { emit_tick: true }, ctx);
    ctx.clearEvents();

    updateTrait(timeOfDayHandler, node, { emit_tick: true }, ctx, 1.0);
    expect(getEventCount(ctx, 'time_of_day_tick')).toBe(1);

    updateTrait(timeOfDayHandler, node, { emit_tick: true }, ctx, 1.0);
    expect(getEventCount(ctx, 'time_of_day_tick')).toBe(2);
  });

  it('does NOT emit time_of_day_tick when emit_tick=false', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, { emit_tick: false }, ctx);
    ctx.clearEvents();

    updateTrait(timeOfDayHandler, node, { emit_tick: false }, ctx, 1.0);
    expect(getEventCount(ctx, 'time_of_day_tick')).toBe(0);
  });

  it('tick event contains sun_intensity, fog_density, phase_t', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, { emit_tick: true }, ctx);
    ctx.clearEvents();

    updateTrait(timeOfDayHandler, node, { emit_tick: true }, ctx, 5.0);
    const tick = getLastEvent(ctx, 'time_of_day_tick') as Partial<TimeOfDayOutput>;
    expect(typeof tick?.sun_intensity).toBe('number');
    expect(typeof tick?.fog_density).toBe('number');
    expect(typeof tick?.phase_t).toBe('number');
    expect(typeof tick?.current_phase).toBe('string');
  });

  it('elapsed time accumulates across multiple updates', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, { emit_tick: true }, ctx);
    ctx.clearEvents();

    updateTrait(timeOfDayHandler, node, { emit_tick: true }, ctx, 10.0);
    const tick1 = getLastEvent(ctx, 'time_of_day_tick') as { elapsedSeconds?: number };
    const t1 = tick1?.elapsedSeconds ?? 0;

    updateTrait(timeOfDayHandler, node, { emit_tick: true }, ctx, 10.0);
    const tick2 = getLastEvent(ctx, 'time_of_day_tick') as { elapsedSeconds?: number };
    const t2 = tick2?.elapsedSeconds ?? 0;

    expect(t2).toBeCloseTo(t1 + 10, 6);
  });
});

// =============================================================================
// Lifecycle — phase_changed event
// =============================================================================

describe('TraitTimeOfDay — phase_changed event', () => {
  it('fires time_of_day_phase_changed when phase boundary is crossed', () => {
    // Minimum cycle guard clamps to 6s total → 1.5s per phase.
    // Use 8s cycle (8/60 min) → 2s per phase; advance 2.1s to cross dawn→golden.
    const cfg: Partial<TimeOfDayConfig> = {
      cycle_duration_minutes: 8 / 60, // 8s total → 2s per phase (above 6s guard)
      emit_tick: true,
      emit_phase_change: true,
      start_phase: 'dawn',
    };

    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, cfg, ctx);
    ctx.clearEvents();

    // Advance by 2.1s — crosses from dawn (0-2s) into golden
    updateTrait(timeOfDayHandler, node, cfg, ctx, 2.1);
    const phaseChange = getLastEvent(ctx, 'time_of_day_phase_changed') as
      | {
          previous_phase?: string;
          current_phase?: string;
        }
      | undefined;

    expect(phaseChange).toBeDefined();
    expect(phaseChange?.previous_phase).toBe('dawn');
    expect(phaseChange?.current_phase).toBe('golden');
  });

  it('does NOT fire phase_changed when emit_phase_change=false', () => {
    const cfg: Partial<TimeOfDayConfig> = {
      cycle_duration_minutes: 8 / 60, // 8s cycle → 2s per phase (above 6s guard)
      emit_tick: false,
      emit_phase_change: false,
      start_phase: 'dawn',
    };

    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, cfg, ctx);
    ctx.clearEvents();

    updateTrait(timeOfDayHandler, node, cfg, ctx, 2.1);
    expect(getEventCount(ctx, 'time_of_day_phase_changed')).toBe(0);
  });
});

// =============================================================================
// Lifecycle — events: query, seek, reset
// =============================================================================

describe('TraitTimeOfDay — event handlers', () => {
  const baseCfg: Partial<TimeOfDayConfig> = {
    cycle_duration_minutes: 24,
    start_phase: 'golden',
    emit_tick: true,
    emit_phase_change: true,
  };

  it('time_of_day_query returns time_of_day_response with current state', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, baseCfg, ctx);
    updateTrait(timeOfDayHandler, node, baseCfg, ctx, 30.0);
    ctx.clearEvents();

    sendEvent(timeOfDayHandler, node, baseCfg, ctx, {
      type: 'time_of_day_query',
      queryId: 'q1',
    });

    const resp = getLastEvent(ctx, 'time_of_day_response') as {
      queryId?: string;
      current_phase?: string;
    };
    expect(resp).toBeDefined();
    expect(resp?.queryId).toBe('q1');
    expect(typeof resp?.current_phase).toBe('string');
  });

  it('time_of_day_seek jumps to the given elapsed time', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, baseCfg, ctx);
    ctx.clearEvents();

    sendEvent(timeOfDayHandler, node, baseCfg, ctx, {
      type: 'time_of_day_seek',
      elapsedSeconds: 500,
    });

    const sought = getLastEvent(ctx, 'time_of_day_sought') as { elapsedSeconds?: number };
    expect(sought).toBeDefined();
    expect(sought?.elapsedSeconds).toBeCloseTo(500, 6);
  });

  it('time_of_day_seek ignores non-finite values', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, baseCfg, ctx);
    ctx.clearEvents();

    sendEvent(timeOfDayHandler, node, baseCfg, ctx, {
      type: 'time_of_day_seek',
      elapsedSeconds: Infinity,
    });

    // Must not emit time_of_day_sought for a non-finite value
    expect(getEventCount(ctx, 'time_of_day_sought')).toBe(0);
  });

  it('time_of_day_reset restores elapsed to 0 and emits reset_done', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, baseCfg, ctx);
    updateTrait(timeOfDayHandler, node, baseCfg, ctx, 300.0);
    ctx.clearEvents();

    sendEvent(timeOfDayHandler, node, baseCfg, ctx, { type: 'time_of_day_reset' });

    const resetDone = getLastEvent(ctx, 'time_of_day_reset_done') as {
      start_phase?: string;
    };
    expect(resetDone).toBeDefined();
    expect(resetDone?.start_phase).toBe('golden');

    // After reset, next tick should start from t≈0
    ctx.clearEvents();
    updateTrait(timeOfDayHandler, node, baseCfg, ctx, 0.1);
    const tick = getLastEvent(ctx, 'time_of_day_tick') as { elapsedSeconds?: number };
    expect(tick?.elapsedSeconds).toBeCloseTo(0.1, 5);
  });
});

// =============================================================================
// Lifecycle — detach
// =============================================================================

describe('TraitTimeOfDay — handler lifecycle: detach', () => {
  it('emits time_of_day_detached on detach', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, {}, ctx);
    ctx.clearEvents();

    timeOfDayHandler.onDetach?.(
      node as never,
      { ...timeOfDayHandler.defaultConfig } as TimeOfDayConfig,
      ctx as never
    );

    expect(getEventCount(ctx, 'time_of_day_detached')).toBe(1);
  });

  it('cleans up state on detach (no lingering __timeOfDayState)', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, {}, ctx);
    expect((node as Record<string, unknown>).__timeOfDayState).toBeDefined();

    timeOfDayHandler.onDetach?.(
      node as never,
      { ...timeOfDayHandler.defaultConfig } as TimeOfDayConfig,
      ctx as never
    );

    expect((node as Record<string, unknown>).__timeOfDayState).toBeUndefined();
  });

  it('does nothing on update after detach (no throw)', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(timeOfDayHandler, node, {}, ctx);
    timeOfDayHandler.onDetach?.(
      node as never,
      { ...timeOfDayHandler.defaultConfig } as TimeOfDayConfig,
      ctx as never
    );
    ctx.clearEvents();

    expect(() => updateTrait(timeOfDayHandler, node, {}, ctx, 1.0)).not.toThrow();

    expect(getEventCount(ctx, 'time_of_day_tick')).toBe(0);
  });
});

// =============================================================================
// DEFAULT_PHASE_CONFIGS values sanity
// =============================================================================

describe('TraitTimeOfDay — DEFAULT_PHASE_CONFIGS sanity', () => {
  for (const phase of TIME_OF_DAY_PHASES) {
    it(`${phase}: all numeric fields are in expected ranges`, () => {
      const cfg = DEFAULT_PHASE_CONFIGS[phase];
      expect(cfg.sun_intensity).toBeGreaterThanOrEqual(0);
      expect(cfg.sun_intensity).toBeLessThanOrEqual(1);
      expect(cfg.ambient_light).toBeGreaterThanOrEqual(0);
      expect(cfg.ambient_light).toBeLessThanOrEqual(1);
      expect(cfg.fog_density).toBeGreaterThan(0);
      expect(cfg.sky_exposure).toBeGreaterThan(0);
    });
  }

  it('dark has lower sun_intensity than golden', () => {
    expect(DEFAULT_PHASE_CONFIGS['dark'].sun_intensity).toBeLessThan(
      DEFAULT_PHASE_CONFIGS['golden'].sun_intensity
    );
  });

  it('dark has lower ambient_light than golden', () => {
    expect(DEFAULT_PHASE_CONFIGS['dark'].ambient_light).toBeLessThan(
      DEFAULT_PHASE_CONFIGS['golden'].ambient_light
    );
  });

  it('dark has higher fog_density than golden', () => {
    expect(DEFAULT_PHASE_CONFIGS['dark'].fog_density).toBeGreaterThan(
      DEFAULT_PHASE_CONFIGS['golden'].fog_density
    );
  });
});
