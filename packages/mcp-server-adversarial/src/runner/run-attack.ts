// CLI runner for attack trials.
// Usage: tsx src/runner/run-attack.ts <attack> --trials=N [--sandboxId=ID]
//
// Per evaluation-plan.md §2 and §4.1: runs N trials, produces structured
// AttackOutput per trial, aggregates Wilson CI for baseline summary.

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import type { AttackContext, AttackResult } from '../types.js';
import {
  WhitewasherAttack,
  type WhitewasherConfig,
} from '../whitewasher.js';
import { SybilAttack, type SybilConfig } from '../sybil.js';
import {
  ScoreManipulatorAttack,
  type ScoreManipulatorConfig,
} from '../score-manipulator.js';
import {
  SlowPoisonerAttack,
  type SlowPoisonerConfig,
} from '../slow-poisoner.js';
import { EclipseAttack, type EclipseConfig } from '../eclipse.js';
import {
  validateAttackOutput,
  wilsonCI,
  type AttackOutput,
  type BaselineSummary,
} from './output-schema.js';

export type RunnableAttack =
  | { id: 'whitewasher'; config: WhitewasherConfig }
  | { id: 'sybil'; config: SybilConfig }
  | { id: 'score-manipulator'; config: ScoreManipulatorConfig }
  | { id: 'slow-poisoner'; config: SlowPoisonerConfig }
  | { id: 'eclipse'; config: EclipseConfig };

export const DEFAULT_TRIALS = 30;

function makeContext(sandboxId: string, trustSeries: number[]): AttackContext {
  let idx = 0;
  return {
    observeOwnTrust: () => trustSeries[idx++] ?? 0,
    trustFormulaSpec: 'paper-1-trust-formula-v1',
    sandboxId,
  };
}

function instantiate(spec: RunnableAttack) {
  switch (spec.id) {
    case 'whitewasher':
      return new WhitewasherAttack(spec.config);
    case 'sybil':
      return new SybilAttack(spec.config);
    case 'score-manipulator':
      return new ScoreManipulatorAttack(spec.config);
    case 'slow-poisoner':
      return new SlowPoisonerAttack(spec.config);
    case 'eclipse':
      return new EclipseAttack(spec.config);
  }
}

export function runTrial(
  spec: RunnableAttack,
  opts: {
    sandboxId: string;
    trustSeries: number[];
    maxRounds?: number;
    testbedVersion: string;
  }
): AttackOutput {
  const attack = instantiate(spec);
  const maxRounds = opts.maxRounds ?? 100;
  const history: AttackResult[] = [];

  const t0 = performance.now();
  for (let round = 1; round <= maxRounds; round++) {
    const ctx = makeContext(opts.sandboxId, opts.trustSeries);
    const result = attack.step(ctx, round);
    history.push(result);
    if (result.observedSuccessMetric) break;
  }
  const duration = performance.now() - t0;

  const success = attack.evaluateSuccess(history);

  // Per-attack metrics
  const metrics: Record<string, number> = {
    rounds: history.length,
  };
  if (spec.id === 'sybil') {
    metrics.inflation =
      history.length > 0
        ? history[history.length - 1].trustAtAttack /
          (spec.config.baselineTrust || 1)
        : 0;
  }
  if (spec.id === 'eclipse') {
    metrics.trustReduction =
      history.length > 0
        ? history[history.length - 1].trustAtAttack /
          (spec.config.preEclipseTargetTrust || 1)
        : 0;
  }

  return {
    attack: spec.id,
    trial_id: randomUUID(),
    success,
    metrics,
    duration_ms: Math.round(duration),
    testbed_version: opts.testbedVersion,
  };
}

export function runBaseline(
  spec: RunnableAttack,
  opts: {
    sandboxId: string;
    trustSeries: number[];
    trials?: number;
    maxRounds?: number;
    testbedVersion: string;
  }
): { trials: AttackOutput[]; summary: BaselineSummary } {
  const N = opts.trials ?? DEFAULT_TRIALS;
  const trials: AttackOutput[] = [];
  for (let i = 0; i < N; i++) {
    trials.push(
      runTrial(spec, {
        sandboxId: opts.sandboxId,
        trustSeries: opts.trustSeries,
        maxRounds: opts.maxRounds,
        testbedVersion: opts.testbedVersion,
      })
    );
  }

  const successes = trials.filter((t) => t.success).length;
  const ci = wilsonCI(successes, N);
  const summary: BaselineSummary = {
    attack: spec.id,
    N,
    success_rate: successes / N,
    ci_low: ci.low,
    ci_high: ci.high,
    per_trial_durations: trials.map((t) => t.duration_ms),
  };

  return { trials, summary };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const attackName = args[0];
  const trialsMatch = args.find((a) => a.startsWith('--trials='));
  const trials = trialsMatch ? parseInt(trialsMatch.split('=')[1], 10) : DEFAULT_TRIALS;
  const sandboxIdMatch = args.find((a) => a.startsWith('--sandboxId='));
  const sandboxId = sandboxIdMatch ? sandboxIdMatch.split('=')[1] : 'testbed-local';
  const versionMatch = args.find((a) => a.startsWith('--version='));
  const testbedVersion = versionMatch ? versionMatch.split('=')[1] : 'unknown';

  if (!attackName) {
    console.error('Usage: tsx run-attack.ts <attack> --trials=N');
    process.exit(1);
  }

  const trustSeries = Array.from({ length: 200 }, (_, i) =>
    Math.min(0.99, 0.1 + i * 0.01)
  );

  let spec: RunnableAttack;
  switch (attackName) {
    case 'whitewasher':
      spec = {
        id: 'whitewasher',
        config: { targetTrust: 0.9, cooperativeRounds: 5 },
      };
      break;
    case 'sybil':
      spec = {
        id: 'sybil',
        config: { K: 5, compoundRounds: 10, baselineTrust: 0.5 },
      };
      break;
    case 'score-manipulator':
      spec = {
        id: 'score-manipulator',
        config: {
          targetTrust: 0.95,
          trustMaxOutputRef: 'v1-analytic-derivation',
          outputUtilityRatio: 0.2,
          baselineUtility: 0.8,
        },
      };
      break;
    case 'slow-poisoner':
      spec = {
        id: 'slow-poisoner',
        config: {
          biasPerCall: 0.01,
          aggregateBiasThreshold: 10,
        },
      };
      break;
    case 'eclipse':
      spec = {
        id: 'eclipse',
        config: {
          K: 5,
          targetSandboxServerId: 'victim-01',
          eclipseRounds: 10,
          preEclipseTargetTrust: 0.8,
          trustReductionThreshold: 0.3,
        },
      };
      break;
    default:
      console.error(`Unknown attack: ${attackName}`);
      process.exit(1);
  }

  const { trials: results, summary } = runBaseline(spec, {
    sandboxId,
    trustSeries,
    trials,
    testbedVersion,
  });

  for (const r of results) {
    console.log(JSON.stringify(r));
  }
  console.log(JSON.stringify({ summary }));
}
