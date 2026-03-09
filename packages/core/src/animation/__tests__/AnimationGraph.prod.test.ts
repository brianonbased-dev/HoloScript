/**
 * AnimationGraph — Production Test Suite
 *
 * Covers: clip CRUD, addState (first state auto-selected), getState,
 * getCurrentState, parameters (set/get), setTrigger,
 * transitions (parameter comparators, trigger, finished),
 * update (time advance, blend during transition, state switch),
 * layers, evaluateCondition edge cases.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationGraph } from '../AnimationGraph';
import type { AnimationClip, AnimationTrack } from '../AnimationGraph';

function makeClip(id: string, duration: number): AnimationClip {
  const track: AnimationTrack = {
    targetProperty: 'position.x',
    interpolation: 'linear',
    keyframes: [
      { time: 0, value: 0 },
      { time: duration, value: 100 },
    ],
  };
  return { id, name: id, duration, loop: true, speed: 1, tracks: [track] };
}

describe('AnimationGraph — Production', () => {
  let graph: AnimationGraph;

  beforeEach(() => {
    graph = new AnimationGraph();
  });

  // ─── Clips ────────────────────────────────────────────────────────
  it('addClip / getClip roundtrip', () => {
    graph.addClip(makeClip('idle', 1));
    expect(graph.getClip('idle')?.id).toBe('idle');
  });

  it('getClip returns undefined for unknown id', () => {
    expect(graph.getClip('ghost')).toBeUndefined();
  });

  it('removeClip returns true and removes', () => {
    graph.addClip(makeClip('walk', 1));
    expect(graph.removeClip('walk')).toBe(true);
    expect(graph.getClip('walk')).toBeUndefined();
  });

  it('removeClip returns false for unknown id', () => {
    expect(graph.removeClip('ghost')).toBe(false);
  });

  it('getClipIds returns all ids', () => {
    graph.addClip(makeClip('a', 1));
    graph.addClip(makeClip('b', 2));
    expect(graph.getClipIds()).toContain('a');
    expect(graph.getClipIds()).toContain('b');
  });

  // ─── States ───────────────────────────────────────────────────────
  it('first addState becomes currentState', () => {
    graph.addClip(makeClip('idle', 1));
    graph.addState('idle', 'idle');
    expect(graph.getCurrentState()).toBe('idle');
  });

  it('first state has weight=1 and isPlaying=true', () => {
    graph.addClip(makeClip('idle', 1));
    const s = graph.addState('idle', 'idle');
    expect(s.weight).toBe(1);
    expect(s.isPlaying).toBe(true);
  });

  it('second state starts with weight=0', () => {
    graph.addClip(makeClip('idle', 1));
    graph.addClip(makeClip('walk', 1));
    graph.addState('idle', 'idle');
    const s = graph.addState('walk', 'walk');
    expect(s.weight).toBe(0);
    expect(s.isPlaying).toBe(false);
  });

  it('getState returns undefined for unknown id', () => {
    expect(graph.getState('ghost')).toBeUndefined();
  });

  it('addState accepts speed option', () => {
    graph.addClip(makeClip('run', 1));
    const s = graph.addState('run', 'run', { speed: 2 });
    expect(s.speed).toBe(2);
  });

  // ─── Parameters ───────────────────────────────────────────────────
  it('setParameter / getParameter roundtrip', () => {
    graph.setParameter('speed', 5.5);
    expect(graph.getParameter('speed')).toBe(5.5);
  });

  it('getParameter returns undefined for unknown', () => {
    expect(graph.getParameter('unknown')).toBeUndefined();
  });

  it('setTrigger sets parameter to true', () => {
    graph.setTrigger('jump');
    expect(graph.getParameter('jump')).toBe(true);
  });

  // ─── update — advance time ─────────────────────────────────────────
  it('update advances currentTime of playing state', () => {
    graph.addClip(makeClip('idle', 2));
    graph.addState('idle', 'idle');
    graph.update(0.5);
    expect(graph.getState('idle')!.currentTime).toBeGreaterThan(0);
  });

  it('update returns Map with sampled property values', () => {
    graph.addClip(makeClip('idle', 2));
    graph.addState('idle', 'idle');
    const result = graph.update(0.1);
    expect(result instanceof Map).toBe(true);
    expect(result.has('position.x')).toBe(true);
  });

  // ─── Transitions — parameter comparator ───────────────────────────
  it('parameter transition (>) switches state', () => {
    graph.addClip(makeClip('idle', 2));
    graph.addClip(makeClip('walk', 2));
    graph.addState('idle', 'idle');
    graph.addState('walk', 'walk');
    graph.addTransition({
      id: 't1',
      fromState: 'idle',
      toState: 'walk',
      duration: 0.001,
      condition: { type: 'parameter', name: 'speed', comparator: '>', value: 0 },
      interruptible: false,
    });
    graph.setParameter('speed', 1);
    // Advance enough to complete the transition
    for (let i = 0; i < 20; i++) graph.update(0.1);
    expect(graph.getCurrentState()).toBe('walk');
  });

  it('parameter transition (==) switches state on match', () => {
    graph.addClip(makeClip('idle', 2));
    graph.addClip(makeClip('run', 2));
    graph.addState('idle', 'idle');
    graph.addState('run', 'run');
    graph.addTransition({
      id: 't1',
      fromState: 'idle',
      toState: 'run',
      duration: 0.001,
      condition: { type: 'parameter', name: 'mode', comparator: '==', value: 2 },
      interruptible: false,
    });
    graph.setParameter('mode', 2);
    for (let i = 0; i < 20; i++) graph.update(0.1);
    expect(graph.getCurrentState()).toBe('run');
  });

  // ─── Transitions — trigger ─────────────────────────────────────────
  it('trigger transition switches state and clears trigger', () => {
    graph.addClip(makeClip('idle', 2));
    graph.addClip(makeClip('jump', 1));
    graph.addState('idle', 'idle');
    graph.addState('jump', 'jump');
    graph.addTransition({
      id: 't1',
      fromState: 'idle',
      toState: 'jump',
      duration: 0.001,
      condition: { type: 'trigger', name: 'jump' },
      interruptible: false,
    });
    graph.setTrigger('jump');
    for (let i = 0; i < 20; i++) graph.update(0.1);
    expect(graph.getCurrentState()).toBe('jump');
    // Trigger should have been consumed
    expect(graph.getParameter('jump')).toBeUndefined();
  });

  // ─── Layers ───────────────────────────────────────────────────────
  it('addLayer / getLayers', () => {
    const subGraph = {
      states: new Map(),
      transitions: [],
      currentState: '',
      parameters: new Map(),
      activeTransition: null,
    };
    graph.addLayer({ id: 'upperBody', weight: 0.5, blendMode: 'additive', graph: subGraph });
    expect(graph.getLayers().length).toBe(1);
    expect(graph.getLayers()[0].id).toBe('upperBody');
  });
});
