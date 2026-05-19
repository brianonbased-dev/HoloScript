/**
 * AgentStepGraph — directed graph of agent activations for KVFlow-aware
 * KV cache management.
 *
 * Models the multi-agent workflow as a dependency graph where each node
 * is an agent activation (step) and edges represent scheduling dependencies.
 * The KVFlow cache manager uses graph topology to compute "steps-to-execution"
 * (STE) for eviction and prefetch decisions.
 *
 * @module @holoscript/llm-provider/kvflow
 * @version 0.1.0
 */

import type { AgentStep, StepNodeId } from './types';

/**
 * In-memory AgentStepGraph implementation. Constructed from HoloMesh team
 * board data (active agents, roles, priorities) and updated as agents
 * activate/deactivate during the workflow lifecycle.
 *
 * Lifecycle:
 * 1. Build initial graph from team board (which agents are active, their
 *    dependencies and priorities).
 * 2. As agents execute, update `lastActivatedAt` and `stepIndex`.
 * 3. When an agent session ends, remove its steps.
 * 4. The cache manager calls `computeStepsToExecution()` to drive eviction
 *    and `nextScheduled()` to drive prefetch.
 */
export class InMemoryAgentStepGraph {
  private readonly steps = new Map<StepNodeId, AgentStep>();

  /** Reverse index: stepId → set of steps that depend on it (forward edges). */
  private readonly dependents = new Map<StepNodeId, Set<StepNodeId>>();

  addStep(step: AgentStep): void {
    const existing = this.steps.get(step.id);
    if (existing) {
      // Clean up old reverse edges before replacing
      for (const depId of existing.dependsOn) {
        this.dependents.get(depId)?.delete(step.id);
      }
    }
    this.steps.set(step.id, step);
    // Build forward edges (dependents)
    for (const depId of step.dependsOn) {
      if (!this.dependents.has(depId)) {
        this.dependents.set(depId, new Set());
      }
      this.dependents.get(depId)!.add(step.id);
    }
  }

  removeStep(stepId: StepNodeId): void {
    const step = this.steps.get(stepId);
    if (!step) return;
    // Remove forward edges from this step's dependencies
    for (const depId of step.dependsOn) {
      this.dependents.get(depId)?.delete(stepId);
    }
    // Remove this step from the dependents index
    this.dependents.delete(stepId);
    // Remove all reverse edges pointing TO this step
    for (const depId of step.dependsOn) {
      // Already cleaned above; just ensure no stale refs
    }
    this.steps.delete(stepId);
  }

  getStep(stepId: StepNodeId): AgentStep | undefined {
    return this.steps.get(stepId);
  }

  allSteps(): AgentStep[] {
    return [...this.steps.values()];
  }

  stepCount(): number {
    return this.steps.size;
  }

  /**
   * Compute the "steps-to-execution" (STE) value for every node.
   *
   * KVFlow's core insight: eviction should be workflow-aware, not just
   * recency-based. An entry with STE=0 is currently executing; higher STE
   * means more steps before this agent runs again, making it a better
   * eviction candidate.
   *
   * Algorithm:
   * 1. Active steps get STE = 0 (they're executing now).
   * 2. For every other step, STE = length of the shortest path from any
   *    active step through the dependency graph, using BFS.
   * 3. Steps unreachable from any active step get STE = max topological
   *    position (fairness fallback — they'll be needed eventually).
   * 4. Shared-prefix scope entries get STE reduced by 1 (they're reused
   *    by multiple agents, so they're effectively "closer" to execution).
   *    Minimum STE for shared-prefix is 0 (never evict currently-active
   *    shared prefixes).
   */
  computeStepsToExecution(activeStepIds: StepNodeId[]): Map<StepNodeId, number> {
    const result = new Map<StepNodeId, number>();
    const visited = new Set<StepNodeId>();

    // Mark active steps as STE=0
    for (const activeId of activeStepIds) {
      if (this.steps.has(activeId)) {
        result.set(activeId, 0);
        visited.add(activeId);
      }
    }

    // BFS from active steps through the dependency graph
    // Queue items: [stepId, distance]
    const queue: Array<[StepNodeId, number]> = [...activeStepIds]
      .filter((id) => this.steps.has(id))
      .map((id) => [id, 0]);

    while (queue.length > 0) {
      const [currentId, distance] = queue.shift()!;
      const current = this.steps.get(currentId);
      if (!current) continue;

      // Traverse forward edges (steps that depend on current)
      const forwardDeps = this.dependents.get(currentId) ?? new Set();
      for (const depId of forwardDeps) {
        if (visited.has(depId)) continue;
        visited.add(depId);
        const depStep = this.steps.get(depId);
        if (!depStep) continue;

        // STE = distance from nearest active step
        const ste = distance + 1;
        result.set(depId, ste);
        queue.push([depId, ste]);
      }

      // Also traverse backward edges (steps that current depends on)
      // — these are still "reachable" from active steps
      for (const depId of current.dependsOn) {
        if (visited.has(depId)) continue;
        visited.add(depId);
        const depStep = this.steps.get(depId);
        if (!depStep) continue;

        const ste = distance + 1;
        result.set(depId, ste);
        queue.push([depId, ste]);
      }
    }

    // Fairness fallback: topological ordering for unreachable steps
    const topoOrder = this.topologicalSort();
    for (const stepId of topoOrder) {
      if (!visited.has(stepId)) {
        const position = topoOrder.indexOf(stepId);
        result.set(stepId, position + 1); // +1 so unreachable steps have STE > 0
      }
    }

    // Reduce STE for shared-prefix scope entries (they're reused by multiple
    // agents, so they're effectively "closer" to execution).
    for (const [stepId, ste] of result) {
      const step = this.steps.get(stepId);
      if (step && step.scope === 'shared-prefix' && ste > 0) {
        result.set(stepId, ste - 1);
      }
    }

    return result;
  }

  /**
   * Get the next N agents scheduled to execute after the given step.
   * Uses BFS from the step's dependents to find agents in execution order.
   */
  nextScheduled(stepId: StepNodeId, count: number): AgentStep[] {
    const result: AgentStep[] = [];
    const visited = new Set<StepNodeId>();
    const queue: StepNodeId[] = [];

    // Start from dependents of the given step
    const directDeps = this.dependents.get(stepId);
    if (directDeps) {
      for (const depId of directDeps) {
        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push(depId);
        }
      }
    }

    // BFS through forward edges, collecting steps by priority
    while (queue.length > 0 && result.length < count) {
      const currentId = queue.shift()!;
      const step = this.steps.get(currentId);
      if (!step) continue;

      result.push(step);

      // Add this step's dependents to the queue
      const nextDeps = this.dependents.get(currentId);
      if (nextDeps) {
        for (const depId of nextDeps) {
          if (!visited.has(depId)) {
            visited.add(depId);
            queue.push(depId);
          }
        }
      }
    }

    // Sort by priority (lower = higher priority) and return top N
    result.sort((a, b) => a.priority - b.priority);
    return result.slice(0, count);
  }

  /**
   * Topological sort of the dependency graph. Used as fallback for
   * computing STE when no active steps exist.
   */
  private topologicalSort(): StepNodeId[] {
    const inDegree = new Map<StepNodeId, number>();
    const nodes = [...this.steps.keys()];

    // Initialize in-degrees
    for (const nodeId of nodes) {
      if (!inDegree.has(nodeId)) {
        inDegree.set(nodeId, 0);
      }
    }

    // Compute in-degrees from edges
    for (const step of this.steps.values()) {
      for (const depId of step.dependsOn) {
        if (this.steps.has(depId)) {
          inDegree.set(step.id, (inDegree.get(step.id) ?? 0) + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: StepNodeId[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const order: StepNodeId[] = [];
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      order.push(nodeId);

      const step = this.steps.get(nodeId);
      if (step) {
        for (const depId of step.dependsOn) {
          // depId is a prerequisite; we need to check who depends on nodeId
        }
      }

      // Decrement in-degrees of nodes that depend on this one
      const fwdDeps = this.dependents.get(nodeId);
      if (fwdDeps) {
        for (const fwdId of fwdDeps) {
          const newDegree = (inDegree.get(fwdId) ?? 1) - 1;
          inDegree.set(fwdId, newDegree);
          if (newDegree === 0) {
            queue.push(fwdId);
          }
        }
      }
    }

    return order;
  }

  /**
   * Serialize to a plain object for persistence, debugging, or telemetry.
   */
  toJSON(): { steps: AgentStep[] } {
    return { steps: [...this.steps.values()] };
  }

  /**
   * Reconstruct from a serialized graph.
   */
  static fromJSON(data: { steps: AgentStep[] }): InMemoryAgentStepGraph {
    const graph = new InMemoryAgentStepGraph();
    for (const step of data.steps) {
      graph.addStep(step);
    }
    return graph;
  }
}