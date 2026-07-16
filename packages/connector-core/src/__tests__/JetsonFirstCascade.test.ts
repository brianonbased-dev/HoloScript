import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ResilientOrchestratorFetch } from '../ResilientOrchestratorFetch.js';

/**
 * Jetson-first cascade (CHOKEPOINT-CAPTURE, dependency-sovereignty-ladder 2026-07-16):
 * the sovereign LAN Jetson anchor is tried BEFORE any Railway endpoint, with a short
 * abort budget and one-failure memoization so off-LAN processes never hang on it.
 */

const ok = { ok: true, status: 200 } as Response;

describe('ResilientOrchestratorFetch (Jetson-first cascade)', () => {
  beforeEach(() => {
    // Deterministic default cascade regardless of the host machine's env.
    vi.stubEnv('MCP_ORCHESTRATOR_URL', undefined);
    vi.stubEnv('MCP_ORCHESTRATOR_INTERNAL_URL', undefined);
    vi.stubEnv('MCP_ORCHESTRATOR_PUBLIC_URL', undefined);
    vi.stubEnv('MCP_ORCHESTRATOR_LOCAL_URL', undefined);
    vi.stubEnv('MCP_ORCHESTRATOR_JETSON_URL', undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('tries the Jetson LAN anchor first in the default cascade', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);

    const rf = new ResilientOrchestratorFetch({ logger: () => {} });
    const { url, response } = await rf.fetchWithFailover('/health');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(url).toBe('http://192.168.0.119:3001/health');
    expect(response.ok).toBe(true);
  });

  it('respects the MCP_ORCHESTRATOR_JETSON_URL env override', async () => {
    vi.stubEnv('MCP_ORCHESTRATOR_JETSON_URL', 'http://jetson-override:9999');
    const fetchMock = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);

    const rf = new ResilientOrchestratorFetch({ logger: () => {} });
    const { url } = await rf.fetchWithFailover('/health');

    expect(url).toBe('http://jetson-override:9999/health');
  });

  it('disables the Jetson attempt when MCP_ORCHESTRATOR_JETSON_URL is empty', async () => {
    vi.stubEnv('MCP_ORCHESTRATOR_JETSON_URL', '');
    const fetchMock = vi.fn().mockResolvedValue(ok);
    vi.stubGlobal('fetch', fetchMock);

    const rf = new ResilientOrchestratorFetch({ logger: () => {} });
    const { url } = await rf.fetchWithFailover('/health');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(url).toBe('http://mcp-orchestrator.railway.internal/health');
  });

  it('falls through to Railway when Jetson is down and memoizes the dead Jetson', async () => {
    const jetson = 'http://jetson.test:3001';
    const railway = 'http://railway.test';
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      if (String(input).startsWith(jetson)) throw new Error('connect timeout');
      return ok;
    });
    vi.stubGlobal('fetch', fetchMock);

    const rf = new ResilientOrchestratorFetch({
      urls: [jetson, railway],
      jetsonUrl: jetson,
      logger: () => {},
    });

    const jetsonCalls = () =>
      fetchMock.mock.calls.filter((c) => String(c[0]).startsWith(jetson)).length;

    // Call 1: pays the Jetson attempt exactly once, then falls through to Railway.
    const first = await rf.fetchWithFailover('/health');
    expect(first.url).toBe(`${railway}/health`);
    expect(jetsonCalls()).toBe(1);

    // Calls 2-3: dead Jetson is circuit-OPEN after ONE failure — never re-paid.
    await rf.fetchWithFailover('/health');
    await rf.fetchWithFailover('/health');
    expect(jetsonCalls()).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 jetson + 3 railway
  });

  it('applies an abort-timeout signal to the Jetson attempt only', async () => {
    const jetson = 'http://jetson.test:3001';
    const railway = 'http://railway.test';
    const seen: Array<{ target: string; signal: AbortSignal | null | undefined }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const target = String(input);
      seen.push({ target, signal: init?.signal });
      if (target.startsWith(jetson)) throw new Error('down');
      return ok;
    });
    vi.stubGlobal('fetch', fetchMock);

    const rf = new ResilientOrchestratorFetch({
      urls: [jetson, railway],
      jetsonUrl: jetson,
      logger: () => {},
    });
    await rf.fetchWithFailover('/health');

    expect(seen[0]?.target).toBe(`${jetson}/health`);
    expect(seen[0]?.signal).toBeInstanceOf(AbortSignal);
    expect(seen[1]?.target).toBe(`${railway}/health`);
    expect(seen[1]?.signal).toBeUndefined();
  });

  it('re-probes the Jetson after its reset window elapses', async () => {
    vi.useFakeTimers();
    try {
      const jetson = 'http://jetson.test:3001';
      const railway = 'http://railway.test';
      let jetsonUp = false;
      const fetchMock = vi.fn(async (input: string | URL | Request) => {
        if (String(input).startsWith(jetson) && !jetsonUp) throw new Error('down');
        return ok;
      });
      vi.stubGlobal('fetch', fetchMock);

      const rf = new ResilientOrchestratorFetch({
        urls: [jetson, railway],
        jetsonUrl: jetson,
        jetsonResetTimeoutMs: 60_000,
        logger: () => {},
      });

      await rf.fetchWithFailover('/health'); // trips Jetson OPEN after one failure
      await rf.fetchWithFailover('/health'); // skips the dead Jetson

      jetsonUp = true;
      vi.advanceTimersByTime(60_001);

      const { url } = await rf.fetchWithFailover('/health');
      expect(url).toBe(`${jetson}/health`);
    } finally {
      vi.useRealTimers();
    }
  });
});
