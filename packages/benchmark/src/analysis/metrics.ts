/**
 * Benchmark Analysis Metrics
 *
 * Calculates and compares benchmark results
 */

export interface BenchmarkMetrics {
  name: string;
  hz: number; // operations per second
  period: number; // time per operation in ms
  samples: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
}

export interface PerformanceRegression {
  metric: string;
  baseline: number;
  current: number;
  percentChange: number;
  isRegression: boolean;
}

export function calculateMetrics(task: {
  result?: { mean?: number; hz?: number };
}): BenchmarkMetrics {
  const hz = task.result?.hz || 0;
  const period = hz > 0 ? 1000 / hz : 0;

  return {
    name: '',
    hz,
    period,
    samples: 0,
    min: 0,
    max: 0,
    mean: task.result?.mean || 0,
    median: 0,
    stdDev: 0,
  };
}

export function compareMetrics(
  baseline: BenchmarkMetrics,
  current: BenchmarkMetrics,
  threshold: number = 5
): PerformanceRegression {
  const percentChange = ((current.hz - baseline.hz) / baseline.hz) * 100;

  return {
    metric: current.name,
    baseline: baseline.hz,
    current: current.hz,
    percentChange,
    isRegression: percentChange < -threshold,
  };
}

export function formatMetrics(metrics: BenchmarkMetrics): string {
  return `
  Name: ${metrics.name}
  Ops/sec: ${metrics.hz.toFixed(2)} hz
  Time/op: ${metrics.period.toFixed(3)} ms
  Mean: ${metrics.mean.toFixed(3)} ms
  Samples: ${metrics.samples}
`;
}
