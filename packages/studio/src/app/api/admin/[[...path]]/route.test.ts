/**
 * Doors audit 2026-09-15: /api/admin/[[...path]].
 *
 * This proxy had no gate of any kind, and the credential it attached fell back
 * to a SERVER personal access token when the caller sent none. Outside
 * production — or anywhere STUDIO_ALLOW_SERVER_GITHUB_TOKEN_FALLBACK is set —
 * an unauthenticated stranger reached the admin API upstream carrying our PAT
 * as Bearer. The upstream decides who is an admin by asking GitHub who the
 * token belongs to, so handing it ours answered its question with our name.
 *
 * Two separate faults, so two separate tests: who may call, and whose
 * credential gets attached when they do.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const gate = vi.hoisted(() => ({
  requireFounder: vi.fn(),
  forwardAuthHeaders: vi.fn(() => ({}) as Record<string, string>),
}));

const identity = vi.hoisted(() => ({ getGitHubToken: vi.fn() }));

vi.mock('@/lib/api-auth', () => ({
  requireFounder: gate.requireFounder,
  forwardAuthHeaders: gate.forwardAuthHeaders,
}));

vi.mock('../../github/_shared', () => ({
  getGitHubToken: identity.getGitHubToken,
}));

const SERVER_PAT = 'server-pat-that-must-never-travel-for-a-stranger';
const ADMIN_URL = 'https://studio.test/api/admin/projects';

let outbound: ReturnType<typeof vi.fn>;

function adminRequest(headers: Record<string, string> = {}, method = 'GET') {
  return new NextRequest(ADMIN_URL, { method, headers });
}

function signedOut() {
  gate.requireFounder.mockResolvedValue(
    NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  );
}

function notTheFounder() {
  gate.requireFounder.mockResolvedValue(
    NextResponse.json({ error: 'Founder access required' }, { status: 403 })
  );
}

function founder() {
  gate.requireFounder.mockResolvedValue({
    user: { id: 'founder-1', name: 'Founder', email: null, image: null, githubUsername: 'founder' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gate.forwardAuthHeaders.mockReturnValue({});
  identity.getGitHubToken.mockResolvedValue(null);
  outbound = vi.fn(async () => Response.json({ ok: true }));
  vi.stubGlobal('fetch', outbound);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('/api/admin — who may call', () => {
  it('refuses a caller with no session and sends nothing upstream', async () => {
    signedOut();
    const { GET } = await import('./route');

    const response = await GET(adminRequest());

    expect(response.status).toBe(401);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('refuses a signed-in caller who is not the founder', async () => {
    notTheFounder();
    const { POST } = await import('./route');

    const response = await POST(adminRequest({}, 'POST'));

    expect(response.status).toBe(403);
    expect(outbound).not.toHaveBeenCalled();
  });

  it('lets the founder through', async () => {
    founder();
    const { GET } = await import('./route');

    const response = await GET(adminRequest());

    expect(response.status).toBe(200);
    expect(outbound).toHaveBeenCalledTimes(1);
  });
});

describe('/api/admin — whose credential travels', () => {
  it('never attaches a server token for a caller who presented none', async () => {
    founder();
    // The old code called this without `userOnly`, so it fell through to
    // PERSONAL_ACCESS_TOKEN / PAT_TOKEN / GITHUB_TOKEN. Asking user-only is
    // what makes that fall-through unreachable.
    identity.getGitHubToken.mockImplementation(
      async (_req: unknown, options: { userOnly?: boolean } = {}) =>
        options.userOnly ? null : SERVER_PAT
    );
    const { GET } = await import('./route');

    await GET(adminRequest());

    expect(identity.getGitHubToken).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userOnly: true })
    );
    const sent = outbound.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(JSON.stringify(sent.headers ?? {})).not.toContain(SERVER_PAT);
  });

  it("forwards the caller's own Authorization header when they sent one", async () => {
    founder();
    gate.forwardAuthHeaders.mockReturnValue({ Authorization: 'Bearer callers-own-token' });
    const { GET } = await import('./route');

    await GET(adminRequest({ authorization: 'Bearer callers-own-token' }));

    const sent = outbound.mock.calls[0]?.[1] as { headers?: Record<string, string> };
    expect(sent.headers?.Authorization).toBe('Bearer callers-own-token');
    // When the caller identified themselves we never reach for anything else.
    expect(identity.getGitHubToken).not.toHaveBeenCalled();
  });
});
