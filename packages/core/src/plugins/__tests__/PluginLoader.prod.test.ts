import { describe, it, expect } from 'vitest';
import {
  PluginLoader,
  PluginState,
  satisfiesSemver,
  parseSemver,
} from '../../plugins/PluginLoader';
import type { PluginManifest, PluginHooks } from '../../plugins/PluginLoader';

function makeManifest(
  id: string,
  version = '1.0.0',
  deps?: Record<string, string>
): PluginManifest {
  return { id, name: id, version, dependencies: deps };
}

describe('PluginLoader — Production Tests', () => {
  // ─── parseSemver ──────────────────────────────────────────────────────────
  describe('parseSemver()', () => {
    it('parses valid semver', () => {
      expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    });
    it('returns null for invalid', () => {
      expect(parseSemver('not-a-version')).toBeNull();
    });
    it('handles leading text (e.g. ^)', () => {
      expect(parseSemver('^2.0.0')).toBeNull(); // prefix not stripped by parseSemver
    });
  });

  // ─── satisfiesSemver ──────────────────────────────────────────────────────
  describe('satisfiesSemver()', () => {
    it('^1.2.0 satisfied by 1.3.0', () => {
      expect(satisfiesSemver('1.3.0', '^1.2.0')).toBe(true);
    });
    it('^1.2.0 NOT satisfied by 2.0.0', () => {
      expect(satisfiesSemver('2.0.0', '^1.2.0')).toBe(false);
    });
    it('~1.2.0 satisfied by 1.2.5', () => {
      expect(satisfiesSemver('1.2.5', '~1.2.0')).toBe(true);
    });
    it('~1.2.0 NOT satisfied by 1.3.0', () => {
      expect(satisfiesSemver('1.3.0', '~1.2.0')).toBe(false);
    });
    it('>=2.0.0 satisfied by 3.1.0', () => {
      expect(satisfiesSemver('3.1.0', '>=2.0.0')).toBe(true);
    });
    it('exact match 1.0.0 satisfied by 1.0.0', () => {
      expect(satisfiesSemver('1.0.0', '1.0.0')).toBe(true);
    });
    it('exact match 1.0.0 NOT satisfied by 1.0.1', () => {
      expect(satisfiesSemver('1.0.1', '1.0.0')).toBe(false);
    });
  });

  // ─── register() ───────────────────────────────────────────────────────────
  describe('register()', () => {
    it('registers a plugin', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('plugin-a'));
      expect(loader.getPluginIds()).toContain('plugin-a');
    });

    it('throws when same id registered twice', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('dup'));
      expect(() => loader.register(makeManifest('dup'))).toThrow('already registered');
    });

    it('plugin starts in LOADED state', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'));
      expect(loader.getPlugin('p')!.state).toBe(PluginState.LOADED);
    });

    it('stores loadedAt timestamp', () => {
      const loader = new PluginLoader();
      const before = Date.now();
      loader.register(makeManifest('ts'));
      expect(loader.getPlugin('ts')!.loadedAt).toBeGreaterThanOrEqual(before);
    });
  });

  // ─── resolveDependencies() ────────────────────────────────────────────────
  describe('resolveDependencies()', () => {
    it('returns topologically sorted order', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('base'));
      loader.register(makeManifest('feature', '1.0.0', { base: '^1.0.0' }));
      loader.register(makeManifest('ui', '1.0.0', { feature: '^1.0.0', base: '^1.0.0' }));
      const order = loader.resolveDependencies();
      expect(order.indexOf('base')).toBeLessThan(order.indexOf('feature'));
      expect(order.indexOf('feature')).toBeLessThan(order.indexOf('ui'));
    });

    it('throws on missing dependency', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p', '1.0.0', { missing: '^1.0.0' }));
      expect(() => loader.resolveDependencies()).toThrow('not registered');
    });

    it('throws on circular dependency', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('a', '1.0.0', { b: '^1.0.0' }));
      loader.register(makeManifest('b', '1.0.0', { a: '^1.0.0' }));
      expect(() => loader.resolveDependencies()).toThrow('Circular dependency');
    });

    it('throws when version constraint is not satisfied', () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('core', '1.0.0'));
      loader.register(makeManifest('ext', '1.0.0', { core: '^2.0.0' }));
      expect(() => loader.resolveDependencies()).toThrow('requires');
    });
  });

  // ─── initializeAll() / startAll() / stopAll() / destroyAll() ─────────────
  describe('plugin lifecycle', () => {
    it('initializes plugins to INITIALIZED state', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'));
      await loader.initializeAll();
      expect(loader.getPlugin('p')!.state).toBe(PluginState.INITIALIZED);
    });

    it('calls onInit hook', async () => {
      const loader = new PluginLoader();
      let called = false;
      loader.register(makeManifest('p'), {
        onInit: async () => {
          called = true;
        },
      });
      await loader.initializeAll();
      expect(called).toBe(true);
    });

    it('starts plugins to STARTED state', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'));
      await loader.initializeAll();
      await loader.startAll();
      expect(loader.getPlugin('p')!.state).toBe(PluginState.STARTED);
    });

    it('calls onStart hook', async () => {
      const loader = new PluginLoader();
      let started = false;
      loader.register(makeManifest('p'), {
        onStart: async () => {
          started = true;
        },
      });
      await loader.initializeAll();
      await loader.startAll();
      expect(started).toBe(true);
    });

    it('stops plugins to STOPPED state', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'));
      await loader.initializeAll();
      await loader.startAll();
      await loader.stopAll();
      expect(loader.getPlugin('p')!.state).toBe(PluginState.STOPPED);
    });

    it('destroyAll() sets all to UNLOADED and clears registry', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'));
      await loader.initializeAll();
      await loader.destroyAll();
      expect(loader.getPluginIds().length).toBe(0);
    });

    it('init error sets plugin to ERROR state', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('p'), {
        onInit: async () => {
          throw new Error('bad init');
        },
      });
      await loader.initializeAll();
      const plugin = loader.getPlugin('p')!;
      expect(plugin.state).toBe(PluginState.ERROR);
      expect(plugin.error).toBe('bad init');
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────
  describe('update()', () => {
    it('calls onUpdate for STARTED plugins', async () => {
      const loader = new PluginLoader();
      const deltas: number[] = [];
      loader.register(makeManifest('p'), { onUpdate: (dt) => deltas.push(dt) });
      await loader.initializeAll();
      await loader.startAll();
      loader.update(0.016);
      expect(deltas).toContain(0.016);
    });

    it('does not call onUpdate for INITIALIZED plugins', async () => {
      const loader = new PluginLoader();
      const deltas: number[] = [];
      loader.register(makeManifest('p'), { onUpdate: (dt) => deltas.push(dt) });
      await loader.initializeAll(); // not started
      loader.update(0.016);
      expect(deltas.length).toBe(0);
    });
  });

  // ─── getStats() ───────────────────────────────────────────────────────────
  describe('getStats()', () => {
    it('returns correct counts by state', async () => {
      const loader = new PluginLoader();
      loader.register(makeManifest('a'));
      loader.register(makeManifest('b'));
      await loader.initializeAll();
      const stats = loader.getStats();
      expect(stats[PluginState.INITIALIZED]).toBe(2);
      expect(stats[PluginState.LOADED]).toBe(0);
    });
  });
});
