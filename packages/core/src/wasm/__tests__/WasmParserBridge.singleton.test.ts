/**
 * Creator Advocate audit 2026-10-14, item 7: importing @holoscript/core in a
 * browser fetched /holoscript_wasm_bg.wasm on every page (404 in Studio)
 * because the exported singleton preloaded at import time.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

describe('wasmParser singleton (audit item 7)', () => {
  it('does not start loading WASM at import time', async () => {
    vi.resetModules();
    const mod = await import('../WasmParserBridge');
    expect((mod.wasmParser as unknown as { loadPromise: unknown }).loadPromise).toBeNull();
  });

  it('still loads on first explicit use', async () => {
    const { WasmParserBridge } = await import('../WasmParserBridge');
    const bridge = new WasmParserBridge({ preload: false, nodeGrammarLoader: async () => null });
    const fetchSpy = vi.fn(async () => new Response('', { status: 404 }));
    vi.stubGlobal('fetch', fetchSpy);
    await expect(bridge.load()).rejects.toThrow();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('core package sideEffects (audit item 7: Trait Inspector crash)', () => {
  it('marks dist/index.js as side-effectful so its lazy-init calls are kept by bundlers', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(resolve(here, '../../../package.json'), 'utf8')) as {
      sideEffects: string[];
    };
    expect(pkg.sideEffects).toContain('./dist/index.js');
  });
});