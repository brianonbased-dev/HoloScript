import { readFileSync } from 'fs';
import { join } from 'path';

// Mock browser globals
const mockConsole = {
  log: vi.fn(),
  error: vi.fn()
};

const mockPerformance = {
  now: vi.fn()
};

// Mock CompilerBridge
const mockCompilerBridge = {
  parse: vi.fn(),
  compile: vi.fn()
};

// Setup browser environment
const setupBrowserMocks = () => {
  global.window = {
    CompilerBridge: mockCompilerBridge,
    runBenchmark: undefined,
    quickBenchmark: undefined,
    BenchmarkUtils: undefined
  } as any;
  global.console = mockConsole as any;
  global.performance = mockPerformance as any;
};

// Load and execute the browser benchmark script
const loadBenchmarkScript = () => {
  const scriptPath = join(__dirname, '../public/browser-benchmark.js');
  const scriptContent = readFileSync(scriptPath, 'utf8');
  
  // Execute the script in our mocked environment
  const scriptFunction = new Function(scriptContent);
  scriptFunction();
  
  return (global.window as any).quickBenchmark;
};

describe('quickBenchmark', () => {
  let originalConsole: any;
  let originalPerformance: any;
  let quickBenchmark: any;

  beforeEach(() => {
    // Store originals
    originalConsole = global.console;
    originalPerformance = global.performance;
    
    // Setup mocks
    vi.clearAllMocks();
    setupBrowserMocks();
    
    // Mock performance.now() to return incrementing values
    let time = 0;
    mockPerformance.now.mockImplementation(() => {
      time += Math.random() * 5; // Random execution time 0-5ms
      return time;
    });
    
    // Load the script
    quickBenchmark = loadBenchmarkScript();
  });

  afterEach(() => {
    // Restore originals
    global.console = originalConsole;
    global.performance = originalPerformance;
    delete (global as any).window;
    vi.restoreAllMocks();
  });

  it('should be defined after script load', () => {
    expect(quickBenchmark).toBeDefined();
    expect(typeof quickBenchmark).toBe('function');
  });

  it('should log startup message and return early when CompilerBridge is undefined', async () => {
    // Remove CompilerBridge
    (global.window as any).CompilerBridge = undefined;
    
    const result = await quickBenchmark();
    
    expect(mockConsole.log).toHaveBeenCalledWith('⚡ Running quick benchmark (1 scenario, 20 iterations)...\n');
    expect(mockConsole.error).toHaveBeenCalledWith('❌ CompilerBridge not available');
    expect(result).toBeUndefined();
  });

  it('should execute parse and compile benchmarks when CompilerBridge is available', async () => {
    // Mock successful compiler operations
    mockCompilerBridge.parse.mockResolvedValue({ success: true });
    mockCompilerBridge.compile.mockResolvedValue({ success: true });
    
    const result = await quickBenchmark();
    
    // Should log startup message
    expect(mockConsole.log).toHaveBeenCalledWith('⚡ Running quick benchmark (1 scenario, 20 iterations)...\n');
    
    // Should call parse 20 times
    expect(mockCompilerBridge.parse).toHaveBeenCalledTimes(20);
    expect(mockCompilerBridge.parse).toHaveBeenCalledWith('composition "Quick" { object "O" { geometry: "sphere" } }');
    
    // Should call compile 20 times
    expect(mockCompilerBridge.compile).toHaveBeenCalledTimes(20);
    expect(mockCompilerBridge.compile).toHaveBeenCalledWith(
      'composition "Quick" { object "O" { geometry: "sphere" } }',
      { target: 'threejs' }
    );
    
    // Should log results
    expect(mockConsole.log).toHaveBeenCalledWith('Quick Benchmark Results:');
    
    // Should return benchmark results
    expect(result).toEqual({
      parse: expect.objectContaining({
        avg: expect.any(Number),
        min: expect.any(Number),
        max: expect.any(Number),
        p95: expect.any(Number),
        iterations: 20
      }),
      compile: expect.objectContaining({
        avg: expect.any(Number),
        min: expect.any(Number),
        max: expect.any(Number),
        p95: expect.any(Number),
        iterations: 20
      })
    });
  });

  it('should handle compiler errors gracefully', async () => {
    // Mock compiler to throw errors
    mockCompilerBridge.parse.mockRejectedValue(new Error('Parse failed'));
    mockCompilerBridge.compile.mockRejectedValue(new Error('Compile failed'));
    
    // Should not throw, but may return undefined or error results
    await expect(quickBenchmark()).resolves.not.toThrow();
  });

  it('should use correct test code and compilation target', async () => {
    mockCompilerBridge.parse.mockResolvedValue({ success: true });
    mockCompilerBridge.compile.mockResolvedValue({ success: true });
    
    await quickBenchmark();
    
    const expectedTestCode = 'composition "Quick" { object "O" { geometry: "sphere" } }';
    
    expect(mockCompilerBridge.parse).toHaveBeenCalledWith(expectedTestCode);
    expect(mockCompilerBridge.compile).toHaveBeenCalledWith(expectedTestCode, { target: 'threejs' });
  });

  it('should perform exactly 20 iterations for both operations', async () => {
    mockCompilerBridge.parse.mockResolvedValue({ success: true });
    mockCompilerBridge.compile.mockResolvedValue({ success: true });
    
    const result = await quickBenchmark();
    
    expect(mockCompilerBridge.parse).toHaveBeenCalledTimes(20);
    expect(mockCompilerBridge.compile).toHaveBeenCalledTimes(20);
    
    expect(result.parse.iterations).toBe(20);
    expect(result.compile.iterations).toBe(20);
  });

  it('should log performance results in the expected format', async () => {
    mockCompilerBridge.parse.mockResolvedValue({ success: true });
    mockCompilerBridge.compile.mockResolvedValue({ success: true });
    
    await quickBenchmark();
    
    // Check that result logging calls were made
    const logCalls = mockConsole.log.mock.calls.map(call => call[0]);
    
    expect(logCalls).toContain('Quick Benchmark Results:');
    
    // Should log parse and compile results with timing info
    const parseLog = logCalls.find((log: string) => log.includes('Parse:') && log.includes('ms'));
    const compileLog = logCalls.find((log: string) => log.includes('Compile:') && log.includes('ms'));
    
    expect(parseLog).toBeDefined();
    expect(compileLog).toBeDefined();
  });
});

describe('BenchmarkUtils', () => {
  beforeEach(() => {
    setupBrowserMocks();
    loadBenchmarkScript();
  });

  afterEach(() => {
    delete (global as any).window;
    vi.restoreAllMocks();
  });

  it('should be exposed on window object', () => {
    expect((global.window as any).BenchmarkUtils).toBeDefined();
    expect((global.window as any).BenchmarkUtils.measureOperationAsync).toBeDefined();
    expect((global.window as any).BenchmarkUtils.measureOperation).toBeDefined();
  });

  it('measureOperationAsync should return correct statistics', async () => {
    let callCount = 0;
    mockPerformance.now.mockImplementation(() => {
      // Return predictable timing: 0, 10, 20, 30, etc.
      return callCount++ * 10;
    });

    const testFn = vi.fn().mockResolvedValue('test');
    const result = await (global.window as any).BenchmarkUtils.measureOperationAsync(testFn, 5);

    expect(testFn).toHaveBeenCalledTimes(5);
    expect(result).toEqual({
      avg: 10,
      min: 10,
      max: 10,
      p95: 10,
      iterations: 5
    });
  });
});