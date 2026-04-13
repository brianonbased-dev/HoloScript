import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsHandler } from './AnalyticsTrait';
import type { AnalyticsConfig } from './AnalyticsTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getLastEvent,
  getEventCount,
} from './__tests__/traitTestHelpers';

describe('AnalyticsTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const defaultOverrides: Partial<AnalyticsConfig> = {
    enabled: true,
    scene_id: 'test-scene',
    collect_fps: true,
    collect_draw_calls: true,
    collect_gaussians: true,
    collect_memory: true,
    collect_load_time: true,
    sampling_strategy: 'all',
    aggregation_window: '1s',
  };

  beforeEach(() => {
    node = createMockNode('analytics-node');
    ctx = createMockContext();
  });

  describe('Lifecycle', () => {
    it('should attach and emit analytics_attached event', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      expect(getEventCount(ctx, 'analytics_attached')).toBe(1);
      const data = getLastEvent(ctx, 'analytics_attached') as any;
      expect(data.sceneId).toBe('test-scene');
      expect(data.sessionId).toBeDefined();
      expect(data.privacyLevel).toBe('strict');
    });

    it('should store state on node', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);
      expect((node as any).__analyticsState).toBeDefined();
      expect((node as any).__analyticsState.isCollecting).toBe(true);
    });

    it('should clean up state on detach', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      const fullConfig = { ...analyticsHandler.defaultConfig, ...defaultOverrides };
      analyticsHandler.onDetach!(node as any, fullConfig, ctx as any);

      expect((node as any).__analyticsState).toBeUndefined();
      expect(getEventCount(ctx, 'analytics_final_report')).toBe(1);
    });

    it('should emit final report with aggregates on detach', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Generate some samples
      for (let i = 0; i < 5; i++) {
        updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      }

      const fullConfig = { ...analyticsHandler.defaultConfig, ...defaultOverrides };
      analyticsHandler.onDetach!(node as any, fullConfig, ctx as any);

      const report = getLastEvent(ctx, 'analytics_final_report') as any;
      expect(report.totalFrames).toBe(5);
      expect(report.sessionId).toBeDefined();
      expect(report.sceneId).toBe('test-scene');
    });
  });

  describe('Performance Metrics Collection', () => {
    it('should collect FPS samples on update', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Simulate frame at ~60fps (delta = 0.016s)
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);

      const state = (node as any).__analyticsState;
      expect(state.samples.length).toBe(1);
      expect(state.samples[0].fps).toBeCloseTo(62.5, 0);
      expect(state.samples[0].frameTimeMs).toBeCloseTo(16, 0);
    });

    it('should count jank frames (>16.67ms)', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Good frame
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      // Jank frame
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.02);
      // Stutter frame
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.04);

      const state = (node as any).__analyticsState;
      expect(state.frameCount).toBe(3);
      expect(state.jankCount).toBe(2); // 20ms and 40ms are both > 16.67ms
      expect(state.stutterCount).toBe(1); // Only 40ms > 33.33ms
    });

    it('should collect render stats via event', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);

      // Simulate render system responding with stats
      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_render_stats',
        drawCalls: 150,
        triangleCount: 50000,
        gaussianCount: 100000,
        memoryUsageMB: 256,
        gpuMemoryUsageMB: 512,
        activeNodes: 100,
        visibleNodes: 75,
      });

      const state = (node as any).__analyticsState;
      const lastSample = state.samples[state.samples.length - 1];
      expect(lastSample.drawCalls).toBe(150);
      expect(lastSample.triangleCount).toBe(50000);
      expect(lastSample.gaussianCount).toBe(100000);
      expect(lastSample.memoryUsageMB).toBe(256);
      expect(lastSample.gpuMemoryUsageMB).toBe(512);
    });

    it('should aggregate samples on window boundary', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Generate samples
      for (let i = 0; i < 10; i++) {
        updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      }

      // Force aggregation by advancing past window
      const state = (node as any).__analyticsState;
      state.lastAggregateTime = Date.now() - 2000; // 2s ago, window is 1s
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);

      expect(getEventCount(ctx, 'analytics_aggregate')).toBeGreaterThanOrEqual(1);
    });

    it('should cap sample buffer at max_samples', () => {
      const config = { ...defaultOverrides, max_samples: 5 };
      attachTrait(analyticsHandler, node, config, ctx);

      for (let i = 0; i < 10; i++) {
        updateTrait(analyticsHandler, node, config, ctx, 0.016);
      }

      const state = (node as any).__analyticsState;
      expect(state.samples.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Sampling Strategies', () => {
    it('should sample all frames with "all" strategy', () => {
      attachTrait(analyticsHandler, node, { ...defaultOverrides, sampling_strategy: 'all' }, ctx);

      for (let i = 0; i < 10; i++) {
        updateTrait(
          analyticsHandler,
          node,
          { ...defaultOverrides, sampling_strategy: 'all' },
          ctx,
          0.016
        );
      }

      const state = (node as any).__analyticsState;
      expect(state.samples.length).toBe(10);
    });

    it('should respect fixed_rate sampling', () => {
      const config = {
        ...defaultOverrides,
        sampling_strategy: 'fixed_rate' as const,
        sampling_rate: 0.5,
      };
      attachTrait(analyticsHandler, node, config, ctx);

      // Mock Math.random for predictability
      const originalRandom = Math.random;
      let callCount = 0;
      Math.random = () => {
        callCount++;
        return callCount % 2 === 0 ? 0.3 : 0.7; // Alternate above and below 0.5
      };

      for (let i = 0; i < 10; i++) {
        updateTrait(analyticsHandler, node, config, ctx, 0.016);
      }

      Math.random = originalRandom;

      const state = (node as any).__analyticsState;
      // Should sample approximately 50% (5 out of 10)
      expect(state.samples.length).toBe(5);
    });
  });

  describe('Load Time Tracking', () => {
    it('should record scene load time', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_scene_loaded',
        loadTimeMs: 3500,
      });

      const state = (node as any).__analyticsState;
      const lastSample = state.samples[state.samples.length - 1];
      expect(lastSample.loadTimeMs).toBe(3500);
    });
  });

  describe('Privacy Controls', () => {
    it('should default to strict privacy (no engagement collection)', () => {
      expect(analyticsHandler.defaultConfig.privacy_level).toBe('strict');
      expect(analyticsHandler.defaultConfig.collect_engagement).toBe(false);
      expect(analyticsHandler.defaultConfig.collect_heatmap).toBe(false);
    });

    it('should not collect engagement data in strict mode', () => {
      const config = {
        ...defaultOverrides,
        privacy_level: 'strict' as const,
        collect_engagement: true, // Even if enabled, strict should block
      };
      attachTrait(analyticsHandler, node, config, ctx);

      sendEvent(analyticsHandler, node, config, ctx, {
        type: 'analytics_interaction',
        position: [1, 2, 3],
      });

      const state = (node as any).__analyticsState;
      expect(state.engagement.interactionCount).toBe(0);
    });

    it('should collect engagement data in balanced mode', () => {
      const config = {
        ...defaultOverrides,
        privacy_level: 'balanced' as const,
        collect_engagement: true,
      };
      attachTrait(analyticsHandler, node, config, ctx);

      sendEvent(analyticsHandler, node, config, ctx, {
        type: 'analytics_interaction',
        position: [1, 2, 3],
      });

      const state = (node as any).__analyticsState;
      expect(state.engagement.interactionCount).toBe(1);
    });
  });

  describe('Engagement Tracking', () => {
    const engagementConfig: Partial<AnalyticsConfig> = {
      ...defaultOverrides,
      privacy_level: 'balanced',
      collect_engagement: true,
      collect_heatmap: true,
      heatmap_resolution: 2,
    };

    it('should track interaction counts', () => {
      attachTrait(analyticsHandler, node, engagementConfig, ctx);

      for (let i = 0; i < 5; i++) {
        sendEvent(analyticsHandler, node, engagementConfig, ctx, {
          type: 'analytics_interaction',
          position: [i, 0, 0],
        });
      }

      const state = (node as any).__analyticsState;
      expect(state.engagement.interactionCount).toBe(5);
    });

    it('should quantize interaction positions for heatmap', () => {
      attachTrait(analyticsHandler, node, engagementConfig, ctx);

      // Two interactions at similar positions (same 2m grid bucket)
      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_interaction',
        position: [0.5, 0.5, 0.5],
      });
      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_interaction',
        position: [1.5, 0.5, 0.5],
      });

      const state = (node as any).__analyticsState;
      // Both should be in the "0,0,0" bucket (floor(x/2)*2)
      expect(state.engagement.interactionHeatmapBuckets.get('0,0,0')).toBe(2);
    });

    it('should track scene completions', () => {
      attachTrait(analyticsHandler, node, engagementConfig, ctx);

      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_scene_completed',
        sceneId: 'level-1',
      });
      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_scene_completed',
        sceneId: 'level-2',
      });

      const state = (node as any).__analyticsState;
      expect(state.engagement.scenesCompleted).toEqual(['level-1', 'level-2']);
    });

    it('should not duplicate completed scenes', () => {
      attachTrait(analyticsHandler, node, engagementConfig, ctx);

      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_scene_completed',
        sceneId: 'level-1',
      });
      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_scene_completed',
        sceneId: 'level-1',
      });

      const state = (node as any).__analyticsState;
      expect(state.engagement.scenesCompleted).toEqual(['level-1']);
    });

    it('should query engagement data', () => {
      attachTrait(analyticsHandler, node, engagementConfig, ctx);

      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_interaction',
        position: [1, 2, 3],
      });

      sendEvent(analyticsHandler, node, engagementConfig, ctx, {
        type: 'analytics_query_engagement',
        queryId: 'q1',
      });

      const info = getLastEvent(ctx, 'analytics_engagement_info') as any;
      expect(info.queryId).toBe('q1');
      expect(info.interactionCount).toBe(1);
    });
  });

  describe('OpenTelemetry Span Management', () => {
    it('should create and end spans', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Start a span
      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_start_span',
        operationName: 'scene_render',
        attributes: { 'render.pass': 'forward' },
      });

      expect(getEventCount(ctx, 'analytics_span_started')).toBe(1);
      const startData = getLastEvent(ctx, 'analytics_span_started') as any;
      const spanId = startData.spanId;
      expect(spanId).toBeDefined();
      expect(startData.traceId).toBeDefined();

      // End the span
      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_end_span',
        spanId,
        status: 'OK',
      });

      expect(getEventCount(ctx, 'analytics_span_ended')).toBe(1);
      const endData = getLastEvent(ctx, 'analytics_span_ended') as any;
      expect(endData.spanId).toBe(spanId);
      expect(endData.status).toBe('OK');
      expect(endData.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should add events to spans', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_start_span',
        operationName: 'asset_load',
      });

      const startData = getLastEvent(ctx, 'analytics_span_started') as any;
      const spanId = startData.spanId;

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_span_event',
        spanId,
        eventName: 'texture_decoded',
        attributes: { 'texture.size': 4096 },
      });

      const state = (node as any).__analyticsState;
      const span = state.activeSpans.get(spanId);
      expect(span.events.length).toBe(1);
      expect(span.events[0].name).toBe('texture_decoded');
    });

    it('should flush spans to OTLP endpoint', () => {
      const config = {
        ...defaultOverrides,
        otlp_endpoint: 'http://collector:4318/v1/traces',
        export_format: 'otlp_json' as const,
        service_name: 'test-service',
      };
      attachTrait(analyticsHandler, node, config, ctx);

      // Create and end a span
      sendEvent(analyticsHandler, node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'test_op',
      });
      const startData = getLastEvent(ctx, 'analytics_span_started') as any;

      sendEvent(analyticsHandler, node, config, ctx, {
        type: 'analytics_end_span',
        spanId: startData.spanId,
      });

      // Flush
      sendEvent(analyticsHandler, node, config, ctx, {
        type: 'analytics_flush_spans',
      });

      expect(getEventCount(ctx, 'analytics_otel_export')).toBe(1);
      const exportData = getLastEvent(ctx, 'analytics_otel_export') as any;
      expect(exportData.format).toBe('otlp_json');
      expect(exportData.endpoint).toBe('http://collector:4318/v1/traces');
      expect(exportData.spans.length).toBeGreaterThanOrEqual(1);
      expect(exportData.serviceName).toBe('test-service');
    });
  });

  describe('Dashboard Pipeline', () => {
    const dashboardConfig: Partial<AnalyticsConfig> = {
      ...defaultOverrides,
      enable_dashboard: true,
      dashboard_flush_interval: 100,
    };

    it('should buffer dashboard data points', () => {
      attachTrait(analyticsHandler, node, dashboardConfig, ctx);

      // Generate samples and force aggregation
      for (let i = 0; i < 5; i++) {
        updateTrait(analyticsHandler, node, dashboardConfig, ctx, 0.016);
      }

      const state = (node as any).__analyticsState;
      // Force aggregate
      state.lastAggregateTime = Date.now() - 2000;
      updateTrait(analyticsHandler, node, dashboardConfig, ctx, 0.016);

      expect(state.dashboardBuffer.length).toBeGreaterThan(0);
    });

    it('should flush dashboard buffer on interval', () => {
      attachTrait(analyticsHandler, node, dashboardConfig, ctx);

      // Generate some data
      const state = (node as any).__analyticsState;
      state.lastAggregateTime = Date.now() - 2000;
      updateTrait(analyticsHandler, node, dashboardConfig, ctx, 0.016);

      // Force flush
      state.lastFlushTime = Date.now() - 200; // Past flush interval
      updateTrait(analyticsHandler, node, dashboardConfig, ctx, 0.016);

      expect(getEventCount(ctx, 'analytics_dashboard_flush')).toBeGreaterThanOrEqual(1);
    });

    it('should push custom metrics to dashboard', () => {
      attachTrait(analyticsHandler, node, dashboardConfig, ctx);

      sendEvent(analyticsHandler, node, dashboardConfig, ctx, {
        type: 'analytics_push_metric',
        metricName: 'custom.score',
        value: 42,
        unit: 'points',
        tags: { level: '3' },
      });

      const state = (node as any).__analyticsState;
      const lastPoint = state.dashboardBuffer[state.dashboardBuffer.length - 1];
      expect(lastPoint.metricName).toBe('custom.score');
      expect(lastPoint.value).toBe(42);
      expect(lastPoint.unit).toBe('points');
    });
  });

  describe('Control Events', () => {
    it('should enable/disable collection', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, { type: 'analytics_disable' });
      const state = (node as any).__analyticsState;
      expect(state.isCollecting).toBe(false);

      // Samples should not be collected while disabled
      const prevSamples = state.samples.length;
      updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      expect(state.samples.length).toBe(prevSamples);

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, { type: 'analytics_enable' });
      expect(state.isCollecting).toBe(true);
    });

    it('should reset all collected data', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      // Generate data
      for (let i = 0; i < 5; i++) {
        updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      }

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, { type: 'analytics_reset' });

      const state = (node as any).__analyticsState;
      expect(state.samples.length).toBe(0);
      expect(state.aggregates.length).toBe(0);
      expect(state.completedSpans.length).toBe(0);
      expect(state.frameCount).toBe(0);
    });
  });

  describe('Query Interface', () => {
    it('should respond to analytics_query with full state', () => {
      attachTrait(analyticsHandler, node, defaultOverrides, ctx);

      for (let i = 0; i < 3; i++) {
        updateTrait(analyticsHandler, node, defaultOverrides, ctx, 0.016);
      }

      sendEvent(analyticsHandler, node, defaultOverrides, ctx, {
        type: 'analytics_query',
        queryId: 'q1',
      });

      const info = getLastEvent(ctx, 'analytics_info') as any;
      expect(info.queryId).toBe('q1');
      expect(info.isCollecting).toBe(true);
      expect(info.sceneId).toBe('test-scene');
      expect(info.totalFrames).toBe(3);
      expect(info.totalSamples).toBe(3);
    });
  });
});
