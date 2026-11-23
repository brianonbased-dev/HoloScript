/**
 * CORS allowlist for studio-api (/api/*).
 *
 * Replaces the old next.config `Access-Control-Allow-Origin: *` +
 * `Access-Control-Allow-Credentials: true` pair, which let any site make
 * credentialed cross-origin reads. Only allowlisted origins are reflected;
 * every response carries `Vary: Origin`; a disallowed origin gets no ACAO and
 * no credentials.
 *
 * Allowlist:
 *  - STUDIO_API_ALLOWED_ORIGINS (comma-separated) when set, replacing the defaults;
 *  - otherwise the production Studio origins below, plus NEXT_PUBLIC_STUDIO_URL
 *    (the configured Studio frontend the CSRF check in proxy.ts already trusts) when set;
 *  - plus localhost / 127.0.0.1 Studio dev origins only when NODE_ENV !== 'production'.
 * In production, configured origins (override and NEXT_PUBLIC_STUDIO_URL) must be https.
 * A literal `*` in the override is ignored: the wildcard cannot come back via config.
 */

export const DEFAULT_PROD_ORIGINS = ['https://holoscript.studio', 'https://www.holoscript.studio'];

export const DEV_ORIGINS = [
  'http://localhost:3100',
  'http://127.0.0.1:3100',
  'http://localhost:3105',
  'http://127.0.0.1:3105',
];

export const CORS_ALLOW_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
export const CORS_ALLOW_HEADERS =
  'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization, x-mcp-api-key';

type Env = Record<string, string | undefined>;

function normalizeOrigin(raw: string, httpsOnly: boolean): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === '*') return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    // Production: configured origins must be https (drops http:// and therefore plain-http localhost).
    if (httpsOnly && u.protocol !== 'https:') return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function getAllowedOrigins(env: Env = process.env): Set<string> {
  const out = new Set<string>();
  const override = env.STUDIO_API_ALLOWED_ORIGINS?.trim();
  const base = override
    ? override.split(',')
    : [...DEFAULT_PROD_ORIGINS, ...(env.NEXT_PUBLIC_STUDIO_URL ? [env.NEXT_PUBLIC_STUDIO_URL] : [])];
  const httpsOnly = env.NODE_ENV === 'production';
  for (const o of base) {
    const n = normalizeOrigin(o, httpsOnly);
    if (n) out.add(n);
  }
  if (env.NODE_ENV !== 'production') {
    for (const o of DEV_ORIGINS) out.add(o);
  }
  return out;
}

/** The origin to reflect, or null when it is absent or not allowed. */
export function resolveAllowedOrigin(origin: string | null, env: Env = process.env): string | null {
  if (!origin) return null;
  return getAllowedOrigins(env).has(origin) ? origin : null;
}

/**
 * Applies CORS to `headers` for the request origin. Always adds `Vary: Origin`
 * and strips any ACAO/ACAC set upstream, then sets them only for an allowed origin.
 */
export function applyCorsHeaders(
  headers: Headers,
  origin: string | null,
  opts: { preflight?: boolean; env?: Env } = {}
): void {
  const vary = headers.get('Vary');
  if (!vary || !vary.split(',').some((v) => v.trim().toLowerCase() === 'origin')) {
    headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  }
  headers.delete('Access-Control-Allow-Origin');
  headers.delete('Access-Control-Allow-Credentials');
  const allowed = resolveAllowedOrigin(origin, opts.env ?? process.env);
  if (!allowed) return;
  headers.set('Access-Control-Allow-Origin', allowed);
  headers.set('Access-Control-Allow-Credentials', 'true');
  if (opts.preflight) {
    headers.set('Access-Control-Allow-Methods', CORS_ALLOW_METHODS);
    headers.set('Access-Control-Allow-Headers', CORS_ALLOW_HEADERS);
    headers.set('Access-Control-Max-Age', '600');
  }
}
