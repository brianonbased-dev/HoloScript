/**
 * @holoscript/core - Choreography Engine
 *
 * Orchestrates multi-agent choreography execution.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import { EventEmitter } from 'events';
import type { AgentManifest } from '../agents/AgentManifest';
import { AgentRegistry } from '../agents/AgentRegistry';
import type {
  ChoreographyPlan,
  ChoreographyStep,
  ChoreographyResult,
  ChoreographyStatus,
  StepResult,
  StepContext,
} from './ChoreographyTypes';
import { ChoreographyPlanner, getDefaultPlanner } from './ChoreographyPlanner';
import type { ExecutionOrder } from './ChoreographyPlanner';
import { StepExecutor, getDefaultExecutor, type ActionHandler } from './StepExecutor';

// ============================================================================
// ENGINE CONFIGURATION
// ============================================================================

/**
 * Engine configuration
 */
export interface ChoreographyEngineConfig {
  /** Maximum concurrent step execution */
  maxConcurrency: number;
  /** Default step timeout (ms) */
  defaultTimeout: number;
  /** Whether to execute fallback on failure */
  executeFallback: boolean;
  /** Whether to pause on HITL gates automatically */
  autoHitlPause: boolean;
  /** Verbose logging */
  verbose: boolean;
}

/**
 * Default engine configuration
 */
export const DEFAULT_ENGINE_CONFIG: ChoreographyEngineConfig = {
  maxConcurrency: 4,
  defaultTimeout: 30000,
  executeFallback: true,
  autoHitlPause: true,
  verbose: false,
};

// ============================================================================
// ENGINE STATE
// ============================================================================

interface PlanState {
  plan: ChoreographyPlan;
  stepResults: Map<string, StepResult>;
  stepOutputs: Map<string, Record<string, unknown>>;
  executionOrder: ExecutionOrder;
  currentGroup: number;
  paused: boolean;
  cancelled: boolean;
  hitlPending: Set<string>;
  startTime: number;
  variables: Record<string, unknown>;
}

// ============================================================================
// CHOREOGRAPHY ENGINE
// ============================================================================

/**
 * Main engine for executing choreography plans
 */
export class ChoreographyEngine extends EventEmitter {
  private config: ChoreographyEngineConfig;
  private planner: ChoreographyPlanner;
  private executor: StepExecutor;
  private registry: AgentRegistry | null = null;
  private activePlans: Map<string, PlanState> = new Map();
  private actionHandler: ActionHandler | null = null;

  constructor(config: Partial<ChoreographyEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.planner = getDefaultPlanner();
    this.executor = getDefaultExecutor();

    // Forward executor events
    this.executor.on('step:completed', (step, result) => {
      const state = this.findPlanWithStep(step.id);
      if (state) {
        this.emit('step:completed', result, state.plan);
      }
    });

    this.executor.on('step:failed', (step, error) => {
      const state = this.findPlanWithStep(step.id);
      if (state) {
        this.emit('step:failed', step, error, state.plan);
      }
    });

    this.executor.on('step:retrying', (step, attempt, _delay) => {
      const state = this.findPlanWithStep(step.id);
      if (state) {
        this.emit('step:retrying', step, attempt, state.plan);
      }
    });
  }

  /**
   * Set the agent registry
   */
  setRegistry(registry: AgentRegistry): void {
    this.registry = registry;
  }

  /**
   * Set the action handler for executing agent actions
   */
  setActionHandler(handler: ActionHandler): void {
    this.actionHandler = handler;
    this.executor.setActionHandler(handler);
  }

  /**
   * Create a new choreography plan
   */
  createPlan(goal: string, agents: AgentManifest[], steps: ChoreographyStep[]): ChoreographyPlan {
    const plan: ChoreographyPlan = {
      id: this.generateId(),
      goal,
      steps: [...steps],
      participants: [...agents],
      constraints: [],
      status: 'draft',
      createdAt: Date.now(),
    };

    this.emit('plan:created', plan);
    return plan;
  }

  /**
   * Execute a choreography plan
   */
  async execute(
    plan: ChoreographyPlan,
    variables: Record<string, unknown> = {}
  ): Promise<ChoreographyResult> {
    if (!this.actionHandler) {
      throw new Error('No action handler registered. Call setActionHandler first.');
    }

    // Validate plan
    const validation = this.planner.validate(plan);
    if (!validation.valid) {
      throw new Error(`Plan validation failed: ${validation.errors.join(', ')}`);
    }

    // Initialize state
    const executionOrder = this.planner.calculateExecutionOrder(plan);
    const state: PlanState = {
      plan,
      stepResults: new Map(),
      stepOutputs: new Map(),
      executionOrder,
      currentGroup: 0,
      paused: false,
      cancelled: false,
      hitlPending: new Set(),
      startTime: Date.now(),
      variables,
    };

    this.activePlans.set(plan.id, state);

    // Update plan status
    plan.status = 'running';
    plan.startedAt = state.startTime;
    this.emit('plan:started', plan);

    try {
      // Execute plan
      const result = await this.executePlan(state);

      // Check for fallback
      if (!result.success && plan.fallback && this.config.executeFallback) {
        this.emit('plan:failed', plan, new Error(result.error || 'Unknown error'));

        // Execute fallback
        const fallbackResult = await this.execute(plan.fallback, variables);
        return {
          ...fallbackResult,
          usedFallback: true,
        };
      }

      // Update plan status
      plan.status = result.success ? 'completed' : 'failed';
      plan.completedAt = Date.now();
      plan.duration = plan.completedAt - (plan.startedAt || state.startTime);

      this.emit('plan:completed', result);
      return result;
    } catch (error) {
      plan.status = 'failed';
      plan.completedAt = Date.now();
      plan.duration = plan.completedAt - (plan.startedAt || state.startTime);

      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('plan:failed', plan, err);

      return {
        planId: plan.id,
        success: false,
        status: 'failed',
        stepResults: Array.from(state.stepResults.values()),
        duration: plan.duration,
        stepsCompleted: state.stepResults.size,
        stepsFailed: Array.from(state.stepResults.values()).filter((r) => !r.success).length,
        stepsSkipped: 0,
        error: err.message,
        finalOutputs: {},
      };
    } finally {
      this.activePlans.delete(plan.id);
    }
  }

  /**
   * Pause a running plan
   */
  async pause(planId: string): Promise<void> {
    const state = this.activePlans.get(planId);
    if (!state) {
      // Plan already completed or cancelled, silently ignore
      return;
    }

    state.paused = true;
    state.plan.status = 'paused';
    this.emit('plan:paused', state.plan);
  }

  /**
   * Resume a paused plan
   */
  async resume(planId: string): Promise<void> {
    const state = this.activePlans.get(planId);
    if (!state) {
      // Plan already completed or cancelled, silently ignore
      return;
    }

    if (!state.paused) {
      return;
    }

    state.paused = false;
    state.plan.status = 'running';
    this.emit('plan:resumed', state.plan);
  }

  /**
   * Cancel a running plan
   */
  async cancel(planId: string): Promise<void> {
    const state = this.activePlans.get(planId);
    if (!state) {
      // Plan already completed or cancelled, silently ignore
      return;
    }

    state.cancelled = true;
    state.plan.status = 'cancelled';

    // Cancel any running steps
    for (const step of state.plan.steps) {
      if (step.status === 'running') {
        this.executor.cancel(step.id);
        step.status = 'cancelled';
      }
    }

    this.emit('plan:cancelled', state.plan);
  }

  /**
   * Approve a HITL gate
   */
  approveHitl(planId: string, stepId: string): void {
    const state = this.activePlans.get(planId);
    if (!state) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (!state.hitlPending.has(stepId)) {
      throw new Error(`Step ${stepId} is not pending HITL approval`);
    }

    state.hitlPending.delete(stepId);
    const step = state.plan.steps.find((s) => s.id === stepId);
    if (step) {
      this.emit('hitl:approved', step, state.plan);
    }
  }

  /**
   * Reject a HITL gate
   */
  rejectHitl(planId: string, stepId: string, reason: string): void {
    const state = this.activePlans.get(planId);
    if (!state) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (!state.hitlPending.has(stepId)) {
      throw new Error(`Step ${stepId} is not pending HITL approval`);
    }

    state.hitlPending.delete(stepId);
    const step = state.plan.steps.find((s) => s.id === stepId);
    if (step) {
      step.status = 'failed';
      step.error = `HITL rejected: ${reason}`;
      this.emit('hitl:rejected', step, reason, state.plan);
    }
  }

  /**
   * Get active plan IDs
   */
  getActivePlans(): string[] {
    return Array.from(this.activePlans.keys());
  }

  /**
   * Get plan status
   */
  getPlanStatus(planId: string): ChoreographyStatus | null {
    const state = this.activePlans.get(planId);
    return state?.plan.status || null;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Execute the plan
   */
  private async executePlan(state: PlanState): Promise<ChoreographyResult> {
    const { plan: _plan, executionOrder } = state;

    // Execute groups in order
    for (const group of executionOrder.parallelGroups) {
      // Wait while paused
      while (state.paused && !state.cancelled) {
        await this.sleep(100);
      }

      if (state.cancelled) {
        break;
      }

      // Execute steps in current group
      await this.executeGroup(state, group);

      // Check for failures
      const failed = group.some((stepId) => {
        const result = state.stepResults.get(stepId);
        return result && !result.success;
      });

      if (failed) {
        break;
      }

      state.currentGroup++;
    }

    // Calculate result
    return this.buildResult(state);
  }

  /**
   * Execute a group of steps (potentially in parallel)
   */
  private async executeGroup(state: PlanState, stepIds: string[]): Promise<void> {
    const steps = stepIds
      .map((id) => state.plan.steps.find((s) => s.id === id))
      .filter((s): s is ChoreographyStep => s !== undefined);

    // Respect concurrency limit
    const concurrency = this.getConcurrencyLimit(state.plan);
    const batches = this.chunk(steps, concurrency);

    for (const batch of batches) {
      if (state.cancelled) break;

      const promises = batch.map((step) => this.executeStep(state, step));
      await Promise.all(promises);
    }
  }

  /**
   * Execute a single step
   */
  private async executeStep(state: PlanState, step: ChoreographyStep): Promise<void> {
    // Check for HITL gate
    if (step.hitlGate && this.config.autoHitlPause) {
      state.hitlPending.add(step.id);
      this.emit('hitl:required', step, state.plan);

      // Wait for HITL approval
      while (state.hitlPending.has(step.id) && !state.cancelled) {
        await this.sleep(100);
      }

      if (state.cancelled) {
        step.status = 'cancelled';
        return;
      }

      // Check if rejected
      if (step.status === 'failed') {
        state.stepResults.set(step.id, {
          stepId: step.id,
          success: false,
          outputs: {},
          duration: 0,
          error: step.error,
        });
        return;
      }
    }

    // Build step context
    const context = this.buildStepContext(state, step);

    this.emit('step:started', step, state.plan);

    // Execute step
    const result = await this.executor.execute(step, context);

    // Handle step-level fallback if step failed
    if (!result.success && step.fallbackStepId && this.config.executeFallback) {
      const fallbackStep = state.plan.steps.find(
        (s) => s.id === step.fallbackStepId || s.name === step.fallbackStepId
      );
      if (fallbackStep) {
        // Check if fallback already executed
        let fallbackResult = state.stepResults.get(fallbackStep.id);

        // Wait for fallback if it's currently running
        if (!fallbackResult && fallbackStep.status === 'running') {
          while (!state.stepResults.has(fallbackStep.id) && !state.cancelled) {
            await this.sleep(50);
          }
          fallbackResult = state.stepResults.get(fallbackStep.id);
        }

        // If not yet executed and still pending, execute it now
        if (!fallbackResult && fallbackStep.status === 'pending') {
          await this.executeStep(state, fallbackStep);
          fallbackResult = state.stepResults.get(fallbackStep.id);
        }

        if (fallbackResult?.success) {
          // Mark original step as recovered via fallback
          state.stepResults.set(step.id, {
            stepId: step.id,
            success: true,
            outputs: fallbackResult.outputs,
            duration: result.duration,
            usedFallback: true,
          });
          state.stepOutputs.set(step.id, fallbackResult.outputs);
          return;
        }
      }
    }

    // Store results
    state.stepResults.set(step.id, result);
    if (result.success) {
      state.stepOutputs.set(step.id, result.outputs);
    }
  }

  /**
   * Build step context
   */
  private buildStepContext(state: PlanState, step: ChoreographyStep): StepContext {
    const agents = new Map(state.plan.participants.map((a) => [a.id, a]));

    return {
      plan: state.plan,
      currentStep: step,
      agents,
      stepOutputs: state.stepOutputs,
      variables: state.variables,
      startTime: state.startTime,
      elapsedTime: Date.now() - state.startTime,
    };
  }

  /**
   * Build final result
   */
  private buildResult(state: PlanState): ChoreographyResult {
    const stepResults = Array.from(state.stepResults.values());
    const completed = stepResults.filter((r) => r.success).length;
    const failed = stepResults.filter((r) => !r.success).length;
    const skipped = state.plan.steps.length - stepResults.length;

    // Build completed and failed step arrays
    const completedSteps = state.plan.steps.filter((step) => {
      const result = state.stepResults.get(step.id);
      return result?.success;
    });
    const failedSteps = state.plan.steps.filter((step) => {
      const result = state.stepResults.get(step.id);
      return result && !result.success;
    });

    // Get final outputs from terminal steps
    const terminalSteps = state.plan.steps.filter(
      (s) => !state.plan.steps.some((other) => other.dependencies.includes(s.id))
    );
    const finalOutputs: Record<string, unknown> = {};
    for (const step of terminalSteps) {
      const outputs = state.stepOutputs.get(step.id);
      if (outputs) {
        Object.assign(finalOutputs, outputs);
      }
    }

    const success = !state.cancelled && failed === 0 && skipped === 0;

    return {
      planId: state.plan.id,
      success,
      status: state.cancelled ? 'cancelled' : success ? 'completed' : 'failed',
      stepResults,
      duration: Date.now() - state.startTime,
      stepsCompleted: completed,
      stepsFailed: failed,
      stepsSkipped: skipped,
      completedSteps,
      failedSteps,
      error: failed > 0 ? `${failed} step(s) failed` : undefined,
      finalOutputs,
      metrics: {
        peakConcurrency: this.getConcurrencyLimit(state.plan),
      },
    };
  }

  /**
   * Get concurrency limit from constraints
   */
  private getConcurrencyLimit(plan: ChoreographyPlan): number {
    const constraint = plan.constraints.find((c) => c.type === 'concurrency');
    if (constraint && typeof constraint.value === 'number') {
      return constraint.value;
    }
    return this.config.maxConcurrency;
  }

  /**
   * Find plan containing a step
   */
  private findPlanWithStep(stepId: string): PlanState | undefined {
    for (const state of this.activePlans.values()) {
      if (state.plan.steps.some((s) => s.id === stepId)) {
        return state;
      }
    }
    return undefined;
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `plan_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  /**
   * Chunk array into batches
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================================================================
// DEFAULT INSTANCE
// ============================================================================

let defaultEngine: ChoreographyEngine | null = null;

/**
 * Get default choreography engine
 */
export function getDefaultEngine(): ChoreographyEngine {
  if (!defaultEngine) {
    defaultEngine = new ChoreographyEngine();
  }
  return defaultEngine;
}

/**
 * Reset default engine (for testing)
 */
export function resetDefaultEngine(): void {
  defaultEngine = null;
}
