/**
 * OptimizationTrait — v5.1
 * Constraint optimization solver.
 */
import type { TraitHandler } from './TraitTypes';
export interface OptimizationConfig { max_iterations: number; tolerance: number; }
export const optimizationHandler: TraitHandler<OptimizationConfig> = {
  name: 'optimization' as any, defaultConfig: { max_iterations: 1000, tolerance: 1e-6 },
  onAttach(node: any): void { node.__optState = { solves: 0 }; },
  onDetach(node: any): void { delete node.__optState; },
  onUpdate(): void {},
  onEvent(node: any, config: OptimizationConfig, context: any, event: any): void {
    const state = node.__optState as { solves: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t === 'opt:solve') { state.solves++; context.emit?.('opt:solution', { objective: event.objective, constraints: event.constraints, maxIter: config.max_iterations, solveCount: state.solves }); }
  },
};
export default optimizationHandler;
