/**
 * Role Trait
 *
 * Role-based permissions and access control.
 * Manages what users can do with objects based on their roles.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type Permission = 'view' | 'interact' | 'edit' | 'delete' | 'admin' | 'transfer' | 'configure';

interface RoleState {
  currentRole: string;
  effectivePermissions: Set<Permission>;
  roleHistory: Array<{ role: string; timestamp: number }>;
  pendingRoleChange: string | null;
}

interface RoleConfig {
  role_id: string;
  permissions: Permission[];
  display_badge: boolean;
  badge_color: string;
  inherits_from: string; // Parent role to inherit from
  role_hierarchy: Record<string, Permission[]>; // Role definitions
}

// =============================================================================
// HANDLER
// =============================================================================

export const roleHandler: TraitHandler<RoleConfig> = {
  name: 'role',

  defaultConfig: {
    role_id: 'user',
    permissions: ['interact'],
    display_badge: false,
    badge_color: '#888888',
    inherits_from: '',
    role_hierarchy: {
      guest: ['view'],
      user: ['view', 'interact'],
      editor: ['view', 'interact', 'edit'],
      admin: ['view', 'interact', 'edit', 'delete', 'admin', 'configure'],
    },
  },

  onAttach(node, config, context) {
    const state: RoleState = {
      currentRole: config.role_id,
      effectivePermissions: new Set(),
      roleHistory: [{ role: config.role_id, timestamp: Date.now() }],
      pendingRoleChange: null,
    };
    node.__roleState = state;

    // Calculate effective permissions
    calculateEffectivePermissions(state, config);

    if (config.display_badge) {
      context.emit?.('role_show_badge', {
        node,
        role: config.role_id,
        color: config.badge_color,
      });
    }
  },

  onDetach(node) {
    delete node.__roleState;
  },

  onUpdate(node, config, context, _delta) {
    const state = node.__roleState as RoleState;
    if (!state) return;

    // Process pending role change
    if (state.pendingRoleChange) {
      const newRole = state.pendingRoleChange;
      state.pendingRoleChange = null;

      const previousRole = state.currentRole;
      state.currentRole = newRole;
      state.roleHistory.push({ role: newRole, timestamp: Date.now() });

      calculateEffectivePermissions(state, config);

      context.emit?.('on_role_change', {
        node,
        previousRole,
        newRole,
        permissions: Array.from(state.effectivePermissions),
      });

      if (config.display_badge) {
        context.emit?.('role_update_badge', {
          node,
          role: newRole,
        });
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = node.__roleState as RoleState;
    if (!state) return;

    if (event.type === 'role_set') {
      const newRole = event.role as string;
      state.pendingRoleChange = newRole;
    } else if (event.type === 'role_check_permission') {
      const permission = event.permission as Permission;
      const hasPermission = state.effectivePermissions.has(permission);

      context.emit?.('role_permission_result', {
        node,
        permission,
        granted: hasPermission,
        role: state.currentRole,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'role_grant_permission') {
      const permission = event.permission as Permission;
      state.effectivePermissions.add(permission);

      context.emit?.('on_permission_granted', {
        node,
        permission,
      });
    } else if (event.type === 'role_revoke_permission') {
      const permission = event.permission as Permission;
      state.effectivePermissions.delete(permission);

      context.emit?.('on_permission_revoked', {
        node,
        permission,
      });
    } else if (event.type === 'role_get_history') {
      context.emit?.('role_history_result', {
        node,
        history: state.roleHistory,
        callbackId: event.callbackId,
      });
    } else if (event.type === 'role_can_perform') {
      const action = event.action as string;
      const requiredPermissions = getRequiredPermissions(action);
      const canPerform = requiredPermissions.every((p) => state.effectivePermissions.has(p));

      context.emit?.('role_action_check_result', {
        node,
        action,
        canPerform,
        missingPermissions: requiredPermissions.filter((p) => !state.effectivePermissions.has(p)),
        callbackId: event.callbackId,
      });
    } else if (event.type === 'role_query') {
      context.emit?.('role_info', {
        queryId: event.queryId,
        node,
        currentRole: state.currentRole,
        permissions: Array.from(state.effectivePermissions),
        historyLength: state.roleHistory.length,
        displayBadge: config.display_badge,
      });
    }
  },
};

function calculateEffectivePermissions(state: RoleState, config: RoleConfig): void {
  state.effectivePermissions.clear();

  // Add base permissions from config
  for (const perm of config.permissions) {
    state.effectivePermissions.add(perm);
  }

  // Add permissions from role hierarchy
  const rolePerms = config.role_hierarchy[state.currentRole];
  if (rolePerms) {
    for (const perm of rolePerms) {
      state.effectivePermissions.add(perm);
    }
  }

  // Add inherited permissions
  if (config.inherits_from) {
    const inheritedPerms = config.role_hierarchy[config.inherits_from];
    if (inheritedPerms) {
      for (const perm of inheritedPerms) {
        state.effectivePermissions.add(perm);
      }
    }
  }
}

function getRequiredPermissions(action: string): Permission[] {
  const actionMap: Record<string, Permission[]> = {
    view: ['view'],
    click: ['interact'],
    grab: ['interact'],
    modify: ['edit'],
    remove: ['delete'],
    settings: ['configure'],
    manage: ['admin'],
  };
  return actionMap[action] || ['interact'];
}

export default roleHandler;
