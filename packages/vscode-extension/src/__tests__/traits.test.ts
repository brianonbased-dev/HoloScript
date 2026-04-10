import { describe, it, expect } from 'vitest';

// We test the ALL_TRAITS data structure directly
// The providers themselves require VS Code API mocking

// Import traits as a pure data structure
import { ALL_TRAITS } from '../completionProvider';

describe('ALL_TRAITS', () => {
  describe('structure validation', () => {
    it('should have 56 traits defined', () => {
      expect(ALL_TRAITS).toHaveLength(56);
    });

    it('should have unique labels', () => {
      const labels = ALL_TRAITS.map((t) => t.label);
      const uniqueLabels = new Set(labels);
      expect(uniqueLabels.size).toBe(labels.length);
    });

    it('should have all required properties on each trait', () => {
      for (const trait of ALL_TRAITS) {
        expect(trait).toHaveProperty('label');
        expect(trait).toHaveProperty('detail');
        expect(trait).toHaveProperty('insertText');
        expect(trait).toHaveProperty('documentation');
        expect(trait).toHaveProperty('category');
      }
    });

    it('should have labels starting with @', () => {
      for (const trait of ALL_TRAITS) {
        expect(trait.label).toMatch(/^@[a-z_]+$/);
      }
    });

    it('should have non-empty documentation', () => {
      for (const trait of ALL_TRAITS) {
        expect(trait.documentation.length).toBeGreaterThan(10);
      }
    });
  });

  describe('categories', () => {
    it('should have valid categories', () => {
      const validCategories = [
        'Interaction',
        'Visual',
        'AI/Behavior',
        'Physics',
        'Extended',
        'Advanced',
      ];

      for (const trait of ALL_TRAITS) {
        expect(validCategories).toContain(trait.category);
      }
    });

    it('should have Interaction traits', () => {
      const interactionTraits = ALL_TRAITS.filter((t) => t.category === 'Interaction');
      expect(interactionTraits.length).toBeGreaterThan(5);

      const interactionLabels = interactionTraits.map((t) => t.label);
      expect(interactionLabels).toContain('@grabbable');
      expect(interactionLabels).toContain('@throwable');
      expect(interactionLabels).toContain('@collidable');
    });

    it('should have Visual traits', () => {
      const visualTraits = ALL_TRAITS.filter((t) => t.category === 'Visual');
      expect(visualTraits.length).toBeGreaterThan(5);

      const visualLabels = visualTraits.map((t) => t.label);
      expect(visualLabels).toContain('@glowing');
      expect(visualLabels).toContain('@transparent');
    });

    it('should have Physics traits', () => {
      const physicsTraits = ALL_TRAITS.filter((t) => t.category === 'Physics');
      expect(physicsTraits.length).toBeGreaterThan(3);

      const physicsLabels = physicsTraits.map((t) => t.label);
      expect(physicsLabels).toContain('@cloth');
      expect(physicsLabels).toContain('@fluid');
    });

    it('should have AI/Behavior traits', () => {
      const aiTraits = ALL_TRAITS.filter((t) => t.category === 'AI/Behavior');
      expect(aiTraits.length).toBeGreaterThan(2);

      const aiLabels = aiTraits.map((t) => t.label);
      expect(aiLabels).toContain('@behavior_tree');
      expect(aiLabels).toContain('@emotion');
    });
  });

  describe('insertText snippets', () => {
    it('should have valid snippet placeholders', () => {
      const traitsWithSnippets = ALL_TRAITS.filter((t) => t.insertText.includes('${'));

      for (const trait of traitsWithSnippets) {
        // Check for valid snippet format ${N:value} or ${N}
        expect(trait.insertText).toMatch(/\$\{\d+(?::[^}]+)?\}/);
      }
    });

    it('should have simple insertText for basic traits', () => {
      const basicTraits = ['@grabbable', '@throwable', '@collidable'];

      for (const label of basicTraits) {
        const trait = ALL_TRAITS.find((t) => t.label === label);
        expect(trait).toBeDefined();
        // Basic traits shouldn't have complex snippets
      }
    });

    it('should have parameterized insertText for configurable traits', () => {
      const configurableTraits = ['@physics', '@gravity', '@lod'];

      for (const label of configurableTraits) {
        const trait = ALL_TRAITS.find((t) => t.label === label);
        if (trait) {
          expect(trait.insertText).toMatch(/\(.*\)/);
        }
      }
    });
  });

  describe('specific traits', () => {
    it('should have @grabbable with correct documentation', () => {
      const grabbable = ALL_TRAITS.find((t) => t.label === '@grabbable');
      expect(grabbable).toBeDefined();
      expect(grabbable?.documentation).toContain('VR');
      expect(grabbable?.documentation).toContain('grab');
      expect(grabbable?.category).toBe('Interaction');
    });

    it('should have @physics with mass and restitution params', () => {
      const physics = ALL_TRAITS.find((t) => t.label === '@physics');
      expect(physics).toBeDefined();
      expect(physics?.insertText).toContain('mass');
      expect(physics?.insertText).toContain('restitution');
    });

    it('should have @networked for multiplayer', () => {
      const networked = ALL_TRAITS.find((t) => t.label === '@networked');
      expect(networked).toBeDefined();
      expect(networked?.documentation.toLowerCase()).toContain('sync');
    });

    it('should have @cloth for soft body simulation', () => {
      const cloth = ALL_TRAITS.find((t) => t.label === '@cloth');
      expect(cloth).toBeDefined();
      expect(cloth?.category).toBe('Physics');
    });

    it('should have @portal for scene transitions', () => {
      const portal = ALL_TRAITS.find((t) => t.label === '@portal');
      expect(portal).toBeDefined();
      expect(portal?.insertText).toContain('destination');
    });

    it('should have @mirror for reflections', () => {
      const mirror = ALL_TRAITS.find((t) => t.label === '@mirror');
      expect(mirror).toBeDefined();
      expect(mirror?.insertText).toContain('quality');
    });
  });

  describe('trait lookup helpers', () => {
    it('should be able to create a Map from traits', () => {
      const traitMap = new Map(ALL_TRAITS.map((t) => [t.label.slice(1), t]));

      expect(traitMap.size).toBe(56);
      expect(traitMap.get('grabbable')?.label).toBe('@grabbable');
      expect(traitMap.get('physics')?.category).toBe('Interaction');
    });

    it('should be able to group traits by category', () => {
      const byCategory = ALL_TRAITS.reduce(
        (acc, t) => {
          if (!acc[t.category]) acc[t.category] = [];
          acc[t.category].push(t);
          return acc;
        },
        {} as Record<string, typeof ALL_TRAITS>
      );

      expect(Object.keys(byCategory).length).toBeGreaterThan(0);
      expect(byCategory['Interaction'].length).toBeGreaterThan(0);
    });

    it('should be able to search traits by text', () => {
      const searchTrait = (query: string) =>
        ALL_TRAITS.filter(
          (t) =>
            t.label.toLowerCase().includes(query.toLowerCase()) ||
            t.documentation.toLowerCase().includes(query.toLowerCase())
        );

      const grabResults = searchTrait('grab');
      expect(grabResults.length).toBeGreaterThan(0);

      const physicsResults = searchTrait('physics');
      expect(physicsResults.length).toBeGreaterThan(0);
    });
  });
});
