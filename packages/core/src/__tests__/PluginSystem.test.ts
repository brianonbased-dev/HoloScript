import { describe, it, expect, beforeEach } from 'vitest';
import { PluginLoader, PluginState, satisfiesSemver } from '../plugins/PluginLoader';
import { PluginAPI } from '../plugins/PluginAPI';
import { ModRegistry } from '../plugins/ModRegistry';

describe('Plugin & Modding System (Cycle 168)', () => {
  // ===========================================================================
  // PluginLoader
  // ===========================================================================
  describe('PluginLoader', () => {
    let loader: PluginLoader;

    beforeEach(() => {
      loader = new PluginLoader();
    });

    it('should register and track plugins', () => {
      loader.register({ id: 'a', name: 'A', version: '1.0.0' });
      loader.register({ id: 'b', name: 'B', version: '2.0.0' });
      expect(loader.getPluginIds()).toEqual(['a', 'b']);
      expect(loader.getPlugin('a')?.state).toBe(PluginState.LOADED);
    });

    it('should reject duplicate registration', () => {
      loader.register({ id: 'dup', name: 'Dup', version: '1.0.0' });
      expect(() => loader.register({ id: 'dup', name: 'Dup2', version: '1.0.0' })).toThrow(
        'already registered'
      );
    });

    it('should resolve dependency order', () => {
      loader.register({ id: 'core', name: 'Core', version: '1.0.0' });
      loader.register({
        id: 'ui',
        name: 'UI',
        version: '1.0.0',
        dependencies: { core: '^1.0.0' },
      });
      loader.register({
        id: 'theme',
        name: 'Theme',
        version: '1.0.0',
        dependencies: { ui: '^1.0.0' },
      });

      const order = loader.resolveDependencies();
      expect(order.indexOf('core')).toBeLessThan(order.indexOf('ui'));
      expect(order.indexOf('ui')).toBeLessThan(order.indexOf('theme'));
    });

    it('should detect circular dependencies', () => {
      loader.register({ id: 'a', name: 'A', version: '1.0.0', dependencies: { b: '^1.0.0' } });
      loader.register({ id: 'b', name: 'B', version: '1.0.0', dependencies: { a: '^1.0.0' } });
      expect(() => loader.resolveDependencies()).toThrow('Circular dependency');
    });

    it('should run full lifecycle (init → start → stop → destroy)', async () => {
      const log: string[] = [];
      loader.register(
        { id: 'test', name: 'Test', version: '1.0.0' },
        {
          onInit: () => {
            log.push('init');
          },
          onStart: () => {
            log.push('start');
          },
          onStop: () => {
            log.push('stop');
          },
          onDestroy: () => {
            log.push('destroy');
          },
        }
      );

      loader.resolveDependencies();
      await loader.initializeAll();
      expect(loader.getPlugin('test')?.state).toBe(PluginState.INITIALIZED);

      await loader.startAll();
      expect(loader.getPlugin('test')?.state).toBe(PluginState.STARTED);

      await loader.stopAll();
      expect(loader.getPlugin('test')?.state).toBe(PluginState.STOPPED);

      await loader.destroyAll();
      expect(log).toEqual(['init', 'start', 'stop', 'destroy']);
    });

    it('should update started plugins', () => {
      let ticks = 0;
      loader.register(
        { id: 'ticker', name: 'Ticker', version: '1.0.0' },
        {
          onUpdate: () => {
            ticks++;
          },
        }
      );

      // Only STARTED plugins get updated
      loader.update(0.016);
      expect(ticks).toBe(0); // Not started yet — should be LOADED state only
    });

    it('should provide stats', () => {
      loader.register({ id: 'a', name: 'A', version: '1.0.0' });
      loader.register({ id: 'b', name: 'B', version: '1.0.0' });
      const stats = loader.getStats();
      expect(stats[PluginState.LOADED]).toBe(2);
      expect(stats[PluginState.STARTED]).toBe(0);
    });
  });

  // ===========================================================================
  // Semver
  // ===========================================================================
  describe('Semver', () => {
    it('should validate ^X.Y.Z (caret range)', () => {
      expect(satisfiesSemver('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfiesSemver('1.5.0', '^1.2.0')).toBe(true);
      expect(satisfiesSemver('2.0.0', '^1.0.0')).toBe(false);
      expect(satisfiesSemver('0.9.0', '^1.0.0')).toBe(false);
    });

    it('should validate ~X.Y.Z (tilde range)', () => {
      expect(satisfiesSemver('1.2.5', '~1.2.3')).toBe(true);
      expect(satisfiesSemver('1.3.0', '~1.2.3')).toBe(false);
    });

    it('should validate >=X.Y.Z', () => {
      expect(satisfiesSemver('2.0.0', '>=1.0.0')).toBe(true);
      expect(satisfiesSemver('1.0.0', '>=1.0.0')).toBe(true);
      expect(satisfiesSemver('0.9.0', '>=1.0.0')).toBe(false);
    });

    it('should validate exact match', () => {
      expect(satisfiesSemver('1.0.0', '1.0.0')).toBe(true);
      expect(satisfiesSemver('1.0.1', '1.0.0')).toBe(false);
    });
  });

  // ===========================================================================
  // PluginAPI
  // ===========================================================================
  describe('PluginAPI', () => {
    let api: PluginAPI;

    beforeEach(() => {
      api = new PluginAPI({
        pluginId: 'test-plugin',
        permissions: ['scene:read', 'scene:write', 'filesystem:read'],
      });
    });

    it('should check permissions', () => {
      expect(api.hasPermission('scene:read')).toBe(true);
      expect(api.hasPermission('network:connect')).toBe(false);
    });

    it('should manage events', () => {
      let received: unknown = null;
      api.on('test:event', (payload) => {
        received = payload;
      });
      api.emit('test:event', { data: 42 });
      expect(received).toEqual({ data: 42 });
    });

    it('should register and execute commands', () => {
      api.registerCommand({
        id: 'greet',
        name: 'Greet',
        handler: (name: unknown) => `Hello, ${name}!`,
      });
      expect(api.executeCommand('greet', 'World')).toBe('Hello, World!');
    });

    it('should manage isolated state', () => {
      api.setState('count', 42);
      expect(api.getState('count')).toBe(42);
      expect(api.getStateKeys()).toEqual(['count']);
    });

    it('should register assets with permission check', () => {
      api.registerAsset({ id: 'tex1', type: 'texture', path: '/textures/brick.png' });
      expect(api.getAssetCount()).toBe(1);
      expect(api.getAsset('tex1')?.pluginId).toBe('test-plugin');
    });

    it('should reject asset registration without permission', () => {
      const restrictedApi = new PluginAPI({ pluginId: 'no-fs', permissions: [] });
      expect(() =>
        restrictedApi.registerAsset({ id: 'x', type: 'texture', path: '/x.png' })
      ).toThrow('lacks permission');
    });

    it('should cleanup all registrations', () => {
      api.on('ev', () => {});
      api.registerAsset({ id: 'a', type: 'data', path: '/a' });
      api.registerCommand({ id: 'cmd', name: 'Cmd', handler: () => {} });
      api.setState('key', 'val');

      api.cleanup();

      expect(api.getEventHandlers('test-plugin')).toHaveLength(0);
      expect(api.getAssetCount()).toBe(0);
      expect(api.getCommands()).toHaveLength(0);
      expect(api.getStateKeys()).toHaveLength(0);
    });
  });

  // ===========================================================================
  // ModRegistry
  // ===========================================================================
  describe('ModRegistry', () => {
    let registry: ModRegistry;

    beforeEach(() => {
      registry = new ModRegistry();
    });

    it('should register and retrieve mods', () => {
      registry.register({ id: 'mod-a', name: 'Mod A', version: '1.0.0' });
      expect(registry.getCount()).toBe(1);
      expect(registry.getMod('mod-a')?.manifest.name).toBe('Mod A');
    });

    it('should enable and disable mods', () => {
      registry.register({ id: 'x', name: 'X', version: '1.0.0' });
      registry.disable('x');
      expect(registry.getMod('x')?.enabled).toBe(false);
      expect(registry.getEnabledCount()).toBe(0);
      registry.enable('x');
      expect(registry.getMod('x')?.enabled).toBe(true);
    });

    it('should sort load order by priority', () => {
      registry.register({ id: 'low', name: 'Low', version: '1.0.0' }, { priority: 1 });
      registry.register({ id: 'high', name: 'High', version: '1.0.0' }, { priority: 10 });
      registry.register({ id: 'mid', name: 'Mid', version: '1.0.0' }, { priority: 5 });

      const order = registry.getLoadOrder().map((m) => m.manifest.id);
      expect(order).toEqual(['low', 'mid', 'high']);
    });

    it('should validate dependency satisfaction', () => {
      registry.register({ id: 'base', name: 'Base', version: '1.0.0' });
      registry.register({
        id: 'ext',
        name: 'Ext',
        version: '1.0.0',
        dependencies: { base: '^1.0.0' },
      });

      const result = registry.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing dependencies', () => {
      registry.register({
        id: 'orphan',
        name: 'Orphan',
        version: '1.0.0',
        dependencies: { 'missing-dep': '^1.0.0' },
      });

      const result = registry.validate();
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('missing-dep');
    });

    it('should detect conflicts from rules', () => {
      registry.register({ id: 'renderer-a', name: 'A', version: '1.0.0' });
      registry.register({ id: 'renderer-b', name: 'B', version: '1.0.0' });
      registry.addConflictRule('renderer-a', 'renderer-b', 'Only one renderer allowed');

      const result = registry.validate();
      expect(result.valid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].reason).toBe('Only one renderer allowed');
    });

    it('should discover mods from manifests', () => {
      const manifests = [
        { id: 'm1', name: 'M1', version: '1.0.0' },
        { id: 'm2', name: 'M2', version: '2.0.0' },
      ];
      const count = registry.discoverFromManifests(manifests, 'registry');
      expect(count).toBe(2);
      expect(registry.getMod('m1')?.source).toBe('registry');
    });
  });
});
