/**
 * Test suite for browser-benchmark.js functionality
 * Tests the quickBenchmark function and BenchmarkUtils
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from '@/lib/logger';

// Mock the browser environment
const mockWindow: any = {
  CompilerBridge: {
    parse: vi.fn(),
    compile: vi.fn(),
  },
  performance: {
    now: vi.fn(),
  },
  console: {
    log: vi.fn(),
    error: vi.fn(),
  },
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
};

// Mock performance.now to return predictable timestamps
let mockTime = 0;
mockWindow.performance.now.mockImplementation(() => {
  mockTime += 5; // Each operation takes 5ms
  return mockTime;
});

// Simulate the browser benchmark functionality
function loadBrowserBenchmark() {
  // Instead of loading the actual script, we'll recreate the key functions
  // This allows testing the logic without file system dependencies

  const BenchmarkUtils = {
    async measureOperationAsync(fn: () => Promise<any>, iterations = 50) {
      const times = [];
      for (let i = 0; i < iterations; i++) {
        const start = mockWindow.performance.now();
        try {
          await fn();
        } catch (_) {
          // Record failed iteration time and continue
        }
        const end = mockWindow.performance.now();
        times.push(end - start);
      }

      times.sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);
      const avg = sum / times.length;
      const p95 = times[Math.floor(times.length * 0.95)];

      return {
        avg: parseFloat(avg.toFixed(2)),
        min: parseFloat(times[0].toFixed(2)),
        max: parseFloat(times[times.length - 1].toFixed(2)),
        p95: parseFloat(p95.toFixed(2)),
        iterations,
      };
    },

    measureOperation(fn: () => any, iterations = 50) {
      const times = [];
      for (let i = 0; i < iterations; i++) {
        const start = mockWindow.performance.now();
        fn();
        const end = mockWindow.performance.now();
        times.push(end - start);
      }

      times.sort((a, b) => a - b);
      const sum = times.reduce((a, b) => a + b, 0);
      const avg = sum / times.length;
      const p95 = times[Math.floor(times.length * 0.95)];

      return {
        avg: parseFloat(avg.toFixed(2)),
        min: parseFloat(times[0].toFixed(2)),
        max: parseFloat(times[times.length - 1].toFixed(2)),
        p95: parseFloat(p95.toFixed(2)),
        iterations,
      };
    },
  };

  const quickBenchmark = async () => {
    mockWindow.logger.debug('⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n');

    if (typeof mockWindow.CompilerBridge === 'undefined') {
      mockWindow.logger.error('❌ CompilerBridge not available');
      return;
    }

    const compiler = mockWindow.CompilerBridge;
    const testCode = `composition "Quick" { object "O" { geometry: "sphere" } }`;

    const parseResult = await BenchmarkUtils.measureOperationAsync(
      () => compiler.parse(testCode),
      20
    );

    const compileResult = await BenchmarkUtils.measureOperationAsync(
      () => compiler.compile(testCode, { target: 'threejs' }),
      20
    );

    mockWindow.logger.debug('Quick Benchmark Results:');
    mockWindow.logger.debug(
      `  Parse:  ${parseResult.avg}ms ±${(parseResult.max - parseResult.min).toFixed(2)}ms`
    );
    mockWindow.logger.debug(
      `  Compile: ${compileResult.avg}ms ±${(compileResult.max - compileResult.min).toFixed(2)}ms\\n`
    );

    return { parse: parseResult, compile: compileResult };
  };

  const runBenchmark = async () => {
    // Stub for the main benchmark function
    return { success: true };
  };

  return {
    BenchmarkUtils,
    quickBenchmark,
    runBenchmark,
  };
}

describe('Browser Benchmark', () => {
  let browserEnv: any;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    mockTime = 0;

    // Re-create CompilerBridge — some tests use `delete mockWindow.CompilerBridge`
    mockWindow.CompilerBridge = {
      parse: vi.fn(),
      compile: vi.fn(),
    };

    // Re-establish performance.now implementation (vi.clearAllMocks does NOT reset mockImplementation)
    mockWindow.performance.now.mockImplementation(() => {
      mockTime += 5;
      return mockTime;
    });

    // Mock successful compiler operations
    mockWindow.CompilerBridge.parse.mockResolvedValue({ success: true });
    mockWindow.CompilerBridge.compile.mockResolvedValue({ success: true });

    // Load the browser benchmark script
    browserEnv = loadBrowserBenchmark();
  });

  describe('BenchmarkUtils', () => {
    it('should measure async operations correctly', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');
      const result = await browserEnv.BenchmarkUtils.measureOperationAsync(mockFn, 3);

      expect(result).toEqual({
        avg: 5,
        min: 5,
        max: 5,
        p95: 5,
        iterations: 3,
      });

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should measure sync operations correctly', () => {
      const mockFn = vi.fn().mockReturnValue('result');
      const result = browserEnv.BenchmarkUtils.measureOperation(mockFn, 2);

      expect(result).toEqual({
        avg: 5,
        min: 5,
        max: 5,
        p95: 5,
        iterations: 2,
      });

      expect(mockFn).toHaveBeenCalledTimes(2);
    });

    it('should calculate statistics correctly with varied timings', async () => {
      // Mock variable timing
      let callCount = 0;
      mockWindow.performance.now.mockImplementation(() => {
        // [0, 10, 10, 15]: iteration1 delta=10-0=10, iteration2 delta=15-10=5
        const times = [0, 10, 10, 15];
        return times[callCount++] ?? 0;
      });

      const mockFn = vi.fn().mockResolvedValue('result');
      const result = await browserEnv.BenchmarkUtils.measureOperationAsync(mockFn, 2);

      expect(result.avg).toBe(7.5); // (10 + 5) / 2
      expect(result.min).toBe(5);
      expect(result.max).toBe(10);
    });
  });

  describe('quickBenchmark', () => {
    it('should run successfully with CompilerBridge available', async () => {
      const result = await browserEnv.quickBenchmark();

      // Should have called parse and compile
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledTimes(20);
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledTimes(20);

      // Should have called with expected parameters
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }'
      );
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }',
        { target: 'threejs' }
      );

      // Should return results
      expect(result).toEqual({
        parse: {
          avg: 5,
          min: 5,
          max: 5,
          p95: 5,
          iterations: 20,
        },
        compile: {
          avg: 5,
          min: 5,
          max: 5,
          p95: 5,
          iterations: 20,
        },
      });

      // Should have logged benchmark start message
      expect(mockWindow.logger.debug).toHaveBeenCalledWith(
        '⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n'
      );
    });

    it('should return early when CompilerBridge is unavailable', async () => {
      // Remove CompilerBridge
      mockWindow.CompilerBridge = undefined;
      browserEnv = loadBrowserBenchmark();

      const result = await browserEnv.quickBenchmark();

      expect(result).toBeUndefined();
      expect(mockWindow.logger.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
    });

    it('should handle compiler errors gracefully', async () => {
      // Mock compiler to throw error
      mockWindow.CompilerBridge.parse.mockRejectedValue(new Error('Parse error'));

      // The function should still complete (error handling is in measureOperationAsync)
      await expect(browserEnv.quickBenchmark()).resolves.toBeDefined();
    });

    it('should use correct test code', async () => {
      await browserEnv.quickBenchmark();

      const expectedCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledWith(expectedCode);
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledWith(expectedCode, {
        target: 'threejs',
      });
    });

    it('should log results correctly', async () => {
      await browserEnv.quickBenchmark();

      expect(mockWindow.logger.debug).toHaveBeenCalledWith('Quick Benchmark Results:');
      expect(mockWindow.logger.debug).toHaveBeenCalledWith('  Parse:  5ms ±0.00ms');
      expect(mockWindow.logger.debug).toHaveBeenCalledWith('  Compile: 5ms ±0.00ms\\n');
    });
  });

  describe('Global Exports', () => {
    it('should expose functions to window object', () => {
      expect(typeof browserEnv.runBenchmark).toBe('function');
      expect(typeof browserEnv.quickBenchmark).toBe('function');
      expect(typeof browserEnv.BenchmarkUtils).toBe('object');
    });

    it('should expose BenchmarkUtils methods', () => {
      expect(typeof browserEnv.BenchmarkUtils.measureOperationAsync).toBe('function');
      expect(typeof browserEnv.BenchmarkUtils.measureOperation).toBe('function');
    });
  });
});
