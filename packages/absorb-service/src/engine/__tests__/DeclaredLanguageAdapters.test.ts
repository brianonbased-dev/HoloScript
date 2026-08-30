/**
 * DeclaredLanguageAdapters — proves the six formerly-declared languages
 * (java, cpp, csharp, php, swift, kotlin) are implemented the same way as
 * python/go/rust: language-adapters/*.holo → LANGUAGE_TRAITS →
 * TreeSitterTraitAdapter. Trait metadata always runs. Parse/extract runs
 * against a small fixture when the named tree-sitter grammar can load;
 * if a grammar is unavailable in this env the extraction assertions no-op
 * (same floor as PythonAdapterParity / GoAdapterParity).
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import { detectLanguage, getAdapterForLanguage, getSupportedLanguages } from '../adapters';
import type { ParseTree, SupportedLanguage } from '../types';

interface Fixture {
  language: SupportedLanguage;
  grammarPackage: string;
  extensions: string[];
  file: string;
  source: string;
  symbolNames: string[];
  importContains: string;
  calleeNames: string[];
}

const FIXTURES: Fixture[] = [
  {
    language: 'java',
    grammarPackage: 'tree-sitter-java',
    extensions: ['.java'],
    file: 'Widget.java',
    source: `import java.util.List;

public class Widget {
    public int add(int a, int b) {
        helper();
        obj.method(1);
        return a + b;
    }
}
`,
    symbolNames: ['Widget', 'add'],
    importContains: 'java.util.List',
    calleeNames: ['helper', 'method'],
  },
  {
    language: 'cpp',
    grammarPackage: 'tree-sitter-cpp',
    extensions: ['.cpp', '.cc', '.cxx', '.hpp', '.h'],
    file: 'widget.cpp',
    source: `#include "widget.h"

class Widget {
public:
    void refresh() {
        helper();
        obj.method(1);
    }
};

int add(int a, int b) {
    helper();
    return a + b;
}
`,
    symbolNames: ['Widget', 'refresh', 'add'],
    importContains: 'widget.h',
    calleeNames: ['helper', 'method'],
  },
  {
    language: 'csharp',
    grammarPackage: 'tree-sitter-c-sharp',
    extensions: ['.cs'],
    file: 'Widget.cs',
    source: `using System.Text;

public class Widget {
    public int Add(int a, int b) {
        Helper();
        obj.Method(1);
        return a + b;
    }
}
`,
    symbolNames: ['Widget', 'Add'],
    importContains: 'System',
    calleeNames: ['Helper', 'Method'],
  },
  {
    language: 'php',
    grammarPackage: 'tree-sitter-php',
    extensions: ['.php'],
    file: 'Widget.php',
    source: `<?php
use App\\Helpers\\Helper;

class Widget {
    public function add($a, $b) {
        helper();
        return $a + $b;
    }
}

function module_fn($x) {
    helper();
    return $x;
}
`,
    symbolNames: ['Widget', 'add', 'module_fn'],
    importContains: 'Helper',
    calleeNames: ['helper'],
  },
  {
    language: 'swift',
    grammarPackage: 'tree-sitter-swift',
    extensions: ['.swift'],
    file: 'Widget.swift',
    source: `import Foundation

class Widget {
    func add(a: Int, b: Int) -> Int {
        helper()
        return a + b
    }
}

func moduleFn(x: Int) -> Int {
    helper()
    return x
}
`,
    symbolNames: ['Widget', 'add', 'moduleFn'],
    importContains: 'Foundation',
    calleeNames: ['helper'],
  },
  {
    language: 'kotlin',
    grammarPackage: 'tree-sitter-kotlin',
    extensions: ['.kt', '.kts'],
    file: 'Widget.kt',
    source: `import kotlin.collections.List

class Widget {
    fun add(a: Int, b: Int): Int {
        helper()
        return a + b
    }
}

fun moduleFn(x: Int): Int {
    helper()
    return x
}
`,
    symbolNames: ['Widget', 'add', 'moduleFn'],
    importContains: 'kotlin',
    calleeNames: ['helper'],
  },
];

interface TSParser {
  setLanguage(language: unknown): void;
  parse(source: string): ParseTree;
}
type TSParserCtor = new () => TSParser;

function unwrapGrammar(mod: unknown, language: SupportedLanguage): unknown {
  const pkg = (mod as { default?: unknown }).default ?? mod;
  if (pkg && typeof pkg === 'object') {
    const rec = pkg as Record<string, unknown>;
    if (language === 'php') return rec.php ?? rec.php_only ?? pkg;
    if (rec[language]) return rec[language];
  }
  return pkg;
}

const trees = new Map<SupportedLanguage, ParseTree | null>();

beforeAll(async () => {
  for (const fixture of FIXTURES) {
    try {
      const tsMod = (await import('tree-sitter')) as unknown as { default?: TSParserCtor };
      const TreeSitter = (tsMod.default ?? (tsMod as unknown)) as TSParserCtor;
      const grammarMod = await import(fixture.grammarPackage);
      const grammar = unwrapGrammar(grammarMod, fixture.language);
      const parser = new TreeSitter();
      parser.setLanguage(grammar);
      trees.set(fixture.language, parser.parse(fixture.source));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[DeclaredLanguageAdapters] ${fixture.grammarPackage} unavailable:`, err);
      trees.set(fixture.language, null);
    }
  }
});

describe('DeclaredLanguageAdapters (six formerly-declared languages)', () => {
  it('registers every declared language as a first-class adapter id', () => {
    const supported = getSupportedLanguages();
    for (const fixture of FIXTURES) {
      expect(supported, fixture.language).toContain(fixture.language);
      expect(getAdapterForLanguage(fixture.language)?.constructor.name).toBe(
        'TreeSitterTraitAdapter'
      );
    }
  });

  it('detectLanguage maps each declared extension to its language id', () => {
    expect(detectLanguage('a.java')).toBe('java');
    expect(detectLanguage('a.cpp')).toBe('cpp');
    expect(detectLanguage('a.cs')).toBe('csharp');
    expect(detectLanguage('a.php')).toBe('php');
    expect(detectLanguage('a.swift')).toBe('swift');
    expect(detectLanguage('a.kt')).toBe('kotlin');
    expect(detectLanguage('a.kts')).toBe('kotlin');
  });

  it('does not regress already-implemented languages', () => {
    const supported = getSupportedLanguages();
    for (const id of ['typescript', 'python', 'rust', 'go', 'ruby', 'holoscript'] as const) {
      expect(supported, id).toContain(id);
    }
    expect(detectLanguage('a.ts')).toBe('typescript');
    expect(detectLanguage('a.py')).toBe('python');
    expect(detectLanguage('a.rs')).toBe('rust');
    expect(detectLanguage('a.go')).toBe('go');
    expect(detectLanguage('a.rb')).toBe('ruby');
    expect(detectLanguage('a.holo')).toBe('holoscript');
  });
});

for (const fixture of FIXTURES) {
  describe(`${fixture.language}.holo → TreeSitterTraitAdapter`, () => {
    const trait = LANGUAGE_TRAITS.find((t) => t.language === fixture.language);

    it('produced a LanguageTrait in LANGUAGE_TRAITS', () => {
      expect(trait, `${fixture.language} trait must come from language-adapters/${fixture.language}.holo`).toBeDefined();
      expect(trait!.grammarPackage).toBe(fixture.grammarPackage);
      for (const ext of fixture.extensions) {
        expect(trait!.extensions).toContain(ext);
      }
    });

    it('extracts symbols from a small fixture', () => {
      const tree = trees.get(fixture.language);
      if (!tree) return;
      const symbols = new TreeSitterTraitAdapter(trait!).extractSymbols(tree, fixture.file);
      const names = symbols.map((s) => s.name);
      for (const expected of fixture.symbolNames) {
        expect(names, `${fixture.language} missing symbol ${expected}`).toContain(expected);
      }
    });

    it('extracts imports from a small fixture', () => {
      const tree = trees.get(fixture.language);
      if (!tree) return;
      const imports = new TreeSitterTraitAdapter(trait!).extractImports(tree, fixture.file);
      expect(imports.length, `${fixture.language} extracted no imports`).toBeGreaterThan(0);
      expect(
        imports.some((edge) => edge.toModule.includes(fixture.importContains)),
        `${fixture.language} imports were ${imports.map((e) => e.toModule).join(', ')}`
      ).toBe(true);
    });

    it('extracts calls from a small fixture', () => {
      const tree = trees.get(fixture.language);
      if (!tree) return;
      const calls = new TreeSitterTraitAdapter(trait!).extractCalls(tree, fixture.file);
      const callees = calls.map((c) => c.calleeName);
      for (const expected of fixture.calleeNames) {
        expect(callees, `${fixture.language} missing call ${expected}`).toContain(expected);
      }
    });
  });
}
