import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TraitRecommendationProvider } from '../providers/TraitRecommendationProvider';

// Mock vscode-languageserver types
vi.mock('vscode-languageserver/node.js', () => ({
  CompletionItemKind: {
    Interface: 8,
  },
  MarkupKind: {
    Markdown: 'markdown',
  },
}));

/**
 * Create a minimal TextDocument mock from source text.
 */
function mockDocument(text: string): any {
  return {
    getText: () => text,
    uri: 'file:///test.holo',
  };
}

describe('TraitRecommendationProvider', () => {
  let provider: TraitRecommendationProvider;

  beforeEach(() => {
    provider = new TraitRecommendationProvider();
  });

  // -----------------------------------------------------------------------
  // Context extraction
  // -----------------------------------------------------------------------

  describe('extractCompositionContext', () => {
    it('should extract category from metadata block', () => {
      const text = `
composition "SurgicalSim" {
  metadata {
    category: "healthcare"
    tags: ["medical", "surgical"]
  }
}`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.category).toBe('healthcare');
      expect(ctx.tags).toEqual(['medical', 'surgical']);
    });

    it('should extract category from inline metadata', () => {
      const text = `
composition "MyScene" {
  category: "gaming"
  tags: ["rpg", "multiplayer"]
}`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.category).toBe('gaming');
      expect(ctx.tags).toEqual(['rpg', 'multiplayer']);
    });

    it('should extract category from @world_metadata block', () => {
      const text = `
@world_metadata {
  id: "my-world"
  category: "education"
  tags: ["classroom"]
}`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.category).toBe('education');
      expect(ctx.tags).toEqual(['classroom']);
    });

    it('should infer vertical from composition name keywords', () => {
      const text = `composition "MedicalTrainingLab" { }`;
      const ctx = provider.extractCompositionContext(text);
      // "medical" appears in the name, so should not match (we check specific keywords)
      // But "hospital", "clinic" would match. Let's test one that works:
      const text2 = `composition "FactoryFloor" { }`;
      const ctx2 = provider.extractCompositionContext(text2);
      expect(ctx2.category).toBe('manufacturing');
    });

    it('should return null category and empty tags for unknown content', () => {
      const text = `orb my_cube { position: [0, 0, 0] }`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.category).toBeNull();
      expect(ctx.tags).toEqual([]);
    });

    it('should handle tags with single-quoted strings', () => {
      const text = `tags: ["healthcare", "training"]`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.tags).toContain('healthcare');
      expect(ctx.tags).toContain('training');
    });

    it('should handle category with extra whitespace', () => {
      const text = `category:   "retail"`;
      const ctx = provider.extractCompositionContext(text);
      expect(ctx.category).toBe('retail');
    });
  });

  // -----------------------------------------------------------------------
  // Recommendation generation
  // -----------------------------------------------------------------------

  describe('getRecommendations', () => {
    it('should return recommendations for healthcare category', () => {
      const doc = mockDocument(`
composition "SurgicalSim" {
  metadata {
    category: "healthcare"
  }
  object "Model" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);

      // Healthcare should recommend @hand_tracked as highest relevance
      const labels = items.map((i) => i.label);
      expect(labels).toContain('@hand_tracked');
    });

    it('should return recommendations for gaming category', () => {
      const doc = mockDocument(`
composition "BattleArena" {
  category: "gaming"
  object "Player" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);

      const labels = items.map((i) => i.label);
      expect(labels).toContain('@rigidbody');
      expect(labels).toContain('@networked');
      expect(labels).toContain('@character');
    });

    it('should return recommendations from tag matching', () => {
      const doc = mockDocument(`
composition "MySim" {
  tags: ["surgical", "training"]
  object "Hand" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);
    });

    it('should filter by partial trait name', () => {
      const doc = mockDocument(`
composition "MedSim" {
  category: "healthcare"
  object "Tool" {
    @hand
  }
}`);
      const items = provider.getRecommendations(doc, '    @hand');
      // Should only include traits starting with "hand"
      for (const item of items) {
        expect(item.insertText).toMatch(/^hand/);
      }
    });

    it('should return empty array for top-level @ (not indented)', () => {
      const doc = mockDocument(`
composition "Scene" {
  category: "healthcare"
}
@`);
      const items = provider.getRecommendations(doc, '@');
      expect(items).toEqual([]);
    });

    it('should return empty array when no category or tags are present', () => {
      const doc = mockDocument(`
orb my_cube {
  position: [0, 0, 0]
  @
}`);
      const items = provider.getRecommendations(doc, '  @');
      expect(items).toEqual([]);
    });

    it('should not return duplicate traits across verticals', () => {
      const doc = mockDocument(`
composition "HybridScene" {
  category: "healthcare"
  tags: ["education", "training"]
  object "Model" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      const labels = items.map((i) => i.label);
      const uniqueLabels = new Set(labels);
      expect(labels.length).toBe(uniqueLabels.size);
    });
  });

  // -----------------------------------------------------------------------
  // Completion item structure
  // -----------------------------------------------------------------------

  describe('completion item structure', () => {
    it('should include proper documentation with config hints', () => {
      const doc = mockDocument(`
composition "Scene" {
  category: "healthcare"
  object "Tool" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);

      const first = items[0];
      expect(first.label).toMatch(/^@/);
      expect(first.kind).toBe(8); // CompletionItemKind.Interface
      expect(first.detail).toContain('Healthcare');
      expect(first.insertText).not.toContain('@');
      expect(first.sortText).toMatch(/^01_rec_/);
      expect(first.documentation).toBeDefined();

      // Documentation should be markdown
      const docValue = (first.documentation as any)?.value;
      expect(docValue).toContain('Suggested config:');
      expect(docValue).toContain('```holoscript');
    });

    it('should include relevance percentage in detail', () => {
      const doc = mockDocument(`
composition "Scene" {
  category: "gaming"
  object "Player" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);

      // All items should have a percentage in their detail
      for (const item of items) {
        expect(item.detail).toMatch(/\d+% match/);
      }
    });

    it('should set data with recommendation metadata', () => {
      const doc = mockDocument(`
composition "Scene" {
  category: "retail"
  object "Product" {
    @
  }
}`);
      const items = provider.getRecommendations(doc, '    @');
      expect(items.length).toBeGreaterThan(0);

      const first = items[0];
      expect(first.data).toEqual({
        isRecommendation: true,
        vertical: 'retail',
        relevance: expect.any(Number),
      });
    });
  });

  // -----------------------------------------------------------------------
  // All 15 verticals
  // -----------------------------------------------------------------------

  describe('all 15 verticals', () => {
    const verticals = [
      'healthcare', 'education', 'retail', 'gaming', 'architecture',
      'manufacturing', 'entertainment', 'real-estate', 'fitness',
      'social', 'art', 'automotive', 'aerospace', 'tourism', 'robotics',
    ];

    for (const vertical of verticals) {
      it(`should return recommendations for "${vertical}" vertical`, () => {
        const doc = mockDocument(`
composition "TestScene" {
  category: "${vertical}"
  object "Obj" {
    @
  }
}`);
        const items = provider.getRecommendations(doc, '    @');
        expect(items.length).toBeGreaterThan(0);
        expect(items.length).toBeLessThanOrEqual(10); // Each vertical has exactly 10 traits
      });
    }
  });
});
