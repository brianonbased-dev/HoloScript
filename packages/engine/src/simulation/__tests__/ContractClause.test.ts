import { describe, it, expect } from 'vitest';
import type { FieldData, SimSolver } from '../SimSolver';
import {
  ContractedSimulation,
  guardClauseFalsifiability,
  type ContractClause,
} from '../SimulationContract';

function mockSolver(fieldValue = 0.5): SimSolver & { fieldData: Float32Array } {
  const fieldData = new Float32Array([fieldValue, fieldValue, fieldValue]);
  return {
    mode: 'transient',
    fieldNames: ['stress'],
    fieldData,
    step(_dt: number) {},
    solve() {},
    getField(name: string): FieldData | null {
      return name === 'stress' ? this.fieldData : null;
    },
    getStats() {
      return { steps: 0 };
    },
    dispose() {},
  };
}

const MESH = {
  vertices: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  tetrahedra: new Uint32Array([0, 1, 2, 3]),
};

// ─── guardClauseFalsifiability ───────────────────────────────────────────────

describe('guardClauseFalsifiability', () => {
  function makeClause(evaluate: ContractClause['evaluate']): ContractClause {
    return {
      id: 'test',
      kind: 'invariant',
      description: 'test clause',
      evaluate,
    };
  }

  it('rejects bare () => true', () => {
    expect(() => guardClauseFalsifiability(makeClause(() => true))).toThrow(/trivially constant/);
  });

  it('rejects bare () => false', () => {
    expect(() => guardClauseFalsifiability(makeClause(() => false))).toThrow(/trivially constant/);
  });

  it('rejects () => 1 (numeric literal, JS-caller defense)', () => {
    // Cast through unknown: TS is satisfied; emitted JS is `() => 1`, so
    // guardClauseFalsifiability's source-inspection regex catches the literal.
    expect(() => guardClauseFalsifiability(makeClause(() => 1 as unknown as boolean))).toThrow(
      /trivially constant/
    );
  });

  it('rejects evaluator that reads no ClauseContext field', () => {
    expect(() =>
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      guardClauseFalsifiability(makeClause((_ctx) => Math.random() > 0))
    ).toThrow(/reads nothing from ClauseContext/);
  });

  it('accepts evaluator that reads ctx.getField', () => {
    expect(() =>
      guardClauseFalsifiability(
        makeClause((ctx) => {
          const f = ctx.getField('stress');
          if (!f) return true;
          return (f as Float32Array)[0] < 1e6;
        })
      )
    ).not.toThrow();
  });

  it('accepts evaluator that reads ctx.simTime', () => {
    expect(() => guardClauseFalsifiability(makeClause((ctx) => ctx.simTime < 100))).not.toThrow();
  });

  it('accepts evaluator that reads ctx.stepCount', () => {
    expect(() =>
      guardClauseFalsifiability(makeClause((ctx) => ctx.stepCount < 1000))
    ).not.toThrow();
  });

  it('accepts evaluator that reads ctx.config', () => {
    expect(() =>
      guardClauseFalsifiability(makeClause((ctx) => Boolean(ctx.config['solverType'])))
    ).not.toThrow();
  });
});

// ─── ContractedSimulation with clauses ──────────────────────────────────────

describe('ContractedSimulation — precondition clauses', () => {
  it('construction succeeds when precondition holds', () => {
    const solver = mockSolver(0.5);
    expect(
      () =>
        new ContractedSimulation(solver, MESH, {
          fixedDt: 0.01,
          clauses: [
            {
              id: 'step-count-is-zero',
              kind: 'precondition',
              description: 'Simulation must not have started',
              evaluate: (ctx) => ctx.stepCount === 0,
            },
          ],
        })
    ).not.toThrow();
  });

  it('construction throws when precondition is violated', () => {
    // stepCount > 0 is impossible at construction time — use a config-based check that always fails
    const solver = mockSolver(0.5);
    expect(
      () =>
        new ContractedSimulation(solver, MESH, {
          fixedDt: 0.01,
          clauses: [
            {
              id: 'impossible-precondition',
              kind: 'precondition',
              description: 'stepCount must be negative (never true)',
              evaluate: (ctx) => ctx.stepCount < 0,
            },
          ],
        })
    ).toThrow(/Precondition violation/);
  });
});

describe('ContractedSimulation — invariant clauses flip verified=false', () => {
  it('verified=true when invariant holds throughout', () => {
    const solver = mockSolver(0.1);
    const sim = new ContractedSimulation(solver, MESH, {
      fixedDt: 0.01,
      clauses: [
        {
          id: 'stress-bounded',
          kind: 'invariant',
          description: 'stress field must not exceed 1.0',
          evaluate: (ctx) => {
            const f = ctx.getField('stress') as Float32Array | null;
            if (!f) return true;
            for (let i = 0; i < f.length; i++) {
              if (f[i] > 1.0) return false;
            }
            return true;
          },
        },
      ],
    });

    sim.step(0.01);
    sim.step(0.01);

    const prov = sim.getProvenance();
    expect(prov.verified).toBe(true);
    expect(prov.clauseViolations).toHaveLength(0);
  });

  it('verified=false when invariant is violated mid-run', () => {
    const solver = mockSolver(2.0); // starts above threshold
    const sim = new ContractedSimulation(solver, MESH, {
      fixedDt: 0.01,
      clauses: [
        {
          id: 'stress-below-threshold',
          kind: 'invariant',
          description: 'stress must stay below 1.0',
          evaluate: (ctx) => {
            const f = ctx.getField('stress') as Float32Array | null;
            if (!f) return true;
            return f[0] < 1.0;
          },
        },
      ],
    });

    sim.step(0.01);

    const prov = sim.getProvenance();
    expect(prov.verified).toBe(false);
    expect(prov.clauseViolations).not.toHaveLength(0);
    const v = prov.clauseViolations![0];
    expect(v.clauseId).toBe('stress-below-threshold');
    expect(v.kind).toBe('invariant');
    expect(v.severity).toBe('error');
  });
});

describe('ContractedSimulation — postcondition clauses', () => {
  it('postcondition is evaluated at getProvenance(), not during stepping', () => {
    const solver = mockSolver(0.5);
    const sim = new ContractedSimulation(solver, MESH, {
      fixedDt: 0.01,
      clauses: [
        {
          id: 'at-least-one-step',
          kind: 'postcondition',
          description: 'simulation must have taken at least one step',
          evaluate: (ctx) => ctx.stepCount >= 1,
        },
      ],
    });

    // No steps yet — postcondition not yet evaluated
    // Step once
    sim.step(0.01);

    const prov = sim.getProvenance();
    // stepCount >= 1 → should pass
    expect(prov.verified).toBe(true);
    expect(prov.clauseViolations).toHaveLength(0);
  });

  it('postcondition is only evaluated once on repeated getProvenance() calls', () => {
    const solver = mockSolver(0.5);
    const sim = new ContractedSimulation(solver, MESH, {
      fixedDt: 0.01,
      clauses: [
        {
          id: 'time-check',
          kind: 'postcondition',
          description: 'simTime must be positive after steps',
          evaluate: (ctx) => ctx.simTime >= 0,
        },
      ],
    });
    sim.step(0.01);

    const prov1 = sim.getProvenance();
    const prov2 = sim.getProvenance();
    // violations should not accumulate on second call
    expect(prov1.clauseViolations?.length).toBe(prov2.clauseViolations?.length);
  });
});

describe('ContractedSimulation — warning severity does not fail verified', () => {
  it('warning-severity clause violation leaves verified=true', () => {
    const solver = mockSolver(5.0);
    const sim = new ContractedSimulation(solver, MESH, {
      fixedDt: 0.01,
      clauses: [
        {
          id: 'stress-warning',
          kind: 'invariant',
          description: 'stress should ideally be below 2.0',
          severity: 'warning',
          evaluate: (ctx) => {
            const f = ctx.getField('stress') as Float32Array | null;
            if (!f) return true;
            return f[0] < 2.0;
          },
        },
      ],
    });

    sim.step(0.01);

    const prov = sim.getProvenance();
    // warning-severity violations do not fail verified
    expect(prov.verified).toBe(true);
    expect(prov.clauseViolations).not.toHaveLength(0);
    expect(prov.clauseViolations![0].severity).toBe('warning');
  });
});
