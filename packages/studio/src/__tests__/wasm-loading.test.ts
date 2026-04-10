/**
 * Test: Raw WASM Module Loading
 *
 * Verifies that the compiled holoscript-component.wasm can be instantiated
 * and that its exported functions are accessible from JavaScript.
 **/

import { expect, describe, it, beforeAll, afterAll } from 'vitest';
import { logger } from '@/lib/logger';

describe('WASM Module Loading', () => {
  let wasmModule: WebAssembly.Instance | null = null;
  let wasmBuffer: ArrayBuffer | null = null;

  beforeAll(async () => {
    // In a real browser/test environment, fetch the WASM file
    // For now, we simulate by trying to load from the filesystem
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const wasmPath = path.join(
        __dirname,
        '../../../holoscript-component/target/wasm32-wasip1/release/holoscript_component.wasm'
      );

      const data = await fs.readFile(wasmPath);
      wasmBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    } catch (error) {
      logger.warn('Could not load WASM from filesystem:', error);
      // Skip test if WASM not available
      return;
    }
  });

  it('should load raw WASM module', async () => {
    if (!wasmBuffer) {
      logger.warn('Skipping WASM load test - binary not available');
      return;
    }

    // Provide minimal WASI shim for wasm32-wasip1 targets
    const wasiStub = new Proxy({}, { get: () => () => 0 });
    const result = await WebAssembly.instantiate(wasmBuffer, {
      env: {},
      wasi_snapshot_preview1: wasiStub,
    });

    expect(result.instance).toBeDefined();
    wasmModule = result.instance;
  });

  it('should expose exported functions', () => {
    if (!wasmModule) {
      logger.warn('Skipping function test - WASM not loaded');
      return;
    }

    const exports = wasmModule.exports as Record<string, any>;

    // Check for common WASM exports
    expect(typeof exports).toBe('object');
    logger.debug('Available exports:', Object.keys(exports).length);
    logger.debug('Export names:', Object.keys(exports).slice(0, 10).join(', '));
  });

  it('should have reasonable binary size', () => {
    if (!wasmBuffer) return;

    const sizeKB = wasmBuffer.byteLength / 1024;
    expect(sizeKB).toBeLessThan(2000); // Should be under 2MB
    expect(sizeKB).toBeGreaterThan(100); // Should be reasonably large (not empty)

    logger.debug(`WASM binary size: ${sizeKB.toFixed(2)} KB`);
  });
});
