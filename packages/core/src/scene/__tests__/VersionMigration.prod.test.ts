/**
 * VersionMigration — production test suite
 *
 * Tests: register, needsMigration, getDataVersion, migrate
 * (single/multi-step/partial/error), built-in migration chain v0→v5,
 * log management, and clearLogs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VersionMigration, CURRENT_SCHEMA_VERSION } from '../VersionMigration';

// ─── Suite ───────────────────────────────────────────────────────────────────

describe('VersionMigration: production', () => {
  let vm: VersionMigration;

  beforeEach(() => {
    vm = new VersionMigration();
  });

  // ─── Constants ───────────────────────────────────────────────────────────
  describe('CURRENT_SCHEMA_VERSION', () => {
    it('exports a positive CURRENT_SCHEMA_VERSION', () => {
      expect(CURRENT_SCHEMA_VERSION).toBeGreaterThan(0);
    });
  });

  // ─── Registration ─────────────────────────────────────────────────────────
  describe('register / getMigrationCount / getMigrations', () => {
    it('constructor registers built-in migrations', () => {
      expect(vm.getMigrationCount()).toBeGreaterThanOrEqual(CURRENT_SCHEMA_VERSION);
    });

    it('custom migration is registered', () => {
      const before = vm.getMigrationCount();
      vm.register({ fromVersion: 99, toVersion: 100, name: 'custom', migrate: (d) => d });
      expect(vm.getMigrationCount()).toBe(before + 1);
    });

    it('getMigrations returns sorted array', () => {
      const steps = vm.getMigrations();
      for (let i = 1; i < steps.length; i++) {
        expect(steps[i].fromVersion).toBeGreaterThanOrEqual(steps[i - 1].fromVersion);
      }
    });
  });

  // ─── needsMigration / getDataVersion ──────────────────────────────────────
  describe('needsMigration / getDataVersion', () => {
    it('returns true for data at v0', () => {
      expect(vm.needsMigration({ version: 0 })).toBe(true);
    });

    it('returns false for data at current version', () => {
      expect(vm.needsMigration({ version: CURRENT_SCHEMA_VERSION })).toBe(false);
    });

    it('returns true for data with no version field', () => {
      expect(vm.needsMigration({})).toBe(true);
    });

    it('getDataVersion returns version number', () => {
      expect(vm.getDataVersion({ version: 3 })).toBe(3);
    });

    it('getDataVersion returns 0 for missing version', () => {
      expect(vm.getDataVersion({})).toBe(0);
    });
  });

  // ─── Built-in migration chain v0→v5 ──────────────────────────────────────
  describe('built-in migrations (v0 → v5)', () => {
    it('migrates v0 data to current version', () => {
      const result = vm.migrate({ version: 0, entities: [] });
      expect(result.success).toBe(true);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('v0→v1 adds metadata field', () => {
      const result = vm.migrate({ version: 0, entities: [] }, 1);
      expect((result.data as any).metadata).toBeDefined();
    });

    it('v1→v2 normalizes entity IDs to strings', () => {
      const result = vm.migrate({ version: 1, entities: [{ id: 42 }] }, 2);
      const entities = (result.data as any).entities;
      expect(typeof entities[0].id).toBe('string');
    });

    it('v2→v3 adds active flag to entities', () => {
      const result = vm.migrate({ version: 2, entities: [{ id: 'e1' }] }, 3);
      const entities = (result.data as any).entities;
      expect(entities[0].active).toBe(true);
    });

    it('v3→v4 adds globals field', () => {
      const result = vm.migrate({ version: 3, entities: [] }, 4);
      expect((result.data as any).globals).toBeDefined();
    });

    it('v4→v5 adds tags array to entities', () => {
      const result = vm.migrate({ version: 4, entities: [{ id: 'e1' }] }, 5);
      const entities = (result.data as any).entities;
      expect(Array.isArray(entities[0].tags)).toBe(true);
    });

    it('full chain v0→v5 has 5 steps applied', () => {
      const result = vm.migrate({ version: 0, entities: [] });
      expect(result.stepsApplied.length).toBe(5);
    });
  });

  // ─── Already at target ───────────────────────────────────────────────────
  describe('migrate (no-op cases)', () => {
    it('returns success with no steps when already at target', () => {
      const data = { version: CURRENT_SCHEMA_VERSION };
      const result = vm.migrate(data);
      expect(result.success).toBe(true);
      expect(result.stepsApplied.length).toBe(0);
    });

    it('returns the same data object when up-to-date', () => {
      const data = { version: CURRENT_SCHEMA_VERSION, name: 'test' };
      const result = vm.migrate(data);
      expect(result.data.name).toBe('test');
    });
  });

  // ─── Custom migration ─────────────────────────────────────────────────────
  describe('custom migration step', () => {
    it('applies a single custom migration step', () => {
      vm.register({
        fromVersion: 10,
        toVersion: 11,
        name: 'add-foo',
        migrate: (d) => ({ ...d, foo: 'bar' }),
      });
      const result = vm.migrate({ version: 10 }, 11);
      expect(result.success).toBe(true);
      expect((result.data as any).foo).toBe('bar');
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────
  describe('migration error handling', () => {
    it('returns success=false when migration throws', () => {
      vm.register({
        fromVersion: 20,
        toVersion: 21,
        name: 'crasher',
        migrate: () => {
          throw new Error('migration failed');
        },
      });
      const result = vm.migrate({ version: 20 }, 21);
      expect(result.success).toBe(false);
      expect(result.warnings.some((w) => w.includes('migration failed'))).toBe(true);
    });
  });

  // ─── Logs ────────────────────────────────────────────────────────────────
  describe('getLogs / clearLogs', () => {
    it('starts with empty logs', () => {
      expect(vm.getLogs().length).toBe(0);
    });

    it('logs a migration entry', () => {
      vm.migrate({ version: 0, entities: [] });
      expect(vm.getLogs().length).toBe(1);
    });

    it('log contains from/to version', () => {
      vm.migrate({ version: 0, entities: [] });
      const log = vm.getLogs()[0];
      expect(log.fromVersion).toBe(0);
      expect(log.toVersion).toBe(CURRENT_SCHEMA_VERSION);
    });

    it('log contains dataHash', () => {
      vm.migrate({ version: 0, entities: [] });
      expect(vm.getLogs()[0].dataHash).toBeTruthy();
    });

    it('clearLogs empties the log', () => {
      vm.migrate({ version: 0, entities: [] });
      vm.clearLogs();
      expect(vm.getLogs().length).toBe(0);
    });
  });
});
