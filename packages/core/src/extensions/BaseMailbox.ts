/**
 * Base Mailbox Implementation
 *
 * Priority-aware message queue for agents.
 */

import type { IAgentMailbox } from './AgentExtensionTypes';

interface QueuedMessage<T> {
  message: T;
  priority: number;
  timestamp: number;
}

export class BaseMailbox<T = unknown> implements IAgentMailbox<T> {
  private queue: QueuedMessage<T>[] = [];
  private readonly maxSize: number;

  constructor(options?: { maxSize?: number }) {
    this.maxSize = options?.maxSize ?? 1000;
  }

  private priorityToNumber(priority: 'low' | 'normal' | 'high'): number {
    switch (priority) {
      case 'high':
        return 3;
      case 'normal':
        return 2;
      case 'low':
        return 1;
      default:
        return 2;
    }
  }

  enqueue(message: T, priority: 'low' | 'normal' | 'high' = 'normal'): void {
    if (this.queue.length >= this.maxSize) {
      // Drop oldest low-priority message
      const lowPriorityIdx = this.queue.findIndex((m) => m.priority === 1);
      if (lowPriorityIdx >= 0) {
        this.queue.splice(lowPriorityIdx, 1);
      } else {
        // Drop oldest message
        this.queue.shift();
      }
    }

    const queued: QueuedMessage<T> = {
      message,
      priority: this.priorityToNumber(priority),
      timestamp: Date.now(),
    };

    // Insert in priority order (higher priority first)
    let inserted = false;
    for (let i = 0; i < this.queue.length; i++) {
      if (this.queue[i].priority < queued.priority) {
        this.queue.splice(i, 0, queued);
        inserted = true;
        break;
      }
    }

    if (!inserted) {
      this.queue.push(queued);
    }
  }

  dequeue(): T | undefined {
    const item = this.queue.shift();
    return item?.message;
  }

  peek(): T | undefined {
    return this.queue[0]?.message;
  }

  size(): number {
    return this.queue.length;
  }

  isEmpty(): boolean {
    return this.queue.length === 0;
  }

  /**
   * Get all messages (for debugging)
   */
  getAll(): T[] {
    return this.queue.map((q) => q.message);
  }

  /**
   * Clear all messages
   */
  clear(): void {
    this.queue = [];
  }

  /**
   * Get queue stats
   */
  stats(): { size: number; highPriority: number; normalPriority: number; lowPriority: number } {
    return {
      size: this.queue.length,
      highPriority: this.queue.filter((m) => m.priority === 3).length,
      normalPriority: this.queue.filter((m) => m.priority === 2).length,
      lowPriority: this.queue.filter((m) => m.priority === 1).length,
    };
  }
}
