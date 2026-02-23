/**
 * RenderNetworkTrait — Network Integration Tests
 *
 * Tests the async fetch-based functions using mocked global.fetch + vitest fake timers:
 * - connectToRenderNetwork (success, auth failure, degraded, region selection)
 * - submitJobToAPI (retry logic on 5xx + 429, permanent failure)
 * - pollJobStatus (complete → emit + move; failed → emit + move; progress → emit)
 * - refreshCredits (success, network error keeps stale balance)
 * - sendWebhookNotification (on job complete, webhook_url configured)
 * - credit guard (max_credits_per_job rejection)
 *
 * NOTE: onAttach is async in practice (JobQueuePersistence.init() + loadState()).
 * These tests use `await renderNetworkHandler.onAttach?.(...)` + runAllTimersAsync.
 *
 * @version 3.3.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderNetworkHandler } from '../RenderNetworkTrait';

// ─── Fetch mock setup ──────────────────────────────────────────────────────────

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const API_KEY = 'rndr-test-key-xyz';
const WALLET  = '0xAbcd1234000000000000000000000000DeadBeef';

function cfg(overrides: Record<string, unknown> = {}) {
  return { ...renderNetworkHandler.defaultConfig, api_key: API_KEY, wallet_address: WALLET, ...overrides } as any;
}
function node() { return {} as any; }
function ctx() {
  const emitted: { type: string; payload: unknown }[] = [];
  return {
    emit: vi.fn((t: string, p: unknown) => emitted.push({ type: t, payload: p })),
    _emitted: emitted,
  };
}

/** 4 pings (all fail fast) + one auth validate call */
function mockPingsFail(then: object) {
  for (let i = 0; i < 4; i++) fetchMock.mockRejectedValueOnce(new Error('timeout'));
  fetchMock.mockResolvedValueOnce(then as any);
}

function authOK(overrides = {}) {
  return {
    ok: true, status: 200,
    json: vi.fn().mockResolvedValue({
      available_nodes: 500, estimated_wait_ms: 3000,
      credits: { balance: 200, pending: 10, spent: 80, earned: 20 },
      ...overrides,
    }),
  };
}
function authFail() { return { ok: false, status: 401, json: vi.fn() }; }

function statusResponse(status: string, extra: object = {}) {
  return {
    ok: true, status: 200,
    json: vi.fn().mockResolvedValue({
      status, progress: status === 'complete' ? 100 : 55,
      frames: { completed: status === 'complete' ? 10 : 5, failed: 0 },
      gpu_hours: 0.8,
      credits_used: 1.5,
      outputs: status === 'complete' ? [{ type: 'frame', url: 'https://cdn.rndr.com/out.png', format: 'png', resolution: { width: 1920, height: 1080 }, size: 2048000, checksum: 'sha256abc' }] : [],
      ...extra,
    }),
  };
}

// ─── connectToRenderNetwork ────────────────────────────────────────────────────

describe('connectToRenderNetwork', () => {
  it('sets isConnected=true and emits render_network_connected on success', async () => {
    const n = node(); const c = ctx();
    mockPingsFail(authOK());

    await renderNetworkHandler.onAttach?.(n, cfg(), c as any);
    await vi.runAllTimersAsync();

    expect(c.emit).toHaveBeenCalledWith('render_network_connected', expect.objectContaining({
      availableNodes: 500,
    }));
    expect((n as any).__renderNetworkState.isConnected).toBe(true);
    expect((n as any).__renderNetworkState.credits?.balance).toBe(200);
  });

  it('emits render_network_error on 401', async () => {
    const n = node(); const c = ctx();
    mockPingsFail(authFail());

    await renderNetworkHandler.onAttach?.(n, cfg(), c as any);
    await vi.runAllTimersAsync();

    expect(c.emit).toHaveBeenCalledWith('render_network_error', expect.objectContaining({
      error: expect.stringContaining('Failed to connect'),
    }));
    expect((n as any).__renderNetworkState.isConnected).toBe(false);
    expect((n as any).__renderNetworkState.networkStatus).toBe('offline');
  });

  it('selects fastest ping region (only eu-west resolves OK)', async () => {
    const n = node(); const c = ctx();

    // us-west, us-east fail; eu-west succeeds; ap-south fails
    fetchMock
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn() }) // eu-west
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(authOK());

    await renderNetworkHandler.onAttach?.(n, cfg(), c as any);
    await vi.runAllTimersAsync();

    expect((n as any).__renderNetworkState.selectedRegion).toBe('eu-west');
  });

  it('all pings fail → falls back to us-west (index 0)', async () => {
    const n = node(); const c = ctx();
    mockPingsFail(authOK());

    await renderNetworkHandler.onAttach?.(n, cfg(), c as any);
    await vi.runAllTimersAsync();

    // All failed with Infinity latency → first index wins (us-west)
    expect((n as any).__renderNetworkState.selectedRegion).toBe('us-west');
  });
});

// ─── submitJobToAPI + retry ────────────────────────────────────────────────────

describe('submitRenderJob — retry logic via onEvent', () => {
  async function attachConnected() {
    const n = node(); const c = ctx();
    await renderNetworkHandler.onAttach?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any);
    const state = (n as any).__renderNetworkState;
    state.isConnected = true;
    state.credits = { balance: 1000, pending: 0, spent: 0, earned: 0, walletAddress: WALLET, lastRefresh: Date.now() };
    return { n, c, state, config: cfg() };
  }

  it('submits job successfully (1st attempt OK)', async () => {
    const { n, c, config } = await attachConnected();

    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ job_id: 'api-job-001' }) });
    // And poll → complete
    fetchMock.mockResolvedValueOnce(statusResponse('complete'));

    renderNetworkHandler.onEvent?.(n, config, c as any, {
      type: 'render_submit',
      payload: { scene: { id: 's1' }, quality: 'draft', frames: { start: 0, end: 0 } },
    });

    expect(c.emit).toHaveBeenCalledWith('render_job_submitted', expect.anything());

    await vi.advanceTimersByTimeAsync(1000); // backoff
    await vi.advanceTimersByTimeAsync(5000); // poll interval
    await vi.runAllTimersAsync();

    expect(c.emit).toHaveBeenCalledWith('render_job_complete', expect.objectContaining({
      job: expect.objectContaining({ id: 'api-job-001' }),
    }));
  });

  it('retries on 500 then succeeds (2nd attempt)', async () => {
    const { n, c, config } = await attachConnected();

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() })  // attempt 1
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ job_id: 'retry-job' }) }); // attempt 2

    fetchMock.mockResolvedValue(statusResponse('queued')); // further polls

    renderNetworkHandler.onEvent?.(n, config, c as any, {
      type: 'render_submit',
      payload: { scene: { id: 's2' }, quality: 'preview', frames: { start: 0, end: 0 } },
    });

    await vi.advanceTimersByTimeAsync(1000); // first backoff
    await vi.runAllTimersAsync();

    // Eventually submitted — job should still be in activeJobs (not failed)
    const state = (n as any).__renderNetworkState;
    const failedJobs = state.completedJobs.filter((j: any) => j.error?.includes('Failed after'));
    expect(failedJobs).toHaveLength(0);
  });

  it('fails after 3 retries and emits render_job_failed', async () => {
    const { n, c, config } = await attachConnected();

    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() })
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() })
      .mockResolvedValueOnce({ ok: false, status: 500, json: vi.fn() });

    renderNetworkHandler.onEvent?.(n, config, c as any, {
      type: 'render_submit',
      payload: { scene: { id: 's3' }, quality: 'film', frames: { start: 0, end: 0 } },
    });

    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    await vi.runAllTimersAsync();

    expect(c.emit).toHaveBeenCalledWith('render_job_failed', expect.objectContaining({
      error: expect.stringContaining('Failed after'),
    }));
  });

  it('rejects job exceeding max_credits_per_job', async () => {
    const { n, c } = await attachConnected();
    const limitedCfg = cfg({ max_credits_per_job: 1 }); // film × 100 frames >> 1 credit

    renderNetworkHandler.onEvent?.(n, limitedCfg, c as any, {
      type: 'render_submit',
      payload: { scene: { id: 's4' }, quality: 'film', frames: { start: 0, end: 99 } },
    });

    expect(c.emit).toHaveBeenCalledWith('render_job_rejected', expect.objectContaining({
      reason: 'exceeds_max_credits',
    }));
  });
});

// ─── pollJobStatus ─────────────────────────────────────────────────────────────

describe('pollJobStatus via onUpdate', () => {
  async function attachWithActiveJob(jobOverrides = {}) {
    const n = node(); const c = ctx();
    await renderNetworkHandler.onAttach?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any);
    const state = (n as any).__renderNetworkState;
    state.isConnected = true;
    state.activeJobs.push({
      id: 'poll-job-1', status: 'rendering', progress: 30,
      quality: 'production', estimatedCredits: 2.0,
      frames: { total: 10, completed: 3, failed: 0 },
      outputs: [], nodeCount: 1, gpuHours: 0,
      ...jobOverrides,
    });
    return { n, c, state };
  }

  it('emits render_job_progress on in-progress poll', async () => {
    const { n, c } = await attachWithActiveJob();
    fetchMock.mockResolvedValueOnce(statusResponse('rendering'));

    renderNetworkHandler.onUpdate?.(n, cfg(), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);

    expect(c.emit).toHaveBeenCalledWith('render_job_progress', expect.objectContaining({
      progress: 55,
    }));
  });

  it('moves job to completed and emits render_job_complete on finish', async () => {
    const { n, c, state } = await attachWithActiveJob();
    fetchMock.mockResolvedValueOnce(statusResponse('complete'));

    renderNetworkHandler.onUpdate?.(n, cfg(), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);

    expect(c.emit).toHaveBeenCalledWith('render_job_complete', expect.objectContaining({
      job: expect.objectContaining({ status: 'complete' }),
    }));
    expect(state.activeJobs).toHaveLength(0);
    expect(state.completedJobs).toHaveLength(1);
    expect(state.completedJobs[0].outputs).toHaveLength(1);
    expect(state.totalCost).toBeGreaterThan(0);
  });

  it('tracks cost by quality bucket on completion', async () => {
    const { n, c, state } = await attachWithActiveJob({ quality: 'film' });
    fetchMock.mockResolvedValueOnce(statusResponse('complete'));

    renderNetworkHandler.onUpdate?.(n, cfg(), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);

    expect(state.costByQuality.film).toBeGreaterThan(0);
    expect(state.costByQuality.production).toBe(0);
  });

  it('emits render_job_failed on server-side failure', async () => {
    const { n, c, state } = await attachWithActiveJob();
    fetchMock.mockResolvedValueOnce(statusResponse('failed', { error: 'VRAM overflow' }));

    renderNetworkHandler.onUpdate?.(n, cfg(), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);

    expect(c.emit).toHaveBeenCalledWith('render_job_failed', expect.objectContaining({
      error: 'VRAM overflow',
    }));
    expect(state.activeJobs).toHaveLength(0);
    expect(state.completedJobs[0].status).toBe('failed');
  });

  it('continues polling when status is still processing', async () => {
    const { n, c } = await attachWithActiveJob({ status: 'processing' });
    fetchMock
      .mockResolvedValueOnce(statusResponse('processing'))
      .mockResolvedValueOnce(statusResponse('rendering'))
      .mockResolvedValueOnce(statusResponse('complete'));

    renderNetworkHandler.onUpdate?.(n, cfg(), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.advanceTimersByTimeAsync(5000);

    expect(c.emit).toHaveBeenCalledWith('render_job_complete', expect.anything());
  });
});

// ─── refreshCredits ────────────────────────────────────────────────────────────

describe('refreshCredits via onEvent', () => {
  async function attachWithCredits(balance: number) {
    const n = node(); const c = ctx();
    await renderNetworkHandler.onAttach?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any);
    const state = (n as any).__renderNetworkState;
    state.isConnected = true;
    state.credits = { balance, pending: 0, spent: 0, earned: 0, walletAddress: WALLET, lastRefresh: 0 };
    return { n, c, state };
  }

  it('updates balance on successful API response', async () => {
    const { n, c, state } = await attachWithCredits(50);

    fetchMock.mockResolvedValueOnce({
      ok: true, json: vi.fn().mockResolvedValue({ balance: 300, pending: 5, spent: 100, earned: 10 }),
    });

    renderNetworkHandler.onEvent?.(n, cfg(), c as any, { type: 'credits_refresh', payload: {} });
    await vi.runAllTimersAsync();

    expect(c.emit).toHaveBeenCalledWith('credits_refreshed', expect.objectContaining({
      credits: expect.objectContaining({ balance: 300 }),
    }));
    expect(state.credits.balance).toBe(300);
  });

  it('keeps stale balance on network error', async () => {
    const { n, c, state } = await attachWithCredits(75);

    fetchMock.mockRejectedValueOnce(new Error('Network fail'));

    renderNetworkHandler.onEvent?.(n, cfg(), c as any, { type: 'credits_refresh', payload: {} });
    await vi.runAllTimersAsync();

    expect(state.credits.balance).toBe(75);
    expect(c.emit).not.toHaveBeenCalledWith('credits_refreshed', expect.anything());
  });

  it('no-op when no api_key in config', async () => {
    const { n, c } = await attachWithCredits(50);
    renderNetworkHandler.onEvent?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any, {
      type: 'credits_refresh', payload: {},
    });
    await vi.runAllTimersAsync();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── Webhook ───────────────────────────────────────────────────────────────────

describe('webhook notifications on job complete', () => {
  it('POSTs to webhook_url when job completes', async () => {
    const n = node(); const c = ctx();
    const webhookUrl = 'https://hooks.example.com/rndr';
    await renderNetworkHandler.onAttach?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any);
    const state = (n as any).__renderNetworkState;
    state.isConnected = true;
    state.activeJobs.push({
      id: 'wh-job-1', status: 'rendering', progress: 50,
      quality: 'production', estimatedCredits: 2.0,
      frames: { total: 1, completed: 0, failed: 0 },
      outputs: [], nodeCount: 1, gpuHours: 0,
    });

    fetchMock
      .mockResolvedValueOnce(statusResponse('complete'))  // status poll
      .mockResolvedValueOnce({ ok: true, status: 200 });  // webhook

    renderNetworkHandler.onUpdate?.(n, cfg({ webhook_url: webhookUrl }), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    const webhookCall = fetchMock.mock.calls.find(([url]: [string]) => url === webhookUrl);
    expect(webhookCall).toBeDefined();
    const body = JSON.parse(webhookCall![1].body);
    expect(body.event).toBe('job_complete');
    expect(body.jobId).toBe('wh-job-1');
  });

  it('does NOT POST webhook when webhook_url is empty', async () => {
    const n = node(); const c = ctx();
    await renderNetworkHandler.onAttach?.(n, { ...renderNetworkHandler.defaultConfig, api_key: '' } as any, c as any);
    const state = (n as any).__renderNetworkState;
    state.isConnected = true;
    state.activeJobs.push({
      id: 'wh-job-2', status: 'rendering', quality: 'draft', estimatedCredits: 1,
      frames: { total: 1, completed: 0, failed: 0 }, outputs: [], nodeCount: 1, gpuHours: 0,
    });

    fetchMock.mockResolvedValueOnce(statusResponse('complete'));

    renderNetworkHandler.onUpdate?.(n, cfg({ webhook_url: '' }), c as any, 16);
    await vi.advanceTimersByTimeAsync(5000);
    await vi.runAllTimersAsync();

    const anyWebhook = fetchMock.mock.calls.filter(([url]: [string]) => String(url).includes('hooks'));
    expect(anyWebhook).toHaveLength(0);
  });
});
