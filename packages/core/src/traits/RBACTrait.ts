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
import type {
  Capability,
  CapabilityTokenPayload,
} from '../compiler/identity/CapabilityToken';

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
  /** Capability grants scoped to agents (agentDID -> grants) */
  capabilityGrants: Map<string, CapabilityGrant[]>;
  /** In-scene capability delegations */
  delegations: DelegationRecord[];
  /** Current tenant ID (set via setTenant) */
  currentTenantId: string;
  /** Capability check cache (tenantId:agentDID:action -> result) */
  capabilityCache: Map<string, CapabilityCheckResult>;
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
// CAPABILITY-BASED ACCESS CONTROL TYPES (Enterprise Multi-Tenant)
// =============================================================================

/**
 * A capability grant scoped to a tenant and agent.
 *
 * Capabilities are stored with tenant-prefixed keys to ensure strict
 * isolation between tenants. The format is: `{tenantId}:{capability.can}`
 */
export interface CapabilityGrant {
  /** The agent DID this capability is granted to */
  agentDID: string;
  /** The UCAN capability (with/can pattern) */
  capability: Capability;
  /** Tenant scope — capabilities are prefixed with this to prevent cross-tenant access */
  tenantId: string;
  /** When the grant was created */
  grantedAt: string;
  /** When the grant expires (optional) */
  expiresAt?: string;
  /** Who granted this capability */
  grantedBy: string;
  /** Whether the grant is currently active */
  active: boolean;
}

/**
 * A record of an in-scene capability delegation between agents.
 *
 * Follows UCAN attenuation semantics: delegated capabilities can only
 * narrow scope, never widen it.
 */
export interface DelegationRecord {
  /** Unique delegation identifier */
  id: string;
  /** The delegating agent's DID */
  fromDID: string;
  /** The receiving agent's DID */
  toDID: string;
  /** The capability being delegated */
  capability: Capability;
  /** Tenant scope */
  tenantId: string;
  /** Optional constraints narrowing the delegation */
  constraints?: DelegationConstraints;
  /** When the delegation was created */
  delegatedAt: string;
  /** When the delegation expires (optional) */
  expiresAt?: string;
  /** Whether the delegation is currently active */
  active: boolean;
}

/**
 * Constraints that narrow a capability delegation.
 */
export interface DelegationConstraints {
  /** Maximum number of times the delegated capability can be used */
  maxUses?: number;
  /** Current usage count */
  currentUses?: number;
  /** Time window in seconds during which the delegation is valid */
  timeWindowSec?: number;
  /** Restrict to specific scene nodes */
  sceneNodeIds?: string[];
  /** Additional UCAN caveats */
  caveats?: Record<string, unknown>;
}

/**
 * Result of a capability check.
 */
export interface CapabilityCheckResult {
  /** Whether the agent has the capability */
  granted: boolean;
  /** The matching grant or delegation (if granted) */
  source?: 'direct_grant' | 'delegation';
  /** The matching grant/delegation ID */
  sourceId?: string;
  /** Reason for denial (if not granted) */
  reason?: string;
  /** Tenant context of the check */
  tenantId: string;
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
// CAPABILITY HELPER FUNCTIONS
// =============================================================================

/**
 * Create a tenant-scoped capability key for cache lookups.
 * Format: "tenantId:agentDID:action"
 */
function capabilityCacheKey(tenantId: string, agentDID: string, action: string): string {
  return `${tenantId}:${agentDID}:${action}`;
}

/**
 * Prefix a capability action with the tenant ID to enforce isolation.
 * Format: "tenantId:action"
 */
function tenantScopedAction(tenantId: string, action: string): string {
  // If already prefixed with a tenant, return as-is
  if (action.includes(':') && action.split(':')[0] === tenantId) {
    return action;
  }
  return `${tenantId}:${action}`;
}

/**
 * Check if a capability grant matches a requested capability action.
 * Supports wildcard (*) matching on the action segment.
 */
function capabilityActionMatches(grantedAction: string, requestedAction: string): boolean {
  if (grantedAction === requestedAction) return true;
  if (grantedAction === '*') return true;

  // Namespace wildcard: "ast/*" matches "ast/read"
  if (grantedAction.endsWith('/*')) {
    const grantedNs = grantedAction.slice(0, -2);
    return requestedAction.startsWith(grantedNs + '/');
  }

  return false;
}

/**
 * Check whether one capability is a subset of (or equal to) another.
 * Used for attenuation checks in delegation.
 */
function isCapabilitySubset(child: Capability, parent: Capability): boolean {
  // Action check
  if (parent.can !== '*' && !capabilityActionMatches(parent.can, child.can)) {
    return false;
  }

  // Resource check
  if (parent.with === '*' || parent.with === 'holoscript://*') {
    return true;
  }
  if (child.with === parent.with) {
    return true;
  }
  // Path containment
  const parentNormalized = parent.with.endsWith('/') ? parent.with : parent.with + '/';
  if (child.with.startsWith(parentNormalized)) {
    return true;
  }

  return false;
}

/**
 * Generate a unique delegation ID.
 */
function generateDelegationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 10);
  return `deleg_${ts}_${rand}`;
}

/**
 * Check capability for an agent within a tenant scope.
 *
 * Searches direct grants first, then delegations. Tenant isolation is
 * enforced by filtering on the tenantId field of each grant/delegation,
 * not by action prefixing. This preserves wildcard matching semantics.
 */
function checkAgentCapability(
  state: RBACState,
  tenantId: string,
  agentDID: string,
  capabilityAction: string
): CapabilityCheckResult {
  // Check cache first
  const cacheKey = capabilityCacheKey(tenantId, agentDID, capabilityAction);
  const cached = state.capabilityCache.get(cacheKey);
  if (cached) return cached;

  const now = new Date();

  // 1. Check direct grants (filtered by tenantId for isolation)
  const grants = state.capabilityGrants.get(agentDID) || [];
  for (const grant of grants) {
    if (!grant.active) continue;
    if (grant.tenantId !== tenantId) continue;
    if (grant.expiresAt && new Date(grant.expiresAt) <= now) {
      grant.active = false;
      continue;
    }

    if (capabilityActionMatches(grant.capability.can, capabilityAction)) {
      const result: CapabilityCheckResult = {
        granted: true,
        source: 'direct_grant',
        sourceId: `grant:${agentDID}:${grant.capability.can}`,
        tenantId,
      };
      state.capabilityCache.set(cacheKey, result);
      return result;
    }
  }

  // 2. Check delegations (filtered by tenantId for isolation)
  for (const delegation of state.delegations) {
    if (!delegation.active) continue;
    if (delegation.tenantId !== tenantId) continue;
    if (delegation.toDID !== agentDID) continue;
    if (delegation.expiresAt && new Date(delegation.expiresAt) <= now) {
      delegation.active = false;
      continue;
    }

    // Check usage constraints
    if (delegation.constraints?.maxUses != null) {
      const currentUses = delegation.constraints.currentUses ?? 0;
      if (currentUses >= delegation.constraints.maxUses) {
        delegation.active = false;
        continue;
      }
    }

    if (capabilityActionMatches(delegation.capability.can, capabilityAction)) {
      // Increment usage
      if (delegation.constraints?.maxUses != null) {
        delegation.constraints.currentUses = (delegation.constraints.currentUses ?? 0) + 1;
      }
      const result: CapabilityCheckResult = {
        granted: true,
        source: 'delegation',
        sourceId: delegation.id,
        tenantId,
      };
      // Do NOT cache results from usage-constrained delegations since they can be exhausted
      if (!delegation.constraints?.maxUses) {
        state.capabilityCache.set(cacheKey, result);
      }
      return result;
    }
  }

  const result: CapabilityCheckResult = {
    granted: false,
    reason: `Agent ${agentDID} does not have capability '${capabilityAction}' in tenant '${tenantId}'`,
    tenantId,
  };
  state.capabilityCache.set(cacheKey, result);
  return result;
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
      capabilityGrants: new Map(),
      delegations: [],
      currentTenantId: config.tenantId,
      capabilityCache: new Map(),
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
          totalCapabilityGrants: Array.from(state.capabilityGrants.values()).reduce(
            (sum, g) => sum + g.length,
            0
          ),
          totalDelegations: state.delegations.length,
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

    // Expire capability grants
    for (const [agentDID, grants] of state.capabilityGrants) {
      let changed = false;
      for (const grant of grants) {
        if (grant.active && grant.expiresAt && new Date(grant.expiresAt) <= now) {
          grant.active = false;
          changed = true;
        }
      }
      if (changed) {
        // Invalidate capability cache for this agent
        for (const key of state.capabilityCache.keys()) {
          if (key.includes(`:${agentDID}:`)) {
            state.capabilityCache.delete(key);
          }
        }
      }
    }

    // Expire delegations
    for (const delegation of state.delegations) {
      if (delegation.active && delegation.expiresAt && new Date(delegation.expiresAt) <= now) {
        delegation.active = false;
        // Invalidate cache for the receiving agent
        for (const key of state.capabilityCache.keys()) {
          if (key.includes(`:${delegation.toDID}:`)) {
            state.capabilityCache.delete(key);
          }
        }
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
    } else if (event.type === 'rbac_check_capability') {
      // ---------------------------------------------------------------
      // checkCapability(agentDID, capability)
      // Verifies an agent has a specific capability via UCAN tokens.
      // ---------------------------------------------------------------
      const agentDID = (event as any).agentDID as string;
      const capability = (event as any).capability as string;
      const checkId = (event as any).checkId as string;

      if (!agentDID || !capability) {
        context.emit('rbac_error', {
          node,
          error: 'MISSING_PARAMETERS',
          message: 'agentDID and capability are required for capability check',
        });
        return;
      }

      const tenantId = state.currentTenantId || config.tenantId;
      const result = checkAgentCapability(state, tenantId, agentDID, capability);

      // Log the check
      if (config.logAccessChecks) {
        state.accessLog.push({
          timestamp: new Date().toISOString(),
          userId: agentDID,
          tenantId,
          permission: `capability:${capability}`,
          granted: result.granted,
          reason: result.granted
            ? `${result.source}:${result.sourceId}`
            : result.reason || 'no_matching_capability',
        });
      }

      context.emit('rbac_capability_result', {
        node,
        checkId,
        agentDID,
        capability,
        tenantId,
        result,
      });
      context.emit('audit_log', {
        action: 'rbac.capability.check',
        tenantId,
        details: { agentDID, capability, granted: result.granted, source: result.source },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_grant_capability') {
      // ---------------------------------------------------------------
      // Grant a capability to an agent within the current tenant scope.
      // ---------------------------------------------------------------
      const agentDID = (event as any).agentDID as string;
      const capabilityWith = (event as any).capabilityWith as string;
      const capabilityCan = (event as any).capabilityCan as string;
      const caveats = (event as any).caveats as Record<string, unknown> | undefined;
      const grantedBy = (event as any).grantedBy as string;
      const expiresAt = (event as any).expiresAt as string | undefined;

      if (!agentDID || !capabilityCan) {
        context.emit('rbac_error', {
          node,
          error: 'MISSING_PARAMETERS',
          message: 'agentDID and capabilityCan are required for capability grant',
        });
        return;
      }

      const tenantId = state.currentTenantId || config.tenantId;

      const grant: CapabilityGrant = {
        agentDID,
        capability: {
          with: capabilityWith || 'holoscript://*',
          can: capabilityCan,
          nb: caveats,
        },
        tenantId,
        grantedAt: new Date().toISOString(),
        expiresAt,
        grantedBy: grantedBy || 'system',
        active: true,
      };

      if (!state.capabilityGrants.has(agentDID)) {
        state.capabilityGrants.set(agentDID, []);
      }
      state.capabilityGrants.get(agentDID)!.push(grant);

      // Invalidate capability cache for this agent
      for (const key of state.capabilityCache.keys()) {
        if (key.startsWith(`${tenantId}:${agentDID}:`)) {
          state.capabilityCache.delete(key);
        }
      }

      context.emit('rbac_capability_granted', {
        node,
        agentDID,
        capability: grant.capability,
        tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.capability.grant',
        tenantId,
        details: { agentDID, capability: capabilityCan, grantedBy: grant.grantedBy },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_revoke_capability') {
      // ---------------------------------------------------------------
      // Revoke a specific capability from an agent.
      // ---------------------------------------------------------------
      const agentDID = (event as any).agentDID as string;
      const capabilityCan = (event as any).capabilityCan as string;
      const revokedBy = (event as any).revokedBy as string;

      if (!agentDID || !capabilityCan) return;

      const tenantId = state.currentTenantId || config.tenantId;
      const grants = state.capabilityGrants.get(agentDID) || [];
      for (const grant of grants) {
        if (grant.capability.can === capabilityCan && grant.tenantId === tenantId && grant.active) {
          grant.active = false;
        }
      }

      // Also revoke delegations from this agent with this capability
      for (const delegation of state.delegations) {
        if (
          delegation.fromDID === agentDID &&
          delegation.capability.can === capabilityCan &&
          delegation.tenantId === tenantId &&
          delegation.active
        ) {
          delegation.active = false;
        }
      }

      // Invalidate caches
      for (const key of state.capabilityCache.keys()) {
        if (key.includes(`:${agentDID}:`)) {
          state.capabilityCache.delete(key);
        }
      }

      context.emit('rbac_capability_revoked', {
        node,
        agentDID,
        capability: capabilityCan,
        tenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.capability.revoke',
        tenantId,
        details: { agentDID, capability: capabilityCan, revokedBy: revokedBy || 'system' },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_set_tenant') {
      // ---------------------------------------------------------------
      // setTenant(tenantId)
      // Scopes all subsequent permission checks to a tenant namespace.
      // ---------------------------------------------------------------
      const newTenantId = (event as any).tenantId as string;

      if (!newTenantId) {
        context.emit('rbac_error', {
          node,
          error: 'TENANT_ID_REQUIRED',
          message: 'tenantId is required for setTenant',
        });
        return;
      }

      const previousTenantId = state.currentTenantId;
      state.currentTenantId = newTenantId;

      // Clear capability cache since tenant context changed
      state.capabilityCache.clear();

      context.emit('rbac_tenant_changed', {
        node,
        previousTenantId,
        newTenantId,
      });
      context.emit('audit_log', {
        action: 'rbac.tenant.change',
        tenantId: newTenantId,
        details: { previousTenantId, newTenantId },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_delegate_scene_capability') {
      // ---------------------------------------------------------------
      // delegateSceneCapability(fromDID, toDID, capability, constraints?)
      // In-scene capability delegation between agents following UCAN
      // attenuation semantics.
      // ---------------------------------------------------------------
      const fromDID = (event as any).fromDID as string;
      const toDID = (event as any).toDID as string;
      const capabilityWith = (event as any).capabilityWith as string;
      const capabilityCan = (event as any).capabilityCan as string;
      const constraints = (event as any).constraints as DelegationConstraints | undefined;
      const expiresAt = (event as any).expiresAt as string | undefined;

      if (!fromDID || !toDID || !capabilityCan) {
        context.emit('rbac_error', {
          node,
          error: 'MISSING_PARAMETERS',
          message: 'fromDID, toDID, and capabilityCan are required for delegation',
        });
        return;
      }

      const tenantId = state.currentTenantId || config.tenantId;

      // Verify the delegator actually has the capability
      const delegatorCheck = checkAgentCapability(state, tenantId, fromDID, capabilityCan);
      if (!delegatorCheck.granted) {
        context.emit('rbac_error', {
          node,
          error: 'DELEGATION_UNAUTHORIZED',
          message: `Agent ${fromDID} cannot delegate capability '${capabilityCan}' because they do not have it in tenant '${tenantId}'`,
        });
        return;
      }

      // Attenuation check: the delegated capability must be a subset of what
      // the delegator holds. If constraints narrow the scope, that is valid.
      const delegatedCapability: Capability = {
        with: capabilityWith || 'holoscript://*',
        can: capabilityCan,
        nb: constraints?.caveats,
      };

      // Check that the delegator's grants cover this delegation
      const delegatorGrants = state.capabilityGrants.get(fromDID) || [];
      const delegatorMatchingGrants = delegatorGrants.filter(
        (g) => g.active && g.tenantId === tenantId
      );
      const delegatorDelegations = state.delegations.filter(
        (d) => d.active && d.toDID === fromDID && d.tenantId === tenantId
      );

      const allDelegatorCaps = [
        ...delegatorMatchingGrants.map((g) => g.capability),
        ...delegatorDelegations.map((d) => d.capability),
      ];

      const isCovered = allDelegatorCaps.some((parentCap) =>
        isCapabilitySubset(delegatedCapability, parentCap)
      );

      if (!isCovered) {
        context.emit('rbac_error', {
          node,
          error: 'ATTENUATION_VIOLATION',
          message: `Delegation attenuation violation: capability {with: "${delegatedCapability.with}", can: "${delegatedCapability.can}"} is not covered by delegator's capabilities`,
        });
        return;
      }

      const delegation: DelegationRecord = {
        id: generateDelegationId(),
        fromDID,
        toDID,
        capability: delegatedCapability,
        tenantId,
        constraints: constraints
          ? { ...constraints, currentUses: 0 }
          : undefined,
        delegatedAt: new Date().toISOString(),
        expiresAt,
        active: true,
      };

      state.delegations.push(delegation);

      // Invalidate capability cache for the receiving agent
      for (const key of state.capabilityCache.keys()) {
        if (key.startsWith(`${tenantId}:${toDID}:`)) {
          state.capabilityCache.delete(key);
        }
      }

      context.emit('rbac_capability_delegated', {
        node,
        delegationId: delegation.id,
        fromDID,
        toDID,
        capability: delegatedCapability,
        tenantId,
        constraints,
      });
      context.emit('audit_log', {
        action: 'rbac.capability.delegate',
        tenantId,
        details: {
          delegationId: delegation.id,
          fromDID,
          toDID,
          capability: capabilityCan,
          constraints,
        },
        timestamp: new Date().toISOString(),
      });
    } else if (event.type === 'rbac_get_tenant_id') {
      // ---------------------------------------------------------------
      // getTenantId() accessor
      // ---------------------------------------------------------------
      context.emit('rbac_tenant_id', {
        node,
        queryId: (event as any).queryId,
        tenantId: state.currentTenantId || config.tenantId,
      });
    } else if (event.type === 'rbac_query_agent_capabilities') {
      // ---------------------------------------------------------------
      // Query all capabilities for an agent within the current tenant.
      // ---------------------------------------------------------------
      const agentDID = (event as any).agentDID as string;
      const tenantId = state.currentTenantId || config.tenantId;

      const directGrants = (state.capabilityGrants.get(agentDID) || []).filter(
        (g) => g.active && g.tenantId === tenantId
      );

      const delegatedGrants = state.delegations.filter(
        (d) => d.active && d.toDID === agentDID && d.tenantId === tenantId
      );

      context.emit('rbac_agent_capabilities', {
        node,
        queryId: (event as any).queryId,
        agentDID,
        tenantId,
        directGrants: directGrants.map((g) => ({
          capability: g.capability,
          grantedBy: g.grantedBy,
          grantedAt: g.grantedAt,
          expiresAt: g.expiresAt,
        })),
        delegatedGrants: delegatedGrants.map((d) => ({
          delegationId: d.id,
          fromDID: d.fromDID,
          capability: d.capability,
          delegatedAt: d.delegatedAt,
          expiresAt: d.expiresAt,
          constraints: d.constraints,
        })),
      });
    }
  },
};

export default rbacHandler;
