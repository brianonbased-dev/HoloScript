import { describe, it, expect } from 'vitest';
import {
  buildKnownTraitSet,
  NATIVE2D_TRAITS,
  CODE_GRAPH_TRAITS,
} from '../knownTraitSet';
import { VR_TRAITS } from '../../constants';

describe('buildKnownTraitSet', () => {
  it('returns a Set', () => {
    expect(buildKnownTraitSet()).toBeInstanceOf(Set);
  });

  it('contains the Native2D / code-graph vocabulary that caused false positives', () => {
    const set = buildKnownTraitSet();
    // Design-required spot checks (Native2D reactive composition + code-graph).
    expect(set.has('fetch')).toBe(true);
    expect(set.has('bind')).toBe(true);
    expect(set.has('hook')).toBe(true);
    expect(set.has('view')).toBe(true);
    expect(set.has('reused_in')).toBe(true);
    expect(set.has('language_adapter')).toBe(true);
  });

  it('includes the full VR_TRAITS base (back-compat)', () => {
    const set = buildKnownTraitSet();
    expect(set.has('grabbable')).toBe(true);
    // Every VR trait must remain known.
    for (const t of VR_TRAITS) {
      expect(set.has(t)).toBe(true);
    }
  });

  it('includes every NATIVE2D_TRAITS and CODE_GRAPH_TRAITS entry', () => {
    const set = buildKnownTraitSet();
    for (const t of NATIVE2D_TRAITS) expect(set.has(t)).toBe(true);
    for (const t of CODE_GRAPH_TRAITS) expect(set.has(t)).toBe(true);
  });

  it('unions caller-supplied extras (flattened, plugin-contributed names)', () => {
    // extras accepts both nested arrays and bare strings; both must land in the set.
    const set = buildKnownTraitSet([['custom_plugin_trait'], 'another_one']);
    expect(set.has('custom_plugin_trait')).toBe(true);
    expect(set.has('another_one')).toBe(true);
    // Base vocabulary still present.
    expect(set.has('fetch')).toBe(true);
    expect(set.has('grabbable')).toBe(true);
  });

  it('default call (no extras) does not throw and is non-empty', () => {
    const set = buildKnownTraitSet();
    expect(set.size).toBeGreaterThan(0);
  });
});
