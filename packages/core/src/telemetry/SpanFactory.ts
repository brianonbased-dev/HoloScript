/**
 * SpanFactory — Helper for creating nested spans with trace propagation.
 *
 * Provides convenient span creation including parent-child relationships
 * (same traceId, parentSpanId linking) and auto-ending wrappers for
 * both synchronous and asynchronous operations.
 *
 * @module telemetry/SpanFactory
 */

import type { Span, SpanEvent } from './types';

function generateId(): string {
  // Use crypto.randomUUID where available, fall back to timestamp-based ID
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return (
    Date.now().toString(16) +
    Math.random().toString(16).slice(2, 10) +
    Math.random().toString(16).slice(2, 10)
  );
}

function generateTraceId(): string {
  return generateId().slice(0, 32).padEnd(32, '0');
}

function generateSpanId(): string {
  return generateId().slice(0, 16).padEnd(16, '0');
}

/**
 * Creates a standalone Span object (not yet ended).
 */
function createSpanObject(
  name: string,
  traceId: string,
  parentSpanId?: string,
  attributes?: Record<string, string | number | boolean>
): Span {
  const spanId = generateSpanId();
  const events: SpanEvent[] = [];
  const attrs: Record<string, string | number | boolean> = { ...attributes };

  const span: Span = {
    name,
    startTime: Date.now(),
    endTime: undefined,
    attributes: attrs,
    status: 'unset',
    events,
    traceId,
    spanId,
    parentSpanId,

    end(status?: 'ok' | 'error') {
      span.endTime = Date.now();
      if (status) {
        span.status = status;
      } else if (span.status === 'unset') {
        span.status = 'ok';
      }
    },

    setAttribute(key: string, value: string | number | boolean) {
      span.attributes[key] = value;
    },

    addEvent(eventName: string, eventAttributes?: Record<string, string | number | boolean>) {
      events.push({
        name: eventName,
        timestamp: Date.now(),
        attributes: eventAttributes,
      });
    },
  };

  return span;
}

export class SpanFactory {
  /**
   * Create a new span, optionally as a child of an existing span.
   * Child spans inherit the parent's traceId and record parentSpanId.
   */
  createSpan(
    name: string,
    parentSpan?: Span,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    const traceId = parentSpan ? parentSpan.traceId : generateTraceId();
    const parentSpanId = parentSpan ? parentSpan.spanId : undefined;
    return createSpanObject(name, traceId, parentSpanId, attributes);
  }

  /**
   * Execute a function within a span context. The span is automatically
   * ended when the function returns (or the promise resolves/rejects).
   *
   * For synchronous functions, returns the result directly.
   * For async functions, returns a Promise.
   */
  withSpan<T>(name: string, fn: (span: Span) => T | Promise<T>, parentSpan?: Span): T | Promise<T> {
    const span = this.createSpan(name, parentSpan);
    try {
      const result = fn(span);

      // Handle async case
      if (result instanceof Promise) {
        return result
          .then((value) => {
            span.end('ok');
            return value;
          })
          .catch((err) => {
            span.setAttribute('error.message', err instanceof Error ? err.message : String(err));
            span.end('error');
            throw err;
          });
      }

      // Synchronous case
      span.end('ok');
      return result;
    } catch (err) {
      span.setAttribute(
        'error.message',
        err instanceof Error ? (err as Error).message : String(err)
      );
      span.end('error');
      throw err;
    }
  }
}

export { createSpanObject, generateTraceId, generateSpanId };
