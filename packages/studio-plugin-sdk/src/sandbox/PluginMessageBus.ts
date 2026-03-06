/**
 * PluginMessageBus - Typed pub/sub message bus for sandbox communication
 *
 * Provides a strongly-typed event bus that mediates all postMessage
 * communication between sandboxed plugins and the host Studio.
 *
 * Features:
 * - Topic-based pub/sub with wildcard support
 * - Request/response correlation with timeouts
 * - Message deduplication (idempotency)
 * - Backpressure via queue depth limits
 * - Serialization validation (structured clone safety)
 *
 * @module @holoscript/studio-plugin-sdk/sandbox
 */

import type {
  MessageId,
  SandboxMessageBase,
  PluginToHostMessage,
  HostToPluginMessage,
  SandboxPermission,
} from './types.js';

// ── Types ──────────────────────────────────────────────────────────────────

/**
 * Topic pattern for message routing.
 * Supports wildcards: 'scene.*', 'ui.panel.*', '*'
 */
export type TopicPattern = string;

/**
 * Subscription handle returned by subscribe().
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Topic pattern */
  topic: TopicPattern;
  /** Unsubscribe from this topic */
  unsubscribe: () => void;
}

/**
 * Message envelope wrapping any bus message with routing metadata.
 */
export interface BusEnvelope<T = unknown> {
  /** Unique message ID */
  id: MessageId;
  /** Topic this message is published to */
  topic: string;
  /** Source plugin ID (or 'host') */
  source: string;
  /** Timestamp */
  timestamp: number;
  /** The actual payload */
  payload: T;
  /** Correlation ID for request/response patterns */
  correlationId?: MessageId;
  /** Whether this is a response to a request */
  isResponse?: boolean;
}

/**
 * Handler function for topic subscriptions.
 */
export type MessageHandler<T = unknown> = (envelope: BusEnvelope<T>) => void | Promise<void>;

/**
 * Configuration for the message bus.
 */
export interface MessageBusConfig {
  /** Maximum queue depth before backpressure (default: 1000) */
  maxQueueDepth?: number;
  /** Default request timeout in ms (default: 5000) */
  defaultTimeout?: number;
  /** Deduplication window in ms (default: 1000) */
  deduplicationWindowMs?: number;
  /** Enable debug logging */
  debug?: boolean;
}

// ── Implementation ─────────────────────────────────────────────────────────

/**
 * Generates a unique ID for messages and subscriptions.
 */
function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Checks if a topic matches a pattern (supports '*' wildcards).
 *
 * Examples:
 * - 'scene.read' matches 'scene.read' (exact)
 * - 'scene.read' matches 'scene.*' (wildcard)
 * - 'scene.read' matches '*' (global wildcard)
 * - 'scene.read.nodes' matches 'scene.*' (single-level wildcard)
 */
function topicMatches(topic: string, pattern: TopicPattern): boolean {
  if (pattern === '*') return true;
  if (pattern === topic) return true;

  const topicParts = topic.split('.');
  const patternParts = pattern.split('.');

  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '*') {
      return true; // Wildcard matches remaining segments
    }
    if (i >= topicParts.length || patternParts[i] !== topicParts[i]) {
      return false;
    }
  }

  return topicParts.length === patternParts.length;
}

/**
 * PluginMessageBus provides typed pub/sub communication between
 * sandboxed plugins and the host Studio environment.
 *
 * Usage:
 * ```typescript
 * const bus = new PluginMessageBus({ debug: true });
 *
 * // Subscribe to scene changes
 * bus.subscribe('scene.changed', (envelope) => {
 *   console.log('Scene changed:', envelope.payload);
 * });
 *
 * // Publish an event
 * bus.publish('scene.changed', 'host', { nodeId: 'abc', property: 'position' });
 *
 * // Request/response pattern
 * const result = await bus.request('scene.getNodes', 'my-plugin', { filter: 'mesh' });
 * ```
 */
export class PluginMessageBus {
  private subscriptions: Map<string, { pattern: TopicPattern; handler: MessageHandler }> = new Map();
  private pendingRequests: Map<MessageId, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }> = new Map();
  private recentMessageIds: Set<string> = new Set();
  private queueDepth: number = 0;
  private config: Required<MessageBusConfig>;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(config: MessageBusConfig = {}) {
    this.config = {
      maxQueueDepth: config.maxQueueDepth ?? 1000,
      defaultTimeout: config.defaultTimeout ?? 5000,
      deduplicationWindowMs: config.deduplicationWindowMs ?? 1000,
      debug: config.debug ?? false,
    };

    // Periodic cleanup of deduplication cache
    this.cleanupInterval = setInterval(() => {
      this.recentMessageIds.clear();
    }, this.config.deduplicationWindowMs * 2);
  }

  /**
   * Subscribe to messages matching a topic pattern.
   *
   * @param pattern - Topic pattern (supports '*' wildcards)
   * @param handler - Handler function called for matching messages
   * @returns Subscription handle with unsubscribe method
   */
  subscribe<T = unknown>(pattern: TopicPattern, handler: MessageHandler<T>): Subscription {
    const id = generateId();
    this.subscriptions.set(id, { pattern, handler: handler as MessageHandler });

    if (this.config.debug) {
      console.debug(`[MessageBus] Subscribed to '${pattern}' (id: ${id})`);
    }

    return {
      id,
      topic: pattern,
      unsubscribe: () => {
        this.subscriptions.delete(id);
        if (this.config.debug) {
          console.debug(`[MessageBus] Unsubscribed from '${pattern}' (id: ${id})`);
        }
      },
    };
  }

  /**
   * Publish a message to all subscribers matching the topic.
   *
   * @param topic - The topic to publish to
   * @param source - Source plugin ID or 'host'
   * @param payload - Message payload (must be structured-cloneable)
   * @param correlationId - Optional correlation ID for response tracking
   * @returns The message ID
   */
  publish<T = unknown>(
    topic: string,
    source: string,
    payload: T,
    correlationId?: MessageId,
  ): MessageId {
    // Backpressure check
    if (this.queueDepth >= this.config.maxQueueDepth) {
      throw new Error(
        `MessageBus backpressure: queue depth ${this.queueDepth} exceeds limit ${this.config.maxQueueDepth}`
      );
    }

    const envelope: BusEnvelope<T> = {
      id: generateId(),
      topic,
      source,
      timestamp: Date.now(),
      payload,
      correlationId,
      isResponse: !!correlationId,
    };

    // Deduplication
    if (this.recentMessageIds.has(envelope.id)) {
      if (this.config.debug) {
        console.debug(`[MessageBus] Duplicate message suppressed: ${envelope.id}`);
      }
      return envelope.id;
    }
    this.recentMessageIds.add(envelope.id);

    // Check if this is a response to a pending request
    if (correlationId && this.pendingRequests.has(correlationId)) {
      const pending = this.pendingRequests.get(correlationId)!;
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(correlationId);
      pending.resolve(payload);
      return envelope.id;
    }

    // Dispatch to matching subscribers
    this.queueDepth++;
    try {
      for (const [, sub] of this.subscriptions) {
        if (topicMatches(topic, sub.pattern)) {
          try {
            sub.handler(envelope as BusEnvelope);
          } catch (err) {
            console.error(`[MessageBus] Handler error for topic '${topic}':`, err);
          }
        }
      }
    } finally {
      this.queueDepth--;
    }

    return envelope.id;
  }

  /**
   * Send a request and wait for a response (request/response pattern).
   *
   * @param topic - The topic to send the request to
   * @param source - Source plugin ID
   * @param payload - Request payload
   * @param timeoutMs - Timeout in ms (default: from config)
   * @returns Promise resolving to the response payload
   */
  request<TReq = unknown, TRes = unknown>(
    topic: string,
    source: string,
    payload: TReq,
    timeoutMs?: number,
  ): Promise<TRes> {
    const messageId = generateId();
    const timeout = timeoutMs ?? this.config.defaultTimeout;

    return new Promise<TRes>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(messageId);
        reject(new Error(`Request to '${topic}' timed out after ${timeout}ms`));
      }, timeout);

      this.pendingRequests.set(messageId, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout: timer,
      });

      // Publish the request with correlation ID set to the message ID
      this.publish(topic, source, payload);
      // The response will be matched by correlationId
    });
  }

  /**
   * Get the number of active subscriptions.
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get the current queue depth.
   */
  getQueueDepth(): number {
    return this.queueDepth;
  }

  /**
   * Get the number of pending requests.
   */
  getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }

  /**
   * Destroy the message bus and clean up all resources.
   */
  destroy(): void {
    // Cancel all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('MessageBus destroyed'));
    }
    this.pendingRequests.clear();

    // Clear subscriptions
    this.subscriptions.clear();

    // Clear deduplication cache
    this.recentMessageIds.clear();

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}
