/**
 * WASM Parser Bridge
 *
 * High-performance bridge between JavaScript and the Rust WASM parser.
 * Features:
 * - Node pkg-node loading before browser URL fetch
 * - Streaming compilation
 * - Web Worker offloading
 * - Module caching
 * - TypeScript parser fallback while Rust .hsplus coverage converges
 *
 * @version 3.3.0
 * @Sprint Sprint 2: Performance Optimization
 */

import { logger } from '../logger';
import { readJson } from '../errors/safeJsonParse';
import {
  TypeScriptHsplusGrammar,
  normalizeHsplusGrammarErrors,
  type HsplusGrammar,
  type HsplusGrammarSource,
} from '../parser/HsplusGrammar';
import { wasmModuleCache } from './WasmModuleCache';

// WASM module exports interface (from Rust)
interface HoloScriptWasmExports {
  parse(source: string): string;
  parse_pretty(source: string): string;
  validate(source: string): boolean;
  validate_detailed(source: string): string;
  version(): string;
}

export interface ParseResult {
  success: boolean;
  ast?: unknown;
  errors?: Array<{
    message: string;
    line: number;
    column: number;
  }>;
  parseTimeMs: number;
  usedWasm: boolean;
  grammarSource: HsplusGrammarSource;
}

export interface WasmParserConfig {
  /** URL to the WASM file */
  wasmUrl?: string;
  /** Enable worker-based parsing */
  useWorker?: boolean;
  /** Maximum worker pool size */
  maxWorkers?: number;
  /** Fallback to JS parser on WASM failure */
  enableFallback?: boolean;
  /** Preload WASM module */
  preload?: boolean;
  /** Test/host injection for the Rust grammar loader; defaults to pkg-node/browser WASM. */
  nodeGrammarLoader?: () => Promise<HsplusGrammar | null>;
}

/**
 * WasmParserBridge - Optimized WASM-JS bridge for parsing
 */
export class WasmParserBridge {
  private config: Required<WasmParserConfig>;
  private wasmInstance: HoloScriptWasmExports | null = null;
  private grammar: HsplusGrammar | null = null;
  private loadPromise: Promise<void> | null = null;
  private workersAvailable: Worker[] = [];
  private workersPending: Map<number, (result: ParseResult) => void> = new Map();
  private workerIdCounter = 0;
  private initialized = false;

  constructor(config: WasmParserConfig = {}) {
    this.config = {
      wasmUrl: config.wasmUrl ?? '/holoscript_wasm_bg.wasm',
      useWorker: config.useWorker ?? typeof window !== 'undefined',
      maxWorkers: config.maxWorkers ?? Math.min(4, globalThis.navigator?.hardwareConcurrency ?? 2),
      enableFallback: config.enableFallback ?? true,
      preload: config.preload ?? true,
      nodeGrammarLoader: config.nodeGrammarLoader ?? this.loadDefaultNodeGrammar.bind(this),
    };

    if (this.config.preload) {
      this.load().catch((err) => {
        logger.warn('[WasmParserBridge] Preload failed, will retry on first use:', err);
      });
    }
  }

  /**
   * Load and compile the WASM module
   */
  async load(): Promise<void> {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = this._loadInternal();
    return this.loadPromise;
  }

  private async _loadInternal(): Promise<void> {
    const version = '3.3.0'; // Should match WASM version
    const cacheKey = 'holoscript-parser';

    try {
      const nodeGrammar = await this.config.nodeGrammarLoader();
      if (nodeGrammar) {
        this.grammar = nodeGrammar;
        this.initialized = true;
        logger.info(`[WasmParserBridge] Loaded ${nodeGrammar.source} grammar`);
        return;
      }

      // Try to get from cache first
      const cachedModule = await wasmModuleCache.get(cacheKey, version);
      if (cachedModule) {
        await this.instantiateModule(cachedModule);
        logger.info('[WasmParserBridge] Loaded from cache');
        return;
      }

      // Use streaming compilation if available
      if (typeof WebAssembly.compileStreaming === 'function') {
        const response = await fetch(this.config.wasmUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch WASM: ${response.status}`);
        }

        const startTime = performance.now();
        const module = await WebAssembly.compileStreaming(response.clone());
        const loadTime = performance.now() - startTime;

        // Cache the compiled module
        const bytes = new Uint8Array(await response.arrayBuffer());
        await wasmModuleCache.set(cacheKey, version, module, bytes);

        await this.instantiateModule(module);
        logger.info(`[WasmParserBridge] Streaming compiled in ${loadTime.toFixed(1)}ms`);
      } else {
        // Fallback: fetch and compile synchronously
        const response = await fetch(this.config.wasmUrl);
        const bytes = new Uint8Array(await response.arrayBuffer());

        const startTime = performance.now();
        const module = await WebAssembly.compile(bytes);
        const loadTime = performance.now() - startTime;

        await wasmModuleCache.set(cacheKey, version, module, bytes);
        await this.instantiateModule(module);
        logger.info(`[WasmParserBridge] Compiled in ${loadTime.toFixed(1)}ms`);
      }

      this.initialized = true;
    } catch (err) {
      logger.error('[WasmParserBridge] Load failed:', { error: String(err) });
      throw err;
    }
  }

  private async instantiateModule(module: WebAssembly.Module): Promise<void> {
    // Import object for WASM (memory, imports, etc.)
    const imports = {
      env: {
        memory: new WebAssembly.Memory({ initial: 256, maximum: 4096 }),
      },
      wbindgen_placeholder__: {
        __wbindgen_throw: (ptr: number, len: number) => {
          const memory = (this.wasmInstance as unknown as { memory: WebAssembly.Memory }).memory;
          const bytes = new Uint8Array(memory.buffer, ptr, len);
          const msg = new TextDecoder().decode(bytes);
          throw new Error(msg);
        },
      },
    };

    try {
      const instance = await WebAssembly.instantiate(module, imports);
      this.wasmInstance = instance.exports as unknown as HoloScriptWasmExports;
      this.grammar = new WasmHsplusGrammar(this.wasmInstance, 'rust-wasm-browser');
      this.initialized = true;
    } catch (err) {
      logger.error('[WasmParserBridge] Instantiation failed:', { error: String(err) });
      throw err;
    }
  }

  /**
   * Parse HoloScript source code using WASM
   */
  async parse(source: string): Promise<ParseResult> {
    const startTime = performance.now();

    try {
      // Skip the load() promise overhead on hot path if already initialized
      if (!this.initialized) {
        await this.load();
      }

      const grammar = this.grammar;
      if (!grammar) {
        throw new Error('WASM grammar not initialized');
      }

      const result = await grammar.parse(source);
      const parseTime = performance.now() - startTime;

      if (!result.success && this.config.enableFallback) {
        return this.fallbackParse(source);
      }

      return {
        success: result.success,
        ast: result.ast,
        errors: result.errors,
        parseTimeMs: parseTime,
        usedWasm: true,
        grammarSource: grammar.source,
      };
    } catch (err) {
      const parseTime = performance.now() - startTime;

      if (this.config.enableFallback) {
        logger.warn('[WasmParserBridge] WASM parse failed, using fallback:', {
          error: String(err),
        });
        return this.fallbackParse(source);
      }

      return {
        success: false,
        errors: [{ message: String(err), line: 0, column: 0 }],
        parseTimeMs: parseTime,
        usedWasm: false,
        grammarSource: this.grammar?.source ?? 'rust-wasm-browser',
      };
    }
  }

  /**
   * Validate HoloScript source code
   */
  async validate(
    source: string
  ): Promise<{ valid: boolean; errors: Array<{ message: string; line: number; column: number }> }> {
    try {
      if (!this.initialized) {
        await this.load();
      }

      const grammar = this.grammar;
      if (!grammar) {
        throw new Error('WASM grammar not initialized');
      }

      const result = await grammar.validateDetailed(source);
      if (!result.valid && this.config.enableFallback) {
        return this.fallbackValidate(source);
      }

      return {
        valid: result.valid,
        errors: result.errors,
      };
    } catch (err) {
      logger.warn('[WasmParserBridge] Validation failed:', { error: String(err) });
      if (this.config.enableFallback) {
        return this.fallbackValidate(source);
      }
      return {
        valid: false,
        errors: [{ message: String(err), line: 0, column: 0 }],
      };
    }
  }

  private async fallbackValidate(
    source: string
  ): Promise<{ valid: boolean; errors: Array<{ message: string; line: number; column: number }> }> {
    try {
      const grammar = new TypeScriptHsplusGrammar();
      const result = await grammar.validateDetailed(source);
      return {
        valid: result.valid,
        errors: result.errors,
      };
    } catch (err) {
      return {
        valid: false,
        errors: [{ message: String(err), line: 0, column: 0 }],
      };
    }
  }

  /**
   * Get WASM version
   */
  async getVersion(): Promise<string> {
    try {
      if (!this.initialized) {
        await this.load();
      }
      return (await this.grammar?.version()) ?? 'unknown';
    } catch {
      return 'unavailable';
    }
  }

  /**
   * Fallback to JavaScript parser
   */
  private async fallbackParse(source: string): Promise<ParseResult> {
    const startTime = performance.now();

    try {
      const grammar = new TypeScriptHsplusGrammar();
      const result = await grammar.parse(source);

      return {
        success: result.success,
        ast: result.ast,
        errors: result.errors,
        parseTimeMs: performance.now() - startTime,
        usedWasm: false,
        grammarSource: grammar.source,
      };
    } catch (err) {
      return {
        success: false,
        errors: [{ message: String(err), line: 0, column: 0 }],
        parseTimeMs: performance.now() - startTime,
        usedWasm: false,
        grammarSource: 'typescript-fallback',
      };
    }
  }

  /**
   * Check if WASM is available
   */
  isAvailable(): boolean {
    return (
      this.initialized &&
      this.grammar !== null &&
      (this.grammar.source === 'rust-wasm-node' || this.grammar.source === 'rust-wasm-browser')
    );
  }

  /**
   * Get bridge statistics
   */
  getStats(): {
    initialized: boolean;
    cacheStats: { memoryEntries: number; dbAvailable: boolean };
  } {
    return {
      initialized: this.initialized,
      cacheStats: wasmModuleCache.getStats(),
    };
  }

  private async loadDefaultNodeGrammar(): Promise<HsplusGrammar | null> {
    if (!isNodeLikeRuntime()) return null;

    try {
      // Path assembled from segments, NOT a string literal: webpack 5 statically
      // resolves literal `new URL('...', import.meta.url)` even behind try/catch
      // and @vite-ignore, so any consumer bundling core's dist (e.g. Studio's
      // next build) hard-fails "Module not found" when the Rust WASM artifact
      // isn't built in its context (Node-only docker images skip the Rust
      // workspace). A computed specifier keeps this a runtime-only optional load.
      const wasmRelPath = [
        '..',
        '..',
        '..',
        'compiler-wasm',
        'pkg-node',
        'holoscript_wasm.js',
      ].join('/');
      const moduleUrl = new URL(wasmRelPath, import.meta.url);
      const imported = (await import(/* @vite-ignore */ moduleUrl.href)) as Record<string, unknown>;
      const candidate = hasWasmExports(imported.default) ? imported.default : imported;
      if (!hasWasmExports(candidate)) return null;

      const maybeInit = (candidate as { init?: () => void }).init;
      if (typeof maybeInit === 'function') {
        maybeInit.call(candidate);
      }

      this.wasmInstance = candidate;
      return new WasmHsplusGrammar(candidate, 'rust-wasm-node');
    } catch (err) {
      logger.warn('[WasmParserBridge] pkg-node grammar load failed, trying browser WASM:', {
        error: String(err),
      });
      return null;
    }
  }
}

// Singleton instance for convenience
export const wasmParser = new WasmParserBridge();

// Re-export for convenience
export { wasmModuleCache };

function hasWasmExports(value: unknown): value is HoloScriptWasmExports {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return (
    typeof record.parse === 'function' &&
    typeof record.validate === 'function' &&
    typeof record.validate_detailed === 'function' &&
    typeof record.version === 'function'
  );
}

function isNodeLikeRuntime(): boolean {
  const maybeProcess = (globalThis as { process?: { versions?: { node?: string } } }).process;
  return typeof maybeProcess?.versions?.node === 'string';
}

class WasmHsplusGrammar implements HsplusGrammar {
  constructor(
    private readonly wasm: HoloScriptWasmExports,
    readonly source: HsplusGrammarSource
  ) {}

  parse(source: string) {
    const parsed = readJson(this.wasm.parse(source)) as Record<string, unknown>;
    const errors = normalizeHsplusGrammarErrors(parsed.errors);
    const singleError =
      typeof parsed.error === 'string' ? [{ message: parsed.error, line: 0, column: 0 }] : [];

    return {
      success: errors.length === 0 && singleError.length === 0,
      ast: errors.length === 0 && singleError.length === 0 ? parsed : undefined,
      errors: [...errors, ...singleError],
      raw: parsed,
    };
  }

  validate(source: string): boolean {
    return this.wasm.validate(source);
  }

  validateDetailed(source: string) {
    const parsed = readJson(this.wasm.validate_detailed(source)) as Record<string, unknown>;
    return {
      valid: parsed.valid === true,
      errors: normalizeHsplusGrammarErrors(parsed.errors),
      raw: parsed,
    };
  }

  version(): string {
    return this.wasm.version();
  }
}
