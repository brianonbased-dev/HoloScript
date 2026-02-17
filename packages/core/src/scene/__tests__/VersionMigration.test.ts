/**
 * VersionMigration Unit Tests
 *
 * Tests schema migration pipeline, built-in migrations,
 * custom steps, version detection, and logging.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { VersionMigration, CURRENT_SCHEMA_VERSION } from '../VersionMigration';

describe('VersionMigration', () => {
  let vm: VersionMigration;

  beforeEach(() => {
    vm = new VersionMigration();
  });

  describe('built-in migrations', () => {
    it('should register 5 built-in migrations (v0–v5)', () => {
      expect(vm.getMigrationCount()).toBe(5);
    });

    it('should set current schema version to 5', () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(5);
    });
  });

  describe('needsMigration', () => {
    it('should return true for v0 data', () => {
      expect(vm.needsMigration({ version: 0 })).toBe(true);
    });

    it('should return true for data with no version', () => {
      expect(vm.needsMigration({})).toBe(true);
    });

    it('should return false for current-version data', () => {
      expect(vm.needsMigration({ version: CURRENT_SCHEMA_VERSION })).toBe(false);
    });
  });

  describe('getDataVersion', () => {
    it('should return version if present', () => {
      expect(vm.getDataVersion({ version: 3 })).toBe(3);
    });

    it('should return 0 if absent', () => {
      expect(vm.getDataVersion({})).toBe(0);
    });
  });

  describe('migrate', () => {
    it('should migrate v0 data to current version', () => {
      const data = { entities: [{ id: 42 }] };
      const result = vm.migrate(data);

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.stepsApplied.length).toBe(5);
      expect(result.data.version).toBe(CURRENT_SCHEMA_VERSION);
      expect(result.data.metadata).toBeDefined();
      expect(result.data.globals).toBeDefined();
    });

    it('should normalize entity IDs to strings (v1→v2)', () => {
      const data = { version: 0, entities: [{ id: 123 }] };
      const result = vm.migrate(data);
      const entities = result.data.entities as any[];
      expect(entities[0].id).toBe('123');
    });

    it('should add active flag to entities (v2→v3)', () => {
      const data = { version: 0, entities: [{ id: 'a' }] };
      const result = vm.migrate(data);
      const entities = result.data.entities as any[];
      expect(entities[0].active).toBe(true);
    });

    it('should add tags to entities (v4→v5)', () => {
      const data = { version: 0, entities: [{ id: 'a' }] };
      const result = vm.migrate(data);
      const entities = result.data.entities as any[];
      expect(Array.isArray(entities[0].tags)).toBe(true);
    });

    it('should no-op when already at target version', () => {
      const data = { version: CURRENT_SCHEMA_VERSION };
      const result = vm.migrate(data);
      expect(result.success).toBe(true);
      expect(result.stepsApplied).toEqual([]);
    });

    it('should handle migration errors gracefully', () => {
      vm.register({
        fromVersion: 100,
        toVersion: 101,
        name: 'boom',
        migrate: () => { throw new Error('fail'); },
      });
      const data = { version: 100 };
      const result = vm.migrate(data, 101);
      expect(result.success).toBe(false);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('custom migration steps', () => {
    it('should register and apply custom step', () => {
      vm.register({
        fromVersion: 5,
        toVersion: 6,
        name: 'add_custom_field',
        migrate: (data) => ({ ...data, customField: true }),
      });

      const data = { version: 5 };
      const result = vm.migrate(data, 6);
      expect(result.success).toBe(true);
      expect(result.data.customField).toBe(true);
      expect(result.data.version).toBe(6);
    });
  });

  describe('logging', () => {
    it('should log successful migrations', () => {
      vm.migrate({});
      const logs = vm.getLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].fromVersion).toBe(0);
      expect(logs[0].toVersion).toBe(CURRENT_SCHEMA_VERSION);
      expect(logs[0].dataHash).toBeTruthy();
    });

    it('should clear logs', () => {
      vm.migrate({});
      vm.clearLogs();
      expect(vm.getLogs()).toEqual([]);
    });
  });
});
