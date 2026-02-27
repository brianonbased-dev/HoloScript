/**
 * behaviorTree.ts
 *
 * Pure behavior tree DSL for HoloScript AI agent orchestration.
 * No external dependencies — runs in Node.js and browser.
 *
 * Supports: Sequence, Selector, Parallel, Action, Condition, Decorator.
 * Status: SUCCESS | FAILURE | RUNNING
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export type BehaviorStatus = 'SUCCESS' | 'FAILURE' | 'RUNNING';

export interface BehaviorContext {
  /** Agent blackboard — shared key/value store */
  blackboard: Record<string, unknown>;
  /** Elapsed time (seconds) since tree start */
  elapsed: number;
  /** Number of tree ticks executed so far */
  tick: number;
}

export interface BehaviorNode {
  readonly type: string;
  readonly label?: string;
  execute(ctx: BehaviorContext): BehaviorStatus;
}

// ── Leaf Nodes ────────────────────────────────────────────────────────────────

/**
 * Action node — runs a callback.
 */
export class ActionNode implements BehaviorNode {
  readonly type = 'action';
  constructor(
    readonly label: string,
    private _fn: (ctx: BehaviorContext) => BehaviorStatus,
  ) {}
  execute(ctx: BehaviorContext): BehaviorStatus { return this._fn(ctx); }
}

/**
 * Condition node — returns SUCCESS if predicate is true, FAILURE otherwise.
 */
export class ConditionNode implements BehaviorNode {
  readonly type = 'condition';
  constructor(
    readonly label: string,
    private _predicate: (ctx: BehaviorContext) => boolean,
  ) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    return this._predicate(ctx) ? 'SUCCESS' : 'FAILURE';
  }
}

/**
 * Always-success / always-failure stubs for testing.
 */
export const SUCCEED: BehaviorNode = {
  type: 'stub',
  label: 'Always Succeed',
  execute: () => 'SUCCESS',
};
export const FAIL: BehaviorNode = {
  type: 'stub',
  label: 'Always Fail',
  execute: () => 'FAILURE',
};
export const RUNNING: BehaviorNode = {
  type: 'stub',
  label: 'Always Running',
  execute: () => 'RUNNING',
};

// ── Composite Nodes ───────────────────────────────────────────────────────────

/**
 * Sequence — runs children left-to-right. Returns first FAILURE/RUNNING, or SUCCESS if all pass.
 * Equivalent to logical AND.
 */
export class SequenceNode implements BehaviorNode {
  readonly type = 'sequence';
  constructor(readonly label = 'Sequence', readonly children: BehaviorNode[]) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    for (const child of this.children) {
      const s = child.execute(ctx);
      if (s !== 'SUCCESS') return s;
    }
    return 'SUCCESS';
  }
}

/**
 * Selector — runs children left-to-right. Returns first SUCCESS/RUNNING, or FAILURE if all fail.
 * Equivalent to logical OR.
 */
export class SelectorNode implements BehaviorNode {
  readonly type = 'selector';
  constructor(readonly label = 'Selector', readonly children: BehaviorNode[]) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    for (const child of this.children) {
      const s = child.execute(ctx);
      if (s !== 'FAILURE') return s;
    }
    return 'FAILURE';
  }
}

/**
 * Parallel — runs ALL children. Policy controls success/failure thresholds.
 * 'require-all': succeed only if all children succeed.
 * 'require-one': succeed if at least one child succeeds.
 */
export class ParallelNode implements BehaviorNode {
  readonly type = 'parallel';
  constructor(
    readonly label = 'Parallel',
    readonly children: BehaviorNode[],
    readonly policy: 'require-all' | 'require-one' = 'require-all',
  ) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    const statuses = this.children.map(c => c.execute(ctx));
    const successes = statuses.filter(s => s === 'SUCCESS').length;
    const failures  = statuses.filter(s => s === 'FAILURE').length;
    if (this.policy === 'require-all') {
      if (failures > 0) return 'FAILURE';
      return successes === this.children.length ? 'SUCCESS' : 'RUNNING';
    } else {
      if (successes > 0) return 'SUCCESS';
      return failures === this.children.length ? 'FAILURE' : 'RUNNING';
    }
  }
}

// ── Decorators ────────────────────────────────────────────────────────────────

/** Invert the child's SUCCESS/FAILURE (NOT gate). RUNNING passes through. */
export class InverterNode implements BehaviorNode {
  readonly type = 'inverter';
  constructor(readonly label = 'Inverter', readonly child: BehaviorNode) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    const s = this.child.execute(ctx);
    if (s === 'SUCCESS') return 'FAILURE';
    if (s === 'FAILURE') return 'SUCCESS';
    return 'RUNNING';
  }
}

/** Repeat child N times. Stops early on FAILURE. */
export class RepeatNode implements BehaviorNode {
  readonly type = 'repeat';
  constructor(readonly label: string, readonly child: BehaviorNode, readonly times: number) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    for (let i = 0; i < this.times; i++) {
      const s = this.child.execute(ctx);
      if (s === 'FAILURE') return 'FAILURE';
    }
    return 'SUCCESS';
  }
}

/** Run child only if a guard condition is met. Returns FAILURE if guard fails. */
export class GuardNode implements BehaviorNode {
  readonly type = 'guard';
  constructor(
    readonly label: string,
    readonly guard: (ctx: BehaviorContext) => boolean,
    readonly child: BehaviorNode,
  ) {}
  execute(ctx: BehaviorContext): BehaviorStatus {
    return this.guard(ctx) ? this.child.execute(ctx) : 'FAILURE';
  }
}

// ── Tree Builder (DSL helpers) ────────────────────────────────────────────────

export const bt = {
  sequence:  (label: string, ...children: BehaviorNode[]) => new SequenceNode(label, children),
  selector:  (label: string, ...children: BehaviorNode[]) => new SelectorNode(label, children),
  parallel:  (label: string, policy: 'require-all' | 'require-one', ...children: BehaviorNode[]) =>
               new ParallelNode(label, children, policy),
  action:    (label: string, fn: (ctx: BehaviorContext) => BehaviorStatus) => new ActionNode(label, fn),
  condition: (label: string, pred: (ctx: BehaviorContext) => boolean) => new ConditionNode(label, pred),
  invert:    (child: BehaviorNode) => new InverterNode(`NOT ${child.label}`, child),
  repeat:    (n: number, child: BehaviorNode) => new RepeatNode(`Repeat×${n} ${child.label}`, child, n),
  guard:     (pred: (ctx: BehaviorContext) => boolean, child: BehaviorNode, label = 'Guard') =>
               new GuardNode(label, pred, child),
  succeed:   SUCCEED,
  fail:      FAIL,
  running:   RUNNING,
};

// ── Tree Runner ───────────────────────────────────────────────────────────────

export interface TreeRunResult {
  status: BehaviorStatus;
  /** Final blackboard state */
  blackboard: Record<string, unknown>;
  /** Number of ticks run */
  ticks: number;
}

/**
 * Run a behavior tree for up to `maxTicks` ticks.
 * Stops early if status is SUCCESS or FAILURE.
 * RUNNING continues to the next tick.
 */
export function runTree(
  root: BehaviorNode,
  initialBlackboard: Record<string, unknown> = {},
  maxTicks = 1,
): TreeRunResult {
  const ctx: BehaviorContext = { blackboard: { ...initialBlackboard }, elapsed: 0, tick: 0 };
  let status: BehaviorStatus = 'RUNNING';
  while (ctx.tick < maxTicks && status === 'RUNNING') {
    status = root.execute(ctx);
    ctx.tick++;
    ctx.elapsed += 1 / 60; // 60 fps simulation
  }
  return { status, blackboard: ctx.blackboard, ticks: ctx.tick };
}

// ── Serialization ─────────────────────────────────────────────────────────────

export interface SerializedNode {
  type: string;
  label?: string;
  children?: SerializedNode[];
  times?: number;
  policy?: string;
}

/** Serialize a tree to a plain JSON-serializable object. */
export function serializeTree(node: BehaviorNode): SerializedNode {
  const result: SerializedNode = { type: node.type, label: node.label };
  if (node instanceof SequenceNode || node instanceof SelectorNode) {
    result.children = node.children.map(serializeTree);
  } else if (node instanceof ParallelNode) {
    result.children = node.children.map(serializeTree);
    result.policy = node.policy;
  } else if (node instanceof InverterNode) {
    result.children = [serializeTree(node.child)];
  } else if (node instanceof RepeatNode) {
    result.children = [serializeTree(node.child)];
    result.times = node.times;
  } else if (node instanceof GuardNode) {
    result.children = [serializeTree(node.child)];
  }
  return result;
}

/** Count total nodes in a tree (recursive). */
export function countNodes(node: BehaviorNode): number {
  let count = 1;
  if (node instanceof SequenceNode || node instanceof SelectorNode || node instanceof ParallelNode) {
    for (const c of node.children) count += countNodes(c);
  } else if (node instanceof InverterNode || node instanceof GuardNode) {
    count += countNodes(node.child);
  } else if (node instanceof RepeatNode) {
    count += countNodes(node.child);
  }
  return count;
}
