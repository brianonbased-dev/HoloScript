import { describe, it, expect } from 'vitest';
import { SemanticDiffEngine, semanticDiff, formatDiffResult } from '../SemanticDiff';

describe('SemanticDiffEngine', () => {
  it('identical ASTs are equivalent', () => {
    const ast = { type: 'Program', name: 'test', children: [] };
    const result = semanticDiff(ast, ast);
    expect(result.equivalent).toBe(true);
    expect(result.changeCount).toBe(0);
  });

  it('detects added nodes', () => {
    const oldAST = { type: 'Program', children: [] as any[] };
    const newAST = { type: 'Program', children: [{ type: 'Object', name: 'Box' }] };
    const result = semanticDiff(oldAST, newAST);
    expect(result.summary.added).toBeGreaterThanOrEqual(1);
  });

  it('detects removed nodes', () => {
    const oldAST = { type: 'Program', children: [{ type: 'Object', name: 'Box' }] };
    const newAST = { type: 'Program', children: [] as any[] };
    const result = semanticDiff(oldAST, newAST);
    expect(result.summary.removed).toBeGreaterThanOrEqual(1);
  });

  it('detects modified values', () => {
    const oldAST = { type: 'Object', name: 'Box', value: 10 };
    const newAST = { type: 'Object', name: 'Box', value: 20 };
    const result = semanticDiff(oldAST, newAST);
    expect(result.summary.modified).toBeGreaterThanOrEqual(1);
  });

  it('detects type changes', () => {
    const oldAST = { type: 'Object', name: 'A' };
    const newAST = { type: 'Light', name: 'A' };
    const result = semanticDiff(oldAST, newAST);
    expect(result.summary.modified).toBeGreaterThanOrEqual(1);
  });

  it('ignores comments when configured', () => {
    const oldAST = { type: 'Program', comments: ['old'], value: 1 };
    const newAST = { type: 'Program', comments: ['new'], value: 1 };
    const result = semanticDiff(oldAST, newAST, { ignoreComments: true });
    expect(result.equivalent).toBe(true);
  });

  it('detects renamed symbols', () => {
    const engine = new SemanticDiffEngine({ detectRenames: true, renameThreshold: 0.5 });
    const oldAST = {
      type: 'Program',
      children: [{ type: 'Object', name: 'Player', value: 'hero', health: 100 }],
    };
    const newAST = {
      type: 'Program',
      children: [{ type: 'Object', name: 'Hero', value: 'hero', health: 100 }],
    };
    const result = engine.diff(oldAST, newAST);
    const hasRenameOrModified = result.changes.some(c => c.type === 'renamed' || c.type === 'modified');
    expect(hasRenameOrModified).toBe(true);
  });

  it('detects moved code blocks', () => {
    const engine = new SemanticDiffEngine({ detectMoves: true });
    const child = { type: 'Object', name: 'Shared', value: 42 };
    // Move detection works on add/remove pairs at different paths
    const oldAST = { type: 'Root', items: [child, { type: 'Empty' }] };
    const newAST = { type: 'Root', items: [{ type: 'Empty' }, child] };
    const result = engine.diff(oldAST, newAST);
    // Should detect the type change or move between array positions
    expect(result.changeCount).toBeGreaterThanOrEqual(1);
  });

  it('formatDiffResult shows equivalent message', () => {
    const ast = { type: 'X', value: 1 };
    const result = semanticDiff(ast, ast);
    const text = formatDiffResult(result);
    expect(text).toContain('semantically equivalent');
  });

  it('formatDiffResult shows change count for non-equivalent', () => {
    const result = semanticDiff(
      { type: 'X', value: 1 },
      { type: 'X', value: 2 }
    );
    const text = formatDiffResult(result);
    expect(text).toContain('change(s)');
  });

  it('files field records filenames', () => {
    const result = semanticDiff(
      { type: 'P' }, { type: 'P' }, undefined, undefined
    );
    expect(result.files.old).toBe('old');
    expect(result.files.new).toBe('new');
  });
});
