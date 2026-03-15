/**
 * NavmeshSolverTrait — v5.1
 * Navigation mesh solver.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface NavmeshSolverConfig { cell_size: number; }
export const navmeshSolverHandler: TraitHandler<NavmeshSolverConfig> = {
  name: 'navmesh_solver' as any, defaultConfig: { cell_size: 0.5 },
  onAttach(node: HSPlusNode): void { node.__navState = { meshBuilt: false, polygons: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__navState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: NavmeshSolverConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__navState as { meshBuilt: boolean; polygons: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'nav:build': state.meshBuilt = true; state.polygons = (event.polygonCount as number) ?? 0; context.emit?.('nav:built', { polygons: state.polygons, cellSize: config.cell_size }); break;
      case 'nav:query': context.emit?.('nav:path', { from: event.from, to: event.to, meshReady: state.meshBuilt }); break;
    }
  },
};
export default navmeshSolverHandler;
