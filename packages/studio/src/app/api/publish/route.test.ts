import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { NoAppWebxrPublishReceipt } from '@/lib/publish/noAppWebxrPublish';

vi.mock('@/db/client', () => ({
  getDb: () => null,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(),
}));

describe('POST /api/publish no-app WebXR receipt', () => {
  let originalCwd: string;
  let originalProtocolUrl: string | undefined;
  let tempDir: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalProtocolUrl = process.env.HOLOSCRIPT_PROTOCOL_URL;
    tempDir = await mkdtemp(join(tmpdir(), 'studio-publish-route-'));
    process.chdir(tempDir);
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.DATABASE_URL;
    process.env.HOLOSCRIPT_PROTOCOL_URL = 'https://protocol.test';
    const qr = await import('qrcode');
    vi.mocked(
      qr.toDataURL as unknown as (text: string, options?: unknown) => Promise<string>
    ).mockResolvedValue('data:image/png;base64,route-qr');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
        if (href === 'https://protocol.test/api/protocol') {
          return Response.json({ ok: true, receipt: 'protocol-publish' });
        }
        if (href.includes('/api/protocol/revenue/')) {
          return Response.json({ totalPrice: '0', flows: [] });
        }
        return new Response('not found', { status: 404 });
      })
    );
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    if (originalProtocolUrl === undefined) {
      delete process.env.HOLOSCRIPT_PROTOCOL_URL;
    } else {
      process.env.HOLOSCRIPT_PROTOCOL_URL = originalProtocolUrl;
    }
    await rm(tempDir, { recursive: true, force: true });
    vi.unstubAllGlobals();
  });

  it('returns URL, QR, share, custody, and compile/host receipts', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('https://studio.test/api/publish', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://studio.test',
        },
        body: JSON.stringify({
          code: 'composition "Phone Launch" { object "Orb" @grabbable { geometry: "sphere" } }',
          title: 'Phone Launch',
          visibility: 'public',
          customDomain: 'world.example',
          metadata: { description: 'Scan and launch from any WebXR browser.' },
        }),
      })
    );
    const body = (await response.json()) as NoAppWebxrPublishReceipt;

    expect(response.status).toBe(200);
    expect(body.id).toMatch(/^[a-f0-9]{8}$/);
    expect(body.url).toBe(`https://studio.test/w/${body.id}`);
    expect(body.webxrUrl).toBe(body.url);
    expect(body.viewUrl).toBe(`https://studio.test/view/${body.id}`);
    expect(body.qrCode).toMatchObject({
      payload: body.url,
      dataUrl: 'data:image/png;base64,route-qr',
    });
    expect(body.share).toMatchObject({
      title: 'Phone Launch',
      url: body.url,
      webxrUrl: body.url,
    });
    expect(body.custody).toMatchObject({
      custodySurface: 'HoloKey',
      hostedBy: 'holoscript-studio',
    });
    expect(body.receipts.compileReceiptId).toMatch(/^hs-compile-webxr-[a-f0-9]{16}$/);
    expect(body.receipts.hostReceiptId).toMatch(/^hs-host-webxr-[a-f0-9]{16}$/);
    expect(body.customDomain).toMatchObject({
      requestedDomain: 'world.example',
      status: 'pending_dns_verification',
      mappedUrl: `https://world.example/w/${body.id}`,
    });
    expect(body.migration).toMatchObject({
      hostedPlatformRetiredAt: '2026-02-28',
      existingExperiencesLiveUntil: '2027-02-28',
      runtimeNotAdopted: '8th-wall-runtime',
    });
  });
});
