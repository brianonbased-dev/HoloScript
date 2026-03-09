/**
 * @holoscript/std — Events Module
 *
 * Provides a typed event bus for HoloScript compositions.
 * Supports emit, on, once, off, and wildcard listeners.
 *
 * @version 0.2.0
 * @module @holoscript/std/events
 */

export type EventHandler<T = any> = (data: T) => void;

interface Listener {
  handler: EventHandler;
  once: boolean;
}

export class EventBus {
  private listeners: Map<string, Listener[]> = new Map();
  private wildcardListeners: Listener[] = [];

  /** Register an event listener. */
  on<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const listener: Listener = { handler, once: false };
    this.listeners.get(event)!.push(listener);
    return () => this.off(event, handler);
  }

  /** Register a one-time event listener. */
  once<T = any>(event: string, handler: EventHandler<T>): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    const listener: Listener = { handler, once: true };
    this.listeners.get(event)!.push(listener);
    return () => this.off(event, handler);
  }

  /** Remove an event listener. */
  off(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(
      event,
      list.filter((l) => l.handler !== handler)
    );
  }

  /** Emit an event to all registered listeners. */
  emit<T = any>(event: string, data?: T): void {
    // Fire specific listeners
    const list = this.listeners.get(event);
    if (list) {
      const remaining: Listener[] = [];
      for (const l of list) {
        l.handler(data);
        if (!l.once) remaining.push(l);
      }
      this.listeners.set(event, remaining);
    }
    // Fire wildcard listeners
    for (const l of this.wildcardListeners) {
      l.handler({ event, data });
    }
  }

  /** Listen to all events. */
  onAny(handler: EventHandler<{ event: string; data: any }>): () => void {
    const listener: Listener = { handler, once: false };
    this.wildcardListeners.push(listener);
    return () => {
      this.wildcardListeners = this.wildcardListeners.filter((l) => l !== listener);
    };
  }

  /** Remove all listeners. */
  clear(): void {
    this.listeners.clear();
    this.wildcardListeners = [];
  }

  /** Get count of listeners for an event (or all events). */
  listenerCount(event?: string): number {
    if (event) return (this.listeners.get(event) || []).length;
    let total = this.wildcardListeners.length;
    for (const [, list] of this.listeners) total += list.length;
    return total;
  }
}
