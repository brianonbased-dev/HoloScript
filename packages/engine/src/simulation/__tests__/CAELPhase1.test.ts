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

describe('CAEL Phase 1 hash-chain core', () => {
  it('records init/step/interaction/final as hash-chained JSONL', () => {
    const recorder = new CAELRecorder(
      mockSolver(),
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { solverType: 'structural-tet10', fixedDt: 0.01 }
    );

    recorder.step(0.03);
    recorder.logInteraction('set_load', { node: 1, force: 1000 });
    const provenance = recorder.finalize();

    const jsonl = recorder.toJSONL();
    const trace = parseCAELJSONL(jsonl);

    expect(trace.length).toBe(4);
    expect(trace[0].event).toBe('init');
    expect(trace[1].event).toBe('step');
    expect(trace[2].event).toBe('interaction');
    expect(trace[3].event).toBe('final');
    expect(provenance.totalSteps).toBeGreaterThanOrEqual(2);
    expect(provenance.totalSteps).toBeLessThanOrEqual(3);

    const verification = verifyCAELHashChain(trace);
    expect(verification.valid).toBe(true);
  });

  it('detects tampering through hash-chain verification', () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01 });
    recorder.step(0.02);
    recorder.finalize();

    const trace = recorder.getTrace();
    trace[1] = {
      ...trace[1],
      payload: { ...trace[1].payload, wallDelta: 999 },
    };

    const verification = verifyCAELHashChain(trace);
    expect(verification.valid).toBe(false);
    expect(verification.brokenAt).toBe(1);
  });

  it('replays a CAEL JSONL artifact into equivalent contracted simulation state', async () => {
    const recorder = new CAELRecorder(mockSolver(), {}, { fixedDt: 0.01, solverType: 'thermal' });
    recorder.step(0.05);
    recorder.logInteraction('toggle_boundary', { face: 'left', value: 42 });
    recorder.step(0.03);
    const originalProvenance = recorder.finalize();

    const jsonl = recorder.toJSONL();
    const replayer = new CAELReplayer(jsonl);
    const replayed = await replayer.replay(() => mockSolver());
    const replayedProvenance = replayed.getProvenance();

    expect(replayedProvenance.totalSteps).toBe(originalProvenance.totalSteps);
    expect(replayedProvenance.totalSimTime).toBeCloseTo(originalProvenance.totalSimTime);
    expect(replayedProvenance.interactions.length).toBe(originalProvenance.interactions.length);
    expect(replayedProvenance.interactions[0].type).toBe('toggle_boundary');

    replayed.dispose();
  });
});
