import { describe, it, expect, beforeEach } from 'vitest';
import { roleHandler } from '../RoleTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  updateTrait,
  getEventCount,
  getLastEvent,
} from './traitTestHelpers';

describe('RoleTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    role_id: 'user',
    permissions: ['interact'] as any[],
    display_badge: false,
    badge_color: '#888888',
    inherits_from: '',
    role_hierarchy: {
      guest: ['view'],
      user: ['view', 'interact'],
      editor: ['view', 'interact', 'edit'],
      admin: ['view', 'interact', 'edit', 'delete', 'admin', 'configure'],
    } as Record<string, string[]>,
  };

  beforeEach(() => {
    node = createMockNode('role');
    ctx = createMockContext();
    attachTrait(roleHandler, node, cfg, ctx);
  });

  it('initializes with role and effective permissions', () => {
    const s = (node as any).__roleState;
    expect(s.currentRole).toBe('user');
    expect(s.effectivePermissions.has('view')).toBe(true);
    expect(s.effectivePermissions.has('interact')).toBe(true);
  });

  it('role_set changes role on next update', () => {
    sendEvent(roleHandler, node, cfg, ctx, { type: 'role_set', role: 'admin' });
    updateTrait(roleHandler, node, cfg, ctx, 0.016);
    const s = (node as any).__roleState;
    expect(s.currentRole).toBe('admin');
    expect(s.effectivePermissions.has('admin')).toBe(true);
    expect(getEventCount(ctx, 'on_role_change')).toBe(1);
  });

  it('check_permission returns granted for valid permission', () => {
    sendEvent(roleHandler, node, cfg, ctx, {
      type: 'role_check_permission',
      permission: 'interact',
      callbackId: 'cb1',
    });
    const ev = getLastEvent(ctx, 'role_permission_result') as any;
    expect(ev.granted).toBe(true);
  });

  it('check_permission returns denied for missing permission', () => {
    sendEvent(roleHandler, node, cfg, ctx, {
      type: 'role_check_permission',
      permission: 'delete',
      callbackId: 'cb2',
    });
    const ev = getLastEvent(ctx, 'role_permission_result') as any;
    expect(ev.granted).toBe(false);
  });

  it('grant_permission adds permission', () => {
    sendEvent(roleHandler, node, cfg, ctx, { type: 'role_grant_permission', permission: 'edit' });
    expect((node as any).__roleState.effectivePermissions.has('edit')).toBe(true);
    expect(getEventCount(ctx, 'on_permission_granted')).toBe(1);
  });

  it('revoke_permission removes permission', () => {
    sendEvent(roleHandler, node, cfg, ctx, {
      type: 'role_revoke_permission',
      permission: 'interact',
    });
    expect((node as any).__roleState.effectivePermissions.has('interact')).toBe(false);
    expect(getEventCount(ctx, 'on_permission_revoked')).toBe(1);
  });

  it('role_can_perform checks required permissions', () => {
    sendEvent(roleHandler, node, cfg, ctx, {
      type: 'role_can_perform',
      action: 'grab',
      callbackId: 'cb3',
    });
    const ev = getLastEvent(ctx, 'role_action_check_result') as any;
    expect(ev.canPerform).toBe(true);
  });

  it('role_get_history returns history', () => {
    sendEvent(roleHandler, node, cfg, ctx, { type: 'role_get_history', callbackId: 'cb4' });
    const ev = getLastEvent(ctx, 'role_history_result') as any;
    expect(ev.history.length).toBe(1);
  });

  it('role_query emits info', () => {
    sendEvent(roleHandler, node, cfg, ctx, { type: 'role_query', queryId: 'q1' });
    expect(getEventCount(ctx, 'role_info')).toBe(1);
  });

  it('display_badge emits on attach when enabled', () => {
    const n = createMockNode('r2');
    const c = createMockContext();
    attachTrait(roleHandler, n, { ...cfg, display_badge: true }, c);
    expect(getEventCount(c, 'role_show_badge')).toBe(1);
  });

  it('detach cleans up', () => {
    roleHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__roleState).toBeUndefined();
  });
});
