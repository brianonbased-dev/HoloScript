// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isTauri,
  resolveWasmUrl,
  detectTauriFeatures,
  enhancePlatformWithTauri,
  saveProjectNative,
  loadProjectNative,
  listProjectsNative,
  resetTauriCache,
} from '../tauri-bridge';
import type { PlatformCapabilities } from '../platform-detect';

// ─── Mocks ───────────────────────────────────────────────────────

// Mock @tauri-apps/api/core — not available in test env
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('tauri-bridge', () => {
  const originalTauri = (window as any).__TAURI__;

  afterEach(() => {
    // Reset cached invoke + __TAURI__ after each test
    _resetTauriCache();
    if (originalTauri !== undefined) {
      (window as any).__TAURI__ = originalTauri;
    } else {
      delete (window as any).__TAURI__;
    }
  });

  // ─── isTauri ─────────────────────────────────────────────────

  describe('isTauri', () => {
    it('should return false when __TAURI__ is not present', () => {
      delete (window as any).__TAURI__;
      expect(isTauri()).toBe(false);
    });

    it('should return true when __TAURI__ is present', () => {
      (window as any).__TAURI__ = {};
      expect(isTauri()).toBe(true);
    });
  });

  // ─── resolveWasmUrl ──────────────────────────────────────────

  describe('resolveWasmUrl', () => {
    it('should return /wasm/holoscript.js in browser mode', () => {
      delete (window as any).__TAURI__;
      expect(resolveWasmUrl()).toBe('/wasm/holoscript.js');
    });

    it('should return /wasm/holoscript.js in Tauri mode', () => {
      (window as any).__TAURI__ = {};
      expect(resolveWasmUrl()).toBe('/wasm/holoscript.js');
    });
  });

  // ─── detectTauriFeatures ─────────────────────────────────────

  describe('detectTauriFeatures', () => {
    it('should return defaults when not in Tauri', async () => {
      delete (window as any).__TAURI__;
      const features = await detectTauriFeatures();
      expect(features.isTauri).toBe(false);
      expect(features.gpuInfo).toBeNull();
      expect(features.appVersion).toBeNull();
      expect(features.hasNativeShaderPreview).toBe(false);
      expect(features.hasNativeFileSystem).toBe(false);
    });
  });

  // ─── enhancePlatformWithTauri ────────────────────────────────

  describe('enhancePlatformWithTauri', () => {
    it('should return caps unchanged when not Tauri', async () => {
      const caps: PlatformCapabilities = {
        runtime: 'browser',
        isTauri: false,
        hasWasm: true,
        hasWasmThreads: false,
        hasWasmSIMD: false,
        hasWasmComponentModel: true,
        hasWebWorkers: true,
        hasSharedArrayBuffer: false,
        hasWebGPU: false,
        hasWebGL2: true,
        hasWebGL1: true,
        hasWebXR: false,
        hasWebXRImmersive: false,
        hasWebXRAR: false,
        hasIndexedDB: true,
        hasOPFS: false,
        hasServiceWorker: true,
        isSecureContext: true,
        hardwareConcurrency: 8,
        deviceMemoryGB: 8,
        recommendedWorld: 'holoscript-runtime',
        recommendedBackend: 'wasm-component',
      };

      const enhanced = await enhancePlatformWithTauri(caps);
      expect(enhanced).toEqual(caps);
    });
  });

  // ─── Native File Operations (not in Tauri) ──────────────────

  describe('Native File Operations (browser)', () => {
    beforeEach(() => {
      delete (window as any).__TAURI__;
    });

    it('saveProjectNative should fail gracefully', async () => {
      const result = await saveProjectNative('/some/path.holo', 'content');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Not in Tauri');
    });

    it('loadProjectNative should fail gracefully', async () => {
      const result = await loadProjectNative('/some/path.holo');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Not in Tauri');
    });

    it('listProjectsNative should return empty array', async () => {
      const projects = await listProjectsNative('/some/dir');
      expect(projects).toEqual([]);
    });
  });
});
