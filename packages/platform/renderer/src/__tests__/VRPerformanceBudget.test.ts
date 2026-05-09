import { describe, it, expect } from 'vitest';
import {
  VRPerformanceBudget,
  DEFAULT_BUDGET_CONFIG,
} from '../VRPerformanceBudget';

describe('VRPerformanceBudget', () => {
  it('uses default config when no options given', () => {
    const b = new VRPerformanceBudget();
    expect(b.getTargetFrameTimeMs()).toBe(DEFAULT_BUDGET_CONFIG.targetFrameTimeMs);
    expect(b.getAllocations()).toEqual(DEFAULT_BUDGET_CONFIG.allocations);
  });

  it('allows custom target frame time', () => {
    const b = new VRPerformanceBudget({ targetFrameTimeMs: 11.11 });
    expect(b.getTargetFrameTimeMs()).toBe(11.11);
  });

  it('normalises allocations that exceed 1.0 total', () => {
    const b = new VRPerformanceBudget({
      allocations: { render: 0.6, inference: 0.6, gpu: 0.6, cpu: 0.6 },
    });
    const allocs = b.getAllocations();
    const total = Object.values(allocs).reduce((a, v) => a + v, 0);
    expect(total).toBeCloseTo(1.0, 4);
  });

  it('returns null report before any frame', () => {
    const b = new VRPerformanceBudget();
    expect(b.getLastReport()).toBeNull();
  });

  it('produces a report after beginFrame + endFrame', () => {
    const b = new VRPerformanceBudget();
    b.beginFrame(0);
    b.recordUsage('render', 5);
    b.recordUsage('inference', 2);
    const report = b.endFrame(10);

    expect(report.frameTimeMs).toBe(10);
    expect(report.totalUsedMs).toBe(7);
    expect(report.headroomMs).toBeCloseTo(9.67, 1);
    expect(report.categories.length).toBe(4);
    expect(report.anyOverBudget).toBe(false);
  });

  it('flags over-budget categories correctly', () => {
    const b = new VRPerformanceBudget({ targetFrameTimeMs: 10 });
    b.beginFrame(0);
    // render budget = 4.5 ms; use 10 ms → over budget
    b.recordUsage('render', 10);
    const report = b.endFrame(10);

    expect(report.anyOverBudget).toBe(true);
    const renderCat = report.categories.find((c) => c.category === 'render')!;
    expect(renderCat.overBudget).toBe(true);
    expect(renderCat.remainingMs).toBeLessThan(0);
  });

  it('getOverBudgetCategories returns empty when within budget', () => {
    const b = new VRPerformanceBudget();
    b.beginFrame(0);
    b.recordUsage('render', 1);
    b.endFrame(1);
    expect(b.getOverBudgetCategories()).toEqual([]);
  });

  it('getOverBudgetCategories returns overspent categories', () => {
    const b = new VRPerformanceBudget({ targetFrameTimeMs: 10 });
    b.beginFrame(0);
    b.recordUsage('render', 10);
    b.endFrame(10);
    expect(b.getOverBudgetCategories()).toContain('render');
  });

  it('computes average frame time over history', () => {
    const b = new VRPerformanceBudget();
    for (let i = 0; i < 5; i++) {
      b.beginFrame(i * 10);
      b.endFrame(i * 10 + 5);
    }
    expect(b.getAverageFrameTimeMs()).toBe(5);
  });

  it('computes over-budget rate', () => {
    const b = new VRPerformanceBudget({ targetFrameTimeMs: 10 });
    // 3 frames within budget
    for (let i = 0; i < 3; i++) {
      b.beginFrame(0);
      b.recordUsage('render', 1);
      b.endFrame(1);
    }
    // 2 frames over budget
    for (let i = 0; i < 2; i++) {
      b.beginFrame(0);
      b.recordUsage('render', 10);
      b.endFrame(10);
    }
    expect(b.getOverBudgetRate()).toBeCloseTo(0.4, 2);
  });

  it('tracks remaining budget for a category', () => {
    const b = new VRPerformanceBudget({ targetFrameTimeMs: 10 });
    b.beginFrame(0);
    b.recordUsage('gpu', 1);
    // gpu budget = 2.0 ms; used 1 ms → remaining ~1 ms
    const remaining = b.getRemaining('gpu', 1);
    expect(remaining).toBeCloseTo(1, 1);
  });

  it('resets usage each frame', () => {
    const b = new VRPerformanceBudget();
    b.beginFrame(0);
    b.recordUsage('cpu', 5);
    b.endFrame(5);

    b.beginFrame(5);
    // no usage recorded this frame
    const report = b.endFrame(6);
    const cpuCat = report.categories.find((c) => c.category === 'cpu')!;
    expect(cpuCat.usedMs).toBe(0);
    expect(cpuCat.remainingMs).toBeCloseTo(1.67, 1);
  });

  it('rolls history when exceeding window', () => {
    const b = new VRPerformanceBudget({ historyWindow: 3 });
    for (let i = 0; i < 5; i++) {
      b.beginFrame(i * 10);
      b.endFrame(i * 10 + 5);
    }
    // Only last 3 frames kept
    expect(b.getAverageFrameTimeMs()).toBe(5);
  });
});
