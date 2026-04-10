/**
 * no-deprecated Rule Production Tests
 *
 * Tests LinterDeprecationRegistry (register, scan, format) and
 * NoDeprecatedRule (registerBuiltins, check, formatReport).
 */

import { describe, it, expect } from 'vitest';
import { LinterDeprecationRegistry, NoDeprecatedRule } from '../rules/no-deprecated';
import type { DeprecationEntry } from '../rules/no-deprecated';

describe('no-deprecated rule — Production', () => {
  // ─── LinterDeprecationRegistry ────────────────────────────────────────────

  it('register and scan finds usage', () => {
    const reg = new LinterDeprecationRegistry();
    reg.register({
      name: 'oldTrait',
      kind: 'trait',
      message: 'oldTrait is deprecated',
      replacement: '@newTrait',
    });
    const warnings = reg.scanForUsages('object Foo {\n  @oldTrait\n}', 'test.hsplus');
    expect(warnings.length).toBe(1);
    expect(warnings[0].entry.name).toBe('oldTrait');
    expect(warnings[0].line).toBe(2);
  });

  it('scan returns empty for clean source', () => {
    const reg = new LinterDeprecationRegistry();
    reg.register({ name: 'legacy', kind: 'trait', message: 'deprecated' });
    const warnings = reg.scanForUsages('object Foo {\n  @modern\n}', 'clean.hsplus');
    expect(warnings).toEqual([]);
  });

  it('scan finds multiple occurrences', () => {
    const reg = new LinterDeprecationRegistry();
    reg.register({ name: 'old', kind: 'trait', message: 'deprecated' });
    const source = '@old\n@old\n@old';
    const warnings = reg.scanForUsages(source, 'multi.hsplus');
    expect(warnings.length).toBe(3);
  });

  it('formatWarning includes replacement and version info', () => {
    const reg = new LinterDeprecationRegistry();
    const entry: DeprecationEntry = {
      name: 'clickable',
      kind: 'trait',
      message: 'The @clickable trait is deprecated',
      replacement: '@interactive',
      deprecatedIn: '2.0',
      removedIn: '3.0',
    };
    const formatted = reg.formatWarning({
      entry,
      filePath: 'test.hsplus',
      line: 5,
      column: 3,
      usageLine: '  @clickable',
    });
    expect(formatted).toContain('DEPRECATED');
    expect(formatted).toContain('@interactive');
    expect(formatted).toContain('since 2.0');
    expect(formatted).toContain('removed in 3.0');
  });

  // ─── NoDeprecatedRule ─────────────────────────────────────────────────────

  it('registerBuiltins adds default deprecated items', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const files = new Map([['test.hsplus', 'object X {\n  @clickable\n  @talkable\n}']]);
    const warnings = rule.check(files);
    expect(warnings.length).toBe(2);
  });

  it('check across multiple files', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const files = new Map([
      ['a.hsplus', '@clickable'],
      ['b.hsplus', '@collidable'],
      ['c.hsplus', '@modern'], // clean
    ]);
    const warnings = rule.check(files);
    expect(warnings.length).toBe(2);
  });

  it('formatReport with no warnings', () => {
    const rule = new NoDeprecatedRule();
    const report = rule.formatReport([]);
    expect(report).toContain('No deprecation warnings');
  });

  it('formatReport with warnings', () => {
    const rule = new NoDeprecatedRule();
    rule.registerBuiltins();
    const warnings = rule.check(new Map([['test.hsplus', '@clickable\n@talkable']]));
    const report = rule.formatReport(warnings);
    expect(report).toContain('2 deprecation warning');
    expect(report).toContain('DEPRECATED');
  });

  it('custom registry injection', () => {
    const customRegistry = new LinterDeprecationRegistry();
    customRegistry.register({
      name: 'myCustomTrait',
      kind: 'trait',
      message: 'Custom deprecation',
    });
    const rule = new NoDeprecatedRule(customRegistry);
    const warnings = rule.check(new Map([['x.hsplus', '@myCustomTrait']]));
    expect(warnings.length).toBe(1);
    expect(warnings[0].entry.name).toBe('myCustomTrait');
  });
});
