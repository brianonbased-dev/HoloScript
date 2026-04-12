import { describe, expect, it } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import { CAELRecorder } from '../CAELRecorder';
import { CAELReplayer } from '../CAELReplayer';
import { forkAndChoose, dream, type ForkAlternative } from '../CAELForkDream';
import { parseCAELJSONL, verifyCAELHashChain } from '../CAELTrace';

interface MockConfig {
  loadScale: number;
}

function mockStructuralFactory(config: Record<string, unknown>): SimSolver & {
  leftLoad: number;
  rightLoad: number;
  safety: Float32Array;
  stepCount: number;
  updateLoad: (id: string, force: [number, number, number]) => void;
} {
  const cfg = config as MockConfig;
  return {
    mode: 'transient',
    fieldNames: ['safety_factor', 'von_mises_stress'],
    leftLoad: cfg.loadScale ?? 0,
    rightLoad: 0,
    safety: new Float32Array([1, 1, 1, 1]),
    stepCount: 0,
    step(dt: number) {
      this.stepCount += 1;
      const signal = 1 + this.rightLoad * 0.005 - this.leftLoad * 0.005 - dt * 0.01;
      const bounded = Math.max(0.05, Math.min(5, signal));
      this.safety.fill(bounded);

      if (this.leftLoad + this.rightLoad > 54) {
        throw new Error('solver diverged');
      }
    },
    solve() {},
    getField(name: string): FieldData | null {
      if (name === 'safety_factor') return this.safety;
      if (name === 'von_mises_stress') {
        const stress = new Float32Array(this.safety.length);
        for (let i = 0; i < stress.length; i++) {
          stress[i] = 1 / Math.max(this.safety[i], 1e-6);
        }
        return stress;
      }
      return null;
    },
    getStats() {
      return {
        stepCount: this.stepCount,
        leftLoad: this.leftLoad,
        rightLoad: this.rightLoad,
        minSafety: Math.min(...this.safety),
      };
    },
    updateLoad(id: string, force: [number, number, number]) {
      const magnitude = force[0] + force[1] + force[2];
      if (id.includes('left')) this.leftLoad = magnitude;
      else this.rightLoad = magnitude;
    },
    dispose() {},
  };
}

describe('CAEL Phase 3: forking + dreaming', () => {
  it('forks at timestep, evaluates branches, picks higher safety-factor branch, keeps both traces replayable', async () => {
    const baseConfig = {
      loadScale: 10,
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
    };

    const wakingRecorder = new CAELRecorder(
      mockStructuralFactory(baseConfig),
      baseConfig,
      { fixedDt: 0.01, solverType: 'mock-structural' }
    );

    for (let i = 0; i < 5; i++) wakingRecorder.step(0.01);
    wakingRecorder.finalize();
    const wakingTrace = wakingRecorder.getTrace();

    const alternatives: ForkAlternative[] = [
      {
        id: 'branch-left',
        apply: (recorder) => {
          const solver = recorder.getSolver() as unknown as {
            updateLoad: (id: string, force: [number, number, number]) => void;
          };
          solver.updateLoad('left-load', [20, 0, 0]);
        },
      },
      {
        id: 'branch-right',
        apply: (recorder) => {
          const solver = recorder.getSolver() as unknown as {
            updateLoad: (id: string, force: [number, number, number]) => void;
          };
          solver.updateLoad('right-load', [20, 0, 0]);
        },
      },
    ];

    const result = await forkAndChoose(
      wakingTrace,
      5,
      alternatives,
      10,
      0.01,
      (cfg) => mockStructuralFactory(cfg),
      async (recorder) => {
        const safety = recorder.getSolver().getField('safety_factor') as Float32Array;
        return safety.reduce((a, b) => a + b, 0) / Math.max(1, safety.length);
      }
    );

    expect(result.branches.length).toBe(2);
    expect(result.winnerId).toBe('branch-right');

    for (const branch of result.branches) {
      const trace = parseCAELJSONL(branch.traceJSONL);
      expect(verifyCAELHashChain(trace).valid).toBe(true);

      const replayed = await new CAELReplayer(branch.traceJSONL).replay((cfg) =>
        mockStructuralFactory(cfg)
      );
      replayed.dispose();
    }
  });

  it('runs deterministic dream episodes with perturbations and provenance linkage', async () => {
    const wakingConfig = {
      loadScale: 50,
      vertices: new Float64Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
      tetrahedra: new Uint32Array([0, 1, 2, 3]),
    };

    const wakingRecorder = new CAELRecorder(
      mockStructuralFactory(wakingConfig),
      wakingConfig,
      { fixedDt: 0.01, solverType: 'mock-structural' }
    );

    for (let i = 0; i < 10; i++) wakingRecorder.step(0.01);
    wakingRecorder.finalize();

    const wakingJSONL = wakingRecorder.toJSONL();
    const dreamResult = await dream(
      wakingJSONL,
      {
        episodes: 5,
        steps: 10,
        dt: 0.01,
        fields: ['loadScale'],
        perturbationPercent: 0.1,
        seed: 1337,
      },
      (cfg) => mockStructuralFactory(cfg)
    );

    expect(dreamResult.episodes.length).toBe(5);
    const completedCount = dreamResult.episodes.filter((e) => e.completed).length;
    expect(completedCount).toBeGreaterThanOrEqual(3);

    for (const episode of dreamResult.episodes) {
      const trace = parseCAELJSONL(episode.traceJSONL);
      expect(verifyCAELHashChain(trace).valid).toBe(true);

      const dreamLink = trace
        .filter((e) => e.event === 'interaction')
        .find((e) => String(e.payload.type) === 'cael.dream');

      expect(dreamLink).toBeDefined();
      expect(dreamLink?.payload.data).toBeDefined();
    }
  });
});
