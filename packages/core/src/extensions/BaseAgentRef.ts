/**
 * Base Agent Reference Implementation
 *
 * Provides default implementations for IAgentRef.
 * Extend this class to customize messaging behavior.
 */

import type { IAgentRef } from './AgentExtensionTypes';

export abstract class BaseAgentRef<T = unknown> implements IAgentRef<T> {
  constructor(public readonly agentId: string) {}

  /**
   * Send message without waiting (fire-and-forget)
   * Override to implement actual message delivery.
   */
  abstract tell(message: T): Promise<void>;

  /**
   * Send message and wait for response.
   * Default implementation uses tell + response correlation.
   */
  async ask<R = unknown>(message: T, timeoutMs: number = 5000): Promise<R> {
     
    return new Promise(async (resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Ask timeout after ${timeoutMs}ms to agent ${this.agentId}`));
      }, timeoutMs);

      try {
        // Subclasses should implement correlation logic
        const response = await this.sendAndAwaitResponse<R>(message, timeoutMs);
        clearTimeout(timer);
        resolve(response);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  /**
   * Implement this to handle request-response correlation.
   */
  protected abstract sendAndAwaitResponse<R>(message: T, timeoutMs: number): Promise<R>;

  /**
   * Get agent state. Override to implement state retrieval.
   */
  abstract getState(): Promise<unknown>;

  /**
   * Check if agent is active. Override to implement status checking.
   */
  abstract isActive(): Promise<boolean>;
}

/**
 * In-memory agent reference (for local agents)
 */
export class LocalAgentRef<T = unknown> extends BaseAgentRef<T> {
  private inboxHandler?: (message: T) => Promise<unknown>;
  private stateProvider?: () => unknown;
  private activeCheck?: () => boolean;

  constructor(
    agentId: string,
    options?: {
      onMessage?: (message: T) => Promise<unknown>;
      getState?: () => unknown;
      isActive?: () => boolean;
    }
  ) {
    super(agentId);
    this.inboxHandler = options?.onMessage;
    this.stateProvider = options?.getState;
    this.activeCheck = options?.isActive;
  }

  async tell(message: T): Promise<void> {
    if (this.inboxHandler) {
      // Fire and forget - don't await
      this.inboxHandler(message).catch(() => {
        // Swallow errors in tell (fire-and-forget)
      });
    }
  }

  protected async sendAndAwaitResponse<R>(message: T, _timeoutMs: number): Promise<R> {
    if (!this.inboxHandler) {
      throw new Error(`Agent ${this.agentId} has no message handler`);
    }
    const response = await this.inboxHandler(message);
    return response as R;
  }

  async getState(): Promise<unknown> {
    return this.stateProvider?.() ?? {};
  }

  async isActive(): Promise<boolean> {
    return this.activeCheck?.() ?? true;
  }
}
