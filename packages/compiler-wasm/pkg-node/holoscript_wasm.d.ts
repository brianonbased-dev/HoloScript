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

/**
 * Evaluate one `@on_<handler>` trait-handler body in the v2 deterministic
 * subset (`holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins`).
 *
 * Identical contract to [`evaluate_trait_handler`] with exactly ONE extension:
 * calls whose callee is a BARE identifier in the whitelisted numeric builtin
 * table `{sqrt, sin, cos, acos, min, max, abs, floor}` (exact arity, every
 * argument a number) are computed in f64 via Rust std and pass through the
 * same checked-number gate — non-finite and negative-zero results fail closed,
 * so `sqrt(-1)` / `acos(2)` are structured errors. Member calls
 * (`math.sqrt(x)`) and callees outside the table remain `unsupported-call`.
 * Everything outside `CallExpression` behaves byte-for-byte as in v1.
 */
export function evaluate_trait_handler_v2(source: string, trait_name: string, handler_name: string, args_json: string): string;

/**
 * Evaluate one `@on_<handler>` trait-handler body under the v3 deterministic
 * subset id (`holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings`).
 *
 * v3 is an HONEST ALIAS of [`evaluate_trait_handler_v2`]: identical internals
 * and evaluation mode (numeric builtin table ON). This lane's statement
 * walker has admitted the v3 grammar's bounded local bindings — bare
 * `name = expr` assignment, reassignment including inside if/else branches,
 * use-before-assign fail-closed as `unknown-identifier` — since v1, so the
 * v2 build already implements the v3 grammar. The engine lane is only now
 * gaining local bindings under the shared v3 id; this export exists so
 * receipts on both lanes pin ONE shared subset id
 * (`eval::DETERMINISTIC_SUBSET_V3`) through an honestly-named export.
 */
export function evaluate_trait_handler_v3(source: string, trait_name: string, handler_name: string, args_json: string): string;

/**
 * Evaluate one `@on_<handler>` trait-handler body under the v4 deterministic
 * subset (`holoscript-engine-hsplus-deterministic-action-subset-v4-host-bindings`).
 *
 * v4 admits the v3 grammar PLUS host-binding calls: a `CallExpression` whose
 * callee is a NON-COMPUTED member expression `ns.fn`, where `ns` is a bare
 * identifier naming a namespace OWN-present on `host_bindings` (the
 * `{ math, list_lib, map_lib, set_lib }` object produced by
 * createStdHostBindings() in
 * `packages/std/conformance/host-abi/std-host-binding.mjs`) and `fn` a
 * function on it. Every evaluated argument marshals guest→host as canonical
 * strict JSON (`JSON.parse` of the serde serialization), the host is invoked
 * via `Reflect.get` + `Function.apply`, and the result marshals back through
 * `JSON.stringify` before re-entering the evaluator's rails (finite numbers,
 * no negative zero, safe keys, strict JSON only). A host-side throw becomes
 * `{"ok":false,"error":{"code":"host-binding-error",…}}` carrying the thrown
 * message text; unknown namespaces/functions are `unknown-host-binding`; an
 * undefined or non-JSON-serializable host result is `invalid-host-result` —
 * structured errors, never panics. Bare-identifier calls stay builtins-only,
 * namespaces are never values, and bound parameters/locals take precedence
 * over namespaces in callee-root position. The v1/v2/v3 exports are untouched.
 */
export function evaluate_trait_handler_v4(source: string, trait_name: string, handler_name: string, args_json: string, host_bindings: any): string;

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
