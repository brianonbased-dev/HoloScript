import { describe, expect, it } from 'vitest';
import type { SecretResolver } from '@holoscript/secrets-broker';
import type { SigningContext } from '../holomesh/identity/signing-middleware';
import { ownerIdFromSigningContext, registerNeedsKeyTraitForMcpRequest } from '../holokey-resolver';

function signingCtx(signer: string | null): SigningContext {
  return {
    signedRequest: true,
    signingValid: signer !== null,
    signer,
    signingProtocol: 'dual',
    dualMode: 'dual',
  };
}

describe('registerNeedsKeyTraitForMcpRequest', () => {
  it('derives the @needs_key owner from a verified SigningContext signer', () => {
    expect(ownerIdFromSigningContext(signingCtx('0xabc'))).toBe('0xabc');
    expect(ownerIdFromSigningContext({ ...signingCtx('0xabc'), signingValid: false })).toBeNull();
    expect(ownerIdFromSigningContext(undefined)).toBeNull();
  });

  it('registers @needs_key with the request-scoped owner and resolver', async () => {
    const resolver: SecretResolver = {
      async resolve(input) {
        return { value: `secret-for-${input.authenticatedOwnerId ?? '<none>'}` };
      },
    };
    const registered: Array<{ name: string; handler: unknown }> = [];

    const result = registerNeedsKeyTraitForMcpRequest(
      { registerTrait: (name, handler) => registered.push({ name, handler }) },
      { signingCtx: signingCtx('0xfeed'), resolver }
    );

    expect(result).toEqual({
      registered: true,
      ownerId: '0xfeed',
      authenticated: true,
      vaultConfigured: true,
    });
    expect(registered[0]?.name).toBe('needs_key');

    const handler = registered[0]!.handler as {
      onAttach(
        node: { id: string; __resolvedSecrets?: Record<string, string> },
        config: { ref: 'vault:OPENAI_API_KEY' },
        context: { emit(event: string, payload?: unknown): void }
      ): Promise<void>;
    };
    const node: { id: string; __resolvedSecrets?: Record<string, string> } = { id: 'mcp-node' };
    const events: Array<{ event: string; payload?: unknown }> = [];

    await handler.onAttach(
      node,
      { ref: 'vault:OPENAI_API_KEY' },
      {
        emit(event, payload) {
          events.push({ event, payload });
        },
      }
    );

    expect(node.__resolvedSecrets?.['vault:OPENAI_API_KEY']).toBe('secret-for-0xfeed');
    expect(events.find((e) => e.event === 'needs_key_ready')?.payload).toMatchObject({
      nodeId: 'mcp-node',
      ref: 'vault:OPENAI_API_KEY',
    });
    expect(JSON.stringify(events)).not.toContain('secret-for-0xfeed');
  });

  it('still registers a fail-closed trait when the request has no signer', async () => {
    const registered: Array<{ name: string; handler: unknown }> = [];
    const result = registerNeedsKeyTraitForMcpRequest({
      registerTrait: (name, handler) => registered.push({ name, handler }),
    });

    expect(result.registered).toBe(true);
    expect(result.ownerId).toBeNull();
    expect(result.authenticated).toBe(false);

    const handler = registered[0]!.handler as {
      onAttach(
        node: { id: string; __resolvedSecrets?: Record<string, string> },
        config: { ref: 'vault:OPENAI_API_KEY' },
        context: { emit(event: string, payload?: unknown): void }
      ): Promise<void>;
    };
    const events: Array<{ event: string; payload?: unknown }> = [];

    await handler.onAttach(
      { id: 'unauthenticated' },
      { ref: 'vault:OPENAI_API_KEY' },
      {
        emit(event, payload) {
          events.push({ event, payload });
        },
      }
    );

    expect(events.find((e) => e.event === 'needs_key_denied')?.payload).toMatchObject({
      nodeId: 'unauthenticated',
      ref: 'vault:OPENAI_API_KEY',
      reason: 'unauthenticated',
    });
    expect(JSON.stringify(events)).not.toContain('OPENAI_API_KEY=');
  });
});
