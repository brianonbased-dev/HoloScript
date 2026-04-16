/**
 * Tests for React useHeapMonitor hook
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useHeapMonitor } from '../react/useHeapMonitor';
import { heapMonitor } from '../HeapBudgetMonitor';

// Mock performance.memory
const mockMemory = {
  usedJSHeapSize: 50 * 1024 * 1024,
  totalJSHeapSize: 100 * 1024 * 1024,
  jsHeapSizeLimit: 200 * 1024 * 1024,
};

Object.defineProperty(performance, 'memory', {
  configurable: true,
  get: () => mockMemory,
});

describe('useHeapMonitor', () => {
  beforeEach(() => {
    heapMonitor.reset();
    heapMonitor.stop();

    mockMemory.usedJSHeapSize = 50 * 1024 * 1024;
    mockMemory.totalJSHeapSize = 100 * 1024 * 1024;
    mockMemory.jsHeapSizeLimit = 200 * 1024 * 1024;

    vi.useFakeTimers();
  });

  afterEach(() => {
    heapMonitor.stop();
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should initialize with metrics', () => {
    const { result } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
      })
    );

    expect(result.current.metrics).toBeDefined();
    expect(result.current.utilization).toBeCloseTo(25, 1);
    expect(result.current.isThresholdExceeded).toBe(false);
  });

  it('should detect threshold exceeded', async () => {
    // Set memory to 75% utilization
    mockMemory.usedJSHeapSize = 150 * 1024 * 1024;

    const { result } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
        alertThreshold: 70,
      })
    );

    // Wait for initial metrics
    await waitFor(() => {
      expect(result.current.isThresholdExceeded).toBe(true);
    });

    expect(result.current.utilization).toBeGreaterThanOrEqual(70);
  });

  it('should call cleanup callback when threshold exceeded', async () => {
    mockMemory.usedJSHeapSize = 150 * 1024 * 1024;

    const onCleanupNeeded = vi.fn();

    renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
        alertThreshold: 70,
        onCleanupNeeded,
      })
    );

    // Simulate threshold exceeded event
    act(() => {
      window.dispatchEvent(new CustomEvent('heap-monitor:state-pruning-required'));
    });

    expect(onCleanupNeeded).toHaveBeenCalled();
  });

  it('should refresh metrics on demand', async () => {
    const { result } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
      })
    );

    const initialUtilization = result.current.utilization;

    // Change memory usage
    mockMemory.usedJSHeapSize = 100 * 1024 * 1024;

    act(() => {
      result.current.refreshMetrics();
    });

    await waitFor(() => {
      expect(result.current.utilization).not.toBe(initialUtilization);
    });
  });

  it('should trigger manual cleanup', async () => {
    const onCleanupNeeded = vi.fn();

    const { result } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
        onCleanupNeeded,
      })
    );

    act(() => {
      result.current.triggerCleanup();
    });

    expect(onCleanupNeeded).toHaveBeenCalled();
  });

  it('should start global monitor if not running', () => {
    expect(heapMonitor.getStatus().isMonitoring).toBe(false);

    renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
      })
    );

    expect(heapMonitor.getStatus().isMonitoring).toBe(true);
  });

  it('should cleanup on unmount', () => {
    const { unmount } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
      })
    );

    const addEventListenerSpy = vi.spyOn(window, 'removeEventListener');

    unmount();

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      'heap-monitor:state-pruning-required',
      expect.any(Function)
    );
  });

  it('should update metrics periodically', async () => {
    const { result } = renderHook(() =>
      useHeapMonitor({
        componentName: 'TestComponent',
      })
    );

    const initialTimestamp = result.current.metrics?.timestamp;

    // Fast-forward 5 seconds
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    await waitFor(() => {
      expect(result.current.metrics?.timestamp).not.toBe(initialTimestamp);
    });
  });
});
