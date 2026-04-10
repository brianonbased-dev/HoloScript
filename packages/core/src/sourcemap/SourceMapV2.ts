/**
 * Source Maps v2 - Enhanced source mapping for HoloScript
 *
 * Sprint 4 Priority 4: Source Maps v2
 *
 * Features:
 * - Scope information (functions, blocks, objects)
 * - Expression-level mappings
 * - Symbol resolution with scope context
 * - Breakpoint-friendly mapping
 * - Hot reload support for incremental updates
 * - Multi-target source maps
 * - Index maps for bundle splitting
 * - Debug name generation
 *
 * @version 2.0.0
 */

// Base64 VLQ encoding characters
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Position in source/generated code
 */
export interface Position {
  line: number;
  column: number;
}

/**
 * Range in source/generated code
 */
export interface Range {
  start: Position;
  end: Position;
}

/**
 * Scope types
 */
export type ScopeType =
  | 'file'
  | 'composition'
  | 'object'
  | 'template'
  | 'trait'
  | 'state'
  | 'logic'
  | 'handler'
  | 'function'
  | 'block'
  | 'loop'
  | 'conditional';

/**
 * Scope information for debug/IDE support
 */
export interface Scope {
  id: string;
  type: ScopeType;
  name: string;
  range: Range;
  parentId?: string;
  children: string[];
  symbols: ScopeSymbol[];
}

/**
 * Symbol within a scope
 */
export interface ScopeSymbol {
  name: string;
  type: 'variable' | 'property' | 'parameter' | 'function' | 'object' | 'trait';
  range: Range;
  definedAt: Position;
  references: Position[];
}

/**
 * Enhanced mapping segment with scope support
 */
export interface EnhancedMappingSegment {
  /** Generated position */
  generated: Position;
  /** Original position */
  original?: Position;
  /** Source file index */
  sourceIndex?: number;
  /** Name index */
  nameIndex?: number;
  /** Scope ID this mapping belongs to */
  scopeId?: string;
  /** Expression type for granular debugging */
  expressionType?: ExpressionType;
  /** Is this a breakpoint-eligible location */
  isBreakpoint?: boolean;
  /** Is this the start of a statement */
  isStatementStart?: boolean;
}

/**
 * Expression types for granular mapping
 */
export type ExpressionType =
  | 'literal'
  | 'identifier'
  | 'property-access'
  | 'call'
  | 'binary-op'
  | 'unary-op'
  | 'assignment'
  | 'object-literal'
  | 'array-literal'
  | 'spread'
  | 'trait-application'
  | 'state-access'
  | 'interpolation';

/**
 * Source Map v3 with extensions
 */
export interface SourceMapV2 {
  version: 3;
  file: string;
  sourceRoot?: string;
  sources: string[];
  sourcesContent?: (string | null)[];
  names: string[];
  mappings: string;
  /** Extension: Scope information */
  x_scopes?: Scope[];
  /** Extension: Expression types per mapping */
  x_expressionTypes?: ExpressionType[];
  /** Extension: Breakpoint locations */
  x_breakpoints?: Array<{ line: number; column: number }>;
  /** Extension: Debug names (mangled to original) */
  x_debugNames?: Record<string, string>;
}

/**
 * Index map for bundle splitting
 */
export interface IndexMap {
  version: 3;
  file: string;
  sections: Array<{
    offset: { line: number; column: number };
    url?: string;
    map?: SourceMapV2;
  }>;
}

/**
 * Mapping for hot reload tracking
 */
export interface HotReloadMapping {
  objectId: string;
  originalRange: Range;
  generatedRange: Range;
  hash: string;
  dependencies: string[];
}

/**
 * Source Map Generator V2
 */
export class SourceMapGeneratorV2 {
  private file: string;
  private sourceRoot: string;
  private sources: string[] = [];
  private sourcesContent: (string | null)[] = [];
  private names: string[] = [];
  private mappings: EnhancedMappingSegment[] = [];
  private scopes: Map<string, Scope> = new Map();
  private currentScopeStack: string[] = [];
  private breakpoints: Set<string> = new Set();
  private debugNames: Map<string, string> = new Map();
  private hotReloadMappings: Map<string, HotReloadMapping> = new Map();

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
   * Start a new scope
   */
  enterScope(options: { type: ScopeType; name: string; range: Range }): string {
    const id = `scope_${this.scopes.size}_${options.type}_${options.name}`;
    const parentId = this.currentScopeStack[this.currentScopeStack.length - 1];

    const scope: Scope = {
      id,
      type: options.type,
      name: options.name,
      range: options.range,
      parentId,
      children: [],
      symbols: [],
    };

    this.scopes.set(id, scope);

    // Add to parent's children
    if (parentId) {
      const parent = this.scopes.get(parentId);
      if (parent) {
        parent.children.push(id);
      }
    }

    this.currentScopeStack.push(id);
    return id;
  }

  /**
   * Exit current scope
   */
  exitScope(): void {
    this.currentScopeStack.pop();
  }

  /**
   * Add a symbol to current scope
   */
  addSymbol(symbol: Omit<ScopeSymbol, 'references'>): void {
    const scopeId = this.currentScopeStack[this.currentScopeStack.length - 1];
    if (!scopeId) return;

    const scope = this.scopes.get(scopeId);
    if (!scope) return;

    scope.symbols.push({
      ...symbol,
      references: [],
    });
  }

  /**
   * Add a symbol reference
   */
  addSymbolReference(name: string, position: Position): void {
    // Search scopes from innermost to outermost
    for (let i = this.currentScopeStack.length - 1; i >= 0; i--) {
      const scope = this.scopes.get(this.currentScopeStack[i]);
      if (!scope) continue;

      const symbol = scope.symbols.find((s) => s.name === name);
      if (symbol) {
        symbol.references.push(position);
        break;
      }
    }
  }

  /**
   * Add a mapping with enhanced information
   */
  addMapping(options: {
    generated: Position;
    original?: Position;
    source?: string;
    name?: string;
    expressionType?: ExpressionType;
    isBreakpoint?: boolean;
    isStatementStart?: boolean;
  }): void {
    const segment: EnhancedMappingSegment = {
      generated: options.generated,
      original: options.original,
      expressionType: options.expressionType,
      isBreakpoint: options.isBreakpoint,
      isStatementStart: options.isStatementStart,
      scopeId: this.currentScopeStack[this.currentScopeStack.length - 1],
    };

    if (options.original && options.source) {
      segment.sourceIndex = this.addSource(options.source);
      if (options.name) {
        segment.nameIndex = this.addName(options.name);
      }
    }

    this.mappings.push(segment);

    // Track breakpoint locations
    if (options.isBreakpoint && options.generated) {
      this.breakpoints.add(`${options.generated.line}:${options.generated.column}`);
    }
  }

  /**
   * Add debug name mapping (mangled to original)
   */
  addDebugName(mangledName: string, originalName: string): void {
    this.debugNames.set(mangledName, originalName);
  }

  /**
   * Add hot reload mapping for an object
   */
  addHotReloadMapping(mapping: HotReloadMapping): void {
    this.hotReloadMappings.set(mapping.objectId, mapping);
  }

  /**
   * Get hot reload mapping for an object
   */
  getHotReloadMapping(objectId: string): HotReloadMapping | undefined {
    return this.hotReloadMappings.get(objectId);
  }

  /**
   * Update hot reload mapping (after code change)
   */
  updateHotReloadMapping(objectId: string, newGeneratedRange: Range, newHash: string): void {
    const existing = this.hotReloadMappings.get(objectId);
    if (existing) {
      existing.generatedRange = newGeneratedRange;
      existing.hash = newHash;
    }
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
        digit |= 0x20;
      }
      encoded += BASE64_CHARS[digit];
    } while (vlq > 0);

    return encoded;
  }

  /**
   * Generate the mappings string (standard v3 format)
   */
  private generateMappingsString(): string {
    // Sort mappings by generated position
    const sortedMappings = [...this.mappings].sort((a, b) => {
      if (a.generated.line !== b.generated.line) {
        return a.generated.line - b.generated.line;
      }
      return a.generated.column - b.generated.column;
    });

    // Reset state
    this.lastSourceIndex = 0;
    this.lastOriginalLine = 0;
    this.lastOriginalColumn = 0;
    this.lastNameIndex = 0;

    const lines: string[][] = [];

    for (const segment of sortedMappings) {
      const line = segment.generated.line;

      // Ensure we have arrays up to this line
      while (lines.length <= line) {
        lines.push([]);
      }

      let encoded = '';

      // Generated column (delta from last segment in same line)
      const lastColumn =
        lines[line].length === 0
          ? 0
          : this.getLastGeneratedColumn(sortedMappings, line, lines[line].length);
      encoded += this.encodeVLQ(segment.generated.column - lastColumn);

      if (segment.sourceIndex !== undefined && segment.original) {
        // Source index (delta)
        encoded += this.encodeVLQ(segment.sourceIndex - this.lastSourceIndex);
        this.lastSourceIndex = segment.sourceIndex;

        // Original line (delta)
        encoded += this.encodeVLQ(segment.original.line - this.lastOriginalLine);
        this.lastOriginalLine = segment.original.line;

        // Original column (delta)
        encoded += this.encodeVLQ(segment.original.column - this.lastOriginalColumn);
        this.lastOriginalColumn = segment.original.column;

        // Name index (delta, optional)
        if (segment.nameIndex !== undefined) {
          encoded += this.encodeVLQ(segment.nameIndex - this.lastNameIndex);
          this.lastNameIndex = segment.nameIndex;
        }
      }

      lines[line].push(encoded);
    }

    return lines.map((segments) => segments.join(',')).join(';');
  }

  private getLastGeneratedColumn(
    mappings: EnhancedMappingSegment[],
    line: number,
    segmentIndex: number
  ): number {
    let lastColumn = 0;
    let count = 0;
    for (const m of mappings) {
      if (m.generated.line === line) {
        if (count >= segmentIndex) break;
        lastColumn = m.generated.column;
        count++;
      }
    }
    return lastColumn;
  }

  /**
   * Generate the source map
   */
  generate(): SourceMapV2 {
    const sourceMap: SourceMapV2 = {
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

    // Add scope information
    if (this.scopes.size > 0) {
      sourceMap.x_scopes = Array.from(this.scopes.values());
    }

    // Add expression types
    const expressionTypes = this.mappings
      .filter((m) => m.expressionType)
      .map((m) => m.expressionType!);
    if (expressionTypes.length > 0) {
      sourceMap.x_expressionTypes = expressionTypes;
    }

    // Add breakpoints
    if (this.breakpoints.size > 0) {
      sourceMap.x_breakpoints = Array.from(this.breakpoints).map((bp) => {
        const [line, column] = bp.split(':').map(Number);
        return { line, column };
      });
    }

    // Add debug names
    if (this.debugNames.size > 0) {
      sourceMap.x_debugNames = Object.fromEntries(this.debugNames);
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
   * Generate source map comment
   */
  toComment(mapFile?: string): string {
    if (mapFile) {
      return `//# sourceMappingURL=${mapFile}`;
    }
    return `//# sourceMappingURL=${this.toDataURL()}`;
  }

  /**
   * Get scope at position
   */
  getScopeAt(position: Position): Scope | null {
    for (const scope of this.scopes.values()) {
      if (this.isPositionInRange(position, scope.range)) {
        // Check children for more specific scope
        for (const childId of scope.children) {
          const child = this.scopes.get(childId);
          if (child && this.isPositionInRange(position, child.range)) {
            return this.getScopeAt(position) || child;
          }
        }
        return scope;
      }
    }
    return null;
  }

  private isPositionInRange(pos: Position, range: Range): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) {
      return false;
    }
    if (pos.line === range.start.line && pos.column < range.start.column) {
      return false;
    }
    if (pos.line === range.end.line && pos.column > range.end.column) {
      return false;
    }
    return true;
  }

  /**
   * Get all hot reload mappings
   */
  getHotReloadMappings(): Map<string, HotReloadMapping> {
    return new Map(this.hotReloadMappings);
  }

  /**
   * Clone for incremental updates
   */
  clone(): SourceMapGeneratorV2 {
    const cloned = new SourceMapGeneratorV2({
      file: this.file,
      sourceRoot: this.sourceRoot,
    });

    cloned.sources = [...this.sources];
    cloned.sourcesContent = [...this.sourcesContent];
    cloned.names = [...this.names];
    cloned.mappings = [...this.mappings];
    cloned.scopes = new Map(this.scopes);
    cloned.currentScopeStack = [...this.currentScopeStack];
    cloned.breakpoints = new Set(this.breakpoints);
    cloned.debugNames = new Map(this.debugNames);
    cloned.hotReloadMappings = new Map(this.hotReloadMappings);

    return cloned;
  }
}

/**
 * Enhanced Source Map Consumer
 */
export class SourceMapConsumerV2 {
  private sourceMap: SourceMapV2;
  private decodedMappings: Map<string, EnhancedMappingSegment> = new Map();
  private scopeIndex: Map<string, Scope> = new Map();

  constructor(sourceMap: SourceMapV2 | string) {
    this.sourceMap = typeof sourceMap === 'string' ? JSON.parse(sourceMap) : sourceMap;
    this.decodeMappings();
    this.indexScopes();
  }

  /**
   * Decode VLQ
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

    const negate = (result & 1) === 1;
    result >>>= 1;
    return negate ? -result : result;
  }

  /**
   * Decode all mappings
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

        const mapping: EnhancedMappingSegment = {
          generated: { line: generatedLine, column: generatedColumn },
        };

        if (index.value < segment.length) {
          lastSourceIndex += this.decodeVLQ(segment, index);
          lastOriginalLine += this.decodeVLQ(segment, index);
          lastOriginalColumn += this.decodeVLQ(segment, index);

          mapping.sourceIndex = lastSourceIndex;
          mapping.original = { line: lastOriginalLine, column: lastOriginalColumn };

          if (index.value < segment.length) {
            lastNameIndex += this.decodeVLQ(segment, index);
            mapping.nameIndex = lastNameIndex;
          }
        }

        const key = `${generatedLine}:${generatedColumn}`;
        this.decodedMappings.set(key, mapping);
      }
    }
  }

  /**
   * Index scopes for lookup
   */
  private indexScopes(): void {
    if (this.sourceMap.x_scopes) {
      for (const scope of this.sourceMap.x_scopes) {
        this.scopeIndex.set(scope.id, scope);
      }
    }
  }

  /**
   * Get original position for a generated position
   */
  originalPositionFor(position: Position): {
    source: string | null;
    line: number | null;
    column: number | null;
    name: string | null;
  } {
    const key = `${position.line}:${position.column}`;
    const mapping = this.decodedMappings.get(key);

    if (mapping?.original && mapping.sourceIndex !== undefined) {
      return {
        source: this.sourceMap.sources[mapping.sourceIndex],
        line: mapping.original.line,
        column: mapping.original.column,
        name: mapping.nameIndex !== undefined ? this.sourceMap.names[mapping.nameIndex] : null,
      };
    }

    // Find closest match
    return this.findClosestMapping(position);
  }

  /**
   * Find closest mapping for a position
   */
  private findClosestMapping(position: Position): {
    source: string | null;
    line: number | null;
    column: number | null;
    name: string | null;
  } {
    let bestMatch: EnhancedMappingSegment | null = null;
    let bestDistance = Infinity;

    for (const mapping of this.decodedMappings.values()) {
      if (mapping.generated.line === position.line) {
        const distance = Math.abs(mapping.generated.column - position.column);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestMatch = mapping;
        }
      }
    }

    if (bestMatch?.original && bestMatch.sourceIndex !== undefined) {
      return {
        source: this.sourceMap.sources[bestMatch.sourceIndex],
        line: bestMatch.original.line,
        column: bestMatch.original.column,
        name: bestMatch.nameIndex !== undefined ? this.sourceMap.names[bestMatch.nameIndex] : null,
      };
    }

    return { source: null, line: null, column: null, name: null };
  }

  /**
   * Get generated position for an original position
   */
  generatedPositionFor(options: { source: string; line: number; column: number }): Position | null {
    const sourceIndex = this.sourceMap.sources.indexOf(options.source);
    if (sourceIndex === -1) return null;

    for (const mapping of this.decodedMappings.values()) {
      if (
        mapping.sourceIndex === sourceIndex &&
        mapping.original?.line === options.line &&
        mapping.original?.column === options.column
      ) {
        return mapping.generated;
      }
    }

    return null;
  }

  /**
   * Get scope at generated position
   */
  getScopeAt(position: Position): Scope | null {
    const original = this.originalPositionFor(position);
    if (!original.source || original.line === null) return null;

    for (const scope of this.scopeIndex.values()) {
      if (
        this.isPositionInRange({ line: original.line, column: original.column ?? 0 }, scope.range)
      ) {
        return scope;
      }
    }

    return null;
  }

  /**
   * Get all breakpoint locations
   */
  getBreakpoints(): Position[] {
    return this.sourceMap.x_breakpoints ?? [];
  }

  /**
   * Get debug name for mangled name
   */
  getDebugName(mangledName: string): string | null {
    return this.sourceMap.x_debugNames?.[mangledName] ?? null;
  }

  /**
   * Get source content
   */
  sourceContentFor(source: string): string | null {
    const index = this.sourceMap.sources.indexOf(source);
    if (index === -1 || !this.sourceMap.sourcesContent) return null;
    return this.sourceMap.sourcesContent[index];
  }

  /**
   * Get all sources
   */
  get sources(): string[] {
    return [...this.sourceMap.sources];
  }

  /**
   * Get all scopes
   */
  get scopes(): Scope[] {
    return Array.from(this.scopeIndex.values());
  }

  private isPositionInRange(pos: Position, range: Range): boolean {
    if (pos.line < range.start.line || pos.line > range.end.line) {
      return false;
    }
    if (pos.line === range.start.line && pos.column < range.start.column) {
      return false;
    }
    if (pos.line === range.end.line && pos.column > range.end.column) {
      return false;
    }
    return true;
  }
}

/**
 * Create an index map for bundle splitting
 */
export function createIndexMap(
  file: string,
  sections: Array<{
    offset: Position;
    map: SourceMapV2;
  }>
): IndexMap {
  return {
    version: 3,
    file,
    sections: sections.map((section) => ({
      offset: section.offset,
      map: section.map,
    })),
  };
}

/**
 * Combine multiple source maps
 */
export function combineSourceMapsV2(maps: SourceMapV2[], outputFile: string): SourceMapV2 {
  const generator = new SourceMapGeneratorV2({ file: outputFile });
  let lineOffset = 0;

  for (const map of maps) {
    const consumer = new SourceMapConsumerV2(map);

    // Add sources
    for (const source of consumer.sources) {
      const content = consumer.sourceContentFor(source);
      generator.addSource(source, content ?? undefined);
    }

    // Re-map with offset
    for (const [_key, mapping] of (
      consumer as unknown as {
        decodedMappings: Map<
          unknown,
          {
            generated: { line: number; column: number };
            original?: { line: number; column: number };
            sourceIndex?: number;
            nameIndex?: number;
          }
        >;
      }
    ).decodedMappings) {
      if (mapping.original && mapping.sourceIndex !== undefined) {
        generator.addMapping({
          generated: {
            line: mapping.generated.line + lineOffset,
            column: mapping.generated.column,
          },
          original: mapping.original,
          source: map.sources[mapping.sourceIndex],
          name: mapping.nameIndex !== undefined ? map.names[mapping.nameIndex] : undefined,
        });
      }
    }

    // Calculate line offset from mappings
    const mappingLines = (map.mappings.match(/;/g) || []).length + 1;
    lineOffset += mappingLines;
  }

  return generator.generate();
}

/**
 * Factory function
 */
export function createSourceMapV2(options: {
  file: string;
  sourceRoot?: string;
}): SourceMapGeneratorV2 {
  return new SourceMapGeneratorV2(options);
}
