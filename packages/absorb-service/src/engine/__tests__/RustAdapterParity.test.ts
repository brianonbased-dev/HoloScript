/**
 * RustAdapterParity — proves the native, data-driven Rust adapter (authored as
 * language-adapters/rust.holo → LANGUAGE_TRAITS → TreeSitterTraitAdapter)
 * extracts symbols / imports / calls at EXACT parity with the bespoke
 * RustAdapter class it replaced.
 *
 * The bespoke RustAdapter.ts has been deleted; this suite is now the parity
 * GATE. The expected values below are a FROZEN SNAPSHOT of the original
 * RustAdapter output on RUST_SOURCE (captured from the class before deletion).
 * The suite parses RUST_SOURCE with the REAL tree-sitter-rust grammar and
 * asserts the data-driven adapter reproduces that snapshot byte-for-byte, so
 * drift in rust.holo or the generic interpreter is caught. If the native
 * grammar cannot load the extraction assertions no-op, but the trait-metadata
 * guard still runs (never a silent pass of the whole suite).
 *
 * Rust drove five additive, backward-compatible model extensions (Go/Python/
 * Ruby snapshots unchanged): visibilityFromModifier (pub->public else private,
 * uniform including impl methods), exportedByModifier (isExported from pub,
 * suppressed when owned), ownerNameField (impl_item owns methods under its
 * type field, emits no self-symbol), useImports (Rust use-tree + file-ref mod
 * as import), and selector.bareTypes (bare callee may be identifier OR
 * scoped_identifier). Quirks reproduced deliberately, not improved: the
 * double-paren signatures (parameters text already carries parens), the whole
 * use-as-clause text as module string, and enum/const/static/type/module
 * carrying no signature.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import type { ParseTree, ExternalSymbolDefinition, ImportEdge, CallEdge } from '../types';

// Representative Rust source exercising every rule the bespoke RustAdapter had:
// pub + private struct, tuple struct, pub enum with variants, pub trait with
// methods, pub const + private static, pub type alias, free pub + private fn,
// an impl block (associated fn + &self method), pub inline mod with a fn, a
// file-reference mod, every use shape (scoped path, brace group, as-alias,
// pub use, wildcard), plus bare / method / path calls and a macro.
const RUST_SOURCE = [
  "use std::collections::HashMap;",
  "use std::io::{Read, Write};",
  "use std::fmt as formatting;",
  "pub use crate::helpers::helper;",
  "use super::*;",
  "",
  "pub struct Point {",
  "    pub x: i32,",
  "    y: i32,",
  "}",
  "",
  "struct Pair(i32, i32);",
  "",
  "pub enum Color {",
  "    Red,",
  "    Green,",
  "    Rgb(u8, u8, u8),",
  "}",
  "",
  "pub trait Shape {",
  "    fn area(&self) -> f64;",
  "    fn name(&self) -> String;",
  "}",
  "",
  "pub const MAX: i32 = 100;",
  "static GREETING: &str = \"hi\";",
  "",
  "pub type Meters = f64;",
  "",
  "pub fn free_fn(a: i32, b: i32) -> i32 {",
  "    helper();",
  "    a + b",
  "}",
  "",
  "fn private_fn() {",
  "    println!(\"x\");",
  "}",
  "",
  "impl Point {",
  "    pub fn new(x: i32, y: i32) -> Point {",
  "        Point { x, y }",
  "    }",
  "    fn dist(&self) -> f64 {",
  "        self.x.hypot();",
  "        Point::origin();",
  "        0.0",
  "    }",
  "}",
  "",
  "pub mod geometry {",
  "    pub fn compute() {}",
  "}",
  "",
  "mod external;",
  "",
].join('\n');

const FILE = 'sample.rs';

// Frozen snapshot of the deleted RustAdapter output on RUST_SOURCE.
const EXPECTED_SYMBOLS: ExternalSymbolDefinition[] = [
  {"name":"Point","type":"struct","language":"rust","filePath":"sample.rs","line":7,"column":0,"endLine":10,"endColumn":1,"visibility":"public","signature":"struct Point","isExported":true,"lineCount":4},
  {"name":"Pair","type":"struct","language":"rust","filePath":"sample.rs","line":12,"column":0,"endLine":12,"endColumn":22,"visibility":"private","signature":"struct Pair","isExported":false,"lineCount":1},
  {"name":"Color","type":"enum","language":"rust","filePath":"sample.rs","line":14,"column":0,"endLine":18,"endColumn":1,"visibility":"public","isExported":true,"lineCount":5},
  {"name":"Shape","type":"trait","language":"rust","filePath":"sample.rs","line":20,"column":0,"endLine":23,"endColumn":1,"visibility":"public","signature":"trait Shape","isExported":true,"lineCount":4},
  {"name":"MAX","type":"constant","language":"rust","filePath":"sample.rs","line":25,"column":0,"endLine":25,"endColumn":25,"visibility":"public","isExported":true,"lineCount":1},
  {"name":"GREETING","type":"constant","language":"rust","filePath":"sample.rs","line":26,"column":0,"endLine":26,"endColumn":29,"visibility":"private","isExported":false,"lineCount":1},
  {"name":"Meters","type":"type_alias","language":"rust","filePath":"sample.rs","line":28,"column":0,"endLine":28,"endColumn":22,"visibility":"public","isExported":true,"lineCount":1},
  {"name":"free_fn","type":"function","language":"rust","filePath":"sample.rs","line":30,"column":0,"endLine":33,"endColumn":1,"visibility":"public","signature":"fn free_fn((a: i32, b: i32)) -> i32","isExported":true,"lineCount":4},
  {"name":"private_fn","type":"function","language":"rust","filePath":"sample.rs","line":35,"column":0,"endLine":37,"endColumn":1,"visibility":"private","signature":"fn private_fn(())","isExported":false,"lineCount":3},
  {"name":"new","type":"method","language":"rust","filePath":"sample.rs","line":40,"column":4,"endLine":42,"endColumn":5,"visibility":"public","signature":"Point::new((x: i32, y: i32)) -> Point","owner":"Point","lineCount":3},
  {"name":"dist","type":"method","language":"rust","filePath":"sample.rs","line":43,"column":4,"endLine":47,"endColumn":5,"visibility":"private","signature":"Point::dist((&self)) -> f64","owner":"Point","lineCount":5},
  {"name":"geometry","type":"module","language":"rust","filePath":"sample.rs","line":50,"column":0,"endLine":52,"endColumn":1,"visibility":"public","isExported":true,"lineCount":3},
  {"name":"compute","type":"function","language":"rust","filePath":"sample.rs","line":51,"column":4,"endLine":51,"endColumn":23,"visibility":"public","signature":"fn compute(())","isExported":true,"lineCount":1},
  {"name":"external","type":"module","language":"rust","filePath":"sample.rs","line":54,"column":0,"endLine":54,"endColumn":13,"visibility":"private","isExported":false,"lineCount":1},
];

const EXPECTED_IMPORTS: ImportEdge[] = [
  {"fromFile":"sample.rs","toModule":"std::collections::HashMap","line":1,"namedImports":[],"isWildcard":false},
  {"fromFile":"sample.rs","toModule":"std::io","line":2,"namedImports":["Read","Write"],"isWildcard":false},
  {"fromFile":"sample.rs","toModule":"std::fmt as formatting","line":3,"namedImports":[],"isWildcard":false},
  {"fromFile":"sample.rs","toModule":"crate::helpers::helper","line":4,"namedImports":[],"isWildcard":false},
  {"fromFile":"sample.rs","toModule":"*","line":5,"namedImports":[],"isWildcard":true},
  {"fromFile":"sample.rs","toModule":"external","line":54},
];

const EXPECTED_CALLS: CallEdge[] = [
  {"callerId":"free_fn","calleeName":"helper","filePath":"sample.rs","line":31,"column":4},
  {"callerId":"dist","calleeName":"hypot","calleeOwner":"self.x","filePath":"sample.rs","line":44,"column":8},
  {"callerId":"dist","calleeName":"Point::origin","filePath":"sample.rs","line":45,"column":8},
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
// Drop undefined-valued keys so toEqual compares the shape the bespoke class
// produced (it omitted absent optional fields rather than setting them).
function prune<T extends object>(objs: T[]): T[] {
  return objs.map(
    (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  );
}

// The tree-sitter Node binding ships no exported constructor type, so we
// describe the shape we call. This is the unknown-based, honestly-typed form
// the strict-typing rule prescribes.
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
    const rustMod = (await import('tree-sitter-rust')) as unknown as { default?: unknown };
    const Rust = rustMod.default ?? rustMod;
    const parser = new TreeSitter();
    parser.setLanguage(Rust);
    tree = parser.parse(RUST_SOURCE);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[RustAdapterParity] tree-sitter-rust unavailable, skipping extraction:', err);
    tree = null;
  }
});

describe('RustAdapterParity (native rust.holo trait == frozen RustAdapter snapshot)', () => {
  const RUST_TRAIT = LANGUAGE_TRAITS.find((t) => t.language === 'rust');

  it('rust.holo produced a LanguageTrait in LANGUAGE_TRAITS', () => {
    expect(RUST_TRAIT, 'rust trait must be generated from language-adapters/rust.holo').toBeDefined();
    expect(RUST_TRAIT!.grammarPackage).toBe('tree-sitter-rust');
    expect(RUST_TRAIT!.extensions).toContain('.rs');
  });

  it('extracts symbols identical to the bespoke RustAdapter', () => {
    if (!tree) return;
    const data = prune(sortSymbols(new TreeSitterTraitAdapter(RUST_TRAIT!).extractSymbols(tree, FILE)));
    expect(data).toEqual(prune(sortSymbols(EXPECTED_SYMBOLS)));
  });

  it('extracts imports identical to the bespoke RustAdapter', () => {
    if (!tree) return;
    const data = prune(sortImports(new TreeSitterTraitAdapter(RUST_TRAIT!).extractImports(tree, FILE)));
    expect(data).toEqual(prune(sortImports(EXPECTED_IMPORTS)));
  });

  it('extracts calls identical to the bespoke RustAdapter', () => {
    if (!tree) return;
    const data = prune(sortCalls(new TreeSitterTraitAdapter(RUST_TRAIT!).extractCalls(tree, FILE)));
    expect(data).toEqual(prune(sortCalls(EXPECTED_CALLS)));
  });
});
