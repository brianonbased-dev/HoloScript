import { describe, it, expect, beforeEach } from 'vitest';
import { DeprecationRegistry, createDeprecationRegistry } from '../deprecation/DeprecationRegistry';
import type { DeprecationEntry, DeprecationSeverity } from '../deprecation/DeprecationRegistry';

// =============================================================================
// C222 — Deprecation Registry
// =============================================================================

function makeEntry(overrides: Partial<DeprecationEntry> = {}): DeprecationEntry {
  return {
    id: overrides.id ?? 'dep-1',
    type: overrides.type ?? 'trait',
    name: overrides.name ?? 'OldTrait',
    message: overrides.message ?? 'Use NewTrait instead',
    replacement: overrides.replacement ?? 'NewTrait',
    severity: overrides.severity ?? ('warning' as DeprecationSeverity),
  };
}

describe('DeprecationRegistry', () => {
  let reg: DeprecationRegistry;

  beforeEach(() => {
    reg = createDeprecationRegistry();
    reg.clear(); // clear built-in so we start fresh
  });

  it('register adds entry', () => {
    reg.register(makeEntry());
    expect(reg.getAll()).toHaveLength(1);
  });

  it('register prevents duplicate IDs (overwrites)', () => {
    reg.register(makeEntry({ id: 'x' }));
    reg.register(makeEntry({ id: 'x', name: 'Updated' }));
    expect(reg.getAll()).toHaveLength(1);
    expect(reg.get('x')?.name).toBe('Updated');
  });

  it('get returns undefined for unknown ID', () => {
    expect(reg.get('nonexistent')).toBeUndefined();
  });

  it('isTraitDeprecated finds trait entries', () => {
    reg.register(makeEntry({ type: 'trait', name: 'SomeTrait' }));
    expect(reg.isTraitDeprecated('SomeTrait')).toBeDefined();
    expect(reg.isTraitDeprecated('Unknown')).toBeUndefined();
  });

  it('isPropertyDeprecated finds property entries', () => {
    reg.register(makeEntry({ id: 'p1', type: 'property', name: 'oldProp' }));
    expect(reg.isPropertyDeprecated('oldProp')).toBeDefined();
  });

  it('isFunctionDeprecated finds function entries', () => {
    reg.register(makeEntry({ id: 'f1', type: 'function', name: 'legacyFn' }));
    expect(reg.isFunctionDeprecated('legacyFn')).toBeDefined();
    expect(reg.isFunctionDeprecated('nope')).toBeUndefined();
  });

  it('getDeprecatedTraits returns only traits', () => {
    reg.register(makeEntry({ id: 'a', type: 'trait', name: 'T1' }));
    reg.register(makeEntry({ id: 'b', type: 'function', name: 'F1' }));
    expect(reg.getDeprecatedTraits()).toHaveLength(1);
    expect(reg.getDeprecatedTraits()[0].name).toBe('T1');
  });

  it('getDeprecatedProperties returns only properties', () => {
    reg.register(makeEntry({ id: 'a', type: 'property', name: 'P1' }));
    reg.register(makeEntry({ id: 'b', type: 'trait', name: 'T1' }));
    expect(reg.getDeprecatedProperties()).toHaveLength(1);
  });

  it('getDeprecatedFunctions returns only functions', () => {
    reg.register(makeEntry({ id: 'a', type: 'function', name: 'fn1' }));
    reg.register(makeEntry({ id: 'b', type: 'function', name: 'fn2' }));
    expect(reg.getDeprecatedFunctions()).toHaveLength(2);
  });

  it('clear removes all entries', () => {
    reg.register(makeEntry());
    reg.clear();
    expect(reg.getAll()).toHaveLength(0);
  });

  it('constructor auto-registers built-in deprecations', () => {
    const fresh = createDeprecationRegistry();
    expect(fresh.getAll().length).toBeGreaterThan(0);
    expect(fresh.isTraitDeprecated('talkable')).toBeDefined();
  });

  it('checkSyntax detects on_event pattern', () => {
    const fresh = createDeprecationRegistry();
    const matches = fresh.checkSyntax('on_event("click")');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].entry.id).toBe('syntax-old-event');
  });

  it('checkSyntax returns location info', () => {
    const fresh = createDeprecationRegistry();
    const matches = fresh.checkSyntax('var x = 5');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].location?.line).toBe(1);
    expect(matches[0].location?.column).toBeGreaterThanOrEqual(1);
  });

  it('createDeprecationRegistry returns independent instances', () => {
    const r1 = createDeprecationRegistry();
    const r2 = createDeprecationRegistry();
    r1.clear();
    expect(r1.getAll()).toHaveLength(0);
    expect(r2.getAll().length).toBeGreaterThan(0);
  });
});
