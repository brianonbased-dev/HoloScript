/**
 * PluginAPI Production Tests
 *
 * Permission-gated plugin API: events, assets, commands, state, scene access, cleanup.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PluginAPI } from '../PluginAPI';

function makeAPI(permissions: string[] = []): PluginAPI {
  return new PluginAPI({ pluginId: 'test-plugin', permissions: permissions as any[] });
}

describe('PluginAPI — Production', () => {
  describe('permissions', () => {
    it('hasPermission true when granted', () => {
      const api = makeAPI(['filesystem:read']);
      expect(api.hasPermission('filesystem:read' as any)).toBe(true);
    });

    it('hasPermission false when not granted', () => {
      const api = makeAPI([]);
      expect(api.hasPermission('filesystem:read' as any)).toBe(false);
    });
  });

  describe('events', () => {
    it('on/emit invokes handler', () => {
      const api = makeAPI();
      const handler = vi.fn();
      api.on('update', handler);
      api.emit('update', { dt: 16 });
      expect(handler).toHaveBeenCalledWith({ dt: 16 });
    });

    it('off removes handler', () => {
      const api = makeAPI();
      const handler = vi.fn();
      api.on('update', handler);
      api.off('update', handler);
      api.emit('update');
      expect(handler).not.toHaveBeenCalled();
    });

    it('getEventHandlers returns all', () => {
      const api = makeAPI();
      api.on('a', () => {});
      api.on('b', () => {});
      expect(api.getEventHandlers()).toHaveLength(2);
    });
  });

  describe('assets', () => {
    it('registerAsset requires permission', () => {
      const api = makeAPI([]);
      expect(() => api.registerAsset({ id: 'tex1', type: 'texture', path: '/tex.png' })).toThrow();
    });

    it('registerAsset + getAsset', () => {
      const api = makeAPI(['filesystem:read']);
      api.registerAsset({ id: 'tex1', type: 'texture', path: '/tex.png' });
      expect(api.getAsset('tex1')?.type).toBe('texture');
      expect(api.getAssetCount()).toBe(1);
    });

    it('unregisterAsset', () => {
      const api = makeAPI(['filesystem:read']);
      api.registerAsset({ id: 'tex1', type: 'texture', path: '/tex.png' });
      expect(api.unregisterAsset('tex1')).toBe(true);
      expect(api.getAssetCount()).toBe(0);
    });
  });

  describe('commands', () => {
    it('registerCommand + executeCommand', () => {
      const api = makeAPI();
      api.registerCommand({ id: 'greet', name: 'Greet', handler: (name) => `Hello ${name}` });
      expect(api.executeCommand('greet', 'World')).toBe('Hello World');
    });

    it('executeCommand throws for missing', () => {
      const api = makeAPI();
      expect(() => api.executeCommand('missing')).toThrow();
    });
  });

  describe('state store', () => {
    it('setState + getState', () => {
      const api = makeAPI();
      api.setState('score', 42);
      expect(api.getState('score')).toBe(42);
    });

    it('getStateKeys', () => {
      const api = makeAPI();
      api.setState('a', 1);
      api.setState('b', 2);
      expect(api.getStateKeys()).toEqual(['a', 'b']);
    });
  });

  describe('scene access', () => {
    it('queryScene requires permission', () => {
      const api = makeAPI([]);
      expect(() => api.queryScene({})).toThrow();
    });

    it('queryScene returns with permission', () => {
      const api = makeAPI(['scene:read']);
      expect(api.queryScene({ type: 'light' })).toHaveLength(1);
    });
  });

  describe('cleanup', () => {
    it('removes all plugin registrations', () => {
      const api = makeAPI(['filesystem:read']);
      api.on('ev', () => {});
      api.registerAsset({ id: 'a1', type: 'mesh', path: '/m.obj' });
      api.registerCommand({ id: 'c1', name: 'C1', handler: () => {} });
      api.setState('k', 'v');
      api.cleanup();
      expect(api.getEventHandlers()).toHaveLength(0);
      expect(api.getAssetCount()).toBe(0);
      expect(api.getCommands()).toHaveLength(0);
      expect(api.getStateKeys()).toHaveLength(0);
    });
  });
});
