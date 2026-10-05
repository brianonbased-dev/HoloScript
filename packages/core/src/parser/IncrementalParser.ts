/**
 * Chunk-Based Incremental Parser for HoloScript+
 *
 * Only re-parses changed portions of files rather than the entire document.
 * Uses chunk-based caching with hash detection and dependency tracking.
 *
 * Performance targets:
 * - Small edit in 1000-line file: <10ms (vs 100-150ms full parse)
 * - Cache hit rate: >90% for typical editing
 */

import { ChunkDetector, SourceChunk } from './ChunkDetector';
import { ParseCache, globalParseCache } from './ParseCache';
import { HoloScriptPlusParser } from './HoloScriptPlusParser';
import type { HsDocumentContext } from './hsplusRustTypeCheck';
import type { HSPlusNode } from './ParseCache';
/** An error in a chunk the parser refused, placed in the whole document (1-indexed lines). */
export interface IncrementalChunkError {
  chunkId: string;
  line: number;
  column: number;
  /** The parser's code (HSP001, HS-NAME-002, ...) when the error carries one. */
  code?: string;
  message: string;
}

export interface IncrementalParseResult {
  ast: HSPlusNode;
  cached: number; // Number of chunks loaded from cache
  parsed: number; // Number of chunks parsed fresh
  duration: number; // Parse time in ms
  changedChunks: string[];
  /**
   * The errors of every chunk refused this pass. A refused chunk is left out of `ast`; until
   * 2026-09-29 it vanished with no error, so a pass reported success without the block (a typed
   * function the checker refuses is one such chunk). runWatchMode in the CLI, which no command
   * calls today, would have printed "Built" for it.
   */
  errors: IncrementalChunkError[];
  /** The chunk each child of `ast` came from, in order; refused chunks are absent. */
  chunkIds: string[];
  /**
   * True when the document has top-level code that no chunk kind covers (a composition, object,
   * struct, function, import, ...). This pass then parsed the whole document as one chunk, the
   * same way a full parse does, instead of skipping that code: before 2026-10-05 it was skipped,
   * and 166 tracked files reported success while missing 1,207 blocks.
   */
  wholeDocument: boolean;
  /** The first such line, when `wholeDocument` is true. */
  firstUncoveredLine: number | null;
}

/** The id of the one chunk a pass uses when it parses the whole document. */
export const WHOLE_DOCUMENT_CHUNK_ID = 'document';

export class ChunkBasedIncrementalParser {
  private lastSource: string = '';
  private lastChunks: Map<string, SourceChunk> = new Map();
  private cache: ParseCache;
  private parser: HoloScriptPlusParser;

  constructor(cache: ParseCache = globalParseCache) {
    this.cache = cache;
    this.parser = new HoloScriptPlusParser({
      enableVRTraits: true,
      enableTypeScriptImports: true,
      strict: false,
    });
  }

  /**
   * Parse source with incremental caching
   */
  parse(source: string): IncrementalParseResult {
    const startTime = Date.now();
    let cached = 0;
    let parsed = 0;
    const changedChunks: string[] = [];
    const errors: IncrementalChunkError[] = [];

    // Step 1: Detect chunks in current source
    const { chunks: currentChunks, firstUncoveredLine } = this.detectChunks(source);
    const chunkMap = new Map(currentChunks.map((c) => [c.id, c]));

    // Step 2: Identify changed chunks by hash comparison
    const changedIds = this.identifyChangedChunks(currentChunks);
    changedChunks.push(...changedIds);

    // Step 3: Collect dependencies - chunks that reference changed ones
    const dependentIds = this.findDependents(changedIds, currentChunks);
    const toParseIds = new Set([...changedIds, ...dependentIds]);

    // Step 4: Parse changed chunks + dependents, use cache for others
    const chunkNodes: Map<string, HSPlusNode> = new Map();

    // A typed function is checked against what the whole document declares, so a chunk that
    // holds a function is parsed, and cached, under those declarations as well as its own text.
    // Collected once per pass, not once per chunk.
    const documentContext = /\bfunction\b/.test(source)
      ? this.parser.collectDocumentContext(source)
      : undefined;
    const contextKey = documentContext ? JSON.stringify(documentContext) : '';

    for (const chunk of currentChunks) {
      const hash = ParseCache.hash(
        contextKey && /\bfunction\b/.test(chunk.content)
          ? `${chunk.content}\u0000${contextKey}`
          : chunk.content
      );

      if (toParseIds.has(chunk.id)) {
        // Re-parse this chunk
        const { node: chunkNode, errors: chunkErrors } = this.parseChunk(chunk, documentContext);
        errors.push(...chunkErrors);
        if (chunkNode) {
          chunkNodes.set(chunk.id, chunkNode);
          this.cache.set(chunk.id, hash, chunkNode);
          parsed++;
        }
      } else {
        // Try to load from cache
        const cached_node = this.cache.get(chunk.id, hash);
        if (cached_node) {
          chunkNodes.set(chunk.id, cached_node);
          cached++;
        } else {
          // Cache miss - re-parse anyway. A refused chunk is never cached, so it is read, and
          // reported, again on every pass until it parses.
          const { node: chunkNode, errors: chunkErrors } = this.parseChunk(chunk, documentContext);
          errors.push(...chunkErrors);
          if (chunkNode) {
            chunkNodes.set(chunk.id, chunkNode);
            this.cache.set(chunk.id, hash, chunkNode);
            parsed++;
          }
        }
      }
    }

    // Step 5: Assemble final AST
    const { ast, chunkIds } = this.assembleAST(chunkNodes, currentChunks);

    // Step 6: Update state for next parse
    this.lastSource = source;
    this.lastChunks = chunkMap;

    const duration = Date.now() - startTime;

    return {
      ast,
      cached,
      parsed,
      duration,
      changedChunks,
      errors,
      chunkIds,
      wholeDocument: firstUncoveredLine !== null,
      firstUncoveredLine,
    };
  }

  /**
   * The chunks this pass parses. When top-level code falls outside every chunk kind the detector
   * knows, the whole document is the one chunk, so that code is parsed (and its errors reported)
   * rather than skipped, and no block is read out of the context that gives it meaning.
   */
  private detectChunks(source: string): {
    chunks: SourceChunk[];
    firstUncoveredLine: number | null;
  } {
    const { chunks, uncoveredLines } = ChunkDetector.scan(source);
    if (uncoveredLines.length === 0) return { chunks, firstUncoveredLine: null };
    return {
      chunks: [
        {
          id: WHOLE_DOCUMENT_CHUNK_ID,
          type: 'unknown',
          startLine: 1,
          endLine: source.split(/\r?\n/).length,
          content: source,
        },
      ],
      firstUncoveredLine: uncoveredLines[0],
    };
  }

  /**
   * Identifies which chunks have changed by comparing hashes
   */
  private identifyChangedChunks(currentChunks: SourceChunk[]): string[] {
    const changed: string[] = [];

    for (const chunk of currentChunks) {
      const hash = ParseCache.hash(chunk.content);
      const lastChunk = this.lastChunks.get(chunk.id);

      if (!lastChunk) {
        // New chunk added
        changed.push(chunk.id);
      } else {
        const lastHash = ParseCache.hash(lastChunk.content);
        if (hash !== lastHash) {
          // Content changed
          changed.push(chunk.id);
        }
      }
    }

    // Also mark chunks that were removed (their dependents may need re-parse). This compared the
    // previous source with itself, once per chunk, so it never found one and cost a full scan
    // per chunk on every pass.
    const currentIds = new Set(currentChunks.map((chunk) => chunk.id));
    for (const id of this.lastChunks.keys()) {
      if (!currentIds.has(id)) {
        // Chunk removed - its dependents are now orphaned
        changed.push(id);
      }
    }

    return changed;
  }

  /**
   * Finds chunks that depend on the changed ones
   */
  private findDependents(changedIds: string[], chunks: SourceChunk[]): string[] {
    const dependents = new Set<string>();
    const changeSet = new Set(changedIds);

    // Parse each chunk to extract references
    const references: Map<string, Set<string>> = new Map();

    for (const chunk of chunks) {
      const refs = this.extractReferences(chunk.content);
      if (refs.size > 0) {
        references.set(chunk.id, refs);
      }
    }

    // Find chunks that reference changed ones
    for (const [chunkId, refs] of references.entries()) {
      if (!changeSet.has(chunkId)) {
        for (const ref of refs) {
          if (changeSet.has(ref) || dependents.has(ref)) {
            dependents.add(chunkId);
            break;
          }
        }
      }
    }

    return Array.from(dependents);
  }

  /**
   * Extracts referenced identifiers from a chunk (templates, orbs, logic)
   */
  private extractReferences(content: string): Set<string> {
    const refs = new Set<string>();

    // Match template references: using "TemplateName"
    const templateRefs = content.match(/using\s+"([^"]+)"/g);
    if (templateRefs) {
      templateRefs.forEach((ref) => {
        const name = ref.match(/"([^"]+)"/)![1];
        refs.add(`template:${name}`);
      });
    }

    // Match identifier references in spread: ...name
    const spreadRefs = content.match(/\.\.\.\s*([a-zA-Z0-9_]+)/g);
    if (spreadRefs) {
      spreadRefs.forEach((ref) => {
        const name = ref.replace(/\.\.\./, '').trim();
        refs.add(`identifier:${name}`);
      });
    }

    // Match composition references
    const compRefs = content.match(/@composition\s+"([^"]+)"/g);
    if (compRefs) {
      compRefs.forEach((ref) => {
        const name = ref.match(/"([^"]+)"/)![1];
        refs.add(`composition:${name}`);
      });
    }

    return refs;
  }

  /**
   * Parses a single chunk. `documentContext` is what the whole document declares, so a typed
   * function in this chunk may call a function another chunk declares.
   */
  private parseChunk(
    chunk: SourceChunk,
    documentContext?: HsDocumentContext
  ): { node: HSPlusNode | null; errors: IncrementalChunkError[] } {
    // The chunk is parsed on its own, so its lines start at 1; the document's are further down.
    const offset = chunk.startLine - 1;
    try {
      // Wrap chunk content in a valid document if needed
      const content = this.wrapChunkForParsing(chunk);

      // Use the full parser on the chunk
      const result = this.parser.parse(content, { documentContext });

      if (result.success && result.ast) {
        return { node: result.ast as HSPlusNode, errors: [] };
      }

      // An error on line 0 has no position: it keeps none, as in a full parse, instead of taking
      // the chunk's offset (it read 4:0 for a chunk at line 5).
      const errors: IncrementalChunkError[] = (result.errors ?? []).map((error) => ({
        chunkId: chunk.id,
        line: error.line === 0 ? 0 : (error.line ?? 1) + offset,
        column: error.line === 0 ? (error.column ?? 0) : (error.column ?? 1),
        ...('code' in error && typeof error.code === 'string' ? { code: error.code } : {}),
        message: error.message,
      }));
      return {
        node: null,
        errors: errors.length
          ? errors
          : [
              {
                chunkId: chunk.id,
                code: 'HSP000',
                message: `chunk ${chunk.id} did not parse and gave no error`,
                line: chunk.startLine,
                column: 1,
              },
            ],
      };
    } catch (error) {
      // No parser error code fits a parser that threw; HSP000 marks it.
      return {
        node: null,
        errors: [
          {
            chunkId: chunk.id,
            code: 'HSP000',
            message: `the parser threw on chunk ${chunk.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
            line: chunk.startLine,
            column: 1,
          },
        ],
      };
    }
  }

  /**
   * Wraps chunk content to make it parseable in isolation
   */
  private wrapChunkForParsing(chunk: SourceChunk): string {
    // Most chunks are already valid at top-level
    // Just return as-is; parser handles directives, orbs, templates
    return chunk.content;
  }

  /**
   * Assembles final AST from parsed chunks
   */
  private assembleAST(
    chunkNodes: Map<string, HSPlusNode>,
    chunks: SourceChunk[]
  ): { ast: HSPlusNode; chunkIds: string[] } {
    // Create fragment node containing all chunks
    const children: HSPlusNode[] = [];
    const chunkIds: string[] = [];

    for (const chunk of chunks) {
      const node = chunkNodes.get(chunk.id);
      if (node) {
        children.push(node);
        chunkIds.push(chunk.id);
      }
    }

    // Return fragment or single node
    if (children.length === 1) {
      return { ast: children[0], chunkIds };
    }

    return {
      ast: {
        type: 'fragment',
        children,
        properties: {},
        directives: [],
        traits: new Map(),
        loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      } as unknown as HSPlusNode,
      chunkIds,
    };
  }

  /**
   * Clears the internal cache
   */
  clearCache(): void {
    this.cache.clear();
    this.lastChunks.clear();
  }

  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.lastChunks.size,
      maxSize: 500,
    };
  }
}

/**
 * Convenience function for one-off chunk-based incremental parsing
 */
export function parseIncrementalChunks(
  source: string,
  cache: ParseCache = globalParseCache
): IncrementalParseResult {
  const parser = new ChunkBasedIncrementalParser(cache);
  return parser.parse(source);
}
