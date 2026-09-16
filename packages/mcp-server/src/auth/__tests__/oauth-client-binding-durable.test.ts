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
import { agentIdBindingAllowed } from '../oauth2-provider';

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
