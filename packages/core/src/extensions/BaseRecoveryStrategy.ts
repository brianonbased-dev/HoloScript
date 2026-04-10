/**
 * Base Recovery Strategy Implementation
 *
 * Provides base class for implementing self-healing recovery strategies.
 */

import type {
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailureType,
} from './AgentExtensionTypes';

export abstract class BaseRecoveryStrategy implements IRecoveryStrategy {
  constructor(
    public readonly id: string,
    public readonly handles: FailureType[],
    public readonly maxAttempts: number = 3,
    public readonly backoffMs: number = 1000
  ) {}

  /**
   * Check if this strategy can handle the failure
   */
  matches(failure: IAgentFailure): boolean {
    return this.handles.includes(failure.errorType);
  }

  /**
   * Execute recovery with retry logic
   */
  async execute(failure: IAgentFailure): Promise<IRecoveryResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        const result = await this.attemptRecovery(failure, attempt);
        if (result.success) {
          return result;
        }
        lastError = new Error(result.message);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // Exponential backoff
      if (attempt < this.maxAttempts) {
        await this.delay(this.backoffMs * Math.pow(2, attempt - 1));
      }
    }

    return {
      success: false,
      strategyUsed: this.id,
      message: `Recovery failed after ${this.maxAttempts} attempts: ${lastError?.message}`,
      retryRecommended: false,
      nextAction: 'escalate',
    };
  }

  /**
   * Implement this to perform actual recovery
   */
  protected abstract attemptRecovery(
    failure: IAgentFailure,
    attempt: number
  ): Promise<IRecoveryResult>;

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Retry-based recovery strategy
 */
export class RetryRecoveryStrategy extends BaseRecoveryStrategy {
  private retryFn: (failure: IAgentFailure) => Promise<boolean>;

  constructor(
    id: string,
    handles: FailureType[],
    retryFn: (failure: IAgentFailure) => Promise<boolean>,
    options?: { maxAttempts?: number; backoffMs?: number }
  ) {
    super(id, handles, options?.maxAttempts ?? 3, options?.backoffMs ?? 1000);
    this.retryFn = retryFn;
  }

  protected async attemptRecovery(
    failure: IAgentFailure,
    attempt: number
  ): Promise<IRecoveryResult> {
    const success = await this.retryFn(failure);

    return {
      success,
      strategyUsed: this.id,
      message: success
        ? `Recovery succeeded on attempt ${attempt}`
        : `Retry attempt ${attempt} failed`,
      retryRecommended: !success && attempt < this.maxAttempts,
      nextAction: success ? undefined : attempt >= this.maxAttempts ? 'escalate' : 'retry',
    };
  }
}

/**
 * Skip and continue strategy
 */
export class SkipRecoveryStrategy extends BaseRecoveryStrategy {
  constructor(handles: FailureType[]) {
    super('skip', handles, 1, 0);
  }

  protected async attemptRecovery(
    _failure: IAgentFailure,
    _attempt: number
  ): Promise<IRecoveryResult> {
    return {
      success: true,
      strategyUsed: 'skip',
      message: 'Skipped failed operation',
      retryRecommended: false,
      nextAction: 'skip',
    };
  }
}

/**
 * Immediate escalation strategy
 */
export class EscalateRecoveryStrategy extends BaseRecoveryStrategy {
  private escalateTo: string;

  constructor(handles: FailureType[], escalateTo: string) {
    super('escalate', handles, 1, 0);
    this.escalateTo = escalateTo;
  }

  protected async attemptRecovery(
    failure: IAgentFailure,
    _attempt: number
  ): Promise<IRecoveryResult> {
    return {
      success: false,
      strategyUsed: 'escalate',
      message: `Escalating ${failure.errorType} to ${this.escalateTo}`,
      retryRecommended: false,
      nextAction: 'escalate',
    };
  }
}

/**
 * Network timeout recovery (common pattern)
 */
export class NetworkTimeoutRecovery extends BaseRecoveryStrategy {
  constructor(maxAttempts: number = 3, backoffMs: number = 2000) {
    super('network-timeout-recovery', ['network-timeout'], maxAttempts, backoffMs);
  }

  protected async attemptRecovery(
    failure: IAgentFailure,
    attempt: number
  ): Promise<IRecoveryResult> {
    // Subclass should override to implement actual retry logic
    // This is a template
    return {
      success: false,
      strategyUsed: this.id,
      message: `Network retry attempt ${attempt} - implement actual retry logic`,
      retryRecommended: attempt < this.maxAttempts,
      nextAction: 'retry',
    };
  }
}

/**
 * Rate limit recovery (wait and retry)
 */
export class RateLimitRecovery extends BaseRecoveryStrategy {
  constructor() {
    // Longer backoff for rate limits
    super('rate-limit-recovery', ['api-rate-limit'], 5, 10000);
  }

  protected async attemptRecovery(
    failure: IAgentFailure,
    attempt: number
  ): Promise<IRecoveryResult> {
    // Wait based on attempt number
    const waitTime = this.backoffMs * attempt;

    return {
      success: false,
      strategyUsed: this.id,
      message: `Rate limit - waiting ${waitTime}ms before retry ${attempt}`,
      retryRecommended: true,
      nextAction: 'retry',
    };
  }
}
