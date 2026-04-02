/**
 * @holoscript/core - Skill Workflow Engine
 *
 * DAG-based skill composition and chaining. Validates workflow definitions,
 * resolves inter-step data dependencies, and executes steps in parallel groups.
 * Uses topological sort pattern from MicroPhaseDecomposer.
 *
 * Part of HoloScript v5.5 "Agents as Universal Orchestrators".
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Input can be a literal value, a reference to another step's output, or context.
 */
export type WorkflowInput =
  | { type: 'literal'; value: unknown }
  | { type: 'ref'; stepId: string; outputKey: string }
  | { type: 'context'; key: string };

/**
 * A single step in a workflow.
 */
export interface WorkflowStep {
  /** Unique step identifier */
  id: string;
  /** Skill/tool to invoke */
  skillId: string;
  /** Input mapping: param name → source */
  inputs: Record<string, WorkflowInput>;
  /** Step IDs that must complete first */
  dependsOn?: string[];
  /** Per-step timeout in ms */
  timeout?: number;
  /** Error handling strategy */
  onError?: 'fail' | 'skip' | 'fallback';
  /** Fallback skill if primary fails and onError='fallback' */
  fallbackSkillId?: string;
}

/**
 * Complete workflow definition.
 */
export interface WorkflowDefinition {
  /** Workflow identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Optional description */
  description?: string;
  /** Ordered steps (topologically sorted at validation) */
  steps: WorkflowStep[];
  /** Initial context data */
  context?: Record<string, unknown>;
}

/**
 * Validation result for a workflow definition.
 */
export interface WorkflowValidation {
  /** Whether the workflow is valid */
  valid: boolean;
  /** Validation errors */
  errors: string[];
  /** Validation warnings */
  warnings: string[];
  /** Execution plan: groups of step IDs that can run in parallel */
  executionPlan: { groups: string[][]; estimatedSteps: number };
}

/**
 * Result of a single step execution.
 */
export interface WorkflowStepResult {
  stepId: string;
  status: 'completed' | 'failed' | 'skipped';
  output: Record<string, unknown>;
  durationMs: number;
  error?: string;
}

/**
 * Result of a full workflow execution.
 */
export interface WorkflowResult {
  workflowId: string;
  status: 'completed' | 'partial' | 'failed';
  stepResults: WorkflowStepResult[];
  totalDurationMs: number;
}

/**
 * Executor function type: takes a skill ID and inputs, returns outputs.
 */
export type SkillExecutor = (
  skillId: string,
  inputs: Record<string, unknown>
) => Promise<Record<string, unknown>>;

/**
 * Progress callback type.
 */
export type ProgressCallback = (stepId: string, status: string) => void;

// =============================================================================
// SKILL WORKFLOW ENGINE
// =============================================================================

export class SkillWorkflowEngine {
  // ===========================================================================
  // VALIDATION
  // ===========================================================================

  /**
   * Validate a workflow definition.
   */
  validate(definition: WorkflowDefinition, availableSkills?: string[]): WorkflowValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    const stepIds = new Set(definition.steps.map((s) => s.id));

    if (definition.steps.length === 0) {
      errors.push('Workflow must have at least one step');
      return { valid: false, errors, warnings, executionPlan: { groups: [], estimatedSteps: 0 } };
    }

    // Check for duplicate step IDs
    if (stepIds.size !== definition.steps.length) {
      errors.push('Duplicate step IDs detected');
    }

    for (const step of definition.steps) {
      // Validate step ID
      if (!step.id) {
        errors.push('Step missing required "id" field');
      }

      // Validate skill exists
      if (!step.skillId) {
        errors.push(`Step "${step.id}": missing required "skillId" field`);
      } else if (availableSkills && !availableSkills.includes(step.skillId)) {
        errors.push(`Step "${step.id}": skill "${step.skillId}" not found in available skills`);
      }

      // Validate dependencies exist
      if (step.dependsOn) {
        for (const depId of step.dependsOn) {
          if (!stepIds.has(depId)) {
            errors.push(`Step "${step.id}": dependency "${depId}" does not exist`);
          }
        }
      }

      // Validate ref inputs point to valid steps
      for (const [paramName, input] of Object.entries(step.inputs || {})) {
        if (input.type === 'ref') {
          if (!stepIds.has(input.stepId)) {
            errors.push(
              `Step "${step.id}": input "${paramName}" references non-existent step "${input.stepId}"`
            );
          }
          // Ensure the referenced step is in dependsOn (or warn)
          if (!step.dependsOn || !step.dependsOn.includes(input.stepId)) {
            warnings.push(
              `Step "${step.id}": input "${paramName}" references step "${input.stepId}" which is not in dependsOn — adding implicit dependency`
            );
          }
        }
      }

      // Validate fallback
      if (step.onError === 'fallback' && !step.fallbackSkillId) {
        warnings.push(`Step "${step.id}": onError='fallback' but no fallbackSkillId specified`);
      }
    }

    // Check for cycles
    const cycleCheck = this.detectCycles(definition.steps);
    if (cycleCheck) {
      errors.push(`Cycle detected: ${cycleCheck}`);
    }

    // Build execution plan
    const groups = errors.length === 0 ? this.buildExecutionGroups(definition.steps) : [];

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      executionPlan: {
        groups,
        estimatedSteps: definition.steps.length,
      },
    };
  }

  // ===========================================================================
  // EXECUTION
  // ===========================================================================

  /**
   * Execute a workflow using the provided executor function.
   */
  async execute(
    definition: WorkflowDefinition,
    executor: SkillExecutor,
    onProgress?: ProgressCallback
  ): Promise<WorkflowResult> {
    const startTime = Date.now();
    const stepResults: WorkflowStepResult[] = [];
    const stepOutputs = new Map<string, Record<string, unknown>>();
    const context = definition.context || {};

    // Build execution groups (topological sort into parallel layers)
    const groups = this.buildExecutionGroups(definition.steps);
    const stepMap = new Map(definition.steps.map((s) => [s.id, s]));

    let hasFailed = false;

    for (const group of groups) {
      // Execute all steps in this group in parallel
      const groupResults = await Promise.all(
        group.map(async (stepId) => {
          const step = stepMap.get(stepId)!;

          // Skip if a previous step failed and onError is not configured
          if (hasFailed && step.onError !== 'skip') {
            const result: WorkflowStepResult = {
              stepId,
              status: 'skipped',
              output: {},
              durationMs: 0,
              error: 'Skipped due to previous failure',
            };
            return result;
          }

          onProgress?.(stepId, 'starting');

          // Resolve inputs
          const resolvedInputs = this.resolveInputs(step, stepOutputs, context);

          const stepStart = Date.now();
          try {
            const output = await this.executeStep(step, resolvedInputs, executor);
            stepOutputs.set(stepId, output);
            onProgress?.(stepId, 'completed');
            return {
              stepId,
              status: 'completed' as const,
              output,
              durationMs: Date.now() - stepStart,
            };
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            onProgress?.(stepId, 'failed');

            if (step.onError === 'skip') {
              stepOutputs.set(stepId, {});
              return {
                stepId,
                status: 'skipped' as const,
                output: {},
                durationMs: Date.now() - stepStart,
                error,
              };
            }

            hasFailed = true;
            return {
              stepId,
              status: 'failed' as const,
              output: {},
              durationMs: Date.now() - stepStart,
              error,
            };
          }
        })
      );

      stepResults.push(...groupResults);
    }

    const completedCount = stepResults.filter((r) => r.status === 'completed').length;
    let status: 'completed' | 'partial' | 'failed';
    if (completedCount === definition.steps.length) {
      status = 'completed';
    } else if (completedCount > 0) {
      status = 'partial';
    } else {
      status = 'failed';
    }

    return {
      workflowId: definition.id,
      status,
      stepResults,
      totalDurationMs: Date.now() - startTime,
    };
  }

  // ===========================================================================
  // PRIVATE HELPERS
  // ===========================================================================

  /**
   * Execute a single step with optional fallback.
   */
  private async executeStep(
    step: WorkflowStep,
    resolvedInputs: Record<string, unknown>,
    executor: SkillExecutor
  ): Promise<Record<string, unknown>> {
    try {
      if (step.timeout) {
        return await Promise.race([
          executor(step.skillId, resolvedInputs),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error(`Step "${step.id}" timed out after ${step.timeout}ms`)),
              step.timeout
            )
          ),
        ]);
      }
      return await executor(step.skillId, resolvedInputs);
    } catch (err) {
      // Try fallback if configured
      if (step.onError === 'fallback' && step.fallbackSkillId) {
        return executor(step.fallbackSkillId, resolvedInputs);
      }
      throw err;
    }
  }

  /**
   * Resolve step inputs from literal values, step outputs, or context.
   */
  private resolveInputs(
    step: WorkflowStep,
    stepOutputs: Map<string, Record<string, unknown>>,
    context: Record<string, unknown>
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [paramName, input] of Object.entries(step.inputs || {})) {
      switch (input.type) {
        case 'literal':
          resolved[paramName] = input.value;
          break;
        case 'ref': {
          const outputs = stepOutputs.get(input.stepId);
          resolved[paramName] = outputs?.[input.outputKey];
          break;
        }
        case 'context':
          resolved[paramName] = context[input.key];
          break;
      }
    }

    return resolved;
  }

  /**
   * Detect cycles in the step dependency graph.
   * Returns a cycle description string, or null if no cycles.
   */
  private detectCycles(steps: WorkflowStep[]): string | null {
    const visited = new Set<string>();
    const inStack = new Set<string>();
    const adjList = new Map<string, string[]>();

    for (const step of steps) {
      const deps = [...(step.dependsOn || [])];
      // Also add implicit dependencies from ref inputs
      for (const input of Object.values(step.inputs || {})) {
        if (input.type === 'ref' && !deps.includes(input.stepId)) {
          deps.push(input.stepId);
        }
      }
      adjList.set(step.id, deps);
    }

    const dfs = (nodeId: string, path: string[]): string | null => {
      if (inStack.has(nodeId)) {
        return path.concat(nodeId).join(' → ');
      }
      if (visited.has(nodeId)) return null;

      visited.add(nodeId);
      inStack.add(nodeId);

      for (const dep of adjList.get(nodeId) || []) {
        const cycle = dfs(dep, [...path, nodeId]);
        if (cycle) return cycle;
      }

      inStack.delete(nodeId);
      return null;
    };

    for (const step of steps) {
      if (!visited.has(step.id)) {
        const cycle = dfs(step.id, []);
        if (cycle) return cycle;
      }
    }

    return null;
  }

  /**
   * Build parallel execution groups via topological sort.
   * Each group contains steps that can run concurrently.
   */
  private buildExecutionGroups(steps: WorkflowStep[]): string[][] {
    // Build adjacency and in-degree
    const inDegree = new Map<string, number>();
    const dependents = new Map<string, string[]>();

    for (const step of steps) {
      if (!inDegree.has(step.id)) inDegree.set(step.id, 0);
      if (!dependents.has(step.id)) dependents.set(step.id, []);

      const allDeps = this.getAllDependencies(step);
      for (const dep of allDeps) {
        inDegree.set(step.id, (inDegree.get(step.id) || 0) + 1);
        if (!dependents.has(dep)) dependents.set(dep, []);
        dependents.get(dep)!.push(step.id);
      }
    }

    // BFS layer by layer
    const groups: string[][] = [];
    let ready = [...inDegree.entries()].filter(([, deg]) => deg === 0).map(([id]) => id);

    while (ready.length > 0) {
      groups.push([...ready]);
      const nextReady: string[] = [];

      for (const id of ready) {
        for (const dependent of dependents.get(id) || []) {
          const newDeg = (inDegree.get(dependent) || 1) - 1;
          inDegree.set(dependent, newDeg);
          if (newDeg === 0) {
            nextReady.push(dependent);
          }
        }
      }

      ready = nextReady;
    }

    return groups;
  }

  /**
   * Get all dependencies for a step (explicit + implicit from ref inputs).
   */
  private getAllDependencies(step: WorkflowStep): string[] {
    const deps = new Set(step.dependsOn || []);
    for (const input of Object.values(step.inputs || {})) {
      if (input.type === 'ref') {
        deps.add(input.stepId);
      }
    }
    return Array.from(deps);
  }
}
