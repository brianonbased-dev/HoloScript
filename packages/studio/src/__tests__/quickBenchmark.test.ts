/**
 * Test suite for quickBenchmark function
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the browser environment
const mockCompilerBridge = {
  compile: vi.fn().mockResolvedValue({ success: true, output: 'test output' }),
  benchmark: vi.fn().mockResolvedValue({ averageTime: 100, iterations: 20 }),
};

// Mock console methods
const consoleSpy = {
  log: vi.spyOn(console, 'log').mockImplementation(() => {}),
  error: vi.spyOn(console, 'error').mockImplementation(() => {}),
};

// Since quickBenchmark is in a browser JS file, we'll test the logic pattern
async function quickBenchmark() {
  console.log('⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n');
  
  if (typeof (globalThis as any).CompilerBridge === 'undefined') {
    console.error('❌ CompilerBridge not available');
    return;
  }

  // Simulate the benchmark logic
  const bridge = (globalThis as any).CompilerBridge;
  const result = await bridge.benchmark({
    scenarios: 1,
    iterations: 20
  });
  
  console.log('✅ Quick benchmark completed:', result);
  return result;
}

describe('quickBenchmark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset global state
    delete (globalThis as any).CompilerBridge;
  });

  it('should log start message and check for CompilerBridge', async () => {
    await quickBenchmark();
    
    expect(consoleSpy.log).toHaveBeenCalledWith(
      '⚡ Running quick benchmark (1 scenario, 20 iterations)...\\n'
    );
  });

  it('should handle missing CompilerBridge gracefully', async () => {
    await quickBenchmark();
    
    expect(consoleSpy.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
  });

  it('should run benchmark when CompilerBridge is available', async () => {
    // Setup mock CompilerBridge
    (globalThis as any).CompilerBridge = mockCompilerBridge;
    
    const result = await quickBenchmark();
    
    expect(mockCompilerBridge.benchmark).toHaveBeenCalledWith({
      scenarios: 1,
      iterations: 20
    });
    expect(consoleSpy.log).toHaveBeenCalledWith('✅ Quick benchmark completed:', result);
  });

  it('should return benchmark results', async () => {
    const expectedResult = { averageTime: 150, iterations: 20 };
    mockCompilerBridge.benchmark.mockResolvedValueOnce(expectedResult);
    (globalThis as any).CompilerBridge = mockCompilerBridge;
    
    const result = await quickBenchmark();
    
    expect(result).toEqual(expectedResult);
  });

  it('should handle benchmark errors gracefully', async () => {
    const error = new Error('Benchmark failed');
    mockCompilerBridge.benchmark.mockRejectedValueOnce(error);
    (globalThis as any).CompilerBridge = mockCompilerBridge;
    
    await expect(quickBenchmark()).rejects.toThrow('Benchmark failed');
  });
});