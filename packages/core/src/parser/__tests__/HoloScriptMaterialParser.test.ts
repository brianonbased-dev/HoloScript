import { describe, it, expect } from 'vitest';
import {
  HoloScriptMaterialParser,
  type ASTNode,
  type CompositionMaterialNode,
} from '../HoloScriptMaterialParser';
import type { MaterialDefinition } from '../MaterialTypes';

// ============================================================================
// Helper: build minimal ASTNode trees that mimic tree-sitter output
// ============================================================================

function makeNode(type: string, text?: string, children?: ASTNode[]): ASTNode {
  return { type, text, children: children ?? [], namedChildren: children ?? [] };
}

function makeMaterialBlock(
  materialType: string,
  name: string,
  props: Array<{ key: string; value: ASTNode }> = [],
  traits: string[] = [],
  extras: ASTNode[] = []
): ASTNode {
  const children: ASTNode[] = [
    makeNode(materialType, materialType), // type keyword child
    makeNode('string', `"${name}"`), // name child
  ];

  // Add trait_list if any
  if (traits.length > 0) {
    const traitChildren = traits.map((t) => makeNode('identifier', t));
    children.push(makeNode('trait_list', undefined, traitChildren));
  }

  // Add properties
  for (const p of props) {
    const propNode: ASTNode = {
      type: 'property',
      children: [makeNode('identifier', p.key), makeNode(':', ':'), p.value],
      namedChildren: [makeNode('identifier', p.key), p.value],
    };
    children.push(propNode);
  }

  // Add extras (texture_map, shader_pass, etc.)
  children.push(...extras);

  return makeNode('material_block', undefined, children);
}

// ============================================================================
// Tests
// ============================================================================

describe('HoloScriptMaterialParser', () => {
  // --------------------------------------------------------------------------
  // parse() — single AST node
  // --------------------------------------------------------------------------
  describe('parse()', () => {
    it('extracts material type from child keyword node', () => {
      const node = makeMaterialBlock('pbr_material', 'Gold');
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.type).toBe('pbr_material');
    });

    it('extracts material name (unquoted)', () => {
      const node = makeMaterialBlock('material', 'Brick Wall');
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.name).toBe('Brick Wall');
    });

    it('extracts trait decorators', () => {
      const node = makeMaterialBlock('pbr_material', 'Skin', [], ['sss', 'transparent']);
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.traits).toContain('sss');
      expect(result.traits).toContain('transparent');
    });

    it('extracts numeric properties (roughness, metallic)', () => {
      const node = makeMaterialBlock('pbr_material', 'Metal', [
        { key: 'roughness', value: makeNode('number', '0.3') },
        { key: 'metallic', value: makeNode('number', '0.95') },
      ]);
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.properties['roughness']).toBeCloseTo(0.3);
      expect(result.properties['metallic']).toBeCloseTo(0.95);
    });

    it('extracts string properties (baseColor as hex)', () => {
      const node = makeMaterialBlock('material', 'Floor', [
        { key: 'baseColor', value: makeNode('color', '#8B4513') },
      ]);
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.properties['baseColor']).toBe('#8B4513');
    });

    it('returns default name "Unnamed" when no name node exists', () => {
      const node = makeNode('material_block', undefined, [makeNode('material', 'material')]);
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.name).toBe('Unnamed');
    });

    it('returns default type "material" when no type keyword found', () => {
      const node = makeNode('material_block', undefined, []);
      const result = HoloScriptMaterialParser.parse(node);
      expect(result.type).toBe('material');
    });
  });

  // --------------------------------------------------------------------------
  // parseAll() — recursive material block finding
  // --------------------------------------------------------------------------
  describe('parseAll()', () => {
    it('finds nested material_block nodes', () => {
      const mat1 = makeMaterialBlock('material', 'Mat1');
      const mat2 = makeMaterialBlock('glass_material', 'Mat2');
      const root = makeNode('program', undefined, [makeNode('zone', undefined, [mat1]), mat2]);

      const results = HoloScriptMaterialParser.parseAll(root);
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('Mat1');
      expect(results[1].name).toBe('Mat2');
    });

    it('returns empty array when no material blocks exist', () => {
      const root = makeNode('program', undefined, [makeNode('zone', undefined, [])]);
      const results = HoloScriptMaterialParser.parseAll(root);
      expect(results).toHaveLength(0);
    });
  });

  // --------------------------------------------------------------------------
  // parseJSON() — plain JSON objects
  // --------------------------------------------------------------------------
  describe('parseJSON()', () => {
    it('parses a basic JSON material object', () => {
      const json = {
        type: 'pbr_material',
        name: 'Chrome',
        traits: ['pbr'],
        roughness: 0.1,
        metallic: 1.0,
      };
      const result = HoloScriptMaterialParser.parseJSON(json);
      expect(result.type).toBe('pbr_material');
      expect(result.name).toBe('Chrome');
      expect(result.traits).toEqual(['pbr']);
      expect(result.roughness).toBeCloseTo(0.1);
      expect(result.metallic).toBeCloseTo(1.0);
    });

    it('extracts inline texture maps from JSON', () => {
      const json = {
        type: 'material',
        name: 'Textured',
        albedo_map: 'textures/brick_albedo.png',
        normal_map: 'textures/brick_normal.png',
      };
      const result = HoloScriptMaterialParser.parseJSON(json);
      expect(result.textureMaps).toHaveLength(2);
      expect(result.textureMaps[0].channel).toBe('albedo_map');
      expect(result.textureMaps[0].source).toBe('textures/brick_albedo.png');
      expect(result.textureMaps[1].channel).toBe('normal_map');
    });

    it('extracts block-form texture maps with tiling/filtering', () => {
      const json = {
        type: 'material',
        name: 'Detailed',
        roughness_map: {
          source: 'tex/rough.png',
          tiling: [2, 2],
          filtering: 'trilinear',
          strength: 0.8,
        },
      };
      const result = HoloScriptMaterialParser.parseJSON(json);
      expect(result.textureMaps).toHaveLength(1);
      const map = result.textureMaps[0];
      expect(map.channel).toBe('roughness_map');
      expect(map.source).toBe('tex/rough.png');
      expect(map.tiling).toEqual([2, 2]);
      expect(map.filtering).toBe('trilinear');
      expect(map.strength).toBeCloseTo(0.8);
    });

    it('defaults type to "material" and name to "Unnamed" when missing', () => {
      const result = HoloScriptMaterialParser.parseJSON({});
      expect(result.type).toBe('material');
      expect(result.name).toBe('Unnamed');
      expect(result.traits).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // parseFromComposition() — Composition IR nodes
  // --------------------------------------------------------------------------
  describe('parseFromComposition()', () => {
    it('parses composition IR nodes with traits', () => {
      const nodes: CompositionMaterialNode[] = [
        {
          type: 'toon_material',
          name: 'Cel',
          traits: [{ name: 'cel_shaded' }],
          properties: { outlineWidth: 2, shadeSteps: 3 },
        },
      ];

      const results = HoloScriptMaterialParser.parseFromComposition(nodes);
      expect(results).toHaveLength(1);
      expect(results[0].type).toBe('toon_material');
      expect(results[0].name).toBe('Cel');
      expect(results[0].traits).toEqual(['cel_shaded']);
      expect(results[0].outlineWidth).toBe(2);
      expect(results[0].shadeSteps).toBe(3);
    });

    it('filters out non-material node types', () => {
      const nodes: CompositionMaterialNode[] = [
        { type: 'pbr_material', name: 'Valid', properties: {} },
        { type: 'unknown_block', name: 'Invalid', properties: {} },
      ];
      const results = HoloScriptMaterialParser.parseFromComposition(nodes);
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Valid');
    });

    it('handles texture maps from composition nodes', () => {
      const nodes: CompositionMaterialNode[] = [
        {
          type: 'material',
          name: 'Textured',
          textureMaps: [{ channel: 'albedo_map', source: 'brick.png' }],
        },
      ];
      const results = HoloScriptMaterialParser.parseFromComposition(nodes);
      expect(results[0].textureMaps).toHaveLength(1);
      expect(results[0].textureMaps[0].source).toBe('brick.png');
    });
  });

  // --------------------------------------------------------------------------
  // Texture map and shader extraction from AST
  // --------------------------------------------------------------------------
  describe('texture map extraction from AST', () => {
    it('extracts inline texture_map children', () => {
      const textureNode: ASTNode = {
        type: 'texture_map',
        children: [
          makeNode('identifier', 'albedo_map'),
          makeNode(':', ':'),
          makeNode('string', '"diffuse.png"'),
        ],
        namedChildren: [makeNode('identifier', 'albedo_map'), makeNode('string', '"diffuse.png"')],
      };

      const matNode = makeMaterialBlock('material', 'Textured', [], [], [textureNode]);
      const result = HoloScriptMaterialParser.parse(matNode);
      expect(result.textureMaps).toHaveLength(1);
      expect(result.textureMaps[0].channel).toBe('albedo_map');
      expect(result.textureMaps[0].source).toBe('diffuse.png');
    });
  });

  describe('shader pass extraction from AST', () => {
    it('extracts shader_pass children', () => {
      const shaderPassNode: ASTNode = {
        type: 'shader_pass',
        children: [],
        namedChildren: [],
        childForFieldName(name: string) {
          if (name === 'name') return makeNode('string', '"main"');
          return null;
        },
      };

      const matNode = makeMaterialBlock('shader', 'CustomShader', [], [], [shaderPassNode]);
      const result = HoloScriptMaterialParser.parse(matNode);
      expect(result.shaderPasses).toHaveLength(1);
      expect(result.shaderPasses[0].name).toBe('main');
    });
  });
});
