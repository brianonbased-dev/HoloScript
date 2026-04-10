/**
 * Plan-and-Execute Protocol: Plan -> Step -> Replan on failure
 *
 * A two-phase protocol where:
 * 1. Plan phase: LLM generates a sequence of steps to achieve the goal
 * 2. Execute phase: Steps are executed sequentially
 * 3. On failure: LLM replans from the current state (up to maxReplans)
 */

import type { PlanExecProtocolSpec, AgentIdentity } from './index';

// =============================================================================
// TYPES
// =============================================================================

export interface PlanStep {
  id: string;
  description: string;
  action: string;
  input: unknown;
  dependencies: string[];
}

export interface Plan {
  goal: string;
  steps: PlanStep[];
  reasoning: string;
}

export interface StepResult {
  stepId: string;
  status: 'success' | 'failure' | 'timeout' | 'skipped';
  output: unknown;
  error?: string;
  durationMs: number;
}

export interface PlanExecResult {
  goal: string;
  plans: Plan[];
  stepResults: StepResult[];
  status: 'complete' | 'partial' | 'failed';
  replansUsed: number;
  totalDurationMs: number;
}

/** Adapter for LLM planning calls */
export interface PlanLLMAdapter {
  /** Generate a plan given a goal and optional context from prior failures */
  plan(goal: string, context?: { failedSteps: StepResult[]; previousPlan: Plan }): Promise<Plan>;
}

/** Adapter for step execution */
export interface PlanStepExecutor {
  /** Execute a single plan step, returning its result */
  executeStep(step: PlanStep): Promise<StepResult>;
}

// =============================================================================
// PLAN-AND-EXECUTE AGENT
// =============================================================================

export class PlanExecuteAgent {
  readonly identity: AgentIdentity;
  private readonly spec: PlanExecProtocolSpec;
  private readonly llm: PlanLLMAdapter;
  private readonly executor: PlanStepExecutor;

  constructor(
    identity: AgentIdentity,
    spec: PlanExecProtocolSpec,
    llm: PlanLLMAdapter,
    executor: PlanStepExecutor
  ) {
    this.identity = identity;
    this.spec = spec;
    this.llm = llm;
    this.executor = executor;
  }

  async run(goal: string): Promise<PlanExecResult> {
    const startedAt = Date.now();
    const plans: Plan[] = [];
    const allStepResults: StepResult[] = [];
    let replansUsed = 0;

    // Initial plan
    let currentPlan = await this.llm.plan(goal);
    plans.push(currentPlan);

    while (true) {
      const { completed, failed } = await this.executeSteps(currentPlan, allStepResults);

      if (failed.length === 0) {
        // All steps succeeded
        return {
          goal,
          plans,
          stepResults: allStepResults,
          status: 'complete',
          replansUsed,
          totalDurationMs: Date.now() - startedAt,
        };
      }

      // Some steps failed — can we replan?
      if (replansUsed >= this.spec.maxReplans) {
        return {
          goal,
          plans,
          stepResults: allStepResults,
          status: completed.length > 0 ? 'partial' : 'failed',
          replansUsed,
          totalDurationMs: Date.now() - startedAt,
        };
      }

      // Replan with failure context
      replansUsed++;
      currentPlan = await this.llm.plan(goal, {
        failedSteps: failed,
        previousPlan: currentPlan,
      });
      plans.push(currentPlan);
    }
  }

  private async executeSteps(
    plan: Plan,
    allResults: StepResult[]
  ): Promise<{ completed: StepResult[]; failed: StepResult[] }> {
    const completed: StepResult[] = [];
    const failed: StepResult[] = [];
    const completedIds = new Set(
      allResults.filter((r) => r.status === 'success').map((r) => r.stepId)
    );

    for (const step of plan.steps) {
      // Skip already-completed steps
      if (completedIds.has(step.id)) continue;

      // Check dependencies
      const depsReady = step.dependencies.every((dep) => completedIds.has(dep));
      if (!depsReady) {
        const skipped: StepResult = {
          stepId: step.id,
          status: 'skipped',
          output: null,
          error: 'Dependencies not met',
          durationMs: 0,
        };
        allResults.push(skipped);
        failed.push(skipped);
        continue;
      }

      // Execute with timeout
      const stepStart = Date.now();
      try {
        const result = await Promise.race([
          this.executor.executeStep(step),
          new Promise<StepResult>((_, reject) =>
            setTimeout(() => reject(new Error('Step timed out')), this.spec.stepTimeout)
          ),
        ]);
        allResults.push(result);

        if (result.status === 'success') {
          completed.push(result);
          completedIds.add(step.id);
        } else {
          failed.push(result);
        }
      } catch (err) {
        const errorResult: StepResult = {
          stepId: step.id,
          status: err instanceof Error && err.message === 'Step timed out' ? 'timeout' : 'failure',
          output: null,
          error: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - stepStart,
        };
        allResults.push(errorResult);
        failed.push(errorResult);
      }
    }

    return { completed, failed };
  }
}
