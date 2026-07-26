import { describe, expect, it } from 'vitest';
import {
  acceptsHtml,
  buildOAuthCallbackUri,
  escapeHtml,
  OAUTH_CONSENT_SECURITY_HEADERS,
  renderOAuthConsentPage,
  resolveOAuthIssuer,
} from '../auth/oauth-browser';

describe('OAuth browser authorization helpers', () => {
  it('negotiates a consent document only for browser HTML requests', () => {
    expect(acceptsHtml('text/html,application/xhtml+xml')).toBe(true);
    expect(acceptsHtml('application/json')).toBe(false);
    expect(acceptsHtml(undefined)).toBe(false);
  });

  it('renders an actionable consent form without executable or unescaped client input', () => {
    const html = renderOAuthConsentPage({
      clientId: 'client"><script>alert(1)</script>',
      clientName: 'Codex <script>alert(2)</script>',
      redirectUri: 'http://127.0.0.1:55071/callback/codex?from=a&next=b',
      scopes: [
        {
          name: 'tools:read',
          description: 'Read-only access',
        },
      ],
      state: 'opaque-state',
      codeChallenge: 'pkce-challenge',
      codeChallengeMethod: 'S256',
    });

    expect(html).toContain('<form method="post" action="/oauth/authorize"');
    expect(html).toContain('name="decision" value="allow"');
    expect(html).toContain('name="decision" value="deny"');
    expect(html).toContain('name="code_challenge_method" value="S256"');
    expect(html).toContain('Codex &lt;script&gt;alert(2)&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('client"><script>');
  });

  it('constructs success and denial redirects without dropping existing callback parameters', () => {
    const success = new URL(
      buildOAuthCallbackUri('http://127.0.0.1:55071/callback/codex?source=mcp', {
        code: 'issued-code',
        state: 'opaque-state',
      })
    );
    expect(success.searchParams.get('source')).toBe('mcp');
    expect(success.searchParams.get('code')).toBe('issued-code');
    expect(success.searchParams.get('state')).toBe('opaque-state');

    const denied = new URL(
      buildOAuthCallbackUri('http://127.0.0.1:55071/callback/codex', {
        error: 'access_denied',
        errorDescription: 'Denied by user',
        state: 'opaque-state',
      })
    );
    expect(denied.searchParams.get('error')).toBe('access_denied');
    expect(denied.searchParams.get('error_description')).toBe('Denied by user');
    expect(denied.searchParams.get('state')).toBe('opaque-state');
  });

  it('ships browser responses with anti-framing and no-store controls', () => {
    expect(OAUTH_CONSENT_SECURITY_HEADERS['X-Frame-Options']).toBe('DENY');
    expect(OAUTH_CONSENT_SECURITY_HEADERS['Cache-Control']).toBe('no-store');
    expect(OAUTH_CONSENT_SECURITY_HEADERS['Content-Security-Policy']).toContain(
      "frame-ancestors 'none'"
    );
  });

  it('escapes all HTML-significant characters', () => {
    expect(escapeHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('keeps sovereign discovery on the local issuer unless explicitly configured', () => {
    expect(resolveOAuthIssuer({ bindHost: '127.0.0.1', port: 7411 })).toBe('http://127.0.0.1:7411');
    expect(resolveOAuthIssuer({ bindHost: '0.0.0.0', port: 7411 })).toBe('http://127.0.0.1:7411');
    expect(
      resolveOAuthIssuer({
        configuredIssuer: 'https://custom.holoscript.net/',
        railwayPublicDomain: 'ignored.up.railway.app',
        bindHost: '0.0.0.0',
        port: 3000,
      })
    ).toBe('https://custom.holoscript.net');
    expect(
      resolveOAuthIssuer({
        railwayPublicDomain: 'mcp.holoscript.net',
        bindHost: '0.0.0.0',
        port: 3000,
      })
    ).toBe('https://mcp.holoscript.net');
  });
});
