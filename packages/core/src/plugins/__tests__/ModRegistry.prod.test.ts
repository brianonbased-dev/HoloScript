/**
 * ModRegistry Production Tests
 *
 * Mod registration, enable/disable, priority, load order, validation,
 * conflict detection, discovery, and dependents.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ModRegistry } from '../ModRegistry';

const manifest = (id: string, version = '1.0.0', deps: Record<string, string> = {}) => ({
  id,
  name: id,
  version,
  entry: `${id}.js`,
  permissions: [] as any[],
  dependencies: deps,
});

describe('ModRegistry — Production', () => {
  let reg: ModRegistry;

  beforeEach(() => {
    reg = new ModRegistry();
  });

  describe('register / unregister', () => {
    it('registers a mod', () => {
      reg.register(manifest('modA'));
      expect(reg.getCount()).toBe(1);
    });

    it('throws on duplicate registration', () => {
      reg.register(manifest('modA'));
      expect(() => reg.register(manifest('modA'))).toThrow();
    });

    it('unregisters a mod', () => {
      reg.register(manifest('modA'));
      expect(reg.unregister('modA')).toBe(true);
      expect(reg.getCount()).toBe(0);
    });
  });

  describe('enable / disable', () => {
    it('toggles enabled state', () => {
      reg.register(manifest('modA'));
      reg.disable('modA');
      expect(reg.getEnabledCount()).toBe(0);
      reg.enable('modA');
      expect(reg.getEnabledCount()).toBe(1);
    });

    it('throws for missing mod', () => {
      expect(() => reg.enable('missing')).toThrow();
    });
  });

  describe('getLoadOrder', () => {
    it('sorts by priority ascending', () => {
      reg.register(manifest('modA'), { priority: 2 });
      reg.register(manifest('modB'), { priority: 1 });
      const order = reg.getLoadOrder();
      expect(order[0].manifest.id).toBe('modB');
      expect(order[1].manifest.id).toBe('modA');
    });

    it('excludes disabled mods', () => {
      reg.register(manifest('modA'));
      reg.register(manifest('modB'), { enabled: false });
      expect(reg.getLoadOrder()).toHaveLength(1);
    });
  });

  describe('validate', () => {
    it('passes with no issues', () => {
      reg.register(manifest('modA'));
      const result = reg.validate();
      expect(result.valid).toBe(true);
    });

    it('reports missing dependency', () => {
      reg.register(manifest('modA', '1.0.0', { modB: '>=1.0.0' }));
      const result = reg.validate();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('conflict rules', () => {
    it('detects conflicts', () => {
      reg.register(manifest('physics-engine'));
      reg.register(manifest('physics-override'));
      reg.addConflictRule('physics-engine', 'physics-override', 'Incompatible physics');
      const result = reg.validate();
      expect(result.conflicts).toHaveLength(1);
    });
  });

  describe('discoverFromManifests', () => {
    it('registers new mods from manifests', () => {
      const count = reg.discoverFromManifests([manifest('a'), manifest('b')]);
      expect(count).toBe(2);
      expect(reg.getCount()).toBe(2);
    });

    it('skips already-registered', () => {
      reg.register(manifest('a'));
      const count = reg.discoverFromManifests([manifest('a'), manifest('b')]);
      expect(count).toBe(1);
    });
  });

});

