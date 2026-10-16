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

export async function consentedToken(
  request: Req,
  scope: string,
  opts: { clientName?: string; userId?: string } = {}
): Promise<string> {
  const redirectUri = 'https://client.test/callback';
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
  const clientId = registered.body.client_id as string;
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  const mint = () =>
    signStudioConsent(
      { sub: opts.userId ?? 'test-user', cid: clientId, scp: scope.split(' ') },
      TEST_STUDIO_CONSENT_SECRET
    );
  // #578 F2: the csrf_token is bound to the signed-in user and is only issued
  // when the GET carries that user's assertion in the x-studio-consent header
  // (peeked, not consumed) -- the same way Studio's /oauth/consent page asks.
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
  const assertion = mint();
  const authorized = await request('POST', '/oauth/authorize', {
    body: {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      state: 'fixture',
      csrf_token: csrfToken,
      studio_consent: assertion,
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
      client_secret: registered.body.client_secret,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    },
  });
  if (issued.status !== 200) {
    throw new Error(`token failed: ${issued.status} ${JSON.stringify(issued.body)}`);
  }
  const granted = String(issued.body.scope ?? '').split(' ');
  for (const s of scope.split(' ')) {
    if (!granted.includes(s)) {
      throw new Error(`token missing consented scope ${s}: ${JSON.stringify(issued.body)}`);
    }
  }
  return issued.body.access_token as string;
}
