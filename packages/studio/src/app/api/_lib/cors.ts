/**
 * CORS helper for Studio API routes.
 *
 * SEC-T03: LLM routes previously returned `Access-Control-Allow-Origin: *`
 * which turns any authenticated endpoint into a credential-theft surface
 * (and turns any paid-LLM endpoint into a budget-drain primitive).
 *
 * This helper returns an origin-echo CORS value only when the request
 * origin matches the configured allowlist. In development we additionally
 * allow any `localhost` / `127.0.0.1` origin so the Studio dev server keeps
 * working. In production, only the explicit allowlist is honored.
 *
 * The allowlist can be overridden per deploy via CORS_ALLOWED_ORIGINS
 * (comma-separated). Default: production Studio + marketing + wildcard
 * subdomains of holoscript.net.
 */

const DEFAULT_ALLOWED = [
  'https://holoscript.net',
  'https://www.holoscript.net',
  'https://studio.holoscript.net',
];

const SUBDOMAIN_WILDCARD_RE = /^https:\/\/[a-z0-9-]+\.holoscript\.net$/i;

function getConfiguredAllowlist(): string[] {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) return DEFAULT_ALLOWED;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Returns the origin value to echo back in Access-Control-Allow-Origin, or
 * null when the origin is not allowed (caller should omit the header or
 * return 403 for preflight).
 */
export function resolveCorsOrigin(req: Request): string | null {
  const origin = req.headers.get('origin');
  if (!origin) return null;

  const allowlist = getConfiguredAllowlist();
  if (allowlist.includes(origin)) return origin;

  if (SUBDOMAIN_WILDCARD_RE.test(origin)) return origin;

  // Dev affordance — localhost on any port.
  if (process.env.NODE_ENV !== 'production') {
    try {
      const u = new URL(origin);
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        return origin;
      }
    } catch {
      /* malformed origin header — fall through to null */
    }
  }

  return null;
}

/** Build a CORS header object for OPTIONS preflight responses. */
export function corsHeaders(
  req: Request,
  opts: { methods?: string; headers?: string } = {}
): Record<string, string> {
  const origin = resolveCorsOrigin(req);
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': opts.methods ?? 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers':
      opts.headers ?? 'Content-Type, Authorization, x-mcp-api-key',
    Vary: 'Origin',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}
