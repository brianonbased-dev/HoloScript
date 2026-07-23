/* tslint:disable */
/* eslint-disable */

/**
 * Compile the top-level `function`s in a `.hs` source string to Kotlin.
 *
 * This is the first target-language backend in the crate: it parses `source` with the
 * canonical `.hs` grammar (the only parser that produces a real logic AST — the TS
 * parser keeps function bodies as raw strings) and emits Kotlin function declarations
 * for the `compile_to_quest` target.
 *
 * # Arguments
 * * `source` - `.hs` source containing one or more top-level `function` declarations.
 * * `indent` - leading indentation applied to each emitted function (e.g. `"  "` when
 *   the functions are nested inside a Kotlin `object`).
 *
 * # Returns
 * The emitted Kotlin on success, or a JSON error object `{"error": "..."}` on a parse
 * or emit failure — same convention as [`parse`], so the TS bridge can branch on it.
 */
export function compile_to_kotlin(source: string, indent: string): string;

/**
 * Compile top-level `.hs` functions to a UAAL bytecode packet.
 *
 * This mirrors [`compile_to_kotlin`]'s JSON boundary but targets the stack-based
 * UAAL VM: success returns `{"version":1,"instructions":[...]}`, failure returns
 * `{"error":"..."}`.
 */
export function compile_to_uaal(source: string): string;

export function init(): void;

/**
 * Parse HoloScript source code and return AST as JSON.
 *
 * # Arguments
 * * `source` - The HoloScript source code to parse
 *
 * # Returns
 * A JSON string containing the AST or an error object
 */
export function parse(source: string): string;

/**
 * Parse HoloScript and return a pretty-printed JSON AST.
 */
export function parse_pretty(source: string): string;

/**
 * Validate HoloScript source code without returning the full AST.
 *
 * # Returns
 * `true` if the source is valid, `false` otherwise
 */
export function validate(source: string): boolean;

/**
 * Get detailed validation results as JSON.
 */
export function validate_detailed(source: string): string;

/**
 * Get the version of the WASM compiler.
 */
export function version(): string;
