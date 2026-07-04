/**
 * HoloScript Native Language Adapter
 *
 * Parses `.holo` and `.hsplus` source via `@holoscript/core`'s
 * `parseHoloPartial()` (DT-14 / NORTH_STAR / no-regex-hs-parsing). Walks the
 * resulting `HoloComposition` AST and emits the same
 * `ExternalSymbolDefinition` / `ImportEdge` / `CallEdge` shapes used by the
 * tree-sitter adapters — so the Absorb scanner, ReferenceGraph, and
 * CodebaseGraph consume `.holo` files identically to TypeScript or Python.
 *
 * Unlike the tree-sitter adapters, this adapter does NOT depend on a
 * tree-sitter grammar. It exposes a `parse(content)` method that returns a
 * minimal `ParseTree` carrying a `__holoAST` payload; `extractSymbols`/
 * `extractImports`/`extractCalls` read that payload instead of walking a
 * tree-sitter tree.
 *
 * Design goals (from AST-migration meeting B1):
 *   - Replace text tokenizer with `parseHolo*()` in Absorb's ingestion
 *     pipeline for `.holo`/`.hsplus` files.
 *   - Keep the regex/text path for non-HoloScript languages.
 *   - Preserve source locations (`SourceRange`) for provenance semiring
 *     continuity across parse -> graph -> output.
 *
 * If `@holoscript/core` is not installed (it is an optional peer dep of
 * `@holoscript/absorb-service`), the adapter loads lazily and the file
 * falls through to the regex `extractLooseImports()` path in the scanner.
 */

import type {
  LanguageAdapter,
  ParseTree,
  ExternalSymbolDefinition,
  ImportEdge,
  CallEdge,
  ExtendedSymbolType,
  SupportedLanguage,
} from '../types';

// =============================================================================
// CORE TYPES (mirror — kept in sync with @holoscript/core exports)
// =============================================================================

/**
 * Minimal shape of the `@holoscript/core` surface we consume. We keep a
 * local structural type to avoid a hard compile-time dependency on core.
 */
interface HoloCoreSurface {
  parseHoloPartial(
    source: string,
    options?: { locations?: boolean; tolerant?: boolean }
  ): {
    success: boolean;
    ast: HoloCompositionLite;
    errors: Array<{ message: string; loc?: { line: number; column: number } }>;
    warnings: unknown[];
    partial: boolean;
  };
  /** The REAL .hsplus (trait/brain) parser — core's `parse`. Distinct grammar from
   *  parseHoloPartial (the .holo composition parser). Present only when core exports it. */
  parseHsplus?(source: string): {
    success: boolean;
    ast: HsplusAstLite;
    errors?: Array<{ message: string; line?: number; column?: number }>;
    warnings?: unknown[];
  };
}

/** Minimal shape of an hsplus AST node (trait/brain/agent/object declaration). The
 *  identifier lands in `type`; @trait/@brain/@on_* directives + capability_tags carry the
 *  semantics the .holo composition parser flattened away. */
interface HsplusNodeLite {
  type: string;
  name?: string;
  properties?: Record<string, unknown>;
  directives?: Array<{ type?: string; name: string; config?: Record<string, unknown> }>;
  children?: HsplusNodeLite[];
  traits?: unknown[];
  loc?: LocLite;
}
interface HsplusAstLite {
  type: string;
  properties?: Record<string, unknown>;
  directives?: Array<{ type?: string; name: string; config?: Record<string, unknown> }>;
  children?: HsplusNodeLite[];
  compositions?: HsplusNodeLite[];
  worlds?: HsplusNodeLite[];
  npcs?: HsplusNodeLite[];
  loc?: LocLite;
}

interface LocLite {
  start: { line: number; column: number; offset?: number };
  end: { line: number; column: number; offset?: number };
}

interface HoloNodeLite {
  type: string;
  loc?: LocLite;
}

interface HoloObjectTraitLite extends HoloNodeLite {
  type: 'ObjectTrait';
  name: string;
  /** Trait arguments, e.g. `@label(text: "...")` → { text: "..." }. Carries the
   *  human-meaningful prose that semantic search needs to match on. */
  config?: Record<string, unknown>;
}

interface HoloObjectDeclLite extends HoloNodeLite {
  type: 'Object';
  name: string;
  template?: string;
  traits: HoloObjectTraitLite[];
  children?: HoloObjectDeclLite[];
}

interface HoloTemplateLite extends HoloNodeLite {
  type: 'Template';
  name: string;
  traits: HoloObjectTraitLite[];
}

interface HoloImportLite extends HoloNodeLite {
  type: 'Import';
  source: string;
  specifiers: Array<{ imported: string; local?: string }>;
}

interface HoloSpatialGroupLite extends HoloNodeLite {
  type: 'SpatialGroup';
  name: string;
  objects: HoloObjectDeclLite[];
  groups?: HoloSpatialGroupLite[];
}

interface HoloLightLite extends HoloNodeLite {
  type: 'Light';
  name: string;
}

interface HoloTraitDefinitionLite extends HoloNodeLite {
  type: 'TraitDefinition';
  name: string;
  base?: string;
}

interface HoloCompositionLite extends HoloNodeLite {
  type: 'Composition';
  name: string;
  templates: HoloTemplateLite[];
  objects: HoloObjectDeclLite[];
  spatialGroups: HoloSpatialGroupLite[];
  lights: HoloLightLite[];
  imports: HoloImportLite[];
  traitDefinitions?: HoloTraitDefinitionLite[];
}

/**
 * Extended ParseTree that carries the native Holo AST for adapters
 * that bypass tree-sitter. The scanner never peers inside — it just
 * passes this object back to the adapter's `extractSymbols/Imports/Calls`.
 */
export interface HoloParseTree extends ParseTree {
  /** Raw source — for range slicing and line-based recovery */
  __holoSource: string;
  /** Which grammar produced __holoAST: 'holo' = parseHoloPartial (composition),
   *  'hsplus' = parseHsplus (trait/brain), 'hs' = parseHsplus over base logic
   *  (functions/objects — the .hs logic layer shares the HoloScriptPlus parser,
   *  as the canonical `parse_hs` handler does). Governs which extractor runs. */
  __holoKind: 'holo' | 'hsplus' | 'hs';
  /** Parsed AST — a composition (holo) or an hsplus/hs declaration tree */
  __holoAST: HoloCompositionLite | HsplusAstLite;
  /** Parse errors (non-fatal thanks to tolerant mode) */
  __holoErrors: Array<{ message: string; loc?: { line: number; column: number } }>;
  /** True whenever the parse was partial (i.e. the source had errors) */
  __holoPartial: boolean;
}

// =============================================================================
// ADAPTER
// =============================================================================

export class HoloAdapter implements LanguageAdapter {
  readonly language = 'holoscript' as const;
  readonly extensions = ['.holo', '.hsplus', '.hs'];
  /**
   * This adapter does NOT use tree-sitter. The grammar package is
   * declared only so the existing `AdapterManager.loadNative/loadWasm`
   * path has a name to key off — but the scanner short-circuits before
   * tree-sitter is ever invoked for `.holo`/`.hsplus` files.
   */
  readonly grammarPackage = '@holoscript/core';

  /** Marker read by CodebaseScanner / AdapterManager to bypass tree-sitter. */
  readonly isNativeAdapter = true as const;

  private coreRef: HoloCoreSurface | null = null;
  private coreLoadAttempted = false;
  private coreLoadError: string | null = null;

  /**
   * Parse `.holo`/`.hsplus` source and produce an extended `ParseTree` that
   * carries the native Holo AST alongside a minimal tree-sitter-compatible
   * `rootNode` stub (so downstream code that reads `tree.rootNode.text`
   * keeps working).
   *
   * Returns `null` if `@holoscript/core` cannot be loaded — callers should
   * fall through to the regex `extractLooseImports()` path.
   */
  async parse(source: string, filePath = 'input.holo'): Promise<HoloParseTree | null> {
    const core = await this.loadCore();
    if (!core) return null;

    // Route by extension: .hsplus (trait/brain) AND .hs (base logic — functions/objects)
    // -> the real HoloScriptPlus parser; .holo -> the composition parser. The .hs logic
    // layer shares the HoloScriptPlus parser (the canonical `parse_hs` handler does the
    // same), so slice 2 routes it here instead of the composition parser, which used to
    // flatten every function/object to a nameless `composition`.
    const isHsplus = filePath.endsWith('.hsplus');
    const isHs = filePath.endsWith('.hs');
    let kind: 'holo' | 'hsplus' | 'hs' = 'holo';
    let ast: HoloCompositionLite | HsplusAstLite;
    let errors: Array<{ message: string; loc?: { line: number; column: number } }>;
    let partial: boolean;

    if ((isHsplus || isHs) && core.parseHsplus) {
      const r = core.parseHsplus(source);
      kind = isHsplus ? 'hsplus' : 'hs';
      ast = r.ast;
      errors = (r.errors ?? []).map((e) => ({
        message: e.message,
        loc: e.line != null ? { line: e.line, column: e.column ?? 0 } : undefined,
      }));
      partial = !r.success;
    } else {
      const r = core.parseHoloPartial(source, { locations: true, tolerant: true });
      ast = r.ast;
      errors = r.errors;
      partial = r.partial;
    }

    const lineCount = source.split('\n').length;

    // Minimal tree-sitter-compatible stub. `namedChildren`/`descendantsOfType`
    // are empty arrays because downstream consumers that depend on tree-sitter
    // shapes must go through the adapter's extract* methods instead.
    const rootNode = {
      type: 'composition',
      text: source,
      startPosition: { row: 0, column: 0 },
      endPosition: { row: Math.max(0, lineCount - 1), column: 0 },
      childCount: 0,
      children: [],
      namedChildren: [],
      parent: null,
      childForFieldName: () => null,
      descendantsOfType: () => [],
    };

    return {
      rootNode: rootNode as unknown as HoloParseTree['rootNode'],
      __holoSource: source,
      __holoKind: kind,
      __holoAST: ast,
      __holoErrors: errors,
      __holoPartial: partial,
    };
  }

  // ── LanguageAdapter contract ────────────────────────────────────────────

  extractSymbols(tree: ParseTree, filePath: string): ExternalSymbolDefinition[] {
    const holoTree = tree as HoloParseTree;
    const rawAst = holoTree.__holoAST;
    if (!rawAst) return [];
    if (holoTree.__holoKind === 'hsplus') {
      return this.extractHsplusSymbols(rawAst as HsplusAstLite, filePath);
    }
    if (holoTree.__holoKind === 'hs') {
      return this.extractHsSymbols(rawAst as HsplusAstLite, filePath);
    }

    const ast = rawAst as HoloCompositionLite;
    const symbols: ExternalSymbolDefinition[] = [];

    // Composition itself = one top-level symbol.
    symbols.push(
      this.makeSymbol({
        name: ast.name,
        type: 'composition',
        filePath,
        loc: ast.loc,
        signature: `composition "${ast.name}"`,
        isExported: true,
      })
    );

    // User-defined trait definitions: `trait Name [extends Base] { ... }`
    for (const trait of ast.traitDefinitions ?? []) {
      symbols.push(
        this.makeSymbol({
          name: trait.name,
          type: 'trait',
          filePath,
          loc: trait.loc,
          signature: trait.base
            ? `trait ${trait.name} extends ${trait.base}`
            : `trait ${trait.name}`,
          owner: ast.name,
          isExported: true,
        })
      );
    }

    // Templates
    for (const tpl of ast.templates ?? []) {
      symbols.push(
        this.makeSymbol({
          name: tpl.name,
          type: 'template',
          filePath,
          loc: tpl.loc,
          signature: `template "${tpl.name}"`,
          owner: ast.name,
          isExported: true,
          docComment: this.traitText(tpl.traits),
        })
      );
    }

    // Lights
    for (const light of ast.lights ?? []) {
      symbols.push(
        this.makeSymbol({
          name: light.name,
          type: 'orb', // lights render as orb-like spatial anchors
          filePath,
          loc: light.loc,
          signature: `light "${light.name}"`,
          owner: ast.name,
        })
      );
    }

    // Top-level objects (and their children, recursively)
    for (const obj of ast.objects ?? []) {
      this.collectObjectSymbols(obj, ast.name, filePath, symbols);
    }

    // Spatial groups + their nested objects
    for (const group of ast.spatialGroups ?? []) {
      this.collectSpatialGroupSymbols(group, ast.name, filePath, symbols);
    }

    return symbols;
  }

  extractImports(tree: ParseTree, filePath: string): ImportEdge[] {
    const holoTree = tree as HoloParseTree;
    if (holoTree.__holoKind !== 'holo') return []; // hsplus/hs import edges: slice 3
    const ast = holoTree.__holoAST as HoloCompositionLite;
    if (!ast) return [];

    const edges: ImportEdge[] = [];
    for (const imp of ast.imports ?? []) {
      const line = imp.loc?.start.line ?? 1;
      const named = (imp.specifiers ?? []).map((s) => s.local ?? s.imported).filter(Boolean);
      edges.push({
        fromFile: filePath,
        toModule: imp.source,
        namedImports: named.length > 0 ? named : undefined,
        isWildcard: false,
        isDefault: named.length === 0, // bare `import "./x.hsplus"` ~ default form
        line,
      });
    }
    return edges;
  }

  /**
   * HoloScript expresses cross-node interaction as trait attachments (e.g.
   * `@grabbable`, `@SomeNS.trait(...)`) and template usage (`using "X"`).
   * We model both as CallEdges so the reference graph captures them.
   */
  extractCalls(tree: ParseTree, filePath: string): CallEdge[] {
    const holoTree = tree as HoloParseTree;
    if (holoTree.__holoKind !== 'holo') return []; // hsplus/hs trait-composition + call edges: slice 3
    const ast = holoTree.__holoAST as HoloCompositionLite;
    if (!ast) return [];

    const edges: CallEdge[] = [];

    const visitObject = (obj: HoloObjectDeclLite, owner: string): void => {
      const line = obj.loc?.start.line ?? 1;
      const column = obj.loc?.start.column ?? 0;

      // Template usage: `object "X" using "Template" { ... }`
      if (obj.template) {
        edges.push({
          callerId: `${filePath}:${owner}.${obj.name}`,
          calleeName: obj.template,
          calleeOwner: 'template',
          filePath,
          line,
          column,
        });
      }

      // Trait attachments: `@traitName`
      for (const trait of obj.traits ?? []) {
        edges.push({
          callerId: `${filePath}:${owner}.${obj.name}`,
          calleeName: trait.name,
          calleeOwner: 'trait',
          filePath,
          line: trait.loc?.start.line ?? line,
          column: trait.loc?.start.column ?? column,
        });
      }

      for (const child of obj.children ?? []) {
        visitObject(child, `${owner}.${obj.name}`);
      }
    };

    for (const obj of ast.objects ?? []) {
      visitObject(obj, ast.name);
    }

    for (const group of ast.spatialGroups ?? []) {
      for (const obj of group.objects ?? []) {
        visitObject(obj, `${ast.name}.${group.name}`);
      }
      for (const nested of group.groups ?? []) {
        for (const obj of nested.objects ?? []) {
          visitObject(obj, `${ast.name}.${group.name}.${nested.name}`);
        }
      }
    }

    // Template trait attachments as calls from the template
    for (const tpl of ast.templates ?? []) {
      for (const trait of tpl.traits ?? []) {
        edges.push({
          callerId: `${filePath}:${ast.name}.${tpl.name}`,
          calleeName: trait.name,
          calleeOwner: 'trait',
          filePath,
          line: trait.loc?.start.line ?? tpl.loc?.start.line ?? 1,
          column: trait.loc?.start.column ?? 0,
        });
      }
    }

    return edges;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private collectObjectSymbols(
    obj: HoloObjectDeclLite,
    owner: string,
    filePath: string,
    out: ExternalSymbolDefinition[]
  ): void {
    out.push(
      this.makeSymbol({
        name: obj.name,
        type: 'orb',
        filePath,
        loc: obj.loc,
        signature: obj.template
          ? `object "${obj.name}" using "${obj.template}"`
          : `object "${obj.name}"`,
        owner,
        docComment: this.traitText(obj.traits),
      })
    );
    for (const child of obj.children ?? []) {
      this.collectObjectSymbols(child, `${owner}.${obj.name}`, filePath, out);
    }
  }

  private collectSpatialGroupSymbols(
    group: HoloSpatialGroupLite,
    owner: string,
    filePath: string,
    out: ExternalSymbolDefinition[]
  ): void {
    out.push(
      this.makeSymbol({
        name: group.name,
        type: 'namespace',
        filePath,
        loc: group.loc,
        signature: `spatial_group "${group.name}"`,
        owner,
      })
    );
    for (const obj of group.objects ?? []) {
      this.collectObjectSymbols(obj, `${owner}.${group.name}`, filePath, out);
    }
    for (const nested of group.groups ?? []) {
      this.collectSpatialGroupSymbols(nested, `${owner}.${group.name}`, filePath, out);
    }
  }

  private makeSymbol(opts: {
    name: string;
    type: ExtendedSymbolType;
    filePath: string;
    loc?: LocLite;
    signature?: string;
    owner?: string;
    isExported?: boolean;
    docComment?: string;
  }): ExternalSymbolDefinition {
    const line = opts.loc?.start.line ?? 1;
    const column = opts.loc?.start.column ?? 0;
    const endLine = opts.loc?.end.line ?? line;
    const endColumn = opts.loc?.end.column ?? column;
    const lineCount = Math.max(1, endLine - line + 1);
    return {
      name: opts.name,
      type: opts.type,
      language: 'holoscript',
      filePath: opts.filePath,
      line,
      column,
      endLine,
      endColumn,
      visibility: 'public',
      signature: opts.signature,
      owner: opts.owner,
      isExported: opts.isExported ?? false,
      docComment: opts.docComment,
      lineCount,
    };
  }

  /**
   * Collect human-meaningful string values from a node's trait configs
   * (e.g. `@label(text: "...")`, `@note(body: "...")`, `@description(...)`)
   * into a single text blob. This is the prose semantic search matches on —
   * without it, `.holo` symbols carry only structural names and become
   * indistinguishable to NL queries (the body text never reaches the embedder).
   */
  private traitText(traits: HoloObjectTraitLite[] | undefined): string | undefined {
    if (!traits || traits.length === 0) return undefined;
    const parts: string[] = [];
    for (const trait of traits) {
      const cfg = trait.config;
      if (!cfg) continue;
      for (const value of Object.values(cfg)) {
        if (typeof value === 'string' && value.trim().length > 0) {
          parts.push(value.trim());
        }
      }
    }
    return parts.length > 0 ? parts.join(' ') : undefined;
  }

  /**
   * Extract trait/brain/agent declarations from an hsplus AST as first-class symbols with their
   * REAL identifiers — the .holo composition parser flattened these to nameless `composition`
   * nodes (identifier dropped). Each top-level declaration -> a symbol whose signature carries
   * kind + capability_tags (the declarative semantics HoloEmbed/nomic match on); each `@on_*`
   * directive -> a handler symbol. Robust to partial parses (repo .hsplus often parse with errors).
   */
  private extractHsplusSymbols(ast: HsplusAstLite, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];
    const KIND_KEYWORDS = new Set([
      'trait', 'brain', 'agent', 'daemon', 'world', 'npc', 'object', 'composition', 'template',
    ]);
    const decls: HsplusNodeLite[] = [
      ...(ast.children ?? []),
      ...(ast.compositions ?? []),
      ...(ast.worlds ?? []),
      ...(ast.npcs ?? []),
    ];
    for (const node of decls) {
      const name = (node.type || node.name || '').trim();
      if (!name) continue;
      const directives = node.directives ?? [];
      // kind = the declaration keyword among directives (trait/brain/agent/...), else 'trait'
      const kind = directives.map((d) => d.name).find((n) => KIND_KEYWORDS.has(n)) ?? 'trait';
      const rawTags = (node.properties as Record<string, unknown> | undefined)?.capability_tags;
      const tags = Array.isArray(rawTags) ? rawTags.map(String) : [];
      symbols.push(
        this.makeSymbol({
          name,
          type: 'trait', // ExternalSymbolType has no brain/agent — real kind lives in the signature
          filePath,
          loc: node.loc,
          signature: `${kind} ${name}${tags.length ? ` [${tags.join(', ')}]` : ''}`,
          docComment: tags.length ? `capability_tags: ${tags.join(', ')}` : undefined,
          isExported: true,
        })
      );
      // @on_* directives -> handler symbols (on_spawn / on_grab / on_task / ...)
      for (const d of directives) {
        if (/^on_/.test(d.name)) {
          symbols.push(
            this.makeSymbol({
              name: `${name}.${d.name}`,
              type: 'method',
              filePath,
              loc: node.loc,
              owner: name,
              signature: `@${d.name} of ${kind} ${name}`,
              isExported: false,
            })
          );
        }
      }
    }
    return symbols;
  }

  /**
   * Extract symbols from a `.hs` (base logic) parse tree. Unlike `.hsplus`,
   * where a declaration's identifier lives in `node.type` (keyword in
   * `directives`), the HoloScriptPlus parser represents `.hs` logic
   * declarations the other way round: `node.type` is the KEYWORD
   * (`function` / `object` / …) and `node.name` is the identifier
   * (verified against the real `.hs` corpus — gcd.hs => function:gcd,
   * demo-cube.hs => object:Cube). So `.hs` gets its own extractor rather than
   * reusing `extractHsplusSymbols`, which would name a function `"function"`.
   * Top-level declarations only; nested-function / call / import edges are
   * slice 3.
   */
  private extractHsSymbols(ast: HsplusAstLite, filePath: string): ExternalSymbolDefinition[] {
    const symbols: ExternalSymbolDefinition[] = [];
    const decls: HsplusNodeLite[] = [
      ...(ast.children ?? []),
      ...(ast.compositions ?? []),
      ...(ast.worlds ?? []),
      ...(ast.npcs ?? []),
    ];
    for (const node of decls) {
      const name = (node.name || '').trim();
      if (!name) continue;
      const keyword = (node.type || '').trim();
      if (keyword === 'function') {
        symbols.push(
          this.makeSymbol({
            name,
            type: 'function',
            filePath,
            loc: node.loc,
            signature: `function ${name}`,
            isExported: true,
          })
        );
      } else if (keyword === 'object') {
        symbols.push(
          this.makeSymbol({
            name,
            type: 'orb', // matches the composition path's object typing
            filePath,
            loc: node.loc,
            signature: `object "${name}"`,
            isExported: true,
          })
        );
      } else {
        // Other logic-layer constructs — preserve the real keyword in the
        // signature (ExtendedSymbolType has no dedicated member for them).
        symbols.push(
          this.makeSymbol({
            name,
            type: 'trait',
            filePath,
            loc: node.loc,
            signature: keyword ? `${keyword} ${name}` : name,
            isExported: true,
          })
        );
      }
    }
    return symbols;
  }

  private async loadCore(): Promise<HoloCoreSurface | null> {
    if (this.coreRef) return this.coreRef;
    if (this.coreLoadAttempted) return null;
    this.coreLoadAttempted = true;

    try {
      const mod = (await import('@holoscript/core')) as unknown as {
        parseHoloPartial?: HoloCoreSurface['parseHoloPartial'];
        parse?: HoloCoreSurface['parseHsplus'];
        default?: {
          parseHoloPartial?: HoloCoreSurface['parseHoloPartial'];
          parse?: HoloCoreSurface['parseHsplus'];
        };
      };
      const parseHoloPartial = mod.parseHoloPartial ?? mod.default?.parseHoloPartial;
      if (typeof parseHoloPartial !== 'function') {
        this.coreLoadError = '@holoscript/core does not export parseHoloPartial';
        return null;
      }
      // The .hsplus (trait/brain) parser is core's `parse`. Optional — .hsplus falls back to
      // the composition parser (shallow) if absent, rather than hard-failing the whole adapter.
      const parseHsplus = mod.parse ?? mod.default?.parse;
      this.coreRef = { parseHoloPartial, parseHsplus: typeof parseHsplus === 'function' ? parseHsplus : undefined };
      return this.coreRef;
    } catch (err) {
      this.coreLoadError = err instanceof Error ? err.message : String(err);
      return null;
    }
  }

  /** True once a load attempt has been made AND it succeeded. */
  isReady(): boolean {
    return this.coreRef !== null;
  }

  /** Last failure message from attempting to load `@holoscript/core`, if any. */
  getLoadError(): string | null {
    return this.coreLoadError;
  }
}

/**
 * Type predicate: does this adapter bypass tree-sitter and parse natively?
 * Used by the scanner to route `.holo`/`.hsplus` through the HoloAdapter
 * directly rather than the tree-sitter `AdapterManager.parse()` path.
 */
export function isNativeAdapter(
  adapter: LanguageAdapter | null | undefined
): adapter is HoloAdapter {
  return !!adapter && (adapter as HoloAdapter).isNativeAdapter === true;
}
