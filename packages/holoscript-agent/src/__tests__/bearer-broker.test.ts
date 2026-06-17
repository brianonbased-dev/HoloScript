import { describe, it, expect, vi } from 'vitest';
import { Wallet } from 'ethers';
import { resolveBearerViaBroker } from '../bearer-broker.js';

// Deterministic test wallet (well-known throwaway key — NOT a real seat).
const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const TEST_ADDR = new Wallet(TEST_KEY).address;
const BASE = 'https://mcp.holoscript.net/api/holomesh';

function mockFetch(handlers: {
  challenge?: (body: any) => { status: number; json: any };
  recover?: (body: any) => { status: number; json: any };
}): typeof fetch {
  return vi.fn(async (url: any, init: any) => {
    const u = String(url);
    const body = JSON.parse(init.body);
    const h = u.endsWith('/key/challenge') ? handlers.challenge : handlers.recover;
    const r = h ? h(body) : { status: 404, json: {} };
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      json: async () => r.json,
    } as Response;
  }) as unknown as typeof fetch;
}

describe('resolveBearerViaBroker', () => {
  it('recovers the bearer via wallet-proof (challenge → sign → recover)', async () => {
    let recoveredBody: any = null;
    const fetchImpl = mockFetch({
      challenge: (body) => {
        expect(body.wallet_address).toBe(TEST_ADDR);
        return { status: 200, json: { success: true, nonce: 'nonce-123' } };
      },
      recover: (body) => {
        recoveredBody = body;
        return { status: 200, json: { success: true, agent: { api_key: 'holomesh_sk_abc', name: 'test-agent' } } };
      },
    });

    const bearer = await resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE, fetchImpl });
    expect(bearer).toBe('holomesh_sk_abc');
    // recover request must carry the address, the challenge nonce, and a signature
    expect(recoveredBody.wallet_address).toBe(TEST_ADDR);
    expect(recoveredBody.nonce).toBe('nonce-123');
    expect(typeof recoveredBody.signature).toBe('string');
    expect(recoveredBody.signature).toMatch(/^0x[0-9a-fA-F]+$/);
  });

  it('trims a trailing slash on meshApiBase', async () => {
    const fetchImpl = mockFetch({
      challenge: () => ({ status: 200, json: { nonce: 'n' } }),
      recover: () => ({ status: 200, json: { agent: { api_key: 'k' } } }),
    });
    const bearer = await resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE + '/', fetchImpl });
    expect(bearer).toBe('k');
  });

  it('throws when the challenge fails', async () => {
    const fetchImpl = mockFetch({ challenge: () => ({ status: 404, json: { error: 'no agent' } }) });
    await expect(
      resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE, fetchImpl })
    ).rejects.toThrow(/key\/challenge returned 404/);
  });

  it('throws when the challenge returns no nonce', async () => {
    const fetchImpl = mockFetch({ challenge: () => ({ status: 200, json: {} }) });
    await expect(
      resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE, fetchImpl })
    ).rejects.toThrow(/no nonce/);
  });

  it('throws when recover fails', async () => {
    const fetchImpl = mockFetch({
      challenge: () => ({ status: 200, json: { nonce: 'n' } }),
      recover: () => ({ status: 401, json: { error: 'sig failed' } }),
    });
    await expect(
      resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE, fetchImpl })
    ).rejects.toThrow(/key\/recover returned 401/);
  });

  it('throws when recover returns no api_key', async () => {
    const fetchImpl = mockFetch({
      challenge: () => ({ status: 200, json: { nonce: 'n' } }),
      recover: () => ({ status: 200, json: { agent: {} } }),
    });
    await expect(
      resolveBearerViaBroker({ privateKey: TEST_KEY, meshApiBase: BASE, fetchImpl })
    ).rejects.toThrow(/no api_key/);
  });
});
