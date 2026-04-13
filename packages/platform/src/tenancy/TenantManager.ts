/**
 * Tenant Manager
 *
 * Core tenant management for multi-tenant HoloScript isolation.
 * Handles CRUD operations for tenants with in-memory or custom storage.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface QuotaConfig {
  maxCompilationsPerHour: number;
  maxStorageBytes: number;
  maxProjectsPerTenant: number;
  maxDeploymentsPerDay: number;
}

export interface TenantSettings {
  maxUsers: number;
  maxProjects: number;
  maxStorageBytes: number;
  allowedFeatures: string[];
  customDomain?: string;
}

export type TenantPlan = 'free' | 'pro' | 'enterprise';

export interface Tenant {
  id: string;
  name: string;
  plan: TenantPlan;
  quotas: QuotaConfig;
  settings: TenantSettings;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

export type Permission = 'read' | 'write' | 'admin' | 'compile' | 'deploy' | 'publish';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  sessionId: string;
  permissions: Permission[];
}

export interface CreateTenantConfig {
  id?: string;
  name: string;
  plan?: TenantPlan;
  quotas?: Partial<QuotaConfig>;
  settings?: Partial<TenantSettings>;
  metadata?: Record<string, unknown>;
}

export interface TenantFilter {
  plan?: TenantPlan;
}

export interface TenantStore {
  get(id: string): Tenant | undefined;
  set(id: string, tenant: Tenant): void;
  delete(id: string): boolean;
  values(): IterableIterator<Tenant>;
  has(id: string): boolean;
}

// =============================================================================
// DEFAULT QUOTAS
// =============================================================================

const DEFAULT_QUOTAS: Record<TenantPlan, QuotaConfig> = {
  free: {
    maxCompilationsPerHour: 100,
    maxStorageBytes: 100 * 1024 * 1024, // 100 MB
    maxProjectsPerTenant: 3,
    maxDeploymentsPerDay: 5,
  },
  pro: {
    maxCompilationsPerHour: 1000,
    maxStorageBytes: 1024 * 1024 * 1024, // 1 GB
    maxProjectsPerTenant: 50,
    maxDeploymentsPerDay: 100,
  },
  enterprise: {
    maxCompilationsPerHour: 10000,
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    maxProjectsPerTenant: 500,
    maxDeploymentsPerDay: 1000,
  },
};

const DEFAULT_SETTINGS: Record<TenantPlan, TenantSettings> = {
  free: {
    maxUsers: 1,
    maxProjects: 3,
    maxStorageBytes: 100 * 1024 * 1024,
    allowedFeatures: ['compile', 'preview'],
  },
  pro: {
    maxUsers: 25,
    maxProjects: 50,
    maxStorageBytes: 1024 * 1024 * 1024,
    allowedFeatures: ['compile', 'preview', 'deploy', 'collaborate', 'custom-traits'],
  },
  enterprise: {
    maxUsers: 1000,
    maxProjects: 500,
    maxStorageBytes: 10 * 1024 * 1024 * 1024,
    allowedFeatures: [
      'compile',
      'preview',
      'deploy',
      'collaborate',
      'custom-traits',
      'sso',
      'audit-log',
      'custom-domain',
      'priority-support',
    ],
  },
};

// =============================================================================
// TENANT MANAGER
// =============================================================================

/**
 * Manages tenant lifecycle and storage.
 * Supports in-memory storage by default, or a custom store implementation.
 */
export class TenantManager {
  private readonly store: TenantStore;

  constructor(store?: TenantStore) {
    this.store = store ?? new Map<string, Tenant>();
  }

  /**
   * Create a new tenant with the given configuration.
   * Applies plan-based defaults for quotas and settings when not specified.
   */
  createTenant(config: CreateTenantConfig): Tenant {
    const plan = config.plan ?? 'free';
    const id = config.id ?? generateTenantId();

    if (this.store.has(id)) {
      throw new Error(`Tenant with id '${id}' already exists`);
    }

    if (!config.name || config.name.trim().length === 0) {
      throw new Error('Tenant name is required');
    }

    const tenant: Tenant = {
      id,
      name: config.name.trim(),
      plan,
      quotas: {
        ...DEFAULT_QUOTAS[plan],
        ...config.quotas,
      },
      settings: {
        ...DEFAULT_SETTINGS[plan],
        ...config.settings,
      },
      createdAt: new Date(),
      metadata: config.metadata ?? {},
    };

    this.store.set(id, tenant);
    return tenant;
  }

  /**
   * Retrieve a tenant by ID.
   * Throws if the tenant does not exist.
   */
  getTenant(id: string): Tenant {
    const tenant = this.store.get(id);
    if (!tenant) {
      throw new Error(`Tenant '${id}' not found`);
    }
    return tenant;
  }

  /**
   * Update a tenant's configuration.
   * Supports partial updates to quotas, settings, and metadata.
   */
  updateTenant(
    id: string,
    updates: Partial<Pick<Tenant, 'name' | 'plan' | 'metadata'>> & {
      quotas?: Partial<QuotaConfig>;
      settings?: Partial<TenantSettings>;
    }
  ): Tenant {
    const existing = this.getTenant(id);

    const updated: Tenant = {
      ...existing,
      name: updates.name ?? existing.name,
      plan: updates.plan ?? existing.plan,
      metadata: updates.metadata
        ? { ...existing.metadata, ...updates.metadata }
        : existing.metadata,
      quotas: updates.quotas ? { ...existing.quotas, ...updates.quotas } : existing.quotas,
      settings: updates.settings
        ? { ...existing.settings, ...updates.settings }
        : existing.settings,
    };

    this.store.set(id, updated);
    return updated;
  }

  /**
   * Delete a tenant by ID.
   * Throws if the tenant does not exist.
   */
  deleteTenant(id: string): void {
    if (!this.store.has(id)) {
      throw new Error(`Tenant '${id}' not found`);
    }
    this.store.delete(id);
  }

  /**
   * List all tenants, optionally filtered by plan.
   */
  listTenants(filter?: TenantFilter): Tenant[] {
    const tenants: Tenant[] = [];
    for (const tenant of this.store.values()) {
      if (filter?.plan && tenant.plan !== filter.plan) {
        continue;
      }
      tenants.push(tenant);
    }
    return tenants;
  }

  /**
   * Check if a tenant exists.
   */
  hasTenant(id: string): boolean {
    return this.store.has(id);
  }
}

// =============================================================================
// HELPERS
// =============================================================================

let tenantIdCounter = 0;

/**
 * Generate a unique tenant ID.
 * Uses a combination of timestamp and counter for uniqueness.
 */
function generateTenantId(): string {
  tenantIdCounter++;
  const timestamp = Date.now().toString(36);
  const counter = tenantIdCounter.toString(36).padStart(4, '0');
  const random = Math.random().toString(36).substring(2, 8);
  return `tenant_${timestamp}_${counter}_${random}`;
}
