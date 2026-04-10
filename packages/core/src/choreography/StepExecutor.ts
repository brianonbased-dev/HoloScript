/**
 * @holoscript/core - Step Executor
 *
 * Executes individual choreography steps with retry logic.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import { EventEmitter } from 'events';
import type { AgentManifest } from '../agents/AgentManifest';
import type { ChoreographyStep, StepContext, StepResult, RetryConfig } from './ChoreographyTypes';
import { DEFAULT_RETRY_CONFIG } from './ChoreographyTypes';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Agent action handler signature
 */
export type ActionHandler = (
  agent: AgentManifest,
  action: string,
  inputs: Record<string, unknown>,
  context: StepContext
) => Promise<Record<string, unknown>>;

/**
 * Step executor configuration
 */
export interface StepExecutorConfig {
  /** Default timeout (ms) */
  defaultTimeout: number;
  /** Default retry configuration */
  defaultRetry: RetryConfig;
  /** Whether to emit verbose events */
  verbose: boolean;
}

/**
 * Default executor configuration
 */
export const DEFAULT_EXECUTOR_CONFIG: StepExecutorConfig = {
  defaultTimeout: 30000,
  defaultRetry: DEFAULT_RETRY_CONFIG,
  verbose: false,
};

/**
 * Step executor events
 */
export interface StepExecutorEvents {
  'step:starting': (step: ChoreographyStep) => void;
  'step:inputs:resolved': (step: ChoreographyStep, inputs: Record<string, unknown>) => void;
  'step:executing': (step: ChoreographyStep, agent: AgentManifest) => void;
  'step:completed': (step: ChoreographyStep, result: StepResult) => void;
  'step:failed': (step: ChoreographyStep, error: Error) => void;
  'step:retrying': (step: ChoreographyStep, attempt: number, delay: number) => void;
  'step:timeout': (step: ChoreographyStep, timeout: number) => void;
  'step:skipped': (step: ChoreographyStep, reason: string) => void;
}

// ============================================================================
// STEP EXECUTOR
// ============================================================================

/**
 * Executes individual choreography steps
 */
export class StepExecutor extends EventEmitter {
  private config: StepExecutorConfig;
  private actionHandler: ActionHandler | null = null;
  private runningSteps: Map<string, AbortController> = new Map();

  constructor(config: Partial<StepExecutorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Register the action handler for executing agent actions
   */
  setActionHandler(handler: ActionHandler): void {
    this.actionHandler = handler;
  }

  /**
   * Execute a single step
   */
  async execute(step: ChoreographyStep, context: StepContext): Promise<StepResult> {
    const startTime = Date.now();

    // Check if step should be skipped
    if (this.shouldSkip(step, context)) {
      const reason = 'Condition not met';
      this.emit('step:skipped', step, reason);
      return {
        stepId: step.id,
        success: true,
        outputs: {},
        duration: 0,
        error: undefined,
      };
    }

    // Get agent manifest
    const agent = context.agents.get(step.agentId);
    if (!agent) {
      throw new Error(`Agent not found: ${step.agentId}`);
    }

    // Resolve inputs
    const resolvedInputs = this.resolveInputs(step.inputs, context);
    this.emit('step:inputs:resolved', step, resolvedInputs);

    // Get retry config
    const retryConfig: RetryConfig = {
      ...this.config.defaultRetry,
      ...(step.retry || {}),
    };

    // Execute with retries
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= retryConfig.maxRetries) {
      try {
        // Update step status
        step.status = 'running';
        step.startedAt = Date.now();
        step.retryAttempt = attempt;

        this.emit('step:executing', step, agent);

        // Create abort controller for timeout
        const abortController = new AbortController();
        this.runningSteps.set(step.id, abortController);

        // Execute with timeout
        const timeout = step.timeout || this.config.defaultTimeout;
        const outputs = await this.executeWithTimeout(
          step,
          agent,
          resolvedInputs,
          context,
          timeout,
          abortController.signal
        );

        // Success
        this.runningSteps.delete(step.id);
        step.status = 'completed';
        step.completedAt = Date.now();
        step.duration = step.completedAt - step.startedAt;

        const result: StepResult = {
          stepId: step.id,
          success: true,
          outputs,
          duration: step.duration,
          retries: attempt,
        };

        this.emit('step:completed', step, result);
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.runningSteps.delete(step.id);

        // If cancelled, don't retry - return immediately
        if (lastError.message.includes('cancelled')) {
          step.status = 'failed';
          step.completedAt = Date.now();
          step.duration = step.completedAt - (step.startedAt || startTime);
          step.error = lastError.message;

          return {
            stepId: step.id,
            success: false,
            outputs: {},
            duration: step.duration,
            error: step.error,
            retries: attempt,
          };
        }

        // Check if we should retry
        if (attempt < retryConfig.maxRetries) {
          // Check retry condition
          if (retryConfig.condition && !retryConfig.condition(lastError, attempt)) {
            break;
          }

          // Calculate delay
          const delay = this.calculateDelay(retryConfig, attempt);
          this.emit('step:retrying', step, attempt + 1, delay);

          // Wait before retry
          await this.sleep(delay);
        }

        attempt++;
      }
    }

    // All retries exhausted
    step.status = 'failed';
    step.completedAt = Date.now();
    step.duration = step.completedAt - (step.startedAt || startTime);
    step.error = lastError?.message || 'Unknown error';

    this.emit('step:failed', step, lastError || new Error('Unknown error'));

    return {
      stepId: step.id,
      success: false,
      outputs: {},
      duration: step.duration,
      error: step.error,
      retries: attempt - 1,
    };
  }

  /**
   * Cancel a running step
   */
  cancel(stepId: string): boolean {
    const controller = this.runningSteps.get(stepId);
    if (controller) {
      controller.abort();
      this.runningSteps.delete(stepId);
      return true;
    }
    return false;
  }

  /**
   * Check if any steps are running
   */
  isRunning(stepId?: string): boolean {
    if (stepId) {
      return this.runningSteps.has(stepId);
    }
    return this.runningSteps.size > 0;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  /**
   * Check if step should be skipped
   */
  private shouldSkip(step: ChoreographyStep, context: StepContext): boolean {
    if (!step.condition) return false;

    if (typeof step.condition === 'function') {
      return !step.condition(context);
    }

    // String condition - evaluate as expression
    // For safety, we use a limited evaluator
    try {
      return !this.evaluateCondition(step.condition, context);
    } catch {
      return false;
    }
  }

  /**
   * Evaluate a string condition
   */
  private evaluateCondition(condition: string, context: StepContext): boolean {
    // Replace step references with actual values
    // e.g., 'step#review.outputs.approved == true'
    const stepRefRegex = /step#(\w+)\.outputs\.(\w+)/g;
    let evaluated = condition;

    evaluated = evaluated.replace(stepRefRegex, (_, stepId, outputKey) => {
      const outputs = context.stepOutputs.get(stepId);
      if (outputs && outputKey in outputs) {
        const value = outputs[outputKey];
        if (typeof value === 'string') {
          return `"${value}"`;
        }
        return String(value);
      }
      return 'undefined';
    });

    // Simple equality check (secure - no eval)
    const eqMatch = evaluated.match(/^(.+)\s*==\s*(.+)$/);
    if (eqMatch) {
      const [, left, right] = eqMatch;
      return this.parseValue(left.trim()) === this.parseValue(right.trim());
    }

    // Boolean check
    const value = this.parseValue(evaluated.trim());
    return Boolean(value);
  }

  /**
   * Parse a string value
   */
  private parseValue(str: string): unknown {
    if (str === 'true') return true;
    if (str === 'false') return false;
    if (str === 'null') return null;
    if (str === 'undefined') return undefined;
    if (/^-?\d+$/.test(str)) return parseInt(str, 10);
    if (/^-?\d+\.\d+$/.test(str)) return parseFloat(str);
    if (str.startsWith('"') && str.endsWith('"')) {
      return str.slice(1, -1);
    }
    return str;
  }

  /**
   * Resolve input references
   */
  private resolveInputs(
    inputs: Record<string, unknown>,
    context: StepContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(inputs)) {
      if (typeof value === 'string') {
        // Check for ${stepName.outputKey} reference (supports hyphens in step names)
        const templateRef = value.match(/^\$\{([\w-]+)\.([\w-]+)\}$/);
        if (templateRef) {
          const [, stepName, outputKey] = templateRef;
          // First try to get from stepOutputs using the name as id
          let outputs = context.stepOutputs.get(stepName);

          // If no direct match and we have a plan, try to find step by name
          if (!outputs && context.plan?.steps) {
            const referencedStep = context.plan.steps.find(
              (s) => s.name === stepName || s.id === stepName
            );
            if (referencedStep) {
              outputs = context.stepOutputs.get(referencedStep.id);
            }
          }

          if (outputs) {
            resolved[key] = outputs[outputKey];
            continue;
          }
        }

        // Check for step output reference (step#stepId.outputs.outputKey)
        const stepRef = value.match(/^step#(\w+)\.outputs\.(\w+)$/);
        if (stepRef) {
          const [, stepId, outputKey] = stepRef;
          const outputs = context.stepOutputs.get(stepId);
          resolved[key] = outputs?.[outputKey];
          continue;
        }

        // Check for state reference
        const stateRef = value.match(/^state\.(\w+)$/);
        if (stateRef) {
          resolved[key] = context.variables[stateRef[1]];
          continue;
        }
      }

      // No reference, use value directly
      resolved[key] = value;
    }

    return resolved;
  }

  /**
   * Execute with timeout
   */
  private async executeWithTimeout(
    step: ChoreographyStep,
    agent: AgentManifest,
    inputs: Record<string, unknown>,
    context: StepContext,
    timeout: number,
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    if (!this.actionHandler) {
      throw new Error('No action handler registered');
    }

    return new Promise((resolve, reject) => {
      // Timeout timer
      const timer = setTimeout(() => {
        this.emit('step:timeout', step, timeout);
        reject(new Error(`Step timed out after ${timeout}ms`));
      }, timeout);

      // Abort handler
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Step was cancelled'));
      });

      // Execute action
      this.actionHandler!(agent, step.action, inputs, context)
        .then((outputs) => {
          clearTimeout(timer);
          resolve(outputs);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  /**
   * Calculate retry delay
   */
  private calculateDelay(config: RetryConfig, attempt: number): number {
    let delay = config.delay;

    switch (config.strategy) {
      case 'none':
        return 0;
      case 'immediate':
        return 0;
      case 'fixed':
        return delay;
      case 'exponential':
        delay = delay * Math.pow(config.backoffMultiplier || 2, attempt);
        break;
    }

    // Cap at max delay
    if (config.maxDelay && delay > config.maxDelay) {
      delay = config.maxDelay;
    }

    // Add jitter (±10%)
    const jitter = delay * 0.1 * (Math.random() * 2 - 1);
    return Math.round(delay + jitter);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Default step executor instance
 */
let defaultExecutor: StepExecutor | null = null;

/**
 * Get default executor
 */
export function getDefaultExecutor(): StepExecutor {
  if (!defaultExecutor) {
    defaultExecutor = new StepExecutor();
  }
  return defaultExecutor;
}

/**
 * Reset default executor (for testing)
 */
export function resetDefaultExecutor(): void {
  defaultExecutor = null;
}
