/**
 * DeprecationRegistry + NoDeprecatedRule — Production Test Suite
 *
 * Covers: register, has, get, getAll, clear, scanForUsages,
 * parseAnnotations, formatWarning, NoDeprecatedRule (builtins, check, formatReport).
 */
import { describe, it, expect } from 'vitest';
import { DeprecationRegistry, NoDeprecatedRule } from '../DeprecationRegistry';

const ENTRY = {
  name: 'oldTrait',
  kind: 'trait' as const,
  message: 'Use newTrait instead',
  deprecatedIn: '2.0',
  removedIn: '3.0',
  replacement: 'newTrait',
};

describe('DeprecationRegistry — Production', () => {
  it('register/has/get work', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    expect(r.has('oldTrait')).toBe(true);
    expect(r.get('oldTrait')?.replacement).toBe('newTrait');
  });

  it('getAll returns all entries', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    r.register({ name: 'b', kind: 'property', message: 'gone' });
    expect(r.getAll().length).toBe(2);
  });

  it('clear removes all', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    r.clear();
    expect(r.has('oldTrait')).toBe(false);
  });

  it('scanForUsages finds @symbol usages', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    const src = 'object Ball {\n  @oldTrait\n  position {}\n}';
    const warnings = r.scanForUsages(src, 'test.holo');
    expect(warnings.length).toBe(1);
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].entry.name).toBe('oldTrait');
  });

  it('scanForUsages returns empty for clean source', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    const warnings = r.scanForUsages('object A {}', 'test.holo');
    expect(warnings.length).toBe(0);
  });

  it('formatWarning produces readable string', () => {
    const r = new DeprecationRegistry();
    r.register(ENTRY);
    const warnings = r.scanForUsages('@oldTrait', 'f.holo');
    const fmt = r.formatWarning(warnings[0]);
    expect(fmt).toContain('DEPRECATED');
    expect(fmt).toContain('oldTrait');
    expect(fmt).toContain('newTrait');
  });

  it('parseAnnotations extracts @deprecated entries', () => {
    const src = `@deprecated("Use newThing instead", since: "2.0", until: "3.0")\ntrait OldThing {}`;
    const entries = DeprecationRegistry.parseAnnotations(src);
    expect(entries.length).toBe(1);
    expect(entries[0].name).toBe('OldThing');
    expect(entries[0].replacement).toBe('newThing');
    expect(entries[0].deprecatedIn).toBe('2.0');
  });
});

describe('NoDeprecatedRule — Production', () => {
  it('registerBuiltins populates registry', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const files = new Map([['test.holo', '@clickable\n@talkable\n@collidable']]);
    const warnings = rule.check(files);
    expect(warnings.length).toBeGreaterThanOrEqual(3);
  });

  it('check scans multiple files', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const files = new Map([
      ['a.holo', '@clickable'],
      ['b.holo', 'object Clean {}'],
    ]);
    const warnings = rule.check(files);
    expect(warnings.length).toBe(1);
    expect(warnings[0].filePath).toBe('a.holo');
  });

  it('formatReport generates summary', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const w = rule.check(new Map([['x.holo', '@clickable']]));
    const report = rule.formatReport(w);
    expect(report).toContain('1 deprecation warning');
  });

  it('formatReport handles zero warnings', () => {
    const rule = new NoDeprecatedRule();
    const report = rule.formatReport([]);
    expect(report).toContain('No deprecation warnings');
  });
});
