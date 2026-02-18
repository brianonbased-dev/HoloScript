/**
 * MemoryTracker Production Tests
 *
 * Allocation, free, budget, leak detection, snapshots, queries.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryTracker } from '../MemoryTracker';

describe('MemoryTracker — Production', () => {
  let tracker: MemoryTracker;

  beforeEach(() => {
    tracker = new MemoryTracker();
  });

  describe('allocate / free', () => {
    it('allocates and returns id', () => {
      const id = tracker.allocate('texture', 1024);
      expect(id).toBeGreaterThan(0);
      expect(tracker.getActiveCount()).toBe(1);
      expect(tracker.getActiveBytes()).toBe(1024);
    });

    it('frees allocation', () => {
      const id = tracker.allocate('buffer', 512);
      expect(tracker.free(id)).toBe(true);
      expect(tracker.getActiveCount()).toBe(0);
      expect(tracker.getTotalFreed()).toBe(512);
    });

    it('double free returns false', () => {
      const id = tracker.allocate('buffer', 256);
      tracker.free(id);
      expect(tracker.free(id)).toBe(false);
    });
  });

  describe('budget', () => {
    it('tracks budget usage', () => {
      tracker.setBudget('gpu', 2048);
      tracker.allocate('gpu', 1000);
      expect(tracker.getBudgetUsage('gpu')).toBeCloseTo(1000 / 2048);
    });

    it('warns on budget exceeded', () => {
      tracker.setBudget('gpu', 100);
      tracker.allocate('gpu', 200);
      expect(tracker.getWarnings().length).toBeGreaterThan(0);
      expect(tracker.getWarnings()[0]).toContain('exceeded');
    });

    it('updates peak', () => {
      tracker.setBudget('tex', 1000);
      tracker.allocate('tex', 500);
      const id = tracker.allocate('tex', 400);
      tracker.free(id);
      expect(tracker.getBudget('tex')!.peakBytes).toBe(900);
    });
  });

  describe('leak detection', () => {
    it('finds old unfree allocations', () => {
      vi.spyOn(Date, 'now').mockReturnValue(1000);
      tracker.allocate('leak', 100);
      vi.spyOn(Date, 'now').mockReturnValue(6000);
      const leaks = tracker.detectLeaks(4000);
      expect(leaks).toHaveLength(1);
      vi.restoreAllMocks();
    });
  });

  describe('snapshots', () => {
    it('takes snapshot with breakdown', () => {
      tracker.allocate('mesh', 500);
      tracker.allocate('mesh', 300);
      tracker.allocate('audio', 200);
      const snap = tracker.takeSnapshot();
      expect(snap.activeAllocations).toBe(3);
      expect(snap.tagBreakdown.get('mesh')?.count).toBe(2);
      expect(snap.tagBreakdown.get('mesh')?.bytes).toBe(800);
    });

    it('getSnapshots returns history', () => {
      tracker.takeSnapshot();
      tracker.takeSnapshot();
      expect(tracker.getSnapshots()).toHaveLength(2);
    });
  });

  describe('queries', () => {
    it('getTotalAllocated cumulative', () => {
      tracker.allocate('a', 100);
      tracker.allocate('b', 200);
      expect(tracker.getTotalAllocated()).toBe(300);
    });

    it('clearWarnings', () => {
      tracker.setBudget('x', 1);
      tracker.allocate('x', 100);
      tracker.clearWarnings();
      expect(tracker.getWarnings()).toHaveLength(0);
    });
  });
});
