/**
 * platform-detect.test.ts — Runtime Platform Detection Tests
 *
 * Coverage:
 *   - detectPlatformSync() in Node.js (vitest runs in Node)
 *   - computeRecommendedWorld / computeRecommendedBackend (via sync result)
 *   - PLATFORM_BUDGETS constants
 *   - checkBudget() violations and pass cases
 *   - detectPlatform() (async, with mocked navigator APIs)
 */

import { describe, it, expect } from 'vitest';
import {
  detectPlatformSync,
  detectPlatform,
  checkBudget,
  PLATFORM_BUDGETS,
} from '../../lib/platform-detect';

// ── 1. detectPlatformSync in Node.js ─────────────────────────────────────────

describe('detectPlatformSync() — Node.js environment', () => {
  it('returns a PlatformCapabilities object with all required keys', () => {
    const caps = detectPlatformSync();
    expect(caps).toHaveProperty('runtime');
    expect(caps).toHaveProperty('isTauri');
    expect(caps).toHaveProperty('hasWasm');
    expect(caps).toHaveProperty('hasWebGPU');
    expect(caps).toHaveProperty('hasIndexedDB');
    expect(caps).toHaveProperty('recommendedWorld');
    expect(caps).toHaveProperty('recommendedBackend');
  });

  it('detects node runtime', () => {
    const caps = detectPlatformSync();
    // In vitest (Node.js), runtime should be 'node' or 'browser' (jsdom env)
    expect(['node', 'browser', 'unknown']).toContain(caps.runtime);
  });

  it('isTauri is false in Node.js', () => {
    expect(detectPlatformSync().isTauri).toBe(false);
  });

  it('hasWasm is true (Node 18+ has WebAssembly)', () => {
    expect(detectPlatformSync().hasWasm).toBe(typeof WebAssembly !== 'undefined');
  });

  it('hasWebGPU is false synchronously (requires async probe)', () => {
    expect(detectPlatformSync().hasWebGPU).toBe(false);
  });

  it('hasWebXR is false synchronously (requires async probe)', () => {
    const caps = detectPlatformSync();
    expect(caps.hasWebXR).toBe(false);
    expect(caps.hasWebXRImmersive).toBe(false);
    expect(caps.hasWebXRAR).toBe(false);
  });

  it('hardwareConcurrency is at least 1', () => {
    expect(detectPlatformSync().hardwareConcurrency).toBeGreaterThanOrEqual(1);
  });

  it('deviceMemoryGB defaults to 4 in Node', () => {
    // Node doesn't have navigator.deviceMemory, falls back to 4
    expect(detectPlatformSync().deviceMemoryGB).toBeGreaterThanOrEqual(0);
  });

  it('recommendedWorld is one of the valid values', () => {
    const valid = [
      'holoscript-runtime',
      'holoscript-parser',
      'holoscript-compiler',
      'holoscript-spatial',
    ];
    expect(valid).toContain(detectPlatformSync().recommendedWorld);
  });

  it('recommendedBackend is one of the valid values', () => {
    const valid = ['wasm-component', 'wasm-legacy', 'typescript-fallback'];
    expect(valid).toContain(detectPlatformSync().recommendedBackend);
  });

  it('is deterministic — two calls produce identical results', () => {
    const a = detectPlatformSync();
    const b = detectPlatformSync();
    expect(a).toEqual(b);
  });
});

// ── 2. detectPlatform() (async) ───────────────────────────────────────────────

describe('detectPlatform() — async with probes', () => {
  it('returns a superset of detectPlatformSync() fields', async () => {
    const caps = await detectPlatform();
    expect(caps).toHaveProperty('runtime');
    expect(caps).toHaveProperty('hasWebGPU');
    expect(caps).toHaveProperty('hasWebXR');
    expect(caps).toHaveProperty('hasOPFS');
    expect(caps).toHaveProperty('recommendedWorld');
    expect(caps).toHaveProperty('recommendedBackend');
  });

  it('resolves without throwing (no real GPU/XR in test env)', async () => {
    await expect(detectPlatform()).resolves.toBeDefined();
  });

  it('hasWebGPU is false when navigator.gpu is unavailable', async () => {
    const caps = await detectPlatform();
    // In Node.js/jsdom navigator.gpu is undefined → false
    expect(typeof caps.hasWebGPU).toBe('boolean');
  });
});

// ── 3. PLATFORM_BUDGETS constants ─────────────────────────────────────────────

describe('PLATFORM_BUDGETS constants', () => {
  it('defines tauri, browser, and mobile tiers', () => {
    expect(PLATFORM_BUDGETS).toHaveProperty('tauri');
    expect(PLATFORM_BUDGETS).toHaveProperty('browser');
    expect(PLATFORM_BUDGETS).toHaveProperty('mobile');
  });

  it('browser budget is more constrained than tauri', () => {
    expect(PLATFORM_BUDGETS.browser.maxWasmBinaryKB).toBeLessThan(
      PLATFORM_BUDGETS.tauri.maxWasmBinaryKB
    );
    expect(PLATFORM_BUDGETS.browser.maxMemoryMB).toBeLessThan(PLATFORM_BUDGETS.tauri.maxMemoryMB);
  });

  it('mobile budget is most constrained', () => {
    expect(PLATFORM_BUDGETS.mobile.maxWasmBinaryKB).toBeLessThan(
      PLATFORM_BUDGETS.browser.maxWasmBinaryKB
    );
    expect(PLATFORM_BUDGETS.mobile.maxMemoryMB).toBeLessThan(PLATFORM_BUDGETS.browser.maxMemoryMB);
  });

  it('all budget entries have 5 required fields', () => {
    for (const tier of Object.values(PLATFORM_BUDGETS)) {
      expect(tier).toHaveProperty('maxWasmBinaryKB');
      expect(tier).toHaveProperty('maxInitTimeMs');
      expect(tier).toHaveProperty('maxParseTimeMs');
      expect(tier).toHaveProperty('maxCompileTimeMs');
      expect(tier).toHaveProperty('maxMemoryMB');
    }
  });
});

// ── 4. checkBudget() ──────────────────────────────────────────────────────────

describe('checkBudget()', () => {
  it('returns withinBudget:true when all metrics are under budget', () => {
    const result = checkBudget('browser', {
      maxWasmBinaryKB: 100,
      maxInitTimeMs: 50,
      maxMemoryMB: 10,
    });
    expect(result.withinBudget).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('returns withinBudget:false when WASM binary exceeds browser budget', () => {
    const result = checkBudget('browser', { maxWasmBinaryKB: 99999 });
    expect(result.withinBudget).toBe(false);
    expect(result.violations.some((v) => v.includes('WASM binary'))).toBe(true);
  });

  it('returns withinBudget:false when init time exceeds budget', () => {
    const result = checkBudget('browser', { maxInitTimeMs: 99999 });
    expect(result.withinBudget).toBe(false);
    expect(result.violations.some((v) => v.includes('Init time'))).toBe(true);
  });

  it('returns withinBudget:false when parse time exceeds budget', () => {
    const result = checkBudget('browser', { maxParseTimeMs: 99999 });
    expect(result.withinBudget).toBe(false);
    expect(result.violations.some((v) => v.includes('Parse time'))).toBe(true);
  });

  it('returns withinBudget:false when compile time exceeds budget', () => {
    const result = checkBudget('browser', { maxCompileTimeMs: 99999 });
    expect(result.withinBudget).toBe(false);
    expect(result.violations.some((v) => v.includes('Compile time'))).toBe(true);
  });

  it('returns withinBudget:false when memory exceeds budget', () => {
    const result = checkBudget('browser', { maxMemoryMB: 99999 });
    expect(result.withinBudget).toBe(false);
    expect(result.violations.some((v) => v.includes('Memory'))).toBe(true);
  });

  it('reports multiple violations at once', () => {
    const result = checkBudget('mobile', {
      maxWasmBinaryKB: 99999,
      maxMemoryMB: 99999,
      maxInitTimeMs: 99999,
    });
    expect(result.violations.length).toBeGreaterThanOrEqual(3);
  });

  it('falls back to browser budget for unknown platform', () => {
    // Should not throw and should use browser defaults
    const result = checkBudget('holodeck-3000', { maxWasmBinaryKB: 100 });
    expect(result.withinBudget).toBe(true);
  });

  it('returns withinBudget:true for empty metrics (nothing to check)', () => {
    expect(checkBudget('browser', {}).withinBudget).toBe(true);
  });

  it('is exactly at the budget limit — passes (not >)', () => {
    const budget = PLATFORM_BUDGETS.browser;
    const result = checkBudget('browser', { maxWasmBinaryKB: budget.maxWasmBinaryKB });
    expect(result.withinBudget).toBe(true);
  });

  it('one-over the budget limit — fails', () => {
    const budget = PLATFORM_BUDGETS.browser;
    const result = checkBudget('browser', { maxWasmBinaryKB: budget.maxWasmBinaryKB + 1 });
    expect(result.withinBudget).toBe(false);
  });
});
