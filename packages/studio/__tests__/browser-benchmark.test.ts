/**
 * Tests for browser-benchmark.js quickBenchmark function
 *
 * Since the original is a browser-specific JS file, we:
 * 1. Mock the browser environment (window, console)
 * 2. Import and evaluate the JS file content
 * 3. Test the quickBenchmark function behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Mock browser environment
const mockWindow = {
  CompilerBridge: {
    parse: vi.fn(),
    compile: vi.fn(),
  },
} as any;

const mockConsole = {
  log: vi.fn(),
  error: vi.fn(),
};

const mockPerformance = {
  now: vi.fn(),
};

// Store original values to restore
const originalWindow = global.window;
const originalConsole = global.console;
const originalPerformance = global.performance;

describe('quickBenchmark', () => {
  let quickBenchmark: () => Promise<any>;
  let BenchmarkUtils: any;

  beforeEach(() => {
    // Setup browser environment mocks
    global.window = mockWindow as any;
    global.console = mockConsole as any;
    global.performance = mockPerformance as any;

    // Reset all mocks
    vi.clearAllMocks();

    // Mock performance.now to return predictable values
    let callCount = 0;
    mockPerformance.now.mockImplementation(() => {
      // Return increasing values to simulate elapsed time
      // Each operation should take ~5ms (realistic for parsing/compilation)
      return callCount++ * 5;
    });

    // Mock compiler methods to simulate realistic behavior
    mockWindow.CompilerBridge.parse.mockResolvedValue({ success: true, ast: {} });
    mockWindow.CompilerBridge.compile.mockResolvedValue({ success: true, output: 'compiled code' });

    // Load and evaluate the browser-benchmark.js file
    const benchmarkPath = join(__dirname, '..', 'public', 'browser-benchmark.js');
    const benchmarkCode = readFileSync(benchmarkPath, 'utf-8');

    // Evaluate the code in our mocked environment
    eval(benchmarkCode);

    // Extract the functions that should be available on window
    quickBenchmark = (global.window as any).quickBenchmark;
    BenchmarkUtils = (global.window as any).BenchmarkUtils;
  });

  afterEach(() => {
    // Restore original globals
    global.window = originalWindow;
    global.console = originalConsole;
    global.performance = originalPerformance;
  });

  it('should be available as a global function', () => {
    expect(quickBenchmark).toBeDefined();
    expect(typeof quickBenchmark).toBe('function');
  });

  it('should return early with console error if CompilerBridge is undefined', async () => {
    // Remove CompilerBridge from window
    delete mockWindow.CompilerBridge;

    const result = await quickBenchmark();

    expect(result).toBeUndefined();
    expect(mockConsole.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
    expect(mockConsole.log).toHaveBeenCalledWith(
      '⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n'
    );
  });

  it('should run benchmark with correct test code and iterations', async () => {
    const result = await quickBenchmark();

    // Verify the correct test code was used
    const expectedTestCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';
    expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledWith(expectedTestCode);
    expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledWith(expectedTestCode, {
      target: 'threejs',
    });

    // Verify correct number of iterations (20 for each operation)
    expect(mockWindow.CompilerBridge.parse).toHaveBeenCalledTimes(20);
    expect(mockWindow.CompilerBridge.compile).toHaveBeenCalledTimes(20);
  });

  it('should return benchmark results with correct structure', async () => {
    const result = await quickBenchmark();

    expect(result).toBeDefined();
    expect(result).toHaveProperty('parse');
    expect(result).toHaveProperty('compile');

    // Check parse results structure
    expect(result.parse).toHaveProperty('avg');
    expect(result.parse).toHaveProperty('min');
    expect(result.parse).toHaveProperty('max');
    expect(result.parse).toHaveProperty('p95');
    expect(result.parse).toHaveProperty('iterations');
    expect(result.parse.iterations).toBe(20);

    // Check compile results structure
    expect(result.compile).toHaveProperty('avg');
    expect(result.compile).toHaveProperty('min');
    expect(result.compile).toHaveProperty('max');
    expect(result.compile).toHaveProperty('p95');
    expect(result.compile).toHaveProperty('iterations');
    expect(result.compile.iterations).toBe(20);

    // Verify numeric results are reasonable
    expect(typeof result.parse.avg).toBe('number');
    expect(typeof result.compile.avg).toBe('number');
    expect(result.parse.avg).toBeGreaterThanOrEqual(0);
    expect(result.compile.avg).toBeGreaterThanOrEqual(0);
  });

  it('should log results to console with correct format', async () => {
    await quickBenchmark();

    // Check that console.log was called with expected messages
    expect(mockConsole.log).toHaveBeenCalledWith(
      '⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n'
    );
    expect(mockConsole.log).toHaveBeenCalledWith('Quick Benchmark Results:');

    // Check that results were logged (exact format depends on timing values)
    const logCalls = mockConsole.log.mock.calls;
    const resultLogs = logCalls.filter(
      (call) =>
        typeof call[0] === 'string' && (call[0].includes('Parse:') || call[0].includes('Compile:'))
    );
    expect(resultLogs).toHaveLength(2);
  });

  it('should handle async operations correctly', async () => {
    // Make compiler methods take some time
    mockWindow.CompilerBridge.parse.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1))
    );
    mockWindow.CompilerBridge.compile.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 1))
    );

    const startTime = Date.now();
    const result = await quickBenchmark();
    const endTime = Date.now();

    // Should have waited for async operations
    expect(endTime - startTime).toBeGreaterThan(30); // At least 40ms for all iterations
    expect(result).toBeDefined();
    expect(result.parse.iterations).toBe(20);
    expect(result.compile.iterations).toBe(20);
  });

  describe('BenchmarkUtils', () => {
    it('should be available as a global object', () => {
      expect(BenchmarkUtils).toBeDefined();
      expect(typeof BenchmarkUtils).toBe('object');
    });

    it('should have measureOperationAsync method', () => {
      expect(BenchmarkUtils.measureOperationAsync).toBeDefined();
      expect(typeof BenchmarkUtils.measureOperationAsync).toBe('function');
    });

    it('should measure async operations correctly', async () => {
      const mockFn = vi.fn().mockResolvedValue('result');

      const result = await BenchmarkUtils.measureOperationAsync(mockFn, 5);

      expect(mockFn).toHaveBeenCalledTimes(5);
      expect(result).toHaveProperty('avg');
      expect(result).toHaveProperty('min');
      expect(result).toHaveProperty('max');
      expect(result).toHaveProperty('p95');
      expect(result).toHaveProperty('iterations', 5);

      expect(typeof result.avg).toBe('number');
      expect(result.avg).toBeGreaterThanOrEqual(0);
    });
  });
});
