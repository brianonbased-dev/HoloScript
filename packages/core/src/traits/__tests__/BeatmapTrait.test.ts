/**
 * BeatmapTrait — determinism + correctness tests
 *
 * The trait's load-bearing contract: declarative cue lists fire EXACTLY
 * ONCE per cue per loop iteration, in beat-sorted order, regardless of
 * tick granularity. These tests pin:
 *   - Pure helpers (elapsedToBeat / sortCues / findCuesInInterval)
 *   - Single-tick / multi-tick firing semantics
 *   - Slow-tick coverage (multiple cues fire on one big delta)
 *   - Half-open interval boundary at exact-beat ticks
 *   - Loop wraparound + reset
 *   - External AudioAnalysis sync
 *   - Out-of-order author input is normalised
 *   - Query / detach lifecycle
 */

import { describe, it, expect } from 'vitest';
import {
  beatmapHandler,
  elapsedToBeat,
  sortCues,
  findCuesInInterval,
  type BeatmapCue,
} from '../BeatmapTrait';
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
// Pure helpers
// ---------------------------------------------------------------------------

describe('BeatmapTrait — elapsedToBeat (pure)', () => {
  it('converts elapsed seconds to beats at 120 BPM', () => {
    expect(elapsedToBeat(0, 120)).toBe(0);
    expect(elapsedToBeat(0.5, 120)).toBeCloseTo(1, 12);
    expect(elapsedToBeat(1, 120)).toBeCloseTo(2, 12);
    expect(elapsedToBeat(60, 120)).toBeCloseTo(120, 10);
  });

  it('converts elapsed seconds to beats at 128 BPM', () => {
    // 1 beat at 128 BPM = 60/128 s = 0.46875 s
    expect(elapsedToBeat(0.46875, 128)).toBeCloseTo(1, 12);
    expect(elapsedToBeat(7.5, 128)).toBeCloseTo(16, 12);
    expect(elapsedToBeat(15, 128)).toBeCloseTo(32, 12);
  });

  it('returns 0 when bpm is non-positive', () => {
    expect(elapsedToBeat(10, 0)).toBe(0);
    expect(elapsedToBeat(10, -120)).toBe(0);
  });

  it('is deterministic — same inputs → same output', () => {
    const a = elapsedToBeat(3.14159, 142);
    const b = elapsedToBeat(3.14159, 142);
    expect(a).toBe(b);
  });
});

describe('BeatmapTrait — sortCues (pure)', () => {
  it('sorts cues by beat ascending', () => {
    const input: BeatmapCue[] = [
      { beat: 32, event: 'spot_reveal' },
      { beat: 0, event: 'intro' },
      { beat: 64, event: 'show_start' },
      { beat: 16, event: 'fog_roll' },
    ];
    const sorted = sortCues(input);
    expect(sorted.map((c) => c.event)).toEqual([
      'intro',
      'fog_roll',
      'spot_reveal',
      'show_start',
    ]);
  });

  it('preserves authoring order for equal-beat cues (stable sort)', () => {
    const input: BeatmapCue[] = [
      { beat: 16, event: 'first_at_16' },
      { beat: 16, event: 'second_at_16' },
      { beat: 16, event: 'third_at_16' },
    ];
    const sorted = sortCues(input);
    expect(sorted.map((c) => c.event)).toEqual([
      'first_at_16',
      'second_at_16',
      'third_at_16',
    ]);
  });

  it('handles empty input', () => {
    expect(sortCues([])).toEqual([]);
  });

  it('does not mutate the input array', () => {
    const input: BeatmapCue[] = [
      { beat: 8, event: 'b' },
      { beat: 0, event: 'a' },
    ];
    const snapshot = JSON.stringify(input);
    sortCues(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe('BeatmapTrait — findCuesInInterval (pure)', () => {
  const cues: BeatmapCue[] = [
    { beat: 0, event: 'intro' },
    { beat: 16, event: 'fog' },
    { beat: 32, event: 'spot' },
    { beat: 64, event: 'show' },
  ];

  it('returns cues in the half-open interval (lastBeat, currentBeat]', () => {
    expect(findCuesInInterval(cues, -1, 0)).toEqual([0]); // beat 0 included
    expect(findCuesInInterval(cues, 0, 16)).toEqual([1]); // beat 16 included
    expect(findCuesInInterval(cues, 0, 15.99)).toEqual([]); // not yet at 16
    expect(findCuesInInterval(cues, 16, 32)).toEqual([2]);
  });

  it('catches multiple cues on a slow tick', () => {
    // Tick from beat 0 → beat 64: should fire fog(16), spot(32), show(64)
    expect(findCuesInInterval(cues, 0, 64)).toEqual([1, 2, 3]);
  });

  it('returns empty when current < last (rewind not allowed by interval)', () => {
    expect(findCuesInInterval(cues, 32, 16)).toEqual([]);
  });

  it('handles cue exactly on last boundary (excluded by half-open)', () => {
    // beat 16 is the last boundary → excluded
    expect(findCuesInInterval(cues, 16, 16)).toEqual([]);
  });

  it('handles -Infinity lastBeat for fresh attach', () => {
    expect(findCuesInInterval(cues, Number.NEGATIVE_INFINITY, 0)).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// Handler — attach / detach
// ---------------------------------------------------------------------------

describe('BeatmapTrait — attach lifecycle', () => {
  it('emits beatmap_attached with cue count and max beat', () => {
    const ctx = createMockContext();
    const node = createMockNode('concert-controller');
    const cues: BeatmapCue[] = [
      { beat: 0, event: 'intro' },
      { beat: 64, event: 'show_start' },
    ];

    attachTrait(beatmapHandler, node, { bpm: 128, cues }, ctx);

    expect(getEventCount(ctx, 'beatmap_attached')).toBe(1);
    const evt = getLastEvent(ctx, 'beatmap_attached') as Record<string, unknown>;
    expect(evt.bpm).toBe(128);
    expect(evt.cueCount).toBe(2);
    expect(evt.maxCueBeat).toBe(64);
  });

  it('respects emit_attach_event=false', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { emit_attach_event: false, cues: [] }, ctx);
    expect(getEventCount(ctx, 'beatmap_attached')).toBe(0);
  });

  it('emits beatmap_detached on detach and clears node state', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { cues: [] }, ctx);
    beatmapHandler.onDetach?.(
      node as never,
      { ...beatmapHandler.defaultConfig, cues: [] },
      ctx as never
    );
    expect(getEventCount(ctx, 'beatmap_detached')).toBe(1);
    expect((node as Record<string, unknown>).__beatmapState).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Handler — internal-clock firing
// ---------------------------------------------------------------------------

describe('BeatmapTrait — internal clock firing', () => {
  const concertCues: BeatmapCue[] = [
    { beat: 0, event: 'intro' },
    { beat: 16, event: 'fog_roll' },
    { beat: 32, event: 'spot_reveal' },
    { beat: 64, event: 'show_start' },
  ];

  it('fires beat-0 cue on first tick when fire_initial_cues=true', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(
      beatmapHandler,
      node,
      { bpm: 128, cues: concertCues, fire_initial_cues: true },
      ctx
    );
    ctx.clearEvents();

    // Smallest possible delta to confirm beat-0 still fires
    updateTrait(beatmapHandler, node, { bpm: 128, cues: concertCues }, ctx, 0.001);

    expect(getEventCount(ctx, 'intro')).toBe(1);
    expect(getEventCount(ctx, 'fog_roll')).toBe(0);
  });

  it('skips beat-0 cue when fire_initial_cues=false', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(
      beatmapHandler,
      node,
      { bpm: 128, cues: concertCues, fire_initial_cues: false },
      ctx
    );
    ctx.clearEvents();

    updateTrait(
      beatmapHandler,
      node,
      { bpm: 128, cues: concertCues, fire_initial_cues: false },
      ctx,
      0.5
    );

    expect(getEventCount(ctx, 'intro')).toBe(0);
  });

  it('fires each cue exactly once across many small ticks at 128 BPM', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { bpm: 128, cues: concertCues }, ctx);
    ctx.clearEvents();

    // Tick 0.1s × 320 = 32 s → covers beats [0, 68.27]
    for (let i = 0; i < 320; i++) {
      updateTrait(beatmapHandler, node, { bpm: 128, cues: concertCues }, ctx, 0.1);
    }

    expect(getEventCount(ctx, 'intro')).toBe(1);
    expect(getEventCount(ctx, 'fog_roll')).toBe(1);
    expect(getEventCount(ctx, 'spot_reveal')).toBe(1);
    expect(getEventCount(ctx, 'show_start')).toBe(1);
  });

  it('fires multiple cues on a single slow tick (slow-tick coverage)', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { bpm: 128, cues: concertCues }, ctx);
    ctx.clearEvents();

    // One huge tick: 35 s @ 128 BPM = ~74.67 beats → fires ALL 4 cues
    updateTrait(beatmapHandler, node, { bpm: 128, cues: concertCues }, ctx, 35);

    expect(getEventCount(ctx, 'intro')).toBe(1);
    expect(getEventCount(ctx, 'fog_roll')).toBe(1);
    expect(getEventCount(ctx, 'spot_reveal')).toBe(1);
    expect(getEventCount(ctx, 'show_start')).toBe(1);
  });

  it('emits cue payload merged into event data', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cuesWithPayload: BeatmapCue[] = [
      { beat: 0, event: 'spawn', payload: { actor: 'singer', position: [0, 1, 0] } },
    ];
    attachTrait(beatmapHandler, node, { bpm: 120, cues: cuesWithPayload }, ctx);
    ctx.clearEvents();
    updateTrait(beatmapHandler, node, { bpm: 120, cues: cuesWithPayload }, ctx, 0.01);

    const evt = getLastEvent(ctx, 'spawn') as Record<string, unknown>;
    expect(evt.beat).toBe(0);
    expect(evt.cueIndex).toBe(0);
    expect(evt.actor).toBe('singer');
    expect(evt.position).toEqual([0, 1, 0]);
  });

  it('normalises out-of-order author input', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const unsorted: BeatmapCue[] = [
      { beat: 32, event: 'late' },
      { beat: 0, event: 'early' },
      { beat: 16, event: 'middle' },
    ];
    attachTrait(beatmapHandler, node, { bpm: 120, cues: unsorted }, ctx);
    ctx.clearEvents();

    // Slow tick covers [0, 64]
    updateTrait(beatmapHandler, node, { bpm: 120, cues: unsorted }, ctx, 32);

    // Verify all three fired, in beat order
    const fired = ctx.emittedEvents.filter((e) =>
      ['early', 'middle', 'late'].includes(e.event)
    );
    expect(fired.map((e) => e.event)).toEqual(['early', 'middle', 'late']);
  });

  it('half-open interval — cue at exact tick beat fires once', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [{ beat: 4, event: 'four' }];
    // 4 beats @ 120 BPM = exactly 2.0 seconds
    attachTrait(beatmapHandler, node, { bpm: 120, cues }, ctx);
    ctx.clearEvents();

    updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 2.0);
    expect(getEventCount(ctx, 'four')).toBe(1);

    // Next tick should NOT re-fire
    updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 0.5);
    expect(getEventCount(ctx, 'four')).toBe(1);
  });

  it('does not fire cue twice on consecutive ticks (monotonic)', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [{ beat: 8, event: 'pulse' }];
    attachTrait(beatmapHandler, node, { bpm: 120, cues }, ctx);
    ctx.clearEvents();

    for (let i = 0; i < 100; i++) {
      updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 0.1);
    }
    expect(getEventCount(ctx, 'pulse')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Handler — loop semantics
// ---------------------------------------------------------------------------

describe('BeatmapTrait — loop wraparound', () => {
  const cues: BeatmapCue[] = [
    { beat: 0, event: 'kick' },
    { beat: 4, event: 'snare' },
  ];

  it('replays cues when loop=true and timeline passes maxCueBeat', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { bpm: 120, cues, loop: true }, ctx);
    ctx.clearEvents();

    // 3 seconds @ 120 BPM = 6 beats — passes max=4, triggers loop
    updateTrait(beatmapHandler, node, { bpm: 120, cues, loop: true }, ctx, 3);
    expect(getEventCount(ctx, 'beatmap_looped')).toBe(1);

    // After loop, both cues should fire again on the next sweep
    updateTrait(beatmapHandler, node, { bpm: 120, cues, loop: true }, ctx, 3);
    expect(getEventCount(ctx, 'kick')).toBe(2);
    expect(getEventCount(ctx, 'snare')).toBe(2);
  });

  it('does NOT loop when loop=false', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { bpm: 120, cues, loop: false }, ctx);
    ctx.clearEvents();

    updateTrait(beatmapHandler, node, { bpm: 120, cues, loop: false }, ctx, 3);
    updateTrait(beatmapHandler, node, { bpm: 120, cues, loop: false }, ctx, 3);

    expect(getEventCount(ctx, 'beatmap_looped')).toBe(0);
    expect(getEventCount(ctx, 'kick')).toBe(1);
    expect(getEventCount(ctx, 'snare')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Handler — reset event
// ---------------------------------------------------------------------------

describe('BeatmapTrait — beatmap_reset event', () => {
  it('clears fired cues + rewinds elapsed', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [
      { beat: 0, event: 'a' },
      { beat: 4, event: 'b' },
    ];
    attachTrait(beatmapHandler, node, { bpm: 120, cues }, ctx);
    updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 3);
    expect(getEventCount(ctx, 'a')).toBe(1);
    expect(getEventCount(ctx, 'b')).toBe(1);

    sendEvent(beatmapHandler, node, { bpm: 120, cues }, ctx, { type: 'beatmap_reset' });
    expect(getEventCount(ctx, 'beatmap_reset_done')).toBe(1);

    updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 3);
    expect(getEventCount(ctx, 'a')).toBe(2);
    expect(getEventCount(ctx, 'b')).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Handler — query event
// ---------------------------------------------------------------------------

describe('BeatmapTrait — beatmap_query event', () => {
  it('responds with current state', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [
      { beat: 0, event: 'a' },
      { beat: 8, event: 'b' },
    ];
    attachTrait(beatmapHandler, node, { bpm: 120, cues }, ctx);
    updateTrait(beatmapHandler, node, { bpm: 120, cues }, ctx, 1.0);

    sendEvent(beatmapHandler, node, { bpm: 120, cues }, ctx, {
      type: 'beatmap_query',
      queryId: 'q1',
    });

    const resp = getLastEvent(ctx, 'beatmap_response') as Record<string, unknown>;
    expect(resp.queryId).toBe('q1');
    expect(resp.cueCount).toBe(2);
    expect(resp.maxCueBeat).toBe(8);
    // After 1s @ 120 BPM = 2 beats; fired cue at beat 0 → 1 fired
    expect(resp.firedCueCount).toBe(1);
    expect(resp.currentBeat).toBeCloseTo(2, 10);
  });
});

// ---------------------------------------------------------------------------
// Handler — external AudioAnalysis sync
// ---------------------------------------------------------------------------

describe('BeatmapTrait — AudioAnalysis sync', () => {
  it('does not advance internal clock when sync_to=AudioAnalysis', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [{ beat: 4, event: 'snare' }];
    attachTrait(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx
    );
    ctx.clearEvents();

    // Internal updateTrait should NOT fire anything
    updateTrait(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx,
      10
    );
    expect(getEventCount(ctx, 'snare')).toBe(0);
  });

  it('fires cues on audio_beat_tick events', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [
      { beat: 0, event: 'intro' },
      { beat: 4, event: 'snare' },
      { beat: 8, event: 'kick' },
    ];
    attachTrait(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx
    );
    ctx.clearEvents();

    sendEvent(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx,
      { type: 'audio_beat_tick', beat: 0 }
    );
    expect(getEventCount(ctx, 'intro')).toBe(1);

    sendEvent(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx,
      { type: 'audio_beat_tick', beat: 4 }
    );
    expect(getEventCount(ctx, 'snare')).toBe(1);

    sendEvent(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx,
      { type: 'audio_beat_tick', beat: 8 }
    );
    expect(getEventCount(ctx, 'kick')).toBe(1);
  });

  it('catches skipped cues on a sparse audio tick stream', () => {
    const ctx = createMockContext();
    const node = createMockNode();
    const cues: BeatmapCue[] = [
      { beat: 0, event: 'a' },
      { beat: 1, event: 'b' },
      { beat: 2, event: 'c' },
      { beat: 3, event: 'd' },
    ];
    attachTrait(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx
    );
    ctx.clearEvents();

    // External analyser jumps straight from beat 0 to beat 3 (e.g. dropped frames)
    sendEvent(
      beatmapHandler,
      node,
      { bpm: 120, sync_to: 'AudioAnalysis', cues },
      ctx,
      { type: 'audio_beat_tick', beat: 3 }
    );

    expect(getEventCount(ctx, 'a')).toBe(1);
    expect(getEventCount(ctx, 'b')).toBe(1);
    expect(getEventCount(ctx, 'c')).toBe(1);
    expect(getEventCount(ctx, 'd')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Determinism — same inputs always produce same fire sequence
// ---------------------------------------------------------------------------

describe('BeatmapTrait — determinism', () => {
  const cues: BeatmapCue[] = [
    { beat: 0, event: 'a' },
    { beat: 7, event: 'b' },
    { beat: 13, event: 'c' },
    { beat: 19, event: 'd' },
  ];

  function runSession(): string[] {
    const ctx = createMockContext();
    const node = createMockNode();
    attachTrait(beatmapHandler, node, { bpm: 137, cues }, ctx);
    ctx.clearEvents();
    // 100 ticks of 0.1s
    for (let i = 0; i < 100; i++) {
      updateTrait(beatmapHandler, node, { bpm: 137, cues }, ctx, 0.1);
    }
    return ctx.emittedEvents.map((e) => e.event);
  }

  it('produces byte-for-byte identical event sequences across runs', () => {
    expect(runSession()).toEqual(runSession());
  });
});
