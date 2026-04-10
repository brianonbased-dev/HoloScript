/**
 * EventDispatcher.ts
 *
 * Priority-based event system: typed events, listener priorities,
 * event bubbling, deferred dispatch, and one-shot listeners.
 *
 * @module scripting
 */

// =============================================================================
// TYPES
// =============================================================================

export interface GameEvent {
  type: string;
  data: Record<string, unknown>;
  timestamp: number;
  propagate: boolean;
  handled: boolean;
  source?: string;
}

export interface EventListener {
  id: string;
  type: string;
  callback: (event: GameEvent) => void;
  priority: number; // Higher = called first
  once: boolean;
}

// =============================================================================
// EVENT DISPATCHER
// =============================================================================

let _listenerId = 0;

export class EventDispatcher {
  private listeners: Map<string, EventListener[]> = new Map();
  private deferredQueue: GameEvent[] = [];
  private eventHistory: GameEvent[] = [];
  private historyLimit = 200;
  private paused = false;

  // ---------------------------------------------------------------------------
  // Subscription
  // ---------------------------------------------------------------------------

  on(type: string, callback: (event: GameEvent) => void, priority = 0): string {
    const id = `evt_${_listenerId++}`;
    const listener: EventListener = { id, type, callback, priority, once: false };

    if (!this.listeners.has(type)) this.listeners.set(type, []);
    const list = this.listeners.get(type)!;
    list.push(listener);
    list.sort((a, b) => b.priority - a.priority); // High priority first
    return id;
  }

  once(type: string, callback: (event: GameEvent) => void, priority = 0): string {
    const id = `evt_${_listenerId++}`;
    const listener: EventListener = { id, type, callback, priority, once: true };

    if (!this.listeners.has(type)) this.listeners.set(type, []);
    const list = this.listeners.get(type)!;
    list.push(listener);
    list.sort((a, b) => b.priority - a.priority);
    return id;
  }

  off(listenerId: string): boolean {
    for (const [type, list] of this.listeners) {
      const idx = list.findIndex((l) => l.id === listenerId);
      if (idx >= 0) {
        list.splice(idx, 1);
        if (list.length === 0) this.listeners.delete(type);
        return true;
      }
    }
    return false;
  }

  offAll(type: string): void {
    this.listeners.delete(type);
  }

  // ---------------------------------------------------------------------------
  // Dispatch
  // ---------------------------------------------------------------------------

  emit(type: string, data: Record<string, unknown> = {}, source?: string): GameEvent {
    const event: GameEvent = {
      type,
      data,
      timestamp: Date.now(),
      propagate: true,
      handled: false,
      source,
    };

    if (this.paused) {
      this.deferredQueue.push(event);
      return event;
    }

    this.dispatchEvent(event);
    return event;
  }

  emitDeferred(type: string, data: Record<string, unknown> = {}, source?: string): void {
    this.deferredQueue.push({
      type,
      data,
      timestamp: Date.now(),
      propagate: true,
      handled: false,
      source,
    });
  }

  flushDeferred(): number {
    const queued = [...this.deferredQueue];
    this.deferredQueue = [];
    for (const event of queued) {
      this.dispatchEvent(event);
    }
    return queued.length;
  }

  private dispatchEvent(event: GameEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.historyLimit) this.eventHistory.shift();

    const list = this.listeners.get(event.type);
    if (!list) return;

    const toRemove: string[] = [];
    for (const listener of list) {
      if (!event.propagate) break;
      listener.callback(event);
      if (listener.once) toRemove.push(listener.id);
    }

    // Remove one-shot listeners
    for (const id of toRemove) {
      const idx = list.findIndex((l) => l.id === id);
      if (idx >= 0) list.splice(idx, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  isPaused(): boolean {
    return this.paused;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getListenerCount(type?: string): number {
    if (type) return this.listeners.get(type)?.length ?? 0;
    let total = 0;
    for (const list of this.listeners.values()) total += list.length;
    return total;
  }

  getEventHistory(): GameEvent[] {
    return [...this.eventHistory];
  }
  getQueuedCount(): number {
    return this.deferredQueue.length;
  }

  clear(): void {
    this.listeners.clear();
    this.deferredQueue = [];
    this.eventHistory = [];
  }
}
