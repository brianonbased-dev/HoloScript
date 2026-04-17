/**
 * Reference Graph - Build reference relationships from AST
 *
 * Sprint 5 Priority 1: Dead Code Detection
 *
 * Features:
 * - Track all symbol definitions (orbs, templates, functions, properties)
 * - Track all symbol references (usages)
 * - Build directed graph of references
 * - Support cross-file references
 * - Native HoloComposition ingestion (see buildFromHoloComposition) —
 *   preserves AST loc ranges for the provenance semiring. NORTH_STAR DT-14.
 *
 * @version 1.1.0
 */

import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloTemplate,
  HoloImport,
  HoloSpatialGroup,
} from '@holoscript/core';

/**
 * Structural equivalent of `@holoscript/core`'s internal `SourceRange`.
 * Defined locally because `SourceRange` is not re-exported from the public
 * barrel; `HoloNode.loc` still resolves to a compatible shape via
 * structural typing.
 */
interface HoloSourceRangeLike {
  start: { line: number; column: number };
  end?: { line: number; column: number };
}

// --- HoloComposition loc helpers (module-level, no `this` needed) -------------
function locLine(loc: HoloSourceRangeLike | undefined): number {
  return loc?.start.line ?? 1;
}
function locColumn(loc: HoloSourceRangeLike | undefined): number {
  return loc?.start.column ?? 1;
}
function locEndLine(loc: HoloSourceRangeLike | undefined): number | undefined {
  return loc?.end?.line;
}
function locEndColumn(loc: HoloSourceRangeLike | undefined): number | undefined {
  return loc?.end?.column;
}
function asSymbolLocation(loc: HoloSourceRangeLike | undefined): SymbolLocation | undefined {
  if (!loc) return undefined;
  return {
    start: { line: loc.start.line, column: loc.start.column },
    end: loc.end ? { line: loc.end.line, column: loc.end.column } : undefined,
  };
}
function asSymbolProvenance(
  prov: { author?: string; timestamp?: number; provenanceHash?: string } | undefined
): SymbolProvenance | undefined {
  if (!prov) return undefined;
  if (prov.author === undefined && prov.timestamp === undefined && !prov.provenanceHash) {
    return undefined;
  }
  return {
    author: prov.author,
    timestamp: prov.timestamp,
    provenanceHash: prov.provenanceHash,
  };
}

/**
 * Symbol types
 */
export type SymbolType =
  | 'orb'
  | 'template'
  | 'function'
  | 'property'
  | 'variable'
  | 'parameter'
  | 'import'
  | 'export'
  | 'composition'
  // External language symbols (codebase absorption)
  | 'class'
  | 'interface'
  | 'enum'
  | 'struct'
  | 'trait'
  | 'method'
  | 'field'
  | 'constant'
  | 'type_alias'
  | 'module'
  | 'namespace'
  | 'package';

/**
 * Source location — raw AST-range preserved without loss.
 *
 * This is the provenance-semiring anchor (A3 artifact). Byte-precise
 * ranges flow from `parseHolo()` through the graph to downstream
 * consumers (DPO splitter, self-improvement pipeline) so extractions
 * can be verified against the original source.
 */
export interface SymbolLocation {
  start: { line: number; column: number };
  end?: { line: number; column: number };
}

/**
 * Cryptographic provenance (CRSEC/X402).
 *
 * Populated when a `.hsplus` or `.holo` source is signed or
 * gated by X402 — lets consumers attest that a graph node came
 * from an authenticated derivation.
 */
export interface SymbolProvenance {
  author?: string;
  timestamp?: number;
  provenanceHash?: string;
}

/**
 * Symbol definition
 */
export interface SymbolDefinition {
  name: string;
  type: SymbolType;
  filePath: string;
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  parent?: string;
  isExported?: boolean;
  isEntryPoint?: boolean;
  /**
   * Native AST location object — preserves byte-precise ranges for the
   * provenance semiring. Populated when the definition originates from
   * `parseHolo()` (see `buildFromHoloComposition`).
   */
  loc?: SymbolLocation;
  /**
   * Cryptographic provenance metadata (CRSEC/X402). Optional.
   */
  provenance?: SymbolProvenance;
  metadata?: Record<string, unknown>;
}

/**
 * Symbol reference
 */
export interface SymbolReference {
  name: string;
  type: SymbolType;
  filePath: string;
  line: number;
  column: number;
  context: ReferenceContext;
  resolvedTo?: string;
}

/**
 * Reference context - where the reference occurs
 */
export type ReferenceContext =
  | 'template-usage'
  | 'function-call'
  | 'property-access'
  | 'variable-read'
  | 'variable-write'
  | 'import'
  | 'export'
  | 'child-reference'
  | 'trait-config'
  | 'spread'
  | 'interpolation';

/**
 * Graph node representing a symbol
 */
export interface GraphNode {
  id: string;
  definition: SymbolDefinition;
  references: Set<string>; // IDs of nodes this symbol references
  referencedBy: Set<string>; // IDs of nodes that reference this symbol
  isReachable: boolean;
}

/**
 * Reference graph statistics
 */
export interface GraphStats {
  totalNodes: number;
  totalEdges: number;
  reachableNodes: number;
  unreachableNodes: number;
  entryPoints: number;
  byType: Record<SymbolType, number>;
}

/**
 * AST node interface (minimal for compatibility)
 */
export interface ASTNode {
  type: string;
  id?: string;
  name?: string;
  children?: ASTNode[];
  properties?: Array<{ key: string; value: unknown }>;
  directives?: Array<{ type: string; name: string; params?: Record<string, unknown> }>;
  loc?: { start: { line: number; column: number }; end?: { line: number; column: number } };
  [key: string]: unknown;
}

/**
 * Reference Graph Builder
 */
export class ReferenceGraph {
  private nodes: Map<string, GraphNode> = new Map();
  private definitions: Map<string, SymbolDefinition> = new Map();
  private references: SymbolReference[] = [];
  private entryPoints: Set<string> = new Set();
  private customEntryPoints: Set<string> = new Set();
  private pendingDependencies: Array<{ source: string; target: string }> = [];
  private dirty = false;

  constructor() {}

  /**
   * Build reference graph from AST
   */
  buildFromAST(ast: ASTNode, filePath: string = 'input.holo'): void {
    // Phase 1: Collect all definitions
    this.collectDefinitions(ast, filePath, null);

    // Phase 2: Collect all references
    this.collectReferences(ast, filePath, null);

    // Phase 3: Build graph edges
    this.buildEdges();

    // Phase 4: Identify entry points
    this.identifyEntryPoints();
  }

  /**
   * Add multiple ASTs (for cross-file analysis)
   */
  addFile(ast: ASTNode, filePath: string): void {
    this.collectDefinitions(ast, filePath, null);
    this.collectReferences(ast, filePath, null);
    this.dirty = true;
  }

  /**
   * Finalize the graph after adding all files
   */
  finalize(): void {
    this.buildEdges();
    this.identifyEntryPoints();
    this.dirty = false;
  }

  /**
   * Ingest a `HoloComposition` AST natively — the A2 mapping.
   *
   * Preserves byte-precise `SourceLocation` ranges on every definition
   * for the provenance semiring (A3). This is the sanctioned dogfooding
   * path for `.holo` / `.hsplus` sources — callers should use
   * `ingestHoloSource()` rather than hand-rolling regex over raw text.
   *
   * Unlike `buildFromAST`, this method requires the caller to invoke
   * `finalize()` when done ingesting (or use `ingestHoloSource` which
   * finalizes on single-file ingestion).
   */
  buildFromHoloComposition(ast: HoloComposition, filePath: string = 'input.holo'): void {
    const compositionName = ast.name || 'unnamed';
    this.addDefinition({
      name: compositionName,
      type: 'composition',
      filePath,
      line: locLine(ast.loc),
      column: locColumn(ast.loc),
      endLine: locEndLine(ast.loc),
      endColumn: locEndColumn(ast.loc),
      isEntryPoint: true,
      loc: asSymbolLocation(ast.loc),
      provenance: asSymbolProvenance(ast.provenance),
      metadata: { fromHoloAST: true, astType: 'Composition' },
    });

    for (const tmpl of ast.templates ?? []) {
      this.ingestTemplate(tmpl, filePath, compositionName);
    }
    for (const obj of ast.objects ?? []) {
      this.ingestObject(obj, filePath, compositionName);
    }
    for (const group of ast.spatialGroups ?? []) {
      this.ingestSpatialGroup(group, filePath, compositionName);
    }
    for (const imp of ast.imports ?? []) {
      this.ingestImport(imp, filePath);
    }

    this.dirty = true;
  }

  private ingestTemplate(tmpl: HoloTemplate, filePath: string, parent: string): void {
    if (!tmpl.name) return;
    this.addDefinition({
      name: tmpl.name,
      type: 'template',
      filePath,
      line: locLine(tmpl.loc),
      column: locColumn(tmpl.loc),
      endLine: locEndLine(tmpl.loc),
      endColumn: locEndColumn(tmpl.loc),
      parent,
      isExported: true,
      loc: asSymbolLocation(tmpl.loc),
      metadata: { fromHoloAST: true, astType: 'Template' },
    });
  }

  private ingestObject(obj: HoloObjectDecl, filePath: string, parent: string): void {
    if (!obj.name) return;
    const objectId = obj.name;

    this.addDefinition({
      name: objectId,
      type: 'orb',
      filePath,
      line: locLine(obj.loc),
      column: locColumn(obj.loc),
      endLine: locEndLine(obj.loc),
      endColumn: locEndColumn(obj.loc),
      parent,
      loc: asSymbolLocation(obj.loc),
      provenance: asSymbolProvenance(obj.provenance),
      metadata: { fromHoloAST: true, astType: 'Object' },
    });

    // `using` clause — template reference
    if (obj.template) {
      this.addReference({
        name: obj.template,
        type: 'template',
        filePath,
        line: locLine(obj.loc),
        column: locColumn(obj.loc),
        context: 'template-usage',
      });
    }

    // Trait applications — reference edges per A2
    for (const trait of obj.traits ?? []) {
      this.ingestObjectTrait(trait, filePath);
    }

    // Nested children — recurse with this object as parent
    for (const child of obj.children ?? []) {
      this.ingestObject(child, filePath, objectId);
    }
  }

  private ingestObjectTrait(trait: HoloObjectTrait, filePath: string): void {
    if (!trait.name) return;
    this.addReference({
      name: trait.name,
      type: 'trait',
      filePath,
      line: locLine(trait.loc),
      column: locColumn(trait.loc),
      context: 'trait-config',
    });
  }

  private ingestSpatialGroup(group: HoloSpatialGroup, filePath: string, parent: string): void {
    const name = (group as { name?: string }).name;
    if (!name) return;
    this.addDefinition({
      name,
      type: 'orb',
      filePath,
      line: locLine(group.loc),
      column: locColumn(group.loc),
      endLine: locEndLine(group.loc),
      endColumn: locEndColumn(group.loc),
      parent,
      loc: asSymbolLocation(group.loc),
      metadata: { fromHoloAST: true, astType: 'SpatialGroup' },
    });
  }

  private ingestImport(imp: HoloImport, filePath: string): void {
    const source = (imp as { source?: string }).source;
    if (!source) return;
    this.addReference({
      name: source,
      type: 'import',
      filePath,
      line: locLine(imp.loc),
      column: locColumn(imp.loc),
      context: 'import',
    });
  }

  /**
   * Collect all symbol definitions from AST
   */
  private collectDefinitions(node: ASTNode, filePath: string, parent: string | null): void {
    const nodeId = this.getNodeId(node, filePath);

    // Check node type for definitions
    if (node.type === 'composition') {
      this.addDefinition({
        name: node.id || node.name || 'unnamed',
        type: 'composition',
        filePath,
        line: node.loc?.start.line || 1,
        column: node.loc?.start.column || 1,
        isEntryPoint: true,
        metadata: { fromAST: true },
      });
    }

    if (node.type === 'orb' || node.type === 'object') {
      const name = node.id || node.name || '';
      if (name) {
        this.addDefinition({
          name,
          type: 'orb',
          filePath,
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 1,
          parent: parent ?? undefined,
          metadata: { fromAST: true },
        });
      }
    }

    if (node.type === 'template') {
      const name = node.id || node.name || '';
      if (name) {
        this.addDefinition({
          name,
          type: 'template',
          filePath,
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 1,
          isExported: true, // Templates are typically available for use
          metadata: { fromAST: true },
        });
      }
    }

    // Functions
    if (node.type === 'function' || node.type === 'func') {
      const name = node.id || node.name || '';
      if (name) {
        this.addDefinition({
          name,
          type: 'function',
          filePath,
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 1,
          parent: parent ?? undefined,
          metadata: { fromAST: true },
        });
      }
    }

    // Properties
    if (node.properties) {
      for (const prop of node.properties) {
        this.addDefinition({
          name: prop.key,
          type: 'property',
          filePath,
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 1,
          parent: nodeId,
          metadata: { fromAST: true },
        });
      }
    }

    // Logic blocks - check for function definitions
    if (node.type === 'logic' && node.body) {
      const body = node.body as Record<string, unknown>;
      if (Array.isArray(body.functions)) {
        for (const func of body.functions) {
          this.addDefinition({
            name: func.name,
            type: 'function',
            filePath,
            line: func.loc?.start.line || node.loc?.start.line || 1,
            column: func.loc?.start.column || node.loc?.start.column || 1,
            parent: parent ?? undefined,
            metadata: { fromAST: true },
          });
        }
      }
    }

    // Recurse into children
    if (node.children) {
      for (const child of node.children) {
        this.collectDefinitions(child, filePath, nodeId);
      }
    }

    // Also check 'root' for top-level AST structures
    const root = node.root as ASTNode | undefined;
    if (root && Array.isArray(root.children)) {
      for (const child of root.children) {
        this.collectDefinitions(child, filePath, null);
      }
    }
  }

  /**
   * Collect all symbol references from AST
   */
  private collectReferences(node: ASTNode, filePath: string, parent: string | null): void {
    // Template usage: `using "TemplateName"`
    if (node.template || node.using) {
      const templateName = node.template || node.using;
      if (typeof templateName === 'string') {
        this.addReference({
          name: templateName,
          type: 'template',
          filePath,
          line: node.loc?.start.line || 1,
          column: node.loc?.start.column || 1,
          context: 'template-usage',
        });
      }
    }

    // Spread operator references
    if (node.properties) {
      for (const prop of node.properties) {
        if (typeof prop.key === 'string' && prop.key.startsWith('__spread')) {
          const spreadValue = prop.value;
          if (typeof spreadValue === 'string') {
            this.addReference({
              name: spreadValue,
              type: 'template',
              filePath,
              line: node.loc?.start.line || 1,
              column: node.loc?.start.column || 1,
              context: 'spread',
            });
          }
        }

        // Property value references (look for identifiers)
        this.scanValueForReferences(prop.value, filePath, node.loc?.start.line || 1);
      }
    }

    // Child references
    if (node.children) {
      for (const child of node.children) {
        const childName = child.id || child.name;
        if (childName && parent) {
          // Children are referenced by their parent
          this.addReference({
            name: childName,
            type: 'orb',
            filePath,
            line: child.loc?.start.line || 1,
            column: child.loc?.start.column || 1,
            context: 'child-reference',
          });
        }
        this.collectReferences(child, filePath, this.getNodeId(node, filePath));
      }
    }

    // Logic block references
    if (node.type === 'logic' && node.body) {
      this.scanLogicBlockForReferences(
        node.body as Record<string, unknown>,
        filePath,
        node.loc?.start.line || 1
      );
    }

    // Directives may reference properties/functions
    if (node.directives) {
      for (const dir of node.directives) {
        if (dir.params) {
          for (const value of Object.values(dir.params)) {
            this.scanValueForReferences(value, filePath, node.loc?.start.line || 1);
          }
        }
      }
    }

    // Check root for top-level
    const refRoot = node.root as ASTNode | undefined;
    if (refRoot && Array.isArray(refRoot.children)) {
      for (const child of refRoot.children) {
        this.collectReferences(child, filePath, null);
      }
    }
  }

  /**
   * Scan a value for references
   */
  private scanValueForReferences(value: unknown, filePath: string, line: number): void {
    if (typeof value === 'string') {
      // Look for identifier patterns like `this.propertyName` or `functionName()`
      const thisRefs = value.match(/this\.([a-zA-Z_][a-zA-Z0-9_]*)/g);
      if (thisRefs) {
        for (const ref of thisRefs) {
          const name = ref.replace('this.', '');
          this.addReference({
            name,
            type: 'property',
            filePath,
            line,
            column: 1,
            context: 'property-access',
          });
        }
      }

      // Function calls
      const funcCalls = value.match(/([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g);
      if (funcCalls) {
        for (const call of funcCalls) {
          const name = call.replace(/\s*\($/, '');
          if (!['if', 'for', 'while', 'switch', 'log', 'emit'].includes(name)) {
            this.addReference({
              name,
              type: 'function',
              filePath,
              line,
              column: 1,
              context: 'function-call',
            });
          }
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        this.scanValueForReferences(item, filePath, line);
      }
    } else if (value && typeof value === 'object') {
      for (const v of Object.values(value)) {
        this.scanValueForReferences(v, filePath, line);
      }
    }
  }

  /**
   * Scan logic block for references
   */
  private scanLogicBlockForReferences(
    body: Record<string, unknown>,
    filePath: string,
    line: number
  ): void {
    // Functions
    if (Array.isArray(body.functions)) {
      for (const func of body.functions) {
        if (func.body) {
          this.scanValueForReferences(func.body, filePath, line);
        }
      }
    }

    // Event handlers
    if (Array.isArray(body.eventHandlers)) {
      for (const handler of body.eventHandlers) {
        if (handler.body) {
          this.scanValueForReferences(handler.body, filePath, line);
        }
      }
    }

    // Tick handlers
    if (Array.isArray(body.tickHandlers)) {
      for (const handler of body.tickHandlers) {
        if (handler.body) {
          this.scanValueForReferences(handler.body, filePath, line);
        }
      }
    }

    // Lifecycle hooks
    if (Array.isArray(body.lifecycleHooks)) {
      for (const hook of body.lifecycleHooks) {
        if (hook.body) {
          this.scanValueForReferences(hook.body, filePath, line);
        }
      }
    }
  }

  /**
   * Build graph edges from definitions and references
   */
  private buildEdges(): void {
    this.nodes.clear();

    // Create nodes for all definitions
    for (const [id, def] of this.definitions) {
      this.nodes.set(id, {
        id,
        definition: def,
        references: new Set(),
        referencedBy: new Set(),
        isReachable: false,
      });
    }

    // Add edges for references
    for (const ref of this.references) {
      const refId = this.findDefinitionId(ref.name, ref.type);
      if (refId) {
        // Find the source node (where the reference occurs)
        const sourceId = this.findSourceNode(ref.filePath, ref.line);
        if (sourceId) {
          const sourceNode = this.nodes.get(sourceId);
          const targetNode = this.nodes.get(refId);

          if (sourceNode && targetNode) {
            sourceNode.references.add(refId);
            targetNode.referencedBy.add(sourceId);
          }
        }
      }
    }

    // Add explicit name-based dependencies used by legacy tests and programmatic callers.
    for (const dep of this.pendingDependencies) {
      const sourceId =
        this.findDefinitionId(dep.source, 'function') || this.findDefinitionIdByName(dep.source);
      const targetId =
        this.findDefinitionId(dep.target, 'function') || this.findDefinitionIdByName(dep.target);
      if (!sourceId || !targetId) continue;

      const sourceNode = this.nodes.get(sourceId);
      const targetNode = this.nodes.get(targetId);
      if (!sourceNode || !targetNode) continue;

      sourceNode.references.add(targetId);
      targetNode.referencedBy.add(sourceId);
    }
  }

  /**
   * Identify entry points
   */
  private identifyEntryPoints(): void {
    this.entryPoints.clear();
    const hasExplicitEntryPoints =
      this.customEntryPoints.size > 0 ||
      Array.from(this.nodes.values()).some(
        (node) => node.definition.isEntryPoint || node.definition.type === 'composition'
      );

    for (const [id, node] of this.nodes) {
      if (node.definition.isEntryPoint || node.definition.type === 'composition') {
        this.entryPoints.add(id);
      }

      // AST-derived top-level orbs are entry points only when the graph has no
      // explicit root. Manually assembled graphs in tests should rely on
      // setEntryPoint/addEntryPoint instead of making every orb reachable.
      if (
        !hasExplicitEntryPoints &&
        node.definition.type === 'orb' &&
        !node.definition.parent &&
        node.definition.metadata?.fromAST === true
      ) {
        this.entryPoints.add(id);
      }
    }

    for (const entry of this.customEntryPoints) {
      const entryId = this.nodes.has(entry) ? entry : this.findDefinitionIdByName(entry);
      if (entryId) {
        this.entryPoints.add(entryId);
      }
    }
  }

  /**
   * Add a definition
   */
  addDefinition(def: SymbolDefinition): void {
    const id = `${def.type}:${def.name}:${def.filePath}:${def.line}`;
    this.definitions.set(id, def);
    this.dirty = true;
  }

  /**
   * Add a reference
   */
  addReference(ref: SymbolReference): void {
    this.references.push(ref);
    this.dirty = true;
  }

  /**
   * Backward-compatible alias used by legacy tests.
   */
  addSymbol(
    def: SymbolDefinition & {
      startLine?: number;
      startColumn?: number;
      signature?: string;
      documentation?: string;
      hasTests?: boolean;
      isPublic?: boolean;
    }
  ): void {
    this.addDefinition({
      ...def,
      line: def.line ?? def.startLine ?? 1,
      column: def.column ?? def.startColumn ?? 1,
      endLine: def.endLine,
      endColumn: def.endColumn,
      metadata: {
        signature: def.signature,
        documentation: def.documentation,
        hasTests: def.hasTests,
        isPublic: def.isPublic,
        ...(def.metadata || {}),
      },
    });
  }

  /**
   * Backward-compatible dependency helper used by tests.
   */
  addDependency(source: string, target: string): void {
    this.pendingDependencies.push({ source, target });
    this.dirty = true;
  }

  /**
   * Backward-compatible entry point helper used by tests.
   */
  setEntryPoint(nameOrId: string): void {
    this.customEntryPoints.add(nameOrId);
    this.dirty = true;
  }

  /**
   * Find definition ID by name and type
   */
  private findDefinitionId(name: string, type: SymbolType): string | null {
    for (const [id, def] of this.definitions) {
      if (def.name === name && (def.type === type || this.isCompatibleType(def.type, type))) {
        return id;
      }
    }
    return null;
  }

  private findDefinitionIdByName(name: string): string | null {
    for (const [id, def] of this.definitions) {
      if (def.name === name) {
        return id;
      }
    }
    return null;
  }

  private ensureBuilt(): void {
    if (!this.dirty) {
      return;
    }

    this.buildEdges();
    this.identifyEntryPoints();
    this.dirty = false;
  }

  /**
   * Check if types are compatible
   */
  private isCompatibleType(defType: SymbolType, refType: SymbolType): boolean {
    // Some flexibility for type matching
    if (defType === 'orb' && refType === 'template') return true;
    if (defType === 'property' && refType === 'variable') return true;
    return false;
  }

  /**
   * Find source node for a reference location
   */
  private findSourceNode(filePath: string, line: number): string | null {
    let bestMatch: string | null = null;
    let bestLine = 0;

    for (const [id, def] of this.definitions) {
      if (def.filePath === filePath && def.line <= line && def.line > bestLine) {
        bestMatch = id;
        bestLine = def.line;
      }
    }

    return bestMatch;
  }

  /**
   * Get node ID
   */
  private getNodeId(node: ASTNode, filePath: string): string {
    const name = node.id || node.name || 'unnamed';
    const line = node.loc?.start.line || 1;
    return `${node.type}:${name}:${filePath}:${line}`;
  }

  /**
   * Get all nodes
   */
  getNodes(): Map<string, GraphNode> {
    this.ensureBuilt();
    return this.nodes;
  }

  /**
   * Get all definitions
   */
  getDefinitions(): Map<string, SymbolDefinition> {
    return this.definitions;
  }

  /**
   * Get all references
   */
  getReferences(): SymbolReference[] {
    return this.references;
  }

  /**
   * Get entry points
   */
  getEntryPoints(): Set<string> {
    this.ensureBuilt();
    return new Set([...this.entryPoints, ...this.customEntryPoints]);
  }

  /**
   * Add custom entry point
   */
  addEntryPoint(nodeId: string): void {
    this.customEntryPoints.add(nodeId);
    this.dirty = true;
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    let totalEdges = 0;
    let reachableNodes = 0;
    let unreachableNodes = 0;
    const byType: Record<SymbolType, number> = {
      orb: 0,
      template: 0,
      function: 0,
      property: 0,
      variable: 0,
      parameter: 0,
      import: 0,
      export: 0,
      composition: 0,
      class: 0,
      interface: 0,
      enum: 0,
      struct: 0,
      trait: 0,
      method: 0,
      field: 0,
      constant: 0,
      type_alias: 0,
      module: 0,
      namespace: 0,
      package: 0,
    };

    for (const node of this.nodes.values()) {
      totalEdges += node.references.size;
      byType[node.definition.type]++;

      if (node.isReachable) {
        reachableNodes++;
      } else {
        unreachableNodes++;
      }
    }

    return {
      totalNodes: this.nodes.size,
      totalEdges,
      reachableNodes,
      unreachableNodes,
      entryPoints: this.entryPoints.size,
      byType,
    };
  }

  /**
   * Clear the graph
   */
  clear(): void {
    this.nodes.clear();
    this.definitions.clear();
    this.references = [];
    this.entryPoints.clear();
  }
}

/**
 * Create a reference graph
 */
export function createReferenceGraph(): ReferenceGraph {
  return new ReferenceGraph();
}
