/**
 * The identity written to the DURABLE record must be the one the grant stamped.
 *
 * The grants were fixed to refuse an unproven `agent_id`, and the in-memory
 * introspection agreed. The write-through did not: `/oauth/token` passed the
 * REQUEST's `body.agent_id` to `persistIssuedTokens`, which handed it to
 * `oauth2.importAccessToken`. So the refusal held only as long as the process
 * did. `refresh_token` made it reachable with no proof at all — that grant
 * never reads `agent_id`, so nothing anywhere checked the value being written.
 *
 * The delay is what made it dangerous. In-memory introspection answers first
 * and has no agentId, so the token looks correct all day. The next deploy wipes
 * the map (many times a day, per the bridge's own note), and from then on
 * `authenticateRequestAsync` reads the durable record and returns the caller's
 * chosen id as the principal — which the MCP layer promotes to `__authAgentId`,
 * trusted by every premium gate and by the board agent binding.
 *
 * What must hold:
 *   - a refresh naming another agent never becomes that agent, in memory or
 *     durably, before or after the map is cleared;
 *   - a refresh keeps the identity the chain was issued to, rather than
 *     silently demoting a legitimate agent to an anonymous token;
 *   - the durable record carries the REGISTRY's spelling, never the caller's.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { OAuth21Service, resetOAuth21Service, type TokenResponse } from '../oauth21';

const OWNER = 'agent_owner';
const VICTIM = 'agent_founder';

function service(): OAuth21Service {
  return new OAuth21Service({
    tokenSecret: 'x'.repeat(64),
    migrationMode: 'permissive',
    legacyApiKey: 'hs_legacy_key_unused_by_these_tests',
  });
}

function confidentialClient(svc: OAuth21Service): { clientId: string; clientSecret: string } {
  return svc.registerClient({
    clientName: 'durable-identity-test',
    redirectUris: ['https://example.com/cb'],
    scopes: ['tools:read'],
    clientType: 'confidential',
  });
}

/**
 * Exactly what `/oauth/token` now hands to `persistIssuedTokens`: the identity
 * read back off the token that was just issued. Expressed here as a function so
 * the test states the rule rather than a value — if the endpoint goes back to
 * persisting `body.agent_id`, this is the line that stops agreeing with it.
 */
function stampedAgentIdFor(svc: OAuth21Service, tokens: TokenResponse): string | undefined {
  return tokens.access_token ? svc.introspect(tokens.access_token).agentId : undefined;
}

describe('a refresh cannot become another agent', () => {
  beforeEach(() => {
    resetOAuth21Service();
  });

  it('keeps the chain-s own identity when the request body names someone else', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: OWNER,
      provenAgentId: OWNER,
    });

    // The refresh request carries `agent_id: agent_founder`. The grant does not
    // read it — which is precisely why the old write-through was unchecked.
    const bodyAgentId = VICTIM;
    const refreshed = svc.refreshAccessToken({
      refreshToken: issued.refresh_token,
      clientId,
      clientSecret,
    });

    expect(bodyAgentId).toBe(VICTIM);
    expect(svc.introspect(refreshed.access_token).agentId).toBe(OWNER);
    // The value that would be persisted is the stamped one, not the request's.
    expect(stampedAgentIdFor(svc, refreshed)).toBe(OWNER);
    expect(stampedAgentIdFor(svc, refreshed)).not.toBe(bodyAgentId);
  });

  it('is still that agent after the in-memory map is cleared by a deploy', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: OWNER,
      provenAgentId: OWNER,
    });
    const refreshed = svc.refreshAccessToken({
      refreshToken: issued.refresh_token,
      clientId,
      clientSecret,
    });

    // Snapshot the durable write the bridge performs, before the wipe.
    const durable = svc.introspect(refreshed.access_token);
    const durableAgentId = stampedAgentIdFor(svc, refreshed);

    // A deploy wipes every in-memory map.
    resetOAuth21Service();
    const afterDeploy = service();
    expect(afterDeploy.introspect(refreshed.access_token).active).toBe(false);

    // The durable record is rehydrated, exactly as authenticateRequestAsync does.
    afterDeploy.importAccessToken({
      token: refreshed.access_token,
      clientId,
      scopes: durable.scopes || [],
      issuedAt: durable.issuedAt || Date.now(),
      expiresAt: durable.expiresAt || Date.now() + 3_600_000,
      agentId: durableAgentId,
    });

    // This is the principal every premium gate will now trust.
    expect(afterDeploy.introspect(refreshed.access_token).agentId).toBe(OWNER);
    expect(afterDeploy.introspect(refreshed.access_token).agentId).not.toBe(VICTIM);
  });

  it('WATCHED FAIL: persisting the request-s agent_id is what made it reachable', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);
    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: OWNER,
      provenAgentId: OWNER,
    });

    // The old bridge wrote `body.agent_id` through verbatim. Reproduced here so
    // the danger is visible rather than asserted: nothing about the token
    // changes, only which value the durable record was given.
    const durable = svc.introspect(issued.access_token);
    resetOAuth21Service();
    const afterDeploy = service();
    afterDeploy.importAccessToken({
      token: issued.access_token,
      clientId,
      scopes: durable.scopes || [],
      issuedAt: durable.issuedAt || Date.now(),
      expiresAt: durable.expiresAt || Date.now() + 3_600_000,
      agentId: VICTIM, // ← what `body.agent_id` used to supply
    });

    // The durable record IS the principal after a deploy. That is the whole
    // bypass: no grant ever approved this id.
    expect(afterDeploy.introspect(issued.access_token).agentId).toBe(VICTIM);
  });
});

describe('the durable record carries the registry spelling', () => {
  beforeEach(() => {
    resetOAuth21Service();
  });

  it('stamps the proven spelling when the caller asks in a different one', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    // Allowed on the strength of `agent_owner`, because the comparison is case-
    // and whitespace-insensitive. What is STAMPED must still be the registry's
    // spelling: downstream principals are compared as raw strings, so letting
    // the caller choose the spelling lets it choose which comparisons it wins.
    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: '  AGENT_Owner ',
      provenAgentId: OWNER,
    });

    expect(stampedAgentIdFor(svc, issued)).toBe(OWNER);
    expect(stampedAgentIdFor(svc, issued)).not.toBe('  AGENT_Owner ');
  });

  it('carries that spelling through a rotation as well', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
      agentId: 'AGENT_OWNER',
      provenAgentId: OWNER,
    });
    const refreshed = svc.refreshAccessToken({
      refreshToken: issued.refresh_token,
      clientId,
      clientSecret,
    });

    expect(stampedAgentIdFor(svc, refreshed)).toBe(OWNER);
  });

  it('leaves a token with no agent_id anonymous through a rotation', () => {
    const svc = service();
    const { clientId, clientSecret } = confidentialClient(svc);

    const issued = svc.exchangeClientCredentials({
      clientId,
      clientSecret,
      scopes: ['tools:read'],
    });
    const refreshed = svc.refreshAccessToken({
      refreshToken: issued.refresh_token,
      clientId,
      clientSecret,
    });

    expect(stampedAgentIdFor(svc, refreshed)).toBeUndefined();
  });
});
