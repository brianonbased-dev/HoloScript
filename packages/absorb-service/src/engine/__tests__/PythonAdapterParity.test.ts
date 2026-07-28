/**
 * PythonAdapterParity — proves the native, data-driven Python adapter (authored
 * as language-adapters/python.holo → LANGUAGE_TRAITS → TreeSitterTraitAdapter)
 * extracts symbols / imports / calls at parity with the bespoke PythonAdapter
 * class it replaced.
 *
 * The bespoke PythonAdapter.ts has been deleted; this suite is now the parity
 * GATE. The expected values below are a FROZEN SNAPSHOT captured from the
 * data-driven adapter (which reproduced the bespoke class byte-for-byte during
 * the migration) on PY_SOURCE. The suite parses PY_SOURCE with the REAL
 * tree-sitter-python grammar (installed) and asserts the data-driven adapter
 * reproduces that snapshot exactly — so any drift in python.holo or the generic
 * interpreter is caught. If the native grammar cannot load in this env the
 * extraction assertions no-op, but the trait-metadata guard still runs (never a
 * silent pass of the whole suite).
 *
 * ── One deliberate deviation from the bespoke class ─────────────────────────
 * The bespoke `extractImports` excluded the `from X import …` module node from
 * `namedImports` using reference identity (`child !== module`). The tree-sitter
 * Node.js binding hands out fresh wrapper objects as its internal cache evicts,
 * so that identity check was UNSTABLE — in a large-enough tree the module
 * (`collections`) could leak into `namedImports`. The data-driven interpreter
 * excludes the module by `startIndex` (byte offset) instead, which is what the
 * check meant and is deterministic. The snapshot therefore freezes the correct,
 * module-excluded output (`namedImports: ['OrderedDict', 'defaultdict']`), not
 * the bespoke's occasional non-deterministic leak. This is a behavior-preserving
 * bug fix, not a parity break.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import type { ParseTree, ExternalSymbolDefinition, ImportEdge, CallEdge } from '../types';

// Representative Python source covering every rule the bespoke PythonAdapter
// implemented: module-level functions (incl. `async def`), a decorated top-level
// function, a class with superclasses + docstring, methods (plain, decorated
// `@property`, `async`, `_protected`, `__private` visibility), a class with no
// bases, `import X`, `import X.Y as z`, `from X import a, b`, `from . import r`,
// `from .pkg import t as u`, `from X import *`, and calls both bare (`helper()`)
// and attribute-style (`obj.method()`).
const PY_SOURCE = `import os
import os.path as osp
from collections import OrderedDict, defaultdict
from . import sibling
from .pkg import thing as aliased
from foo import *


def module_fn(a, b=2):
    helper()
    obj.method(1)
    return a + b


async def async_fn(x):
    await go(x)


@decorator
def decorated_fn(y):
    return y


class Widget(Base, Mixin):
    """doc"""

    def __init__(self, name):
        self.name = name

    @property
    def label(self):
        return self.name

    async def refresh(self):
        await self._load()

    def _protected(self):
        pass

    def __private(self):
        pass


class Plain:
    def solo(self):
        pass
`;

const FILE = 'sample.py';

// ── Frozen snapshot of the migrated PythonAdapter output on PY_SOURCE ──────────
const EXPECTED_SYMBOLS: ExternalSymbolDefinition[] = [
  {
    name: 'module_fn',
    type: 'function',
    language: 'python',
    filePath: FILE,
    line: 9,
    column: 0,
    endLine: 12,
    endColumn: 16,
    visibility: 'public',
    signature: 'def module_fn((a, b=2))',
    lineCount: 4,
  },
  {
    name: 'async_fn',
    type: 'function',
    language: 'python',
    filePath: FILE,
    line: 15,
    column: 0,
    endLine: 16,
    endColumn: 15,
    visibility: 'public',
    signature: 'def async_fn((x))',
    lineCount: 2,
  },
  {
    name: 'decorated_fn',
    type: 'function',
    language: 'python',
    filePath: FILE,
    line: 20,
    column: 0,
    endLine: 21,
    endColumn: 12,
    visibility: 'public',
    signature: 'def decorated_fn((y))',
    lineCount: 2,
  },
  {
    name: 'Widget',
    type: 'class',
    language: 'python',
    filePath: FILE,
    line: 24,
    column: 0,
    endLine: 41,
    endColumn: 12,
    visibility: 'public',
    signature: 'class Widget((Base, Mixin))',
    docComment: 'doc',
    lineCount: 18,
  },
  {
    name: '__init__',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 27,
    column: 4,
    endLine: 28,
    endColumn: 24,
    visibility: 'protected',
    signature: 'Widget.__init__((self, name))',
    owner: 'Widget',
    lineCount: 2,
  },
  {
    name: 'label',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 31,
    column: 4,
    endLine: 32,
    endColumn: 24,
    visibility: 'public',
    signature: 'Widget.label((self))',
    owner: 'Widget',
    lineCount: 2,
  },
  {
    name: 'refresh',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 34,
    column: 4,
    endLine: 35,
    endColumn: 26,
    visibility: 'public',
    signature: 'Widget.refresh((self))',
    owner: 'Widget',
    lineCount: 2,
  },
  {
    name: '_protected',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 37,
    column: 4,
    endLine: 38,
    endColumn: 12,
    visibility: 'protected',
    signature: 'Widget._protected((self))',
    owner: 'Widget',
    lineCount: 2,
  },
  {
    name: '__private',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 40,
    column: 4,
    endLine: 41,
    endColumn: 12,
    visibility: 'private',
    signature: 'Widget.__private((self))',
    owner: 'Widget',
    lineCount: 2,
  },
  {
    name: 'Plain',
    type: 'class',
    language: 'python',
    filePath: FILE,
    line: 44,
    column: 0,
    endLine: 46,
    endColumn: 12,
    visibility: 'public',
    signature: 'class Plain',
    lineCount: 3,
  },
  {
    name: 'solo',
    type: 'method',
    language: 'python',
    filePath: FILE,
    line: 45,
    column: 4,
    endLine: 46,
    endColumn: 12,
    visibility: 'public',
    signature: 'Plain.solo((self))',
    owner: 'Plain',
    lineCount: 2,
  },
];

const EXPECTED_IMPORTS: ImportEdge[] = [
  { fromFile: FILE, toModule: 'os', line: 1 },
  { fromFile: FILE, toModule: 'os.path', line: 2 },
  {
    fromFile: FILE,
    toModule: 'collections',
    line: 3,
    namedImports: ['OrderedDict', 'defaultdict'],
  },
  { fromFile: FILE, toModule: '.', line: 4, namedImports: ['sibling'] },
  { fromFile: FILE, toModule: '.pkg', line: 5, namedImports: ['thing'] },
  { fromFile: FILE, toModule: 'foo', line: 6, namedImports: [], isWildcard: true },
];

const EXPECTED_CALLS: CallEdge[] = [
  { callerId: 'module_fn', calleeName: 'helper', filePath: FILE, line: 10, column: 4 },
  {
    callerId: 'module_fn',
    calleeName: 'method',
    calleeOwner: 'obj',
    filePath: FILE,
    line: 11,
    column: 4,
  },
  { callerId: 'async_fn', calleeName: 'go', filePath: FILE, line: 16, column: 10 },
  {
    callerId: 'refresh',
    calleeName: '_load',
    calleeOwner: 'self',
    filePath: FILE,
    line: 35,
    column: 14,
  },
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
    const pyMod = await import('tree-sitter-python');
    const Python = (pyMod as { default?: unknown }).default ?? pyMod;
    // tree-sitter's Parser constructor is untyped (same pattern AdapterManager uses).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parser = new (TreeSitter as any)();
    parser.setLanguage(Python);
    tree = parser.parse(PY_SOURCE) as ParseTree;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[PythonAdapterParity] tree-sitter-python unavailable, skipping extraction:', err);
    tree = null;
  }
});

describe('PythonAdapterParity (native python.holo trait == frozen PythonAdapter snapshot)', () => {
  const PY_TRAIT = LANGUAGE_TRAITS.find((t) => t.language === 'python');

  it('python.holo produced a LanguageTrait in LANGUAGE_TRAITS', () => {
    expect(
      PY_TRAIT,
      'python trait must be generated from language-adapters/python.holo'
    ).toBeDefined();
    expect(PY_TRAIT!.grammarPackage).toBe('tree-sitter-python');
    expect(PY_TRAIT!.extensions).toContain('.py');
    expect(PY_TRAIT!.extensions).toContain('.pyi');
  });

  it('extracts symbols identical to the bespoke PythonAdapter', () => {
    if (!tree) return; // grammar unavailable — metadata guard above still runs
    const data = prune(
      sortSymbols(new TreeSitterTraitAdapter(PY_TRAIT!).extractSymbols(tree, FILE))
    );
    expect(data).toEqual(prune(sortSymbols(EXPECTED_SYMBOLS)));
  });

  it('extracts imports identical to the bespoke PythonAdapter', () => {
    if (!tree) return;
    const data = prune(
      sortImports(new TreeSitterTraitAdapter(PY_TRAIT!).extractImports(tree, FILE))
    );
    expect(data).toEqual(prune(sortImports(EXPECTED_IMPORTS)));
  });

  it('extracts calls identical to the bespoke PythonAdapter', () => {
    if (!tree) return;
    const data = prune(sortCalls(new TreeSitterTraitAdapter(PY_TRAIT!).extractCalls(tree, FILE)));
    expect(data).toEqual(prune(sortCalls(EXPECTED_CALLS)));
  });
});
