/**
 * Namespace Manager
 *
 * Manages tenant-isolated namespaces for resource organization.
 * Each tenant's namespaces are fully isolated from other tenants.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Namespace {
  tenantId: string;
  name: string;
  createdAt: Date;
  data: Map<string, unknown>;
}

export interface NamespaceInfo {
  tenantId: string;
  name: string;
  createdAt: Date;
  dataKeyCount: number;
}

// =============================================================================
// NAMESPACE MANAGER
// =============================================================================

/**
 * Manages namespaces per tenant, providing data isolation between tenants.
 * Each namespace is scoped to a tenant and can store arbitrary key-value data.
 */
export class NamespaceManager {
  /**
   * Outer map: tenantId -> (inner map: namespace name -> Namespace)
   */
  private readonly namespaces: Map<string, Map<string, Namespace>> = new Map();

  /**
   * Create a new namespace for a tenant.
   * Throws if the namespace already exists for this tenant.
   *
   * @param tenantId - The tenant that owns the namespace
   * @param name - The namespace name
   */
  createNamespace(tenantId: string, name: string): Namespace {
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('tenantId is required');
    }
    if (!name || name.trim().length === 0) {
      throw new Error('Namespace name is required');
    }

    const tenantNamespaces = this.getOrCreateTenantMap(tenantId);

    if (tenantNamespaces.has(name)) {
      throw new Error(`Namespace '${name}' already exists for tenant '${tenantId}'`);
    }

    const namespace: Namespace = {
      tenantId,
      name,
      createdAt: new Date(),
      data: new Map(),
    };

    tenantNamespaces.set(name, namespace);
    return namespace;
  }

  /**
   * Retrieve a namespace by tenant ID and name.
   * Throws if the namespace does not exist.
   *
   * @param tenantId - The tenant that owns the namespace
   * @param name - The namespace name
   */
  getNamespace(tenantId: string, name: string): Namespace {
    const tenantNamespaces = this.namespaces.get(tenantId);
    if (!tenantNamespaces) {
      throw new Error(`No namespaces found for tenant '${tenantId}'`);
    }

    const namespace = tenantNamespaces.get(name);
    if (!namespace) {
      throw new Error(`Namespace '${name}' not found for tenant '${tenantId}'`);
    }

    return namespace;
  }

  /**
   * List all namespaces for a tenant.
   *
   * @param tenantId - The tenant whose namespaces to list
   * @returns Array of namespace info (without raw data map)
   */
  listNamespaces(tenantId: string): NamespaceInfo[] {
    const tenantNamespaces = this.namespaces.get(tenantId);
    if (!tenantNamespaces) {
      return [];
    }

    const result: NamespaceInfo[] = [];
    for (const ns of tenantNamespaces.values()) {
      result.push({
        tenantId: ns.tenantId,
        name: ns.name,
        createdAt: ns.createdAt,
        dataKeyCount: ns.data.size,
      });
    }
    return result;
  }

  /**
   * Delete a namespace for a tenant.
   * Throws if the namespace does not exist.
   *
   * @param tenantId - The tenant that owns the namespace
   * @param name - The namespace name to delete
   */
  deleteNamespace(tenantId: string, name: string): void {
    const tenantNamespaces = this.namespaces.get(tenantId);
    if (!tenantNamespaces || !tenantNamespaces.has(name)) {
      throw new Error(`Namespace '${name}' not found for tenant '${tenantId}'`);
    }

    tenantNamespaces.delete(name);

    // Clean up empty tenant map
    if (tenantNamespaces.size === 0) {
      this.namespaces.delete(tenantId);
    }
  }

  /**
   * Store data in a tenant's namespace.
   * Throws if the namespace does not exist.
   *
   * @param tenantId - The tenant that owns the namespace
   * @param name - The namespace name
   * @param key - The data key
   * @param value - The data value
   */
  setNamespaceData(tenantId: string, name: string, key: string, value: unknown): void {
    const namespace = this.getNamespace(tenantId, name);
    namespace.data.set(key, value);
  }

  /**
   * Retrieve data from a tenant's namespace.
   * Returns undefined if the key does not exist.
   * Throws if the namespace does not exist.
   *
   * @param tenantId - The tenant that owns the namespace
   * @param name - The namespace name
   * @param key - The data key
   */
  getNamespaceData(tenantId: string, name: string, key: string): unknown {
    const namespace = this.getNamespace(tenantId, name);
    return namespace.data.get(key);
  }

  /**
   * Check if a namespace exists for a tenant.
   */
  hasNamespace(tenantId: string, name: string): boolean {
    const tenantNamespaces = this.namespaces.get(tenantId);
    return tenantNamespaces?.has(name) ?? false;
  }

  // ===========================================================================
  // PRIVATE
  // ===========================================================================

  private getOrCreateTenantMap(tenantId: string): Map<string, Namespace> {
    let tenantNamespaces = this.namespaces.get(tenantId);
    if (!tenantNamespaces) {
      tenantNamespaces = new Map();
      this.namespaces.set(tenantId, tenantNamespaces);
    }
    return tenantNamespaces;
  }
}
