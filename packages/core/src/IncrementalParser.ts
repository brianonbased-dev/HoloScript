/**
 * HoloScript Incremental Parser
 *
 * Provides incremental parsing that only re-parses changed sections
 * of the code, dramatically improving performance for large files.
 *
 * Uses a block-based caching strategy where unchanged blocks are reused.
 */

import { HoloScriptCodeParser, type ParseResult, type ParseError } from './HoloScriptCodeParser';
import type { ASTNode } from './types';

/**
 * Hash function for content comparison (FNV-1a)
 */
function fnv1aHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}

/**
 * A cached block of parsed code
 */
interface CachedBlock {
  /** Hash of the source text */
  hash: number;
  /** Start line in source (0-indexed) */
  startLine: number;
  /** End line in source (0-indexed, exclusive) */
  endLine: number;
  /** Parsed AST nodes for this block */
  nodes: ASTNode[];
  /** Any errors in this block */
  errors: ParseError[];
  /** Source text for this block */
  sourceText: string;
}

/**
 * Document state for incremental parsing
 */
interface DocumentState {
  /** Full source text */
  source: string;
  /** Lines of source */
  lines: string[];
  /** Cached blocks */
  blocks: CachedBlock[];
  /** Last parse result */
  lastResult: ParseResult;
  /** Version number */
  version: number;
}

/**
 * Incremental Parser for HoloScript
 *
 * Caches parsed blocks and only re-parses changed sections.
 */
export class IncrementalParser {
  private parser: HoloScriptCodeParser;
  private documents: Map<string, DocumentState> = new Map();
  private blockSize = 20; // Lines per block

  constructor(options?: { blockSize?: number }) {
    this.parser = new HoloScriptCodeParser();
    if (options?.blockSize) {
      this.blockSize = options.blockSize;
    }
  }

  /**
   * Parse a document (full parse on first call, incremental after)
   */
  parse(uri: string, source: string, version: number): ParseResult {
    const existing = this.documents.get(uri);

    if (!existing) {
      // First parse - full parse
      return this.fullParse(uri, source, version);
    }

    if (existing.version >= version) {
      // Already up to date
      return existing.lastResult;
    }

    // Incremental parse
    return this.incrementalParse(uri, source, version, existing);
  }

  /**
   * Full parse of a document
   */
  private fullParse(uri: string, source: string, version: number): ParseResult {
    const result = this.parser.parse(source);
    const lines = source.split('\n');

    // Create cached blocks
    const blocks: CachedBlock[] = [];
    for (let i = 0; i < lines.length; i += this.blockSize) {
      const startLine = i;
      const endLine = Math.min(i + this.blockSize, lines.length);
      const blockLines = lines.slice(startLine, endLine);
      const blockSource = blockLines.join('\n');

      // Find nodes that belong to this block
      const blockNodes = this.getNodesInRange(result.ast, startLine, endLine);
      const blockErrors = result.errors.filter((e) => e.line >= startLine && e.line < endLine);

      blocks.push({
        hash: fnv1aHash(blockSource),
        startLine,
        endLine,
        nodes: blockNodes,
        errors: blockErrors,
        sourceText: blockSource,
      });
    }

    const state: DocumentState = {
      source,
      lines,
      blocks,
      lastResult: result,
      version,
    };

    this.documents.set(uri, state);
    return result;
  }

  /**
   * Incremental parse - only re-parse changed blocks
   */
  private incrementalParse(
    uri: string,
    source: string,
    version: number,
    existing: DocumentState
  ): ParseResult {
    const newLines = source.split('\n');
    const changedBlocks: number[] = [];
    const unchangedNodes: ASTNode[] = [];
    const unchangedErrors: ParseError[] = [];

    // Determine which blocks changed
    for (let blockIndex = 0; blockIndex < existing.blocks.length; blockIndex++) {
      const block = existing.blocks[blockIndex];
      const newStartLine = block.startLine;
      const newEndLine = Math.min(block.startLine + this.blockSize, newLines.length);

      if (newEndLine <= newStartLine) {
        // Block is beyond new document length
        changedBlocks.push(blockIndex);
        continue;
      }

      const newBlockLines = newLines.slice(newStartLine, newEndLine);
      const newBlockSource = newBlockLines.join('\n');
      const newHash = fnv1aHash(newBlockSource);

      if (newHash !== block.hash) {
        changedBlocks.push(blockIndex);
      } else {
        // Reuse cached nodes and errors
        unchangedNodes.push(...block.nodes);
        unchangedErrors.push(...block.errors);
      }
    }

    // Check if new lines were added beyond existing blocks
    const maxExistingLine =
      existing.blocks.length > 0 ? existing.blocks[existing.blocks.length - 1].endLine : 0;

    const hasNewLines = newLines.length > maxExistingLine;

    // If no changes, return cached result
    if (changedBlocks.length === 0 && !hasNewLines) {
      return existing.lastResult;
    }

    // Re-parse changed blocks
    const newBlocks: CachedBlock[] = [];
    const allNodes: ASTNode[] = [];
    const allErrors: ParseError[] = [];

    for (let i = 0; i < Math.ceil(newLines.length / this.blockSize); i++) {
      const startLine = i * this.blockSize;
      const endLine = Math.min(startLine + this.blockSize, newLines.length);
      const blockLines = newLines.slice(startLine, endLine);
      const blockSource = blockLines.join('\n');
      const newHash = fnv1aHash(blockSource);

      // Check if we have a cached block with same hash
      const existingBlock = existing.blocks.find((b) => b.hash === newHash);

      if (existingBlock && !changedBlocks.includes(existing.blocks.indexOf(existingBlock))) {
        // Reuse cached block (adjusting line numbers if needed)
        const adjustedNodes = this.adjustNodeLines(
          existingBlock.nodes,
          startLine - existingBlock.startLine
        );
        const adjustedErrors = existingBlock.errors.map((e) => ({
          ...e,
          line: e.line + (startLine - existingBlock.startLine),
        }));

        newBlocks.push({
          hash: newHash,
          startLine,
          endLine,
          nodes: adjustedNodes,
          errors: adjustedErrors,
          sourceText: blockSource,
        });

        allNodes.push(...adjustedNodes);
        allErrors.push(...adjustedErrors);
      } else {
        // Parse this block
        const blockResult = this.parser.parse(blockSource);

        // Adjust line numbers to be relative to full document
        const adjustedNodes = this.adjustNodeLines(blockResult.ast, startLine);
        const adjustedErrors = blockResult.errors.map((e) => ({
          ...e,
          line: e.line + startLine,
        }));

        newBlocks.push({
          hash: newHash,
          startLine,
          endLine,
          nodes: adjustedNodes,
          errors: adjustedErrors,
          sourceText: blockSource,
        });

        allNodes.push(...adjustedNodes);
        allErrors.push(...adjustedErrors);
      }
    }

    const result: ParseResult = {
      success: allErrors.length === 0,
      ast: allNodes,
      errors: allErrors,
      warnings: [],
    };

    // Update state
    const state: DocumentState = {
      source,
      lines: newLines,
      blocks: newBlocks,
      lastResult: result,
      version,
    };

    this.documents.set(uri, state);
    return result;
  }

  /**
   * Get nodes that fall within a line range
   */
  private getNodesInRange(nodes: ASTNode[], startLine: number, endLine: number): ASTNode[] {
    // For now, return all nodes - proper implementation would track line info in AST
    return nodes.filter((node) => {
      const pos = node.position as { line?: number } | undefined;
      if (pos?.line !== undefined) {
        return pos.line >= startLine && pos.line < endLine;
      }
      return true;
    });
  }

  /**
   * Adjust line numbers in nodes by an offset
   */
  private adjustNodeLines(nodes: ASTNode[], offset: number): ASTNode[] {
    if (offset === 0) return nodes;
    return nodes.map((node) => {
      // Check if node has position with line property (from block tracking)
      const nodeAny = node as unknown as { position?: { line?: number } };
      if (nodeAny.position && typeof nodeAny.position.line === 'number') {
        const newNode = { ...node } as unknown as { position: { line: number } };
        newNode.position = { ...nodeAny.position, line: nodeAny.position.line + offset };
        return newNode as unknown as ASTNode;
      }
      return node;
    });
  }

  /**
   * Apply a text change incrementally
   */
  applyChange(
    uri: string,
    change: {
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
      text: string;
    },
    version: number
  ): ParseResult {
    const existing = this.documents.get(uri);
    if (!existing) {
      // No cached document - can't apply change incrementally
      throw new Error(`No cached document for ${uri}`);
    }

    // Apply the change to get new source
    const lines = [...existing.lines];
    const { start, end } = change.range;

    if (start.line === end.line) {
      // Single line change
      const line = lines[start.line] || '';
      lines[start.line] =
        line.substring(0, start.character) + change.text + line.substring(end.character);
    } else {
      // Multi-line change
      const startLine = lines[start.line] || '';
      const endLine = lines[end.line] || '';
      const newContent =
        startLine.substring(0, start.character) + change.text + endLine.substring(end.character);
      const newLines = newContent.split('\n');
      lines.splice(start.line, end.line - start.line + 1, ...newLines);
    }

    const newSource = lines.join('\n');
    return this.parse(uri, newSource, version);
  }

  /**
   * Invalidate cache for a document
   */
  invalidate(uri: string): void {
    this.documents.delete(uri);
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this.documents.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    documentCount: number;
    totalBlocks: number;
    memoryEstimate: number;
  } {
    let totalBlocks = 0;
    let memoryEstimate = 0;

    for (const [, state] of this.documents) {
      totalBlocks += state.blocks.length;
      memoryEstimate += state.source.length * 2; // Rough estimate: 2 bytes per char
      memoryEstimate += JSON.stringify(state.blocks).length;
    }

    return {
      documentCount: this.documents.size,
      totalBlocks,
      memoryEstimate,
    };
  }
}

/**
 * Create an incremental parser instance
 */
export function createIncrementalParser(options?: { blockSize?: number }): IncrementalParser {
  return new IncrementalParser(options);
}
