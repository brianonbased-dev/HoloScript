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
import type { HSPlusNode } from './ParseCache';

export interface IncrementalParseResult {
  ast: HSPlusNode;
  cached: number; // Number of chunks loaded from cache
  parsed: number; // Number of chunks parsed fresh
  duration: number; // Parse time in ms
  changedChunks: string[];
}

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

    // Step 1: Detect chunks in current source
    const currentChunks = this.detectChunks(source);
    const chunkMap = new Map(currentChunks.map((c) => [c.id, c]));

    // Step 2: Identify changed chunks by hash comparison
    const changedIds = this.identifyChangedChunks(currentChunks);
    changedChunks.push(...changedIds);

    // Step 3: Collect dependencies - chunks that reference changed ones
    const dependentIds = this.findDependents(changedIds, currentChunks);
    const toParseIds = new Set([...changedIds, ...dependentIds]);

    // Step 4: Parse changed chunks + dependents, use cache for others
    const chunkNodes: Map<string, HSPlusNode> = new Map();

    for (const chunk of currentChunks) {
      const hash = ParseCache.hash(chunk.content);

      if (toParseIds.has(chunk.id)) {
        // Re-parse this chunk
        const chunkNode = this.parseChunk(chunk);
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
          // Cache miss - re-parse anyway
          const chunkNode = this.parseChunk(chunk);
          if (chunkNode) {
            chunkNodes.set(chunk.id, chunkNode);
            this.cache.set(chunk.id, hash, chunkNode);
            parsed++;
          }
        }
      }
    }

    // Step 5: Assemble final AST
    const ast = this.assembleAST(chunkNodes, currentChunks);

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
    };
  }

  /**
   * Detects top-level chunks in the source
   */
  private detectChunks(source: string): SourceChunk[] {
    return ChunkDetector.detect(source);
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

    // Also mark chunks that were removed (their dependents may need re-parse)
    for (const [id, _lastChunk] of this.lastChunks.entries()) {
      const currentChunk = this.detectChunks(this.lastSource).find((c) => c.id === id);
      if (!currentChunk) {
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
   * Parses a single chunk
   */
  private parseChunk(chunk: SourceChunk): HSPlusNode | null {
    try {
      // Wrap chunk content in a valid document if needed
      const content = this.wrapChunkForParsing(chunk);

      // Use the full parser on the chunk
      const result = this.parser.parse(content);

      if (result.success && result.ast) {
        return result.ast as HSPlusNode;
      }

      return null;
    } catch (error) {
      console.warn(`Failed to parse chunk ${chunk.id}:`, error);
      return null;
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
  private assembleAST(chunkNodes: Map<string, HSPlusNode>, chunks: SourceChunk[]): HSPlusNode {
    // Create fragment node containing all chunks
    const children: HSPlusNode[] = [];

    for (const chunk of chunks) {
      const node = chunkNodes.get(chunk.id);
      if (node) {
        children.push(node);
      }
    }

    // Return fragment or single node
    if (children.length === 1) {
      return children[0];
    }

    return {
      type: 'fragment',
      children,
      properties: {},
      directives: [],
      traits: new Map(),
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
    } as any;
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
