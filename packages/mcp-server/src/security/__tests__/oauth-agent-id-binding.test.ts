/**
 * A token's `agent_id` must be owned, not merely asserted.
 *
 * The token endpoint copied `body.agent_id` straight onto the issued token.
 * That value becomes `auth.agentId`, which the MCP layer promotes to the
 * authenticated principal (`__authAgentId`) trusted by every premium gate and
 * by the board agent binding. Registration is open to anyone, so any caller
 * could register a client, ask for someone else's agent_id, and be handed a
 * token that speaks as them.
 *
 * A grant may stamp an agent_id only when the client was bound to that agent at
 * registration, or when the request presents that agent's own key.
 */
import { createHash } from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { OAuth21Service, resetOAuth21Service } from '../oauth21';
import { OAuth2Provider } from '../../auth/oauth2-provider';

const VICTIM = 'agent_founder';
const OWNER = 'agent_owner';

function service(): OAuth21Service {
  return new OAuth21Service({
    tokenSecret: 'x'.repeat(64),
    migrationMode: 'permissive',
    legacyApiKey: 'hs_legacy_key_unused_by_these_tests',
  });
}

function confidentialClient(
  svc: OAuth21Service,
  agentId?: string
): { clientId: string; clientSecret: string } {
  return svc.registerClient({
    clientName: 'agent-id-binding-test',
    redirectUris: ['https://example.com/cb'],
    scopes: ['tools:read'],
    clientType: 'confidential',
    ...(agentId ? { agentId } : {}),
  });
}

describe('OAuth21Service: client_credentials agent_id', () => {
  beforeEach(() => {
    resetOAuth21Service();
  });

  it('refuses an agent_id the client neither owns nor proves', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    expect(() =>
      svc.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:read'],
        agentId: VICTIM,
      })
    ).toThrow(/not bound/i);
  });

  it('accepts an agent_id proven by that agent-s own key on the request', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const tokens = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: OWNER,
      provenAgentId: OWNER,
    });

    expect(svc.introspect(tokens.access_token).agentId).toBe(OWNER);
  });

  it('accepts an agent_id bound to the client at registration', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc, OWNER);

    const tokens = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: OWNER,
    });

    expect(svc.introspect(tokens.access_token).agentId).toBe(OWNER);
  });

  it('refuses a second agent_id even when the client is bound to a different one', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc, OWNER);

    expect(() =>
      svc.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:read'],
        agentId: VICTIM,
      })
    ).toThrow(/not bound/i);
  });

  it('still issues an ordinary token when no agent_id is requested', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const tokens = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
    });

    expect(tokens.access_token).toBeTruthy();
    expect(svc.introspect(tokens.access_token).agentId).toBeUndefined();
  });
});

describe('OAuth21Service: authorization_code agent_id', () => {
  beforeEach(() => {
    resetOAuth21Service();
  });

  const VERIFIER = 'verifier-long-enough-for-the-pkce-check';

  function challengeFor(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  it('refuses an unproven agent_id on the code exchange', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);
    const code = svc.createAuthorizationCode({
      clientId,
      redirectUri: 'https://example.com/cb',
      scopes: ['tools:read'],
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });

    expect(() =>
      svc.exchangeAuthorizationCode({
        code,
        clientId,
        clientSecret,
        redirectUri: 'https://example.com/cb',
        codeVerifier: VERIFIER,
        agentId: VICTIM,
      })
    ).toThrow(/not bound/i);
  });

  it('leaves the ordinary code exchange working', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);
    const code = svc.createAuthorizationCode({
      clientId,
      redirectUri: 'https://example.com/cb',
      scopes: ['tools:read'],
      codeChallenge: challengeFor(VERIFIER),
      codeChallengeMethod: 'S256',
    });

    const tokens = svc.exchangeAuthorizationCode({
      code,
      clientId,
      clientSecret,
      redirectUri: 'https://example.com/cb',
      codeVerifier: VERIFIER,
    });

    expect(tokens.access_token).toBeTruthy();
  });
});

describe('OAuth2Provider (durable registry): agent_id', () => {
  it('refuses an unproven agent_id on client_credentials', async () => {
    const provider = new OAuth2Provider({});
    const { clientId, clientSecret } = await provider.registerClient({
      clientName: 'durable-agent-id-test',
      redirectUris: [],
      scopes: ['tools:read'],
    });

    const result = await provider.handleToken({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      agent_id: VICTIM,
    });

    expect(result.status).toBe(400);
    expect(String(result.body.error_description)).toMatch(/not bound/i);
  });

  it('accepts an agent_id proven on the request', async () => {
    const provider = new OAuth2Provider({});
    const { clientId, clientSecret } = await provider.registerClient({
      clientName: 'durable-agent-id-proven',
      redirectUris: [],
      scopes: ['tools:read'],
    });

    const result = await provider.handleToken(
      {
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
        agent_id: OWNER,
      },
      undefined,
      OWNER
    );

    expect(result.status).toBe(200);
    expect(result.body.access_token).toBeTruthy();
  });

  it('still issues when no agent_id is requested', async () => {
    const provider = new OAuth2Provider({});
    const { clientId, clientSecret } = await provider.registerClient({
      clientName: 'durable-no-agent-id',
      redirectUris: [],
      scopes: ['tools:read'],
    });

    const result = await provider.handleToken({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    });

    expect(result.status).toBe(200);
  });
});
