/**
 * Tests for HoloScriptCompletionItemProvider
 *
 * Validates the completion provider that generates VS Code CompletionItems
 * from the ALL_TRAITS data structure. Tests both the data layer and the
 * provider class behavior.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ALL_TRAITS,
  HoloScriptCompletionItemProvider,
} from '../completionProvider';
import {
  CompletionItemKind,
  SnippetString,
  MarkdownString,
  CancellationTokenSource,
} from '../__tests__/__mocks__/vscode';

// ---------------------------------------------------------------------------
// ALL_TRAITS data validation
// ---------------------------------------------------------------------------

describe('ALL_TRAITS data integrity', () => {
  it('should contain exactly 56 trait definitions', () => {
    expect(ALL_TRAITS).toHaveLength(56);
  });

  it('should have unique labels across all traits', () => {
    const labels = ALL_TRAITS.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('should have every label prefixed with @', () => {
    for (const trait of ALL_TRAITS) {
      expect(trait.label.startsWith('@')).toBe(true);
    }
  });

  it('should have non-empty documentation on every trait', () => {
    for (const trait of ALL_TRAITS) {
      expect(trait.documentation.length).toBeGreaterThan(10);
    }
  });

  it('should have non-empty detail on every trait', () => {
    for (const trait of ALL_TRAITS) {
      expect(trait.detail.length).toBeGreaterThan(0);
    }
  });

  it('should have non-empty insertText on every trait', () => {
    for (const trait of ALL_TRAITS) {
      expect(trait.insertText.length).toBeGreaterThan(0);
    }
  });

  describe('category distribution', () => {
    const categories = [
      { name: 'Interaction', expectedCount: 11 },
      { name: 'Visual', expectedCount: 10 },
      { name: 'AI/Behavior', expectedCount: 5 },
      { name: 'Physics', expectedCount: 9 },
      { name: 'Extended', expectedCount: 11 },
      { name: 'Advanced', expectedCount: 10 },
    ];

    for (const { name, expectedCount } of categories) {
      it(`should have ${expectedCount} "${name}" traits`, () => {
        const count = ALL_TRAITS.filter((t) => t.category === name).length;
        expect(count).toBe(expectedCount);
      });
    }

    it('should have exactly 6 categories', () => {
      const uniqueCategories = new Set(ALL_TRAITS.map((t) => t.category));
      expect(uniqueCategories.size).toBe(6);
    });
  });

  describe('snippet placeholder format', () => {
    it('should use valid VS Code snippet syntax for parameterized traits', () => {
      const traitsWithPlaceholders = ALL_TRAITS.filter((t) =>
        t.insertText.includes('${')
      );
      expect(traitsWithPlaceholders.length).toBeGreaterThan(0);

      for (const trait of traitsWithPlaceholders) {
        // Every ${ must have a matching }
        const opens = (trait.insertText.match(/\$\{/g) || []).length;
        const closes = (trait.insertText.match(/\}/g) || []).length;
        expect(closes).toBeGreaterThanOrEqual(opens);
      }
    });

    it('should have simple (non-snippet) insertText for basic traits', () => {
      const simple = ['grabbable', 'collidable', 'trigger', 'pointable', 'hoverable', 'clickable', 'draggable', 'billboard', 'goal_oriented', 'rotatable', 'stackable'];
      for (const name of simple) {
        const trait = ALL_TRAITS.find((t) => t.insertText === name);
        expect(trait).toBeDefined();
        expect(trait!.insertText).not.toContain('${');
      }
    });
  });

  describe('specific trait content', () => {
    it('@physics should mention mass and restitution', () => {
      const physics = ALL_TRAITS.find((t) => t.label === '@physics')!;
      expect(physics.insertText).toContain('mass');
      expect(physics.insertText).toContain('restitution');
      expect(physics.category).toBe('Interaction');
    });

    it('@networked should document multiplayer synchronization', () => {
      const networked = ALL_TRAITS.find((t) => t.label === '@networked')!;
      expect(networked.documentation.toLowerCase()).toContain('sync');
      expect(networked.documentation.toLowerCase()).toContain('multiplayer');
    });

    it('@portal should reference destination', () => {
      const portal = ALL_TRAITS.find((t) => t.label === '@portal')!;
      expect(portal.insertText).toContain('destination');
      expect(portal.category).toBe('Advanced');
    });

    it('@cloth should belong to Physics category', () => {
      const cloth = ALL_TRAITS.find((t) => t.label === '@cloth')!;
      expect(cloth.category).toBe('Physics');
      expect(cloth.insertText).toContain('stiffness');
    });

    it('@behavior_tree should belong to AI/Behavior category', () => {
      const bt = ALL_TRAITS.find((t) => t.label === '@behavior_tree')!;
      expect(bt.category).toBe('AI/Behavior');
      expect(bt.insertText).toContain('root');
    });
  });
});

// ---------------------------------------------------------------------------
// HoloScriptCompletionItemProvider
// ---------------------------------------------------------------------------

describe('HoloScriptCompletionItemProvider', () => {
  let provider: HoloScriptCompletionItemProvider;
  let token: InstanceType<typeof CancellationTokenSource>['token'];

  beforeEach(() => {
    provider = new HoloScriptCompletionItemProvider();
    token = new CancellationTokenSource().token;
  });

  it('should return an array of completion items', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    );

    expect(Array.isArray(items)).toBe(true);
    expect((items as any[]).length).toBe(56);
  });

  it('should create CompletionItems with Keyword kind', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    for (const item of items) {
      expect(item.kind).toBe(CompletionItemKind.Keyword);
    }
  });

  it('should set detail with category prefix', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const grabbable = items.find((i: any) => i.label === '@grabbable');
    expect(grabbable).toBeDefined();
    expect(grabbable.detail).toContain('[Interaction]');
    expect(grabbable.detail).toContain('Make object grabbable');
  });

  it('should set sortText with category grouping', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const grabbable = items.find((i: any) => i.label === '@grabbable');
    expect(grabbable.sortText).toBe('0_Interaction_@grabbable');

    const glowing = items.find((i: any) => i.label === '@glowing');
    expect(glowing.sortText).toBe('0_Visual_@glowing');
  });

  it('should use SnippetString for parameterized traits', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const physics = items.find((i: any) => i.label === '@physics');
    expect(physics.insertText).toBeInstanceOf(SnippetString);
    expect((physics.insertText as SnippetString).value).toContain('mass');
  });

  it('should use plain string insertText for simple traits', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const grabbable = items.find((i: any) => i.label === '@grabbable');
    expect(typeof grabbable.insertText).toBe('string');
    expect(grabbable.insertText).toBe('grabbable');
  });

  it('should include MarkdownString documentation', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const portal = items.find((i: any) => i.label === '@portal');
    expect(portal.documentation).toBeInstanceOf(MarkdownString);

    const md = portal.documentation as MarkdownString;
    expect(md.value).toContain('@portal');
    expect(md.value).toContain('Advanced');
    expect(md.value).toContain('portal');
  });

  it('should produce unique labels in completion items', () => {
    const items = provider.provideCompletionItems(
      {} as any,
      {} as any,
      token as any,
      {} as any
    ) as any[];

    const labels = items.map((i: any) => i.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
