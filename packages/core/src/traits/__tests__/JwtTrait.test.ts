/**
 * JwtTrait — tests
 * Note: jwt:issued/jwt:verified emit asynchronously via jose — we test counter state only.
 */
import { describe, it, expect, vi } from 'vitest';
import { jwtHandler } from '../JwtTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __jwtState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { algorithm: 'HS256', default_expiry_s: 3600, secret: 'test-secret' };

describe('JwtTrait', () => {
  it('has name "jwt"', () => {
    expect(jwtHandler.name).toBe('jwt');
  });

  it('defaultConfig algorithm=HS256, default_expiry_s=3600', () => {
    expect(jwtHandler.defaultConfig?.algorithm).toBe('HS256');
    expect(jwtHandler.defaultConfig?.default_expiry_s).toBe(3600);
  });

  it('onAttach initializes issued=0, verified=0', () => {
    const node = makeNode();
    jwtHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__jwtState as { issued: number; verified: number };
    expect(state.issued).toBe(0);
    expect(state.verified).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    jwtHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    jwtHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__jwtState).toBeUndefined();
  });

  it('jwt:issue increments issued counter', () => {
    const node = makeNode();
    jwtHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    jwtHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'jwt:issue', sub: 'user-1', claims: { role: 'admin' },
    } as never);
    expect((node.__jwtState as { issued: number }).issued).toBe(1);
  });

  it('jwt:verify increments verified counter', () => {
    const node = makeNode();
    jwtHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    jwtHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'jwt:verify', token: 'some.jwt.token',
    } as never);
    expect((node.__jwtState as { verified: number }).verified).toBe(1);
  });
});
