/**
 * SwarmEventBus - Central event coordination for swarm communication
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Decoupled pub/sub messaging between swarm components
 */

/**
 * Event priority levels
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Swarm event interface
 */
export interface ISwarmEvent {
  id: string;
  type: string;
  source: string;
  target?: string | string[];
  payload: unknown;
  timestamp: number;
  priority: EventPriority;
  ttl?: number; // Time-to-live in milliseconds
  metadata?: Record<string, unknown>;
}

/**
 * Event subscription
 */
export interface IEventSubscription {
  id: string;
  pattern: string | RegExp;
  handler: EventHandler;
  priority: EventPriority;
  once: boolean;
}

/**
 * Event handler function type
 */
export type EventHandler = (event: ISwarmEvent) => void | Promise<void>;

/**
 * Event bus configuration
 */
export interface IEventBusConfig {
  /** Maximum events in queue */
  maxQueueSize: number;
  /** Default TTL for events */
  defaultTTL: number;
  /** Enable async event processing */
  asyncProcessing: boolean;
  /** Max concurrent async handlers */
  maxConcurrent: number;
  /** Dead letter queue enabled */
  enableDeadLetter: boolean;
}

/**
 * Event bus statistics
 */
export interface IEventBusStats {
  eventsPublished: number;
  eventsDelivered: number;
  eventsDropped: number;
  subscriptions: number;
  pendingEvents: number;
  deadLetterCount: number;
}

/**
 * SwarmEventBus - Central pub/sub event bus for swarm communication
 */
export class SwarmEventBus {
  private subscriptions: Map<string, IEventSubscription> = new Map();
  private eventQueue: ISwarmEvent[] = [];
  private deadLetterQueue: ISwarmEvent[] = [];
  private processing = false;
  private config: IEventBusConfig;
  private stats: IEventBusStats = {
    eventsPublished: 0,
    eventsDelivered: 0,
    eventsDropped: 0,
    subscriptions: 0,
    pendingEvents: 0,
    deadLetterCount: 0,
  };
  private nextId = 1;

  constructor(config?: Partial<IEventBusConfig>) {
    this.config = {
      maxQueueSize: 10000,
      defaultTTL: 30000,
      asyncProcessing: true,
      maxConcurrent: 10,
      enableDeadLetter: true,
      ...config,
    };
  }

  /**
   * Publish an event to the bus
   */
  publish(
    type: string,
    source: string,
    payload: unknown,
    options: {
      target?: string | string[];
      priority?: EventPriority;
      ttl?: number;
      metadata?: Record<string, unknown>;
    } = {}
  ): string {
    const id = `evt-${this.nextId++}-${Date.now()}`;

    const event: ISwarmEvent = {
      id,
      type,
      source,
      target: options.target,
      payload,
      timestamp: Date.now(),
      priority: options.priority ?? 'normal',
      ttl: options.ttl ?? this.config.defaultTTL,
      metadata: options.metadata,
    };

    this.stats.eventsPublished++;

    // Check queue size
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      this.stats.eventsDropped++;
      if (this.config.enableDeadLetter) {
        this.deadLetterQueue.push(event);
        this.stats.deadLetterCount++;
      }
      return id;
    }

    // Insert by priority
    this.insertByPriority(event);
    this.stats.pendingEvents = this.eventQueue.length;

    // Process if not already processing
    if (this.config.asyncProcessing && !this.processing) {
      this.processQueue();
    }

    return id;
  }

  /**
   * Insert event maintaining priority order
   */
  private insertByPriority(event: ISwarmEvent): void {
    const priorityOrder = ['low', 'normal', 'high', 'critical'];
    const eventPriority = priorityOrder.indexOf(event.priority);

    // Find insertion point
    let insertIndex = this.eventQueue.length;
    for (let i = 0; i < this.eventQueue.length; i++) {
      const queuedPriority = priorityOrder.indexOf(this.eventQueue[i].priority);
      if (eventPriority > queuedPriority) {
        insertIndex = i;
        break;
      }
    }

    this.eventQueue.splice(insertIndex, 0, event);
  }

  /**
   * Subscribe to events matching a pattern
   */
  subscribe(
    pattern: string | RegExp,
    handler: EventHandler,
    options: {
      priority?: EventPriority;
      once?: boolean;
    } = {}
  ): string {
    const id = `sub-${this.nextId++}`;

    const subscription: IEventSubscription = {
      id,
      pattern,
      handler,
      priority: options.priority ?? 'normal',
      once: options.once ?? false,
    };

    this.subscriptions.set(id, subscription);
    this.stats.subscriptions = this.subscriptions.size;

    return id;
  }

  /**
   * Subscribe to an event type once
   */
  once(pattern: string | RegExp, handler: EventHandler): string {
    return this.subscribe(pattern, handler, { once: true });
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    const result = this.subscriptions.delete(subscriptionId);
    this.stats.subscriptions = this.subscriptions.size;
    return result;
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
    this.stats.subscriptions = 0;
  }

  /**
   * Process the event queue (public for testing)
   */
  async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.eventQueue.length > 0) {
        const event = this.eventQueue.shift()!;
        this.stats.pendingEvents = this.eventQueue.length;

        // Check TTL
        if (event.ttl && Date.now() - event.timestamp > event.ttl) {
          this.stats.eventsDropped++;
          continue;
        }

        await this.deliverEvent(event);
      }
    } finally {
      this.processing = false;
    }
  }

  /**
   * Deliver event to matching subscribers
   */
  private async deliverEvent(event: ISwarmEvent): Promise<void> {
    const toRemove: string[] = [];
    const matchingHandlers: Array<{ sub: IEventSubscription; handler: EventHandler }> = [];

    for (const [id, sub] of this.subscriptions) {
      if (this.matchesPattern(event.type, sub.pattern)) {
        // Check if targeted and matches
        if (event.target) {
          const _targets = Array.isArray(event.target) ? event.target : [event.target];
          // Target filtering could be applied here if needed
        }

        matchingHandlers.push({ sub, handler: sub.handler });

        if (sub.once) {
          toRemove.push(id);
        }
      }
    }

    // Sort by priority
    const priorityOrder = ['low', 'normal', 'high', 'critical'];
    matchingHandlers.sort(
      (a, b) => priorityOrder.indexOf(b.sub.priority) - priorityOrder.indexOf(a.sub.priority)
    );

    // Execute handlers
    let delivered = false;
    for (const { handler } of matchingHandlers) {
      try {
        await handler(event);
        delivered = true;
      } catch (error) {
        // Handler error - continue to next
        console.error('Event handler error:', error);
      }
    }

    if (delivered) {
      this.stats.eventsDelivered++;
    } else if (this.config.enableDeadLetter) {
      this.deadLetterQueue.push(event);
      this.stats.deadLetterCount++;
    }

    // Remove once subscriptions
    for (const id of toRemove) {
      this.subscriptions.delete(id);
    }
    this.stats.subscriptions = this.subscriptions.size;
  }

  /**
   * Check if event type matches pattern
   */
  private matchesPattern(type: string, pattern: string | RegExp): boolean {
    if (pattern instanceof RegExp) {
      return pattern.test(type);
    }

    // Wildcard support: "swarm.*" matches "swarm.joined", "swarm.left", etc.
    if (pattern.includes('*')) {
      const regexPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      return new RegExp(`^${regexPattern}$`).test(type);
    }

    return type === pattern;
  }

  /**
   * Emit synchronously (bypass queue)
   */
  emit(
    type: string,
    source: string,
    payload: unknown,
    options: {
      target?: string | string[];
      priority?: EventPriority;
      metadata?: Record<string, unknown>;
    } = {}
  ): void {
    const event: ISwarmEvent = {
      id: `evt-${this.nextId++}-${Date.now()}`,
      type,
      source,
      target: options.target,
      payload,
      timestamp: Date.now(),
      priority: options.priority ?? 'normal',
      metadata: options.metadata,
    };

    this.stats.eventsPublished++;

    for (const [id, sub] of this.subscriptions) {
      if (this.matchesPattern(type, sub.pattern)) {
        try {
          sub.handler(event);
          this.stats.eventsDelivered++;

          if (sub.once) {
            this.subscriptions.delete(id);
          }
        } catch (_error) {
          // Handler error - continue
        }
      }
    }

    this.stats.subscriptions = this.subscriptions.size;
  }

  /**
   * Get pending events in queue
   */
  getPendingEvents(): ISwarmEvent[] {
    return [...this.eventQueue];
  }

  /**
   * Get dead letter queue
   */
  getDeadLetterQueue(): ISwarmEvent[] {
    return [...this.deadLetterQueue];
  }

  /**
   * Clear dead letter queue
   */
  clearDeadLetterQueue(): ISwarmEvent[] {
    const events = [...this.deadLetterQueue];
    this.deadLetterQueue = [];
    this.stats.deadLetterCount = 0;
    return events;
  }

  /**
   * Replay dead letter events
   */
  replayDeadLetters(): number {
    const events = this.clearDeadLetterQueue();
    for (const event of events) {
      // Reset timestamp for TTL
      event.timestamp = Date.now();
      this.insertByPriority(event);
    }
    this.stats.pendingEvents = this.eventQueue.length;

    if (this.config.asyncProcessing && !this.processing) {
      this.processQueue();
    }

    return events.length;
  }

  /**
   * Get event bus statistics
   */
  getStats(): IEventBusStats {
    return { ...this.stats };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      eventsPublished: 0,
      eventsDelivered: 0,
      eventsDropped: 0,
      subscriptions: this.subscriptions.size,
      pendingEvents: this.eventQueue.length,
      deadLetterCount: this.deadLetterQueue.length,
    };
  }

  /**
   * Get configuration
   */
  getConfig(): IEventBusConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<IEventBusConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
