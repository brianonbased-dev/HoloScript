import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

// The route posts under HoloScript's own Moltbook account, so only a founder may use it
// (board task x0iv). An invited, signed-in Studio user who is not a founder must be refused
// before anything reaches Moltbook.
const { requireAuthStub, requireFounderStub } = vi.hoisted(() => ({
  requireAuthStub: vi.fn(),
  requireFounderStub: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  requireAuth: requireAuthStub,
  requireFounder: requireFounderStub,
}));

vi.mock('@holoscript/config', () => ({
  ENDPOINTS: { MOLTBOOK_API: 'https://moltbook.test/api' },
  getMoltbookKey: () => 'moltbook-test-key',
}));

const INVITED_SESSION = { user: { id: 'invited-user', email: 'invited@example.com' } };
const FOUNDER_SESSION = { user: { id: 'founder', email: 'founder@example.com' } };

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/social/crosspost/moltbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/social/crosspost/moltbook is founder-only', () => {
  const fetchStub = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    requireAuthStub.mockReset();
    requireFounderStub.mockReset();
    fetchStub.mockReset();
    fetchStub.mockResolvedValue(
      new Response(JSON.stringify({ id: 'post-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refuses a signed-in user who is not a founder, and posts nothing', async () => {
    // Signed in (requireAuth would let them through), but not a founder.
    requireAuthStub.mockResolvedValue(INVITED_SESSION);
    requireFounderStub.mockResolvedValue(
      NextResponse.json({ error: 'Founder access required' }, { status: 403 })
    );
    const { POST } = await import('../route');

    const response = await POST(postRequest({ title: 'Not HoloScript', content: 'spam' }));

    expect(response.status).toBe(403);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it('lets a founder post under the Moltbook key', async () => {
    requireAuthStub.mockResolvedValue(FOUNDER_SESSION);
    requireFounderStub.mockResolvedValue(FOUNDER_SESSION);
    const { POST } = await import('../route');

    const response = await POST(postRequest({ title: 'Release notes', content: 'hello' }));

    expect(response.status).toBeLessThan(400);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    const [, init] = fetchStub.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer moltbook-test-key');
  });
});
