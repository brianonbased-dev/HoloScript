/**
 * SEC-T03: paid LLM routes must return 401 when there is no authenticated session.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { NextRequest } from 'next/server';

const { requireAuthMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthMock,
}));

import { POST as postGenerate } from './generate/route';
import { POST as postVoiceToHolo } from './voice-to-holo/route';
import { POST as postMaterialGenerate } from './material/generate/route';
import { POST as postAutocomplete } from './autocomplete/route';
import { POST as postBrittney } from './brittney/route';

describe('SEC-T03 LLM routes — unauthenticated POST', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(
      NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    );
  });

  it('POST /api/generate returns 401', async () => {
    const req = new NextRequest('http://localhost/api/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'test' }),
    });
    const res = await postGenerate(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/voice-to-holo returns 401', async () => {
    const req = new NextRequest('http://localhost/api/voice-to-holo', {
      method: 'POST',
      body: JSON.stringify({ utterance: 'hello' }),
    });
    const res = await postVoiceToHolo(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/material/generate returns 401', async () => {
    const req = new NextRequest('http://localhost/api/material/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt: 'gold metal' }),
    });
    const res = await postMaterialGenerate(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/autocomplete returns 401', async () => {
    const req = new NextRequest('http://localhost/api/autocomplete', {
      method: 'POST',
      body: JSON.stringify({ prefix: 'composition ' }),
    });
    const res = await postAutocomplete(req);
    expect(res.status).toBe(401);
  });

  it('POST /api/brittney returns 401', async () => {
    const req = new NextRequest('http://localhost/api/brittney', {
      method: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
    });
    const res = await postBrittney(req);
    expect(res.status).toBe(401);
  });
});
