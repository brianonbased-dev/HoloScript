/**
 * BloomReactiveTrait — determinism + correctness tests
 *
 * The trait's load-bearing contract: bloom-stage outputs are pure
 * functions of (state, stageConfig, time). Pulse modulation rebases
 * to stage-entry on transitions so stage swaps emit the new stage's
 * BASE emissive (no mid-pulse phase carryover). These tests pin:
 *   - Pure helpers (resolveBloomStage / resolvePulseHz / emissiveAt /
 *     deriveBloomReactiveOutput)
 *   - Initial-state attach behaviour
 *   - Per-stage emissive + scale on update
 *   - Pulse modulation at slow + fast frequencies
 *   - pulse_fast wins over pulse when both are set
 *   - Stage transitions via lotus_bloom_state_changed event
 *   - Pulse-phase rebase on transition (t=0 at stage entry)
 *   - Unknown bloom_state values fall back to 'sealed'
 *   - Query / reset / detach lifecycle
 */

import { describe, it, expect } from 'vitest';
import {
  bloomReactiveHandler,
  resolveBloomStage,
  resolvePulseHz,
  emissiveAt,
  deriveBloomReactiveOutput,
  type BloomStageConfig,
  type BloomReactiveOutput,
} from '../BloomReactiveTrait';
import type { LotusAggregateBloomState } from '../LotusRootTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Pure helpers — resolveBloomStage
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — resolveBloomStage (pure)', () => {
  it('passes through canonical bloom stages', () => {
    expect(resolveBloomStage('sealed')).toBe('sealed');
    expect(resolveBloomStage('budding')).toBe('budding');
    expect(resolveBloomStage('blooming')).toBe('blooming');
    expect(resolveBloomStage('full')).toBe('full');
    expect(resolveBloomStage('wilted')).toBe('wilted');
  });

  it('falls back to sealed for unknown enum values', () => {
    expect(resolveBloomStage('unknown_future_state')).toBe('sealed');
    expect(resolveBloomStage('')).toBe('sealed');
    expect(resolveBloomStage('FULL')).toBe('sealed');
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — resolvePulseHz
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — resolvePulseHz (pure)', () => {
  it('returns 0 when neither pulse flag is set', () => {
    const stage: BloomStageConfig = { emissive: 1, scale: 1 };
    expect(resolvePulseHz(stage, 0.5, 2.0)).toBe(0);
  });

  it('returns slow Hz when pulse: true', () => {
    const stage: BloomStageConfig = { emissive: 1, scale: 1, pulse: true };
    expect(resolvePulseHz(stage, 0.5, 2.0)).toBe(0.5);
  });

  it('returns fast Hz when pulse_fast: true', () => {
    const stage: BloomStageConfig = { emissive: 1, scale: 1, pulse_fast: true };
    expect(resolvePulseHz(stage, 0.5, 2.0)).toBe(2.0);
  });

  it('pulse_fast wins over pulse when both are set', () => {
    const stage: BloomStageConfig = {
      emissive: 1,
      scale: 1,
      pulse: true,
      pulse_fast: true,
    };
    expect(resolvePulseHz(stage, 0.5, 2.0)).toBe(2.0);
  });

  it('honours custom slow/fast frequencies', () => {
    const slow: BloomStageConfig = { emissive: 1, scale: 1, pulse: true };
    const fast: BloomStageConfig = { emissive: 1, scale: 1, pulse_fast: true };
    expect(resolvePulseHz(slow, 1.5, 7.0)).toBe(1.5);
    expect(resolvePulseHz(fast, 1.5, 7.0)).toBe(7.0);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — emissiveAt
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — emissiveAt (pure)', () => {
  it('returns base when freq is 0 (no pulse)', () => {
    expect(emissiveAt(2.5, 0.25, 0, 1.0)).toBe(2.5);
    expect(emissiveAt(2.5, 0.25, 0, 100)).toBe(2.5);
    expect(emissiveAt(0.1, 0.25, 0, 0)).toBe(0.1);
  });

  it('returns base when amplitude is 0', () => {
    expect(emissiveAt(2.5, 0, 2.0, 0.25)).toBe(2.5);
    expect(emissiveAt(2.5, 0, 2.0, 1.0)).toBe(2.5);
  });

  it('returns exactly base at t=0 (sin(0) = 0)', () => {
    expect(emissiveAt(1.2, 0.25, 0.5, 0)).toBe(1.2);
    expect(emissiveAt(2.5, 0.5, 2.0, 0)).toBe(2.5);
  });

  it('reaches base * (1 + amp) at quarter-period (sin(π/2) = 1)', () => {
    // freq = 1 Hz, period = 1s, quarter = 0.25s
    expect(emissiveAt(1.0, 0.25, 1.0, 0.25)).toBeCloseTo(1.25, 12);
    // freq = 2 Hz, period = 0.5s, quarter = 0.125s
    expect(emissiveAt(2.0, 0.5, 2.0, 0.125)).toBeCloseTo(3.0, 12);
  });

  it('returns base at half-period (sin(π) = 0)', () => {
    expect(emissiveAt(1.0, 0.25, 1.0, 0.5)).toBeCloseTo(1.0, 12);
    expect(emissiveAt(2.0, 0.5, 2.0, 0.25)).toBeCloseTo(2.0, 12);
  });

  it('reaches base * (1 - amp) at three-quarter-period (sin(3π/2) = -1)', () => {
    expect(emissiveAt(1.0, 0.25, 1.0, 0.75)).toBeCloseTo(0.75, 12);
  });

  it('is deterministic — same inputs → same output', () => {
    const a = emissiveAt(1.7, 0.3, 0.5, 0.42);
    const b = emissiveAt(1.7, 0.3, 0.5, 0.42);
    expect(a).toBe(b);
  });
});

// ---------------------------------------------------------------------------
// Pure helpers — deriveBloomReactiveOutput
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — deriveBloomReactiveOutput (pure)', () => {
  it('emits base emissive + scale for a non-pulsing stage', () => {
    const stage: BloomStageConfig = { emissive: 0.4, scale: 0.95 };
    const out = deriveBloomReactiveOutput('budding', stage, 1.0, 0.5, 2.0);
    expect(out.state).toBe('budding');
    expect(out.emissive).toBe(0.4);
    expect(out.scale).toBe(0.95);
    expect(out.pulseHz).toBe(0);
    expect(out.stageElapsedSeconds).toBe(1.0);
  });

  it('modulates emissive at slow Hz when pulse: true', () => {
    const stage: BloomStageConfig = {
      emissive: 1.2,
      scale: 1.0,
      pulse: true,
    };
    // At 0.5 Hz, period = 2s, quarter-period = 0.5s → sin(π/2) = 1
    // Default amplitude = 0.25 → emissive = 1.2 * 1.25 = 1.5
    const out = deriveBloomReactiveOutput('blooming', stage, 0.5, 0.5, 2.0);
    expect(out.pulseHz).toBe(0.5);
    expect(out.emissive).toBeCloseTo(1.5, 12);
    expect(out.scale).toBe(1.0); // scale never modulates
  });

  it('modulates emissive at fast Hz when pulse_fast: true', () => {
    const stage: BloomStageConfig = {
      emissive: 2.5,
      scale: 1.05,
      pulse_fast: true,
    };
    // At 2 Hz, period = 0.5s, quarter-period = 0.125s → sin(π/2) = 1
    // Default amplitude = 0.25 → emissive = 2.5 * 1.25 = 3.125
    const out = deriveBloomReactiveOutput('full', stage, 0.125, 0.5, 2.0);
    expect(out.pulseHz).toBe(2.0);
    expect(out.emissive).toBeCloseTo(3.125, 12);
  });

  it('honours per-stage pulse_amplitude override', () => {
    const stage: BloomStageConfig = {
      emissive: 1.0,
      scale: 1.0,
      pulse: true,
      pulse_amplitude: 0.5,
    };
    // amp = 0.5, freq = 0.5 Hz, t = 0.5 (quarter-period)
    // emissive = 1.0 * (1 + 0.5 * 1) = 1.5
    const out = deriveBloomReactiveOutput('blooming', stage, 0.5, 0.5, 2.0);
    expect(out.emissive).toBeCloseTo(1.5, 12);
  });

  it('emits base exactly at t=0 even when pulsing', () => {
    const stage: BloomStageConfig = {
      emissive: 1.2,
      scale: 1.0,
      pulse: true,
    };
    const out = deriveBloomReactiveOutput('blooming', stage, 0, 0.5, 2.0);
    expect(out.emissive).toBe(1.2);
  });

  it('is deterministic — same inputs → byte-identical output', () => {
    const stage: BloomStageConfig = {
      emissive: 1.7,
      scale: 1.0,
      pulse: true,
    };
    const a = deriveBloomReactiveOutput('blooming', stage, 0.7, 0.5, 2.0);
    const b = deriveBloomReactiveOutput('blooming', stage, 0.7, 0.5, 2.0);
    expect(a.emissive).toBe(b.emissive);
    expect(a.scale).toBe(b.scale);
    expect(a.pulseHz).toBe(b.pulseHz);
  });
});

// ---------------------------------------------------------------------------
// Handler — attach
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — onAttach', () => {
  it('emits bloom_reactive_attached with initial state', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    expect(getEventCount(ctx, 'bloom_reactive_attached')).toBe(1);
    const evt = getLastEvent(ctx, 'bloom_reactive_attached') as {
      initialState: string;
      stateSource: string;
    };
    expect(evt.initialState).toBe('sealed');
    expect(evt.stateSource).toBe('lotus.api.bloom_state');
  });

  it('falls back to sealed when initial_state is unknown', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(
      bloomReactiveHandler,
      node,
      { initial_state: 'phantom' as LotusAggregateBloomState },
      ctx
    );
    const evt = getLastEvent(ctx, 'bloom_reactive_attached') as {
      initialState: string;
    };
    expect(evt.initialState).toBe('sealed');
  });

  it('honours emit_attach_event: false', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(
      bloomReactiveHandler,
      node,
      { initial_state: 'budding', emit_attach_event: false },
      ctx
    );
    expect(getEventCount(ctx, 'bloom_reactive_attached')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Handler — onUpdate (sample emission)
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — onUpdate sample emission', () => {
  it('emits bloom_reactive_sample on every tick with current stage values', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    ctx.clearEvents();

    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.1);
    expect(getEventCount(ctx, 'bloom_reactive_sample')).toBe(1);
    const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
    expect(sample.state).toBe('sealed');
    expect(sample.emissive).toBe(0.1); // default sealed emissive, no pulse
    expect(sample.scale).toBe(0.9);
    expect(sample.pulseHz).toBe(0);
  });

  it('accumulates elapsedSeconds across ticks', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    ctx.clearEvents();

    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.5);
    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.5);
    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.25);
    const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
    // Sealed has no pulse → stageElapsed accumulates linearly
    expect(sample.stageElapsedSeconds).toBeCloseTo(1.25, 12);
  });
});

// ---------------------------------------------------------------------------
// Handler — stage transitions via event
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — stage transitions', () => {
  it('updates observedState on lotus_bloom_state_changed', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    ctx.clearEvents();

    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'blooming',
    });

    expect(getEventCount(ctx, 'bloom_reactive_stage_changed')).toBe(1);
    const evt = getLastEvent(ctx, 'bloom_reactive_stage_changed') as {
      previousStage: string;
      newStage: string;
    };
    expect(evt.previousStage).toBe('sealed');
    expect(evt.newStage).toBe('blooming');
  });

  it('does not emit stage_changed when bloomState is unchanged', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'budding' }, ctx);
    ctx.clearEvents();

    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'budding',
    });

    expect(getEventCount(ctx, 'bloom_reactive_stage_changed')).toBe(0);
  });

  it('falls back to sealed when bloomState is an unknown enum', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'budding' }, ctx);
    ctx.clearEvents();

    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'phantom_future_stage',
    });

    const evt = getLastEvent(ctx, 'bloom_reactive_stage_changed') as {
      newStage: string;
    };
    expect(evt.newStage).toBe('sealed');
  });

  it('rebases pulse phase to stage-entry on transition', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    ctx.clearEvents();

    // Run sealed for 3 seconds (no pulse, just accumulating elapsed).
    updateTrait(bloomReactiveHandler, node, {}, ctx, 3.0);

    // Transition to 'blooming' (pulse at 0.5 Hz default).
    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'blooming',
    });
    ctx.clearEvents();

    // Tick 0: a zero-delta sample would emit base emissive. But to actually
    // sample, we need a tick > 0. Use tiny delta and check stageElapsedSeconds
    // is small (i.e. did NOT carry over the 3s from the prior stage).
    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.0);
    const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
    expect(sample.state).toBe('blooming');
    expect(sample.stageElapsedSeconds).toBe(0);
    // At t=0 in the new stage, emissive is exactly base (sin(0)=0):
    expect(sample.emissive).toBe(1.2);
  });

  it('emits new-stage base emissive on first sample after transition', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);

    // Drift the clock so it's NOT a multiple of any pulse period.
    updateTrait(bloomReactiveHandler, node, {}, ctx, 1.337);

    // Transition to 'full' (fast pulse). Without rebase, the next sample
    // would inherit a phase computed from total elapsed (1.337s × 2π × 2 Hz
    // = arbitrary phase). With rebase, it's 0 → base exactly.
    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });
    ctx.clearEvents();

    updateTrait(bloomReactiveHandler, node, {}, ctx, 0);
    const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
    expect(sample.emissive).toBe(2.5); // exact base, not modulated
    expect(sample.scale).toBe(1.05);
  });
});

// ---------------------------------------------------------------------------
// Handler — full lifecycle integration
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — full lifecycle', () => {
  it('walks through sealed → budding → blooming → full → wilted', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);

    const observedStages: string[] = [];

    const stages: LotusAggregateBloomState[] = [
      'budding',
      'blooming',
      'full',
      'wilted',
    ];
    for (const next of stages) {
      sendEvent(bloomReactiveHandler, node, {}, ctx, {
        type: 'lotus_bloom_state_changed',
        bloomState: next,
      });
      updateTrait(bloomReactiveHandler, node, {}, ctx, 0);
      const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
      observedStages.push(sample.state);
    }

    expect(observedStages).toEqual(['budding', 'blooming', 'full', 'wilted']);
    expect(getEventCount(ctx, 'bloom_reactive_stage_changed')).toBe(4);
  });

  it('produces correct scale per stage with default config', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);

    const expected: Array<[LotusAggregateBloomState, number]> = [
      ['sealed', 0.9],
      ['budding', 0.95],
      ['blooming', 1.0],
      ['full', 1.05],
      ['wilted', 0.85],
    ];

    for (const [stage, expectedScale] of expected) {
      sendEvent(bloomReactiveHandler, node, {}, ctx, {
        type: 'lotus_bloom_state_changed',
        bloomState: stage,
      });
      ctx.clearEvents();
      updateTrait(bloomReactiveHandler, node, {}, ctx, 0);
      const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
      expect(sample.scale).toBe(expectedScale);
    }
  });
});

// ---------------------------------------------------------------------------
// Handler — query + reset + detach
// ---------------------------------------------------------------------------

describe('BloomReactiveTrait — query + reset + detach', () => {
  it('responds to bloom_reactive_query with current sample', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'budding' }, ctx);
    updateTrait(bloomReactiveHandler, node, {}, ctx, 0.5);
    ctx.clearEvents();

    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'bloom_reactive_query',
      queryId: 'q1',
    });

    expect(getEventCount(ctx, 'bloom_reactive_response')).toBe(1);
    const evt = getLastEvent(ctx, 'bloom_reactive_response') as BloomReactiveOutput & {
      queryId: string;
    };
    expect(evt.queryId).toBe('q1');
    expect(evt.state).toBe('budding');
    expect(evt.emissive).toBe(0.4); // budding default, no pulse
    expect(evt.scale).toBe(0.95);
  });

  it('rewinds elapsed + state on bloom_reactive_reset', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, { initial_state: 'sealed' }, ctx);
    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'blooming',
    });
    updateTrait(bloomReactiveHandler, node, {}, ctx, 5.0);
    ctx.clearEvents();

    sendEvent(bloomReactiveHandler, node, {}, ctx, { type: 'bloom_reactive_reset' });
    expect(getEventCount(ctx, 'bloom_reactive_reset_done')).toBe(1);

    updateTrait(bloomReactiveHandler, node, {}, ctx, 0);
    const sample = getLastEvent(ctx, 'bloom_reactive_sample') as BloomReactiveOutput;
    expect(sample.state).toBe('sealed');
    expect(sample.stageElapsedSeconds).toBe(0);
    expect(sample.emissive).toBe(0.1); // sealed base
  });

  it('emits bloom_reactive_detached and clears node state on detach', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    attachTrait(bloomReactiveHandler, node, {}, ctx);
    expect((node as Record<string, unknown>).__bloomReactiveState).toBeDefined();

    bloomReactiveHandler.onDetach?.(
      node as never,
      bloomReactiveHandler.defaultConfig,
      ctx as never
    );

    expect(getEventCount(ctx, 'bloom_reactive_detached')).toBe(1);
    expect((node as Record<string, unknown>).__bloomReactiveState).toBeUndefined();
  });

  it('is no-op on update + event when not attached (defensive)', () => {
    const node = createMockNode();
    const ctx = createMockContext();
    // Skip attach entirely.
    updateTrait(bloomReactiveHandler, node, {}, ctx, 1.0);
    sendEvent(bloomReactiveHandler, node, {}, ctx, {
      type: 'lotus_bloom_state_changed',
      bloomState: 'full',
    });
    expect(getEventCount(ctx, 'bloom_reactive_sample')).toBe(0);
    expect(getEventCount(ctx, 'bloom_reactive_stage_changed')).toBe(0);
  });
});
