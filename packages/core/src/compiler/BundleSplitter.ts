import type { ASTProgram, HSPlusNode } from '../types';

export interface BundleChunk {
  id: string;
  files: string[];
  entryPoint?: string;
  isDynamic: boolean;
  parentChunkId?: string;
  size?: number;
}

export interface SplitPoint {
  nodeId: string;
  line: number;
  sourceFile: string;
  targetModule: string;
  type: 'dynamic_import' | 'conditional_branch' | 'route';
}

/**
 * Analyzes AST to identify potential bundle split points.
 */
export class BundleSplitter {
  private chunks: Map<string, BundleChunk> = new Map();
  private splitPoints: SplitPoint[] = [];

  constructor() {
    // specific config if needed
  }

  /**
   * Analyze the program AST to find dynamic imports and split points.
   */
  public analyze(ast: ASTProgram): SplitPoint[] {
    this.splitPoints = [];
    this.traverse(ast.root as HSPlusNode);
    return this.splitPoints;
  }

  private traverse(node: HSPlusNode) {
    // 1. Check for dynamic imports in `logic` blocks
    if (node.type === 'logic' && node.body) {
      const body = node.body as Record<string, unknown>;

      const functions = body.functions as Array<{ name: string; body?: string }> | undefined;
      if (functions) {
        for (const func of functions) {
          if (func.body) this.scanStringForImports(func.body, `func_${func.name}`);
        }
      }

      const eventHandlers = body.eventHandlers as
        | Array<{ event: string; body?: string }>
        | undefined;
      if (eventHandlers) {
        for (const handler of eventHandlers) {
          if (handler.body) this.scanStringForImports(handler.body, `event_${handler.event}`);
        }
      }

      const tickHandlers = body.tickHandlers as
        | Array<{ interval: string; body?: string }>
        | undefined;
      if (tickHandlers) {
        for (const handler of tickHandlers) {
          if (handler.body) this.scanStringForImports(handler.body, `tick_${handler.interval}`);
        }
      }
    }

    // 3. Fallback: Check for CallExpression nodes if parser supports them
    if (this.isDynamicImport(node)) {
      const target = this.extractImportPath(node);
      if (target) {
        this.splitPoints.push({
          nodeId: node.id || 'unknown',
          line: node.loc?.start.line || 0,
          sourceFile: 'unknown',
          targetModule: target,
          type: 'dynamic_import',
        });
      }
    }

    if (node.children) {
      for (const child of node.children) {
        this.traverse(child);
      }
    }
  }

  private scanStringForImports(code: string, contextId: string) {
    // Regex matches import(...) with or without quotes
    // Matches: import("mod"), import('mod'), import(mod), import ( mod )
    const importRegex = /import\s*\(\s*(?:['"]?)([^)'"]+)(?:['"]?)\s*\)/g;
    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const target = match[1].trim();
      this.splitPoints.push({
        nodeId: contextId,
        line: 0,
        sourceFile: 'unknown',
        targetModule: target,
        type: 'dynamic_import',
      });
    }
  }

  private isDynamicImport(node: HSPlusNode): boolean {
    // This logic depends on how the parser represents dynamic imports.
    // Often it's a CallExpression with callee.name === 'import'
    // Or a specific node type.
    if (
      node.type === 'call_expression' &&
      (node as unknown as Record<string, unknown>).callee === 'import'
    ) {
      return true;
    }
    // As per HoloScript AST, checking if we have a specific node for this
    return false;
  }

  private extractImportPath(node: HSPlusNode): string | null {
    const args = node.arguments;
    const source = (node as unknown as Record<string, unknown>).source;

    // 1. Property access pattern: node.source?.value (e.g. ESTree-style ImportExpression)
    if (source != null) {
      if (typeof source === 'string') return source;
      // @ts-expect-error During migration
      if (typeof source.value === 'string') return source.value;
    }

    // No arguments array to inspect
    if (!Array.isArray(args) || args.length === 0) return null;

    const firstArg = args[0];

    // 2. The argument is already a plain string (raw path)
    if (typeof firstArg === 'string') return firstArg;

    // 3. String literal AST node: { type: 'string_literal' | 'StringLiteral' | 'Literal', value: "..." }
    if (firstArg != null && typeof firstArg === 'object') {
      // Direct value property (most common)
      // @ts-expect-error During migration
      if (typeof firstArg.value === 'string') return firstArg.value;

      // Template literal with no expressions (static template): `./path`
      if (
        // @ts-expect-error During migration
        (firstArg.type === 'template_literal' || firstArg.type === 'TemplateLiteral') &&
        // @ts-expect-error During migration
        Array.isArray(firstArg.quasis) &&
        // @ts-expect-error During migration
        firstArg.quasis.length === 1 &&
        // @ts-expect-error During migration
        (!Array.isArray(firstArg.expressions) || firstArg.expressions.length === 0)
      ) {
        // @ts-expect-error During migration
        const quasi = firstArg.quasis[0];
        // Template element value can be stored in .value.cooked, .value.raw, or .cooked/.raw
        if (typeof quasi === 'string') return quasi;
        if (quasi != null && typeof quasi === 'object') {
          if (typeof quasi.value === 'string') return quasi.value;
          if (quasi.value != null && typeof quasi.value === 'object') {
            if (typeof quasi.value.cooked === 'string') return quasi.value.cooked;
            if (typeof quasi.value.raw === 'string') return quasi.value.raw;
          }
          if (typeof quasi.cooked === 'string') return quasi.cooked;
          if (typeof quasi.raw === 'string') return quasi.raw;
        }
      }

      // Fallback: raw property (some AST formats)
      // @ts-expect-error During migration
      if (typeof firstArg.raw === 'string') {
        // Strip surrounding quotes if present
        // @ts-expect-error During migration
        const raw = firstArg.raw;
        if (
          (raw.startsWith('"') && raw.endsWith('"')) ||
          (raw.startsWith("'") && raw.endsWith("'"))
        ) {
          return raw.slice(1, -1);
        }
        return raw;
      }
    }

    return null;
  }

  /**
   * Generates a manifest of chunks based on identified split points.
   */
  public generateManifest(): BundleChunk[] {
    // Create main chunk for non-dynamic code
    const mainChunk: BundleChunk = {
      id: 'main',
      files: [],
      entryPoint: 'index.holo',
      isDynamic: false,
    };
    this.chunks.set('main', mainChunk);

    // Group split points by target module to create dynamic chunks
    const moduleToSplitPoints = new Map<string, SplitPoint[]>();

    for (const sp of this.splitPoints) {
      const existing = moduleToSplitPoints.get(sp.targetModule);
      if (existing) {
        existing.push(sp);
      } else {
        moduleToSplitPoints.set(sp.targetModule, [sp]);
      }
    }

    // Create a chunk for each unique dynamically imported module
    let chunkIndex = 0;
    for (const [modulePath, points] of moduleToSplitPoints) {
      const chunkId = `chunk_${chunkIndex++}`;
      const chunk: BundleChunk = {
        id: chunkId,
        files: [modulePath],
        isDynamic: true,
        parentChunkId: 'main',
        size: 0, // Would be calculated during actual bundling
      };
      this.chunks.set(chunkId, chunk);

      // Track which files reference this chunk
      for (const sp of points) {
        if (sp.sourceFile && sp.sourceFile !== 'unknown') {
          // Add source file to main chunk if not already tracked
          if (!mainChunk.files.includes(sp.sourceFile)) {
            mainChunk.files.push(sp.sourceFile);
          }
        }
      }
    }

    return Array.from(this.chunks.values());
  }

  /**
   * Get split points (for debugging/analysis)
   */
  public getSplitPoints(): SplitPoint[] {
    return this.splitPoints;
  }

  /**
   * Clear all chunks and split points (for reanalysis)
   */
  public clear(): void {
    this.chunks.clear();
    this.splitPoints = [];
  }
}
