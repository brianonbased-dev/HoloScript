/**
 * Tests for HeapBudgetMonitor
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { HeapBudgetMonitor } from '../HeapBudgetMonitor';

// Mock performance.memory API
const mockMemory = {
  usedJSHeapSize: 50 * 1024 * 1024, // 50MB
  totalJSHeapSize: 100 * 1024 * 1024, // 100MB
  jsHeapSizeLimit: 200 * 1024 * 1024, // 200MB (25% utilization)
};

Object.defineProperty(performance, 'memory', {
  configurable: true,
  get: () => mockMemory,
});

describe('HeapBudgetMonitor', () => {
  let monitor: HeapBudgetMonitor;

  beforeEach(() => {
    monitor = new HeapBudgetMonitor({
      alertThreshold: 70,
      checkInterval: 1000,
      enableAutoPruning: true,
      enableAutoCacheEviction: true,
    });

    // Reset mock memory
    mockMemory.usedJSHeapSize = 50 * 1024 * 1024;
    mockMemory.totalJSHeapSize = 100 * 1024 * 1024;
    mockMemory.jsHeapSizeLimit = 200 * 1024 * 1024;
  });

  afterEach(() => {
    monitor.stop();
    vi.clearAllTimers();
  });

  describe('getHeapMetrics', () => {
    it('should return current heap metrics', () => {
      const metrics = monitor.getHeapMetrics();

      expect(metrics).toBeDefined();
      expect(metrics?.usedJSHeapSize).toBe(50 * 1024 * 1024);
      expect(metrics?.totalJSHeapSize).toBe(100 * 1024 * 1024);
      expect(metrics?.jsHeapSizeLimit).toBe(200 * 1024 * 1024);
      expect(metrics?.utilizationPercentage).toBeCloseTo(25, 1);
    });

    it('should return null if memory API unavailable', () => {
      const originalMemory = (performance as any).memory;
      delete (performance as any).memory;

      const metrics = monitor.getHeapMetrics();
      expect(metrics).toBeNull();

      // Restore
      Object.defineProperty(performance, 'memory', {
        configurable: true,
        get: () => originalMemory,
      });
    });
  });

  describe('start/stop', () => {
    it('should start monitoring', () => {
      monitor.start();
      const status = monitor.getStatus();

      expect(status.isMonitoring).toBe(true);
    });

    it('should stop monitoring', () => {
      monitor.start();
      monitor.stop();
      const status = monitor.getStatus();

      expect(status.isMonitoring).toBe(false);
    });

    it('should not start twice', () => {
      const consoleSpy = vi.spyOn(console, 'warn');

      monitor.start();
      monitor.start();

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Already monitoring'));
    });
  });

  describe('threshold alerts', () => {
    it('should trigger alert when threshold exceeded', async () => {
      const onThresholdExceeded = vi.fn();

      monitor = new HeapBudgetMonitor({
        alertThreshold: 70,
        checkInterval: 100,
        onThresholdExceeded,
      });

      // Set memory to 75% utilization
      mockMemory.usedJSHeapSize = 150 * 1024 * 1024;

      monitor.start();

      // Wait for check interval
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onThresholdExceeded).toHaveBeenCalled();
      const metrics = onThresholdExceeded.mock.calls[0][0];
      expect(metrics.utilizationPercentage).toBeGreaterThanOrEqual(70);

      monitor.stop();
    });

    it('should not trigger alert when below threshold', async () => {
      const onThresholdExceeded = vi.fn();

      monitor = new HeapBudgetMonitor({
        alertThreshold: 70,
        checkInterval: 100,
        onThresholdExceeded,
      });

      // Set memory to 30% utilization
      mockMemory.usedJSHeapSize = 60 * 1024 * 1024;

      monitor.start();

      await new Promise(resolve => setTimeout(resolve, 150));

      expect(onThresholdExceeded).not.toHaveBeenCalled();

      monitor.stop();
    });
  });

  describe('trackComponentState', () => {
    it('should track component state size', () => {
      const state = { data: new Array(1000).fill('test') };
      const props = { id: 1, name: 'Component' };

      monitor.trackComponentState('TestComponent', state, props);

      const history = monitor.getComponentStateHistory('TestComponent') as any[];
      expect(history).toHaveLength(1);
      expect(history[0].componentName).toBe('TestComponent');
      expect(history[0].stateSize).toBeGreaterThan(0);
      expect(history[0].propsSize).toBeGreaterThan(0);
    });

    it('should maintain history limit', () => {
      monitor = new HeapBudgetMonitor({ maxHistorySize: 5 });

      for (let i = 0; i < 10; i++) {
        monitor.trackComponentState('TestComponent', { count: i }, {});
      }

      const history = monitor.getComponentStateHistory('TestComponent') as any[];
      expect(history).toHaveLength(5);
    });
  });

  describe('trackReduxStore', () => {
    it('should track Redux store size', () => {
      const mockStore = {
        getState: () => ({
          user: { id: 1, name: 'John' },
          posts: new Array(100).fill({ id: 1, content: 'Post' }),
          settings: { theme: 'dark' },
        }),
      };

      const metrics = monitor.trackReduxStore(mockStore);

      expect(metrics.totalSize).toBeGreaterThan(0);
      expect(metrics.slicesSizes.user).toBeGreaterThan(0);
      expect(metrics.slicesSizes.posts).toBeGreaterThan(metrics.slicesSizes.user);
      expect(metrics.slicesSizes.settings).toBeGreaterThan(0);
    });
  });

  describe('trackCache', () => {
    it('should track Map cache size', () => {
      const cache = new Map();
      cache.set('key1', { data: 'value1' });
      cache.set('key2', { data: new Array(100).fill('value') });

      const metrics = monitor.trackCache(cache);

      expect(metrics.entries).toBe(2);
      expect(metrics.totalSize).toBeGreaterThan(0);
    });
  });

  describe('estimateSize', () => {
    it('should estimate primitive sizes', () => {
      const monitor = new HeapBudgetMonitor();

      expect(monitor['estimateSize'](null)).toBe(0);
      expect(monitor['estimateSize'](undefined)).toBe(0);
      expect(monitor['estimateSize'](true)).toBe(4);
      expect(monitor['estimateSize'](42)).toBe(8);
      expect(monitor['estimateSize']('hello')).toBe(10); // 5 chars * 2 bytes
    });

    it('should estimate array sizes', () => {
      const monitor = new HeapBudgetMonitor();

      const arr = [1, 2, 3, 'test'];
      const size = monitor['estimateSize'](arr);

      expect(size).toBeGreaterThan(0);
    });

    it('should estimate object sizes', () => {
      const monitor = new HeapBudgetMonitor();

      const obj = {
        name: 'John',
        age: 30,
        active: true,
      };

      const size = monitor['estimateSize'](obj);
      expect(size).toBeGreaterThan(0);
    });

    it('should handle circular references', () => {
      const monitor = new HeapBudgetMonitor();

      const obj: any = { name: 'Test' };
      obj.self = obj;

      const size = monitor['estimateSize'](obj);
      expect(size).toBeGreaterThan(0);
    });
  });

  describe('getTopMemoryComponents', () => {
    it('should return top memory-consuming components', () => {
      monitor.trackComponentState('ComponentA', { data: new Array(100).fill('a') }, {});
      monitor.trackComponentState('ComponentB', { data: new Array(1000).fill('b') }, {});
      monitor.trackComponentState('ComponentC', { data: new Array(50).fill('c') }, {});

      const top = monitor.getTopMemoryComponents(2);

      expect(top).toHaveLength(2);
      expect(top[0].componentName).toBe('ComponentB');
      expect(top[1].componentName).toBe('ComponentA');
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      monitor.trackComponentState('TestComponent', { data: 'test' }, {});
      monitor.start();
      monitor.stop();

      monitor.reset();

      const history = monitor.getMetricsHistory();
      const componentHistory = monitor.getComponentStateHistory();

      expect(history).toHaveLength(0);
      expect(componentHistory.size).toBe(0);
    });
  });

  describe('getStatus', () => {
    it('should return current status', () => {
      monitor.trackComponentState('ComponentA', { data: 'a' }, {});
      monitor.trackComponentState('ComponentB', { data: 'b' }, {});

      const status = monitor.getStatus();

      expect(status.isMonitoring).toBe(false);
      expect(status.currentMetrics).toBeDefined();
      expect(status.topComponents).toHaveLength(2);
      expect(status.config.alertThreshold).toBe(70);
    });
  });
});
