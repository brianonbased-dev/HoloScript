/**
 * TraitCompositor Production Tests
 * Sprint CLXVII — layer ordering, suppression, requires, additive, multi-trait merge
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { TraitCompositor } from '../TraitCompositor';
import { TraitVisualRegistry } from '../TraitVisualRegistry';
import type { TraitVisualConfig, R3FMaterialProps } from '../types';
import type { CompositionRule } from '../composition-rules';

// ---------------------------------------------------------------------------
// Helpers: build isolated registry + compositor for each test
// ---------------------------------------------------------------------------

function makeRegistry(entries: Record<string, TraitVisualConfig>): TraitVisualRegistry {
  // Use a fresh, non-singleton registry instance by exploiting the private constructor bypass
  // via the registerBatch approach on a reset singleton.
  const reg = TraitVisualRegistry.getInstance();
  reg.reset();
  reg.registerBatch(entries);
  return reg;
}

function makeCompositor(
  entries: Record<string, TraitVisualConfig>,
  rules: CompositionRule[] = []
): TraitCompositor {
  const reg = makeRegistry(entries);
  return new TraitCompositor(reg, rules);
}

// ---------------------------------------------------------------------------
// Basic merge
// ---------------------------------------------------------------------------

describe('TraitCompositor', () => {
  beforeEach(() => {
    TraitVisualRegistry.getInstance().reset();
  });

  describe('compose — basic merge', () => {
    it('returns empty object for empty trait list', () => {
      const c = makeCompositor({});
      expect(c.compose([])).toEqual({});
    });

    it('returns empty object for all-unknown traits', () => {
      const c = makeCompositor({});
      expect(c.compose(['unknown', 'nope'])).toEqual({});
    });

    it('returns material properties for a single trait', () => {
      const c = makeCompositor({
        metallic: { material: { metalness: 1.0, roughness: 0.2 }, layer: 'base_material' },
      });
      const result = c.compose(['metallic']);
      expect(result.metalness).toBe(1.0);
      expect(result.roughness).toBe(0.2);
    });

    it('merges two non-conflicting traits', () => {
      const c = makeCompositor({
        metallic: { material: { metalness: 1.0 }, layer: 'base_material' },
        glowing: { emissive: { color: '#FFF', intensity: 0.5 }, layer: 'lighting' },
      });
      const result = c.compose(['metallic', 'glowing']);
      expect(result.metalness).toBe(1.0);
      expect(result.emissive).toBe('#FFF');
      expect(result.emissiveIntensity).toBe(0.5);
    });

    it('opacity < 1 sets transparent=true', () => {
      const c = makeCompositor({
        translucent: { opacity: 0.5, layer: 'visual_effect' },
      });
      const result = c.compose(['translucent']);
      expect(result.opacity).toBe(0.5);
      expect(result.transparent).toBe(true);
    });

    it('opacity = 1 sets transparent=false (not transparent)', () => {
      const c = makeCompositor({
        solid: { opacity: 1.0, layer: 'base_material' },
      });
      const result = c.compose(['solid']);
      // transparent is explicitly set to false when opacity is 1 (not < 1)
      expect(result.transparent).toBeFalsy();
    });
  });

  // -------------------------------------------------------------------------
  // Layer priority (higher layer overrides lower)
  // -------------------------------------------------------------------------

  describe('compose — layer priority ordering', () => {
    it('higher-priority layer (mood=8) overrides base_material (0)', () => {
      const c = makeCompositor({
        base: { material: { color: '#red', roughness: 0.5 }, layer: 'base_material' },
        angry: { material: { color: '#FF0000' }, layer: 'mood' },
      });
      const result = c.compose(['base', 'angry']);
      expect(result.color).toBe('#FF0000');
    });

    it('lower-priority layer does not override higher-priority', () => {
      const c = makeCompositor({
        mood_trait: { material: { color: '#blue' }, layer: 'mood' },
        base_trait: { material: { color: '#red' }, layer: 'base_material' },
      });
      // mood (8) > base_material (0) → mood wins
      const result = c.compose(['base_trait', 'mood_trait']);
      expect(result.color).toBe('#blue');
    });

    it('visual_effect layer (6) overrides condition (2) but not mood (8)', () => {
      const c = makeCompositor({
        condition: { material: { roughness: 0.9 }, layer: 'condition' },
        viseff: { material: { roughness: 0.5 }, layer: 'visual_effect' },
        moodtrait: { material: { roughness: 0.1 }, layer: 'mood' },
      });
      const result = c.compose(['condition', 'viseff', 'moodtrait']);
      expect(result.roughness).toBe(0.1); // mood wins
    });

    it('missing layer defaults to visual_effect (6)', () => {
      const c = makeCompositor({
        base: { material: { color: '#A' }, layer: 'base_material' },
        noLayer: { material: { color: '#B' } }, // defaults to visual_effect
      });
      const result = c.compose(['base', 'noLayer']);
      expect(result.color).toBe('#B'); // visual_effect (6) > base_material (0)
    });
  });

  // -------------------------------------------------------------------------
  // Suppression rules
  // -------------------------------------------------------------------------

  describe('compose — suppression rules', () => {
    it('suppressing trait removes suppressed trait from output', () => {
      const c = makeCompositor(
        {
          pristine: { material: { roughness: 0.05 }, layer: 'condition', tags: [] },
          rusted: { material: { roughness: 0.95, color: '#8B4513' }, layer: 'condition' },
        },
        [{ trait: 'pristine', suppresses: ['rusted'] }]
      );
      const result = c.compose(['pristine', 'rusted']);
      expect(result.color).toBeUndefined();
      expect(result.roughness).toBe(0.05);
    });

    it('suppression is one-directional', () => {
      // If rusted suppresses nothing, pristine still suppresses rusted
      const c = makeCompositor(
        {
          base: { material: { color: '#gray' }, layer: 'base_material' },
          pristine: { material: { roughness: 0.05 }, layer: 'condition' },
          worn: { material: { roughness: 0.8 }, layer: 'condition' },
        },
        [{ trait: 'pristine', suppresses: ['worn'] }]
      );
      const result = c.compose(['base', 'pristine', 'worn']);
      expect(result.roughness).toBe(0.05);
    });

    it('suppressor not present means suppressed trait is kept', () => {
      const c = makeCompositor(
        {
          rusted: { material: { color: '#brown' }, layer: 'condition' },
        },
        [{ trait: 'pristine', suppresses: ['rusted'] }]
      );
      const result = c.compose(['rusted']); // pristine absent
      expect(result.color).toBe('#brown');
    });
  });

  // -------------------------------------------------------------------------
  // Requires rules
  // -------------------------------------------------------------------------

  describe('compose — requires rules', () => {
    it('trait is excluded if its required tag is not provided by another trait', () => {
      const c = makeCompositor(
        {
          rusted: { material: { color: '#rust' }, tags: ['corrosion'], layer: 'condition' },
        },
        [{ trait: 'rusted', requires: { tags: ['metallic'] } }]
      );
      // No metallic provider → rusted excluded
      const result = c.compose(['rusted']);
      expect(result.color).toBeUndefined();
    });

    it('trait is included if required tag is provided by another trait', () => {
      const c = makeCompositor(
        {
          metallic: { material: { metalness: 1.0 }, tags: ['metallic'], layer: 'base_material' },
          rusted: { material: { color: '#rust' }, tags: [], layer: 'condition' },
        },
        [{ trait: 'rusted', requires: { tags: ['metallic'] } }]
      );
      const result = c.compose(['metallic', 'rusted']);
      expect(result.color).toBe('#rust');
    });

    it('a trait cannot self-satisfy its own requirement', () => {
      const c = makeCompositor(
        {
          // rusted tags include 'metallic', but it cannot satisfy its own requirement
          rusted: { material: { color: '#rust' }, tags: ['metallic'], layer: 'condition' },
        },
        [{ trait: 'rusted', requires: { tags: ['metallic'] } }]
      );
      // Only rusted is present — it tags itself as 'metallic' but can't self-satisfy
      const result = c.compose(['rusted']);
      expect(result.color).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Additive rules
  // -------------------------------------------------------------------------

  describe('compose — additive rules', () => {
    it('additive rule applies on top of merged material', () => {
      const c = makeCompositor(
        {
          enchanted: { material: { roughness: 0.5 }, layer: 'visual_effect' },
        },
        [{ trait: 'enchanted', additive: { emissive: '#9966FF', emissiveIntensity: 0.3 } }]
      );
      const result = c.compose(['enchanted']);
      expect(result.emissive).toBe('#9966FF');
      expect(result.emissiveIntensity).toBe(0.3);
    });

    it('additive can override previously merged opacity', () => {
      const c = makeCompositor(
        {
          ghostly: { opacity: 0.8, layer: 'visual_effect' },
        },
        [{ trait: 'ghostly', additive: { opacity: 0.3, transparent: true } }]
      );
      const result = c.compose(['ghostly']);
      expect(result.opacity).toBe(0.3);
      expect(result.transparent).toBe(true);
    });

    it('additive only applies when the trait is present', () => {
      const c = makeCompositor(
        {
          base: { material: { color: '#gray' }, layer: 'base_material' },
        },
        [{ trait: 'enchanted', additive: { emissive: '#9966FF' } }]
      );
      const result = c.compose(['base']); // enchanted absent
      expect(result.emissive).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Multi-trait merge rules
  // -------------------------------------------------------------------------

  describe('compose — multi-trait merge rules', () => {
    it('applies merge when all required traits are present', () => {
      const c = makeCompositor(
        {
          rusted: { material: { roughness: 0.9 }, tags: ['corrosion'], layer: 'condition' },
          iron_material: {
            material: { metalness: 0.8 },
            tags: ['metallic'],
            layer: 'base_material',
          },
        },
        [
          { trait: 'rusted', requires: { tags: ['metallic'] } },
          {
            traits: ['rusted', 'iron_material'],
            merge: { color: '#6B3A1F', roughness: 0.9, metalness: 0.5 },
          },
        ]
      );
      const result = c.compose(['rusted', 'iron_material']);
      expect(result.color).toBe('#6B3A1F');
      expect(result.roughness).toBe(0.9);
      expect(result.metalness).toBe(0.5);
    });

    it('does not apply merge when one trait is missing', () => {
      const c = makeCompositor(
        {
          rusted: { material: { color: '#brown' }, layer: 'condition' },
        },
        [{ traits: ['rusted', 'iron_material'], merge: { color: '#6B3A1F' } }]
      );
      const result = c.compose(['rusted']); // iron_material absent
      expect(result.color).toBe('#brown'); // original color kept
    });

    it('multi-trait merge overrides earlier merged values', () => {
      const c = makeCompositor(
        {
          water: { material: { color: '#0000FF', roughness: 0.0 }, layer: 'base_material' },
          frozen_liquid: { material: { color: '#D6EAF8' }, layer: 'condition' },
        },
        [
          {
            traits: ['elemental_water', 'frozen_liquid'],
            merge: { color: '#B0D4E8', transmission: 0.85, roughness: 0.05 },
          },
        ]
      );
      // Use trait names that match the rule exactly
      const c2 = makeCompositor(
        {
          elemental_water: {
            material: { color: '#0000FF', roughness: 0.0 },
            layer: 'base_material',
          },
          frozen_liquid: { material: { color: '#D6EAF8' }, layer: 'condition' },
        },
        [
          {
            traits: ['elemental_water', 'frozen_liquid'],
            merge: { color: '#B0D4E8', transmission: 0.85, roughness: 0.05 },
          },
        ]
      );
      const result = c2.compose(['elemental_water', 'frozen_liquid']);
      expect(result.color).toBe('#B0D4E8');
      expect(result.transmission).toBe(0.85);
      expect(result.roughness).toBe(0.05);
    });
  });

  // -------------------------------------------------------------------------
  // Integration with real COMPOSITION_RULES
  // -------------------------------------------------------------------------

  describe('real COMPOSITION_RULES integration', () => {
    it('pristine suppresses rusted from default rules', () => {
      const reg = makeRegistry({
        pristine: { material: { roughness: 0.05 }, layer: 'condition' },
        rusted: { material: { color: '#8B4513', roughness: 0.9 }, layer: 'condition' },
      });
      // Use the real rules (no custom rules arg = default)
      const c = new TraitCompositor(reg);
      const result = c.compose(['pristine', 'rusted']);
      // rusted should be suppressed
      expect(result.color).toBeUndefined();
    });

    it('frozen_liquid suppresses fiery from default rules', () => {
      // frozen_liquid suppresses fiery; fiery does not suppress frozen_liquid in the default rules
      const reg = makeRegistry({
        frozen_liquid: { material: { color: '#D6EAF8' }, layer: 'condition' },
        fiery: { emissive: { color: '#FF4500', intensity: 2.0 }, layer: 'visual_effect' },
      });
      const c = new TraitCompositor(reg);
      const result = c.compose(['frozen_liquid', 'fiery']);
      // fiery should be suppressed → no red emissive
      expect(result.emissive).toBeUndefined();
      expect(result.color).toBe('#D6EAF8');
    });

    it('rusted without metallic is excluded (requires rule)', () => {
      const reg = makeRegistry({
        rusted: { material: { color: '#rust' }, layer: 'condition' },
      });
      const c = new TraitCompositor(reg);
      const result = c.compose(['rusted']);
      expect(result.color).toBeUndefined();
    });

    it('enchanted additive rule applies emissive glow', () => {
      const reg = makeRegistry({
        enchanted: { material: { roughness: 0.5 }, layer: 'visual_effect' },
      });
      const c = new TraitCompositor(reg);
      const result = c.compose(['enchanted']);
      expect(result.emissive).toBe('#9966FF');
      expect(result.emissiveIntensity).toBe(0.3);
    });
  });
});
