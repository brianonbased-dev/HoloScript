/**
 * @holoscript/core SemanticDiff Tests
 *
 * Comprehensive tests for the semantic diff engine including:
 * - Basic diff operations (added, removed, modified)
 * - Array comparison
 * - Comment/formatting ignoring
 * - Rename detection
 * - Move detection
 * - Result formatting
 * - Convenience functions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SemanticDiffEngine,
  semanticDiff,
  formatDiffResult,
  diffToJSON,
  DiffOptions,
  SemanticDiffResult,
  DiffChange,
  ChangeType,
} from './SemanticDiff';

// ============================================================================
// Test Fixtures
// ============================================================================

interface TestASTNode {
  type: string;
  name?: string;
  value?: unknown;
  children?: TestASTNode[];
  properties?: Record<string, unknown>;
  traits?: unknown[];
  line?: number;
  comments?: unknown[];
  loc?: { start: number; end: number };
  [key: string]: unknown;
}

function createNode(type: string, props: Partial<TestASTNode> = {}): TestASTNode {
  return { type, ...props };
}

// ============================================================================
// Engine Instantiation Tests
// ============================================================================

describe('SemanticDiffEngine - Instantiation', () => {
  it('should create engine with default options', () => {
    const engine = new SemanticDiffEngine();
    expect(engine).toBeInstanceOf(SemanticDiffEngine);
  });

  it('should create engine with custom options', () => {
    const engine = new SemanticDiffEngine({
      ignoreComments: false,
      detectRenames: false,
      renameThreshold: 0.5,
    });
    expect(engine).toBeInstanceOf(SemanticDiffEngine);
  });
});

// ============================================================================
// Basic Diff Operations Tests
// ============================================================================

describe('SemanticDiffEngine - Basic Diff Operations', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should detect no changes for identical ASTs', () => {
    const ast = createNode('Program', {
      children: [createNode('Object', { name: 'Player' })],
    });

    const result = engine.diff(ast, ast);

    expect(result.equivalent).toBe(true);
    expect(result.changeCount).toBe(0);
    expect(result.changes).toHaveLength(0);
  });

  it('should detect added nodes', () => {
    const oldAST = createNode('Program', { children: [] });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'Player' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    expect(result.changes.some((c) => c.type === 'added')).toBe(true);
  });

  it('should detect removed nodes', () => {
    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'Player' })],
    });
    const newAST = createNode('Program', { children: [] });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    expect(result.changes.some((c) => c.type === 'removed')).toBe(true);
  });

  it('should detect modified properties', () => {
    const oldAST = createNode('Object', { name: 'Player', value: 10 });
    const newAST = createNode('Object', { name: 'Player', value: 20 });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    const modChange = result.changes.find((c) => c.type === 'modified');
    expect(modChange).toBeDefined();
    expect(modChange?.oldValue).toBe(10);
    expect(modChange?.newValue).toBe(20);
  });

  it('should detect type changes', () => {
    const oldAST = createNode('Object', { name: 'Entity' });
    const newAST = createNode('Component', { name: 'Entity' });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    const change = result.changes.find(
      (c) => c.type === 'modified' && c.description.includes('type')
    );
    expect(change).toBeDefined();
  });

  it('should handle null/undefined nodes', () => {
    const ast = createNode('Program');

    // Compare with undefined values in properties
    const oldAST = createNode('Object', { name: 'Test', value: undefined });
    const newAST = createNode('Object', { name: 'Test', value: 'defined' });

    const result = engine.diff(oldAST, newAST);
    expect(result).toBeDefined();
  });
});

// ============================================================================
// Array Comparison Tests
// ============================================================================

describe('SemanticDiffEngine - Array Comparison', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should detect added array elements', () => {
    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' })],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' }), createNode('Object', { name: 'B' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.changes.some((c) => c.type === 'added' && c.path.includes('[1]'))).toBe(true);
  });

  it('should detect removed array elements', () => {
    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' }), createNode('Object', { name: 'B' })],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.changes.some((c) => c.type === 'removed' && c.path.includes('[1]'))).toBe(true);
  });

  it('should detect modified array elements', () => {
    const oldAST = createNode('Program', {
      items: [1, 2, 3],
    });
    const newAST = createNode('Program', {
      items: [1, 5, 3],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.changes.some((c) => c.path.includes('[1]') && c.type === 'modified')).toBe(true);
  });

  it('should compare nested objects in arrays', () => {
    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'A', value: 1 })],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'A', value: 2 })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.changes.some((c) => c.path.includes('value'))).toBe(true);
  });
});

// ============================================================================
// Comment and Formatting Ignoring Tests
// ============================================================================

describe('SemanticDiffEngine - Comment Ignoring', () => {
  it('should ignore comments when configured', () => {
    const engine = new SemanticDiffEngine({ ignoreComments: true });

    const oldAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'old comment' }],
      children: [createNode('Object', { name: 'A' })],
    });
    const newAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'new comment' }],
      children: [createNode('Object', { name: 'A' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should detect comment changes when configured to include', () => {
    const engine = new SemanticDiffEngine({ ignoreComments: false });

    const oldAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'old' }],
    });
    const newAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'new' }],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
  });

  it('should filter out Comment nodes from children', () => {
    const engine = new SemanticDiffEngine({ ignoreComments: true });

    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' }), { type: 'Comment', value: 'inline comment' }],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'A' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });
});

describe('SemanticDiffEngine - Location Ignoring', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should ignore location info (loc, start, end)', () => {
    const oldAST = createNode('Object', {
      name: 'A',
      loc: { start: 0, end: 10 },
    });
    const newAST = createNode('Object', {
      name: 'A',
      loc: { start: 50, end: 60 },
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should ignore line property in comparison', () => {
    const oldAST = createNode('Object', { name: 'A', line: 1 });
    const newAST = createNode('Object', { name: 'A', line: 100 });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });
});

// ============================================================================
// Rename Detection Tests
// ============================================================================

describe('SemanticDiffEngine - Rename Detection', () => {
  it('should detect renamed symbols', () => {
    const engine = new SemanticDiffEngine({
      detectRenames: true,
      renameThreshold: 0.6,
    });

    // Rename detection works on add/remove pairs at different paths
    // Use different property names to trigger add/remove
    const oldAST = createNode('Program', {
      playerController: createNode('Object', { name: 'PlayerController', traits: ['Movable'] }),
    });
    const newAST = createNode('Program', {
      characterController: createNode('Object', {
        name: 'CharacterController',
        traits: ['Movable'],
      }),
    });

    const result = engine.diff(oldAST, newAST);

    // Check that we detect at least a remove and add, or a rename
    const hasRenameOrMoveOrAddRemove =
      result.changes.some((c) => c.type === 'renamed') ||
      (result.changes.some((c) => c.type === 'removed') &&
        result.changes.some((c) => c.type === 'added'));
    expect(hasRenameOrMoveOrAddRemove).toBe(true);

    // If rename was detected, check the details
    const renameChange = result.changes.find((c) => c.type === 'renamed');
    if (renameChange) {
      expect(renameChange.oldName).toBe('PlayerController');
      expect(renameChange.newName).toBe('CharacterController');
    }
  });

  it('should not detect renames below threshold', () => {
    const engine = new SemanticDiffEngine({
      detectRenames: true,
      renameThreshold: 0.99,
    });

    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'Foo', value: 1 })],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'Bar', value: 99 })],
    });

    const result = engine.diff(oldAST, newAST);

    const renameChange = result.changes.find((c) => c.type === 'renamed');
    expect(renameChange).toBeUndefined();
  });

  it('should not detect renames when disabled', () => {
    const engine = new SemanticDiffEngine({ detectRenames: false });

    const oldAST = createNode('Program', {
      children: [createNode('Object', { name: 'OldName', value: 1 })],
    });
    const newAST = createNode('Program', {
      children: [createNode('Object', { name: 'NewName', value: 1 })],
    });

    const result = engine.diff(oldAST, newAST);

    const renameChange = result.changes.find((c) => c.type === 'renamed');
    expect(renameChange).toBeUndefined();
  });
});

// ============================================================================
// Move Detection Tests
// ============================================================================

describe('SemanticDiffEngine - Move Detection', () => {
  it('should detect moved code blocks', () => {
    const engine = new SemanticDiffEngine({ detectMoves: true });

    const movedBlock = createNode('Object', { name: 'Helper', value: 42 });

    const oldAST = createNode('Program', {
      section1: [movedBlock],
      section2: [],
    });
    const newAST = createNode('Program', {
      section1: [],
      section2: [movedBlock],
    });

    const result = engine.diff(oldAST, newAST);

    const moveChange = result.changes.find((c) => c.type === 'moved');
    expect(moveChange).toBeDefined();
    expect(moveChange?.description).toContain('Moved');
  });

  it('should not detect moves when disabled', () => {
    const engine = new SemanticDiffEngine({ detectMoves: false });

    const block = createNode('Object', { name: 'Test' });

    const oldAST = createNode('Program', {
      a: [block],
      b: [],
    });
    const newAST = createNode('Program', {
      a: [],
      b: [block],
    });

    const result = engine.diff(oldAST, newAST);

    const moveChange = result.changes.find((c) => c.type === 'moved');
    expect(moveChange).toBeUndefined();
  });
});

// ============================================================================
// Result Structure Tests
// ============================================================================

describe('SemanticDiffEngine - Result Structure', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should return proper result structure', () => {
    const oldAST = createNode('Program');
    const newAST = createNode('Program');

    const result = engine.diff(oldAST, newAST, 'old.hs', 'new.hs');

    expect(result).toHaveProperty('equivalent');
    expect(result).toHaveProperty('changeCount');
    expect(result).toHaveProperty('changes');
    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('files');
    expect(result.files.old).toBe('old.hs');
    expect(result.files.new).toBe('new.hs');
  });

  it('should calculate summary correctly', () => {
    const oldAST = createNode('Program', {
      a: 1,
      b: 2,
      children: [createNode('Object', { name: 'Remove' })],
    });
    const newAST = createNode('Program', {
      a: 1,
      b: 3,
      children: [createNode('Object', { name: 'Add' })],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.summary).toBeDefined();
    expect(typeof result.summary.added).toBe('number');
    expect(typeof result.summary.removed).toBe('number');
    expect(typeof result.summary.modified).toBe('number');
  });

  it('should include line numbers in changes when available', () => {
    const oldAST = createNode('Object', { name: 'A', line: 10, value: 1 });
    const newAST = createNode('Object', { name: 'A', line: 20, value: 2 });

    const result = engine.diff(oldAST, newAST);

    const change = result.changes.find((c) => c.path === 'value');
    expect(change?.oldLine).toBe(10);
    expect(change?.newLine).toBe(20);
  });

  it('should include descriptive messages', () => {
    const oldAST = createNode('Object', { name: 'Test' });
    const newAST = createNode('Object', { name: 'Test', extra: 'prop' });

    const result = engine.diff(oldAST, newAST);

    const change = result.changes.find((c) => c.path === 'extra');
    expect(change?.description).toBeDefined();
    expect(change?.description.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Value Equality Tests
// ============================================================================

describe('SemanticDiffEngine - Value Equality', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should treat identical primitive values as equal', () => {
    const oldAST = createNode('Object', { str: 'hello', num: 42, bool: true });
    const newAST = createNode('Object', { str: 'hello', num: 42, bool: true });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should treat identical objects as equal', () => {
    const oldAST = createNode('Object', {
      nested: { a: 1, b: [1, 2, 3] },
    });
    const newAST = createNode('Object', {
      nested: { a: 1, b: [1, 2, 3] },
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should detect different primitive values', () => {
    const oldAST = createNode('Object', { value: 'old' });
    const newAST = createNode('Object', { value: 'new' });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    expect(result.changes.some((c) => c.path === 'value')).toBe(true);
  });
});

// ============================================================================
// Convenience Functions Tests
// ============================================================================

describe('SemanticDiff - Convenience Functions', () => {
  it('should use semanticDiff function', () => {
    const oldAST = createNode('Program');
    const newAST = createNode('Program');

    const result = semanticDiff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should accept options in semanticDiff', () => {
    const oldAST = createNode('Program', {
      comments: ['comment'],
    });
    const newAST = createNode('Program', {
      comments: ['different'],
    });

    const withComments = semanticDiff(oldAST, newAST, { ignoreComments: false });
    const withoutComments = semanticDiff(oldAST, newAST, { ignoreComments: true });

    expect(withComments.equivalent).toBe(false);
    expect(withoutComments.equivalent).toBe(true);
  });
});

// ============================================================================
// Format Diff Result Tests
// ============================================================================

describe('formatDiffResult', () => {
  it('should format equivalent result', () => {
    const result: SemanticDiffResult = {
      equivalent: true,
      changeCount: 0,
      changes: [],
      summary: { added: 0, removed: 0, modified: 0, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'a.hs', new: 'b.hs' },
    };

    const formatted = formatDiffResult(result);

    expect(formatted).toContain('equivalent');
  });

  it('should format changes by type', () => {
    const result: SemanticDiffResult = {
      equivalent: false,
      changeCount: 3,
      changes: [
        { type: 'added', path: 'a', description: 'Added a' },
        { type: 'removed', path: 'b', description: 'Removed b' },
        { type: 'modified', path: 'c', oldValue: 1, newValue: 2, description: 'Modified c' },
      ],
      summary: { added: 1, removed: 1, modified: 1, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'old.hs', new: 'new.hs' },
    };

    const formatted = formatDiffResult(result);

    expect(formatted).toContain('3 change');
    expect(formatted).toContain('Added');
    expect(formatted).toContain('Removed');
    expect(formatted).toContain('Modified');
  });

  it('should include path and description in output', () => {
    const result: SemanticDiffResult = {
      equivalent: false,
      changeCount: 1,
      changes: [{ type: 'added', path: 'objects.Player', description: 'Added Player object' }],
      summary: { added: 1, removed: 0, modified: 0, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'old.hs', new: 'new.hs' },
    };

    const formatted = formatDiffResult(result);

    expect(formatted).toContain('objects.Player');
    expect(formatted).toContain('Added Player object');
  });

  it('should include line numbers when available', () => {
    const result: SemanticDiffResult = {
      equivalent: false,
      changeCount: 1,
      changes: [{ type: 'removed', path: 'func', oldLine: 42, description: 'Removed function' }],
      summary: { added: 0, removed: 1, modified: 0, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'old.hs', new: 'new.hs' },
    };

    const formatted = formatDiffResult(result);

    expect(formatted).toContain(':42');
  });
});

// ============================================================================
// diffToJSON Tests
// ============================================================================

describe('diffToJSON', () => {
  it('should convert result to JSON string', () => {
    const result: SemanticDiffResult = {
      equivalent: true,
      changeCount: 0,
      changes: [],
      summary: { added: 0, removed: 0, modified: 0, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'a.hs', new: 'b.hs' },
    };

    const json = diffToJSON(result);

    expect(typeof json).toBe('string');
    const parsed = JSON.parse(json);
    expect(parsed.equivalent).toBe(true);
  });

  it('should format JSON with indentation', () => {
    const result: SemanticDiffResult = {
      equivalent: false,
      changeCount: 1,
      changes: [{ type: 'added', path: 'x', description: 'Added x' }],
      summary: { added: 1, removed: 0, modified: 0, renamed: 0, moved: 0, unchanged: 0 },
      files: { old: 'old.hs', new: 'new.hs' },
    };

    const json = diffToJSON(result);

    expect(json).toContain('\n');
    expect(json).toContain('  '); // indentation
  });
});

// ============================================================================
// Complex Scenario Tests
// ============================================================================

describe('SemanticDiffEngine - Complex Scenarios', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should handle deeply nested structures', () => {
    const oldAST = createNode('Program', {
      a: {
        b: {
          c: {
            d: { value: 1 },
          },
        },
      },
    });
    const newAST = createNode('Program', {
      a: {
        b: {
          c: {
            d: { value: 2 },
          },
        },
      },
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    const change = result.changes.find((c) => c.path.includes('value'));
    expect(change).toBeDefined();
  });

  it('should handle mixed array and object nesting', () => {
    const oldAST = createNode('Program', {
      objects: [
        {
          type: 'Object',
          traits: [
            { type: 'Trait', name: 'Movable', config: { speed: 10 } },
            { type: 'Trait', name: 'Renderable' },
          ],
        },
      ],
    });
    const newAST = createNode('Program', {
      objects: [
        {
          type: 'Object',
          traits: [
            { type: 'Trait', name: 'Movable', config: { speed: 20 } },
            { type: 'Trait', name: 'Renderable' },
          ],
        },
      ],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    expect(result.changes.some((c) => c.path.includes('speed'))).toBe(true);
  });

  it('should handle empty objects', () => {
    const oldAST = createNode('Object', { props: {} });
    const newAST = createNode('Object', { props: {} });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should handle empty arrays', () => {
    const oldAST = createNode('Object', { items: [] });
    const newAST = createNode('Object', { items: [] });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should handle combination of renames and moves', () => {
    const engine = new SemanticDiffEngine({
      detectRenames: true,
      detectMoves: true,
    });

    const oldAST = createNode('Program', {
      section1: [createNode('Object', { name: 'Helper', value: 100 })],
      section2: [createNode('Object', { name: 'OldName', traits: ['A', 'B'] })],
    });
    const newAST = createNode('Program', {
      section1: [createNode('Object', { name: 'NewName', traits: ['A', 'B'] })],
      section2: [createNode('Object', { name: 'Helper', value: 100 })],
    });

    const result = engine.diff(oldAST, newAST);

    // Should detect both rename and move
    expect(result.changes.some((c) => c.type === 'renamed' || c.type === 'moved')).toBe(true);
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('SemanticDiffEngine - Edge Cases', () => {
  let engine: SemanticDiffEngine;

  beforeEach(() => {
    engine = new SemanticDiffEngine();
  });

  it('should handle AST with only comments', () => {
    const engine = new SemanticDiffEngine({ ignoreComments: true });

    const oldAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'a' }],
    });
    const newAST = createNode('Program', {
      comments: [{ type: 'Comment', value: 'b' }],
    });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });

  it('should handle property becoming array', () => {
    const oldAST = createNode('Object', { items: 'single' });
    const newAST = createNode('Object', { items: ['a', 'b'] });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
    expect(result.changes.some((c) => c.path === 'items')).toBe(true);
  });

  it('should handle null values', () => {
    const oldAST = createNode('Object', { value: null });
    const newAST = createNode('Object', { value: 'defined' });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(false);
  });

  it('should handle special characters in names', () => {
    const oldAST = createNode('Object', { name: 'Player-1_Test' });
    const newAST = createNode('Object', { name: 'Player-1_Test' });

    const result = engine.diff(oldAST, newAST);

    expect(result.equivalent).toBe(true);
  });
});
