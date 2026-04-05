/**
 * GoalPlanner.ts
 *
 * GOAP-style goal planner: goal states, actions with preconditions
 * and effects, backward chaining plan generation, and plan execution.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export type WorldState = Map<string, boolean>;

export interface PlanAction {
  id: string;
  name: string;
  cost: number;
  preconditions: Map<string, boolean>;
  effects: Map<string, boolean>;
  execute: () => void;
}

export interface Goal {
  id: string;
  name: string;
  conditions: Map<string, boolean>;
  priority: number;
}

export interface Plan {
  actions: PlanAction[];
  totalCost: number;
  goalId: string;
}

// =============================================================================
// GOAL PLANNER
// =============================================================================

export class GoalPlanner {
  private actions: PlanAction[] = [];
  private goals: Goal[] = [];

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  addAction(action: PlanAction): void {
    this.actions.push(action);
  }
  addGoal(goal: Goal): void {
    this.goals.push(goal);
  }

  removeAction(id: string): void {
    this.actions = this.actions.filter((a) => a.id !== id);
  }
  removeGoal(id: string): void {
    this.goals = this.goals.filter((g) => g.id !== id);
  }

  // ---------------------------------------------------------------------------
  // Planning (A* backward chaining)
  // ---------------------------------------------------------------------------

  plan(currentState: WorldState): Plan | null {
    // Sort goals by priority (highest first)
    const sortedGoals = [...this.goals].sort((a, b) => b.priority - a.priority);

    for (const goal of sortedGoals) {
      const result = this.findPlan(currentState, goal);
      if (result) return result;
    }

    return null;
  }

  private findPlan(currentState: WorldState, goal: Goal): Plan | null {
    // BFS to find cheapest plan
    interface Node {
      state: WorldState;
      actions: PlanAction[];
      cost: number;
    }

    const start: Node = { state: new Map(currentState), actions: [], cost: 0 };
    const queue: Node[] = [start];
    const visited = new Set<string>();
    let bestPlan: Plan | null = null;

    while (queue.length > 0) {
      queue.sort((a, b) => a.cost - b.cost);
      const node = queue.shift()!;

      const stateKey = this.stateKey(node.state);
      if (visited.has(stateKey)) continue;
      visited.add(stateKey);

      // Check if goal is satisfied
      if (this.satisfiesGoal(node.state, goal)) {
        const plan: Plan = { actions: node.actions, totalCost: node.cost, goalId: goal.id };
        if (!bestPlan || plan.totalCost < bestPlan.totalCost) bestPlan = plan;
        continue;
      }

      // Expand with available actions
      for (const action of this.actions) {
        if (!this.preconditionsMet(node.state, action)) continue;

        const newState = new Map(node.state);
        for (const [key, value] of action.effects) newState.set(key, value);

        queue.push({
          state: newState,
          actions: [...node.actions, action],
          cost: node.cost + action.cost,
        });
      }
    }

    return bestPlan;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private satisfiesGoal(state: WorldState, goal: Goal): boolean {
    for (const [key, value] of goal.conditions) {
      if (state.get(key) !== value) return false;
    }
    return true;
  }

  private preconditionsMet(state: WorldState, action: PlanAction): boolean {
    for (const [key, value] of action.preconditions) {
      if (state.get(key) !== value) return false;
    }
    return true;
  }

  private stateKey(state: WorldState): string {
    return [...state.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, v]) => `${k}:${v}`)
      .join('|');
  }

  // ---------------------------------------------------------------------------
  // Execution
  // ---------------------------------------------------------------------------

  executePlan(plan: Plan): void {
    for (const action of plan.actions) action.execute();
  }

  getActionCount(): number {
    return this.actions.length;
  }
  getGoalCount(): number {
    return this.goals.length;
  }
}
