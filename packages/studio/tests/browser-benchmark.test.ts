import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock performance API
global.performance = {
  now: vi.fn(() => Date.now()),
} as unknown as Performance;

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

interface MockBenchmarkWindow {
  CompilerBridge?: {
    parse: ReturnType<typeof vi.fn>;
    compile: ReturnType<typeof vi.fn>;
  };
  BenchmarkUtils?: any;
  quickBenchmark?: () => Promise<any>;
}

// Load and execute the browser benchmark script in a controlled environment
function loadBenchmarkScript() {
  const scriptPath = path.join(__dirname, '../public/browser-benchmark.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Create a mock window object
  const mockWindow = {
    CompilerBridge: {
      parse: vi.fn().mockResolvedValue({ success: true }),
      compile: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as MockBenchmarkWindow;

  // Execute script in context with mock window
  const context = {
    window: mockWindow,
    console,
    performance,
    BenchmarkUtils: null as unknown,
    quickBenchmark: null as unknown,
  };

  // Execute script content with context
  new Function('window', 'console', 'performance', scriptContent).call(
    context,
    context.window,
    console,
    performance
  );

  // Extract the functions we need
  return {
    quickBenchmark: context.window.quickBenchmark,
    BenchmarkUtils: context.window.BenchmarkUtils,
    mockWindow,
  };
}

describe('browser-benchmark.js', () => {
  let mockPerformance: any;

  beforeEach(() => {
    // Reset console spies
    consoleSpy.log.mockClear();
    consoleSpy.error.mockClear();

    // Mock performance.now to return predictable values
    let callCount = 0;
    mockPerformance = vi.spyOn(performance, 'now').mockImplementation(() => {
      // Simulate execution time of 10ms for each operation
      return callCount++ * 10;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('BenchmarkUtils.measureOperationAsync', () => {
    it('should measure async operation execution time', async () => {
      const { BenchmarkUtils } = loadBenchmarkScript();

      const mockFn = vi.fn().mockResolvedValue('test');
      const result = await BenchmarkUtils.measureOperationAsync(mockFn, 3);

      expect(result).toEqual({
        avg: 10,
        min: 10,
        max: 10,
        p95: 10,
        iterations: 3,
      });

      expect(mockFn).toHaveBeenCalledTimes(3);
    });

    it('should handle different execution times', async () => {
      const { BenchmarkUtils } = loadBenchmarkScript();

      // Mock performance.now to return varying times
      let times = [0, 5, 10, 15, 20, 25]; // Results in 5ms, 5ms, 5ms execution times
      let callIndex = 0;
      mockPerformance.mockImplementation(() => times[callIndex++] || 0);

      const mockFn = vi.fn().mockResolvedValue('test');
      const result = await BenchmarkUtils.measureOperationAsync(mockFn, 3);

      expect(result.iterations).toBe(3);
      expect(result.avg).toBe(5);
      expect(result.min).toBe(5);
      expect(result.max).toBe(5);
      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('quickBenchmark', () => {
    it('should run quick benchmark successfully when CompilerBridge is available', async () => {
      const { quickBenchmark, mockWindow } = loadBenchmarkScript();

      const result = await quickBenchmark();

      expect(result).toHaveProperty('parse');
      expect(result).toHaveProperty('compile');

      expect(result.parse).toEqual({
        avg: 10,
        min: 10,
        max: 10,
        p95: 10,
        iterations: 20,
      });

      expect(result.compile).toEqual({
        avg: 10,
        min: 10,
        max: 10,
        p95: 10,
        iterations: 20,
      });

      // Verify compiler was called with correct parameters
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }'
      );
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }',
        { target: 'threejs' }
      );

      // Verify console output
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n'
      );
      expect(consoleSpy.log).toHaveBeenCalledWith('Quick Benchmark Results:');
    });

    it('should return early and log error when CompilerBridge is unavailable', async () => {
      const { quickBenchmark } = loadBenchmarkScript();

      // Create version without CompilerBridge
      const mockWindowWithoutBridge = {} as unknown as MockBenchmarkWindow;
      const contextWithoutBridge = {
        window: mockWindowWithoutBridge,
        console,
        performance,
      };

      // Re-execute script without CompilerBridge
      const scriptPath = path.join(__dirname, '../public/browser-benchmark.js');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      new Function('window', 'console', 'performance', scriptContent).call(
        contextWithoutBridge,
        contextWithoutBridge.window,
        console,
        performance
      );

      const result = await contextWithoutBridge.window.quickBenchmark();

      expect(result).toBeUndefined();
      expect(consoleSpy.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
    });

    it('should handle compiler errors gracefully', async () => {
      const { quickBenchmark, mockWindow } = loadBenchmarkScript();

      // Make parse throw an error
      mockWindow.CompilerBridge.parse.mockRejectedValue(new Error('Parse failed'));

      // The function should still attempt to run but may fail
      // Since the real implementation doesn't have try/catch around these calls,
      // we expect it to throw
      await expect(quickBenchmark()).rejects.toThrow('Parse failed');
    });

    it('should use correct test code and iterations', async () => {
      const { quickBenchmark, mockWindow } = loadBenchmarkScript();

      await quickBenchmark();

      const expectedTestCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';

      // Verify parse was called 20 times (via measureOperationAsync)
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledTimes(20);
      mockWindow.CompilerBridge.parse.mock.calls.forEach((call) => {
        expect(call[0]).toBe(expectedTestCode);
      });

      // Verify compile was called 20 times with target
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledTimes(20);
      mockWindow.CompilerBridge.compile.mock.calls.forEach((call) => {
        expect(call[0]).toBe(expectedTestCode);
        expect(call[1]).toEqual({ target: 'threejs' });
      });
    });

    it('should format timing results correctly', async () => {
      const { quickBenchmark } = loadBenchmarkScript();

      // Mock performance to return more interesting times
      let callCount = 0;
      mockPerformance.mockImplementation(() => {
        const times = [0, 12.345, 0, 15.678]; // Will result in 12.35ms, 15.68ms execution times
        return times[callCount++ % times.length] || 0;
      });

      await quickBenchmark();

      // Check that console.log was called with formatted timing results
      const logCalls = consoleSpy.log.mock.calls;
      const resultsCalls = logCalls.filter(
        (call) => (call[0] && call[0].includes('Parse:')) || call[0].includes('Compile:')
      );

      expect(resultsCalls.length).toBeGreaterThan(0);
    });
  });

  describe('global exports', () => {
    it('should expose functions to window object', () => {
      const { mockWindow } = loadBenchmarkScript();

      expect(mockWindow.quickBenchmark).toBeFunction();
      expect(mockWindow.BenchmarkUtils).toBeObject();
      expect(mockWindow.runBenchmark).toBeFunction();
    });
  });
});
