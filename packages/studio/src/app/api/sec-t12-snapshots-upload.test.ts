/**
 * SEC-T12 — snapshot POST gates (size, image allowlist).
 */
import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from './snapshots/route';

describe('SEC-T12 POST /api/snapshots', () => {
  it('rejects bodies over Content-Length budget', async () => {
    const req = new NextRequest('http://localhost/api/snapshots', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(40 * 1024 * 1024),
      },
      body: JSON.stringify({ sceneId: 's1', dataUrl: '', code: '' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
  });

  it('rejects disallowed data URL MIME (SVG)', async () => {
    const req = new NextRequest('http://localhost/api/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sceneId: 's1',
        dataUrl: 'data:image/svg+xml;base64,PHN2Zy8+',
        code: '',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const j = (await res.json()) as { error?: string };
    expect(j.error).toMatch(/png|jpeg|webp|gif/i);
  });

  it('accepts small PNG data URL for in-memory store', async () => {
    const tinyPng =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const req = new NextRequest('http://localhost/api/snapshots', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        sceneId: 'sec-t12-test-scene',
        label: 't',
        dataUrl: tinyPng,
        code: 'composition "X" {}',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const j = (await res.json()) as { snapshot?: { dataUrl?: string } };
    expect(j.snapshot?.dataUrl).toBe(tinyPng);
  });
});
