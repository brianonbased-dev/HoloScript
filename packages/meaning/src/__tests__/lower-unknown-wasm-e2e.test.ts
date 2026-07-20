/**
 * End-to-end proof of the lowering bridge against the REAL grammar authority: parse actual
 * HoloScript source with the compiled WASM artifact, walk the actual JSON AST, and lower the
 * @unknown field it captured. This is the drift guard for the structural LowerableField subset —
 * if the authority's PropertyNode JSON shape changes, THIS fails, not production.
 *
 * Pattern follows the canonical core parity test: createRequire + filesystem path + skipIf, so
 * the suite SKIPS LOUDLY when the artifact is absent (never silently passes), and @holoscript/
 * meaning gains no package.json dependency on the WASM package.
 */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lowerUnknownFields } from '../lower-unknown';
import { isKnown } from '../uncertain';

const here = path.dirname(fileURLToPath(import.meta.url));
const PKG_NODE = path.resolve(here, '../../../compiler-wasm/pkg-node/holoscript_wasm.js');
const wasmPresent = fs.existsSync(PKG_NODE);
const requireCjs = createRequire(import.meta.url);

describe.skipIf(!wasmPresent)('lowering bridge e2e (real WASM artifact)', () => {
  it('parses @unknown at the surface and lowers it to Uncertain — grammar to meaning, no mocks', () => {
    const wasm = requireCjs(PKG_NODE) as { parse(source: string): string };
    const source = [
      '@trait Sensor {',
      '  @unknown',
      '  reading: Temperature?',
      '  label: "probe"',
      '}',
    ].join('\n');

    const ast = JSON.parse(wasm.parse(source));
    expect(ast.errors).toBeUndefined();

    const trait = ast.body.find(
      (node: { type: string; name?: string }) => node.type === 'Trait' && node.name === 'Sensor'
    );
    expect(trait).toBeDefined();
    const properties = trait.config.properties as Array<Record<string, unknown>>;

    const lowered = lowerUnknownFields(properties as never);
    expect(lowered).toHaveLength(1);
    const [reading] = lowered;
    expect(reading.key).toBe('reading');
    expect(reading.typeName).toBe('Temperature');
    expect(reading.optional).toBe(true); // the ? axis, captured by the grammar, carried through
    expect(isKnown(reading.initial)).toBe(false);
    if (!isKnown(reading.initial)) {
      expect(reading.initial.reason).toBe('underdetermined');
    }
  });

  it('the enforcement and the lowering agree on what a guard is (validate_detailed cross-check)', () => {
    const wasm = requireCjs(PKG_NODE) as { validate_detailed(source: string): string };
    // The same source the lowering accepts must pass the compiler's own @unknown enforcement
    // when guarded — one contract across the grammar, the semantic check, and this bridge.
    const guarded = '@trait S {\n  @unknown\n  reading: Temperature\n  display: reading ?? 20.0\n}';
    expect(JSON.parse(wasm.validate_detailed(guarded)).valid).toBe(true);
    const unguarded = '@trait S {\n  @unknown\n  reading: Temperature\n  display: reading\n}';
    expect(JSON.parse(wasm.validate_detailed(unguarded)).valid).toBe(false);
  });

  it('a declared default is a fallback by construction — grammar, enforcement, and lowering agree', () => {
    const wasm = requireCjs(PKG_NODE) as { parse(source: string): string; validate_detailed(source: string): string };
    const source = '@trait S {\n  @unknown\n  reading: Temperature = 20.0\n  display: reading\n}';
    // Enforcement: the bare read of the DEFAULTED @unknown field is admitted.
    expect(JSON.parse(wasm.validate_detailed(source)).valid).toBe(true);
    // Lowering: the default survives the real artifact's JSON, and initial stays unknown.
    const ast = JSON.parse(wasm.parse(source));
    const trait = ast.body.find((n: { type: string }) => n.type === 'Trait');
    const lowered = lowerUnknownFields(trait.config.properties);
    expect(lowered).toHaveLength(1);
    expect(lowered[0].declaredDefault).toMatchObject({ type: 'Number', value: 20 });
    expect(isKnown(lowered[0].initial)).toBe(false);
  });
});
