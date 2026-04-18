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

function calcStats(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const n = sorted.length;
  const median = n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
  const p99Index = Math.min(n - 1, Math.floor(n * 0.99));
  const p99 = sorted[p99Index];
  return { median, p99 };
}

describe('Paper #1 — CAEL verifier / replay benchmark (PAPER-GAP-06)', () => {
  /** Each `step()` adds one row after `init`; `finalize()` adds `final`. Entries = steps + 2. */
  function buildTrace(steps: number): { jsonl: string; entryCount: number } {
    const recorder = new CAELRecorder(
      mockSolver(),
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { solverType: 'structural-tet10', fixedDt: 0.01 }
    );
    for (let i = 0; i < steps; i++) {
      recorder.step(0.01);
    }
    recorder.finalize();
    const jsonl = recorder.toJSONL();
    const trace = parseCAELJSONL(jsonl);
    return { jsonl, entryCount: trace.length };
  }

  it('reports verify-only median/p99 at multiple trace lengths (table splits)', async () => {
    const stepTargets = [98, 998, 9998, 99995];
    const verifyRuns = 10;

    console.log('\n[paper-cael-replay-benchmark] === verify-only splits (us/entry median, p99) ===');
    for (const steps of stepTargets) {
      const { jsonl, entryCount } = buildTrace(steps);
      const trace = parseCAELJSONL(jsonl);
      expect(trace.length).toBe(entryCount);

      const verifySamplesUs: number[] = [];
      for (let r = 0; r < verifyRuns; r++) {
        const t0 = performance.now();
        const v = verifyCAELHashChain(trace);
        const t1 = performance.now();
        expect(v.valid).toBe(true);
        const runTimeMs = t1 - t0;
        verifySamplesUs.push((runTimeMs * 1000) / entryCount);
      }
      const stats = calcStats(verifySamplesUs);
      const totalMedianMs = (stats.median * entryCount) / 1000;
      console.log(
        `[paper-cael-replay-benchmark] entries=${entryCount} steps=${steps} ` +
          `totalMedian=${totalMedianMs.toFixed(3)}ms ` +
          `us/entry med=${stats.median.toFixed(4)} p99=${stats.p99.toFixed(4)}`
      );
    }
  }, 600_000);

  it('reports verify-only vs full replay wall time (~100k entries)', async () => {
    const steps = 99995;
    const { jsonl, entryCount } = buildTrace(steps);
    expect(entryCount).toBeGreaterThan(90_000);

    const trace = parseCAELJSONL(jsonl);
    const verifyRuns = 10;
    const verifySamplesUs: number[] = [];

    for (let r = 0; r < verifyRuns; r++) {
      const t0 = performance.now();
      const v = verifyCAELHashChain(trace);
      const t1 = performance.now();
      expect(v.valid).toBe(true);

      const runTimeMs = t1 - t0;
      const perEntryUs = (runTimeMs * 1000) / entryCount;
      verifySamplesUs.push(perEntryUs);
    }

    const stats = calcStats(verifySamplesUs);

    const replayer = new CAELReplayer(jsonl);
    const t1 = performance.now();
    const chain = replayer.verify();
    expect(chain.valid).toBe(true);
    const replaySim = await replayer.replay(() => mockSolver());
    replaySim.dispose();
    const replayMs = performance.now() - t1;

    console.log(
      `\n[paper-cael-replay-benchmark] entries=${entryCount} verifyRuns=${verifyRuns} ` +
        `verify: ${stats.median.toFixed(4)} us/entry median (p99: ${stats.p99.toFixed(4)} us/entry) `
    );
    console.log(
      `[paper-cael-replay-benchmark] single replayer.verify+replay wall ${replayMs.toFixed(2)}ms (${entryCount} entries)`
    );

    expect(replayMs).toBeLessThan(120_000);
  }, 120_000);
});
