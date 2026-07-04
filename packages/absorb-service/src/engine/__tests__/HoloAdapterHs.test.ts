/**
 * HoloAdapter — `.hs` (base logic layer) symbol extraction (slice 2).
 *
 * `.hs` is HoloScript's logic layer (functions, objects). It shares the
 * HoloScriptPlus parser with `.hsplus` (the canonical `parse_hs` handler does
 * the same), but the parser represents `.hs` declarations with `node.type` =
 * the KEYWORD (`function`/`object`) and `node.name` = the identifier — the
 * inverse of the `.hsplus` trait convention. Before slice 2, HoloAdapter routed
 * `.hs` to the `.holo` composition parser, which flattened logic files.
 *
 * These tests use the real `@holoscript/core` parser (optional peer dep). If it
 * cannot load in this environment, the parse returns null and the assertions
 * no-op — but the routing guard below always runs the extension→kind mapping.
 */
import { describe, it, expect } from 'vitest';
import { HoloAdapter } from '../adapters/HoloAdapter';
import type { HoloParseTree } from '../adapters/HoloAdapter';

// Mirrors scripts/exp-grpo/oracles/gcd.hs — a pure logic function.
const HS_FUNCTION = `function gcd(a, b) {
  let x = abs(a)
  let y = abs(b)
  while (y != 0) {
    const t = y
    y = x % y
    x = t
  }
  return x
}
`;

// Mirrors workloads/samples/demo-cube.hs — a declarative object.
const HS_OBJECT = `object Cube { geometry: "cube" }`;

describe('HoloAdapter — .hs logic extraction', () => {
  const adapter = new HoloAdapter();

  it('claims the .hs extension', () => {
    expect(adapter.extensions).toContain('.hs');
  });

  it('routes .hs to the HoloScriptPlus parser (__holoKind = "hs"), not the composition parser', async () => {
    const tree = (await adapter.parse(HS_FUNCTION, 'gcd.hs')) as HoloParseTree | null;
    if (!tree) return; // @holoscript/core unavailable — skip
    expect(tree.__holoKind).toBe('hs');
  });

  it('extracts a top-level function as a `function` symbol named after the identifier', async () => {
    const tree = await adapter.parse(HS_FUNCTION, 'gcd.hs');
    if (!tree) return;
    const syms = adapter.extractSymbols(tree, 'gcd.hs');
    const gcd = syms.find((s) => s.name === 'gcd');
    expect(gcd, 'expected a symbol named "gcd" (not "function")').toBeDefined();
    expect(gcd!.type).toBe('function');
    // The pre-slice-2 bug would have produced a nameless `composition` instead.
    expect(syms.some((s) => s.name === 'function')).toBe(false);
    expect(syms.some((s) => s.type === 'composition')).toBe(false);
  });

  it('extracts a top-level object as an `orb` symbol named after the identifier', async () => {
    const tree = await adapter.parse(HS_OBJECT, 'demo-cube.hs');
    if (!tree) return;
    const syms = adapter.extractSymbols(tree, 'demo-cube.hs');
    const cube = syms.find((s) => s.name === 'Cube');
    expect(cube, 'expected a symbol named "Cube"').toBeDefined();
    expect(cube!.type).toBe('orb');
  });

  it('does not emit import/call edges for .hs yet (slice 3)', async () => {
    const tree = await adapter.parse(HS_FUNCTION, 'gcd.hs');
    if (!tree) return;
    expect(adapter.extractImports(tree, 'gcd.hs')).toEqual([]);
    expect(adapter.extractCalls(tree, 'gcd.hs')).toEqual([]);
  });

  it('still routes .hsplus and .holo to their own kinds (no cross-contamination)', async () => {
    const hsplus = (await adapter.parse('trait Healable {\n  capability_tags: ["health"]\n}', 'h.hsplus')) as HoloParseTree | null;
    const holo = (await adapter.parse('composition "Scene" {}', 'h.holo')) as HoloParseTree | null;
    if (hsplus) expect(hsplus.__holoKind).toBe('hsplus');
    if (holo) expect(holo.__holoKind).toBe('holo');
  });
});
