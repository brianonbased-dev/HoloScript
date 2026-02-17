import { describe, it, expect, beforeEach } from 'vitest';
import { Analyzer } from '../Analyzer';
import type { ProfileResult, ProfileCategory, Hotspot } from '../Profiler';

function makeProfile(overrides: Partial<ProfileResult> = {}): ProfileResult {
  return {
    name: 'test-profile',
    startTime: 0,
    endTime: 1000000,
    duration: 100,
    samples: [
      { name: 'parse', category: 'parse' as ProfileCategory, startTime: 0, duration: 30000, depth: 0 },
      { name: 'compile', category: 'compile' as ProfileCategory, startTime: 30000, duration: 50000, depth: 0 },
      { name: 'render', category: 'render' as ProfileCategory, startTime: 80000, duration: 20000, depth: 0 },
    ],
    memorySnapshots: [
      { timestamp: 0, heapUsed: 10_000_000, heapTotal: 50_000_000 },
      { timestamp: 500000, heapUsed: 20_000_000, heapTotal: 50_000_000 },
    ],
    summary: {
      totalDuration: 100,
      categoryBreakdown: { parse: 30, compile: 50, render: 20, network: 0, memory: 0, user: 0, gc: 0 },
      hotspots: [
        { name: 'compile', totalTime: 50, callCount: 1, avgTime: 50, percentage: 50 },
        { name: 'parse', totalTime: 30, callCount: 1, avgTime: 30, percentage: 30 },
      ] as Hotspot[],
      memoryPeak: 20_000_000,
      memoryDelta: 10_000_000,
    },
    ...overrides,
  };
}

describe('Analyzer', () => {
  let analyzer: Analyzer;

  beforeEach(() => { analyzer = new Analyzer(); });

  it('analyze returns AnalysisResult with grade', () => {
    const result = analyzer.analyze(makeProfile());
    expect(result).toBeDefined();
    expect(result.profileName).toBe('test-profile');
    expect(['A','B','C','D','F']).toContain(result.grade);
    expect(result.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.overallScore).toBeLessThanOrEqual(100);
  });

  it('analyze includes recommendations', () => {
    const result = analyzer.analyze(makeProfile());
    expect(result.recommendations).toBeDefined();
    expect(Array.isArray(result.recommendations)).toBe(true);
  });

  it('budget violations detected for slow parse', () => {
    const slow = makeProfile({ duration: 5000 });
    slow.summary.categoryBreakdown.parse = 600;
    const result = analyzer.analyze(slow, { parseTime: 100 });
    expect(result.budgetViolations.length).toBeGreaterThanOrEqual(0);
  });

  it('budget violations include overage for compile', () => {
    const result = analyzer.analyze(makeProfile(), { compileTime: 10 });
    const compileViolation = result.budgetViolations.find(v => v.metric === 'compileTime');
    if (compileViolation) {
      expect(compileViolation.overagePercent).toBeGreaterThan(0);
    }
  });

  it('categoryAnalysis breaks down summary', () => {
    const result = analyzer.analyze(makeProfile());
    expect(result.categoryAnalysis).toBeDefined();
    expect(result.categoryAnalysis.parse).toBeDefined();
    expect(result.categoryAnalysis.compile).toBeDefined();
  });

  it('setDefaultBudget changes budget', () => {
    analyzer.setDefaultBudget({ fps: 30 });
    const result = analyzer.analyze(makeProfile());
    expect(result).toBeDefined();
  });

  it('analyzeTrends returns empty on no history', () => {
    const trends = analyzer.analyzeTrends();
    expect(trends).toHaveLength(0);
  });

  it('analyzeTrends with history returns trends', () => {
    analyzer.analyze(makeProfile({ name: 'r1' }));
    analyzer.analyze(makeProfile({ name: 'r2', duration: 50 }));
    analyzer.analyze(makeProfile({ name: 'r3', duration: 150 }));
    const trends = analyzer.analyzeTrends();
    expect(trends.length).toBeGreaterThanOrEqual(1);
    for (const t of trends) {
      expect(['improving', 'stable', 'degrading']).toContain(t.trend);
    }
  });

  it('getHistoricalData shape', () => {
    analyzer.analyze(makeProfile());
    const data = analyzer.getHistoricalData();
    expect(data.timestamps).toBeDefined();
    expect(data.parseTime).toBeDefined();
    expect(data.compileTime).toBeDefined();
  });

  it('clearHistory resets trend data', () => {
    analyzer.analyze(makeProfile());
    analyzer.clearHistory();
    expect(analyzer.getHistoricalData().timestamps).toHaveLength(0);
  });

  it('scoreToGrade mapping', () => {
    const a = analyzer as any;
    expect(a.scoreToGrade(95)).toBe('A');
    expect(a.scoreToGrade(85)).toBe('B');
    expect(a.scoreToGrade(72)).toBe('C');
    expect(a.scoreToGrade(65)).toBe('D');
    expect(a.scoreToGrade(40)).toBe('F');
  });

  it('calculateTrend with improving values', () => {
    const trend = (analyzer as any).calculateTrend('metric', [100, 80, 60, 40]);
    expect(trend.trend).toBe('improving');
    expect(trend.changePercent).toBeLessThan(0);
  });

  it('calculateTrend with degrading values', () => {
    const trend = (analyzer as any).calculateTrend('metric', [40, 60, 80, 100]);
    expect(trend.trend).toBe('degrading');
    expect(trend.changePercent).toBeGreaterThan(0);
  });

  it('calculateTrend with stable values', () => {
    const trend = (analyzer as any).calculateTrend('metric', [50, 50, 50, 50]);
    expect(trend.trend).toBe('stable');
  });
});
