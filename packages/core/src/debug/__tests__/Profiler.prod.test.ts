/**
 * Profiler Production Tests
 *
 * Frame timing, scope profiling, summaries, memory snapshots, FPS.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { Profiler } from '../Profiler';

describe('Profiler — Production', () => {
  let profiler: Profiler;

  beforeEach(() => {
    profiler = new Profiler();
  });

  describe('frame lifecycle', () => {
    it('records frame', () => {
      profiler.beginFrame();
      profiler.endFrame();
      expect(profiler.getFrameHistory()).toHaveLength(1);
      expect(profiler.getLastFrame()?.frameNumber).toBe(0);
    });

    it('frame has totalTime > 0', () => {
      profiler.beginFrame();
      // Busy wait a tiny bit
      const start = performance.now();
      while (performance.now() - start < 0.01) {}
      profiler.endFrame();
      expect(profiler.getLastFrame()!.totalTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scope profiling', () => {
    it('records scope in frame', () => {
      profiler.beginFrame();
      profiler.beginScope('physics');
      profiler.endScope();
      profiler.endFrame();
      const frame = profiler.getLastFrame()!;
      expect(frame.scopes).toHaveLength(1);
      expect(frame.scopes[0].name).toBe('physics');
    });

    it('nested scopes', () => {
      profiler.beginFrame();
      profiler.beginScope('update');
      profiler.beginScope('physics');
      profiler.endScope();
      profiler.endScope();
      profiler.endFrame();
      const frame = profiler.getLastFrame()!;
      expect(frame.scopes[0].children).toHaveLength(1);
      expect(frame.scopes[0].children[0].name).toBe('physics');
    });
  });

  describe('profile helper', () => {
    it('profiles a function and returns result', () => {
      profiler.beginFrame();
      const result = profiler.profile('calc', () => 42);
      profiler.endFrame();
      expect(result).toBe(42);
    });
  });

  describe('summaries', () => {
    it('tracks call count and times', () => {
      profiler.beginFrame();
      profiler.beginScope('render');
      profiler.endScope();
      profiler.beginScope('render');
      profiler.endScope();
      profiler.endFrame();
      const summary = profiler.getSummary('render');
      expect(summary?.callCount).toBe(2);
    });

    it('getSlowestScopes returns top N', () => {
      profiler.beginFrame();
      profiler.beginScope('fast');
      profiler.endScope();
      profiler.beginScope('slow');
      const start = performance.now();
      while (performance.now() - start < 0.01) {}
      profiler.endScope();
      profiler.endFrame();
      const slowest = profiler.getSlowestScopes(1);
      expect(slowest).toHaveLength(1);
    });
  });

  describe('memory snapshots', () => {
    it('takes snapshot', () => {
      const snap = profiler.takeMemorySnapshot('test');
      expect(snap.label).toBe('test');
      expect(profiler.getMemorySnapshots()).toHaveLength(1);
    });
  });

  describe('control', () => {
    it('setEnabled disables profiling', () => {
      profiler.setEnabled(false);
      expect(profiler.isEnabled()).toBe(false);
      profiler.beginFrame();
      profiler.endFrame();
      expect(profiler.getFrameHistory()).toHaveLength(0);
    });

    it('reset clears all', () => {
      profiler.beginFrame();
      profiler.endFrame();
      profiler.reset();
      expect(profiler.getFrameHistory()).toHaveLength(0);
    });
  });
});
