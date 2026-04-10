import { describe, it, expect, beforeEach } from 'vitest';
import { GenerationAnalytics } from '@holoscript/framework/ai';
import type { GenerationMetrics } from '@holoscript/framework/ai';

function makeMetric(overrides: Partial<GenerationMetrics> = {}): GenerationMetrics {
  return {
    promptLength: 50,
    codeLength: 200,
    confidence: 0.9,
    parseSuccess: true,
    errorCount: 0,
    wasFixed: false,
    responseTimeMs: 500,
    attemptsNeeded: 1,
    adapterName: 'gpt-4',
    timestamp: new Date(),
    ...overrides,
  };
}

describe('GenerationAnalytics', () => {
  let ga: GenerationAnalytics;

  beforeEach(() => {
    ga = new GenerationAnalytics();
  });

  // ---------------------------------------------------------------------------
  // Record / Get
  // ---------------------------------------------------------------------------

  it('recordMetric stores a metric', () => {
    ga.recordMetric(makeMetric());
    expect(ga.getAllMetrics()).toHaveLength(1);
  });

  it('getAllMetrics returns all recorded metrics', () => {
    ga.recordMetric(makeMetric());
    ga.recordMetric(makeMetric({ confidence: 0.5 }));
    expect(ga.getAllMetrics()).toHaveLength(2);
  });

  it('clearMetrics removes all metrics', () => {
    ga.recordMetric(makeMetric());
    ga.clearMetrics();
    expect(ga.getAllMetrics()).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Aggregate Metrics
  // ---------------------------------------------------------------------------

  it('getAggregateMetrics calculates totalGenerations', () => {
    ga.recordMetric(makeMetric());
    ga.recordMetric(makeMetric());
    const agg = ga.getAggregateMetrics();
    expect(agg.totalGenerations).toBe(2);
  });

  it('getAggregateMetrics computes success rate', () => {
    ga.recordMetric(makeMetric({ parseSuccess: true }));
    ga.recordMetric(makeMetric({ parseSuccess: false }));
    const agg = ga.getAggregateMetrics();
    expect(agg.successRate).toBeCloseTo(0.5);
  });

  it('getAggregateMetrics computes average confidence', () => {
    ga.recordMetric(makeMetric({ confidence: 0.8 }));
    ga.recordMetric(makeMetric({ confidence: 0.6 }));
    const agg = ga.getAggregateMetrics();
    expect(agg.avgConfidence).toBeCloseTo(0.7);
  });

  it('getAggregateMetrics computes average response time', () => {
    ga.recordMetric(makeMetric({ responseTimeMs: 400 }));
    ga.recordMetric(makeMetric({ responseTimeMs: 600 }));
    const agg = ga.getAggregateMetrics();
    expect(agg.avgResponseTime).toBeCloseTo(500);
  });

  // ---------------------------------------------------------------------------
  // Adapter Metrics
  // ---------------------------------------------------------------------------

  it('getMetricsByAdapter returns per-adapter stats', () => {
    ga.recordMetric(makeMetric({ adapterName: 'gpt-4', confidence: 0.9 }));
    ga.recordMetric(makeMetric({ adapterName: 'gpt-4', confidence: 0.8 }));
    ga.recordMetric(makeMetric({ adapterName: 'claude', confidence: 0.7 }));
    const gpt = ga.getMetricsByAdapter('gpt-4');
    expect(gpt.generationCount).toBe(2);
    expect(gpt.avgConfidence).toBeCloseTo(0.85);
  });

  it('getAllAdapterMetrics lists all adapters', () => {
    ga.recordMetric(makeMetric({ adapterName: 'a' }));
    ga.recordMetric(makeMetric({ adapterName: 'b' }));
    const all = ga.getAllAdapterMetrics();
    expect(all.length).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Confidence Distribution
  // ---------------------------------------------------------------------------

  it('getConfidenceDistribution returns buckets', () => {
    ga.recordMetric(makeMetric({ confidence: 0.15 }));
    ga.recordMetric(makeMetric({ confidence: 0.85 }));
    const dist = ga.getConfidenceDistribution();
    expect(dist.length).toBeGreaterThan(0);
    // Should have at least entries in low and high buckets
    const total = dist.reduce((sum, d) => sum + d.count, 0);
    expect(total).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Error Patterns
  // ---------------------------------------------------------------------------

  it('getErrorPatterns identifies error types', () => {
    ga.recordMetric(makeMetric({ parseSuccess: false, errorCount: 2 }));
    ga.recordMetric(makeMetric({ parseSuccess: true, errorCount: 0 }));
    const patterns = ga.getErrorPatterns();
    expect(patterns).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Recommendations
  // ---------------------------------------------------------------------------

  it('getRecommendations returns suggestions array', () => {
    ga.recordMetric(makeMetric({ confidence: 0.3, parseSuccess: false }));
    ga.recordMetric(makeMetric({ confidence: 0.2, parseSuccess: false }));
    const recs = ga.getRecommendations();
    expect(Array.isArray(recs)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Export / Report
  // ---------------------------------------------------------------------------

  it('exportMetrics returns JSON string', () => {
    ga.recordMetric(makeMetric());
    const json = ga.exportMetrics();
    const parsed = JSON.parse(json);
    expect(parsed).toBeDefined();
  });

  it('generateReport returns readable string', () => {
    ga.recordMetric(makeMetric());
    const report = ga.generateReport();
    expect(typeof report).toBe('string');
    expect(report.length).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // Response Time Distribution
  // ---------------------------------------------------------------------------

  it('getResponseTimeDistribution returns buckets', () => {
    ga.recordMetric(makeMetric({ responseTimeMs: 100 }));
    ga.recordMetric(makeMetric({ responseTimeMs: 5000 }));
    const dist = ga.getResponseTimeDistribution();
    expect(dist.length).toBeGreaterThan(0);
  });
});
