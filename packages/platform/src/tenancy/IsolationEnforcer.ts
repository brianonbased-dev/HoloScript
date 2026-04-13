/**
 * Isolation Enforcer
 *
 * Enforces strict resource isolation between tenants.
 * Prevents cross-tenant access and provides namespace-based isolation.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

import type { TenantContext } from './TenantManager';

// =============================================================================
// ERRORS
// =============================================================================

export class TenantIsolationError extends Error {
  public readonly requestingTenantId: string;
  public readonly resourceTenantId: string;

  constructor(requestingTenantId: string, resourceTenantId: string, detail?: string) {
    const message = detail
      ? `Tenant isolation violation: tenant '${requestingTenantId}' cannot access resources of tenant '${resourceTenantId}'. ${detail}`
      : `Tenant isolation violation: tenant '${requestingTenantId}' cannot access resources of tenant '${resourceTenantId}'`;
    super(message);
    this.name = 'TenantIsolationError';
    this.requestingTenantId = requestingTenantId;
    this.resourceTenantId = resourceTenantId;
  }
}

// =============================================================================
// ISOLATION FUNCTIONS
// =============================================================================

/**
 * Validate that a context is allowed to access a resource belonging to a specific tenant.
 * Throws TenantIsolationError if the context's tenant does not match the resource's tenant.
 *
 * @param context - The requesting tenant context
 * @param resourceTenantId - The tenant that owns the resource
 */
export function validateResourceAccess(context: TenantContext, resourceTenantId: string): void {
  if (context.tenantId !== resourceTenantId) {
    throw new TenantIsolationError(context.tenantId, resourceTenantId);
  }
}

/**
 * Run a function with an isolated execution namespace.
 * The function receives the tenant-scoped namespace prefix.
 * Ensures no cross-tenant data leakage by binding the execution to the tenant context.
 *
 * @param context - The tenant context for isolation
 * @param fn - The function to execute in isolation, receives the tenant namespace prefix
 * @returns The return value of fn
 */
export async function isolateExecution<T>(
  context: TenantContext,
  fn: (namespacePrefix: string) => T | Promise<T>
): Promise<T> {
  const namespacePrefix = `tenant:${context.tenantId}:`;
  return fn(namespacePrefix);
}

/**
 * Validate that a namespace belongs to the given tenant context.
 * Throws TenantIsolationError if the namespace does not match the tenant.
 *
 * @param context - The tenant context
 * @param namespace - The namespace to validate
 */
export function validateNamespace(context: TenantContext, namespace: string): void {
  const expectedPrefix = `tenant:${context.tenantId}:`;
  if (!namespace.startsWith(expectedPrefix)) {
    throw new TenantIsolationError(
      context.tenantId,
      extractTenantFromNamespace(namespace) ?? 'unknown',
      `Namespace '${namespace}' does not belong to tenant '${context.tenantId}'`
    );
  }
}

/**
 * Get an isolated namespace name for a tenant.
 * Returns a tenant-prefixed version of the given name.
 *
 * @param context - The tenant context
 * @param name - The base namespace name
 * @returns The tenant-prefixed namespace
 */
export function getIsolatedNamespace(context: TenantContext, name: string): string {
  return `tenant:${context.tenantId}:${name}`;
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extract the tenant ID from a namespace string, if possible.
 */
function extractTenantFromNamespace(namespace: string): string | null {
  const match = namespace.match(/^tenant:([^:]+):/);
  return match ? match[1] : null;
}
