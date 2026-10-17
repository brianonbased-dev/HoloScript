/**
 * Operator-provisioned OAuth clients (card: tools-codebase-scope, Option 1).
 *
 * Machine callers (aibrittney mcp-client, holoshell absorb-bundle,
 * smoke-mcp-auth) use client_credentials. A client from /oauth/register is
 * always selfRegistered, so with no human in the flow it gets `social` only.
 * An admin creates these clients instead, via POST /oauth/admin/clients:
 * confidential, client_credentials only, NOT selfRegistered, with an explicit
 * scope list checked here. Kept out of http-server.ts so it can be tested
 * without booting a server.
 */
import { SCOPE_CATEGORIES } from './oauth21';
import { OAUTH2_PUBLIC_SCOPE_NAMES, USER_BOUND_SCOPES } from '../auth/oauth2-provider';

/** Never issued to a provisioned machine client, whatever the admin asks. */
export const ADMIN_CLIENT_FORBIDDEN_SCOPES: readonly string[] = [
  'admin:*',
  'tools:admin',
  ...USER_BOUND_SCOPES,
];

/** tools:codebase goes only to these purposes, unless the admin sets allow_codebase. */
export const CODEBASE_SCOPE_PURPOSES: readonly string[] = ['holoshell'];

export const ADMIN_CLIENT_KNOWN_SCOPES: readonly string[] = [
  ...new Set([...Object.keys(SCOPE_CATEGORIES), ...OAUTH2_PUBLIC_SCOPE_NAMES]),
];

export type AdminClientRequest =
  | {
      ok: true;
      clientName: string;
      purpose: string;
      scopes: string[];
      redirectUris: string[];
    }
  | { ok: false; error: string };

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
  const scopes = [...new Set(rawScopes.filter((s): s is string => typeof s === 'string').map((s) => s.trim()).filter(Boolean))];
  if (scopes.length === 0) {
    return { ok: false, error: 'scopes is required: an explicit list, no default' };
  }
  const unknown = scopes.filter((s) => !ADMIN_CLIENT_KNOWN_SCOPES.includes(s));
  if (unknown.length > 0) return { ok: false, error: `unknown scopes: ${unknown.join(', ')}` };
  const forbidden = scopes.filter((s) => ADMIN_CLIENT_FORBIDDEN_SCOPES.includes(s));
  if (forbidden.length > 0) {
    return { ok: false, error: `scopes never issued to a provisioned machine client: ${forbidden.join(', ')}` };
  }
  if (
    scopes.includes('tools:codebase') &&
    !CODEBASE_SCOPE_PURPOSES.includes(purpose) &&
    body.allow_codebase !== true
  ) {
    return {
      ok: false,
      error: `tools:codebase is issued only to purpose ${CODEBASE_SCOPE_PURPOSES.join(', ')} (or with allow_codebase: true)`,
    };
  }
  const redirectUris = Array.isArray(body.redirect_uris)
    ? body.redirect_uris.filter((u): u is string => typeof u === 'string')
    : [];
  return { ok: true, clientName, purpose, scopes, redirectUris };
}
