// TARGET: packages/core/src/compiler/SemanticSceneGraph.ts
/**
 * Semantic Scene Graph — JSON-LD Output from HoloScript Composition AST
 *
 * Converts a HoloComposition AST into a W3C-compliant JSON-LD scene graph
 * using the Schema.org 3DModel vocabulary extended with HoloScript-specific
 * terms for traits, spatial groups, lights, cameras, timelines, and domain blocks.
 *
 * JSON-LD output is suitable for:
 * - Linked Data / Knowledge Graph ingestion
 * - SEO-optimized 3D content indexing
 * - Cross-platform scene interoperability
 * - AI agent scene understanding and reasoning
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloSpatialGroup,
  HoloLight,
  HoloCamera,
  HoloTimeline,
  HoloTimelineEntry,
  HoloAudio,
  HoloZone,
  HoloNPC,
  HoloDomainBlock,
  HoloValue,
  HoloObjectProperty,
  HoloShape,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// JSON-LD TYPES
// =============================================================================

/** JSON-LD context declaration */
export interface JsonLdContext {
  '@vocab'?: string;
  [prefix: string]: string | Record<string, string> | undefined;
}

/** Base JSON-LD node */
export interface JsonLdNode {
  '@id'?: string;
  '@type'?: string | string[];
  [key: string]: unknown;
}

/** The root JSON-LD document output */
export interface JsonLdSceneGraph extends JsonLdNode {
  '@context': JsonLdContext;
  '@type': 'hs:Composition';
  '@id': string;
  'schema:name': string;
  'hs:objects'?: JsonLdNode[];
  'hs:spatialGroups'?: JsonLdNode[];
  'hs:lights'?: JsonLdNode[];
  'hs:camera'?: JsonLdNode;
  'hs:timelines'?: JsonLdNode[];
  'hs:audio'?: JsonLdNode[];
  'hs:zones'?: JsonLdNode[];
  'hs:npcs'?: JsonLdNode[];
  'hs:domainBlocks'?: JsonLdNode[];
  'hs:shapes'?: JsonLdNode[];
  'hs:environment'?: JsonLdNode;
  'hs:state'?: JsonLdNode;
}

/** Options for semantic scene graph generation */
export interface SemanticSceneGraphOptions {
  /** Base URI for @id generation (default: "urn:holoscript:") */
  baseURI?: string;
  /** Include source locations in output (default: false) */
  includeSourceLocations?: boolean;
  /** Include environment/state blocks (default: true) */
  includeMetadata?: boolean;
  /** Pretty-print JSON output (default: true) */
  pretty?: boolean;
  /** Custom JSON-LD context extensions */
  contextExtensions?: Record<string, string>;
  /** Maximum depth for nested spatial groups (default: 10) */
  maxDepth?: number;
}

// =============================================================================
// DEFAULT CONTEXT
// =============================================================================

const DEFAULT_CONTEXT: JsonLdContext = {
  '@vocab': 'https://holoscript.dev/schema/',
  'schema': 'https://schema.org/',
  'hs': 'https://holoscript.dev/schema/',
  'xsd': 'http://www.w3.org/2001/XMLSchema#',
  'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
};

// =============================================================================
// SEMANTIC SCENE GRAPH GENERATOR
// =============================================================================

/**
 * Converts a HoloComposition AST into a JSON-LD semantic scene graph.
 *
 * @example
 * ```typescript
 * import { generateSemanticSceneGraph } from './SemanticSceneGraph';
 *
 * const jsonld = generateSemanticSceneGraph(composition, {
 *   baseURI: 'https://example.com/scenes/',
 *   pretty: true,
 * });
 *
 * console.log(jsonld); // JSON-LD string
 * ```
 */
export function generateSemanticSceneGraph(
  composition: HoloComposition,
  options: SemanticSceneGraphOptions = {}
): string {
  const generator = new SceneGraphGenerator(options);
  const graph = generator.convert(composition);
  return JSON.stringify(graph, null, options.pretty !== false ? 2 : undefined);
}

/**
 * Returns the JSON-LD object (not stringified) for programmatic use.
 */
export function generateSemanticSceneGraphObject(
  composition: HoloComposition,
  options: SemanticSceneGraphOptions = {}
): JsonLdSceneGraph {
  const generator = new SceneGraphGenerator(options);
  return generator.convert(composition);
}

// =============================================================================
// GENERATOR CLASS
// =============================================================================

class SceneGraphGenerator {
  private baseURI: string;
  private includeSourceLocations: boolean;
  private includeMetadata: boolean;
  private maxDepth: number;
  private contextExtensions: Record<string, string>;
  private idCounter: number = 0;

  constructor(options: SemanticSceneGraphOptions = {}) {
    this.baseURI = options.baseURI ?? 'urn:holoscript:';
    this.includeSourceLocations = options.includeSourceLocations ?? false;
    this.includeMetadata = options.includeMetadata ?? true;
    this.maxDepth = options.maxDepth ?? 10;
    this.contextExtensions = options.contextExtensions ?? {};
  }

  /**
   * Convert a HoloComposition into a JSON-LD scene graph.
   */
  convert(composition: HoloComposition): JsonLdSceneGraph {
    this.idCounter = 0;

    const context: JsonLdContext = {
      ...DEFAULT_CONTEXT,
      ...this.contextExtensions,
    };

    const graph: JsonLdSceneGraph = {
      '@context': context,
      '@type': 'hs:Composition',
      '@id': this.makeId(composition.name),
      'schema:name': composition.name,
    };

    // Objects
    if (composition.objects?.length > 0) {
      graph['hs:objects'] = composition.objects.map((obj) => this.convertObject(obj));
    }

    // Spatial groups
    if (composition.spatialGroups?.length > 0) {
      graph['hs:spatialGroups'] = composition.spatialGroups.map((g) =>
        this.convertSpatialGroup(g, 0)
      );
    }

    // Lights
    if (composition.lights?.length > 0) {
      graph['hs:lights'] = composition.lights.map((l) => this.convertLight(l));
    }

    // Camera
    if (composition.camera) {
      graph['hs:camera'] = this.convertCamera(composition.camera);
    }

    // Timelines
    if (composition.timelines?.length > 0) {
      graph['hs:timelines'] = composition.timelines.map((t) => this.convertTimeline(t));
    }

    // Audio
    if (composition.audio?.length > 0) {
      graph['hs:audio'] = composition.audio.map((a) => this.convertAudio(a));
    }

    // Zones
    if (composition.zones?.length > 0) {
      graph['hs:zones'] = composition.zones.map((z) => this.convertZone(z));
    }

    // NPCs
    if (composition.npcs?.length > 0) {
      graph['hs:npcs'] = composition.npcs.map((n) => this.convertNPC(n));
    }

    // Domain blocks
    if (composition.domainBlocks?.length > 0) {
      graph['hs:domainBlocks'] = composition.domainBlocks.map((d) =>
        this.convertDomainBlock(d)
      );
    }

    // Shapes
    if (composition.shapes?.length > 0) {
      graph['hs:shapes'] = composition.shapes.map((s) => this.convertShape(s));
    }

    // Environment
    if (this.includeMetadata && composition.environment) {
      const envProps: Record<string, unknown> = {};
      for (const prop of composition.environment.properties) {
        envProps[prop.key] = this.serializeValue(prop.value);
      }
      graph['hs:environment'] = {
        '@type': 'hs:Environment',
        ...envProps,
      };
    }

    // State
    if (this.includeMetadata && composition.state) {
      const stateProps: Record<string, unknown> = {};
      for (const prop of composition.state.properties) {
        stateProps[prop.key] = this.serializeValue(prop.value);
      }
      graph['hs:state'] = {
        '@type': 'hs:State',
        ...stateProps,
      };
    }

    return graph;
  }

  // ---------------------------------------------------------------------------
  // Object conversion
  // ---------------------------------------------------------------------------

  private convertObject(obj: HoloObjectDecl): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Object',
      '@id': this.makeId(obj.name),
      'schema:name': obj.name,
    };

    if (obj.template) {
      node['hs:template'] = obj.template;
    }

    // Properties
    if (obj.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of obj.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    // Traits
    if (obj.traits?.length > 0) {
      node['hs:traits'] = obj.traits.map((t) => this.convertTrait(t));
    }

    // Children
    if (obj.children?.length) {
      node['hs:children'] = obj.children.map((c) => this.convertObject(c));
    }

    // Platform constraint
    if (obj.platformConstraint) {
      node['hs:platformConstraint'] = {
        include: obj.platformConstraint.include,
        exclude: obj.platformConstraint.exclude,
      };
    }

    // Source location
    if (this.includeSourceLocations && obj.loc) {
      node['hs:sourceLocation'] = {
        startLine: obj.loc.start.line,
        startColumn: obj.loc.start.column,
        endLine: obj.loc.end.line,
        endColumn: obj.loc.end.column,
      };
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Trait conversion
  // ---------------------------------------------------------------------------

  private convertTrait(trait: HoloObjectTrait): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Trait',
      'schema:name': trait.name,
    };

    if (trait.config && Object.keys(trait.config).length > 0) {
      const config: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(trait.config)) {
        config[key] = this.serializeValue(val);
      }
      node['hs:config'] = config;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Spatial group conversion
  // ---------------------------------------------------------------------------

  private convertSpatialGroup(group: HoloSpatialGroup, depth: number): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:SpatialGroup',
      '@id': this.makeId(group.name),
      'schema:name': group.name,
    };

    // Group properties (position, rotation, scale, etc.)
    if (group.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of group.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    // Objects within group
    if (group.objects?.length > 0) {
      node['hs:objects'] = group.objects.map((o) => this.convertObject(o));
    }

    // Nested groups (with depth guard)
    if (group.groups?.length && depth < this.maxDepth) {
      node['hs:children'] = group.groups.map((g) =>
        this.convertSpatialGroup(g, depth + 1)
      );
    }

    // Platform constraint
    if (group.platformConstraint) {
      node['hs:platformConstraint'] = {
        include: group.platformConstraint.include,
        exclude: group.platformConstraint.exclude,
      };
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Light conversion
  // ---------------------------------------------------------------------------

  private convertLight(light: HoloLight): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Light',
      '@id': this.makeId(light.name),
      'schema:name': light.name,
      'hs:lightType': light.lightType,
    };

    if (light.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of light.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Camera conversion
  // ---------------------------------------------------------------------------

  private convertCamera(camera: HoloCamera): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Camera',
      'hs:cameraType': camera.cameraType,
    };

    if (camera.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of camera.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Timeline conversion
  // ---------------------------------------------------------------------------

  private convertTimeline(timeline: HoloTimeline): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Timeline',
      '@id': this.makeId(timeline.name),
      'schema:name': timeline.name,
    };

    if (timeline.autoplay !== undefined) {
      node['hs:autoplay'] = timeline.autoplay;
    }
    if (timeline.loop !== undefined) {
      node['hs:loop'] = timeline.loop;
    }

    if (timeline.entries?.length > 0) {
      node['hs:entries'] = timeline.entries.map((e) => this.convertTimelineEntry(e));
    }

    return node;
  }

  private convertTimelineEntry(entry: HoloTimelineEntry): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:TimelineEntry',
      'hs:time': entry.time,
      'hs:actionKind': entry.action.kind,
    };

    if (entry.action.kind === 'animate') {
      node['hs:target'] = entry.action.target;
      node['hs:animateProperties'] = entry.action.properties;
    } else if (entry.action.kind === 'emit') {
      node['hs:event'] = entry.action.event;
      if (entry.action.data !== undefined) {
        node['hs:data'] = entry.action.data;
      }
    } else if (entry.action.kind === 'call') {
      node['hs:method'] = entry.action.method;
      if (entry.action.args) {
        node['hs:args'] = entry.action.args;
      }
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Audio conversion
  // ---------------------------------------------------------------------------

  private convertAudio(audio: HoloAudio): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Audio',
      '@id': this.makeId(audio.name),
      'schema:name': audio.name,
    };

    if (audio.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of audio.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Zone conversion
  // ---------------------------------------------------------------------------

  private convertZone(zone: HoloZone): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Zone',
      '@id': this.makeId(zone.name),
      'schema:name': zone.name,
    };

    if (zone.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of zone.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    if (zone.handlers?.length > 0) {
      node['hs:handlers'] = zone.handlers.map((h) => ({
        '@type': 'hs:EventHandler',
        'hs:event': h.event,
      }));
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // NPC conversion
  // ---------------------------------------------------------------------------

  private convertNPC(npc: HoloNPC): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:NPC',
      '@id': this.makeId(npc.name),
      'schema:name': npc.name,
    };

    if (npc.npcType) node['hs:npcType'] = npc.npcType;
    if (npc.model) node['hs:model'] = npc.model;
    if (npc.dialogueTree) node['hs:dialogueTree'] = npc.dialogueTree;

    if (npc.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of npc.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    if (npc.behaviors?.length > 0) {
      node['hs:behaviors'] = npc.behaviors.map((b) => ({
        '@type': 'hs:Behavior',
        'schema:name': b.name,
        'hs:trigger': b.trigger,
        'hs:priority': b.priority,
      }));
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Domain block conversion
  // ---------------------------------------------------------------------------

  private convertDomainBlock(block: HoloDomainBlock): JsonLdNode {
    const node: JsonLdNode = {
      '@type': `hs:DomainBlock`,
      '@id': this.makeId(block.name),
      'schema:name': block.name,
      'hs:domain': block.domain,
      'hs:keyword': block.keyword,
    };

    if (block.traits?.length > 0) {
      node['hs:traits'] = block.traits;
    }

    if (block.properties && Object.keys(block.properties).length > 0) {
      const props: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(block.properties)) {
        props[key] = this.serializeValue(val);
      }
      node['hs:properties'] = props;
    }

    if (block.children?.length) {
      node['hs:children'] = block.children.map((c) => this.convertObject(c));
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Shape conversion
  // ---------------------------------------------------------------------------

  private convertShape(shape: HoloShape): JsonLdNode {
    const node: JsonLdNode = {
      '@type': 'hs:Shape',
      '@id': this.makeId(shape.name),
      'schema:name': shape.name,
      'hs:shapeType': shape.shapeType,
    };

    if (shape.properties?.length > 0) {
      const props: Record<string, unknown> = {};
      for (const prop of shape.properties) {
        props[prop.key] = this.serializeValue(prop.value);
      }
      node['hs:properties'] = props;
    }

    return node;
  }

  // ---------------------------------------------------------------------------
  // Utility helpers
  // ---------------------------------------------------------------------------

  private makeId(name: string): string {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${this.baseURI}${slug}-${this.idCounter++}`;
  }

  private serializeValue(value: HoloValue): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return value;
    }
    if (Array.isArray(value)) {
      return value.map((v) => this.serializeValue(v));
    }
    if (typeof value === 'object' && '__bind' in value) {
      return {
        '@type': 'hs:Binding',
        'hs:source': value.source,
        'hs:transform': value.transform,
      };
    }
    if (typeof value === 'object') {
      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.serializeValue(v as HoloValue);
      }
      return result;
    }
    return value;
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export { SceneGraphGenerator };
export default generateSemanticSceneGraph;
