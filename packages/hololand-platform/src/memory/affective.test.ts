import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffectiveMemory } from './affective';
import type { VRRRuntime } from '@holoscript/runtime';

function makeMockRuntime(): VRRRuntime {
  return {
    options: {},
    persistState: vi.fn(),
  } as unknown as VRRRuntime;
}

describe('AffectiveMemory', () => {
  let runtime: VRRRuntime;
  let memory: AffectiveMemory;

  beforeEach(() => {
    runtime = makeMockRuntime();
    memory = new AffectiveMemory(runtime);
  });

  describe('trackAffect()', () => {
    it('stores an affect event for a new scene', () => {
      memory.trackAffect('scene1', 0.8, 0.6);
      const scenes = memory.getPrioritizedScenes();
      expect(scenes).toContain('scene1');
    });

    it('calls runtime.persistState with the correct key', () => {
      memory.trackAffect('lobby', 0.5, 0.4);
      expect(runtime.persistState).toHaveBeenCalledWith(
        'affective_memory_lobby',
        expect.objectContaining({ sceneId: 'lobby' })
      );
    });

    it('accumulates multiple affect events for the same scene', () => {
      memory.trackAffect('scene1', 0.8, 0.6);
      memory.trackAffect('scene1', 0.4, 0.2);
      memory.trackAffect('scene1', 0.6, 0.8);
      expect(runtime.persistState).toHaveBeenCalledTimes(3);
    });

    it('enforces a 100-event sliding window', () => {
      // Push 101 events
      for (let i = 0; i < 101; i++) {
        memory.trackAffect('scene-window', 0.5, 0.5);
      }
      // persistState is called 101 times but the context should only keep 100 events
      const lastCallArg = (runtime.persistState as ReturnType<typeof vi.fn>).mock.calls[100][1];
      expect(lastCallArg.accumulatedAffect.length).toBe(100);
    });
  });

  describe('recalculatePriority()', () => {
    it('calculates priorityWeight as (avgValence * 0.7) + (avgArousal * 0.3)', () => {
      memory.trackAffect('scene-calc', 0.8, 0.6);
      // priorityWeight = (0.8 * 0.7) + (0.6 * 0.3) = 0.56 + 0.18 = 0.74
      const lastCallArg = (runtime.persistState as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(lastCallArg.priorityWeight).toBeCloseTo(0.74, 5);
    });

    it('averages valence across multiple events', () => {
      memory.trackAffect('scene-avg', 1.0, 0.0);
      memory.trackAffect('scene-avg', 0.0, 0.0);
      // avgValence = 0.5, avgArousal = 0.0 → priorityWeight = 0.35
      const calls = (runtime.persistState as ReturnType<typeof vi.fn>).mock.calls;
      const lastArg = calls[calls.length - 1][1];
      expect(lastArg.averageValence).toBeCloseTo(0.5, 5);
      expect(lastArg.priorityWeight).toBeCloseTo(0.35, 5);
    });

    it('handles negative valence (unpleasant scenes get lower priority)', () => {
      memory.trackAffect('unpleasant-scene', -0.5, 0.3);
      // priorityWeight = (-0.5 * 0.7) + (0.3 * 0.3) = -0.35 + 0.09 = -0.26
      const lastCallArg = (runtime.persistState as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(lastCallArg.priorityWeight).toBeCloseTo(-0.26, 5);
    });
  });

  describe('getPrioritizedScenes()', () => {
    it('returns scenes sorted by priorityWeight descending', () => {
      // scene-high: valence=0.9, arousal=0.8 → weight ≈ 0.87
      memory.trackAffect('scene-high', 0.9, 0.8);
      // scene-mid: valence=0.5, arousal=0.4 → weight ≈ 0.47
      memory.trackAffect('scene-mid', 0.5, 0.4);
      // scene-low: valence=0.1, arousal=0.1 → weight ≈ 0.10
      memory.trackAffect('scene-low', 0.1, 0.1);

      const ordered = memory.getPrioritizedScenes();
      expect(ordered[0]).toBe('scene-high');
      expect(ordered[1]).toBe('scene-mid');
      expect(ordered[2]).toBe('scene-low');
    });

    it('returns empty array when no scenes tracked', () => {
      expect(memory.getPrioritizedScenes()).toEqual([]);
    });

    it('returns single scene when only one is tracked', () => {
      memory.trackAffect('only-scene', 0.5, 0.5);
      expect(memory.getPrioritizedScenes()).toEqual(['only-scene']);
    });
  });

  describe('bindToRuntimeEvents()', () => {
    it('registers onAffectEvent hook on runtime options', () => {
      memory.bindToRuntimeEvents();
      const opts = (runtime as unknown as { options: Record<string, unknown> }).options;
      expect(typeof (opts as { hooks?: { onAffectEvent?: unknown } }).hooks?.onAffectEvent).toBe('function');
    });

    it('calls trackAffect when onAffectEvent fires', () => {
      memory.bindToRuntimeEvents();
      const opts = (runtime as unknown as { options: { hooks: { onAffectEvent: (args: { sceneId: string; valence: number; arousal: number }) => void } } }).options;
      opts.hooks.onAffectEvent({ sceneId: 'event-scene', valence: 0.7, arousal: 0.5 });
      expect(runtime.persistState).toHaveBeenCalledWith(
        'affective_memory_event-scene',
        expect.objectContaining({ sceneId: 'event-scene' })
      );
    });

    it('chains previously registered onAffectEvent hooks', () => {
      const previousHook = vi.fn();
      const opts = (runtime as unknown as { options: { hooks: { onAffectEvent: typeof previousHook } } }).options;
      if (!opts.hooks) (opts as Record<string, unknown>).hooks = {};
      opts.hooks.onAffectEvent = previousHook;

      memory.bindToRuntimeEvents();
      opts.hooks.onAffectEvent({ sceneId: 'chained-scene', valence: 0.3, arousal: 0.2 });

      expect(previousHook).toHaveBeenCalledWith(
        expect.objectContaining({ sceneId: 'chained-scene' })
      );
    });
  });
});
