/**
 * Behavior Traits - AI and behavior system traits adapted for Three.js runtime
 *
 * These traits provide AI behaviors like behavior trees, emotions, and goal-oriented
 * action planning (GOAP) for VR/AR objects.
 *
 * @version 3.0.0
 */

import { TraitHandler, TraitContext } from './TraitSystem';
import * as THREE from 'three';
import { dispatchCustomEvent } from '../runtime-types';

// =============================================================================
// BEHAVIOR TREE TRAIT
// =============================================================================

type BTStatus = 'success' | 'failure' | 'running';

interface BTNode {
  type:
    | 'sequence'
    | 'selector'
    | 'parallel'
    | 'inverter'
    | 'repeater'
    | 'condition'
    | 'action'
    | 'wait';
  name?: string;
  children?: BTNode[];
  count?: number;
  condition?: string;
  action?: string;
  params?: Record<string, unknown>;
  duration?: number;
  successThreshold?: number;
}

interface BTNodeState {
  status: BTStatus;
  childIndex: number;
  waitTimer: number;
  repeatCount: number;
  childStatuses: BTStatus[];
}

interface BTState {
  status: BTStatus;
  tickAccumulator: number;
  blackboard: Record<string, unknown>;
  nodeStates: Map<BTNode, BTNodeState>;
  isRunning: boolean;
}

function tickBTNode(node: BTNode, state: BTState, context: TraitContext, delta: number): BTStatus {
  let nodeState = state.nodeStates.get(node);
  if (!nodeState) {
    nodeState = {
      status: 'running',
      childIndex: 0,
      waitTimer: 0,
      repeatCount: 0,
      childStatuses: [],
    };
    state.nodeStates.set(node, nodeState);
  }

  switch (node.type) {
    case 'sequence':
      return tickSequence(node, nodeState, state, context, delta);
    case 'selector':
      return tickSelector(node, nodeState, state, context, delta);
    case 'parallel':
      return tickParallel(node, nodeState, state, context, delta);
    case 'inverter':
      return tickInverter(node, state, context, delta);
    case 'repeater':
      return tickRepeater(node, nodeState, state, context, delta);
    case 'condition':
      return tickCondition(node, state, context);
    case 'action':
      return tickAction(node, state, context);
    case 'wait':
      return tickWait(node, nodeState, delta);
    default:
      return 'failure';
  }
}

function tickSequence(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: TraitContext,
  delta: number
): BTStatus {
  const children = node.children || [];
  for (let i = nodeState.childIndex; i < children.length; i++) {
    const result = tickBTNode(children[i], state, context, delta);
    if (result === 'running') {
      nodeState.childIndex = i;
      return 'running';
    }
    if (result === 'failure') {
      nodeState.childIndex = 0;
      return 'failure';
    }
  }
  nodeState.childIndex = 0;
  return 'success';
}

function tickSelector(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: TraitContext,
  delta: number
): BTStatus {
  const children = node.children || [];
  for (let i = nodeState.childIndex; i < children.length; i++) {
    const result = tickBTNode(children[i], state, context, delta);
    if (result === 'running') {
      nodeState.childIndex = i;
      return 'running';
    }
    if (result === 'success') {
      nodeState.childIndex = 0;
      return 'success';
    }
  }
  nodeState.childIndex = 0;
  return 'failure';
}

function tickParallel(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: TraitContext,
  delta: number
): BTStatus {
  const children = node.children || [];
  const threshold = node.successThreshold ?? children.length;
  let successes = 0,
    failures = 0;

  for (let i = 0; i < children.length; i++) {
    if (nodeState.childStatuses[i] === 'success') {
      successes++;
      continue;
    }
    if (nodeState.childStatuses[i] === 'failure') {
      failures++;
      continue;
    }
    const result = tickBTNode(children[i], state, context, delta);
    nodeState.childStatuses[i] = result;
    if (result === 'success') successes++;
    else if (result === 'failure') failures++;
  }

  if (successes >= threshold) {
    nodeState.childStatuses = [];
    return 'success';
  }
  if (failures > children.length - threshold) {
    nodeState.childStatuses = [];
    return 'failure';
  }
  return 'running';
}

function tickInverter(
  node: BTNode,
  state: BTState,
  context: TraitContext,
  delta: number
): BTStatus {
  const child = node.children?.[0];
  if (!child) return 'failure';
  const result = tickBTNode(child, state, context, delta);
  if (result === 'success') return 'failure';
  if (result === 'failure') return 'success';
  return 'running';
}

function tickRepeater(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: TraitContext,
  delta: number
): BTStatus {
  const child = node.children?.[0];
  if (!child) return 'failure';
  const maxCount = node.count ?? -1;
  const result = tickBTNode(child, state, context, delta);
  if (result === 'running') return 'running';
  nodeState.repeatCount++;
  state.nodeStates.delete(child);
  if (maxCount > 0 && nodeState.repeatCount >= maxCount) {
    nodeState.repeatCount = 0;
    return 'success';
  }
  return 'running';
}

function tickCondition(node: BTNode, state: BTState, context: TraitContext): BTStatus {
  const key = node.condition || '';
  let result = state.blackboard[key];
  if (key.startsWith('!')) {
    result = !state.blackboard[key.substring(1)];
  }
  if (result === undefined) {
    result = context.object.userData[key];
  }
  return result ? 'success' : 'failure';
}

function tickAction(node: BTNode, state: BTState, context: TraitContext): BTStatus {
  const actionName = node.action || '';

  // Set blackboard value
  if (actionName.startsWith('set:')) {
    const [, key, value] = actionName.split(':');
    state.blackboard[key] = value === 'true' ? true : value === 'false' ? false : value;
    return 'success';
  }

  // Emit event for external handling
  dispatchCustomEvent(context.object, {
    type: 'bt_action',
    action: actionName,
    params: node.params,
  });
  return 'success';
}

function tickWait(node: BTNode, nodeState: BTNodeState, delta: number): BTStatus {
  nodeState.waitTimer += delta;
  if (nodeState.waitTimer >= (node.duration ?? 1)) {
    nodeState.waitTimer = 0;
    return 'success';
  }
  return 'running';
}

export const BehaviorTreeTrait: TraitHandler = {
  name: 'behavior_tree',
  onApply: (context: TraitContext) => {
    const root = context.config.root || { type: 'sequence', children: [] };
    const tickRate = context.config.tick_rate ?? 10;

    context.data.state = {
      status: 'running' as BTStatus,
      tickAccumulator: 0,
      blackboard: { ...(context.config.blackboard || {}) },
      nodeStates: new Map(),
      isRunning: true,
    } as BTState;
    context.data.root = root;
    // @ts-expect-error - TS2363 structural type mismatch
    context.data.tickInterval = 1 / tickRate;
    context.data.restartOnComplete = context.config.restart_on_complete ?? true;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const state = context.data.state as BTState;
    if (!state.isRunning) return;

    state.tickAccumulator += delta;
    // @ts-expect-error - TS18046 structural type mismatch
    if (state.tickAccumulator >= context.data.tickInterval) {
      // @ts-expect-error - TS18046 structural type mismatch
      state.tickAccumulator -= context.data.tickInterval;
      // @ts-expect-error - TS2345 structural type mismatch
      state.status = tickBTNode(context.data.root, state, context, delta);

      if (state.status !== 'running') {
        dispatchCustomEvent(context.object, {
          type: 'bt_complete',
          status: state.status,
          blackboard: state.blackboard,
        });

        if (context.data.restartOnComplete) {
          state.nodeStates.clear();
          state.status = 'running';
        } else {
          state.isRunning = false;
        }
      }
    }
  },
  onRemove: (context: TraitContext) => {
    context.data.state = null;
  },
};

// =============================================================================
// EMOTION TRAIT (PAD Model)
// =============================================================================

type EmotionName =
  | 'joy'
  | 'sadness'
  | 'anger'
  | 'fear'
  | 'surprise'
  | 'disgust'
  | 'trust'
  | 'anticipation'
  | 'neutral';

interface PAD {
  pleasure: number;
  arousal: number;
  dominance: number;
}

const EMOTION_PAD: Record<EmotionName, PAD> = {
  joy: { pleasure: 0.8, arousal: 0.5, dominance: 0.6 },
  sadness: { pleasure: -0.7, arousal: -0.4, dominance: -0.5 },
  anger: { pleasure: -0.6, arousal: 0.8, dominance: 0.6 },
  fear: { pleasure: -0.8, arousal: 0.6, dominance: -0.7 },
  surprise: { pleasure: 0.2, arousal: 0.8, dominance: 0.0 },
  disgust: { pleasure: -0.7, arousal: 0.2, dominance: 0.3 },
  trust: { pleasure: 0.6, arousal: 0.0, dominance: 0.3 },
  anticipation: { pleasure: 0.3, arousal: 0.5, dominance: 0.2 },
  neutral: { pleasure: 0, arousal: 0, dominance: 0 },
};

function padDistance(a: PAD, b: PAD): number {
  return Math.sqrt(
    Math.pow(a.pleasure - b.pleasure, 2) +
      Math.pow(a.arousal - b.arousal, 2) +
      Math.pow(a.dominance - b.dominance, 2)
  );
}

function classifyEmotion(pad: PAD): EmotionName {
  let closest: EmotionName = 'neutral';
  let minDist = Infinity;
  for (const [emotion, emotionPad] of Object.entries(EMOTION_PAD)) {
    const dist = padDistance(pad, emotionPad);
    if (dist < minDist) {
      minDist = dist;
      closest = emotion as EmotionName;
    }
  }
  return closest;
}

function lerpPad(a: PAD, b: PAD, t: number): PAD {
  return {
    pleasure: a.pleasure + (b.pleasure - a.pleasure) * t,
    arousal: a.arousal + (b.arousal - a.arousal) * t,
    dominance: a.dominance + (b.dominance - a.dominance) * t,
  };
}

function _clampPad(pad: PAD): PAD {
  return {
    pleasure: Math.max(-1, Math.min(1, pad.pleasure)),
    arousal: Math.max(-1, Math.min(1, pad.arousal)),
    dominance: Math.max(-1, Math.min(1, pad.dominance)),
  };
}

export const EmotionTrait: TraitHandler = {
  name: 'emotion',
  onApply: (context: TraitContext) => {
    const defaultMood = (context.config.default_mood as EmotionName) || 'neutral';
    const defaultPad = EMOTION_PAD[defaultMood] || EMOTION_PAD.neutral;

    context.data.pad = { ...defaultPad };
    context.data.targetPad = { ...defaultPad };
    context.data.currentEmotion = defaultMood;
    context.data.intensity = 0;
    context.data.reactivity = context.config.reactivity ?? 0.5;
    context.data.decayRate = context.config.decay_rate ?? 0.1;
    context.data.blendSpeed = 1;

    context.object.userData.emotion = defaultMood;
    context.object.userData.emotionIntensity = 0;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const previousEmotion = context.data.currentEmotion;

    // Blend toward target
    // @ts-expect-error - TS18046 structural type mismatch
    const blendRate = context.data.reactivity * context.data.blendSpeed * delta;
    // @ts-expect-error - TS2345 structural type mismatch
    context.data.pad = lerpPad(context.data.pad, context.data.targetPad, blendRate);

    // Decay toward neutral
    const neutralPad = EMOTION_PAD.neutral;
    context.data.targetPad = lerpPad(
      // @ts-expect-error - TS2345 structural type mismatch
      context.data.targetPad,
      neutralPad,
      // @ts-expect-error - TS18046 structural type mismatch
      context.data.decayRate * delta
    );

    // Classify current emotion
    // @ts-expect-error - TS2345 structural type mismatch
    context.data.currentEmotion = classifyEmotion(context.data.pad);
    // @ts-expect-error - TS2345 structural type mismatch
    context.data.intensity = padDistance(context.data.pad, neutralPad) / Math.sqrt(3);

    // Update userData for external access
    context.object.userData.emotion = context.data.currentEmotion;
    context.object.userData.emotionIntensity = context.data.intensity;
    context.object.userData.emotionPad = context.data.pad;

    // Emit on emotion change
    if (context.data.currentEmotion !== previousEmotion) {
      dispatchCustomEvent(context.object, {
        type: 'emotion_changed',
        from: previousEmotion,
        to: context.data.currentEmotion,
        intensity: context.data.intensity,
        pad: context.data.pad,
      });
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.emotion;
    delete context.object.userData.emotionIntensity;
    delete context.object.userData.emotionPad;
  },
};

// =============================================================================
// GOAL-ORIENTED (GOAP) TRAIT
// =============================================================================

interface WorldState {
  [key: string]: number | boolean | string;
}

interface GOAPGoal {
  name: string;
  priority: number;
  desiredState: WorldState;
}

interface GOAPAction {
  name: string;
  cost: number;
  preconditions: WorldState;
  effects: WorldState;
  duration?: number;
}

function stateMatches(current: WorldState, desired: WorldState): boolean {
  for (const key in desired) {
    if (current[key] !== desired[key]) return false;
  }
  return true;
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
  interface PlanNode {
    state: WorldState;
    action: GOAPAction | null;
    parent: PlanNode | null;
    gCost: number;
    fCost: number;
  }

  const openSet: PlanNode[] = [];
  const closedSet = new Set<string>();
  const stateKey = (s: WorldState) => JSON.stringify(s);

  openSet.push({
    state: { ...worldState },
    action: null,
    parent: null,
    gCost: 0,
    fCost: heuristic(worldState, goal.desiredState),
  });

  while (openSet.length > 0) {
    openSet.sort((a, b) => a.fCost - b.fCost);
    const current = openSet.shift()!;

    if (stateMatches(current.state, goal.desiredState)) {
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

    let depth = 0;
    let temp: PlanNode | null = current;
    while (temp) {
      depth++;
      temp = temp.parent;
    }
    if (depth > maxDepth) continue;

    for (const action of actions) {
      if (!checkPreconditions(current.state, action.preconditions)) continue;
      const newState = { ...current.state, ...action.effects };
      if (closedSet.has(stateKey(newState))) continue;

      const gCost = current.gCost + action.cost;
      openSet.push({
        state: newState,
        action,
        parent: current,
        gCost,
        fCost: gCost + heuristic(newState, goal.desiredState),
      });
    }
  }

  return null;
}

export const GoalOrientedTrait: TraitHandler = {
  name: 'goal_oriented',
  onApply: (context: TraitContext) => {
    context.data.worldState = { ...(context.config.initial_state || {}) };
    context.data.goals = context.config.goals || [];
    context.data.actions = context.config.actions || [];
    context.data.currentGoal = null;
    context.data.plan = [];
    context.data.planIndex = 0;
    context.data.currentActionTime = 0;
    context.data.replanInterval = context.config.replan_interval ?? 5;
    context.data.replanTimer = 0;
    context.data.maxPlanDepth = context.config.max_plan_depth ?? 10;
    context.data.isExecuting = false;

    // Initial planning
    selectGoalAndPlan(context);
  },
  onUpdate: (context: TraitContext, delta: number) => {
    // Periodic replan
    // @ts-expect-error - TS18046 structural type mismatch
    context.data.replanTimer += delta;
    // @ts-expect-error - TS18046 structural type mismatch
    if (context.data.replanTimer >= context.data.replanInterval) {
      context.data.replanTimer = 0;
      selectGoalAndPlan(context);
    }

    // Execute current action
    // @ts-expect-error - TS18046 structural type mismatch
    if (context.data.isExecuting && context.data.plan.length > 0) {
      // @ts-expect-error - TS18046 structural type mismatch
      const currentAction = context.data.plan[context.data.planIndex] as GOAPAction;
      if (currentAction) {
        // @ts-expect-error - TS18046 structural type mismatch
        context.data.currentActionTime += delta;
        const duration = currentAction.duration ?? 1;

        // @ts-expect-error - TS18046 structural type mismatch
        if (context.data.currentActionTime >= duration) {
          // Action complete - apply effects
          // @ts-expect-error - TS2769 structural type mismatch
          Object.assign(context.data.worldState, currentAction.effects);

          dispatchCustomEvent(context.object, {
            type: 'goap_action_complete',
            action: currentAction.name,
            worldState: context.data.worldState,
          });

          // @ts-expect-error - TS18046 structural type mismatch
          context.data.planIndex++;
          context.data.currentActionTime = 0;

          // @ts-expect-error - TS18046 structural type mismatch
          if (context.data.planIndex >= context.data.plan.length) {
            dispatchCustomEvent(context.object, {
              type: 'goap_goal_complete',
              // @ts-expect-error - TS2339 structural type mismatch
              goal: context.data.currentGoal?.name,
            });
            context.data.isExecuting = false;
            selectGoalAndPlan(context);
          }
        }
      }
    }

    // Update userData
    context.object.userData.goapState = context.data.worldState;
    // @ts-expect-error - TS2339 structural type mismatch
    context.object.userData.goapGoal = context.data.currentGoal?.name || null;
    // @ts-expect-error - TS18046 structural type mismatch
    context.object.userData.goapAction = context.data.plan[context.data.planIndex]?.name || null;
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.goapState;
    delete context.object.userData.goapGoal;
    delete context.object.userData.goapAction;
  },
};

function selectGoalAndPlan(context: TraitContext): void {
  const goals = context.data.goals as GOAPGoal[];
  const actions = context.data.actions as GOAPAction[];
  const worldState = context.data.worldState as WorldState;

  // Find highest priority valid goal
  const validGoals = goals
    .filter((g) => !stateMatches(worldState, g.desiredState))
    .sort((a, b) => b.priority - a.priority);

  if (validGoals.length === 0) {
    context.data.currentGoal = null;
    context.data.plan = [];
    context.data.isExecuting = false;
    return;
  }

  const goal = validGoals[0];
  context.data.currentGoal = goal;

  // @ts-expect-error - TS2345 structural type mismatch
  const plan = planActions(worldState, goal, actions, context.data.maxPlanDepth);

  if (plan && plan.length > 0) {
    context.data.plan = plan;
    context.data.planIndex = 0;
    context.data.currentActionTime = 0;
    context.data.isExecuting = true;

    dispatchCustomEvent(context.object, {
      type: 'goap_plan_created',
      goal: goal.name,
      actions: plan.map((a) => a.name),
    });
  } else {
    dispatchCustomEvent(context.object, {
      type: 'goap_plan_failed',
      goal: goal.name,
    });
    context.data.plan = [];
    context.data.isExecuting = false;
  }
}

// =============================================================================
// PERCEPTION TRAIT (detect nearby objects)
// =============================================================================

export const PerceptionTrait: TraitHandler = {
  name: 'perception',
  onApply: (context: TraitContext) => {
    context.data.range = context.config.range ?? 10;
    context.data.fov = context.config.fov ?? 120; // degrees
    context.data.tags = context.config.tags || []; // Filter by tags
    context.data.updateRate = context.config.update_rate ?? 0.2;
    context.data.timer = 0;
    context.data.perceivedObjects = [];

    context.object.userData.perceivedObjects = [];
  },
  onUpdate: (context: TraitContext, delta: number) => {
    // @ts-expect-error - TS18046 structural type mismatch
    context.data.timer += delta;
    // @ts-expect-error - TS18046 structural type mismatch
    if (context.data.timer < context.data.updateRate) return;
    context.data.timer = 0;

    const perceived: Array<{ object: THREE.Object3D; name: string; distance: number; angle: number; tag: unknown }> = [];
    const myPos = context.object.position;
    const range = context.data.range;
    // @ts-expect-error - TS18046 structural type mismatch
    const fovRad = ((context.data.fov / 2) * Math.PI) / 180;

    // Get forward direction
    const forward = context.object.getWorldDirection(new THREE.Vector3());

    // Check all objects in scene
    const scene = context.object.parent;
    if (scene) {
      scene.traverse((child: THREE.Object3D) => {
        if (child === context.object) return;
        if (!child.userData) return;

        // Filter by tags if specified
        // @ts-expect-error - TS18046 structural type mismatch
        if (context.data.tags.length > 0) {
          // @ts-expect-error - TS18046 structural type mismatch
          if (!context.data.tags.includes(child.userData.tag)) return;
        }

        // Check distance
        const dist = myPos.distanceTo(child.position);
        // @ts-expect-error - TS18046 structural type mismatch
        if (dist > range) return;

        // Check FOV
        const toTarget = child.position.clone().sub(myPos).normalize();
        const angle = Math.acos(forward.dot(toTarget));
        if (angle > fovRad) return;

        perceived.push({
          object: child,
          name: child.name,
          distance: dist,
          angle: (angle * 180) / Math.PI,
          tag: child.userData.tag,
        });
      });
    }

    // Sort by distance
    perceived.sort((a, b) => a.distance - b.distance);

    context.data.perceivedObjects = perceived;
    context.object.userData.perceivedObjects = perceived;

    // Emit perception update
    if (perceived.length > 0) {
      dispatchCustomEvent(context.object, {
        type: 'perception_update',
        objects: perceived,
      });
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.perceivedObjects;
  },
};

// =============================================================================
// MEMORY TRAIT (remember interactions and events)
// =============================================================================

interface MemoryEntry {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  importance: number;
}

export const MemoryTrait: TraitHandler = {
  name: 'memory',
  onApply: (context: TraitContext) => {
    context.data.memories = [] as MemoryEntry[];
    context.data.capacity = context.config.capacity ?? 100;
    context.data.decayRate = context.config.decay_rate ?? 0.01;
    context.data.importanceThreshold = context.config.importance_threshold ?? 0.1;

    context.object.userData.memories = context.data.memories;
  },
  onUpdate: (context: TraitContext, delta: number) => {
    const memories = context.data.memories as MemoryEntry[];

    // Decay memories
    for (let i = memories.length - 1; i >= 0; i--) {
      // @ts-expect-error - TS18046 structural type mismatch
      memories[i].importance -= context.data.decayRate * delta;
      // @ts-expect-error - TS18046 structural type mismatch
      if (memories[i].importance < context.data.importanceThreshold) {
        memories.splice(i, 1);
      }
    }
  },
  onRemove: (context: TraitContext) => {
    delete context.object.userData.memories;
  },
};

// Helper function to add memories (can be called via event)
export function addMemory(
  context: TraitContext,
  type: string,
  data: Record<string, unknown>,
  importance = 1
): void {
  const memories = context.data.memories as MemoryEntry[];

  memories.push({
    type,
    data,
    timestamp: Date.now(),
    importance,
  });

  // Remove oldest if over capacity
  // @ts-expect-error - TS18046 structural type mismatch
  while (memories.length > context.data.capacity) {
    // Remove least important
    let minIdx = 0;
    for (let i = 1; i < memories.length; i++) {
      if (memories[i].importance < memories[minIdx].importance) {
        minIdx = i;
      }
    }
    memories.splice(minIdx, 1);
  }
}
