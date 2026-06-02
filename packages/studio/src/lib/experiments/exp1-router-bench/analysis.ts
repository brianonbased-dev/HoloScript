/**
 * EXP-1 statistical analysis — makes the verdict defensible, not just a point estimate.
 *
 * A pass-rate of "B 0.80 vs A 0.70" on n=38 could be noise. This adds:
 *   - PAIRED bootstrap confidence intervals on the C1 (B−A) and C2 (C−A) pass-rate
 *     effects — same tasks, resampled, so an effect's CI must exclude 0 to be real.
 *   - Per-DOMAIN breakdown — where the IR/offload advantage actually shows.
 *   - A replayable result receipt (CAEL-aligned, hashable) for audit.
 *
 * Deterministic: the bootstrap uses a seeded PRNG, so analysis is reproducible and
 * unit-testable (no Math.random, no wall-clock in the core).
 */

import type { Arm, BenchReport, BenchDomain, TaskArmOutcome } from './types';
import type { KillVerdict } from './metrics';

// ─── Deterministic PRNG (mulberry32) ──────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CI {
  mean: number;
  lo: number;
  hi: number;
  /** true when the interval excludes 0 (effect is distinguishable from noise). */
  excludesZero: boolean;
}

/** Paired bootstrap CI of the mean of `diffs` (one value per task). */
export function bootstrapDiffCI(
  diffs: number[],
  opts: { seed?: number; iters?: number; level?: number } = {}
): CI {
  const seed = opts.seed ?? 0xc0ffee;
  const iters = opts.iters ?? 2000;
  const level = opts.level ?? 0.95;
  const n = diffs.length;
  if (n === 0) return { mean: 0, lo: 0, hi: 0, excludesZero: false };

  const rng = mulberry32(seed);
  const means: number[] = [];
  for (let b = 0; b < iters; b++) {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += diffs[Math.floor(rng() * n)];
    means.push(sum / n);
  }
  means.sort((x, y) => x - y);
  const loIdx = Math.floor(((1 - level) / 2) * iters);
  const hiIdx = Math.min(iters - 1, Math.ceil((1 - (1 - level) / 2) * iters) - 1);
  const lo = means[loIdx];
  const hi = means[hiIdx];
  const mean = diffs.reduce((s, d) => s + d, 0) / n;
  return { mean, lo, hi, excludesZero: lo > 0 || hi < 0 };
}

/** Pair arm outcomes by task → 0/1 pass per task per arm. */
function pairByTask(outcomes: TaskArmOutcome[]): Map<string, Partial<Record<Arm, number>>> {
  const byTask = new Map<string, Partial<Record<Arm, number>>>();
  for (const o of outcomes) {
    const row = byTask.get(o.taskId) ?? {};
    row[o.arm] = o.passed ? 1 : 0;
    byTask.set(o.taskId, row);
  }
  return byTask;
}

/** Paired pass-rate difference CI between two arms (e.g. B−A for C1, C−A for C2). */
export function passRateDiffCI(
  report: BenchReport,
  armX: Arm,
  armY: Arm,
  seed = 0xc0ffee
): CI {
  const byTask = pairByTask(report.outcomes);
  const diffs: number[] = [];
  for (const row of byTask.values()) {
    if (row[armX] !== undefined && row[armY] !== undefined) {
      diffs.push((row[armX] as number) - (row[armY] as number));
    }
  }
  return bootstrapDiffCI(diffs, { seed });
}

export interface DomainStat {
  domain: BenchDomain;
  n: number;
  passRate: Record<Arm, number>;
  meanInputTokens: Record<Arm, number>;
}

export interface Exp1Analysis {
  c1DiffCI: CI; // B − A pass-rate (IR vs NL)
  c2DiffCI: CI; // C − A pass-rate (lite+offload vs baseline)
  perDomain: DomainStat[];
}

/**
 * Full analysis. `domainByTask` maps taskId → domain (the run has the task list).
 */
export function analyzeReport(
  report: BenchReport,
  domainByTask: Map<string, BenchDomain>,
  seed = 0xc0ffee
): Exp1Analysis {
  const c1DiffCI = passRateDiffCI(report, 'B', 'A', seed);
  const c2DiffCI = passRateDiffCI(report, 'C', 'A', seed);

  // Per-domain aggregation.
  const arms: Arm[] = ['A', 'B', 'C'];
  const byDomain = new Map<BenchDomain, TaskArmOutcome[]>();
  for (const o of report.outcomes) {
    const d = domainByTask.get(o.taskId);
    if (!d) continue;
    const list = byDomain.get(d) ?? [];
    list.push(o);
    byDomain.set(d, list);
  }
  const perDomainStats: DomainStat[] = [];
  for (const [domain, outs] of byDomain) {
    const passRate = {} as Record<Arm, number>;
    const meanInputTokens = {} as Record<Arm, number>;
    for (const arm of arms) {
      const rows = outs.filter((o) => o.arm === arm);
      passRate[arm] = rows.length ? rows.filter((o) => o.passed).length / rows.length : 0;
      meanInputTokens[arm] = rows.length
        ? rows.reduce((s, o) => s + o.inputTokens, 0) / rows.length
        : 0;
    }
    const taskCount = new Set(outs.map((o) => o.taskId)).size;
    perDomainStats.push({ domain, n: taskCount, passRate, meanInputTokens });
  }

  return { c1DiffCI, c2DiffCI, perDomain: perDomainStats };
}

// ─── Replayable result receipt ─────────────────────────────────────────────────

export interface Exp1Receipt {
  experiment: 'exp1-router-bench';
  tier: string;
  taskCount: number;
  baselineProvider: string;
  liteProvider: string;
  baselineModel: string;
  liteModel: string;
  arms: BenchReport['arms'];
  verdict: KillVerdict;
  analysis: Exp1Analysis;
  /** ISO timestamp, passed in (not wall-clocked in core) for reproducibility. */
  timestamp: string;
}

export function buildExp1Receipt(input: {
  report: BenchReport;
  verdict: KillVerdict;
  analysis: Exp1Analysis;
  tier: string;
  baselineProvider: string;
  liteProvider: string;
  baselineModel: string;
  liteModel: string;
  timestamp: string;
}): Exp1Receipt {
  return {
    experiment: 'exp1-router-bench',
    tier: input.tier,
    taskCount: input.report.taskCount,
    baselineProvider: input.baselineProvider,
    liteProvider: input.liteProvider,
    baselineModel: input.baselineModel,
    liteModel: input.liteModel,
    arms: input.report.arms,
    verdict: input.verdict,
    analysis: input.analysis,
    timestamp: input.timestamp,
  };
}
