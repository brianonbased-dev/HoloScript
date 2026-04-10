/**
 * BTNodes.ts
 *
 * Behavior tree node types: composite (sequence, selector, parallel),
 * decorator (inverter, repeater, guard), leaf (action, condition, wait).
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export type BTStatus = 'success' | 'failure' | 'running' | 'ready';

export interface BTContext {
  blackboard: { get: (key: string) => unknown; set: (key: string, value: unknown) => void };
  deltaTime: number;
  entity: string;
}

// =============================================================================
// BASE NODE
// =============================================================================

export abstract class BTNode {
  name: string;
  status: BTStatus = 'ready';
  children: BTNode[] = [];

  constructor(name: string) {
    this.name = name;
  }
  abstract tick(ctx: BTContext): BTStatus;
  reset(): void {
    this.status = 'ready';
    for (const c of this.children) c.reset();
  }
}

// =============================================================================
// COMPOSITE NODES
// =============================================================================

export class SequenceNode extends BTNode {
  private currentIndex = 0;

  constructor(name: string, children: BTNode[]) {
    super(name);
    this.children = children;
  }

  tick(ctx: BTContext): BTStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(ctx);
      if (status === 'running') return (this.status = 'running');
      if (status === 'failure') {
        this.currentIndex = 0;
        return (this.status = 'failure');
      }
      this.currentIndex++;
    }
    this.currentIndex = 0;
    return (this.status = 'success');
  }

  reset(): void {
    this.currentIndex = 0;
    super.reset();
  }
}

export class SelectorNode extends BTNode {
  private currentIndex = 0;

  constructor(name: string, children: BTNode[]) {
    super(name);
    this.children = children;
  }

  tick(ctx: BTContext): BTStatus {
    while (this.currentIndex < this.children.length) {
      const status = this.children[this.currentIndex].tick(ctx);
      if (status === 'running') return (this.status = 'running');
      if (status === 'success') {
        this.currentIndex = 0;
        return (this.status = 'success');
      }
      this.currentIndex++;
    }
    this.currentIndex = 0;
    return (this.status = 'failure');
  }

  reset(): void {
    this.currentIndex = 0;
    super.reset();
  }
}

export class ParallelNode extends BTNode {
  private requiredSuccesses: number;

  constructor(name: string, children: BTNode[], requiredSuccesses?: number) {
    super(name);
    this.children = children;
    this.requiredSuccesses = requiredSuccesses ?? children.length;
  }

  tick(ctx: BTContext): BTStatus {
    let successes = 0;
    let failures = 0;

    for (const child of this.children) {
      const status = child.tick(ctx);
      if (status === 'success') successes++;
      else if (status === 'failure') failures++;
    }

    if (successes >= this.requiredSuccesses) return (this.status = 'success');
    if (failures > this.children.length - this.requiredSuccesses) return (this.status = 'failure');
    return (this.status = 'running');
  }
}

// =============================================================================
// DECORATOR NODES
// =============================================================================

export class InverterNode extends BTNode {
  constructor(name: string, child: BTNode) {
    super(name);
    this.children = [child];
  }

  tick(ctx: BTContext): BTStatus {
    const status = this.children[0].tick(ctx);
    if (status === 'success') return (this.status = 'failure');
    if (status === 'failure') return (this.status = 'success');
    return (this.status = 'running');
  }
}

export class RepeaterNode extends BTNode {
  private maxRepeats: number;
  private count = 0;

  constructor(name: string, child: BTNode, repeats = Infinity) {
    super(name);
    this.children = [child];
    this.maxRepeats = repeats;
  }

  tick(ctx: BTContext): BTStatus {
    if (this.count >= this.maxRepeats) return (this.status = 'success');
    const status = this.children[0].tick(ctx);
    if (status === 'success' || status === 'failure') {
      this.count++;
      this.children[0].reset();
      if (this.count >= this.maxRepeats) return (this.status = 'success');
      return (this.status = 'running');
    }
    return (this.status = 'running');
  }

  reset(): void {
    this.count = 0;
    super.reset();
  }
}

export class GuardNode extends BTNode {
  private condition: (ctx: BTContext) => boolean;

  constructor(name: string, condition: (ctx: BTContext) => boolean, child: BTNode) {
    super(name);
    this.condition = condition;
    this.children = [child];
  }

  tick(ctx: BTContext): BTStatus {
    if (!this.condition(ctx)) return (this.status = 'failure');
    return (this.status = this.children[0].tick(ctx));
  }
}

// =============================================================================
// LEAF NODES
// =============================================================================

export class ActionNode extends BTNode {
  private action: (ctx: BTContext) => BTStatus;

  constructor(name: string, action: (ctx: BTContext) => BTStatus) {
    super(name);
    this.action = action;
  }

  tick(ctx: BTContext): BTStatus {
    return (this.status = this.action(ctx));
  }
}

export class ConditionNode extends BTNode {
  private condition: (ctx: BTContext) => boolean;

  constructor(name: string, condition: (ctx: BTContext) => boolean) {
    super(name);
    this.condition = condition;
  }

  tick(ctx: BTContext): BTStatus {
    return (this.status = this.condition(ctx) ? 'success' : 'failure');
  }
}

export class WaitNode extends BTNode {
  private duration: number;
  private elapsed = 0;

  constructor(name: string, seconds: number) {
    super(name);
    this.duration = seconds;
  }

  tick(ctx: BTContext): BTStatus {
    this.elapsed += ctx.deltaTime;
    if (this.elapsed >= this.duration) {
      this.elapsed = 0;
      return (this.status = 'success');
    }
    return (this.status = 'running');
  }

  reset(): void {
    this.elapsed = 0;
    super.reset();
  }
}
