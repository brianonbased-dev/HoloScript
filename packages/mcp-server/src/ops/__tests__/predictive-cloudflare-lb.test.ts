import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  runPredictiveCloudflareLbTick,
  getLbWeightsSnapshot,
  maybeStartPredictiveCloudflareLbLoop,
} from '../predictive-cloudflare-lb.js';

describe('predictive-cloudflare-lb', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('dry-run tick writes normalized weights snapshot', async () => {
    vi.stubEnv('MCP_PREDICTIVE_LB_BACKENDS', 'alpha,beta');
    await runPredictiveCloudflareLbTick({
      accountId: 'acc',
      poolId: 'pool1',
      apiToken: 'tok',
      dryRun: true,
    });
    const s = getLbWeightsSnapshot();
    expect(s).not.toBeNull();
    expect(s!.dryRun).toBe(true);
    expect(s!.normalizedWeights.alpha).toBeCloseTo(0.5, 5);
    expect(s!.normalizedWeights.beta).toBeCloseTo(0.5, 5);
  });

  it('maybeStartPredictiveCloudflareLbLoop no-ops when disabled', () => {
    expect(() => maybeStartPredictiveCloudflareLbLoop()).not.toThrow();
  });

  it('PATCHes Cloudflare when not dry-run (mocked)', async () => {
    vi.stubEnv('MCP_PREDICTIVE_LB_BACKENDS', 'origin-a,origin-b');

    const poolJson = {
      success: true,
      result: {
        id: 'pool1',
        origins: [
          { name: 'origin-a', address: '1.1.1.1', weight: 50 },
          { name: 'origin-b', address: '2.2.2.2', weight: 50 },
        ],
      },
    };

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(async () => ({
        ok: true,
        text: async () => JSON.stringify(poolJson),
      }))
      .mockImplementationOnce(async () => ({
        ok: true,
        text: async () =>
          JSON.stringify({
            success: true,
            result: {
              id: 'pool1',
              origins: [
                { name: 'origin-a', address: '1.1.1.1', weight: 50 },
                { name: 'origin-b', address: '2.2.2.2', weight: 50 },
              ],
            },
          }),
      }));

    vi.stubGlobal('fetch', fetchMock);

    await runPredictiveCloudflareLbTick({
      accountId: 'acc',
      poolId: 'pool1',
      apiToken: 'secret',
      dryRun: false,
    });

    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const patchInit = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(patchInit.method).toBe('PATCH');
    const body = JSON.parse((patchInit.body as string) || '{}');
    expect(body.origins).toHaveLength(2);
    expect(body.origins[0].weight).toBeGreaterThanOrEqual(1);

    const s = getLbWeightsSnapshot();
    expect(s?.lastError).toBeUndefined();
    expect(s?.cloudflareOriginWeights).toBeDefined();
  });
});
