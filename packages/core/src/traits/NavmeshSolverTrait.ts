/**
 * NavmeshSolverTrait — v5.1
 * Navigation mesh solver. Delegates to WalkableNavmeshBuilder (the same real
 * seam WalkableTrait uses): nav:build derives a real navmesh from a point
 * cloud, nav:query runs real reachability-graph pathfinding.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import {
  deriveWalkableNavmesh,
  findReachablePath,
  type WalkableNavmesh,
  type WalkablePointInput,
  type WalkableVec3,
} from './WalkableNavmeshBuilder';
export interface NavmeshSolverConfig {
  cell_size: number;
}
interface NavState {
  navmesh: WalkableNavmesh | null;
  meshBuilt: boolean;
  polygons: number;
}
export const navmeshSolverHandler: TraitHandler<NavmeshSolverConfig> = {
  name: 'navmesh_solver',
  defaultConfig: { cell_size: 0.5 },
  onAttach(node: HSPlusNode): void {
    node.__navState = { navmesh: null, meshBuilt: false, polygons: 0 } satisfies NavState;
  },
  onDetach(node: HSPlusNode): void {
    delete node.__navState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: NavmeshSolverConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__navState as NavState | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'nav:build': {
        const points = event.points as WalkablePointInput[] | undefined;
        if (!Array.isArray(points) || points.length === 0) {
          context.emit?.('nav:error', {
            op: 'build',
            reason: 'nav:build requires a non-empty points array (point cloud)',
          });
          return;
        }
        let navmesh: WalkableNavmesh;
        try {
          navmesh = deriveWalkableNavmesh(points, { cell_size_m: config.cell_size });
        } catch (err) {
          context.emit?.('nav:error', { op: 'build', reason: (err as Error).message });
          return;
        }
        state.navmesh = navmesh;
        state.meshBuilt = true;
        state.polygons = navmesh.collision_mesh.surfaces.length;
        context.emit?.('nav:built', {
          polygons: state.polygons,
          cellSize: config.cell_size,
          nodes: navmesh.reachability_graph.nodes.length,
          floorCells: navmesh.diagnostics.floor_cell_count,
        });
        break;
      }
      case 'nav:query': {
        if (!state.navmesh) {
          context.emit?.('nav:path', {
            from: event.from,
            to: event.to,
            path: null,
            reachable: false,
            meshReady: false,
          });
          return;
        }
        const path = findReachablePath(
          state.navmesh,
          event.from as WalkableVec3,
          event.to as WalkableVec3
        );
        context.emit?.('nav:path', {
          from: event.from,
          to: event.to,
          path,
          reachable: path !== null,
          meshReady: true,
        });
        break;
      }
    }
  },
};
export default navmeshSolverHandler;
