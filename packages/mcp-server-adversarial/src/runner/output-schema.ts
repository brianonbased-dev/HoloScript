// Structured output schema for attack trial results.
// Per evaluation-plan.md §2, this schema makes Phase 4 aggregation a pure
// data pipeline — no re-deriving what "success" means per attack.

export type AttackOutput = {
  attack: string;
  trial_id: string;
  success: boolean;
  metrics: Record<string, number>;
  duration_ms: number;
  testbed_version: string;
};

export type BaselineSummary = {
  attack: string;
  N: number;
  success_rate: number;
  ci_low: number;
  ci_high: number;
  per_trial_durations: number[];
};

export type DefendedSummary = BaselineSummary & {
  defense: string;
};

export type OverheadSummary = {
  defense: string;
  N: number;
  M: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  mean_cpu_per_call_ms: number;
  overhead_p50_pct: number;
  overhead_p95_pct: number;
  overhead_cpu_pct: number;
};

// Simple runtime validator — no external dependency (zod not in package.json).
export function validateAttackOutput(obj: unknown): obj is AttackOutput {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (typeof o.attack !== 'string') return false;
  if (typeof o.trial_id !== 'string') return false;
  if (typeof o.success !== 'boolean') return false;
  if (typeof o.duration_ms !== 'number') return false;
  if (typeof o.testbed_version !== 'string') return false;
  if (typeof o.metrics !== 'object' || o.metrics === null) return false;
  for (const v of Object.values(o.metrics)) {
    if (typeof v !== 'number') return false;
  }
  return true;
}

// Wilson score interval for small-N success-rate CI.
// Per evaluation-plan.md §4.1.
export function wilsonCI(successes: number, N: number, z = 1.96): { low: number; high: number } {
  if (N === 0) return { low: 0, high: 0 };
  const p = successes / N;
  const denom = 1 + (z * z) / N;
  const centre = p + (z * z) / (2 * N);
  const halfWidth = z * Math.sqrt((p * (1 - p)) / N + (z * z) / (4 * N * N));
  return {
    low: Math.max(0, (centre - halfWidth) / denom),
    high: Math.min(1, (centre + halfWidth) / denom),
  };
}
