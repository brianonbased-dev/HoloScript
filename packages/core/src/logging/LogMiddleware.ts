/**
 * LogMiddleware — Sampling, throttling, and structured context enrichment
 *
 * Provides middleware functions that can be chained to process
 * log entries before they are emitted. Includes sampling, throttling,
 * context enrichment, and error serialization.
 *
 * @version 1.0.0
 */

import type { LogLevel, LogEntry } from './HoloLogger';

// =============================================================================
// TYPES
// =============================================================================

export type LogMiddlewareFn = (entry: LogEntry) => LogEntry | null;

export interface ThrottleState {
  lastEmitted: number;
  suppressed: number;
}

// =============================================================================
// MIDDLEWARE FUNCTIONS
// =============================================================================

/**
 * Sample log entries at a given rate (0.0 - 1.0)
 */
export function createSampler(rate: number): LogMiddlewareFn {
  return (entry: LogEntry) => {
    if (Math.random() < rate) return entry;
    return null; // suppress
  };
}

/**
 * Throttle log entries by key — at most one per interval
 */
export function createThrottler(intervalMs: number): {
  middleware: LogMiddlewareFn;
  getState: () => Map<string, ThrottleState>;
} {
  const state = new Map<string, ThrottleState>();

  const middleware: LogMiddlewareFn = (entry: LogEntry) => {
    const key = `${entry.logger}:${entry.level}:${entry.message}`;
    const now = entry.timestamp;
    const prev = state.get(key);

    if (prev && now - prev.lastEmitted < intervalMs) {
      prev.suppressed++;
      return null;
    }

    state.set(key, { lastEmitted: now, suppressed: 0 });
    return entry;
  };

  return { middleware, getState: () => state };
}

/**
 * Enrich log entries with static context fields
 */
export function createContextEnricher(staticContext: Record<string, unknown>): LogMiddlewareFn {
  return (entry: LogEntry) => {
    return {
      ...entry,
      context: { ...staticContext, ...entry.context },
    };
  };
}

/**
 * Filter entries by minimum log level
 */
export function createLevelFilter(minLevel: LogLevel): LogMiddlewareFn {
  const priorities: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4,
  };

  return (entry: LogEntry) => {
    if (priorities[entry.level] >= priorities[minLevel]) return entry;
    return null;
  };
}

/**
 * Serialize Error objects in context
 */
export function createErrorSerializer(): LogMiddlewareFn {
  return (entry: LogEntry) => {
    if (!entry.context) return entry;

    const serialized = { ...entry.context };
    for (const [key, value] of Object.entries(serialized)) {
      if (value instanceof Error) {
        serialized[key] = {
          message: value.message,
          stack: value.stack,
          name: value.name,
        };
      }
    }

    return { ...entry, context: serialized };
  };
}

// =============================================================================
// MIDDLEWARE PIPELINE
// =============================================================================

export class LogMiddlewarePipeline {
  private middleware: LogMiddlewareFn[] = [];

  /**
   * Add a middleware function
   */
  use(fn: LogMiddlewareFn): void {
    this.middleware.push(fn);
  }

  /**
   * Process an entry through all middleware
   */
  process(entry: LogEntry): LogEntry | null {
    let current: LogEntry | null = entry;

    for (const fn of this.middleware) {
      if (!current) return null;
      current = fn(current);
    }

    return current;
  }

  /**
   * Get middleware count
   */
  getCount(): number {
    return this.middleware.length;
  }

  /**
   * Clear all middleware
   */
  clear(): void {
    this.middleware = [];
  }
}
