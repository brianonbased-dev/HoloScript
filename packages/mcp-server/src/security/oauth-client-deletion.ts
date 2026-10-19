/**
 * OAuth client lifecycle rules for Trust & Consent part A: default grant types
 * at registration (A1) and who may DELETE /oauth/clients/:id (A4 / d).
 *
 * The owner: the client itself (its own access token, or its client_id and
 * secret over HTTP Basic), or the agent the client is bound to (that agent's
 * own proven identity). Or an admin (tools:admin / admin:*). Nobody else.
 * Kept out of http-server.ts so the rule is testable without booting it.
 */
import { normalizeAgentIdentity } from '../auth/oauth2-provider';

export type ClientDeletionDecision =
  | { ok: true; actor: string; role: 'admin' | 'owner' }
  | { ok: false; status: 401 | 403; reason: string };

export function clientDeletionActor(params: {
  targetClientId: string;
  auth: { active: boolean; clientId?: string; agentId?: string };
  isAdmin: boolean;
  boundAgentId?: string;
  secretMatches: boolean;
}): ClientDeletionDecision {
  const { auth, targetClientId } = params;
  if (params.isAdmin) {
    return { ok: true, actor: auth.agentId ?? auth.clientId ?? 'admin', role: 'admin' };
  }
  if (params.secretMatches) {
    return { ok: true, actor: targetClientId, role: 'owner' };
  }
  if (auth.active && auth.clientId === targetClientId) {
    return { ok: true, actor: auth.agentId ?? targetClientId, role: 'owner' };
  }
  if (
    auth.active &&
    auth.agentId &&
    params.boundAgentId &&
    normalizeAgentIdentity(auth.agentId) === normalizeAgentIdentity(params.boundAgentId)
  ) {
    return { ok: true, actor: auth.agentId, role: 'owner' };
  }
  if (!auth.active) return { ok: false, status: 401, reason: 'not authenticated' };
  return { ok: false, status: 403, reason: 'caller is neither the owner nor an admin' };
}

/** HTTP Basic client credentials (RFC 6749 §2.3.1), or null. */
export function parseBasicClientCredentials(
  header: string | string[] | undefined
): { clientId: string; clientSecret: string } | null {
  const h = Array.isArray(header) ? header[0] : header;
  if (!h || !/^Basic /i.test(h)) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(h.slice(6).trim(), 'base64').toString('utf8');
  } catch {
    return null;
  }
  const i = decoded.indexOf(':');
  if (i <= 0) return null;
  const dec = (v: string) => {
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return { clientId: dec(decoded.slice(0, i)), clientSecret: dec(decoded.slice(i + 1)) };
}

/**
 * Grant types a dynamic registration gets when it names none (Trust & Consent
 * A1). A remote registrant never gets client_credentials by default: it has no
 * human in the flow. A client that wants it must ask (grant_types), and even
 * then it is capped to public/social scopes and never carries user:private.
 * The one exception is a loopback registrant on a server whose registration is
 * loopback-only (HoloShell, the desktop MCP config): processes on this host
 * already hold its disk. Once OAUTH_ALLOW_REMOTE_REGISTRATION opens the door,
 * a reverse proxy makes every peer look like loopback, so the exception ends.
 */
export function defaultRegistrationGrantTypes(params: {
  clientType: 'confidential' | 'public';
  registrarIsLoopback: boolean;
  remoteRegistrationAllowed: boolean;
}): string[] {
  if (params.clientType === 'public') return ['authorization_code', 'refresh_token'];
  if (params.registrarIsLoopback && !params.remoteRegistrationAllowed) {
    return ['authorization_code', 'client_credentials', 'refresh_token'];
  }
  return ['authorization_code', 'refresh_token'];
}
