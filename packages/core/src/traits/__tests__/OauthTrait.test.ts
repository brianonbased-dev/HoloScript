/**
 * OauthTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { oauthHandler } from '../OauthTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __oauthState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { providers: ['google', 'github'] };

describe('OauthTrait', () => {
  it('has name "oauth"', () => {
    expect(oauthHandler.name).toBe('oauth');
  });

  it('oauth:authorize emits oauth:redirect', () => {
    const node = makeNode();
    oauthHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    oauthHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'oauth:authorize', provider: 'github', scopes: ['read:user'],
    } as never);
    expect(node.emit).toHaveBeenCalledWith('oauth:redirect', expect.objectContaining({ provider: 'github' }));
  });

  it('oauth:callback emits oauth:token with accessToken', () => {
    const node = makeNode();
    oauthHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    oauthHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'oauth:callback', code: 'code123', state: 's1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('oauth:token', expect.objectContaining({ expiresIn: 3600 }));
  });

  it('oauth:revoke emits oauth:revoked', () => {
    const node = makeNode();
    oauthHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    oauthHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'oauth:revoke', token: 'at_123',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('oauth:revoked', { token: 'at_123' });
  });
});
