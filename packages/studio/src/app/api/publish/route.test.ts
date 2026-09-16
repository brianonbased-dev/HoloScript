import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

import type { NoAppWebxrPublishReceipt } from '@/lib/publish/noAppWebxrPublish';

const { requireAuthStub } = vi.hoisted(() => ({ requireAuthStub: vi.fn() }));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthStub,
}));

vi.mock('@/db/client', () => ({
  getDb: () => null,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: vi.fn() },
}));

vi.mock('qrcode', () => ({
  toDataURL: vi.fn(),
}));

const CALLER_KEY = 'caller-publish-key-sentinel';
const SERVER_KEY = 'srv-publish-key-sentinel';
const PUBLISH_URL = 'https://studio.test/api/publish';

const SCENE_BODY = {
  code: 'composition "Phone Launch" { object "Orb" @grabbable { geometry: "sphere" } }',
  title: 'Phone Launch',
  visibility: 'public',
  customDomain: 'world.example',
  metadata: { description: 'Scan and launch from any WebXR browser.' },
};

function publishRequest(headers: Record<string, string> = {}, body: unknown = SCENE_BODY) {
  return new Request(PUBLISH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: 'https://studio.test',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function signedOut() {
  requireAuthStub.mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function signedIn() {
  requireAuthStub.mockResolvedValue({
    user: {
      id: 'studio-user-1',
      name: 'Studio User',
      email: 'studio-user@example.test',
      image: null,
      githubUsername: 'studio-user',
    },
  });
}

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
    // The caller presents its own key so the request reaches the receipt
    // builder; who may call is covered in the credential-gate cases below.
    const response = await POST(publishRequest({ 'x-mcp-api-key': CALLER_KEY }));
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

/**
 * Doors audit 2026-09-15: POST /api/publish — who may publish, and whose key
 * gets spent.
 *
 * This route had no guard of any kind. It attached Studio's own server key
 * (falling back to the browser-visible NEXT_PUBLIC one) to whatever body
 * arrived and posted it to a real upstream registry, so anyone on the internet
 * could publish as us and fill our scene table doing it.
 *
 * GET is deliberately NOT gated: it serves published scenes to the share
 * viewer, which is the whole point of publishing one.
 */
describe('POST /api/publish — credential gate', () => {
  let originalCwd: string;
  let originalProtocolUrl: string | undefined;
  let tempDir: string;
  let outbound: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    originalProtocolUrl = process.env.HOLOSCRIPT_PROTOCOL_URL;
    tempDir = await mkdtemp(join(tmpdir(), 'studio-publish-gate-'));
    process.chdir(tempDir);
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    delete process.env.DATABASE_URL;
    process.env.HOLOSCRIPT_PROTOCOL_URL = 'https://protocol.test';
    vi.stubEnv('HOLOSCRIPT_API_KEY', SERVER_KEY);
    signedIn();

    const qr = await import('qrcode');
    vi.mocked(
      qr.toDataURL as unknown as (text: string, options?: unknown) => Promise<string>
    ).mockResolvedValue('data:image/png;base64,route-qr');

    outbound = vi.fn(async (url: string | URL | Request) => {
      const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (href.includes('/api/protocol/revenue/')) {
        return Response.json({ totalPrice: '0', flows: [] });
      }
      return Response.json({ ok: true, receipt: 'protocol-publish' });
    });
    vi.stubGlobal('fetch', outbound);
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
    vi.unstubAllEnvs();
  });

  /** Headers of the first upstream publish call. */
  function upstreamHeaders(): Record<string, string> {
    const init = outbound.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    return init?.headers ?? {};
  }

  it('refuses a caller who is neither signed in nor carrying a key, and publishes nothing', async () => {
    signedOut();
    const { POST } = await import('./route');

    const response = await POST(publishRequest());
    const body = (await response.json()) as { error?: string; signInRequired?: boolean };

    expect(response.status).toBe(401);
    expect(body.signInRequired).toBe(true);
    // The refusal names the header that actually works.
    expect(body.error).toContain('x-mcp-api-key');
    // The strongest proof the key did not leak: nothing was sent upstream.
    expect(outbound).not.toHaveBeenCalled();
  });

  it("forwards the caller's own key and attaches no key of ours", async () => {
    signedOut();
    const { POST } = await import('./route');

    const response = await POST(publishRequest({ 'x-mcp-api-key': CALLER_KEY }));

    expect(response.status).toBe(200);
    expect(upstreamHeaders()['x-mcp-api-key']).toBe(CALLER_KEY);
    expect(JSON.stringify(upstreamHeaders())).not.toContain(SERVER_KEY);
    // A caller with their own key is never asked to sign in.
    expect(requireAuthStub).not.toHaveBeenCalled();
  });

  it('sends a bearer key in the header the registry actually reads', async () => {
    signedOut();
    const { POST } = await import('./route');

    const response = await POST(publishRequest({ Authorization: `Bearer ${CALLER_KEY}` }));

    expect(response.status).toBe(200);
    expect(upstreamHeaders()['x-mcp-api-key']).toBe(CALLER_KEY);
    // The old version forwarded the raw header too, where nothing reads it.
    expect(upstreamHeaders().authorization).toBeUndefined();
  });

  it('will not hand a Studio API key to a different service', async () => {
    signedOut();
    const { POST } = await import('./route');

    const response = await POST(publishRequest({ Authorization: 'Bearer bk_studio_key' }));

    expect(response.status).toBe(401);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('publishes for a signed-in caller under the server key', async () => {
    const { POST } = await import('./route');

    const response = await POST(publishRequest());

    expect(response.status).toBe(200);
    expect(upstreamHeaders()['x-mcp-api-key']).toBe(SERVER_KEY);
  });

  it('never falls back to the browser-visible key', async () => {
    vi.stubEnv('HOLOSCRIPT_API_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_MCP_API_KEY', 'browser-bundle-key');
    const { POST } = await import('./route');

    const response = await POST(publishRequest());

    // The scene is still stored — only the registry leg is skipped, and the
    // receipt says so rather than pretending it happened.
    expect(response.status).toBe(200);
    expect(outbound).not.toHaveBeenCalled();
    expect(JSON.stringify(await response.json())).not.toContain('browser-bundle-key');
  });

  it('still serves a published scene to a caller with no credential at all', async () => {
    const { POST, GET } = await import('./route');
    const published = await POST(publishRequest({ 'x-mcp-api-key': CALLER_KEY }));
    const { id } = (await published.json()) as NoAppWebxrPublishReceipt;

    signedOut();
    const response = await GET(new Request(`${PUBLISH_URL}?id=${id}`));

    expect(response.status).toBe(200);
    expect((await response.json()).scene.title).toBe('Phone Launch');
  });
});

type DocumentedOperation = {
  description?: string;
  responses?: Record<string, unknown>;
};

/**
 * An outside agent learns to call this route from /api/docs. A door that fails
 * closed while the spec still says nothing about the credential produces the
 * other half of the same failure: an agent follows the spec exactly, sends
 * nothing, and meets a 401 it cannot diagnose.
 */
describe('GET /api/docs — what /api/publish advertises', () => {
  it('names the credential on the write side and the refusal it produces', async () => {
    const { GET } = await import('../docs/route');
    const spec = (await (await GET()).json()) as {
      paths: Record<string, { post?: DocumentedOperation; get?: DocumentedOperation }>;
    };
    const publish = spec.paths['/api/publish'];

    expect(publish.post?.description).toContain('x-mcp-api-key');
    expect(publish.post?.responses?.['401']).toBeDefined();
  });

  it('says the read side is open on purpose, so nobody gates it by mistake', async () => {
    const { GET } = await import('../docs/route');
    const spec = (await (await GET()).json()) as {
      paths: Record<string, { get?: DocumentedOperation }>;
    };

    expect(spec.paths['/api/publish'].get?.description).toContain('No credential required');
  });
});
