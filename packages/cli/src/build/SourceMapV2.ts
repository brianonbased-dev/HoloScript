/**
 * SourceMapV2
 *
 * Enhanced source map generation for HoloScript compiled output.
 * Implements v3 source map spec with:
 * - Column-level precision
 * - Variable name preservation
 * - Scope information
 * - Inline and external map options
 *
 * Reference: https://sourcemaps.info/spec.html
 */

export interface SourcePosition {
  /** Line (1-indexed) */
  line: number;
  /** Column (0-indexed) */
  column: number;
}

export interface GeneratedPosition {
  /** Line (1-indexed) */
  line: number;
  /** Column (0-indexed) */
  column: number;
}

export interface MappingEntry {
  /** Position in generated output */
  generated: GeneratedPosition;
  /** Position in original source */
  original: SourcePosition;
  /** Source file index */
  sourceIndex: number;
  /** Name index (-1 if no name mapping) */
  nameIndex: number;
}

export interface ScopeInfo {
  name: string;
  start: SourcePosition;
  end: SourcePosition;
}

export interface SourceMapV2Options {
  /** Source root prefix for source file paths */
  sourceRoot?: string;
  /** Whether to include source content inline */
  includeSourceContent?: boolean;
  /** Output file name for the map */
  file?: string;
}

export class SourceMapV2 {
  private sources: string[] = [];
  private sourcesContent: Map<string, string> = new Map();
  private names: string[] = [];
  private nameIndex: Map<string, number> = new Map();
  private mappings: MappingEntry[] = [];
  private scopes: ScopeInfo[] = [];
  private options: SourceMapV2Options;

  constructor(options: SourceMapV2Options = {}) {
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Source registration
  // ---------------------------------------------------------------------------

  /**
   * Register a source file. Returns its index.
   */
  addSource(path: string, content?: string): number {
    const existing = this.sources.indexOf(path);
    if (existing !== -1) return existing;

    const idx = this.sources.length;
    this.sources.push(path);
    if (content !== undefined) {
      this.sourcesContent.set(path, content);
    }
    return idx;
  }

  // ---------------------------------------------------------------------------
  // Name registration
  // ---------------------------------------------------------------------------

  /**
   * Register a variable/property name. Returns its index.
   */
  addName(name: string): number {
    const existing = this.nameIndex.get(name);
    if (existing !== undefined) return existing;

    const idx = this.names.length;
    this.names.push(name);
    this.nameIndex.set(name, idx);
    return idx;
  }

  // ---------------------------------------------------------------------------
  // Mapping
  // ---------------------------------------------------------------------------

  /**
   * Add a position mapping between generated output and original source.
   *
   * @param generated - Position in the generated JS output
   * @param original - Position in the .hsplus source
   * @param sourceIndex - Index from addSource()
   * @param name - Optional variable name (for name mapping)
   */
  addMapping(
    generated: GeneratedPosition,
    original: SourcePosition,
    sourceIndex: number,
    name?: string
  ): void {
    const nIdx = name !== undefined ? this.addName(name) : -1;
    this.mappings.push({ generated, original, sourceIndex, nameIndex: nIdx });
  }

  // ---------------------------------------------------------------------------
  // Scope information
  // ---------------------------------------------------------------------------

  /**
   * Record a named scope (e.g. an orb or composition block).
   */
  addScope(name: string, start: SourcePosition, end: SourcePosition): void {
    this.scopes.push({ name, start, end });
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /**
   * Generate the source map object conforming to the v3 spec.
   */
  toJSON(): object {
    const map: Record<string, unknown> = {
      version: 3,
      sources: this.sources.map((s) =>
        this.options.sourceRoot ? `${this.options.sourceRoot}/${s}` : s
      ),
      names: this.names,
      mappings: this.encodeMappings(),
    };

    if (this.options.file) {
      map['file'] = this.options.file;
    }

    if (this.options.sourceRoot) {
      map['sourceRoot'] = this.options.sourceRoot;
    }

    if (this.options.includeSourceContent && this.sourcesContent.size > 0) {
      map['sourcesContent'] = this.sources.map((s) => this.sourcesContent.get(s) ?? null);
    }

    // Extended fields for scope info
    if (this.scopes.length > 0) {
      map['x_scopes'] = this.scopes.map((s) => ({
        name: s.name,
        start: s.start,
        end: s.end,
      }));
    }

    return map;
  }

  /**
   * Serialize to JSON string.
   */
  toString(): string {
    return JSON.stringify(this.toJSON());
  }

  /**
   * Generate inline source map comment for appending to generated JS.
   */
  toInlineComment(): string {
    const encoded = Buffer.from(this.toString(), 'utf8').toString('base64');
    return `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${encoded}`;
  }

  /**
   * Generate external source map URL comment.
   */
  toExternalComment(mapFile: string): string {
    return `//# sourceMappingURL=${mapFile}`;
  }

  // ---------------------------------------------------------------------------
  // VLQ encoding (source map spec)
  // ---------------------------------------------------------------------------

  /**
   * Encode all mappings as a VLQ string.
   * Format: groups of generated lines separated by ';', segments by ','
   */
  private encodeMappings(): string {
    if (this.mappings.length === 0) return '';

    // Sort mappings by generated position
    const sorted = [...this.mappings].sort((a, b) => {
      if (a.generated.line !== b.generated.line) return a.generated.line - b.generated.line;
      return a.generated.column - b.generated.column;
    });

    const lines: string[][] = [];
    let prevSourceIndex = 0;
    let prevOrigLine = 0;
    let prevOrigCol = 0;
    let prevNameIdx = 0;
    let prevGenCol = 0;
    let currentLine = 1;

    for (const mapping of sorted) {
      // Fill empty lines
      while (currentLine < mapping.generated.line) {
        lines.push([]);
        currentLine++;
        prevGenCol = 0;
      }
      if (!lines[currentLine - 1]) {
        lines[currentLine - 1] = [];
      }

      const segment: number[] = [
        mapping.generated.column - prevGenCol,
        mapping.sourceIndex - prevSourceIndex,
        mapping.original.line - 1 - prevOrigLine,
        mapping.original.column - prevOrigCol,
      ];

      if (mapping.nameIndex >= 0) {
        segment.push(mapping.nameIndex - prevNameIdx);
        prevNameIdx = mapping.nameIndex;
      }

      prevGenCol = mapping.generated.column;
      prevSourceIndex = mapping.sourceIndex;
      prevOrigLine = mapping.original.line - 1;
      prevOrigCol = mapping.original.column;

      lines[currentLine - 1].push(segment.map(vlqEncode).join(''));
    }

    return lines.map((segs) => segs.join(',')).join(';');
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  get mappingCount(): number {
    return this.mappings.length;
  }

  get sourceCount(): number {
    return this.sources.length;
  }

  get nameCount(): number {
    return this.names.length;
  }
}

// ---------------------------------------------------------------------------
// VLQ encoding helpers (standard source map encoding)
// ---------------------------------------------------------------------------

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VLQ_BASE_SHIFT = 5;
const VLQ_BASE = 1 << VLQ_BASE_SHIFT; // 32
const VLQ_BASE_MASK = VLQ_BASE - 1; // 31
const VLQ_CONTINUATION_BIT = VLQ_BASE; // 32

/**
 * Encode a signed integer as a VLQ string (used in source maps).
 */
export function vlqEncode(value: number): string {
  let encoded = '';
  // Convert to sign-magnitude VLQ
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;

  do {
    let digit = vlq & VLQ_BASE_MASK;
    vlq >>>= VLQ_BASE_SHIFT;
    if (vlq > 0) {
      digit |= VLQ_CONTINUATION_BIT;
    }
    encoded += BASE64_CHARS[digit];
  } while (vlq > 0);

  return encoded;
}

/**
 * Decode a VLQ-encoded string back to an integer.
 */
export function vlqDecode(encoded: string): { value: number; rest: string } {
  let result = 0;
  let shift = 0;
  let i = 0;

  let continuation = true;
  while (continuation) {
    const char = encoded[i++];
    const digit = BASE64_CHARS.indexOf(char);
    if (digit === -1) throw new Error(`Invalid VLQ char: ${char}`);

    continuation = (digit & VLQ_CONTINUATION_BIT) !== 0;
    result += (digit & VLQ_BASE_MASK) << shift;
    shift += VLQ_BASE_SHIFT;
  }

  const value = result & 1 ? -(result >>> 1) : result >>> 1;
  return { value, rest: encoded.slice(i) };
}
