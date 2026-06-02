import { describe, it, expect } from 'vitest';

import {
  bootstrapDiffCI,
  passRateDiffCI,
  analyzeReport,
  buildExp1Receipt,
} from '../analysis';
import type { Arm, BenchDomain, BenchReport, TaskArmOutcome } from '../types';
import type { KillVerdict } from '../metrics';

function outcome(taskId: string, arm: Arm, passed: boolean, inputTokens = 100): TaskArmOutcome {
  return { taskId, arm, passed, inputTokens, outputTokens: 10, provenanceCoverage: 1, oracleContractId: 'c' };
}

function synthReport(rows: TaskArmOutcome[]): BenchReport {
  const arms = {} as BenchReport['arms'];
  for (const arm of ['A', 'B', 'C'] as Arm[]) {
    const r = rows.filter((o) => o.arm === arm);
    arms[arm] = {
      arm,
      n: r.length,
      passRate: r.length ? r.filter((o) => o.passed).length / r.length : 0,
      meanInputTokens: r.length ? r.reduce((s, o) => s + o.inputTokens, 0) / r.length : 0,
      meanOutputTokens: 10,
      provenanceCoverage: 1,
    };
  }
  return { taskCount: new Set(rows.map((o) => o.taskId)).size, arms, outcomes: rows };
}

describe('bootstrapDiffCI — deterministic, effect-vs-noise', () => {
  it('all-positive diffs → CI excludes zero (real effect)', () => {
    const ci = bootstrapDiffCI([1, 1, 1, 1, 1, 1], { seed: 42 });
    expect(ci.mean).toBe(1);
    expect(ci.excludesZero).toBe(true);
    expect(ci.lo).toBeGreaterThan(0);
  });

  it('all-zero diffs → CI is [0,0], does not exclude zero', () => {
    const ci = bootstrapDiffCI([0, 0, 0, 0], { seed: 42 });
    expect(ci.mean).toBe(0);
    expect(ci.excludesZero).toBe(false);
  });

  it('mixed small effect → reproducible across runs with the same seed', () => {
    const diffs = [1, 0, 1, -1, 0, 1, 0, 0, 1, -1];
    const a = bootstrapDiffCI(diffs, { seed: 7 });
    const b = bootstrapDiffCI(diffs, { seed: 7 });
    expect(a).toEqual(b); // deterministic
    expect(a.lo).toBeLessThanOrEqual(a.mean);
    expect(a.hi).toBeGreaterThanOrEqual(a.mean);
  });

  it('empty diffs → zeroed CI', () => {
    expect(bootstrapDiffCI([])).toEqual({ mean: 0, lo: 0, hi: 0, excludesZero: false });
  });
});

describe('passRateDiffCI — paired by task', () => {
  it('measures B−A as a real effect when B consistently beats A', () => {
    const rows: TaskArmOutcome[] = [];
    for (let i = 0; i < 8; i++) {
      rows.push(outcome(`t${i}`, 'A', false));
      rows.push(outcome(`t${i}`, 'B', true));
      rows.push(outcome(`t${i}`, 'C', i % 2 === 0));
    }
    const ci = passRateDiffCI(synthReport(rows), 'B', 'A', 99);
    expect(ci.mean).toBe(1); // B passes all, A passes none
    expect(ci.excludesZero).toBe(true);
  });
});

describe('analyzeReport — per-domain + C1/C2 CIs', () => {
  it('breaks results down by domain and computes both effect CIs', () => {
    const rows: TaskArmOutcome[] = [
      outcome('bounds-1', 'A', false), outcome('bounds-1', 'B', true), outcome('bounds-1', 'C', true),
      outcome('bounds-2', 'A', false), outcome('bounds-2', 'B', true), outcome('bounds-2', 'C', true),
      outcome('trait-1', 'A', true), outcome('trait-1', 'B', true), outcome('trait-1', 'C', false),
    ];
    const domainByTask = new Map<string, BenchDomain>([
      ['bounds-1', 'contract-bounds'],
      ['bounds-2', 'contract-bounds'],
      ['trait-1', 'trait-composition'],
    ]);
    const a = analyzeReport(synthReport(rows), domainByTask, 13);
    expect(a.c1DiffCI).toBeDefined();
    expect(a.c2DiffCI).toBeDefined();

    const bounds = a.perDomain.find((d) => d.domain === 'contract-bounds')!;
    expect(bounds.n).toBe(2);
    expect(bounds.passRate.A).toBe(0); // A fails both bounds tasks
    expect(bounds.passRate.B).toBe(1); // B passes both
    const trait = a.perDomain.find((d) => d.domain === 'trait-composition')!;
    expect(trait.n).toBe(1);
    expect(trait.passRate.C).toBe(0);
  });
});

describe('buildExp1Receipt — replayable audit artifact', () => {
  it('captures models, providers, verdict, analysis, timestamp', () => {
    const report = synthReport([
      outcome('t0', 'A', true), outcome('t0', 'B', true), outcome('t0', 'C', true),
    ]);
    const verdict = { thesisDead: false } as KillVerdict;
    const analysis = analyzeReport(report, new Map([['t0', 'holo-authoring' as BenchDomain]]), 1);
    const r = buildExp1Receipt({
      report,
      verdict,
      analysis,
      tier: 'preliminary',
      baselineProvider: 'ollama',
      liteProvider: 'ollama',
      baselineModel: 'qwen2.5-coder:7b',
      liteModel: 'qwen2.5-coder:1.5b',
      timestamp: '2026-06-02T00:00:00.000Z',
    });
    expect(r.experiment).toBe('exp1-router-bench');
    expect(r.baselineProvider).toBe('ollama');
    expect(r.baselineModel).toBe('qwen2.5-coder:7b');
    expect(r.tier).toBe('preliminary');
    expect(r.timestamp).toBe('2026-06-02T00:00:00.000Z');
    // Receipt is JSON-serializable (auditable).
    expect(() => JSON.stringify(r)).not.toThrow();
  });
});
