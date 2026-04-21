import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  flushFederatedAnalytics,
  recordFederatedEvent,
  resetFederatedAnalyticsForTests,
} from './federatedAnalytics';

describe('federatedAnalytics', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FEDERATED_ANALYTICS_URL', 'https://example.test/federated');
    _resetFederatedAnalyticsForTests();
    localStorage.clear();

    vi.stubGlobal('window', {});
    vi.stubGlobal('crypto', {
      randomUUID: () => '00000000-0000-4000-8000-000000000001',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      })
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('POSTs aggregate counts only on flush', async () => {
    recordFederatedEvent('scene_created');
    recordFederatedEvent('scene_created');
    recordFederatedEvent('project_exported');

    const ok = await flushFederatedAnalytics();
    expect(ok).toBe(true);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe('https://example.test/federated');
    const body = JSON.parse(init.body as string) as {
      aggregates: Record<string, number>;
      installId: string;
      windowStart: number;
      windowEnd: number;
    };
    expect(body.aggregates.scene_created).toBe(2);
    expect(body.aggregates.project_exported).toBe(1);
    expect(body.installId).toBe('00000000-0000-4000-8000-000000000001');
    expect(body.windowEnd).toBeGreaterThanOrEqual(body.windowStart);
  });

  it('returns true when nothing to flush', async () => {
    const ok = await flushFederatedAnalytics();
    expect(ok).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
