/**
 * Test-only: mint a real, human-consented OAuth token against a booted server.
 *
 * Since Muse Gap 9, every /oauth/register client is self-registered, and a
 * self-registered client gets public social scopes only until a signed-in
 * Studio user approves it. A bare client_credentials request for tools:read is
 * therefore (correctly) refused with 400 consent_required. Fixtures that need a
 * tools:read login must go through the same path a real user would:
 * register -> GET /oauth/authorize with the assertion in x-studio-consent (to
 * get the user-bound csrf_token, #578 F2) -> POST /oauth/authorize with
 * csrf_token and a fresh Studio consent assertion -> exchange
 * the code with PKCE. Nothing here relaxes a production check; the assertion is
 * signed with TEST_STUDIO_CONSENT_SECRET, which the fixture sets as
 * STUDIO_CONSENT_SECRET in the sandboxed server's env.
 */
import { createHash, randomBytes } from 'crypto';
import { signStudioConsent } from '../security/studio-consent';

/** >= 32 chars (verifyStudioConsent fails closed below that). Test sandboxes only. */
export const TEST_STUDIO_CONSENT_SECRET = 'test-only-studio-consent-secret-0123456789abcdef';

type Req = (
  method: 'POST' | 'GET' | 'DELETE',
  path: string,
  opts?: { body?: unknown; token?: string | undefined; headers?: Record<string, string> }
) => Promise<{ status: number; body: Record<string, unknown> }>;

type Client = { client_id: unknown; client_secret?: unknown };

/**
 * The whole human-consent path, returning the token endpoint's answer as-is so a
 * caller can assert on narrowed scopes or refusals. `client` reuses a client
 * the test registered itself (its own registration shape, door state, agent_id);
 * otherwise one is registered here. `tokenBody` adds fields to the code exchange
 * (e.g. agent_id). Nothing here relaxes a production check.
 */
export async function consentedGrant(
  request: Req,
  scope: string,
  opts: {
    clientName?: string;
    userId?: string;
    client?: Client;
    tokenBody?: Record<string, unknown>;
  } = {}
): Promise<{ status: number; body: Record<string, unknown>; clientId: string; granted: string[] }> {
  const redirectUri = 'https://client.test/callback';
  let client = opts.client;
  if (!client) {
    const registered = await request('POST', '/oauth/register', {
      body: {
        client_name: opts.clientName ?? `probe-${scope.replace(/[^a-z]+/g, '-')}`,
        redirect_uris: [redirectUri],
        scope,
        token_endpoint_auth_method: 'client_secret_post',
        grant_types: ['authorization_code'],
      },
    });
    if (registered.status !== 201) {
      throw new Error(`register failed: ${registered.status} ${JSON.stringify(registered.body)}`);
    }
    client = registered.body as Client;
  }
  const clientId = String(client.client_id);
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const mint = () =>
    signStudioConsent(
      { sub: opts.userId ?? 'test-user', cid: clientId, scp: scope.split(' ') },
      TEST_STUDIO_CONSENT_SECRET
    );
  // #578 F2: the csrf_token is bound to the signed-in user (and, N2, the
  // requested scope) and is only issued when the GET carries that user's
  // assertion in x-studio-consent (peeked, not consumed) -- as Studio does.
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: 'fixture',
  });
  const pending = await request('GET', `/oauth/authorize?${query.toString()}`, {
    headers: { accept: 'application/json', 'x-studio-consent': mint() },
  });
  const authRequest = pending.body.authorization_request as Record<string, unknown> | undefined;
  const csrfToken = authRequest?.csrf_token;
  if (pending.status !== 200 || typeof csrfToken !== 'string') {
    throw new Error(`authorize GET failed: ${pending.status} ${JSON.stringify(pending.body)}`);
  }
  const authorized = await request('POST', '/oauth/authorize', {
    body: {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'fixture',
      csrf_token: csrfToken,
      studio_consent: mint(),
    },
  });
  if (authorized.status !== 200 || typeof authorized.body.code !== 'string') {
    throw new Error(`authorize failed: ${authorized.status} ${JSON.stringify(authorized.body)}`);
  }
  const issued = await request('POST', '/oauth/token', {
    body: {
      grant_type: 'authorization_code',
      code: authorized.body.code,
      client_id: clientId,
      ...(client.client_secret !== undefined ? { client_secret: client.client_secret } : {}),
      redirect_uri: redirectUri,
      code_verifier: verifier,
      ...(opts.tokenBody ?? {}),
    },
  });
  return {
    status: issued.status,
    body: issued.body,
    clientId,
    granted: String(issued.body.scope ?? '').split(' ').filter(Boolean),
  };
}

/** A consented access token holding exactly `scope` (throws otherwise). */
export async function consentedToken(
  request: Req,
  scope: string,
  opts: { clientName?: string; userId?: string } = {}
): Promise<string> {
  const issued = await consentedGrant(request, scope, opts);
  if (issued.status !== 200) {
    throw new Error(`token failed: ${issued.status} ${JSON.stringify(issued.body)}`);
  }
  for (const s of scope.split(' ')) {
    if (!issued.granted.includes(s)) {
      throw new Error(`token missing consented scope ${s}: ${JSON.stringify(issued.body)}`);
    }
  }
  return issued.body.access_token as string;
}
