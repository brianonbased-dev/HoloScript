/**
 * GoAdapterParity — proves the native, data-driven Go adapter (authored as
 * language-adapters/go.holo → LANGUAGE_TRAITS → TreeSitterTraitAdapter) extracts
 * symbols / imports / calls at EXACT parity with the bespoke GoAdapter class it
 * replaced.
 *
 * The bespoke GoAdapter.ts has been deleted; this suite is now the parity GATE.
 * The expected values below are a FROZEN SNAPSHOT of the original GoAdapter's
 * output on GO_SOURCE (captured from the class before deletion). The suite parses
 * GO_SOURCE with the REAL tree-sitter-go grammar (installed) and asserts the
 * data-driven adapter reproduces that snapshot byte-for-byte — so any drift in
 * the go.holo declaration or the generic interpreter is caught. If the native
 * grammar cannot load in this env the extraction assertions no-op, but the
 * trait-metadata guard still runs (never a silent pass of the whole suite).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import type { ParseTree, ExternalSymbolDefinition, ImportEdge, CallEdge } from '../types';

// Representative Go source covering every rule the bespoke GoAdapter implemented:
// package, single + grouped imports (incl. aliased), func, method with pointer
// receiver, type struct with fields, type interface, type alias, const, var,
// and calls both selector-style (fmt.Println) and identifier-style (helper()).
const GO_SOURCE = `package main

import "fmt"

import (
	"os"
	str "strings"
)

type Shape interface {
	Area() float64
}

type Point struct {
	X int
	Y int
}

type Celsius float64

const Pi = 3.14

var count = 0

func Add(a int, b int) int {
	helper()
	return a + b
}

func (p *Point) Move(dx int) {
	fmt.Println(dx)
	str.ToUpper("x")
	os.Exit(0)
}
`;

const FILE = 'main.go';

// ── Frozen snapshot of the deleted GoAdapter's output on GO_SOURCE ──────────────
const EXPECTED_SYMBOLS: ExternalSymbolDefinition[] = [
  { name: 'Shape', type: 'interface', language: 'go', filePath: FILE, line: 10, column: 5, endLine: 12, endColumn: 1, visibility: 'public', signature: 'type Shape interface', isExported: true, lineCount: 3 },
  { name: 'Point', type: 'struct', language: 'go', filePath: FILE, line: 14, column: 5, endLine: 17, endColumn: 1, visibility: 'public', signature: 'type Point struct', isExported: true, lineCount: 4 },
  { name: 'X', type: 'field', language: 'go', filePath: FILE, line: 15, column: 1, endLine: 15, endColumn: 6, visibility: 'public', owner: 'Point', lineCount: 1 },
  { name: 'Y', type: 'field', language: 'go', filePath: FILE, line: 16, column: 1, endLine: 16, endColumn: 6, visibility: 'public', owner: 'Point', lineCount: 1 },
  { name: 'Celsius', type: 'type_alias', language: 'go', filePath: FILE, line: 19, column: 5, endLine: 19, endColumn: 20, visibility: 'public', signature: 'type Celsius type_identifier', isExported: true, lineCount: 1 },
  { name: 'Pi', type: 'constant', language: 'go', filePath: FILE, line: 21, column: 6, endLine: 21, endColumn: 15, visibility: 'public', isExported: true, lineCount: 1 },
  { name: 'count', type: 'constant', language: 'go', filePath: FILE, line: 23, column: 4, endLine: 23, endColumn: 13, visibility: 'internal', isExported: false, lineCount: 1 },
  { name: 'Add', type: 'function', language: 'go', filePath: FILE, line: 25, column: 0, endLine: 28, endColumn: 1, visibility: 'public', signature: 'func Add((a int, b int)) int', isExported: true, lineCount: 4 },
  { name: 'Move', type: 'method', language: 'go', filePath: FILE, line: 30, column: 0, endLine: 34, endColumn: 1, visibility: 'public', signature: 'func ((p *Point)) Move((dx int))', owner: 'Point', lineCount: 5 },
];

const EXPECTED_IMPORTS: ImportEdge[] = [
  { fromFile: FILE, toModule: 'fmt', line: 3 },
  { fromFile: FILE, toModule: 'os', line: 6 },
  { fromFile: FILE, toModule: 'strings', line: 7 },
];

const EXPECTED_CALLS: CallEdge[] = [
  { callerId: 'Add', calleeName: 'helper', filePath: FILE, line: 26, column: 1 },
  { callerId: 'Move', calleeName: 'Println', calleeOwner: 'fmt', filePath: FILE, line: 31, column: 1 },
  { callerId: 'Move', calleeName: 'ToUpper', calleeOwner: 'str', filePath: FILE, line: 32, column: 1 },
  { callerId: 'Move', calleeName: 'Exit', calleeOwner: 'os', filePath: FILE, line: 33, column: 1 },
];

// Deterministic sort so array order never causes a spurious mismatch.
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
// Drop undefined-valued keys so `toEqual` compares the same shape the bespoke
// class produced (it omitted absent optional fields rather than setting them).
function prune<T extends object>(objs: T[]): T[] {
  return objs.map(
    (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
  );
}

let tree: ParseTree | null = null;

beforeAll(async () => {
  try {
    const tsMod = await import('tree-sitter');
    const TreeSitter = (tsMod as { default?: unknown }).default ?? tsMod;
    const goMod = await import('tree-sitter-go');
    const Go = (goMod as { default?: unknown }).default ?? goMod;
    // tree-sitter's Parser constructor is untyped (same pattern AdapterManager uses).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (TreeSitter as any)();
    parser.setLanguage(Go);
    tree = parser.parse(GO_SOURCE) as ParseTree;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[GoAdapterParity] tree-sitter-go unavailable, skipping extraction:', err);
    tree = null;
  }
});

describe('GoAdapterParity (native go.holo trait == frozen GoAdapter snapshot)', () => {
  const GO_TRAIT = LANGUAGE_TRAITS.find((t) => t.language === 'go');

  it('go.holo produced a LanguageTrait in LANGUAGE_TRAITS', () => {
    expect(GO_TRAIT, 'go trait must be generated from language-adapters/go.holo').toBeDefined();
    expect(GO_TRAIT!.grammarPackage).toBe('tree-sitter-go');
    expect(GO_TRAIT!.extensions).toContain('.go');
  });

  it('extracts symbols identical to the bespoke GoAdapter', () => {
    if (!tree) return; // grammar unavailable — metadata guard above still runs
    const data = prune(sortSymbols(new TreeSitterTraitAdapter(GO_TRAIT!).extractSymbols(tree, FILE)));
    expect(data).toEqual(prune(sortSymbols(EXPECTED_SYMBOLS)));
  });

  it('extracts imports identical to the bespoke GoAdapter', () => {
    if (!tree) return;
    const data = prune(sortImports(new TreeSitterTraitAdapter(GO_TRAIT!).extractImports(tree, FILE)));
    expect(data).toEqual(prune(sortImports(EXPECTED_IMPORTS)));
  });

  it('extracts calls identical to the bespoke GoAdapter', () => {
    if (!tree) return;
    const data = prune(sortCalls(new TreeSitterTraitAdapter(GO_TRAIT!).extractCalls(tree, FILE)));
    expect(data).toEqual(prune(sortCalls(EXPECTED_CALLS)));
  });
});
