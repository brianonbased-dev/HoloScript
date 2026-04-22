/**
 * @fileoverview Causal World Model for HoloLand VR Physics.
 *
 * Implements a Structural Causal Model (SCM) over VR world state, enabling
 * do-calculus "what-if" queries and counterfactual simulation so VR creators
 * can test world changes before building them.
 *
 * Architecture:
 *  - Directed Acyclic Graph (DAG) encodes causal dependencies between VR objects
 *    and physics parameters.
 *  - `intervention()` implements Pearl's do-calculus: fix a variable to a value
 *    and propagate effects through the causal graph.
 *  - `counterfactual()` implements abduction-action-prediction: infer latent noise
 *    from observed world state, apply intervention, predict new outcome.
 */

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A VR physics property that can participate in the causal graph. */
export interface CausalVariable {
  id: string;
  name: string;
  value: number;
  unit?: string;
}

/** A directed causal edge: `from` causally affects `to`. */
export interface CausalEdge {
  from: string;  // variable id
  to: string;    // variable id
  /** Linear coefficient — effect = coefficient × parent value */
  coefficient: number;
}

/** Result of an intervention or counterfactual query. */
export interface CausalQueryResult {
  /** Variable id → value after applying the causal model. */
  values: Record<string, number>;
  /** Ordered list of variable ids in topological evaluation order. */
  evaluationOrder: string[];
}

// ---------------------------------------------------------------------------
// SCM implementation
// ---------------------------------------------------------------------------

/**
 * Structural Causal Model over a VR world.
 *
 * Usage:
 * ```ts
 * const model = new CausalWorldModel();
 * model.addVariable({ id: 'gravity', name: 'Gravity', value: 9.8, unit: 'm/s²' });
 * model.addVariable({ id: 'jumpHeight', name: 'Jump Height', value: 1.2, unit: 'm' });
 * model.addEdge({ from: 'gravity', to: 'jumpHeight', coefficient: -0.12 });
 *
 * // "What if gravity doubled?"
 * const result = model.intervention('gravity', 19.6);
 * console.log(result.values.jumpHeight); // ~0.0
 * ```
 */
export class CausalWorldModel {
  private variables: Map<string, CausalVariable> = new Map();
  private edges: CausalEdge[] = [];

  // ------------------------------------------------------------------
  // Graph building
  // ------------------------------------------------------------------

  addVariable(variable: CausalVariable): void {
    this.variables.set(variable.id, { ...variable });
  }

  removeVariable(id: string): void {
    this.variables.delete(id);
    this.edges = this.edges.filter(e => e.from !== id && e.to !== id);
  }

  addEdge(edge: CausalEdge): void {
    if (!this.variables.has(edge.from)) {
      throw new Error(`Unknown source variable: ${edge.from}`);
    }
    if (!this.variables.has(edge.to)) {
      throw new Error(`Unknown target variable: ${edge.to}`);
    }
    if (this._wouldCreateCycle(edge)) {
      throw new Error(`Adding edge ${edge.from} → ${edge.to} would create a cycle`);
    }
    this.edges.push({ ...edge });
  }

  getVariables(): CausalVariable[] {
    return Array.from(this.variables.values());
  }

  getEdges(): CausalEdge[] {
    return [...this.edges];
  }

  // ------------------------------------------------------------------
  // do-calculus: intervention
  // ------------------------------------------------------------------

  /**
   * Pearl's do-operator: fix `variableId` to `value` (removing its incoming
   * edges) and propagate downstream effects through the causal graph.
   *
   * Implements `do(X = x)` semantics — the intervened variable is no longer
   * caused by its parents; all other structural equations remain intact.
   */
  intervention(variableId: string, value: number): CausalQueryResult {
    if (!this.variables.has(variableId)) {
      throw new Error(`Unknown variable: ${variableId}`);
    }

    // Mutilated graph: remove incoming edges to the intervened variable
    const mutilatedEdges = this.edges.filter(e => e.to !== variableId);

    // Topological sort over the DAG
    const order = this._topologicalSort();

    // Evaluate the SCM with the intervention applied
    const values: Record<string, number> = {};
    for (const [id, v] of this.variables) {
      values[id] = v.value;
    }
    values[variableId] = value;

    for (const id of order) {
      if (id === variableId) continue;
      const incoming = mutilatedEdges.filter(e => e.to === id);
      if (incoming.length === 0) continue;
      // Additive linear structural equation: X_i = base + Σ coeff_j * X_j
      const base = this.variables.get(id)!.value;
      let delta = 0;
      for (const edge of incoming) {
        const parentDelta = values[edge.from] - this.variables.get(edge.from)!.value;
        delta += edge.coefficient * parentDelta;
      }
      values[id] = base + delta;
    }

    return { values, evaluationOrder: order };
  }

  // ------------------------------------------------------------------
  // Counterfactual: abduction → action → prediction
  // ------------------------------------------------------------------

  /**
   * Counterfactual query: "Given the observed world, what *would* have happened
   * if `variableId` had been set to `counterfactualValue`?"
   *
   * Three-step procedure (Pearl 2009, Ch. 7):
   *  1. **Abduction** — infer latent exogenous noise U from observed values.
   *  2. **Action**    — apply intervention do(X = x_cf).
   *  3. **Prediction** — propagate through the modified graph with inferred U.
   *
   * For a linear additive SCM the noise term per variable is:
   *   U_i = observed_i − Σ coeff_j × parent_j
   */
  counterfactual(
    variableId: string,
    counterfactualValue: number,
    observed?: Record<string, number>
  ): CausalQueryResult {
    if (!this.variables.has(variableId)) {
      throw new Error(`Unknown variable: ${variableId}`);
    }

    const obs: Record<string, number> = {};
    for (const [id, v] of this.variables) {
      obs[id] = observed?.[id] ?? v.value;
    }

    const order = this._topologicalSort();

    // Step 1: Abduction — compute noise terms U_i
    const noise: Record<string, number> = {};
    for (const id of order) {
      const incoming = this.edges.filter(e => e.to === id);
      let predicted = this.variables.get(id)!.value;
      for (const edge of incoming) {
        const parentDelta = obs[edge.from] - this.variables.get(edge.from)!.value;
        predicted += edge.coefficient * parentDelta;
      }
      noise[id] = obs[id] - predicted;
    }

    // Step 2 + 3: Action + prediction — apply intervention, propagate with noise
    const mutilatedEdges = this.edges.filter(e => e.to !== variableId);
    const values: Record<string, number> = { ...obs };
    values[variableId] = counterfactualValue;

    for (const id of order) {
      if (id === variableId) continue;
      const incoming = mutilatedEdges.filter(e => e.to === id);
      let val = this.variables.get(id)!.value + noise[id];
      for (const edge of incoming) {
        const parentDelta = values[edge.from] - this.variables.get(edge.from)!.value;
        val += edge.coefficient * parentDelta;
      }
      values[id] = val;
    }

    return { values, evaluationOrder: order };
  }

  // ------------------------------------------------------------------
  // Batch simulation: run multiple "what-if" scenarios
  // ------------------------------------------------------------------

  /**
   * Run multiple intervention scenarios in one call.
   * Returns an array of `{ scenario, result }` objects suitable for comparison.
   */
  simulateScenarios(
    scenarios: Array<{ label: string; variableId: string; value: number }>
  ): Array<{ label: string; result: CausalQueryResult }> {
    return scenarios.map(s => ({
      label: s.label,
      result: this.intervention(s.variableId, s.value),
    }));
  }

  // ------------------------------------------------------------------
  // Serialisation helpers
  // ------------------------------------------------------------------

  toJSON(): { variables: CausalVariable[]; edges: CausalEdge[] } {
    return {
      variables: this.getVariables(),
      edges: this.getEdges(),
    };
  }

  static fromJSON(data: { variables: CausalVariable[]; edges: CausalEdge[] }): CausalWorldModel {
    const model = new CausalWorldModel();
    for (const v of data.variables) model.addVariable(v);
    for (const e of data.edges) model.addEdge(e);
    return model;
  }

  // ------------------------------------------------------------------
  // Graph utilities
  // ------------------------------------------------------------------

  /** Kahn's algorithm — topological sort. Throws if cycle detected. */
  private _topologicalSort(): string[] {
    const inDegree: Map<string, number> = new Map();
    for (const id of this.variables.keys()) inDegree.set(id, 0);
    for (const e of this.edges) inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1);

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const result: string[] = [];
    while (queue.length > 0) {
      const node = queue.shift()!;
      result.push(node);
      for (const e of this.edges) {
        if (e.from !== node) continue;
        const newDeg = (inDegree.get(e.to) ?? 1) - 1;
        inDegree.set(e.to, newDeg);
        if (newDeg === 0) queue.push(e.to);
      }
    }

    if (result.length !== this.variables.size) {
      throw new Error('Causal graph contains a cycle — DAG invariant violated');
    }
    return result;
  }

  /** Check if adding `edge` would introduce a cycle using DFS. */
  private _wouldCreateCycle(edge: CausalEdge): boolean {
    // DFS from edge.to: if we can reach edge.from, adding edge creates a cycle
    const visited = new Set<string>();
    const stack = [edge.to];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === edge.from) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const e of this.edges) {
        if (e.from === current) stack.push(e.to);
      }
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Convenience factory: VR physics preset
// ---------------------------------------------------------------------------

/**
 * Returns a pre-built causal model for typical VR physics parameters.
 *
 * Variables: gravity, friction, objectMass, jumpHeight, slideDistance,
 *            collisionForce, playerSpeed.
 */
export function createVRPhysicsModel(): CausalWorldModel {
  const model = new CausalWorldModel();

  // Root variables (no parents)
  model.addVariable({ id: 'gravity',        name: 'Gravity',         value: 9.8,  unit: 'm/s²' });
  model.addVariable({ id: 'friction',       name: 'Surface Friction', value: 0.5,  unit: 'μ' });
  model.addVariable({ id: 'objectMass',     name: 'Object Mass',      value: 1.0,  unit: 'kg' });
  model.addVariable({ id: 'playerSpeed',    name: 'Player Speed',     value: 5.0,  unit: 'm/s' });

  // Derived variables
  model.addVariable({ id: 'jumpHeight',     name: 'Jump Height',      value: 1.2,  unit: 'm' });
  model.addVariable({ id: 'slideDistance',  name: 'Slide Distance',   value: 3.0,  unit: 'm' });
  model.addVariable({ id: 'collisionForce', name: 'Collision Force',  value: 10.0, unit: 'N' });

  // Causal edges
  // Higher gravity → lower jump height
  model.addEdge({ from: 'gravity',     to: 'jumpHeight',     coefficient: -0.1 });
  // Higher friction → less slide
  model.addEdge({ from: 'friction',    to: 'slideDistance',  coefficient: -2.0 });
  // Higher gravity → more collision force
  model.addEdge({ from: 'gravity',     to: 'collisionForce', coefficient: 0.5 });
  // Heavier objects → more collision force
  model.addEdge({ from: 'objectMass',  to: 'collisionForce', coefficient: 2.0 });
  // Faster player → more slide distance
  model.addEdge({ from: 'playerSpeed', to: 'slideDistance',  coefficient: 0.4 });

  return model;
}
