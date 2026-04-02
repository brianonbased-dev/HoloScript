/**
 * GoalOriented Trait
 *
 * GOAP (Goal-Oriented Action Planning) implementation with A* planner.
 * Agents define goals and available actions; the planner finds optimal
 * action sequences to achieve goals.
 *
 * @version 2.0.0
 */

import type { TraitHandler, TraitContext } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface WorldState {
  [key: string]: number | boolean | string;
}

interface GOAPGoal {
  name: string;
  priority: number;
  desiredState: WorldState;
  isValid?: (state: WorldState) => boolean;
}

interface GOAPAction {
  name: string;
  cost: number;
  preconditions: WorldState;
  effects: WorldState;
  duration?: number;
  isValid?: (state: WorldState) => boolean;
}

interface PlanNode {
  state: WorldState;
  action: GOAPAction | null;
  parent: PlanNode | null;
  gCost: number;
  hCost: number;
  fCost: number;
}

interface GOAPState {
  worldState: WorldState;
  currentGoal: GOAPGoal | null;
  plan: GOAPAction[];
  planIndex: number;
  currentActionTime: number;
  replanTimer: number;
  isExecuting: boolean;
}

interface GOAPConfig {
  goals: GOAPGoal[];
  actions: GOAPAction[];
  initial_state: WorldState;
  replan_interval: number;
  max_plan_depth: number;
}

// =============================================================================
// A* PLANNER
// =============================================================================

function stateMatches(current: WorldState, desired: WorldState): boolean {
  for (const key in desired) {
    if (current[key] !== desired[key]) return false;
  }
  return true;
}

function applyEffects(state: WorldState, effects: WorldState): WorldState {
  return { ...state, ...effects };
}

function checkPreconditions(state: WorldState, preconditions: WorldState): boolean {
  for (const key in preconditions) {
    if (state[key] !== preconditions[key]) return false;
  }
  return true;
}

function heuristic(state: WorldState, goal: WorldState): number {
  let mismatches = 0;
  for (const key in goal) {
    if (state[key] !== goal[key]) mismatches++;
  }
  return mismatches;
}

function planActions(
  worldState: WorldState,
  goal: GOAPGoal,
  actions: GOAPAction[],
  maxDepth: number
): GOAPAction[] | null {
  const openSet: PlanNode[] = [];
  const closedSet = new Set<string>();

  const stateKey = (s: WorldState) => JSON.stringify(s);

  const startNode: PlanNode = {
    state: { ...worldState },
    action: null,
    parent: null,
    gCost: 0,
    hCost: heuristic(worldState, goal.desiredState),
    fCost: heuristic(worldState, goal.desiredState),
  };

  openSet.push(startNode);

  while (openSet.length > 0) {
    // Get node with lowest fCost
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift()!;

    // Goal reached?
    if (stateMatches(current.state, goal.desiredState)) {
      // Reconstruct plan
      const plan: GOAPAction[] = [];
      let node: PlanNode | null = current;
      while (node && node.action) {
        plan.unshift(node.action);
        node = node.parent;
      }
      return plan;
    }

    const key = stateKey(current.state);
    if (closedSet.has(key)) continue;
    closedSet.add(key);

    // Check max depth
    let depth = 0;
    let temp: PlanNode | null = current;
    while (temp) {
      depth++;
      temp = temp.parent;
    }
    if (depth > maxDepth) continue;

    // Try each action
    for (const action of actions) {
      // Check preconditions
      if (!checkPreconditions(current.state, action.preconditions)) continue;

      // Check action validity
      if (action.isValid && !action.isValid(current.state)) continue;

      // Apply effects
      const newState = applyEffects(current.state, action.effects);

      // Skip if already explored
      if (closedSet.has(stateKey(newState))) continue;

      const gCost = current.gCost + action.cost;
      const hCost = heuristic(newState, goal.desiredState);

      openSet.push({
        state: newState,
        action,
        parent: current,
        gCost,
        hCost,
        fCost: gCost + hCost,
      });
    }
  }

  return null; // No plan found
}

// =============================================================================
// HANDLER
// =============================================================================

export const goalOrientedHandler: TraitHandler<GOAPConfig> = {
  name: 'goal_oriented',

  defaultConfig: {
    goals: [],
    actions: [],
    initial_state: {},
    replan_interval: 5000,
    max_plan_depth: 10,
  },

  onAttach(node, config, context) {
    const state: GOAPState = {
      worldState: { ...config.initial_state },
      currentGoal: null,
      plan: [],
      planIndex: 0,
      currentActionTime: 0,
      replanTimer: 0,
      isExecuting: false,
    };
    node.__goalOrientedState = state;

    // Initial planning
    selectGoalAndPlan(state, config, context, node);
  },

  onDetach(node) {
    delete node.__goalOrientedState;
  },

  onUpdate(node, config, context, delta) {
    const state = node.__goalOrientedState as GOAPState;
    if (!state) return;

    // Periodic replan
    state.replanTimer += delta * 1000;
    if (state.replanTimer >= config.replan_interval) {
      state.replanTimer = 0;
      selectGoalAndPlan(state, config, context, node);
    }

    // Execute current action
    if (state.isExecuting && state.plan.length > 0) {
      const currentAction = state.plan[state.planIndex];

      if (currentAction) {
        state.currentActionTime += delta;

        const duration = currentAction.duration ?? 1;
        if (state.currentActionTime >= duration) {
          // Action complete - apply effects
          state.worldState = applyEffects(state.worldState, currentAction.effects);

          context.emit?.('goap_action_complete', {
            node,
            action: currentAction.name,
            worldState: state.worldState,
          });

          // Move to next action
          state.planIndex++;
          state.currentActionTime = 0;

          if (state.planIndex >= state.plan.length) {
            // Plan complete
            context.emit?.('goap_goal_complete', {
              node,
              goal: state.currentGoal?.name,
            });

            state.isExecuting = false;
            selectGoalAndPlan(state, config, context, node);
          }
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__goalOrientedState as GOAPState;
    if (!state) return;

    if (event.type === 'goap_set_state') {
      Object.assign(state.worldState, event.state);
      // Trigger replan on state change
      selectGoalAndPlan(state, config, context, node);
    } else if (event.type === 'goap_add_goal') {
      config.goals.push(event.goal as GOAPGoal);
      selectGoalAndPlan(state, config, context, node);
    } else if (event.type === 'goap_cancel') {
      state.isExecuting = false;
      state.plan = [];
      context.emit?.('goap_cancelled', { node });
    }
  },
};

function selectGoalAndPlan(
  state: GOAPState,
  config: GOAPConfig,
  context: TraitContext,
  node: unknown
): void {
  // Find highest priority valid goal
  const validGoals = config.goals
    .filter((g) => {
      if (g.isValid && !g.isValid(state.worldState)) return false;
      return !stateMatches(state.worldState, g.desiredState);
    })
    .sort((a, b) => b.priority - a.priority);

  if (validGoals.length === 0) {
    state.currentGoal = null;
    state.plan = [];
    state.isExecuting = false;
    return;
  }

  const goal = validGoals[0];
  state.currentGoal = goal;

  // Plan to achieve goal
  const plan = planActions(state.worldState, goal, config.actions, config.max_plan_depth);

  if (plan && plan.length > 0) {
    state.plan = plan;
    state.planIndex = 0;
    state.currentActionTime = 0;
    state.isExecuting = true;

    context.emit?.('goap_plan_created', {
      node,
      goal: goal.name,
      actions: plan.map((a) => a.name),
    });
  } else {
    context.emit?.('goap_plan_failed', {
      node,
      goal: goal.name,
    });

    state.plan = [];
    state.isExecuting = false;
  }
}

export default goalOrientedHandler;
