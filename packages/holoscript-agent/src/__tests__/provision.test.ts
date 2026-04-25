import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { provisionAgent } from '../provision.js';

function mockFetch(handlers: {
  challenge?: (body: unknown) => { status: number; json: unknown };
  register?: (body: unknown) => { status: number; json: unknown };
}): typeof fetch {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (u.endsWith('/register/challenge')) {
      const h = handlers.challenge ?? ((b: unknown) => ({ status: 200, json: { nonce: `nonce-for-${(b as { wallet_address: string }).wallet_address}` } }));
      const r = h(body);
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    if (u.endsWith('/register')) {
      const h = handlers.register ?? (() => ({
        status: 201,
        json: {
          agent: { id: 'agent_test_123', api_key: 'test-api-key-44chars-aaaaaaaaaaaaaaaaaaaaa' },
        },
      }));
      const r = h(body);
      return new Response(JSON.stringify(r.json), { status: r.status });
    }
    throw new Error(`unexpected fetch URL: ${u}`);
  }) as unknown as typeof fetch;
}

describe('provisionAgent — dry-run', () => {
  it('reports planned actions without touching network or filesystem', async () => {
    const seatsRoot = mkdtempSync(join(tmpdir(), 'prov-dry-'));
    const fetched = vi.fn();
    const result = await provisionAgent(
      {
        handle: 'security-auditor',
        founderBearer: 'fake-founder-bearer',
        seatsRoot,
        fetchImpl: fetched as unknown as typeof fetch,
      },
      { execute: false }
    );
    expect(result.status).toBe('dry-run');
    if (result.status !== 'dry-run') return;
    expect(result.handle).toBe('security-auditor');
    expect(result.seatId).toContain('security-auditor');
    expect(result.willGenerateWallet).toBe(true);
    expect(result.willCallEndpoints).toEqual([
      'POST https://mcp.holoscript.net/api/holomesh/register/challenge',
      'POST https://mcp.holoscript.net/api/holomesh/register',
    ]);
    expect(fetched).not.toHaveBeenCalled();
    expect(existsSync(join(seatsRoot, '.master-key'))).toBe(false);
  });
});

describe('provisionAgent — execute', () => {
  it('happy path: generates wallet, calls register flow, writes encrypted seat, returns env-var lines', async () => {
    const seatsRoot = mkdtempSync(join(tmpdir(), 'prov-ok-'));
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      calls.push(u);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      const headers = init?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer fake-founder-bearer');
      if (u.endsWith('/register/challenge')) {
        expect(body.wallet_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        return new Response(JSON.stringify({ nonce: 'abc-123-nonce' }), { status: 200 });
      }
      if (u.endsWith('/register')) {
        expect(body.name).toBe('lean-theorist');
        expect(body.wallet_address).toMatch(/^0x[0-9a-fA-F]{40}$/);
        expect(body.nonce).toBe('abc-123-nonce');
        expect(body.signature).toMatch(/^0x[0-9a-f]+$/);
        return new Response(
          JSON.stringify({
            agent: { id: 'agent_lean_42', api_key: 'lean-api-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
          }),
          { status: 201 }
        );
      }
      throw new Error(`unexpected: ${u}`);
    }) as unknown as typeof fetch;

    const result = await provisionAgent(
      {
        handle: 'lean-theorist',
        founderBearer: 'fake-founder-bearer',
        seatsRoot,
        fetchImpl,
      },
      { execute: true }
    );

    expect(result.status).toBe('executed');
    if (result.status !== 'executed') return;
    expect(result.agentId).toBe('agent_lean_42');
    expect(result.bearer).toBe('lean-api-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    expect(result.walletAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(result.envVarLines).toEqual([
      `HOLOSCRIPT_AGENT_WALLET_LEAN_THEORIST=${result.walletAddress}`,
      'HOLOMESH_API_KEY_LEAN_THEORIST_X402=lean-api-key-aaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    ]);
    expect(existsSync(join(result.seatDir, 'wallet.enc'))).toBe(true);
    expect(existsSync(join(result.seatDir, 'registration.json'))).toBe(true);
    expect(existsSync(join(seatsRoot, '.master-key'))).toBe(true);

    const walletBlob = JSON.parse(readFileSync(join(result.seatDir, 'wallet.enc'), 'utf8'));
    expect(walletBlob.encrypted_privkey.alg).toBe('aes-256-gcm');
    expect(walletBlob.address).toBe(result.walletAddress);
    expect(JSON.stringify(walletBlob)).not.toContain('privateKey');

    expect(calls).toHaveLength(2);
  });

  it('refuses to overwrite an existing seat (F.002 wallets sacred — never rotate identity)', async () => {
    const seatsRoot = mkdtempSync(join(tmpdir(), 'prov-no-overwrite-'));
    const first = await provisionAgent(
      { handle: 'security-auditor', founderBearer: 'b', seatsRoot, fetchImpl: mockFetch({}) },
      { execute: true }
    );
    expect(first.status).toBe('executed');

    const second = await provisionAgent(
      { handle: 'security-auditor', founderBearer: 'b', seatsRoot, fetchImpl: mockFetch({}) },
      { execute: true }
    );
    expect(second.status).toBe('reused');
    if (second.status !== 'reused') return;
    expect(second.walletAddress).toBe((first as { walletAddress: string }).walletAddress);
  });

  it('rejects shell-injection-vector handles', async () => {
    await expect(
      provisionAgent({ handle: 'bad; rm -rf /', founderBearer: 'b' }, { execute: false })
    ).rejects.toThrow(/handle/);
  });

  it('throws clearly when /register/challenge fails (no silent retry)', async () => {
    const seatsRoot = mkdtempSync(join(tmpdir(), 'prov-fail-'));
    const fetchImpl = mockFetch({
      challenge: () => ({ status: 503, json: { error: 'service unavailable' } }),
    });
    await expect(
      provisionAgent(
        { handle: 'failing-agent', founderBearer: 'b', seatsRoot, fetchImpl },
        { execute: true }
      )
    ).rejects.toThrow(/register\/challenge.*503/);
  });

  it('throws when /register returns 201 but no agent.api_key (server contract regression)', async () => {
    const seatsRoot = mkdtempSync(join(tmpdir(), 'prov-half-'));
    const fetchImpl = mockFetch({
      register: () => ({ status: 201, json: { agent: { id: 'a1' } } }),
    });
    await expect(
      provisionAgent(
        { handle: 'half-registered', founderBearer: 'b', seatsRoot, fetchImpl },
        { execute: true }
      )
    ).rejects.toThrow(/agent\.api_key/);
  });

  it('rejects empty founderBearer (caller misconfigured the script)', async () => {
    await expect(
      provisionAgent({ handle: 'a', founderBearer: '' }, { execute: false })
    ).rejects.toThrow(/founderBearer/);
  });
});
