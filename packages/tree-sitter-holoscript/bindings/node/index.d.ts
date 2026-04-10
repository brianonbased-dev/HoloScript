/**
 * tree-sitter-holoscript TypeScript definitions
 *
 * Supports both native (node-gyp) and WASM (web-tree-sitter) backends.
 */

import type { Language } from 'tree-sitter';

/** Result from the WASM fallback initializer */
export interface WasmInitResult {
  /** A fully configured web-tree-sitter Parser with HoloScript loaded */
  parser: any;
  /** The loaded HoloScript Language object (web-tree-sitter compatible) */
  language: any;
  /** Always true when loaded via WASM */
  isWasm: true;
}

/** Result from the unified loadHoloScript() loader */
export interface LoadResult {
  /** The native binding object, or null if WASM was used */
  binding: Language | null;
  /** web-tree-sitter Parser (only present when isWasm is true) */
  parser?: any;
  /** web-tree-sitter Language (only present when isWasm is true) */
  language?: any;
  /** Whether the WASM fallback was used */
  isWasm: boolean;
}

/** Options for WASM initialization */
export interface WasmOptions {
  /** Custom path to the tree-sitter-holoscript.wasm file */
  wasmPath?: string;
  /** Custom web-tree-sitter Parser class (avoids dynamic require) */
  Parser?: any;
}

/**
 * The HoloScript tree-sitter language binding.
 *
 * When native bindings are available, this is a Language object compatible
 * with `parser.setLanguage(holoscript)`.
 *
 * When native bindings are unavailable, this object provides async methods
 * to load the WASM fallback.
 *
 * @example Native usage:
 * ```typescript
 * import Parser from 'tree-sitter';
 * import HoloScript from 'tree-sitter-holoscript';
 *
 * const parser = new Parser();
 * parser.setLanguage(HoloScript);
 *
 * const tree = parser.parse(`
 *   composition "My Scene" {
 *     object "Cube" @grabbable {
 *       geometry: "cube"
 *     }
 *   }
 * `);
 * ```
 *
 * @example WASM fallback usage:
 * ```typescript
 * import HoloScript from 'tree-sitter-holoscript';
 *
 * // If native binding is not available, use async WASM loader
 * if (!HoloScript || HoloScript.isWasm === null) {
 *   const { parser, language } = await HoloScript.initWasm();
 *   const tree = parser.parse('object "Cube" @grabbable {}');
 * }
 * ```
 *
 * @example Unified loader (recommended for cross-platform):
 * ```typescript
 * import HoloScript from 'tree-sitter-holoscript';
 *
 * const result = await HoloScript.loadHoloScript();
 * if (result.isWasm) {
 *   // Use result.parser (web-tree-sitter)
 *   const tree = result.parser.parse('object "Cube" {}');
 * } else {
 *   // Use result.binding with native tree-sitter
 *   const Parser = require('tree-sitter');
 *   const parser = new Parser();
 *   parser.setLanguage(result.binding);
 * }
 * ```
 */
declare const holoscript: Language & {
  /** Name of the language */
  name: string;

  /**
   * Whether this instance was loaded via WASM.
   * - false: native binding loaded
   * - null: native failed, WASM not yet attempted
   * - true: WASM binding loaded (only on web binding)
   */
  isWasm: boolean | null;

  /**
   * Initialize the WASM fallback.
   * Use when native binding is unavailable.
   */
  initWasm(options?: WasmOptions): Promise<WasmInitResult>;

  /**
   * Unified loader: tries native first, falls back to WASM automatically.
   * Recommended for cross-platform code.
   */
  loadHoloScript(options?: WasmOptions): Promise<LoadResult>;
};

export = holoscript;
