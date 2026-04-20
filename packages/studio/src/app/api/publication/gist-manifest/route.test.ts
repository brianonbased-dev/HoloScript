import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './route';

describe('POST /api/publication/gist-manifest — x402 tiers', () => {
  const baseBody = { room: 'room-x', loroDocVersion: { Frontiers: 'v1' } };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('legacy GIST_MANIFEST_REQUIRE_X402 implies required tier', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', '');
    vi.stubEnv('GIST_MANIFEST_REQUIRE_X402', 'true');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify(baseBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
  });

  it('tier off allows missing x402Receipt', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', 'off');
    vi.stubEnv('GIST_MANIFEST_REQUIRE_X402', '');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify(baseBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { manifest: { x402_receipt?: unknown } };
    expect(j.manifest.x402_receipt).toBeUndefined();
  });

  it('tier required returns 402 without receipt', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', 'required');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify(baseBody),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
  });

  it('tier strict returns 402 when payment_id or network missing', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', 'strict');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify({
        ...baseBody,
        x402Receipt: { tx_hash: '0xabc' },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(402);
  });

  it('tier strict succeeds with payment_id and network', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', 'strict');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify({
        ...baseBody,
        x402Receipt: { payment_id: 'pay_1', network: 'base' },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { manifest: { x402_receipt?: { payment_id?: string } } };
    expect(j.manifest.x402_receipt?.payment_id).toBe('pay_1');
  });

  it('embeds film3dAttestation into manifest', async () => {
    vi.stubEnv('GIST_MANIFEST_X402_TIER', 'off');

    const req = new NextRequest('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      body: JSON.stringify({
        ...baseBody,
        film3dAttestation: {
          scheme: 'webxr-session-v0',
          session_id: 'sess_test',
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as {
      manifest: { film3d_attestation?: { scheme?: string; session_id?: string } };
    };
    expect(j.manifest.film3d_attestation?.scheme).toBe('webxr-session-v0');
    expect(j.manifest.film3d_attestation?.session_id).toBe('sess_test');
  });
});
