/**
 * BehaviorTree.ts
 *
 * Lightweight behavior tree for NPC AI and complex decision-making.
 * Supports: Sequence, Selector, Inverter, Repeater, Action, Condition nodes.
 */

// =============================================================================
// TYPES
// =============================================================================

export type NodeStatus = 'success' | 'failure' | 'running';

export interface BTContext {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic context bag for behavior tree state
  [key: string]: unknown;
}

export interface BTNode {
  type: string;
  tick(context: BTContext, delta: number): NodeStatus;
  reset?(): void;
}

// =============================================================================
// LEAF NODES
// =============================================================================

/**
 * Action: Executes a function. Returns success/failure/running.
 */
export class ActionNode implements BTNode {
  type = 'action';
  constructor(
    public name: string,
    private fn: (ctx: BTContext, delta: number) => NodeStatus
  ) {}

  tick(context: BTContext, delta: number): NodeStatus {
    return this.fn(context, delta);
  }
}

/**
 * Condition: Checks a predicate. Returns success/failure.
 */
export class ConditionNode implements BTNode {
  type = 'condition';
  constructor(
    public name: string,
    private predicate: (ctx: BTContext) => boolean
  ) {}

  tick(context: BTContext): NodeStatus {
    return this.predicate(context) ? 'success' : 'failure';
  }
}

/**
 * Wait: Returns 'running' for a specified duration, then 'success'.
 */
export class WaitNode implements BTNode {
  type = 'wait';
  private elapsed: number = 0;
  constructor(public duration: number) {}

  tick(_context: BTContext, delta: number): NodeStatus {
    this.elapsed += delta;
    if (this.elapsed >= this.duration) {
      return 'success';
    }
    return 'running';
  }

  reset(): void {
    this.elapsed = 0;
  }
}

// =============================================================================
// COMPOSITE NODES
// =============================================================================

/**
 * Sequence: Runs children in order. Fails on first failure.
 * Returns 'running' if a child is running.
 */
export class SequenceNode implements BTNode {
  type = 'sequence';
  private currentIndex: number = 0;

  constructor(public children: BTNode[]) {}

  tick(context: BTContext, delta: number): NodeStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(context, delta);

      if (status === 'failure') {
        this.currentIndex = 0;
        return 'failure';
      }
      if (status === 'running') {
        return 'running';
      }
      // success -> next child
      this.currentIndex++;
    }
    this.currentIndex = 0;
    return 'success';
  }

  reset(): void {
    this.currentIndex = 0;
    for (const child of this.children) child.reset?.();
  }
}

/**
 * Selector: Tries children in order. Succeeds on first success.
 * Falls through to next child on failure.
 */
export class SelectorNode implements BTNode {
  type = 'selector';
  private currentIndex: number = 0;

  constructor(public children: BTNode[]) {}

  tick(context: BTContext, delta: number): NodeStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(context, delta);

      if (status === 'success') {
        this.currentIndex = 0;
        return 'success';
      }
      if (status === 'running') {
        return 'running';
      }
      // failure -> try next child
      this.currentIndex++;
    }
    this.currentIndex = 0;
    return 'failure';
  }

  reset(): void {
    this.currentIndex = 0;
    for (const child of this.children) child.reset?.();
  }
}

// =============================================================================
// DECORATOR NODES
// =============================================================================

/**
 * Inverter: Flips success/failure.
 */
export class InverterNode implements BTNode {
  type = 'inverter';
  constructor(public child: BTNode) {}

  tick(context: BTContext, delta: number): NodeStatus {
    const status = this.child.tick(context, delta);
    if (status === 'success') return 'failure';
    if (status === 'failure') return 'success';
    return 'running';
  }

  reset(): void {
    this.child.reset?.();
  }
}

/**
 * Repeater: Repeats a child N times (or infinitely if count = -1).
 */
export class RepeaterNode implements BTNode {
  type = 'repeater';
  private count: number = 0;
  constructor(
    public child: BTNode,
    public maxCount: number = -1
  ) {}

  tick(context: BTContext, delta: number): NodeStatus {
    const status = this.child.tick(context, delta);

    if (status === 'running') return 'running';

    this.count++;
    this.child.reset?.();

    if (this.maxCount !== -1 && this.count >= this.maxCount) {
      this.count = 0;
      return 'success';
    }
    return 'running';
  }

  reset(): void {
    this.count = 0;
    this.child.reset?.();
  }
}

// =============================================================================
// BEHAVIOR TREE
// =============================================================================

export class BehaviorTree {
  private root: BTNode;
  private context: BTContext;

  constructor(root: BTNode, context: BTContext = {}) {
    this.root = root;
    this.context = context;
  }

  tick(delta: number): NodeStatus {
    return this.root.tick(this.context, delta);
  }

  getContext(): BTContext {
    return this.context;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches BTContext index signature
  setContext(key: string, value: unknown): void {
    this.context[key] = value;
  }

  reset(): void {
    this.root.reset?.();
  }
}
