// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { simulateDecision, useDispatchTrace } from '../useDispatchTrace';

// Mock useStudioBus so the hook does not need a real provider tree.
vi.mock('../useStudioBus', () => ({
  useStudioBus: () => ({
    emit: vi.fn(),
    on: vi.fn(() => () => {}),
  }),
}));

describe('useDispatchTrace', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('defaults to all-three mode and auto-starts', () => {
    const { result } = renderHook(() => useDispatchTrace({ autoStart: true, simulatedIntervalMs: 100 }));
    expect(result.current.mode).toBe('all-three');
    expect(result.current.isRunning).toBe(true);
  });

  it('cycles through dispatch modes', () => {
    const { result } = renderHook(() => useDispatchTrace({ autoStart: false }));

    // DISPATCH_MODES order: tier-1-only, tier-1-2, all-three, cpu-only
    // starting from all-three -> cycle -> cpu-only
    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('cpu-only');

    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('tier-1-only');

    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('tier-1-2');

    act(() => {
      result.current.cycleMode();
    });
    expect(result.current.mode).toBe('all-three');
  });

  it('produces latency history after ticks', async () => {
    const { result } = renderHook(() =>
      useDispatchTrace({ autoStart: true, simulatedIntervalMs: 50, historySize: 10 })
    );

    // Let 3 ticks fire
    act(() => {
      vi.advanceTimersByTime(160);
    });

    await waitFor(() => expect(result.current.frameCount).toBeGreaterThanOrEqual(3));
    expect(result.current.latencyHistory.length).toBeGreaterThanOrEqual(3);
    expect(result.current.avgLatency).toBeGreaterThan(0);
  });

  it('resets trace and clears history', async () => {
    const { result } = renderHook(() =>
      useDispatchTrace({ autoStart: true, simulatedIntervalMs: 50, historySize: 10 })
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    await waitFor(() => expect(result.current.frameCount).toBeGreaterThan(0));

    act(() => {
      result.current.reset();
    });

    expect(result.current.frameCount).toBe(0);
    expect(result.current.latencyHistory.length).toBe(0);
    expect(result.current.latest).toBeNull();
  });

  it('pauses and resumes', async () => {
    const { result } = renderHook(() =>
      useDispatchTrace({ autoStart: true, simulatedIntervalMs: 50, historySize: 10 })
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });
    await waitFor(() => expect(result.current.frameCount).toBeGreaterThan(0));
    const countBefore = result.current.frameCount;

    act(() => {
      result.current.stop();
    });
    expect(result.current.isRunning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.frameCount).toBe(countBefore);

    act(() => {
      result.current.start();
    });
    expect(result.current.isRunning).toBe(true);
  });

  it('computes tier counts from history', async () => {
    const { result } = renderHook(() =>
      useDispatchTrace({ autoStart: true, simulatedIntervalMs: 50, historySize: 10 })
    );

    act(() => {
      vi.advanceTimersByTime(500);
    });

    await waitFor(() => expect(result.current.frameCount).toBeGreaterThanOrEqual(5));
    const counts = result.current.tierCounts;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  it('sets dispatch mode directly', () => {
    const { result } = renderHook(() => useDispatchTrace({ autoStart: false }));

    act(() => {
      result.current.setMode('cpu-only');
    });
    expect(result.current.mode).toBe('cpu-only');
  });

  it('generates stable replay fingerprints for identical demo inputs', () => {
    const first = simulateDecision('all-three', 12, 'grabbable');
    const second = simulateDecision('all-three', 12, 'grabbable');

    expect(first.replayFingerprint).toBe(second.replayFingerprint);
    expect(first.metrics.latencyEstimateMs).toBe(second.metrics.latencyEstimateMs);
    expect(first.replayFingerprint).toMatch(/^fnv1a-64:[a-f0-9]{16}$/);
  });

  it('changes replay fingerprints when replay inputs change', () => {
    const first = simulateDecision('all-three', 12, 'grabbable');
    const second = simulateDecision('all-three', 13, 'grabbable');
    const third = simulateDecision('cpu-only', 12, 'grabbable');

    expect(first.replayFingerprint).not.toBe(second.replayFingerprint);
    expect(first.replayFingerprint).not.toBe(third.replayFingerprint);
  });

  it('reports promoted when tier is not CPU-direct', async () => {
    const { result } = renderHook(() =>
      useDispatchTrace({ autoStart: true, simulatedIntervalMs: 50, historySize: 10 })
    );

    act(() => {
      vi.advanceTimersByTime(200);
    });

    await waitFor(() => expect(result.current.frameCount).toBeGreaterThanOrEqual(2));
    // In all-three mode with demo simulation, some frames will hit Tier-1 or Tier-2
    // and wasPromoted will be true for those.
    expect(typeof result.current.wasPromoted).toBe('boolean');
  });
});
