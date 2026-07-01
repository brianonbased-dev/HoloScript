import { createHash } from 'crypto';

export interface ProtocolPublishResult {
  contentHash: string;
  publish: Record<string, unknown> | null;
  revenue: Record<string, unknown> | null;
  error?: string;
}

export interface NoAppWebxrPublishReceipt {
  id: string;
  sceneId: string;
  url: string;
  webxrUrl: string;
  shortUrl: string;
  viewUrl: string;
  embedUrl: string;
  contentHash: string;
  traits: string[];
  visibility: string;
  revenue: Record<string, unknown> | null;
  protocol: ProtocolPublishResult | null;
  launch: {
    mode: 'no-app-webxr';
    noAppInstall: true;
    runtime: 'studio-webxr-viewer';
    sourceFormat: 'holo';
    supportedClients: string[];
    migrationGuide: string;
  };
  qrCode: {
    format: 'png-data-url';
    payload: string;
    dataUrl: string;
    errorCorrectionLevel: 'M';
    receiptId: string;
  };
  share: {
    title: string;
    text: string;
    url: string;
    webxrUrl: string;
  };
  custody: {
    issuedAt: string;
    expiresAt: string;
    ttlSeconds: number;
    hostedBy: 'holoscript-studio';
    custodySurface: 'HoloKey';
    hologateScope: string;
    concreteSurfaces: string[];
  };
  receipts: {
    compileReceiptId: string;
    hostReceiptId: string;
    qrReceiptId: string;
    shareReceiptId: string;
    customDomainReceiptId: string | null;
  };
  customDomain: {
    requestedDomain: string;
    status: 'pending_dns_verification';
    mappedUrl: string;
    receiptId: string;
  } | null;
  migration: {
    from: '8th-wall-hosted-retirement';
    hostedPlatformRetiredAt: '2026-02-28';
    existingExperiencesLiveUntil: '2027-02-28';
    replacementPath: string;
    runtimeAdopted: 'holoscript-studio-webxr';
    runtimeNotAdopted: '8th-wall-runtime';
  };
}

export const NO_APP_WEBXR_TTL_SECONDS = 7 * 24 * 60 * 60;

export function contentHashForCode(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

function receiptId(kind: string, contentHash: string, id: string, extra = ''): string {
  return `hs-${kind}-${createHash('sha256')
    .update(`${kind}:${contentHash}:${id}:${extra}`)
    .digest('hex')
    .slice(0, 16)}`;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '');
}

function bodyString(body: Record<string, unknown>, key: string): string | null {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function normalizeCustomDomain(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withoutProtocol = trimmed
    .replace(/^https?:\/\//i, '')
    .split('/')[0]
    ?.toLowerCase();
  if (!withoutProtocol || withoutProtocol.length > 253) return null;
  if (
    !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
      withoutProtocol
    )
  ) {
    return null;
  }
  return withoutProtocol;
}

export async function buildNoAppWebxrPublishReceipt(input: {
  body: Record<string, unknown>;
  protocol: ProtocolPublishResult | null;
  baseUrl: string;
  id: string;
  now?: Date;
  ttlSeconds?: number;
}): Promise<NoAppWebxrPublishReceipt> {
  const { body, protocol, id } = input;
  const baseUrl = normalizeBaseUrl(input.baseUrl);
  const now = input.now ?? new Date();
  const ttlSeconds = input.ttlSeconds ?? NO_APP_WEBXR_TTL_SECONDS;
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
  const code = bodyString(body, 'code') ?? '';
  const title = bodyString(body, 'title') ?? bodyString(body, 'name') ?? `HoloScript World ${id}`;
  const description =
    typeof body.metadata === 'object' &&
    body.metadata !== null &&
    typeof (body.metadata as { description?: unknown }).description === 'string'
      ? (body.metadata as { description: string }).description
      : 'Open this HoloScript world in a phone, desktop, or headset browser without installing an app.';
  const traits = [...new Set(code.match(/@\w+/g) ?? [])];
  const visibility = bodyString(body, 'visibility') ?? 'public';
  const contentHash = protocol?.contentHash ?? contentHashForCode(code);
  const shortUrl = `${baseUrl}/w/${id}`;
  const webxrUrl = shortUrl;
  const viewUrl = `${baseUrl}/view/${id}`;
  const embedUrl = `${baseUrl}/embed/${id}`;
  const customDomain = normalizeCustomDomain(body.customDomain);
  const customDomainReceiptId = customDomain
    ? receiptId('domain', contentHash, id, customDomain)
    : null;
  const qr = await import('qrcode');
  const qrDataUrl = await qr.toDataURL(webxrUrl, {
    width: 256,
    margin: 2,
    errorCorrectionLevel: 'M',
  });

  return {
    id,
    sceneId: id,
    url: webxrUrl,
    webxrUrl,
    shortUrl,
    viewUrl,
    embedUrl,
    contentHash,
    traits,
    visibility,
    revenue: protocol?.revenue ?? null,
    protocol,
    launch: {
      mode: 'no-app-webxr',
      noAppInstall: true,
      runtime: 'studio-webxr-viewer',
      sourceFormat: 'holo',
      supportedClients: ['phone-browser', 'desktop-browser', 'headset-browser'],
      migrationGuide: 'docs/guides/no-app-webxr-publish.md',
    },
    qrCode: {
      format: 'png-data-url',
      payload: webxrUrl,
      dataUrl: qrDataUrl,
      errorCorrectionLevel: 'M',
      receiptId: receiptId('qr', contentHash, id),
    },
    share: {
      title,
      text: description,
      url: webxrUrl,
      webxrUrl,
    },
    custody: {
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      ttlSeconds,
      hostedBy: 'holoscript-studio',
      custodySurface: 'HoloKey',
      hologateScope:
        'HoloGate is the docs umbrella term; this receipt names concrete HoloKey custody, umbrella routing, QR/share, custom-domain, and triad receipt surfaces.',
      concreteSurfaces: [
        'HoloKey custody',
        'umbrella routing',
        'triad receipt',
        'Studio WebXR viewer',
        'local QR data URL',
        'custom-domain mapping receipt',
      ],
    },
    receipts: {
      compileReceiptId: receiptId('compile-webxr', contentHash, id),
      hostReceiptId: receiptId('host-webxr', contentHash, id),
      qrReceiptId: receiptId('qr', contentHash, id),
      shareReceiptId: receiptId('share', contentHash, id),
      customDomainReceiptId,
    },
    customDomain: customDomain
      ? {
          requestedDomain: customDomain,
          status: 'pending_dns_verification',
          mappedUrl: `https://${customDomain}/w/${id}`,
          receiptId: customDomainReceiptId as string,
        }
      : null,
    migration: {
      from: '8th-wall-hosted-retirement',
      hostedPlatformRetiredAt: '2026-02-28',
      existingExperiencesLiveUntil: '2027-02-28',
      replacementPath:
        'Publish .holo from Studio, open the returned /w/:id WebXR URL, scan the local QR code, and optionally bind a custom domain after DNS verification.',
      runtimeAdopted: 'holoscript-studio-webxr',
      runtimeNotAdopted: '8th-wall-runtime',
    },
  };
}
