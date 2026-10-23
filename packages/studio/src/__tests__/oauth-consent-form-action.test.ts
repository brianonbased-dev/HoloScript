/**
 * Live bug 2026-10-16: Approve/Deny on /oauth/consent did nothing. The form
 * POSTs to /api/oauth/consent, which 303s to the client's redirect_uri, and
 * Chrome enforces CSP form-action across that redirect. Only /oauth/consent
 * may add the exact http(s) origin of its redirect_uri query value.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy, formActionSources } from '../proxy';
import { consentErrorText } from '../lib/oauth/consentError';

function formAction(csp: string | null): string {
  const d = (csp || '').split(';').map((x) => x.trim()).find((x) => x.startsWith('form-action'));
  return (d || '').replace(/^form-action\s*/, '');
}

async function cspFor(path: string): Promise<string | null> {
  const res = await proxy(new NextRequest(`https://studio.test${path}`));
  return res.headers.get('content-security-policy');
}

const q = (uri: string) => `?client_id=hsc_x&redirect_uri=${encodeURIComponent(uri)}`;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('NEXTAUTH_SECRET', 'test-secret-form-action');
});
afterEach(() => vi.unstubAllEnvs());

describe('proxy CSP form-action on /oauth/consent', () => {
  it('allows exactly the loopback redirect origin (with port) on the consent page', async () => {
    expect(formAction(await cspFor('/oauth/consent' + q('http://127.0.0.1:53682/cb')))).toBe(
      "'self' http://127.0.0.1:53682"
    );
  });

  it('allows an https redirect origin, without path or query', async () => {
    expect(formAction(await cspFor('/oauth/consent' + q('https://app.example/cb?x=1')))).toBe(
      "'self' https://app.example"
    );
  });

  it('other paths stay self, even with a redirect_uri query', async () => {
    expect(formAction(await cspFor('/' + q('http://127.0.0.1:53682/cb')))).toBe("'self'");
    expect(formAction(await cspFor('/settings' + q('http://127.0.0.1:53682/cb')))).toBe("'self'");
    expect(formAction(await cspFor('/oauth/consentx' + q('http://127.0.0.1:53682/cb')))).toBe(
      "'self'"
    );
  });

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'ftp://h.example/cb',
    'not a url',
    '',
  ])('a %j redirect_uri is not added', async (uri) => {
    expect(formAction(await cspFor('/oauth/consent' + q(uri)))).toBe("'self'");
  });

  it('directive text smuggled into redirect_uri reduces to the bare origin', async () => {
    const fa = formAction(await cspFor('/oauth/consent' + q("http://a.example/ 'unsafe-inline'; script-src *")));
    expect(fa).toBe("'self' http://a.example");
  });

  it('never emits a wildcard', () => {
    for (const uri of ['http://*.example/cb', 'https://*/cb']) {
      expect(formActionSources('/oauth/consent', new URLSearchParams({ redirect_uri: uri }))).not.toContain('*');
    }
  });
});

describe('consent error text', () => {
  it('maps known codes and keeps unknown ones generic', () => {
    expect(consentErrorText(undefined)).toBeNull();
    expect(consentErrorText('invalid_scope')).toContain('permissions');
    expect(consentErrorText('<b>evil</b>')).not.toContain('evil');
  });
});
