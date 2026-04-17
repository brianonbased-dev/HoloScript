/**
 * HoloASTMapping Tests
 *
 * Validates mapping of HoloScript AST types to semantic graph nodes and edges.
 * Ensures SourceLocation preservation and edge context accuracy.
 */

import { describe, it, expect } from 'vitest';
import { HoloASTMapper, serializeNodeId, extractSourceLocation } from '../HoloASTMapping';
import type {
  HoloComposition,
  HoloTemplate,
  HoloObjectDecl,
  HoloTraitDefinition,
  SourceLocation,
} from '../../parser/HoloCompositionTypes';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createSourceLocation(line: number, column: number, endLine?: number, endColumn?: number): SourceLocation {
  return {
    start: { line, column },
    end: endLine ? { line: endLine, column: endColumn ?? 0 } : undefined,
  };
}

function createTemplate(name: string, line: number = 10): HoloTemplate {
  return {
    name,
    loc: createSourceLocation(line, 0, line + 2, 1),
    properties: [
      {
        key: 'color',
        value: '#FF0000',
        loc: createSourceLocation(line + 1, 2),
      },
    ],
    traits: [
      {
        name: 'collidable',
        config: {},
      },
    ],
  };
}

function createTraitDefinition(name: string, base?: string): HoloTraitDefinition {
  return {
    name,
    base,
    properties: [
      {
        key: 'enabled',
        value: true,
        loc: createSourceLocation(20, 2),
      },
    ],
    loc: createSourceLocation(19, 0, 21, 1),
  };
}

function createObject(
  name: string,
  line: number = 30,
  template?: string,
  traits?: Array<{ name: string; config: unknown }>,
  children?: HoloObjectDecl[]
): HoloObjectDecl {
  return {
    name,
    template,
    traits: traits ?? [],
    properties: [
      {
        key: 'position',
        value: [0, 1, 0],
        loc: createSourceLocation(line + 1, 2),
      },
    ],
    children: children ?? [],
    loc: createSourceLocation(line, 0, line + 3, 1),
  };
}

function createComposition(
  name: string,
  templates?: HoloTemplate[],
  objects?: HoloObjectDecl[],
  traitDefinitions?: HoloTraitDefinition[]
): HoloComposition {
  return {
    name,
    templates: templates ?? [],
    objects: objects ?? [],
    traitDefinitions: traitDefinitions ?? [],
    spatialGroups: [],
  };
}

// =============================================================================
// TEST SUITES
// =============================================================================

describe('HoloASTMapper', () => {
  const filePath = 'scenes/demo.holo';

  describe('Template Mapping', () => {
    it('should map a simple template to a node with properties', () => {
      const template = createTemplate('Button', 10);
      const comp = createComposition('demo', [template]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes, edges } = mapper.mapComposition(comp);

      // Should have: composition + template + 1 property + 1 trait reference
      expect(nodes.size).toBe(3); // composition, template, property
      expect(edges.length).toBeGreaterThanOrEqual(1); // trait-applied edge

      // Check template node exists with correct location
      const templateNodeId = serializeNodeId({
        kind: 'template',
        filePath,
        name: 'Button',
        line: 10,
      });
      const templateNode = nodes.get(templateNodeId);
      expect(templateNode).toBeDefined();
      expect(templateNode?.name).toBe('Button');
      expect(templateNode?.type).toBe('template');
      expect(templateNode?.line).toBe(10);
      expect(templateNode?.endLine).toBe(12);
    });

    it('should create property nodes for template properties', () => {
      const template = createTemplate('Card', 5);
      const comp = createComposition('demo', [template]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes } = mapper.mapComposition(comp);

      // Find property node
      const propertyNodes = Array.from(nodes.values()).filter((n) => n.type === 'property');
      expect(propertyNodes.length).toBeGreaterThan(0);

      const colorProp = propertyNodes.find((n) => n.name === 'color');
      expect(colorProp).toBeDefined();
      expect(colorProp?.parent).toContain('template:');
      expect(colorProp?.parent).toContain(':Card:');
    });

    it('should create trait-applied edges for template traits', () => {
      const template = createTemplate('Interactive', 15);
      const comp = createComposition('demo', [template]);
      const mapper = new HoloASTMapper(filePath);

      const { edges } = mapper.mapComposition(comp);

      const traitEdges = edges.filter((e) => e.context === 'trait-applied' && e.traitName === 'collidable');
      expect(traitEdges.length).toBeGreaterThan(0);
      expect(traitEdges[0].from).toContain('template:');
      expect(traitEdges[0].traitName).toBe('collidable');
    });
  });

  describe('Trait Definition Mapping', () => {
    it('should map a trait definition with inheritance', () => {
      const parent = createTraitDefinition('BaseInteractive');
      const child = createTraitDefinition('AdvancedInteractive', 'BaseInteractive');

      const comp = createComposition('demo', [], [], [parent, child]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes, edges } = mapper.mapComposition(comp);

      // Should have: composition + parent trait + child trait + 2 properties
      expect(nodes.size).toBeGreaterThanOrEqual(3);

      // Check trait-inherits edge
      const inheritEdges = edges.filter((e) => e.context === 'trait-inherits');
      expect(inheritEdges.length).toBeGreaterThan(0);
      expect(inheritEdges[0].traitName).toBe('BaseInteractive');
    });

    it('should create property nodes for trait properties', () => {
      const traitDef = createTraitDefinition('Animated');
      const comp = createComposition('demo', [], [], [traitDef]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes } = mapper.mapComposition(comp);

      const propertyNodes = Array.from(nodes.values()).filter((n) => n.type === 'property');
      const enabledProp = propertyNodes.find((n) => n.name === 'enabled');
      expect(enabledProp).toBeDefined();
      expect(enabledProp?.parent).toContain('trait:');
      expect(enabledProp?.parent).toContain(':Animated:');
    });
  });

  describe('Object Mapping', () => {
    it('should map a simple object with template and traits', () => {
      const object = createObject('MainButton', 30, 'Button', [{ name: 'clickable', config: {} }]);
      const template = createTemplate('Button');
      const comp = createComposition('demo', [template], [object]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes, edges } = mapper.mapComposition(comp);

      // Should have: composition + template + object + properties
      expect(nodes.size).toBeGreaterThanOrEqual(4);

      // Check object node
      const objectNodeId = serializeNodeId({
        kind: 'object',
        filePath,
        name: 'MainButton',
        line: 30,
      });
      const objectNode = nodes.get(objectNodeId);
      expect(objectNode).toBeDefined();
      expect(objectNode?.type).toBe('object');

      // Check template-usage edge
      const templateEdges = edges.filter((e) => e.context === 'template-usage' && e.templateName === 'Button');
      expect(templateEdges.length).toBeGreaterThan(0);

      // Check trait-applied edge
      const traitEdges = edges.filter((e) => e.context === 'trait-applied' && e.traitName === 'clickable');
      expect(traitEdges.length).toBeGreaterThan(0);
    });

    it('should create object property nodes', () => {
      const object = createObject('Player');
      const comp = createComposition('demo', [], [object]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes } = mapper.mapComposition(comp);

      const propertyNodes = Array.from(nodes.values()).filter((n) => n.type === 'property');
      const positionProp = propertyNodes.find((n) => n.name === 'position');
      expect(positionProp).toBeDefined();
      expect(positionProp?.parent).toContain('object:');
      expect(positionProp?.parent).toContain(':Player:');
    });
  });

  describe('Nested Objects and Containment', () => {
    it('should map nested objects with parent-child containment edges', () => {
      const child1 = createObject('Window', 35);
      const child2 = createObject('Button', 40);
      const parent = createObject('Panel', 30, undefined, [], [child1, child2]);
      const comp = createComposition('demo', [], [parent]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes, edges } = mapper.mapComposition(comp);

      // Should have: composition + parent + child1 + child2 + properties
      expect(nodes.size).toBeGreaterThanOrEqual(4);

      // Check containment edges
      const containEdges = edges.filter((e) => e.context === 'contains');
      expect(containEdges.length).toBe(2); // parent → child1, parent → child2
    });

    it('should preserve hierarchical relationships with parent tracking', () => {
      const grandchild = createObject('Label', 42);
      const child = createObject('Title', 40, undefined, [], [grandchild]);
      const parent = createObject('Container', 30, undefined, [], [child]);
      const comp = createComposition('demo', [], [parent]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes } = mapper.mapComposition(comp);

      // Find child node and verify parent link
      const childNodeId = serializeNodeId({
        kind: 'object',
        filePath,
        name: 'Title',
        line: 40,
      });
      const childNode = nodes.get(childNodeId);
      expect(childNode?.parent).toContain('object:');
      expect(childNode?.parent).toContain(':Container:');

      // Find grandchild and verify its parent
      const grandchildNodeId = serializeNodeId({
        kind: 'object',
        filePath,
        name: 'Label',
        line: 42,
      });
      const grandchildNode = nodes.get(grandchildNodeId);
      expect(grandchildNode?.parent).toContain(':Title:');
    });
  });

  describe('SourceLocation Preservation', () => {
    it('should extract and preserve line/column information', () => {
      const loc = createSourceLocation(42, 8, 45, 2);
      const { line, column, endLine, endColumn } = extractSourceLocation(loc);

      expect(line).toBe(42);
      expect(column).toBe(8);
      expect(endLine).toBe(45);
      expect(endColumn).toBe(2);
    });

    it('should handle missing end location gracefully', () => {
      const loc: SourceLocation = {
        start: { line: 10, column: 2 },
      };
      const { line, column, endLine, endColumn } = extractSourceLocation(loc);

      expect(line).toBe(10);
      expect(column).toBe(2);
      expect(endLine).toBeUndefined();
      expect(endColumn).toBeUndefined();
    });

    it('should handle undefined location', () => {
      const { line, column } = extractSourceLocation(undefined);

      expect(line).toBe(0);
      expect(column).toBe(0);
    });

    it('should preserve exact SourceLocation in node definitions', () => {
      const template = createTemplate('Precise', 123);
      const comp = createComposition('demo', [template]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes } = mapper.mapComposition(comp);

      const templateNodeId = serializeNodeId({
        kind: 'template',
        filePath,
        name: 'Precise',
        line: 123,
      });
      const node = nodes.get(templateNodeId);

      expect(node?.line).toBe(123);
      expect(node?.column).toBe(0);
      expect(node?.endLine).toBe(125);
      expect(node?.endColumn).toBe(1);
    });
  });

  describe('Node Serialization', () => {
    it('should create unique, deterministic node IDs', () => {
      const nodeId1 = {
        kind: 'object' as const,
        filePath: 'demo.holo',
        name: 'Cube',
        line: 10,
        column: 4,
      };

      const id1 = serializeNodeId(nodeId1);
      const id2 = serializeNodeId(nodeId1);

      expect(id1).toBe(id2);
      expect(id1).toBe('object:demo.holo:Cube:10:4');
    });

    it('should differentiate nodes by kind, file, name, and line', () => {
      const ids = [
        serializeNodeId({ kind: 'object', filePath: 'a.holo', name: 'Cube', line: 10 }),
        serializeNodeId({ kind: 'template', filePath: 'a.holo', name: 'Cube', line: 10 }),
        serializeNodeId({ kind: 'object', filePath: 'b.holo', name: 'Cube', line: 10 }),
        serializeNodeId({ kind: 'object', filePath: 'a.holo', name: 'Sphere', line: 10 }),
        serializeNodeId({ kind: 'object', filePath: 'a.holo', name: 'Cube', line: 20 }),
      ];

      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });

    it('should handle column=0 in serialization', () => {
      const id = serializeNodeId({ kind: 'trait', filePath: 'test.holo', name: 'X', line: 1, column: 0 });
      expect(id).toBe('trait:test.holo:X:1:0');
    });
  });

  describe('Complex Compositions', () => {
    it('should map a full composition with templates, traits, and nested objects', () => {
      // Define traits
      const baseTrait = createTraitDefinition('Interactive');
      const advTrait = createTraitDefinition('AdvancedInteractive', 'Interactive');

      // Define template
      const template = createTemplate('Button', 10);

      // Define nested objects
      const label = createObject('Label', 40);
      const button = createObject('ClickButton', 35, 'Button', [{ name: 'interactive', config: {} }], [label]);
      const panel = createObject('ControlPanel', 30, undefined, [], [button]);

      const comp = createComposition('UIScene', [template], [panel], [baseTrait, advTrait]);
      const mapper = new HoloASTMapper(filePath);

      const { nodes, edges } = mapper.mapComposition(comp);

      // Verify node count (composition + 3 traits/templates + 3 objects + properties)
      expect(nodes.size).toBeGreaterThanOrEqual(10);

      // Verify trait inheritance
      const inheritEdges = edges.filter((e) => e.context === 'trait-inherits');
      expect(inheritEdges.length).toBe(1);

      // Verify containment hierarchy
      const containEdges = edges.filter((e) => e.context === 'contains');
      expect(containEdges.length).toBe(2); // panel→button, button→label
    });
  });
});
