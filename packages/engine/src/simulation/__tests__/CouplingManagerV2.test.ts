import { describe, it, expect } from 'vitest';
import { CouplingManagerV2 } from '../CouplingManagerV2';
import { RegularGrid3D } from '../RegularGrid3D';
import type { SimSolver, FieldData, SolverMode } from '../SimSolver';

/**
 * Minimal SimSolver holding named FieldData buffers verbatim, so a coupling's
 * transferred VALUES can be asserted directly (independent of any real solver's
 * physics). step()/solve() are no-ops, so a field only changes when a coupling
 * writes to it.
 */
class MockSolver implements SimSolver {
  constructor(
    readonly mode: SolverMode,
    private readonly fields: Map<string, FieldData>
  ) {}
  get fieldNames(): readonly string[] {
    return [...this.fields.keys()];
  }
  step(): void {}
  solve(): void {}
  getField(name: string): FieldData | null {
    return this.fields.get(name) ?? null;
  }
  getStats(): Record<string, unknown> {
    return {};
  }
  dispose(): void {}
}

function grid(values: number[]): RegularGrid3D {
  // resolution [n,1,1] → data length n (components = 1)
  const g = new RegularGrid3D([values.length, 1, 1], [1, 1, 1], 1);
  g.data.set(values);
  return g;
}

describe('CouplingManagerV2 field transfer', () => {
  it('transfers array → grid (previously a silent no-op — the live coupling bug)', async () => {
    const src = new MockSolver('transient', new Map<string, FieldData>([['t', Float32Array.from([1, 2, 3, 4])]]));
    const dst = new MockSolver('steady-state', new Map<string, FieldData>([['g', grid([0, 0, 0, 0])]]));
    const cm = new CouplingManagerV2();
    cm.registerSolver('src', src);
    cm.registerSolver('dst', dst);
    cm.addCoupling({
      source: { solver: 'src', field: 't' },
      target: { solver: 'dst', field: 'g' },
      transform: (v) => v * 2,
    });

    await cm.step(0.001);

    const out = dst.getField('g') as RegularGrid3D;
    expect(Array.from(out.data)).toEqual([2, 4, 6, 8]);
  });

  it('transfers grid → array and applies the transform', async () => {
    const src = new MockSolver('transient', new Map<string, FieldData>([['g', grid([10, 20, 30])]]));
    const dst = new MockSolver('steady-state', new Map<string, FieldData>([['a', new Float32Array(3)]]));
    const cm = new CouplingManagerV2();
    cm.registerSolver('src', src);
    cm.registerSolver('dst', dst);
    cm.addCoupling({
      source: { solver: 'src', field: 'g' },
      target: { solver: 'dst', field: 'a' },
      transform: (v) => v + 1,
    });

    await cm.step(0.001);

    expect(Array.from(dst.getField('a') as Float32Array)).toEqual([11, 21, 31]);
  });

  it('transfers array → array', async () => {
    const src = new MockSolver('transient', new Map<string, FieldData>([['a', Float32Array.from([5, 6])]]));
    const dst = new MockSolver('steady-state', new Map<string, FieldData>([['b', new Float32Array(2)]]));
    const cm = new CouplingManagerV2();
    cm.registerSolver('src', src);
    cm.registerSolver('dst', dst);
    cm.addCoupling({
      source: { solver: 'src', field: 'a' },
      target: { solver: 'dst', field: 'b' },
      transform: (v) => v,
    });

    await cm.step(0.001);

    expect(Array.from(dst.getField('b') as Float32Array)).toEqual([5, 6]);
  });

  it('THROWS on an element-count mismatch instead of silently transferring a prefix', async () => {
    const src = new MockSolver('transient', new Map<string, FieldData>([['t', Float32Array.from([1, 2, 3, 4])]]));
    const dst = new MockSolver('steady-state', new Map<string, FieldData>([['g', grid([0, 0, 0])]])); // length 3 ≠ 4
    const cm = new CouplingManagerV2();
    cm.registerSolver('src', src);
    cm.registerSolver('dst', dst);
    cm.addCoupling({
      source: { solver: 'src', field: 't' },
      target: { solver: 'dst', field: 'g' },
      transform: (v) => v,
    });

    await expect(cm.step(0.001)).rejects.toThrow(/differ|equal element counts|Cross-discretization/);
  });
});
