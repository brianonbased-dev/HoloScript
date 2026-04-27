/**
 * ConsentGateTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { consentGateHandler } from '../ConsentGateTrait';
import type { ConsentGateState } from '../ConsentGateTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __consentGateState: undefined as unknown,
});

const defaultConfig = {
  scope: ['camera' as const],
  expiry_ms: 0,
  require_explicit: true,
  audit_log: true,
  purpose: 'AR camera access',
};

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ConsentGateTrait — metadata', () => {
  it('has name "consent_gate"', () => {
    expect(consentGateHandler.name).toBe('consent_gate');
  });

  it('defaultConfig scope is ["camera"]', () => {
    expect(consentGateHandler.defaultConfig?.scope).toEqual(['camera']);
  });
});

describe('ConsentGateTrait — onAttach / onDetach', () => {
  it('onAttach initializes state as pending and emits consent_requested', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('pending');
    expect(state.grantedAt).toBeNull();
    expect(node.emit).toHaveBeenCalledWith('consent_requested', expect.objectContaining({
      scope: ['camera'],
      purpose: 'AR camera access',
    }));
  });

  it('onAttach appends to auditLog when audit_log=true', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.auditLog.length).toBeGreaterThanOrEqual(1);
    expect(state.auditLog[0].action).toBe('requested');
  });

  it('onDetach emits consent_revoked when status=granted', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_grant',
    } as never);
    node.emit.mockClear();
    consentGateHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('consent_revoked', expect.objectContaining({
      reason: 'detach',
    }));
  });

  it('onDetach does NOT emit consent_revoked when status=pending', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.emit).not.toHaveBeenCalledWith('consent_revoked', expect.anything());
  });
});

describe('ConsentGateTrait — onEvent', () => {
  it('consent_grant transitions status to granted and emits consent_granted', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_grant',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('granted');
    expect(state.grantedAt).not.toBeNull();
    expect(node.emit).toHaveBeenCalledWith('consent_granted', expect.objectContaining({
      scope: ['camera'],
    }));
  });

  it('consent_grant sets expiresAt when expiry_ms > 0', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, expiry_ms: 5000 };
    consentGateHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    consentGateHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'consent_grant',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.expiresAt).not.toBeNull();
    expect(state.expiresAt!).toBeGreaterThan(state.grantedAt!);
  });

  it('consent_deny transitions status to denied and emits consent_denied', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_deny', reason: 'user refused',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('denied');
    expect(node.emit).toHaveBeenCalledWith('consent_denied', expect.objectContaining({
      reason: 'user refused',
    }));
  });

  it('consent_revoke transitions status to revoked and emits consent_revoked', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_grant',
    } as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_revoke',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('revoked');
    expect(node.emit).toHaveBeenCalledWith('consent_revoked', expect.anything());
  });

  it('consent_expire transitions to expired and emits consent_expired', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_expire',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('expired');
    expect(node.emit).toHaveBeenCalledWith('consent_expired', expect.anything());
  });

  it('consent_request re-sets to pending after denial', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_deny',
    } as never);
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_request',
    } as never);
    const state = node.__consentGateState as ConsentGateState;
    expect(state.status).toBe('pending');
  });

  it('consent_query emits consent_status_response', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_query', queryId: 'q42',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('consent_status_response', expect.objectContaining({
      queryId: 'q42',
      status: 'pending',
    }));
  });

  it('consent_audit_query returns audit log', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    node.emit.mockClear();
    consentGateHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'consent_audit_query', queryId: 'aq1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('consent_audit_response', expect.objectContaining({
      queryId: 'aq1',
      log: expect.arrayContaining([expect.objectContaining({ action: 'requested' })]),
    }));
  });
});
