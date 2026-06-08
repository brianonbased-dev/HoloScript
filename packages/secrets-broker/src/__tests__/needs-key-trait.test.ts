import { describe, it, expect } from 'vitest';
import { createSecretStore, createInMemorySecretBackend } from '../secret-store';
import {
  createEnvKekProvider,
  generateKekBase64,
  KEK_CURRENT_ENV,
  kekEnvVar,
} from '../env-kek-provider';
import { createSecretResolver } from '../secret-resolver';
import { createNeedsKeyHandler, type NeedsKeyDispatchContext } from '../needs-key-trait';

function buildResolver() {
  const env = { [KEK_CURRENT_ENV]: 'v1', [kekEnvVar('v1')]: generateKekBase64() };
  const store = createSecretStore({
    backend: createInMemorySecretBackend(),
    kekProvider: createEnvKekProvider({ env }),
  });
  return { store, resolver: createSecretResolver({ store }) };
}

interface Captured {
  events: Array<{ event: string; payload: unknown }>;
  provided: Array<{ ref: string; value: string }>;
}
function mockContext(): NeedsKeyDispatchContext & Captured {
  const events: Captured['events'] = [];
  const provided: Captured['provided'] = [];
  return {
    events,
    provided,
    emit(event, payload) {
      events.push({ event, payload });
    },
    provideSecret(ref, value) {
      provided.push({ ref, value });
    },
  };
}

describe('@needs_key trait (HoloKey custody axis of HoloGate)', () => {
  it('resolves the secret at attach, stashes it transiently for siblings, emits ready WITHOUT the value', async () => {
    const { store, resolver } = buildResolver();
    await store.put({ ownerId: 'user-A', name: 'OPENAI_API_KEY', value: 'sk-live-XYZ' });
    const handler = createNeedsKeyHandler({ resolver, authenticatedOwnerId: 'user-A' });
    const node: { id: string; __resolvedSecrets?: Record<string, string> } = { id: 'brittney' };
    const ctx = mockContext();

    await handler.onAttach(node, { ref: 'vault:OPENAI_API_KEY', purpose: 'llm-call' }, ctx);

    // transient stash for sibling traits on the same node
    expect(node.__resolvedSecrets?.['vault:OPENAI_API_KEY']).toBe('sk-live-XYZ');
    expect(ctx.provided).toEqual([{ ref: 'vault:OPENAI_API_KEY', value: 'sk-live-XYZ' }]);
    // ready signal carries ref + purpose, never the value
    const ready = ctx.events.find((e) => e.event === 'needs_key_ready');
    expect(ready?.payload).toMatchObject({
      nodeId: 'brittney',
      ref: 'vault:OPENAI_API_KEY',
      purpose: 'llm-call',
    });
    // the plaintext appears in NO emitted event
    expect(JSON.stringify(ctx.events)).not.toContain('sk-live-XYZ');
  });

  it('FAILS CLOSED with no authenticated owner — denied, nothing stashed, no value anywhere', async () => {
    const { store, resolver } = buildResolver();
    await store.put({ ownerId: 'user-A', name: 'KEY', value: 'top-secret' });
    const handler = createNeedsKeyHandler({ resolver, authenticatedOwnerId: undefined });
    const node: { id: string; __resolvedSecrets?: Record<string, string> } = { id: 'n' };
    const ctx = mockContext();

    await handler.onAttach(node, { ref: 'vault:KEY' }, ctx);

    expect(ctx.events.find((e) => e.event === 'needs_key_denied')?.payload).toMatchObject({
      reason: 'unauthenticated',
      ref: 'vault:KEY',
    });
    expect(node.__resolvedSecrets).toBeUndefined();
    expect(ctx.provided).toHaveLength(0);
    expect(JSON.stringify(ctx.events)).not.toContain('top-secret');
  });

  it("denies a cross-owner key (user B cannot resolve user A's secret), no value leaked", async () => {
    const { store, resolver } = buildResolver();
    await store.put({ ownerId: 'user-A', name: 'KEY', value: 'a-only' });
    const handler = createNeedsKeyHandler({ resolver, authenticatedOwnerId: 'user-B' });
    const ctx = mockContext();

    await handler.onAttach({ id: 'n' }, { ref: 'vault:KEY' }, ctx);

    expect(ctx.events.find((e) => e.event === 'needs_key_denied')?.payload).toMatchObject({
      reason: 'not_found',
    });
    expect(JSON.stringify(ctx.events)).not.toContain('a-only');
  });

  it('emits needs_key_error for malformed config (missing ref)', async () => {
    const { resolver } = buildResolver();
    const handler = createNeedsKeyHandler({ resolver, authenticatedOwnerId: 'user-A' });
    const ctx = mockContext();

    await handler.onAttach({ id: 'n' }, {}, ctx);

    expect(ctx.events.find((e) => e.event === 'needs_key_error')).toBeDefined();
  });
});
