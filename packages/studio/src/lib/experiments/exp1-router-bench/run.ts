/**
 * EXP-1 LIVE RUN entry. SOVEREIGN BY DEFAULT — all arms run on a LOCAL model
 * (Ollama, no credits, no external dependency), dogfooding the very thesis under
 * test (a lite, portable, local model). A paid frontier vendor is used ONLY as an
 * explicit opt-in baseline (config.frontierBaseline), the one place EXP-1 may bill.
 *
 * Arms:
 *   A — baseline model (local by default), NL instruction.
 *   B — baseline model (same as A), HoloScript-IR instruction.   → C1 (representation)
 *   C — SMALLER local model + IR + offload retrieval.            → C2 (lite + ecosystem)
 *
 * A defensible C1/C2/C3 verdict needs the N≈50–100 suite; smaller runs self-label
 * (smoke / preliminary). Run via the vitest-gated harness (__tests__/live.test.ts) —
 * vitest resolves the provider chain that raw tsx does not.
 */

import { makeProviderArm } from './providerArm';
import { runBench, type BenchArms } from './runner';
import { evaluateKillCriteria } from './metrics';
import { EXP1_FULL_SUITE } from './tasks-extended';
import { curatedOffload } from './offload';
import {
  localProvider,
  frontierBaselineProvider,
  SOVEREIGN_BASELINE_MODEL,
  SOVEREIGN_LITE_MODEL,
} from './exp1Provider';
import { analyzeReport, buildExp1Receipt } from './analysis';
import { caelProvenance } from './caelProvenance';
import type { BenchDomain, BenchTask, ProvenanceChecker } from './types';

export type RunTier = 'pipeline-smoke' | 'preliminary' | 'verdict';

/** Honest verdict tier by suite size: <30 smoke, 30–49 preliminary, ≥50 verdict. */
export function runTier(n: number): RunTier {
  if (n >= 50) return 'verdict';
  if (n >= 30) return 'preliminary';
  return 'pipeline-smoke';
}

export interface Exp1RunConfig {
  /** Sovereign baseline (Arms A/B) local model id. Default: SOVEREIGN_BASELINE_MODEL. */
  baselineModel?: string;
  /** Sovereign lite (Arm C) local model id. Default: SOVEREIGN_LITE_MODEL. */
  liteModel?: string;
  /** Ollama host (default: OLLAMA_HOST env, else local dev fallback). */
  ollamaHost?: string;
  /**
   * EXPLICIT opt-in: use the paid frontier provider as the Arm-A/B baseline (the
   * bar "small local matches big frontier" must beat). Default false — sovereign.
   * This is the ONLY switch that lets EXP-1 bill an external vendor.
   */
  frontierBaseline?: boolean;
  /** Whether Arm C genuinely runs a smaller model — gates the C2 credit. */
  armCParamsLower?: boolean;
  /** Offload retrieval for Arm C (HoloGraph/GOLD). Default: curatedOffload. */
  retrieval?: (task: BenchTask) => string | undefined;
  /** Provenance checker (verify_cael_trace wrapper). Defaults to a conservative stub. */
  provenance?: ProvenanceChecker;
  tasks?: BenchTask[];
}

/**
 * Conservative fail-honest provenance: reports zero traced claims so C3 is never
 * silently credited. Retained as an explicit opt-out (config.provenance) for runs
 * that want C3 forced-dead; the DEFAULT is now the real CAEL checker below.
 */
export const stubProvenance: ProvenanceChecker = async (result) => {
  const hasOutput = Boolean(result.rawOutput?.trim());
  return { totalClaims: hasOutput ? 1 : 0, tracedClaims: 0 };
};

export async function runExp1Live(config: Exp1RunConfig = {}) {
  // EXP1_MAX_TASKS caps the suite for a fast smoke/pipeline validation without
  // editing code (e.g. =6 for a ~3-min local sanity run). Unset → full suite.
  // The runTier() honesty labels still apply, so a capped run self-labels 'smoke'.
  const maxTasks = Number(process.env.EXP1_MAX_TASKS) || 0;
  const fullTasks = config.tasks ?? EXP1_FULL_SUITE;
  const tasks = maxTasks > 0 ? fullTasks.slice(0, maxTasks) : fullTasks;
  const tier = runTier(tasks.length);

  const baselineModel = config.baselineModel ?? SOVEREIGN_BASELINE_MODEL;
  const liteModel = config.liteModel ?? SOVEREIGN_LITE_MODEL;
  const retrieval = config.retrieval ?? curatedOffload;

  // SOVEREIGN BY DEFAULT: baseline arms run on the local model. A paid frontier
  // model is used ONLY when config.frontierBaseline is explicitly set — the single
  // sanctioned billing path (the "vs frontier" comparison the headline claim needs).
  const baselineResolved = config.frontierBaseline
    ? frontierBaselineProvider()
    : localProvider(baselineModel, config.ollamaHost);
  const liteResolved = localProvider(liteModel, config.ollamaHost);

  const arms: BenchArms = {
    A: makeProviderArm({ resolved: baselineResolved }),
    B: makeProviderArm({ resolved: baselineResolved }),
    C: makeProviderArm({ resolved: liteResolved, retrieval }),
  };

  const report = await runBench(tasks, arms, config.provenance ?? caelProvenance);
  const verdict = evaluateKillCriteria(report, undefined, {
    // Arm C runs a strictly smaller model than the baseline → C2 credit is valid
    // (by construction when the lite model differs from the baseline model).
    armCParamsLower: config.armCParamsLower ?? liteModel !== baselineModel,
  });

  // Statistical rigor: paired bootstrap CIs on the C1/C2 effects + per-domain breakdown,
  // so the headline claims are intervals (effect distinguishable from noise), not points.
  const domainByTask = new Map<string, BenchDomain>(tasks.map((t) => [t.id, t.domain]));
  const analysis = analyzeReport(report, domainByTask);

  const receipt = buildExp1Receipt({
    report,
    verdict,
    analysis,
    tier,
    baselineProvider: baselineResolved.providerName,
    liteProvider: liteResolved.providerName,
    // Record the ACTUALLY-RESOLVED models (provenance): under frontierBaseline the
    // baseline arms run on the frontier model, not the sovereign-default id.
    baselineModel: baselineResolved.model,
    liteModel: liteResolved.model,
    timestamp: new Date().toISOString(),
  });

  return {
    kind: tier,
    taskCount: report.taskCount,
    report,
    baselineProvider: baselineResolved.providerName,
    liteProvider: liteResolved.providerName,
    verdict,
    analysis,
    receipt,
  };
}

// Direct-exec entry (ESM): run when invoked as a script.
if (import.meta.url === `file://${process.argv[1]}`) {
  runExp1Live()
    .then((out) => {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ kind: out.kind, taskCount: out.taskCount, arms: out.report.arms, verdict: out.verdict }, null, 2));
      if (out.kind !== 'verdict') {
        // eslint-disable-next-line no-console
        console.log(`\n⚠  ${out.kind.toUpperCase()} (n=${out.taskCount}) — not a full thesis verdict. Expand the suite to N≈50–100 (+ adversarial cases) for a defensible C1/C2/C3 result.`);
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('EXP-1 live run failed:', err);
      process.exitCode = 1;
    });
}
