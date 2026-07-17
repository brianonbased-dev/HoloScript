import { describe, expect, it } from 'vitest';
import { ConfabulationValidator } from '../ConfabulationValidator';

/**
 * Locks the opt-in derived-schema registration (trait props-schema enforcer, step 2).
 * Derived-from-.holo schemas must be OFF by default (existing callers keep the 63-schema
 * behavior) and, when enabled, must close the coverage gap WITHOUT overriding the richer
 * hand-written built-ins.
 */
describe('ConfabulationValidator — derived .holo schema registration', () => {
  it('does NOT register derived-only traits by default', () => {
    const v = new ConfabulationValidator();
    // `abtest` exists only in the .holo tree, never as a hand-written built-in.
    expect(v.getTraitSchema('abtest')).toBeUndefined();
  });

  it('registers derived-only traits when includeDerivedSchemas is on, with enum members', () => {
    const v = new ConfabulationValidator({ includeDerivedSchemas: true });
    const abtest = v.getTraitSchema('abtest');
    expect(abtest).toBeDefined();
    const strategy = abtest?.properties.find((p) => p.name === 'default_strategy');
    expect(strategy?.type).toBe('enum');
    expect(strategy?.enumValues).toContain('multi_armed_bandit');
  });

  it('lets hand-written built-ins win over derived on name conflict', () => {
    const v = new ConfabulationValidator({ includeDerivedSchemas: true });
    // `grabbable` is both a built-in (rich, with per-prop descriptions) and a .holo trait.
    const grabbable = v.getTraitSchema('grabbable');
    expect(grabbable).toBeDefined();
    // Only the hand-written built-in carries per-property `description` fields.
    expect(grabbable?.properties.some((p) => typeof p.description === 'string')).toBe(true);
  });
});
