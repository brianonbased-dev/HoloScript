/**
 * AstarTrait — comprehensive tests
 *
 * Deep-ratchet E6 (2026-05-24): the prior suite only asserted the echo of
 * `from`/`to`/`searchCount` — it passed against a stub and proved nothing about
 * pathfinding. These tests assert a COMPUTED path: they fail if the handler
 * goes back to echoing, because they require routing around a wall, the correct
 * accumulated cost, and an honest unreachable result.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  astarHandler,
  runAstar,
  type AstarGridQuery,
  type AstarGraphQuery,
} from '../AstarTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __astarState: undefined as unknown,
});

const defaultConfig = { max_iterations: 10000, heuristic: 'manhattan' };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('AstarTrait — metadata', () => {
  it('has name "astar"', () => {
    expect(astarHandler.name).toBe('astar');
  });

  it('defaultConfig values', () => {
    expect(astarHandler.defaultConfig?.max_iterations).toBe(10000);
    expect(astarHandler.defaultConfig?.heuristic).toBe('manhattan');
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

// =============================================================================
// PURE SEARCH — these are the tests that fail if the search is fake
// =============================================================================

describe('runAstar — grid search (computed path, not echo)', () => {
  it('finds the trivially-straight path on an open grid', () => {
    const q: AstarGridQuery = {
      grid: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      start: [0, 0],
      goal: [0, 2],
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(true);
    expect(r.cost).toBe(2); // two orthogonal steps
    expect(r.path[0]).toEqual([0, 0]);
    expect(r.path[r.path.length - 1]).toEqual([0, 2]);
  });

  it('routes AROUND a wall — the straight echo would be wrong here', () => {
    // Wall column blocks the direct row-0 path; A* must detour through row 1/2.
    //   . X .
    //   . X .
    //   . . .
    const q: AstarGridQuery = {
      grid: [
        [0, 1, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      start: [0, 0],
      goal: [0, 2],
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(true);
    // Optimal detour: (0,0)->(1,0)->(2,0)->(2,1)->(2,2)->(1,2)->(0,2) = 6 steps.
    expect(r.cost).toBe(6);
    // The path must NOT pass through any blocked cell.
    for (const step of r.path) {
      const [row, col] = step as [number, number];
      expect(q.grid[row][col]).toBe(0);
    }
    // It must actually traverse a lower row (the detour), not echo a straight line.
    const rowsVisited = new Set((r.path as Array<[number, number]>).map((p) => p[0]));
    expect(rowsVisited.has(2)).toBe(true);
  });

  it('returns found:false when the goal is walled off (unreachable)', () => {
    // Goal at (0,2) fully enclosed by walls.
    const q: AstarGridQuery = {
      grid: [
        [0, 1, 0],
        [0, 1, 1],
        [0, 0, 1],
      ],
      start: [0, 0],
      goal: [0, 2],
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
    expect(r.cost).toBe(0);
  });

  it('returns found:false when start or goal is itself blocked', () => {
    const q: AstarGridQuery = {
      grid: [
        [1, 0],
        [0, 0],
      ],
      start: [0, 0],
      goal: [1, 1],
    };
    expect(runAstar(q, defaultConfig).found).toBe(false);
  });

  it('diagonal moves shorten the path when allowed', () => {
    const q: AstarGridQuery = {
      grid: [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
      start: [0, 0],
      goal: [2, 2],
      allowDiagonal: true,
    };
    const r = runAstar(q, { ...defaultConfig, heuristic: 'chebyshev' });
    expect(r.found).toBe(true);
    // Two diagonal steps = 2 * sqrt(2) ≈ 2.828, cheaper than 4 orthogonal steps.
    expect(r.cost).toBeCloseTo(2 * Math.SQRT2, 5);
  });
});

describe('runAstar — graph search (weighted adjacency, optimal cost)', () => {
  it('finds the lowest-cost route through a weighted graph', () => {
    // A->B(1)->D(1) total 2 vs A->C(4)->D(1) total 5; A->D direct = 10.
    const q: AstarGraphQuery = {
      edges: {
        A: [
          { to: 'B', cost: 1 },
          { to: 'C', cost: 4 },
          { to: 'D', cost: 10 },
        ],
        B: [{ to: 'D', cost: 1 }],
        C: [{ to: 'D', cost: 1 }],
        D: [],
      },
      start: 'A',
      goal: 'D',
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(true);
    expect(r.cost).toBe(2);
    expect(r.path).toEqual(['A', 'B', 'D']);
  });

  it('returns found:false for a disconnected goal', () => {
    const q: AstarGraphQuery = {
      edges: { A: [{ to: 'B', cost: 1 }], B: [], Z: [] },
      start: 'A',
      goal: 'Z',
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(false);
    expect(r.path).toEqual([]);
  });

  it('uses coordinate heuristic without sacrificing optimality', () => {
    const q: AstarGraphQuery = {
      edges: {
        A: [
          { to: 'B', cost: 2 },
          { to: 'C', cost: 1 },
        ],
        B: [{ to: 'D', cost: 1 }],
        C: [{ to: 'D', cost: 5 }],
        D: [],
      },
      start: 'A',
      goal: 'D',
      coords: { A: [0, 0], B: [1, 0], C: [0, 1], D: [1, 1] },
    };
    const r = runAstar(q, defaultConfig);
    expect(r.found).toBe(true);
    expect(r.cost).toBe(3); // A->B->D = 3, beats A->C->D = 6
    expect(r.path).toEqual(['A', 'B', 'D']);
  });
});

// =============================================================================
// TRAIT HANDLER — emits the computed result, honest failure otherwise
// =============================================================================

describe('AstarTrait — onEvent emits a computed path', () => {
  it('astar:find_path with a grid emits astar:path_found carrying the real path + cost', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'astar:find_path',
      grid: [
        [0, 1, 0],
        [0, 1, 0],
        [0, 0, 0],
      ],
      start: [0, 0],
      goal: [0, 2],
    } as never);
    expect(node.emit).toHaveBeenCalledWith(
      'astar:path_found',
      expect.objectContaining({
        cost: 6,
        heuristic: 'manhattan',
        searchCount: 1,
      })
    );
    // The emitted payload must include a multi-step path, not just from/to.
    const call = node.emit.mock.calls.find((c) => c[0] === 'astar:path_found');
    expect(call).toBeDefined();
    const payload = call![1] as { path: unknown[] };
    expect(Array.isArray(payload.path)).toBe(true);
    expect(payload.path.length).toBeGreaterThan(2);
  });

  it('emits astar:path_not_found (unreachable) when the goal is walled off', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'astar:find_path',
      grid: [
        [0, 1, 0],
        [0, 1, 1],
        [0, 0, 1],
      ],
      start: [0, 0],
      goal: [0, 2],
    } as never);
    expect(node.emit).toHaveBeenCalledWith(
      'astar:path_not_found',
      expect.objectContaining({ reason: 'unreachable' })
    );
  });

  it('emits astar:path_not_found (no-graph) when no grid/edges supplied', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'astar:find_path',
      from: [0, 0, 0],
      to: [10, 0, 10],
    } as never);
    expect(node.emit).toHaveBeenCalledWith(
      'astar:path_not_found',
      expect.objectContaining({ reason: 'no-graph' })
    );
  });

  it('search counter increments on each call', () => {
    const node = makeNode();
    astarHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const grid = [
      [0, 0],
      [0, 0],
    ];
    for (let i = 0; i < 5; i++) {
      astarHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'astar:find_path',
        grid,
        start: [0, 0],
        goal: [1, 1],
      } as never);
    }
    const state = node.__astarState as { searches: number };
    expect(state.searches).toBe(5);
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
