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
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1 || 1);
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
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

    const overheadTotalMs = caelStats.mean - unStats.mean;
    const overheadPercent = (overheadTotalMs / unStats.mean) * 100;
    
    // Per tick means:
    const unTickMeanMs = unStats.mean / ticks;
    const caelTickMeanMs = caelStats.mean / ticks;

    console.log(`\nPaper 0c: CAEL Provenance Overhead Benchmark`);
    console.log(`Runs: ${runs}, Ticks per run: ${ticks}`);
    console.log(`Uninstrumented Mean Tick: ${unTickMeanMs.toFixed(4)} ms`);
    console.log(`CAEL Mean Tick:           ${caelTickMeanMs.toFixed(4)} ms`);
    console.log(`Overhead per tick:        ${((caelTickMeanMs - unTickMeanMs) * 1000).toFixed(2)} µs`);
    console.log(`Total Time Uninstrumented: ${unStats.mean.toFixed(2)} ms ± ${unStats.stddev.toFixed(2)} ms`);
    console.log(`Total Time CAEL:          ${caelStats.mean.toFixed(2)} ms ± ${caelStats.stddev.toFixed(2)} ms`);
    console.log(`Relative Overhead:        ${overheadPercent.toFixed(2)}%`);
    console.log(`JSONL Size:               ${mbStats.mean.toFixed(2)} MB`);
    console.log(`Verify Time:              ${verifyStats.mean.toFixed(2)} ms ± ${verifyStats.stddev.toFixed(2)} ms\n`);

    expect(caelTickMeanMs - unTickMeanMs).toBeLessThan(0.15); // Overhead should be < 150 microseconds per tick
  }, 60000);
});
