import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as qrcode from 'qrcode';

import {
  buildNoAppWebxrPublishReceipt,
  contentHashForCode,
  normalizeCustomDomain,
} from './noAppWebxrPublish';

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(),
}));

const toDataURL = vi.mocked(
  qrcode.toDataURL as unknown as (text: string, options?: unknown) => Promise<string>
);

describe('buildNoAppWebxrPublishReceipt', () => {
  beforeEach(() => {
    toDataURL.mockReset();
    toDataURL.mockResolvedValue('data:image/png;base64,local-qr');
  });

  it('emits no-app WebXR URL, QR, share, custody, and receipt metadata', async () => {
    const code = `composition "Launchable World" {
  object "Orb" @grabbable {
    geometry: "sphere"
  }
}`;
    const receipt = await buildNoAppWebxrPublishReceipt({
      body: {
        code,
        title: 'Launchable World',
        visibility: 'unlisted',
        customDomain: 'https://World.Example/welcome',
        metadata: { description: 'A browser-native WebXR world.' },
      },
      protocol: null,
      baseUrl: 'https://studio.test/',
      id: 'abc123ef',
      now: new Date('2026-07-01T12:00:00.000Z'),
      ttlSeconds: 60,
    });

    expect(receipt.url).toBe('https://studio.test/w/abc123ef');
    expect(receipt.webxrUrl).toBe(receipt.url);
    expect(receipt.shortUrl).toBe(receipt.url);
    expect(receipt.viewUrl).toBe('https://studio.test/view/abc123ef');
    expect(receipt.embedUrl).toBe('https://studio.test/embed/abc123ef');
    expect(receipt.contentHash).toBe(contentHashForCode(code));
    expect(receipt.traits).toEqual(['@grabbable']);
    expect(receipt.visibility).toBe('unlisted');
    expect(receipt.launch).toMatchObject({
      mode: 'no-app-webxr',
      noAppInstall: true,
      runtime: 'studio-webxr-viewer',
    });
    expect(receipt.qrCode).toMatchObject({
      format: 'png-data-url',
      payload: receipt.url,
      dataUrl: 'data:image/png;base64,local-qr',
      errorCorrectionLevel: 'M',
    });
    expect(toDataURL).toHaveBeenCalledWith(
      receipt.url,
      expect.objectContaining({ width: 256, margin: 2, errorCorrectionLevel: 'M' })
    );
    expect(receipt.share).toEqual({
      title: 'Launchable World',
      text: 'A browser-native WebXR world.',
      url: receipt.url,
      webxrUrl: receipt.url,
    });
    expect(receipt.custody).toMatchObject({
      issuedAt: '2026-07-01T12:00:00.000Z',
      expiresAt: '2026-07-01T12:01:00.000Z',
      ttlSeconds: 60,
      hostedBy: 'holoscript-studio',
      custodySurface: 'HoloKey',
    });
    expect(receipt.custody.hologateScope).toContain('docs umbrella');
    expect(receipt.receipts.compileReceiptId).toMatch(/^hs-compile-webxr-[a-f0-9]{16}$/);
    expect(receipt.receipts.hostReceiptId).toMatch(/^hs-host-webxr-[a-f0-9]{16}$/);
    expect(receipt.receipts.shareReceiptId).toMatch(/^hs-share-[a-f0-9]{16}$/);
    expect(receipt.customDomain).toEqual({
      requestedDomain: 'world.example',
      status: 'pending_dns_verification',
      mappedUrl: 'https://world.example/w/abc123ef',
      receiptId: receipt.receipts.customDomainReceiptId,
    });
    expect(receipt.migration).toMatchObject({
      hostedPlatformRetiredAt: '2026-02-28',
      existingExperiencesLiveUntil: '2027-02-28',
      runtimeNotAdopted: '8th-wall-runtime',
    });
  });

  it('leaves custom-domain mapping null when no valid domain is requested', async () => {
    const receipt = await buildNoAppWebxrPublishReceipt({
      body: { code: '', customDomain: 'not a domain' },
      protocol: null,
      baseUrl: 'https://studio.test',
      id: 'deadbeef',
      now: new Date('2026-07-01T12:00:00.000Z'),
    });

    expect(receipt.customDomain).toBeNull();
    expect(receipt.receipts.customDomainReceiptId).toBeNull();
  });
});

describe('normalizeCustomDomain', () => {
  it('normalizes hostnames without accepting paths as domains', () => {
    expect(normalizeCustomDomain('https://World.Example/path')).toBe('world.example');
    expect(normalizeCustomDomain('sub.domain.example')).toBe('sub.domain.example');
    expect(normalizeCustomDomain('localhost')).toBeNull();
    expect(normalizeCustomDomain('not a domain')).toBeNull();
  });
});
