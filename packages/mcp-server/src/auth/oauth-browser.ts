/**
 * Pure helpers for the browser-facing OAuth authorization flow.
 *
 * Keep rendering and redirect construction separate from the HTTP server so
 * they can be security-tested without starting the full MCP service.
 */

export interface OAuthConsentScope {
  name: string;
  description: string;
}

export interface OAuthConsentRequest {
  clientId: string;
  clientName: string;
  redirectUri: string;
  scopes: OAuthConsentScope[];
  state?: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export const OAUTH_CONSENT_SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  Pragma: 'no-cache',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
} as const;

export function resolveOAuthIssuer(options: {
  configuredIssuer?: string;
  railwayPublicDomain?: string;
  bindHost: string;
  port: number;
}): string {
  const configured = options.configuredIssuer?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  if (options.railwayPublicDomain) return `https://${options.railwayPublicDomain}`;

  const bindHost = ['0.0.0.0', '::', 'localhost'].includes(options.bindHost)
    ? '127.0.0.1'
    : options.bindHost;
  const urlHost = bindHost.includes(':') ? `[${bindHost}]` : bindHost;
  return `http://${urlHost}:${options.port}`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function acceptsHtml(acceptHeader: string | string[] | undefined): boolean {
  const accept = Array.isArray(acceptHeader) ? acceptHeader.join(',') : acceptHeader || '';
  return accept.toLowerCase().includes('text/html');
}

export function renderOAuthConsentPage(request: OAuthConsentRequest): string {
  const hidden = (name: string, value: string | undefined): string =>
    value === undefined
      ? ''
      : `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`;

  const scopeItems = request.scopes
    .map(
      ({ name, description }) => `
          <li>
            <code>${escapeHtml(name)}</code>
            <span>${escapeHtml(description)}</span>
          </li>`
    )
    .join('');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Authorize ${escapeHtml(request.clientName)} · HoloScript</title>
    <style>
      :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
      * { box-sizing: border-box; }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #101212; color: #f5f7f6; }
      main { width: min(92vw, 560px); padding: 32px; border: 1px solid #343838; border-radius: 18px; background: #191c1c; box-shadow: 0 24px 80px #0008; }
      .eyebrow { color: #7ee2b8; font-size: .78rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
      h1 { margin: 10px 0 8px; font-size: clamp(1.65rem, 4vw, 2.25rem); line-height: 1.12; }
      p { color: #b8c0bd; line-height: 1.55; }
      .client { color: #fff; font-weight: 700; overflow-wrap: anywhere; }
      ul { list-style: none; padding: 0; margin: 24px 0; display: grid; gap: 10px; }
      li { padding: 14px; border: 1px solid #343838; border-radius: 10px; background: #141616; }
      code { display: block; margin-bottom: 5px; color: #9ef0cf; font-weight: 700; }
      li span { color: #c7cecb; font-size: .92rem; line-height: 1.4; }
      .notice { padding: 12px 14px; border-left: 3px solid #d7b35c; background: #282317; color: #dfd3b4; font-size: .9rem; }
      .actions { display: flex; gap: 10px; margin-top: 24px; }
      button { flex: 1; min-height: 44px; border: 0; border-radius: 9px; padding: 0 18px; font: inherit; font-weight: 700; cursor: pointer; }
      .allow { background: #58d7a5; color: #07140f; }
      .deny { background: #303535; color: #f2f4f3; }
      .foot { margin: 18px 0 0; font-size: .78rem; color: #89918e; }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">HoloScript authorization</div>
      <h1>Allow <span class="client">${escapeHtml(request.clientName)}</span>?</h1>
      <p>This client is requesting the following HoloScript capabilities:</p>
      <ul>${scopeItems}</ul>
      <div class="notice">Only continue if you initiated this connection. This authorizes a client; it does not expose your HoloScript API key.</div>
      <form method="post" action="/oauth/authorize" autocomplete="off">
        ${hidden('client_id', request.clientId)}
        ${hidden('redirect_uri', request.redirectUri)}
        ${hidden('scope', request.scopes.map(({ name }) => name).join(' '))}
        ${hidden('state', request.state)}
        ${hidden('code_challenge', request.codeChallenge)}
        ${hidden('code_challenge_method', request.codeChallengeMethod)}
        <div class="actions">
          <button class="deny" type="submit" name="decision" value="deny">Cancel</button>
          <button class="allow" type="submit" name="decision" value="allow">Allow</button>
        </div>
      </form>
      <p class="foot">The callback destination was verified against this client’s registered redirect URI.</p>
    </main>
  </body>
</html>`;
}

export function buildOAuthCallbackUri(
  redirectUri: string,
  params: {
    code?: string;
    state?: string;
    error?: string;
    errorDescription?: string;
  }
): string {
  const callback = new URL(redirectUri);
  if (params.code) callback.searchParams.set('code', params.code);
  if (params.state) callback.searchParams.set('state', params.state);
  if (params.error) callback.searchParams.set('error', params.error);
  if (params.errorDescription) {
    callback.searchParams.set('error_description', params.errorDescription);
  }
  return callback.toString();
}
