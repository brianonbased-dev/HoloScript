/**
 * NavmeshSolverTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { navmeshSolverHandler } from '../NavmeshSolverTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __navState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { cell_size: 0.5 };

describe('NavmeshSolverTrait', () => {
  it('has name "navmesh_solver"', () => {
    expect(navmeshSolverHandler.name).toBe('navmesh_solver');
  });

  it('defaultConfig cell_size=0.5', () => {
    expect(navmeshSolverHandler.defaultConfig?.cell_size).toBe(0.5);
  });

  it('onAttach sets meshBuilt=false', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    expect((node.__navState as { meshBuilt: boolean }).meshBuilt).toBe(false);
  });

  it('nav:build sets meshBuilt=true and emits nav:built', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    navmeshSolverHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'nav:build', polygonCount: 500,
    } as never);
    expect((node.__navState as { meshBuilt: boolean }).meshBuilt).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('nav:built', expect.objectContaining({ polygons: 500 }));
  });

  it('nav:query emits nav:path with meshReady flag', () => {
    const node = makeNode();
    navmeshSolverHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    navmeshSolverHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'nav:query', from: [0,0,0], to: [5,0,5],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('nav:path', expect.objectContaining({ meshReady: false }));
  });
});
