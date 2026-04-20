import { describe, it, expect, afterEach } from 'vitest';
import {
  withMcpToolExecutionSpan,
  resetMcpOtelRegistrationFlagForTests,
} from '../telemetry/mcp-tool-tracing';
import type { TokenIntrospection } from '../security/oauth21';

describe('mcp-tool-tracing', () => {
  afterEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    resetMcpOtelRegistrationFlagForTests();
  });

  it('runs tool callback when OTLP endpoint is unset (no provider)', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const auth = {
      active: true,
      scopes: ['tools:read'],
      agentId: 'agent_test',
    } as TokenIntrospection;

    const out = await withMcpToolExecutionSpan('parse_hs', auth, async () => ({
      result: { ok: true },
      isError: false,
    }));

    expect(out.isError).toBe(false);
    expect(out.result).toEqual({ ok: true });
  });

  it('returns error results without throwing', async () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    const auth = { active: true, scopes: [], agentId: 'x' } as TokenIntrospection;
    const out = await withMcpToolExecutionSpan('bad_tool', auth, async () => ({
      result: { err: 1 },
      isError: true,
    }));
    expect(out.isError).toBe(true);
  });
});
