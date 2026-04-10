/**
 * BehaviorTree.ts
 *
 * Behavior tree runner: tick-based evaluation, status propagation,
 * subtree mounting, conditional abort, and debug tracing.
 *
 * @module ai
 */

import { BTNode, BTStatus } from './BTNodes';
import { Blackboard } from './Blackboard';

// =============================================================================
// TYPES
// =============================================================================

export interface BTContext {
  blackboard: Blackboard;
  deltaTime: number;
  entity: string;
}

export interface BTTreeDef {
  id: string;
  root: BTNode;
  context: BTContext;
  status: BTStatus;
  tickCount: number;
  aborted: boolean;
}

// =============================================================================
// BEHAVIOR TREE
// =============================================================================

export class BehaviorTree {
  private trees: Map<string, BTTreeDef> = new Map();
  private subtrees: Map<string, BTNode> = new Map();
  private debugTrace: Array<{ tree: string; node: string; status: BTStatus; tick: number }> = [];
  private tracing = false;

  // ---------------------------------------------------------------------------
  // Tree Management
  // ---------------------------------------------------------------------------

  createTree(id: string, root: BTNode, entity: string, blackboard?: Blackboard): BTTreeDef {
    const tree: BTTreeDef = {
      id,
      root,
      context: { blackboard: blackboard ?? new Blackboard(), deltaTime: 0, entity },
      status: 'ready',
      tickCount: 0,
      aborted: false,
    };
    this.trees.set(id, tree);
    return tree;
  }

  removeTree(id: string): boolean {
    return this.trees.delete(id);
  }
  getTree(id: string): BTTreeDef | undefined {
    return this.trees.get(id);
  }

  // ---------------------------------------------------------------------------
  // Subtree Registry
  // ---------------------------------------------------------------------------

  registerSubtree(name: string, root: BTNode): void {
    this.subtrees.set(name, root);
  }

  getSubtree(name: string): BTNode | undefined {
    return this.subtrees.get(name);
  }

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  tick(id: string, dt: number): BTStatus {
    const tree = this.trees.get(id);
    if (!tree) return 'failure';

    tree.context.deltaTime = dt;
    tree.tickCount++;
    tree.aborted = false;

    const status = this.tickNode(tree.root, tree.context, tree);
    tree.status = status;
    return status;
  }

  tickAll(dt: number): void {
    for (const id of this.trees.keys()) {
      this.tick(id, dt);
    }
  }

  private tickNode(node: BTNode, ctx: BTContext, tree: BTTreeDef): BTStatus {
    if (tree.aborted) return 'failure';

    const status = node.tick(ctx);

    if (this.tracing) {
      this.debugTrace.push({ tree: tree.id, node: node.name, status, tick: tree.tickCount });
      if (this.debugTrace.length > 500) this.debugTrace.shift();
    }

    return status;
  }

  // ---------------------------------------------------------------------------
  // Abort
  // ---------------------------------------------------------------------------

  abort(id: string): void {
    const tree = this.trees.get(id);
    if (tree) {
      tree.aborted = true;
      tree.status = 'failure';
    }
  }

  // ---------------------------------------------------------------------------
  // Debug
  // ---------------------------------------------------------------------------

  enableTracing(): void {
    this.tracing = true;
  }
  disableTracing(): void {
    this.tracing = false;
  }
  getTrace(): typeof this.debugTrace {
    return [...this.debugTrace];
  }
  clearTrace(): void {
    this.debugTrace = [];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getTreeCount(): number {
    return this.trees.size;
  }
  getStatus(id: string): BTStatus {
    return this.trees.get(id)?.status ?? 'failure';
  }
}
