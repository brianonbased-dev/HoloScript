/**
 * PermissionTrait — v5.1
 *
 * Role-based permission checks with grant/revoke.
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface PermissionConfig {
  default_role: string;
}

export const permissionHandler: TraitHandler<PermissionConfig> = {
  name: 'permission',
  defaultConfig: { default_role: 'viewer' },

  onAttach(node: HSPlusNode): void {
    node.__permState = { grants: new Map<string, Set<string>>() };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__permState;
  },
  onUpdate(): void {},

  onEvent(
    node: HSPlusNode,
    _config: PermissionConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__permState as { grants: Map<string, Set<string>> } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'permission:grant': {
        const userId = event.userId as string;
        if (!state.grants.has(userId)) state.grants.set(userId, new Set());
        state.grants.get(userId)!.add(event.permission as string);
        context.emit?.('permission:granted', { userId, permission: event.permission });
        break;
      }
      case 'permission:check': {
        const perms = state.grants.get(event.userId as string);
        const has = perms?.has(event.permission as string) ?? false;
        context.emit?.('permission:result', {
          userId: event.userId,
          permission: event.permission,
          allowed: has,
        });
        break;
      }
      case 'permission:revoke': {
        state.grants.get(event.userId as string)?.delete(event.permission as string);
        context.emit?.('permission:revoked', {
          userId: event.userId,
          permission: event.permission,
        });
        break;
      }
    }
  },
};

export default permissionHandler;
