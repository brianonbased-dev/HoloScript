/* tslint:disable */
/* eslint-disable */

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
