/**
 * HoloScript AST → ReferenceGraph Semantic Mapping
 *
 * Maps HoloComposition AST types onto ReferenceGraph node and edge kinds.
 * Preserves SourceLocation for provenance tracking and enables dead-code analysis
 * and architectural validation on HoloScript compositions.
 *
 * Supported node kinds:
 * - composition: HoloComposition root
 * - template: HoloTemplate definition (reusable object blueprints)
 * - object: HoloObjectDecl instance (orb/spatial_agent/behavior/etc.)
 * - trait: HoloTraitDefinition user-defined trait
 * - property: HoloObjectProperty or HoloTemplateProperty
 *
 * Supported edge contexts:
 * - template-usage: HoloObjectDecl.template ("using Template")
 * - trait-applied: HoloObjectTrait reference
 * - trait-inherits: HoloTraitDefinition.base (trait inheritance)
 * - contains: parent-child object nesting
 * - property-def: property declarations (for provenance)
 *
 * @version 1.0.0
 */

import type {
  HoloComposition,
  HoloTemplate,
  HoloObjectDecl,
  HoloTraitDefinition,
  HoloObjectTrait,
  HoloObjectProperty,
  SourceLocation,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// MAPPING TYPES
// =============================================================================

/**
 * HoloScript-specific SymbolType for ReferenceGraph.
 * Extends the standard symbol types with HoloScript-specific kinds.
 */
export type HoloSymbolType =
  | 'composition' // HoloComposition root
  | 'template' // HoloTemplate
  | 'object' // HoloObjectDecl instance
  | 'trait' // HoloTraitDefinition
  | 'property' // HoloObjectProperty / HoloTemplateProperty
  | 'trait_instance'; // A trait application (@name on object)

/**
 * HoloScript-specific reference context for ReferenceGraph.
 */
export type HoloReferenceContext =
  | 'template-usage' // object "name" using "Template"
  | 'trait-applied' // @traitName on object
  | 'trait-inherits' // trait Child extends Parent
  | 'contains' // parent-child object nesting
  | 'property-ref' // property access/mutation
  | 'event-handler' // event binding reference
  | 'action-call'; // action invocation

/**
 * Node identifier for HoloScript entities in ReferenceGraph.
 * Format: `<kind>:<filePath>:<name>:<line>` for uniqueness.
 */
export interface HoloGraphNodeId {
  kind: HoloSymbolType;
  filePath: string;
  name: string;
  line: number;
  column?: number;
}

/**
 * Serialized HoloGraphNodeId for Map keys.
 */
export function serializeNodeId(id: HoloGraphNodeId): string {
  return `${id.kind}:${id.filePath}:${id.name}:${id.line}:${id.column ?? 0}`;
}

/**
 * SourceLocation to line/column mapping for provenance.
 */
export function extractSourceLocation(
  loc: SourceLocation | undefined
): { line: number; column: number; endLine?: number; endColumn?: number } {
  if (!loc) {
    return { line: 0, column: 0 };
  }

  return {
    line: loc.start?.line ?? 0,
    column: loc.start?.column ?? 0,
    endLine: loc.end?.line,
    endColumn: loc.end?.column,
  };
}

// =============================================================================
// AST → GRAPH MAPPING
// =============================================================================

/**
 * Map HoloComposition AST to semantic graph node kinds.
 *
 * Extracts:
 * - composition node for the root
 * - template nodes for each HoloTemplate
 * - object nodes for each HoloObjectDecl (recursively)
 * - trait nodes for each HoloTraitDefinition
 * - property nodes for declarations
 *
 * Builds edges for:
 * - template usage (object → template)
 * - trait application (object → trait)
 * - trait inheritance (trait → trait)
 * - object containment (parent → child)
 */
export class HoloASTMapper {
  private filePath: string;
  private nodeDefinitions: Map<string, HoloGraphNodeDef> = new Map();
  private edgeDefinitions: Array<HoloGraphEdgeDef> = [];

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  /**
   * Extract nodes and edges from a HoloComposition AST.
   * Preserves SourceLocation for each node for provenance.
   */
  mapComposition(comp: HoloComposition): {
    nodes: Map<string, HoloGraphNodeDef>;
    edges: Array<HoloGraphEdgeDef>;
  } {
    // Composition root node
    this.addNode({
      id: { kind: 'composition', filePath: this.filePath, name: comp.name, line: 1 },
      name: comp.name,
      type: 'composition',
      filePath: this.filePath,
      line: 1,
      column: 0,
      symbolName: comp.name,
    });

    // Template definitions
    if (comp.templates) {
      for (const tmpl of comp.templates) {
        this.mapTemplate(tmpl);
      }
    }

    // Trait definitions (user-defined)
    if (comp.traitDefinitions) {
      for (const traitDef of comp.traitDefinitions) {
        this.mapTraitDefinition(traitDef);
      }
    }

    // Objects (recursively)
    if (comp.objects) {
      for (const obj of comp.objects) {
        this.mapObject(obj, 'composition:' + comp.name);
      }
    }

    // Spatial groups
    if (comp.spatialGroups) {
      for (const group of comp.spatialGroups) {
        if (group.objects) {
          for (const obj of group.objects) {
            this.mapObject(obj, 'composition:' + comp.name);
          }
        }
      }
    }

    return {
      nodes: this.nodeDefinitions,
      edges: this.edgeDefinitions,
    };
  }

  /**
   * Map a HoloTemplate to a semantic graph node.
   * Templates are reusable blueprints for objects.
   */
  private mapTemplate(tmpl: HoloTemplate): void {
    const srcLoc = extractSourceLocation(tmpl.loc);
    const nodeId = { kind: 'template' as const, filePath: this.filePath, name: tmpl.name, line: srcLoc.line };

    this.addNode({
      id: nodeId,
      name: tmpl.name,
      type: 'template',
      filePath: this.filePath,
      line: srcLoc.line,
      column: srcLoc.column,
      endLine: srcLoc.endLine,
      endColumn: srcLoc.endColumn,
      symbolName: tmpl.name,
    });

    // Template properties as child nodes
    if (tmpl.properties) {
      for (const prop of tmpl.properties) {
        const propSrcLoc = extractSourceLocation(prop.loc);
        this.addNode({
          id: {
            kind: 'property',
            filePath: this.filePath,
            name: `${tmpl.name}.${prop.key}`,
            line: propSrcLoc.line,
          },
          name: prop.key,
          type: 'property',
          filePath: this.filePath,
          line: propSrcLoc.line,
          column: propSrcLoc.column,
          parent: serializeNodeId(nodeId),
          symbolName: prop.key,
        });
      }
    }

    // Template traits
    if (tmpl.traits) {
      for (const trait of tmpl.traits) {
        this.addEdge({
          from: serializeNodeId(nodeId),
          to: this.traitNodeId(trait.name),
          context: 'trait-applied',
          traitName: trait.name,
        });
      }
    }
  }

  /**
   * Map a HoloTraitDefinition to a semantic graph node.
   * User-defined traits can inherit from other traits.
   */
  private mapTraitDefinition(traitDef: HoloTraitDefinition): void {
    const srcLoc = extractSourceLocation(traitDef.loc);
    const nodeId = {
      kind: 'trait' as const,
      filePath: this.filePath,
      name: traitDef.name,
      line: srcLoc.line,
    };

    this.addNode({
      id: nodeId,
      name: traitDef.name,
      type: 'trait',
      filePath: this.filePath,
      line: srcLoc.line,
      column: srcLoc.column,
      symbolName: traitDef.name,
    });

    // Trait inheritance edge
    if (traitDef.base) {
      this.addEdge({
        from: serializeNodeId(nodeId),
        to: this.traitNodeId(traitDef.base),
        context: 'trait-inherits',
        traitName: traitDef.base,
      });
    }

    // Trait properties
    if (traitDef.properties) {
      for (const prop of traitDef.properties) {
        const propSrcLoc = extractSourceLocation(prop.loc);
        this.addNode({
          id: {
            kind: 'property',
            filePath: this.filePath,
            name: `${traitDef.name}.${prop.key}`,
            line: propSrcLoc.line,
          },
          name: prop.key,
          type: 'property',
          filePath: this.filePath,
          line: propSrcLoc.line,
          column: propSrcLoc.column,
          parent: serializeNodeId(nodeId),
          symbolName: prop.key,
        });
      }
    }
  }

  /**
   * Map a HoloObjectDecl to a semantic graph node.
   * Objects can use templates, apply traits, and contain child objects.
   */
  private mapObject(obj: HoloObjectDecl, parentId?: string): void {
    const srcLoc = extractSourceLocation(obj.loc);
    const nodeId = {
      kind: 'object' as const,
      filePath: this.filePath,
      name: obj.name,
      line: srcLoc.line,
    };

    this.addNode({
      id: nodeId,
      name: obj.name,
      type: 'object',
      filePath: this.filePath,
      line: srcLoc.line,
      column: srcLoc.column,
      parent: parentId,
      symbolName: obj.name,
    });

    // Template usage (using Template)
    if (obj.template) {
      this.addEdge({
        from: serializeNodeId(nodeId),
        to: this.templateNodeId(obj.template),
        context: 'template-usage',
        templateName: obj.template,
      });
    }

    // Trait application (@trait_name)
    if (obj.traits) {
      for (const trait of obj.traits) {
        this.addEdge({
          from: serializeNodeId(nodeId),
          to: this.traitNodeId(trait.name),
          context: 'trait-applied',
          traitName: trait.name,
        });
      }
    }

    // Object properties
    if (obj.properties) {
      for (const prop of obj.properties) {
        const propSrcLoc = extractSourceLocation(prop.loc);
        this.addNode({
          id: {
            kind: 'property',
            filePath: this.filePath,
            name: `${obj.name}.${prop.key}`,
            line: propSrcLoc.line,
          },
          name: prop.key,
          type: 'property',
          filePath: this.filePath,
          line: propSrcLoc.line,
          column: propSrcLoc.column,
          parent: serializeNodeId(nodeId),
          symbolName: prop.key,
        });
      }
    }

    // Child objects (recursive containment)
    if (obj.children) {
      for (const child of obj.children) {
        this.mapObject(child, serializeNodeId(nodeId));
        // Add containment edge
        const childSrcLoc = extractSourceLocation(child.loc);
        this.addEdge({
          from: serializeNodeId(nodeId),
          to: serializeNodeId({
            kind: 'object',
            filePath: this.filePath,
            name: child.name,
            line: childSrcLoc.line,
          }),
          context: 'contains',
        });
      }
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private addNode(def: HoloGraphNodeDef): void {
    const key = serializeNodeId(def.id);
    this.nodeDefinitions.set(key, def);
  }

  private addEdge(def: HoloGraphEdgeDef): void {
    this.edgeDefinitions.push(def);
  }

  private templateNodeId(name: string): string {
    return serializeNodeId({
      kind: 'template',
      filePath: this.filePath,
      name,
      line: 0, // Unknown location; resolved at graph build time
    });
  }

  private traitNodeId(name: string): string {
    return serializeNodeId({
      kind: 'trait',
      filePath: this.filePath,
      name,
      line: 0, // Unknown location; resolved at graph build time
    });
  }
}

/**
 * Internal node definition structure (before ReferenceGraph ingestion).
 */
export interface HoloGraphNodeDef {
  id: HoloGraphNodeId;
  name: string;
  type: HoloSymbolType;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  parent?: string; // Serialized parent node ID
  symbolName: string;
}

/**
 * Internal edge definition structure (before ReferenceGraph ingestion).
 */
export interface HoloGraphEdgeDef {
  from: string; // Serialized node ID
  to: string; // Serialized node ID
  context: HoloReferenceContext;
  templateName?: string;
  traitName?: string;
}

/**
 * Builder: Create a mapping document (JSON export) for provenance.
 */
export function buildMappingDocument(
  comp: HoloComposition,
  filePath: string
): {
  composition: string;
  filePath: string;
  nodeCount: number;
  edgeCount: number;
  nodes: Array<Omit<HoloGraphNodeDef, 'id'> & { nodeId: string }>;
  edges: Array<HoloGraphEdgeDef>;
} {
  const mapper = new HoloASTMapper(filePath);
  const { nodes, edges } = mapper.mapComposition(comp);

  return {
    composition: comp.name,
    filePath,
    nodeCount: nodes.size,
    edgeCount: edges.length,
    nodes: Array.from(nodes.entries()).map(([nodeId, def]) => ({
      nodeId,
      ...def,
    })),
    edges,
  };
}
