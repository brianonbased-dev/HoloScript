/**
 * @holoscript/core WebSocket Reconnection Handler
 *
 * Automatic reconnection with exponential backoff and jitter
 * Handles transient network failures gracefully
 *
 * @version 3.1
 * @Sprint v3.1 Network Resilience
 */

interface ReconnectionConfig {
  /** Initial retry delay in milliseconds */
  initialDelayMs: number;

  /** Maximum retry delay in milliseconds */
  maxDelayMs: number;

  /** Multiplier for exponential backoff (e.g., 2 = double each time) */
  backoffMultiplier: number;

  /** Maximum number of reconnection attempts (-1 = infinite) */
  maxAttempts: number;

  /** Add random jitter to prevent thundering herd */
  jitter: boolean;
}

export class WebSocketReconnectionHandler {
  private config: ReconnectionConfig;
  private reconnectCount: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private lastReconnectTime: number = 0;
  private isReconnecting: boolean = false;

  constructor(config: Partial<ReconnectionConfig> = {}) {
    this.config = {
      initialDelayMs: config.initialDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxAttempts: config.maxAttempts ?? -1,
      jitter: config.jitter ?? true,
    };
  }

  /**
   * Calculate next reconnection delay
   */
  calculateDelay(): number {
    let delay =
      this.config.initialDelayMs * Math.pow(this.config.backoffMultiplier, this.reconnectCount);

    // Cap at max delay
    delay = Math.min(delay, this.config.maxDelayMs);

    // Add jitter if enabled (±10%)
    if (this.config.jitter) {
      const jitterAmount = delay * 0.1;
      delay += (Math.random() - 0.5) * jitterAmount * 2;
    }

    return Math.floor(Math.max(this.config.initialDelayMs, delay));
  }

  /**
   * Get current reconnection attempt number
   */
  getAttemptCount(): number {
    return this.reconnectCount;
  }

  /**
   * Check if should retry (respects max attempts)
   */
  shouldRetry(): boolean {
    if (this.config.maxAttempts === -1) {
      return true; // Infinite retries
    }
    return this.reconnectCount < this.config.maxAttempts;
  }

  /**
   * Schedule reconnection
   */
  scheduleReconnect(callback: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isReconnecting) {
        reject(new Error('Reconnection already in progress'));
        return;
      }

      if (!this.shouldRetry()) {
        reject(new Error(`Max reconnection attempts (${this.config.maxAttempts}) exceeded`));
        return;
      }

      const delay = this.calculateDelay();
      this.isReconnecting = true;
      this.lastReconnectTime = Date.now();

      this.reconnectTimer = setTimeout(async () => {
        this.reconnectTimer = null;
        this.reconnectCount++;

        try {
          await callback();
          this.reset(); // Success - reset counter
          resolve();
        } catch (error) {
          this.isReconnecting = false;
          reject(error);
        }
      }, delay);
    });
  }

  /**
   * Cancel pending reconnection
   */
  cancel(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
  }

  /**
   * Reset on successful reconnection
   */
  reset(): void {
    this.reconnectCount = 0;
    this.isReconnecting = false;
  }

  /**
   * Get reconnection stats
   */
  getStats(): {
    attempts: number;
    isReconnecting: boolean;
    lastReconnectTime: number | null;
    nextRetryIn: number;
  } {
    const nextDelay = this.shouldRetry() ? this.calculateDelay() : -1;
    const timeSinceLastRetry = this.lastReconnectTime ? Date.now() - this.lastReconnectTime : 0;

    return {
      attempts: this.reconnectCount,
      isReconnecting: this.isReconnecting,
      lastReconnectTime: this.lastReconnectTime || null,
      nextRetryIn: Math.max(0, nextDelay - timeSinceLastRetry),
    };
  }

  /**
   * Destroy handler
   */
  destroy(): void {
    this.cancel();
    this.reconnectCount = 0;
    this.lastReconnectTime = 0;
  }
}

export default WebSocketReconnectionHandler;
