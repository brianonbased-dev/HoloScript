/**
 * v5.6 "Observable Platform" — End-to-end showcase test
 *
 * Tests the full observability stack:
 * 1. Observable agent pipeline composition parses and validates
 * 2. OTLPExporter batch export with mock endpoint
 * 3. TraceContextPropagator inject/extract round trip
 * 4. PrometheusMetrics linked to TelemetryCollector
 * 5. StructuredLogger with trace correlation
 * 6. MCP observability tools (query_traces, get_agent_health, get_metrics_prometheus)
 * 7. Health check endpoint builder
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  getDefaultRegistry,
  resetDefaultRegistry,
  getTelemetryCollector,
  resetTelemetryCollector,
  OTLPExporter,
  TraceContextPropagator,
  PrometheusMetricsRegistry,
  resetPrometheusMetrics,
  StructuredLogger,
  JsonArraySink,
} from '@holoscript/core';
import { handleObservabilityTool } from '../observability-tools';
import { buildHealthStatus } from '../health-check';

// =============================================================================
// FIXTURES
// =============================================================================

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/agents');

function registerObservableAgents() {
  const registry = getDefaultRegistry();

  registry.register({
    id: 'sensor-agent-01',
    name: 'SensorAgent',
    version: '1.0.0',
    capabilities: [{ type: 'analyze', domain: 'iot', name: 'collect' }],
    endpoints: [{ protocol: 'local', address: 'local://sensor-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'online',
    tags: ['sensor', 'iot', 'observable'],
  });

  registry.register({
    id: 'analytics-agent-01',
    name: 'AnalyticsAgent',
    version: '1.0.0',
    capabilities: [{ type: 'transform', domain: 'iot', name: 'aggregate' }],
    endpoints: [{ protocol: 'local', address: 'local://analytics-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'online',
    tags: ['analytics', 'observable'],
  });

  registry.register({
    id: 'dashboard-agent-01',
    name: 'DashboardAgent',
    version: '1.0.0',
    capabilities: [{ type: 'render', domain: 'spatial', name: 'dashboard' }],
    endpoints: [{ protocol: 'local', address: 'local://dashboard-agent-01', primary: true }],
    trustLevel: 'local',
    status: 'offline',
    tags: ['visualization', 'observable'],
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('v5.6 Showcase — Observable Platform', () => {
  beforeEach(() => {
    resetDefaultRegistry();
    resetTelemetryCollector();
    resetPrometheusMetrics();
  });

  afterEach(() => {
    resetDefaultRegistry();
    resetTelemetryCollector();
    resetPrometheusMetrics();
  });

  // ===========================================================================
  // 1. OBSERVABLE PIPELINE COMPOSITION
  // ===========================================================================

  describe('observable-agent-pipeline.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'observable-agent-pipeline.holo'), 'utf-8');

    it('is a valid observable composition', () => {
      expect(code.length).toBeGreaterThan(200);
      expect(code).toContain('@world');
      expect(code).toContain('Observable IoT Pipeline');
    });

    it('defines three observable agents', () => {
      expect(code).toContain('agent "SensorAgent"');
      expect(code).toContain('agent "AnalyticsAgent"');
      expect(code).toContain('agent "DashboardAgent"');
      expect(code).toContain('@observable');
    });

    it('includes observability configuration blocks', () => {
      expect(code).toContain('observability {');
      expect(code).toContain('tracing: true');
      expect(code).toContain('metrics: true');
      expect(code).toContain('otlp_endpoint:');
    });

    it('defines an observable workflow', () => {
      expect(code).toContain('workflow "ObservableSensorPipeline"');
      expect(code).toContain('depends_on:');
      expect(code).toContain('ref:');
    });
  });

  // ===========================================================================
  // 2. OTLP EXPORTER E2E
  // ===========================================================================

  describe('OTLPExporter E2E', () => {
    it('exports spans to mock OTLP endpoint', async () => {
      const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

      const collector = getTelemetryCollector({ enabled: true, flushInterval: 0 });
      const exporter = new OTLPExporter({
        endpoint: 'http://localhost:4318/v1/traces',
        compression: false,
        fetchFn: mockFetch,
      });

      // Create spans
      const span1 = collector.startSpan('collect-sensors', {
        agentId: 'sensor-agent-01',
        kind: 'server',
      });
      collector.addSpanEvent(span1.id, 'reading_received', { device: 'temp-01' });
      collector.endSpan(span1.id, 'ok');

      const span2 = collector.startSpan('aggregate-data', {
        agentId: 'analytics-agent-01',
        kind: 'internal',
        parentContext: span1.context,
      });
      collector.endSpan(span2.id, 'ok');

      // Export
      const otelSpans = collector.exportToOTel();
      expect(otelSpans.length).toBeGreaterThanOrEqual(2);

      const result = await exporter.exportBatch(otelSpans);
      expect(result.success).toBe(true);
      expect(result.spanCount).toBeGreaterThanOrEqual(2);

      // Verify payload structure
      const payload = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(payload.resourceSpans[0].resource.attributes).toBeDefined();
      expect(payload.resourceSpans[0].scopeSpans[0].spans.length).toBeGreaterThanOrEqual(2);

      collector.destroy();
    });
  });

  // ===========================================================================
  // 3. TRACE CONTEXT PROPAGATION E2E
  // ===========================================================================

  describe('TraceContextPropagator E2E', () => {
    it('propagates trace context across simulated agent delegation', () => {
      const propagator = new TraceContextPropagator();
      const collector = getTelemetryCollector({ enabled: true, flushInterval: 0 });

      // Agent A starts a span
      const agentASpan = collector.startSpan('process-request', {
        agentId: 'sensor-agent-01',
        kind: 'server',
      });

      // Inject into outgoing headers (simulating delegation to Agent B)
      const headers = propagator.inject(agentASpan.context);
      expect(headers.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/);

      // Agent B extracts the context
      const extractedContext = propagator.extract(headers);
      expect(extractedContext).not.toBeNull();
      expect(extractedContext!.traceId).toBe(agentASpan.context.traceId);

      // Agent B creates a child span
      const agentBSpan = collector.startSpan('aggregate-readings', {
        agentId: 'analytics-agent-01',
        parentContext: extractedContext!,
        kind: 'server',
      });

      // Both spans share the same traceId
      expect(agentBSpan.context.traceId).toBe(agentASpan.context.traceId);
      expect(agentBSpan.context.parentSpanId).toBe(agentASpan.context.spanId);

      collector.endSpan(agentBSpan.id, 'ok');
      collector.endSpan(agentASpan.id, 'ok');

      // Verify trace continuity
      const traceSpans = collector.getTraceSpans(agentASpan.context.traceId);
      expect(traceSpans).toHaveLength(2);

      collector.destroy();
    });
  });

  // ===========================================================================
  // 4. PROMETHEUS METRICS + TELEMETRY INTEGRATION
  // ===========================================================================

  describe('Prometheus Metrics E2E', () => {
    it('auto-records metrics from agent operations', () => {
      const collector = getTelemetryCollector({ enabled: true, flushInterval: 0 });
      const metrics = new PrometheusMetricsRegistry('holoscript');
      metrics.linkTelemetry(collector);

      // Simulate agent operations
      const span = collector.startSpan('delegation', { agentId: 'sensor-01' });
      collector.endSpan(span.id, 'ok');

      collector.record({
        type: 'task_completed',
        severity: 'info',
        agentId: 'sensor-01',
        data: {},
      });

      // Verify metrics
      expect(metrics.getValue('spans_total')).toBe(1);
      expect(metrics.getValue('delegation_total', { status: 'completed' })).toBe(1);

      // Verify Prometheus text output
      const text = metrics.toPrometheusText();
      expect(text).toContain('# TYPE holoscript_spans_total counter');
      expect(text).toContain('holoscript_spans_total 1');
      expect(text).toContain('holoscript_delegation_total{status="completed"} 1');

      collector.destroy();
    });
  });

  // ===========================================================================
  // 5. STRUCTURED LOGGER + TRACE CORRELATION
  // ===========================================================================

  describe('StructuredLogger E2E', () => {
    it('correlates logs with trace spans', () => {
      const collector = getTelemetryCollector({ enabled: true, flushInterval: 0 });
      const sink = new JsonArraySink();
      const logger = new StructuredLogger({
        serviceName: 'holoscript-mcp',
        minLevel: 'debug',
        sinkType: 'custom',
        customSink: sink,
      });

      // Start a traced operation
      const span = collector.startSpan('handle-request', {
        agentId: 'sensor-01',
        kind: 'server',
      });

      // Set trace context on logger
      logger.setTraceContext(span.context);
      logger.info('Processing sensor data', { device: 'temp-01' });
      logger.debug('Raw reading received', { value: 22.5 });

      // Complete the span
      collector.endSpan(span.id, 'ok');
      logger.setTraceContext(null);

      // Verify log entries have trace correlation
      const entries = sink.getEntries();
      expect(entries).toHaveLength(2);
      expect(entries[0].traceId).toBe(span.context.traceId);
      expect(entries[0].spanId).toBe(span.context.spanId);
      expect(entries[0].service).toBe('holoscript-mcp');
      expect(entries[0].attributes.device).toBe('temp-01');

      collector.destroy();
    });
  });

  // ===========================================================================
  // 6. MCP OBSERVABILITY TOOLS
  // ===========================================================================

  describe('MCP observability tools', () => {
    it('query_traces returns spans with stats', async () => {
      const collector = getTelemetryCollector({ enabled: true, flushInterval: 0 });

      // Create a span
      const span = collector.startSpan('test-trace', { agentId: 'agent-1' });
      collector.endSpan(span.id, 'ok');

      const result = (await handleObservabilityTool('query_traces', {})) as {
        spans: unknown[];
        totalSpans: number;
        stats: { totalSpans: number };
      };

      expect(result.totalSpans).toBeGreaterThanOrEqual(1);
      expect(result.stats.totalSpans).toBeGreaterThanOrEqual(1);

      collector.destroy();
    });

    it('get_agent_health returns registry and telemetry status', async () => {
      registerObservableAgents();

      const result = (await handleObservabilityTool('get_agent_health', {})) as {
        registrySize: number;
        agents: Array<{ id: string; status: string }>;
        statusBreakdown: Record<string, number>;
        telemetry: { totalSpans: number };
      };

      expect(result.registrySize).toBe(3);
      expect(result.agents).toHaveLength(3);
      // AgentRegistry.register() always sets status to 'online' on registration
      expect(result.statusBreakdown.online).toBe(3);
    });

    it('get_metrics_prometheus returns Prometheus text', async () => {
      // Register some metrics first
      const metrics = new PrometheusMetricsRegistry('holoscript');
      metrics.registerCounter('test_counter', 'A test counter');
      metrics.incCounter('test_counter', {}, 42);

      const result = (await handleObservabilityTool('get_metrics_prometheus', {})) as {
        format: string;
        metricCount: number;
        text: string;
      };

      expect(result.format).toBe('prometheus');
      expect(result.metricCount).toBeGreaterThanOrEqual(0);
      expect(typeof result.text).toBe('string');
    });

    it('export_traces_otlp handles empty trace set', async () => {
      const result = (await handleObservabilityTool('export_traces_otlp', {
        endpoint: 'http://localhost:4318/v1/traces',
      })) as { success: boolean; spanCount: number };

      expect(result.success).toBe(true);
      expect(result.spanCount).toBe(0);
    });
  });

  // ===========================================================================
  // 7. HEALTH CHECK BUILDER
  // ===========================================================================

  describe('Health check endpoint', () => {
    it('builds comprehensive health status', () => {
      registerObservableAgents();

      // Keep this test stable as MCP tools evolve over time.
      // We only validate that buildHealthStatus reflects the provided count.
      const currentToolCount = 103;
      const health = buildHealthStatus(currentToolCount, '5.6.0');

      expect(health.status).toBe('healthy');
      expect(health.version).toBe('5.6.0');
      expect(health.uptime).toBeGreaterThan(0);
      expect(health.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(health.checks.registry.agentCount).toBe(3);
      expect(health.checks.telemetry.status).toBe('ok');
      expect(health.checks.tools.toolCount).toBe(currentToolCount);
      expect(health.checks.tools.status).toBe('ok');
    });
  });
});
