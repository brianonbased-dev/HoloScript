/**
 * TenantManager — Production Test Suite
 *
 * Pure CPU logic: CRUD operations, plan-based defaults, quota/settings merging,
 * validation errors, custom store injection.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  TenantManager,
  type CreateTenantConfig,
  type Tenant,
  type TenantStore,
} from '../TenantManager';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mgr() { return new TenantManager(); }

function create(tm: TenantManager, overrides: Partial<CreateTenantConfig> = {}): Tenant {
  return tm.createTenant({ name: 'Acme Corp', ...overrides });
}

// ─── construction ─────────────────────────────────────────────────────────────

describe('TenantManager — construction', () => {
  it('creates without error (no store arg)', () => expect(() => mgr()).not.toThrow());
  it('starts empty — hasTenant returns false', () => expect(mgr().hasTenant('x')).toBe(false));
  it('starts empty — listTenants returns []', () => expect(mgr().listTenants()).toHaveLength(0));
  it('accepts custom store', () => {
    const store = new Map<string, Tenant>();
    expect(() => new TenantManager(store)).not.toThrow();
  });
});

// ─── createTenant — plan defaults ────────────────────────────────────────────

describe('TenantManager — createTenant plan defaults', () => {
  it('defaults to free plan', () => {
    expect(create(mgr()).plan).toBe('free');
  });
  it('free: maxCompilationsPerHour = 100', () => {
    expect(create(mgr()).quotas.maxCompilationsPerHour).toBe(100);
  });
  it('free: maxProjectsPerTenant = 3', () => {
    expect(create(mgr()).quotas.maxProjectsPerTenant).toBe(3);
  });
  it('free: allowedFeatures includes compile + preview', () => {
    const f = create(mgr()).settings.allowedFeatures;
    expect(f).toContain('compile');
    expect(f).toContain('preview');
  });
  it('free: maxUsers = 1', () => {
    expect(create(mgr()).settings.maxUsers).toBe(1);
  });
  it('pro: maxCompilationsPerHour = 1000', () => {
    expect(create(mgr(), { plan: 'pro' }).quotas.maxCompilationsPerHour).toBe(1000);
  });
  it('pro: maxUsers = 25', () => {
    expect(create(mgr(), { plan: 'pro' }).settings.maxUsers).toBe(25);
  });
  it('pro: allowedFeatures includes deploy', () => {
    expect(create(mgr(), { plan: 'pro' }).settings.allowedFeatures).toContain('deploy');
  });
  it('enterprise: maxCompilationsPerHour = 10000', () => {
    expect(create(mgr(), { plan: 'enterprise' }).quotas.maxCompilationsPerHour).toBe(10000);
  });
  it('enterprise: maxUsers = 1000', () => {
    expect(create(mgr(), { plan: 'enterprise' }).settings.maxUsers).toBe(1000);
  });
  it('enterprise: allowedFeatures includes sso + audit-log + custom-domain', () => {
    const f = create(mgr(), { plan: 'enterprise' }).settings.allowedFeatures;
    expect(f).toContain('sso');
    expect(f).toContain('audit-log');
    expect(f).toContain('custom-domain');
  });
});

// ─── createTenant — quota/settings overrides ─────────────────────────────────

describe('TenantManager — createTenant overrides', () => {
  it('quota override applied on top of plan defaults', () => {
    const t = create(mgr(), { quotas: { maxCompilationsPerHour: 999 } });
    expect(t.quotas.maxCompilationsPerHour).toBe(999);
    expect(t.quotas.maxProjectsPerTenant).toBe(3); // other defaults intact
  });
  it('settings override applied on top of plan defaults', () => {
    const t = create(mgr(), { settings: { maxUsers: 5 } });
    expect(t.settings.maxUsers).toBe(5);
  });
  it('metadata stored when provided', () => {
    const t = create(mgr(), { metadata: { region: 'eu-west' } });
    expect(t.metadata.region).toBe('eu-west');
  });
  it('metadata defaults to empty object', () => {
    expect(create(mgr()).metadata).toEqual({});
  });
  it('custom id is used when provided', () => {
    const t = create(mgr(), { id: 'my-custom-id' });
    expect(t.id).toBe('my-custom-id');
  });
  it('name is trimmed', () => {
    const t = create(mgr(), { name: '  Acme  ' });
    expect(t.name).toBe('Acme');
  });
  it('createdAt is a Date', () => {
    expect(create(mgr()).createdAt).toBeInstanceOf(Date);
  });
});

// ─── createTenant — validation errors ────────────────────────────────────────

describe('TenantManager — createTenant validation', () => {
  it('throws on empty name', () => {
    expect(() => create(mgr(), { name: '' })).toThrow('Tenant name is required');
  });
  it('throws on whitespace-only name', () => {
    expect(() => create(mgr(), { name: '   ' })).toThrow('Tenant name is required');
  });
  it('throws on duplicate custom id', () => {
    const tm = mgr();
    create(tm, { id: 'dup' });
    expect(() => create(tm, { id: 'dup' })).toThrow("already exists");
  });
  it('auto-generated ids are unique across two tenants', () => {
    const tm = mgr();
    const a = create(tm, { name: 'A' });
    const b = create(tm, { name: 'B' });
    expect(a.id).not.toBe(b.id);
  });
});

// ─── getTenant ────────────────────────────────────────────────────────────────

describe('TenantManager — getTenant', () => {
  it('returns created tenant', () => {
    const tm = mgr();
    const t = create(tm, { id: 'abc' });
    expect(tm.getTenant('abc').id).toBe('abc');
    expect(tm.getTenant('abc').name).toBe(t.name);
  });
  it('throws on missing id', () => {
    expect(() => mgr().getTenant('nope')).toThrow("nope' not found");
  });
});

// ─── hasTenant ───────────────────────────────────────────────────────────────

describe('TenantManager — hasTenant', () => {
  it('returns true after create', () => {
    const tm = mgr();
    const t = create(tm);
    expect(tm.hasTenant(t.id)).toBe(true);
  });
  it('returns false for unknown id', () => {
    expect(mgr().hasTenant('ghost')).toBe(false);
  });
  it('returns false after delete', () => {
    const tm = mgr();
    create(tm, { id: 'x' });
    tm.deleteTenant('x');
    expect(tm.hasTenant('x')).toBe(false);
  });
});

// ─── updateTenant ─────────────────────────────────────────────────────────────

describe('TenantManager — updateTenant', () => {
  it('updates name', () => {
    const tm = mgr();
    create(tm, { id: 't1' });
    const u = tm.updateTenant('t1', { name: 'NewName' });
    expect(u.name).toBe('NewName');
  });
  it('updates plan', () => {
    const tm = mgr();
    create(tm, { id: 't1' });
    const u = tm.updateTenant('t1', { plan: 'pro' });
    expect(u.plan).toBe('pro');
  });
  it('partial quota update preserves other fields', () => {
    const tm = mgr();
    create(tm, { id: 't1' });
    const orig = tm.getTenant('t1').quotas.maxProjectsPerTenant;
    const u = tm.updateTenant('t1', { quotas: { maxCompilationsPerHour: 777 } });
    expect(u.quotas.maxCompilationsPerHour).toBe(777);
    expect(u.quotas.maxProjectsPerTenant).toBe(orig); // preserved
  });
  it('partial settings update preserves other fields', () => {
    const tm = mgr();
    create(tm, { id: 't1' });
    const u = tm.updateTenant('t1', { settings: { maxUsers: 42 } });
    expect(u.settings.maxUsers).toBe(42);
    expect(u.settings.maxProjects).toBeGreaterThan(0); // preserved
  });
  it('metadata merges (not replaces)', () => {
    const tm = mgr();
    create(tm, { id: 't1', metadata: { a: 1 } });
    const u = tm.updateTenant('t1', { metadata: { b: 2 } });
    expect(u.metadata.a).toBe(1);
    expect(u.metadata.b).toBe(2);
  });
  it('get after update reflects new values', () => {
    const tm = mgr();
    create(tm, { id: 't1' });
    tm.updateTenant('t1', { name: 'Updated' });
    expect(tm.getTenant('t1').name).toBe('Updated');
  });
  it('throws on missing tenant', () => {
    expect(() => mgr().updateTenant('nope', { name: 'x' })).toThrow();
  });
  it('no-op update returns same tenant', () => {
    const tm = mgr();
    const t = create(tm, { id: 't1' });
    const u = tm.updateTenant('t1', {});
    expect(u.name).toBe(t.name);
    expect(u.plan).toBe(t.plan);
  });
});

// ─── deleteTenant ─────────────────────────────────────────────────────────────

describe('TenantManager — deleteTenant', () => {
  it('removes tenant from store', () => {
    const tm = mgr();
    create(tm, { id: 'del' });
    tm.deleteTenant('del');
    expect(tm.hasTenant('del')).toBe(false);
  });
  it('listTenants no longer includes deleted tenant', () => {
    const tm = mgr();
    create(tm, { id: 'del' });
    tm.deleteTenant('del');
    expect(tm.listTenants().map(t => t.id)).not.toContain('del');
  });
  it('throws on missing tenant', () => {
    expect(() => mgr().deleteTenant('ghost')).toThrow("ghost' not found");
  });
});

// ─── listTenants ──────────────────────────────────────────────────────────────

describe('TenantManager — listTenants', () => {
  it('returns all tenants when no filter', () => {
    const tm = mgr();
    create(tm, { name: 'A' }); create(tm, { name: 'B' }); create(tm, { name: 'C' });
    expect(tm.listTenants()).toHaveLength(3);
  });
  it('filters by plan = free', () => {
    const tm = mgr();
    create(tm, { name: 'Free1', plan: 'free' });
    create(tm, { name: 'Pro1', plan: 'pro' });
    const free = tm.listTenants({ plan: 'free' });
    expect(free).toHaveLength(1);
    expect(free[0].name).toBe('Free1');
  });
  it('filters by plan = enterprise', () => {
    const tm = mgr();
    create(tm, { name: 'E', plan: 'enterprise' });
    create(tm, { name: 'F', plan: 'free' });
    expect(tm.listTenants({ plan: 'enterprise' })).toHaveLength(1);
  });
  it('filter with no match returns []', () => {
    const tm = mgr();
    create(tm, { name: 'A', plan: 'free' });
    expect(tm.listTenants({ plan: 'enterprise' })).toHaveLength(0);
  });
  it('no filter returns all plans mixed', () => {
    const tm = mgr();
    create(tm, { name: 'F', plan: 'free' });
    create(tm, { name: 'P', plan: 'pro' });
    create(tm, { name: 'E', plan: 'enterprise' });
    expect(tm.listTenants()).toHaveLength(3);
  });
});

// ─── custom store injection ───────────────────────────────────────────────────

describe('TenantManager — custom store', () => {
  it('uses provided Map as store', () => {
    const store = new Map<string, Tenant>();
    const tm = new TenantManager(store);
    const t = tm.createTenant({ id: 'custom', name: 'Store Test' });
    expect(store.has('custom')).toBe(true);
    expect(store.get('custom')!.name).toBe(t.name);
  });
  it('pre-populated store is visible to manager', () => {
    const store = new Map<string, Tenant>();
    const sentinel: Tenant = {
      id: 'pre',
      name: 'Pre-existing',
      plan: 'pro',
      quotas: { maxCompilationsPerHour: 0, maxStorageBytes: 0, maxProjectsPerTenant: 0, maxDeploymentsPerDay: 0 },
      settings: { maxUsers: 0, maxProjects: 0, maxStorageBytes: 0, allowedFeatures: [] },
      createdAt: new Date(),
      metadata: {},
    };
    store.set('pre', sentinel);
    const tm = new TenantManager(store);
    expect(tm.hasTenant('pre')).toBe(true);
    expect(tm.getTenant('pre').name).toBe('Pre-existing');
  });
});
