/**
 * Shared telemetry type definitions.
 * Extracted to avoid circular dependencies between SpanFactory and TelemetryProvider.
 *
 * @module telemetry/types
 */

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface Span {
  name: string;
  startTime: number;
  endTime?: number;
  attributes: Record<string, string | number | boolean>;
  status: 'ok' | 'error' | 'unset';
  events: SpanEvent[];
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  end(status?: 'ok' | 'error'): void;
  setAttribute(key: string, value: string | number | boolean): void;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
}

export interface TelemetryConfig {
  serviceName: string;
  endpoint: string;
  sampleRate: number;
  enabledInstrumentations: ('parse' | 'compile' | 'runtime' | 'network')[];
  customAttributes?: Record<string, string>;
  enabled?: boolean;
}

export interface Metric {
  name: string;
  type: 'counter' | 'histogram' | 'gauge';
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}
