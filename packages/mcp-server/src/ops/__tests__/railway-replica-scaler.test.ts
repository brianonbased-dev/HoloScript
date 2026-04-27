import { describe, it, expect, vi, afterEach } from 'vitest';
import { RailwayReplicaScaler } from '../railway-replica-scaler.js';

describe('RailwayReplicaScaler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('posts GraphQL serviceInstanceUpdate with Bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: { serviceInstanceUpdate: { __typename: 'Ok' } } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const scaler = new RailwayReplicaScaler({
      token: 'test-token',
      serviceId: 'svc1',
      environmentId: 'env1',
      region: 'us-west1',
    });

    await scaler.setReplicas(3);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain('backboard.railway.com');
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      // Matches railway-replica-scaler.ts (explicit UTF-8 for GraphQL JSON body)
      'Content-Type': 'application/json; charset=utf-8',
    });
    const body = JSON.parse((init?.body as string) || '{}');
    expect(body.variables.input.multiRegionConfig['us-west1'].numReplicas).toBe(3);
  });

  it('uses Project-Access-Token when project token set', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ data: {} }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const scaler = new RailwayReplicaScaler({
      projectToken: 'proj-tok',
      serviceId: 'svc1',
      environmentId: 'env1',
      region: 'eu-west1',
    });
    await scaler.setReplicas(2);

    const [, init] = fetchMock.mock.calls[0]!;
    expect((init?.headers as Record<string, string>)['Project-Access-Token']).toBe('proj-tok');
    expect((init?.headers as Record<string, string>)['Authorization']).toBeUndefined();
  });
});
