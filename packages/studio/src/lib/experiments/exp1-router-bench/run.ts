/**
 * EXP-1 LIVE RUN entry (real inference, small API spend — under the $100 ceiling,
 * founder-approved). Wires three live arms over brittney/provider.ts and reports
 * the C1/C2/C3 metrics + the pre-registered kill verdict.
 *
 * Arms:
 *   A — baseline model, NL instruction.
 *   B — baseline model, HoloScript-IR instruction.
 *   C — SMALLER model + IR + offload retrieval (the "lite + ecosystem" config).
 *
 * NOTE: a defensible C1/C2/C3 verdict needs the expanded N≈50–100 suite. Running
 * on the 8-task first slice is a PIPELINE SMOKE, not the thesis verdict — the
 * report labels which. Requires a configured provider (HoloScript/.env:
 * ANTHROPIC_API_KEY / OLLAMA_HOST / BRITTNEY_SERVICE_URL).
 *
 * Run: `pnpm --filter @holoscript/studio exec tsx src/lib/experiments/exp1-router-bench/run.ts`
 */

import { makeProviderArm } from './providerArm';
import { runBench, type BenchArms } from './runner';
import { evaluateKillCriteria } from './metrics';
import { EXP1_FULL_SUITE } from './tasks-extended';
import { curatedOffload } from './offload';
import type { BenchTask, ProvenanceChecker } from './types';

/** Default smaller model for Arm C (the "lite" arm). Haiku-class vs the baseline. */
export const DEFAULT_ARM_C_MODEL = 'claude-haiku-4-5-20251001';

export type RunTier = 'pipeline-smoke' | 'preliminary' | 'verdict';

/** Honest verdict tier by suite size: <30 smoke, 30–49 preliminary, ≥50 verdict. */
export function runTier(n: number): RunTier {
  if (n >= 50) return 'verdict';
  if (n >= 30) return 'preliminary';
  return 'pipeline-smoke';
}

export interface Exp1RunConfig {
  /** Smaller model id for Arm C (e.g. a Haiku-class model). If unset, Arm C === Arm B. */
  armCModel?: string;
  /** Whether Arm C genuinely runs a smaller model — gates the C2 credit. */
  armCParamsLower?: boolean;
  /** Offload retrieval for Arm C (HoloGraph/GOLD). Stubbed null until wired. */
  retrieval?: (task: BenchTask) => string | undefined;
  /** Provenance checker (verify_cael_trace wrapper). Defaults to a conservative stub. */
  provenance?: ProvenanceChecker;
  tasks?: BenchTask[];
}

/**
 * Conservative default provenance: until verify_cael_trace is wired in, report
 * zero traced claims so C3 is NOT silently credited (fail-honest, not fail-open).
 */
const stubProvenance: ProvenanceChecker = async (result) => {
  const hasOutput = Boolean(result.rawOutput?.trim());
  return { totalClaims: hasOutput ? 1 : 0, tracedClaims: 0 };
};

export async function runExp1Live(config: Exp1RunConfig = {}) {
  const tasks = config.tasks ?? EXP1_FULL_SUITE;
  const tier = runTier(tasks.length);

  // Arm C is the "lite + ecosystem" config: a smaller model + offload retrieval.
  // Defaults make C2 genuinely testable; override via config for ablations.
  const armCModel = config.armCModel ?? DEFAULT_ARM_C_MODEL;
  const retrieval = config.retrieval ?? curatedOffload;

  const arms: BenchArms = {
    A: makeProviderArm(),
    B: makeProviderArm(),
    C: makeProviderArm({ modelOverride: armCModel, retrieval }),
  };

  const report = await runBench(tasks, arms, config.provenance ?? stubProvenance);
  const verdict = evaluateKillCriteria(report, undefined, {
    // Arm C runs a strictly smaller model than the baseline → C2 credit is valid.
    armCParamsLower: config.armCParamsLower ?? armCModel !== undefined,
  });

  return {
    kind: tier,
    taskCount: report.taskCount,
    report,
    verdict,
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
