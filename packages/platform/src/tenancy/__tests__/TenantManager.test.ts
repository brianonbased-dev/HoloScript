/**
 * Multi-Tenant Isolation Tests
 *
 * Tests for tenant CRUD, context management, permission checking,
 * cross-tenant access prevention, namespace isolation, and async context.
 *
 * @version 3.9.0
 * @Sprint Sprint 9: Multi-Tenant Isolation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  TenantManager,
  type Tenant,
  type TenantContext,
  type CreateTenantConfig,
} from '@holoscript/core';
import {
  createContext,
  validateAccess,
  withTenantContext,
  getCurrentContext,
  requireContext,
  type ResourceDescriptor,
} from '@holoscript/core';
import {
  validateResourceAccess,
  isolateExecution,
  validateNamespace,
  getIsolatedNamespace,
  TenantIsolationError,
} from '@holoscript/core';
import { NamespaceManager } from '@holoscript/core';

// =============================================================================
// TENANT CRUD OPERATIONS
// =============================================================================

describe('TenantManager', () => {
  let manager: TenantManager;

  beforeEach(() => {
    manager = new TenantManager();
  });

  describe('createTenant', () => {
    it('should create a tenant with default plan', () => {
      const tenant = manager.createTenant({ name: 'Test Org' });

      expect(tenant.id).toBeDefined();
      expect(tenant.name).toBe('Test Org');
      expect(tenant.plan).toBe('free');
      expect(tenant.createdAt).toBeInstanceOf(Date);
      expect(tenant.metadata).toEqual({});
    });

    it('should create a tenant with specified plan', () => {
      const tenant = manager.createTenant({ name: 'Pro Org', plan: 'pro' });

      expect(tenant.plan).toBe('pro');
      expect(tenant.quotas.maxCompilationsPerHour).toBe(1000);
      expect(tenant.settings.maxUsers).toBe(25);
    });

    it('should create an enterprise tenant with full features', () => {
      const tenant = manager.createTenant({ name: 'Enterprise Org', plan: 'enterprise' });

      expect(tenant.plan).toBe('enterprise');
      expect(tenant.settings.allowedFeatures).toContain('sso');
      expect(tenant.settings.allowedFeatures).toContain('audit-log');
      expect(tenant.settings.allowedFeatures).toContain('custom-domain');
      expect(tenant.settings.maxUsers).toBe(1000);
    });

    it('should create a tenant with custom ID', () => {
      const tenant = manager.createTenant({ id: 'custom-id', name: 'Custom' });

      expect(tenant.id).toBe('custom-id');
    });

    it('should apply custom quotas over defaults', () => {
      const tenant = manager.createTenant({
        name: 'Custom Quotas',
        plan: 'free',
        quotas: { maxCompilationsPerHour: 500 },
      });

      expect(tenant.quotas.maxCompilationsPerHour).toBe(500);
      // Other quota values should use plan defaults
      expect(tenant.quotas.maxProjectsPerTenant).toBe(3);
    });

    it('should apply custom settings over defaults', () => {
      const tenant = manager.createTenant({
        name: 'Custom Settings',
        plan: 'pro',
        settings: { maxUsers: 100 },
      });

      expect(tenant.settings.maxUsers).toBe(100);
      expect(tenant.settings.maxProjects).toBe(50);
    });

    it('should store metadata', () => {
      const tenant = manager.createTenant({
        name: 'With Meta',
        metadata: { region: 'us-east', tier: 'platinum' },
      });

      expect(tenant.metadata).toEqual({ region: 'us-east', tier: 'platinum' });
    });

    it('should throw if tenant ID already exists', () => {
      manager.createTenant({ id: 'dup-id', name: 'First' });

      expect(() => manager.createTenant({ id: 'dup-id', name: 'Second' })).toThrow(
        "Tenant with id 'dup-id' already exists"
      );
    });

    it('should throw if name is empty', () => {
      expect(() => manager.createTenant({ name: '' })).toThrow('Tenant name is required');
      expect(() => manager.createTenant({ name: '   ' })).toThrow('Tenant name is required');
    });

    it('should trim tenant name', () => {
      const tenant = manager.createTenant({ name: '  Trimmed  ' });
      expect(tenant.name).toBe('Trimmed');
    });
  });

  describe('getTenant', () => {
    it('should retrieve an existing tenant', () => {
      const created = manager.createTenant({ id: 'get-test', name: 'Get Test' });
      const retrieved = manager.getTenant('get-test');

      expect(retrieved).toEqual(created);
    });

    it('should throw for non-existent tenant', () => {
      expect(() => manager.getTenant('nonexistent')).toThrow("Tenant 'nonexistent' not found");
    });
  });

  describe('updateTenant', () => {
    it('should update tenant name', () => {
      manager.createTenant({ id: 'update-test', name: 'Original' });
      const updated = manager.updateTenant('update-test', { name: 'Updated' });

      expect(updated.name).toBe('Updated');
    });

    it('should update tenant plan', () => {
      manager.createTenant({ id: 'plan-test', name: 'Plan Test', plan: 'free' });
      const updated = manager.updateTenant('plan-test', { plan: 'pro' });

      expect(updated.plan).toBe('pro');
    });

    it('should merge metadata', () => {
      manager.createTenant({
        id: 'meta-test',
        name: 'Meta Test',
        metadata: { key1: 'value1' },
      });
      const updated = manager.updateTenant('meta-test', {
        metadata: { key2: 'value2' },
      });

      expect(updated.metadata).toEqual({ key1: 'value1', key2: 'value2' });
    });

    it('should partially update quotas', () => {
      manager.createTenant({ id: 'quota-test', name: 'Quota Test', plan: 'free' });
      const updated = manager.updateTenant('quota-test', {
        quotas: { maxCompilationsPerHour: 999 },
      });

      expect(updated.quotas.maxCompilationsPerHour).toBe(999);
      expect(updated.quotas.maxProjectsPerTenant).toBe(3); // unchanged
    });

    it('should partially update settings', () => {
      manager.createTenant({ id: 'settings-test', name: 'Settings Test', plan: 'pro' });
      const updated = manager.updateTenant('settings-test', {
        settings: { customDomain: 'my.domain.com' },
      });

      expect(updated.settings.customDomain).toBe('my.domain.com');
      expect(updated.settings.maxUsers).toBe(25); // unchanged
    });

    it('should throw for non-existent tenant', () => {
      expect(() => manager.updateTenant('nonexistent', { name: 'Nope' })).toThrow(
        "Tenant 'nonexistent' not found"
      );
    });
  });

  describe('deleteTenant', () => {
    it('should delete an existing tenant', () => {
      manager.createTenant({ id: 'delete-test', name: 'Delete Test' });
      manager.deleteTenant('delete-test');

      expect(() => manager.getTenant('delete-test')).toThrow("Tenant 'delete-test' not found");
    });

    it('should throw for non-existent tenant', () => {
      expect(() => manager.deleteTenant('nonexistent')).toThrow("Tenant 'nonexistent' not found");
    });
  });

  describe('listTenants', () => {
    beforeEach(() => {
      manager.createTenant({ id: 'free-1', name: 'Free One', plan: 'free' });
      manager.createTenant({ id: 'free-2', name: 'Free Two', plan: 'free' });
      manager.createTenant({ id: 'pro-1', name: 'Pro One', plan: 'pro' });
      manager.createTenant({ id: 'ent-1', name: 'Enterprise One', plan: 'enterprise' });
    });

    it('should list all tenants when no filter', () => {
      const tenants = manager.listTenants();
      expect(tenants).toHaveLength(4);
    });

    it('should filter by plan', () => {
      const freeTenants = manager.listTenants({ plan: 'free' });
      expect(freeTenants).toHaveLength(2);
      expect(freeTenants.every((t) => t.plan === 'free')).toBe(true);

      const proTenants = manager.listTenants({ plan: 'pro' });
      expect(proTenants).toHaveLength(1);
      expect(proTenants[0].name).toBe('Pro One');
    });

    it('should return empty array for plan with no tenants', () => {
      const mgr = new TenantManager();
      const tenants = mgr.listTenants({ plan: 'enterprise' });
      expect(tenants).toEqual([]);
    });
  });

  describe('hasTenant', () => {
    it('should return true for existing tenant', () => {
      manager.createTenant({ id: 'exists', name: 'Exists' });
      expect(manager.hasTenant('exists')).toBe(true);
    });

    it('should return false for non-existent tenant', () => {
      expect(manager.hasTenant('nope')).toBe(false);
    });
  });

  describe('custom store', () => {
    it('should work with a custom store implementation', () => {
      const customStore = new Map<string, Tenant>();
      const mgr = new TenantManager(customStore);

      mgr.createTenant({ id: 'custom', name: 'Custom Store' });
      expect(customStore.has('custom')).toBe(true);
      expect(mgr.getTenant('custom').name).toBe('Custom Store');
    });
  });
});

// =============================================================================
// TENANT CONTEXT
// =============================================================================

describe('TenantContext', () => {
  describe('createContext', () => {
    it('should create a context with session ID', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read', 'write']);

      expect(ctx.tenantId).toBe('tenant-1');
      expect(ctx.userId).toBe('user-1');
      expect(ctx.sessionId).toBeDefined();
      expect(ctx.sessionId).toMatch(/^sess_/);
      expect(ctx.permissions).toEqual(['read', 'write']);
    });

    it('should default to read permission', () => {
      const ctx = createContext('tenant-1');

      expect(ctx.permissions).toEqual(['read']);
      expect(ctx.userId).toBeUndefined();
    });

    it('should throw for empty tenant ID', () => {
      expect(() => createContext('')).toThrow('tenantId is required');
      expect(() => createContext('  ')).toThrow('tenantId is required');
    });

    it('should generate unique session IDs', () => {
      const ctx1 = createContext('t1');
      const ctx2 = createContext('t1');
      expect(ctx1.sessionId).not.toBe(ctx2.sessionId);
    });
  });

  describe('validateAccess', () => {
    it('should allow access for matching tenant and permission', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read', 'write']);
      const resource: ResourceDescriptor = {
        tenantId: 'tenant-1',
        type: 'project',
        name: 'my-project',
      };

      expect(validateAccess(ctx, resource, 'read')).toBe(true);
      expect(validateAccess(ctx, resource, 'write')).toBe(true);
    });

    it('should deny access for missing permission', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read']);
      const resource: ResourceDescriptor = {
        tenantId: 'tenant-1',
        type: 'project',
        name: 'my-project',
      };

      expect(validateAccess(ctx, resource, 'write')).toBe(false);
      expect(validateAccess(ctx, resource, 'admin')).toBe(false);
      expect(validateAccess(ctx, resource, 'deploy')).toBe(false);
    });

    it('should deny cross-tenant access regardless of permissions', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read', 'write', 'admin']);
      const resource: ResourceDescriptor = {
        tenantId: 'tenant-2',
        type: 'project',
        name: 'other-project',
      };

      expect(validateAccess(ctx, resource, 'read')).toBe(false);
    });

    it('should grant admin full access to own resources', () => {
      const ctx = createContext('tenant-1', 'admin-1', ['admin']);
      const resource: ResourceDescriptor = {
        tenantId: 'tenant-1',
        type: 'project',
        name: 'any-project',
      };

      expect(validateAccess(ctx, resource, 'read')).toBe(true);
      expect(validateAccess(ctx, resource, 'write')).toBe(true);
      expect(validateAccess(ctx, resource, 'compile')).toBe(true);
      expect(validateAccess(ctx, resource, 'deploy')).toBe(true);
      expect(validateAccess(ctx, resource, 'publish')).toBe(true);
    });
  });

  describe('withTenantContext', () => {
    it('should make context available during synchronous execution', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read']);

      const result = withTenantContext(ctx, () => {
        const current = getCurrentContext();
        expect(current).toBeDefined();
        expect(current?.tenantId).toBe('tenant-1');
        expect(current?.userId).toBe('user-1');
        return 'done';
      });

      expect(result).toBe('done');
    });

    it('should make context available during async execution', async () => {
      const ctx = createContext('tenant-async', 'user-1', ['write']);

      const result = await withTenantContext(ctx, async () => {
        // Simulate async work
        await new Promise((resolve) => setTimeout(resolve, 10));
        const current = getCurrentContext();
        expect(current?.tenantId).toBe('tenant-async');
        return 42;
      });

      expect(result).toBe(42);
    });

    it('should not leak context outside scope', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read']);

      withTenantContext(ctx, () => {
        expect(getCurrentContext()).toBeDefined();
      });

      expect(getCurrentContext()).toBeUndefined();
    });

    it('should support nested contexts', () => {
      const outerCtx = createContext('tenant-outer', undefined, ['read']);
      const innerCtx = createContext('tenant-inner', undefined, ['write']);

      withTenantContext(outerCtx, () => {
        expect(getCurrentContext()?.tenantId).toBe('tenant-outer');

        withTenantContext(innerCtx, () => {
          expect(getCurrentContext()?.tenantId).toBe('tenant-inner');
        });

        // Outer context restored
        expect(getCurrentContext()?.tenantId).toBe('tenant-outer');
      });
    });
  });

  describe('requireContext', () => {
    it('should return context when active', () => {
      const ctx = createContext('tenant-1');

      withTenantContext(ctx, () => {
        const current = requireContext();
        expect(current.tenantId).toBe('tenant-1');
      });
    });

    it('should throw when no context is active', () => {
      expect(() => requireContext()).toThrow('No tenant context is active');
    });
  });
});

// =============================================================================
// ISOLATION ENFORCER
// =============================================================================

describe('IsolationEnforcer', () => {
  describe('validateResourceAccess', () => {
    it('should allow same-tenant access', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read']);

      // Should not throw
      expect(() => validateResourceAccess(ctx, 'tenant-1')).not.toThrow();
    });

    it('should throw TenantIsolationError for cross-tenant access', () => {
      const ctx = createContext('tenant-1', 'user-1', ['read', 'write', 'admin']);

      expect(() => validateResourceAccess(ctx, 'tenant-2')).toThrow(TenantIsolationError);
      expect(() => validateResourceAccess(ctx, 'tenant-2')).toThrow(
        /tenant 'tenant-1' cannot access resources of tenant 'tenant-2'/
      );
    });

    it('should set error properties correctly', () => {
      const ctx = createContext('tenant-a', 'user-1', ['admin']);

      try {
        validateResourceAccess(ctx, 'tenant-b');
        expect.unreachable('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(TenantIsolationError);
        const error = e as TenantIsolationError;
        expect(error.requestingTenantId).toBe('tenant-a');
        expect(error.resourceTenantId).toBe('tenant-b');
      }
    });
  });

  describe('isolateExecution', () => {
    it('should provide tenant namespace prefix', async () => {
      const ctx = createContext('tenant-1', 'user-1', ['read']);

      const result = await isolateExecution(ctx, (prefix) => {
        expect(prefix).toBe('tenant:tenant-1:');
        return `${prefix}my-resource`;
      });

      expect(result).toBe('tenant:tenant-1:my-resource');
    });

    it('should support async functions', async () => {
      const ctx = createContext('tenant-1');

      const result = await isolateExecution(ctx, async (prefix) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return `${prefix}async-resource`;
      });

      expect(result).toBe('tenant:tenant-1:async-resource');
    });
  });

  describe('validateNamespace', () => {
    it('should accept valid tenant namespace', () => {
      const ctx = createContext('tenant-1');
      expect(() => validateNamespace(ctx, 'tenant:tenant-1:my-ns')).not.toThrow();
    });

    it('should reject namespace from another tenant', () => {
      const ctx = createContext('tenant-1');
      expect(() => validateNamespace(ctx, 'tenant:tenant-2:my-ns')).toThrow(TenantIsolationError);
    });

    it('should reject namespace without tenant prefix', () => {
      const ctx = createContext('tenant-1');
      expect(() => validateNamespace(ctx, 'bare-namespace')).toThrow(TenantIsolationError);
    });
  });

  describe('getIsolatedNamespace', () => {
    it('should return tenant-prefixed namespace', () => {
      const ctx = createContext('tenant-1');
      const ns = getIsolatedNamespace(ctx, 'scenes');

      expect(ns).toBe('tenant:tenant-1:scenes');
    });

    it('should produce different namespaces for different tenants', () => {
      const ctx1 = createContext('tenant-1');
      const ctx2 = createContext('tenant-2');

      const ns1 = getIsolatedNamespace(ctx1, 'scenes');
      const ns2 = getIsolatedNamespace(ctx2, 'scenes');

      expect(ns1).not.toBe(ns2);
    });
  });
});

// =============================================================================
// NAMESPACE MANAGER
// =============================================================================

describe('NamespaceManager', () => {
  let nsManager: NamespaceManager;

  beforeEach(() => {
    nsManager = new NamespaceManager();
  });

  describe('createNamespace', () => {
    it('should create a namespace for a tenant', () => {
      const ns = nsManager.createNamespace('tenant-1', 'scenes');

      expect(ns.tenantId).toBe('tenant-1');
      expect(ns.name).toBe('scenes');
      expect(ns.createdAt).toBeInstanceOf(Date);
      expect(ns.data.size).toBe(0);
    });

    it('should throw on duplicate namespace', () => {
      nsManager.createNamespace('tenant-1', 'scenes');

      expect(() => nsManager.createNamespace('tenant-1', 'scenes')).toThrow(
        "Namespace 'scenes' already exists for tenant 'tenant-1'"
      );
    });

    it('should allow same name for different tenants', () => {
      const ns1 = nsManager.createNamespace('tenant-1', 'scenes');
      const ns2 = nsManager.createNamespace('tenant-2', 'scenes');

      expect(ns1.tenantId).toBe('tenant-1');
      expect(ns2.tenantId).toBe('tenant-2');
    });

    it('should throw for empty tenant ID', () => {
      expect(() => nsManager.createNamespace('', 'scenes')).toThrow('tenantId is required');
    });

    it('should throw for empty name', () => {
      expect(() => nsManager.createNamespace('tenant-1', '')).toThrow('Namespace name is required');
    });
  });

  describe('getNamespace', () => {
    it('should retrieve an existing namespace', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      const ns = nsManager.getNamespace('tenant-1', 'scenes');

      expect(ns.name).toBe('scenes');
      expect(ns.tenantId).toBe('tenant-1');
    });

    it('should throw for non-existent namespace', () => {
      expect(() => nsManager.getNamespace('tenant-1', 'nope')).toThrow(
        "No namespaces found for tenant 'tenant-1'"
      );
    });

    it('should throw for existing tenant but wrong namespace', () => {
      nsManager.createNamespace('tenant-1', 'scenes');

      expect(() => nsManager.getNamespace('tenant-1', 'wrong')).toThrow(
        "Namespace 'wrong' not found for tenant 'tenant-1'"
      );
    });
  });

  describe('listNamespaces', () => {
    it('should list all namespaces for a tenant', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      nsManager.createNamespace('tenant-1', 'assets');
      nsManager.createNamespace('tenant-2', 'scenes');

      const list = nsManager.listNamespaces('tenant-1');
      expect(list).toHaveLength(2);
      expect(list.map((n) => n.name).sort()).toEqual(['assets', 'scenes']);
    });

    it('should return empty array for tenant with no namespaces', () => {
      const list = nsManager.listNamespaces('no-such-tenant');
      expect(list).toEqual([]);
    });

    it('should include data key count', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      nsManager.setNamespaceData('tenant-1', 'scenes', 'key1', 'value1');
      nsManager.setNamespaceData('tenant-1', 'scenes', 'key2', 'value2');

      const list = nsManager.listNamespaces('tenant-1');
      expect(list[0].dataKeyCount).toBe(2);
    });
  });

  describe('deleteNamespace', () => {
    it('should delete an existing namespace', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      nsManager.deleteNamespace('tenant-1', 'scenes');

      expect(nsManager.hasNamespace('tenant-1', 'scenes')).toBe(false);
    });

    it('should throw for non-existent namespace', () => {
      expect(() => nsManager.deleteNamespace('tenant-1', 'nope')).toThrow(
        "Namespace 'nope' not found for tenant 'tenant-1'"
      );
    });

    it('should clean up tenant map when last namespace is deleted', () => {
      nsManager.createNamespace('tenant-1', 'only-one');
      nsManager.deleteNamespace('tenant-1', 'only-one');

      // After deleting the only namespace, listing should return empty
      expect(nsManager.listNamespaces('tenant-1')).toEqual([]);
    });
  });

  describe('namespace data', () => {
    beforeEach(() => {
      nsManager.createNamespace('tenant-1', 'scenes');
      nsManager.createNamespace('tenant-2', 'scenes');
    });

    it('should set and get data in a namespace', () => {
      nsManager.setNamespaceData('tenant-1', 'scenes', 'hero', { x: 0, y: 1, z: -2 });
      const data = nsManager.getNamespaceData('tenant-1', 'scenes', 'hero');

      expect(data).toEqual({ x: 0, y: 1, z: -2 });
    });

    it('should return undefined for non-existent key', () => {
      const data = nsManager.getNamespaceData('tenant-1', 'scenes', 'nonexistent');
      expect(data).toBeUndefined();
    });

    it('should isolate data between tenants with same namespace name', () => {
      nsManager.setNamespaceData('tenant-1', 'scenes', 'hero', 'tenant-1-hero');
      nsManager.setNamespaceData('tenant-2', 'scenes', 'hero', 'tenant-2-hero');

      const data1 = nsManager.getNamespaceData('tenant-1', 'scenes', 'hero');
      const data2 = nsManager.getNamespaceData('tenant-2', 'scenes', 'hero');

      expect(data1).toBe('tenant-1-hero');
      expect(data2).toBe('tenant-2-hero');
      expect(data1).not.toBe(data2);
    });

    it('should overwrite existing data', () => {
      nsManager.setNamespaceData('tenant-1', 'scenes', 'key', 'value1');
      nsManager.setNamespaceData('tenant-1', 'scenes', 'key', 'value2');

      expect(nsManager.getNamespaceData('tenant-1', 'scenes', 'key')).toBe('value2');
    });

    it('should throw when setting data in non-existent namespace', () => {
      expect(() => nsManager.setNamespaceData('tenant-1', 'nonexistent', 'key', 'value')).toThrow(
        "Namespace 'nonexistent' not found"
      );
    });

    it('should throw when getting data from non-existent namespace', () => {
      expect(() => nsManager.getNamespaceData('tenant-1', 'nonexistent', 'key')).toThrow(
        "Namespace 'nonexistent' not found"
      );
    });
  });

  describe('hasNamespace', () => {
    it('should return true for existing namespace', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      expect(nsManager.hasNamespace('tenant-1', 'scenes')).toBe(true);
    });

    it('should return false for non-existent namespace', () => {
      expect(nsManager.hasNamespace('tenant-1', 'nope')).toBe(false);
    });

    it('should return false for different tenant with same namespace name', () => {
      nsManager.createNamespace('tenant-1', 'scenes');
      expect(nsManager.hasNamespace('tenant-2', 'scenes')).toBe(false);
    });
  });
});

// =============================================================================
// CROSS-TENANT ACCESS PREVENTION (INTEGRATION)
// =============================================================================

describe('Cross-Tenant Access Prevention', () => {
  let manager: TenantManager;
  let nsManager: NamespaceManager;

  beforeEach(() => {
    manager = new TenantManager();
    nsManager = new NamespaceManager();

    manager.createTenant({ id: 'alpha', name: 'Alpha Corp', plan: 'pro' });
    manager.createTenant({ id: 'beta', name: 'Beta Inc', plan: 'enterprise' });

    nsManager.createNamespace('alpha', 'projects');
    nsManager.createNamespace('beta', 'projects');
    nsManager.setNamespaceData('alpha', 'projects', 'secret', 'alpha-secret-data');
    nsManager.setNamespaceData('beta', 'projects', 'secret', 'beta-secret-data');
  });

  it('should prevent tenant alpha from accessing beta resources', () => {
    const alphaCtx = createContext('alpha', 'alice', ['read', 'write', 'admin']);

    expect(() => validateResourceAccess(alphaCtx, 'beta')).toThrow(TenantIsolationError);
  });

  it('should prevent tenant beta from accessing alpha namespaces', () => {
    const betaCtx = createContext('beta', 'bob', ['admin']);
    const alphaNamespace = getIsolatedNamespace(createContext('alpha'), 'projects');

    expect(() => validateNamespace(betaCtx, alphaNamespace)).toThrow(TenantIsolationError);
  });

  it('should allow tenants to access their own resources', () => {
    const alphaCtx = createContext('alpha', 'alice', ['read']);

    expect(() => validateResourceAccess(alphaCtx, 'alpha')).not.toThrow();

    const alphaNamespace = getIsolatedNamespace(alphaCtx, 'projects');
    expect(() => validateNamespace(alphaCtx, alphaNamespace)).not.toThrow();
  });

  it('should keep namespace data fully isolated', () => {
    const alphaData = nsManager.getNamespaceData('alpha', 'projects', 'secret');
    const betaData = nsManager.getNamespaceData('beta', 'projects', 'secret');

    expect(alphaData).toBe('alpha-secret-data');
    expect(betaData).toBe('beta-secret-data');
    expect(alphaData).not.toBe(betaData);
  });

  it('should enforce isolation in async context', async () => {
    const alphaCtx = createContext('alpha', 'alice', ['read']);

    await withTenantContext(alphaCtx, async () => {
      const current = getCurrentContext()!;
      expect(current.tenantId).toBe('alpha');

      // Can access own resources
      expect(() => validateResourceAccess(current, 'alpha')).not.toThrow();

      // Cannot access beta resources
      expect(() => validateResourceAccess(current, 'beta')).toThrow(TenantIsolationError);
    });
  });
});

// =============================================================================
// TENANT PLAN ENFORCEMENT
// =============================================================================

describe('Tenant Plan Enforcement', () => {
  let manager: TenantManager;

  beforeEach(() => {
    manager = new TenantManager();
  });

  it('should enforce free plan quotas', () => {
    const tenant = manager.createTenant({ name: 'Free User', plan: 'free' });

    expect(tenant.quotas.maxCompilationsPerHour).toBe(100);
    expect(tenant.quotas.maxProjectsPerTenant).toBe(3);
    expect(tenant.quotas.maxDeploymentsPerDay).toBe(5);
    expect(tenant.settings.maxUsers).toBe(1);
  });

  it('should enforce pro plan quotas', () => {
    const tenant = manager.createTenant({ name: 'Pro User', plan: 'pro' });

    expect(tenant.quotas.maxCompilationsPerHour).toBe(1000);
    expect(tenant.quotas.maxProjectsPerTenant).toBe(50);
    expect(tenant.quotas.maxDeploymentsPerDay).toBe(100);
    expect(tenant.settings.maxUsers).toBe(25);
  });

  it('should enforce enterprise plan quotas', () => {
    const tenant = manager.createTenant({ name: 'Enterprise User', plan: 'enterprise' });

    expect(tenant.quotas.maxCompilationsPerHour).toBe(10000);
    expect(tenant.quotas.maxProjectsPerTenant).toBe(500);
    expect(tenant.quotas.maxDeploymentsPerDay).toBe(1000);
    expect(tenant.settings.maxUsers).toBe(1000);
  });

  it('should restrict features based on plan', () => {
    const free = manager.createTenant({ name: 'Free', plan: 'free' });
    const pro = manager.createTenant({ name: 'Pro', plan: 'pro' });
    const enterprise = manager.createTenant({ name: 'Enterprise', plan: 'enterprise' });

    // Free: basic features only
    expect(free.settings.allowedFeatures).toContain('compile');
    expect(free.settings.allowedFeatures).toContain('preview');
    expect(free.settings.allowedFeatures).not.toContain('deploy');
    expect(free.settings.allowedFeatures).not.toContain('sso');

    // Pro: more features
    expect(pro.settings.allowedFeatures).toContain('deploy');
    expect(pro.settings.allowedFeatures).toContain('collaborate');
    expect(pro.settings.allowedFeatures).not.toContain('sso');

    // Enterprise: all features
    expect(enterprise.settings.allowedFeatures).toContain('sso');
    expect(enterprise.settings.allowedFeatures).toContain('audit-log');
    expect(enterprise.settings.allowedFeatures).toContain('priority-support');
  });

  it('should allow upgrading plan and verify new limits', () => {
    manager.createTenant({ id: 'upgrade', name: 'Upgrader', plan: 'free' });

    const beforeUpgrade = manager.getTenant('upgrade');
    expect(beforeUpgrade.plan).toBe('free');
    expect(beforeUpgrade.settings.maxUsers).toBe(1);

    const afterUpgrade = manager.updateTenant('upgrade', {
      plan: 'pro',
      settings: { maxUsers: 25, maxProjects: 50 },
    });

    expect(afterUpgrade.plan).toBe('pro');
    expect(afterUpgrade.settings.maxUsers).toBe(25);
    expect(afterUpgrade.settings.maxProjects).toBe(50);
  });
});
