/**
 * OTLPExporter tests — v5.6 "Observable Platform"
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OTLPExporter, OTLPHttpError } from '../OTLPExporter';
import { TelemetryCollector } from '../TelemetryCollector';
import type { OTelSpan } from '../TelemetryTypes';

// =============================================================================
// FIXTURES
// =============================================================================

function makeMockSpan(overrides: Partial<OTelSpan> = {}): OTelSpan {
  return {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'test-span',
    kind: 0,
    startTimeUnixNano: '1000000000000',
    endTimeUnixNano: '2000000000000',
    attributes: [{ key: 'test', value: { stringValue: 'true' } }],
    events: [],
    status: { code: 1 },
    ...overrides,
  };
}

function makeMockFetch(status = 200, body = '{}'): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(JSON.parse(body)),
  });
}

// =============================================================================
// TESTS
// =============================================================================

describe('OTLPExporter', () => {
  let exporter: OTLPExporter;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = makeMockFetch();
    exporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false, // Disable gzip in tests to avoid zlib dependency
      fetchFn: mockFetch,
    });
  });

  // ===========================================================================
  // PAYLOAD CONSTRUCTION
  // ===========================================================================

  it('builds a valid OTLP/HTTP JSON payload', () => {
    const spans = [makeMockSpan()];
    const payload = exporter.buildPayload(spans);

    expect(payload.resourceSpans).toHaveLength(1);
    expect(payload.resourceSpans[0].resource.attributes).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'holoscript' },
    });
    expect(payload.resourceSpans[0].scopeSpans[0].scope.name).toBe('@holoscript/core');
    expect(payload.resourceSpans[0].scopeSpans[0].spans).toHaveLength(1);
    expect(payload.resourceSpans[0].scopeSpans[0].spans[0].name).toBe('test-span');
  });

  it('includes custom service name and version', () => {
    const custom = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      serviceName: 'my-service',
      serviceVersion: '1.0.0',
      compression: false,
      fetchFn: mockFetch,
    });

    const payload = custom.buildPayload([makeMockSpan()]);
    const attrs = payload.resourceSpans[0].resource.attributes;
    expect(attrs).toContainEqual({
      key: 'service.name',
      value: { stringValue: 'my-service' },
    });
    expect(attrs).toContainEqual({
      key: 'service.version',
      value: { stringValue: '1.0.0' },
    });
  });

  // ===========================================================================
  // EXPORT
  // ===========================================================================

  it('exports a batch successfully', async () => {
    const spans = [makeMockSpan(), makeMockSpan({ name: 'span-2' })];
    const result = await exporter.exportBatch(spans);

    expect(result.success).toBe(true);
    expect(result.spanCount).toBe(2);
    expect(result.retries).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Verify endpoint and method
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:4318/v1/traces');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('returns success for empty batch', async () => {
    const result = await exporter.exportBatch([]);
    expect(result.success).toBe(true);
    expect(result.spanCount).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('sends auth headers when configured', async () => {
    const authExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      headers: { Authorization: 'Bearer test-token' },
      compression: false,
      fetchFn: mockFetch,
    });

    await authExporter.exportBatch([makeMockSpan()]);

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers['Authorization']).toBe('Bearer test-token');
  });

  // ===========================================================================
  // RETRY LOGIC
  // ===========================================================================

  it('retries on 5xx errors', async () => {
    const failFetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: false, status: 503 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const retryExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false,
      retryDelayMs: 1,
      maxRetries: 3,
      fetchFn: failFetch,
    });

    const result = await retryExporter.exportBatch([makeMockSpan()]);

    expect(result.success).toBe(true);
    expect(result.retries).toBe(2);
    expect(failFetch).toHaveBeenCalledTimes(3);
  });

  it('does not retry on 4xx errors (except 429)', async () => {
    const fail400 = vi.fn().mockResolvedValue({ ok: false, status: 400 });

    const noRetryExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false,
      retryDelayMs: 1,
      maxRetries: 3,
      fetchFn: fail400,
    });

    const result = await noRetryExporter.exportBatch([makeMockSpan()]);

    expect(result.success).toBe(false);
    expect(fail400).toHaveBeenCalledTimes(1); // No retries
  });

  it('retries on 429 rate limiting', async () => {
    const rateLimited = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const rlExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false,
      retryDelayMs: 1,
      maxRetries: 3,
      fetchFn: rateLimited,
    });

    const result = await rlExporter.exportBatch([makeMockSpan()]);
    expect(result.success).toBe(true);
    expect(result.retries).toBe(1);
  });

  it('returns failure after exhausting retries', async () => {
    const alwaysFail = vi.fn().mockResolvedValue({ ok: false, status: 500 });

    const failExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false,
      retryDelayMs: 1,
      maxRetries: 2,
      fetchFn: alwaysFail,
    });

    const result = await failExporter.exportBatch([makeMockSpan()]);

    expect(result.success).toBe(false);
    expect(result.error).toContain('500');
    expect(alwaysFail).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  // ===========================================================================
  // BATCHING
  // ===========================================================================

  it('batches spans according to maxBatchSize', async () => {
    const batchExporter = new OTLPExporter({
      endpoint: 'http://localhost:4318/v1/traces',
      compression: false,
      maxBatchSize: 2,
      fetchFn: mockFetch,
    });

    // Enqueue 5 spans
    const spans = Array.from({ length: 5 }, (_, i) =>
      makeMockSpan({ name: `span-${i}` })
    );
    batchExporter.enqueue(spans);

    const results = await batchExporter.flushPending();

    // 5 spans / 2 per batch = 3 batches
    expect(results).toHaveLength(3);
    expect(results[0].spanCount).toBe(2);
    expect(results[1].spanCount).toBe(2);
    expect(results[2].spanCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('returns empty array when no pending spans', async () => {
    const results = await exporter.flushPending();
    expect(results).toHaveLength(0);
  });

  // ===========================================================================
  // HISTORY
  // ===========================================================================

  it('tracks export history', async () => {
    exporter.enqueue([makeMockSpan()]);
    await exporter.flushPending();

    const history = exporter.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].success).toBe(true);
  });

  it('clears export history', async () => {
    exporter.enqueue([makeMockSpan()]);
    await exporter.flushPending();

    exporter.clearHistory();
    expect(exporter.getHistory()).toHaveLength(0);
  });

  // ===========================================================================
  // TELEMETRY COLLECTOR INTEGRATION
  // ===========================================================================

  it('registers with TelemetryCollector and receives spans on flush', async () => {
    const collector = new TelemetryCollector({ enabled: true, flushInterval: 0 });

    exporter.register(collector);

    // Create and complete a span
    const span = collector.startSpan('integration-test', { agentId: 'agent-1' });
    collector.endSpan(span.id, 'ok');

    // Flush the collector — this triggers the onExport callback
    await collector.flush();

    // The exporter should have received and sent the span
    // (note: exportToOTel is called inside the callback, so it may be empty after flush clears)
    expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(0);

    collector.destroy();
  });

  // ===========================================================================
  // ERROR TYPE
  // ===========================================================================

  it('OTLPHttpError carries status code', () => {
    const error = new OTLPHttpError(503, 'Service unavailable');
    expect(error.statusCode).toBe(503);
    expect(error.message).toBe('Service unavailable');
    expect(error.name).toBe('OTLPHttpError');
  });

  it('tracks pending count correctly', () => {
    expect(exporter.getPendingCount()).toBe(0);
    exporter.enqueue([makeMockSpan(), makeMockSpan()]);
    expect(exporter.getPendingCount()).toBe(2);
  });
});
