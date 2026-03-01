// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectPlatformSync,
  detectPlatform,
  checkBudget,
  PLATFORM_BUDGETS,
  type PlatformCapabilities,
} from '../platform-detect';

describe('platform-detect', () => {
  // ─── detectPlatformSync ────────────────────────────────────────

  describe('detectPlatformSync', () => {
    it('should return a complete PlatformCapabilities object', () => {
      const caps = detectPlatformSync();
      expect(caps).toHaveProperty('runtime');
      expect(caps).toHaveProperty('isTauri');
      expect(caps).toHaveProperty('hasWasm');
      expect(caps).toHaveProperty('hasWebWorkers');
      expect(caps).toHaveProperty('hasSharedArrayBuffer');
      expect(caps).toHaveProperty('hasWebGPU');
      expect(caps).toHaveProperty('hasWebGL2');
      expect(caps).toHaveProperty('hasWebGL1');
      expect(caps).toHaveProperty('hasWebXR');
      expect(caps).toHaveProperty('hasIndexedDB');
      expect(caps).toHaveProperty('hasOPFS');
      expect(caps).toHaveProperty('hasServiceWorker');
      expect(caps).toHaveProperty('isSecureContext');
      expect(caps).toHaveProperty('hardwareConcurrency');
      expect(caps).toHaveProperty('deviceMemoryGB');
      expect(caps).toHaveProperty('recommendedWorld');
      expect(caps).toHaveProperty('recommendedBackend');
    });

    it('should detect browser runtime in jsdom', () => {
      // jsdom provides window + document, so runtime should be "browser"
      const caps = detectPlatformSync();
      expect(caps.runtime).toBe('browser');
    });

    it('should not detect Tauri in jsdom', () => {
      const caps = detectPlatformSync();
      expect(caps.isTauri).toBe(false);
      expect(caps.tauriVersion).toBeUndefined();
    });

    it('should detect WASM support', () => {
      const caps = detectPlatformSync();
      // jsdom + Node has WebAssembly
      expect(caps.hasWasm).toBe(true);
    });

    it('should detect WebWorker support', () => {
      const caps = detectPlatformSync();
      // jsdom may or may not have Worker; depends on test setup
      expect(typeof caps.hasWebWorkers).toBe('boolean');
    });

    it('should have at least 1 hardware concurrency', () => {
      const caps = detectPlatformSync();
      expect(caps.hardwareConcurrency).toBeGreaterThanOrEqual(1);
    });

    it('should have positive device memory estimate', () => {
      const caps = detectPlatformSync();
      expect(caps.deviceMemoryGB).toBeGreaterThan(0);
    });

    it('should default async probes to false in sync mode', () => {
      const caps = detectPlatformSync();
      expect(caps.hasWebXR).toBe(false);
      expect(caps.hasWebXRImmersive).toBe(false);
      expect(caps.hasWebXRAR).toBe(false);
      expect(caps.hasOPFS).toBe(false);
      // WebGPU defaults to false (needs async probe)
      expect(caps.hasWebGPU).toBe(false);
    });

    it('should set defaults for recommended fields', () => {
      const caps = detectPlatformSync();
      // Default recommendations before async probes
      expect(caps.recommendedWorld).toBe('holoscript-runtime');
      expect(caps.recommendedBackend).toBe('typescript-fallback');
    });
  });

  // ─── detectPlatform (async) ────────────────────────────────────

  describe('detectPlatform', () => {
    it('should resolve with a full PlatformCapabilities', async () => {
      const caps = await detectPlatform();
      expect(caps).toHaveProperty('runtime');
      expect(caps).toHaveProperty('recommendedBackend');
      expect(caps).toHaveProperty('recommendedWorld');
    });

    it('should compute recommendedBackend after async probes', async () => {
      const caps = await detectPlatform();
      // With WASM available, should recommend wasm-component
      if (caps.hasWasm) {
        expect(caps.recommendedBackend).toBe('wasm-component');
      } else {
        expect(caps.recommendedBackend).toBe('typescript-fallback');
      }
    });

    it('should compute recommendedWorld based on device specs', async () => {
      const caps = await detectPlatform();
      // In test env (Node/jsdom), typically has 4+ GB and 4+ cores
      expect(['holoscript-runtime', 'holoscript-parser', 'holoscript-spatial'])
        .toContain(caps.recommendedWorld);
    });
  });

  // ─── Tauri Detection ───────────────────────────────────────────

  describe('Tauri detection', () => {
    const originalTauri = (window as any).__TAURI__;
    const originalInternals = (window as any).__TAURI_INTERNALS__;

    afterEach(() => {
      // Restore state
      if (originalTauri !== undefined) {
        (window as any).__TAURI__ = originalTauri;
      } else {
        delete (window as any).__TAURI__;
      }
      if (originalInternals !== undefined) {
        (window as any).__TAURI_INTERNALS__ = originalInternals;
      } else {
        delete (window as any).__TAURI_INTERNALS__;
      }
    });

    it('should detect Tauri when __TAURI__ is present', () => {
      (window as any).__TAURI__ = {};
      const caps = detectPlatformSync();
      expect(caps.runtime).toBe('tauri');
      expect(caps.isTauri).toBe(true);
    });

    it('should read Tauri version from __TAURI_INTERNALS__', () => {
      (window as any).__TAURI__ = {};
      (window as any).__TAURI_INTERNALS__ = {
        metadata: { tauriVersion: '2.1.0' },
      };
      const caps = detectPlatformSync();
      expect(caps.tauriVersion).toBe('2.1.0');
    });
  });

  // ─── PLATFORM_BUDGETS ─────────────────────────────────────────

  describe('PLATFORM_BUDGETS', () => {
    it('should have entries for tauri, browser, and mobile', () => {
      expect(PLATFORM_BUDGETS).toHaveProperty('tauri');
      expect(PLATFORM_BUDGETS).toHaveProperty('browser');
      expect(PLATFORM_BUDGETS).toHaveProperty('mobile');
    });

    it('should have tauri with highest budgets', () => {
      expect(PLATFORM_BUDGETS['tauri'].maxWasmBinaryKB)
        .toBeGreaterThan(PLATFORM_BUDGETS['browser'].maxWasmBinaryKB);
      expect(PLATFORM_BUDGETS['tauri'].maxMemoryMB)
        .toBeGreaterThan(PLATFORM_BUDGETS['browser'].maxMemoryMB);
    });

    it('should have mobile with lowest budgets', () => {
      expect(PLATFORM_BUDGETS['mobile'].maxWasmBinaryKB)
        .toBeLessThan(PLATFORM_BUDGETS['browser'].maxWasmBinaryKB);
    });
  });

  // ─── checkBudget ──────────────────────────────────────────────

  describe('checkBudget', () => {
    it('should return withinBudget: true when all metrics are under budget', () => {
      const result = checkBudget('browser', {
        maxWasmBinaryKB: 500,
        maxInitTimeMs: 100,
        maxParseTimeMs: 10,
        maxCompileTimeMs: 100,
        maxMemoryMB: 32,
      });
      expect(result.withinBudget).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('should detect WASM binary size violation', () => {
      const result = checkBudget('browser', {
        maxWasmBinaryKB: 2000, // browser budget is 1200
      });
      expect(result.withinBudget).toBe(false);
      expect(result.violations.length).toBe(1);
      expect(result.violations[0]).toContain('WASM binary');
    });

    it('should detect multiple violations', () => {
      const result = checkBudget('mobile', {
        maxWasmBinaryKB: 1000, // mobile budget: 800
        maxInitTimeMs: 300,     // mobile budget: 200
        maxMemoryMB: 64,        // mobile budget: 32
      });
      expect(result.withinBudget).toBe(false);
      expect(result.violations.length).toBe(3);
    });

    it('should use browser budget for unknown platform', () => {
      const result = checkBudget('unknown-platform', {
        maxWasmBinaryKB: 1300,
      });
      // Should use browser budget (1200KB), so 1300 > 1200 = violation
      expect(result.withinBudget).toBe(false);
    });

    it('should skip undefined metrics', () => {
      const result = checkBudget('browser', {
        maxWasmBinaryKB: 500,
        // Other metrics not provided — should not count as violations
      });
      expect(result.withinBudget).toBe(true);
      expect(result.violations).toEqual([]);
    });

    it('should return withinBudget: true for empty metrics', () => {
      const result = checkBudget('browser', {});
      expect(result.withinBudget).toBe(true);
    });
  });
});
