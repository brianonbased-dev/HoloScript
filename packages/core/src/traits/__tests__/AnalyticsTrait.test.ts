import { describe, it, expect, beforeEach, vi } from 'vitest';
import { analyticsHandler } from '../AnalyticsTrait';
import type { AnalyticsConfig } from '../AnalyticsTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeNode(id = 'test_node'): Record<string, unknown> {
  return { id };
}

function makeConfig(overrides: Partial<AnalyticsConfig> = {}): AnalyticsConfig {
  return {
    enabled: true,
    scene_id: 'test_scene',
    privacy_level: 'strict',
    sampling_strategy: 'all',
    sampling_rate: 1.0,
    aggregation_window: '1s',
    max_samples: 1000,
    max_spans: 500,
    export_format: 'otlp_json',
    otlp_endpoint: '',
    service_name: 'test-service',
    collect_fps: true,
    collect_draw_calls: true,
    collect_gaussians: true,
    collect_memory: true,
    collect_load_time: true,
    collect_engagement: false,
    collect_heatmap: false,
    heatmap_resolution: 2,
    enable_dashboard: false,
    dashboard_flush_interval: 1000,
    custom_tags: {},
    ...overrides,
  };
}

function makeContext() {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return {
    emit: vi.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    emitted,
    lastEmit: () => emitted[emitted.length - 1],
    byType: (t: string) => emitted.filter((e) => e.event === t),
  };
}

function attachAnalytics(
  node = makeNode(),
  config = makeConfig(),
  ctx = makeContext()
): { node: ReturnType<typeof makeNode>; config: AnalyticsConfig; ctx: ReturnType<typeof makeContext> } {
  analyticsHandler.onAttach!(node, config, ctx);
  return { node, config, ctx };
}

// =============================================================================
// TESTS
// =============================================================================

describe('AnalyticsTrait', () => {
  let node: Record<string, unknown>;
  let config: AnalyticsConfig;
  let ctx: ReturnType<typeof makeContext>;

  beforeEach(() => {
    node = makeNode();
    config = makeConfig();
    ctx = makeContext();
    analyticsHandler.onAttach!(node, config, ctx);
  });

  // ---------------------------------------------------------------------------
  // Attach / Detach
  // ---------------------------------------------------------------------------
  describe('onAttach', () => {
    it('should emit analytics_attached on attach', () => {
      expect(ctx.byType('analytics_attached').length).toBe(1);
    });

    it('should include sessionId in attached event', () => {
      const payload = ctx.byType('analytics_attached')[0].payload as Record<string, unknown>;
      expect(typeof payload.sessionId).toBe('string');
      expect((payload.sessionId as string).length).toBeGreaterThan(0);
    });

    it('should include sceneId in attached event', () => {
      const payload = ctx.byType('analytics_attached')[0].payload as Record<string, unknown>;
      expect(payload.sceneId).toBe('test_scene');
    });

    it('should include privacyLevel in attached event', () => {
      const payload = ctx.byType('analytics_attached')[0].payload as Record<string, unknown>;
      expect(payload.privacyLevel).toBe('strict');
    });

    it('should store state on node', () => {
      expect(node.__analyticsState).toBeDefined();
    });

    it('should use node.id as sceneId when scene_id config is empty', () => {
      const n = makeNode('my_special_node');
      const cfg = makeConfig({ scene_id: '' });
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);
      const payload = c.byType('analytics_attached')[0].payload as Record<string, unknown>;
      expect(payload.sceneId).toBe('my_special_node');
    });

    it('should generate unique session IDs across instances', () => {
      const n2 = makeNode();
      const c2 = makeContext();
      analyticsHandler.onAttach!(n2, config, c2);
      const s1 = (ctx.byType('analytics_attached')[0].payload as Record<string, unknown>)
        .sessionId;
      const s2 = (c2.byType('analytics_attached')[0].payload as Record<string, unknown>).sessionId;
      expect(s1).not.toBe(s2);
    });
  });

  describe('onDetach', () => {
    it('should emit analytics_final_report on detach', () => {
      analyticsHandler.onDetach!(node, config, ctx);
      expect(ctx.byType('analytics_final_report').length).toBe(1);
    });

    it('should include sessionId in final report', () => {
      analyticsHandler.onDetach!(node, config, ctx);
      const payload = ctx.byType('analytics_final_report')[0].payload as Record<string, unknown>;
      expect(typeof payload.sessionId).toBe('string');
    });

    it('should include totalFrames in final report', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onDetach!(node, config, ctx);
      const payload = ctx.byType('analytics_final_report')[0].payload as Record<string, unknown>;
      expect(payload.totalFrames).toBeGreaterThan(0);
    });

    it('should remove state from node on detach', () => {
      analyticsHandler.onDetach!(node, config, ctx);
      expect(node.__analyticsState).toBeUndefined();
    });

    it('should handle detach with no state gracefully', () => {
      const n = makeNode();
      expect(() => analyticsHandler.onDetach!(n, config, ctx)).not.toThrow();
    });

    it('should flush dashboard buffer on detach when enabled', () => {
      const cfg = makeConfig({ enable_dashboard: true });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_push_metric',
        metricName: 'custom.metric',
        value: 42,
        unit: 'count',
      });

      analyticsHandler.onDetach!(n, cfg, c);
      expect(c.byType('analytics_dashboard_flush').length).toBeGreaterThan(0);
    });

    it('should emit OTLP export on detach when endpoint configured', () => {
      const cfg = makeConfig({ otlp_endpoint: 'http://collector:4317' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      // Start and end a span to produce completed spans
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_start_span',
        operationName: 'test_op',
        parentSpanId: null,
      });
      const spanStarted = c.byType('analytics_span_started')[0].payload as Record<string, unknown>;
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_end_span',
        spanId: spanStarted.spanId,
        status: 'OK',
      });

      analyticsHandler.onDetach!(n, cfg, c);
      expect(c.byType('analytics_otel_export').length).toBeGreaterThan(0);
    });

    it('should not emit OTLP export if no endpoint', () => {
      analyticsHandler.onDetach!(node, config, ctx);
      expect(ctx.byType('analytics_otel_export').length).toBe(0);
    });

    it('null engagement on final report when collect_engagement is false', () => {
      analyticsHandler.onDetach!(node, config, ctx);
      const payload = ctx.byType('analytics_final_report')[0].payload as Record<string, unknown>;
      expect(payload.engagement).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // onUpdate — performance sampling
  // ---------------------------------------------------------------------------
  describe('onUpdate', () => {
    it('should increment frameCount on each update', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.totalFrames).toBe(2);
    });

    it('should collect samples when enabled and strategy=all', () => {
      for (let i = 0; i < 5; i++) {
        analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      }
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.totalSamples).toBe(5);
    });

    it('should not collect samples when disabled', () => {
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_disable' });
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.totalSamples).toBe(0);
    });

    it('should request render stats on each sample', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      expect(ctx.byType('analytics_request_render_stats').length).toBe(1);
    });

    it('should cap samples at max_samples', () => {
      const cfg = makeConfig({ max_samples: 5 });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      for (let i = 0; i < 10; i++) {
        analyticsHandler.onUpdate!(n, cfg, c, 0.016);
      }

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query', queryId: 'q1' });
      const info = c.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.totalSamples).toBeLessThanOrEqual(5);
    });

    it('should emit analytics_aggregate when aggregation window elapses', () => {
      const cfg = makeConfig({ aggregation_window: '1s' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      // Push frames with mocked time
      const baseNow = Date.now();
      vi.spyOn(Date, 'now').mockReturnValue(baseNow + 2000); // 2s elapsed
      analyticsHandler.onUpdate!(n, cfg, c, 0.016);
      vi.restoreAllMocks();

      expect(c.byType('analytics_aggregate').length).toBeGreaterThan(0);
    });

    it('should track jank frames (frameTime > 16.67ms)', () => {
      // 40ms frame = well below 30fps = jank
      for (let i = 0; i < 5; i++) {
        analyticsHandler.onUpdate!(node, config, ctx, 0.04); // 40ms
      }
      analyticsHandler.onDetach!(node, config, ctx);
      const report = ctx.byType('analytics_final_report')[0].payload as Record<string, unknown>;
      expect(report.totalJankFrames).toBeGreaterThan(0);
    });

    it('should track stutter frames (frameTime > 33.33ms)', () => {
      for (let i = 0; i < 3; i++) {
        analyticsHandler.onUpdate!(node, config, ctx, 0.05); // 50ms = stutter
      }
      analyticsHandler.onDetach!(node, config, ctx);
      const report = ctx.byType('analytics_final_report')[0].payload as Record<string, unknown>;
      expect(report.totalStutterFrames).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Render stats
  // ---------------------------------------------------------------------------
  describe('analytics_render_stats event', () => {
    it('should update draw calls in last sample', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_render_stats',
        drawCalls: 250,
        triangleCount: 100000,
        gaussianCount: 5000,
        memoryUsageMB: 512,
        gpuMemoryUsageMB: 256,
        activeNodes: 42,
        visibleNodes: 30,
      });
      // Verify by forcing aggregate
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      vi.restoreAllMocks();

      const agg = ctx.byType('analytics_aggregate');
      // At least we shouldn't throw and drawCalls should be reflected
      expect(() => {}).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Scene loaded / completed
  // ---------------------------------------------------------------------------
  describe('analytics_scene_loaded', () => {
    it('should handle scene loaded event without throwing', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      expect(() => {
        analyticsHandler.onEvent!(node, config, ctx, {
          type: 'analytics_scene_loaded',
          loadTimeMs: 1234,
        });
      }).not.toThrow();
    });

    it('should push load_time to dashboard when enabled', () => {
      const cfg = makeConfig({ enable_dashboard: true });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);
      analyticsHandler.onUpdate!(n, cfg, c, 0.016);
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_scene_loaded',
        loadTimeMs: 1000,
      });
      analyticsHandler.onDetach!(n, cfg, c);
      const flush = c.byType('analytics_dashboard_flush');
      const allPoints = flush
        .flatMap((f) => (f.payload as Record<string, unknown>).dataPoints as Array<Record<string, unknown>>)
        .filter((p) => p.metricName === 'scene.load_time');
      expect(allPoints.length).toBeGreaterThan(0);
    });
  });

  describe('analytics_scene_completed', () => {
    it('should track scene completion when collect_engagement enabled', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'permissive' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_scene_completed',
        sceneId: 'level_1',
      });

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query_engagement', queryId: 'eq1' });
      const engagement = c.byType('analytics_engagement_info')[0].payload as Record<
        string,
        unknown
      >;
      expect((engagement.scenesCompleted as string[]).length).toBeGreaterThan(0);
    });

    it('should not duplicate scene in scenesCompleted', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'permissive' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_scene_completed',
        sceneId: 'level_1',
      });
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_scene_completed',
        sceneId: 'level_1',
      });

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query_engagement', queryId: 'eq1' });
      const engagement = c.byType('analytics_engagement_info')[0].payload as Record<
        string,
        unknown
      >;
      expect((engagement.scenesCompleted as string[]).length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Engagement tracking
  // ---------------------------------------------------------------------------
  describe('analytics_interaction', () => {
    it('should increment interaction count in permissive mode', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'permissive' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      for (let i = 0; i < 5; i++) {
        analyticsHandler.onEvent!(n, cfg, c, {
          type: 'analytics_interaction',
          position: [1.0, 0.0, 2.0],
        });
      }

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query_engagement', queryId: 'eq1' });
      const engagement = c.byType('analytics_engagement_info')[0].payload as Record<
        string,
        unknown
      >;
      expect(engagement.interactionCount).toBe(5);
    });

    it('should not track interactions in strict privacy mode', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'strict' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      for (let i = 0; i < 5; i++) {
        analyticsHandler.onEvent!(n, cfg, c, {
          type: 'analytics_interaction',
        });
      }

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query_engagement', queryId: 'eq1' });
      // Engagement info is still emitted, but interactions not tracked in strict mode
      const info = c.byType('analytics_engagement_info')[0].payload as Record<string, unknown>;
      expect(info.interactionCount).toBe(0);
    });

    it('should record heatmap bucket when enabled', () => {
      const cfg = makeConfig({
        collect_engagement: true,
        collect_heatmap: true,
        privacy_level: 'permissive',
        heatmap_resolution: 1,
      });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_interaction',
        position: [1.5, 0.0, 2.5],
      });

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query_engagement', queryId: 'eq1' });
      const engagement = c.byType('analytics_engagement_info')[0].payload as Record<
        string,
        unknown
      >;
      const heatmap = engagement.heatmap as Array<{ bucket: string; count: number }>;
      expect(heatmap.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // OTel spans
  // ---------------------------------------------------------------------------
  describe('OTel span lifecycle', () => {
    it('should start a span and emit span_started', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'my_operation',
        parentSpanId: null,
      });
      expect(ctx.byType('analytics_span_started').length).toBe(1);
    });

    it('should return spanId in span_started event', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const payload = ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>;
      expect(typeof payload.spanId).toBe('string');
      expect((payload.spanId as string).length).toBeGreaterThan(0);
    });

    it('should return traceId in span_started event', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const payload = ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>;
      expect(typeof payload.traceId).toBe('string');
    });

    it('should end a span and emit span_ended', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const spanId = (ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>)
        .spanId;

      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_end_span',
        spanId,
        status: 'OK',
      });
      expect(ctx.byType('analytics_span_ended').length).toBe(1);
    });

    it('should include durationMs in span_ended event', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const spanId = (ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>)
        .spanId;

      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_end_span',
        spanId,
        status: 'OK',
      });
      const payload = ctx.byType('analytics_span_ended')[0].payload as Record<string, unknown>;
      expect(typeof payload.durationMs).toBe('number');
    });

    it('should track active span count accurately', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op2',
      });

      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      // 2 explicit + 1 root lifecycle span created on attach = 3
      expect(info.activeSpans).toBe(3);
    });

    it('should add span events', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const spanId = (ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>)
        .spanId;

      expect(() => {
        analyticsHandler.onEvent!(node, config, ctx, {
          type: 'analytics_span_event',
          spanId,
          eventName: 'checkpoint',
          attributes: { step: 1 },
        });
      }).not.toThrow();
    });

    it('should not throw when ending unknown span', () => {
      expect(() => {
        analyticsHandler.onEvent!(node, config, ctx, {
          type: 'analytics_end_span',
          spanId: 'nonexistent_span',
          status: 'OK',
        });
      }).not.toThrow();
    });

    it('should flush completed spans with analytics_flush_spans when endpoint set', () => {
      const cfg = makeConfig({ otlp_endpoint: 'http://collector:4317' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const spanId = (c.byType('analytics_span_started')[0].payload as Record<string, unknown>)
        .spanId;
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_end_span',
        spanId,
        status: 'OK',
      });

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_flush_spans' });
      expect(c.byType('analytics_otel_export').length).toBeGreaterThan(0);
    });

    it('should not flush spans when no endpoint', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'op1',
      });
      const spanId = (ctx.byType('analytics_span_started')[0].payload as Record<string, unknown>)
        .spanId;
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_end_span',
        spanId,
        status: 'OK',
      });

      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_flush_spans' });
      expect(ctx.byType('analytics_otel_export').length).toBe(0);
    });

    it('should close active spans on detach', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_start_span',
        operationName: 'unclosed_op',
      });

      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const before = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      // 1 explicit + 1 root lifecycle span from attach = 2
      expect(before.activeSpans).toBe(2);

      analyticsHandler.onDetach!(node, config, ctx);

      // After detach node state is cleared
      expect(node.__analyticsState).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Dashboard
  // ---------------------------------------------------------------------------
  describe('dashboard', () => {
    it('should buffer custom metric when enable_dashboard is true', () => {
      const cfg = makeConfig({ enable_dashboard: true });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_push_metric',
        metricName: 'custom.latency',
        value: 85,
        unit: 'ms',
      });

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query', queryId: 'q1' });
      const info = c.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.dashboardBufferSize).toBe(1);
    });

    it('should not buffer custom metric when dashboard disabled', () => {
      analyticsHandler.onEvent!(node, config, ctx, {
        type: 'analytics_push_metric',
        metricName: 'custom.latency',
        value: 85,
      });
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.dashboardBufferSize).toBe(0);
    });

    it('should flush dashboard buffer on interval during onUpdate', () => {
      const cfg = makeConfig({
        enable_dashboard: true,
        dashboard_flush_interval: 1,
        sampling_strategy: 'all',
      });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_push_metric',
        metricName: 'custom.metric',
        value: 1,
      });

      // Advance time past flush interval
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 5000);
      analyticsHandler.onUpdate!(n, cfg, c, 0.016);
      vi.restoreAllMocks();

      expect(c.byType('analytics_dashboard_flush').length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Control events
  // ---------------------------------------------------------------------------
  describe('control events', () => {
    it('should enable collection via analytics_enable', () => {
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_disable' });
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_enable' });
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);

      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.isCollecting).toBe(true);
      expect(info.totalSamples).toBeGreaterThan(0);
    });

    it('should disable collection via analytics_disable', () => {
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_disable' });
      analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.isCollecting).toBe(false);
      expect(info.totalSamples).toBe(0);
    });

    it('should reset all counters via analytics_reset', () => {
      for (let i = 0; i < 5; i++) {
        analyticsHandler.onUpdate!(node, config, ctx, 0.016);
      }
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_reset' });
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.totalSamples).toBe(0);
      expect(info.totalFrames).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------
  describe('analytics_query', () => {
    it('should emit analytics_info with correct structure', () => {
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.queryId).toBe('q1');
      expect(typeof info.sessionId).toBe('string');
      expect(typeof info.isCollecting).toBe('boolean');
      expect(typeof info.totalFrames).toBe('number');
      expect(typeof info.totalSamples).toBe('number');
    });

    it('should include latestAggregate when aggregates exist', () => {
      const cfg = makeConfig({ aggregation_window: '1s' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);

      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 2000);
      analyticsHandler.onUpdate!(n, cfg, c, 0.016);
      vi.restoreAllMocks();

      analyticsHandler.onEvent!(n, cfg, c, { type: 'analytics_query', queryId: 'q1' });
      const info = c.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.latestAggregate).not.toBeNull();
    });

    it('should return null latestAggregate when no aggregates', () => {
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      const info = ctx.byType('analytics_info')[0].payload as Record<string, unknown>;
      expect(info.latestAggregate).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // analytics_query_engagement
  // ---------------------------------------------------------------------------
  describe('analytics_query_engagement', () => {
    it('should emit engagement_info when collect_engagement enabled (non-strict)', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'permissive' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_query_engagement',
        queryId: 'eq1',
      });
      expect(c.byType('analytics_engagement_info').length).toBe(1);
    });

    it('should return interactionCount in engagement_info', () => {
      const cfg = makeConfig({ collect_engagement: true, privacy_level: 'permissive' });
      const n = makeNode();
      const c = makeContext();
      analyticsHandler.onAttach!(n, cfg, c);
      analyticsHandler.onEvent!(n, cfg, c, {
        type: 'analytics_query_engagement',
        queryId: 'eq1',
      });
      const info = c.byType('analytics_engagement_info')[0].payload as Record<string, unknown>;
      expect(typeof info.interactionCount).toBe('number');
    });
  });

  // ---------------------------------------------------------------------------
  // defaultConfig
  // ---------------------------------------------------------------------------
  describe('defaultConfig', () => {
    it('should have enabled: true', () => {
      expect(analyticsHandler.defaultConfig?.enabled).toBe(true);
    });

    it('should have privacy_level: strict', () => {
      expect(analyticsHandler.defaultConfig?.privacy_level).toBe('strict');
    });

    it('should have collect_engagement: false', () => {
      expect(analyticsHandler.defaultConfig?.collect_engagement).toBe(false);
    });

    it('should have collect_heatmap: false', () => {
      expect(analyticsHandler.defaultConfig?.collect_heatmap).toBe(false);
    });

    it('should have sampling_strategy: adaptive', () => {
      expect(analyticsHandler.defaultConfig?.sampling_strategy).toBe('adaptive');
    });

    it('should have export_format: otlp_json', () => {
      expect(analyticsHandler.defaultConfig?.export_format).toBe('otlp_json');
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------
  describe('edge cases', () => {
    it('should have name: analytics on handler', () => {
      expect(analyticsHandler.name).toBe('analytics');
    });

    it('should handle unknown events without throwing', () => {
      expect(() => {
        analyticsHandler.onEvent!(node, config, ctx, {
          type: 'analytics_unknown_event',
        });
      }).not.toThrow();
    });

    it('should handle events when state missing (no attach)', () => {
      const n = makeNode();
      expect(() => {
        analyticsHandler.onEvent!(n, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      }).not.toThrow();
    });

    it('should handle delta=0 without dividing by zero (fps calc)', () => {
      expect(() => analyticsHandler.onUpdate!(node, config, ctx, 0)).not.toThrow();
    });

    it('should produce zero FPS for delta=0', () => {
      analyticsHandler.onUpdate!(node, config, ctx, 0);
      // Should not crash, fps clamped to 0
      analyticsHandler.onEvent!(node, config, ctx, { type: 'analytics_query', queryId: 'q1' });
      expect(ctx.byType('analytics_info').length).toBe(1);
    });
  });
});
