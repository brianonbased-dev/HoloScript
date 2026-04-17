import { afterEach, beforeEach, describe, expect, it } from 'vitest';

describe('gist publication manifest route', () => {
  const originalRequireX402 = process.env.GIST_MANIFEST_REQUIRE_X402;

  beforeEach(() => {
    delete process.env.GIST_MANIFEST_REQUIRE_X402;
  });

  afterEach(() => {
    if (originalRequireX402 === undefined) {
      delete process.env.GIST_MANIFEST_REQUIRE_X402;
    } else {
      process.env.GIST_MANIFEST_REQUIRE_X402 = originalRequireX402;
    }
  });

  it('exports POST handler', async () => {
    const route = await import('../app/api/publication/gist-manifest/route');
    expect(route.POST).toBeDefined();
    expect(typeof route.POST).toBe('function');
  });

  it('rejects missing x402Receipt when tier enforcement is enabled', async () => {
    process.env.GIST_MANIFEST_REQUIRE_X402 = 'true';
    const { POST } = await import('../app/api/publication/gist-manifest/route');

    const req = new Request('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'film3d-room',
        loroDocVersion: { peerA: 1 },
      }),
    });

    const response = await POST(req as never);
    expect(response.status).toBe(402);
    const data = await response.json();
    expect(data.error).toContain('x402Receipt is required');
  });

  it('allows manifest creation without x402Receipt when tier enforcement is disabled', async () => {
    process.env.GIST_MANIFEST_REQUIRE_X402 = 'false';
    const { POST } = await import('../app/api/publication/gist-manifest/route');

    const req = new Request('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'film3d-room',
        loroDocVersion: { peerA: 1 },
        title: 'Film3D publish',
      }),
    });

    const response = await POST(req as never);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.manifest.provenance_receipt.room).toBe('film3d-room');
    expect(data.manifest.x402_receipt).toBeUndefined();
    expect(data.suggestedPath).toBe('.holoscript/gist-publication.manifest.json');
  });

  it('accepts x402Receipt when tier enforcement is enabled', async () => {
    process.env.GIST_MANIFEST_REQUIRE_X402 = '1';
    const { POST } = await import('../app/api/publication/gist-manifest/route');

    const req = new Request('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'film3d-room',
        loroDocVersion: { peerA: 1 },
        x402Receipt: {
          payment_id: 'x402_pay_123',
          network: 'base',
          tx_hash: '0xabc',
        },
      }),
    });

    const response = await POST(req as never);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.manifest.x402_receipt.payment_id).toBe('x402_pay_123');
    expect(data.manifest.x402_receipt.network).toBe('base');
  });

  it('round-trips Film3D xrMetrics into the manifest for attestation review', async () => {
    const { POST } = await import('../app/api/publication/gist-manifest/route');

    const xrMetrics = {
      hitTestCount: 42,
      occlusionProofAcquired: true,
      depthSensingActive: true,
      viewPoseCount: 2,
      gazeLikeInputPresent: true,
    };

    const req = new Request('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'film3d-room-attested',
        loroDocVersion: { peerA: 3, peerB: 1 },
        xrMetrics,
      }),
    });

    const response = await POST(req as never);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.ok).toBe(true);
    expect(data.manifest.xr_metrics).toEqual(xrMetrics);
    expect(data.manifest.provenance_semiring_digest.digest_hex).toHaveLength(64);
    expect(data.json).toContain('occlusionProofAcquired');
    expect(data.json).toContain('hitTestCount');
  });

  it('rejects invalid loroDocVersion payloads', async () => {
    const { POST } = await import('../app/api/publication/gist-manifest/route');

    const req = new Request('http://localhost/api/publication/gist-manifest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: 'film3d-room-invalid',
        loroDocVersion: ['bad'],
      }),
    });

    const response = await POST(req as never);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('loroDocVersion');
  });
});
