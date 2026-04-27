/**
 * ConsentManagementTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { consentManagementHandler } from '../ConsentManagementTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __consentState: undefined as unknown,
});

const defaultConfig = { required_consents: ['analytics', 'marketing'] };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ConsentManagementTrait — metadata', () => {
  it('has name "consent_management"', () => {
    expect(consentManagementHandler.name).toBe('consent_management');
  });

  it('defaultConfig required_consents contains analytics and marketing', () => {
    expect(consentManagementHandler.defaultConfig?.required_consents).toContain('analytics');
    expect(consentManagementHandler.defaultConfig?.required_consents).toContain('marketing');
  });
});

describe('ConsentManagementTrait — lifecycle', () => {
  it('onAttach initializes consents map', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__consentState as { consents: Map<string, Map<string, boolean>> };
    expect(state.consents).toBeInstanceOf(Map);
    expect(state.consents.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__consentState).toBeUndefined();
  });
});

describe('ConsentManagementTrait — onEvent', () => {
  it('consent:grant stores consent and emits consent:granted', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'u1', purpose: 'analytics',
    } as never);
    const state = node.__consentState as { consents: Map<string, Map<string, boolean>> };
    expect(state.consents.get('u1')?.get('analytics')).toBe(true);
    expect(node.emit).toHaveBeenCalledWith('consent:granted', { userId: 'u1', purpose: 'analytics' });
  });

  it('consent:grant creates user entry if missing', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'newUser', purpose: 'marketing',
    } as never);
    const state = node.__consentState as { consents: Map<string, Map<string, boolean>> };
    expect(state.consents.has('newUser')).toBe(true);
  });

  it('consent:revoke sets consent to false', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'u2', purpose: 'analytics',
    } as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:revoke', userId: 'u2', purpose: 'analytics',
    } as never);
    const state = node.__consentState as { consents: Map<string, Map<string, boolean>> };
    expect(state.consents.get('u2')?.get('analytics')).toBe(false);
    expect(node.emit).toHaveBeenCalledWith('consent:revoked', { userId: 'u2', purpose: 'analytics' });
  });

  it('consent:check returns true when granted', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'u3', purpose: 'marketing',
    } as never);
    node.emit.mockClear();
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:check', userId: 'u3', purpose: 'marketing',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('consent:status', {
      userId: 'u3', purpose: 'marketing', granted: true,
    });
  });

  it('consent:check returns false for unknown user', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:check', userId: 'nobody', purpose: 'analytics',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('consent:status', {
      userId: 'nobody', purpose: 'analytics', granted: false,
    });
  });

  it('multiple users have independent consent maps', () => {
    const node = makeNode();
    consentManagementHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'alice', purpose: 'analytics',
    } as never);
    consentManagementHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent:grant', userId: 'bob', purpose: 'marketing',
    } as never);
    const state = node.__consentState as { consents: Map<string, Map<string, boolean>> };
    expect(state.consents.get('alice')?.get('marketing')).toBeUndefined();
    expect(state.consents.get('bob')?.get('analytics')).toBeUndefined();
  });
});
