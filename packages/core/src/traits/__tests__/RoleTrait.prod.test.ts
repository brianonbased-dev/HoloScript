/**
 * RoleTrait — Production Test Suite
 */
import { describe, it, expect, vi } from 'vitest';
import { roleHandler } from '../RoleTrait';

function makeNode() {
  return { id: 'role_node' };
}
function makeCtx() {
  return { emit: vi.fn() };
}
function attach(cfg: any = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...roleHandler.defaultConfig!, ...cfg };
  roleHandler.onAttach!(node, config, ctx);
  return { node: node as any, ctx, config };
}
const DEFAULT_HIERARCHY = {
  guest: ['view'],
  user: ['view', 'interact'],
  editor: ['view', 'interact', 'edit'],
  admin: ['view', 'interact', 'edit', 'delete', 'admin', 'configure'],
};

// ─── defaultConfig ─────────────────────────────────────────────────────────────

describe('roleHandler.defaultConfig', () => {
  const d = roleHandler.defaultConfig!;
  it('role_id=user', () => expect(d.role_id).toBe('user'));
  it('permissions=[interact]', () => expect(d.permissions).toEqual(['interact']));
  it('display_badge=false', () => expect(d.display_badge).toBe(false));
  it('badge_color=#888888', () => expect(d.badge_color).toBe('#888888'));
  it('inherits_from=""', () => expect(d.inherits_from).toBe(''));
  it('role_hierarchy has guest/user/editor/admin', () => {
    expect(Object.keys(d.role_hierarchy)).toEqual(
      expect.arrayContaining(['guest', 'user', 'editor', 'admin'])
    );
  });
});

// ─── onAttach — state ─────────────────────────────────────────────────────────

describe('roleHandler.onAttach', () => {
  it('creates __roleState', () => expect(attach().node.__roleState).toBeDefined());
  it('currentRole = config.role_id', () =>
    expect(attach({ role_id: 'admin' }).node.__roleState.currentRole).toBe('admin'));
  it('pendingRoleChange=null', () =>
    expect(attach().node.__roleState.pendingRoleChange).toBeNull());
  it('roleHistory has initial entry', () => {
    const { node } = attach({ role_id: 'editor' });
    expect(node.__roleState.roleHistory[0].role).toBe('editor');
  });
  it('no badge emit when display_badge=false', () => {
    expect(attach({ display_badge: false }).ctx.emit).not.toHaveBeenCalledWith(
      'role_show_badge',
      expect.anything()
    );
  });
  it('emits role_show_badge when display_badge=true', () => {
    const { ctx } = attach({ display_badge: true, role_id: 'admin', badge_color: '#ff0000' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_show_badge',
      expect.objectContaining({
        role: 'admin',
        color: '#ff0000',
      })
    );
  });
});

// ─── onAttach — effective permissions ─────────────────────────────────────────

describe('roleHandler.onAttach — effective permissions', () => {
  it('user role gets view+interact from hierarchy', () => {
    const { node } = attach({
      role_id: 'user',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    const perms = node.__roleState.effectivePermissions;
    expect(perms.has('view')).toBe(true);
    expect(perms.has('interact')).toBe(true);
  });
  it('admin role gets all permissions', () => {
    const { node } = attach({
      role_id: 'admin',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    const perms = node.__roleState.effectivePermissions;
    expect(perms.has('delete')).toBe(true);
    expect(perms.has('configure')).toBe(true);
    expect(perms.has('admin')).toBe(true);
  });
  it('guest has only view', () => {
    const { node } = attach({
      role_id: 'guest',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    const perms = node.__roleState.effectivePermissions;
    expect(perms.has('view')).toBe(true);
    expect(perms.has('interact')).toBe(false);
  });
  it('config.permissions merged in', () => {
    const { node } = attach({
      role_id: 'guest',
      permissions: ['transfer'],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    expect(node.__roleState.effectivePermissions.has('transfer')).toBe(true);
  });
  it('inherits_from merges parent permissions', () => {
    const { node } = attach({
      role_id: 'guest',
      permissions: [],
      inherits_from: 'editor',
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    // guest inherits editor: view+interact+edit
    expect(node.__roleState.effectivePermissions.has('edit')).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('roleHandler.onDetach', () => {
  it('removes __roleState', () => {
    const { node, config, ctx } = attach();
    roleHandler.onDetach!(node, config, ctx);
    expect(node.__roleState).toBeUndefined();
  });
});

// ─── onUpdate — pending role change ──────────────────────────────────────────

describe('roleHandler.onUpdate — pending role change', () => {
  it('no-op when no pending change', () => {
    const { node, config, ctx } = attach();
    ctx.emit.mockClear();
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(ctx.emit).not.toHaveBeenCalled();
  });
  it('applies pendingRoleChange and emits on_role_change', () => {
    const { node, config, ctx } = attach({
      role_id: 'user',
      role_hierarchy: DEFAULT_HIERARCHY,
      permissions: [],
    });
    node.__roleState.pendingRoleChange = 'admin';
    ctx.emit.mockClear();
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(node.__roleState.currentRole).toBe('admin');
    expect(node.__roleState.pendingRoleChange).toBeNull();
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_role_change',
      expect.objectContaining({
        previousRole: 'user',
        newRole: 'admin',
      })
    );
  });
  it('permissions recalculated after role change', () => {
    const { node, config, ctx } = attach({
      role_id: 'guest',
      role_hierarchy: DEFAULT_HIERARCHY,
      permissions: [],
    });
    node.__roleState.pendingRoleChange = 'editor';
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(node.__roleState.effectivePermissions.has('edit')).toBe(true);
  });
  it('role added to history after change', () => {
    const { node, config, ctx } = attach({
      role_id: 'user',
      role_hierarchy: DEFAULT_HIERARCHY,
      permissions: [],
    });
    node.__roleState.pendingRoleChange = 'admin';
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(node.__roleState.roleHistory.length).toBe(2);
    expect(node.__roleState.roleHistory[1].role).toBe('admin');
  });
  it('emits role_update_badge after change when display_badge=true', () => {
    const { node, config, ctx } = attach({
      role_id: 'user',
      display_badge: true,
      role_hierarchy: DEFAULT_HIERARCHY,
      permissions: [],
    });
    node.__roleState.pendingRoleChange = 'admin';
    ctx.emit.mockClear();
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_update_badge',
      expect.objectContaining({ role: 'admin' })
    );
  });
  it('no badge emit when display_badge=false', () => {
    const { node, config, ctx } = attach({
      role_id: 'user',
      display_badge: false,
      role_hierarchy: DEFAULT_HIERARCHY,
      permissions: [],
    });
    node.__roleState.pendingRoleChange = 'admin';
    ctx.emit.mockClear();
    roleHandler.onUpdate!(node, config, ctx, 0);
    expect(ctx.emit).not.toHaveBeenCalledWith('role_update_badge', expect.anything());
  });
});

// ─── onEvent — role_set ───────────────────────────────────────────────────────

describe('roleHandler.onEvent — role_set', () => {
  it('sets pendingRoleChange', () => {
    const { node, config, ctx } = attach();
    roleHandler.onEvent!(node, config, ctx, { type: 'role_set', role: 'admin' });
    expect(node.__roleState.pendingRoleChange).toBe('admin');
  });
  it('does not immediately change currentRole', () => {
    const { node, config, ctx } = attach({ role_id: 'user' });
    roleHandler.onEvent!(node, config, ctx, { type: 'role_set', role: 'admin' });
    expect(node.__roleState.currentRole).toBe('user');
  });
});

// ─── onEvent — role_check_permission ─────────────────────────────────────────

describe('roleHandler.onEvent — role_check_permission', () => {
  it('emits role_permission_result granted=true for present permission', () => {
    const { node, config, ctx } = attach({
      role_id: 'admin',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_check_permission',
      permission: 'delete',
      callbackId: 'c1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_permission_result',
      expect.objectContaining({
        permission: 'delete',
        granted: true,
        callbackId: 'c1',
      })
    );
  });
  it('emits granted=false for missing permission', () => {
    const { node, config, ctx } = attach({
      role_id: 'guest',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_check_permission',
      permission: 'delete',
      callbackId: 'c2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_permission_result',
      expect.objectContaining({ granted: false })
    );
  });
});

// ─── onEvent — role_grant_permission / role_revoke_permission ─────────────────

describe('roleHandler.onEvent — grant/revoke', () => {
  it('grant adds permission and emits on_permission_granted', () => {
    const { node, config, ctx } = attach({
      role_id: 'guest',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_grant_permission',
      permission: 'transfer',
    });
    expect(node.__roleState.effectivePermissions.has('transfer')).toBe(true);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_permission_granted',
      expect.objectContaining({ permission: 'transfer' })
    );
  });
  it('revoke removes permission and emits on_permission_revoked', () => {
    const { node, config, ctx } = attach({
      role_id: 'admin',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_revoke_permission',
      permission: 'delete',
    });
    expect(node.__roleState.effectivePermissions.has('delete')).toBe(false);
    expect(ctx.emit).toHaveBeenCalledWith(
      'on_permission_revoked',
      expect.objectContaining({ permission: 'delete' })
    );
  });
});

// ─── onEvent — role_get_history ───────────────────────────────────────────────

describe('roleHandler.onEvent — role_get_history', () => {
  it('emits role_history_result with history', () => {
    const { node, config, ctx } = attach({ role_id: 'user' });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, { type: 'role_get_history', callbackId: 'h1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_history_result',
      expect.objectContaining({
        callbackId: 'h1',
        history: expect.arrayContaining([expect.objectContaining({ role: 'user' })]),
      })
    );
  });
});

// ─── onEvent — role_can_perform ──────────────────────────────────────────────

describe('roleHandler.onEvent — role_can_perform', () => {
  it('canPerform=true for admin on modify', () => {
    const { node, config, ctx } = attach({
      role_id: 'admin',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_can_perform',
      action: 'modify',
      callbackId: 'p1',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_action_check_result',
      expect.objectContaining({
        action: 'modify',
        canPerform: true,
        callbackId: 'p1',
      })
    );
  });
  it('canPerform=false for guest on remove', () => {
    const { node, config, ctx } = attach({
      role_id: 'guest',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_can_perform',
      action: 'remove',
      callbackId: 'p2',
    });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_action_check_result',
      expect.objectContaining({
        canPerform: false,
        missingPermissions: expect.arrayContaining(['delete']),
      })
    );
  });
  it('unknown action defaults to interact requirement', () => {
    const { node, config, ctx } = attach({
      role_id: 'user',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, {
      type: 'role_can_perform',
      action: 'do_unknown_thing',
    });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'role_action_check_result')!;
    // user has interact, so canPerform should be true for default action
    expect(call[1].canPerform).toBe(true);
  });
  it('action view requires view permission only', () => {
    const { node, config, ctx } = attach({
      role_id: 'guest',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, { type: 'role_can_perform', action: 'view' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'role_action_check_result')!;
    expect(call[1].canPerform).toBe(true);
  });
});

// ─── onEvent — role_query ────────────────────────────────────────────────────

describe('roleHandler.onEvent — role_query', () => {
  it('emits role_info snapshot', () => {
    const { node, config, ctx } = attach({
      role_id: 'editor',
      display_badge: false,
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, { type: 'role_query', queryId: 'q1' });
    expect(ctx.emit).toHaveBeenCalledWith(
      'role_info',
      expect.objectContaining({
        queryId: 'q1',
        currentRole: 'editor',
        displayBadge: false,
      })
    );
  });
  it('permissions array in role_info', () => {
    const { node, config, ctx } = attach({
      role_id: 'admin',
      permissions: [],
      role_hierarchy: DEFAULT_HIERARCHY,
    });
    ctx.emit.mockClear();
    roleHandler.onEvent!(node, config, ctx, { type: 'role_query', queryId: 'q2' });
    const call = ctx.emit.mock.calls.find((c: any[]) => c[0] === 'role_info')!;
    expect(call[1].permissions).toEqual(expect.arrayContaining(['delete', 'admin']));
  });
});
