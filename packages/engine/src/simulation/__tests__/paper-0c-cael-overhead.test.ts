import { describe, test, expect } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import { ContractedSimulation } from '../SimulationContract';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';

function mockSolver(): SimSolver & { time: number } {
  return {
    mode: 'transient',
    fieldNames: ['temperature'],
    time: 0,
    step(dt: number) {
      this.time += dt;
      // Small busy work to prevent completely zero-time steps
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
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
  const p99Index = Math.floor(n * 0.99);
  const p99 = sorted[p99Index];
  return { median, p99 };
}

describe('Paper 0c — CAEL Overhead Benchmark (Scenario 1)', () => {
  test('Provenance Overhead (10,000 ticks)', async () => {
    const runs = 10;
    const ticks = 10000;

    const uninstrumentedMs: number[] = [];
    const caelMs: number[] = [];
    const traceSizesMB: number[] = [];
    const verifyTimesMs: number[] = [];
    
    let sampleTraceStr = '';

    for (let r = 0; r < runs; r++) {
      // 1. Uninstrumented
      const solverUn = mockSolver();
      const simUn = new ContractedSimulation(
        solverUn,
        {
          vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
          tetrahedra: new Uint32Array([0, 1, 2, 3]),
        },
        { solverType: 'structural-tet10', fixedDt: 0.01 }
      );
      const t0_un = performance.now();
      for (let i = 0; i < ticks; i++) {
        // Perception, Cognition, Action, World Delta (skipped since uninstrumented)
        simUn.step(0.01);
      }
      const t1_un = performance.now();
      uninstrumentedMs.push(t1_un - t0_un);
      simUn.dispose();

      // 2. CAEL Instrumented
      const solverCAEL = mockSolver();
      const recorder = new CAELRecorder(
        solverCAEL,
        {
          vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
          tetrahedra: new Uint32Array([0, 1, 2, 3]),
        },
        { solverType: 'structural-tet10', fixedDt: 0.01 }
      );

      const payloadPerception = { encoded: new Float32Array([1, 2, 3, 4, 5, 6]) };
      const payloadCognition = { spikes: new Uint8Array([1, 0, 1, 0]), goal: 'stabilize' };
      const payloadAction = { type: 'modify_load', node: 42, value: [0, -100, 0] };
      const payloadDelta = { nodes: [42], newForce: [0, -100, 0] };

      const t0_cael = performance.now();
      for (let i = 0; i < ticks; i++) {
        recorder.logInteraction('cael.perception', payloadPerception);
        recorder.logInteraction('cael.cognition', payloadCognition);
        recorder.logInteraction('cael.action', payloadAction);
        recorder.logInteraction('cael.world_delta', payloadDelta);
        recorder.step(0.01);
      }
      recorder.finalize();
      const t1_cael = performance.now();
      caelMs.push(t1_cael - t0_cael);

      const jsonl = recorder.toJSONL();
      if (r === 0) sampleTraceStr = jsonl;
      traceSizesMB.push(Buffer.byteLength(jsonl, 'utf8') / 1024 / 1024);

      // Verify
      const trace = parseCAELJSONL(jsonl);
      const t0_v = performance.now();
      const verifyResult = verifyCAELHashChain(trace);
      const t1_v = performance.now();
      
      expect(verifyResult.valid).toBe(true);
      expect(trace.length).toBe(ticks * 5 + 2); // Genesis, 5 per tick, Final
      
      verifyTimesMs.push(t1_v - t0_v);
      recorder.dispose();
    }

    const unStats = calcStats(uninstrumentedMs);
    const caelStats = calcStats(caelMs);
    const verifyStats = calcStats(verifyTimesMs);
    const mbStats = calcStats(traceSizesMB);

    const overheadTotalMs = caelStats.median - unStats.median;
    
    // Per tick medians:
    const unTickMedianMs = unStats.median / ticks;
    const caelTickMedianMs = caelStats.median / ticks;
    
    const tickOverheadMs = caelTickMedianMs - unTickMedianMs;
    const frameBudgetMs = 16.67; // 60Hz
    const overheadPercent = (tickOverheadMs / frameBudgetMs) * 100;

    console.log(`\nPaper 0c: CAEL Provenance Overhead Benchmark`);
    console.log(`Runs: ${runs}, Ticks per run: ${ticks}`);
    console.log(`Uninstrumented Median Tick: ${unTickMedianMs.toFixed(4)} ms`);
    console.log(`CAEL Median Tick:           ${caelTickMedianMs.toFixed(4)} ms`);
    console.log(`Overhead per tick:        ${(tickOverheadMs * 1000).toFixed(2)} µs`);
    console.log(`Total Time Uninstrumented: ${unStats.median.toFixed(2)} ms (median) / ${unStats.p99.toFixed(2)} ms (p99)`);
    console.log(`Total Time CAEL:          ${caelStats.median.toFixed(2)} ms (median) / ${caelStats.p99.toFixed(2)} ms (p99)`);
    console.log(`Relative Overhead (vs 60Hz frame budget): ${overheadPercent.toFixed(2)}%`);
    console.log(`JSONL Size:               ${mbStats.median.toFixed(2)} MB`);
    console.log(`Verify Time:              ${verifyStats.median.toFixed(2)} ms (median) / ${verifyStats.p99.toFixed(2)} ms (p99)\n`);

    // The relative overhead against the 16.67ms frame budget should be < 1.5%
    expect(overheadPercent).toBeLessThan(1.5); 
  }, 60000);
});
