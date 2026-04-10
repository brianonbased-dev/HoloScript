/**
 * healthspan-twin.scenario.ts — LIVING-SPEC: Healthspan Digital Twin
 *
 * Persona: Coach Lin — personal longevity coach who ingests biomarkers,
 * detects trends, and simulates lifestyle interventions.
 */
import { describe, it, expect } from 'vitest';

function trendDirection(values: number[]): 'improving' | 'declining' | 'stable' {
  if (values.length < 2) return 'stable';
  const last = values[values.length - 1];
  const avg = values.slice(0, -1).reduce((s, v) => s + v, 0) / (values.length - 1);
  if (last > avg * 1.05) return 'improving';
  if (last < avg * 0.95) return 'declining';
  return 'stable';
}

function interventionImpact(baseValue: number, impactFactor: number): number {
  return baseValue * (1 + impactFactor);
}

function healthScore(metrics: { name: string; value: number; weight: number }[]): number {
  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  return totalWeight > 0 ? metrics.reduce((s, m) => s + m.value * m.weight, 0) / totalWeight : 0;
}

describe('Scenario: Healthspan — Biomarker Trends', () => {
  it('trendDirection() — improving', () => {
    expect(trendDirection([50, 52, 55, 60])).toBe('improving');
  });
  it('trendDirection() — declining', () => {
    expect(trendDirection([60, 55, 50, 40])).toBe('declining');
  });
  it('trendDirection() — stable', () => {
    expect(trendDirection([50, 50, 50, 50])).toBe('stable');
  });
  it('trendDirection() — single value = stable', () => {
    expect(trendDirection([50])).toBe('stable');
  });
});

describe('Scenario: Healthspan — Interventions', () => {
  it('interventionImpact() applies factor', () => {
    expect(interventionImpact(50, 0.2)).toBeCloseTo(60);
  });
  it('healthScore() weighted average', () => {
    const metrics = [
      { name: 'hrv', value: 0.8, weight: 2 },
      { name: 'cortisol', value: 0.6, weight: 1 },
    ];
    expect(healthScore(metrics)).toBeCloseTo(0.733, 2);
  });
});
