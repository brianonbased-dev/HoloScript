import { describe, it, expect } from 'vitest';
import { HoloAdapter } from '../HoloAdapter';

/**
 * Regression: `.holo` object symbols must carry their trait-argument prose
 * (e.g. `@label(text: "...")`) in `docComment`, so EmbeddingIndex.symbolToText
 * folds it into the embedded text and semantic search can match on content —
 * not just the structural name. Before this, HoloAdapter dropped all trait
 * config text and `.holo` symbols were indistinguishable to NL queries.
 */

// Minimal HoloParseTree carrying a hand-built AST — avoids the optional
// @holoscript/core peer dep; extractSymbols reads __holoAST directly.
function fakeTree(ast: unknown) {
  return {
    rootNode: {} as never,
    __holoSource: '',
    __holoAST: ast,
    __holoErrors: [],
    __holoPartial: false,
  } as never;
}

describe('HoloAdapter trait-config → docComment', () => {
  it('captures @label/@note string args into the object symbol docComment', () => {
    const adapter = new HoloAdapter();
    const ast = {
      type: 'Composition',
      name: 'MemoryStore',
      templates: [],
      objects: [
        {
          type: 'Object',
          name: 'dev-value',
          traits: [
            { type: 'ObjectTrait', name: 'label', config: { text: 'developers are won by verifiable value not anti-dev voice' } },
            { type: 'ObjectTrait', name: 'note', config: { body: 'skepticism is temporary; prove it ran and compiled' } },
          ],
          children: [],
        },
      ],
      spatialGroups: [],
      lights: [],
      imports: [],
    };

    const syms = adapter.extractSymbols(fakeTree(ast), 'memories/dev-value.holo');
    const orb = syms.find((s) => s.name === 'dev-value');

    expect(orb).toBeDefined();
    expect(orb!.docComment).toContain('verifiable value');
    expect(orb!.docComment).toContain('skepticism is temporary');
  });

  it('leaves docComment undefined when an object has no string trait config', () => {
    const adapter = new HoloAdapter();
    const ast = {
      type: 'Composition',
      name: 'S',
      templates: [],
      objects: [{ type: 'Object', name: 'plain', traits: [], children: [] }],
      spatialGroups: [],
      lights: [],
      imports: [],
    };

    const syms = adapter.extractSymbols(fakeTree(ast), 'x.holo');
    const orb = syms.find((s) => s.name === 'plain');

    expect(orb!.docComment).toBeUndefined();
  });
});
