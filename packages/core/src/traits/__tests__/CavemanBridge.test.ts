/**
 * CavemanActionAnimationBridge + CavemanDriveTrait unit tests
 *
 * Covers:
 *  ✓ mapVerbToClip — exact match, fallback, fear qualifier
 *  ✓ dispatchCavemanAction — emits neural_animation_synthesize + caveman_action_dispatched
 *  ✓ getClipWiringHint — generates wiring comment
 *  ✓ CavemanDriveTrait — drive math, LLM gate, onLLMAction dispatch
 */

import { describe, it, expect, vi } from 'vitest';
import {
  mapVerbToClip,
  dispatchCavemanAction,
  getClipWiringHint,
} from '../CavemanActionAnimationBridge';
import { CavemanDriveTrait } from '../CavemanDriveTrait';

// ── mapVerbToClip ─────────────────────────────────────────────────────────────

describe('mapVerbToClip', () => {
  it('maps known verb to canonical clip name', () => {
    expect(mapVerbToClip('eat').clipName).toBe('Eating');
    expect(mapVerbToClip('flee').clipName).toBe('Run');
    expect(mapVerbToClip('idle').clipName).toBe('Idle');
    expect(mapVerbToClip('attack').clipName).toBe('Attack');
  });

  it('falls back to Idle for unknown verb', () => {
    const r = mapVerbToClip('dance');
    expect(r.clipName).toBe('Idle');
  });

  it('respects availableClips — exact match', () => {
    const r = mapVerbToClip('eat', ['Eating', 'Run', 'Idle']);
    expect(r.clipName).toBe('Eating');
    expect(r.fallbackUsed).toBe(false);
  });

  it('respects availableClips — loop variant match', () => {
    const r = mapVerbToClip('eat', ['Eating_loop', 'Run', 'Idle']);
    expect(r.clipName).toBe('Eating_loop');
    expect(r.fallbackUsed).toBe(false);
  });

  it('respects availableClips — Armature| prefix variant', () => {
    const r = mapVerbToClip('eat', ['Armature|Eating', 'Idle']);
    expect(r.clipName).toBe('Armature|Eating');
  });

  it('fallback to Idle when clip missing from availableClips', () => {
    const r = mapVerbToClip('eat', ['Run', 'Idle', 'Wave']);
    expect(r.fallbackUsed).toBe(true);
    expect(r.clipName).toBe('Idle');
    expect(r.reason).toMatch(/fall/i);
  });

  it('high fear forces Run clip on flee verb', () => {
    const r = mapVerbToClip('flee', [], 0.9);
    expect(r.clipName).toBe('Run');
  });

  it('trims and lowercases verb input', () => {
    expect(mapVerbToClip('  EAT  ').clipName).toBe('Eating');
  });
});

// ── dispatchCavemanAction ─────────────────────────────────────────────────────

describe('dispatchCavemanAction', () => {
  function makeEntity() {
    const emitted: { event: string; data: unknown }[] = [];
    const entity = {
      emit: (event: string, data: unknown) => emitted.push({ event, data }),
      emitted,
    };
    return entity;
  }

  it('emits neural_animation_synthesize', () => {
    const e = makeEntity();
    dispatchCavemanAction(e, 'eat');
    const ev = e.emitted.find((x) => x.event === 'neural_animation_synthesize');
    expect(ev).toBeDefined();
  });

  it('neural_animation_synthesize carries correct clipName', () => {
    const e = makeEntity();
    dispatchCavemanAction(e, 'rest');
    const ev = e.emitted.find((x) => x.event === 'neural_animation_synthesize') as any;
    expect(ev?.data?.clipName).toBe('Sit');
    expect(ev?.data?.target_pose?.source).toBe('clip');
  });

  it('emits caveman_action_dispatched', () => {
    const e = makeEntity();
    dispatchCavemanAction(e, 'flee', 'wolf');
    const ev = e.emitted.find((x) => x.event === 'caveman_action_dispatched') as any;
    expect(ev).toBeDefined();
    expect(ev?.data?.verb).toBe('flee');
    expect(ev?.data?.target).toBe('wolf');
  });

  it('passes fear qualifier through dispatch', () => {
    const e = makeEntity();
    dispatchCavemanAction(e, 'flee', undefined, { fear: 0.95 });
    const ev = e.emitted.find((x) => x.event === 'neural_animation_synthesize') as any;
    expect(ev?.data?.clipName).toBe('Run');
  });

  it('returns AnimationDispatchResult', () => {
    const e = makeEntity();
    const r = dispatchCavemanAction(e, 'gesture');
    expect(typeof r.clipName).toBe('string');
    expect(typeof r.fallbackUsed).toBe('boolean');
  });

  it('is safe when entity has no emit (no-op)', () => {
    expect(() => dispatchCavemanAction({}, 'idle')).not.toThrow();
  });
});

// ── getClipWiringHint ─────────────────────────────────────────────────────────

describe('getClipWiringHint', () => {
  it('returns a multi-line string with verb entries', () => {
    const hint = getClipWiringHint(['Eating', 'Run', 'Idle']);
    expect(hint).toMatch(/eat/);
    expect(hint).toMatch(/flee/);
  });

  it('marks clips missing from GLB', () => {
    const hint = getClipWiringHint(['Idle']);
    expect(hint).toMatch(/missing in GLB/);
  });

  it('does not mark Idle as missing when it is present', () => {
    const hint = getClipWiringHint([
      'Idle',
      'Eating',
      'Run',
      'Sit',
      'Inspect',
      'Gesture',
      'Wave',
      'Attack',
      'Drinking',
    ]);
    expect(hint).not.toMatch(/Idle.*missing/);
  });
});

// ── CavemanDriveTrait ─────────────────────────────────────────────────────────

describe('CavemanDriveTrait', () => {
  it('initial drives are in valid range', () => {
    const t = new CavemanDriveTrait();
    const s = t.getState();
    for (const v of Object.values(s)) {
      if (typeof v === 'number') {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('hunger rises over time', () => {
    const t = new CavemanDriveTrait();
    const before = t.getState().hunger;
    t.updateDrives(5, {});
    expect(t.getState().hunger).toBeGreaterThan(before);
  });

  it('hunger resets after eating', () => {
    const t = new CavemanDriveTrait();
    t.updateDrives(100, {}); // drive hunger high
    t.updateDrives(0.01, { ate: true });
    expect(t.getState().hunger).toBeLessThan(0.5);
  });

  it('fear rises on threat context', () => {
    const t = new CavemanDriveTrait();
    const before = t.getState().fear;
    t.updateDrives(0.1, { threat: true });
    expect(t.getState().fear).toBeGreaterThan(before);
  });

  it('shouldCallLLM returns false by default on first tick', () => {
    const t = new CavemanDriveTrait();
    // Only triggers at high drives or after 200 ticks (MMO-budget safety valve)
    // default drives all < 0.8
    expect(t.shouldCallLLM()).toBe(false);
  });

  it('shouldCallLLM returns true when hunger ≥ 0.8', () => {
    const t = new CavemanDriveTrait();
    t.updateDrives(100, {}); // drives hunger to ~1.0
    expect(t.shouldCallLLM()).toBe(true);
  });

  it('getActionVerbBias returns object keyed by verb', () => {
    const t = new CavemanDriveTrait();
    const bias = t.getActionVerbBias();
    expect(bias).toHaveProperty('eat');
    expect(bias).toHaveProperty('flee');
    expect(bias).toHaveProperty('rest');
  });

  it('onLLMAction dispatches without throwing', () => {
    const t = new CavemanDriveTrait();
    expect(() => t.onLLMAction('eat', 'berries', ['Eating', 'Idle'])).not.toThrow();
  });

  it('onLLMAction returns dispatch result', () => {
    const t = new CavemanDriveTrait();
    const r = t.onLLMAction('idle');
    expect(r).toHaveProperty('clipName');
  });

  it('mapVerbToClip static delegate works', () => {
    const r = CavemanDriveTrait.mapVerbToClip('attack');
    expect(r.clipName).toBe('Attack');
  });

  // P0.7 — MMO-scale LLM budget tuning (research/2026-06-15_mmo-next-round-advancement.md §5)

  it('safety valve fires at 200 ticks, not 20', () => {
    const t = new CavemanDriveTrait();
    // Tick 200 times with low drives so no drive-threshold trigger fires.
    // deltaTime small enough that drives don't cross 0.8.
    for (let i = 0; i < 200; i++) {
      t.updateDrives(0.01, {});
    }
    // After 200 ticks with lastLLMCallTick=0, tickCount-lastLLMCallTick = 200 > 200? No — > 200 means 201+.
    // At exactly 200 ticks the condition (200 > 200) is false; at 201 it fires.
    expect(t.shouldCallLLM()).toBe(false); // 200 ticks: NOT yet over the valve

    t.updateDrives(0.01, {}); // tick 201
    expect(t.shouldCallLLM()).toBe(true); // 201 > 200 → safety valve fires
  });

  it('aiLod far always returns false from shouldCallLLM', () => {
    const t = new CavemanDriveTrait();
    t.setAiLod('far');

    // Drive all values to maximum — normally forces a call
    for (let i = 0; i < 500; i++) {
      t.updateDrives(1, { threat: true, novelty: true });
    }
    // Even with maxed drives and 500 elapsed ticks, 'far' tier blocks all LLM calls
    expect(t.shouldCallLLM()).toBe(false);
  });

  it('aiLod near (default) allows LLM calls when drives are high', () => {
    const t = new CavemanDriveTrait();
    // Default is 'near' — high drives should trigger
    t.updateDrives(100, {});
    expect(t.shouldCallLLM()).toBe(true);
  });

  it('setAiLod transitions far→near re-enables LLM calls', () => {
    const t = new CavemanDriveTrait();
    t.setAiLod('far');
    t.updateDrives(100, {}); // drive hunger to ~1.0
    expect(t.shouldCallLLM()).toBe(false); // blocked by far

    t.setAiLod('near');
    expect(t.shouldCallLLM()).toBe(true); // now high drives fire
  });
});
