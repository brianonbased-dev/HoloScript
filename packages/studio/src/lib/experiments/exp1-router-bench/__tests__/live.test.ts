import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import { runExp1Live } from '../run';

/**
 * Persist the full run result + receipt as a durable artifact. Vitest's reporter
 * swallows console.log on pass, and the experiment output is provenance — it must
 * survive as a file, not just stdout. Dir overridable via EXP1_OUT_DIR.
 */
function persistResult(tag: string, out: unknown): string {
  const dir = process.env.EXP1_OUT_DIR || join(process.cwd(), '.exp1-results');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${tag}.json`);
  writeFileSync(path, JSON.stringify(out, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`EXP1_RESULT_WRITTEN ${path}`);
  return path;
}

/**
 * Per-test timeout (ms). Local Ollama is slow (~10s/call); a full 38-task suite
 * is 114 calls ≈ 25–30 min, well past the default 10-min cap. Set EXP1_TIMEOUT_MS
 * for the full local run (e.g. 2400000 = 40 min). Frontier (network) is faster.
 */
const LIVE_TIMEOUT_MS = Number(process.env.EXP1_TIMEOUT_MS) || 600_000;
const FRONTIER_TIMEOUT_MS = Number(process.env.EXP1_TIMEOUT_MS) || 900_000;

/**
 * EXP-1 LIVE run harness (vitest-gated). Vitest's resolver handles the full
 * provider chain (@holoscript/llm-provider) that raw `tsx` standalone does not.
 *
 * SOVEREIGN BY DEFAULT — runs on a LOCAL Ollama model (no credits, no external
 * vendor), dogfooding the thesis. Skipped by default (no spend, no network).
 *
 * To run the real bench (sovereign):
 *   # ensure Ollama is up with the models (qwen2.5-coder:7b + :1.5b), then:
 *   $env:EXP1_LIVE='1'
 *   pnpm --filter @holoscript/studio exec vitest run \
 *     src/lib/experiments/exp1-router-bench/__tests__/live.test.ts
 *
 * To include a frontier baseline (the bar to beat — the ONLY billing path):
 *   set config.frontierBaseline + a funded ANTHROPIC_API_KEY. That is an explicit
 *   opt-in, never the default.
 */

describe('EXP-1 live runner wiring', () => {
  it('exposes runExp1Live as a callable (import-resolves under vitest)', () => {
    expect(typeof runExp1Live).toBe('function');
  });
});

// Sovereign (all-local) block. Skipped when EXP1_FRONTIER_ONLY=1 so a frontier
// run need not redo the ~19-min local pass. (Prefer this env gate over vitest's
// -t name filter, which forks an unstable worker pool and crashed mid-run.)
describe.runIf(
  process.env.EXP1_LIVE === '1' && process.env.EXP1_FRONTIER_ONLY !== '1'
)('EXP-1 LIVE run (gated — spends)', () => {
  it(
    'runs the suite through the live provider and reports C1/C2/C3 + kill verdict',
    async () => {
      const out = await runExp1Live();
      persistResult('sovereign', out);
      expect(out.taskCount).toBeGreaterThan(0);
      expect(out.report.arms.A.n).toBe(out.taskCount);
      expect(out.report.arms.C.n).toBe(out.taskCount);
    },
    LIVE_TIMEOUT_MS
  );
});

/**
 * FRONTIER-BASELINE run (the headline "small local vs big frontier" bar) — the
 * ONLY billing path. Doubly gated: EXP1_LIVE=1 AND EXP1_FRONTIER=1, with a funded
 * ANTHROPIC_API_KEY (BRITTNEY_PROVIDER=anthropic). Arms A/B run on the frontier
 * model; Arm C stays on the local lite model. C2 then measures local-lite+offload
 * against the frontier bar directly.
 */
describe.runIf(process.env.EXP1_LIVE === '1' && process.env.EXP1_FRONTIER === '1')(
  'EXP-1 FRONTIER baseline run (gated — BILLS the frontier vendor)',
  () => {
    it(
      'runs A/B on the frontier model, Arm C on local lite, reports the vs-frontier verdict',
      async () => {
        const out = await runExp1Live({ frontierBaseline: true });
        persistResult('frontier', out);
        expect(out.taskCount).toBeGreaterThan(0);
        expect(out.baselineProvider).toBe('anthropic');
        expect(out.liteProvider).toBe('ollama');
      },
      FRONTIER_TIMEOUT_MS
    );
  }
);
