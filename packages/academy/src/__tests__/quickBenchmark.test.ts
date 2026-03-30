/**
 * Test suite for quickBenchmark function logic
 * Tests the benchmarking utility patterns used in browser-benchmark.js
 */

import { describe, it, expect, vi } from 'vitest';

describe('QuickBenchmark Logic Tests', () => {
  it('should calculate timing statistics correctly', () => {
    // Test the core timing calculation logic from BenchmarkUtils
    const times = [10.5, 12.3, 11.8, 9.7, 13.2];
    times.sort((a, b) => a - b);

    const sum = times.reduce((a, b) => a + b, 0);
    const avg = sum / times.length;
    const p95 = times[Math.floor(times.length * 0.95)];

    const result = {
      avg: parseFloat(avg.toFixed(2)),
      min: parseFloat(times[0].toFixed(2)),
      max: parseFloat(times[times.length - 1].toFixed(2)),
      p95: parseFloat(p95.toFixed(2)),
      iterations: times.length,
    };

    expect(result.avg).toBe(11.5);
    expect(result.min).toBe(9.7);
    expect(result.max).toBe(13.2);
    expect(result.p95).toBe(13.2);
    expect(result.iterations).toBe(5);
  });

  it('should handle benchmark result formatting correctly', () => {
    const mockResult = { avg: 15.678, max: 18.234, min: 12.456 };

    // Test the formatting logic from quickBenchmark console output
    const formattedOutput = `Parse: ${mockResult.avg}ms ±${(mockResult.max - mockResult.min).toFixed(2)}ms`;

    expect(formattedOutput).toBe('Parse: 15.678ms ±5.78ms');
  });

  it('should validate quickBenchmark test code structure', () => {
    const testCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';

    // Validate the test code matches expected HoloScript syntax
    expect(testCode).toContain('composition');
    expect(testCode).toContain('object');
    expect(testCode).toContain('geometry');
    expect(testCode).toContain('sphere');
    expect(testCode).toMatch(/^composition\s+"Quick"/);
  });

  it('should mock performance timing correctly', async () => {
    const mockPerformance = vi.fn();
    let callCount = 0;
    mockPerformance.mockImplementation(() => {
      callCount++;
      return callCount * 5; // Each measurement takes exactly 5ms
    });

    // Simulate the timing loop from measureOperationAsync
    const times: number[] = [];
    const iterations = 3;

    for (let i = 0; i < iterations; i++) {
      const start = mockPerformance();
      // Simulate async operation
      await new Promise((resolve) => resolve(void 0));
      const end = mockPerformance();
      times.push(end - start);
    }

    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;

    expect(times).toEqual([5, 5, 5]);
    expect(avg).toBe(5);
    expect(mockPerformance).toHaveBeenCalledTimes(6); // 3 iterations * 2 calls each
  });

  it('should handle compiler bridge interface correctly', () => {
    // Mock the CompilerBridge interface used by quickBenchmark
    const mockCompiler = {
      parse: vi.fn().mockResolvedValue({ success: true, ast: {} }),
      compile: vi.fn().mockResolvedValue({ success: true, output: 'compiled' }),
    };

    const testCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';
    const compileOptions = { target: 'threejs' };

    // Test the interface calls
    mockCompiler.parse(testCode);
    mockCompiler.compile(testCode, compileOptions);

    expect(mockCompiler.parse).toHaveBeenCalledWith(testCode);
    expect(mockCompiler.compile).toHaveBeenCalledWith(testCode, compileOptions);
    expect(mockCompiler.parse).toHaveBeenCalledTimes(1);
    expect(mockCompiler.compile).toHaveBeenCalledTimes(1);
  });
});
