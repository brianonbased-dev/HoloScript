import { describe, it, expect, beforeEach } from 'vitest';
import { MigrationManager } from '../MigrationManager';

describe('MigrationManager', () => {
  let mgr: MigrationManager;

  beforeEach(() => {
    mgr = new MigrationManager(3);
  });

  it('reports current version', () => {
    expect(mgr.getCurrentVersion()).toBe(3);
  });

  it('needsMigration returns true when version is old', () => {
    expect(mgr.needsMigration(1)).toBe(true);
    expect(mgr.needsMigration(3)).toBe(false);
    expect(mgr.needsMigration(5)).toBe(false);
  });

  it('registers migrations and sorts by fromVersion', () => {
    mgr.registerMigration({
      fromVersion: 2,
      toVersion: 3,
      migrate: (d) => d,
      description: 'v2→v3',
    });
    mgr.registerMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (d) => d,
      description: 'v1→v2',
    });
    expect(mgr.getMigrationCount()).toBe(2);
  });

  it('migrates data through a chain', () => {
    mgr.registerMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (d) => ({ ...d, upgraded: true }),
      description: 'Add upgraded flag',
    });
    mgr.registerMigration({
      fromVersion: 2,
      toVersion: 3,
      migrate: (d) => ({ ...d, version: 3 }),
      description: 'Set version 3',
    });

    const result = mgr.migrate({ name: 'test' }, 1);
    expect(result.version).toBe(3);
    expect(result.data).toEqual({ name: 'test', upgraded: true, version: 3 });
    expect(result.steps).toHaveLength(2);
  });

  it('returns original data when no migration needed', () => {
    const result = mgr.migrate({ x: 1 }, 3);
    expect(result.version).toBe(3);
    expect(result.data).toEqual({ x: 1 });
    expect(result.steps).toHaveLength(0);
  });

  it('stops at gap if migration is missing', () => {
    mgr.registerMigration({
      fromVersion: 1,
      toVersion: 2,
      migrate: (d) => ({ ...d, v2: true }),
      description: 'v1→v2',
    });
    // Missing v2→v3 migration
    const result = mgr.migrate({ x: 1 }, 1);
    expect(result.version).toBe(2);
    expect(result.data).toEqual({ x: 1, v2: true });
    expect(result.steps).toHaveLength(1);
  });

  it('getPath returns the version hop sequence', () => {
    mgr.registerMigration({ fromVersion: 1, toVersion: 2, migrate: (d) => d, description: 'a' });
    mgr.registerMigration({ fromVersion: 2, toVersion: 3, migrate: (d) => d, description: 'b' });
    expect(mgr.getPath(1)).toEqual([1, 2, 3]);
  });

  it('getPath stops at missing migration', () => {
    mgr.registerMigration({ fromVersion: 1, toVersion: 2, migrate: (d) => d, description: 'a' });
    expect(mgr.getPath(1)).toEqual([1, 2]);
  });
});
