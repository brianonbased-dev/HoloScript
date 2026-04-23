/**
 * @holoscript/openusd-plugin — ADAPTER CONTRACT TEST
 *
 * Contract gate for the OpenUSD column of the Universal-IR coverage matrix
 * (docs/universal-ir-coverage.md). MUST keep passing or the matrix row cannot
 * claim "🟡 Adapter + 🟡 Stub" status.
 *
 * Source: .ai-ecosystem/research/reviews/2026-04-23-wave-d-negative-sweep/stream-3-universal-ir-negative-sweep.md
 * Audit task: task_1776937048052_ybf4 (Wave D negative sweep, stream 3)
 *
 * Contract surface (what the adapter promises):
 *   1. Emitted USDA begins with the '#usda 1.0' magic header.
 *   2. The default prim name 'World' is declared in the preamble.
 *   3. primitive_count in the output matches the number of declared primitives.
 *   4. Every declared primitive path appears in the USDA body (sanitized form).
 *   5. usdaStableRoundTrip returns true for any well-formed input.
 *   6. Empty / missing primitives → single default Xform, no throw.
 *   7. LOC counter is non-zero and monotonic in primitive count.
 */
import { describe, it, expect } from 'vitest';
import * as mod from '../index';
import { exportToUsda, usdaStableRoundTrip, type UsdaExportInput } from '../index';

describe('CONTRACT: openusd-plugin adapter', () => {
  it('exposes exportToUsda + usdaStableRoundTrip at stable public paths', () => {
    expect(typeof mod.exportToUsda).toBe('function');
    expect(typeof mod.usdaStableRoundTrip).toBe('function');
  });

  it('emitted text starts with #usda 1.0 magic header', () => {
    const out = exportToUsda({ name: 't' });
    expect(out.usda.startsWith('#usda 1.0')).toBe(true);
  });

  it('declares defaultPrim "World" in the preamble', () => {
    const out = exportToUsda({ name: 't' });
    expect(out.usda).toContain('defaultPrim = "World"');
  });

  it('primitive_count matches declared primitives length', () => {
    const prims: UsdaExportInput['primitives'] = [
      { kind: 'mesh', path: 'a' },
      { kind: 'xform', path: 'b' },
      { kind: 'light', path: 'c' },
    ];
    const out = exportToUsda({ name: 's', primitives: prims });
    expect(out.primitive_count).toBe(3);
  });

  it('every declared primitive path appears in emitted USDA (sanitized)', () => {
    const out = exportToUsda({
      name: 's',
      primitives: [
        { kind: 'mesh', path: 'char-one/body' },
        { kind: 'xform', path: 'camera.main' },
      ],
    });
    expect(out.usda).toContain('char_one_body');
    expect(out.usda).toContain('camera_main');
  });

  it('usdaStableRoundTrip returns true for well-formed input', () => {
    const ok = usdaStableRoundTrip({
      name: 's',
      primitives: [{ kind: 'xform', path: 'rig/root' }, { kind: 'mesh', path: 'ground' }],
    });
    expect(ok).toBe(true);
  });

  it('empty / missing primitives yields a single default Xform (no throw)', () => {
    expect(() => exportToUsda({ name: 't' })).not.toThrow();
    const out = exportToUsda({ name: 't' });
    expect(out.primitive_count).toBe(1);
    expect(out.usda).toContain('def Xform');
  });

  it('LOC is non-zero and monotonic: more primitives → more LOC', () => {
    const small = exportToUsda({ name: 's', primitives: [{ kind: 'xform', path: 'a' }] });
    const big = exportToUsda({
      name: 's',
      primitives: [
        { kind: 'xform', path: 'a' },
        { kind: 'xform', path: 'b' },
        { kind: 'xform', path: 'c' },
      ],
    });
    expect(small.loc).toBeGreaterThan(0);
    expect(big.loc).toBeGreaterThan(small.loc);
  });
});
