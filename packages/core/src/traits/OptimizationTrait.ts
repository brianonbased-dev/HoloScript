/**
 * OptimizationTrait — v5.1
 * Constraint optimization solver.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface OptimizationConfig { max_iterations: number; tolerance: number; }
export const optimizationHandler: TraitHandler<OptimizationConfig> = {
  name: 'optimization', defaultConfig: { max_iterations: 1000, tolerance: 1e-6 },
  onAttach(node: HSPlusNode): void { node.__optState = { solves: 0 }; },
  onDetach(node: HSPlusNode): void { delete node.__optState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: OptimizationConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__optState as { solves: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t === 'opt:solve') { state.solves++; context.emit?.('opt:solution', { objective: event.objective, constraints: event.constraints, maxIter: config.max_iterations, solveCount: state.solves }); }
  },
};
export default optimizationHandler;
