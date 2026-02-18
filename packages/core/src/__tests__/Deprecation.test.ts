/**
 * Deprecation.test.ts - Sprint 5: Deprecation Warnings
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeprecationRegistry,
  NoDeprecatedRule,
  type DeprecationEntry,
  type DeprecationWarning,
} from '../analysis/DeprecationRegistry';

describe('DeprecationRegistry', () => {
  let registry: DeprecationRegistry;
  beforeEach(() => { registry = new DeprecationRegistry(); });

  it('register() adds an entry', () => {
    registry.register({ name: 'clickable', kind: 'trait', message: 'Use @interactive instead' });
    expect(registry.has('clickable')).toBe(true);
    expect(registry.getAll()).toHaveLength(1);
  });
  it('has() returns false for unknown symbol', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });
  it('get() returns the entry by name', () => {
    const entry: DeprecationEntry = { name: 'oldTrait', kind: 'trait', message: 'Use newTrait', replacement: 'newTrait' };
    registry.register(entry);
    const result = registry.get('oldTrait');
    expect(result).toBeDefined();
    expect(result?.kind).toBe('trait');
    expect(result?.replacement).toBe('newTrait');
  });
  it('get() returns undefined for unknown name', () => {
    expect(registry.get('ghost')).toBeUndefined();
  });
  it('getAll() returns all registered entries', () => {
    registry.register({ name: 'a', kind: 'trait', message: 'msg a' });
    registry.register({ name: 'b', kind: 'property', message: 'msg b' });
    expect(registry.getAll()).toHaveLength(2);
  });
  it('register() overwrites duplicate name', () => {
    registry.register({ name: 'foo', kind: 'trait', message: 'old' });
    registry.register({ name: 'foo', kind: 'template', message: 'new' });
    expect(registry.getAll()).toHaveLength(1);
    expect(registry.get('foo')?.message).toBe('new');
  });
  it('clear() removes all entries', () => {
    registry.register({ name: 'x', kind: 'trait', message: 'm' });
    registry.clear();
    expect(registry.getAll()).toHaveLength(0);
    expect(registry.has('x')).toBe(false);
  });

  it('parseAnnotations() parses simple annotation', () => {
    const source = [
      `@deprecated("Use @interactive instead")`,
      `@clickable`,
    ].join('\n');
    const entries = DeprecationRegistry.parseAnnotations(source);
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('clickable');
    expect(entries[0].message).toBe('Use @interactive instead');
    expect(entries[0].replacement).toBe('@interactive');
  });
  it('parseAnnotations() parses since and until', () => {
    const s = `@deprecated("Use newTrait instead", since: "2.3", until: "3.0")
trait OldTrait`;
    const entries = DeprecationRegistry.parseAnnotations(s);
    expect(entries).toHaveLength(1);
    expect(entries[0].deprecatedIn).toBe('2.3');
    expect(entries[0].removedIn).toBe('3.0');
  });
  it('parseAnnotations() infers kind from keyword', () => {
    const s = `@deprecated("Use other instead")
template LegacyTemplate`;
    const entries = DeprecationRegistry.parseAnnotations(s);
    expect(entries[0].kind).toBe('template');
    expect(entries[0].name).toBe('LegacyTemplate');
  });
  it('parseAnnotations() defaults kind to trait', () => {
    const s = `@deprecated("Use @new instead")
@oldSymbol`;
    const entries = DeprecationRegistry.parseAnnotations(s);
    expect(entries[0].kind).toBe('trait');
  });
  it('parseAnnotations() returns empty when no annotations', () => {
    expect(DeprecationRegistry.parseAnnotations('orb#myOrb {}') ).toHaveLength(0);
  });
  it('parseAnnotations() skips with no following symbol', () => {
    expect(DeprecationRegistry.parseAnnotations(`@deprecated("msg")`)).toHaveLength(0);
  });

  it('scanForUsages() finds deprecated trait in source', () => {
    registry.register({ name: 'clickable', kind: 'trait', message: 'Use @interactive instead', replacement: '@interactive' });
    const source = 'orb#btn {\n  @clickable\n  color: "red"\n}';
    const warnings = registry.scanForUsages(source, 'test.holo');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].entry.name).toBe('clickable');
    expect(warnings[0].line).toBe(2);
    expect(warnings[0].filePath).toBe('test.holo');
  });
  it('scanForUsages() finds multiple usages across lines', () => {
    registry.register({ name: 'talkable', kind: 'trait', message: 'Use @voice' });
    const source = '@talkable\norb#a { @talkable }\n';
    const warnings = registry.scanForUsages(source, 'file.holo');
    expect(warnings).toHaveLength(2);
  });
  it('scanForUsages() returns empty for non-deprecated symbols', () => {
    registry.register({ name: 'clickable', kind: 'trait', message: 'deprecated' });
    const source = 'orb#btn { @grabbable @hoverable }';
    const warnings = registry.scanForUsages(source, 'file.holo');
    expect(warnings).toHaveLength(0);
  });
  it('scanForUsages() includes correct column info', () => {
    registry.register({ name: 'collidable', kind: 'trait', message: 'Use @physics' });
    const warnings = registry.scanForUsages('  @collidable', 'f.holo');
    expect(warnings[0].column).toBe(3);
  });
  it('scanForUsages() includes the usageLine', () => {
    registry.register({ name: 'clickable', kind: 'trait', message: 'deprecated' });
    const warnings = registry.scanForUsages('  @clickable { action: tap }', 'f.holo');
    expect(warnings[0].usageLine).toContain('@clickable');
  });

  it('formatWarning() returns string with file/line/column info', () => {
    registry.register({ name: 'clickable', kind: 'trait', message: 'Use @interactive instead', replacement: '@interactive' });
    const warning: DeprecationWarning = {
      entry: registry.get('clickable')!,
      filePath: 'src/scene.holo',
      line: 10, column: 3,
      usageLine: '  @clickable',
    };
    const formatted = registry.formatWarning(warning);
    expect(formatted).toContain('src/scene.holo');
    expect(formatted).toContain('10');
    expect(formatted).toContain('3');
    expect(formatted).toContain('clickable');
    expect(formatted).toContain('@interactive');
  });
  it('formatWarning() includes deprecatedIn and removedIn', () => {
    registry.register({ name: 'talkable', kind: 'trait', message: 'Deprecated', deprecatedIn: '2.0', removedIn: '3.0' });
    const warning: DeprecationWarning = {
      entry: registry.get('talkable')!,
      filePath: 'f.holo', line: 1, column: 1, usageLine: '@talkable',
    };
    const formatted = registry.formatWarning(warning);
    expect(formatted).toContain('2.0');
    expect(formatted).toContain('3.0');
  });
});

describe('NoDeprecatedRule', () => {
  it('registerBuiltins() registers built-in deprecated symbols', () => {
    const registry = new DeprecationRegistry();
    const rule = new NoDeprecatedRule(registry);
    rule.registerBuiltins();
    expect(registry.has('clickable') ).toBe(true);
    expect(registry.has('talkable') ).toBe(true);
    expect(registry.has('collidable') ).toBe(true);
  });
  it('check() returns warnings for deprecated usage', () => {
    const registry = new DeprecationRegistry();
    registry.register({ name: 'clickable', kind: 'trait', message: 'Use @interactive' });
    const rule = new NoDeprecatedRule(registry);
    const files = new Map([['scene.holo', 'orb#btn {\n  @clickable\n}']]);
    const warnings = rule.check(files);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].entry.name).toBe('clickable');
    expect(warnings[0].filePath).toBe('scene.holo');
  });
  it('check() scans multiple files', () => {
    const registry = new DeprecationRegistry();
    registry.register({ name: 'talkable', kind: 'trait', message: 'deprecated' });
    const rule = new NoDeprecatedRule(registry);
    const files = new Map([['a.holo', '@talkable'], ['b.holo', '@talkable']]);
    expect(rule.check(files)).toHaveLength(2);
  });
  it('check() returns no warnings for non-deprecated files', () => {
    const registry = new DeprecationRegistry();
    registry.register({ name: 'clickable', kind: 'trait', message: 'deprecated' });
    const rule = new NoDeprecatedRule(registry);
    const files = new Map([['clean.holo', 'orb#btn { @grabbable @hoverable }']]);
    expect(rule.check(files)).toHaveLength(0);
  });
  it('formatReport() returns no-warning message for empty array', () => {
    const rule = new NoDeprecatedRule();
    expect(rule.formatReport([])).toContain('No deprecation');
  });
  it('formatReport() formats warnings into a readable report', () => {
    const registry = new DeprecationRegistry();
    registry.register({ name: 'clickable', kind: 'trait', message: 'Use @interactive instead', replacement: '@interactive' });
    const rule = new NoDeprecatedRule(registry);
    const files = new Map([['scene.holo', '@clickable']]);
    const warnings = rule.check(files);
    const report = rule.formatReport(warnings);
    expect(report).toContain('1 deprecation warning');
    expect(report).toContain('clickable');
  });
  it('NoDeprecatedRule uses a fresh registry by default', () => {
    const rule1 = new NoDeprecatedRule();
    const rule2 = new NoDeprecatedRule();
    rule1.registerBuiltins();
    const files = new Map([['f.holo', '@clickable']]);
    expect(rule2.check(files)).toHaveLength(0);
  });
});
