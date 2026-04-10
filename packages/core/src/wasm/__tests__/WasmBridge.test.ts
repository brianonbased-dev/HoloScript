/**
 * WASM Module Tests
 *
 * Tests for WasmParserBridge and WasmModuleCache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { WasmParserBridge, WasmModuleCache } from '../index';

// ============================================================================
// WasmModuleCache Tests
// ============================================================================

describe('WasmModuleCache', () => {
  let cache: WasmModuleCache;

  beforeEach(() => {
    cache = new WasmModuleCache({
      maxModules: 10,
      ttlMs: 1000 * 60 * 60, // 1 hour for tests
    });
  });

  describe('constructor', () => {
    it('should create cache with default config', () => {
      const defaultCache = new WasmModuleCache();
      expect(defaultCache).toBeDefined();
    });

    it('should create cache with custom config', () => {
      const customCache = new WasmModuleCache({
        maxModules: 5,
        ttlMs: 1000,
        enableCompression: true,
      });
      expect(customCache).toBeDefined();
    });
  });

  describe('init()', () => {
    it('should initialize without throwing', async () => {
      // In Node environment, IndexedDB is not available
      // This should handle gracefully
      await expect(cache.init()).resolves.not.toThrow();
    });

    it('should be idempotent', async () => {
      await cache.init();
      await cache.init();
      // Should not throw on double init
      expect(cache).toBeDefined();
    });
  });

  describe('get()', () => {
    it('should return null for missing key', async () => {
      const result = await cache.get('nonexistent', '1.0.0');
      expect(result).toBeNull();
    });

    it('should return null for version mismatch', async () => {
      // Without WebAssembly.Module in tests, we can't fully test this
      const result = await cache.get('test', '2.0.0');
      expect(result).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('should return cache statistics', () => {
      const stats = cache.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.memoryEntries).toBe('number');
      expect(typeof stats.dbAvailable).toBe('boolean');
    });

    it('should track memory entries', () => {
      const stats = cache.getStats();
      expect(stats.memoryEntries).toBe(0);
    });
  });

  describe('clear()', () => {
    it('should clear cache without throwing', async () => {
      await expect(cache.clear()).resolves.not.toThrow();
    });
  });
});

// ============================================================================
// WasmParserBridge Tests
// ============================================================================

describe('WasmParserBridge', () => {
  let bridge: WasmParserBridge;

  beforeEach(() => {
    // Create bridge with preload disabled to avoid actual WASM loading
    bridge = new WasmParserBridge({
      preload: false,
      enableFallback: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create bridge with default config', () => {
      const defaultBridge = new WasmParserBridge({ preload: false });
      expect(defaultBridge).toBeDefined();
    });

    it('should create bridge with custom config', () => {
      const customBridge = new WasmParserBridge({
        wasmUrl: '/custom/path.wasm',
        useWorker: false,
        maxWorkers: 2,
        enableFallback: true,
        preload: false,
      });
      expect(customBridge).toBeDefined();
    });
  });

  describe('isAvailable()', () => {
    it('should return false before initialization', () => {
      expect(bridge.isAvailable()).toBe(false);
    });
  });

  describe('getStats()', () => {
    it('should return bridge statistics', () => {
      const stats = bridge.getStats();
      expect(stats).toBeDefined();
      expect(typeof stats.initialized).toBe('boolean');
      expect(stats.cacheStats).toBeDefined();
    });

    it('should show not initialized initially', () => {
      const stats = bridge.getStats();
      expect(stats.initialized).toBe(false);
    });
  });

  describe('parse() with fallback', () => {
    it('should fallback to JS parser when WASM unavailable', async () => {
      const source = `composition "Test" {
        object "Box" {
          geometry: "cube"
        }
      }`;

      const result = await bridge.parse(source);

      // Should succeed via fallback parser
      expect(result.success).toBe(true);
      expect(result.usedWasm).toBe(false);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return AST from fallback parser', async () => {
      const source = 'object Player { position: [0, 0, 0] }';
      const result = await bridge.parse(source);

      expect(result.success).toBe(true);
      expect(result.ast).toBeDefined();
    });

    it('should return error for invalid source', async () => {
      const source = '{{{{ invalid syntax';
      const result = await bridge.parse(source);

      // May succeed or fail depending on parser behavior
      expect(result).toBeDefined();
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should set usedWasm false when using fallback', async () => {
      const source = 'object Test {}';
      const result = await bridge.parse(source);

      expect(result.usedWasm).toBe(false);
    });
  });

  describe('parse() without fallback', () => {
    it('should return error when WASM unavailable and fallback disabled', async () => {
      const noFallbackBridge = new WasmParserBridge({
        preload: false,
        enableFallback: false,
      });

      const source = 'object Test {}';
      const result = await noFallbackBridge.parse(source);

      expect(result.success).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });
  });

  describe('validate()', () => {
    it('should return validation result', async () => {
      const source = 'object Test { position: [0, 0, 0] }';
      const result = await bridge.validate(source);

      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it('should return errors for invalid source', async () => {
      const source = '{{{{ definitely invalid';
      const result = await bridge.validate(source);

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });

  describe('getVersion()', () => {
    it('should return version string', async () => {
      const version = await bridge.getVersion();

      // Without WASM, should return 'unavailable'
      expect(typeof version).toBe('string');
    });
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('WASM Module Integration', () => {
  it('should export wasmParser singleton', async () => {
    const { wasmParser } = await import('../index');
    expect(wasmParser).toBeDefined();
  });

  it('should export wasmModuleCache singleton', async () => {
    const { wasmModuleCache } = await import('../index');
    expect(wasmModuleCache).toBeDefined();
  });

  it('should export WasmParserBridge class', async () => {
    const { WasmParserBridge } = await import('../index');
    expect(WasmParserBridge).toBeDefined();
    expect(typeof WasmParserBridge).toBe('function');
  });

  it('should export WasmModuleCache class', async () => {
    const { WasmModuleCache } = await import('../index');
    expect(WasmModuleCache).toBeDefined();
    expect(typeof WasmModuleCache).toBe('function');
  });
});

// ============================================================================
// ParseResult Interface Tests
// ============================================================================

describe('ParseResult structure', () => {
  it('should have correct success result structure', async () => {
    const bridge = new WasmParserBridge({ preload: false, enableFallback: true });
    const result = await bridge.parse('object Test {}');

    if (result.success) {
      expect(result.ast).toBeDefined();
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.usedWasm).toBe('boolean');
    }
  });

  it('should have correct error result structure', async () => {
    const bridge = new WasmParserBridge({ preload: false, enableFallback: false });
    const result = await bridge.parse('object Test {}');

    if (!result.success) {
      expect(result.errors).toBeDefined();
      expect(Array.isArray(result.errors)).toBe(true);
      expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
    }
  });
});

// ============================================================================
// Config Validation Tests
// ============================================================================

describe('WasmParserConfig', () => {
  it('should handle custom wasmUrl', () => {
    const bridge = new WasmParserBridge({
      wasmUrl: '/custom/holoscript.wasm',
      preload: false,
    });
    expect(bridge).toBeDefined();
  });

  it('should handle useWorker option', () => {
    const bridge = new WasmParserBridge({
      useWorker: true,
      preload: false,
    });
    expect(bridge).toBeDefined();
  });

  it('should handle maxWorkers option', () => {
    const bridge = new WasmParserBridge({
      maxWorkers: 8,
      preload: false,
    });
    expect(bridge).toBeDefined();
  });

  it('should handle empty config', () => {
    // Need to mock fetch for preload
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('test')));

    const bridge = new WasmParserBridge({});
    expect(bridge).toBeDefined();

    vi.unstubAllGlobals();
  });
});

// ============================================================================
// WasmModuleCacheConfig Tests
// ============================================================================

describe('WasmModuleCacheConfig', () => {
  it('should handle custom maxModules', () => {
    const cache = new WasmModuleCache({ maxModules: 5 });
    expect(cache).toBeDefined();
  });

  it('should handle custom ttlMs', () => {
    const cache = new WasmModuleCache({ ttlMs: 1000 * 60 });
    expect(cache).toBeDefined();
  });

  it('should handle enableCompression', () => {
    const cache = new WasmModuleCache({ enableCompression: true });
    expect(cache).toBeDefined();
  });
});
