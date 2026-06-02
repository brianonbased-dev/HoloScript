import { describe, it, expect } from 'vitest';

import { runExp1Live } from '../run';

/**
 * EXP-1 LIVE run harness (vitest-gated). Vitest's resolver handles the full
 * provider chain (@holoscript/llm-provider) that raw `tsx` standalone does not.
 *
 * Skipped by default (no spend, no network). To run the real bench:
 *   $env:ANTHROPIC_API_KEY=<key>; $env:EXP1_LIVE='1'
 *   pnpm --filter @holoscript/studio vitest run \
 *     src/lib/experiments/exp1-router-bench/__tests__/live.test.ts --reporter=basic
 *
 * Real Anthropic spend (~taskCount×3 completions; Arm C on a smaller model).
 * Under the $100 ceiling — log via the allowance ledger when run.
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
