/**
 * Network Retry Strategy
 *
 * Handles network-timeout failures with exponential backoff retry.
 */

import type {
  IRecoveryStrategy,
  IAgentFailure,
  IRecoveryResult,
  FailureType,
} from '../../extensions';

export interface NetworkRetryConfig {
  maxAttempts: number;
  baseBackoffMs: number;
  maxBackoffMs: number;
}

const DEFAULT_CONFIG: NetworkRetryConfig = {
  maxAttempts: 3,
  baseBackoffMs: 1000,
  maxBackoffMs: 30000,
};

/**
 * Retry strategy for transient network failures
 */
export class NetworkRetryStrategy implements IRecoveryStrategy {
  readonly id = 'network-retry';
  readonly handles: FailureType[] = ['network-timeout', 'api-rate-limit'];
  readonly maxAttempts: number;
  readonly backoffMs: number;

  private config: NetworkRetryConfig;
  private retryCallback?: (failure: IAgentFailure) => Promise<boolean>;

  constructor(config: Partial<NetworkRetryConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.maxAttempts = this.config.maxAttempts;
    this.backoffMs = this.config.baseBackoffMs;
  }

  /**
   * Set callback to execute on retry (e.g., re-run the failed operation)
   */
  setRetryCallback(callback: (failure: IAgentFailure) => Promise<boolean>): void {
    this.retryCallback = callback;
  }

  /**
   * Check if this strategy handles the failure
   */
  matches(failure: IAgentFailure): boolean {
    return this.handles.includes(failure.errorType);
  }

  /**
   * Execute retry recovery
   */
  async execute(failure: IAgentFailure): Promise<IRecoveryResult> {
    // If we have a retry callback, use it
    if (this.retryCallback) {
      try {
        const success = await this.retryCallback(failure);
        return {
          success,
          strategyUsed: this.id,
          message: success ? 'Retry succeeded' : 'Retry failed',
          retryRecommended: !success,
          nextAction: success ? undefined : 'retry',
        };
      } catch (error) {
        return {
          success: false,
          strategyUsed: this.id,
          message: error instanceof Error ? error.message : 'Retry failed',
          retryRecommended: true,
          nextAction: 'retry',
        };
      }
    }

    // Default: simulate recovery (actual retry should be done by caller)
    // This is a signal that the operation can be retried
    return {
      success: false,
      strategyUsed: this.id,
      message: 'Retry recommended - operation should be re-attempted',
      retryRecommended: true,
      nextAction: 'retry',
    };
  }

  /**
   * Calculate backoff for attempt number
   */
  getBackoffForAttempt(attempt: number): number {
    const exponentialBackoff = this.config.baseBackoffMs * Math.pow(2, attempt);
    return Math.min(exponentialBackoff, this.config.maxBackoffMs);
  }
}
