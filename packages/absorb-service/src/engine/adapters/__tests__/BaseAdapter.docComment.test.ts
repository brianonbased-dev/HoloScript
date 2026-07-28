import { describe, expect, it } from 'vitest';
import type { SyntaxNode } from '../../types';
import { extractDocComment } from '../BaseAdapter';

function node(type: string, text: string, startIndex: number, endColumn: number): SyntaxNode {
  return {
    type,
    text,
    startIndex,
    startPosition: { row: 0, column: startIndex },
    endPosition: { row: 0, column: endColumn },
    childCount: 0,
    children: [],
    namedChildren: [],
    parent: null,
    childForFieldName: () => null,
    descendantsOfType: () => [],
  };
}

describe('BaseAdapter doc-comment extraction', () => {
  it('matches a current node to fresh namedChildren wrappers by stable byte position', () => {
    const comment = node('comment', '/** Stable documentation. */', 0, 28);
    const current = node('function_declaration', 'function run() {}', 30, 47);
    const freshWrapper = node('function_declaration', 'function run() {}', 30, 47);
    const parent = node('program', '', 0, 47);
    parent.namedChildren = [comment, freshWrapper];
    current.parent = parent;

    expect(freshWrapper).not.toBe(current);
    expect(extractDocComment(current)).toBe('Stable documentation.');
  });

  it('does not attach a non-comment preceding sibling', () => {
    const declaration = node('lexical_declaration', 'const value = 1;', 0, 16);
    const current = node('function_declaration', 'function run() {}', 18, 35);
    const freshWrapper = node('function_declaration', 'function run() {}', 18, 35);
    const parent = node('program', '', 0, 35);
    parent.namedChildren = [declaration, freshWrapper];
    current.parent = parent;

    expect(extractDocComment(current)).toBeUndefined();
  });
});
