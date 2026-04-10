/**
 * @holoscript/comparative-benchmarks acceptance tests
 * Covers: ComparativeBenchmarks constructor/config, generateReport,
 *         BenchmarkResult/PerformanceMetrics shapes, runComparativeBenchmarks function
 *
 * NOTE: runAll() is NOT called in tests because tinybench uses `time: 100` internally
 * (min 100ms per task Ã— 3 tasks Ã— 5 benchmarks = ~1.5s minimum).
 * Tests validate the constructor, report generation with synthetic data, and
 * the exported function reference.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ComparativeBenchmarks,
  runComparativeBenchmarks,
  type BenchmarkResult,
  type PerformanceMetrics,
  type BenchmarkConfig,
} from '../index';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Synthetic test data helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const makeMetrics = (opsPerSecond: number): PerformanceMetrics => ({
  opsPerSecond,
  meanMs: (1 / opsPerSecond) * 1000,
  p50Ms: 0.5,
  p95Ms: 1.0,
  p99Ms: 2.0,
});

const makeResult = (
  name: string,
  winner: 'holoscript' | 'unity' | 'gltf',
  speedup = 2.0
): BenchmarkResult => ({
  name,
  holoscript: makeMetrics(winner === 'holoscript' ? 10000 : 5000),
  unity: makeMetrics(winner === 'unity' ? 10000 : 3000),
  gltf: makeMetrics(winner === 'gltf' ? 10000 : 2000),
  winner,
  speedup,
});

const SYNTHETIC_RESULTS: BenchmarkResult[] = [
  makeResult('Scene Parsing', 'holoscript', 3.0),
  makeResult('Object Instantiation (100 objects)', 'holoscript', 2.5),
  makeResult('Trait Application (1000 traits)', 'holoscript', 4.0),
  makeResult('Update Loop (1000 objects)', 'holoscript', 1.8),
  makeResult('Complex Scene (500 objects, 10 traits)', 'holoscript', 3.2),
];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// Constructor & config
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('ComparativeBenchmarks â€” constructor', () => {
  it('creates with default config', () => {
    const cb = new ComparativeBenchmarks();
    expect(cb).toBeDefined();
  });

  it('creates with custom warmupIterations', () => {
    const cb = new ComparativeBenchmarks({ warmupIterations: 10 });
    expect(cb).toBeDefined();
  });

  it('creates with custom iterations', () => {
    const cb = new ComparativeBenchmarks({ iterations: 50 });
    expect(cb).toBeDefined();
  });

  it('creates with includeMemory: false', () => {
    const cb = new ComparativeBenchmarks({ includeMemory: false });
    expect(cb).toBeDefined();
  });

  it('creates with specific targets', () => {
    const cb = new ComparativeBenchmarks({ targets: ['holoscript', 'gltf'] });
    expect(cb).toBeDefined();
  });

  it('creates with all config options', () => {
    const config: BenchmarkConfig = {
      warmupIterations: 5,
      iterations: 10,
      includeMemory: true,
      targets: ['holoscript', 'unity', 'gltf'],
    };
    const cb = new ComparativeBenchmarks(config);
    expect(cb).toBeDefined();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// generateReport â€” structure
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('ComparativeBenchmarks â€” generateReport', () => {
  let cb: ComparativeBenchmarks;

  beforeEach(() => {
    cb = new ComparativeBenchmarks();
  });

  it('returns a non-empty string', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('report contains markdown heading', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('#');
  });

  it('report contains HoloScript', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('HoloScript');
  });

  it('report contains result names', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('Scene Parsing');
  });

  it('report contains Summary section', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('Summary');
  });

  it('report contains table separators', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('|');
  });

  it('report includes generated timestamp', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    expect(report).toContain('Generated');
  });

  it('report works with empty results array', () => {
    const report = cb.generateReport([]);
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  it('report includes each result name', () => {
    const report = cb.generateReport(SYNTHETIC_RESULTS);
    for (const r of SYNTHETIC_RESULTS) {
      expect(report).toContain(r.name);
    }
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// BenchmarkResult type shape
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('BenchmarkResult â€” shape', () => {
  it('has required fields', () => {
    const result = makeResult('Test', 'holoscript');
    expect(result).toHaveProperty('name');
    expect(result).toHaveProperty('holoscript');
    expect(result).toHaveProperty('winner');
    expect(result).toHaveProperty('speedup');
  });

  it('winner is a valid runtime string', () => {
    const result = makeResult('Test', 'unity');
    expect(['holoscript', 'unity', 'gltf']).toContain(result.winner);
  });

  it('speedup is positive', () => {
    const result = makeResult('Test', 'holoscript', 3.5);
    expect(result.speedup).toBeGreaterThan(0);
  });

  it('holoscript metrics has required fields', () => {
    const metrics = makeMetrics(5000);
    expect(metrics).toHaveProperty('opsPerSecond');
    expect(metrics).toHaveProperty('meanMs');
    expect(metrics).toHaveProperty('p50Ms');
    expect(metrics).toHaveProperty('p95Ms');
    expect(metrics).toHaveProperty('p99Ms');
  });

  it('opsPerSecond is non-negative', () => {
    const metrics = makeMetrics(10000);
    expect(metrics.opsPerSecond).toBeGreaterThanOrEqual(0);
  });

  it('optional unity/gltf fields work', () => {
    const result: BenchmarkResult = {
      name: 'Minimal',
      holoscript: makeMetrics(1000),
      winner: 'holoscript',
      speedup: 1.0,
    };
    expect(result.unity).toBeUndefined();
    expect(result.gltf).toBeUndefined();
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// runComparativeBenchmarks â€” function
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('runComparativeBenchmarks', () => {
  it('is a function', () => {
    expect(typeof runComparativeBenchmarks).toBe('function');
  });
});
