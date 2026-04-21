import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  recordToolRequest,
  recordToolCacheHit,
  getPerToolPrometheusText,
  generateCorrelationId,
  emitMcpStructuredLog,
  setMcpLogSink,
  __testOnly_resetPerToolMetrics,
} from '../telemetry/mcp-tool-metrics';
import type { McpStructuredLog } from '../telemetry/mcp-tool-metrics';

beforeEach(() => {
  __testOnly_resetPerToolMetrics();
});

describe('per-tool Prometheus metrics', () => {
  it('increments requests counter on recordToolRequest', () => {
    recordToolRequest('parse_hs', 10, false);
    recordToolRequest('parse_hs', 20, false);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total{tool_name="parse_hs"} 2');
  });

  it('increments error counter only when error=true', () => {
    recordToolRequest('validate_holoscript', 5, false);
    recordToolRequest('validate_holoscript', 8, true);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total{tool_name="validate_holoscript"} 2');
    expect(text).toContain('mcp_tool_errors_total{tool_name="validate_holoscript"} 1');
  });

  it('accumulates latency sum and count', () => {
    recordToolRequest('compile_webgpu', 30, false);
    recordToolRequest('compile_webgpu', 70, false);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_latency_ms_sum{tool_name="compile_webgpu"} 100');
    expect(text).toContain('mcp_tool_latency_ms_count{tool_name="compile_webgpu"} 2');
  });

  it('increments cache hit counter', () => {
    recordToolRequest('generate_scene', 2, false);
    recordToolCacheHit('generate_scene');
    recordToolCacheHit('generate_scene');
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_cache_hits_total{tool_name="generate_scene"} 2');
  });

  it('tracks two different tools independently', () => {
    recordToolRequest('parse_hs', 5, false);
    recordToolRequest('parse_hs', 5, true);
    recordToolRequest('compile_unity', 100, false);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total{tool_name="parse_hs"} 2');
    expect(text).toContain('mcp_tool_errors_total{tool_name="parse_hs"} 1');
    expect(text).toContain('mcp_tool_requests_total{tool_name="compile_unity"} 1');
    expect(text).toContain('mcp_tool_errors_total{tool_name="compile_unity"} 0');
  });

  it('returns empty string before any tool is called', () => {
    expect(getPerToolPrometheusText()).toBe('');
  });

  it('prometheus text includes all five metric families', () => {
    recordToolRequest('parse_hs', 15, false);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total');
    expect(text).toContain('mcp_tool_errors_total');
    expect(text).toContain('mcp_tool_latency_ms_sum');
    expect(text).toContain('mcp_tool_latency_ms_count');
    expect(text).toContain('mcp_tool_cache_hits_total');
  });

  it('escapes double-quotes in tool_name label', () => {
    recordToolRequest('tool"weird', 1, false);
    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total{tool_name="tool\\"weird"}');
  });
});

describe('correlation ID generation', () => {
  it('returns a UUID-shaped string', () => {
    const id = generateCorrelationId();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('returns unique IDs on successive calls', () => {
    const ids = new Set(Array.from({ length: 20 }, () => generateCorrelationId()));
    expect(ids.size).toBe(20);
  });
});

describe('structured JSON logging', () => {
  it('calls custom sink with correct tool_start fields', () => {
    const logs: McpStructuredLog[] = [];
    setMcpLogSink((e) => logs.push(e));
    emitMcpStructuredLog({
      timestamp: '2025-01-01T00:00:00.000Z',
      correlation_id: 'corr-1',
      event: 'tool_start',
      tool_name: 'parse_hs',
      tier: 'pro',
      agent_id: 'agent_test',
    });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      event: 'tool_start',
      tool_name: 'parse_hs',
      tier: 'pro',
      agent_id: 'agent_test',
      correlation_id: 'corr-1',
    });
  });

  it('calls custom sink with tool_end fields including latency and error', () => {
    const logs: McpStructuredLog[] = [];
    setMcpLogSink((e) => logs.push(e));
    emitMcpStructuredLog({
      timestamp: new Date().toISOString(),
      correlation_id: 'corr-2',
      event: 'tool_end',
      tool_name: 'validate_holoscript',
      latency_ms: 42,
      error: false,
    });
    expect(logs[0]).toMatchObject({ event: 'tool_end', latency_ms: 42, error: false });
  });

  it('falls back to stdout when no sink is set', () => {
    const written: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk: unknown) => {
      written.push(String(chunk));
      return true;
    };
    try {
      emitMcpStructuredLog({
        timestamp: new Date().toISOString(),
        correlation_id: 'corr-3',
        event: 'tool_end',
        tool_name: 'generate_object',
      });
    } finally {
      process.stdout.write = origWrite;
    }
    expect(written).toHaveLength(1);
    const parsed: McpStructuredLog = JSON.parse(written[0]!);
    expect(parsed.correlation_id).toBe('corr-3');
    expect(parsed.event).toBe('tool_end');
  });
});

describe('withMcpToolExecutionSpan metrics integration', () => {
  it(
    'records per-tool request and emits start+end logs',
    async () => {
    const { withMcpToolExecutionSpan, resetMcpOtelRegistrationFlagForTests } = await import(
      '../telemetry/mcp-tool-tracing'
    );
    const logs: McpStructuredLog[] = [];
    setMcpLogSink((e) => logs.push(e));
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    resetMcpOtelRegistrationFlagForTests();

    const auth = { active: true, scopes: [], agentId: 'agent_test' } as Parameters<
      typeof withMcpToolExecutionSpan
    >[1];

    await withMcpToolExecutionSpan('parse_hs', auth, async () => ({
      isError: false,
      result: { ok: true },
    }));

    const text = getPerToolPrometheusText();
    expect(text).toContain('mcp_tool_requests_total{tool_name="parse_hs"} 1');
    expect(text).toContain('mcp_tool_errors_total{tool_name="parse_hs"} 0');

    const startLog = logs.find((l) => l.event === 'tool_start' && l.tool_name === 'parse_hs');
    const endLog = logs.find((l) => l.event === 'tool_end' && l.tool_name === 'parse_hs');
    expect(startLog).toBeDefined();
    expect(endLog).toBeDefined();
    expect(startLog?.correlation_id).toBe(endLog?.correlation_id);
    expect(endLog?.latency_ms).toBeGreaterThanOrEqual(0);
    expect(endLog?.error).toBe(false);
    },
    20_000,
  );
});
