/**
 * HoloScript Unified Event Bus
 *
 * Provides a centralized event system for cross-orb and cross-trait communication.
 * Implements a singleton pattern to ensure a single source of truth for global events.
 */

    // @ts-expect-error migration TS2307
import { logger } from '@holoscript/core';
    // @ts-expect-error migration TS2307
import type { HoloScriptValue } from '@holoscript/core';

export type EventHandler = (data?: HoloScriptValue) => void | Promise<void>;

export class GlobalEventBus {
  private static instance: GlobalEventBus;
  private handlers: Map<string, Set<EventHandler>> = new Map();

  private constructor() {}

  /**
   * Get the singleton instance
   */
  public static getInstance(): GlobalEventBus {
    if (!GlobalEventBus.instance) {
      GlobalEventBus.instance = new GlobalEventBus();
    }
    return GlobalEventBus.instance;
  }

  /**
   * Register an event listener
   * @param event The event name
   * @param handler Callback function
   * @returns Unsubscribe function
   */
  public on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);

    logger.debug(`[EventBus] Listener added for: ${event}`);

    return () => {
      this.off(event, handler);
    };
  }

  /**
   * Remove an event listener
   */
  public off(event: string, handler: EventHandler): void {
    const handlers = this.handlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.handlers.delete(event);
      }
    }
  }

  /**
   * Emit an event to all registered listeners
   */
  public async emit(event: string, data?: HoloScriptValue): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers || handlers.size === 0) {
      return;
    }

    logger.debug(`[EventBus] Emitting: ${event}`, { data });

    const promises: Array<void | Promise<void>> = [];
    handlers.forEach((handler) => {
      try {
        promises.push(handler(data));
      } catch (error) {
        logger.error(`[EventBus] Error in handler for ${event}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(promises);
  }

  /**
   * Clear all event handlers
   */
  public clear(): void {
    this.handlers.clear();
  }

  /**
   * Get all registered events (for debugging)
   */
  public getEvents(): string[] {
    return Array.from(this.handlers.keys());
  }
}

/**
 * Convenience export for the singleton
 */
export const eventBus = GlobalEventBus.getInstance();
