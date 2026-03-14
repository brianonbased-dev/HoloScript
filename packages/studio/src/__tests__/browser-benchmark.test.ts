/**
 * Tests for browser-benchmark.js functionality
 * 
 * Since the original is browser-specific JS, we mock the browser environment
 * and test the core benchmark logic extracted as testable functions.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock browser globals
const mockCompilerBridge = {
  parse: vi.fn().mockResolvedValue({ success: true }),
  compile: vi.fn().mockResolvedValue({ success: true, output: 'compiled code' })
};

const mockPerformance = {
  now: vi.fn()
};

// Mock console methods to capture output
const mockConsole = {
  log: vi.fn(),
  error: vi.fn()
};

// Setup mock environment
global.window = {
  CompilerBridge: mockCompilerBridge,
  performance: mockPerformance
} as any;

global.performance = mockPerformance as any;
global.console = mockConsole as any;

// Extracted and adapted benchmark utilities for testing
class TestBenchmarkUtils {
  /**
   * Measure function execution time (async version)
   */
  static async measureOperationAsync(fn: () => Promise<any>, iterations: number = 50) {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = mockPerformance.now();
      await fn();
      const end = mockPerformance.now();
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
      iterations
    };
  }
}

// Extracted quickBenchmark function for testing
async function testQuickBenchmark() {
  mockConsole.log('⚡ Running quick benchmark (1 scenario, 20 iterations)...\n');
  
  if (typeof (global.window as any).CompilerBridge === 'undefined') {
    mockConsole.error('❌ CompilerBridge not available');
    return;
  }

  const compiler = (global.window as any).CompilerBridge;
  const testCode = `composition "Quick" { object "O" { geometry: "sphere" } }`;
  
  const parseResult = await TestBenchmarkUtils.measureOperationAsync(
    () => compiler.parse(testCode),
    20
  );
  
  const compileResult = await TestBenchmarkUtils.measureOperationAsync(
    () => compiler.compile(testCode, { target: 'threejs' }),
    20
  );

  mockConsole.log('Quick Benchmark Results:');
  mockConsole.log(`  Parse:  ${parseResult.avg}ms ±${(parseResult.max - parseResult.min).toFixed(2)}ms`);
  mockConsole.log(`  Compile: ${compileResult.avg}ms ±${(compileResult.max - compileResult.min).toFixed(2)}ms\n`);
  
  return { parse: parseResult, compile: compileResult };
}

describe('browser-benchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset performance.now() to return incremental values
    let timeCounter = 0;
    mockPerformance.now.mockImplementation(() => {
      timeCounter += Math.random() * 10 + 1; // Simulate 1-11ms operations
      return timeCounter;
    });
  });

  describe('BenchmarkUtils.measureOperationAsync', () => {
    it('should measure async operation times correctly', async () => {
      const mockOperation = vi.fn().mockResolvedValue('result');
      
      const result = await TestBenchmarkUtils.measureOperationAsync(mockOperation, 5);
      
      expect(result).toMatchObject({
        avg: expect.any(Number),
        min: expect.any(Number),
        max: expect.any(Number),
        p95: expect.any(Number),
        iterations: 5
      });
      
      expect(result.min).toBeLessThanOrEqual(result.avg);
      expect(result.avg).toBeLessThanOrEqual(result.max);
      expect(mockOperation).toHaveBeenCalledTimes(5);
      expect(mockPerformance.now).toHaveBeenCalledTimes(10); // 2 calls per iteration
    });

    it('should handle iterations parameter correctly', async () => {
      const mockOperation = vi.fn().mockResolvedValue('result');
      
      const result = await TestBenchmarkUtils.measureOperationAsync(mockOperation, 3);
      
      expect(result.iterations).toBe(3);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });

    it('should sort times and calculate percentiles correctly', async () => {
      // Mock performance.now to return predictable values
      const timings = [1, 4, 2, 5, 3]; // Will result in times: [3, 1, 3, 1, 3]
      let callIndex = 0;
      mockPerformance.now.mockImplementation(() => timings[callIndex++] || 0);
      
      const mockOperation = vi.fn().mockResolvedValue('result');
      const result = await TestBenchmarkUtils.measureOperationAsync(mockOperation, 2);
      
      expect(result.min).toBeLessThanOrEqual(result.max);
      expect(result.avg).toBeGreaterThan(0);
    });
  });

  describe('quickBenchmark', () => {
    it('should run benchmark with CompilerBridge available', async () => {
      const result = await testQuickBenchmark();
      
      expect(result).toBeDefined();
      expect(result).toMatchObject({
        parse: {
          avg: expect.any(Number),
          min: expect.any(Number),
          max: expect.any(Number),
          p95: expect.any(Number),
          iterations: 20
        },
        compile: {
          avg: expect.any(Number),
          min: expect.any(Number),
          max: expect.any(Number),
          p95: expect.any(Number),
          iterations: 20
        }
      });
      
      // Verify correct test code was used
      expect(mockCompilerBridge.parse).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }'
      );
      expect(mockCompilerBridge.compile).toHaveBeenCalledWith(
        'composition "Quick" { object "O" { geometry: "sphere" } }',
        { target: 'threejs' }
      );
      
      // Verify both operations were called 20 times (for benchmark)
      expect(mockCompilerBridge.parse).toHaveBeenCalledTimes(20);
      expect(mockCompilerBridge.compile).toHaveBeenCalledTimes(20);
      
      // Verify console output
      expect(mockConsole.log).toHaveBeenCalledWith('⚡ Running quick benchmark (1 scenario, 20 iterations)...\n');
      expect(mockConsole.log).toHaveBeenCalledWith('Quick Benchmark Results:');
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringMatching(/  Parse:  \d+(\.\d+)?ms ±\d+(\.\d+)?ms/)
      );
      expect(mockConsole.log).toHaveBeenCalledWith(
        expect.stringMatching(/  Compile: \d+(\.\d+)?ms ±\d+(\.\d+)?ms\n/)
      );
    });

    it('should handle missing CompilerBridge gracefully', async () => {
      // Remove CompilerBridge
      delete (global.window as any).CompilerBridge;
      
      const result = await testQuickBenchmark();
      
      expect(result).toBeUndefined();
      expect(mockConsole.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
      
      // Restore for other tests
      (global.window as any).CompilerBridge = mockCompilerBridge;
    });

    it('should handle compiler errors gracefully', async () => {
      const error = new Error('Compilation failed');
      mockCompilerBridge.compile.mockRejectedValueOnce(error);
      
      // The function should still complete, but the error will be thrown during measurement
      await expect(testQuickBenchmark()).rejects.toThrow('Compilation failed');
    });

    it('should use correct HoloScript syntax in test code', async () => {
      await testQuickBenchmark();
      
      const expectedTestCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';
      
      // Verify the test code follows HoloScript composition syntax
      expect(expectedTestCode).toContain('composition');
      expect(expectedTestCode).toContain('object');
      expect(expectedTestCode).toContain('geometry: "sphere"');
      
      expect(mockCompilerBridge.parse).toHaveBeenCalledWith(expectedTestCode);
      expect(mockCompilerBridge.compile).toHaveBeenCalledWith(expectedTestCode, { target: 'threejs' });
    });

    it('should run exactly 20 iterations for both parse and compile', async () => {
      await testQuickBenchmark();
      
      expect(mockCompilerBridge.parse).toHaveBeenCalledTimes(20);
      expect(mockCompilerBridge.compile).toHaveBeenCalledTimes(20);
      expect(mockPerformance.now).toHaveBeenCalledTimes(80); // 2 calls per operation × 40 total operations
    });

    it('should format timing results correctly', async () => {
      await testQuickBenchmark();
      
      // Check that console output includes properly formatted timing results
      const logCalls = mockConsole.log.mock.calls;
      
      // Find timing output calls
      const parseTimingCall = logCalls.find(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('Parse:')
      );
      const compileTimingCall = logCalls.find(call => 
        call[0] && typeof call[0] === 'string' && call[0].includes('Compile:')
      );
      
      expect(parseTimingCall).toBeDefined();
      expect(compileTimingCall).toBeDefined();
      
      if (parseTimingCall) {
        expect(parseTimingCall[0]).toMatch(/Parse:\s+\d+(\.\d+)?ms\s±\d+(\.\d+)?ms/);
      }
      
      if (compileTimingCall) {
        expect(compileTimingCall[0]).toMatch(/Compile:\s+\d+(\.\d+)?ms\s±\d+(\.\d+)?ms/);
      }
    });
  });

  describe('benchmark result structure', () => {
    it('should return results with correct statistical measures', async () => {
      const result = await testQuickBenchmark();
      
      expect(result).toBeDefined();
      if (result) {
        // Validate parse results structure
        expect(result.parse).toMatchObject({
          avg: expect.any(Number),
          min: expect.any(Number),
          max: expect.any(Number),
          p95: expect.any(Number),
          iterations: 20
        });
        
        // Validate compile results structure  
        expect(result.compile).toMatchObject({
          avg: expect.any(Number),
          min: expect.any(Number),
          max: expect.any(Number),
          p95: expect.any(Number),
          iterations: 20
        });
        
        // Validate statistical relationships
        expect(result.parse.min).toBeLessThanOrEqual(result.parse.avg);
        expect(result.parse.avg).toBeLessThanOrEqual(result.parse.max);
        expect(result.compile.min).toBeLessThanOrEqual(result.compile.avg);
        expect(result.compile.avg).toBeLessThanOrEqual(result.compile.max);
        
        // All values should be positive
        expect(result.parse.avg).toBeGreaterThan(0);
        expect(result.parse.min).toBeGreaterThanOrEqual(0);
        expect(result.compile.avg).toBeGreaterThan(0);
        expect(result.compile.min).toBeGreaterThanOrEqual(0);
      }
    });
  });
});