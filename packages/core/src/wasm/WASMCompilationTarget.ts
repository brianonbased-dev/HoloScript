/**
 * WASMCompilationTarget — Compile tree-sitter-holoscript grammar to WASM
 *
 * TODO-029: WASM Compilation Target
 *
 * Architecture:
 *   Wraps the tree-sitter-holoscript grammar compilation process to produce
 *   a WASM binary suitable for browser-based parsing. Handles Emscripten
 *   configuration, WASM memory management, and async initialization.
 *
 * Features:
 * - Emscripten build configuration for tree-sitter grammar
 * - WASM memory management with configurable limits
 * - Async initialization with ready-state tracking
 * - Parser pool for concurrent parsing
 * - Streaming compilation for large files
 * - Browser and Node.js dual-target support
 *
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

export interface WASMBuildConfig {
  /** Path to tree-sitter-holoscript grammar source */
  grammarPath: string;
  /** Output directory for compiled WASM */
  outputDir: string;
  /** Emscripten optimization level */
  optimizationLevel: '-O0' | '-O1' | '-O2' | '-O3' | '-Os' | '-Oz';
  /** Initial WASM memory (pages, 64KB each) */
  initialMemoryPages: number;
  /** Maximum WASM memory (pages) */
  maxMemoryPages: number;
  /** Enable SIMD instructions */
  enableSIMD: boolean;
  /** Enable threading (SharedArrayBuffer required) */
  enableThreads: boolean;
  /** Generate source maps for debugging */
  sourceMap: boolean;
  /** Target environments */
  targets: WASMTarget[];
}

export type WASMTarget = 'browser' | 'node' | 'deno' | 'cloudflare-workers';

export type WASMInitState = 'uninitialized' | 'loading' | 'compiling' | 'ready' | 'error';

export interface WASMModule {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  exports: WASMExports;
}

export interface WASMExports {
  _ts_parser_new: () => number;
  _ts_parser_delete: (parser: number) => void;
  _ts_parser_set_language: (parser: number, language: number) => boolean;
  _ts_parser_parse_string: (
    parser: number,
    oldTree: number,
    input: number,
    length: number
  ) => number;
  _ts_tree_delete: (tree: number) => void;
  _ts_tree_root_node: (tree: number) => number;
  _ts_node_type: (node: number) => number;
  _ts_node_start_byte: (node: number) => number;
  _ts_node_end_byte: (node: number) => number;
  _ts_node_child_count: (node: number) => number;
  _ts_node_child: (node: number, index: number) => number;
  _malloc: (size: number) => number;
  _free: (ptr: number) => void;
  _tree_sitter_holoscript: () => number;
}

export interface ParseResult {
  success: boolean;
  rootNode: ASTNode | null;
  errors: ParseError[];
  parseTimeMs: number;
  nodeCount: number;
  bytesParsed: number;
}

export interface ASTNode {
  type: string;
  startByte: number;
  endByte: number;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  children: ASTNode[];
  text?: string;
}

export interface ParseError {
  message: string;
  startByte: number;
  endByte: number;
  row: number;
  column: number;
}

export interface ParserPoolOptions {
  minParsers: number;
  maxParsers: number;
  idleTimeoutMs: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_BUILD_CONFIG: WASMBuildConfig = {
  grammarPath: './tree-sitter-holoscript',
  outputDir: './dist/wasm',
  optimizationLevel: '-O2',
  initialMemoryPages: 256, // 16 MB
  maxMemoryPages: 4096, // 256 MB
  enableSIMD: false,
  enableThreads: false,
  sourceMap: false,
  targets: ['browser'],
};

const DEFAULT_POOL_OPTIONS: ParserPoolOptions = {
  minParsers: 1,
  maxParsers: 4,
  idleTimeoutMs: 30_000,
};

// =============================================================================
// EMSCRIPTEN BUILD CONFIG GENERATOR
// =============================================================================

/**
 * Generates the Emscripten compilation flags for building
 * tree-sitter-holoscript as a WASM module.
 */
export function generateEmscriptenConfig(config: Partial<WASMBuildConfig> = {}): {
  cflags: string[];
  ldflags: string[];
  emccFlags: string[];
  envVars: Record<string, string>;
} {
  const cfg = { ...DEFAULT_BUILD_CONFIG, ...config };

  const cflags: string[] = [
    cfg.optimizationLevel,
    '-fPIC',
    '-std=c11',
    '-D TREE_SITTER_HOLOSCRIPT',
    '-I ./src',
  ];

  const ldflags: string[] = [
    `-s INITIAL_MEMORY=${cfg.initialMemoryPages * 65536}`,
    `-s MAXIMUM_MEMORY=${cfg.maxMemoryPages * 65536}`,
    '-s ALLOW_MEMORY_GROWTH=1',
    '-s MODULARIZE=1',
    '-s EXPORT_ES6=1',
    `-s EXPORT_NAME='TreeSitterHoloScript'`,
    `-s EXPORTED_FUNCTIONS='["_ts_parser_new","_ts_parser_delete","_ts_parser_set_language","_ts_parser_parse_string","_ts_tree_delete","_ts_tree_root_node","_ts_node_type","_ts_node_start_byte","_ts_node_end_byte","_ts_node_child_count","_ts_node_child","_malloc","_free","_tree_sitter_holoscript"]'`,
    `-s EXPORTED_RUNTIME_METHODS='["UTF8ToString","stringToUTF8","lengthBytesUTF8"]'`,
    '-s FILESYSTEM=0',
    '-s DYNAMIC_EXECUTION=0',
    '--no-entry',
  ];

  if (cfg.enableSIMD) {
    cflags.push('-msimd128');
    ldflags.push('-s SIMD=1');
  }

  if (cfg.enableThreads) {
    cflags.push('-pthread');
    ldflags.push('-s USE_PTHREADS=1');
    ldflags.push('-s PTHREAD_POOL_SIZE=2');
  }

  if (cfg.sourceMap) {
    cflags.push('-g');
    ldflags.push('-gsource-map');
    ldflags.push(`--source-map-base ${cfg.outputDir}/`);
  }

  const emccFlags: string[] = [...cflags, ...ldflags];

  const envVars: Record<string, string> = {
    EMCC_CFLAGS: cflags.join(' '),
    OUTPUT_DIR: cfg.outputDir,
    GRAMMAR_PATH: cfg.grammarPath,
  };

  return { cflags, ldflags, emccFlags, envVars };
}

/**
 * Generate a Makefile target string for the WASM build.
 */
export function generateMakefileTarget(config: Partial<WASMBuildConfig> = {}): string {
  const cfg = { ...DEFAULT_BUILD_CONFIG, ...config };
  const { cflags, ldflags } = generateEmscriptenConfig(cfg);

  return `# HoloScript WASM Compilation Target
# Generated by WASMCompilationTarget.ts

GRAMMAR_DIR = ${cfg.grammarPath}
OUTPUT_DIR = ${cfg.outputDir}
GRAMMAR_SRC = $(GRAMMAR_DIR)/src/parser.c
SCANNER_SRC = $(GRAMMAR_DIR)/src/scanner.c

.PHONY: wasm clean-wasm

wasm: $(OUTPUT_DIR)/tree-sitter-holoscript.wasm

$(OUTPUT_DIR)/tree-sitter-holoscript.wasm: $(GRAMMAR_SRC) $(SCANNER_SRC)
\t@mkdir -p $(OUTPUT_DIR)
\temcc $(GRAMMAR_SRC) $(SCANNER_SRC) \\
\t\t${cflags.join(' \\\n\t\t')} \\
\t\t${ldflags.join(' \\\n\t\t')} \\
\t\t-o $(OUTPUT_DIR)/tree-sitter-holoscript.js

clean-wasm:
\trm -rf $(OUTPUT_DIR)/tree-sitter-holoscript.*
`;
}

// =============================================================================
// WASM MEMORY MANAGER
// =============================================================================

/**
 * Manages WASM linear memory allocation for string passing
 * between JavaScript and the WASM module.
 */
export class WASMMemoryManager {
  private memory: WebAssembly.Memory;
  private malloc: (size: number) => number;
  private free: (ptr: number) => void;
  private allocations: Map<number, number> = new Map(); // ptr -> size

  constructor(
    memory: WebAssembly.Memory,
    malloc: (size: number) => number,
    free: (ptr: number) => void
  ) {
    this.memory = memory;
    this.malloc = malloc;
    this.free = free;
  }

  /** Allocate a string in WASM memory, returning pointer and byte length. */
  allocString(str: string): { ptr: number; byteLength: number } {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    const byteLength = bytes.length;

    // Allocate with null terminator
    const ptr = this.malloc(byteLength + 1);
    if (ptr === 0) {
      throw new Error(`WASM malloc failed for ${byteLength + 1} bytes`);
    }

    const view = new Uint8Array(this.memory.buffer, ptr, byteLength + 1);
    view.set(bytes);
    view[byteLength] = 0; // null terminator

    this.allocations.set(ptr, byteLength + 1);
    return { ptr, byteLength };
  }

  /** Read a null-terminated string from WASM memory. */
  readString(ptr: number, maxLen: number = 4096): string {
    const view = new Uint8Array(this.memory.buffer, ptr, maxLen);
    let end = 0;
    while (end < maxLen && view[end] !== 0) end++;

    const decoder = new TextDecoder();
    return decoder.decode(new Uint8Array(this.memory.buffer, ptr, end));
  }

  /** Free a previously allocated pointer. */
  freePtr(ptr: number): void {
    if (this.allocations.has(ptr)) {
      this.free(ptr);
      this.allocations.delete(ptr);
    }
  }

  /** Free all allocations. */
  freeAll(): void {
    for (const ptr of this.allocations.keys()) {
      this.free(ptr);
    }
    this.allocations.clear();
  }

  /** Get current allocation count and total bytes. */
  getStats(): { allocationCount: number; totalBytes: number } {
    let totalBytes = 0;
    for (const size of this.allocations.values()) {
      totalBytes += size;
    }
    return { allocationCount: this.allocations.size, totalBytes };
  }
}

// =============================================================================
// WASM PARSER
// =============================================================================

/**
 * Browser-side HoloScript parser backed by a WASM-compiled tree-sitter grammar.
 * Call init() before parse(). Manages memory automatically.
 */
export class WASMHoloScriptParser {
  private state: WASMInitState = 'uninitialized';
  private module: WASMModule | null = null;
  private memoryManager: WASMMemoryManager | null = null;
  private parserPtr: number = 0;
  private languagePtr: number = 0;
  private initPromise: Promise<void> | null = null;
  private wasmUrl: string;

  constructor(wasmUrl: string = '/tree-sitter-holoscript.wasm') {
    this.wasmUrl = wasmUrl;
  }

  /** Get current initialization state. */
  get initState(): WASMInitState {
    return this.state;
  }

  /** Get whether the parser is ready for use. */
  get isReady(): boolean {
    return this.state === 'ready';
  }

  /**
   * Initialize the WASM module. Can be called multiple times safely.
   * Uses streaming compilation when supported.
   */
  async init(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this.doInit();
    return this.initPromise;
  }

  private async doInit(): Promise<void> {
    try {
      this.state = 'loading';

      // Fetch WASM binary
      const response = await fetch(this.wasmUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`);
      }

      this.state = 'compiling';

      // Use streaming compilation if available
      const memory = new WebAssembly.Memory({
        initial: DEFAULT_BUILD_CONFIG.initialMemoryPages,
        maximum: DEFAULT_BUILD_CONFIG.maxMemoryPages,
      });

      const importObject: WebAssembly.Imports = {
        env: {
          memory,
        },
        wasi_snapshot_preview1: {
          // Minimal WASI stubs for tree-sitter
          fd_write: () => 0,
          fd_close: () => 0,
          fd_seek: () => 0,
          proc_exit: () => {},
        },
      };

      let instance: WebAssembly.Instance;

      if (typeof WebAssembly.instantiateStreaming === 'function') {
        // Streaming compilation (preferred)
        const result = await WebAssembly.instantiateStreaming(fetch(this.wasmUrl), importObject);
        instance = result.instance;
      } else {
        // Fallback: ArrayBuffer compilation
        const buffer = await response.arrayBuffer();
        const result = await WebAssembly.instantiate(buffer, importObject);
        instance = result.instance;
      }

      const exports = instance.exports as unknown as WASMExports;

      this.module = {
        instance,
        memory: (instance.exports.memory as WebAssembly.Memory) || memory,
        exports,
      };

      this.memoryManager = new WASMMemoryManager(
        this.module.memory,
        exports._malloc,
        exports._free
      );

      // Initialize parser and language
      this.languagePtr = exports._tree_sitter_holoscript();
      this.parserPtr = exports._ts_parser_new();

      if (!exports._ts_parser_set_language(this.parserPtr, this.languagePtr)) {
        throw new Error('Failed to set HoloScript language on parser');
      }

      this.state = 'ready';
    } catch (err) {
      this.state = 'error';
      this.initPromise = null;
      throw err;
    }
  }

  /**
   * Parse a HoloScript source string.
   * Returns an AST with timing and error information.
   */
  parse(source: string): ParseResult {
    if (!this.isReady || !this.module || !this.memoryManager) {
      throw new Error('Parser not initialized. Call init() first.');
    }

    const startTime = performance.now();
    const exports = this.module.exports;

    // Allocate source in WASM memory
    const { ptr: srcPtr, byteLength } = this.memoryManager.allocString(source);

    try {
      // Parse
      const treePtr = exports._ts_parser_parse_string(this.parserPtr, 0, srcPtr, byteLength);

      if (treePtr === 0) {
        return {
          success: false,
          rootNode: null,
          errors: [
            { message: 'Parse returned null tree', startByte: 0, endByte: 0, row: 0, column: 0 },
          ],
          parseTimeMs: performance.now() - startTime,
          nodeCount: 0,
          bytesParsed: byteLength,
        };
      }

      // Walk tree to build AST
      const rootNodePtr = exports._ts_tree_root_node(treePtr);
      const { node: rootNode, count: nodeCount, errors } = this.walkNode(rootNodePtr, source);

      // Clean up WASM tree (we have our JS copy)
      exports._ts_tree_delete(treePtr);

      return {
        success: errors.length === 0,
        rootNode,
        errors,
        parseTimeMs: performance.now() - startTime,
        nodeCount,
        bytesParsed: byteLength,
      };
    } finally {
      this.memoryManager.freePtr(srcPtr);
    }
  }

  /** Release all WASM resources. */
  destroy(): void {
    if (this.module && this.parserPtr) {
      this.module.exports._ts_parser_delete(this.parserPtr);
    }
    this.memoryManager?.freeAll();
    this.module = null;
    this.memoryManager = null;
    this.parserPtr = 0;
    this.languagePtr = 0;
    this.state = 'uninitialized';
    this.initPromise = null;
  }

  // ─── Private: Tree Walking ────────────────────────────────────────────

  private walkNode(
    nodePtr: number,
    source: string
  ): { node: ASTNode; count: number; errors: ParseError[] } {
    const exports = this.module!.exports;
    const errors: ParseError[] = [];

    const typePtr = exports._ts_node_type(nodePtr);
    const type = this.memoryManager!.readString(typePtr);
    const startByte = exports._ts_node_start_byte(nodePtr);
    const endByte = exports._ts_node_end_byte(nodePtr);
    const childCount = exports._ts_node_child_count(nodePtr);

    // Calculate row/col from byte offset
    const startPos = this.byteOffsetToPosition(source, startByte);
    const endPos = this.byteOffsetToPosition(source, endByte);

    // Check for error nodes
    if (type === 'ERROR' || type === 'MISSING') {
      errors.push({
        message: `Syntax ${type.toLowerCase()} at byte ${startByte}`,
        startByte,
        endByte,
        row: startPos.row,
        column: startPos.column,
      });
    }

    const children: ASTNode[] = [];
    let count = 1;

    for (let i = 0; i < childCount; i++) {
      const childPtr = exports._ts_node_child(nodePtr, i);
      if (childPtr !== 0) {
        const result = this.walkNode(childPtr, source);
        children.push(result.node);
        count += result.count;
        errors.push(...result.errors);
      }
    }

    const node: ASTNode = {
      type,
      startByte,
      endByte,
      startPosition: startPos,
      endPosition: endPos,
      children,
    };

    // Include text for leaf nodes
    if (childCount === 0 && endByte - startByte < 256) {
      node.text = source.substring(startByte, endByte);
    }

    return { node, count, errors };
  }

  private byteOffsetToPosition(
    source: string,
    byteOffset: number
  ): { row: number; column: number } {
    // Approximate: assumes ASCII (byte offset = char offset for basic source)
    const prefix = source.substring(0, Math.min(byteOffset, source.length));
    const lines = prefix.split('\n');
    return {
      row: lines.length - 1,
      column: lines[lines.length - 1].length,
    };
  }
}

// =============================================================================
// PARSER POOL
// =============================================================================

/**
 * Pool of WASM parsers for concurrent parsing.
 * Parsers are reused to avoid repeated WASM instantiation overhead.
 */
export class WASMParserPool {
  private available: WASMHoloScriptParser[] = [];
  private inUse: Set<WASMHoloScriptParser> = new Set();
  private wasmUrl: string;
  private options: ParserPoolOptions;
  private idleTimers: Map<WASMHoloScriptParser, ReturnType<typeof setTimeout>> = new Map();

  constructor(wasmUrl: string, options?: Partial<ParserPoolOptions>) {
    this.wasmUrl = wasmUrl;
    this.options = { ...DEFAULT_POOL_OPTIONS, ...options };
  }

  /** Initialize the pool with minimum number of parsers. */
  async init(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.options.minParsers; i++) {
      const parser = new WASMHoloScriptParser(this.wasmUrl);
      promises.push(
        parser.init().then(() => {
          this.available.push(parser);
        })
      );
    }
    await Promise.all(promises);
  }

  /** Acquire a parser from the pool. Creates new if under max limit. */
  async acquire(): Promise<WASMHoloScriptParser> {
    // Try to reuse an available parser
    if (this.available.length > 0) {
      const parser = this.available.pop()!;
      const timer = this.idleTimers.get(parser);
      if (timer) {
        clearTimeout(timer);
        this.idleTimers.delete(parser);
      }
      this.inUse.add(parser);
      return parser;
    }

    // Create new if under limit
    if (this.inUse.size < this.options.maxParsers) {
      const parser = new WASMHoloScriptParser(this.wasmUrl);
      await parser.init();
      this.inUse.add(parser);
      return parser;
    }

    // Wait for one to become available
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (this.available.length > 0) {
          clearInterval(check);
          const parser = this.available.pop()!;
          const timer = this.idleTimers.get(parser);
          if (timer) {
            clearTimeout(timer);
            this.idleTimers.delete(parser);
          }
          this.inUse.add(parser);
          resolve(parser);
        }
      }, 50);
    });
  }

  /** Release a parser back to the pool. */
  release(parser: WASMHoloScriptParser): void {
    this.inUse.delete(parser);
    this.available.push(parser);

    // Set idle timeout
    if (this.available.length > this.options.minParsers) {
      const timer = setTimeout(() => {
        const idx = this.available.indexOf(parser);
        if (idx !== -1) {
          this.available.splice(idx, 1);
          parser.destroy();
          this.idleTimers.delete(parser);
        }
      }, this.options.idleTimeoutMs);
      this.idleTimers.set(parser, timer);
    }
  }

  /** Parse using a pooled parser (auto-acquire/release). */
  async parse(source: string): Promise<ParseResult> {
    const parser = await this.acquire();
    try {
      return parser.parse(source);
    } finally {
      this.release(parser);
    }
  }

  /** Get pool statistics. */
  getStats(): { available: number; inUse: number; total: number } {
    return {
      available: this.available.length,
      inUse: this.inUse.size,
      total: this.available.length + this.inUse.size,
    };
  }

  /** Destroy all parsers and clean up. */
  destroy(): void {
    for (const timer of this.idleTimers.values()) {
      clearTimeout(timer);
    }
    this.idleTimers.clear();

    for (const parser of this.available) {
      parser.destroy();
    }
    for (const parser of this.inUse) {
      parser.destroy();
    }
    this.available = [];
    this.inUse.clear();
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/** Create a WASM parser ready for initialization. */
export function createWASMParser(wasmUrl?: string): WASMHoloScriptParser {
  return new WASMHoloScriptParser(wasmUrl);
}

/** Create a parser pool for concurrent WASM parsing. */
export function createWASMParserPool(
  wasmUrl: string,
  options?: Partial<ParserPoolOptions>
): WASMParserPool {
  return new WASMParserPool(wasmUrl, options);
}

export default WASMHoloScriptParser;
