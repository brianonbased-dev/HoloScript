import { describe, it, expect, vi } from 'vitest';
import { AnimationGraph, AnimationClip } from '@holoscript/engine/animation/AnimationGraph';
import {
  AnimationTransitionSystem,
  BonePose,
} from '@holoscript/engine/animation/AnimationTransitions';
import { CutsceneTimeline, CutsceneBuilder } from '@holoscript/engine/animation/CutsceneTimeline';

// =============================================================================
// HELPERS
// =============================================================================

function makeClip(id: string, duration: number): AnimationClip {
  return {
    id,
    name: id,
    duration,
    loop: true,
    speed: 1,
    tracks: [
      {
        targetProperty: 'position.y',
        keyframes: [
          { time: 0, value: 0 },
          { time: duration, value: 1 },
        ],
        interpolation: 'linear',
      },
    ],
  };
}

function makePose(boneIds: string[], y: number): BonePose[] {
  return boneIds.map((id) => ({
    boneId: id,
    position: { x: 0, y, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
  }));
}

describe('Cycle 107: Animation Graph System', () => {
  // -------------------------------------------------------------------------
  // AnimationGraph
  // -------------------------------------------------------------------------

  it('should manage clips and states', () => {
    const graph = new AnimationGraph();
    const clip = makeClip('idle', 2);
    graph.addClip(clip);
    graph.addState('idle', 'idle');

    expect(graph.getClipIds()).toContain('idle');
    expect(graph.getCurrentState()).toBe('idle');
    expect(graph.getState('idle')?.isPlaying).toBe(true);
  });

  it('should transition between states on trigger', () => {
    const graph = new AnimationGraph();
    graph.addClip(makeClip('idle', 2));
    graph.addClip(makeClip('walk', 1));
    graph.addState('idle', 'idle');
    graph.addState('walk', 'walk');

    graph.addTransition({
      id: 't1',
      fromState: 'idle',
      toState: 'walk',
      duration: 0.3,
      condition: { type: 'trigger', name: 'start_walk' },
      interruptible: true,
    });

    // Before trigger
    graph.update(0.1);
    expect(graph.getCurrentState()).toBe('idle');

    // Set trigger
    graph.setTrigger('start_walk');
    graph.update(0.01);

    // Transition should be active but not instant
    expect(graph.getCurrentState()).toBe('idle'); // Still transitioning

    // Complete transition
    for (let i = 0; i < 30; i++) graph.update(0.02);
    expect(graph.getCurrentState()).toBe('walk');
  });

  it('should transition on parameter condition', () => {
    const graph = new AnimationGraph();
    graph.addClip(makeClip('idle', 2));
    graph.addClip(makeClip('run', 1));
    graph.addState('idle', 'idle');
    graph.addState('run', 'run');

    graph.addTransition({
      id: 't2',
      fromState: 'idle',
      toState: 'run',
      duration: 0.2,
      condition: { type: 'parameter', name: 'speed', comparator: '>', value: 5 },
      interruptible: true,
    });

    graph.setParameter('speed', 3);
    graph.update(0.1);
    expect(graph.getCurrentState()).toBe('idle');

    graph.setParameter('speed', 8);
    for (let i = 0; i < 20; i++) graph.update(0.02);
    expect(graph.getCurrentState()).toBe('run');
  });

  it('should sample animation tracks and output values', () => {
    const graph = new AnimationGraph();
    graph.addClip(makeClip('test', 2));
    graph.addState('test', 'test');

    // Advance half way (t = 1.0 of 2.0 duration)
    const output = graph.update(1.0);
    expect(output.has('position.y')).toBe(true);
    expect(output.get('position.y')!).toBeCloseTo(0.5, 1);
  });

  // -------------------------------------------------------------------------
  // AnimationTransitions (Ragdoll ↔ Animation)
  // -------------------------------------------------------------------------

  it('should blend from animation to ragdoll', () => {
    const system = new AnimationTransitionSystem({ duration: 0.5, curve: 'linear' });
    const bones = ['spine', 'head', 'arm_l', 'arm_r'];

    system.startAnimToRagdoll('entity1', makePose(bones, 1.0));
    expect(system.isTransitioning('entity1')).toBe(true);

    const ragdollPoses = new Map([['entity1', makePose(bones, 0)]]);
    const animPoses = new Map([['entity1', makePose(bones, 1)]]);

    // Halfway through
    const result = system.update(0.25, ragdollPoses, animPoses);
    expect(result.has('entity1')).toBe(true);
    const blended = result.get('entity1')!;
    // Should be halfway between anim (y=1) and ragdoll (y=0)
    expect(blended[0].position.y).toBeCloseTo(0.5, 1);

    // Complete
    system.update(0.3, ragdollPoses, animPoses);
    expect(system.isTransitioning('entity1')).toBe(false);
  });

  // -------------------------------------------------------------------------
  // CutsceneTimeline
  // -------------------------------------------------------------------------

  it('should play cutscene and track active events', () => {
    const timeline = new CutsceneTimeline();

    const cutscene = new CutsceneBuilder('intro', 'Intro Cutscene')
      .addTrack('Camera')
      .addEvent(0, 'camera', 0, 3, { position: [0, 5, -10] })
      .addTrack('Dialogue')
      .addEvent(1, 'dialogue', 1, 2, { text: 'Hello World' })
      .build();

    timeline.load(cutscene);
    timeline.play('intro');

    // At t=0.5: only camera active
    const events1 = timeline.update(0.5);
    expect(events1.get('intro')!.length).toBe(1);
    expect(events1.get('intro')![0].type).toBe('camera');

    // At t=1.5: both camera and dialogue active
    const events2 = timeline.update(1.0);
    expect(events2.get('intro')!.length).toBe(2);
  });

  it('should fire callbacks during cutscene', () => {
    const timeline = new CutsceneTimeline();
    const callbackFn = vi.fn();

    timeline.registerCallback('on_explosion', callbackFn);

    const cutscene = new CutsceneBuilder('action', 'Action Scene')
      .addTrack('Effects')
      .addEvent(0, 'callback', 0.5, 0.5, { callbackId: 'on_explosion' })
      .build();

    timeline.load(cutscene);
    timeline.play('action');

    timeline.update(0.3);
    expect(callbackFn).not.toHaveBeenCalled();

    timeline.update(0.3); // t = 0.6, callback should fire
    expect(callbackFn).toHaveBeenCalledTimes(1);
  });

  it('should support seek, pause, and resume', () => {
    const timeline = new CutsceneTimeline();

    const cutscene = new CutsceneBuilder('test', 'Test')
      .addTrack('Main')
      .addEvent(0, 'animation', 0, 5, {})
      .build();

    timeline.load(cutscene);
    timeline.play('test');

    timeline.update(1.0);
    expect(timeline.getCurrentTime('test')).toBeCloseTo(1.0);

    timeline.pause('test');
    timeline.update(1.0);
    expect(timeline.getCurrentTime('test')).toBeCloseTo(1.0); // No change

    timeline.resume('test');
    timeline.update(1.0);
    expect(timeline.getCurrentTime('test')).toBeCloseTo(2.0);

    timeline.seek('test', 4.0);
    expect(timeline.getProgress('test')).toBeCloseTo(0.8, 1);
  });
});
