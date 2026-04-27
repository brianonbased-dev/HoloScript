/**
 * OptimizationTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { optimizationHandler } from '../OptimizationTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __optState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_iterations: 1000, tolerance: 1e-6 };

describe('OptimizationTrait', () => {
  it('has name "optimization"', () => {
    expect(optimizationHandler.name).toBe('optimization');
  });

  it('defaultConfig max_iterations=1000', () => {
    expect(optimizationHandler.defaultConfig?.max_iterations).toBe(1000);
  });

  it('opt:solve increments solveCount and emits opt:solution', () => {
    const node = makeNode();
    optimizationHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    optimizationHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'opt:solve', objective: 'minimize_cost', constraints: [],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('opt:solution', expect.objectContaining({
      solveCount: 1, maxIter: 1000,
    }));
  });
});
