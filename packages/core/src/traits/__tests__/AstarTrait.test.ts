/**
 * AstarTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { astarHandler } from '../AstarTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __astarState: undefined as unknown,
});

const defaultConfig = { max_iterations: 10000, heuristic: 'euclidean' };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('AstarTrait — metadata', () => {
  it('has name "astar"', () => {
    expect(astarHandler.name).toBe('astar');
  });

  it('defaultConfig values', () => {
    expect(astarHandler.defaultConfig?.max_iterations).toBe(10000);
    expect(astarHandler.defaultConfig?.heuristic).toBe('euclidean');
  });
});

describe('AstarTrait — lifecycle', () => {
  it('onAttach initializes searches counter', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__astarState as { searches: number };
    expect(state.searches).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    astarHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__astarState).toBeUndefined();
  });
});

describe('AstarTrait — onEvent', () => {
  it('astar:find_path emits astar:path_found with heuristic and searchCount', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'astar:find_path', from: [0, 0, 0], to: [10, 0, 10],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('astar:path_found', expect.objectContaining({
      from: [0, 0, 0],
      to: [10, 0, 10],
      heuristic: 'euclidean',
      searchCount: 1,
    }));
  });

  it('search counter increments on each call', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (let i = 0; i < 5; i++) {
      astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'astar:find_path', from: [0, 0, 0], to: [1, 0, 1],
      } as never);
    }
    const state = node.__astarState as { searches: number };
    expect(state.searches).toBe(5);
  });

  it('uses heuristic from config (manhattan)', () => {
    const node = makeNode();
    const cfg = { max_iterations: 1000, heuristic: 'manhattan' };
    astarHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    astarHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'astar:find_path', from: [0, 0, 0], to: [5, 0, 5],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('astar:path_found', expect.objectContaining({
      heuristic: 'manhattan',
    }));
  });

  it('unknown events are ignored', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'astar:unknown',
    } as never);
    expect(node.emit).not.toHaveBeenCalled();
  });
});
