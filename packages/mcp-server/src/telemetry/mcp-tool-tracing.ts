/**
 * OpenTelemetry traces for MCP tool execution (P.008.02).
 *
 * When OTEL_EXPORTER_OTLP_ENDPOINT is set, registers a Node tracer provider with
 * OTLP HTTP exporter. Each tool call is wrapped in span `mcp.tool.<name>` with
 * attributes: tool_name, tier, latency_ms, error, agent.id (when present).
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import type { TokenIntrospection } from '../security/oauth21';
import type { TokenIntrospectionWithTenant } from '../security/tenant-auth';

let providerRegistered = false;

function resolveServiceVersion(): string {
  return (
    process.env.OTEL_SERVICE_VERSION ||
    process.env.npm_package_version ||
    process.env.SERVICE_VERSION ||
    '0.0.0'
  );
}

/**
 * Register OTLP trace exporter + Node provider once (no-op if endpoint unset).
 */
export function ensureMcpOtelTracer(): void {
  if (providerRegistered) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return;

  providerRegistered = true;

  const exporter = new OTLPTraceExporter();
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      'service.name': process.env.OTEL_SERVICE_NAME || 'holoscript-mcp',
      'service.version': resolveServiceVersion(),
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
}

function subscriptionTier(auth: TokenIntrospection): string {
  const t = (auth as TokenIntrospectionWithTenant).tenantContext?.subscriptionTier;
  return typeof t === 'string' && t.length > 0 ? t : 'unknown';
}

export interface McpToolExecutionResult {
  isError: boolean;
  result?: unknown;
}

/**
 * Runs `exec` inside an active span for MCP tool calls.
 */
export async function withMcpToolExecutionSpan<T extends McpToolExecutionResult>(
  toolName: string,
  auth: TokenIntrospection,
  exec: () => Promise<T>
): Promise<T> {
  ensureMcpOtelTracer();
  const tracer = trace.getTracer('holoscript-mcp', resolveServiceVersion());
  const started = Date.now();

  return tracer.startActiveSpan(`mcp.tool.${toolName}`, async (span) => {
    span.setAttribute('tool_name', toolName);
    span.setAttribute('tier', subscriptionTier(auth));
    if (auth.agentId) span.setAttribute('agent.id', auth.agentId);

    try {
      const out = await exec();
      span.setAttribute('latency_ms', Date.now() - started);
      span.setAttribute('error', out.isError);
      if (out.isError) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: 'mcp_tool_error_or_denied',
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      return out;
    } catch (err) {
      span.setAttribute('latency_ms', Date.now() - started);
      span.setAttribute('error', true);
      span.recordException(err as Error);
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  });
}

/** @internal vitest */
export function resetMcpOtelRegistrationFlagForTests(): void {
  providerRegistered = false;
}
