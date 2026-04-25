/**
 * HoloScript Source Map Generator
 *
 * Generates source maps (v3) for mapping compiled output back to original
 * .hsplus or .holo source files. Follows the Source Map v3 specification.
 *
 * @see https://sourcemaps.info/spec.html
 */

import { readJson } from './errors/safeJsonParse';

// Base64 VLQ encoding characters
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Source map v3 format
 */
export interface SourceMap {
  version: 3;
  file: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
}

/**
 * A single mapping segment
 */
export interface MappingSegment {
  /** Generated column (0-indexed) */
  generatedColumn: number;
  /** Source file index in sources array */
  sourceIndex?: number;
  /** Original line (0-indexed) */
  originalLine?: number;
  /** Original column (0-indexed) */
  originalColumn?: number;
  /** Names array index */
  nameIndex?: number;
}

/**
 * Mapping for one line of generated code
 */
export interface LineMapping {
  generatedLine: number;
  segments: MappingSegment[];
}

/**
 * Source Map Generator for HoloScript
 */
export class SourceMapGenerator {
  private file: string;
  private sourceRoot: string;
  private sources: string[] = [];
  private sourcesContent: (string | null)[] = [];
  private names: string[] = [];
  private mappings: LineMapping[] = [];

  // State for delta encoding
  private lastSourceIndex = 0;
  private lastOriginalLine = 0;
  private lastOriginalColumn = 0;
  private lastNameIndex = 0;

  constructor(options: { file: string; sourceRoot?: string }) {
    this.file = options.file;
    this.sourceRoot = options.sourceRoot || '';
  }

  /**
   * Add a source file
   */
  addSource(source: string, content?: string): number {
    const index = this.sources.indexOf(source);
    if (index !== -1) return index;

    this.sources.push(source);
    this.sourcesContent.push(content ?? null);
    return this.sources.length - 1;
  }

  /**
   * Add a name (identifier)
   */
  addName(name: string): number {
    const index = this.names.indexOf(name);
    if (index !== -1) return index;

    this.names.push(name);
    return this.names.length - 1;
  }

  /**
   * Add a mapping from generated code to original source
   */
  addMapping(options: {
    generated: { line: number; column: number };
    original?: { line: number; column: number };
    source?: string;
    name?: string;
  }): void {
    const { generated, original, source, name } = options;

    // Ensure we have line mappings up to this line
    while (this.mappings.length <= generated.line) {
      this.mappings.push({ generatedLine: this.mappings.length, segments: [] });
    }

    const segment: MappingSegment = {
      generatedColumn: generated.column,
    };

    if (original && source) {
      segment.sourceIndex = this.addSource(source);
      segment.originalLine = original.line;
      segment.originalColumn = original.column;

      if (name) {
        segment.nameIndex = this.addName(name);
      }
    }

    this.mappings[generated.line].segments.push(segment);
  }

  /**
   * Encode a number as Base64 VLQ
   */
  private encodeVLQ(value: number): string {
    let encoded = '';
    let vlq = value < 0 ? (-value << 1) + 1 : value << 1;

    do {
      let digit = vlq & 0x1f;
      vlq >>>= 5;
      if (vlq > 0) {
        digit |= 0x20; // continuation bit
      }
      encoded += BASE64_CHARS[digit];
    } while (vlq > 0);

    return encoded;
  }

  /**
   * Generate the mappings string
   */
  private generateMappingsString(): string {
    // Reset state for delta encoding
    this.lastSourceIndex = 0;
    this.lastOriginalLine = 0;
    this.lastOriginalColumn = 0;
    this.lastNameIndex = 0;

    const lines: string[] = [];

    for (const lineMapping of this.mappings) {
      // Sort segments by column
      const sortedSegments = [...lineMapping.segments].sort(
        (a, b) => a.generatedColumn - b.generatedColumn
      );

      const segmentStrings: string[] = [];
      let lastGeneratedColumn = 0;

      for (const segment of sortedSegments) {
        let encoded = '';

        // Generated column (delta from last segment in same line)
        encoded += this.encodeVLQ(segment.generatedColumn - lastGeneratedColumn);
        lastGeneratedColumn = segment.generatedColumn;

        if (segment.sourceIndex !== undefined) {
          // Source index (delta)
          encoded += this.encodeVLQ(segment.sourceIndex - this.lastSourceIndex);
          this.lastSourceIndex = segment.sourceIndex;

          // Original line (delta)
          encoded += this.encodeVLQ((segment.originalLine ?? 0) - this.lastOriginalLine);
          this.lastOriginalLine = segment.originalLine ?? 0;

          // Original column (delta)
          encoded += this.encodeVLQ((segment.originalColumn ?? 0) - this.lastOriginalColumn);
          this.lastOriginalColumn = segment.originalColumn ?? 0;

          // Name index (delta, optional)
          if (segment.nameIndex !== undefined) {
            encoded += this.encodeVLQ(segment.nameIndex - this.lastNameIndex);
            this.lastNameIndex = segment.nameIndex;
          }
        }

        segmentStrings.push(encoded);
      }

      lines.push(segmentStrings.join(','));
    }

    return lines.join(';');
  }

  /**
   * Generate the source map object
   */
  generate(): SourceMap {
    const sourceMap: SourceMap = {
      version: 3,
      file: this.file,
      sources: this.sources,
      names: this.names,
      mappings: this.generateMappingsString(),
    };

    if (this.sourceRoot) {
      sourceMap.sourceRoot = this.sourceRoot;
    }

    if (this.sourcesContent.some((c) => c !== null)) {
      sourceMap.sourcesContent = this.sourcesContent;
    }

    return sourceMap;
  }

  /**
   * Generate source map as JSON string
   */
  toString(): string {
    return JSON.stringify(this.generate());
  }

  /**
   * Generate inline source map (data URL)
   */
  toDataURL(): string {
    const base64 = Buffer.from(this.toString()).toString('base64');
    return `data:application/json;charset=utf-8;base64,${base64}`;
  }

  /**
   * Generate source map comment for appending to output
   */
  toComment(mapFile?: string): string {
    if (mapFile) {
      return `//# sourceMappingURL=${mapFile}`;
    }
    return `//# sourceMappingURL=${this.toDataURL()}`;
  }

  /**
   * v4.2: Add source map entries for a domain block (material, physics, etc.)
   * Maps each domain block to its original source location in the .holo file.
   */
  addDomainBlockMapping(options: {
    domain: string;
    blockName: string;
    source: string;
    originalLine: number;
    originalColumn: number;
    generatedLine: number;
    generatedColumn: number;
  }): void {
    this.addMapping({
      generated: { line: options.generatedLine, column: options.generatedColumn },
      original: { line: options.originalLine, column: options.originalColumn },
      source: options.source,
      name: `${options.domain}:${options.blockName}`,
    });
  }
}

/**
 * Consumer for reading and querying source maps
 */
export class SourceMapConsumer {
  private sourceMap: SourceMap;
  private decodedMappings: Map<
    string,
    { source: string; line: number; column: number; name?: string }
  > = new Map();

  constructor(sourceMap: SourceMap | string) {
    this.sourceMap = typeof sourceMap === 'string' ? (readJson(sourceMap) as SourceMap) : sourceMap;
    this.decodeMappings();
  }

  /**
   * Decode VLQ segment
   */
  private decodeVLQ(encoded: string, index: { value: number }): number {
    let result = 0;
    let shift = 0;
    let continuation = true;

    while (continuation && index.value < encoded.length) {
      const char = encoded[index.value++];
      const digit = BASE64_CHARS.indexOf(char);
      if (digit === -1) break;

      continuation = (digit & 0x20) !== 0;
      result += (digit & 0x1f) << shift;
      shift += 5;
    }

    // Convert from VLQ signed
    const negate = (result & 1) === 1;
    result >>>= 1;
    return negate ? -result : result;
  }

  /**
   * Decode all mappings from the source map
   */
  private decodeMappings(): void {
    const lines = this.sourceMap.mappings.split(';');

    let lastSourceIndex = 0;
    let lastOriginalLine = 0;
    let lastOriginalColumn = 0;
    let lastNameIndex = 0;

    for (let generatedLine = 0; generatedLine < lines.length; generatedLine++) {
      const line = lines[generatedLine];
      if (!line) continue;

      const segments = line.split(',');
      let generatedColumn = 0;

      for (const segment of segments) {
        if (!segment) continue;

        const index = { value: 0 };

        generatedColumn += this.decodeVLQ(segment, index);

        if (index.value < segment.length) {
          lastSourceIndex += this.decodeVLQ(segment, index);
          lastOriginalLine += this.decodeVLQ(segment, index);
          lastOriginalColumn += this.decodeVLQ(segment, index);

          let name: string | undefined;
          if (index.value < segment.length) {
            lastNameIndex += this.decodeVLQ(segment, index);
            name = this.sourceMap.names[lastNameIndex];
          }

          const key = `${generatedLine}:${generatedColumn}`;
          this.decodedMappings.set(key, {
            source: this.sourceMap.sources[lastSourceIndex],
            line: lastOriginalLine,
            column: lastOriginalColumn,
            name,
          });
        }
      }
    }
  }

  /**
   * Get original position for a generated position
   */
  originalPositionFor(position: { line: number; column: number }): {
    source: string | null;
    line: number | null;
    column: number | null;
    name: string | null;
  } {
    // Try exact match first
    const key = `${position.line}:${position.column}`;
    const mapping = this.decodedMappings.get(key);

    if (mapping) {
      return {
        source: mapping.source,
        line: mapping.line,
        column: mapping.column,
        name: mapping.name ?? null,
      };
    }

    // Find closest column on same line
    let bestMatch: { source: string; line: number; column: number; name?: string } | null = null;
    let bestDistance = Infinity;

    for (const [k, v] of this.decodedMappings) {
      const [line, col] = k.split(':').map(Number);
      if (line === position.line) {
        const distance = Math.abs(col - position.column);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = v;
        }
      }
    }

    if (bestMatch) {
      return {
        source: bestMatch.source,
        line: bestMatch.line,
        column: bestMatch.column,
        name: bestMatch.name ?? null,
      };
    }

    return { source: null, line: null, column: null, name: null };
  }

  /**
   * Get source content for a source file
   */
  sourceContentFor(source: string): string | null {
    const index = this.sourceMap.sources.indexOf(source);
    if (index === -1 || !this.sourceMap.sourcesContent) return null;
    return this.sourceMap.sourcesContent[index];
  }

  /**
   * Get all sources in the source map
   */
  get sources(): string[] {
    return [...this.sourceMap.sources];
  }
}

/**
 * Utility to combine multiple source maps
 */
export function combineSourceMaps(maps: SourceMap[], outputFile: string): SourceMap {
  const generator = new SourceMapGenerator({ file: outputFile });

  let _lineOffset = 0;
  for (const map of maps) {
    const consumer = new SourceMapConsumer(map);

    // Add sources from this map
    for (const source of consumer.sources) {
      const content = consumer.sourceContentFor(source);
      generator.addSource(source, content ?? undefined);
    }

    // Track line offsets for concatenated files
    // In a full implementation, we would decode each mapping,
    // add the lineOffset, and re-encode
    const mappingLines = (map.mappings.match(/;/g) || []).length + 1;
    _lineOffset += mappingLines;
  }

  return generator.generate();
}
