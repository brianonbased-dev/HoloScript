/**
 * ConsentGateTrait — Production Tests
 */
import { describe, it, expect, vi } from 'vitest';
import { consentGateHandler } from '../ConsentGateTrait';

function makeNode() {
  return {} as any;
}
function makeCtx(emitFn = vi.fn()) {
  return { emit: emitFn } as any;
}

describe('ConsentGateTrait — defaultConfig', () => {
  it('scope=[camera]', () => expect(consentGateHandler.defaultConfig.scope).toEqual(['camera']));
  it('expiry_ms=0', () => expect(consentGateHandler.defaultConfig.expiry_ms).toBe(0));
  it('require_explicit=true', () =>
    expect(consentGateHandler.defaultConfig.require_explicit).toBe(true));
  it('audit_log=true', () => expect(consentGateHandler.defaultConfig.audit_log).toBe(true));
});

describe('ConsentGateTrait — onAttach', () => {
  it('status starts as pending', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    expect((node as any).__consentGateState.status).toBe('pending');
  });
  it('emits consent_requested with scope and purpose', () => {
    const node = makeNode();
    const emit = vi.fn();
    const cfg = {
      ...consentGateHandler.defaultConfig,
      scope: ['camera', 'microphone'] as any,
      purpose: 'AR overlay',
    };
    consentGateHandler.onAttach!(node, cfg, makeCtx(emit));
    expect(emit).toHaveBeenCalledWith(
      'consent_requested',
      expect.objectContaining({
        scope: ['camera', 'microphone'],
        purpose: 'AR overlay',
      })
    );
  });
  it('adds requested entry to auditLog when audit_log=true', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    const log = (node as any).__consentGateState.auditLog;
    expect(log).toHaveLength(1);
    expect(log[0].action).toBe('requested');
  });
  it('no auditLog entry when audit_log=false', () => {
    const node = makeNode();
    const cfg = { ...consentGateHandler.defaultConfig, audit_log: false };
    consentGateHandler.onAttach!(node, cfg, makeCtx());
    expect((node as any).__consentGateState.auditLog).toHaveLength(0);
  });
  it('grantedAt=null initially', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    expect((node as any).__consentGateState.grantedAt).toBeNull();
  });
});

describe('ConsentGateTrait — onDetach', () => {
  it('removes state', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onDetach!(node, consentGateHandler.defaultConfig, makeCtx());
    expect((node as any).__consentGateState).toBeUndefined();
  });
  it('emits consent_revoked when detaching in granted state', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'granted';
    consentGateHandler.onDetach!(node, consentGateHandler.defaultConfig, makeCtx(emit));
    expect(emit).toHaveBeenCalledWith(
      'consent_revoked',
      expect.objectContaining({ reason: 'detach' })
    );
  });
  it('no revoke emitted when already pending', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onDetach!(node, consentGateHandler.defaultConfig, makeCtx(emit));
    expect(emit).not.toHaveBeenCalledWith('consent_revoked', expect.anything());
  });
});

describe('ConsentGateTrait — onEvent: consent_grant', () => {
  it('pending → granted, sets status + grantedAt', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(), {
      type: 'consent_grant',
    });
    const st = (node as any).__consentGateState;
    expect(st.status).toBe('granted');
    expect(st.grantedAt).toBeGreaterThan(0);
  });
  it('emits consent_granted', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_grant',
    });
    expect(emit).toHaveBeenCalledWith(
      'consent_granted',
      expect.objectContaining({ scope: ['camera'] })
    );
  });
  it('no expiry when expiry_ms=0', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(), {
      type: 'consent_grant',
    });
    expect((node as any).__consentGateState.expiresAt).toBeNull();
  });
  it('sets expiresAt when expiry_ms>0', () => {
    const node = makeNode();
    const cfg = { ...consentGateHandler.defaultConfig, expiry_ms: 5000 };
    consentGateHandler.onAttach!(node, cfg, makeCtx());
    consentGateHandler.onEvent!(node, cfg, makeCtx(), { type: 'consent_grant' });
    const st = (node as any).__consentGateState;
    expect(st.expiresAt).toBeGreaterThan(st.grantedAt!);
    expect(st.expiresAt! - st.grantedAt!).toBe(5000);
  });
  it('granted appended to auditLog', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(), {
      type: 'consent_grant',
    });
    const log = (node as any).__consentGateState.auditLog;
    const grantEntry = log.find((e: any) => e.action === 'granted');
    expect(grantEntry).toBeDefined();
  });
  it('denied state cannot be re-granted via consent_grant', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'denied';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(), {
      type: 'consent_grant',
    });
    // denied → grant not allowed (only pending/revoked/expired eligible)
    expect((node as any).__consentGateState.status).toBe('denied');
  });
});

describe('ConsentGateTrait — onEvent: consent_deny', () => {
  it('sets status=denied, emits consent_denied', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_deny',
      reason: 'user_declined',
    });
    expect((node as any).__consentGateState.status).toBe('denied');
    expect(emit).toHaveBeenCalledWith(
      'consent_denied',
      expect.objectContaining({ reason: 'user_declined' })
    );
  });
});

describe('ConsentGateTrait — onEvent: consent_revoke', () => {
  it('granted → revoked, emits consent_revoked', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'granted';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_revoke',
      reason: 'policy_change',
    });
    expect((node as any).__consentGateState.status).toBe('revoked');
    expect(emit).toHaveBeenCalledWith(
      'consent_revoked',
      expect.objectContaining({ reason: 'policy_change' })
    );
  });
});

describe('ConsentGateTrait — onEvent: consent_expire', () => {
  it('sets status=expired, emits consent_expired', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'granted';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_expire',
    });
    expect((node as any).__consentGateState.status).toBe('expired');
    expect(emit).toHaveBeenCalledWith('consent_expired', expect.anything());
  });
});

describe('ConsentGateTrait — onEvent: consent_request (re-request)', () => {
  it('denied → pending → emits consent_requested', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'denied';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_request',
    });
    expect((node as any).__consentGateState.status).toBe('pending');
    expect(emit).toHaveBeenCalledWith('consent_requested', expect.anything());
  });
  it('expired → pending → emits consent_requested', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'expired';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_request',
    });
    expect((node as any).__consentGateState.status).toBe('pending');
  });
  it('already granted: no re-request', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    (node as any).__consentGateState.status = 'granted';
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_request',
    });
    // Status stays granted, no second consent_requested
    const requestedCalls = emit.mock.calls.filter(([e]) => e === 'consent_requested');
    expect(requestedCalls).toHaveLength(0);
  });
});

describe('ConsentGateTrait — onEvent: consent_query', () => {
  it('responds with status snapshot', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_query',
      queryId: 'cq1',
    });
    expect(emit).toHaveBeenCalledWith(
      'consent_status_response',
      expect.objectContaining({
        queryId: 'cq1',
        status: 'pending',
        scope: ['camera'],
      })
    );
  });
});

describe('ConsentGateTrait — onEvent: consent_audit_query', () => {
  it('returns audit log copy', () => {
    const node = makeNode();
    const emit = vi.fn();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(), {
      type: 'consent_grant',
    });
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, makeCtx(emit), {
      type: 'consent_audit_query',
      queryId: 'aq1',
    });
    const call = emit.mock.calls.find(([e]) => e === 'consent_audit_response');
    expect(call?.[1].log.length).toBeGreaterThanOrEqual(2); // requested + granted
    expect(call?.[1].queryId).toBe('aq1');
  });
});

describe('ConsentGateTrait — onUpdate (expiry check)', () => {
  it('expired → sets status=expired', () => {
    const node = makeNode();
    const cfg = { ...consentGateHandler.defaultConfig, expiry_ms: 1000 };
    consentGateHandler.onAttach!(node, cfg, makeCtx());
    const st = (node as any).__consentGateState;
    st.status = 'granted';
    st.expiresAt = Date.now() - 1; // already expired
    consentGateHandler.onUpdate!(node, cfg, makeCtx(), 0.016);
    expect(st.status).toBe('expired');
  });
  it('not expired → status unchanged', () => {
    const node = makeNode();
    const cfg = { ...consentGateHandler.defaultConfig, expiry_ms: 60000 };
    consentGateHandler.onAttach!(node, cfg, makeCtx());
    const st = (node as any).__consentGateState;
    st.status = 'granted';
    st.expiresAt = Date.now() + 60000;
    consentGateHandler.onUpdate!(node, cfg, makeCtx(), 0.016);
    expect(st.status).toBe('granted');
  });
  it('expiry_ms=0 never expires', () => {
    const node = makeNode();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, makeCtx());
    const st = (node as any).__consentGateState;
    st.status = 'granted';
    st.expiresAt = null;
    consentGateHandler.onUpdate!(node, consentGateHandler.defaultConfig, makeCtx(), 1000);
    expect(st.status).toBe('granted');
  });
});

describe('ConsentGateTrait — full lifecycle: pending → grant → revoke → re-request → deny', () => {
  it('complete lifecycle audit trail', () => {
    const node = makeNode();
    const context = makeCtx();
    consentGateHandler.onAttach!(node, consentGateHandler.defaultConfig, context);
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, context, {
      type: 'consent_grant',
    });
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, context, {
      type: 'consent_revoke',
      reason: 'r1',
    });
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, context, {
      type: 'consent_request',
    });
    consentGateHandler.onEvent!(node, consentGateHandler.defaultConfig, context, {
      type: 'consent_deny',
      reason: 'r2',
    });
    const log = (node as any).__consentGateState.auditLog;
    const actions = log.map((e: any) => e.action);
    expect(actions).toEqual(['requested', 'granted', 'revoked', 'requested', 'denied']);
  });
});
