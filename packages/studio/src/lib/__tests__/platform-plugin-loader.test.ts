/**
 * Platform Plugin Loader Tests
 *
 * Tests the lazy-loading WASM plugin system for platform targets
 * (Unity, Godot, Unreal, etc.)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PlatformPluginLoader,
  getPluginLoader,
  resetPluginLoader,
  type PluginManifest,
} from '../platform-plugin-loader';

// ── Test Setup ─────────────────────────────────────────────────

beforeEach(() => {
  resetPluginLoader();
  vi.restoreAllMocks();
});

// ── Constructor & Defaults ─────────────────────────────────────

describe('PlatformPluginLoader', () => {
  describe('constructor', () => {
    it('should create with default config', () => {
      const loader = new PlatformPluginLoader();
      const stats = loader.getStats();
      expect(stats.loadedPlugins).toHaveLength(0);
      expect(stats.totalMemoryKB).toBe(0);
      expect(stats.availableTargets.length).toBeGreaterThan(0);
    });

    it('should accept custom config', () => {
      const loader = new PlatformPluginLoader({
        baseUrl: '/custom/wasm/',
        useOPFSCache: false,
        maxTotalMemoryMB: 16,
      });
      expect(loader).toBeDefined();
    });
  });

  // ── Target Resolution ────────────────────────────────────────

  describe('findPluginForTarget', () => {
    it('should find Unity plugin for unity-csharp target', () => {
      const loader = new PlatformPluginLoader();
      const manifest = loader.findPluginForTarget('unity-csharp');
      expect(manifest).not.toBeNull();
      expect(manifest!.name).toBe('holoscript-plugin-unity');
    });

    it('should find Godot plugin for godot-gdscript target', () => {
      const loader = new PlatformPluginLoader();
      const manifest = loader.findPluginForTarget('godot-gdscript');
      expect(manifest).not.toBeNull();
      expect(manifest!.name).toBe('holoscript-plugin-godot');
    });

    it('should find XR plugin for openxr target', () => {
      const loader = new PlatformPluginLoader();
      const manifest = loader.findPluginForTarget('openxr');
      expect(manifest).not.toBeNull();
      expect(manifest!.name).toBe('holoscript-plugin-xr');
    });

    it('should return null for unknown target', () => {
      const loader = new PlatformPluginLoader();
      const manifest = loader.findPluginForTarget('nonexistent' as any);
      expect(manifest).toBeNull();
    });
  });

  // ── Supported Targets ────────────────────────────────────────

  describe('getSupportedTargets', () => {
    it('should return all 13 platform targets from 7 plugins', () => {
      const loader = new PlatformPluginLoader();
      const targets = loader.getSupportedTargets();
      expect(targets).toContain('unity-csharp');
      expect(targets).toContain('godot-gdscript');
      expect(targets).toContain('unreal-cpp');
      expect(targets).toContain('vrchat-udon');
      expect(targets).toContain('openxr');
      expect(targets).toContain('visionos-swift');
      expect(targets).toContain('android-arcore');
      expect(targets).toContain('webgpu-wgsl');
      expect(targets).toContain('react-three-fiber');
      expect(targets).toContain('playcanvas');
      expect(targets).toContain('urdf');
      expect(targets).toContain('sdf');
      expect(targets).toContain('usd');
      expect(targets).toHaveLength(13);
    });
  });

  // ── Plugin Registration ──────────────────────────────────────

  describe('registerPlugins', () => {
    it('should add new plugins', () => {
      const loader = new PlatformPluginLoader();
      const initialTargets = loader.getSupportedTargets().length;
      loader.registerPlugins([
        {
          name: 'holoscript-plugin-custom',
          version: '0.1.0',
          targets: ['react-three-fiber'],
          wasmUrl: 'plugins/custom.wasm',
          sizeKB: 100,
        },
      ]);
      // getSupportedTargets uses flatMap (no dedup), so duplicate targets are counted
      expect(loader.getSupportedTargets().length).toBe(initialTargets + 1);
    });

    it('should replace existing plugins by name', () => {
      const loader = new PlatformPluginLoader();
      loader.registerPlugins([
        {
          name: 'holoscript-plugin-unity',
          version: '0.2.0',
          targets: ['unity-csharp'],
          wasmUrl: 'plugins/unity-v2.wasm',
          sizeKB: 300,
        },
      ]);
      const manifest = loader.findPluginForTarget('unity-csharp');
      expect(manifest!.version).toBe('0.2.0');
      expect(manifest!.wasmUrl).toBe('plugins/unity-v2.wasm');
    });
  });

  // ── Compile Errors for Missing Targets ───────────────────────

  describe('compileForPlatform', () => {
    it('should return error for unsupported target', async () => {
      const loader = new PlatformPluginLoader();
      const result = await loader.compileForPlatform('{}', 'nonexistent' as any);
      expect(result.type).toBe('error');
      expect(result.diagnostics![0].message).toContain('No plugin available');
    });

    it('should return error when plugin fetch fails', async () => {
      const loader = new PlatformPluginLoader({ baseUrl: '/nonexistent/' });
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
      const result = await loader.compileForPlatform('{}', 'unity-csharp');
      expect(result.type).toBe('error');
      expect(result.diagnostics![0].message).toContain('Plugin load failed');
    });
  });

  // ── Unload ───────────────────────────────────────────────────

  describe('unload', () => {
    it('should handle unloading non-existent plugin', () => {
      const loader = new PlatformPluginLoader();
      // Should not throw
      loader.unload('nonexistent');
      expect(loader.getStats().loadedPlugins).toHaveLength(0);
    });
  });

  describe('unloadAll', () => {
    it('should clear all state', () => {
      const loader = new PlatformPluginLoader();
      loader.unloadAll();
      expect(loader.getStats().loadedPlugins).toHaveLength(0);
      expect(loader.getStats().totalMemoryKB).toBe(0);
    });
  });

  // ── Stats ────────────────────────────────────────────────────

  describe('getStats', () => {
    it('should report initial state correctly', () => {
      const loader = new PlatformPluginLoader();
      const stats = loader.getStats();
      expect(stats.loadedPlugins).toEqual([]);
      expect(stats.totalMemoryKB).toBe(0);
      expect(stats.availableTargets.length).toBe(13);
    });
  });

  // ── Singleton ────────────────────────────────────────────────

  describe('singleton', () => {
    it('should return same instance from getPluginLoader', () => {
      const a = getPluginLoader();
      const b = getPluginLoader();
      expect(a).toBe(b);
    });

    it('should create new instance after reset', () => {
      const a = getPluginLoader();
      resetPluginLoader();
      const b = getPluginLoader();
      expect(a).not.toBe(b);
    });
  });

  // ── Preload ──────────────────────────────────────────────────

  describe('preload', () => {
    it('should return false for unknown target', async () => {
      const loader = new PlatformPluginLoader();
      const result = await loader.preload('nonexistent' as any);
      expect(result).toBe(false);
    });
  });
});
