/**
 * TraceWaterfallRenderer — Distributed trace waterfall visualization
 *
 * Converts distributed trace spans into a waterfall visualization data
 * structure suitable for rendering in Studio panels or dev server overlays.
 * Handles cross-agent span linking from TraceContextPropagator.
 *
 * Part of HoloScript v5.9 "Developer Portal".
 *
 * @version 1.0.0
 */

import type { TraceSpan, SpanStatus } from './TelemetryTypes';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A single row in the waterfall visualization.
 */
export interface WaterfallRow {
  /** Span ID */
  spanId: string;
  /** Parent span ID (undefined for root) */
  parentSpanId?: string;
  /** Display name */
  name: string;
  /** Agent that produced this span */
  agentId?: string;
  /** Nesting depth (0 = root) */
  depth: number;
  /** Start offset in ms relative to trace start */
  startOffset: number;
  /** Duration in ms */
  duration: number;
  /** Span status */
  status: SpanStatus;
  /** Visual bar left position (0-1 fraction of total width) */
  barLeft: number;
  /** Visual bar width (0-1 fraction of total width) */
  barWidth: number;
  /** Color hint based on status/agent */
  color: string;
  /** Children span IDs */
  children: string[];
  /** Span attributes */
  attributes?: Record<string, unknown>;
  /** Span events (errors, logs) */
  events?: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
}

/**
 * Complete waterfall visualization data.
 */
export interface WaterfallData {
  /** Trace ID */
  traceId: string;
  /** Total trace duration in ms */
  totalDuration: number;
  /** Trace start time (epoch ms) */
  startTime: number;
  /** Number of spans */
  spanCount: number;
  /** Number of unique agents */
  agentCount: number;
  /** Rows ordered top-to-bottom */
  rows: WaterfallRow[];
  /** Agent color mapping */
  agentColors: Record<string, string>;
  /** Critical path span IDs (longest chain) */
  criticalPath: string[];
  /** Summary statistics */
  summary: WaterfallSummary;
}

/**
 * Summary statistics for a trace waterfall.
 */
export interface WaterfallSummary {
  /** Total spans */
  totalSpans: number;
  /** Error spans */
  errorSpans: number;
  /** Max depth */
  maxDepth: number;
  /** Agents involved */
  agents: string[];
  /** Average span duration */
  avgDuration: number;
  /** Longest span */
  longestSpan: { name: string; duration: number };
}

/**
 * TraceWaterfallRenderer configuration.
 */
export interface WaterfallRendererConfig {
  /** Minimum span duration to display (ms, default: 0) */
  minDuration?: number;
  /** Maximum depth to render (default: 20) */
  maxDepth?: number;
  /** Color palette for agents */
  colorPalette?: string[];
}

// =============================================================================
// DEFAULT COLORS
// =============================================================================

const DEFAULT_PALETTE = [
  '#00d4ff', // cyan
  '#ff6b6b', // red
  '#51cf66', // green
  '#ffd43b', // yellow
  '#845ef7', // purple
  '#ff922b', // orange
  '#20c997', // teal
  '#e599f7', // pink
];

const STATUS_COLORS: Record<SpanStatus, string> = {
  ok: '#51cf66',
  error: '#ff6b6b',
  unset: '#868e96',
};

// =============================================================================
// RENDERER
// =============================================================================

export class TraceWaterfallRenderer {
  private config: Required<WaterfallRendererConfig>;

  constructor(config?: WaterfallRendererConfig) {
    this.config = {
      minDuration: config?.minDuration ?? 0,
      maxDepth: config?.maxDepth ?? 20,
      colorPalette: config?.colorPalette ?? DEFAULT_PALETTE,
    };
  }

  // ===========================================================================
  // RENDER
  // ===========================================================================

  /**
   * Render spans into a waterfall visualization.
   */
  render(spans: TraceSpan[]): WaterfallData {
    if (spans.length === 0) {
      return this.emptyWaterfall();
    }

    // Get trace ID from first span
    const traceId = spans[0].traceId;

    // Filter by trace ID and duration
    const filtered = spans.filter((s) => {
      if (s.traceId !== traceId) return false;
      const duration = (s.endTime ?? s.startTime) - s.startTime;
      return duration >= this.config.minDuration;
    });

    if (filtered.length === 0) {
      return this.emptyWaterfall();
    }

    // Calculate trace bounds
    const startTime = Math.min(...filtered.map((s) => s.startTime));
    const endTime = Math.max(...filtered.map((s) => s.endTime ?? s.startTime));
    const totalDuration = Math.max(endTime - startTime, 1); // Avoid division by zero

    // Assign agent colors
    const agents = new Set<string>();
    for (const span of filtered) {
      const agentId = (span.attributes?.agentId as string) || 'unknown';
      agents.add(agentId);
    }
    const agentColors: Record<string, string> = {};
    let colorIdx = 0;
    for (const agent of agents) {
      agentColors[agent] = this.config.colorPalette[colorIdx % this.config.colorPalette.length];
      colorIdx++;
    }

    // Build parent-child map
    const childrenMap = new Map<string, string[]>();
    const spanMap = new Map<string, TraceSpan>();
    for (const span of filtered) {
      spanMap.set(span.spanId, span);
      if (!childrenMap.has(span.spanId)) {
        childrenMap.set(span.spanId, []);
      }
    }

    for (const span of filtered) {
      if (span.parentSpanId && childrenMap.has(span.parentSpanId)) {
        childrenMap.get(span.parentSpanId)!.push(span.spanId);
      }
    }

    // Find root spans (no parent or parent not in trace)
    const rootSpans = filtered.filter(
      (s) => !s.parentSpanId || !spanMap.has(s.parentSpanId)
    );

    // Build rows via DFS
    const rows: WaterfallRow[] = [];
    const visited = new Set<string>();

    const buildRow = (span: TraceSpan, depth: number): void => {
      if (visited.has(span.spanId)) return;
      if (depth > this.config.maxDepth) return;
      visited.add(span.spanId);

      const duration = (span.endTime ?? span.startTime) - span.startTime;
      const startOffset = span.startTime - startTime;
      const agentId = (span.attributes?.agentId as string) || 'unknown';
      const children = childrenMap.get(span.spanId) || [];

      const row: WaterfallRow = {
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        agentId,
        depth,
        startOffset,
        duration,
        status: span.status,
        barLeft: startOffset / totalDuration,
        barWidth: Math.max(duration / totalDuration, 0.002), // Min visible width
        color: span.status === 'error' ? STATUS_COLORS.error : (agentColors[agentId] || STATUS_COLORS.unset),
        children,
        attributes: span.attributes,
        events: span.events?.map((e) => ({
          name: e.name,
          timestamp: e.timestamp,
          attributes: e.attributes,
        })),
      };

      rows.push(row);

      // Sort children by start time
      const childSpans = children
        .map((id) => spanMap.get(id))
        .filter((s): s is TraceSpan => s !== undefined)
        .sort((a, b) => a.startTime - b.startTime);

      for (const child of childSpans) {
        buildRow(child, depth + 1);
      }
    };

    // Sort root spans by start time
    rootSpans.sort((a, b) => a.startTime - b.startTime);
    for (const root of rootSpans) {
      buildRow(root, 0);
    }

    // Calculate critical path
    const criticalPath = this.findCriticalPath(filtered, spanMap, childrenMap);

    // Build summary
    const durations = rows.map((r) => r.duration);
    const errorCount = rows.filter((r) => r.status === 'error').length;
    const longestRow = rows.reduce((max, r) => (r.duration > max.duration ? r : max), rows[0]);

    const summary: WaterfallSummary = {
      totalSpans: rows.length,
      errorSpans: errorCount,
      maxDepth: Math.max(...rows.map((r) => r.depth)),
      agents: [...agents],
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      longestSpan: { name: longestRow.name, duration: longestRow.duration },
    };

    return {
      traceId,
      totalDuration,
      startTime,
      spanCount: rows.length,
      agentCount: agents.size,
      rows,
      agentColors,
      criticalPath,
      summary,
    };
  }

  // ===========================================================================
  // RENDER MULTIPLE TRACES
  // ===========================================================================

  /**
   * Render multiple traces, grouping spans by trace ID.
   */
  renderMultiple(spans: TraceSpan[]): WaterfallData[] {
    const byTrace = new Map<string, TraceSpan[]>();
    for (const span of spans) {
      if (!byTrace.has(span.traceId)) {
        byTrace.set(span.traceId, []);
      }
      byTrace.get(span.traceId)!.push(span);
    }

    return [...byTrace.values()].map((traceSpans) => this.render(traceSpans));
  }

  // ===========================================================================
  // CRITICAL PATH
  // ===========================================================================

  private findCriticalPath(
    spans: TraceSpan[],
    spanMap: Map<string, TraceSpan>,
    childrenMap: Map<string, string[]>
  ): string[] {
    // Critical path = longest chain from root to leaf
    let longestPath: string[] = [];
    let longestDuration = 0;

    const dfs = (spanId: string, path: string[], accumulated: number): void => {
      const span = spanMap.get(spanId);
      if (!span) return;

      const duration = (span.endTime ?? span.startTime) - span.startTime;
      const newAccum = accumulated + duration;
      const newPath = [...path, spanId];
      const children = childrenMap.get(spanId) || [];

      if (children.length === 0 || children.every((c) => !spanMap.has(c))) {
        // Leaf node
        if (newAccum > longestDuration) {
          longestDuration = newAccum;
          longestPath = newPath;
        }
        return;
      }

      for (const child of children) {
        if (spanMap.has(child)) {
          dfs(child, newPath, newAccum);
        }
      }
    };

    // Find root spans
    const roots = spans.filter((s) => !s.parentSpanId || !spanMap.has(s.parentSpanId));
    for (const root of roots) {
      dfs(root.spanId, [], 0);
    }

    return longestPath;
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  private emptyWaterfall(): WaterfallData {
    return {
      traceId: '',
      totalDuration: 0,
      startTime: 0,
      spanCount: 0,
      agentCount: 0,
      rows: [],
      agentColors: {},
      criticalPath: [],
      summary: {
        totalSpans: 0,
        errorSpans: 0,
        maxDepth: 0,
        agents: [],
        avgDuration: 0,
        longestSpan: { name: '', duration: 0 },
      },
    };
  }
}
