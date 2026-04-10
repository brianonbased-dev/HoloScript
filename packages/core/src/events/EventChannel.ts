/**
 * EventChannel.ts
 *
 * Typed event channels: isolated pub/sub channels with filtering,
 * throttling, replay buffer, and cross-channel bridging.
 *
 * @module events
 */

// =============================================================================
// TYPES
// =============================================================================

export type ChannelCallback<T = unknown> = (data: T) => void;

export interface ChannelOptions {
  replayBufferSize: number; // 0 = no replay
  throttleMs: number; // 0 = no throttle
}

interface Subscriber<T> {
  id: number;
  callback: ChannelCallback<T>;
  filter?: (data: T) => boolean;
}

// =============================================================================
// EVENT CHANNEL
// =============================================================================

export class EventChannel<T = unknown> {
  private subscribers: Subscriber<T>[] = [];
  private nextId = 1;
  private buffer: T[] = [];
  private options: ChannelOptions;
  private lastEmitTime = 0;
  private emitCount = 0;

  constructor(options?: Partial<ChannelOptions>) {
    this.options = { replayBufferSize: 0, throttleMs: 0, ...options };
  }

  // ---------------------------------------------------------------------------
  // Subscribe
  // ---------------------------------------------------------------------------

  subscribe(callback: ChannelCallback<T>, filter?: (data: T) => boolean): number {
    const id = this.nextId++;
    this.subscribers.push({ id, callback, filter });

    // Replay buffer for late subscribers
    if (this.options.replayBufferSize > 0) {
      for (const item of this.buffer) {
        if (!filter || filter(item)) callback(item);
      }
    }

    return id;
  }

  unsubscribe(id: number): boolean {
    const idx = this.subscribers.findIndex((s) => s.id === id);
    if (idx !== -1) {
      this.subscribers.splice(idx, 1);
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Emit
  // ---------------------------------------------------------------------------

  emit(data: T): boolean {
    const now = Date.now();
    if (this.options.throttleMs > 0 && now - this.lastEmitTime < this.options.throttleMs) {
      return false; // Throttled
    }

    this.lastEmitTime = now;
    this.emitCount++;

    // Buffer for replay
    if (this.options.replayBufferSize > 0) {
      this.buffer.push(data);
      while (this.buffer.length > this.options.replayBufferSize) this.buffer.shift();
    }

    for (const sub of [...this.subscribers]) {
      if (!sub.filter || sub.filter(data)) {
        sub.callback(data);
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getSubscriberCount(): number {
    return this.subscribers.length;
  }
  getEmitCount(): number {
    return this.emitCount;
  }
  getBuffer(): T[] {
    return [...this.buffer];
  }
  clear(): void {
    this.subscribers = [];
    this.buffer = [];
  }
}

// =============================================================================
// CHANNEL MANAGER (multi-channel registry)
// =============================================================================

export class ChannelManager {
  private channels: Map<string, EventChannel<unknown>> = new Map();

  createChannel<T>(name: string, options?: Partial<ChannelOptions>): EventChannel<T> {
    const ch = new EventChannel<T>(options);
    this.channels.set(name, ch as EventChannel<unknown>);
    return ch;
  }

  getChannel<T>(name: string): EventChannel<T> | undefined {
    return this.channels.get(name) as EventChannel<T> | undefined;
  }

  removeChannel(name: string): void {
    this.channels.delete(name);
  }
  getChannelNames(): string[] {
    return [...this.channels.keys()];
  }

  bridge(
    sourceChannel: string,
    targetChannel: string,
    transform?: (data: unknown) => unknown
  ): number {
    const src = this.channels.get(sourceChannel);
    const tgt = this.channels.get(targetChannel);
    if (!src || !tgt) return -1;
    return src.subscribe((data) => tgt.emit(transform ? transform(data) : data));
  }
}
