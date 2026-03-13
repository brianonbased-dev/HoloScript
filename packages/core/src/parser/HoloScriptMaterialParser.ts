/**
 * HoloScriptMaterialParser
 *
 * Bridges the HoloScript tree-sitter material_block grammar AST to the
 * MaterialDefinition type consumed by rendering engines.
 *
 * Grammar coverage (from tree-sitter-holoscript/grammar.js):
 *   - material_block: material | pbr_material | unlit_material | shader |
 *                     toon_material | glass_material | subsurface_material
 *   - texture_map: inline form (channel: "source")
 *   - texture_map_block: structured form (channel { source: ... tiling: ... })
 *   - shader_pass: pass "name" { vertex: ... fragment: ... }
 *   - shader_connection: output -> input.property
 *   - trait_list / trait_inline: @pbr, @transparent, @cel_shaded, @sss, etc.
 *
 * This parser accepts either:
 *   1. Raw tree-sitter AST nodes (SyntaxNode)
 *   2. HoloComposition IR nodes (from the HoloScript compiler pipeline)
 *   3. Plain JSON objects (from serialized ASTs or API responses)
 *
 * @module HoloScriptMaterialParser
 */

import type {
  MaterialDefinition,
  HoloMaterialType,
  TextureMapDef,
  TextureChannel,
  ShaderPassDef,
} from './MaterialTypes';

// =============================================================================
// TEXTURE CHANNEL SET — for fast membership testing
// =============================================================================

const TEXTURE_CHANNELS = new Set<string>([
  'albedo_map', 'normal_map', 'roughness_map', 'metallic_map',
  'emission_map', 'ao_map', 'height_map', 'opacity_map',
  'displacement_map', 'specular_map', 'clearcoat_map',
  'baseColor_map', 'emissive_map', 'transmission_map',
  'sheen_map', 'anisotropy_map', 'thickness_map',
  'subsurface_map', 'iridescence_map',
]);

const MATERIAL_BLOCK_TYPES = new Set<string>([
  'material', 'pbr_material', 'unlit_material', 'shader',
  'toon_material', 'glass_material', 'subsurface_material',
]);

// =============================================================================
// AST NODE INTERFACES (minimal, for duck-typing compatibility)
// =============================================================================

/**
 * Minimal interface for a tree-sitter SyntaxNode.
 * This allows us to work with any tree-sitter binding without
 * importing the full tree-sitter dependency.
 */
export interface ASTNode {
  type: string;
  text?: string;
  children?: ASTNode[];
  namedChildren?: ASTNode[];
  childForFieldName?(name: string): ASTNode | null;
  [key: string]: unknown;
}

/**
 * A HoloComposition IR node (from the compiler pipeline).
 * These have a different structure from raw tree-sitter nodes.
 */
export interface CompositionMaterialNode {
  type: string;
  name: string;
  traits?: Array<{ name: string; arguments?: unknown[] }>;
  properties?: Record<string, unknown>;
  textureMaps?: Array<{
    channel: string;
    source?: string;
    properties?: Record<string, unknown>;
  }>;
  shaderPasses?: Array<{
    name?: string;
    properties?: Record<string, unknown>;
  }>;
  shaderConnections?: Array<{
    output: string;
    input: string;
  }>;
  children?: CompositionMaterialNode[];
}

// =============================================================================
// PARSER
// =============================================================================

export class HoloScriptMaterialParser {
  /**
   * Parse multiple material_block nodes from a tree-sitter AST.
   * Recursively finds all material_block nodes in the tree.
   */
  static parseAll(rootNode: ASTNode): MaterialDefinition[] {
    const results: MaterialDefinition[] = [];
    HoloScriptMaterialParser.findMaterialBlocks(rootNode, results);
    return results;
  }

  /**
   * Parse multiple materials from HoloComposition IR nodes.
   */
  static parseFromComposition(nodes: CompositionMaterialNode[]): MaterialDefinition[] {
    return nodes
      .filter(n => MATERIAL_BLOCK_TYPES.has(n.type))
      .map(n => HoloScriptMaterialParser.parseCompositionNode(n));
  }

  /**
   * Parse a single material_block AST node into a MaterialDefinition.
   */
  static parse(node: ASTNode): MaterialDefinition {
    const type = HoloScriptMaterialParser.extractBlockType(node);
    const name = HoloScriptMaterialParser.extractName(node);
    const traits = HoloScriptMaterialParser.extractTraits(node);
    const properties = HoloScriptMaterialParser.extractProperties(node);
    const textureMaps = HoloScriptMaterialParser.extractTextureMaps(node);
    const shaderPasses = HoloScriptMaterialParser.extractShaderPasses(node);
    const shaderConnections = HoloScriptMaterialParser.extractShaderConnections(node);

    return HoloScriptMaterialParser.buildDefinition(
      type, name, traits, properties, textureMaps, shaderPasses, shaderConnections
    );
  }

  /**
   * Parse a plain JSON material object (for API/serialized data).
   */
  static parseJSON(json: Record<string, unknown>): MaterialDefinition {
    const type = (json.type as HoloMaterialType) || 'material';
    const name = (json.name as string) || 'Unnamed';
    const traits = (json.traits as string[]) || [];

    const textureMaps: TextureMapDef[] = [];
    const shaderPasses: ShaderPassDef[] = [];
    const shaderConnections: Array<{ output: string; input: string }> = [];

    // Extract texture maps from properties
    const properties: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json)) {
      if (key === 'type' || key === 'name' || key === 'traits') continue;

      if (TEXTURE_CHANNELS.has(key)) {
        if (typeof value === 'string') {
          textureMaps.push({ channel: key as TextureChannel, source: value });
        } else if (typeof value === 'object' && value !== null) {
          const block = value as Record<string, unknown>;
          textureMaps.push({
            channel: key as TextureChannel,
            source: (block.source as string) || '',
            tiling: block.tiling as [number, number] | undefined,
            filtering: block.filtering as TextureMapDef['filtering'],
            strength: block.strength as number | undefined,
            intensity: block.intensity as number | undefined,
            scale: block.scale as number | undefined,
          });
        }
      } else {
        properties[key] = value;
      }
    }

    return HoloScriptMaterialParser.buildDefinition(
      type, name, traits, properties, textureMaps, shaderPasses, shaderConnections
    );
  }

  // ===========================================================================
  // INTERNAL — AST traversal helpers
  // ===========================================================================

  /**
   * Recursively find material_block nodes in the AST
   */
  private static findMaterialBlocks(node: ASTNode, results: MaterialDefinition[]): void {
    if (node.type === 'material_block') {
      try {
        results.push(HoloScriptMaterialParser.parse(node));
      } catch {
        // Skip malformed material blocks
      }
      return;
    }

    // Recurse into children
    const children = node.namedChildren || node.children || [];
    for (const child of children) {
      HoloScriptMaterialParser.findMaterialBlocks(child, results);
    }
  }

  /**
   * Extract the material block type from the first child token.
   */
  private static extractBlockType(node: ASTNode): HoloMaterialType {
    // Walk children to find the type keyword
    const children = node.children || node.namedChildren || [];
    for (const child of children) {
      if (MATERIAL_BLOCK_TYPES.has(child.type) || MATERIAL_BLOCK_TYPES.has(child.text || '')) {
        return (child.text || child.type) as HoloMaterialType;
      }
    }

    // Fallback: check node type or first text
    if (MATERIAL_BLOCK_TYPES.has(node.type)) {
      return node.type as HoloMaterialType;
    }

    return 'material';
  }

  /**
   * Extract the material name from field('name', ...).
   */
  private static extractName(node: ASTNode): string {
    // Try field access
    if (node.childForFieldName) {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        return HoloScriptMaterialParser.unquote(nameNode.text || '');
      }
    }

    // Walk children for string nodes
    const children = node.namedChildren || node.children || [];
    for (const child of children) {
      if (child.type === 'string' && child.text) {
        return HoloScriptMaterialParser.unquote(child.text);
      }
    }

    return 'Unnamed';
  }

  /**
   * Extract trait decorators (@pbr, @transparent, etc.)
   */
  private static extractTraits(node: ASTNode): string[] {
    const traits: string[] = [];
    const children = node.namedChildren || node.children || [];

    for (const child of children) {
      if (child.type === 'trait_list' || child.type === 'trait_inline') {
        const traitChildren = child.namedChildren || child.children || [];
        for (const tc of traitChildren) {
          if (tc.type === 'trait_inline') {
            const nameNode = tc.childForFieldName?.('name') || tc.namedChildren?.[0];
            if (nameNode?.text) {
              traits.push(nameNode.text);
            }
          } else if (tc.type === 'identifier' && tc.text) {
            traits.push(tc.text);
          }
        }
        if (child.type === 'trait_inline') {
          const nameNode = child.childForFieldName?.('name') || child.namedChildren?.[0];
          if (nameNode?.text) {
            traits.push(nameNode.text);
          }
        }
      }
    }

    return traits;
  }

  /**
   * Extract properties (key: value pairs)
   */
  private static extractProperties(node: ASTNode): Record<string, unknown> {
    const props: Record<string, unknown> = {};
    const children = node.namedChildren || node.children || [];

    for (const child of children) {
      if (child.type === 'property') {
        const key = child.childForFieldName?.('key')?.text
          || child.namedChildren?.[0]?.text
          || child.children?.[0]?.text;
        const valueNode = child.childForFieldName?.('value')
          || child.namedChildren?.[1]
          || child.children?.[2]; // skip ':'

        if (key && valueNode) {
          props[key] = HoloScriptMaterialParser.extractValue(valueNode);
        }
      }
    }

    return props;
  }

  /**
   * Extract texture_map and texture_map_block children
   */
  private static extractTextureMaps(node: ASTNode): TextureMapDef[] {
    const maps: TextureMapDef[] = [];
    const children = node.namedChildren || node.children || [];

    for (const child of children) {
      if (child.type === 'texture_map') {
        // Inline form: channel: "source"
        const channelNode = child.childForFieldName?.('channel')
          || child.namedChildren?.[0]
          || child.children?.[0];
        const sourceNode = child.childForFieldName?.('source')
          || child.namedChildren?.[1]
          || child.children?.[2]; // skip ':'

        if (channelNode && sourceNode) {
          const channel = (channelNode.text || '') as TextureChannel;
          const source = HoloScriptMaterialParser.unquote(sourceNode.text || '');
          maps.push({ channel, source });
        }
      } else if (child.type === 'texture_map_block') {
        // Block form: channel { source: ... tiling: ... }
        const channelNode = child.childForFieldName?.('channel')
          || child.namedChildren?.[0]
          || child.children?.[0];
        const channel = (channelNode?.text || '') as TextureChannel;

        const blockProps = HoloScriptMaterialParser.extractProperties(child);
        maps.push({
          channel,
          source: blockProps.source as string || '',
          tiling: blockProps.tiling as [number, number] | undefined,
          filtering: blockProps.filtering as TextureMapDef['filtering'],
          strength: blockProps.strength as number | undefined,
          format: blockProps.format as string | undefined,
          intensity: blockProps.intensity as number | undefined,
          scale: blockProps.scale as number | undefined,
          channelSelect: blockProps.channel as TextureMapDef['channelSelect'],
        });
      }
    }

    return maps;
  }

  /**
   * Extract shader_pass children
   */
  private static extractShaderPasses(node: ASTNode): ShaderPassDef[] {
    const passes: ShaderPassDef[] = [];
    const children = node.namedChildren || node.children || [];

    for (const child of children) {
      if (child.type === 'shader_pass') {
        const nameNode = child.childForFieldName?.('name');
        const props = HoloScriptMaterialParser.extractProperties(child);

        passes.push({
          name: nameNode ? HoloScriptMaterialParser.unquote(nameNode.text || '') : undefined,
          vertex: props.vertex as string | undefined,
          fragment: props.fragment as string | undefined,
          blend: props.blend as string | undefined,
          properties: props,
        });
      }
    }

    return passes;
  }

  /**
   * Extract shader_connection children (output -> input.property)
   */
  private static extractShaderConnections(node: ASTNode): Array<{ output: string; input: string }> {
    const connections: Array<{ output: string; input: string }> = [];
    const children = node.namedChildren || node.children || [];

    for (const child of children) {
      if (child.type === 'shader_connection') {
        const outputNode = child.childForFieldName?.('output')
          || child.namedChildren?.[0];
        const inputNode = child.childForFieldName?.('input')
          || child.namedChildren?.[1];

        if (outputNode?.text && inputNode?.text) {
          connections.push({
            output: outputNode.text,
            input: inputNode.text,
          });
        }
      }
    }

    return connections;
  }

  // ===========================================================================
  // INTERNAL — Composition IR parser
  // ===========================================================================

  private static parseCompositionNode(node: CompositionMaterialNode): MaterialDefinition {
    const type = node.type as HoloMaterialType;
    const name = node.name;
    const traits = (node.traits || []).map(t => t.name);
    const properties = node.properties || {};

    const textureMaps: TextureMapDef[] = (node.textureMaps || []).map(tm => ({
      channel: tm.channel as TextureChannel,
      source: tm.source || '',
      ...((tm.properties || {}) as Partial<TextureMapDef>),
    }));

    const shaderPasses: ShaderPassDef[] = (node.shaderPasses || []).map(sp => ({
      name: sp.name,
      properties: sp.properties || {},
    }));

    const shaderConnections = node.shaderConnections || [];

    return HoloScriptMaterialParser.buildDefinition(
      type, name, traits, properties, textureMaps, shaderPasses, shaderConnections
    );
  }

  // ===========================================================================
  // INTERNAL — Build MaterialDefinition from extracted data
  // ===========================================================================

  private static buildDefinition(
    type: HoloMaterialType,
    name: string,
    traits: string[],
    properties: Record<string, unknown>,
    textureMaps: TextureMapDef[],
    shaderPasses: ShaderPassDef[],
    shaderConnections: Array<{ output: string; input: string }>,
  ): MaterialDefinition {
    return {
      type,
      name,
      traits,

      // PBR Core
      baseColor: properties.baseColor as string | number[] | undefined,
      roughness: properties.roughness as number | undefined,
      metallic: properties.metallic as number | undefined,
      emissive: properties.emissive as string | undefined,
      emissiveIntensity: (properties.emissiveIntensity ?? properties.emissive_intensity) as number | undefined,
      opacity: properties.opacity as number | undefined,
      IOR: (properties.IOR ?? properties.ior) as number | undefined,
      transmission: properties.transmission as number | undefined,
      thickness: properties.thickness as number | undefined,
      doubleSided: (properties.double_sided ?? properties.doubleSided) as boolean | undefined,

      // Subsurface
      subsurfaceColor: (properties.subsurface_color ?? properties.subsurfaceColor) as string | undefined,
      subsurfaceRadius: (properties.subsurface_radius ?? properties.subsurfaceRadius) as number[] | undefined,

      // Toon
      outlineWidth: (properties.outline_width ?? properties.outlineWidth) as number | undefined,
      outlineColor: (properties.outline_color ?? properties.outlineColor) as string | undefined,
      shadeSteps: (properties.shade_steps ?? properties.shadeSteps) as number | undefined,
      specularSize: (properties.specular_size ?? properties.specularSize) as number | undefined,
      rimLight: (properties.rim_light ?? properties.rimLight) as number | undefined,
      rimColor: (properties.rim_color ?? properties.rimColor) as string | undefined,

      // Glass
      attenuationColor: (properties.attenuation_color ?? properties.attenuationColor) as string | undefined,

      // Maps and passes
      textureMaps,
      shaderPasses,
      shaderConnections,

      // Remaining properties (extensibility)
      properties,
    };
  }

  // ===========================================================================
  // INTERNAL — Value extraction helpers
  // ===========================================================================

  private static extractValue(node: ASTNode): unknown {
    if (!node) return undefined;

    switch (node.type) {
      case 'number':
        return parseFloat(node.text || '0');
      case 'string':
        return HoloScriptMaterialParser.unquote(node.text || '');
      case 'boolean':
        return node.text === 'true';
      case 'null':
        return null;
      case 'color':
        return node.text || '#ffffff';
      case 'array': {
        const items = node.namedChildren || node.children || [];
        return items
          .filter(c => c.type !== ',' && c.type !== '[' && c.type !== ']')
          .map(c => HoloScriptMaterialParser.extractValue(c));
      }
      case 'identifier':
        return node.text;
      default:
        return node.text;
    }
  }

  private static unquote(text: string): string {
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'")) ||
        (text.startsWith('`') && text.endsWith('`'))) {
      return text.slice(1, -1);
    }
    return text;
  }
}
