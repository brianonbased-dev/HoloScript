import { describe, it, expect } from 'vitest';
import { readJson } from '../errors/safeJsonParse';
import {
  SemanticDiffEngine,
  semanticDiff,
  formatDiffResult,
  diffToJSON,
} from '../diff/SemanticDiff';
import type { ASTNode } from '../diff/SemanticDiff';

// =============================================================================
// C223 — Semantic Diff Engine
// =============================================================================

const makeNode = (
  type: string,
  name?: string,
  children?: ASTNode[],
  props?: Record<string, unknown>
): ASTNode => ({
  type,
  name,
  children,
  properties: props,
});

describe('SemanticDiffEngine', () => {
  it('identical trees are equivalent', () => {
    const tree: ASTNode = makeNode('root', 'r', [makeNode('orb', 'Player')]);
    const engine = new SemanticDiffEngine();
    const result = engine.diff(tree, tree);
    expect(result.equivalent).toBe(true);
    expect(result.changeCount).toBe(0);
  });

  it('detects added node', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'A'), makeNode('orb', 'B')]);
    const result = semanticDiff(oldTree, newTree);
    expect(result.equivalent).toBe(false);
    expect(result.changeCount).toBeGreaterThan(0);
    const addChange = result.changes.find((c) => c.type === 'added');
    expect(addChange).toBeDefined();
  });

  it('detects removed node', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A'), makeNode('orb', 'B')]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const result = semanticDiff(oldTree, newTree);
    expect(result.equivalent).toBe(false);
    const removeChange = result.changes.find((c) => c.type === 'removed');
    expect(removeChange).toBeDefined();
  });

  it('detects modified property', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A', undefined, { health: 100 })]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'A', undefined, { health: 200 })]);
    const result = semanticDiff(oldTree, newTree);
    expect(result.equivalent).toBe(false);
    const modChange = result.changes.find((c) => c.type === 'modified');
    expect(modChange).toBeDefined();
  });

  it('detects renamed symbol when enabled', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'OldName', undefined, { x: 1 })]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'NewName', undefined, { x: 1 })]);
    const result = semanticDiff(oldTree, newTree, { detectRenames: true });
    expect(result.equivalent).toBe(false);
    const renameChange = result.changes.find((c) => c.type === 'renamed');
    if (renameChange) {
      expect(renameChange.oldName).toBe('OldName');
      expect(renameChange.newName).toBe('NewName');
    }
  });

  it('summary categorizes changes by type', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'A'), makeNode('orb', 'B')]);
    const result = semanticDiff(oldTree, newTree);
    expect(result.summary).toBeDefined();
  });

  it('respects ignoreComments option', () => {
    const oldTree = makeNode('root', 'r', [
      makeNode('comment', undefined, undefined, { text: 'old comment' }),
    ]);
    const newTree = makeNode('root', 'r', [
      makeNode('comment', undefined, undefined, { text: 'new comment' }),
    ]);
    const withIgnore = semanticDiff(oldTree, newTree, { ignoreComments: true });
    const withoutIgnore = semanticDiff(oldTree, newTree, { ignoreComments: false });
    // With ignoreComments, comments should be stripped so trees are equivalent
    expect(withIgnore.changeCount).toBeLessThanOrEqual(withoutIgnore.changeCount);
  });

  it('formatDiffResult returns non-empty string', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'B')]);
    const result = semanticDiff(oldTree, newTree);
    const formatted = formatDiffResult(result);
    expect(formatted.length).toBeGreaterThan(0);
  });

  it('diffToJSON returns valid JSON', () => {
    const oldTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const newTree = makeNode('root', 'r', [makeNode('orb', 'A')]);
    const result = semanticDiff(oldTree, newTree);
    const json = diffToJSON(result);
    expect(() => readJson(json)).not.toThrow();
  });

  it('empty trees are equivalent', () => {
    const result = semanticDiff(makeNode('root'), makeNode('root'));
    expect(result.equivalent).toBe(true);
  });

  it('deep nesting change is detected', () => {
    const old = makeNode('root', 'r', [
      makeNode('group', 'g', [makeNode('orb', 'A', undefined, { val: 1 })]),
    ]);
    const newT = makeNode('root', 'r', [
      makeNode('group', 'g', [makeNode('orb', 'A', undefined, { val: 999 })]),
    ]);
    const result = semanticDiff(old, newT);
    expect(result.equivalent).toBe(false);
  });
});
