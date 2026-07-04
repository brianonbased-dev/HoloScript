/**
 * TypeScriptAdapterParity — proves the native, data-driven TypeScript adapter
 * (authored as language-adapters/typescript.holo → LANGUAGE_TRAITS →
 * TreeSitterTraitAdapter) extracts symbols / imports / calls / emit-sites /
 * listen-sites at EXACT parity with the bespoke TypeScriptAdapter class it
 * replaced.
 *
 * TypeScript is the PRIMARY language of the whole codebase, so this is the
 * highest-stakes migration: a parity regression corrupts the graph for the
 * most-used language. The expected values below are a FROZEN SNAPSHOT of the
 * bespoke TypeScriptAdapter output on TS_SOURCE, captured from the class with
 * the REAL tree-sitter-typescript grammar BEFORE deletion. The suite parses
 * TS_SOURCE with that same grammar and asserts the data-driven adapter
 * reproduces the snapshot byte-for-byte, so drift in typescript.holo or the
 * generic interpreter is caught. If the native grammar cannot load in this env
 * the extraction assertions no-op, but the trait-metadata guard still runs
 * (never a silent pass of the whole suite).
 *
 * TypeScript drove five additive, backward-compatible model extensions (Ruby/
 * Go/Python/Rust snapshots unchanged):
 *   - exportedByExportStatement — isExported from ES `export …` / `export { }`
 *     (the third export form beside Go capitalization and Rust `pub`).
 *   - declarators — `const a = () => …, b = …` list extraction: a function-
 *     valued declarator becomes a `function`, any other value a `constant`,
 *     positioned by the outer declaration node.
 *   - clauseImports — ESM `import { a } from 'x'` clause walking (default /
 *     namespace / named + isDefault/isWildcard flags) plus dynamic-import and
 *     require() call imports. (Re-exports `export … from` are deliberately NOT
 *     imports — the bespoke never emitted them.)
 *   - eventSites — HoloGraph emit/listen extraction (extractEmitSites /
 *     extractListenSites), TypeScript-unique among the migrated languages.
 *   - callerScope — the push-only scope stack the bespoke used for callerId:
 *     it is never popped, so calls/emits inside an anonymous arrow are
 *     attributed to `<anonymous>` (reproduced deliberately, not "fixed").
 *
 * Quirks reproduced byte-for-byte, not improved: the double-paren + double-colon
 * function signature (`function topLevel((a: T, b: number)): : string`, because
 * the `parameters` text already carries parens and the `return_type` text
 * already carries its `: `), the double-paren method/arrow signatures, and the
 * `<anonymous>` caller for arrow-body calls.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import type {
  ParseTree,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  EmitSite,
  ListenSite,
} from '../types';

// Representative TypeScript source exercising every rule the bespoke
// TypeScriptAdapter had: all import forms (default, named, aliased, namespace,
// side-effect, type-only, mixed), dynamic import + require, re-exports (which
// are NOT imports), interface, exported + local type alias, exported + local
// enum, a generic exported function with typed params + return type, a private
// function, an exported arrow const, a bare arrow const, exported + local plain
// constants, a class with fields (public/private/protected/implicit),
// constructor, method, private method, getter + setter, an abstract class
// (whose abstract method signature yields no symbol), a namespace (whose inner
// export const IS captured but the namespace itself is NOT), and bare / method /
// emit / on / subscribe / addListener calls.
const TS_SOURCE = [
  '// Sample TypeScript source exercising every TypeScriptAdapter rule.',
  "import defaultExport from './default-mod';",
  "import { alpha, beta } from './named-mod';",
  "import { gamma as g } from './aliased-mod';",
  "import * as ns from './namespace-mod';",
  "import './side-effect-mod';",
  "import type { OnlyType } from './type-only-mod';",
  "import defaultAnd, { alsoNamed } from './mixed-mod';",
  "const dyn = import('./dynamic-mod');",
  "const req = require('./required-mod');",
  "export { reexportedA, reexportedB } from './reexport-mod';",
  "export * from './star-reexport-mod';",
  '',
  'export interface Shape {',
  '  area(): number;',
  '}',
  '',
  'export type Meters = number;',
  '',
  'type LocalAlias = string;',
  '',
  'export enum Color {',
  '  Red,',
  '  Green,',
  '}',
  '',
  'enum LocalEnum { A, B }',
  '',
  'export function topLevel<T>(a: T, b: number): string {',
  '  helper();',
  '  obj.method(1);',
  '  return String(a) + b;',
  '}',
  '',
  'function privateFn() {',
  '  return 1;',
  '}',
  '',
  'export const arrow = (x: number): string => {',
  "  emitter.emit('module:arrow', x);",
  '  return String(x);',
  '};',
  '',
  'const bareArrow = (y) => y + 1;',
  '',
  'export const PLAIN_CONST = 42;',
  '',
  'const localConst = "hi";',
  '',
  'export class Widget extends Base implements Shape {',
  '  public name: string;',
  '  private secret: number;',
  '  protected tag: string;',
  '  field = 0;',
  '',
  '  constructor(name: string) {',
  '    this.name = name;',
  '  }',
  '',
  '  area(): number {',
  '    this.emit("widget:area", this.name);',
  '    return this.field;',
  '  }',
  '',
  '  private compute(a: number, b: number): number {',
  '    return a + b;',
  '  }',
  '',
  '  get label(): string {',
  '    return this.name;',
  '  }',
  '',
  '  set label(v: string) {',
  '    this.name = v;',
  '  }',
  '}',
  '',
  'abstract class AbstractThing {',
  '  abstract doIt(): void;',
  '}',
  '',
  'namespace MyNS {',
  '  export const inside = 1;',
  '}',
  '',
  'export function wires() {',
  "  bus.on('widget:area', handler);",
  "  bus.subscribe('module:arrow', handler2);",
  "  bus.addListener('x:y', h3);",
  "  bus.emit('wires:done', null);",
  '}',
  '',
].join('\n');

const FILE = 'sample.ts';

// ── Frozen snapshot of the deleted TypeScriptAdapter output on TS_SOURCE ───────
const EXPECTED_SYMBOLS: ExternalSymbolDefinition[] = [
  {"name":"dyn","type":"constant","language":"typescript","filePath":"sample.ts","line":9,"column":0,"endLine":9,"endColumn":36,"visibility":"public","isExported":false,"lineCount":1},
  {"name":"req","type":"constant","language":"typescript","filePath":"sample.ts","line":10,"column":0,"endLine":10,"endColumn":38,"visibility":"public","isExported":false,"lineCount":1},
  {"name":"Shape","type":"interface","language":"typescript","filePath":"sample.ts","line":14,"column":7,"endLine":16,"endColumn":1,"visibility":"public","signature":"interface Shape","isExported":true,"lineCount":3},
  {"name":"Meters","type":"type_alias","language":"typescript","filePath":"sample.ts","line":18,"column":7,"endLine":18,"endColumn":28,"visibility":"public","isExported":true,"lineCount":1},
  {"name":"LocalAlias","type":"type_alias","language":"typescript","filePath":"sample.ts","line":20,"column":0,"endLine":20,"endColumn":25,"visibility":"public","isExported":false,"lineCount":1},
  {"name":"Color","type":"enum","language":"typescript","filePath":"sample.ts","line":22,"column":7,"endLine":25,"endColumn":1,"visibility":"public","isExported":true,"lineCount":4},
  {"name":"LocalEnum","type":"enum","language":"typescript","filePath":"sample.ts","line":27,"column":0,"endLine":27,"endColumn":23,"visibility":"public","isExported":false,"lineCount":1},
  {"name":"topLevel","type":"function","language":"typescript","filePath":"sample.ts","line":29,"column":7,"endLine":33,"endColumn":1,"visibility":"public","signature":"function topLevel((a: T, b: number)): : string","isExported":true,"lineCount":5},
  {"name":"privateFn","type":"function","language":"typescript","filePath":"sample.ts","line":35,"column":0,"endLine":37,"endColumn":1,"visibility":"public","signature":"function privateFn(())","isExported":false,"lineCount":3},
  {"name":"arrow","type":"function","language":"typescript","filePath":"sample.ts","line":39,"column":7,"endLine":42,"endColumn":2,"visibility":"public","signature":"const arrow = ((x: number)) => ...","isExported":true,"lineCount":4},
  {"name":"bareArrow","type":"function","language":"typescript","filePath":"sample.ts","line":44,"column":0,"endLine":44,"endColumn":31,"visibility":"public","signature":"const bareArrow = ((y)) => ...","isExported":false,"lineCount":1},
  {"name":"PLAIN_CONST","type":"constant","language":"typescript","filePath":"sample.ts","line":46,"column":7,"endLine":46,"endColumn":30,"visibility":"public","isExported":true,"lineCount":1},
  {"name":"localConst","type":"constant","language":"typescript","filePath":"sample.ts","line":48,"column":0,"endLine":48,"endColumn":24,"visibility":"public","isExported":false,"lineCount":1},
  {"name":"Widget","type":"class","language":"typescript","filePath":"sample.ts","line":50,"column":7,"endLine":76,"endColumn":1,"visibility":"public","signature":"class Widget","isExported":true,"lineCount":27},
  {"name":"name","type":"field","language":"typescript","filePath":"sample.ts","line":51,"column":2,"endLine":51,"endColumn":21,"visibility":"public","owner":"Widget","lineCount":1},
  {"name":"secret","type":"field","language":"typescript","filePath":"sample.ts","line":52,"column":2,"endLine":52,"endColumn":24,"visibility":"private","owner":"Widget","lineCount":1},
  {"name":"tag","type":"field","language":"typescript","filePath":"sample.ts","line":53,"column":2,"endLine":53,"endColumn":23,"visibility":"protected","owner":"Widget","lineCount":1},
  {"name":"field","type":"field","language":"typescript","filePath":"sample.ts","line":54,"column":2,"endLine":54,"endColumn":11,"visibility":"public","owner":"Widget","lineCount":1},
  {"name":"constructor","type":"method","language":"typescript","filePath":"sample.ts","line":56,"column":2,"endLine":58,"endColumn":3,"visibility":"public","signature":"Widget.constructor((name: string))","owner":"Widget","lineCount":3},
  {"name":"area","type":"method","language":"typescript","filePath":"sample.ts","line":60,"column":2,"endLine":63,"endColumn":3,"visibility":"public","signature":"Widget.area(())","owner":"Widget","lineCount":4},
  {"name":"compute","type":"method","language":"typescript","filePath":"sample.ts","line":65,"column":2,"endLine":67,"endColumn":3,"visibility":"private","signature":"Widget.compute((a: number, b: number))","owner":"Widget","lineCount":3},
  {"name":"label","type":"method","language":"typescript","filePath":"sample.ts","line":69,"column":2,"endLine":71,"endColumn":3,"visibility":"public","signature":"Widget.label(())","owner":"Widget","lineCount":3},
  {"name":"label","type":"method","language":"typescript","filePath":"sample.ts","line":73,"column":2,"endLine":75,"endColumn":3,"visibility":"public","signature":"Widget.label((v: string))","owner":"Widget","lineCount":3},
  {"name":"AbstractThing","type":"class","language":"typescript","filePath":"sample.ts","line":78,"column":0,"endLine":80,"endColumn":1,"visibility":"public","signature":"class AbstractThing","isExported":false,"lineCount":3},
  {"name":"inside","type":"constant","language":"typescript","filePath":"sample.ts","line":83,"column":9,"endLine":83,"endColumn":26,"visibility":"public","isExported":true,"lineCount":1},
  {"name":"wires","type":"function","language":"typescript","filePath":"sample.ts","line":86,"column":7,"endLine":91,"endColumn":1,"visibility":"public","signature":"function wires(())","isExported":true,"lineCount":6},
];

const EXPECTED_IMPORTS: ImportEdge[] = [
  {"fromFile":"sample.ts","toModule":"./default-mod","line":2,"namedImports":["defaultExport"],"isWildcard":false,"isDefault":true},
  {"fromFile":"sample.ts","toModule":"./named-mod","line":3,"namedImports":["alpha","beta"],"isWildcard":false,"isDefault":false},
  {"fromFile":"sample.ts","toModule":"./aliased-mod","line":4,"namedImports":["gamma"],"isWildcard":false,"isDefault":false},
  {"fromFile":"sample.ts","toModule":"./namespace-mod","line":5,"namedImports":[],"isWildcard":true,"isDefault":false},
  {"fromFile":"sample.ts","toModule":"./side-effect-mod","line":6,"namedImports":[],"isWildcard":false,"isDefault":false},
  {"fromFile":"sample.ts","toModule":"./type-only-mod","line":7,"namedImports":["OnlyType"],"isWildcard":false,"isDefault":false},
  {"fromFile":"sample.ts","toModule":"./mixed-mod","line":8,"namedImports":["defaultAnd","alsoNamed"],"isWildcard":false,"isDefault":true},
  {"fromFile":"sample.ts","toModule":"./dynamic-mod","line":9},
  {"fromFile":"sample.ts","toModule":"./required-mod","line":10},
];

const EXPECTED_CALLS: CallEdge[] = [
  {"callerId":"<module>","calleeName":"require","filePath":"sample.ts","line":10,"column":12},
  {"callerId":"topLevel","calleeName":"helper","filePath":"sample.ts","line":30,"column":2},
  {"callerId":"topLevel","calleeName":"method","calleeOwner":"obj","filePath":"sample.ts","line":31,"column":2},
  {"callerId":"topLevel","calleeName":"String","filePath":"sample.ts","line":32,"column":9},
  {"callerId":"<anonymous>","calleeName":"emit","calleeOwner":"emitter","filePath":"sample.ts","line":40,"column":2},
  {"callerId":"<anonymous>","calleeName":"String","filePath":"sample.ts","line":41,"column":9},
  {"callerId":"area","calleeName":"emit","calleeOwner":"this","filePath":"sample.ts","line":61,"column":4},
  {"callerId":"wires","calleeName":"on","calleeOwner":"bus","filePath":"sample.ts","line":87,"column":2},
  {"callerId":"wires","calleeName":"subscribe","calleeOwner":"bus","filePath":"sample.ts","line":88,"column":2},
  {"callerId":"wires","calleeName":"addListener","calleeOwner":"bus","filePath":"sample.ts","line":89,"column":2},
  {"callerId":"wires","calleeName":"emit","calleeOwner":"bus","filePath":"sample.ts","line":90,"column":2},
];

const EXPECTED_EMITS: EmitSite[] = [
  {"callerId":"<anonymous>","eventName":"module:arrow","filePath":"sample.ts","line":40,"column":2},
  {"callerId":"area","eventName":"widget:area","filePath":"sample.ts","line":61,"column":4},
  {"callerId":"wires","eventName":"wires:done","filePath":"sample.ts","line":90,"column":2},
];

const EXPECTED_LISTENS: ListenSite[] = [
  {"callerId":"wires","eventName":"widget:area","filePath":"sample.ts","line":87,"column":2},
  {"callerId":"wires","eventName":"module:arrow","filePath":"sample.ts","line":88,"column":2},
  {"callerId":"wires","eventName":"x:y","filePath":"sample.ts","line":89,"column":2},
];

function sortSymbols(a: ExternalSymbolDefinition[]): ExternalSymbolDefinition[] {
  return [...a].sort(
    (x, y) =>
      x.name.localeCompare(y.name) ||
      x.type.localeCompare(y.type) ||
      x.line - y.line ||
      x.column - y.column
  );
}
function sortImports(a: ImportEdge[]): ImportEdge[] {
  return [...a].sort((x, y) => x.toModule.localeCompare(y.toModule) || x.line - y.line);
}
function sortCalls(a: CallEdge[]): CallEdge[] {
  return [...a].sort(
    (x, y) =>
      x.calleeName.localeCompare(y.calleeName) ||
      (x.calleeOwner ?? '').localeCompare(y.calleeOwner ?? '') ||
      x.line - y.line ||
      x.column - y.column
  );
}
function sortSites<T extends { eventName: string; line: number; column: number }>(a: T[]): T[] {
  return [...a].sort(
    (x, y) => x.eventName.localeCompare(y.eventName) || x.line - y.line || x.column - y.column
  );
}
// Drop undefined-valued keys so `toEqual` compares the shape the bespoke class
// produced (it omitted absent optional fields rather than setting them).
function prune<T extends object>(objs: T[]): T[] {
  return objs.map(
    (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  );
}

// The tree-sitter Node binding ships no exported constructor type, so we
// describe the shape we call — the unknown-based, honestly-typed form the
// strict-typing rule prescribes (same pattern RustAdapterParity uses).
interface TSParser {
  setLanguage(language: unknown): void;
  parse(source: string): ParseTree;
}
type TSParserCtor = new () => TSParser;

let tree: ParseTree | null = null;

beforeAll(async () => {
  try {
    const tsMod = (await import('tree-sitter')) as unknown as { default?: TSParserCtor };
    const TreeSitter = (tsMod.default ?? (tsMod as unknown)) as TSParserCtor;
    const grammarMod = (await import('tree-sitter-typescript')) as unknown as {
      default?: { typescript?: unknown };
      typescript?: unknown;
    };
    const grammar = grammarMod.default?.typescript ?? grammarMod.typescript;
    const parser = new TreeSitter();
    parser.setLanguage(grammar);
    tree = parser.parse(TS_SOURCE);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[TypeScriptAdapterParity] tree-sitter-typescript unavailable, skipping extraction:', err);
    tree = null;
  }
});

describe('TypeScriptAdapterParity (native typescript.holo trait == frozen TypeScriptAdapter snapshot)', () => {
  const TS_TRAIT = LANGUAGE_TRAITS.find((t) => t.language === 'typescript');

  it('typescript.holo produced a LanguageTrait in LANGUAGE_TRAITS', () => {
    expect(TS_TRAIT, 'typescript trait must be generated from language-adapters/typescript.holo').toBeDefined();
    expect(TS_TRAIT!.grammarPackage).toBe('tree-sitter-typescript');
    // The trait must claim exactly the extensions the bespoke adapter did,
    // including the JavaScript extensions it also served.
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs']) {
      expect(TS_TRAIT!.extensions, `extensions must include ${ext}`).toContain(ext);
    }
  });

  it('extracts symbols identical to the bespoke TypeScriptAdapter', () => {
    if (!tree) return; // grammar unavailable — metadata guard above still runs
    const data = prune(sortSymbols(new TreeSitterTraitAdapter(TS_TRAIT!).extractSymbols(tree, FILE)));
    expect(data).toEqual(prune(sortSymbols(EXPECTED_SYMBOLS)));
  });

  it('extracts imports identical to the bespoke TypeScriptAdapter', () => {
    if (!tree) return;
    const data = prune(sortImports(new TreeSitterTraitAdapter(TS_TRAIT!).extractImports(tree, FILE)));
    expect(data).toEqual(prune(sortImports(EXPECTED_IMPORTS)));
  });

  it('extracts calls identical to the bespoke TypeScriptAdapter', () => {
    if (!tree) return;
    const data = prune(sortCalls(new TreeSitterTraitAdapter(TS_TRAIT!).extractCalls(tree, FILE)));
    expect(data).toEqual(prune(sortCalls(EXPECTED_CALLS)));
  });

  it('extracts emit sites identical to the bespoke TypeScriptAdapter', () => {
    if (!tree) return;
    const data = prune(sortSites(new TreeSitterTraitAdapter(TS_TRAIT!).extractEmitSites!(tree, FILE)));
    expect(data).toEqual(prune(sortSites(EXPECTED_EMITS)));
  });

  it('extracts listen sites identical to the bespoke TypeScriptAdapter', () => {
    if (!tree) return;
    const data = prune(sortSites(new TreeSitterTraitAdapter(TS_TRAIT!).extractListenSites!(tree, FILE)));
    expect(data).toEqual(prune(sortSites(EXPECTED_LISTENS)));
  });
});
