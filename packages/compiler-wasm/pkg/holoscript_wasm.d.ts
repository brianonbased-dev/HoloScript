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

/**
 * Evaluate one `@on_<handler>` trait-handler body deterministically — the
 * WebAssembly execution leg of the std ABI conformance suite.
 *
 * Executes the BODY of the `@on_*` handler named `handler_name` inside the
 * top-level `@trait <trait_name> { … }` definition in `source`, binding the
 * handler parameters BY NAME from `args_json` (a JSON object). The admitted
 * semantics are the deterministic subset mirrored from the engine runtime
 * (`holoscript-engine-hsplus-deterministic-action-subset-v1`): f64 IEEE-754
 * arithmetic, source-ordered evaluation, no function calls, fail closed on
 * division by zero, non-finite results, negative zero, unknown identifiers,
 * and any node outside the subset. See `eval.rs` for the full contract.
 *
 * # Returns
 * Always a JSON string: `{"ok":true,"value":<json>}` on success, or
 * `{"ok":false,"error":{"code":"…","message":"…"}}` on any failure — same
 * always-JSON boundary convention as [`parse`] and [`validate_detailed`].
 */
export function evaluate_trait_handler(source: string, trait_name: string, handler_name: string, args_json: string): string;

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

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compile_to_kotlin: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly compile_to_uaal: (a: number, b: number, c: number) => void;
    readonly evaluate_trait_handler: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => void;
    readonly init: () => void;
    readonly parse: (a: number, b: number, c: number) => void;
    readonly parse_pretty: (a: number, b: number, c: number) => void;
    readonly validate: (a: number, b: number) => number;
    readonly validate_detailed: (a: number, b: number, c: number) => void;
    readonly version: (a: number) => void;
    readonly __wbindgen_export: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
