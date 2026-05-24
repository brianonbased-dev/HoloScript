/**
 * NavmeshSolverTrait — tests
 * Hardened 2026-05-24 (deep-ratchet): nav:build now derives a REAL navmesh from
 * a point cloud and nav:query runs REAL reachability pathfinding. The prior
 * test fed a bare polygonCount and asserted the echo (a tautology); these
 * assertions fail unless the WalkableNavmeshBuilder seam actually runs.
 */
import { describe, it, expect, vi } from 'vitest';
import { navmeshSolverHandler } from '../NavmeshSolverTrait';
import type { WalkablePoint } from '../WalkableNavmeshBuilder';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __navState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { cell_size: 0.5 };

const fire = (node: ReturnType<typeof makeNode>, event: Record<string, unknown>) =>
  navmeshSolverHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, event as never);

const lastEmit = (node: ReturnType<typeof makeNode>, type: string) => {
  const calls = node.emit.mock.calls.filter((c: unknown[]) => c[0] === type);
  return calls.length ? (calls[calls.length - 1][1] as Record<string, unknown>) : undefined;
};

/** Flat floor: points on a 0.25m grid over [0,2]x[0,2] at y=0, up normals. */
function flatFloor(): WalkablePoint[] {
  const pts: WalkablePoint[] = [];
  for (let x = 0; x <= 2.0001; x += 0.25) {
    for (let z = 0; z <= 2.0001; z += 0.25) {
      pts.push({ position: [x, 0, z], normal: [0, 1, 0] });
    }
  }
  return pts;
}

describe('NavmeshSolverTrait', () => {
  it('has name "navmesh_solver"', () => {
    expect(navmeshSolverHandler.name).toBe('navmesh_solver');
  });

  it('defaultConfig cell_size=0.5', () => {
    expect(navmeshSolverHandler.defaultConfig?.cell_size).toBe(0.5);
  });

  it('nav:build derives a real navmesh with reachability nodes', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'nav:build', points: flatFloor() });
    expect((node.__navState as { meshBuilt: boolean }).meshBuilt).toBe(true);
    const built = lastEmit(node, 'nav:built');
    expect(built).toBeDefined();
    expect(built?.nodes as number).toBeGreaterThan(0);
    expect(built?.floorCells as number).toBeGreaterThan(0);
  });

  it('nav:build with no points emits nav:error (no fake mesh)', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'nav:build', polygonCount: 500 });
    expect(node.emit).toHaveBeenCalledWith('nav:error', expect.objectContaining({ op: 'build' }));
    expect((node.__navState as { meshBuilt: boolean }).meshBuilt).toBe(false);
  });

  it('nav:query returns a REAL non-empty path between reachable floor cells', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'nav:build', points: flatFloor() });
    fire(node, { type: 'nav:query', from: [0.25, 0, 0.25], to: [1.75, 0, 1.75] });
    const result = lastEmit(node, 'nav:path');
    expect(result?.meshReady).toBe(true);
    expect(result?.reachable).toBe(true);
    expect(Array.isArray(result?.path)).toBe(true);
    expect((result?.path as unknown[]).length).toBeGreaterThan(0);
  });

  it('nav:query before build reports meshReady=false', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fire(node, { type: 'nav:query', from: [0, 0, 0], to: [5, 0, 5] });
    expect(lastEmit(node, 'nav:path')?.meshReady).toBe(false);
  });
});
