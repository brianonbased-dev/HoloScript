import { readFileSync, readdirSync, statSync } from 'fs';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
// The real mcp-server verifier (#578): proves the minted assertion matches the contract.
import {
  verifyStudioConsent,
  resetConsentReplayGuard,
} from '../../../../../../../mcp-server/src/security/studio-consent';

const { sessionMock } = vi.hoisted(() => ({ sessionMock: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next-auth', () => ({ getServerSession: sessionMock }));
vi.mock('@/lib/auth', () => ({ authOptions: {} }));

import { POST } from '../route';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const fields = {
  client_id: 'hsc_test',
  redirect_uri: 'http://127.0.0.1:7777/cb',
  code_challenge: 'abc123challenge',
  code_challenge_method: 'S256',
  scope: 'tools:read user:private',
  state: 'st-1',
  csrf_token: 'csrf-from-get',
};

function formReq(body: Record<string, string>, headers: Record<string, string> = {}) {
  return new NextRequest('http://studio.local/api/oauth/consent', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      host: 'studio.local',
      origin: 'http://studio.local',
      ...headers,
    },
    body: new URLSearchParams(body).toString(),
  });
}

function jsonReq(body: Record<string, string>) {
  return new NextRequest('http://studio.local/api/oauth/consent', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      host: 'studio.local',
      origin: 'http://studio.local',
    },
    body: JSON.stringify(body),
  });
}

describe('POST /api/oauth/consent', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.STUDIO_CONSENT_SECRET = SECRET;
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    process.env.NEXTAUTH_URL = 'http://studio.local';
    resetConsentReplayGuard();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.STUDIO_CONSENT_SECRET;
    delete process.env.MCP_SERVER_URL;
    vi.unstubAllGlobals();
  });

  it('signed-out: redirects to sign-in and never calls mcp-server', async () => {
    sessionMock.mockResolvedValue(null);
    const res = await POST(formReq({ ...fields, decision: 'approve' }));
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.pathname).toBe('/auth/signin');
    expect(loc.searchParams.get('callbackUrl')).toMatch(/^\/oauth\/consent\?/);
    expect(loc.searchParams.get('callbackUrl')).not.toContain('csrf');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('approve: POSTs every field with studio_consent in the body only, then redirects with the code', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: 'CODE1', state: 'st-1' }), { status: 200 })
    );
    const res = await POST(formReq({ ...fields, decision: 'approve' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://mcp.test/oauth/authorize');
    expect(url).not.toContain('studio_consent');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      client_id: 'hsc_test',
      redirect_uri: 'http://127.0.0.1:7777/cb',
      code_challenge: 'abc123challenge',
      code_challenge_method: 'S256',
      scope: 'tools:read user:private',
      state: 'st-1',
      csrf_token: 'csrf-from-get',
      decision: 'approve',
    });
    // mcp-server's own verifier accepts it, bound to this user and client.
    const v = verifyStudioConsent(body.studio_consent, 'hsc_test', SECRET);
    expect(v?.userId).toBe('user-42');
    expect(v?.scopes).toEqual(['tools:read', 'user:private']);
    expect(v?.grantId).toMatch(/^grant_/);
    expect(verifyStudioConsent(body.studio_consent, 'other_client', SECRET)).toBeNull();

    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('http://127.0.0.1:7777/cb');
    expect(loc.searchParams.get('code')).toBe('CODE1');
    expect(loc.searchParams.get('state')).toBe('st-1');
    expect(res.headers.get('location')).not.toContain('studio_consent');
  });

  it('never leaks the secret or the assertion in any response', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'login_required', error_description: 'nope' }), {
        status: 401,
      })
    );
    const res = await POST(formReq({ ...fields, decision: 'approve' }));
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body).studio_consent as string;
    const text = await res.text();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('login_required');
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(sent);
    expect(res.headers.get('location') ?? '').not.toContain(sent);
  });

  it('no secret configured: refuses (503) without calling mcp-server', async () => {
    delete process.env.STUDIO_CONSENT_SECRET;
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
    const res = await POST(jsonReq({ ...fields, decision: 'approve' }));
    expect(res.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('deny: sends no assertion and redirects only after mcp-server confirms access_denied', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'access_denied' }), { status: 400 })
    );
    const res = await POST(formReq({ ...fields, decision: 'deny' }));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.studio_consent).toBeUndefined();
    expect(body.decision).toBe('deny');
    expect(new URL(res.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
  });

  it('missing Origin is refused (403) before the session or mcp-server is touched', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    const r = formReq({ ...fields, decision: 'approve' });
    r.headers.delete('origin');
    const res = await POST(r);
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a forged Host / X-Forwarded-Host matching an attacker Origin is refused', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-1' } });
    const res = await POST(
      formReq(
        { ...fields, decision: 'approve' },
        { origin: 'https://evil.example', host: 'evil.example', 'x-forwarded-host': 'evil.example' }
      )
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('cross-origin POST is refused', async () => {
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
    const res = await POST(
      formReq({ ...fields, decision: 'approve' }, { origin: 'https://evil.example' })
    );
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('secret stays server-side', () => {
  it('no client component or NEXT_PUBLIC var references the consent secret or signer', () => {
    const root = path.resolve(__dirname, '../../../../..'); // packages/studio/src
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (f === 'node_modules' || f === '__tests__') continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(tsx?|jsx?)$/.test(f) && !/\.test\./.test(f)) {
          const s = readFileSync(p, 'utf8');
          if (/NEXT_PUBLIC_STUDIO_CONSENT/.test(s)) offenders.push(p);
          if (
            /^\s*['"]use client['"]/m.test(s) &&
            /STUDIO_CONSENT_SECRET|studioConsent\.server/.test(s)
          )
            offenders.push(p);
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
    const page = readFileSync(path.join(root, 'app/oauth/consent/page.tsx'), 'utf8');
    expect(page).not.toMatch(/signStudioConsent|getStudioConsentSecret|STUDIO_CONSENT_SECRET/);
  });
});

describe('POST /api/oauth/consent: form-post errors go back to the page', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    process.env.STUDIO_CONSENT_SECRET = SECRET;
    process.env.MCP_SERVER_URL = 'https://mcp.test';
    process.env.NEXTAUTH_URL = 'http://studio.local';
    resetConsentReplayGuard();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    sessionMock.mockResolvedValue({ user: { id: 'user-42' } });
  });
  afterEach(() => {
    delete process.env.NEXTAUTH_URL;
    delete process.env.STUDIO_CONSENT_SECRET;
    delete process.env.MCP_SERVER_URL;
    vi.unstubAllGlobals();
  });

  function backTo(res: Response): URL {
    expect(res.status).toBe(303);
    const loc = new URL(res.headers.get('location')!);
    expect(loc.origin + loc.pathname).toBe('http://studio.local/oauth/consent');
    return loc;
  }

  it('upstream refusal: 303 to /oauth/consent with the request fields and error, no csrf', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_scope', error_description: 'x' }), {
        status: 400,
      })
    );
    const loc = backTo(await POST(formReq({ ...fields, decision: 'approve' })));
    expect(loc.searchParams.get('error')).toBe('invalid_scope');
    expect(loc.searchParams.get('client_id')).toBe('hsc_test');
    expect(loc.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:7777/cb');
    expect(loc.searchParams.get('scope')).toBe('tools:read user:private');
    expect(loc.searchParams.get('state')).toBe('st-1');
    expect(loc.searchParams.has('csrf_token')).toBe(false);
  });

  it('missing csrf_token: 303 back with error=invalid_request, mcp-server untouched', async () => {
    const { csrf_token: _drop, ...noCsrf } = fields;
    const loc = backTo(await POST(formReq({ ...noCsrf, decision: 'approve' })));
    expect(loc.searchParams.get('error')).toBe('invalid_request');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no secret: 303 back with error=consent_unavailable', async () => {
    delete process.env.STUDIO_CONSENT_SECRET;
    const loc = backTo(await POST(formReq({ ...fields, decision: 'approve' })));
    expect(loc.searchParams.get('error')).toBe('consent_unavailable');
  });

  it('JSON callers are unchanged: they still get the JSON error and status', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_scope', error_description: 'x' }), {
        status: 400,
      })
    );
    const res = await POST(jsonReq({ ...fields, decision: 'approve' }));
    expect(res.status).toBe(400);
    expect(res.headers.get('location')).toBeNull();
    expect(await res.json()).toEqual({ error: 'invalid_scope', error_description: 'x' });
  });
});
