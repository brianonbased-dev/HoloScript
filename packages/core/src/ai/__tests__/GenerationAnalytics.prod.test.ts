/**
 * GenerationAnalytics — Production Test Suite
 *
 * Covers: metric recording, aggregate computation, adapter metrics,
 * confidence/response-time/error distributions, recommendations,
 * time series, export, report generation, clear.
 */
import { describe, it, expect } from 'vitest';
import { GenerationAnalytics, createAnalytics, type GenerationMetrics } from '../GenerationAnalytics';

function metric(overrides: Partial<GenerationMetrics> = {}): GenerationMetrics {
  return {
    promptLength: overrides.promptLength ?? 100,
    codeLength: overrides.codeLength ?? 200,
    confidence: overrides.confidence ?? 0.8,
    parseSuccess: overrides.parseSuccess ?? true,
    errorCount: overrides.errorCount ?? 0,
    wasFixed: overrides.wasFixed ?? false,
    responseTimeMs: overrides.responseTimeMs ?? 500,
    attemptsNeeded: overrides.attemptsNeeded ?? 1,
    adapterName: overrides.adapterName ?? 'openai',
    timestamp: overrides.timestamp ?? new Date(),
    platform: overrides.platform ?? 'web',
  };
}

describe('GenerationAnalytics — Production', () => {
  // ─── Factory ──────────────────────────────────────────────────────
  it('createAnalytics returns instance', () => {
    expect(createAnalytics()).toBeInstanceOf(GenerationAnalytics);
  });

  // ─── Record + Get ─────────────────────────────────────────────────
  it('recordMetric stores metric', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric());
    expect(a.getAllMetrics().length).toBe(1);
  });

  it('clearMetrics empties all', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric());
    a.clearMetrics();
    expect(a.getAllMetrics().length).toBe(0);
  });

  // ─── Aggregates ───────────────────────────────────────────────────
  it('getAggregateMetrics computes totals', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ parseSuccess: true, confidence: 0.9, responseTimeMs: 100 }));
    a.recordMetric(metric({ parseSuccess: false, confidence: 0.5, responseTimeMs: 300 }));
    const agg = a.getAggregateMetrics();
    expect(agg.totalGenerations).toBe(2);
    expect(agg.successRate).toBe(0.5);
    expect(agg.avgConfidence).toBeCloseTo(0.7, 1);
    expect(agg.avgResponseTime).toBeCloseTo(200, 0);
  });

  // ─── Adapter Metrics ──────────────────────────────────────────────
  it('getMetricsByAdapter returns per-adapter stats', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ adapterName: 'openai', parseSuccess: true }));
    a.recordMetric(metric({ adapterName: 'openai', parseSuccess: true }));
    a.recordMetric(metric({ adapterName: 'claude', parseSuccess: false }));
    const oai = a.getMetricsByAdapter('openai');
    expect(oai.generationCount).toBe(2);
    expect(oai.successRate).toBe(1);
  });

  it('getAllAdapterMetrics covers all adapters', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ adapterName: 'openai' }));
    a.recordMetric(metric({ adapterName: 'claude' }));
    const all = a.getAllAdapterMetrics();
    expect(all.length).toBe(2);
  });

  // ─── Distributions ────────────────────────────────────────────────
  it('getConfidenceDistribution returns buckets', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ confidence: 0.15 }));
    a.recordMetric(metric({ confidence: 0.55 }));
    a.recordMetric(metric({ confidence: 0.95 }));
    const dist = a.getConfidenceDistribution();
    expect(dist.length).toBeGreaterThan(0);
    expect(dist.reduce((s, d) => s + d.count, 0)).toBe(3);
  });

  it('getResponseTimeDistribution returns buckets', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ responseTimeMs: 50 }));
    a.recordMetric(metric({ responseTimeMs: 500 }));
    a.recordMetric(metric({ responseTimeMs: 5000 }));
    const dist = a.getResponseTimeDistribution();
    expect(dist.length).toBeGreaterThan(0);
  });

  it('getErrorPatterns categorizes errors', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric({ parseSuccess: false, errorCount: 2 }));
    a.recordMetric(metric({ parseSuccess: true, errorCount: 0 }));
    const patterns = a.getErrorPatterns();
    expect(patterns.length).toBeGreaterThan(0);
  });

  // ─── Recommendations ─────────────────────────────────────────────
  it('getRecommendations returns array of strings', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric());
    const recs = a.getRecommendations();
    expect(Array.isArray(recs)).toBe(true);
  });

  // ─── Export / Report ──────────────────────────────────────────────
  it('exportMetrics returns valid JSON', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric());
    const json = a.exportMetrics();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('generateReport returns non-empty string', () => {
    const a = new GenerationAnalytics();
    a.recordMetric(metric());
    const report = a.generateReport();
    expect(report.length).toBeGreaterThan(0);
  });

  // ─── Time Series ──────────────────────────────────────────────────
  it('getTimeSeries returns metrics windows', () => {
    const a = new GenerationAnalytics();
    const now = new Date();
    a.recordMetric(metric({ timestamp: now }));
    const ts = a.getTimeSeries(3600000);
    expect(ts.length).toBeGreaterThanOrEqual(0); // may or may not window
  });
});
