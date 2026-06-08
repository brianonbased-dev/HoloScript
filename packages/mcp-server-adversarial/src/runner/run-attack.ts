// CLI runner for attack trials.
// Usage: tsx src/runner/run-attack.ts <attack> --trials=N [--sandboxId=ID]
//
// Per evaluation-plan.md §2 and §4.1: runs N trials, produces structured
// AttackOutput per trial, aggregates Wilson CI for baseline summary.

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AttackContext, AttackResult } from '../types.js';
import { WhitewasherAttack, type WhitewasherConfig } from '../whitewasher.js';
import { SybilAttack, type SybilConfig } from '../sybil.js';
import { ScoreManipulatorAttack, type ScoreManipulatorConfig } from '../score-manipulator.js';
import { SlowPoisonerAttack, type SlowPoisonerConfig } from '../slow-poisoner.js';
import { EclipseAttack, type EclipseConfig } from '../eclipse.js';
import {
  validateAttackOutput,
  wilsonCI,
  type AttackOutput,
  type BaselineSummary,
} from './output-schema.js';
import { makeTrustDriver, type TrustDriver } from './trust-driver.js';
import type { TrustFormulaVersion } from '../trust-model.js';

export type RunnableAttack =
  | { id: 'whitewasher'; config: WhitewasherConfig }
  | { id: 'sybil'; config: SybilConfig }
  | { id: 'score-manipulator'; config: ScoreManipulatorConfig }
  | { id: 'slow-poisoner'; config: SlowPoisonerConfig }
  | { id: 'eclipse'; config: EclipseConfig };

export const DEFAULT_TRIALS = 30;

// LEGACY context factory — reads a precomputed series. Retained ONLY for the
// optional `trustSeries` override path (tests that want a fixed curve). The
// live measurement path uses makeLiveContext below, which reads the real
// computeReputation formula via a TrustDriver. Note the historical bug this
// path carried: callers re-created the context every round, so idx reset and
// observeOwnTrust always returned trustSeries[0]. The live path holds state in
// the driver across rounds and does not have this defect.
function makeSeriesContext(sandboxId: string, trustSeries: number[]): AttackContext {
  let idx = 0;
  return {
    observeOwnTrust: () => trustSeries[idx++] ?? 0,
    trustFormulaSpec: 'paper-1-trust-formula-v1',
    sandboxId,
  };
}

// LIVE context factory — observeOwnTrust reads the driver's current trust,
// which is computed by the real computeReputation formula in trust-model.ts.
function makeLiveContext(sandboxId: string, driver: TrustDriver): AttackContext {
  return {
    observeOwnTrust: () => driver.observe(),
    // V10/V11 anti-Sybil reputation formula — the live system under attack.
    trustFormulaSpec: 'holomesh-computeReputation-v11',
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

/**
 * Minimum rounds an attack must run before its success metric is well-defined.
 * Some attacks declare success over a WINDOW (slow-poisoner aggregates over
 * evaluationRounds; eclipse measures after eclipseRounds), so the trial loop
 * must not break early on a transient per-round flag before that window closes.
 * Single-shot attacks (whitewasher exploit, sybil/score-manip threshold cross)
 * have requiredRounds = 1 and may break as soon as the metric fires.
 */
export function requiredRounds(spec: RunnableAttack): number {
  switch (spec.id) {
    case 'slow-poisoner':
      return spec.config.evaluationRounds ?? 1000;
    case 'eclipse':
      return spec.config.eclipseRounds;
    default:
      return 1;
  }
}

/**
 * Default round budget per attack — large enough that requiredRounds fits AND
 * the aggregate window can actually express success. Slow-poisoner's success is
 * `aggregate_bias > threshold` evaluated only after `evaluationRounds` samples,
 * with a STRICT `>` — so at exactly evaluationRounds the aggregate can equal but
 * not exceed the threshold. Give window attacks a 20% margin past requiredRounds
 * so the strict inequality is reachable. Single-shot attacks cap at 100.
 */
export function defaultMaxRounds(spec: RunnableAttack): number {
  const req = requiredRounds(spec);
  if (req <= 1) return 100;
  // Window attacks: run past the evaluation horizon so strict-`>` metrics fire.
  return Math.ceil(req * 1.2);
}

export function runTrial(
  spec: RunnableAttack,
  opts: {
    sandboxId: string;
    /** Optional fixed trust curve override. When omitted (the default and the
     *  Phase 4 measurement path), trust is read LIVE from the real
     *  computeReputation formula via a per-attack TrustDriver. */
    trustSeries?: number[];
    maxRounds?: number;
    testbedVersion: string;
    /** Trust-formula version under test: 'v11' = defended (default/production),
     *  'v10' = undefended baseline (Phase-4 defense-efficacy A/B). */
    formula?: TrustFormulaVersion;
  }
): AttackOutput {
  const attack = instantiate(spec);
  const maxRounds = opts.maxRounds ?? defaultMaxRounds(spec);
  const minRounds = requiredRounds(spec);
  const history: AttackResult[] = [];

  // Live measurement path: a stateful driver advanced once per round, observed
  // through the real formula. Series path: legacy fixed-curve override.
  const useLive = opts.trustSeries === undefined;
  const driver: TrustDriver | null = useLive ? makeTrustDriver(spec, opts.formula ?? 'v11') : null;
  const ctx: AttackContext =
    useLive && driver
      ? makeLiveContext(opts.sandboxId, driver)
      : makeSeriesContext(opts.sandboxId, opts.trustSeries ?? []);

  const t0 = performance.now();
  for (let round = 1; round <= maxRounds; round++) {
    // Advance the live trust state for this round BEFORE the attack observes,
    // so the attack reacts to the formula's response to its own behavior.
    if (driver) driver.step(round);
    const result = attack.step(ctx, round);
    history.push(result);
    // Break early on a per-round success flag ONLY once the attack's required
    // measurement window has elapsed. Window attacks (slow-poisoner, eclipse)
    // run to minRounds so their aggregate / post-N metric is well-defined.
    if (result.observedSuccessMetric && round >= minRounds) break;
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
        ? history[history.length - 1].trustAtAttack / (spec.config.baselineTrust || 1)
        : 0;
  }
  if (spec.id === 'eclipse') {
    metrics.trustReduction =
      history.length > 0
        ? history[history.length - 1].trustAtAttack / (spec.config.preEclipseTargetTrust || 1)
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
    /** Optional fixed trust curve override; omit for live formula measurement. */
    trustSeries?: number[];
    trials?: number;
    maxRounds?: number;
    testbedVersion: string;
    /** Formula version under test ('v11' defended default, 'v10' undefended baseline). */
    formula?: TrustFormulaVersion;
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
        formula: opts.formula,
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

// CLI entry detection — robust across platforms. The naive
// `import.meta.url === \`file://${process.argv[1]}\`` never matched on Windows
// (process.argv[1] is often relative, and file:// vs file:/// + drive-letter
// casing differ), so the runner CLI was silently dead. Compare resolved real
// paths instead.
function isCliEntry(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    const argvFile = realpathSync(resolve(entry));
    return thisFile === argvFile;
  } catch {
    return false;
  }
}

// CLI entry point
if (isCliEntry()) {
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

  // Phase 4 measurement uses the LIVE trust formula (no fixed series). The old
  // hardcoded ramp `0.1 + i*0.01` is removed — it was the OVERCLAIMED defect.
  // Pass --series to opt into a fixed curve for debugging only.
  const wantSeries = args.includes('--series');
  const trustSeries = wantSeries
    ? Array.from({ length: 200 }, (_, i) => Math.min(0.99, 0.1 + i * 0.01))
    : undefined;

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
