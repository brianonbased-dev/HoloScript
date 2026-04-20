import { describe, it, expect, vi, afterEach } from 'vitest';
import { recordMcpToolCallMetric, __testOnly_resetToolAnomalyBridge } from '../tool-anomaly-bridge.js';

describe('tool-anomaly-bridge', () => {
  afterEach(() => {
    __testOnly_resetToolAnomalyBridge();
    vi.unstubAllEnvs();
  });

  it('recordMcpToolCallMetric does not throw', () => {
    expect(() =>
      recordMcpToolCallMetric('parse_hs', 12, false)
    ).not.toThrow();
  });

  it('respects MCP_ANOMALY_MIN_SAMPLES via env when set', async () => {
    vi.stubEnv('MCP_ANOMALY_MIN_SAMPLES', '3');
    vi.stubEnv('MCP_ANOMALY_MAX_ERROR_RATE', '0.5');
    vi.stubEnv('MCP_ANOMALY_WINDOW_MS', '60000');

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: async () => '' });
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('MCP_SLACK_WEBHOOK_URL', 'https://hooks.slack.example/test');

    const t0 = Date.now();
    recordMcpToolCallMetric('t', 10, true);
    recordMcpToolCallMetric('t', 10, true);
    recordMcpToolCallMetric('t', 10, true);

    await new Promise((r) => setTimeout(r, 0));
    expect(fetchMock).toHaveBeenCalled();
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.method).toBe('POST');
  });
});
