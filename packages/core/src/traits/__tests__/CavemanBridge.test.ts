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
    const hint = getClipWiringHint(['Idle', 'Eating', 'Run', 'Sit', 'Inspect', 'Gesture', 'Wave', 'Attack', 'Drinking']);
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
    // Only triggers at high drives or after 20 ticks
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
});
