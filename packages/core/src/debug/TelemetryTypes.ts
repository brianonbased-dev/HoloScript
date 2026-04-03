/**
 * Telemetry Types
 * Sprint 4 Priority 8 - Agent Debugging & Telemetry
 *
 * Type definitions for telemetry and debugging infrastructure.
 */

// =============================================================================
// TELEMETRY EVENTS
// =============================================================================

/**
 * Types of telemetry events that can be captured
 */
export type TelemetryEventType =
  | 'message_sent'
  | 'message_received'
  | 'task_started'
  | 'task_completed'
  | 'task_failed'
  | 'negotiation_start'
  | 'negotiation_vote'
  | 'negotiation_complete'
  | 'consensus_propose'
  | 'consensus_vote'
  | 'consensus_reached'
  | 'choreography_start'
  | 'choreography_step'
  | 'choreography_complete'
  | 'agent_registered'
  | 'agent_deregistered'
  | 'breakpoint_hit'
  | 'error'
  | 'plugin_loaded'
  | 'plugin_destroyed'
  | 'plugin_tool_registered'
  | 'plugin_event'
  | 'budget_exceeded'
  | 'budget_warning'
  | 'revenue_accrued'
  | 'webhook_received'
  | 'subscription_started'
  | 'subscription_expired'
  | 'usage_tracked'
  | string; // Fallback for custom events

/**
 * Severity levels for telemetry events
 */
export type TelemetrySeverity = 'debug' | 'info' | 'warn' | 'warning' | 'error' | 'critical';

/**
 * A telemetry event
 */
export interface TelemetryEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: TelemetryEventType;
  /** Event severity */
  severity: TelemetrySeverity;
  /** Associated agent ID */
  agentId: string;
  /** Event data */
  data?: Record<string, unknown>;
  /** Latency in milliseconds (for duration events) */
  latency?: number;
  /** Related event IDs (for correlation) */
  relatedIds?: string[];
  /** Event timestamp */
  timestamp: number;
}

/**
 * Agent telemetry record (aggregates events)
 */
export interface AgentTelemetry {
  /** Agent ID */
  agentId: string;
  /** Timestamp of record */
  timestamp: number;
  /** Current event */
  event: TelemetryEvent;
  /** Associated trace span */
  span?: TraceSpan;
}

// =============================================================================
// TRACING
// =============================================================================

/**
 * Trace span status
 */
export type SpanStatus = 'unset' | 'ok' | 'error';

/**
 * Trace context for distributed tracing
 */
export interface TraceContext {
  /** Trace ID (globally unique) */
  traceId: string;
  /** Span ID (unique within trace) */
  spanId: string;
  /** Parent span ID */
  parentSpanId?: string;
  /** Trace flags (e.g., sampled) */
  traceFlags: number;
  /** Baggage items */
  baggage: Record<string, string>;
}

/**
 * A trace span representing a unit of work
 */
export interface TraceSpan {
  /** Unique span ID */
  id: string;
  /** Span name/operation */
  name: string;
  /** Trace context */
  context: TraceContext;
  /** Start time */
  startTime: number;
  /** End time (0 if still active) */
  endTime: number;
  /** Span duration in milliseconds */
  duration: number;
  /** Span status */
  status: SpanStatus;
  /** Status message */
  statusMessage?: string;
  /** Span attributes/tags */
  attributes: Record<string, unknown>;
  /** Span events (logs within span) */
  events: SpanEvent[];
  /** Links to other spans */
  links: SpanLink[];
  /** Kind of span */
  kind: SpanKind;
}

/**
 * Event within a span
 */
export interface SpanEvent {
  /** Event name */
  name: string;
  /** Event timestamp */
  timestamp: number;
  /** Event attributes */
  attributes: Record<string, unknown>;
}

/**
 * Link between spans
 */
export interface SpanLink {
  /** Target trace context */
  context: TraceContext;
  /** Link attributes */
  attributes: Record<string, unknown>;
}

/**
 * Kind of span (similar to OpenTelemetry)
 */
export type SpanKind = 'internal' | 'server' | 'client' | 'producer' | 'consumer';

// =============================================================================
// DEBUGGING
// =============================================================================

/**
 * Result of inspecting an agent
 */
export interface AgentInspection {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  name: string;
  /** Agent status */
  status: 'active' | 'idle' | 'paused' | 'stopped';
  /** Current state snapshot */
  state: Record<string, unknown>;
  /** Active capabilities */
  capabilities: string[];
  /** Current task (if any) */
  currentTask?: InspectedTask;
  /** Recent events */
  recentEvents: TelemetryEvent[];
  /** Active breakpoints */
  breakpoints: BreakpointInfo[];
  /** Inspection timestamp */
  inspectedAt: number;
}

/**
 * Inspected task info
 */
export interface InspectedTask {
  /** Task ID */
  id: string;
  /** Task type */
  type: string;
  /** Task status */
  status: string;
  /** Progress (0-100) */
  progress: number;
  /** Start time */
  startedAt: number;
  /** Elapsed time in milliseconds */
  elapsed: number;
}

/**
 * Breakpoint information
 */
export interface BreakpointInfo {
  /** Breakpoint ID */
  id: string;
  /** Associated agent ID */
  agentId: string;
  /** Breakpoint condition expression */
  condition: string;
  /** Whether breakpoint is enabled */
  enabled: boolean;
  /** Hit count */
  hitCount: number;
  /** Created timestamp */
  createdAt: number;
}

/**
 * Breakpoint condition context
 */
export interface BreakpointContext {
  /** Agent ID */
  agentId: string;
  /** Current event (if triggered by event) */
  event?: TelemetryEvent;
  /** Current state */
  state: Record<string, unknown>;
  /** Variables in scope */
  variables: Record<string, unknown>;
}

// =============================================================================
// REPLAY
// =============================================================================

/**
 * Session recording for replay
 */
export interface SessionRecording {
  /** Session ID */
  id: string;
  /** Session name */
  name: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Events in this session */
  events: TelemetryEvent[];
  /** Spans in this session */
  spans: TraceSpan[];
  /** Agent IDs involved */
  agentIds: string[];
  /** Session metadata */
  metadata: Record<string, unknown>;
}

/**
 * Replay state
 */
export interface ReplayState {
  /** Session being replayed */
  sessionId: string;
  /** Current position (0-100) */
  position: number;
  /** Current timestamp */
  currentTime: number;
  /** Playback speed multiplier */
  speed: number;
  /** Whether paused */
  paused: boolean;
  /** Current event index */
  eventIndex: number;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Telemetry collector configuration
 */
export interface TelemetryConfig {
  /** Whether telemetry is enabled */
  enabled: boolean;
  /** Sampling rate (0-1) */
  samplingRate: number;
  /** Maximum events to buffer */
  maxBufferSize: number;
  /** Buffer flush interval in milliseconds */
  flushInterval: number;
  /** Whether to export to OpenTelemetry */
  otelEnabled: boolean;
  /** OpenTelemetry endpoint */
  otelEndpoint?: string;
  /** Event types to capture */
  captureEvents: TelemetryEventType[];
  /** Minimum severity to capture */
  minSeverity: TelemetrySeverity;
}

/**
 * Default telemetry configuration
 */
export const DEFAULT_TELEMETRY_CONFIG: TelemetryConfig = {
  enabled: true,
  samplingRate: 1.0,
  maxBufferSize: 10000,
  flushInterval: 5000,
  otelEnabled: false,
  captureEvents: [
    'message_sent',
    'message_received',
    'task_started',
    'task_completed',
    'task_failed',
    'negotiation_start',
    'negotiation_complete',
    'consensus_reached',
    'choreography_start',
    'choreography_complete',
    'agent_registered',
    'error',
  ],
  minSeverity: 'info',
};

/**
 * Debugger configuration
 */
export interface DebuggerConfig {
  /** Whether debugging is enabled */
  enabled: boolean;
  /** Maximum breakpoints per agent */
  maxBreakpoints: number;
  /** Maximum sessions to record */
  maxRecordings: number;
  /** Auto-record all sessions */
  autoRecord: boolean;
  /** Breakpoint timeout (auto-resume) in milliseconds */
  breakpointTimeout: number;
}

/**
 * Default debugger configuration
 */
export const DEFAULT_DEBUGGER_CONFIG: DebuggerConfig = {
  enabled: true,
  maxBreakpoints: 10,
  maxRecordings: 100,
  autoRecord: false,
  breakpointTimeout: 30000,
};

// =============================================================================
// STATISTICS
// =============================================================================

/**
 * Telemetry statistics
 */
export interface TelemetryStats {
  /** Total events captured */
  totalEvents: number;
  /** Events by type */
  eventsByType: Record<TelemetryEventType, number>;
  /** Events by agent */
  eventsByAgent: Record<string, number>;
  /** Average event latency */
  avgLatency: number;
  /** Total spans created */
  totalSpans: number;
  /** Active spans */
  activeSpans: number;
  /** Dropped events (due to buffer overflow) */
  droppedEvents: number;
  /** Start time */
  startTime: number;
  /** Last event time */
  lastEventTime: number;
}

// =============================================================================
// EXPORT FORMAT (OpenTelemetry compatible)
// =============================================================================

/**
 * OpenTelemetry-compatible span export format
 */
export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: Array<{ key: string; value: { stringValue?: string; intValue?: string } }>;
  events: Array<{
    timeUnixNano: string;
    name: string;
    attributes: Array<{ key: string; value: { stringValue?: string } }>;
  }>;
  status: { code: number; message?: string };
}
