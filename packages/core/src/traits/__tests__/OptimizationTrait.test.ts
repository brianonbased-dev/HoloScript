/**
 * OptimizationTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { optimizationHandler, type ComputableObjective } from '../OptimizationTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __optState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_iterations: 1000, tolerance: 1e-6 };

describe('OptimizationTrait', () => {
  it('has name "optimization"', () => {
    expect(optimizationHandler.name).toBe('optimization');
  });

  it('defaultConfig max_iterations=1000', () => {
    expect(optimizationHandler.defaultConfig?.max_iterations).toBe(1000);
  });

  it('opt:solve with a string objective falls back to legacy echo (no minimization)', () => {
    const node = makeNode();
    optimizationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    optimizationHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'opt:solve',
        objective: 'minimize_cost',
        constraints: [],
      } as never
    );
    expect(node.emit).toHaveBeenCalledWith(
      'opt:solution',
      expect.objectContaining({
        solveCount: 1,
        maxIter: 1000,
        converged: false,
        value: null,
      })
    );
  });

  it('opt:solve with a ComputableObjective converges to the target minimum', () => {
    const node = makeNode();
    optimizationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);

    const objective: ComputableObjective = {
      kind: 'least_squares',
      weights: [1, 2, 3],
      targets: [5, -2, 7],
      x0: [0, 0, 0],
      stepSize: 0.3,
    };

    optimizationHandler.onEvent!(
      node as never,
      defaultConfig,
      makeCtx(node) as never,
      {
        type: 'opt:solve',
        objective,
      } as never
    );

    const call = node.emit.mock.calls.find((c) => c[0] === 'opt:solution');
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;

    // Convergence assertions
    expect(payload.converged).toBe(true);
    expect(payload.iterations).toBeGreaterThan(0);
    expect(payload.iterations).toBeLessThan(defaultConfig.max_iterations);
    expect(payload.solveCount).toBe(1);

    // Value should be near zero (the true minimum of this least-squares form)
    expect(payload.value).toBeTypeOf('number');
    expect(payload.value as number).toBeGreaterThanOrEqual(0);
    expect(payload.value as number).toBeLessThan(1e-6);

    // Solution should be close to targets
    const solution = payload.solution as number[];
    expect(solution).toHaveLength(3);
    expect(solution[0]).toBeCloseTo(5, 5);
    expect(solution[1]).toBeCloseTo(-2, 5);
    expect(solution[2]).toBeCloseTo(7, 5);
  });

  it('opt:solve respects max_iterations cap when tolerance is unreachable', () => {
    const node = makeNode();
    // Tight tolerance + tiny step size prevents convergence within the cap
    const tightConfig = { max_iterations: 10, tolerance: 1e-12 };
    optimizationHandler.onAttach!(node as never, tightConfig, makeCtx(node) as never);

    const objective: ComputableObjective = {
      kind: 'least_squares',
      weights: [1],
      targets: [100],
      x0: [0],
      stepSize: 0.01,
    };

    optimizationHandler.onEvent!(
      node as never,
      tightConfig,
      makeCtx(node) as never,
      {
        type: 'opt:solve',
        objective,
      } as never
    );

    const call = node.emit.mock.calls.find((c) => c[0] === 'opt:solution');
    expect(call).toBeDefined();
    const payload = call![1] as Record<string, unknown>;

    expect(payload.converged).toBe(false);
    expect(payload.iterations).toBe(10);
    expect(payload.solveCount).toBe(1);
  });
});
