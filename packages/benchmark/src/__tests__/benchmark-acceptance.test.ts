/**
 * @holoscript/benchmark acceptance tests
 * Covers: calculateMetrics(), compareMetrics(), formatMetrics() from analysis/metrics.ts
 *         BenchmarkResult / SuiteResults / AllResults shapes from reporter.ts
 *         generateReport() HTML output
 */
import { describe, it, expect } from 'vitest';
import {
  calculateMetrics,
  compareMetrics,
  formatMetrics,
  type BenchmarkMetrics,
  type PerformanceRegression,
} from '../analysis/metrics';
import {
  generateReport,
  type BenchmarkResult,
  type SuiteResults,
  type AllResults,
} from '../reporter';

// â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function makeMetrics(hz: number, name = 'test'): BenchmarkMetrics {
  return {
    name,
    hz,
    period: hz > 0 ? 1000 / hz : 0,
    samples: 100,
    min: 0,
    max: 0,
    mean: hz > 0 ? 1000 / hz : 0,
    median: 0,
    stdDev: 0,
  };
}

function makeResult(name: string, opsPerSecond = 1000): BenchmarkResult {
  return { name, opsPerSecond, meanMs: 1000 / opsPerSecond, samples: 100, marginOfError: 1.5 };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// calculateMetrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('calculateMetrics', () => {
  it('is a function', () => {
    expect(typeof calculateMetrics).toBe('function');
  });

  it('returns a BenchmarkMetrics object', () => {
    const m = calculateMetrics({ result: { hz: 1000, mean: 0.001 } });
    expect(m).toHaveProperty('hz');
    expect(m).toHaveProperty('period');
    expect(m).toHaveProperty('mean');
    expect(m).toHaveProperty('samples');
  });

  it('calculates hz from task result', () => {
    const m = calculateMetrics({ result: { hz: 2000 } });
    expect(m.hz).toBe(2000);
  });

  it('calculates period as 1000/hz', () => {
    const m = calculateMetrics({ result: { hz: 500 } });
    expect(m.period).toBe(2); // 1000/500 = 2ms
  });

  it('period is 0 when hz is 0', () => {
    const m = calculateMetrics({ result: { hz: 0 } });
    expect(m.period).toBe(0);
  });

  it('handles missing result gracefully', () => {
    const m = calculateMetrics({});
    expect(m.hz).toBe(0);
    expect(m.mean).toBe(0);
    expect(m.period).toBe(0);
  });

  it('captures mean from result', () => {
    const m = calculateMetrics({ result: { hz: 1000, mean: 0.001 } });
    expect(m.mean).toBe(0.001);
  });

  it('name defaults to empty string', () => {
    const m = calculateMetrics({ result: { hz: 500 } });
    expect(m.name).toBe('');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// compareMetrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('compareMetrics', () => {
  it('is a function', () => {
    expect(typeof compareMetrics).toBe('function');
  });

  it('returns a PerformanceRegression object', () => {
    const result = compareMetrics(makeMetrics(1000), makeMetrics(1000));
    expect(result).toHaveProperty('metric');
    expect(result).toHaveProperty('baseline');
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('percentChange');
    expect(result).toHaveProperty('isRegression');
  });

  it('isRegression is false when performance is equal', () => {
    const { isRegression } = compareMetrics(makeMetrics(1000), makeMetrics(1000));
    expect(isRegression).toBe(false);
  });

  it('isRegression is false when performance improves', () => {
    const { isRegression } = compareMetrics(makeMetrics(1000), makeMetrics(1500));
    expect(isRegression).toBe(false);
  });

  it('isRegression is true when performance drops >5% (default threshold)', () => {
    const baseline = makeMetrics(1000);
    const current = makeMetrics(900); // 10% drop
    const { isRegression } = compareMetrics(baseline, current);
    expect(isRegression).toBe(true);
  });

  it('isRegression is false when drop is within threshold', () => {
    const baseline = makeMetrics(1000);
    const current = makeMetrics(970); // 3% drop, within 5% threshold
    const { isRegression } = compareMetrics(baseline, current);
    expect(isRegression).toBe(false);
  });

  it('respects custom threshold', () => {
    const baseline = makeMetrics(1000);
    const current = makeMetrics(920); // 8% drop
    expect(compareMetrics(baseline, current, 10).isRegression).toBe(false);
    expect(compareMetrics(baseline, current, 5).isRegression).toBe(true);
  });

  it('percentChange is positive when current > baseline', () => {
    const { percentChange } = compareMetrics(makeMetrics(1000), makeMetrics(1100));
    expect(percentChange).toBeCloseTo(10, 1);
  });

  it('percentChange is negative on regression', () => {
    const { percentChange } = compareMetrics(makeMetrics(1000), makeMetrics(800));
    expect(percentChange).toBeCloseTo(-20, 1);
  });

  it('baseline and current fields are the hz values', () => {
    const result = compareMetrics(makeMetrics(500, 'a'), makeMetrics(600, 'b'));
    expect(result.baseline).toBe(500);
    expect(result.current).toBe(600);
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// formatMetrics
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('formatMetrics', () => {
  it('is a function', () => {
    expect(typeof formatMetrics).toBe('function');
  });

  it('returns a string', () => {
    const s = formatMetrics(makeMetrics(1000, 'myBench'));
    expect(typeof s).toBe('string');
    expect(s.length).toBeGreaterThan(0);
  });

  it('includes the name', () => {
    const s = formatMetrics(makeMetrics(1000, 'ParserBench'));
    expect(s).toContain('ParserBench');
  });

  it('includes the hz value', () => {
    const s = formatMetrics(makeMetrics(1234));
    expect(s).toContain('1234');
  });

  it('includes the period (time/op)', () => {
    const s = formatMetrics(makeMetrics(1000));
    expect(s).toContain('1.000');
  });
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// generateReport (reporter.ts)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
describe('generateReport', () => {
  const allResults: AllResults = {
    version: '3.0.0',
    timestamp: '2026-02-18T00:00:00Z',
    suites: [
      {
        suite: 'Parser',
        timestamp: '2026-02-18T00:00:00Z',
        results: [makeResult('parse-simple', 50000), makeResult('parse-complex', 20000)],
      },
    ],
  };

  it('is a function', () => {
    expect(typeof generateReport).toBe('function');
  });

  it('returns a string', () => {
    const html = generateReport(allResults);
    expect(typeof html).toBe('string');
  });

  it('output contains <!DOCTYPE html>', () => {
    const html = generateReport(allResults);
    expect(html.toLowerCase()).toContain('<!doctype html>');
  });

  it('output contains suite name', () => {
    const html = generateReport(allResults);
    expect(html).toContain('Parser');
  });

  it('output contains benchmark result name', () => {
    const html = generateReport(allResults);
    expect(html).toContain('parse-simple');
  });

  it('output contains version', () => {
    const html = generateReport(allResults);
    expect(html).toContain('3.0.0');
  });

  it('works with multiple suites', () => {
    const multi: AllResults = {
      version: '1.0.0',
      timestamp: '2026-01-01T00:00:00Z',
      suites: [
        { suite: 'A', timestamp: '', results: [makeResult('a', 100)] },
        { suite: 'B', timestamp: '', results: [makeResult('b', 200)] },
      ],
    };
    const html = generateReport(multi);
    expect(html).toContain('Suite A');
    expect(html).toContain('Suite B');
  });

  it('works with empty suites', () => {
    const empty: AllResults = { version: '1.0.0', timestamp: '', suites: [] };
    const html = generateReport(empty);
    expect(typeof html).toBe('string');
  });
});
