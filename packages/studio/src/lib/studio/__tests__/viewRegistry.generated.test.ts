import { describe, it, expect } from 'vitest';
import {
  GENERATED_VIEW_IDS,
  GENERATED_VIEW_REGISTRY,
  GENERATED_VIEW_SLOTS,
} from '../viewRegistry.generated';
import { VIEW_COMPONENTS } from '../viewRegistry.components';
import { getStudioView, STUDIO_VIEW_REGISTRY } from '../viewRegistry';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const;

function resolveAliasImport(importPath: string): string {
  expect(importPath.startsWith('@/'), `slot.import '${importPath}' uses @ alias`).toBe(true);
  const base = join(process.cwd(), 'src', importPath.slice(2));
  for (const ext of EXTENSIONS) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate;
  }
  for (const ext of EXTENSIONS) {
    const candidate = join(base, `index${ext}`);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Could not resolve ${importPath}`);
}

function hasNamedExport(source: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`export\\s+(function|const|class)\\s+${escaped}\\b`).test(source) ||
    new RegExp(`export\\s+\\{[^}]*\\b${escaped}\\b`).test(source);
}

/**
 * Dogfood proof slice (2026-05-31): the Studio view registry is derived from
 * per-panel `.holo` composition files (src/lib/studio/panels/*.holo) via
 * scripts/compile-view-registry.ts. This test PINS the generated output to the
 * hand-maintained STUDIO_VIEW_REGISTRY so the migration is provably faithful and
 * reversible: if a `.holo` drifts from the hand-TS source, this fails. Once the
 * full view set is migrated and pinned, the hand-TS maps are deleted and the
 * generated registry becomes the single source of truth.
 */
describe('viewRegistry.generated — .holo-derived registry pinned to hand-TS', () => {
  it('every generated view deep-equals its hand-TS registry entry (no drift)', () => {
    expect(GENERATED_VIEW_REGISTRY.length).toBeGreaterThan(0);
    for (const gen of GENERATED_VIEW_REGISTRY) {
      const hand = getStudioView(gen.id);
      expect(hand, `hand-TS registry has '${gen.id}'`).toBeTruthy();
      // Deep-equal proves .holo @view metadata faithfully reproduces every field.
      expect(gen, `generated view '${gen.id}' matches hand-TS`).toEqual(hand);
    }
  });

  it('migrates the entire account-workspace surface class', () => {
    const hand = STUDIO_VIEW_REGISTRY.filter((v) => v.surfaceClass === 'account-workspace')
      .map((v) => v.id)
      .sort();
    const gen = GENERATED_VIEW_REGISTRY.filter((v) => v.surfaceClass === 'account-workspace')
      .map((v) => v.id)
      .sort();
    expect(gen).toEqual(hand);
  });

  it('round-trips the relational exclusiveWith field (the premortem ceiling test)', () => {
    const timeline = GENERATED_VIEW_REGISTRY.find((v) => v.id === 'timeline');
    const shaderEditor = GENERATED_VIEW_REGISTRY.find((v) => v.id === 'shaderEditor');
    expect(timeline?.exclusiveWith).toEqual(['shaderEditor']);
    expect(shaderEditor?.exclusiveWith).toEqual(['timeline']);
  });

  it('covers the ENTIRE hand-TS registry bidirectionally', () => {
    const handIds = STUDIO_VIEW_REGISTRY.map((v) => v.id).sort();
    const genIds = GENERATED_VIEW_REGISTRY.map((v) => v.id).sort();
    // Every hand-TS view is .holo-derived AND nothing extra is invented.
    expect(genIds).toEqual(handIds);
  });

  it('preserves the curated registry order (no silent command-palette reorder)', () => {
    // The flip to generated-as-source must not reorder STUDIO_VIEW_REGISTRY (the
    // command palette is built from it in order). @view `order` pins it.
    expect(GENERATED_VIEW_REGISTRY.map((v) => v.id)).toEqual(STUDIO_VIEW_REGISTRY.map((v) => v.id));
  });

  it('declares one component mount for every generated view', () => {
    expect(Object.keys(GENERATED_VIEW_SLOTS).sort()).toEqual([...GENERATED_VIEW_IDS].sort());

    for (const id of GENERATED_VIEW_IDS) {
      const slot = GENERATED_VIEW_SLOTS[id];
      expect(slot, `slot for '${id}'`).toBeTruthy();
      expect(slot.component, `slot.component for '${id}'`).toBeTruthy();
      expect(slot.import.startsWith('@/'), `slot.import for '${id}'`).toBe(true);
      expect(VIEW_COMPONENTS[id], `VIEW_COMPONENTS['${id}']`).toBeTruthy();

      const source = readFileSync(resolveAliasImport(slot.import), 'utf8');
      expect(hasNamedExport(source, slot.component), `${slot.import} exports ${slot.component}`).toBe(
        true
      );
    }
  });
});
