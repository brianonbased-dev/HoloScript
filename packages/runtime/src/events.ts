/**
 * @holoscript/runtime - Event Bus
 *
 * Global event system for cross-component communication.
 * Supports both internal events and window CustomEvents for cross-context messaging.
 */

import { getSharedEventBus } from '@holoscript/core';

export type EventCallback<T = unknown> = (data: T) => void;
export type UnsubscribeFn = () => void;

/** The shape this bridge needs from core's bus: a wildcard subscribe, and an id-based off. */
export interface CoreBusLike {
  on(event: string, callback: (data: unknown) => void, priority?: number): number;
  off(listenerId: number): void;
}

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
 * Forward every event emitted on core's shared bus onto this one.
 *
 * THE GAP THIS CLOSES. Traits emit through core's bus — HoloScriptRuntime.globalBusEmit
 * calls getSharedEventBus().emit — while compositions and BrowserRuntime listen on the bus
 * in this file. They are different classes with incompatible APIs (core's `on` returns a
 * numeric listener id and `off` takes that id; this one returns an unsubscribe function), so
 * they were never interchangeable, and `setSharedEventBus` is exported and called nowhere.
 * A trait announcing `memory_recalled` and a composition declaring `on_memory_recalled` were
 * on opposite sides of that wall, each working perfectly.
 *
 * DIRECTION IS ONE-WAY, core -> runtime. Nothing here emits back onto core, so the bridge
 * cannot loop; a test pins that runtime traffic does not appear on the core bus, so whoever
 * adds the second direction later finds out immediately rather than in a stack overflow.
 *
 * The guard is PER EVENT NAME, not a single flag. A global flag would suppress an unrelated
 * event emitted while another was being forwarded — a legitimate cascade silently dropped.
 * This only stops an event from re-forwarding *itself*.
 *
 * Lives in runtime because runtime depends on @holoscript/core and not the reverse; putting
 * it in core would invert the package dependency.
 */
export function bridgeCoreEventBus(
  coreBus: CoreBusLike = getSharedEventBus() as unknown as CoreBusLike,
  target: EventBus = eventBus
): UnsubscribeFn {
  const inFlight = new Set<string>();
  // Core supports a '*' wildcard listener that receives {event, data}, so one subscription
  // covers every event name rather than one per name.
  const listenerId = coreBus.on('*', (payload: unknown) => {
    const { event, data } = (payload ?? {}) as { event?: string; data?: unknown };
    if (typeof event !== 'string' || inFlight.has(event)) return;
    inFlight.add(event);
    try {
      target.emit(event, data);
    } finally {
      inFlight.delete(event);
    }
  });
  return () => coreBus.off(listenerId);
}

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
