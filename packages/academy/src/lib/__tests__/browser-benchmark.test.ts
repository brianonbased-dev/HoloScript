// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Preserve the original jsdom window so afterEach can restore it
const savedOriginalWindow = global.window;

// consoleSpy is created in beforeEach so it wraps vitest's own console interception
let consoleSpy: { log: ReturnType<typeof vi.spyOn>; error: ReturnType<typeof vi.spyOn> };

// Load and execute the browser benchmark script in a controlled environment
function loadBenchmarkScript() {
  const scriptPath = path.join(__dirname, '../../../public/browser-benchmark.js');
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');

  // Create a mock window object with CompilerBridge
  const mockWindow = {
    CompilerBridge: {
      parse: vi.fn().mockResolvedValue({ success: true }),
      compile: vi.fn().mockResolvedValue({ success: true }),
    },
  } as any;

  // Set mockWindow as global.window so the script's functions see it at call time.
  // global.window is restored in afterEach via savedOriginalWindow.
  global.window = mockWindow;
  eval(scriptContent);

  return {
    quickBenchmark: mockWindow.quickBenchmark,
    BenchmarkUtils: mockWindow.BenchmarkUtils,
    mockWindow,
  };
}

describe('browser-benchmark.js', () => {
  let mockPerformance: any;

  beforeEach(() => {
    // Create fresh spies each test — must be after vitest's own console setup
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
    };

    // Mock performance.now to return predictable values
    let callCount = 0;
    mockPerformance = vi.spyOn(performance, 'now').mockImplementation(() => {
      // Simulate execution time of 10ms for each operation
      return callCount++ * 10;
    });
  });

  afterEach(() => {
    // restoreAllMocks is safe here because spies are recreated fresh in beforeEach
    vi.restoreAllMocks();
    // Restore global.window after each test (loadBenchmarkScript leaves it as mockWindow)
    global.window = savedOriginalWindow;
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

    it('should handle different execution times and calculate statistics', async () => {
      const { BenchmarkUtils } = loadBenchmarkScript();

      // Mock performance.now to return varying times (5ms, 15ms, 10ms execution times)
      let times = [0, 5, 5, 20, 20, 30]; // Results in [5ms, 15ms, 10ms] → sorted [5, 10, 15]
      let callIndex = 0;
      mockPerformance.mockImplementation(() => {
        const result = times[callIndex] || 0;
        callIndex++;
        return result;
      });

      const mockFn = vi.fn().mockResolvedValue('test');
      const result = await BenchmarkUtils.measureOperationAsync(mockFn, 3);

      expect(result.iterations).toBe(3);
      expect(result.avg).toBe(10); // (5 + 10 + 15) / 3
      expect(result.min).toBe(5);
      expect(result.max).toBe(15);
      expect(result.p95).toBe(15); // 95th percentile of [5, 10, 15]
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

      // Verify console output includes benchmark startup message
      expect(consoleSpy.log).toHaveBeenCalledWith(
        '⚡ Running quick benchmark (1 scenario, 20 iterations)...\n'
      );
      expect(consoleSpy.log).toHaveBeenCalledWith('Quick Benchmark Results:');
    });

    it('should return early and log error when CompilerBridge is unavailable', async () => {
      // Create a version of the script without CompilerBridge
      const scriptPath = path.join(__dirname, '../../../public/browser-benchmark.js');
      const scriptContent = fs.readFileSync(scriptPath, 'utf8');

      const mockWindowWithoutBridge = {} as any;
      const originalWindow = global.window;
      global.window = mockWindowWithoutBridge;

      try {
        eval(scriptContent);
        const result = await mockWindowWithoutBridge.quickBenchmark();

        expect(result).toBeUndefined();
        expect(consoleSpy.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
      } finally {
        global.window = originalWindow;
      }
    });

    it('should handle compiler errors gracefully', async () => {
      const { quickBenchmark, mockWindow } = loadBenchmarkScript();

      // Make parse throw an error
      mockWindow.CompilerBridge.parse.mockRejectedValue(new Error('Parse failed'));

      // The function should throw since there's no error handling in the original code
      await expect(quickBenchmark()).rejects.toThrow('Parse failed');
    });

    it('should use correct test code and target configuration', async () => {
      const { quickBenchmark, mockWindow } = loadBenchmarkScript();

      await quickBenchmark();

      const expectedTestCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';

      // Verify parse was called 20 times (via measureOperationAsync)
      expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledTimes(20);
      mockWindow.CompilerBridge.parse.mock.calls.forEach((call) => {
        expect(call[0]).toBe(expectedTestCode);
      });

      // Verify compile was called 20 times with correct target
      expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledTimes(20);
      mockWindow.CompilerBridge.compile.mock.calls.forEach((call) => {
        expect(call[0]).toBe(expectedTestCode);
        expect(call[1]).toEqual({ target: 'threejs' });
      });
    });

    it('should display formatted timing results in console', async () => {
      const { quickBenchmark } = loadBenchmarkScript();

      // Mock performance to return more varied times for better formatting test
      let callCount = 0;
      mockPerformance.mockImplementation(() => {
        const timings = [0, 12.345, 0, 15.678]; // Results in 12.35ms, 15.68ms
        return timings[callCount++ % timings.length] || 0;
      });

      await quickBenchmark();

      // Check that results are logged in the expected format
      const logCalls = consoleSpy.log.mock.calls.map((call) => call[0]);
      const parseLine = logCalls.find((line) => line && line.includes('Parse:'));
      const compileLine = logCalls.find((line) => line && line.includes('Compile:'));

      expect(parseLine).toBeDefined();
      expect(compileLine).toBeDefined();

      // Should include timing info and standard deviation
      expect(parseLine).toMatch(/Parse:\s+\d+\.?\d*ms ±\d+\.?\d*ms/);
      expect(compileLine).toMatch(/Compile:\s+\d+\.?\d*ms ±\d+\.?\d*ms/);
    });
  });

  describe('BenchmarkUtils.measureOperation (sync version)', () => {
    it('should measure synchronous operation execution time', () => {
      const { BenchmarkUtils } = loadBenchmarkScript();

      const mockFn = vi.fn().mockReturnValue('test');
      const result = BenchmarkUtils.measureOperation(mockFn, 3);

      expect(result).toEqual({
        avg: 10,
        min: 10,
        max: 10,
        p95: 10,
        iterations: 3,
      });

      expect(mockFn).toHaveBeenCalledTimes(3);
    });
  });

  describe('global exports', () => {
    it('should expose functions to window object', () => {
      const { mockWindow } = loadBenchmarkScript();

      expect(typeof mockWindow.quickBenchmark).toBe('function');
      expect(typeof mockWindow.BenchmarkUtils).toBe('object');
      expect(typeof mockWindow.runBenchmark).toBe('function');
      expect(typeof mockWindow.BenchmarkUtils.measureOperationAsync).toBe('function');
      expect(typeof mockWindow.BenchmarkUtils.measureOperation).toBe('function');
    });
  });
});
