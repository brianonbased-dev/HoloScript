/**
 * Tenant Context
 *
 * Request-scoped tenant context management using AsyncLocalStorage.
 * Provides ambient tenant context for any code running within a tenant scope.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { TenantContext, TenantPermission } from './TenantManager';

// =============================================================================
// TYPES
// =============================================================================

export interface ResourceDescriptor {
  tenantId: string;
  type: string;
  name: string;
}

// =============================================================================
// ASYNC LOCAL STORAGE
// =============================================================================

const tenantStorage = new AsyncLocalStorage<TenantContext>();

// =============================================================================
// CONTEXT FUNCTIONS
// =============================================================================

/**
 * Create a new tenant context with a generated session ID.
 *
 * @param tenantId - The tenant this context belongs to
 * @param userId - Optional user ID within the tenant
 * @param permissions - Permissions granted for this context (defaults to ['read'])
 */
export function createContext(
  tenantId: string,
  userId?: string,
  permissions?: TenantPermission[]
): TenantContext {
  if (!tenantId || tenantId.trim().length === 0) {
    throw new Error('tenantId is required');
  }

  return {
    tenantId: tenantId.trim(),
    userId,
    sessionId: generateSessionId(),
    permissions: permissions ?? ['read'],
  };
}

/**
 * Validate whether a context has the required permission for a resource.
 *
 * @param context - The tenant context to check
 * @param resource - The resource being accessed
 * @param permission - The required permission
 * @returns true if access is allowed
 */
export function validateAccess(
  context: TenantContext,
  resource: ResourceDescriptor,
  permission: TenantPermission
): boolean {
  // Cross-tenant access is never allowed
  if (context.tenantId !== resource.tenantId) {
    return false;
  }

  // Admin permission grants all access
  if (context.permissions.includes('admin')) {
    return true;
  }

  return context.permissions.includes(permission);
}

/**
 * Run a function within a tenant context scope.
 * The context is available via getCurrentContext() for the duration of the function.
 *
 * @param context - The tenant context to bind
 * @param fn - The function to execute within the context
 * @returns The return value of fn
 */
export function withTenantContext<T>(context: TenantContext, fn: () => T): T {
  return tenantStorage.run(context, fn);
}

/**
 * Get the current tenant context from async local storage.
 * Returns undefined if no context is active.
 */
export function getCurrentContext(): TenantContext | undefined {
  return tenantStorage.getStore();
}

/**
 * Get the current tenant context, throwing if none is active.
 */
export function requireContext(): TenantContext {
  const ctx = getCurrentContext();
  if (!ctx) {
    throw new Error('No tenant context is active. Use withTenantContext() to establish one.');
  }
  return ctx;
}

// =============================================================================
// HELPERS
// =============================================================================

let sessionCounter = 0;

function generateSessionId(): string {
  sessionCounter++;
  const timestamp = Date.now().toString(36);
  const counter = sessionCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 8);
  return `sess_${timestamp}_${counter}_${random}`;
}
