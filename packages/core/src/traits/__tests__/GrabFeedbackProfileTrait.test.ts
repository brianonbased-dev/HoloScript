import { describe, it, expect, beforeEach } from 'vitest';
import {
  grabFeedbackProfileHandler,
  lerp,
  deriveBloomEmissive,
  type GrabFeedbackProfileConfig,
} from '../GrabFeedbackProfileTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

// ---------------------------------------------------------------------------
// Private-state accessor — typed via unknown, not any
// ---------------------------------------------------------------------------

interface GrabFeedbackProfileState {
  holding: boolean;
  rampElapsedMs: number;
  rampFromEmissive: number;
  rampToEmissive: number;
  currentEmissive: number;
}

function getState(node: Record<string, unknown>): GrabFeedbackProfileState {
  const s = node.__grabFeedbackProfileState;
  if (s === undefined) throw new Error('State not attached');
  return s as unknown as GrabFeedbackProfileState;
}

// ---------------------------------------------------------------------------
// Pure-function determinism tests
// ---------------------------------------------------------------------------

describe('lerp', () => {
  it('clamps t below 0', () => expect(lerp(0, 10, -1)).toBe(0));
  it('clamps t above 1', () => expect(lerp(0, 10, 2)).toBe(10));
  it('midpoint', () => expect(lerp(0, 10, 0.5)).toBe(5));
  it('from==to returns same value', () => expect(lerp(3, 3, 0.7)).toBe(3));
});

describe('deriveBloomEmissive', () => {
  it('returns toEmissive when rampMs=0', () =>
    expect(deriveBloomEmissive(50, 0, 0.5, 2.5)).toBe(2.5));

  it('returns fromEmissive at elapsed=0', () =>
    expect(deriveBloomEmissive(0, 100, 0.8, 2.5)).toBe(0.8));

  it('returns toEmissive at elapsed>=rampMs', () =>
    expect(deriveBloomEmissive(100, 100, 0.8, 2.5)).toBe(2.5));

  it('midpoint', () => expect(deriveBloomEmissive(40, 80, 0.8, 2.5)).toBeCloseTo(1.65, 5));
});

// ---------------------------------------------------------------------------
// Handler lifecycle tests
// ---------------------------------------------------------------------------

const defaultCfg: GrabFeedbackProfileConfig = {
  haptic: {
    grab: 'soft_pulse',
    throw: 'sharp_snap',
    release: 'click',
    intensity: 0.7,
    duration_ms: 100,
  },
  audio: {
    grab: 'audio/pickup.wav',
    release: 'audio/release.wav',
    volume: 0.6,
    spatial: true,
    max_distance: 6,
  },
  bloom: {
    idle_intensity: 0.8,
    held_intensity: 2.5,
    ramp_ms: 80,
  },
};

describe('GrabFeedbackProfileTrait handler', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    node = createMockNode('gfp-test');
    ctx = createMockContext();
    attachTrait(grabFeedbackProfileHandler, node, defaultCfg, ctx);
  });

  // ── Attach ────────────────────────────────────────────────────────────────

  it('attaches and emits attached event', () => {
    expect(getEventCount(ctx, 'grab_feedback_profile_attached')).toBe(1);
    expect(node.__grabFeedbackProfileState).toBeDefined();
  });

  it('initialises state as not holding', () => {
    const state = getState(node);
    expect(state.holding).toBe(false);
    expect(state.currentEmissive).toBe(defaultCfg.bloom.idle_intensity);
  });

  it('preloads both audio assets on attach', () => {
    expect(getEventCount(ctx, 'audio_preload')).toBe(2);
  });

  // ── Grab event ───────────────────────────────────────────────────────────

  it('grab event fires haptic_play with soft_pulse preset', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    const ev = getLastEvent(ctx, 'haptic_play') as Record<string, unknown>;
    expect(ev).toBeDefined();
    expect(ev['pattern']).toBe('soft_pulse');
    expect(ev['intensity']).toBe(0.7);
  });

  it('grab event fires audio_cue_play with grab URL', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    const ev = getLastEvent(ctx, 'audio_cue_play') as Record<string, unknown>;
    expect(ev['url']).toBe('audio/pickup.wav');
    expect(ev['spatial']).toBe(true);
  });

  it('"grabbed" alias triggers same behaviour as "grab"', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grabbed' });
    expect(getEventCount(ctx, 'haptic_play')).toBe(1);
  });

  it('holding flag becomes true after grab', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    const state = getState(node);
    expect(state.holding).toBe(true);
    expect(state.rampToEmissive).toBe(defaultCfg.bloom.held_intensity);
  });

  it('double-grab does not fire haptic twice', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    expect(getEventCount(ctx, 'haptic_play')).toBe(1);
  });

  // ── Throw event ──────────────────────────────────────────────────────────

  it('throw event fires sharp_snap haptic', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    ctx.clearEvents();
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'throw' });
    const ev = getLastEvent(ctx, 'haptic_play') as Record<string, unknown>;
    expect(ev['pattern']).toBe('sharp_snap');
  });

  it('throw event fires audio with release URL', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    ctx.clearEvents();
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'thrown' });
    const ev = getLastEvent(ctx, 'audio_cue_play') as Record<string, unknown>;
    expect(ev['url']).toBe('audio/release.wav');
  });

  it('throw resets holding to false and ramps back to idle', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'throw' });
    const state = getState(node);
    expect(state.holding).toBe(false);
    expect(state.rampToEmissive).toBe(defaultCfg.bloom.idle_intensity);
  });

  // ── Release event ────────────────────────────────────────────────────────

  it('release event fires click haptic', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    ctx.clearEvents();
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'release' });
    const ev = getLastEvent(ctx, 'haptic_play') as Record<string, unknown>;
    expect(ev['pattern']).toBe('click');
  });

  it('"released" alias triggers same behaviour as "release"', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    ctx.clearEvents();
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'released' });
    expect(getEventCount(ctx, 'haptic_play')).toBe(1);
  });

  // ── Bloom ramp via onUpdate ───────────────────────────────────────────────

  it('onUpdate advances bloom ramp and emits bloom sample', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    ctx.clearEvents();
    // Advance 40ms (0.04s delta) — half the 80ms ramp
    updateTrait(grabFeedbackProfileHandler, node, defaultCfg, ctx, 0.04);
    const state = getState(node);
    // At t=40ms of an 80ms ramp from idle(0.8) to held(2.5): lerp midpoint ≈ 1.65
    expect(state.currentEmissive).toBeCloseTo(1.65, 2);
    expect(getEventCount(ctx, 'grab_feedback_profile_bloom')).toBe(1);
    const bloomEv = getLastEvent(ctx, 'grab_feedback_profile_bloom') as Record<string, unknown>;
    expect(bloomEv['holding']).toBe(true);
    expect(bloomEv['emissive']).toBeCloseTo(1.65, 2);
  });

  it('bloom ramp completes at held_intensity after ramp_ms', () => {
    sendEvent(grabFeedbackProfileHandler, node, defaultCfg, ctx, { type: 'grab' });
    // Advance 100ms — beyond the 80ms ramp
    updateTrait(grabFeedbackProfileHandler, node, defaultCfg, ctx, 0.1);
    const state = getState(node);
    expect(state.currentEmissive).toBe(defaultCfg.bloom.held_intensity);
  });

  // ── Detach ────────────────────────────────────────────────────────────────

  it('cleans up state and emits detached on detach', () => {
    grabFeedbackProfileHandler.onDetach?.(
      node as unknown as Parameters<NonNullable<typeof grabFeedbackProfileHandler.onDetach>>[0],
      defaultCfg as unknown as Parameters<
        NonNullable<typeof grabFeedbackProfileHandler.onDetach>
      >[1],
      ctx as unknown as Parameters<NonNullable<typeof grabFeedbackProfileHandler.onDetach>>[2]
    );
    expect(node.__grabFeedbackProfileState).toBeUndefined();
    expect(getEventCount(ctx, 'grab_feedback_profile_detached')).toBe(1);
  });

  // ── haptic preset: 'none' suppresses haptic_play ─────────────────────────

  it("haptic preset 'none' on grab suppresses haptic_play", () => {
    const silentCfg: GrabFeedbackProfileConfig = {
      ...defaultCfg,
      haptic: { ...defaultCfg.haptic, grab: 'none' },
    };
    const n2 = createMockNode('silent');
    const c2 = createMockContext();
    attachTrait(grabFeedbackProfileHandler, n2, silentCfg, c2);
    sendEvent(grabFeedbackProfileHandler, n2, silentCfg, c2, { type: 'grab' });
    expect(getEventCount(c2, 'haptic_play')).toBe(0);
  });

  // ── Empty audio URL suppresses audio_cue_play ─────────────────────────────

  it('empty audio.grab suppresses audio_cue_play on grab', () => {
    const noAudioCfg: GrabFeedbackProfileConfig = {
      ...defaultCfg,
      audio: { ...defaultCfg.audio, grab: '' },
    };
    const n3 = createMockNode('noaudio');
    const c3 = createMockContext();
    attachTrait(grabFeedbackProfileHandler, n3, noAudioCfg, c3);
    sendEvent(grabFeedbackProfileHandler, n3, noAudioCfg, c3, { type: 'grab' });
    expect(getEventCount(c3, 'audio_cue_play')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// VR_TRAITS registry parity smoke-test
// ---------------------------------------------------------------------------

describe('VR_TRAITS parity', () => {
  it('grab_feedback_profile is present in VR_TRAITS', async () => {
    const { VR_TRAITS } = await import('../constants/index');
    expect(VR_TRAITS).toContain('grab_feedback_profile');
  });
});
