/**
 * Analytics Trait
 *
 * Scene performance metrics collection for spatial computing scenes.
 * Collects FPS, draw calls, Gaussian splat count, memory usage, load time,
 * and user engagement data with privacy-respecting defaults (no PII collection).
 *
 * Supports OpenTelemetry-compatible trace/span export and real-time
 * metrics dashboard data pipelines.
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Sampling strategy for metrics collection */
type SamplingStrategy = 'all' | 'fixed_rate' | 'adaptive';

/** Export format for trace data */
type ExportFormat = 'otlp_json' | 'otlp_proto' | 'zipkin' | 'jaeger' | 'console';

/** Privacy level controlling what data is collected */
type PrivacyLevel = 'strict' | 'balanced' | 'permissive';

/** Aggregation window for metrics */
type AggregationWindow = '1s' | '5s' | '10s' | '30s' | '1m' | '5m';

/** A single performance sample */
export interface PerformanceSample {
  timestamp: number;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangleCount: number;
  gaussianCount: number;
  memoryUsageMB: number;
  gpuMemoryUsageMB: number;
  loadTimeMs: number;
  activeNodes: number;
  visibleNodes: number;
}

/** Aggregated performance metrics over a window */
export interface PerformanceAggregate {
  windowStart: number;
  windowEnd: number;
  sampleCount: number;
  fps: { min: number; max: number; avg: number; p50: number; p95: number; p99: number };
  frameTimeMs: { min: number; max: number; avg: number; p50: number; p95: number; p99: number };
  drawCalls: { min: number; max: number; avg: number };
  triangleCount: { min: number; max: number; avg: number };
  gaussianCount: { min: number; max: number; avg: number };
  memoryUsageMB: { min: number; max: number; avg: number };
  gpuMemoryUsageMB: { min: number; max: number; avg: number };
  jankFrames: number; // frames > 16.67ms (below 60fps)
  stutterFrames: number; // frames > 33.33ms (below 30fps)
}

/** User engagement metrics (no PII) */
export interface EngagementMetrics {
  sessionStartTime: number;
  sessionDurationMs: number;
  interactionCount: number;
  sceneLoadCount: number;
  scenesCompleted: string[];
  avgInteractionInterval: number;
  interactionHeatmapBuckets: Map<string, number>;
  idleTimeMs: number;
  activeTimeMs: number;
}

/** OpenTelemetry-compatible span representation */
export interface OTelSpan {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  operationName: string;
  serviceName: string;
  startTimeUnixNano: number;
  endTimeUnixNano: number;
  status: 'OK' | 'ERROR' | 'UNSET';
  attributes: Record<string, string | number | boolean>;
  events: Array<{
    name: string;
    timeUnixNano: number;
    attributes: Record<string, string | number | boolean>;
  }>;
}

/** Metrics dashboard data point */
export interface DashboardDataPoint {
  metricName: string;
  value: number;
  timestamp: number;
  tags: Record<string, string>;
  unit: string;
}

// =============================================================================
// STATE
// =============================================================================

interface AnalyticsState {
  isCollecting: boolean;
  samples: PerformanceSample[];
  aggregates: PerformanceAggregate[];
  engagement: EngagementMetrics;
  activeSpans: Map<string, OTelSpan>;
  completedSpans: OTelSpan[];
  dashboardBuffer: DashboardDataPoint[];
  lastSampleTime: number;
  lastAggregateTime: number;
  lastFlushTime: number;
  lastInteractionTime: number;
  sessionId: string;
  sceneId: string;
  frameCount: number;
  jankCount: number;
  stutterCount: number;
  traceIdCounter: number;
}

// =============================================================================
// CONFIG
// =============================================================================

export interface AnalyticsConfig {
  /** Enable/disable collection */
  enabled: boolean;

  /** Scene identifier for attribution */
  scene_id: string;

  /** Privacy level - strict collects no user data, balanced is default */
  privacy_level: PrivacyLevel;

  /** Sampling strategy for performance metrics */
  sampling_strategy: SamplingStrategy;

  /** Fixed sampling rate (0.0-1.0) when using fixed_rate strategy */
  sampling_rate: number;

  /** How often to aggregate samples */
  aggregation_window: AggregationWindow;

  /** Maximum samples to keep in memory before flushing */
  max_samples: number;

  /** Maximum completed spans to keep before flushing */
  max_spans: number;

  /** Export format for OpenTelemetry traces */
  export_format: ExportFormat;

  /** OTLP collector endpoint URL (empty = no export) */
  otlp_endpoint: string;

  /** Service name for OTLP export */
  service_name: string;

  /** Enable FPS collection */
  collect_fps: boolean;

  /** Enable draw call collection */
  collect_draw_calls: boolean;

  /** Enable Gaussian splat count collection */
  collect_gaussians: boolean;

  /** Enable memory usage collection */
  collect_memory: boolean;

  /** Enable load time collection */
  collect_load_time: boolean;

  /** Enable user engagement tracking (respects privacy_level) */
  collect_engagement: boolean;

  /** Enable interaction heatmap (spatial grid, no PII) */
  collect_heatmap: boolean;

  /** Heatmap grid resolution (lower = more privacy) */
  heatmap_resolution: number;

  /** Enable real-time dashboard data pipeline */
  enable_dashboard: boolean;

  /** Dashboard flush interval in ms */
  dashboard_flush_interval: number;

  /** Custom metric tags applied to all data points */
  custom_tags: Record<string, string>;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateId(): string {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateTraceId(): string {
  return generateId() + generateId(); // 32 hex chars
}

function generateSpanId(): string {
  return generateId(); // 16 hex chars
}

function parseAggregationWindowMs(window: AggregationWindow): number {
  const map: Record<AggregationWindow, number> = {
    '1s': 1000,
    '5s': 5000,
    '10s': 10000,
    '30s': 30000,
    '1m': 60000,
    '5m': 300000,
  };
  return map[window] || 5000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function computeAggregate(samples: PerformanceSample[]): PerformanceAggregate {
  if (samples.length === 0) {
    const zero = { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
    const zeroSimple = { min: 0, max: 0, avg: 0 };
    return {
      windowStart: 0,
      windowEnd: 0,
      sampleCount: 0,
      fps: zero,
      frameTimeMs: zero,
      drawCalls: zeroSimple,
      triangleCount: zeroSimple,
      gaussianCount: zeroSimple,
      memoryUsageMB: zeroSimple,
      gpuMemoryUsageMB: zeroSimple,
      jankFrames: 0,
      stutterFrames: 0,
    };
  }

  const fpsList = samples.map((s) => s.fps).sort((a, b) => a - b);
  const frameTimeList = samples.map((s) => s.frameTimeMs).sort((a, b) => a - b);

  const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);
  const avg = (arr: number[]) => (arr.length > 0 ? sum(arr) / arr.length : 0);
  const min = (arr: number[]) => (arr.length > 0 ? Math.min(...arr) : 0);
  const max = (arr: number[]) => (arr.length > 0 ? Math.max(...arr) : 0);

  const simpleStats = (arr: number[]) => ({
    min: min(arr),
    max: max(arr),
    avg: avg(arr),
  });

  const jankFrames = samples.filter((s) => s.frameTimeMs > 16.67).length;
  const stutterFrames = samples.filter((s) => s.frameTimeMs > 33.33).length;

  return {
    windowStart: samples[0].timestamp,
    windowEnd: samples[samples.length - 1].timestamp,
    sampleCount: samples.length,
    fps: {
      min: min(fpsList),
      max: max(fpsList),
      avg: avg(fpsList),
      p50: percentile(fpsList, 50),
      p95: percentile(fpsList, 95),
      p99: percentile(fpsList, 99),
    },
    frameTimeMs: {
      min: min(frameTimeList),
      max: max(frameTimeList),
      avg: avg(frameTimeList),
      p50: percentile(frameTimeList, 50),
      p95: percentile(frameTimeList, 95),
      p99: percentile(frameTimeList, 99),
    },
    drawCalls: simpleStats(samples.map((s) => s.drawCalls)),
    triangleCount: simpleStats(samples.map((s) => s.triangleCount)),
    gaussianCount: simpleStats(samples.map((s) => s.gaussianCount)),
    memoryUsageMB: simpleStats(samples.map((s) => s.memoryUsageMB)),
    gpuMemoryUsageMB: simpleStats(samples.map((s) => s.gpuMemoryUsageMB)),
    jankFrames,
    stutterFrames,
  };
}

function shouldSample(config: AnalyticsConfig, state: AnalyticsState): boolean {
  if (config.sampling_strategy === 'all') return true;
  if (config.sampling_strategy === 'fixed_rate') {
    return Math.random() < config.sampling_rate;
  }
  // adaptive: sample more when performance is bad
  if (state.samples.length > 0) {
    const lastSample = state.samples[state.samples.length - 1];
    if (lastSample.fps < 30) return true; // Always sample when FPS < 30
    if (lastSample.fps < 60) return Math.random() < 0.5; // 50% when < 60fps
    return Math.random() < 0.1; // 10% when >= 60fps
  }
  return true;
}

function quantizePosition(x: number, y: number, z: number, resolution: number): string {
  const qx = Math.floor(x / resolution) * resolution;
  const qy = Math.floor(y / resolution) * resolution;
  const qz = Math.floor(z / resolution) * resolution;
  return `${qx},${qy},${qz}`;
}

// =============================================================================
// HANDLER
// =============================================================================

export const analyticsHandler: TraitHandler<AnalyticsConfig> = {
  name: 'analytics',

  defaultConfig: {
    enabled: true,
    scene_id: '',
    privacy_level: 'strict',
    sampling_strategy: 'adaptive',
    sampling_rate: 0.1,
    aggregation_window: '5s',
    max_samples: 1000,
    max_spans: 500,
    export_format: 'otlp_json',
    otlp_endpoint: '',
    service_name: 'holoscript-scene',
    collect_fps: true,
    collect_draw_calls: true,
    collect_gaussians: true,
    collect_memory: true,
    collect_load_time: true,
    collect_engagement: false, // Off by default - privacy
    collect_heatmap: false, // Off by default - privacy
    heatmap_resolution: 2, // 2m grid - low resolution for privacy
    enable_dashboard: false,
    dashboard_flush_interval: 1000,
    custom_tags: {},
  },

  onAttach(node, config, context) {
    const now = Date.now();
    const state: AnalyticsState = {
      isCollecting: config.enabled,
      samples: [],
      aggregates: [],
      engagement: {
        sessionStartTime: now,
        sessionDurationMs: 0,
        interactionCount: 0,
        sceneLoadCount: 1,
        scenesCompleted: [],
        avgInteractionInterval: 0,
        interactionHeatmapBuckets: new Map(),
        idleTimeMs: 0,
        activeTimeMs: 0,
      },
      activeSpans: new Map(),
      completedSpans: [],
      dashboardBuffer: [],
      lastSampleTime: now,
      lastAggregateTime: now,
      lastFlushTime: now,
      lastInteractionTime: now,
      sessionId: generateId(),
      sceneId: config.scene_id || node.id || 'unknown',
      frameCount: 0,
      jankCount: 0,
      stutterCount: 0,
      traceIdCounter: 0,
    };
    (node as any).__analyticsState = state;

    // Start root trace span for scene lifetime
    const rootSpan = createSpan(state, config, 'scene_lifecycle', null);
    rootSpan.attributes['scene.id'] = state.sceneId;
    rootSpan.attributes['session.id'] = state.sessionId;

    context.emit?.('analytics_attached', {
      node,
      sessionId: state.sessionId,
      sceneId: state.sceneId,
      privacyLevel: config.privacy_level,
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__analyticsState as AnalyticsState;
    if (!state) return;

    // Close all active spans
    const now = Date.now();
    for (const [, span] of state.activeSpans) {
      span.endTimeUnixNano = now * 1_000_000;
      span.status = 'OK';
      state.completedSpans.push(span);
    }
    state.activeSpans.clear();

    // Final aggregate
    if (state.samples.length > 0) {
      const aggregate = computeAggregate(state.samples);
      state.aggregates.push(aggregate);
    }

    // Emit final metrics
    context.emit?.('analytics_final_report', {
      node,
      sessionId: state.sessionId,
      sceneId: state.sceneId,
      totalFrames: state.frameCount,
      totalJankFrames: state.jankCount,
      totalStutterFrames: state.stutterCount,
      aggregates: state.aggregates,
      engagement: config.collect_engagement
        ? {
            sessionDurationMs: now - state.engagement.sessionStartTime,
            interactionCount: state.engagement.interactionCount,
            scenesCompleted: state.engagement.scenesCompleted,
            activeTimeMs: state.engagement.activeTimeMs,
            idleTimeMs: state.engagement.idleTimeMs,
          }
        : null,
      completedSpans: state.completedSpans,
    });

    // Flush to dashboard if enabled
    if (config.enable_dashboard && state.dashboardBuffer.length > 0) {
      context.emit?.('analytics_dashboard_flush', {
        node,
        dataPoints: [...state.dashboardBuffer],
      });
    }

    // Export spans if endpoint configured
    if (config.otlp_endpoint && state.completedSpans.length > 0) {
      context.emit?.('analytics_otel_export', {
        node,
        format: config.export_format,
        endpoint: config.otlp_endpoint,
        spans: state.completedSpans,
        serviceName: config.service_name,
      });
    }

    delete (node as any).__analyticsState;
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__analyticsState as AnalyticsState;
    if (!state || !state.isCollecting) return;

    const now = Date.now();
    state.frameCount++;

    // Collect performance sample
    if (shouldSample(config, state)) {
      const fps = delta > 0 ? 1 / delta : 0;
      const frameTimeMs = delta * 1000;

      if (frameTimeMs > 16.67) state.jankCount++;
      if (frameTimeMs > 33.33) state.stutterCount++;

      const sample: PerformanceSample = {
        timestamp: now,
        fps: config.collect_fps ? fps : 0,
        frameTimeMs: config.collect_fps ? frameTimeMs : 0,
        drawCalls: 0, // Populated by render system via event
        triangleCount: 0,
        gaussianCount: 0,
        memoryUsageMB: 0,
        gpuMemoryUsageMB: 0,
        loadTimeMs: 0,
        activeNodes: 0,
        visibleNodes: 0,
      };

      // Request render stats from the engine
      context.emit?.('analytics_request_render_stats', { node });

      state.samples.push(sample);
      state.lastSampleTime = now;

      // Cap sample buffer
      if (state.samples.length > config.max_samples) {
        state.samples = state.samples.slice(-config.max_samples);
      }
    }

    // Aggregate on window boundary
    const windowMs = parseAggregationWindowMs(config.aggregation_window);
    if (now - state.lastAggregateTime >= windowMs) {
      const windowSamples = state.samples.filter((s) => s.timestamp > state.lastAggregateTime);

      if (windowSamples.length > 0) {
        const aggregate = computeAggregate(windowSamples);
        state.aggregates.push(aggregate);

        context.emit?.('analytics_aggregate', {
          node,
          aggregate,
          sceneId: state.sceneId,
          sessionId: state.sessionId,
        });

        // Push to dashboard pipeline
        if (config.enable_dashboard) {
          const tags = {
            scene_id: state.sceneId,
            session_id: state.sessionId,
            ...config.custom_tags,
          };

          state.dashboardBuffer.push(
            {
              metricName: 'scene.fps.avg',
              value: aggregate.fps.avg,
              timestamp: now,
              tags,
              unit: 'fps',
            },
            {
              metricName: 'scene.fps.p95',
              value: aggregate.fps.p95,
              timestamp: now,
              tags,
              unit: 'fps',
            },
            {
              metricName: 'scene.frame_time.avg',
              value: aggregate.frameTimeMs.avg,
              timestamp: now,
              tags,
              unit: 'ms',
            },
            {
              metricName: 'scene.frame_time.p99',
              value: aggregate.frameTimeMs.p99,
              timestamp: now,
              tags,
              unit: 'ms',
            },
            {
              metricName: 'scene.draw_calls.avg',
              value: aggregate.drawCalls.avg,
              timestamp: now,
              tags,
              unit: 'count',
            },
            {
              metricName: 'scene.gaussians.avg',
              value: aggregate.gaussianCount.avg,
              timestamp: now,
              tags,
              unit: 'count',
            },
            {
              metricName: 'scene.memory.avg',
              value: aggregate.memoryUsageMB.avg,
              timestamp: now,
              tags,
              unit: 'MB',
            },
            {
              metricName: 'scene.gpu_memory.avg',
              value: aggregate.gpuMemoryUsageMB.avg,
              timestamp: now,
              tags,
              unit: 'MB',
            },
            {
              metricName: 'scene.jank_frames',
              value: aggregate.jankFrames,
              timestamp: now,
              tags,
              unit: 'count',
            },
            {
              metricName: 'scene.stutter_frames',
              value: aggregate.stutterFrames,
              timestamp: now,
              tags,
              unit: 'count',
            }
          );
        }
      }

      state.lastAggregateTime = now;
    }

    // Flush dashboard buffer periodically
    if (
      config.enable_dashboard &&
      state.dashboardBuffer.length > 0 &&
      now - state.lastFlushTime >= config.dashboard_flush_interval
    ) {
      context.emit?.('analytics_dashboard_flush', {
        node,
        dataPoints: [...state.dashboardBuffer],
      });
      state.dashboardBuffer = [];
      state.lastFlushTime = now;
    }

    // Update engagement tracking
    if (config.collect_engagement && config.privacy_level !== 'strict') {
      state.engagement.sessionDurationMs = now - state.engagement.sessionStartTime;

      // Detect idle vs active (30s idle threshold)
      const timeSinceInteraction = now - state.lastInteractionTime;
      if (timeSinceInteraction > 30000) {
        state.engagement.idleTimeMs += delta * 1000;
      } else {
        state.engagement.activeTimeMs += delta * 1000;
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__analyticsState as AnalyticsState;
    if (!state) return;

    // --- Render stats response ---
    if (event.type === 'analytics_render_stats') {
      // Update the most recent sample with render data
      if (state.samples.length > 0) {
        const lastSample = state.samples[state.samples.length - 1];
        if (config.collect_draw_calls) {
          lastSample.drawCalls = (event.drawCalls as number) || 0;
          lastSample.triangleCount = (event.triangleCount as number) || 0;
        }
        if (config.collect_gaussians) {
          lastSample.gaussianCount = (event.gaussianCount as number) || 0;
        }
        if (config.collect_memory) {
          lastSample.memoryUsageMB = (event.memoryUsageMB as number) || 0;
          lastSample.gpuMemoryUsageMB = (event.gpuMemoryUsageMB as number) || 0;
        }
        lastSample.activeNodes = (event.activeNodes as number) || 0;
        lastSample.visibleNodes = (event.visibleNodes as number) || 0;
      }
    }

    // --- Load time measurement ---
    else if (event.type === 'analytics_scene_loaded') {
      if (config.collect_load_time && state.samples.length > 0) {
        const lastSample = state.samples[state.samples.length - 1];
        lastSample.loadTimeMs = (event.loadTimeMs as number) || 0;
      }

      if (config.enable_dashboard) {
        state.dashboardBuffer.push({
          metricName: 'scene.load_time',
          value: (event.loadTimeMs as number) || 0,
          timestamp: Date.now(),
          tags: {
            scene_id: state.sceneId,
            session_id: state.sessionId,
            ...config.custom_tags,
          },
          unit: 'ms',
        });
      }
    }

    // --- Interaction tracking (engagement) ---
    else if (event.type === 'analytics_interaction') {
      if (config.collect_engagement && config.privacy_level !== 'strict') {
        const now = Date.now();
        state.engagement.interactionCount++;

        // Calculate interaction interval
        const interval = now - state.lastInteractionTime;
        if (state.engagement.interactionCount > 1) {
          const prevAvg = state.engagement.avgInteractionInterval;
          const count = state.engagement.interactionCount;
          state.engagement.avgInteractionInterval = prevAvg + (interval - prevAvg) / count;
        }
        state.lastInteractionTime = now;

        // Interaction heatmap (spatial bucket, no PII)
        if (config.collect_heatmap && event.position) {
          const pos = event.position as { x: number; y: number; z: number };
          const bucket = quantizePosition(pos.x, pos.y, pos.z, config.heatmap_resolution);
          const current = state.engagement.interactionHeatmapBuckets.get(bucket) || 0;
          state.engagement.interactionHeatmapBuckets.set(bucket, current + 1);
        }
      }
    }

    // --- Scene completion ---
    else if (event.type === 'analytics_scene_completed') {
      if (config.collect_engagement) {
        const completedScene = (event.sceneId as string) || state.sceneId;
        if (!state.engagement.scenesCompleted.includes(completedScene)) {
          state.engagement.scenesCompleted.push(completedScene);
        }

        if (config.enable_dashboard) {
          state.dashboardBuffer.push({
            metricName: 'scene.completion',
            value: 1,
            timestamp: Date.now(),
            tags: {
              scene_id: completedScene,
              session_id: state.sessionId,
              ...config.custom_tags,
            },
            unit: 'count',
          });
        }
      }
    }

    // --- OTel Span management ---
    else if (event.type === 'analytics_start_span') {
      const parentSpanId = (event.parentSpanId as string) || null;
      const operationName = (event.operationName as string) || 'unknown';
      const attributes = (event.attributes as Record<string, string | number | boolean>) || {};

      const span = createSpan(state, config, operationName, parentSpanId);
      Object.assign(span.attributes, attributes);

      context.emit?.('analytics_span_started', {
        node,
        spanId: span.spanId,
        traceId: span.traceId,
        operationName,
      });
    } else if (event.type === 'analytics_end_span') {
      const spanId = event.spanId as string;
      const status = (event.status as 'OK' | 'ERROR') || 'OK';

      const span = state.activeSpans.get(spanId);
      if (span) {
        span.endTimeUnixNano = Date.now() * 1_000_000;
        span.status = status;
        state.activeSpans.delete(spanId);
        state.completedSpans.push(span);

        // Cap completed spans
        if (state.completedSpans.length > config.max_spans) {
          // Flush oldest spans
          const overflow = state.completedSpans.splice(
            0,
            state.completedSpans.length - config.max_spans
          );
          if (config.otlp_endpoint) {
            context.emit?.('analytics_otel_export', {
              node,
              format: config.export_format,
              endpoint: config.otlp_endpoint,
              spans: overflow,
              serviceName: config.service_name,
            });
          }
        }

        context.emit?.('analytics_span_ended', {
          node,
          spanId,
          durationMs: (span.endTimeUnixNano - span.startTimeUnixNano) / 1_000_000,
          status,
        });
      }
    } else if (event.type === 'analytics_span_event') {
      const spanId = event.spanId as string;
      const eventName = (event.eventName as string) || 'event';
      const attributes = (event.attributes as Record<string, string | number | boolean>) || {};

      const span = state.activeSpans.get(spanId);
      if (span) {
        span.events.push({
          name: eventName,
          timeUnixNano: Date.now() * 1_000_000,
          attributes,
        });
      }
    }

    // --- Manual OTel export trigger ---
    else if (event.type === 'analytics_flush_spans') {
      if (config.otlp_endpoint && state.completedSpans.length > 0) {
        context.emit?.('analytics_otel_export', {
          node,
          format: config.export_format,
          endpoint: config.otlp_endpoint,
          spans: [...state.completedSpans],
          serviceName: config.service_name,
        });
        state.completedSpans = [];
      }
    }

    // --- Dashboard custom metric ---
    else if (event.type === 'analytics_push_metric') {
      if (config.enable_dashboard) {
        state.dashboardBuffer.push({
          metricName: (event.metricName as string) || 'custom',
          value: (event.value as number) || 0,
          timestamp: Date.now(),
          tags: {
            scene_id: state.sceneId,
            session_id: state.sessionId,
            ...config.custom_tags,
            ...((event.tags as Record<string, string>) || {}),
          },
          unit: (event.unit as string) || 'count',
        });
      }
    }

    // --- Control events ---
    else if (event.type === 'analytics_enable') {
      state.isCollecting = true;
    } else if (event.type === 'analytics_disable') {
      state.isCollecting = false;
    } else if (event.type === 'analytics_reset') {
      state.samples = [];
      state.aggregates = [];
      state.completedSpans = [];
      state.dashboardBuffer = [];
      state.frameCount = 0;
      state.jankCount = 0;
      state.stutterCount = 0;
    }

    // --- Query events ---
    else if (event.type === 'analytics_query') {
      const latestAggregate =
        state.aggregates.length > 0 ? state.aggregates[state.aggregates.length - 1] : null;

      context.emit?.('analytics_info', {
        queryId: event.queryId,
        node,
        isCollecting: state.isCollecting,
        sessionId: state.sessionId,
        sceneId: state.sceneId,
        totalFrames: state.frameCount,
        totalSamples: state.samples.length,
        totalAggregates: state.aggregates.length,
        totalCompletedSpans: state.completedSpans.length,
        activeSpans: state.activeSpans.size,
        dashboardBufferSize: state.dashboardBuffer.length,
        latestAggregate,
        engagement: config.collect_engagement
          ? {
              sessionDurationMs: state.engagement.sessionDurationMs,
              interactionCount: state.engagement.interactionCount,
              scenesCompleted: state.engagement.scenesCompleted.length,
              activeTimeMs: state.engagement.activeTimeMs,
              idleTimeMs: state.engagement.idleTimeMs,
            }
          : null,
      });
    }

    // --- Engagement query ---
    else if (event.type === 'analytics_query_engagement') {
      if (config.collect_engagement) {
        const heatmapData: Array<{ bucket: string; count: number }> = [];
        if (config.collect_heatmap) {
          for (const [bucket, count] of state.engagement.interactionHeatmapBuckets) {
            heatmapData.push({ bucket, count });
          }
        }

        context.emit?.('analytics_engagement_info', {
          queryId: event.queryId,
          node,
          sessionDurationMs: state.engagement.sessionDurationMs,
          interactionCount: state.engagement.interactionCount,
          avgInteractionInterval: state.engagement.avgInteractionInterval,
          scenesCompleted: state.engagement.scenesCompleted,
          sceneLoadCount: state.engagement.sceneLoadCount,
          activeTimeMs: state.engagement.activeTimeMs,
          idleTimeMs: state.engagement.idleTimeMs,
          heatmap: heatmapData,
        });
      }
    }

    // --- Dashboard data query ---
    else if (event.type === 'analytics_query_dashboard') {
      context.emit?.('analytics_dashboard_data', {
        queryId: event.queryId,
        node,
        bufferedDataPoints: state.dashboardBuffer.length,
        latestDataPoints: state.dashboardBuffer.slice(-50),
      });
    }
  },
};

// =============================================================================
// SPAN FACTORY
// =============================================================================

function createSpan(
  state: AnalyticsState,
  config: AnalyticsConfig,
  operationName: string,
  parentSpanId: string | null
): OTelSpan {
  const span: OTelSpan = {
    traceId: generateTraceId(),
    spanId: generateSpanId(),
    parentSpanId,
    operationName,
    serviceName: config.service_name,
    startTimeUnixNano: Date.now() * 1_000_000,
    endTimeUnixNano: 0,
    status: 'UNSET',
    attributes: {
      'scene.id': state.sceneId,
      'session.id': state.sessionId,
    },
    events: [],
  };

  state.activeSpans.set(span.spanId, span);
  return span;
}

export default analyticsHandler;
