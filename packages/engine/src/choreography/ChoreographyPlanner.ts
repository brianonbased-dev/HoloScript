/**
 * @holoscript/core - Choreography Planner
 *
 * Creates and validates choreography execution plans.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import type { AgentManifest } from '../agents/AgentManifest';
import type { CapabilityQuery } from '../agents/CapabilityMatcher';
import { CapabilityMatcher } from '../agents/CapabilityMatcher';
import type {
  ChoreographyPlan,
  ChoreographyStep,
  ExecutionConstraint,
  StepIO,
} from './ChoreographyTypes';

// Simple ID generator (no external deps)
function generateId(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// PLANNER TYPES
// ============================================================================

/**
 * Step definition for plan builder
 */
export interface StepDefinition {
  /** Step ID (auto-generated if not provided) */
  id?: string;
  /** Step name */
  name?: string;
  /** Description */
  description?: string;
  /** Agent ID or capability query */
  agent: string | CapabilityQuery;
  /** Action to execute */
  action: string;
  /** Input parameters */
  inputs?: Record<string, unknown>;
  /** Output definitions */
  outputs?: Record<string, StepIO | string>;
  /** Dependencies (step IDs) */
  dependencies?: string[];
  /** Alias for dependencies (step names or IDs) */
  dependsOn?: string[];
  /** Parallel execution group */
  parallelGroup?: string;
  /** Timeout (ms) */
  timeout?: number;
  /** Max retries */
  retries?: number;
  /** Condition expression */
  condition?: string;
  /** Whether this is a HITL gate */
  hitlGate?: boolean;
  /** ID of step to execute if this step fails */
  fallbackStepId?: string;
}

/**
 * Plan definition for planner
 */
export interface PlanDefinition {
  /** Plan name */
  name?: string;
  /** Goal description */
  goal: string;
  /** Available agents */
  agents: AgentManifest[];
  /** Step definitions */
  steps: StepDefinition[];
  /** Constraints */
  constraints?: ExecutionConstraint[];
  /** Fallback plan */
  fallback?: PlanDefinition;
  /** Priority */
  priority?: number;
  /** Tags */
  tags?: string[];
  /** Custom metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Validation result
 */
export interface PlanValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Execution order result
 */
export interface ExecutionOrder {
  /** Groups of steps that can run in parallel */
  parallelGroups: string[][];
  /** Flat ordered list (topological sort) */
  flatOrder: string[];
  /** Dependency graph */
  graph: Map<string, string[]>;
}

// ============================================================================
// CHOREOGRAPHY PLANNER
// ============================================================================

/**
 * Creates and validates choreography plans
 */
export class ChoreographyPlanner {
  private matcher: CapabilityMatcher = new CapabilityMatcher();

  /**
   * Create a choreography plan from definition
   */
  createPlan(definition: PlanDefinition): ChoreographyPlan {
    const planId = generateId();
    const _agents = new Map(definition.agents.map((a) => [a.id, a]));

    // Resolve steps
    const steps: ChoreographyStep[] = definition.steps.map((stepDef) => {
      // Resolve agent
      const agentId = this.resolveAgent(stepDef.agent, definition.agents);
      if (!agentId) {
        throw new Error(
          `No agent found for step ${stepDef.id || stepDef.name}: ${JSON.stringify(stepDef.agent)}`
        );
      }

      // Normalize outputs
      const outputs: Record<string, StepIO> = {};
      if (stepDef.outputs) {
        for (const [key, value] of Object.entries(stepDef.outputs)) {
          if (typeof value === 'string') {
            outputs[key] = { key, type: 'unknown' };
          } else {
            outputs[key] = value;
          }
        }
      }

      const step: ChoreographyStep = {
        id: stepDef.id || `step_${generateId()}`,
        name: stepDef.name,
        description: stepDef.description,
        agentId,
        action: stepDef.action,
        inputs: stepDef.inputs || {},
        outputs,
        dependencies: stepDef.dependencies || stepDef.dependsOn || [],
        parallelGroup: stepDef.parallelGroup,
        status: 'pending',
        timeout: stepDef.timeout,
        retry: stepDef.retries !== undefined ? { maxRetries: stepDef.retries } : undefined,
        condition: stepDef.condition,
        hitlGate: stepDef.hitlGate,
        fallbackStepId: stepDef.fallbackStepId,
      };

      return step;
    });

    // Resolve step name dependencies to IDs
    // Dependencies can be specified by step name or step ID
    const stepNameToId = new Map<string, string>();
    for (const step of steps) {
      if (step.name) {
        stepNameToId.set(step.name, step.id);
      }
      stepNameToId.set(step.id, step.id); // Allow ID references too
    }

    for (const step of steps) {
      step.dependencies = step.dependencies.map((dep) => {
        const resolvedId = stepNameToId.get(dep);
        if (!resolvedId) {
          throw new Error(`Unknown step dependency "${dep}" in step "${step.name || step.id}"`);
        }
        return resolvedId;
      });
    }

    // Build fallback plan if provided
    let fallback: ChoreographyPlan | undefined;
    if (definition.fallback) {
      fallback = this.createPlan(definition.fallback);
    }

    const plan: ChoreographyPlan = {
      id: planId,
      name: definition.name,
      goal: definition.goal,
      steps,
      participants: definition.agents,
      constraints: definition.constraints || [],
      fallback,
      status: 'draft',
      createdAt: Date.now(),
      priority: definition.priority,
      tags: definition.tags,
      metadata: definition.metadata,
    };

    return plan;
  }

  /**
   * Validate a choreography plan
   */
  validate(plan: ChoreographyPlan): PlanValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const stepIds = new Set(plan.steps.map((s) => s.id));
    const agentIds = new Set(plan.participants.map((a) => a.id));

    // Check for empty plan
    if (plan.steps.length === 0) {
      errors.push('Plan has no steps');
    }

    // Validate each step
    for (const step of plan.steps) {
      // Check agent exists
      if (!agentIds.has(step.agentId)) {
        errors.push(`Step '${step.id}': Agent '${step.agentId}' not in participants`);
      }

      // Check action is specified
      if (!step.action) {
        errors.push(`Step '${step.id}': No action specified`);
      }

      // Check dependencies exist
      for (const depId of step.dependencies) {
        if (!stepIds.has(depId)) {
          errors.push(`Step '${step.id}': Dependency '${depId}' does not exist`);
        }
        if (depId === step.id) {
          errors.push(`Step '${step.id}': Cannot depend on itself`);
        }
      }
    }

    // Check for circular dependencies
    const cycleCheck = this.detectCycles(plan.steps);
    if (cycleCheck) {
      errors.push(`Circular dependency detected: ${cycleCheck.join(' -> ')}`);
    }

    // Warnings
    if (!plan.constraints.some((c) => c.type === 'timeout')) {
      warnings.push('No timeout constraint specified');
    }

    if (
      plan.steps.some((s) => s.hitlGate) &&
      !plan.participants.some((a) => a.capabilities?.some((c) => c.type === 'approve'))
    ) {
      warnings.push('HITL gate present but no approval agent in participants');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Calculate execution order
   */
  calculateExecutionOrder(plan: ChoreographyPlan): ExecutionOrder {
    const graph = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    // Build graph
    for (const step of plan.steps) {
      graph.set(step.id, step.dependencies);
      inDegree.set(step.id, step.dependencies.length);
    }

    // Kahn's algorithm for topological sort
    const flatOrder: string[] = [];
    const parallelGroups: string[][] = [];
    const queue: string[] = [];

    // Find all steps with no dependencies
    for (const [stepId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(stepId);
      }
    }

    while (queue.length > 0) {
      // Current group can run in parallel
      const currentGroup = [...queue];
      parallelGroups.push(currentGroup);
      queue.length = 0;

      for (const stepId of currentGroup) {
        flatOrder.push(stepId);

        // Find steps that depend on this one
        for (const [otherId, deps] of graph.entries()) {
          if (deps.includes(stepId)) {
            const newDegree = (inDegree.get(otherId) || 0) - 1;
            inDegree.set(otherId, newDegree);
            if (newDegree === 0) {
              queue.push(otherId);
            }
          }
        }
      }
    }

    return {
      parallelGroups,
      flatOrder,
      graph,
    };
  }

  /**
   * Clone and reset a plan for re-execution
   */
  resetPlan(plan: ChoreographyPlan): ChoreographyPlan {
    return {
      ...plan,
      id: generateId(),
      status: 'draft',
      createdAt: Date.now(),
      startedAt: undefined,
      completedAt: undefined,
      duration: undefined,
      steps: plan.steps.map((step) => ({
        ...step,
        status: 'pending',
        startedAt: undefined,
        completedAt: undefined,
        duration: undefined,
        error: undefined,
        retryAttempt: undefined,
      })),
    };
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Resolve agent from ID or capability query
   */
  private resolveAgent(agentRef: string | CapabilityQuery, agents: AgentManifest[]): string | null {
    if (typeof agentRef === 'string') {
      // Direct agent ID
      const agent = agents.find((a) => a.id === agentRef || a.name === agentRef);
      return agent?.id || null;
    }

    // Capability query
    const matches = this.matcher.findMatches(agents, agentRef);
    if (matches.length > 0) {
      return matches[0].manifest.id;
    }
    return null;
  }

  /**
   * Detect circular dependencies
   */
  private detectCycles(steps: ChoreographyStep[]): string[] | null {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const stepMap = new Map(steps.map((s) => [s.id, s]));

    const dfs = (stepId: string, path: string[]): string[] | null => {
      if (recursionStack.has(stepId)) {
        return [...path, stepId];
      }

      if (visited.has(stepId)) {
        return null;
      }

      visited.add(stepId);
      recursionStack.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const depId of step.dependencies) {
          const cycle = dfs(depId, [...path, stepId]);
          if (cycle) return cycle;
        }
      }

      recursionStack.delete(stepId);
      return null;
    };

    for (const step of steps) {
      const cycle = dfs(step.id, []);
      if (cycle) return cycle;
    }

    return null;
  }
}

// ============================================================================
// PLAN BUILDER - FLUENT API
// ============================================================================

/**
 * Fluent builder for choreography plans
 */
export class PlanBuilder {
  private definition: PlanDefinition;
  private planner: ChoreographyPlanner = new ChoreographyPlanner();

  constructor(goal: string) {
    this.definition = {
      goal,
      agents: [],
      steps: [],
      constraints: [],
    };
  }

  /**
   * Set plan name
   */
  name(name: string): this {
    this.definition.name = name;
    return this;
  }

  /**
   * Add an agent to the plan
   */
  agent(manifest: AgentManifest): this {
    this.definition.agents.push(manifest);
    return this;
  }

  /**
   * Add multiple agents
   */
  agents(manifests: AgentManifest[]): this {
    this.definition.agents.push(...manifests);
    return this;
  }

  /**
   * Add a step to the plan
   */
  step(definition: StepDefinition): this {
    this.definition.steps.push(definition);
    return this;
  }

  /**
   * Add a constraint
   */
  constraint(constraint: ExecutionConstraint): this {
    this.definition.constraints!.push(constraint);
    return this;
  }

  /**
   * Set timeout constraint
   */
  timeout(ms: number): this {
    this.definition.constraints!.push({
      type: 'timeout',
      value: ms,
      hard: true,
      description: `Maximum ${ms}ms execution time`,
    });
    return this;
  }

  /**
   * Set concurrency constraint
   */
  concurrency(max: number): this {
    this.definition.constraints!.push({
      type: 'concurrency',
      value: max,
      description: `Maximum ${max} concurrent steps`,
    });
    return this;
  }

  /**
   * Set fallback plan
   */
  fallback(fallbackPlan: PlanDefinition): this {
    this.definition.fallback = fallbackPlan;
    return this;
  }

  /**
   * Set priority
   */
  priority(priority: number): this {
    this.definition.priority = priority;
    return this;
  }

  /**
   * Add tags
   */
  tags(...tags: string[]): this {
    this.definition.tags = [...(this.definition.tags || []), ...tags];
    return this;
  }

  /**
   * Set metadata
   */
  metadata(meta: Record<string, unknown>): this {
    this.definition.metadata = { ...(this.definition.metadata || {}), ...meta };
    return this;
  }

  /**
   * Build and validate the plan
   */
  build(): ChoreographyPlan {
    const plan = this.planner.createPlan(this.definition);
    const validation = this.planner.validate(plan);

    if (!validation.valid) {
      throw new Error(`Plan validation failed:\n${validation.errors.join('\n')}`);
    }

    return plan;
  }

  /**
   * Build without validation (for testing)
   */
  buildUnsafe(): ChoreographyPlan {
    return this.planner.createPlan(this.definition);
  }
}

/**
 * Create a new plan builder
 */
export function plan(goal: string): PlanBuilder {
  return new PlanBuilder(goal);
}

/**
 * Default planner instance
 */
let defaultPlanner: ChoreographyPlanner | null = null;

/**
 * Get default planner
 */
export function getDefaultPlanner(): ChoreographyPlanner {
  if (!defaultPlanner) {
    defaultPlanner = new ChoreographyPlanner();
  }
  return defaultPlanner;
}
