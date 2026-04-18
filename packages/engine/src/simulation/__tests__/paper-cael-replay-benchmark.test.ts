/**
 * Paper #1 / PAPER-GAP-06 — Independent CAEL hash-chain verify + replay timing.
 *
 * Measures `verifyCAELHashChain` (verifier-only) vs full `CAELReplayer.verify` + `replay`
 * on a non-trivial trace. Logs ms and entries/s for methods text.
 *
 * Run: pnpm --filter @holoscript/engine exec vitest run src/simulation/__tests__/paper-cael-replay-benchmark.test.ts
 */

import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import { CAELReplayer } from '../CAELReplayer';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) {
      this.time += dt;
    },
    solve() {},
    getField(): FieldData | null {
      return new Float32Array([this.time, this.time + 1, this.time + 2]);
    },
    getStats() {
      return { converged: true, currentTime: this.time };
    },
    dispose() {},
  };
}

describe('Paper #1 — CAEL verifier / replay benchmark (PAPER-GAP-06)', () => {
  it('reports verify-only vs full replay wall time', async () => {
    const recorder = new CAELRecorder(
      mockSolver(),
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { solverType: 'structural-tet10', fixedDt: 0.01 }
    );

    const steps = 200;
    for (let i = 0; i < steps; i++) {
      recorder.step(0.01);
      if (i % 40 === 0) {
        recorder.logInteraction('bench_tick', { i, phase: 1 });
      }
    }
    recorder.finalize();

    const jsonl = recorder.toJSONL();
    const trace = parseCAELJSONL(jsonl);
    const entryCount = trace.length;
    expect(entryCount).toBeGreaterThan(10);

    const verifyRuns = 400;
    const t0 = performance.now();
    for (let r = 0; r < verifyRuns; r++) {
      const v = verifyCAELHashChain(trace);
      expect(v.valid).toBe(true);
    }
    const verifyMs = performance.now() - t0;

    const replayer = new CAELReplayer(jsonl);
    const t1 = performance.now();
    const chain = replayer.verify();
    expect(chain.valid).toBe(true);
    const replaySim = await replayer.replay(() => mockSolver());
    replaySim.dispose();
    const replayMs = performance.now() - t1;

    const perVerifyUs = (verifyMs / verifyRuns / entryCount) * 1000;
    const entriesPerSec = (entryCount * verifyRuns) / (verifyMs / 1000);

    console.log(
      `\n[paper-cael-replay-benchmark] entries=${entryCount} verifyRuns=${verifyRuns} ` +
        `verify total ${verifyMs.toFixed(2)}ms (${perVerifyUs.toFixed(4)} µs/entry avg) ` +
        `~${entriesPerSec.toFixed(0)} entry-verifications/s`
    );
    console.log(
      `[paper-cael-replay-benchmark] single replayer.verify+replay wall ${replayMs.toFixed(2)}ms (${entryCount} entries)`
    );

    expect(replayMs).toBeLessThan(60_000);
    expect(verifyMs).toBeLessThan(60_000);
  });
});
