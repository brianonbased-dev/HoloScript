/**
 * ChunkDetector
 *
 * Scans HoloScript+ source code to identify top-level block boundaries
 * (orb, template, environment, logic, and global directives).
 *
 * Enhanced with HybridChunker integration for multi-strategy chunking.
 * Use HybridChunker for general-purpose file parsing across different file types.
 */

import { HybridChunker, createHybridChunker } from './HybridChunker';
import type { ChunkingOptions } from './HybridChunker';

export interface SourceChunk {
  id: string;
  type: 'orb' | 'template' | 'environment' | 'logic' | 'directive' | 'unknown';
  name?: string;
  startLine: number;
  endLine: number;
  content: string;
  tokens?: number;
  strategy?: 'structure' | 'fixed' | 'semantic';
  metadata?: Record<string, any>;
}

/** What {@link ChunkDetector.scan} finds: the chunks, and the top-level code no chunk covers. */
export interface ChunkScan {
  chunks: SourceChunk[];
  /**
   * 1-based lines of top-level code that no chunk kind covers: a composition, object, struct,
   * function or import, a stray brace, and so on. A reader that parses chunk by chunk and skips
   * these lines loses that code without a word, so it must not use the chunks alone.
   */
  uncoveredLines: number[];
}

/** Where a scan stands between lines: brace depth, an open string, an open block comment. */
interface ScanState {
  depth: number;
  quote: '"' | "'" | '`' | null;
  blockComment: boolean;
}

/**
 * Advance `state` over one line the way the `.hsplus` lexer reads it: a brace counts only outside
 * strings and comments, a string of any of the three quotes may run onto the next line, `//` ends
 * the line and `/* ... *\/` may span lines. Returns whether the line holds anything other than
 * whitespace and comments. Counting every `{` and `}` of a line, as this did before 2026-10-05,
 * closed `orb "A" {` early at `color: "}"` and turned a valid document into a parse error.
 */
function scanLine(line: string, state: ScanState): boolean {
  let code = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (state.blockComment) {
      if (char === '*' && line[i + 1] === '/') {
        state.blockComment = false;
        i++;
      }
      continue;
    }
    if (state.quote !== null) {
      code = true;
      if (char === '\\') i++;
      else if (char === state.quote) state.quote = null;
      continue;
    }
    if (char === '/' && line[i + 1] === '/') break;
    if (char === '/' && line[i + 1] === '*') {
      state.blockComment = true;
      i++;
      continue;
    }
    if (char === ' ' || char === '\t' || char === '\r' || char === '﻿') continue;
    code = true;
    if (char === '"' || char === "'" || char === '`') state.quote = char;
    else if (char === '{') state.depth++;
    else if (char === '}' && state.depth > 0) state.depth--;
  }
  return code;
}

/** The chunk a top-level line opens, or null when it opens none of the kinds this detector knows. */
function chunkStart(
  trimmed: string,
  line: number
): Pick<SourceChunk, 'type' | 'name' | 'id'> | null {
  // A quoted name keeps its spaces and any script ("My Lamp", "灯"); a bare one runs to a space,
  // brace or quote. Before 2026-10-05 both stopped at the first space or non-ASCII letter, so
  // "My Lamp" and "My Light" shared one id and the first block was replaced by the second.
  const orb = trimmed.match(/^orb\s+(?:"([^"]*)"|([^\s{"]+))/);
  if (orb) {
    const name = (orb[1] ?? orb[2]).replace(/#/g, '');
    return { type: 'orb', name, id: `orb:${name}` };
  }
  const template = trimmed.match(/^template\s+"([^"]+)"/);
  if (template) return { type: 'template', name: template[1], id: `template:${template[1]}` };
  if (trimmed.startsWith('environment')) return { type: 'environment', id: `environment:${line}` };
  if (trimmed.startsWith('logic')) return { type: 'logic', id: `logic:${line}` };
  if (trimmed.startsWith('@')) return { type: 'directive', id: `directive:${line}` };
  return null;
}

export class ChunkDetector {
  /**
   * Detects chunks in the source code based on top-level keywords. Top-level code of other
   * kinds is not in the result; use {@link ChunkDetector.scan} to see it.
   *
   * @deprecated Use detectHybrid() for better performance with multi-strategy chunking
   */
  static detect(source: string): SourceChunk[] {
    return ChunkDetector.scan(source).chunks;
  }

  /**
   * The chunks of `source` (orb, template, environment, logic and `@` directive blocks), and the
   * top-level lines of code that none of them covers. Braces are counted the way the lexer
   * reads them, on every line, so a line inside any block (a `@field` in a struct, say) never
   * starts a chunk of its own. A chunk id is unique in the document: a repeated one gets `#2`,
   * `#3` and so on.
   */
  static scan(source: string): ChunkScan {
    const lines = source.split(/\r?\n/);
    const chunks: SourceChunk[] = [];
    const uncoveredLines: number[] = [];
    const idCounts = new Map<string, number>();
    const state: ScanState = { depth: 0, quote: null, blockComment: false };
    let current: SourceChunk | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (current) {
        current.content += '\n' + line;
      } else if (state.depth === 0 && state.quote === null && !state.blockComment) {
        const trimmed = line.trim();
        const start = trimmed ? chunkStart(trimmed, i + 1) : null;
        if (start) {
          const seen = (idCounts.get(start.id) ?? 0) + 1;
          idCounts.set(start.id, seen);
          current = {
            ...start,
            id: seen === 1 ? start.id : `${start.id}#${seen}`,
            startLine: i + 1,
            endLine: i + 1,
            content: line,
          };
        }
      }

      const code = scanLine(line, state);
      if (current) {
        // Back at depth 0 and outside any string or comment: the chunk is finished.
        if (state.depth === 0 && state.quote === null && !state.blockComment) {
          current.endLine = i + 1;
          chunks.push(current);
          current = null;
        }
      } else if (code) {
        uncoveredLines.push(i + 1);
      }
    }

    // Handle any unclosed chunk at EOF
    if (current) {
      current.endLine = lines.length;
      chunks.push(current);
    }

    return { chunks, uncoveredLines };
  }

  /**
   * Detect chunks using HybridChunker (structure-based + semantic + fixed-size)
   *
   * Routes .hs/.hsplus files to structure-based chunking for better performance.
   * This method provides 20-30% better parsing speed by using AST-aware boundaries.
   *
   * @param source - Source code content
   * @param filePath - File path for type detection (defaults to .hsplus)
   * @param options - Chunking options
   */
  static detectHybrid(
    source: string,
    filePath: string = 'file.hsplus',
    options?: ChunkingOptions
  ): SourceChunk[] {
    const hybridChunker = createHybridChunker(options);
    const chunks = hybridChunker.chunk(source, filePath);

    // Convert HybridChunker format to ChunkDetector format
    return chunks.map((chunk) => ({
      id: chunk.id,
      type: this.mapChunkType(chunk.type),
      name: chunk.name,
      startLine: chunk.startLine,
      endLine: chunk.endLine,
      content: chunk.content,
      tokens: chunk.tokens,
      strategy: chunk.strategy,
      metadata: chunk.metadata,
    }));
  }

  /**
   * Map HybridChunker types to ChunkDetector types
   */
  private static mapChunkType(
    hybridType: string
  ): 'orb' | 'template' | 'environment' | 'logic' | 'directive' | 'unknown' {
    // Map code-block types to HoloScript constructs
    if (hybridType.includes('class')) return 'template';
    if (hybridType.includes('function')) return 'logic';
    return 'unknown';
  }
}
