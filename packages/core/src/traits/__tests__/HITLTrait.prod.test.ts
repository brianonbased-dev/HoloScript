/**
 * HITLTrait — Production Test Suite
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../utils/HITLAuditLogger', () => ({
  HITLAuditLogger: { log: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('../../utils/ConstitutionalValidator', () => ({
  ConstitutionalValidator: {
    validate: vi.fn().mockReturnValue({ allowed: true, escalationLevel: 'none', violations: [] }),
  },
}));

vi.mock('../../logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { hitlHandler, evaluateAction, matchesCondition } from '../HITLTrait';
import { ConstitutionalValidator } from '../../utils/ConstitutionalValidator';

let _nodeId = 0;
function makeNode() {
  return { id: `hitl_${++_nodeId}` };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function makeConfig(o: any = {}) {
  return { ...hitlHandler.defaultConfig!, ...o };
}
function attach(o: any = {}) {
  const node = makeNode(),
    ctx = makeCtx(),
    config = makeConfig(o);
  hitlHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}
function getState(node: any) {
  return (node as any).__hitlState;
}
function makeBaseAction(o: any = {}) {
  return {
    action: 'act',
    category: 'write' as const,
    confidence: 0.9,
    riskScore: 0.2,
    description: '',
    ...o,
  };
}
function makeState(o: any = {}): any {
  return {
    currentMode: 'supervised',
    pendingApprovals: [],
    auditLog: [],
    rollbackCheckpoints: [],
    actionCountThisSession: 0,
    permissions: {},
    ...o,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (ConstitutionalValidator.validate as any).mockReturnValue({
    allowed: true,
    escalationLevel: 'none',
    violations: [],
  });
});

// ─── defaultConfig ────────────────────────────────────────────────────────────
describe('hitlHandler.defaultConfig', () => {
  const d = hitlHandler.defaultConfig!;
  it('mode=supervised', () => expect(d.mode).toBe('supervised'));
  it('confidence_threshold=0.8', () => expect(d.confidence_threshold).toBe(0.8));
  it('risk_threshold=0.5', () => expect(d.risk_threshold).toBe(0.5));
  it('always_approve includes financial+admin+delete', () => {
    expect(d.always_approve_categories).toEqual(
      expect.arrayContaining(['financial', 'admin', 'delete'])
    );
  });
  it('never_approve includes read', () => expect(d.never_approve_categories).toContain('read'));
  it('approval_timeout=600000', () => expect(d.approval_timeout).toBe(600000));
  it('auto_approve_on_timeout=false', () => expect(d.auto_approve_on_timeout).toBe(false));
  it('max_autonomous_actions=100', () => expect(d.max_autonomous_actions).toBe(100));
  it('enable_audit_log=true', () => expect(d.enable_audit_log).toBe(true));
  it('enable_rollback=true', () => expect(d.enable_rollback).toBe(true));
  it('rollback_retention=86400000', () => expect(d.rollback_retention).toBe(86400000));
  it('approved_operators=[]', () => expect(d.approved_operators).toEqual([]));
  it('constitution=[]', () => expect(d.constitution).toEqual([]));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────
describe('hitlHandler.onAttach', () => {
  it('creates __hitlState with isEnabled=true', () => {
    const { node } = attach();
    expect(getState(node).isEnabled).toBe(true);
  });
  it('currentMode matches config.mode', () => {
    const { node } = attach({ mode: 'manual' });
    expect(getState(node).currentMode).toBe('manual');
  });
  it('collections start empty', () => {
    const { node } = attach();
    const s = getState(node);
    expect(s.pendingApprovals).toEqual([]);
    expect(s.auditLog).toEqual([]);
    expect(s.rollbackCheckpoints).toEqual([]);
  });
  it('emits hitl_initialized with mode + thresholds', () => {
    const { ctx } = attach({ mode: 'autonomous', confidence_threshold: 0.7, risk_threshold: 0.4 });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_initialized',
      expect.objectContaining({ mode: 'autonomous', thresholds: { confidence: 0.7, risk: 0.4 } })
    );
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────
describe('hitlHandler.onDetach', () => {
  it('removes __hitlState', () => {
    const { node, ctx, config } = attach();
    hitlHandler.onDetach!(node as any, config, ctx as any);
    expect(getState(node)).toBeUndefined();
  });
  it('emits hitl_audit_persist when enable_audit_log=true', () => {
    const { node, ctx, config } = attach({ enable_audit_log: true });
    ctx.emit.mockClear();
    hitlHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('hitl_audit_persist', expect.objectContaining({ node }));
  });
  it('does NOT emit audit_persist when enable_audit_log=false', () => {
    const { node, ctx, config } = attach({ enable_audit_log: false });
    ctx.emit.mockClear();
    hitlHandler.onDetach!(node as any, config, ctx as any);
    expect(ctx.emit).not.toHaveBeenCalledWith('hitl_audit_persist', expect.anything());
  });
});

// ─── onUpdate ─────────────────────────────────────────────────────────────────
describe('hitlHandler.onUpdate — expired approvals', () => {
  it('marks expired approval as "expired" + emits hitl_approval_resolved', () => {
    const { node, ctx, config } = attach({ auto_approve_on_timeout: false });
    const state = getState(node);
    state.pendingApprovals.push({
      id: 'a1',
      timestamp: 0,
      agentId: 'x',
      action: 'act',
      category: 'write',
      description: '',
      confidence: 0.5,
      riskScore: 0.3,
      context: {},
      status: 'pending',
      expiresAt: Date.now() - 1,
      metadata: {},
    });
    ctx.emit.mockClear();
    hitlHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.pendingApprovals[0].status).toBe('expired');
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_approval_resolved',
      expect.objectContaining({ reason: 'timeout_expired' })
    );
  });
  it('marks as "auto_approved" when auto_approve_on_timeout=true', () => {
    const { node, ctx, config } = attach({ auto_approve_on_timeout: true });
    const state = getState(node);
    state.pendingApprovals.push({
      id: 'a2',
      timestamp: 0,
      agentId: 'x',
      action: 'act',
      category: 'write',
      description: '',
      confidence: 0.9,
      riskScore: 0.1,
      context: {},
      status: 'pending',
      expiresAt: Date.now() - 1,
      metadata: {},
    });
    ctx.emit.mockClear();
    hitlHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.pendingApprovals[0].status).toBe('auto_approved');
  });
  it('does NOT expire approvals not yet timed out', () => {
    const { node, ctx, config } = attach();
    const state = getState(node);
    state.pendingApprovals.push({
      id: 'a3',
      timestamp: 0,
      agentId: 'x',
      action: 'act',
      category: 'write',
      description: '',
      confidence: 0.9,
      riskScore: 0.1,
      context: {},
      status: 'pending',
      expiresAt: Date.now() + 60000,
      metadata: {},
    });
    hitlHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.pendingApprovals[0].status).toBe('pending');
  });
});

describe('hitlHandler.onUpdate — rollback pruning + mode cap', () => {
  it('removes expired rollback checkpoints', () => {
    const { node, ctx, config } = attach({ enable_rollback: true });
    const state = getState(node);
    state.rollbackCheckpoints.push({ id: 'rb1', expiresAt: Date.now() - 1 });
    state.rollbackCheckpoints.push({ id: 'rb2', expiresAt: Date.now() + 60000 });
    hitlHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.rollbackCheckpoints.length).toBe(1);
    expect(state.rollbackCheckpoints[0].id).toBe('rb2');
  });
  it('switches autonomous→supervised at max_autonomous_actions', () => {
    const { node, ctx, config } = attach({ mode: 'autonomous', max_autonomous_actions: 5 });
    const state = getState(node);
    state.currentMode = 'autonomous';
    state.actionCountThisSession = 5;
    ctx.emit.mockClear();
    hitlHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(state.currentMode).toBe('supervised');
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_mode_change',
      expect.objectContaining({ reason: 'max_autonomous_actions_reached' })
    );
  });
});

// ─── evaluateAction ───────────────────────────────────────────────────────────
describe('evaluateAction', () => {
  it('allows read (never_approve_categories) → category_exempt', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig(),
      makeBaseAction({ category: 'read' })
    );
    expect(r.approved).toBe(true);
    expect(r.reason).toBe('category_exempt');
  });
  it('blocks financial (always_approve) → category_requires_approval', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig(),
      makeBaseAction({ category: 'financial' })
    );
    expect(r.approved).toBe(false);
    expect(r.reason).toBe('category_requires_approval');
  });
  it('blocks manual mode → hard_block', () => {
    const r = evaluateAction(
      {} as any,
      makeState({ currentMode: 'manual' }),
      makeConfig(),
      makeBaseAction()
    );
    expect(r.approved).toBe(false);
    expect(r.escalationLevel).toBe('hard_block');
  });
  it('blocks low confidence', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig({ confidence_threshold: 0.8 }),
      makeBaseAction({ confidence: 0.6 })
    );
    expect(r.approved).toBe(false);
    expect(r.reason).toBe('low_confidence');
  });
  it('very low confidence (< 0.5) → hard_block', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig({ confidence_threshold: 0.8 }),
      makeBaseAction({ confidence: 0.3 })
    );
    expect(r.escalationLevel).toBe('hard_block');
  });
  it('blocks high risk', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig({ risk_threshold: 0.5 }),
      makeBaseAction({ riskScore: 0.7 })
    );
    expect(r.approved).toBe(false);
    expect(r.reason).toBe('high_risk');
  });
  it('risk > 0.8 → emergency_stop', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig({ risk_threshold: 0.5 }),
      makeBaseAction({ riskScore: 0.9 })
    );
    expect(r.escalationLevel).toBe('emergency_stop');
  });
  it('allows when all checks pass', () => {
    const r = evaluateAction(
      {} as any,
      makeState(),
      makeConfig(),
      makeBaseAction({ confidence: 0.95, riskScore: 0.1 })
    );
    expect(r.approved).toBe(true);
    expect(r.reason).toBe('passed_checks');
  });
  it('constitutional violation → isViolation=true', () => {
    (ConstitutionalValidator.validate as any).mockReturnValueOnce({
      allowed: false,
      escalationLevel: 'emergency_stop',
      violations: [{ rule: 'ban' }],
    });
    const r = evaluateAction({} as any, makeState(), makeConfig(), makeBaseAction());
    expect(r.approved).toBe(false);
    expect(r.isViolation).toBe(true);
  });
  it('confidenceBonus applied from permissions', () => {
    const state = makeState({
      permissions: { 'write:act': { approvals: 10, confidenceBonus: 0.1 } },
    });
    // confidence=0.8 + 0.1 = 0.9 → passes threshold 0.85
    const r = evaluateAction(
      {} as any,
      state,
      makeConfig({ confidence_threshold: 0.85 }),
      makeBaseAction({ confidence: 0.8 })
    );
    expect(r.approved).toBe(true);
  });
});

// ─── matchesCondition ─────────────────────────────────────────────────────────
describe('matchesCondition', () => {
  it('confidence_below: true when below', () =>
    expect(
      matchesCondition(
        { type: 'confidence_below', value: 0.5 },
        makeBaseAction({ confidence: 0.4 })
      )
    ).toBe(true));
  it('confidence_below: false when equal', () =>
    expect(
      matchesCondition(
        { type: 'confidence_below', value: 0.5 },
        makeBaseAction({ confidence: 0.5 })
      )
    ).toBe(false));
  it('risk_above: true when above', () =>
    expect(
      matchesCondition({ type: 'risk_above', value: 0.8 }, makeBaseAction({ riskScore: 0.9 }))
    ).toBe(true));
  it('risk_above: false when equal', () =>
    expect(
      matchesCondition({ type: 'risk_above', value: 0.8 }, makeBaseAction({ riskScore: 0.8 }))
    ).toBe(false));
  it('category_match (array): true when in array', () =>
    expect(
      matchesCondition(
        { type: 'category_match', value: ['write', 'delete'] },
        makeBaseAction({ category: 'write' })
      )
    ).toBe(true));
  it('category_match (array): false when not in array', () =>
    expect(
      matchesCondition(
        { type: 'category_match', value: ['delete'] },
        makeBaseAction({ category: 'write' })
      )
    ).toBe(false));
  it('category_match (string): true when equal', () =>
    expect(
      matchesCondition(
        { type: 'category_match', value: 'write' },
        makeBaseAction({ category: 'write' })
      )
    ).toBe(true));
  it('unknown type: false', () =>
    expect(matchesCondition({ type: 'unknown', value: 0 }, makeBaseAction())).toBe(false));
});

// ─── onEvent — agent_action_request ──────────────────────────────────────────
describe('hitlHandler.onEvent — agent_action_request', () => {
  it('auto-approve: emits hitl_action_approved', () => {
    const { node, ctx, config } = attach({
      never_approve_categories: [],
      always_approve_categories: [],
    });
    ctx.emit.mockClear();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_action_request',
      payload: {
        action: 'write_file',
        category: 'write',
        confidence: 0.95,
        riskScore: 0.1,
        description: '',
        metadata: {},
      },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_action_approved',
      expect.objectContaining({ autonomous: true })
    );
  });
  it('auto-approve: increments actionCountThisSession', () => {
    const { node, ctx, config } = attach({
      never_approve_categories: [],
      always_approve_categories: [],
    });
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_action_request',
      payload: {
        action: 'write_file',
        category: 'write',
        confidence: 0.95,
        riskScore: 0.1,
        description: '',
        metadata: {},
      },
    });
    expect(getState(node).actionCountThisSession).toBe(1);
  });
  it('approval required: emits hitl_approval_required for financial', () => {
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_action_request',
      payload: {
        action: 'pay',
        category: 'financial',
        confidence: 0.95,
        riskScore: 0.1,
        description: '',
        metadata: {},
      },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_approval_required',
      expect.objectContaining({ node })
    );
  });
  it('approval required: adds to pendingApprovals', () => {
    const { node, ctx, config } = attach();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_action_request',
      payload: {
        action: 'delete',
        category: 'delete',
        confidence: 0.9,
        riskScore: 0.2,
        description: '',
        metadata: {},
      },
    });
    expect(getState(node).pendingApprovals.length).toBe(1);
  });
  it('constitutional violation: emits hitl_violation_caught', () => {
    (ConstitutionalValidator.validate as any).mockReturnValueOnce({
      allowed: false,
      escalationLevel: 'emergency_stop',
      violations: [{}],
    });
    const { node, ctx, config } = attach();
    ctx.emit.mockClear();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'agent_action_request',
      payload: {
        action: 'harm',
        category: 'execute',
        confidence: 0.9,
        riskScore: 0.1,
        description: '',
        metadata: {},
      },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_violation_caught',
      expect.objectContaining({ action: 'harm' })
    );
  });
});

// ─── onEvent — operator_approval ─────────────────────────────────────────────
describe('hitlHandler.onEvent — operator_approval', () => {
  function withPending() {
    const { node, ctx, config } = attach({ approved_operators: [] });
    getState(node).pendingApprovals.push({
      id: 'ap1',
      action: 'tr',
      agentId: 'a',
      category: 'financial',
      description: '',
      confidence: 0.5,
      riskScore: 0.5,
      context: {},
      status: 'pending',
      expiresAt: Date.now() + 60000,
      metadata: {},
    });
    ctx.emit.mockClear();
    return { node, ctx, config };
  }
  it('approved → status="approved"', () => {
    const { node, ctx, config } = withPending();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'operator_approval',
      payload: { approvalId: 'ap1', approved: true, operator: 'admin' },
    });
    expect(getState(node).pendingApprovals[0].status).toBe('approved');
  });
  it('rejected → status="rejected"', () => {
    const { node, ctx, config } = withPending();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'operator_approval',
      payload: { approvalId: 'ap1', approved: false, operator: 'admin' },
    });
    expect(getState(node).pendingApprovals[0].status).toBe('rejected');
  });
  it('emits hitl_approval_resolved', () => {
    const { node, ctx, config } = withPending();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'operator_approval',
      payload: { approvalId: 'ap1', approved: true, operator: 'admin' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_approval_resolved',
      expect.objectContaining({ node })
    );
  });
  it('unauthorized operator: emits hitl_unauthorized_operator', () => {
    const { node, ctx, config } = attach({ approved_operators: ['admin'] });
    getState(node).pendingApprovals.push({
      id: 'ap2',
      action: 'x',
      agentId: 'a',
      category: 'write',
      description: '',
      confidence: 0.5,
      riskScore: 0.5,
      context: {},
      status: 'pending',
      expiresAt: Date.now() + 60000,
      metadata: {},
    });
    ctx.emit.mockClear();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'operator_approval',
      payload: { approvalId: 'ap2', approved: true, operator: 'hacker' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_unauthorized_operator',
      expect.objectContaining({ operator: 'hacker' })
    );
  });
});

// ─── onEvent — rollback_request ───────────────────────────────────────────────
describe('hitlHandler.onEvent — rollback_request', () => {
  function withCheckpoint() {
    const { node, ctx, config } = attach({ enable_rollback: true });
    const checkpoint = {
      id: 'rb1',
      timestamp: Date.now(),
      agentId: 'a',
      action: 'wf',
      stateBefore: { x: 1 },
      canRollback: true,
      expiresAt: Date.now() + 60000,
    };
    getState(node).rollbackCheckpoints.push(checkpoint);
    ctx.emit.mockClear();
    return { node, ctx, config, checkpoint };
  }
  it('successful rollback: emits hitl_rollback_executed + applies stateBefore', () => {
    const { node, ctx, config, checkpoint } = withCheckpoint();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'rollback_request',
      payload: { checkpointId: 'rb1' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_rollback_executed',
      expect.objectContaining({ checkpoint })
    );
    expect((node as any).x).toBe(1);
  });
  it('sets canRollback=false after rollback', () => {
    const { node, ctx, config, checkpoint } = withCheckpoint();
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'rollback_request',
      payload: { checkpointId: 'rb1' },
    });
    expect(checkpoint.canRollback).toBe(false);
  });
  it('already rolled back → hitl_rollback_failed(already_rolled_back)', () => {
    const { node, ctx, config } = withCheckpoint();
    getState(node).rollbackCheckpoints[0].canRollback = false;
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'rollback_request',
      payload: { checkpointId: 'rb1' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_rollback_failed',
      expect.objectContaining({ reason: 'already_rolled_back' })
    );
  });
  it('expired checkpoint → hitl_rollback_failed(expired)', () => {
    const { node, ctx, config } = withCheckpoint();
    getState(node).rollbackCheckpoints[0].expiresAt = Date.now() - 1;
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'rollback_request',
      payload: { checkpointId: 'rb1' },
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_rollback_failed',
      expect.objectContaining({ reason: 'expired' })
    );
  });
});

// ─── onEvent — hitl_mode_change_request ──────────────────────────────────────
describe('hitlHandler.onEvent — hitl_mode_change_request', () => {
  it('changes mode (empty approved_operators = anyone)', () => {
    const { node, ctx, config } = attach({ approved_operators: [] });
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'hitl_mode_change_request',
      payload: { newMode: 'manual', operator: 'x' },
    });
    expect(getState(node).currentMode).toBe('manual');
    expect(ctx.emit).toHaveBeenCalledWith(
      'hitl_mode_changed',
      expect.objectContaining({ toMode: 'manual' })
    );
  });
  it('resets actionCount on switch to autonomous', () => {
    const { node, ctx, config } = attach({ approved_operators: [] });
    getState(node).actionCountThisSession = 50;
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'hitl_mode_change_request',
      payload: { newMode: 'autonomous', operator: 'admin' },
    });
    expect(getState(node).actionCountThisSession).toBe(0);
  });
  it('does NOT change mode for unauthorized operator', () => {
    const { node, ctx, config } = attach({ approved_operators: ['admin'] });
    hitlHandler.onEvent!(node as any, config, ctx as any, {
      type: 'hitl_mode_change_request',
      payload: { newMode: 'manual', operator: 'hacker' },
    });
    expect(getState(node).currentMode).toBe('supervised');
  });
});
