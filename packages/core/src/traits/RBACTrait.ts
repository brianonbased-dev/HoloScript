/**
 * RBAC Trait
 *
 * Implements Role-Based Access Control for HoloScript enterprise multi-tenant
 * deployments. Provides granular trait-level permissions with hierarchical roles.
 *
 * Roles (hierarchical):
 * - owner: Full control over tenant, billing, and member management
 * - admin: Full control over scenes, traits, and user management
 * - editor: Create, modify, and delete scenes and trait configurations
 * - viewer: Read-only access to scenes, can view but not modify
 *
 * Permissions are granular at the trait level:
 * - trait.attach: Can attach this trait to nodes
 * - trait.detach: Can remove this trait from nodes
 * - trait.configure: Can modify trait configuration
 * - trait.view: Can view trait configuration
 * - scene.create / scene.edit / scene.delete / scene.publish
 * - tenant.manage / tenant.billing / tenant.members
 * - export.* : Export to specific platforms
 *
 * @version 1.0.0
 * @category enterprise
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

/** Built-in role types */
export type RBACRole = 'owner' | 'admin' | 'editor' | 'viewer';

/** Permission scope categories */
export type PermissionCategory =
  | 'trait'
  | 'scene'
  | 'tenant'
  | 'export'
  | 'asset'
  | 'user'
  | 'billing'
  | 'audit';

/** Permission action types */
export type PermissionAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'attach'
  | 'detach'
  | 'configure'
  | 'view'
  | 'publish'
  | 'manage'
  | 'export'
  | '*';

/** A permission is expressed as "category.action" or "category.action:resource" */
export interface Permission {
  /** Category of the permission */
  category: PermissionCategory;
  /** Action allowed */
  action: PermissionAction;
  /** Optional specific resource scope (e.g., trait name, scene ID) */
  resource?: string;
  /** Conditions for the permission (e.g., 'own' = only resources they created) */
  conditions?: PermissionCondition[];
}

/** Conditions that narrow a permission */
export interface PermissionCondition {
  /** Condition type */
  type: 'ownership' | 'time_range' | 'ip_range' | 'mfa_required';
  /** Condition value */
  value: string;
}

/** Role definition with permissions */
export interface RoleDefinition {
  /** Role identifier */
  role: RBACRole | string;
  /** Human-readable label */
  label: string;
  /** Description of this role */
  description: string;
  /** Permissions granted to this role */
  permissions: Permission[];
  /** Whether this is a built-in role (cannot be deleted) */
  isBuiltIn: boolean;
  /** Parent role (inherits all permissions from parent) */
  inheritsFrom?: RBACRole | string;
  /** Maximum number of users with this role per tenant (0 = unlimited) */
  maxAssignees: number;
}

/** User-role assignment */
export interface RoleAssignment {
  /** User identifier */
  userId: string;
  /** Assigned role */
  role: RBACRole | string;
  /** Tenant context */
  tenantId: string;
  /** Who assigned this role */
  assignedBy: string;
  /** When the role was assigned */
  assignedAt: string;
  /** When the role assignment expires (optional) */
  expiresAt?: string;
  /** Whether the assignment is currently active */
  active: boolean;
}

/** RBAC configuration for trait handler */
export interface RBACConfig {
  /** Tenant this RBAC belongs to */
  tenantId: string;
  /** Whether RBAC enforcement is enabled */
  enabled: boolean;
  /** Default role for new members */
  defaultRole: RBACRole;
  /** Whether to allow custom roles */
  allowCustomRoles: boolean;
  /** Maximum custom roles allowed */
  maxCustomRoles: number;
  /** Whether to enforce MFA for admin/owner roles */
  requireMfaForAdmin: boolean;
  /** Whether to log all access checks */
  logAccessChecks: boolean;
  /** IP allowlist for owner role (empty = no restriction) */
  ownerIpAllowlist: string[];
  /** Session timeout in minutes per role */
  sessionTimeouts: Record<string, number>;
}

/** Internal state for RBAC */
interface RBACState {
  /** All role definitions (built-in + custom) */
  roles: Map<string, RoleDefinition>;
  /** User-to-role assignments */
  assignments: Map<string, RoleAssignment[]>;
  /** Resolved permission cache (userId -> Set of permission strings) */
  permissionCache: Map<string, Set<string>>;
  /** Access check log */
  accessLog: AccessCheckEntry[];
}

/** Access check log entry */
export interface AccessCheckEntry {
  timestamp: string;
  userId: string;
  tenantId: string;
  permission: string;
  resource?: string;
  granted: boolean;
  reason: string;
}

// =============================================================================
// DEFAULT ROLE DEFINITIONS
// =============================================================================

const DEFAULT_ROLES: RoleDefinition[] = [
  {
    role: 'viewer',
    label: 'Viewer',
    description: 'Read-only access to scenes and configurations',
    isBuiltIn: true,
    maxAssignees: 0,
    permissions: [
      { category: 'scene', action: 'read' },
      { category: 'trait', action: 'view' },
      { category: 'asset', action: 'read' },
    ],
  },
  {
    role: 'editor',
    label: 'Editor',
    description: 'Create, edit, and manage scenes and traits',
    isBuiltIn: true,
    inheritsFrom: 'viewer',
    maxAssignees: 0,
    permissions: [
      { category: 'scene', action: 'create' },
      { category: 'scene', action: 'update' },
      { category: 'scene', action: 'delete', conditions: [{ type: 'ownership', value: 'own' }] },
      { category: 'scene', action: 'publish' },
      { category: 'trait', action: 'attach' },
      { category: 'trait', action: 'detach' },
      { category: 'trait', action: 'configure' },
      { category: 'asset', action: 'create' },
      { category: 'asset', action: 'update' },
      { category: 'asset', action: 'delete', conditions: [{ type: 'ownership', value: 'own' }] },
      { category: 'export', action: 'export' },
    ],
  },
  {
    role: 'admin',
    label: 'Administrator',
    description: 'Full control over scenes, traits, users, and tenant configuration',
    isBuiltIn: true,
    inheritsFrom: 'editor',
    maxAssignees: 0,
    permissions: [
      { category: 'scene', action: 'delete' },
      { category: 'asset', action: 'delete' },
      { category: 'user', action: 'manage' },
      { category: 'tenant', action: 'manage' },
      { category: 'audit', action: 'read' },
      { category: 'export', action: '*' },
    ],
  },
  {
    role: 'owner',
    label: 'Owner',
    description: 'Full control including billing, member management, and tenant lifecycle',
    isBuiltIn: true,
    inheritsFrom: 'admin',
    maxAssignees: 3,
    permissions: [
      { category: 'tenant', action: '*' },
      { category: 'billing', action: '*' },
      { category: 'user', action: '*' },
      { category: 'audit', action: '*' },
    ],
  },
];

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Convert a Permission to a string representation for caching/comparison.
 * Format: "category.action" or "category.action:resource"
 */
function permissionToString(perm: Permission): string {
  const base = `${perm.category}.${perm.action}`;
  return perm.resource ? `${base}:${perm.resource}` : base;
}

/**
 * Check if a permission string matches a required permission.
 * Supports wildcard (*) matching.
 */
function permissionMatches(granted: string, required: string): boolean {
  if (granted === required) return true;

  // Check wildcard: "category.*" matches "category.anything"
  const [grantedCat, grantedAction] = granted.split(':')[0].split('.');
  const [requiredCat, requiredAction] = required.split(':')[0].split('.');

  if (grantedCat === requiredCat && grantedAction === '*') {
    // Check resource scope
    const grantedResource = granted.split(':')[1];
    const requiredResource = required.split(':')[1];
    if (!grantedResource) return true;
    return grantedResource === requiredResource;
  }

  return false;
}

/**
 * Resolve all permissions for a role, including inherited permissions.
 */
function resolveRolePermissions(
  role: string,
  roles: Map<string, RoleDefinition>,
  visited: Set<string> = new Set()
): Permission[] {
  if (visited.has(role)) return []; // Prevent cycles
  visited.add(role);

  const def = roles.get(role);
  if (!def) return [];

  const permissions = [...def.permissions];

  // Inherit from parent
  if (def.inheritsFrom) {
    const inherited = resolveRolePermissions(def.inheritsFrom, roles, visited);
    permissions.push(...inherited);
  }

  return permissions;
}

// =============================================================================
// RBAC TRAIT HANDLER
// =============================================================================

export const rbacHandler: TraitHandler<RBACConfig> = {
  name: 'rbac' as any,

  defaultConfig: {
    tenantId: '',
    enabled: true,
    defaultRole: 'viewer',
    allowCustomRoles: true,
    maxCustomRoles: 10,
    requireMfaForAdmin: false,
    logAccessChecks: true,
    ownerIpAllowlist: [],
    sessionTimeouts: {
      owner: 30,
      admin: 60,
      editor: 120,
      viewer: 480,
    },
  },

  onAttach(node, config, context) {
    if (!config.tenantId) {
      context.emit('rbac_error', {
        node,
        error: 'TENANT_ID_REQUIRED',
        message: 'RBAC must be associated with a tenant',
      });
      return;
    }

    const state: RBACState = {
      roles: new Map(),
      assignments: new Map(),
      permissionCache: new Map(),
      accessLog: [],
    };

    // Initialize built-in roles
    for (const roleDef of DEFAULT_ROLES) {
      state.roles.set(roleDef.role, { ...roleDef });
    }

    (node as any).__rbacState = state;

    context.emit('rbac_initialized', {
      node,
      tenantId: config.tenantId,
      rolesCount: state.roles.size,
    });
    context.emit('audit_log', {
      action: 'rbac.initialize',
      tenantId: config.tenantId,
      details: { builtInRoles: DEFAULT_ROLES.map((r) => r.role) },
      timestamp: new Date().toISOString(),
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__rbacState as RBACState | undefined;
    if (state) {
      context.emit('audit_log', {
        action: 'rbac.teardown',
        tenantId: config.tenantId,
        details: {
          totalAssignments: Array.from(state.assignments.values()).reduce(
            (sum, a) => sum + a.length,
            0
          ),
          totalAccessChecks: state.accessLog.length,
        },
        timestamp: new Date().toISOString(),
      });
    }
    delete (node as any).__rbacState;
  },

  onUpdate(node, config, _context, _delta) {
    const state = (node as any).__rbacState as RBACState | undefined;
    if (!state || !config.enabled) return;

    // Expire role assignments
    const now = new Date();
    for (const [userId, assignments] of state.assignments) {
      let changed = false;
      for (const assignment of assignments) {
        if (assignment.active && assignment.expiresAt && new Date(assignment.expiresAt) <= now) {
          assignment.active = false;
          changed = true;
        }
      }
      if (changed) {
        // Invalidate cache for this user
        state.permissionCache.delete(userId);
      }
    }

    // Trim access log (keep last 10000 entries)
    if (state.accessLog.length > 10000) {
      state.accessLog = state.accessLog.slice(-10000);
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__rbacState as RBACState | undefined;
    if (!state) return;

    if (event.type === 'rbac_assign_role') {
      const userId = (event as any).userId as string;
      const role = (event as any).role as string;
      const assignedBy = (event as any).assignedBy as string;
      const expiresAt = (event as any).expiresAt as string | undefined;

      if (!userId || !role) return;

      // Validate role exists
      const roleDef = state.roles.get(role);
      if (!roleDef) {
        context.emit('rbac_error', {
          node,
          error: 'ROLE_NOT_FOUND',
          message: `Role '${role}' does not exist`,
        });
        return;
      }

      // Check max assignees
      if (roleDef.maxAssignees > 0) {
        let currentCount = 0;
        for (const assignments of state.assignments.values()) {
          for (const a of assignments) {
            if (a.role === role && a.active) currentCount++;
          }
        }
        if (currentCount >= roleDef.maxAssignees) {
          context.emit('rbac_error', {
            node,
            error: 'MAX_ASSIGNEES_REACHED',
            message: `Role '${role}' has reached maximum assignees (${roleDef.maxAssignees})`,
          });
          return;
        }
      }

      // Create assignment
      const assignment: RoleAssignment = {
        userId,
        role,
        tenantId: config.tenantId,
        assignedBy: assignedBy || 'system',
        assignedAt: new Date().toISOString(),
        expiresAt,
        active: true,
      };

      if (!state.assignments.has(userId)) {
        state.assignments.set(userId, []);
      }

      // Deactivate existing same-role assignment
      const userAssignments = state.assignments.get(userId)!;
      for (const existing of userAssignments) {
        if (existing.role === role && existing.active) {
          existing.active = false;
        }
      }

      userAssignments.push(assignment);

      // Invalidate permission cache
      state.permissionCache.delete(userId);

      context.emit('rbac_role_assigned', {
        node,
        userId,
        role,
        tenantId: config.tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.role.assign',
        tenantId: config.tenantId,
        details: { userId, role, assignedBy: assignment.assignedBy, expiresAt },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_revoke_role') {
      const userId = (event as any).userId as string;
      const role = (event as any).role as string;
      const revokedBy = (event as any).revokedBy as string;

      if (!userId || !role) return;

      const userAssignments = state.assignments.get(userId);
      if (userAssignments) {
        for (const assignment of userAssignments) {
          if (assignment.role === role && assignment.active) {
            assignment.active = false;
          }
        }
        state.permissionCache.delete(userId);
      }

      context.emit('rbac_role_revoked', {
        node,
        userId,
        role,
        tenantId: config.tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.role.revoke',
        tenantId: config.tenantId,
        details: { userId, role, revokedBy: revokedBy || 'system' },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_check_permission') {
      const userId = (event as any).userId as string;
      const permission = (event as any).permission as string;
      const resource = (event as any).resource as string | undefined;
      const checkId = (event as any).checkId as string;

      if (!userId || !permission) return;

      const requiredPerm = resource ? `${permission}:${resource}` : permission;

      // Get or compute user permissions
      let userPerms = state.permissionCache.get(userId);
      if (!userPerms) {
        userPerms = new Set<string>();
        const userAssignments = state.assignments.get(userId) || [];
        for (const assignment of userAssignments) {
          if (!assignment.active) continue;
          const rolePerms = resolveRolePermissions(assignment.role, state.roles);
          for (const perm of rolePerms) {
            userPerms.add(permissionToString(perm));
          }
        }
        state.permissionCache.set(userId, userPerms);
      }

      // Check if permission is granted
      let granted = false;
      let reason = 'no_matching_permission';

      for (const grantedPerm of userPerms) {
        if (permissionMatches(grantedPerm, requiredPerm)) {
          granted = true;
          reason = `matched: ${grantedPerm}`;
          break;
        }
      }

      // Log the check
      if (config.logAccessChecks) {
        const entry: AccessCheckEntry = {
          timestamp: new Date().toISOString(),
          userId,
          tenantId: config.tenantId,
          permission: requiredPerm,
          resource,
          granted,
          reason,
        };
        state.accessLog.push(entry);
      }

      context.emit('rbac_permission_result', {
        node,
        checkId,
        userId,
        permission: requiredPerm,
        granted,
        reason,
      });
    } else if (event.type === 'rbac_create_custom_role') {
      if (!config.allowCustomRoles) {
        context.emit('rbac_error', {
          node,
          error: 'CUSTOM_ROLES_DISABLED',
          message: 'Custom roles are not enabled for this tenant',
        });
        return;
      }

      // Count existing custom roles
      let customCount = 0;
      for (const roleDef of state.roles.values()) {
        if (!roleDef.isBuiltIn) customCount++;
      }
      if (customCount >= config.maxCustomRoles) {
        context.emit('rbac_error', {
          node,
          error: 'MAX_CUSTOM_ROLES_REACHED',
          message: `Maximum custom roles (${config.maxCustomRoles}) reached`,
        });
        return;
      }

      const roleName = (event as any).role as string;
      const label = (event as any).label as string;
      const description = (event as any).description as string;
      const permissions = ((event as any).permissions as Permission[]) || [];
      const inheritsFrom = (event as any).inheritsFrom as string | undefined;
      const maxAssignees = ((event as any).maxAssignees as number) || 0;

      if (!roleName || state.roles.has(roleName)) {
        context.emit('rbac_error', {
          node,
          error: roleName ? 'ROLE_ALREADY_EXISTS' : 'ROLE_NAME_REQUIRED',
          message: roleName ? `Role '${roleName}' already exists` : 'Role name is required',
        });
        return;
      }

      const newRole: RoleDefinition = {
        role: roleName,
        label: label || roleName,
        description: description || '',
        permissions,
        isBuiltIn: false,
        inheritsFrom,
        maxAssignees,
      };

      state.roles.set(roleName, newRole);

      // Invalidate all permission caches (new role might affect inheritance)
      state.permissionCache.clear();

      context.emit('rbac_custom_role_created', {
        node,
        role: roleName,
        tenantId: config.tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.role.create',
        tenantId: config.tenantId,
        details: { role: roleName, label, permissions: permissions.length, inheritsFrom },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_delete_custom_role') {
      const roleName = (event as any).role as string;
      const roleDef = state.roles.get(roleName);

      if (!roleDef) return;
      if (roleDef.isBuiltIn) {
        context.emit('rbac_error', {
          node,
          error: 'CANNOT_DELETE_BUILTIN_ROLE',
          message: `Built-in role '${roleName}' cannot be deleted`,
        });
        return;
      }

      // Reassign users to default role
      for (const [userId, assignments] of state.assignments) {
        for (const assignment of assignments) {
          if (assignment.role === roleName && assignment.active) {
            assignment.active = false;
            // Auto-assign default role
            assignments.push({
              userId,
              role: config.defaultRole,
              tenantId: config.tenantId,
              assignedBy: 'system',
              assignedAt: new Date().toISOString(),
              active: true,
            });
          }
        }
      }

      state.roles.delete(roleName);
      state.permissionCache.clear();

      context.emit('rbac_custom_role_deleted', {
        node,
        role: roleName,
        tenantId: config.tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.role.delete',
        tenantId: config.tenantId,
        details: { role: roleName, usersReassignedTo: config.defaultRole },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_query_user_roles') {
      const userId = (event as any).userId as string;
      const userAssignments = (state.assignments.get(userId) || []).filter((a) => a.active);

      context.emit('rbac_user_roles', {
        node,
        queryId: (event as any).queryId,
        userId,
        tenantId: config.tenantId,
        roles: userAssignments.map((a) => ({
          role: a.role,
          assignedBy: a.assignedBy,
          assignedAt: a.assignedAt,
          expiresAt: a.expiresAt,
        })),
      });
    } else if (event.type === 'rbac_query_access_log') {
      const limit = ((event as any).limit as number) || 100;
      const userId = (event as any).userId as string | undefined;

      let entries = state.accessLog;
      if (userId) {
        entries = entries.filter((e) => e.userId === userId);
      }

      context.emit('rbac_access_log', {
        node,
        queryId: (event as any).queryId,
        tenantId: config.tenantId,
        entries: entries.slice(-limit),
        total: entries.length,
      });
    }
  },
};

export default rbacHandler;
