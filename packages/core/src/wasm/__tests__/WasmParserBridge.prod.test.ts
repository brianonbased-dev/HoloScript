/**
 * WasmParserBridge Production Tests
 *
 * Tests fallback parsing, availability checks, and stats.
 * WASM binary not available in Node test env, so tests focus on
 * JS fallback path and config handling.
 */

import { describe, it, expect } from 'vitest';
import { WasmParserBridge } from '../WasmParserBridge';

describe('WasmParserBridge — Production', () => {
  it('isAvailable returns false without loading', () => {
    const bridge = new WasmParserBridge();
    expect(bridge.isAvailable()).toBe(false);
  });

  it('getStats shows not initialized', () => {
    const bridge = new WasmParserBridge();
    const stats = bridge.getStats();
    expect(stats.initialized).toBe(false);
    expect(stats.cacheStats.memoryEntries).toBe(0);
  });

  it('custom config merges', () => {
    const bridge = new WasmParserBridge({ enableFallback: true, useWorker: false });
    expect(bridge.isAvailable()).toBe(false);
  });

  it('fallback parse returns result', async () => {
    const bridge = new WasmParserBridge({ enableFallback: true });
    // parse without loading WASM triggers fallback
    const result = await bridge.parse('entity Player { }');
    expect(result.usedWasm).toBe(false);
    expect(result.parseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('parse empty string via fallback', async () => {
    const bridge = new WasmParserBridge({ enableFallback: true });
    const result = await bridge.parse('');
    expect(result.usedWasm).toBe(false);
  });

  it('validate falls back when WASM unavailable', async () => {
    const bridge = new WasmParserBridge({ enableFallback: true });
    const result = await bridge.validate('entity Test {}');
    expect(result).toBeDefined();
  });
});
