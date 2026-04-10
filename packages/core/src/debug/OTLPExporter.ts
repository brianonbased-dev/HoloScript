/**
 * @holoscript/core - OTLP/HTTP Trace Exporter
 *
 * Exports telemetry spans to an OTLP/HTTP endpoint in JSON format.
 * Supports batch flushing, gzip compression, retry with exponential backoff,
 * and configurable auth headers.
 *
 * Part of HoloScript v5.6 "Observable Platform".
 */

import { getTelemetryCollector, TelemetryCollector } from './TelemetryCollector';
import type { OTelSpan, TelemetryEvent, TraceSpan } from './TelemetryTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface OTLPExporterConfig {
  /** OTLP/HTTP endpoint URL (e.g. http://localhost:4318/v1/traces) */
  endpoint: string;
  /** Additional headers (e.g. Authorization) */
  headers?: Record<string, string>;
  /** Enable gzip compression (default true) */
  compression?: boolean;
  /** Max spans per batch (default 512) */
  maxBatchSize?: number;
  /** Max retry attempts on failure (default 3) */
  maxRetries?: number;
  /** Base retry delay in ms (default 1000) */
  retryDelayMs?: number;
  /** Export timeout in ms (default 10_000) */
  timeoutMs?: number;
  /** Service name for resource attributes */
  serviceName?: string;
  /** Service version */
  serviceVersion?: string;
  /** Custom fetch function (for testing) */
  fetchFn?: (url: string, init?: RequestInit) => Promise<Response>;
}

export interface OTLPExportResult {
  /** Whether the export succeeded */
  success: boolean;
  /** Number of spans exported */
  spanCount: number;
  /** Number of retry attempts */
  retries: number;
  /** Error message if failed */
  error?: string;
  /** Duration of export in ms */
  durationMs: number;
}

interface OTLPTracePayload {
  resourceSpans: Array<{
    resource: {
      attributes: Array<{ key: string; value: { stringValue: string } }>;
    };
    scopeSpans: Array<{
      scope: { name: string; version: string };
      spans: OTelSpan[];
    }>;
  }>;
}

// =============================================================================
// OTLP EXPORTER
// =============================================================================

export class OTLPExporter {
  private config: Required<
    Pick<
      OTLPExporterConfig,
      | 'endpoint'
      | 'compression'
      | 'maxBatchSize'
      | 'maxRetries'
      | 'retryDelayMs'
      | 'timeoutMs'
      | 'serviceName'
      | 'serviceVersion'
    >
  > & { headers: Record<string, string>; fetchFn?: OTLPExporterConfig['fetchFn'] };

  private pendingSpans: OTelSpan[] = [];
  private exportHistory: OTLPExportResult[] = [];
  private registered = false;

  constructor(config: OTLPExporterConfig) {
    this.config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      compression: config.compression ?? true,
      maxBatchSize: config.maxBatchSize ?? 512,
      maxRetries: config.maxRetries ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      timeoutMs: config.timeoutMs ?? 10_000,
      serviceName: config.serviceName ?? 'holoscript',
      serviceVersion: config.serviceVersion ?? '5.6.0',
      fetchFn: config.fetchFn,
    };
  }

  /**
   * Register this exporter with a TelemetryCollector.
   * Hooks into the onExport callback to receive flushed spans.
   */
  register(collector?: TelemetryCollector): void {
    if (this.registered) return;

    const target = collector ?? getTelemetryCollector();
    target.onExport(async (_events: TelemetryEvent[], spans: TraceSpan[]) => {
      if (spans.length === 0) return;

      // Convert to OTel format inline (same logic as TelemetryCollector.exportToOTel)
      const otelSpans = target.exportToOTel();
      if (otelSpans.length > 0) {
        this.pendingSpans.push(...otelSpans);
        await this.flushPending();
      }
    });

    this.registered = true;
  }

  /**
   * Manually enqueue spans for export.
   */
  enqueue(spans: OTelSpan[]): void {
    this.pendingSpans.push(...spans);
  }

  /**
   * Flush all pending spans in batches.
   */
  async flushPending(): Promise<OTLPExportResult[]> {
    if (this.pendingSpans.length === 0) {
      return [];
    }

    const results: OTLPExportResult[] = [];
    while (this.pendingSpans.length > 0) {
      const batch = this.pendingSpans.splice(0, this.config.maxBatchSize);
      const result = await this.exportBatch(batch);
      results.push(result);
      this.exportHistory.push(result);
    }

    return results;
  }

  /**
   * Export a single batch of spans to the OTLP endpoint.
   */
  async exportBatch(spans: OTelSpan[]): Promise<OTLPExportResult> {
    const startTime = Date.now();

    if (spans.length === 0) {
      return {
        success: true,
        spanCount: 0,
        retries: 0,
        durationMs: 0,
      };
    }

    const payload = this.buildPayload(spans);
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.sendPayload(payload);
        return {
          success: true,
          spanCount: spans.length,
          retries: attempt,
          durationMs: Date.now() - startTime,
        };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);

        // Don't retry on 4xx (client errors) except 429 (rate limiting)
        if (
          error instanceof OTLPHttpError &&
          error.statusCode >= 400 &&
          error.statusCode < 500 &&
          error.statusCode !== 429
        ) {
          break;
        }

        if (attempt < this.config.maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          const jitter = delay * 0.1 * Math.random();
          await this.sleep(delay + jitter);
        }
      }
    }

    return {
      success: false,
      spanCount: spans.length,
      retries: this.config.maxRetries,
      error: lastError,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Build the OTLP/HTTP JSON payload.
   */
  buildPayload(spans: OTelSpan[]): OTLPTracePayload {
    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.config.serviceName } },
              { key: 'service.version', value: { stringValue: this.config.serviceVersion } },
              { key: 'telemetry.sdk.name', value: { stringValue: 'holoscript' } },
              { key: 'telemetry.sdk.language', value: { stringValue: 'typescript' } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: '@holoscript/core',
                version: this.config.serviceVersion,
              },
              spans,
            },
          ],
        },
      ],
    };
  }

  /**
   * Send the payload to the OTLP endpoint.
   */
  private async sendPayload(payload: OTLPTracePayload): Promise<void> {
    const fetchFn = this.config.fetchFn ?? globalThis.fetch;
    const bodyStr = JSON.stringify(payload);

    let body: string | Uint8Array = bodyStr;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Gzip compression if available and enabled
    if (this.config.compression) {
      try {
        const compressed = await this.gzipCompress(bodyStr);
        body = compressed;
        headers['Content-Encoding'] = 'gzip';
      } catch {
        // Fall back to uncompressed if gzip is unavailable
        body = bodyStr;
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetchFn(this.config.endpoint, {
        method: 'POST',
        headers,
        body: body as BodyInit,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new OTLPHttpError(response.status, `OTLP export failed: HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Compress a string using gzip (Node.js zlib).
   */
  private async gzipCompress(data: string): Promise<Uint8Array> {
    const { promisify } = await import('util');
    const { gzip } = await import('zlib');
    const gzipAsync = promisify(gzip);
    return gzipAsync(Buffer.from(data));
  }

  /**
   * Get export history.
   */
  getHistory(): OTLPExportResult[] {
    return [...this.exportHistory];
  }

  /**
   * Get pending span count.
   */
  getPendingCount(): number {
    return this.pendingSpans.length;
  }

  /**
   * Clear export history.
   */
  clearHistory(): void {
    this.exportHistory = [];
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// =============================================================================
// ERROR TYPES
// =============================================================================

export class OTLPHttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'OTLPHttpError';
  }
}
