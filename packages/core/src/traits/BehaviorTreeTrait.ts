/**
 * BehaviorTree Trait
 *
 * Full behavior tree implementation with sequence, selector, parallel,
 * decorator, and action nodes.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
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
  // For decorators
  count?: number; // Repeater count (-1 = infinite)
  // For conditions
  condition?: string; // Expression or blackboard key
  // For actions
  action?: string; // Action name to execute
  params?: Record<string, unknown>;
  // For wait
  duration?: number; // Seconds to wait
  // For parallel
  successThreshold?: number; // Number of children that must succeed
}

interface BTNodeState {
  status: BTStatus;
  childIndex: number;
  runningChild: number;
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
  debug: { lastTick: number; nodesVisited: number };
}

interface BTConfig {
  root: BTNode;
  tick_rate: number; // Ticks per second
  debug_visualization: boolean;
  blackboard: Record<string, unknown>;
  restart_on_complete: boolean;
}

// =============================================================================
// BEHAVIOR TREE EXECUTION
// =============================================================================

function tickNode(
  node: BTNode,
  state: BTState,
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  // Get or create node state
  let nodeState = state.nodeStates.get(node);
  if (!nodeState) {
    nodeState = {
      status: 'running',
      childIndex: 0,
      runningChild: -1,
      waitTimer: 0,
      repeatCount: 0,
      childStatuses: [],
    };
    state.nodeStates.set(node, nodeState);
  }

  state.debug.nodesVisited++;

  switch (node.type) {
    case 'sequence':
      return tickSequence(node, nodeState, state, context, owner, delta);
    case 'selector':
      return tickSelector(node, nodeState, state, context, owner, delta);
    case 'parallel':
      return tickParallel(node, nodeState, state, context, owner, delta);
    case 'inverter':
      return tickInverter(node, nodeState, state, context, owner, delta);
    case 'repeater':
      return tickRepeater(node, nodeState, state, context, owner, delta);
    case 'condition':
      return tickCondition(node, state, context, owner);
    case 'action':
      return tickAction(node, nodeState, state, context, owner, delta);
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
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  const children = node.children || [];

  for (let i = nodeState.childIndex; i < children.length; i++) {
    const result = tickNode(children[i], state, context, owner, delta);

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
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  const children = node.children || [];

  for (let i = nodeState.childIndex; i < children.length; i++) {
    const result = tickNode(children[i], state, context, owner, delta);

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
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  const children = node.children || [];
  const threshold = node.successThreshold ?? children.length;

  let successes = 0;
  let failures = 0;
  let _running = 0;

  for (let i = 0; i < children.length; i++) {
    if (nodeState.childStatuses[i] === 'success') {
      successes++;
      continue;
    }
    if (nodeState.childStatuses[i] === 'failure') {
      failures++;
      continue;
    }

    const result = tickNode(children[i], state, context, owner, delta);
    nodeState.childStatuses[i] = result;

    if (result === 'success') successes++;
    else if (result === 'failure') failures++;
    else _running++;
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
  nodeState: BTNodeState,
  state: BTState,
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  const child = node.children?.[0];
  if (!child) return 'failure';

  const result = tickNode(child, state, context, owner, delta);
  if (result === 'success') return 'failure';
  if (result === 'failure') return 'success';
  return 'running';
}

function tickRepeater(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: any,
  owner: unknown,
  delta: number
): BTStatus {
  const child = node.children?.[0];
  if (!child) return 'failure';

  const maxCount = node.count ?? -1;

  const result = tickNode(child, state, context, owner, delta);

  if (result === 'running') return 'running';

  nodeState.repeatCount++;

  // Reset child state for next iteration
  state.nodeStates.delete(child);

  if (maxCount > 0 && nodeState.repeatCount >= maxCount) {
    nodeState.repeatCount = 0;
    return 'success';
  }

  return 'running'; // Keep repeating
}

function tickCondition(node: BTNode, state: BTState, context: any, owner: unknown): BTStatus {
  const conditionKey = node.condition || '';

  // Check blackboard value
  let result = state.blackboard[conditionKey];

  // If starts with '!', invert
  if (conditionKey.startsWith('!')) {
    const key = conditionKey.substring(1);
    result = !state.blackboard[key];
  }

  // Check owner properties
  if (result === undefined && (owner as any)[conditionKey] !== undefined) {
    result = (owner as any)[conditionKey];
  }

  // Evaluate simple expressions
  if (typeof conditionKey === 'string' && conditionKey.includes('>')) {
    const [key, value] = conditionKey.split('>').map((s) => s.trim());
    const bbValue = state.blackboard[key];
    result = typeof bbValue === 'number' && bbValue > parseFloat(value);
  }

  return result ? 'success' : 'failure';
}

function tickAction(
  node: BTNode,
  nodeState: BTNodeState,
  state: BTState,
  context: any,
  owner: unknown,
  _delta: number
): BTStatus {
  const actionName = node.action || '';

  // Try to execute action via context (pass blackboard so handlers can update conditions)
  if (context.executeAction) {
    const result = context.executeAction(owner, actionName, node.params || {}, state.blackboard);
    if (result === true) return 'success';
    if (result === false) return 'failure';
    if (result === 'running') return 'running';
  }

  // Try to call method on owner
  const method = (owner as any)[actionName];
  if (typeof method === 'function') {
    const result = method.call(owner, node.params || {});
    if (result === true) return 'success';
    if (result === false) return 'failure';
    if (result instanceof Promise) {
      // Async action - mark as running
      result
        .then((r: unknown) => {
          nodeState.status = r ? 'success' : 'failure';
        })
        .catch(() => {
          nodeState.status = 'failure';
        });
      return 'running';
    }
  }

  // Set blackboard value
  if (actionName.startsWith('set:')) {
    const [, key, value] = actionName.split(':');
    state.blackboard[key] = value === 'true' ? true : value === 'false' ? false : value;
    return 'success';
  }

  context.emit?.('bt_action', { owner, action: actionName, params: node.params });
  return 'success';
}

function tickWait(node: BTNode, nodeState: BTNodeState, delta: number): BTStatus {
  nodeState.waitTimer += delta;
  const duration = node.duration ?? 1;

  if (nodeState.waitTimer >= duration) {
    nodeState.waitTimer = 0;
    return 'success';
  }
  return 'running';
}

// =============================================================================
// HANDLER
// =============================================================================

export const behaviorTreeHandler: TraitHandler<BTConfig> = {
  name: 'behavior_tree' as any,

  defaultConfig: {
    root: { type: 'sequence', children: [] },
    tick_rate: 10,
    debug_visualization: false,
    blackboard: {},
    restart_on_complete: true,
  },

  onAttach(node, config, context) {
    const state: BTState = {
      status: 'running',
      tickAccumulator: 0,
      blackboard: { ...config.blackboard },
      nodeStates: new Map(),
      isRunning: true,
      debug: { lastTick: 0, nodesVisited: 0 },
    };
    (node as any).__behaviorTreeState = state;

    context.emit?.('bt_started', { node });
  },

  onDetach(node) {
    delete (node as any).__behaviorTreeState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__behaviorTreeState as BTState;
    if (!state || !state.isRunning) return;

    // Tick at configured rate
    const tickInterval = 1 / config.tick_rate;
    state.tickAccumulator += delta;

    if (state.tickAccumulator >= tickInterval) {
      state.tickAccumulator -= tickInterval;
      state.debug.nodesVisited = 0;

      // Tick the tree
      state.status = tickNode(config.root, state, context, node, delta);
      state.debug.lastTick = Date.now();

      // Handle completion
      if (state.status !== 'running') {
        context.emit?.('bt_complete', {
          node,
          status: state.status,
          blackboard: state.blackboard,
        });

        if (config.restart_on_complete) {
          // Reset for next run
          state.nodeStates.clear();
          state.status = 'running';
        } else {
          state.isRunning = false;
        }
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__behaviorTreeState as BTState;
    if (!state) return;

    if (event.type === 'bt_set_blackboard') {
      Object.assign(state.blackboard, event.values);
    } else if (event.type === 'bt_pause') {
      state.isRunning = false;
    } else if (event.type === 'bt_resume') {
      state.isRunning = true;
    } else if (event.type === 'bt_reset') {
      state.nodeStates.clear();
      state.status = 'running';
      state.isRunning = true;
    }
  },
};

export default behaviorTreeHandler;
