/**
 * DeprecatedInventory Tests
 *
 * Gap 5: Validates SCARF-inspired deprecated symbol tracking.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  DeprecatedInventoryBuilder,
  createDeprecatedInventoryBuilder,
  extractExportsFromSource,
} from '../DeprecatedInventory';

describe('DeprecatedInventoryBuilder', () => {
  let builder: DeprecatedInventoryBuilder;

  beforeEach(() => {
    builder = createDeprecatedInventoryBuilder();
  });

  it('starts with empty inventory', () => {
    const inv = builder.build();
    expect(inv.totalSymbols).toBe(0);
  });

  it('adds symbols as DEAD by default', () => {
    builder.addSymbol('oldFunction', 'deprecated/old.ts', 'function');
    const inv = builder.build();
    expect(inv.totalSymbols).toBe(1);
    expect(inv.byClassification.DEAD).toBe(1);
  });

  it('promotes to REFERENCED when importer recorded', () => {
    builder.addSymbol('oldFunction', 'deprecated/old.ts', 'function');
    builder.recordImporter('oldFunction', 'src/consumer.ts');
    const inv = builder.build();
    expect(inv.byClassification.DEAD).toBe(0);
    expect(inv.byClassification.REFERENCED).toBe(1);
    expect(inv.symbols[0].importerCount).toBe(1);
    expect(inv.symbols[0].importerFiles).toContain('src/consumer.ts');
  });

  it('tracks multiple importers', () => {
    builder.addSymbol('oldClass', 'deprecated/old.ts', 'class');
    builder.recordImporter('oldClass', 'src/a.ts');
    builder.recordImporter('oldClass', 'src/b.ts');
    builder.recordImporter('oldClass', 'src/a.ts'); // duplicate - should not count twice
    const inv = builder.build();
    expect(inv.symbols[0].importerCount).toBe(2);
  });

  it('marks symbols as DYNAMIC', () => {
    builder.addSymbol('dynamicFn', 'deprecated/dyn.ts', 'function');
    builder.markDynamic('dynamicFn');
    const inv = builder.build();
    expect(inv.byClassification.DYNAMIC).toBe(1);
  });

  it('marks MCP runtime usage', () => {
    builder.addSymbol('mcpTool', 'deprecated/mcp.ts', 'function');
    builder.markMCPRuntime('mcpTool');
    const inv = builder.build();
    expect(inv.symbols[0].usedInMCPRuntime).toBe(true);
    expect(inv.symbols[0].classification).toBe('DYNAMIC');
  });

  it('sets suggested replacement', () => {
    builder.addSymbol('oldFn', 'deprecated/old.ts', 'function');
    builder.setSuggestedReplacement('oldFn', 'newFn');
    const inv = builder.build();
    expect(inv.symbols[0].suggestedReplacement).toBe('newFn');
  });

  describe('generateMigrationPlans', () => {
    it('generates delete plan for DEAD symbols', () => {
      builder.addSymbol('deadFn', 'deprecated/dead.ts', 'function');
      const plans = builder.generateMigrationPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].action).toBe('delete');
      expect(plans[0].riskLevel).toBe('low');
    });

    it('generates codemod plan for REFERENCED symbols with replacement', () => {
      builder.addSymbol('refFn', 'deprecated/ref.ts', 'function');
      builder.recordImporter('refFn', 'src/a.ts');
      builder.setSuggestedReplacement('refFn', 'newRefFn');
      const plans = builder.generateMigrationPlans();
      expect(plans[0].action).toBe('codemod');
    });

    it('generates promote plan for REFERENCED symbols without replacement', () => {
      builder.addSymbol('noReplace', 'deprecated/nr.ts', 'function');
      builder.recordImporter('noReplace', 'src/a.ts');
      const plans = builder.generateMigrationPlans();
      expect(plans[0].action).toBe('promote');
    });

    it('generates manual plan for DYNAMIC symbols', () => {
      builder.addSymbol('dynFn', 'deprecated/dyn.ts', 'function');
      builder.markDynamic('dynFn');
      const plans = builder.generateMigrationPlans();
      expect(plans[0].action).toBe('manual');
      expect(plans[0].riskLevel).toBe('high');
    });
  });

  it('generates summary string', () => {
    builder.addSymbol('a', 'x.ts', 'function');
    builder.addSymbol('b', 'y.ts', 'class');
    builder.recordImporter('b', 'z.ts');
    const summary = builder.getSummary();
    expect(summary).toContain('Total: 2');
    expect(summary).toContain('DEAD: 1');
    expect(summary).toContain('REFERENCED: 1');
  });
});

describe('extractExportsFromSource', () => {
  it('extracts function exports', () => {
    const source = 'export function myFunc() {}';
    const exports = extractExportsFromSource(source);
    expect(exports.some(e => e.name === 'myFunc' && e.type === 'function')).toBe(true);
  });

  it('extracts class exports', () => {
    const source = 'export class MyClass {}';
    const exports = extractExportsFromSource(source);
    expect(exports.some(e => e.name === 'MyClass' && e.type === 'class')).toBe(true);
  });

  it('extracts const exports', () => {
    const source = 'export const MY_CONST = 42;';
    const exports = extractExportsFromSource(source);
    expect(exports.some(e => e.name === 'MY_CONST' && e.type === 'const')).toBe(true);
  });

  it('extracts interface exports', () => {
    const source = 'export interface MyInterface { x: number; }';
    const exports = extractExportsFromSource(source);
    expect(exports.some(e => e.name === 'MyInterface' && e.type === 'interface')).toBe(true);
  });

  it('extracts re-exports', () => {
    const source = 'export { Foo, Bar } from "./module";';
    const exports = extractExportsFromSource(source);
    expect(exports.some(e => e.name === 'Foo')).toBe(true);
    expect(exports.some(e => e.name === 'Bar')).toBe(true);
  });

  it('handles multiple export types', () => {
    const source = [
      'export function fn() {}',
      'export class Cls {}',
      'export const VAL = 1;',
      'export interface Iface {}',
      'export type MyType = string;',
      'export enum MyEnum { A, B }',
    ].join('\n');

    const exports = extractExportsFromSource(source);
    expect(exports.length).toBeGreaterThanOrEqual(6);
  });
});
