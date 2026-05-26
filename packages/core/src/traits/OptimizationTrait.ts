/**
 * OptimizationTrait — v6.0
 * Constraint optimization solver with a computable-objective contract.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export interface OptimizationConfig {
  max_iterations: number;
  tolerance: number;
}

/** Serializable, computable objective specification for gradient-descent minimization. */
export interface ComputableObjective {
  kind: 'least_squares';
  /** Per-dimension positive weights. */
  weights: number[];
  /** Target values (the minimum is at x = targets, value = 0). */
  targets: number[];
  /** Initial guess for the decision variables. */
  x0: number[];
  /** Gradient-descent step size; defaults to 0.1. */
  stepSize?: number;
}

function isComputableObjective(obj: unknown): obj is ComputableObjective {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;
  return (
    o.kind === 'least_squares' &&
    Array.isArray(o.weights) &&
    Array.isArray(o.targets) &&
    Array.isArray(o.x0) &&
    o.weights.length === o.targets.length &&
    o.targets.length === o.x0.length
  );
}

function minimizeLeastSquares(
  objective: ComputableObjective,
  maxIterations: number,
  tolerance: number
): { solution: number[]; value: number; iterations: number; converged: boolean } {
  const { weights, targets, x0, stepSize = 0.1 } = objective;
  const dim = weights.length;
  const x = [...x0];
  let converged = false;
  let iter = 0;

  for (; iter < maxIterations; iter++) {
    const xNext = new Array<number>(dim);
    let maxDiff = 0;
    for (let i = 0; i < dim; i++) {
      const grad = 2 * weights[i] * (x[i] - targets[i]);
      xNext[i] = x[i] - stepSize * grad;
      const diff = Math.abs(xNext[i] - x[i]);
      if (diff > maxDiff) maxDiff = diff;
    }
    for (let i = 0; i < dim; i++) {
      x[i] = xNext[i];
    }
    if (maxDiff < tolerance) {
      converged = true;
      iter++; // count the iteration that triggered convergence
      break;
    }
  }

  let value = 0;
  for (let i = 0; i < dim; i++) {
    const diff = x[i] - targets[i];
    value += weights[i] * diff * diff;
  }

  return { solution: x, value, iterations: iter, converged };
}

export const optimizationHandler: TraitHandler<OptimizationConfig> = {
  name: 'optimization',
  defaultConfig: { max_iterations: 1000, tolerance: 1e-6 },
  onAttach(node: HSPlusNode): void {
    node.__optState = { solves: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__optState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    config: OptimizationConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__optState as { solves: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t !== 'opt:solve') return;

    state.solves++;

    const rawObjective = (event as Record<string, unknown>).objective;
    if (isComputableObjective(rawObjective)) {
      const result = minimizeLeastSquares(rawObjective, config.max_iterations, config.tolerance);
      context.emit?.('opt:solution', {
        objective: rawObjective,
        solution: result.solution,
        value: result.value,
        iterations: result.iterations,
        converged: result.converged,
        maxIter: config.max_iterations,
        tolerance: config.tolerance,
        solveCount: state.solves,
      });
    } else {
      // Legacy string-label fallback: echo without minimization.
      context.emit?.('opt:solution', {
        objective: rawObjective,
        constraints: (event as Record<string, unknown>).constraints,
        maxIter: config.max_iterations,
        solveCount: state.solves,
        converged: false,
        value: null,
        iterations: 0,
        solution: null,
        note: 'objective was not a ComputableObjective; no minimization performed',
      });
    }
  },
};

export default optimizationHandler;
