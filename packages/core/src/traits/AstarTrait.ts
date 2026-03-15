/**
 * AstarTrait — v5.1
 * A* pathfinding algorithm.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface AstarConfig { max_iterations: number; heuristic: string; }
export const astarHandler: TraitHandler<AstarConfig> = {
  name: 'astar' as any, defaultConfig: { max_iterations: 10000, heuristic: 'euclidean' },
  onAttach(node: HSPlusNode): void { node.__astarState = { searches: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__astarState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: AstarConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__astarState as { searches: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t === 'astar:find_path') { state.searches++; context.emit?.('astar:path_found', { from: event.from, to: event.to, heuristic: config.heuristic, searchCount: state.searches }); }
  },
};
export default astarHandler;
