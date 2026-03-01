/**
 * Tests for the Trait Composition Tree sidebar view.
 *
 * Tests the TraitCompositionAnalyzer which parses HoloScript source
 * to extract trait hierarchy, detect property overrides, and warn
 * about diamond inheritance.
 */

import { describe, it, expect } from 'vitest';
import { TraitCompositionAnalyzer } from '../traitTree/TraitCompositionAnalyzer';
import type { TraitTreeNode, TraitProperty, DiamondWarning } from '../traitTree/TraitTreeTypes';

// =============================================================================
// FIXTURES
// =============================================================================

const SIMPLE_TRAIT = `
trait Interactable {
  cursor: "default"
  highlight: false
}
`;

const INHERITANCE_CHAIN = `
trait Interactable {
  cursor: "default"
  highlight: false
}

trait Clickable extends Interactable {
  cursor: "pointer"
  highlight: true
  clickSound: "click.mp3"
}

trait DraggableButton extends Clickable {
  draggable: true
  cursor: "grab"
}
`;

const COMPOSITION_EXPRESSION = `
trait Physics {
  mass: 1.0
  gravity: 9.81
}

trait AI {
  intelligence: "basic"
  aggression: 0.5
}

trait Patrol {
  speed: 2.0
  mass: 5.0
}

@elite_npc = @Physics + @AI + @Patrol
`;

const DIAMOND_INHERITANCE = `
trait Base {
  color: "red"
  size: 10
}

trait ChildA extends Base {
  color: "blue"
  speed: 5
}

trait ChildB extends Base {
  color: "green"
  health: 100
}

@diamond = @ChildA + @ChildB
`;

const MULTIPLE_COMPOSITIONS = `
trait Physics {
  mass: 1.0
}

trait Targeting {
  range: 50
}

trait AI {
  intelligence: "basic"
}

@turret = @Physics + @Targeting
@guard = @Physics + @AI
`;

const EMPTY_FILE = ``;

const TRAIT_WITH_NESTED_BRACES = `
trait ComplexTrait {
  config: {
    nested: true
  }
  value: 42
}
`;

const ORPHANED_EXTENDS = `
trait ChildOfExternal extends ExternalTrait {
  myProp: "value"
}
`;

// =============================================================================
// ANALYZER TESTS
// =============================================================================

describe('TraitCompositionAnalyzer', () => {
  const analyzer = new TraitCompositionAnalyzer();

  // ---------------------------------------------------------------------------
  // Basic parsing
  // ---------------------------------------------------------------------------

  describe('basic trait parsing', () => {
    it('should parse a single trait definition', () => {
      const result = analyzer.analyze(SIMPLE_TRAIT, '/test/file.hsplus');

      expect(result.traits.size).toBe(1);
      expect(result.traits.has('Interactable')).toBe(true);

      const trait = result.traits.get('Interactable')!;
      expect(trait.label).toBe('Interactable');
      expect(trait.kind).toBe('trait');
      expect(trait.extends).toBeUndefined();
      expect(trait.ancestors).toEqual([]);
    });

    it('should extract properties from a trait', () => {
      const result = analyzer.analyze(SIMPLE_TRAIT, '/test/file.hsplus');
      const trait = result.traits.get('Interactable')!;

      expect(trait.properties).toBeDefined();
      expect(trait.properties!.length).toBe(2);

      const cursorProp = trait.properties!.find((p) => p.key === 'cursor');
      expect(cursorProp).toBeDefined();
      expect(cursorProp!.value).toBe('"default"');
      expect(cursorProp!.origin).toBe('Interactable');
      expect(cursorProp!.isOverride).toBe(false);
    });

    it('should set source locations for traits', () => {
      const result = analyzer.analyze(SIMPLE_TRAIT, '/test/file.hsplus');
      const trait = result.traits.get('Interactable')!;

      expect(trait.location).toBeDefined();
      expect(trait.location!.filePath).toBe('/test/file.hsplus');
      expect(trait.location!.line).toBeGreaterThan(0);
    });

    it('should set source locations for properties', () => {
      const result = analyzer.analyze(SIMPLE_TRAIT, '/test/file.hsplus');
      const trait = result.traits.get('Interactable')!;
      const cursorProp = trait.properties!.find((p) => p.key === 'cursor');

      expect(cursorProp!.location).toBeDefined();
      expect(cursorProp!.location!.filePath).toBe('/test/file.hsplus');
    });

    it('should return empty analysis for empty file', () => {
      const result = analyzer.analyze(EMPTY_FILE, '/test/empty.hsplus');

      expect(result.traits.size).toBe(0);
      expect(result.compositions.length).toBe(0);
      expect(result.roots.length).toBe(0);
      expect(result.diamondWarnings.length).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Inheritance
  // ---------------------------------------------------------------------------

  describe('inheritance resolution', () => {
    it('should parse extends relationship', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const clickable = result.traits.get('Clickable')!;
      expect(clickable.extends).toBe('Interactable');
      expect(clickable.ancestors).toEqual(['Interactable']);
    });

    it('should resolve multi-level inheritance', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const draggable = result.traits.get('DraggableButton')!;
      expect(draggable.extends).toBe('Clickable');
      expect(draggable.ancestors).toEqual(['Clickable', 'Interactable']);
    });

    it('should detect property overrides', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const clickable = result.traits.get('Clickable')!;
      const cursorProp = clickable.properties!.find((p) => p.key === 'cursor');

      expect(cursorProp).toBeDefined();
      expect(cursorProp!.isOverride).toBe(true);
      expect(cursorProp!.value).toBe('"pointer"');
      expect(cursorProp!.overriddenValue).toBe('"default"');
      expect(cursorProp!.overriddenFrom).toBe('Interactable');
    });

    it('should detect multi-level property overrides', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const draggable = result.traits.get('DraggableButton')!;
      const cursorProp = draggable.properties!.find((p) => p.key === 'cursor');

      expect(cursorProp).toBeDefined();
      expect(cursorProp!.isOverride).toBe(true);
      expect(cursorProp!.value).toBe('"grab"');
      // Should override from Clickable (the immediate parent's resolved value)
      expect(cursorProp!.overriddenValue).toBe('"pointer"');
    });

    it('should include inherited properties in resolved set', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const draggable = result.traits.get('DraggableButton')!;
      const allProps = draggable.properties!;

      // Should have: cursor (override), highlight (inherited from Clickable),
      // clickSound (inherited from Clickable), draggable (own)
      expect(allProps.length).toBe(4);

      const highlightProp = allProps.find((p) => p.key === 'highlight');
      expect(highlightProp).toBeDefined();
      expect(highlightProp!.origin).toBe('Clickable');
      expect(highlightProp!.isOverride).toBe(false);
    });

    it('should build root nodes from base traits', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      // Only Interactable is a root (no parent)
      const rootTraits = result.roots.filter((n) => n.kind === 'trait');
      expect(rootTraits.length).toBe(1);
      expect(rootTraits[0].label).toBe('Interactable');
    });

    it('should attach child traits as children of parent', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const root = result.roots.find((n) => n.label === 'Interactable')!;
      // Interactable should have Clickable as a child
      const clickableChild = root.children.find((n) => n.label === 'Clickable');
      expect(clickableChild).toBeDefined();

      // Clickable should have DraggableButton as a child
      const draggableChild = clickableChild!.children.find((n) => n.label === 'DraggableButton');
      expect(draggableChild).toBeDefined();
    });

    it('should handle orphaned extends (parent not in file)', () => {
      const result = analyzer.analyze(ORPHANED_EXTENDS, '/test/file.hsplus');

      // ChildOfExternal should appear as a root since its parent is not in file
      const rootTraits = result.roots.filter((n) => n.kind === 'trait');
      expect(rootTraits.length).toBe(1);
      expect(rootTraits[0].label).toBe('ChildOfExternal');
      expect(rootTraits[0].extends).toBe('ExternalTrait');
    });
  });

  // ---------------------------------------------------------------------------
  // Composition
  // ---------------------------------------------------------------------------

  describe('composition parsing', () => {
    it('should parse composition expressions', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');

      expect(result.compositions.length).toBe(1);
      const comp = result.compositions[0];
      expect(comp.kind).toBe('composition');
      expect(comp.label).toBe('@elite_npc');
    });

    it('should identify source traits in composition', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');
      const comp = result.compositions[0];

      // Should have a "Source Traits" category
      const sourcesCategory = comp.children.find((c) => c.label === 'Source Traits');
      expect(sourcesCategory).toBeDefined();
      expect(sourcesCategory!.children.length).toBe(3);

      const sourceLabels = sourcesCategory!.children.map((c) => c.label);
      expect(sourceLabels).toContain('Physics');
      expect(sourceLabels).toContain('AI');
      expect(sourceLabels).toContain('Patrol');
    });

    it('should build merged properties with right-side-wins', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');
      const comp = result.compositions[0];

      const mergedCategory = comp.children.find((c) => c.label === 'Merged Properties');
      expect(mergedCategory).toBeDefined();

      // Find the merged "mass" property - Patrol.mass (5.0) should win over Physics.mass (1.0)
      const massProp = mergedCategory!.children.find((c) => c.label === 'mass');
      expect(massProp).toBeDefined();
      expect(massProp!.description).toContain('5.0');
      expect(massProp!.description).toContain('Patrol');
    });

    it('should parse multiple compositions', () => {
      const result = analyzer.analyze(MULTIPLE_COMPOSITIONS, '/test/file.hsplus');

      expect(result.compositions.length).toBe(2);
      const labels = result.compositions.map((c) => c.label);
      expect(labels).toContain('@turret');
      expect(labels).toContain('@guard');
    });

    it('should mark unresolved source traits', () => {
      const source = `
@mystery = @Unknown + @AlsoUnknown
`;
      const result = analyzer.analyze(source, '/test/file.hsplus');

      expect(result.compositions.length).toBe(1);
      const comp = result.compositions[0];
      const sourcesCategory = comp.children.find((c) => c.label === 'Source Traits');
      expect(sourcesCategory).toBeDefined();

      for (const child of sourcesCategory!.children) {
        expect(child.contextValue).toBe('traitDefinition.unresolved');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Diamond Inheritance Detection
  // ---------------------------------------------------------------------------

  describe('diamond inheritance detection', () => {
    it('should detect diamond inheritance in compositions', () => {
      const result = analyzer.analyze(DIAMOND_INHERITANCE, '/test/file.hsplus');

      expect(result.diamondWarnings.length).toBeGreaterThan(0);

      const warning = result.diamondWarnings[0];
      expect(warning.sharedAncestor).toBe('Base');
      expect(warning.paths.length).toBe(2);
      expect(warning.severity).toBe('warning');
    });

    it('should include diamond warnings in composition nodes', () => {
      const result = analyzer.analyze(DIAMOND_INHERITANCE, '/test/file.hsplus');

      const comp = result.compositions[0];
      expect(comp.diamondWarnings).toBeDefined();
      expect(comp.diamondWarnings!.length).toBeGreaterThan(0);

      // Should have a warnings category
      const warningsCategory = comp.children.find(
        (c) => c.label === 'Diamond Inheritance Warnings',
      );
      expect(warningsCategory).toBeDefined();
      expect(warningsCategory!.children.length).toBeGreaterThan(0);
    });

    it('should show warning icon on compositions with diamonds', () => {
      const result = analyzer.analyze(DIAMOND_INHERITANCE, '/test/file.hsplus');
      const comp = result.compositions[0];

      expect(comp.iconId).toBe('warning');
    });

    it('should not warn when no diamond inheritance exists', () => {
      const result = analyzer.analyze(MULTIPLE_COMPOSITIONS, '/test/file.hsplus');

      expect(result.diamondWarnings.length).toBe(0);

      for (const comp of result.compositions) {
        expect(comp.diamondWarnings).toBeUndefined();
        expect(comp.iconId).toBe('extensions');
      }
    });

    it('should describe diamond paths in warning message', () => {
      const result = analyzer.analyze(DIAMOND_INHERITANCE, '/test/file.hsplus');
      const warning = result.diamondWarnings[0];

      expect(warning.message).toContain('Diamond inheritance');
      expect(warning.message).toContain('Base');
      expect(warning.message).toContain('ChildA');
      expect(warning.message).toContain('ChildB');
    });
  });

  // ---------------------------------------------------------------------------
  // Tree Structure
  // ---------------------------------------------------------------------------

  describe('tree structure', () => {
    it('should generate unique IDs for all nodes', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const allIds = new Set<string>();
      const collectIds = (nodes: TraitTreeNode[]) => {
        for (const node of nodes) {
          expect(allIds.has(node.id)).toBe(false);
          allIds.add(node.id);
          collectIds(node.children);
        }
      };

      collectIds(result.roots);
      expect(allIds.size).toBeGreaterThan(0);
    });

    it('should set correct contextValue for different node types', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const root = result.roots[0];
      expect(root.contextValue).toBe('traitDefinition');

      // Categories should have contextValue
      for (const child of root.children) {
        if (child.kind === 'category') {
          expect(child.contextValue).toMatch(/^traitCategory/);
        }
      }
    });

    it('should organize properties into categories', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      // Clickable has: clickSound (own), cursor + highlight (overrides from Interactable)
      // Since Clickable re-declares BOTH inherited props, there are no purely "inherited" ones
      const clickable = result.traits.get('Clickable')!;
      const categories = clickable.children.filter((c) => c.kind === 'category');
      const categoryLabels = categories.map((c) => c.label);
      expect(categoryLabels).toContain('Own Properties');
      expect(categoryLabels).toContain('Overrides');

      // DraggableButton has: draggable + cursor (own/override), highlight + clickSound (inherited)
      const draggable = result.traits.get('DraggableButton')!;
      const dragCategories = draggable.children.filter((c) => c.kind === 'category');
      const dragCategoryLabels = dragCategories.map((c) => c.label);
      expect(dragCategoryLabels).toContain('Own Properties');
      expect(dragCategoryLabels).toContain('Overrides');
      expect(dragCategoryLabels).toContain('Inherited');
    });

    it('should set description for extends relationships', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const clickable = result.traits.get('Clickable')!;
      expect(clickable.description).toBe('extends Interactable');
    });

    it('should set description for composition expressions', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');
      const comp = result.compositions[0];

      expect(comp.description).toContain('@Physics');
      expect(comp.description).toContain('@AI');
      expect(comp.description).toContain('@Patrol');
    });

    it('should have tooltips on trait nodes', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const clickable = result.traits.get('Clickable')!;
      expect(clickable.tooltip).toBeDefined();
      expect(clickable.tooltip).toContain('Clickable');
      expect(clickable.tooltip).toContain('Interactable');
    });

    it('should have tooltips on property nodes showing override info', () => {
      const result = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      const clickable = result.traits.get('Clickable')!;
      const overridesCategory = clickable.children.find((c) => c.label === 'Overrides');
      expect(overridesCategory).toBeDefined();

      const overrideNodes = overridesCategory!.children;
      expect(overrideNodes.length).toBeGreaterThan(0);

      for (const node of overrideNodes) {
        expect(node.tooltip).toBeDefined();
        expect(node.tooltip).toContain('Overrides');
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe('edge cases', () => {
    it('should handle traits with nested braces', () => {
      const result = analyzer.analyze(TRAIT_WITH_NESTED_BRACES, '/test/file.hsplus');

      expect(result.traits.size).toBe(1);
      const trait = result.traits.get('ComplexTrait')!;
      expect(trait).toBeDefined();
    });

    it('should handle file with only compositions (no trait defs)', () => {
      const source = `
@turret = @physics + @targeting
@guard = @physics + @ai_npc
`;
      const result = analyzer.analyze(source, '/test/file.hsplus');

      expect(result.traits.size).toBe(0);
      expect(result.compositions.length).toBe(2);
      expect(result.roots.length).toBe(2);
    });

    it('should handle file with only traits (no compositions)', () => {
      const result = analyzer.analyze(SIMPLE_TRAIT, '/test/file.hsplus');

      expect(result.compositions.length).toBe(0);
      expect(result.roots.length).toBe(1);
    });

    it('should include compositions in roots', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');

      const compositionRoots = result.roots.filter((n) => n.kind === 'composition');
      expect(compositionRoots.length).toBe(1);
    });

    it('should include trait roots and composition roots', () => {
      const result = analyzer.analyze(COMPOSITION_EXPRESSION, '/test/file.hsplus');

      const traitRoots = result.roots.filter((n) => n.kind === 'trait');
      const compRoots = result.roots.filter((n) => n.kind === 'composition');

      expect(traitRoots.length).toBe(3); // Physics, AI, Patrol (all base traits)
      expect(compRoots.length).toBe(1); // elite_npc composition
    });

    it('should produce stable analysis on re-analysis of same source', () => {
      const result1 = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');
      const result2 = analyzer.analyze(INHERITANCE_CHAIN, '/test/file.hsplus');

      expect(result1.traits.size).toBe(result2.traits.size);
      expect(result1.roots.length).toBe(result2.roots.length);
      expect(result1.diamondWarnings.length).toBe(result2.diamondWarnings.length);
    });
  });
});
