/**
 * @holoscript/core - W3C Trace Context Propagator
 *
 * Implements W3C Trace Context (traceparent/tracestate) injection and extraction
 * for distributed tracing across agent delegations. Enables end-to-end trace
 * correlation when agents delegate tasks to remote peers via A2A JSON-RPC.
 *
 * Spec: https://www.w3.org/TR/trace-context/
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import type { TraceContext } from './TelemetryTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface PropagationHeaders {
  traceparent: string;
  tracestate?: string;
}

export interface TraceStateEntry {
  key: string;
  value: string;
}

// =============================================================================
// W3C TRACE CONTEXT PROPAGATOR
// =============================================================================

export class TraceContextPropagator {
  /**
   * Inject trace context into HTTP headers for outgoing requests.
   *
   * Produces W3C `traceparent` and optionally `tracestate` headers.
   *
   * traceparent format: {version}-{traceId}-{spanId}-{traceFlags}
   *   version: 2-char hex (always "00")
   *   traceId: 32-char hex
   *   spanId: 16-char hex
   *   traceFlags: 2-char hex (01 = sampled)
   */
  inject(context: TraceContext): PropagationHeaders {
    const version = '00';
    const traceId = this.padHex(context.traceId, 32);
    const spanId = this.padHex(context.spanId, 16);
    const flags = (context.traceFlags & 0xff).toString(16).padStart(2, '0');

    const headers: PropagationHeaders = {
      traceparent: `${version}-${traceId}-${spanId}-${flags}`,
    };

    // Build tracestate from baggage
    const baggageEntries = Object.entries(context.baggage || {});
    if (baggageEntries.length > 0) {
      headers.tracestate = baggageEntries
        .map(([key, value]) => `${this.sanitizeKey(key)}=${this.sanitizeValue(value)}`)
        .join(',');
    }

    return headers;
  }

  /**
   * Extract trace context from incoming HTTP headers.
   *
   * Parses W3C `traceparent` and optionally `tracestate` headers.
   * Returns null if headers are missing or invalid.
   */
  extract(headers: Record<string, string | undefined>): TraceContext | null {
    const traceparent = headers['traceparent'] || headers['Traceparent'];
    if (!traceparent) return null;

    const parsed = this.parseTraceparent(traceparent);
    if (!parsed) return null;

    // Parse tracestate if present
    const tracestate = headers['tracestate'] || headers['Tracestate'];
    const baggage: Record<string, string> = {};

    if (tracestate) {
      const entries = this.parseTracestate(tracestate);
      for (const entry of entries) {
        baggage[entry.key] = entry.value;
      }
    }

    return {
      traceId: parsed.traceId,
      spanId: parsed.spanId,
      traceFlags: parsed.traceFlags,
      baggage,
    };
  }

  /**
   * Create a child context from a parent, generating a new spanId.
   */
  createChildContext(parent: TraceContext): TraceContext {
    return {
      traceId: parent.traceId,
      spanId: this.generateSpanId(),
      parentSpanId: parent.spanId,
      traceFlags: parent.traceFlags,
      baggage: { ...parent.baggage },
    };
  }

  /**
   * Inject trace context into A2A JSON-RPC request headers.
   * Returns a new headers object with trace headers added.
   */
  injectIntoHeaders(
    existingHeaders: Record<string, string>,
    context: TraceContext
  ): Record<string, string> {
    const traceHeaders = this.inject(context);
    return {
      ...existingHeaders,
      traceparent: traceHeaders.traceparent,
      ...(traceHeaders.tracestate ? { tracestate: traceHeaders.tracestate } : {}),
    };
  }

  /**
   * Parse a traceparent header string.
   *
   * Format: {version}-{traceId}-{spanId}-{traceFlags}
   */
  parseTraceparent(
    traceparent: string
  ): { version: string; traceId: string; spanId: string; traceFlags: number } | null {
    const parts = traceparent.trim().split('-');
    if (parts.length !== 4) return null;

    const [version, traceId, spanId, flagsHex] = parts;

    // Validate version
    if (!/^[0-9a-f]{2}$/.test(version)) return null;

    // Validate trace ID (32 hex chars, not all zeros)
    if (!/^[0-9a-f]{32}$/.test(traceId)) return null;
    if (/^0+$/.test(traceId)) return null;

    // Validate span ID (16 hex chars, not all zeros)
    if (!/^[0-9a-f]{16}$/.test(spanId)) return null;
    if (/^0+$/.test(spanId)) return null;

    // Validate flags (2 hex chars)
    if (!/^[0-9a-f]{2}$/.test(flagsHex)) return null;

    const traceFlags = parseInt(flagsHex, 16);

    return { version, traceId, spanId, traceFlags };
  }

  /**
   * Parse a tracestate header string.
   *
   * Format: key1=value1,key2=value2,...
   */
  parseTracestate(tracestate: string): TraceStateEntry[] {
    if (!tracestate.trim()) return [];

    return tracestate
      .split(',')
      .map((pair) => pair.trim())
      .filter((pair) => pair.length > 0)
      .map((pair) => {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) return null;
        return {
          key: pair.substring(0, eqIdx).trim(),
          value: pair.substring(eqIdx + 1).trim(),
        };
      })
      .filter((entry): entry is TraceStateEntry => entry !== null && entry.key.length > 0);
  }

  /**
   * Check if a trace context indicates the trace is sampled.
   */
  isSampled(context: TraceContext): boolean {
    return (context.traceFlags & 0x01) === 1;
  }

  /**
   * Generate a new random span ID (16 hex chars).
   */
  private generateSpanId(): string {
    return Math.random().toString(16).substring(2, 18).padStart(16, '0');
  }

  /**
   * Pad a hex string to the required length.
   */
  private padHex(hex: string, length: number): string {
    return hex.padStart(length, '0').substring(0, length);
  }

  /**
   * Sanitize a tracestate key (alphanumeric, underscores, hyphens, dots, slashes).
   */
  private sanitizeKey(key: string): string {
    return key.replace(/[^a-zA-Z0-9_\-./@]/g, '_');
  }

  /**
   * Sanitize a tracestate value (no commas, equals, or control chars).
   */
  private sanitizeValue(value: string): string {
    return value.replace(/[,= \t\n\r]/g, '_');
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let defaultPropagator: TraceContextPropagator | null = null;

/**
 * Get or create the default TraceContextPropagator instance.
 */
export function getTraceContextPropagator(): TraceContextPropagator {
  if (!defaultPropagator) {
    defaultPropagator = new TraceContextPropagator();
  }
  return defaultPropagator;
}

/**
 * Reset the default propagator (for testing).
 */
export function resetTraceContextPropagator(): void {
  defaultPropagator = null;
}
