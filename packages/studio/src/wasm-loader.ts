/**
 * WASM Module Loader for HoloScript Compiler
 *
 * Loads and initializes the compiled Rust WASM component that provides
 * parser, validator, compiler, and other language services.
 *
 * The WASM module exports multiple interfaces defined in wit/holoscript.wit:
 * - parser: Parse HoloScript/HSPlus into AST
 * - validator: Type checking and validation
 * - compiler: Generate target language (Unity, Unreal, etc.)
 * - type-checker: Advanced type analysis
 * - generator: Code generation utilities
 * - spatial-engine: 3D spatial calculations
 * - formatter: Code formatting
 */

/**
 * Initialize and load the HoloScript WASM component
 *
 * @param wasmPath Path to the .wasm binary (default: '/wasm/holoscript.wasm')
 * @returns Promise resolving to the WASM instance when ready
 *
 * @example
 * ```ts
 * const wasm = await initializeWasm();
 * const parseResult = wasm.parse(holoscriptCode);
 * ```
 */
export async function initializeWasm(
  wasmPath: string = '/wasm/holoscript.wasm'
): Promise<WasmInstance> {
  try {
    // Fetch and instantiate the WASM module
    const response = await fetch(wasmPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch WASM: ${response.statusText}`);
    }

    const buffer = await response.arrayBuffer();
    const wasmModule = await WebAssembly.instantiate(buffer, {
      env: {
        // WASI imports (if needed - filled in by WASM)
      },
    });

    // Extract exported functions from the WASM module
    const exports = wasmModule.instance.exports as any;

    // Create a wrapper with typed interface
    return createWasmWrapper(exports);
  } catch (error) {
    console.error('Failed to initialize WASM:', error);
    throw new Error(`WASM initialization failed: ${String(error)}`);
  }
}

/**
 * Type for parsed result from WASM parser
 */
export interface ParseResult {
  success: boolean;
  ast?: any;
  errors?: string[];
  warnings?: string[];
}

/**
 * Type for compilation result
 */
export interface CompileResult {
  success: boolean;
  code?: string;
  errors?: string[];
}

/**
 * Public interface for WASM-based HoloScript compiler
 */
export interface WasmInstance {
  /**
   * Parse HoloScript code into AST
   * @param code HoloScript source code (.hs, .hsplus, or .holo format)
   * @returns ParseResult with AST or errors
   */
  parse(code: string): ParseResult;

  /**
   * Validate parsed AST
   * @param ast Abstract syntax tree from parser
   * @returns Validation result with errors/warnings
   */
  validate(ast: any): ValidationResult;

  /**
   * Compile to target language
   * @param ast Parsed HoloScript AST
   * @param target Compilation target (e.g., "unity", "unreal", "babylon")
   * @returns Compiled code or errors
   */
  compile(ast: any, target: string): CompileResult;

  /**
   * Format HoloScript code
   * @param code Source code to format
   * @returns Formatted code
   */
  format(code: string): string;

  /**
   * Check if code is valid (quick syntax check)
   * @param code Source code to validate
   * @returns true if valid, false otherwise
   */
  isValid(code: string): boolean;
}

/**
 * Validation result from type checker
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Single validation error
 */
export interface ValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Create typed wrapper around raw WASM exports
 */
function createWasmWrapper(exports: any): WasmInstance {
  return {
    parse(code: string): ParseResult {
      try {
        // Call WASM parser function
        // Note: This is a placeholder - actual implementation depends on
        // how wit-bindgen exports the functions in the WASM binary
        if (exports.parse && typeof exports.parse === 'function') {
          const result = exports.parse(code);
          return parseWasmResult(result);
        } else {
          return {
            success: false,
            errors: ['Parser not available in WASM module'],
          };
        }
      } catch (error) {
        return {
          success: false,
          errors: [`Parse error: ${String(error)}`],
        };
      }
    },

    validate(ast: any): ValidationResult {
      try {
        if (exports.validate && typeof exports.validate === 'function') {
          const result = exports.validate(JSON.stringify(ast));
          return {
            valid: !result || result.error_count === 0,
            errors: result?.errors || [],
          };
        }
        return { valid: true, errors: [] };
      } catch (error) {
        return {
          valid: false,
          errors: [
            {
              line: 0,
              column: 0,
              message: `Validation error: ${String(error)}`,
              severity: 'error',
            },
          ],
        };
      }
    },

    compile(ast: any, target: string): CompileResult {
      try {
        if (exports.compile && typeof exports.compile === 'function') {
          const result = exports.compile(JSON.stringify(ast), target);
          return {
            success: !result.error,
            code: result.code,
            errors: result.errors ? [result.errors] : [],
          };
        }
        return {
          success: false,
          errors: ['Compiler not available in WASM module'],
        };
      } catch (error) {
        return {
          success: false,
          errors: [`Compilation error: ${String(error)}`],
        };
      }
    },

    format(code: string): string {
      try {
        if (exports.format && typeof exports.format === 'function') {
          return exports.format(code) || code;
        }
        return code;
      } catch {
        return code;
      }
    },

    isValid(code: string): boolean {
      try {
        if (exports.isValid && typeof exports.isValid === 'function') {
          return exports.isValid(code) === 1;
        }
        // Fallback: try to parse
        const parseResult = this.parse(code);
        return parseResult.success;
      } catch {
        return false;
      }
    },
  };
}

/**
 * Parse WASM parser result into normalized format
 */
function parseWasmResult(result: any): ParseResult {
  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      return {
        success: false,
        errors: ['Failed to parse WASM result'],
      };
    }
  }

  if (result && typeof result === 'object') {
    return {
      success: result.success || !result.error,
      ast: result.ast || result.node,
      errors: result.errors || (result.error ? [result.error] : []),
      warnings: result.warnings || [],
    };
  }

  return {
    success: false,
    errors: ['Invalid WASM result format'],
  };
}

/**
 * Global WASM instance (lazy-loaded on first use)
 */
let wasmInstance: WasmInstance | null = null;

/**
 * Get the global WASM instance, initializing if needed
 */
export async function getWasmInstance(): Promise<WasmInstance> {
  if (!wasmInstance) {
    wasmInstance = await initializeWasm();
  }
  return wasmInstance;
}

/**
 * Reset the cached WASM instance (for testing)
 */
export function resetWasmInstance(): void {
  wasmInstance = null;
}
