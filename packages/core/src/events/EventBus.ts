/**
 * EventBus.ts
 *
 * Global pub/sub event system for decoupled inter-system communication.
 * Enables: FSM → Animation, Particle → Audio, Gesture → UI, etc.
 *
 * Features:
 * - Typed event channels
 * - Priority-ordered listeners
 * - Once listeners (auto-remove)
 * - Wildcard subscriptions
 * - Event history / replay
 */

export type EventCallback = (data: unknown) => void;

interface Listener {
  callback: EventCallback;
  priority: number;
  once: boolean;
  id: number;
}

export class EventBus {
  private listeners: Map<string, Listener[]> = new Map();
  private history: Array<{ event: string; data: unknown; timestamp: number }> = [];
  private maxHistory: number = 100;
  private nextId: number = 0;
  private paused: boolean = false;

  /**
   * Subscribe to an event.
   */
  on(event: string, callback: EventCallback, priority: number = 0): number {
    const id = this.nextId++;
    const list = this.listeners.get(event) || [];
    list.push({ callback, priority, once: false, id });
    list.sort((a, b) => b.priority - a.priority); // Higher priority first
    this.listeners.set(event, list);
    return id;
  }

  /**
   * Subscribe to an event once (auto-removes after first fire).
   */
  once(event: string, callback: EventCallback, priority: number = 0): number {
    const id = this.nextId++;
    const list = this.listeners.get(event) || [];
    list.push({ callback, priority, once: true, id });
    list.sort((a, b) => b.priority - a.priority);
    this.listeners.set(event, list);
    return id;
  }

  /**
   * Unsubscribe by listener ID.
   */
  off(listenerId: number): void {
    for (const [event, list] of this.listeners) {
      const idx = list.findIndex((l) => l.id === listenerId);
      if (idx !== -1) {
        list.splice(idx, 1);
        return;
      }
    }
  }

  /**
   * Unsubscribe all listeners for an event.
   */
  offAll(event: string): void {
    this.listeners.delete(event);
  }

  /**
   * Emit an event to all subscribers.
   */
  emit(event: string, data?: unknown): void {
    if (this.paused) return;

    // Record history
    this.history.push({ event, data, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    // Direct listeners
    const list = this.listeners.get(event);
    if (list) {
      const toRemove: number[] = [];
      for (const listener of list) {
        listener.callback(data);
        if (listener.once) toRemove.push(listener.id);
      }
      for (const id of toRemove) {
        const idx = list.findIndex((l) => l.id === id);
        if (idx !== -1) list.splice(idx, 1);
      }
    }

    // Wildcard listeners (subscribe to '*' to get all events)
    if (event !== '*') {
      const wildcardList = this.listeners.get('*');
      if (wildcardList) {
        for (const listener of wildcardList) {
          listener.callback({ event, data });
        }
      }
    }
  }

  /**
   * Get event history.
   */
  getHistory(): Array<{ event: string; data: unknown; timestamp: number }> {
    return [...this.history];
  }

  /**
   * Get listener count for an event.
   */
  listenerCount(event: string): number {
    return this.listeners.get(event)?.length || 0;
  }

  /**
   * Pause/resume event emission.
   */
  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  /**
   * Clear all listeners and history.
   */
  clear(): void {
    this.listeners.clear();
    this.history = [];
  }
}

// Singleton shared event bus
let sharedBus: EventBus | null = null;

export function getSharedEventBus(): EventBus {
  if (!sharedBus) sharedBus = new EventBus();
  return sharedBus;
}

export function setSharedEventBus(bus: EventBus): void {
  sharedBus = bus;
}
