/**
 * A registered agent binding must survive a deploy.
 *
 * `POST /oauth/register` records the agent a client proved, and a later token
 * request may stamp that agent_id without re-presenting the key. That binding
 * lived only in the module-level in-memory registry, which is wiped on every
 * push — and the durable `oauth_clients` row had no agent column, so rehydration
 * brought the client back WITHOUT its agent.
 *
 * The result was the second failure, not the first: no door was left open, but
 * the same legitimate caller — one that had already proved the agent once, at
 * registration — was refused `invalid_request` on its next token request, with
 * nothing in the response saying the binding had been forgotten rather than
 * never granted. A binding that silently expires at deploy time is not a
 * binding.
 *
 * These tests drive the store layer, which is where the column lives. What they
 * do NOT cover is the HTTP wiring in `http-server.ts` (`ensureClientHydrated`,
 * and the dual-write at `/oauth/register`): that file builds a server and
 * listens at import time, so it cannot be exercised without booting one.
 */
import { describe, expect, it } from 'vitest';
import { InMemoryTokenStore, TokenStore } from '../token-store';
import { agentIdBindingAllowed, prepareClientForUse } from '../oauth2-provider';
import { registrationProvedNothing } from '../../security/proven-agent-id';
import { OAuth21Service, resetOAuth21Service } from '../../security/oauth21';

/** cleanupIntervalMs 0: no timer, so the suite never holds the event loop open. */
function storeOver(backend: InMemoryTokenStore): TokenStore {
  return new TokenStore({ backend, cleanupIntervalMs: 0 });
}

const REGISTRATION = {
  clientName: 'bound-client',
  redirectUris: ['https://studio.test/callback'],
  scopes: ['tools:read'],
  clientType: 'confidential' as const,
};

describe('the client agent binding is durable', () => {
  it('reads back the agent a registration bound', async () => {
    const store = storeOver(new InMemoryTokenStore());

    const { clientId } = await store.registerClient({ ...REGISTRATION, agentId: 'agent_owner' });

    expect((await store.getClient(clientId))?.agentId).toBe('agent_owner');
  });

  it('records no agent when the registration proved none', async () => {
    const store = storeOver(new InMemoryTokenStore());

    const { clientId } = await store.registerClient(REGISTRATION);

    // Fails closed: an unproven agent_id must never become a durable binding.
    expect((await store.getClient(clientId))?.agentId).toBeUndefined();
  });

  it('survives the deploy that wipes the in-memory registry', async () => {
    const backend = new InMemoryTokenStore();
    const { clientId } = await storeOver(backend).registerClient({
      ...REGISTRATION,
      agentId: 'agent_owner',
    });

    // A fresh store over the same backend is what a redeployed process gets.
    const rehydrated = await storeOver(backend).getClient(clientId);

    expect(rehydrated?.agentId).toBe('agent_owner');
  });

  it('is what lets the same token request through after that deploy', async () => {
    const backend = new InMemoryTokenStore();
    const { clientId } = await storeOver(backend).registerClient({
      ...REGISTRATION,
      agentId: 'agent_owner',
    });

    const rehydrated = await storeOver(backend).getClient(clientId);

    // No key presented on this request — exactly the post-deploy case that was
    // being refused.
    expect(
      agentIdBindingAllowed({
        requestedAgentId: 'agent_owner',
        clientAgentId: rehydrated?.agentId,
      })
    ).toBe(true);

    // ...and the restored binding is not a skeleton key for any other agent.
    expect(
      agentIdBindingAllowed({
        requestedAgentId: 'agent_founder',
        clientAgentId: rehydrated?.agentId,
      })
    ).toBe(false);
  });

  it('refuses the agent_id when the binding was never recorded', async () => {
    const backend = new InMemoryTokenStore();
    const { clientId } = await storeOver(backend).registerClient(REGISTRATION);

    const rehydrated = await storeOver(backend).getClient(clientId);

    expect(
      agentIdBindingAllowed({
        requestedAgentId: 'agent_owner',
        clientAgentId: rehydrated?.agentId,
      })
    ).toBe(false);
  });

  it('overwrites the binding on re-registration rather than merging it', async () => {
    const backend = new InMemoryTokenStore();
    const store = storeOver(backend);
    const { clientId, clientSecret } = await store.registerClient({
      ...REGISTRATION,
      agentId: 'agent_owner',
    });

    // Import mode reuses the identity; the row must end up saying what this
    // registration said, not a mix of both.
    await store.registerClient({ ...REGISTRATION, clientId, clientSecret });

    expect((await store.getClient(clientId))?.agentId).toBeUndefined();
  });
});

// ── An unproven registration stays unproven across a deploy (board task zkdg) ──

describe('an unproven registration keeps its narrowed tools:execute', () => {
  const EXECUTE = { ...REGISTRATION, scopes: ['tools:read', 'tools:execute'] };

  it('decides "proved nothing" only for an unproven, non-loopback-on-a-closed-door registrant', () => {
    const decide = (provenAgentId: string | undefined, loopback: boolean, open: boolean) =>
      registrationProvedNothing({
        provenAgentId,
        registrarIsLoopback: loopback,
        remoteRegistrationAllowed: open,
      });
    expect(decide(undefined, true, false)).toBe(false); // this host, door closed
    expect(decide(undefined, true, true)).toBe(true); // door open: a proxy makes everyone loopback
    expect(decide(undefined, false, true)).toBe(true); // a remote stranger
    expect(decide('agent_owner', false, true)).toBe(false); // proved an agent key
    expect(decide('agent_owner', true, true)).toBe(false);
  });

  it('the durable store issues tools:write, not tools:execute, to an unproven client, before and after a deploy', async () => {
    const backend = new InMemoryTokenStore();
    const { clientId } = await storeOver(backend).registerClient({
      ...EXECUTE,
      registeredUnproven: true,
    });

    const redeployed = storeOver(backend);
    expect((await redeployed.getClient(clientId))?.registeredUnproven).toBe(true);
    const { accessToken, refreshToken } = await redeployed.issueTokenPair({
      clientId,
      scopes: ['tools:read', 'tools:execute'],
    });
    expect(accessToken.scopes).toEqual(['tools:read', 'tools:write']);
    expect(refreshToken.scopes).toEqual(['tools:read', 'tools:write']);
  });

  it('a trusted client is untouched', async () => {
    const store = storeOver(new InMemoryTokenStore());
    const { clientId } = await store.registerClient(EXECUTE);
    expect((await store.getClient(clientId))?.registeredUnproven).toBeUndefined();
    const { accessToken } = await store.issueTokenPair({
      clientId,
      scopes: ['tools:read', 'tools:execute'],
    });
    expect(accessToken.scopes).toEqual(['tools:read', 'tools:execute']);
  });

  it('the legacy registry, rehydrated after a deploy, still narrows the grant it issues', async () => {
    const backend = new InMemoryTokenStore();
    const clientId = 'hsc_unproven_after_deploy';
    const clientSecret = 'unproven-secret';
    await storeOver(backend).registerClient({
      ...EXECUTE,
      clientId,
      clientSecret,
      registeredUnproven: true,
    });

    // The deploy wiped the in-memory registry; the token endpoint rehydrates it first.
    resetOAuth21Service();
    const memory = new OAuth21Service({
      tokenSecret: 'test-secret-that-is-at-least-32-bytes-long-for-hmac',
      migrationMode: 'strict',
    });
    const durable = storeOver(backend);
    try {
      await prepareClientForUse(
        {
          memory,
          durable: {
            noteClientUse: (id: string) => durable.noteClientUse(id),
            getClient: (id: string) => durable.getClient(id),
          } as Parameters<typeof prepareClientForUse>[0]['durable'],
        },
        clientId
      );
      const issued = memory.exchangeClientCredentials({
        clientId,
        clientSecret,
        scopes: ['tools:read', 'tools:execute'],
      });
      expect(issued.scope).toBe('tools:read tools:write');
      expect(memory.introspect(issued.access_token).scopes).toEqual(['tools:read', 'tools:write']);
    } finally {
      resetOAuth21Service();
    }
  });
});

describe('the unproven mark only tightens (zkdg)', () => {
  it('a rewrite of the same client without the mark does not clear it', async () => {
    const store = storeOver(new InMemoryTokenStore());
    const clientId = 'hsc_sticky_unproven';
    const clientSecret = 'sticky-secret';
    await store.registerClient({ ...REGISTRATION, clientId, clientSecret, registeredUnproven: true });
    await store.registerClient({ ...REGISTRATION, clientId, clientSecret });
    expect((await store.getClient(clientId))?.registeredUnproven).toBe(true);
  });
});
