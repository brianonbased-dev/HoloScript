/**
 * TreeSitterTraitAdapter — proves a language added as DATA (RUBY_TRAIT) extracts
 * symbols / imports / calls correctly, with zero bespoke per-language code.
 *
 * Uses a hand-built tree mirroring tree-sitter-ruby's grammar so the test is
 * deterministic and CI-safe (no native grammar build required) — the same
 * pattern EventEdge.test.ts notes for grammar-free unit testing.
 */
import { describe, it, expect } from 'vitest';
import { TreeSitterTraitAdapter } from '../adapters/TreeSitterTraitAdapter';
import { LANGUAGE_TRAITS } from '../adapters/language-traits';
import type { ParseTree, SyntaxNode } from '../types';

// Ruby is now authored solely as language-adapters/ruby.holo and @generated into
// LANGUAGE_TRAITS — derive it here rather than importing a hand-duplicated const.
const RUBY_TRAIT = LANGUAGE_TRAITS.find((t) => t.language === 'ruby')!;

// ── Minimal SyntaxNode mock factory ───────────────────────────────────────────
interface NodeSpec {
  type: string;
  text?: string;
  row?: number;
  fields?: Record<string, SyntaxNode>;
  children?: SyntaxNode[];
}
function node(spec: NodeSpec): SyntaxNode {
  const fields = spec.fields ?? {};
  // Field nodes are also structural children (as in real tree-sitter trees).
  const children = [...(spec.children ?? []), ...Object.values(fields)];
  const row = spec.row ?? 0;
  const n: SyntaxNode = {
    type: spec.type,
    text: spec.text ?? '',
    startPosition: { row, column: 0 },
    endPosition: { row, column: 0 },
    childCount: children.length,
    children,
    namedChildren: children,
    parent: null,
    childForFieldName: (name: string) => fields[name] ?? null,
    descendantsOfType(t: string) {
      const out: SyntaxNode[] = [];
      const stack = [...children];
      while (stack.length) {
        const x = stack.pop()!;
        if (x.type === t) out.push(x);
        stack.push(...x.children);
      }
      return out;
    },
  };
  for (const c of children) (c as { parent: SyntaxNode | null }).parent = n;
  return n;
}
const id = (text: string) => node({ type: 'identifier', text });
const constant = (text: string) => node({ type: 'constant', text });

/**
 * Mirrors:
 *   require 'json'
 *   module Billing
 *     class Invoice
 *       def total
 *         compute_sum
 *       end
 *     end
 *   end
 */
function rubyTree(): ParseTree {
  const requireCall = node({
    type: 'call',
    row: 0,
    fields: { method: id('require') },
    children: [
      node({ type: 'argument_list', children: [node({ type: 'string', text: "'json'" })] }),
    ],
  });
  const innerCall = node({ type: 'call', row: 4, fields: { method: id('compute_sum') } });
  const method = node({
    type: 'method',
    row: 3,
    fields: { name: id('total') },
    children: [innerCall],
  });
  const klass = node({
    type: 'class',
    row: 2,
    fields: { name: constant('Invoice') },
    children: [method],
  });
  const mod = node({
    type: 'module',
    row: 1,
    fields: { name: constant('Billing') },
    children: [klass],
  });
  const root = node({ type: 'program', children: [requireCall, mod] });
  return { rootNode: root };
}

describe('TreeSitterTraitAdapter (RUBY_TRAIT — language as data)', () => {
  const adapter = new TreeSitterTraitAdapter(RUBY_TRAIT);

  it('exposes the trait metadata via the LanguageAdapter contract', () => {
    expect(adapter.language).toBe('ruby');
    expect(adapter.grammarPackage).toBe('tree-sitter-ruby');
    expect(adapter.extensions).toContain('.rb');
  });

  it('extracts module / class / method symbols with correct kinds and owners', () => {
    const syms = adapter.extractSymbols(rubyTree(), 'lib/billing.rb');
    const byName = Object.fromEntries(syms.map((s) => [s.name, s]));

    expect(byName.Billing?.type).toBe('module');
    expect(byName.Billing?.owner).toBeUndefined();

    expect(byName.Invoice?.type).toBe('class');
    expect(byName.Invoice?.owner).toBe('Billing');

    expect(byName.total?.type).toBe('method');
    expect(byName.total?.owner).toBe('Invoice');
  });

  it('extracts require/require_relative as import edges', () => {
    const imports = adapter.extractImports(rubyTree(), 'lib/billing.rb');
    expect(imports).toHaveLength(1);
    expect(imports[0].toModule).toBe('json');
    expect(imports[0].fromFile).toBe('lib/billing.rb');
  });

  it('extracts method calls (excluding import-bearing calls) with caller context', () => {
    const calls = adapter.extractCalls(rubyTree(), 'lib/billing.rb');
    // `require` is emitted as an import, NOT a call; only compute_sum remains.
    expect(calls.map((c) => c.calleeName)).toEqual(['compute_sum']);
    expect(calls[0].callerId).toBe('total');
  });
});
