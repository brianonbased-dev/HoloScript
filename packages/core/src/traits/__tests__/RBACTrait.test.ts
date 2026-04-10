import { describe, it, expect, beforeEach } from 'vitest';
import { rbacHandler } from '../RBACTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getEventCount,
  getLastEvent,
  updateTrait,
} from './traitTestHelpers';

describe('RBACTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const baseCfg = {
    tenantId: 'acme-corp-001',
    enabled: true,
    defaultRole: 'viewer' as const,
    allowCustomRoles: true,
    maxCustomRoles: 5,
    requireMfaForAdmin: false,
    logAccessChecks: true,
  };

  beforeEach(() => {
    node = createMockNode('rbac-node');
    ctx = createMockContext();
    attachTrait(rbacHandler, node, baseCfg, ctx);
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  it('initializes with built-in roles', () => {
    const state = (node as any).__rbacState;
    expect(state).toBeDefined();
    expect(state.roles.size).toBe(5);
    expect(state.roles.has('owner')).toBe(true);
    expect(state.roles.has('admin')).toBe(true);
    expect(state.roles.has('editor')).toBe(true);
    expect(state.roles.has('viewer')).toBe(true);
    expect(state.roles.has('spectator')).toBe(true);
  });

  it('emits rbac_initialized on attach', () => {
    expect(getEventCount(ctx, 'rbac_initialized')).toBe(1);
    const event = getLastEvent(ctx, 'rbac_initialized') as any;
    expect(event.tenantId).toBe('acme-corp-001');
    expect(event.rolesCount).toBe(5);
  });

  it('rejects RBAC without tenantId', () => {
    const n = createMockNode('bad');
    const c = createMockContext();
    attachTrait(rbacHandler, n, { tenantId: '' }, c);
    expect(getEventCount(c, 'rbac_error')).toBe(1);
  });

  // =========================================================================
  // Role Assignment
  // =========================================================================

  it('assigns role to user', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'user-1',
      role: 'editor',
      assignedBy: 'admin-1',
    });
    expect(getEventCount(ctx, 'rbac_role_assigned')).toBe(1);
    const event = getLastEvent(ctx, 'rbac_role_assigned') as any;
    expect(event.userId).toBe('user-1');
    expect(event.role).toBe('editor');
  });

  it('rejects assignment for non-existent role', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'user-1',
      role: 'nonexistent_role',
    });
    expect(getEventCount(ctx, 'rbac_error')).toBe(1);
    const error = getLastEvent(ctx, 'rbac_error') as any;
    expect(error.error).toBe('ROLE_NOT_FOUND');
  });

  it('enforces max assignees for owner role', () => {
    // Owner role has maxAssignees = 3
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u1',
      role: 'owner',
      assignedBy: 'system',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u2',
      role: 'owner',
      assignedBy: 'system',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u3',
      role: 'owner',
      assignedBy: 'system',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u4',
      role: 'owner',
      assignedBy: 'system',
    });
    expect(getEventCount(ctx, 'rbac_error')).toBe(1);
    const error = getLastEvent(ctx, 'rbac_error') as any;
    expect(error.error).toBe('MAX_ASSIGNEES_REACHED');
  });

  it('revokes role from user', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'user-1',
      role: 'editor',
      assignedBy: 'admin',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_revoke_role',
      userId: 'user-1',
      role: 'editor',
      revokedBy: 'admin',
    });
    expect(getEventCount(ctx, 'rbac_role_revoked')).toBe(1);
  });

  // =========================================================================
  // Permission Checks
  // =========================================================================

  it('grants viewer scene.read permission', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'viewer-1',
      role: 'viewer',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'viewer-1',
      permission: 'scene.read',
      checkId: 'check-1',
    });
    expect(getEventCount(ctx, 'rbac_permission_result')).toBe(1);
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(true);
    expect(result.checkId).toBe('check-1');
  });

  it('denies viewer scene.create permission', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'viewer-1',
      role: 'viewer',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'viewer-1',
      permission: 'scene.create',
      checkId: 'check-2',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(false);
  });

  it('grants editor scene.create via inheritance from viewer', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'editor-1',
      role: 'editor',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'editor-1',
      permission: 'scene.create',
      checkId: 'check-3',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(true);
  });

  it('grants editor inherited scene.read from viewer', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'editor-1',
      role: 'editor',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'editor-1',
      permission: 'scene.read',
      checkId: 'check-4',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(true);
  });

  it('grants admin user.manage permission', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'admin-1',
      role: 'admin',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'admin-1',
      permission: 'user.manage',
      checkId: 'check-5',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(true);
  });

  it('grants owner wildcard tenant.* permissions', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'owner-1',
      role: 'owner',
      assignedBy: 'system',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'owner-1',
      permission: 'tenant.manage',
      checkId: 'check-6',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(true);
  });

  it('denies unassigned user all permissions', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'nobody',
      permission: 'scene.read',
      checkId: 'check-7',
    });
    const result = getLastEvent(ctx, 'rbac_permission_result') as any;
    expect(result.granted).toBe(false);
  });

  // =========================================================================
  // Custom Roles
  // =========================================================================

  it('creates custom role', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_create_custom_role',
      role: 'scene_manager',
      label: 'Scene Manager',
      description: 'Can manage scenes but not users',
      inheritsFrom: 'editor',
      permissions: [{ category: 'scene', action: 'delete' }],
    });
    expect(getEventCount(ctx, 'rbac_custom_role_created')).toBe(1);
    const state = (node as any).__rbacState;
    expect(state.roles.has('scene_manager')).toBe(true);
  });

  it('rejects custom role when disabled', () => {
    const cfg = { ...baseCfg, allowCustomRoles: false };
    const n = createMockNode('no-custom');
    const c = createMockContext();
    attachTrait(rbacHandler, n, cfg, c);
    sendEvent(rbacHandler, n, cfg, c, {
      type: 'rbac_create_custom_role',
      role: 'custom',
      label: 'Custom',
    });
    expect(getEventCount(c, 'rbac_error')).toBe(1);
  });

  it('rejects custom role exceeding max', () => {
    const cfg = { ...baseCfg, maxCustomRoles: 1 };
    const n = createMockNode('max-custom');
    const c = createMockContext();
    attachTrait(rbacHandler, n, cfg, c);
    sendEvent(rbacHandler, n, cfg, c, {
      type: 'rbac_create_custom_role',
      role: 'r1',
      label: 'R1',
      permissions: [],
    });
    sendEvent(rbacHandler, n, cfg, c, {
      type: 'rbac_create_custom_role',
      role: 'r2',
      label: 'R2',
      permissions: [],
    });
    expect(getEventCount(c, 'rbac_error')).toBe(1);
    const error = getLastEvent(c, 'rbac_error') as any;
    expect(error.error).toBe('MAX_CUSTOM_ROLES_REACHED');
  });

  it('deletes custom role and reassigns users', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_create_custom_role',
      role: 'temp_role',
      label: 'Temp',
      permissions: [],
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u1',
      role: 'temp_role',
      assignedBy: 'admin',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_delete_custom_role',
      role: 'temp_role',
    });
    expect(getEventCount(ctx, 'rbac_custom_role_deleted')).toBe(1);
    const state = (node as any).__rbacState;
    expect(state.roles.has('temp_role')).toBe(false);
  });

  it('prevents deletion of built-in roles', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_delete_custom_role',
      role: 'admin',
    });
    expect(getEventCount(ctx, 'rbac_error')).toBe(1);
    const error = getLastEvent(ctx, 'rbac_error') as any;
    expect(error.error).toBe('CANNOT_DELETE_BUILTIN_ROLE');
  });

  // =========================================================================
  // User Role Queries
  // =========================================================================

  it('queries user roles', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'user-1',
      role: 'editor',
      assignedBy: 'admin',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_query_user_roles',
      userId: 'user-1',
      queryId: 'qr1',
    });
    expect(getEventCount(ctx, 'rbac_user_roles')).toBe(1);
    const result = getLastEvent(ctx, 'rbac_user_roles') as any;
    expect(result.roles.length).toBe(1);
    expect(result.roles[0].role).toBe('editor');
  });

  // =========================================================================
  // Access Log
  // =========================================================================

  it('logs access checks when enabled', () => {
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_assign_role',
      userId: 'u1',
      role: 'viewer',
      assignedBy: 'system',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'u1',
      permission: 'scene.read',
      checkId: 'c1',
    });
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_check_permission',
      userId: 'u1',
      permission: 'scene.create',
      checkId: 'c2',
    });
    ctx.clearEvents();
    sendEvent(rbacHandler, node, baseCfg, ctx, {
      type: 'rbac_query_access_log',
      queryId: 'al1',
      limit: 10,
    });
    const result = getLastEvent(ctx, 'rbac_access_log') as any;
    expect(result.entries.length).toBe(2);
    expect(result.entries[0].granted).toBe(true);
    expect(result.entries[1].granted).toBe(false);
  });

  // =========================================================================
  // Detach
  // =========================================================================

  it('cleans up on detach', () => {
    rbacHandler.onDetach?.(node as any, { ...rbacHandler.defaultConfig, ...baseCfg }, ctx as any);
    expect((node as any).__rbacState).toBeUndefined();
  });
});
