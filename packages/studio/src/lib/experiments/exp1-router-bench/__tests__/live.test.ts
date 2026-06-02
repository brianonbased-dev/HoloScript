import { describe, it, expect } from 'vitest';

import { runExp1Live } from '../run';

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

describe.runIf(process.env.EXP1_LIVE === '1')('EXP-1 LIVE run (gated — spends)', () => {
  it(
    'runs the suite through the live provider and reports C1/C2/C3 + kill verdict',
    async () => {
      const out = await runExp1Live();
      // Surfaced for the operator; this IS the experiment output.
      // eslint-disable-next-line no-console
      console.log(
        'EXP1_LIVE_RESULT ' +
          JSON.stringify(
            { kind: out.kind, n: out.taskCount, arms: out.report.arms, verdict: out.verdict },
            null,
            2
          )
      );
      expect(out.taskCount).toBeGreaterThan(0);
      expect(out.report.arms.A.n).toBe(out.taskCount);
      expect(out.report.arms.C.n).toBe(out.taskCount);
    },
    600_000
  );
});
