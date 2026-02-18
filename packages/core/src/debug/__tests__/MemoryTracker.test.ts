import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryTracker } from '../MemoryTracker';

describe('MemoryTracker', () => {
  let tracker: MemoryTracker;

  beforeEach(() => {
    tracker = new MemoryTracker();
  });

  it('allocate returns incrementing ids', () => {
    const id1 = tracker.allocate('textures', 1024);
    const id2 = tracker.allocate('textures', 2048);
    expect(id2).toBeGreaterThan(id1);
  });

  it('tracks total allocated bytes', () => {
    tracker.allocate('meshes', 1000);
    tracker.allocate('meshes', 2000);
    expect(tracker.getTotalAllocated()).toBe(3000);
  });

  it('free marks allocation and tracks freed bytes', () => {
    const id = tracker.allocate('tex', 500);
    expect(tracker.free(id)).toBe(true);
    expect(tracker.getTotalFreed()).toBe(500);
    expect(tracker.getActiveCount()).toBe(0);
  });

  it('free returns false for unknown or already freed', () => {
    expect(tracker.free(999)).toBe(false);
    const id = tracker.allocate('tex', 100);
    tracker.free(id);
    expect(tracker.free(id)).toBe(false);
  });

  it('setBudget and getBudget', () => {
    tracker.setBudget('textures', 10000);
    const budget = tracker.getBudget('textures');
    expect(budget).toBeDefined();
    expect(budget!.maxBytes).toBe(10000);
    expect(budget!.currentBytes).toBe(0);
  });

  it('budget tracks current and peak usage', () => {
    tracker.setBudget('tex', 5000);
    const id1 = tracker.allocate('tex', 2000);
    tracker.allocate('tex', 1500);
    expect(tracker.getBudget('tex')!.currentBytes).toBe(3500);

    tracker.free(id1);
    expect(tracker.getBudget('tex')!.currentBytes).toBe(1500);
    expect(tracker.getBudget('tex')!.peakBytes).toBe(3500);
  });

  it('generates warning when budget exceeded', () => {
    tracker.setBudget('tex', 1000);
    tracker.allocate('tex', 1500);
    const warnings = tracker.getWarnings();
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('Budget exceeded');
  });

  it('getBudgetUsage returns fraction', () => {
    tracker.setBudget('tex', 1000);
    tracker.allocate('tex', 250);
    expect(tracker.getBudgetUsage('tex')).toBe(0.25);
    expect(tracker.getBudgetUsage('unknown')).toBe(0);
  });

  it('detectLeaks finds old unfreed allocations', () => {
    tracker.allocate('old', 100);
    // Use -1 so cutoff = Date.now()+1, making any allocation older than cutoff
    const leaks = tracker.detectLeaks(-1);
    expect(leaks.length).toBe(1);
  });

  it('takeSnapshot captures current state', () => {
    tracker.allocate('a', 100);
    tracker.allocate('b', 200);
    const snap = tracker.takeSnapshot();
    expect(snap.activeAllocations).toBe(2);
    expect(snap.totalAllocated).toBe(300);
    expect(snap.tagBreakdown.get('a')?.bytes).toBe(100);
    expect(snap.tagBreakdown.get('b')?.bytes).toBe(200);
  });

  it('getActiveBytes sums unfreed allocations', () => {
    tracker.allocate('a', 100);
    const id = tracker.allocate('b', 200);
    tracker.free(id);
    expect(tracker.getActiveBytes()).toBe(100);
  });

  it('clearWarnings empties warnings array', () => {
    tracker.setBudget('tex', 10);
    tracker.allocate('tex', 100);
    expect(tracker.getWarnings().length).toBeGreaterThan(0);
    tracker.clearWarnings();
    expect(tracker.getWarnings().length).toBe(0);
  });
});
