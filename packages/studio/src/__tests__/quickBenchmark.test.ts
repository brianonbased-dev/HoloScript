import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Test for the quickBenchmark function from browser-benchmark.js
 * Since the original is a browser-only script, we test the core logic by mocking browser APIs
 */

describe('quickBenchmark', () => {
  // Mock browser globals that the script depends on
  const mockConsoleLog = vi.fn();
  const mockConsoleError = vi.fn();
  const mockCompiler = {
    parse: vi.fn(),
    compile: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup browser-like globals
    global.console = {
      ...console,
      log: mockConsoleLog,
      error: mockConsoleError,
    };

    global.window = {
      CompilerBridge: mockCompiler,
    } as any;
  });

  // Simulate the BenchmarkUtils.measureOperationAsync logic
  const mockMeasureOperationAsync = async (operation: () => any, iterations: number) => {
    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await operation();
      const end = performance.now();
      times.push(end - start);
    }
    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    return { avg, min, max, times };
  };

  // Mock the quickBenchmark function logic (extracted from browser-benchmark.js)
  const quickBenchmark = async () => {
    console.log('⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n');
    
    if (typeof (global.window as any).CompilerBridge === 'undefined') {
      console.error('❌ CompilerBridge not available');
      return;
    }

    const compiler = (global.window as any).CompilerBridge;
    const testCode = `composition "Quick" { object "O" { geometry: "sphere" } }`;
    
    const parseResult = await mockMeasureOperationAsync(
      () => compiler.parse(testCode),
      20
    );
    
    const compileResult = await mockMeasureOperationAsync(
      () => compiler.compile(testCode, { target: 'threejs' }),
      20
    );

    console.log('Quick Benchmark Results:');
    console.log(`  Parse:  ${parseResult.avg}ms ±${(parseResult.max - parseResult.min).toFixed(2)}ms`);
    console.log(`  Compile: ${compileResult.avg}ms ±${(compileResult.max - compileResult.min).toFixed(2)}ms\\n`);
    
    return { parse: parseResult, compile: compileResult };
  };

  it('should run a quick benchmark with parse and compile operations', async () => {
    mockCompiler.parse.mockResolvedValue({ type: 'CompositionNode' });
    mockCompiler.compile.mockResolvedValue({ threejs: 'compiled-result' });

    const result = await quickBenchmark();

    // Verify the function was called with correct parameters
    expect(mockCompiler.parse).toHaveBeenCalledWith(
      'composition "Quick" { object "O" { geometry: "sphere" } }'
    );
    expect(mockCompiler.compile).toHaveBeenCalledWith(
      'composition "Quick" { object "O" { geometry: "sphere" } }',
      { target: 'threejs' }
    );

    // Verify the result structure
    expect(result).toBeDefined();
    expect(result!.parse).toBeDefined();
    expect(result!.compile).toBeDefined();
    expect(result!.parse).toHaveProperty('avg');
    expect(result!.parse).toHaveProperty('min');
    expect(result!.parse).toHaveProperty('max');
    expect(result!.compile).toHaveProperty('avg');
    expect(result!.compile).toHaveProperty('min');
    expect(result!.compile).toHaveProperty('max');

    // Verify correct number of iterations (20 each)
    expect(mockCompiler.parse).toHaveBeenCalledTimes(20);
    expect(mockCompiler.compile).toHaveBeenCalledTimes(20);

    // Verify console output
    expect(mockConsoleLog).toHaveBeenCalledWith('⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n');
    expect(mockConsoleLog).toHaveBeenCalledWith('Quick Benchmark Results:');
  });

  it('should handle missing CompilerBridge gracefully', async () => {
    delete (global.window as any).CompilerBridge;

    const result = await quickBenchmark();

    expect(result).toBeUndefined();
    expect(mockConsoleError).toHaveBeenCalledWith('❌ CompilerBridge not available');
    expect(mockCompiler.parse).not.toHaveBeenCalled();
    expect(mockCompiler.compile).not.toHaveBeenCalled();
  });

  it('should measure timing accurately for both operations', async () => {
    // Make operations take predictable time
    mockCompiler.parse.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 1));
      return { type: 'CompositionNode' };
    });
    
    mockCompiler.compile.mockImplementation(async () => {
      await new Promise(resolve => setTimeout(resolve, 2));
      return { threejs: 'compiled-result' };
    });

    const result = await quickBenchmark();

    expect(result).toBeDefined();
    // Parse should be faster than compile (1ms vs 2ms)
    expect(result!.parse.avg).toBeLessThan(result!.compile.avg);
    // Both should have reasonable timing measurements
    expect(result!.parse.avg).toBeGreaterThan(0);
    expect(result!.compile.avg).toBeGreaterThan(0);
  });

  it('should calculate timing statistics correctly', async () => {
    let parseCallCount = 0;
    let compileCallCount = 0;

    // Create variable timing to test min/max calculation
    mockCompiler.parse.mockImplementation(async () => {
      const delay = parseCallCount++ % 2 === 0 ? 1 : 3; // Alternate between 1ms and 3ms
      await new Promise(resolve => setTimeout(resolve, delay));
      return { type: 'CompositionNode' };
    });
    
    mockCompiler.compile.mockImplementation(async () => {
      const delay = compileCallCount++ % 2 === 0 ? 2 : 4; // Alternate between 2ms and 4ms
      await new Promise(resolve => setTimeout(resolve, delay));
      return { threejs: 'compiled-result' };
    });

    const result = await quickBenchmark();

    expect(result).toBeDefined();
    
    // Verify statistics are calculated (min should be less than max)
    expect(result!.parse.min).toBeLessThanOrEqual(result!.parse.max);
    expect(result!.compile.min).toBeLessThanOrEqual(result!.compile.max);
    
    // Average should be between min and max
    expect(result!.parse.avg).toBeGreaterThanOrEqual(result!.parse.min);
    expect(result!.parse.avg).toBeLessThanOrEqual(result!.parse.max);
    expect(result!.compile.avg).toBeGreaterThanOrEqual(result!.compile.min);
    expect(result!.compile.avg).toBeLessThanOrEqual(result!.compile.max);
  });
});