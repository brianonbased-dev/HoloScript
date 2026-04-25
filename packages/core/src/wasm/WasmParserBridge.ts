/**
 * WASM Parser Bridge
 *
 * High-performance bridge between JavaScript and the Rust WASM parser.
 * Features:
 * - Streaming compilation
 * - Web Worker offloading
 * - Module caching
 * - Fallback to JS parser
 *
 * @version 3.3.0
 * @Sprint Sprint 2: Performance Optimization
 */

import { logger } from '../logger';
import { readJson } from '../errors/safeJsonParse';
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
}

/**
 * WasmParserBridge - Optimized WASM-JS bridge for parsing
 */
export class WasmParserBridge {
  private config: Required<WasmParserConfig>;
  private wasmInstance: HoloScriptWasmExports | null = null;
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

      if (!this.wasmInstance) {
        throw new Error('WASM not initialized');
      }

      const resultJson = this.wasmInstance.parse(source);
      const parseTime = performance.now() - startTime;
      const parsed = readJson(resultJson) as Record<string, unknown>;

      if (parsed.errors) {
        return {
          success: false,
          errors: parsed.errors,
          parseTimeMs: parseTime,
          usedWasm: true,
        };
      }

      return {
        success: true,
        ast: parsed,
        parseTimeMs: parseTime,
        usedWasm: true,
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

      if (!this.wasmInstance) {
        throw new Error('WASM not initialized');
      }

      const resultJson = this.wasmInstance.validate_detailed(source);
      return readJson(resultJson) as {
        valid: boolean;
        errors: Array<{ message: string; line: number; column: number }>;
      };
    } catch (err) {
      logger.warn('[WasmParserBridge] Validation failed:', { error: String(err) });
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
      return this.wasmInstance?.version() ?? 'unknown';
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
      // Dynamic import to avoid circular deps
      const { HoloScriptPlusParser } = await import('../HoloScriptPlusParser');
      const parser = new HoloScriptPlusParser();
      // HoloScriptPlusParser.parse() returns ASTNode[] directly
      const ast = parser.parse(source);

      return {
        success: true,
        ast,
        errors: [],
        parseTimeMs: performance.now() - startTime,
        usedWasm: false,
      };
    } catch (err) {
      return {
        success: false,
        errors: [{ message: String(err), line: 0, column: 0 }],
        parseTimeMs: performance.now() - startTime,
        usedWasm: false,
      };
    }
  }

  /**
   * Check if WASM is available
   */
  isAvailable(): boolean {
    return this.initialized && this.wasmInstance !== null;
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
}

// Singleton instance for convenience
export const wasmParser = new WasmParserBridge();

// Re-export for convenience
export { wasmModuleCache };
