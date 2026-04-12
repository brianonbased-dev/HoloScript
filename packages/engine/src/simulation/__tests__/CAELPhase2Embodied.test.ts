import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import {
  CAELAgentLoop,
  FieldSensorBridge,
  SimpleActionSelector,
  StructuralActionMapper,
} from '../CAELAgent';
import { SNNCognitionEngine } from '../SNNCognitionEngine';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';

function mockStructuralLikeSolver(): SimSolver & {
  field: Float32Array;
  stepCount: number;
  loadScale: number;
  updateLoad: (id: string, force: [number, number, number]) => void;
} {
  return {
    mode: 'transient',
    fieldNames: ['von_mises_stress'],
    field: new Float32Array([0.1, 0.3, 0.7, 1.1, 0.6, 0.2]),
    stepCount: 0,
    loadScale: 0,
    step(dt: number) {
      this.stepCount += 1;
      for (let i = 0; i < this.field.length; i++) {
        this.field[i] = this.field[i] + dt * 0.05 + this.loadScale * 0.001;
      }
    },
    solve() {},
    getField(name: string): FieldData | null {
      if (name === 'von_mises_stress') return this.field;
      return null;
    },
    getStats() {
      return { stepCount: this.stepCount, loadScale: this.loadScale };
    },
    updateLoad(_id: string, force: [number, number, number]) {
      this.loadScale = force[0] + force[1] + force[2];
    },
    dispose() {},
  };
}

describe('CAEL Phase 2 embodied loop', () => {
  it('produces a valid end-to-end CAEL trace with perception/cognition/action/world delta', async () => {
    const solver = mockStructuralLikeSolver();
    const recorder = new CAELRecorder(
      solver,
      {
        vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
        tetrahedra: new Uint32Array([0, 1, 2, 3]),
      },
      { fixedDt: 0.01, solverType: 'structural-agent-loop' }
    );

    const sensor = new FieldSensorBridge({
      fieldName: 'von_mises_stress',
      points: [{ x: 0.0 }, { x: 0.5 }, { x: 1.0 }],
    });

    const cognition = new SNNCognitionEngine({ neuronCount: 8, inputScalemV: 20 });
    await cognition.initialize();
    const selector = new SimpleActionSelector({ defaultActionType: 'hold' });
    const mapper = new StructuralActionMapper({
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      elements: new Uint32Array([0, 1, 2, 3]),
      integrityFieldName: 'von_mises_stress',
    });

    const loop = new CAELAgentLoop(recorder, {
      agentId: 'agent-1',
      sensor,
      cognition,
      actionSelector: selector,
      actionMapper: mapper,
      recordFullState: true,
    });

    const decision = await loop.tick(0.03);
    expect(decision.chosen.type.length).toBeGreaterThan(0);

    const prov = recorder.finalize();
    expect(prov.totalSteps).toBeGreaterThan(0);

    const trace = parseCAELJSONL(loop.toJSONL());
    const verification = verifyCAELHashChain(trace);
    expect(verification.valid).toBe(true);

    const interactionTypes = trace
      .filter((e) => e.event === 'interaction')
      .map((e) => String(e.payload.type));

    expect(interactionTypes).toContain('cael.perception');
    expect(interactionTypes).toContain('cael.cognition');
    expect(interactionTypes).toContain('cael.action');
    expect(interactionTypes).toContain('cael.world_delta');
  });
});
