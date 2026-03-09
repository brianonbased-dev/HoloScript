import { describe, it, expect, beforeEach } from 'vitest';
import { AnimationGraph, type AnimationClip, type AnimationTransition } from '../AnimationGraph';

function clip(id: string, duration = 1, loop = false): AnimationClip {
  return {
    id,
    name: id,
    duration,
    loop,
    speed: 1,
    tracks: [
      {
        targetProperty: 'x',
        keyframes: [
          { time: 0, value: 0 },
          { time: duration, value: 1 },
        ],
        interpolation: 'linear',
      },
    ],
  };
}

describe('AnimationGraph', () => {
  let graph: AnimationGraph;

  beforeEach(() => {
    graph = new AnimationGraph();
    graph.addClip(clip('idle', 1, true));
    graph.addClip(clip('run', 0.8, true));
    graph.addClip(clip('jump', 0.5));
  });

  // ---------------------------------------------------------------------------
  // Clip Management
  // ---------------------------------------------------------------------------

  it('addClip / getClip stores clips', () => {
    expect(graph.getClip('idle')).toBeDefined();
    expect(graph.getClip('idle')!.duration).toBe(1);
  });

  it('removeClip deletes a clip', () => {
    expect(graph.removeClip('jump')).toBe(true);
    expect(graph.getClip('jump')).toBeUndefined();
  });

  it('getClipIds returns all ids', () => {
    expect(graph.getClipIds()).toEqual(expect.arrayContaining(['idle', 'run', 'jump']));
  });

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  it('addState creates a state', () => {
    const state = graph.addState('idle_state', 'idle', { loop: true });
    expect(state.id).toBe('idle_state');
    expect(state.clipId).toBe('idle');
    expect(state.loop).toBe(true);
  });

  it('getState retrieves by id', () => {
    graph.addState('s1', 'idle');
    expect(graph.getState('s1')).toBeDefined();
    expect(graph.getState('nope')).toBeUndefined();
  });

  it('getCurrentState returns default state', () => {
    graph.addState('idle_state', 'idle');
    expect(graph.getCurrentState()).toBe('idle_state');
  });

  // ---------------------------------------------------------------------------
  // Transitions
  // ---------------------------------------------------------------------------

  it('addTransition registers a transition', () => {
    graph.addState('idle_s', 'idle');
    graph.addState('run_s', 'run');
    graph.addTransition({
      id: 't1',
      fromState: 'idle_s',
      toState: 'run_s',
      duration: 0.2,
      condition: { type: 'parameter', name: 'speed', comparator: '>', value: 0.5 },
      interruptible: true,
    });
    // The transition should be stored (no getter, but won't throw)
  });

  // ---------------------------------------------------------------------------
  // Parameters
  // ---------------------------------------------------------------------------

  it('setParameter / getParameter', () => {
    graph.setParameter('speed', 5);
    expect(graph.getParameter('speed')).toBe(5);
  });

  it('setTrigger works', () => {
    graph.setParameter('fire', false);
    graph.setTrigger('fire');
    expect(graph.getParameter('fire')).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  it('update returns property values', () => {
    graph.addState('idle_s', 'idle');
    const result = graph.update(0.5);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBeGreaterThan(0);
  });

  it('update triggers transition when condition met', () => {
    graph.addState('idle_s', 'idle');
    graph.addState('run_s', 'run');
    graph.addTransition({
      id: 't1',
      fromState: 'idle_s',
      toState: 'run_s',
      duration: 0.2,
      condition: { type: 'parameter', name: 'speed', comparator: '>', value: 0 },
      interruptible: true,
    });
    graph.setParameter('speed', 5);
    graph.update(0.016);
    // After enough updates, state should change
    for (let i = 0; i < 20; i++) graph.update(0.016);
    expect(graph.getCurrentState()).toBe('run_s');
  });

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  it('addLayer / getLayers', () => {
    graph.addLayer({
      id: 'upper_body',
      weight: 1,
      blendMode: 'override',
      mask: ['spine', 'arm'],
      graph: {
        states: new Map(),
        transitions: [],
        currentState: '',
        parameters: new Map(),
        activeTransition: null,
      },
    });
    expect(graph.getLayers()).toHaveLength(1);
    expect(graph.getLayers()[0].id).toBe('upper_body');
  });

  // ---------------------------------------------------------------------------
  // Track Sampling
  // ---------------------------------------------------------------------------

  it('sampleTrack interpolates keyframes', () => {
    const track = {
      targetProperty: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 100 },
      ],
      interpolation: 'linear' as const,
    };
    expect(graph.sampleTrack(track, 0.5)).toBeCloseTo(50, 0);
  });

  it('sampleTrack clamps beyond range', () => {
    const track = {
      targetProperty: 'x',
      keyframes: [
        { time: 0, value: 0 },
        { time: 1, value: 100 },
      ],
      interpolation: 'linear' as const,
    };
    expect(graph.sampleTrack(track, 2)).toBe(100);
  });
});
