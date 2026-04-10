/**
 * @holoscript/runtime - Event Bus
 *
 * Global event system for cross-component communication.
 * Supports both internal events and window CustomEvents for cross-context messaging.
 */

export type EventCallback<T = unknown> = (data: T) => void;
export type UnsubscribeFn = () => void;

/**
 * Event Bus class for pub/sub messaging
 */
export class EventBus {
  private listeners: Map<string, Set<EventCallback>> = new Map();
  private onceListeners: Map<string, Set<EventCallback>> = new Map();

  /**
   * Subscribe to an event
   */
  on<T = unknown>(event: string, callback: EventCallback<T>): UnsubscribeFn {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback as EventCallback);

    return () => this.off(event, callback);
  }

  /**
   * Subscribe to an event once
   */
  once<T = unknown>(event: string, callback: EventCallback<T>): UnsubscribeFn {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    this.onceListeners.get(event)!.add(callback as EventCallback);

    return () => {
      this.onceListeners.get(event)?.delete(callback as EventCallback);
    };
  }

  /**
   * Emit an event
   */
  emit<T = unknown>(event: string, data?: T): void {
    // Regular listeners
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[HoloScript] Error in event handler for "${event}":`, err);
        }
      });
    }

    // Once listeners
    const onceCallbacks = this.onceListeners.get(event);
    if (onceCallbacks) {
      onceCallbacks.forEach((cb) => {
        try {
          cb(data);
        } catch (err) {
          console.error(`[HoloScript] Error in once handler for "${event}":`, err);
        }
      });
      this.onceListeners.delete(event);
    }

    // Dispatch to window for cross-context communication
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(`holoscript:${event}`, { detail: data }));
    }
  }

  /**
   * Unsubscribe from an event
   */
  off<T = unknown>(event: string, callback?: EventCallback<T>): void {
    if (callback) {
      this.listeners.get(event)?.delete(callback as EventCallback);
    } else {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    }
  }

  /**
   * Remove all listeners
   */
  clear(): void {
    this.listeners.clear();
    this.onceListeners.clear();
  }

  /**
   * Get listener count for an event
   */
  listenerCount(event: string): number {
    const regular = this.listeners.get(event)?.size ?? 0;
    const once = this.onceListeners.get(event)?.size ?? 0;
    return regular + once;
  }

  /**
   * Check if event has listeners
   */
  hasListeners(event: string): boolean {
    return this.listenerCount(event) > 0;
  }
}

// Global singleton instance
export const eventBus = new EventBus();

// Convenience functions that use the global instance
export const on = eventBus.on.bind(eventBus);
export const once = eventBus.once.bind(eventBus);
export const emit = eventBus.emit.bind(eventBus);
export const off = eventBus.off.bind(eventBus);

/**
 * Listen to window CustomEvents from HoloScript
 */
export function onWindowEvent<T = unknown>(
  event: string,
  callback: EventCallback<T>
): UnsubscribeFn {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (e: Event) => {
    callback((e as CustomEvent).detail as T);
  };

  window.addEventListener(`holoscript:${event}`, handler);
  return () => window.removeEventListener(`holoscript:${event}`, handler);
}

export default eventBus;
