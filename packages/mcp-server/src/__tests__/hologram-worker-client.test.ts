import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { callHologramWorkerRender, isHologramWorkerConfigured } from '../hologram-worker-client';

describe('hologram-worker-client', () => {
  const prevUrl = process.env.HOLOGRAM_WORKER_URL;
  const prevIngress = process.env.HOLOGRAM_WORKER_INGRESS_TOKEN;
  const prevFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.HOLOGRAM_WORKER_URL = 'https://worker.test';
    delete process.env.HOLOGRAM_WORKER_INGRESS_TOKEN;
  });

  afterEach(() => {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) delete process.env.HOLOGRAM_WORKER_URL;
    else process.env.HOLOGRAM_WORKER_URL = prevUrl;
    if (prevIngress === undefined) delete process.env.HOLOGRAM_WORKER_INGRESS_TOKEN;
    else process.env.HOLOGRAM_WORKER_INGRESS_TOKEN = prevIngress;
  });

  it('isHologramWorkerConfigured reflects env', () => {
    expect(isHologramWorkerConfigured()).toBe(true);
    delete process.env.HOLOGRAM_WORKER_URL;
    expect(isHologramWorkerConfigured()).toBe(false);
  });

  it('callHologramWorkerRender posts JSON and maps response', async () => {
    process.env.HOLOGRAM_WORKER_URL = 'https://worker.test/base/';
    process.env.HOLOGRAM_WORKER_INGRESS_TOKEN = 'secret';

    globalThis.fetch = vi.fn(
      async (url: string | URL, init?: RequestInit) => {
        expect(String(url)).toBe('https://worker.test/base/render');
        expect(init?.method).toBe('POST');
        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe('Bearer secret');
        const body = JSON.parse((init?.body as string) ?? '{}');
        expect(body.mediaType).toBe('image');
        expect(body.targets).toEqual(['quilt']);
        return new Response(
          JSON.stringify({
            hash: 'abc',
            shareUrl: 'https://x/s',
            quiltUrl: 'https://x/q',
            mvhevcUrl: 'https://x/m',
            targets: ['quilt'],
          }),
          { status: 200 },
        );
      },
    ) as typeof fetch;

    const r = await callHologramWorkerRender({
      sourceUrl: 'https://src/img.png',
      mediaType: 'image',
      targets: ['quilt'],
    });
    expect(r.hash).toBe('abc');
    expect(r.quiltUrl).toContain('q');
  });

  it('throws when worker URL missing', async () => {
    delete process.env.HOLOGRAM_WORKER_URL;
    await expect(
      callHologramWorkerRender({
        sourceBase64: 'QQ==',
        mediaType: 'image',
        targets: ['quilt'],
      }),
    ).rejects.toThrow('HOLOGRAM_WORKER_URL');
  });
});
