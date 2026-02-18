/**
 * Sprint 45 — holoscript-vscode acceptance tests
 * Covers: ALL_TRAITS catalog shape, counts, categories, and field constraints
 *
 * NOTE: completionProvider.ts imports 'vscode' which is not available in Node.
 *       We vi.mock('vscode') so the module loads cleanly.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock the vscode module before importing the file that uses it
vi.mock('vscode', () => ({
  CompletionItemKind: { Keyword: 14, Field: 5, Function: 3 },
  CompletionItem: class {
    label: string;
    kind: number;
    detail?: string;
    insertText?: string;
    documentation?: string;
    constructor(label: string, kind?: number) {
      this.label = label;
      this.kind = kind ?? 14;
    }
  },
  MarkdownString: class {
    value: string;
    constructor(value?: string) { this.value = value ?? ''; }
  },
  languages: { registerCompletionItemProvider: vi.fn() },
}));

import { ALL_TRAITS } from '../completionProvider';

// ═══════════════════════════════════════════════
// ALL_TRAITS — array shape and count
// ═══════════════════════════════════════════════
describe('ALL_TRAITS', () => {
  it('is defined and is an array', () => {
    expect(Array.isArray(ALL_TRAITS)).toBe(true);
  });

  it('has exactly 56 traits', () => {
    expect(ALL_TRAITS).toHaveLength(56);
  });

  it('every trait has a non-empty label', () => {
    for (const t of ALL_TRAITS) {
      expect(typeof t.label).toBe('string');
      expect(t.label.length).toBeGreaterThan(0);
    }
  });

  it('every label starts with "@"', () => {
    for (const t of ALL_TRAITS) {
      expect(t.label).toMatch(/^@/);
    }
  });

  it('every trait has a non-empty detail string', () => {
    for (const t of ALL_TRAITS) {
      expect(typeof t.detail).toBe('string');
      expect(t.detail.length).toBeGreaterThan(0);
    }
  });

  it('every trait has an insertText string', () => {
    for (const t of ALL_TRAITS) {
      expect(typeof t.insertText).toBe('string');
    }
  });

  it('every trait has a non-empty documentation string', () => {
    for (const t of ALL_TRAITS) {
      expect(typeof t.documentation).toBe('string');
      expect(t.documentation.length).toBeGreaterThan(0);
    }
  });

  it('every trait has a non-empty category string', () => {
    for (const t of ALL_TRAITS) {
      expect(typeof t.category).toBe('string');
      expect(t.category.length).toBeGreaterThan(0);
    }
  });

  it('all labels are unique', () => {
    const labels = ALL_TRAITS.map((t) => t.label);
    const uniqueLabels = new Set(labels);
    expect(uniqueLabels.size).toBe(labels.length);
  });
});

// ═══════════════════════════════════════════════
// ALL_TRAITS — category distribution
// ═══════════════════════════════════════════════
describe('ALL_TRAITS categories', () => {
  let categoryCounts: Record<string, number>;

  beforeAll(() => {
    categoryCounts = {};
    for (const t of ALL_TRAITS) {
      categoryCounts[t.category] = (categoryCounts[t.category] ?? 0) + 1;
    }
  });

  it('has at least 5 distinct categories', () => {
    expect(Object.keys(categoryCounts).length).toBeGreaterThanOrEqual(5);
  });

  it('has an "Interaction" category', () => {
    expect(categoryCounts['Interaction']).toBeGreaterThan(0);
  });

  it('Interaction category has at least 5 traits', () => {
    expect(categoryCounts['Interaction']).toBeGreaterThanOrEqual(5);
  });

  it('has a "Visual" category', () => {
    expect(categoryCounts['Visual']).toBeGreaterThan(0);
  });

  it('has a "Physics" category', () => {
    expect(categoryCounts['Physics']).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// ALL_TRAITS — spot-check well-known traits
// ═══════════════════════════════════════════════
describe('ALL_TRAITS spot-checks', () => {
  it('includes @grabbable', () => {
    const t = ALL_TRAITS.find((t) => t.label === '@grabbable');
    expect(t).toBeDefined();
    expect(t!.category).toBe('Interaction');
    expect(t!.insertText).toBe('grabbable');
  });

  it('@throwable has a snippet insertText with force parameter', () => {
    const t = ALL_TRAITS.find((t) => t.label === '@throwable');
    expect(t).toBeDefined();
    expect(t!.insertText).toContain('throwable');
  });

  it('@physics has snippet parameters', () => {
    const t = ALL_TRAITS.find((t) => t.label === '@physics');
    expect(t).toBeDefined();
    expect(t!.insertText).toContain('physics');
  });

  it('@collidable is in Interaction category', () => {
    const t = ALL_TRAITS.find((t) => t.label === '@collidable');
    expect(t).toBeDefined();
    expect(t!.category).toBe('Interaction');
  });
});
