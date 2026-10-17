/**
 * Operator-provisioned OAuth clients (card tools-codebase-scope, Option 1;
 * Trust review of #611, B1-B4).
 *
 * Machine callers (aibrittney mcp-client, holoshell absorb-bundle,
 * smoke-mcp-auth) use client_credentials. A client from /oauth/register is
 * always selfRegistered, so with no human in the flow it gets `social` only.
 * A signed-in HUMAN admin creates these clients instead, via
 * POST /oauth/admin/clients: confidential, client_credentials only (no
 * redirect URIs, no authorization_code), NOT selfRegistered, an explicit
 * scope list checked here, an owning human, and a secret that expires in at
 * most 90 days. Kept out of http-server.ts so it can be tested without a server.
 */
import { SCOPE_CATEGORIES } from './oauth21';
import { OAUTH2_PUBLIC_SCOPE_NAMES, USER_BOUND_SCOPES } from '../auth/oauth2-provider';

/** Never issued to a provisioned machine client, whatever the admin asks. */
export const ADMIN_CLIENT_FORBIDDEN_SCOPES: readonly string[] = [
  'admin:*',
  'tools:admin',
  ...USER_BOUND_SCOPES,
];

/**
 * Gated scopes: issued only to an allowed purpose, or when the admin sets the
 * explicit flag. tools:browser has no allowed purpose, so it always needs the flag.
 */
export const GATED_SCOPES: Readonly<Record<string, { purposes: readonly string[]; flag: string }>> = {
  'tools:codebase': { purposes: ['holoshell'], flag: 'allow_codebase' },
  'tools:browser': { purposes: [], flag: 'allow_browser' },
};

export const ADMIN_CLIENT_KNOWN_SCOPES: readonly string[] = [
  ...new Set([...Object.keys(SCOPE_CATEGORIES), ...OAUTH2_PUBLIC_SCOPE_NAMES]),
];

const DAY_MS = 86_400_000;
/** Longest a provisioned client secret lives (matches the grant cap). */
export const ADMIN_CLIENT_MAX_SECRET_DAYS = 90;
/** After a rotate, the old secret keeps working this long so a caller can swap. */
export const ADMIN_CLIENT_ROTATE_OVERLAP_MS = 15 * 60_000;

export type AdminClientRequest =
  | {
      ok: true;
      clientName: string;
      purpose: string;
      scopes: string[];
      secretTtlMs: number;
      /** Which gate flags the admin set (logged in the audit entry). */
      flags: Record<string, boolean>;
    }
  | { ok: false; error: string };

/** Secret lifetime in days: 1..90, default 90. */
export function parseSecretTtlMs(raw: unknown): number | string {
  if (raw === undefined || raw === null) return ADMIN_CLIENT_MAX_SECRET_DAYS * DAY_MS;
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > ADMIN_CLIENT_MAX_SECRET_DAYS) {
    return `expires_in_days must be an integer from 1 to ${ADMIN_CLIENT_MAX_SECRET_DAYS}`;
  }
  return raw * DAY_MS;
}

export function parseAdminClientRequest(body: Record<string, unknown>): AdminClientRequest {
  const purpose = typeof body.purpose === 'string' ? body.purpose.trim().toLowerCase() : '';
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(purpose)) {
    return { ok: false, error: 'purpose is required: a short slug such as "holoshell" or "smoke-mcp-auth"' };
  }
  const clientName =
    (typeof body.client_name === 'string' ? body.client_name.trim().slice(0, 120) : '') ||
    `${purpose}-provisioned`;
  const rawScopes = Array.isArray(body.scopes)
    ? body.scopes
    : typeof body.scope === 'string'
      ? body.scope.split(/\s+/)
      : [];
  const scopes = [
    ...new Set(
      rawScopes
        .filter((s): s is string => typeof s === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
    ),
  ];
  if (scopes.length === 0) {
    return { ok: false, error: 'scopes is required: an explicit list, no default' };
  }
  const unknown = scopes.filter((s) => !ADMIN_CLIENT_KNOWN_SCOPES.includes(s));
  if (unknown.length > 0) return { ok: false, error: `unknown scopes: ${unknown.join(', ')}` };
  const forbidden = scopes.filter((s) => ADMIN_CLIENT_FORBIDDEN_SCOPES.includes(s));
  if (forbidden.length > 0) {
    return { ok: false, error: `scopes never issued to a provisioned machine client: ${forbidden.join(', ')}` };
  }
  const flags: Record<string, boolean> = {};
  for (const [scope, gate] of Object.entries(GATED_SCOPES)) {
    flags[gate.flag] = body[gate.flag] === true;
    if (scopes.includes(scope) && !gate.purposes.includes(purpose) && !flags[gate.flag]) {
      const who = gate.purposes.length ? `purpose ${gate.purposes.join(', ')} or ` : '';
      return { ok: false, error: `${scope} is issued only to ${who}an admin request with ${gate.flag}: true` };
    }
  }
  // client_credentials only: no browser sign-in, ever.
  if (Array.isArray(body.redirect_uris) && body.redirect_uris.length > 0) {
    return { ok: false, error: 'redirect_uris are refused: provisioned clients are client_credentials only' };
  }
  if (Array.isArray(body.grant_types) && body.grant_types.some((g) => g !== 'client_credentials')) {
    return { ok: false, error: 'grant_types must be ["client_credentials"]: provisioned clients never use authorization_code' };
  }
  const ttl = parseSecretTtlMs(body.expires_in_days);
  if (typeof ttl === 'string') return { ok: false, error: ttl };
  return { ok: true, clientName, purpose, scopes, secretTtlMs: ttl, flags };
}

export type AdminActor =
  | { ok: true; userId: string }
  | { ok: false; status: 400 | 401; reason: string };

/**
 * Who is asking. Only a signed-in HUMAN admin: a single-use Studio assertion
 * (audience studio:admin-clients, founder-marked, minted by Studio only after
 * its founder check) in X-Studio-Consent. Any API key or bearer token -- the
 * legacy shared key, dev identities, an OAuth token -- is refused here, and a
 * key is never read from the URL (?apiKey= / ?key= is refused, not used).
 */
export function adminProvisioningActor(
  req: { url?: string; headers: Record<string, string | string[] | undefined> },
  verifyAdminSession: (assertion: unknown) => string | null
): AdminActor {
  const query = new URLSearchParams(req.url?.split('?')[1] ?? '');
  if (query.has('apiKey') || query.has('key') || query.has('api_key')) {
    return { ok: false, status: 400, reason: 'keys are never accepted in the URL on this route' };
  }
  for (const h of ['authorization', 'x-api-key', 'x-mcp-api-key']) {
    if (req.headers[h] !== undefined) {
      return {
        ok: false,
        status: 401,
        reason: 'API keys and bearer tokens are refused here: a signed-in human admin (Studio founder session) is required',
      };
    }
  }
  const userId = verifyAdminSession(req.headers['x-studio-consent']);
  if (!userId) {
    return { ok: false, status: 401, reason: 'a signed-in human admin (Studio founder session) is required' };
  }
  return { ok: true, userId };
}