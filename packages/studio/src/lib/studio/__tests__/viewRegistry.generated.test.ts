import { describe, it, expect } from 'vitest';
import { GENERATED_VIEW_REGISTRY, GENERATED_VIEW_SLOTS } from '../viewRegistry.generated';
import { getStudioView, STUDIO_VIEW_REGISTRY } from '../viewRegistry';

/**
 * Dogfood proof slice (2026-05-31): the Studio view registry is derived from
 * per-panel `.holo` composition files (src/lib/studio/panels/*.holo) via
 * scripts/compile-view-registry.ts. This test PINS the generated output to the
 * hand-maintained STUDIO_VIEW_REGISTRY so the migration is provably faithful and
 * reversible: if a `.holo` drifts from the hand-TS source, this fails. Once the
 * full 76-view set is migrated and pinned, the hand-TS maps are deleted and the
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

  it('every generated view declares a React widget @slot mount', () => {
    for (const gen of GENERATED_VIEW_REGISTRY) {
      const slot = GENERATED_VIEW_SLOTS[gen.id];
      expect(slot, `slot for '${gen.id}'`).toBeTruthy();
      expect(slot.component).toBeTruthy();
      expect(slot.import.startsWith('@/')).toBe(true);
    }
  });
});
