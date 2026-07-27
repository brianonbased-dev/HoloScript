//! Deterministic trait-handler evaluator — the WebAssembly execution leg of the
//! std ABI conformance suite.
//!
//! Executes the body of one `@on_<handler>` handler inside a `@trait <name> { … }`
//! definition, binding handler parameters BY NAME from a JSON args object. The
//! admitted semantics mirror the engine's
//! `holoscript-engine-hsplus-deterministic-action-subset-v1`
//! (`packages/engine/src/runtime/profiles/DeterministicHsplusActionRuntime.ts`):
//! all-f64 IEEE-754 double arithmetic, strictly source-ordered evaluation, no FMA
//! contraction (Rust/LLVM does not contract float expressions without fast-math),
//! no host capabilities, and FAIL CLOSED on anything outside the subset:
//!
//! - Literals (number, string, boolean, null), identifier lookup (params + locals),
//!   non-computed member access, object literals, array literals.
//! - Binary `+ - * /` (f64; `+` also admits string+string, mirroring the engine),
//!   equality `== != === !==` (primitives only — mirroring the engine, mismatched
//!   primitive types compare unequal rather than erroring; arrays/objects are a
//!   structured error), ordering `< > <= >=` (numbers only), logical `&& ||`
//!   (booleans only, short-circuit like the engine).
//! - Unary `!` (boolean) and numeric negation.
//! - Statements: local assignment (`ident = expr`, plain `=` only), `if` blocks
//!   (boolean test required, no truthiness), `return expr`.
//! - NO function calls of any kind (`unsupported-call`), no loops, no ternary
//!   (the wasm subset grammar has no conditional-expression production — a body
//!   containing one fails speculative parsing and reports `unparsed-body`).
//! - Structured errors on: division by zero, non-finite results, negative zero
//!   in any produced value, unknown identifiers/members, unsupported nodes.
//!
//! A second evaluation mode — `evaluate_trait_handler_v2`, subset id
//! `holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins` —
//! admits exactly ONE extension over v1: `CallExpression`s whose callee is a
//! BARE identifier in the whitelisted numeric builtin table
//! `{sqrt, sin, cos, acos, min, max, abs, floor}`, exact arity, every argument
//! a number, computed in f64 via Rust std and passed through the same
//! `checked_number` gate (non-finite and negative-zero results fail closed, so
//! `sqrt(-1)` / `acos(2)` are structured errors). Member calls (`math.sqrt(x)`)
//! and unknown callees remain refused in both modes; everything outside
//! `CallExpression` behaves byte-for-byte identically to v1.
//!
//! A third export — `evaluate_trait_handler_v3`, subset id
//! `holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings` —
//! is an HONEST ALIAS of the v2 evaluation mode (no third `EvalMode`). This
//! lane's statement walker has admitted bounded local bindings (bare
//! `name = expr` assignment, reassignment including inside if/else branches,
//! use-before-assign fail-closed as `unknown-identifier`) since v1; the engine
//! lane is only now gaining local bindings, under v3 as the shared subset id.
//! Exporting v3 here lets receipts on both lanes pin ONE shared id without
//! pretending the wasm grammar grew.
//!
//! A fourth mode — `evaluate_trait_handler_v4`, subset id
//! `holoscript-engine-hsplus-deterministic-action-subset-v4-host-bindings` —
//! admits the v3 grammar PLUS host-binding calls: a `CallExpression` whose
//! callee is a NON-COMPUTED member expression `ns.fn`, where `ns` is a bare
//! identifier naming a namespace OWN-present on the injected host-binding
//! object and `fn` a function on it. Bound parameters/locals take precedence
//! (a bound name in callee-root position makes the call a member call on a
//! VALUE, which stays refused as `unsupported-call`); namespaces are never
//! values (a namespace root in value position, or a bare namespace identifier
//! expression, stays `unknown-identifier`); bare-identifier calls stay
//! builtins-only. Marshalling is canonical strict JSON over the boundary in
//! BOTH directions — each evaluated argument serializes via serde_json, the
//! host result re-enters through the same rails as handler args (finite
//! numbers, `-0` normalized, dangerous keys refused, strict JSON only). A
//! host-side throw becomes `host-binding-error` carrying the thrown message
//! text; unknown namespace/function is `unknown-host-binding`; an undefined
//! or non-JSON-serializable host result is `invalid-host-result`. All of these
//! are structured errors, never panics. The JS boundary itself sits behind the
//! [`HostDispatcher`] seam, so native `cargo test` covers the v4 grammar,
//! admission rules, and error mapping with a mock dispatcher — only the
//! js_sys-backed dispatcher is wasm32-gated.
//!
//! A fifth mode — `evaluate_trait_handler_v5`, subset id
//! `holoscript-engine-hsplus-deterministic-action-subset-v5-packaged-factories` —
//! admits the v4 grammar PLUS what the REAL packaged `@holoscript/std` sources
//! (`packages/std/src/math.hsplus`, `collections.hsplus`) need to execute as
//! authored:
//!
//! - **Factory calls**: bare-identifier zero-argument calls in the whitelisted
//!   factory table ([`FACTORIES`]) evaluate to an opaque NAMESPACE HANDLE:
//!   `get_std_math_lib()` → the injected `math` namespace;
//!   `get_std_collections_lib()` → the UNION of the injected `list_lib` +
//!   `map_lib` + `set_lib` namespaces (one handle exposing all their
//!   functions; any function-name collision across the three is a structured
//!   `namespace-collision` error at handle CONSTRUCTION, which requires the
//!   [`HostDispatcher::functions`] enumeration seam). A factory name shadowed
//!   by a bound parameter/local is NOT a factory call (bound names take
//!   precedence, same rule as v4 namespaces) and falls through to the builtin
//!   table's refusal.
//! - **Handle locals**: locals may hold handles; a member-callee whose ROOT
//!   identifier resolves to a handle-valued local dispatches the named
//!   function on that handle (same canonical-JSON marshalling and re-entry
//!   rails as v4). Root resolution precedence stays params → locals → (v4
//!   ambient namespaces still work when the root is unbound).
//! - **Handles never escape**: a handle is an evaluator-internal value.
//!   Returning one (even nested in an object/array), embedding one in an
//!   object or array literal, comparing one, or passing one as a host-call
//!   argument is a structured `namespace-handle-escape` error.
//! - **@on_spawn factory pre-pass**: when invoking handler H of trait T, if T
//!   has an `@on_spawn` whose parsed body contains statements of the exact
//!   shape `<alias> = <factory>()`, those aliases are pre-bound as handle
//!   locals BEFORE H executes (handler params take precedence over aliases).
//!   on_spawn side effects are not executed; only factory-alias bindings are
//!   statically lifted — `emit(...)` calls and every other on_spawn statement
//!   are ignored by the pre-pass.
//!
//! Error/result boundary follows the crate convention of always returning JSON:
//! `{"ok":true,"value":<json>}` or `{"ok":false,"error":{"code":"…","message":"…"}}`.

use crate::ast::{AstNode, GameEventBlockNode, PropertyNode, TraitNode};
use std::collections::BTreeMap;

/// Subset identifier this evaluator mirrors (kept in sync with the engine's
/// `ENGINE_HSPLUS_DETERMINISTIC_ACTION_SUBSET`).
pub const DETERMINISTIC_SUBSET: &str = "holoscript-engine-hsplus-deterministic-action-subset-v1";

/// Subset identifier for the v2 evaluation mode: v1 plus the whitelisted
/// numeric builtin table (the engine lane exports the same id).
pub const DETERMINISTIC_SUBSET_V2: &str =
    "holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins";

/// Subset identifier for the v3 evaluation mode — the SHARED engine+wasm id
/// for "v2 semantics plus bounded local bindings". In this lane v3 is an
/// honest ALIAS of [`DETERMINISTIC_SUBSET_V2`]'s mode: the statement walker
/// has admitted bounded local bindings (bare `name = expr` assignment,
/// reassignment, if/else, use-before-assign fail-closed) since v1, so no new
/// `EvalMode` field exists — same builtin table, same walkers, one shared id
/// for receipts.
pub const DETERMINISTIC_SUBSET_V3: &str =
    "holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings";

/// Subset identifier for the v4 evaluation mode: the v3 grammar plus
/// host-binding member calls (`ns.fn(args)`) into an injected host-binding
/// object, marshalled as canonical JSON over the boundary (the engine lane
/// exports the same id).
pub const DETERMINISTIC_SUBSET_V4: &str =
    "holoscript-engine-hsplus-deterministic-action-subset-v4-host-bindings";

/// Subset identifier for the v5 evaluation mode: the v4 grammar plus packaged
/// factory calls (`get_std_math_lib()` / `get_std_collections_lib()` → opaque
/// namespace handles), handle-valued locals in member-callee root position,
/// and the `@on_spawn` factory-alias pre-pass — everything the packaged
/// `@holoscript/std` `.hsplus` sources need to execute as authored.
pub const DETERMINISTIC_SUBSET_V5: &str =
    "holoscript-engine-hsplus-deterministic-action-subset-v5-packaged-factories";

/// Evaluation mode threaded through the statement/expression walkers. v1 keeps
/// `numeric_builtins` off (every `CallExpression` is `unsupported-call`, same
/// code and message as before the mode existed); v2 turns the builtin table on;
/// v4 additionally turns `host_bindings` on, admitting non-computed member
/// callees as host-binding calls; v5 additionally turns `factories` on,
/// admitting whitelisted zero-argument factory calls, handle locals, and the
/// on_spawn factory-alias pre-pass.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct EvalMode {
    numeric_builtins: bool,
    host_bindings: bool,
    factories: bool,
}

const MODE_V1: EvalMode = EvalMode {
    numeric_builtins: false,
    host_bindings: false,
    factories: false,
};
const MODE_V2: EvalMode = EvalMode {
    numeric_builtins: true,
    host_bindings: false,
    factories: false,
};
/// v4: v3 grammar (numeric builtins + the local bindings this walker has
/// admitted since v1) PLUS host-binding member calls in callee position.
const MODE_V4: EvalMode = EvalMode {
    numeric_builtins: true,
    host_bindings: true,
    factories: false,
};
/// v5: the v4 grammar PLUS packaged factory calls, handle locals, and the
/// on_spawn factory-alias pre-pass.
const MODE_V5: EvalMode = EvalMode {
    numeric_builtins: true,
    host_bindings: true,
    factories: true,
};

/// The v5 whitelisted factory table: (factory name, backing host namespaces).
/// A factory call evaluates to a namespace handle over the UNION of its
/// backing namespaces — `get_std_math_lib` over the injected `math` namespace,
/// `get_std_collections_lib` over `list_lib` + `map_lib` + `set_lib` (the
/// packaged `@on_spawn` bodies bind ONE alias per trait, so the collections
/// handle must expose all three).
const FACTORIES: &[(&str, &[&str])] = &[
    ("get_std_math_lib", &["math"]),
    ("get_std_collections_lib", &["list_lib", "map_lib", "set_lib"]),
];

/// Callee-position lookup result for one `ns.fn` host-binding reference.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HostLookup {
    /// The injected host-binding object has no OWN namespace `ns`.
    UnknownNamespace,
    /// Namespace `ns` exists but has no OWN function `fn`.
    UnknownFunction,
    /// `ns.fn` resolves to a callable host function.
    Found,
}

/// Outcome of invoking one resolved host-binding function.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HostInvokeOutcome {
    /// Host returned a value; the payload is its JSON serialization
    /// (JSON.stringify output on the wasm boundary).
    Value(String),
    /// Host function threw; the payload is the thrown error's message text.
    Threw(String),
    /// Host returned undefined or a value JSON cannot serialize.
    NotSerializable(String),
}

/// The marshalling seam between the evaluator and the injected host-binding
/// object. On wasm32 the implementation crosses the real JS boundary via
/// js_sys (see `js_host`); native tests and embedders inject their own, so
/// the v4 grammar, admission rules, and error mapping are covered by plain
/// `cargo test` without a live JS host. Callee resolution ([`Self::lookup`])
/// happens BEFORE argument evaluation, mirroring source order.
pub trait HostDispatcher {
    fn lookup(&self, namespace: &str, function: &str) -> HostLookup;
    fn invoke(&self, namespace: &str, function: &str, args_json: &[String]) -> HostInvokeOutcome;
    /// v5 enumeration seam: the OWN function-valued property names of
    /// `namespace`, or `None` when the namespace is absent from the injected
    /// host-binding object. Required so union handles can detect function-name
    /// collisions at CONSTRUCTION time (a lookup-only seam cannot enumerate).
    fn functions(&self, namespace: &str) -> Option<Vec<String>>;
}

/// Context threaded through the walkers: the evaluation mode plus the
/// (v4-only) host dispatcher. v1–v3 run with `host: None`.
struct EvalCtx<'h> {
    mode: EvalMode,
    host: Option<&'h dyn HostDispatcher>,
}

/// The v2 whitelisted numeric builtin table: (name, exact arity). Callees are
/// admitted ONLY as bare identifiers — member calls never reach the table.
const NUMERIC_BUILTINS: &[(&str, usize)] = &[
    ("sqrt", 1),
    ("sin", 1),
    ("cos", 1),
    ("acos", 1),
    ("min", 2),
    ("max", 2),
    ("abs", 1),
    ("floor", 1),
];

/// Keys the engine runtime refuses everywhere (prototype-pollution guard). The
/// Rust value model has no prototype chain, but the conformance legs must agree
/// on which programs are admitted, so the same keys are structured errors here.
const DANGEROUS_KEYS: &[&str] = &["__proto__", "prototype", "constructor"];

#[derive(Debug, Clone, PartialEq)]
enum Value {
    Num(f64),
    Str(String),
    Bool(bool),
    Null,
    Arr(Vec<Value>),
    Obj(Vec<(String, Value)>),
    /// v5 opaque namespace handle produced by a whitelisted factory call. An
    /// evaluator-INTERNAL value: it may sit in a local and serve as a
    /// member-callee root, but it must never escape (return / object / array
    /// embedding, comparison, host-call argument are all structured
    /// `namespace-handle-escape` errors) and it never serializes.
    NsHandle(NsHandle),
}

/// Resolved namespace handle: the factory that produced it plus its function
/// table `(function, owning namespace)`, enumerated and collision-checked at
/// construction, sorted by function name for deterministic dispatch.
#[derive(Debug, Clone, PartialEq)]
struct NsHandle {
    factory: &'static str,
    functions: Vec<(String, String)>,
}

/// First namespace handle reachable in `value`, if any. Escape guards use this
/// so their structured errors can name the producing factory. Nesting a handle
/// inside an object/array is itself refused at literal construction, so the
/// recursion is defensive rather than reachable depth.
fn find_handle(value: &Value) -> Option<&NsHandle> {
    match value {
        Value::NsHandle(handle) => Some(handle),
        Value::Arr(items) => items.iter().find_map(find_handle),
        Value::Obj(entries) => entries.iter().find_map(|(_, item)| find_handle(item)),
        _ => None,
    }
}

#[derive(Debug)]
struct EvalError {
    code: &'static str,
    message: String,
}

fn err(code: &'static str, message: impl Into<String>) -> EvalError {
    EvalError {
        code,
        message: message.into(),
    }
}

enum Flow {
    Normal,
    Return(Value),
}

/// Public JSON boundary used by the `evaluate_trait_handler` wasm export (v1:
/// numeric builtins OFF — behavior identical to before the mode existed).
pub fn evaluate_trait_handler_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
) -> String {
    evaluate_with_mode_json(source, trait_name, handler_name, args_json, MODE_V1)
}

/// Public JSON boundary used by the `evaluate_trait_handler_v2` wasm export
/// (numeric builtin table ON — [`DETERMINISTIC_SUBSET_V2`]).
pub fn evaluate_trait_handler_v2_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
) -> String {
    evaluate_with_mode_json(source, trait_name, handler_name, args_json, MODE_V2)
}

/// Public JSON boundary used by the `evaluate_trait_handler_v3` wasm export
/// ([`DETERMINISTIC_SUBSET_V3`]). v3 is an honest alias of the v2 mode: the
/// statement walker has admitted the v3 grammar's bounded local bindings since
/// v1, so this runs [`MODE_V2`] unchanged (numeric builtins ON) under the
/// shared v3 subset id.
pub fn evaluate_trait_handler_v3_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
) -> String {
    evaluate_with_mode_json(source, trait_name, handler_name, args_json, MODE_V2)
}

fn evaluate_with_mode_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    mode: EvalMode,
) -> String {
    evaluate_with_ctx_json(
        source,
        trait_name,
        handler_name,
        args_json,
        &EvalCtx { mode, host: None },
    )
}

/// Public JSON boundary for the v4 host-binding mode
/// ([`DETERMINISTIC_SUBSET_V4`]): the v3 grammar plus member-callee calls into
/// the injected host-binding object, reached through the [`HostDispatcher`]
/// seam. The `evaluate_trait_handler_v4` wasm export wires the js_sys-backed
/// dispatcher over the real JS boundary; native callers (tests, embedders)
/// inject their own.
pub fn evaluate_trait_handler_v4_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    host: &dyn HostDispatcher,
) -> String {
    evaluate_with_ctx_json(
        source,
        trait_name,
        handler_name,
        args_json,
        &EvalCtx {
            mode: MODE_V4,
            host: Some(host),
        },
    )
}

/// Public JSON boundary for the v5 packaged-factories mode
/// ([`DETERMINISTIC_SUBSET_V5`]): the v4 grammar plus factory calls, handle
/// locals, and the `@on_spawn` factory-alias pre-pass — the mode that executes
/// the packaged `@holoscript/std` `.hsplus` sources as authored. The
/// `evaluate_trait_handler_v5` wasm export wires the js_sys-backed dispatcher;
/// native callers (tests, embedders) inject their own.
pub fn evaluate_trait_handler_v5_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    host: &dyn HostDispatcher,
) -> String {
    evaluate_with_ctx_json(
        source,
        trait_name,
        handler_name,
        args_json,
        &EvalCtx {
            mode: MODE_V5,
            host: Some(host),
        },
    )
}

fn evaluate_with_ctx_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    ctx: &EvalCtx,
) -> String {
    match evaluate(source, trait_name, handler_name, args_json, ctx) {
        Ok(value) => serde_json::json!({ "ok": true, "value": value_to_json(&value) }).to_string(),
        Err(error) => serde_json::json!({
            "ok": false,
            "error": { "code": error.code, "message": error.message }
        })
        .to_string(),
    }
}

fn evaluate(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    let ast = crate::parse_ast(source).map_err(|diagnostics| {
        let detail = diagnostics
            .iter()
            .map(|d| format!("{} (line {}, column {})", d.message, d.line, d.column))
            .collect::<Vec<_>>()
            .join("; ");
        err("parse-error", format!("source failed to parse: {detail}"))
    })?;

    let (trait_node, handler) = find_handler(&ast.body, trait_name, handler_name)?;

    let Some(body) = handler.parsed_body.as_ref() else {
        return Err(err(
            "unparsed-body",
            format!(
                "handler \"{handler_name}\" body did not parse as statements in the wasm subset \
                 grammar (parsed_body is None). Known grammar limits: no ternary `?:` conditional \
                 expression and no `===`/`!==` tokens — author conditionals as if/else blocks and \
                 use `==`/`!=`."
            ),
        ));
    };

    let mut scope = bind_args(&handler.params, handler_name, args_json)?;
    if ctx.mode.factories {
        prebind_spawn_factory_aliases(trait_node, &handler.params, &mut scope, ctx)?;
    }
    run_handler(body, scope, handler_name, ctx)
}

/// v5 `@on_spawn` factory pre-pass: statically scan the trait's `@on_spawn`
/// parsed body for statements of the EXACT shape `<alias> = <factory>()` (bare
/// `=` assignment to a bare identifier, zero-argument bare-identifier call
/// whose callee is in [`FACTORIES`]) and pre-bind each alias as a handle local
/// before the invoked handler executes. on_spawn side effects are not
/// executed; only factory-alias bindings are statically lifted — `emit(...)`
/// calls and every other on_spawn statement shape are ignored. Handler
/// parameters take precedence over aliases (params → locals); a later alias
/// assignment overwrites an earlier one, mirroring execution order.
fn prebind_spawn_factory_aliases(
    trait_node: &TraitNode,
    params: &[String],
    scope: &mut BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<(), EvalError> {
    for member in &trait_node.members {
        let AstNode::GameEventBlock(spawn) = member else {
            continue;
        };
        if spawn.name != "on_spawn" {
            continue;
        }
        let Some(body) = spawn.parsed_body.as_ref() else {
            continue;
        };
        for statement in body {
            let AstNode::Assignment(assignment) = statement else {
                continue;
            };
            if assignment.operator != "=" {
                continue;
            }
            let AstNode::Identifier(alias) = assignment.target.as_ref() else {
                continue;
            };
            let AstNode::CallExpression(call) = assignment.value.as_ref() else {
                continue;
            };
            if !call.arguments.is_empty() {
                continue;
            }
            let AstNode::Identifier(callee) = call.callee.as_ref() else {
                continue;
            };
            let Some((factory, namespaces)) =
                FACTORIES.iter().find(|(name, _)| *name == callee.name)
            else {
                continue;
            };
            if !is_safe_identifier(&alias.name) || params.iter().any(|p| p == &alias.name) {
                continue;
            }
            let handle = construct_factory_handle(factory, namespaces, ctx)?;
            scope.insert(alias.name.clone(), Value::NsHandle(handle));
        }
    }
    Ok(())
}

fn find_handler<'a>(
    top_level: &'a [AstNode],
    trait_name: &str,
    handler_name: &str,
) -> Result<(&'a TraitNode, &'a GameEventBlockNode), EvalError> {
    let mut traits: Vec<&TraitNode> = Vec::new();
    for node in top_level {
        if let AstNode::Trait(t) = node {
            if t.name == trait_name {
                traits.push(t);
            }
        }
    }
    if traits.is_empty() {
        return Err(err(
            "trait-not-found",
            format!("no top-level @trait named \"{trait_name}\""),
        ));
    }
    if traits.len() > 1 {
        return Err(err(
            "ambiguous-trait",
            format!(
                "{} top-level @trait definitions named \"{trait_name}\"",
                traits.len()
            ),
        ));
    }

    let mut handlers: Vec<&GameEventBlockNode> = Vec::new();
    for member in &traits[0].members {
        if let AstNode::GameEventBlock(handler) = member {
            if handler.name == handler_name {
                handlers.push(handler);
            }
        }
    }
    if handlers.is_empty() {
        return Err(err(
            "handler-not-found",
            format!("@trait \"{trait_name}\" has no @{handler_name} handler"),
        ));
    }
    if handlers.len() > 1 {
        return Err(err(
            "ambiguous-handler",
            format!(
                "@trait \"{trait_name}\" declares {} handlers named \"{handler_name}\"",
                handlers.len()
            ),
        ));
    }
    Ok((traits[0], handlers[0]))
}

fn is_safe_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_' || first == '$') {
        return false;
    }
    if !chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$') {
        return false;
    }
    !DANGEROUS_KEYS.contains(&name)
}

/// Bind declared handler params by NAME from the args JSON object. Mirrors the
/// engine's invoke contract: the provided keys must be EXACTLY the declared
/// parameter set — a missing or extra key is a structured error, not a default.
fn bind_args(
    params: &[String],
    handler_name: &str,
    args_json: &str,
) -> Result<BTreeMap<String, Value>, EvalError> {
    for param in params {
        if !is_safe_identifier(param) {
            return Err(err(
                "unsafe-key",
                format!("handler \"{handler_name}\" declares unsafe parameter name \"{param}\""),
            ));
        }
    }
    let mut seen = BTreeMap::new();
    for param in params {
        if seen.insert(param.clone(), ()).is_some() {
            return Err(err(
                "duplicate-parameter",
                format!("handler \"{handler_name}\" declares duplicate parameter \"{param}\""),
            ));
        }
    }

    let parsed: serde_json::Value = serde_json::from_str(args_json).map_err(|error| {
        err(
            "invalid-args",
            format!("args_json is not valid JSON: {error}"),
        )
    })?;
    let serde_json::Value::Object(object) = parsed else {
        return Err(err("invalid-args", "args_json must be a JSON object"));
    };

    for key in object.keys() {
        if !params.iter().any(|p| p == key) {
            return Err(err(
                "unexpected-argument",
                format!(
                    "argument \"{key}\" does not match a declared parameter of \"{handler_name}\""
                ),
            ));
        }
    }

    let mut scope = BTreeMap::new();
    for param in params {
        let Some(value) = object.get(param) else {
            return Err(err(
                "missing-argument",
                format!("handler \"{handler_name}\" parameter \"{param}\" is missing from args"),
            ));
        };
        scope.insert(param.clone(), json_to_value(value, param)?);
    }
    Ok(scope)
}

/// Convert strict JSON into the evaluator value model. Mirrors the engine's
/// canonicalization: `-0` normalizes to `+0` (JSON canonicalization in the
/// engine round-trips `-0` through `JSON.stringify`, which yields `0`), and
/// prototype-dangerous keys are refused anywhere in the tree.
fn json_to_value(json: &serde_json::Value, label: &str) -> Result<Value, EvalError> {
    match json {
        serde_json::Value::Null => Ok(Value::Null),
        serde_json::Value::Bool(b) => Ok(Value::Bool(*b)),
        serde_json::Value::Number(n) => {
            let Some(f) = n.as_f64() else {
                return Err(err(
                    "non-finite",
                    format!("argument \"{label}\" is not representable as a finite f64"),
                ));
            };
            if !f.is_finite() {
                return Err(err(
                    "non-finite",
                    format!("argument \"{label}\" is not a finite number"),
                ));
            }
            // Engine parity: canonicalization normalizes -0 to +0 before evaluation.
            Ok(Value::Num(if f == 0.0 { 0.0 } else { f }))
        }
        serde_json::Value::String(s) => Ok(Value::Str(s.clone())),
        serde_json::Value::Array(items) => {
            let mut out = Vec::with_capacity(items.len());
            for (index, item) in items.iter().enumerate() {
                out.push(json_to_value(item, &format!("{label}[{index}]"))?);
            }
            Ok(Value::Arr(out))
        }
        serde_json::Value::Object(map) => {
            let mut out = Vec::with_capacity(map.len());
            for (key, item) in map {
                if DANGEROUS_KEYS.contains(&key.as_str()) {
                    return Err(err(
                        "unsafe-key",
                        format!("argument \"{label}\" contains forbidden key \"{key}\""),
                    ));
                }
                out.push((key.clone(), json_to_value(item, &format!("{label}.{key}"))?));
            }
            Ok(Value::Obj(out))
        }
    }
}

fn value_to_json(value: &Value) -> serde_json::Value {
    match value {
        Value::Num(f) => serde_json::Number::from_f64(*f)
            .map(serde_json::Value::Number)
            // Unreachable: every produced number is checked finite before it
            // becomes a Value. Fail closed to null rather than panic in wasm.
            .unwrap_or(serde_json::Value::Null),
        Value::Str(s) => serde_json::Value::String(s.clone()),
        Value::Bool(b) => serde_json::Value::Bool(*b),
        Value::Null => serde_json::Value::Null,
        Value::Arr(items) => serde_json::Value::Array(items.iter().map(value_to_json).collect()),
        Value::Obj(entries) => {
            let mut map = serde_json::Map::new();
            for (key, item) in entries {
                map.insert(key.clone(), value_to_json(item));
            }
            serde_json::Value::Object(map)
        }
        // Unreachable: every path that serializes a value (handler return,
        // host-call arguments) refuses handles first (namespace-handle-escape).
        // Fail closed to null rather than panic in wasm if that ever drifts.
        Value::NsHandle(_) => serde_json::Value::Null,
    }
}

fn run_handler(
    body: &[AstNode],
    mut scope: BTreeMap<String, Value>,
    handler_name: &str,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    match exec_block(body, &mut scope, ctx)? {
        Flow::Return(value) => Ok(value),
        Flow::Normal => Err(err(
            "no-return",
            format!("handler \"{handler_name}\" completed without an explicit return"),
        )),
    }
}

fn exec_block(
    statements: &[AstNode],
    scope: &mut BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Flow, EvalError> {
    for statement in statements {
        if let Flow::Return(value) = exec_statement(statement, scope, ctx)? {
            return Ok(Flow::Return(value));
        }
    }
    Ok(Flow::Normal)
}

fn exec_statement(
    node: &AstNode,
    scope: &mut BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Flow, EvalError> {
    match node {
        AstNode::Return(ret) => {
            let value = match ret.argument.as_ref() {
                Some(argument) => eval_expr(argument, scope, ctx)?,
                None => Value::Null,
            };
            if let Some(handle) = find_handle(&value) {
                return Err(err(
                    "namespace-handle-escape",
                    format!(
                        "returning a namespace handle (from {}()) is not admitted — namespace \
                         handles never escape the handler",
                        handle.factory
                    ),
                ));
            }
            Ok(Flow::Return(value))
        }
        AstNode::If(node) => {
            let Value::Bool(test) = eval_expr(&node.test, scope, ctx)? else {
                return Err(err(
                    "type-mismatch",
                    "if condition requires a boolean (no truthiness in the deterministic subset)",
                ));
            };
            if test {
                exec_block(&node.consequent, scope, ctx)
            } else if let Some(alternate) = node.alternate.as_ref() {
                exec_block(alternate, scope, ctx)
            } else {
                Ok(Flow::Normal)
            }
        }
        AstNode::Assignment(node) => {
            if node.operator != "=" {
                return Err(err(
                    "unsupported-operator",
                    format!(
                        "compound assignment \"{}\" is not in the deterministic subset (plain `=` only)",
                        node.operator
                    ),
                ));
            }
            let AstNode::Identifier(target) = node.target.as_ref() else {
                return Err(err(
                    "unsupported-node",
                    "assignment target must be a bare local identifier",
                ));
            };
            if !is_safe_identifier(&target.name) {
                return Err(err(
                    "unsafe-key",
                    format!(
                        "assignment target \"{}\" is not a safe identifier",
                        target.name
                    ),
                ));
            }
            let value = eval_expr(&node.value, scope, ctx)?;
            scope.insert(target.name.clone(), value);
            Ok(Flow::Normal)
        }
        AstNode::Comment(_) => Ok(Flow::Normal),
        other => Err(err(
            "unsupported-node",
            format!(
                "statement {} is not in the deterministic subset v0",
                node_kind(other)
            ),
        )),
    }
}

fn eval_expr(
    node: &AstNode,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    match node {
        AstNode::Number(n) => checked_number(n.value, "number literal"),
        AstNode::String(s) => Ok(Value::Str(s.value.clone())),
        AstNode::Boolean(b) => Ok(Value::Bool(b.value)),
        AstNode::Null(_) => Ok(Value::Null),
        AstNode::Identifier(id) => scope.get(&id.name).cloned().ok_or_else(|| {
            err(
                "unknown-identifier",
                format!("identifier \"{}\" is not a bound parameter or local", id.name),
            )
        }),
        AstNode::MemberExpression(member) => {
            if member.computed {
                return Err(err(
                    "unsupported-node",
                    "computed member access is not in the deterministic subset",
                ));
            }
            let AstNode::Identifier(property) = member.property.as_ref() else {
                return Err(err("unsupported-node", "malformed member access property"));
            };
            if !is_safe_identifier(&property.name) {
                return Err(err(
                    "unsafe-key",
                    format!("member access uses unsafe key \"{}\"", property.name),
                ));
            }
            let object = eval_expr(&member.object, scope, ctx)?;
            let Value::Obj(entries) = object else {
                return Err(err(
                    "type-mismatch",
                    format!("member access \".{}\" requires an object", property.name),
                ));
            };
            entries
                .iter()
                .find(|(key, _)| key == &property.name)
                .map(|(_, value)| value.clone())
                .ok_or_else(|| {
                    err(
                        "unknown-member",
                        format!("member \"{}\" is missing from the object", property.name),
                    )
                })
        }
        AstNode::ObjectLiteral(object) => {
            let mut entries: Vec<(String, Value)> = Vec::with_capacity(object.properties.len());
            for property in &object.properties {
                eval_object_property(property, scope, ctx, &mut entries)?;
            }
            Ok(Value::Obj(entries))
        }
        AstNode::Array(array) => {
            let mut items = Vec::with_capacity(array.elements.len());
            for element in &array.elements {
                if matches!(element, AstNode::SpreadElement(_)) {
                    return Err(err(
                        "unsupported-node",
                        "spread elements are not in the deterministic subset",
                    ));
                }
                let item = eval_expr(element, scope, ctx)?;
                if let Some(handle) = find_handle(&item) {
                    return Err(err(
                        "namespace-handle-escape",
                        format!(
                            "embedding a namespace handle (from {}()) in an array literal is not \
                             admitted — namespace handles never escape the handler",
                            handle.factory
                        ),
                    ));
                }
                items.push(item);
            }
            Ok(Value::Arr(items))
        }
        AstNode::BinaryExpression(binary) => eval_binary(binary, scope, ctx),
        AstNode::UnaryExpression(unary) => match unary.operator.as_str() {
            "!" => {
                let Value::Bool(argument) = eval_expr(&unary.argument, scope, ctx)? else {
                    return Err(err("type-mismatch", "logical not requires a boolean"));
                };
                Ok(Value::Bool(!argument))
            }
            "-" => {
                let argument =
                    numeric_operand(eval_expr(&unary.argument, scope, ctx)?, "negation")?;
                checked_number(-argument, "negation")
            }
            other => Err(err(
                "unsupported-operator",
                format!("unary operator \"{other}\" is not in the deterministic subset"),
            )),
        },
        AstNode::CallExpression(call) => {
            if !ctx.mode.numeric_builtins {
                // v1 behavior, byte-for-byte: every call is refused with the
                // same code and message as before the v2 mode existed.
                return Err(err(
                    "unsupported-call",
                    "function calls are not in the deterministic subset v0 (no host library, no math builtins)",
                ));
            }
            if ctx.mode.host_bindings {
                if let AstNode::MemberExpression(member) = call.callee.as_ref() {
                    // v4: member callees are host-binding calls (`ns.fn`).
                    // Bare-identifier callees fall through to the builtin
                    // table unchanged.
                    return eval_host_call(call, member, scope, ctx);
                }
            }
            if ctx.mode.factories {
                // v5: a bare-identifier zero-argument call in the factory
                // table constructs a namespace handle — unless the name is
                // shadowed by a bound parameter/local (bound names take
                // precedence, same rule as v4 namespaces; the shadowed call
                // then falls through to the builtin table's refusal).
                if let AstNode::Identifier(callee) = call.callee.as_ref() {
                    if !scope.contains_key(&callee.name) {
                        if let Some((factory, namespaces)) =
                            FACTORIES.iter().find(|(name, _)| *name == callee.name)
                        {
                            return eval_factory_call(call, factory, namespaces, ctx);
                        }
                    }
                }
            }
            eval_builtin_call(call, scope, ctx)
        }
        other => Err(err(
            "unsupported-node",
            format!("expression {} is not in the deterministic subset v0", node_kind(other)),
        )),
    }
}

/// Evaluate one v5 factory call: zero arguments required, then construct the
/// namespace handle over the factory's backing namespaces.
fn eval_factory_call(
    call: &crate::ast::CallExpression,
    factory: &'static str,
    namespaces: &'static [&'static str],
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    if !call.arguments.is_empty() {
        return Err(err(
            "factory-arity",
            format!(
                "factory \"{factory}\" takes exactly 0 arguments, got {}",
                call.arguments.len()
            ),
        ));
    }
    Ok(Value::NsHandle(construct_factory_handle(
        factory, namespaces, ctx,
    )?))
}

/// Construct one namespace handle: enumerate the OWN functions of every
/// backing namespace through the [`HostDispatcher::functions`] seam, refuse a
/// missing namespace (`unknown-host-binding`) and any function-name collision
/// across the union (`namespace-collision`), and pin the resulting
/// `(function, namespace)` table sorted by function name. Names that are not
/// safe identifiers are dropped at construction — the member-callee grammar
/// could never dispatch them anyway, and they must not trigger collisions.
fn construct_factory_handle(
    factory: &'static str,
    namespaces: &[&str],
    ctx: &EvalCtx,
) -> Result<NsHandle, EvalError> {
    let Some(host) = ctx.host else {
        // The public v5 entry point always installs a dispatcher; fail closed
        // (never panic) if a future caller wires the mode without one.
        return Err(err(
            "unknown-host-binding",
            "v5 factory mode is active but no host-binding object was injected",
        ));
    };
    let mut functions: Vec<(String, String)> = Vec::new();
    for namespace in namespaces {
        let Some(mut names) = host.functions(namespace) else {
            return Err(err(
                "unknown-host-binding",
                format!(
                    "factory \"{factory}\": namespace \"{namespace}\" is not present in the \
                     injected host-binding object"
                ),
            ));
        };
        names.sort();
        names.dedup();
        for name in names {
            if !is_safe_identifier(&name) {
                continue;
            }
            if let Some((_, owner)) = functions.iter().find(|(existing, _)| existing == &name) {
                return Err(err(
                    "namespace-collision",
                    format!(
                        "factory \"{factory}\": function \"{name}\" exists in both \"{owner}\" \
                         and \"{namespace}\" — the union handle cannot be constructed"
                    ),
                ));
            }
            functions.push((name, (*namespace).to_string()));
        }
    }
    functions.sort();
    Ok(NsHandle { factory, functions })
}

/// Dispatch one member call whose root resolved to a handle-valued local (v5):
/// resolve the function in the handle's construction-pinned table BEFORE
/// argument evaluation (source-order mirror of the v4 lookup), then marshal
/// and invoke through the same rails as an ambient v4 host call.
fn eval_handle_call(
    call: &crate::ast::CallExpression,
    handle: &NsHandle,
    function: &str,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    let Some((_, namespace)) = handle
        .functions
        .iter()
        .find(|(name, _)| name == function)
    else {
        return Err(err(
            "unknown-host-binding",
            format!(
                "the namespace handle from {}() has no function \"{function}\"",
                handle.factory
            ),
        ));
    };
    let Some(host) = ctx.host else {
        return Err(err(
            "unknown-host-binding",
            "v5 factory mode is active but no host-binding object was injected",
        ));
    };
    let args_json = marshal_host_args(&call.arguments, scope, ctx)?;
    let context = format!(
        "host binding {namespace}.{function} (via {}() handle)",
        handle.factory
    );
    host_outcome_to_value(host.invoke(namespace, function, &args_json), &context)
}

/// Evaluate host-call arguments in source order and marshal each as canonical
/// strict JSON. A namespace handle in argument position is a structured
/// `namespace-handle-escape` error — handles never cross the boundary.
fn marshal_host_args(
    arguments: &[AstNode],
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Vec<String>, EvalError> {
    let mut args_json = Vec::with_capacity(arguments.len());
    for argument in arguments {
        let value = eval_expr(argument, scope, ctx)?;
        if let Some(handle) = find_handle(&value) {
            return Err(err(
                "namespace-handle-escape",
                format!(
                    "passing a namespace handle (from {}()) as a host-binding argument is not \
                     admitted — namespace handles never escape the handler",
                    handle.factory
                ),
            ));
        }
        args_json.push(value_to_json(&value).to_string());
    }
    Ok(args_json)
}

/// Map one [`HostInvokeOutcome`] back into the evaluator: throws become
/// `host-binding-error`, non-JSON results `invalid-host-result`, and a value
/// re-enters through the same rails as handler arguments ([`json_to_value`]).
fn host_outcome_to_value(outcome: HostInvokeOutcome, context: &str) -> Result<Value, EvalError> {
    match outcome {
        HostInvokeOutcome::Threw(message) => Err(err("host-binding-error", message)),
        HostInvokeOutcome::NotSerializable(detail) => Err(err(
            "invalid-host-result",
            format!("{context} returned a non-JSON-serializable result: {detail}"),
        )),
        HostInvokeOutcome::Value(json) => {
            let parsed: serde_json::Value = serde_json::from_str(&json).map_err(|error| {
                err(
                    "invalid-host-result",
                    format!("{context} returned text that is not strict JSON: {error}"),
                )
            })?;
            json_to_value(&parsed, context)
        }
    }
}

/// Evaluate one host-binding call (v4 mode): the callee is a NON-COMPUTED
/// member expression `ns.fn` whose root must be a bare identifier that is
/// neither a bound parameter nor a local (bound names take precedence and keep
/// the v3 semantics: member calls on VALUES stay refused — except, in v5, a
/// HANDLE-valued local, which dispatches on the handle). Callee resolution
/// happens before argument evaluation; arguments then evaluate in source order
/// and marshal guest→host as canonical strict JSON (one JSON string per
/// argument). The host result marshals back as JSON and re-enters through the
/// same rails as handler arguments ([`json_to_value`]: finite numbers, `-0`
/// normalized, dangerous keys refused). Host throws, unknown bindings, and
/// non-JSON results are structured errors, never panics.
fn eval_host_call(
    call: &crate::ast::CallExpression,
    member: &crate::ast::MemberExpression,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    if member.computed {
        return Err(err(
            "unsupported-call",
            "computed member callees are not in the deterministic subset — host-binding calls \
             are non-computed `ns.fn` only",
        ));
    }
    let AstNode::Identifier(function) = member.property.as_ref() else {
        return Err(err("unsupported-call", "malformed member callee property"));
    };
    let AstNode::Identifier(root) = member.object.as_ref() else {
        return Err(err(
            "unsupported-call",
            "host-binding callee root must be a bare namespace identifier — nested member \
             callees are not admitted",
        ));
    };
    if let Some(bound) = scope.get(&root.name) {
        if ctx.mode.factories {
            if let Value::NsHandle(handle) = bound {
                // v5: a handle-valued local in callee-root position dispatches
                // the named function on the handle. Non-handle bound values
                // keep the v4 refusal below; params → locals precedence is
                // preserved because both live in the one binding namespace.
                return eval_handle_call(call, handle, &function.name, scope, ctx);
            }
        }
        return Err(err(
            "unsupported-call",
            format!(
                "\"{}\" is a bound parameter or local here — member calls on values are not in \
                 the deterministic subset (host namespaces resolve only when the callee root is \
                 unbound)",
                root.name
            ),
        ));
    }
    if !is_safe_identifier(&root.name) || !is_safe_identifier(&function.name) {
        return Err(err(
            "unsafe-key",
            format!(
                "host-binding callee \"{}.{}\" uses an unsafe identifier",
                root.name, function.name
            ),
        ));
    }
    let Some(host) = ctx.host else {
        // The public v4 entry points always install a dispatcher; fail closed
        // (never panic) if a future caller wires the mode without one.
        return Err(err(
            "unknown-host-binding",
            "v4 host-binding mode is active but no host-binding object was injected",
        ));
    };
    match host.lookup(&root.name, &function.name) {
        HostLookup::UnknownNamespace => {
            return Err(err(
                "unknown-host-binding",
                format!(
                    "namespace \"{}\" is not present in the injected host-binding object",
                    root.name
                ),
            ));
        }
        HostLookup::UnknownFunction => {
            return Err(err(
                "unknown-host-binding",
                format!(
                    "namespace \"{}\" has no host function \"{}\"",
                    root.name, function.name
                ),
            ));
        }
        HostLookup::Found => {}
    }
    let args_json = marshal_host_args(&call.arguments, scope, ctx)?;
    let context = format!("host binding {}.{}", root.name, function.name);
    host_outcome_to_value(host.invoke(&root.name, &function.name, &args_json), &context)
}

/// Evaluate one whitelisted numeric builtin call (v2 mode only). Admission is
/// strictly: bare-identifier callee in [`NUMERIC_BUILTINS`], exact arity,
/// every argument a number; the f64 result passes through [`checked_number`]
/// so domain errors (`sqrt(-1)`, `acos(2)` → NaN) fail closed as `non-finite`.
fn eval_builtin_call(
    call: &crate::ast::CallExpression,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    let table_names = || {
        NUMERIC_BUILTINS
            .iter()
            .map(|(name, _)| *name)
            .collect::<Vec<_>>()
            .join(", ")
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        // Member calls (math.sqrt(x)) and computed callees stay refused in v2:
        // only BARE identifiers reach the builtin table.
        return Err(err(
            "unsupported-call",
            format!(
                "only bare-identifier calls into the v2 numeric-builtin table ({}) are admitted \
                 — member calls are not",
                table_names()
            ),
        ));
    };
    let Some((_, arity)) = NUMERIC_BUILTINS
        .iter()
        .find(|(name, _)| *name == callee.name)
    else {
        return Err(err(
            "unsupported-call",
            format!(
                "\"{}\" is not in the v2 numeric-builtin table ({})",
                callee.name,
                table_names()
            ),
        ));
    };
    if call.arguments.len() != *arity {
        return Err(err(
            "builtin-arity",
            format!(
                "builtin \"{}\" takes exactly {} argument{}, got {}",
                callee.name,
                arity,
                if *arity == 1 { "" } else { "s" },
                call.arguments.len()
            ),
        ));
    }
    let mut operands = Vec::with_capacity(call.arguments.len());
    for (index, argument) in call.arguments.iter().enumerate() {
        let Value::Num(operand) = eval_expr(argument, scope, ctx)? else {
            return Err(err(
                "type-mismatch",
                format!(
                    "builtin \"{}\" argument {} must evaluate to a number",
                    callee.name,
                    index + 1
                ),
            ));
        };
        operands.push(operand);
    }
    let result = match callee.name.as_str() {
        "sqrt" => operands[0].sqrt(),
        "sin" => operands[0].sin(),
        "cos" => operands[0].cos(),
        "acos" => operands[0].acos(),
        "min" => operands[0].min(operands[1]),
        "max" => operands[0].max(operands[1]),
        "abs" => operands[0].abs(),
        "floor" => operands[0].floor(),
        // Unreachable while the table and this match agree; fail closed rather
        // than panic in wasm if they ever drift.
        other => {
            return Err(err(
                "unsupported-call",
                format!("builtin \"{other}\" is in the table but has no evaluation rule"),
            ))
        }
    };
    checked_number(result, &format!("builtin {}", callee.name))
}

fn eval_object_property(
    property: &PropertyNode,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
    entries: &mut Vec<(String, Value)>,
) -> Result<(), EvalError> {
    if property.optional || property.default_value.is_some() {
        return Err(err(
            "unsupported-node",
            format!(
                "object literal key \"{}\" carries an optional marker or typed default — not an \
                 expression form in the deterministic subset",
                property.key
            ),
        ));
    }
    if !is_safe_identifier(&property.key) {
        return Err(err(
            "unsafe-key",
            format!(
                "object literal key \"{}\" is not a safe identifier",
                property.key
            ),
        ));
    }
    if entries.iter().any(|(key, _)| key == &property.key) {
        return Err(err(
            "duplicate-key",
            format!("object literal contains duplicate key \"{}\"", property.key),
        ));
    }
    let value = eval_expr(&property.value, scope, ctx)?;
    if let Some(handle) = find_handle(&value) {
        return Err(err(
            "namespace-handle-escape",
            format!(
                "embedding a namespace handle (from {}()) in an object literal (key \"{}\") is \
                 not admitted — namespace handles never escape the handler",
                handle.factory, property.key
            ),
        ));
    }
    entries.push((property.key.clone(), value));
    Ok(())
}

fn eval_binary(
    binary: &crate::ast::BinaryExpression,
    scope: &BTreeMap<String, Value>,
    ctx: &EvalCtx,
) -> Result<Value, EvalError> {
    match binary.operator.as_str() {
        // Logical operators short-circuit exactly like the engine runtime.
        "&&" => {
            let Value::Bool(left) = eval_expr(&binary.left, scope, ctx)? else {
                return Err(err("type-mismatch", "logical and requires booleans"));
            };
            if !left {
                return Ok(Value::Bool(false));
            }
            let Value::Bool(right) = eval_expr(&binary.right, scope, ctx)? else {
                return Err(err("type-mismatch", "logical and requires booleans"));
            };
            Ok(Value::Bool(right))
        }
        "||" => {
            let Value::Bool(left) = eval_expr(&binary.left, scope, ctx)? else {
                return Err(err("type-mismatch", "logical or requires booleans"));
            };
            if left {
                return Ok(Value::Bool(true));
            }
            let Value::Bool(right) = eval_expr(&binary.right, scope, ctx)? else {
                return Err(err("type-mismatch", "logical or requires booleans"));
            };
            Ok(Value::Bool(right))
        }
        "+" => {
            let left = eval_expr(&binary.left, scope, ctx)?;
            let right = eval_expr(&binary.right, scope, ctx)?;
            match (left, right) {
                (Value::Num(l), Value::Num(r)) => checked_number(l + r, "addition"),
                (Value::Str(l), Value::Str(r)) => Ok(Value::Str(format!("{l}{r}"))),
                _ => Err(err(
                    "type-mismatch",
                    "addition requires two numbers or two strings",
                )),
            }
        }
        "-" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, ctx)?, "subtraction")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, ctx)?, "subtraction")?;
            checked_number(left - right, "subtraction")
        }
        "*" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, ctx)?, "multiplication")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, ctx)?, "multiplication")?;
            checked_number(left * right, "multiplication")
        }
        "/" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, ctx)?, "division")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, ctx)?, "division")?;
            if right == 0.0 {
                return Err(err("division-by-zero", "division by zero is not admitted"));
            }
            checked_number(left / right, "division")
        }
        // `===`/`!==` never reach here through the wasm grammar (the lexer has no
        // triple-equals token), but the engine admits them as aliases of `==`/`!=`,
        // so keep the mapping total for AST-level callers.
        "==" | "===" => Ok(Value::Bool(primitive_equal(
            &eval_expr(&binary.left, scope, ctx)?,
            &eval_expr(&binary.right, scope, ctx)?,
        )?)),
        "!=" | "!==" => Ok(Value::Bool(!primitive_equal(
            &eval_expr(&binary.left, scope, ctx)?,
            &eval_expr(&binary.right, scope, ctx)?,
        )?)),
        "<" | ">" | "<=" | ">=" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, ctx)?, "comparison")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, ctx)?, "comparison")?;
            Ok(Value::Bool(match binary.operator.as_str() {
                "<" => left < right,
                ">" => left > right,
                "<=" => left <= right,
                _ => left >= right,
            }))
        }
        // Null-coalescing joins the subset with v5 packaged execution: the
        // packaged std sources default JSON-null arguments (`step ?? 1`,
        // `sep ?? ","`) — strict JSON has no undefined, so null is the only
        // absent-value form. Short-circuits like the logical operators;
        // namespace handles cannot flow through.
        "??" if ctx.mode.factories => {
            let left = eval_expr(&binary.left, scope, ctx)?;
            if find_handle(&left).is_some() {
                return Err(err(
                    "namespace-handle-escape",
                    "a namespace handle cannot flow through ??",
                ));
            }
            if matches!(left, Value::Null) {
                let right = eval_expr(&binary.right, scope, ctx)?;
                if find_handle(&right).is_some() {
                    return Err(err(
                        "namespace-handle-escape",
                        "a namespace handle cannot flow through ??",
                    ));
                }
                return Ok(right);
            }
            Ok(left)
        }
        other => Err(err(
            "unsupported-operator",
            format!("binary operator \"{other}\" is not in the deterministic subset"),
        )),
    }
}

/// Primitive equality, mirroring the engine's `primitiveEqual`: arrays/objects
/// are a structured error; mismatched PRIMITIVE types compare unequal (JS `===`
/// semantics), they do not error.
fn primitive_equal(left: &Value, right: &Value) -> Result<bool, EvalError> {
    if let Some(handle) = find_handle(left).or_else(|| find_handle(right)) {
        return Err(err(
            "namespace-handle-escape",
            format!(
                "comparing a namespace handle (from {}()) is not admitted — namespace handles \
                 never escape the handler",
                handle.factory
            ),
        ));
    }
    if matches!(left, Value::Obj(_) | Value::Arr(_))
        || matches!(right, Value::Obj(_) | Value::Arr(_))
    {
        return Err(err(
            "unsupported-operation",
            "equality over arrays or objects is not admitted",
        ));
    }
    Ok(match (left, right) {
        (Value::Num(l), Value::Num(r)) => l == r,
        (Value::Str(l), Value::Str(r)) => l == r,
        (Value::Bool(l), Value::Bool(r)) => l == r,
        (Value::Null, Value::Null) => true,
        _ => false,
    })
}

fn numeric_operand(value: Value, context: &str) -> Result<f64, EvalError> {
    match value {
        Value::Num(f) => Ok(f),
        _ => Err(err(
            "type-mismatch",
            format!("{context} requires a finite number operand"),
        )),
    }
}

/// Every produced number is checked: non-finite and negative-zero results fail
/// closed, mirroring the engine's `finiteResult`.
fn checked_number(value: f64, context: &str) -> Result<Value, EvalError> {
    if !value.is_finite() {
        return Err(err(
            "non-finite",
            format!("{context} produced a non-finite number"),
        ));
    }
    if value == 0.0 && value.is_sign_negative() {
        return Err(err(
            "negative-zero",
            format!("{context} produced negative zero"),
        ));
    }
    Ok(Value::Num(value))
}

fn node_kind(node: &AstNode) -> &'static str {
    match node {
        AstNode::Composition(_) => "Composition",
        AstNode::World(_) => "World",
        AstNode::Orb(_) => "Orb",
        AstNode::Entity(_) => "Entity",
        AstNode::Object(_) => "Object",
        AstNode::Template(_) => "Template",
        AstNode::Group(_) => "Group",
        AstNode::Timeline(_) => "Timeline",
        AstNode::Track(_) => "Track",
        AstNode::Environment(_) => "Environment",
        AstNode::Logic(_) => "Logic",
        AstNode::Npc(_) => "Npc",
        AstNode::Quest(_) => "Quest",
        AstNode::Ability(_) => "Ability",
        AstNode::Dialogue(_) => "Dialogue",
        AstNode::StateMachine(_) => "StateMachine",
        AstNode::Achievement(_) => "Achievement",
        AstNode::TalentTree(_) => "TalentTree",
        AstNode::Property(_) => "Property",
        AstNode::Trait(_) => "Trait",
        AstNode::Array(_) => "Array",
        AstNode::ObjectLiteral(_) => "ObjectLiteral",
        AstNode::String(_) => "String",
        AstNode::Number(_) => "Number",
        AstNode::Boolean(_) => "Boolean",
        AstNode::Null(_) => "Null",
        AstNode::Identifier(_) => "Identifier",
        AstNode::BinaryExpression(_) => "BinaryExpression",
        AstNode::UnaryExpression(_) => "UnaryExpression",
        AstNode::CallExpression(_) => "CallExpression",
        AstNode::LambdaExpression(_) => "LambdaExpression",
        AstNode::MemberExpression(_) => "MemberExpression",
        AstNode::SpreadElement(_) => "SpreadElement",
        AstNode::Using(_) => "Using",
        AstNode::Import(_) => "Import",
        AstNode::Export(_) => "Export",
        AstNode::Function(_) => "Function",
        AstNode::Return(_) => "Return",
        AstNode::If(_) => "If",
        AstNode::For(_) => "For",
        AstNode::ForOf(_) => "ForOf",
        AstNode::While(_) => "While",
        AstNode::EnumDeclaration(_) => "EnumDeclaration",
        AstNode::StructDeclaration(_) => "StructDeclaration",
        AstNode::VariableDeclaration(_) => "VariableDeclaration",
        AstNode::StackSlotDeclaration(_) => "StackSlotDeclaration",
        AstNode::LexicalScope(_) => "LexicalScope",
        AstNode::Assignment(_) => "Assignment",
        AstNode::EventHandler(_) => "EventHandler",
        AstNode::MovementStatement(_) => "MovementStatement",
        AstNode::ActionDecl(_) => "ActionDecl",
        AstNode::GameEventBlock(_) => "GameEventBlock",
        AstNode::Comment(_) => "Comment",
        AstNode::FrameDeclaration(_) => "FrameDeclaration",
    }
}

/// js_sys-backed [`HostDispatcher`]: the REAL guest→host boundary crossing.
/// Namespaces and functions resolve as OWN properties of the injected
/// host-binding object (`Object.getOwnPropertyDescriptor` — the prototype
/// chain is deliberately never consulted, so `math.hasOwnProperty` /
/// `math.constructor` can never reach a callable), and every value crosses as
/// canonical JSON via `JSON.parse` / `JSON.stringify`. Only compiled for
/// wasm32; native tests cover the evaluator side of the seam with a mock.
#[cfg(target_arch = "wasm32")]
mod js_host {
    use super::{HostDispatcher, HostInvokeOutcome, HostLookup};
    use wasm_bindgen::{JsCast, JsValue};

    pub(super) struct JsHostDispatcher<'a> {
        pub(super) bindings: &'a JsValue,
    }

    /// Own-property read that never throws: existence via the STATIC
    /// `Object.getOwnPropertyDescriptor` binding (safe even for
    /// null-prototype or exotic objects), value via `Reflect.get`.
    fn own_property(object: &JsValue, key: &str) -> Option<JsValue> {
        if !object.is_object() {
            return None;
        }
        let as_object: &js_sys::Object = object.unchecked_ref();
        let descriptor =
            js_sys::Object::get_own_property_descriptor(as_object, &JsValue::from_str(key));
        if descriptor.is_undefined() {
            return None;
        }
        js_sys::Reflect::get(object, &JsValue::from_str(key)).ok()
    }

    fn namespace_object(bindings: &JsValue, namespace: &str) -> Option<JsValue> {
        let value = own_property(bindings, namespace)?;
        if value.is_object() {
            Some(value)
        } else {
            None
        }
    }

    fn function_of(namespace_obj: &JsValue, function: &str) -> Option<js_sys::Function> {
        own_property(namespace_obj, function)?
            .dyn_into::<js_sys::Function>()
            .ok()
    }

    /// Extract the message text of a thrown JS value: `Error.message` when it
    /// is an Error (the StdHostAbiError path), the string itself when a bare
    /// string was thrown, otherwise a JSON rendering — never a panic.
    fn thrown_message(thrown: &JsValue) -> String {
        if let Some(error) = thrown.dyn_ref::<js_sys::Error>() {
            return String::from(error.message());
        }
        if let Some(text) = thrown.as_string() {
            return text;
        }
        match js_sys::JSON::stringify(thrown) {
            Ok(text) => format!("host function threw a non-Error value: {}", String::from(text)),
            Err(_) => "host function threw a non-Error, non-serializable value".to_string(),
        }
    }

    impl HostDispatcher for JsHostDispatcher<'_> {
        fn lookup(&self, namespace: &str, function: &str) -> HostLookup {
            let Some(namespace_obj) = namespace_object(self.bindings, namespace) else {
                return HostLookup::UnknownNamespace;
            };
            if function_of(&namespace_obj, function).is_none() {
                return HostLookup::UnknownFunction;
            }
            HostLookup::Found
        }

        /// v5 enumeration seam: OWN string-keyed property names of the
        /// namespace object (`Object.getOwnPropertyNames` — symbols excluded,
        /// prototype chain never consulted) filtered to function values.
        /// Sorted for deterministic union-handle construction.
        fn functions(&self, namespace: &str) -> Option<Vec<String>> {
            let namespace_obj = namespace_object(self.bindings, namespace)?;
            let as_object: &js_sys::Object = namespace_obj.unchecked_ref();
            let names = js_sys::Object::get_own_property_names(as_object);
            let mut out = Vec::new();
            for name in names.iter() {
                let Some(key) = name.as_string() else {
                    continue;
                };
                if function_of(&namespace_obj, &key).is_some() {
                    out.push(key);
                }
            }
            out.sort();
            Some(out)
        }

        fn invoke(
            &self,
            namespace: &str,
            function: &str,
            args_json: &[String],
        ) -> HostInvokeOutcome {
            let Some(namespace_obj) = namespace_object(self.bindings, namespace) else {
                return HostInvokeOutcome::Threw(format!(
                    "namespace \"{namespace}\" disappeared between lookup and invoke"
                ));
            };
            let Some(callable) = function_of(&namespace_obj, function) else {
                return HostInvokeOutcome::Threw(format!(
                    "function \"{namespace}.{function}\" disappeared between lookup and invoke"
                ));
            };
            let arguments = js_sys::Array::new();
            for arg in args_json {
                match js_sys::JSON::parse(arg) {
                    Ok(value) => {
                        arguments.push(&value);
                    }
                    Err(_) => {
                        // Unreachable while args come from serde_json; fail
                        // closed rather than panic if that ever drifts.
                        return HostInvokeOutcome::NotSerializable(format!(
                            "argument JSON for \"{namespace}.{function}\" failed to parse at \
                             the boundary"
                        ));
                    }
                }
            }
            match callable.apply(&namespace_obj, &arguments) {
                Err(thrown) => HostInvokeOutcome::Threw(thrown_message(&thrown)),
                Ok(result) => {
                    if result.is_undefined() {
                        return HostInvokeOutcome::NotSerializable(
                            "host function returned undefined (not a JSON value)".to_string(),
                        );
                    }
                    match js_sys::JSON::stringify(&result) {
                        Err(thrown) => HostInvokeOutcome::NotSerializable(format!(
                            "JSON.stringify of the host result threw: {}",
                            thrown_message(&thrown)
                        )),
                        Ok(text) => {
                            let text = String::from(text);
                            if text == "undefined" {
                                // JSON.stringify yields JS undefined for
                                // functions/symbols; a genuine string result
                                // would carry quotes ("\"undefined\"").
                                return HostInvokeOutcome::NotSerializable(
                                    "host result is not JSON-serializable (JSON.stringify \
                                     returned undefined)"
                                        .to_string(),
                                );
                            }
                            HostInvokeOutcome::Value(text)
                        }
                    }
                }
            }
        }
    }
}

/// Wasm-boundary entry used by the `evaluate_trait_handler_v4` export
/// ([`DETERMINISTIC_SUBSET_V4`]): wires the js_sys-backed dispatcher over the
/// injected host-binding object (the `{ math, list_lib, map_lib, set_lib }`
/// value produced by createStdHostBindings()).
#[cfg(target_arch = "wasm32")]
pub fn evaluate_trait_handler_v4_js(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    host_bindings: &wasm_bindgen::JsValue,
) -> String {
    let dispatcher = js_host::JsHostDispatcher {
        bindings: host_bindings,
    };
    evaluate_trait_handler_v4_json(source, trait_name, handler_name, args_json, &dispatcher)
}

/// Wasm-boundary entry used by the `evaluate_trait_handler_v5` export
/// ([`DETERMINISTIC_SUBSET_V5`]): same js_sys-backed dispatcher as v4 (plus
/// its enumeration seam) over the injected host-binding object.
#[cfg(target_arch = "wasm32")]
pub fn evaluate_trait_handler_v5_js(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    host_bindings: &wasm_bindgen::JsValue,
) -> String {
    let dispatcher = js_host::JsHostDispatcher {
        bindings: host_bindings,
    };
    evaluate_trait_handler_v5_json(source, trait_name, handler_name, args_json, &dispatcher)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn run(
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        let raw = evaluate_trait_handler_json(source, trait_name, handler, &args.to_string());
        serde_json::from_str(&raw).expect("evaluator must always return JSON")
    }

    fn expect_ok(result: &serde_json::Value) -> &serde_json::Value {
        assert_eq!(result["ok"], true, "expected ok result, got {result}");
        &result["value"]
    }

    fn expect_err<'a>(result: &'a serde_json::Value, code: &str) -> &'a serde_json::Value {
        assert_eq!(result["ok"], false, "expected error result, got {result}");
        assert_eq!(
            result["error"]["code"], code,
            "expected error code {code}, got {result}"
        );
        &result["error"]
    }

    const MATH_TRAIT: &str = r#"
@trait std_math_conformance {
  @on_lerp(a, b, t) => {
    return { value: a + (b - a) * t }
  }
  @on_vec3_cross(a, b) => {
    return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x }
  }
  @on_clamp(value, min, max) => {
    if (value < min) { return { value: min } }
    if (value > max) { return { value: max } }
    return { value: value }
  }
  @on_smoothstep(edge0, edge1, x) => {
    t = (x - edge0) / (edge1 - edge0)
    if (t < 0) { t = 0 }
    if (t > 1) { t = 1 }
    return { value: t * t * (3 - 2 * t) }
  }
}
"#;

    // ===== Reality check: what the parser actually produces =====

    #[test]
    fn reality_check_trait_handlers_parse_to_game_event_blocks_with_parsed_bodies() {
        let ast = crate::parse_ast(MATH_TRAIT).expect("trait projection must parse");
        let AstNode::Trait(trait_node) = &ast.body[0] else {
            panic!(
                "top-level @trait must parse to AstNode::Trait, got {:?}",
                ast.body[0]
            );
        };
        assert_eq!(trait_node.name, "std_math_conformance");
        let mut names = Vec::new();
        for member in &trait_node.members {
            let AstNode::GameEventBlock(handler) = member else {
                panic!("trait member must be a GameEventBlock, got {:?}", member);
            };
            assert!(
                handler.parsed_body.is_some(),
                "handler {} must have a parsed body (speculative statement parse succeeded)",
                handler.name
            );
            names.push(handler.name.clone());
        }
        assert_eq!(
            names,
            ["on_lerp", "on_vec3_cross", "on_clamp", "on_smoothstep"]
        );
    }

    #[test]
    fn reality_check_ternary_bodies_do_not_parse_as_statements() {
        // The wasm subset grammar has NO conditional-expression production: `?` is
        // only consumed as `??` or an optional-type marker. A ternary handler body
        // therefore fails the speculative statement parse (parsed_body = None) and
        // only round-trips as raw text.
        let source = r#"
@trait t {
  @on_clamp(value, min, max) => {
    return { value: value < min ? min : (value > max ? max : value) }
  }
}
"#;
        let ast = crate::parse_ast(source).expect("raw-body tolerance keeps the trait parsing");
        let AstNode::Trait(trait_node) = &ast.body[0] else {
            panic!("expected trait node");
        };
        let AstNode::GameEventBlock(handler) = &trait_node.members[0] else {
            panic!("expected handler member");
        };
        assert!(
            handler.parsed_body.is_none(),
            "ternary body unexpectedly parsed — the grammar gained ?: support; update the evaluator"
        );

        let result = run(
            source,
            "t",
            "on_clamp",
            serde_json::json!({"value": 5, "min": 0, "max": 1}),
        );
        expect_err(&result, "unparsed-body");
    }

    #[test]
    fn reality_check_triple_equals_does_not_parse() {
        // `===` lexes as `==` + `=`, which no statement grammar accepts.
        let source = r#"
@trait t {
  @on_f(a) => {
    return { value: a === 1 }
  }
}
"#;
        let result = run(source, "t", "on_f", serde_json::json!({"a": 1}));
        expect_err(&result, "unparsed-body");
    }

    // ===== Happy-path op shapes =====

    #[test]
    fn lerp_evaluates_f64() {
        let result = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_lerp",
            serde_json::json!({"a": 2.0, "b": 3.0, "t": 3.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 5.0}));
    }

    #[test]
    fn lerp_matches_ieee_double_semantics() {
        // a + (b - a) * t with representable-noise inputs must equal the exact
        // f64 sequence (no FMA contraction).
        let (a, b, t) = (0.1_f64, 0.7_f64, 0.3_f64);
        let expected = a + (b - a) * t;
        let result = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_lerp",
            serde_json::json!({"a": a, "b": b, "t": t}),
        );
        assert_eq!(expect_ok(&result)["value"].as_f64().unwrap(), expected);
    }

    #[test]
    fn vec3_cross_binds_object_args_and_orders_keys() {
        let result = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_vec3_cross",
            serde_json::json!({"a": {"x": 1.0, "y": 2.0, "z": 3.0}, "b": {"x": 4.0, "y": 5.0, "z": 6.0}}),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"x": -3.0, "y": 6.0, "z": -3.0})
        );
    }

    #[test]
    fn clamp_if_else_form_executes_all_paths() {
        for (value, expected) in [(-1.0, 0.0), (0.5, 0.5), (9.0, 1.0)] {
            let result = run(
                MATH_TRAIT,
                "std_math_conformance",
                "on_clamp",
                serde_json::json!({"value": value, "min": 0.0, "max": 1.0}),
            );
            assert_eq!(expect_ok(&result), &serde_json::json!({"value": expected}));
        }
    }

    #[test]
    fn smoothstep_multi_statement_local_assignment() {
        let (edge0, edge1, x) = (0.0_f64, 1.0_f64, 0.25_f64);
        let mut t = (x - edge0) / (edge1 - edge0);
        t = t.clamp(0.0, 1.0);
        let expected = t * t * (3.0 - 2.0 * t);
        let result = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_smoothstep",
            serde_json::json!({"edge0": edge0, "edge1": edge1, "x": x}),
        );
        assert_eq!(expect_ok(&result)["value"].as_f64().unwrap(), expected);
        // Saturation branches (the if statements) both execute.
        let low = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_smoothstep",
            serde_json::json!({"edge0": 0.0, "edge1": 1.0, "x": -5.0}),
        );
        assert_eq!(expect_ok(&low), &serde_json::json!({"value": 0.0}));
        let high = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_smoothstep",
            serde_json::json!({"edge0": 0.0, "edge1": 1.0, "x": 5.0}),
        );
        assert_eq!(expect_ok(&high), &serde_json::json!({"value": 1.0}));
    }

    // ===== Operator coverage =====

    fn one_arg_trait(body: &str) -> String {
        format!("@trait t {{ @on_f(a, b) => {{ {body} }} }}")
    }

    fn eval_ab(body: &str, a: serde_json::Value, b: serde_json::Value) -> serde_json::Value {
        run(
            &one_arg_trait(body),
            "t",
            "on_f",
            serde_json::json!({"a": a, "b": b}),
        )
    }

    #[test]
    fn arithmetic_operators() {
        let result = eval_ab(
            "return { sum: a + b, diff: a - b, prod: a * b, quot: a / b }",
            serde_json::json!(7.0),
            serde_json::json!(2.0),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"sum": 9.0, "diff": 5.0, "prod": 14.0, "quot": 3.5})
        );
    }

    #[test]
    fn comparison_operators() {
        let result = eval_ab(
            "return { lt: a < b, gt: a > b, le: a <= b, ge: a >= b, eq: a == b, ne: a != b }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"lt": true, "gt": false, "le": true, "ge": false, "eq": false, "ne": true})
        );
    }

    #[test]
    fn equality_over_primitives() {
        // string == string
        let result = eval_ab(
            "return { v: a == b }",
            serde_json::json!("x"),
            serde_json::json!("x"),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": true}));
        // bool != bool
        let result = eval_ab(
            "return { v: a != b }",
            serde_json::json!(true),
            serde_json::json!(false),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": true}));
        // null == null
        let result = eval_ab(
            "return { v: a == b }",
            serde_json::json!(null),
            serde_json::json!(null),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": true}));
        // Mismatched primitive types compare UNEQUAL (engine parity), no error.
        let result = eval_ab(
            "return { v: a == b }",
            serde_json::json!(1.0),
            serde_json::json!("1"),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": false}));
    }

    #[test]
    fn equality_over_structures_is_refused() {
        let result = eval_ab(
            "return { v: a == b }",
            serde_json::json!({"x": 1.0}),
            serde_json::json!({"x": 1.0}),
        );
        expect_err(&result, "unsupported-operation");
    }

    #[test]
    fn logical_operators_and_short_circuit() {
        let result = eval_ab(
            "return { and: a && b, or: a || b }",
            serde_json::json!(true),
            serde_json::json!(false),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"and": false, "or": true})
        );
        // Short-circuit: the right operand (a type error) is never evaluated.
        let result = eval_ab(
            "return { v: a && b }",
            serde_json::json!(false),
            serde_json::json!(3.0),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": false}));
        let result = eval_ab(
            "return { v: a || b }",
            serde_json::json!(true),
            serde_json::json!(3.0),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": true}));
        // Non-boolean operand in an evaluated position fails closed.
        let result = eval_ab(
            "return { v: a && b }",
            serde_json::json!(1.0),
            serde_json::json!(true),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn unary_operators() {
        let result = eval_ab(
            "return { not: !a, neg: -b, double_neg: -(-b) }",
            serde_json::json!(false),
            serde_json::json!(4.0),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"not": true, "neg": -4.0, "double_neg": 4.0})
        );
        let result = eval_ab(
            "return { v: !a }",
            serde_json::json!(1.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn string_concat_and_coercion_refusal() {
        let result = eval_ab(
            "return { v: a + b }",
            serde_json::json!("ab"),
            serde_json::json!("cd"),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": "abcd"}));
        // No JS string+number coercion.
        let result = eval_ab(
            "return { v: a + b }",
            serde_json::json!("ab"),
            serde_json::json!(1.0),
        );
        expect_err(&result, "type-mismatch");
        // Ordering comparisons are numbers-only.
        let result = eval_ab(
            "return { v: a < b }",
            serde_json::json!("a"),
            serde_json::json!("b"),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn literals_arrays_objects_and_member_access() {
        let source = r#"
@trait t {
  @on_f(p) => {
    return { s: "str", t: true, f: false, n: null, arr: [1, 2, p.inner.x], num: -2.5 }
  }
}
"#;
        let result = run(
            source,
            "t",
            "on_f",
            serde_json::json!({"p": {"inner": {"x": 9.0}}}),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"s": "str", "t": true, "f": false, "n": null, "arr": [1.0, 2.0, 9.0], "num": -2.5})
        );
    }

    #[test]
    fn ternary_free_conditional_expression_shapes_work_via_if() {
        // The documented replacement shape for ternary in the projection.
        let source = r#"
@trait t {
  @on_f(a, b) => {
    picked = a
    if (b < a) { picked = b }
    return { value: picked }
  }
}
"#;
        let result = run(source, "t", "on_f", serde_json::json!({"a": 3.0, "b": 2.0}));
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 2.0}));
    }

    // ===== Fail-closed paths =====

    #[test]
    fn division_by_zero_fails_closed() {
        let result = eval_ab(
            "return { v: a / b }",
            serde_json::json!(1.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "division-by-zero");
    }

    #[test]
    fn non_finite_result_fails_closed() {
        let result = eval_ab(
            "return { v: a * b }",
            serde_json::json!(1.0e308),
            serde_json::json!(10.0),
        );
        expect_err(&result, "non-finite");
    }

    #[test]
    fn negative_zero_result_fails_closed() {
        // 0 * -1 produces -0.0 in IEEE-754.
        let result = eval_ab(
            "return { v: a * b }",
            serde_json::json!(0.0),
            serde_json::json!(-1.0),
        );
        expect_err(&result, "negative-zero");
        // Unary negation of zero likewise.
        let result = eval_ab(
            "return { v: -a }",
            serde_json::json!(0.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "negative-zero");
    }

    #[test]
    fn negative_zero_argument_normalizes_like_engine_canonicalization() {
        // The engine canonicalizes args through JSON.stringify, which turns -0
        // into 0 — mirrored here so both legs see the same bound value.
        let result = eval_ab(
            "return { v: a + b }",
            serde_json::json!(-0.0),
            serde_json::json!(1.0),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"v": 1.0}));
    }

    #[test]
    fn unknown_identifier_fails_closed() {
        let result = eval_ab(
            "return { v: missing }",
            serde_json::json!(1.0),
            serde_json::json!(1.0),
        );
        expect_err(&result, "unknown-identifier");
    }

    #[test]
    fn unknown_member_and_non_object_member_fail_closed() {
        let result = eval_ab(
            "return { v: a.missing }",
            serde_json::json!({"x": 1.0}),
            serde_json::json!(1.0),
        );
        expect_err(&result, "unknown-member");
        let result = eval_ab(
            "return { v: a.x }",
            serde_json::json!(1.0),
            serde_json::json!(1.0),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn computed_member_access_is_refused() {
        let result = eval_ab(
            "return { v: a[0] }",
            serde_json::json!([1.0]),
            serde_json::json!(1.0),
        );
        expect_err(&result, "unsupported-node");
    }

    #[test]
    fn call_expression_fails_only_on_executed_paths() {
        let source = r#"
@trait t {
  @on_f(a) => {
    if (a > 0) { return { value: a } }
    return { value: sqrt(a) }
  }
}
"#;
        // Call sits in the non-taken path: fine.
        let result = run(source, "t", "on_f", serde_json::json!({"a": 2.0}));
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 2.0}));
        // Executed path reaches the call: structured error.
        let result = run(source, "t", "on_f", serde_json::json!({"a": -1.0}));
        expect_err(&result, "unsupported-call");
    }

    #[test]
    fn unsupported_operators_fail_closed() {
        let result = eval_ab(
            "return { v: a % b }",
            serde_json::json!(5.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "unsupported-operator");
        let result = eval_ab(
            "a += b return { v: a }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "unsupported-operator");
    }

    #[test]
    fn variable_declarations_are_not_in_subset() {
        let result = eval_ab(
            "let x = a return { v: x }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "unsupported-node");
    }

    #[test]
    fn if_condition_requires_boolean() {
        let result = eval_ab(
            "if (a) { return { v: 1 } } return { v: 0 }",
            serde_json::json!(1.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn missing_return_fails_closed() {
        let result = eval_ab("x = a + b", serde_json::json!(1.0), serde_json::json!(2.0));
        expect_err(&result, "no-return");
    }

    #[test]
    fn bare_return_yields_null_like_engine() {
        let result = eval_ab("return", serde_json::json!(1.0), serde_json::json!(2.0));
        assert_eq!(expect_ok(&result), &serde_json::json!(null));
    }

    // ===== Binding and lookup errors =====

    #[test]
    fn args_must_match_params_exactly() {
        let source = &one_arg_trait("return { v: a + b }");
        let missing = run(source, "t", "on_f", serde_json::json!({"a": 1.0}));
        expect_err(&missing, "missing-argument");
        let extra = run(
            source,
            "t",
            "on_f",
            serde_json::json!({"a": 1.0, "b": 2.0, "c": 3.0}),
        );
        expect_err(&extra, "unexpected-argument");
    }

    #[test]
    fn invalid_args_fail_closed() {
        let source = one_arg_trait("return { v: a + b }");
        let raw = evaluate_trait_handler_json(&source, "t", "on_f", "not json");
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "invalid-args");
        let raw = evaluate_trait_handler_json(&source, "t", "on_f", "[1, 2]");
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "invalid-args");
    }

    #[test]
    fn dangerous_arg_keys_fail_closed() {
        let source = one_arg_trait("return { v: a }");
        let raw =
            evaluate_trait_handler_json(&source, "t", "on_f", r#"{"a": {"__proto__": 1}, "b": 2}"#);
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "unsafe-key");
    }

    #[test]
    fn trait_and_handler_lookup_errors() {
        let result = run(MATH_TRAIT, "nope", "on_lerp", serde_json::json!({}));
        expect_err(&result, "trait-not-found");
        let result = run(
            MATH_TRAIT,
            "std_math_conformance",
            "on_nope",
            serde_json::json!({}),
        );
        expect_err(&result, "handler-not-found");
    }

    #[test]
    fn parse_errors_are_structured() {
        let result = run(
            "@trait t { @on_f(a) => { return {{{ }",
            "t",
            "on_f",
            serde_json::json!({"a": 1.0}),
        );
        expect_err(&result, "parse-error");
    }

    #[test]
    fn duplicate_object_keys_fail_closed() {
        let result = eval_ab(
            "return { v: a, v: b }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "duplicate-key");
    }

    #[test]
    fn evaluator_output_is_always_json() {
        for args in ["", "{", "null", "{\"a\":1,\"b\":2}"] {
            let raw =
                evaluate_trait_handler_json(&one_arg_trait("return { v: a }"), "t", "on_f", args);
            serde_json::from_str::<serde_json::Value>(&raw).expect("output must be JSON");
        }
    }

    // ===== v2 numeric builtins =====

    fn run_v2(
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        let raw = evaluate_trait_handler_v2_json(source, trait_name, handler, &args.to_string());
        serde_json::from_str(&raw).expect("v2 evaluator must always return JSON")
    }

    fn eval_ab_v2(body: &str, a: serde_json::Value, b: serde_json::Value) -> serde_json::Value {
        run_v2(
            &one_arg_trait(body),
            "t",
            "on_f",
            serde_json::json!({"a": a, "b": b}),
        )
    }

    const VEC3_TRAIT: &str = r#"
@trait std_math_builtins {
  @on_len(v) => {
    return { value: sqrt(v.x * v.x + v.y * v.y + v.z * v.z) }
  }
  @on_normalize(v) => {
    len = sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
    if (len == 0) { return { x: 0, y: 0, z: 0 } }
    return { x: v.x / len, y: v.y / len, z: v.z / len }
  }
}
"#;

    #[test]
    fn v2_subset_id_is_pinned() {
        assert_eq!(
            DETERMINISTIC_SUBSET_V2,
            "holoscript-engine-hsplus-deterministic-action-subset-v2-numeric-builtins"
        );
    }

    #[test]
    fn v2_sqrt_vec3_length() {
        let result = run_v2(
            VEC3_TRAIT,
            "std_math_builtins",
            "on_len",
            serde_json::json!({"v": {"x": 3.0, "y": 4.0, "z": 0.0}}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 5.0}));
    }

    #[test]
    fn v2_statement_form_locals_and_builtins_mirror_vec3_normalize() {
        // len = sqrt(...) into a local, then if/return — the vec3_normalize
        // traitBody shape.
        let result = run_v2(
            VEC3_TRAIT,
            "std_math_builtins",
            "on_normalize",
            serde_json::json!({"v": {"x": 3.0, "y": 4.0, "z": 0.0}}),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"x": 0.6, "y": 0.8, "z": 0.0})
        );
        // Zero-length guard branch executes.
        let zero = run_v2(
            VEC3_TRAIT,
            "std_math_builtins",
            "on_normalize",
            serde_json::json!({"v": {"x": 0.0, "y": 0.0, "z": 0.0}}),
        );
        assert_eq!(
            expect_ok(&zero),
            &serde_json::json!({"x": 0.0, "y": 0.0, "z": 0.0})
        );
    }

    #[test]
    fn v2_each_unary_builtin_happy_path() {
        // The expectation is pushed through the SAME serialize→parse JSON round
        // trip as the evaluator output the test reads back: serde_json without
        // the `float_roundtrip` feature re-parses 17-significant-digit floats
        // (e.g. acos(0.5) = 1.0471975511965979) one ulp off, so comparing a
        // directly-computed f64 against the re-parsed value spuriously fails.
        // The evaluator's own JSON boundary emits full-precision Ryu output;
        // only this test harness re-parses it.
        fn json_roundtrip(value: f64) -> f64 {
            serde_json::from_str::<serde_json::Value>(&serde_json::json!(value).to_string())
                .expect("serialized f64 must re-parse")
                .as_f64()
                .expect("round-tripped f64 must stay a number")
        }
        for (body, input, expected) in [
            ("return { value: sqrt(a) }", 2.25, 1.5),
            ("return { value: sin(a) }", 2.25, 2.25_f64.sin()),
            ("return { value: cos(a) }", 2.25, 2.25_f64.cos()),
            ("return { value: acos(a) }", 0.5, 0.5_f64.acos()),
            ("return { value: abs(a) }", -3.5, 3.5),
            ("return { value: floor(a) }", 2.75, 2.0),
        ] {
            let result = eval_ab_v2(body, serde_json::json!(input), serde_json::json!(0.0));
            assert_eq!(
                expect_ok(&result)["value"].as_f64().unwrap(),
                json_roundtrip(expected),
                "body: {body}"
            );
        }
    }

    #[test]
    fn v2_min_max_two_arity() {
        let result = eval_ab_v2(
            "return { lo: min(a, b), hi: max(a, b) }",
            serde_json::json!(3.0),
            serde_json::json!(-2.0),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"lo": -2.0, "hi": 3.0})
        );
    }

    #[test]
    fn v2_builtin_arguments_are_full_expressions_including_nested_builtins() {
        let result = eval_ab_v2(
            "return { value: sqrt(max(a, b) + 12) }",
            serde_json::json!(4.0),
            serde_json::json!(2.0),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 4.0}));
    }

    #[test]
    fn v2_domain_errors_fail_closed() {
        // sqrt(-1) and acos(2) produce NaN in f64 — checked_number turns both
        // into structured non-finite errors instead of admitting NaN.
        let result = eval_ab_v2(
            "return { value: sqrt(a) }",
            serde_json::json!(-1.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "non-finite");
        let result = eval_ab_v2(
            "return { value: acos(a) }",
            serde_json::json!(2.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "non-finite");
    }

    #[test]
    fn v2_arity_errors() {
        let result = eval_ab_v2(
            "return { value: sqrt(a, b) }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "builtin-arity");
        let result = eval_ab_v2(
            "return { value: min(a) }",
            serde_json::json!(1.0),
            serde_json::json!(2.0),
        );
        expect_err(&result, "builtin-arity");
    }

    #[test]
    fn v2_non_number_argument_fails_closed() {
        let result = eval_ab_v2(
            "return { value: sqrt(a) }",
            serde_json::json!("nope"),
            serde_json::json!(0.0),
        );
        expect_err(&result, "type-mismatch");
    }

    #[test]
    fn v2_unknown_callee_names_the_table() {
        let result = eval_ab_v2(
            "return { value: tan(a) }",
            serde_json::json!(1.0),
            serde_json::json!(0.0),
        );
        let error = expect_err(&result, "unsupported-call");
        let message = error["message"].as_str().unwrap();
        assert!(message.contains("v2 numeric-builtin table"), "{message}");
        assert!(message.contains("sqrt"), "{message}");
    }

    #[test]
    fn v2_member_calls_stay_rejected() {
        // math.sqrt(x): callee is a MemberExpression, never reaches the table.
        let result = eval_ab_v2(
            "return { value: math.sqrt(a) }",
            serde_json::json!(4.0),
            serde_json::json!(0.0),
        );
        expect_err(&result, "unsupported-call");
    }

    #[test]
    fn v2_matches_v1_outside_call_expressions() {
        let args = serde_json::json!({"a": 2.0, "b": 3.0, "t": 3.0});
        let v1 = run(MATH_TRAIT, "std_math_conformance", "on_lerp", args.clone());
        let v2 = run_v2(MATH_TRAIT, "std_math_conformance", "on_lerp", args);
        assert_eq!(v1, v2);
    }

    #[test]
    fn v1_still_rejects_every_call_including_table_members() {
        // Guard: the v1 entrypoint must keep refusing ALL CallExpressions —
        // including names in the v2 table — with the exact pre-v2 code+message.
        for body in [
            "return { value: sqrt(a) }",
            "return { value: min(a, b) }",
            "return { value: floor(a) }",
            "return { value: math.sqrt(a) }",
        ] {
            let result = eval_ab(body, serde_json::json!(4.0), serde_json::json!(2.0));
            let error = expect_err(&result, "unsupported-call");
            assert_eq!(
                error["message"],
                "function calls are not in the deterministic subset v0 (no host library, no math builtins)",
                "body: {body}"
            );
        }
    }

    // ===== v3 local bindings (honest alias of the v2 mode) =====

    fn run_v3(
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        let raw = evaluate_trait_handler_v3_json(source, trait_name, handler, &args.to_string());
        serde_json::from_str(&raw).expect("v3 evaluator must always return JSON")
    }

    /// Same serialize→parse round trip the evaluator output takes before the
    /// test reads it back (see `v2_each_unary_builtin_happy_path` for why a
    /// directly-computed f64 can compare one ulp off without this).
    fn json_roundtrip_f64(value: f64) -> f64 {
        serde_json::from_str::<serde_json::Value>(&serde_json::json!(value).to_string())
            .expect("serialized f64 must re-parse")
            .as_f64()
            .expect("round-tripped f64 must stay a number")
    }

    /// Slerp-shaped fixture locking in the v3 grammar this lane has admitted
    /// since v1: bare local bindings (dot/bx/by/bz/bw), reassignment INSIDE the
    /// shortest-path if branch (`bx = 0.0 - b.x`, `dot = 0.0 - dot`) that
    /// persists after the block, a near-parallel branch with locals lx..lw +
    /// len and sqrt + division, and a spherical branch with acos/sin/cos and
    /// division. `on_use_before_assign` reads a local whose only assignment
    /// sits in a conditionally-taken branch.
    const SLERP_TRAIT: &str = r#"
@trait std_quat_conformance {
  @on_slerp(a, b, t) => {
    dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w
    bx = b.x
    by = b.y
    bz = b.z
    bw = b.w
    if (dot < 0) {
      bx = 0.0 - b.x
      by = 0.0 - b.y
      bz = 0.0 - b.z
      bw = 0.0 - b.w
      dot = 0.0 - dot
    }
    if (dot > 0.9995) {
      lx = a.x + (bx - a.x) * t
      ly = a.y + (by - a.y) * t
      lz = a.z + (bz - a.z) * t
      lw = a.w + (bw - a.w) * t
      len = sqrt(lx * lx + ly * ly + lz * lz + lw * lw)
      return { x: lx / len, y: ly / len, z: lz / len, w: lw / len }
    }
    theta0 = acos(dot)
    sinTheta0 = sin(theta0)
    theta = theta0 * t
    s0 = cos(theta) - dot * sin(theta) / sinTheta0
    s1 = sin(theta) / sinTheta0
    return { x: a.x * s0 + bx * s1, y: a.y * s0 + by * s1, z: a.z * s0 + bz * s1, w: a.w * s0 + bw * s1 }
  }
  @on_use_before_assign(a, b, t) => {
    if (t > 0.5) { picked = a.w }
    return { value: picked }
  }
}
"#;

    fn slerp_args(a: [f64; 4], b: [f64; 4], t: f64) -> serde_json::Value {
        serde_json::json!({
            "a": {"x": a[0], "y": a[1], "z": a[2], "w": a[3]},
            "b": {"x": b[0], "y": b[1], "z": b[2], "w": b[3]},
            "t": t,
        })
    }

    fn assert_quat(result: &serde_json::Value, expected: [f64; 4]) {
        let value = expect_ok(result);
        for (key, component) in ["x", "y", "z", "w"].iter().zip(expected) {
            assert_eq!(
                value[*key].as_f64().unwrap(),
                json_roundtrip_f64(component),
                "component {key}: {result}"
            );
        }
    }

    /// Mirror of the fixture's spherical tail, operation-ordered exactly like
    /// the evaluator walks it (left-associative, no FMA contraction).
    fn spherical_expected(a: [f64; 4], b: [f64; 4], dot: f64, t: f64) -> [f64; 4] {
        let theta0 = dot.acos();
        let sin_theta0 = theta0.sin();
        let theta = theta0 * t;
        let s0 = theta.cos() - dot * theta.sin() / sin_theta0;
        let s1 = theta.sin() / sin_theta0;
        [
            a[0] * s0 + b[0] * s1,
            a[1] * s0 + b[1] * s1,
            a[2] * s0 + b[2] * s1,
            a[3] * s0 + b[3] * s1,
        ]
    }

    fn quat_dot(a: [f64; 4], b: [f64; 4]) -> f64 {
        a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    }

    #[test]
    fn v3_subset_id_pinned_and_is_honest_alias_of_v2() {
        assert_eq!(
            DETERMINISTIC_SUBSET_V3,
            "holoscript-engine-hsplus-deterministic-action-subset-v3-local-bindings"
        );
        // Same mode, same walkers: the v3 boundary output must be BYTE-identical
        // to v2 on the same program and args.
        let args = slerp_args([0.0, 0.0, 0.0, 1.0], [0.6, 0.0, 0.0, 0.8], 0.5).to_string();
        let v2 = evaluate_trait_handler_v2_json(SLERP_TRAIT, "std_quat_conformance", "on_slerp", &args);
        let v3 = evaluate_trait_handler_v3_json(SLERP_TRAIT, "std_quat_conformance", "on_slerp", &args);
        assert_eq!(v2, v3);
    }

    #[test]
    fn v3_slerp_spherical_branch_acos_sin_cos_division() {
        // dot = 0.8: no negation, below the 0.9995 nlerp threshold → the
        // spherical branch runs acos/sin/cos over locals and divides.
        let (a, b, t) = ([0.0, 0.0, 0.0, 1.0], [0.6, 0.0, 0.0, 0.8], 0.5);
        let dot = quat_dot(a, b);
        assert!(dot > 0.0 && dot < 0.9995, "fixture must take the spherical branch");
        let result = run_v3(
            SLERP_TRAIT,
            "std_quat_conformance",
            "on_slerp",
            slerp_args(a, b, t),
        );
        assert_quat(&result, spherical_expected(a, b, dot, t));
    }

    #[test]
    fn v3_slerp_shortest_path_branch_reassigns_locals_inside_if() {
        // (a) dot = -0.9 < 0: the negation branch REASSIGNS the already-bound
        // locals bx/by/bz/bw and dot inside the if block, and the spherical
        // tail then consumes the reassigned values — proving branch-local
        // reassignment persists after the block. Every component is non-zero
        // so no intermediate product can produce a fail-closed -0.0.
        let (a, b, t) = ([0.5, 0.5, 0.5, 0.5], [-0.8, -0.2, -0.4, -0.4], 0.5);
        let dot_in = quat_dot(a, b);
        assert!(dot_in < 0.0, "fixture must take the negation branch");
        let negated = [0.0 - b[0], 0.0 - b[1], 0.0 - b[2], 0.0 - b[3]];
        let dot = 0.0 - dot_in;
        assert!(dot < 0.9995, "fixture must fall through to the spherical branch");
        let result = run_v3(
            SLERP_TRAIT,
            "std_quat_conformance",
            "on_slerp",
            slerp_args(a, b, t),
        );
        assert_quat(&result, spherical_expected(a, negated, dot, t));
    }

    #[test]
    fn v3_slerp_nlerp_branch_locals_sqrt_division() {
        // dot = 0.99995 > 0.9995: the near-parallel branch binds fresh locals
        // lx..lw + len inside the if block, normalizes via sqrt, and divides.
        let (a, b, t) = ([0.0, 0.0, 0.0, 1.0], [0.01, 0.0, 0.0, 0.99995], 0.5);
        let dot = quat_dot(a, b);
        assert!(dot > 0.9995, "fixture must take the nlerp branch");
        let lx = a[0] + (b[0] - a[0]) * t;
        let ly = a[1] + (b[1] - a[1]) * t;
        let lz = a[2] + (b[2] - a[2]) * t;
        let lw = a[3] + (b[3] - a[3]) * t;
        let len = (lx * lx + ly * ly + lz * lz + lw * lw).sqrt();
        let result = run_v3(
            SLERP_TRAIT,
            "std_quat_conformance",
            "on_slerp",
            slerp_args(a, b, t),
        );
        assert_quat(&result, [lx / len, ly / len, lz / len, lw / len]);
    }

    #[test]
    fn v3_use_before_assign_is_structured_unknown_identifier() {
        // (b) Use-before-assign fails CLOSED as a structured error: `picked` is
        // only assigned in the untaken branch, so the later read reports
        // unknown-identifier (locals and params share one binding namespace).
        // Taken branch first: assignment inside the if persists after the block.
        let ok = run_v3(
            SLERP_TRAIT,
            "std_quat_conformance",
            "on_use_before_assign",
            slerp_args([0.0, 0.0, 0.0, 1.0], [0.0, 0.0, 0.0, 1.0], 0.75),
        );
        assert_eq!(expect_ok(&ok), &serde_json::json!({"value": 1.0}));
        let result = run_v3(
            SLERP_TRAIT,
            "std_quat_conformance",
            "on_use_before_assign",
            slerp_args([0.0, 0.0, 0.0, 1.0], [0.0, 0.0, 0.0, 1.0], 0.25),
        );
        let error = expect_err(&result, "unknown-identifier");
        assert!(
            error["message"].as_str().unwrap().contains("picked"),
            "{result}"
        );
    }

    // ===== v4 host bindings (native seam tests — mock dispatcher, no JS host) =====

    /// Mock [`HostDispatcher`]: namespaces `math.clamp` (computes, proving the
    /// canonical-JSON argument marshalling round-trips), `map_lib.map_get`
    /// (always throws like the real binding on an absent key),
    /// `list_lib.list_reverse` + `set_lib.set_union` (compute, so v5 union
    /// handles are exercised end to end), and `weird.*` (returns hostile
    /// results so the re-entry rails are exercised).
    struct MockHost;

    /// One (namespace → functions) table backing both `lookup` and the v5
    /// `functions` enumeration seam, so the two can never disagree.
    const MOCK_NAMESPACES: &[(&str, &[&str])] = &[
        ("math", &["clamp"]),
        ("list_lib", &["list_range", "list_reverse"]),
        ("map_lib", &["map_get"]),
        ("set_lib", &["set_union"]),
        ("weird", &["badjson", "proto", "undef"]),
    ];

    impl HostDispatcher for MockHost {
        fn lookup(&self, namespace: &str, function: &str) -> HostLookup {
            match MOCK_NAMESPACES.iter().find(|(name, _)| *name == namespace) {
                None => HostLookup::UnknownNamespace,
                Some((_, functions)) if functions.contains(&function) => HostLookup::Found,
                Some(_) => HostLookup::UnknownFunction,
            }
        }

        fn functions(&self, namespace: &str) -> Option<Vec<String>> {
            MOCK_NAMESPACES
                .iter()
                .find(|(name, _)| *name == namespace)
                .map(|(_, functions)| functions.iter().map(|f| f.to_string()).collect())
        }

        fn invoke(&self, namespace: &str, function: &str, args_json: &[String]) -> HostInvokeOutcome {
            match (namespace, function) {
                ("math", "clamp") => {
                    // Each argument must arrive as its own strict-JSON string
                    // in source order.
                    let parsed: Vec<f64> = args_json
                        .iter()
                        .map(|arg| {
                            serde_json::from_str::<f64>(arg)
                                .expect("clamp argument must marshal as a JSON number")
                        })
                        .collect();
                    assert_eq!(parsed.len(), 3, "clamp receives exactly the call's arguments");
                    let clamped = parsed[1].max(parsed[2].min(parsed[0]));
                    HostInvokeOutcome::Value(serde_json::json!(clamped).to_string())
                }
                ("list_lib", "list_range") => {
                    let parsed: Vec<f64> = args_json
                        .iter()
                        .map(|arg| {
                            serde_json::from_str::<f64>(arg)
                                .expect("list_range argument must marshal as a JSON number")
                        })
                        .collect();
                    assert_eq!(parsed.len(), 3, "list_range receives exactly the call's arguments");
                    let (start, end, step) = (parsed[0], parsed[1], parsed[2]);
                    assert!(step != 0.0, "mock list_range requires a nonzero step");
                    let mut out: Vec<f64> = Vec::new();
                    let mut i = start;
                    while if step > 0.0 { i < end } else { i > end } {
                        out.push(i);
                        i += step;
                    }
                    HostInvokeOutcome::Value(serde_json::json!(out).to_string())
                }
                ("list_lib", "list_reverse") => {
                    let mut items: Vec<serde_json::Value> = serde_json::from_str(&args_json[0])
                        .expect("list_reverse argument must marshal as a JSON array");
                    items.reverse();
                    HostInvokeOutcome::Value(serde_json::Value::Array(items).to_string())
                }
                ("set_lib", "set_union") => {
                    let a: Vec<f64> = serde_json::from_str(&args_json[0])
                        .expect("set_union argument 1 must marshal as a JSON number array");
                    let b: Vec<f64> = serde_json::from_str(&args_json[1])
                        .expect("set_union argument 2 must marshal as a JSON number array");
                    let mut out: Vec<f64> = Vec::new();
                    for item in a.into_iter().chain(b) {
                        if !out.contains(&item) {
                            out.push(item);
                        }
                    }
                    out.sort_by(f64::total_cmp);
                    HostInvokeOutcome::Value(serde_json::json!(out).to_string())
                }
                ("map_lib", "map_get") => HostInvokeOutcome::Threw(
                    "std-host-abi missing-key: key \"absent\" is absent".to_string(),
                ),
                ("weird", "undef") => {
                    HostInvokeOutcome::NotSerializable("returned undefined".to_string())
                }
                ("weird", "badjson") => HostInvokeOutcome::Value("not json at all".to_string()),
                ("weird", "proto") => HostInvokeOutcome::Value(r#"{"__proto__":1}"#.to_string()),
                other => HostInvokeOutcome::Threw(format!("mock: unexpected invoke {other:?}")),
            }
        }
    }

    fn run_v4(
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        let raw =
            evaluate_trait_handler_v4_json(source, trait_name, handler, &args.to_string(), &MockHost);
        serde_json::from_str(&raw).expect("v4 evaluator must always return JSON")
    }

    const CLAMP_TRAIT: &str = r#"
@trait std_host_conformance {
  @on_clamp(value, lo, hi) => {
    return { value: math.clamp(value, lo, hi) }
  }
  @on_clamp_in_expr(value, lo, hi) => {
    return { value: math.clamp(value, lo, hi) + 1 }
  }
}
"#;

    #[test]
    fn v4_subset_id_is_pinned() {
        assert_eq!(
            DETERMINISTIC_SUBSET_V4,
            "holoscript-engine-hsplus-deterministic-action-subset-v4-host-bindings"
        );
    }

    #[test]
    fn v4_member_callee_marshals_args_and_result_over_the_seam() {
        let result = run_v4(
            CLAMP_TRAIT,
            "std_host_conformance",
            "on_clamp",
            serde_json::json!({"value": 42.0, "lo": 0.0, "hi": 10.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 10.0}));
        // The re-entered host result is a first-class Value: it feeds
        // downstream arithmetic under the same rails.
        let result = run_v4(
            CLAMP_TRAIT,
            "std_host_conformance",
            "on_clamp_in_expr",
            serde_json::json!({"value": 42.0, "lo": 0.0, "hi": 10.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!({"value": 11.0}));
    }

    #[test]
    fn v4_unknown_namespace_and_function_fail_closed() {
        let source = r#"
@trait t {
  @on_ns(a) => { return { value: nope.f(a) } }
  @on_fn(a) => { return { value: math.nope(a) } }
}
"#;
        let result = run_v4(source, "t", "on_ns", serde_json::json!({"a": 1.0}));
        let error = expect_err(&result, "unknown-host-binding");
        assert!(error["message"].as_str().unwrap().contains("nope"), "{result}");
        let result = run_v4(source, "t", "on_fn", serde_json::json!({"a": 1.0}));
        let error = expect_err(&result, "unknown-host-binding");
        assert!(error["message"].as_str().unwrap().contains("math"), "{result}");
    }

    #[test]
    fn v4_bare_identifier_calls_stay_builtins_only() {
        // Builtin table still works in v4…
        let source = r#"
@trait t {
  @on_ok(a) => { return { value: sqrt(a) } }
  @on_clamp(a) => { return { value: clamp(a, a, a) } }
  @on_nope(a) => { return { value: nope(a) } }
}
"#;
        let ok = run_v4(source, "t", "on_ok", serde_json::json!({"a": 4.0}));
        assert_eq!(expect_ok(&ok), &serde_json::json!({"value": 2.0}));
        // …and bare identifiers NEVER resolve as host namespaces/functions:
        // clamp exists on the mock host's math namespace but not in the
        // builtin table, so the bare call is refused like any unknown callee.
        for handler in ["on_clamp", "on_nope"] {
            let result = run_v4(source, "t", handler, serde_json::json!({"a": 1.0}));
            let error = expect_err(&result, "unsupported-call");
            assert!(
                error["message"].as_str().unwrap().contains("numeric-builtin table"),
                "{result}"
            );
        }
    }

    #[test]
    fn v4_namespaces_are_not_values() {
        // A bare namespace identifier in value position…
        let source = r#"
@trait t {
  @on_bare(a) => { return { value: math } }
  @on_member(a) => { return { value: math.clamp } }
}
"#;
        let result = run_v4(source, "t", "on_bare", serde_json::json!({"a": 1.0}));
        expect_err(&result, "unknown-identifier");
        // …and a MemberExpression VALUE with a namespace root both stay errors:
        // namespace resolution happens ONLY in callee position.
        let result = run_v4(source, "t", "on_member", serde_json::json!({"a": 1.0}));
        expect_err(&result, "unknown-identifier");
    }

    #[test]
    fn v4_bound_names_take_precedence_over_namespaces() {
        // A parameter named `math` shadows nothing — but in callee-root
        // position a BOUND name makes the call a member call on a value,
        // which stays outside the subset.
        let param_shadow = r#"
@trait t {
  @on_f(math) => { return { value: math.clamp(math, math, math) } }
}
"#;
        let result = run_v4(param_shadow, "t", "on_f", serde_json::json!({"math": 1.0}));
        let error = expect_err(&result, "unsupported-call");
        assert!(
            error["message"].as_str().unwrap().contains("bound parameter or local"),
            "{result}"
        );
        // Same precedence for locals.
        let local_shadow = r#"
@trait t {
  @on_f(a) => {
    math = a
    return { value: math.clamp(a, a, a) }
  }
}
"#;
        let result = run_v4(local_shadow, "t", "on_f", serde_json::json!({"a": 1.0}));
        expect_err(&result, "unsupported-call");
    }

    #[test]
    fn v4_computed_and_nested_member_callees_fail_closed() {
        let source = r#"
@trait t {
  @on_computed(a) => { return { value: math["clamp"](a, a, a) } }
  @on_nested(a) => { return { value: math.inner.clamp(a, a, a) } }
}
"#;
        let result = run_v4(source, "t", "on_computed", serde_json::json!({"a": 1.0}));
        let error = expect_err(&result, "unsupported-call");
        assert!(error["message"].as_str().unwrap().contains("computed"), "{result}");
        let result = run_v4(source, "t", "on_nested", serde_json::json!({"a": 1.0}));
        let error = expect_err(&result, "unsupported-call");
        assert!(
            error["message"].as_str().unwrap().contains("bare namespace identifier"),
            "{result}"
        );
    }

    #[test]
    fn v4_host_throw_becomes_host_binding_error() {
        let source = r#"
@trait t {
  @on_g(m) => { return { value: map_lib.map_get(m, "absent") } }
}
"#;
        let result = run_v4(source, "t", "on_g", serde_json::json!({"m": {}}));
        let error = expect_err(&result, "host-binding-error");
        assert!(
            error["message"].as_str().unwrap().contains("missing-key"),
            "{result}"
        );
    }

    #[test]
    fn v4_host_result_reentry_rails_fail_closed() {
        let source = r#"
@trait t {
  @on_badjson(a) => { return { value: weird.badjson(a) } }
  @on_proto(a) => { return { value: weird.proto(a) } }
  @on_undef(a) => { return { value: weird.undef(a) } }
}
"#;
        let result = run_v4(source, "t", "on_badjson", serde_json::json!({"a": 1.0}));
        expect_err(&result, "invalid-host-result");
        let result = run_v4(source, "t", "on_proto", serde_json::json!({"a": 1.0}));
        expect_err(&result, "unsafe-key");
        let result = run_v4(source, "t", "on_undef", serde_json::json!({"a": 1.0}));
        expect_err(&result, "invalid-host-result");
    }

    #[test]
    fn v4_matches_v3_outside_member_callee_calls() {
        // Same program, same args: byte-identical boundary output when no
        // host-binding call executes — and v3 itself still refuses member
        // callees, so the grammar only grew under the v4 id.
        let args = serde_json::json!({"a": 2.0, "b": 3.0, "t": 3.0}).to_string();
        let v3 = evaluate_trait_handler_v3_json(MATH_TRAIT, "std_math_conformance", "on_lerp", &args);
        let v4 = evaluate_trait_handler_v4_json(
            MATH_TRAIT,
            "std_math_conformance",
            "on_lerp",
            &args,
            &MockHost,
        );
        assert_eq!(v3, v4);
        let raw = evaluate_trait_handler_v3_json(
            "@trait t { @on_f(a) => { return { value: math.clamp(a, a, a) } } }",
            "t",
            "on_f",
            &serde_json::json!({"a": 1.0}).to_string(),
        );
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "unsupported-call");
    }

    // ===== v5 packaged factories (native seam tests — mock dispatcher, no JS host) =====

    fn run_v5_with(
        host: &dyn HostDispatcher,
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        let raw =
            evaluate_trait_handler_v5_json(source, trait_name, handler, &args.to_string(), host);
        serde_json::from_str(&raw).expect("v5 evaluator must always return JSON")
    }

    fn run_v5(
        source: &str,
        trait_name: &str,
        handler: &str,
        args: serde_json::Value,
    ) -> serde_json::Value {
        run_v5_with(&MockHost, source, trait_name, handler, args)
    }

    /// Configurable mock for v5 construction-time paths (collision / missing
    /// namespace): `(namespace, functions)` rows back lookup + enumeration;
    /// invoke always throws because these tests must fail BEFORE any invoke.
    struct TableHost(&'static [(&'static str, &'static [&'static str])]);

    impl HostDispatcher for TableHost {
        fn lookup(&self, namespace: &str, function: &str) -> HostLookup {
            match self.0.iter().find(|(name, _)| *name == namespace) {
                None => HostLookup::UnknownNamespace,
                Some((_, functions)) if functions.contains(&function) => HostLookup::Found,
                Some(_) => HostLookup::UnknownFunction,
            }
        }

        fn functions(&self, namespace: &str) -> Option<Vec<String>> {
            self.0
                .iter()
                .find(|(name, _)| *name == namespace)
                .map(|(_, functions)| functions.iter().map(|f| f.to_string()).collect())
        }

        fn invoke(&self, namespace: &str, function: &str, _args_json: &[String]) -> HostInvokeOutcome {
            HostInvokeOutcome::Threw(format!(
                "table host never invokes (got {namespace}.{function})"
            ))
        }
    }

    const FACTORY_TRAIT: &str = r#"
@trait std_factory_conformance {
  @on_clamp(x) => {
    m = get_std_math_lib()
    return m.clamp(x, 0, 10)
  }
  @on_list_reverse(lst) => {
    c = get_std_collections_lib()
    return c.list_reverse(lst)
  }
  @on_both(lst, s_a, s_b) => {
    c = get_std_collections_lib()
    r = c.list_reverse(lst)
    u = c.set_union(s_a, s_b)
    return { reversed: r, union: u }
  }
  @on_unknown_fn(lst) => {
    c = get_std_collections_lib()
    return c.no_such_fn(lst)
  }
  @on_zero => { return 7 }
}
"#;

    const SPAWN_TRAIT: &str = r#"
@trait std_spawn_conformance {
  @on_spawn => {
    m2 = get_std_math_lib()
    emit("std_spawn_ready", {})
  }
  @on_clamp(value, min, max) => {
    return m2.clamp(value, min, max)
  }
}
"#;

    const ESCAPE_TRAIT: &str = r#"
@trait std_escape_conformance {
  @on_return(x) => {
    m = get_std_math_lib()
    return m
  }
  @on_object(x) => {
    m = get_std_math_lib()
    return { h: m }
  }
  @on_array(x) => {
    m = get_std_math_lib()
    return [m]
  }
  @on_compare(x) => {
    m = get_std_math_lib()
    return m == m
  }
  @on_host_arg(x) => {
    m = get_std_math_lib()
    return math.clamp(m, 0, 1)
  }
}
"#;

    #[test]
    fn v5_subset_id_is_pinned() {
        assert_eq!(
            DETERMINISTIC_SUBSET_V5,
            "holoscript-engine-hsplus-deterministic-action-subset-v5-packaged-factories"
        );
    }

    #[test]
    fn v5_factory_call_returns_working_handle_and_bare_return_works() {
        // `m = get_std_math_lib()` then a BARE return of the member-call
        // result (a plain number, not an object wrapper) — the packaged
        // handlers' exact shape.
        let result = run_v5(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_clamp",
            serde_json::json!({"x": 42.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!(10.0));
    }

    #[test]
    fn v5_union_handle_dispatches_across_all_three_namespaces() {
        let result = run_v5(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_list_reverse",
            serde_json::json!({"lst": [1.0, 2.0, 3.0]}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!([3.0, 2.0, 1.0]));
        // ONE handle local serving both list_lib and set_lib functions.
        let result = run_v5(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_both",
            serde_json::json!({"lst": [1.0, 2.0], "s_a": [3.0, 1.0], "s_b": [2.0, 1.0]}),
        );
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"reversed": [2.0, 1.0], "union": [1.0, 2.0, 3.0]})
        );
        // A function no backing namespace exposes names the producing factory.
        let result = run_v5(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_unknown_fn",
            serde_json::json!({"lst": []}),
        );
        let error = expect_err(&result, "unknown-host-binding");
        assert!(
            error["message"]
                .as_str()
                .unwrap()
                .contains("get_std_collections_lib"),
            "{result}"
        );
    }

    #[test]
    fn v5_on_spawn_prepass_binds_aliases_without_executing_spawn() {
        // The fixture mirrors the packaged shape: @on_spawn binds the alias
        // AND emits; the invoked handler uses the alias without binding it.
        // `m2` is NOT an ambient namespace, so success proves the pre-pass
        // bound it — and proves emit() never executed (a bare `emit` call is
        // outside every admitted grammar and would fail the evaluation).
        let result = run_v5(
            SPAWN_TRAIT,
            "std_spawn_conformance",
            "on_clamp",
            serde_json::json!({"value": 42.0, "min": 0.0, "max": 10.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!(10.0));
        // The pre-pass is v5-only: the same program under v4 has no `m2`
        // binding, so the callee root falls through to ambient-namespace
        // resolution and fails closed.
        let raw = evaluate_trait_handler_v4_json(
            SPAWN_TRAIT,
            "std_spawn_conformance",
            "on_clamp",
            &serde_json::json!({"value": 42.0, "min": 0.0, "max": 10.0}).to_string(),
            &MockHost,
        );
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "unknown-host-binding");
    }

    #[test]
    fn v5_handle_escape_paths_fail_closed() {
        for handler in ["on_return", "on_object", "on_array", "on_compare", "on_host_arg"] {
            let result = run_v5(
                ESCAPE_TRAIT,
                "std_escape_conformance",
                handler,
                serde_json::json!({"x": 1.0}),
            );
            let error = expect_err(&result, "namespace-handle-escape");
            assert!(
                error["message"].as_str().unwrap().contains("get_std_math_lib"),
                "handler {handler}: {result}"
            );
        }
    }

    #[test]
    fn v5_zero_param_no_paren_handler_invocable_with_empty_args() {
        let result = run_v5(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_zero",
            serde_json::json!({}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!(7.0));
    }

    #[test]
    fn v5_factory_arity_and_bound_name_shadowing() {
        let source = r#"
@trait factory_edges {
  @on_arity(x) => {
    m = get_std_math_lib(x)
    return x
  }
  @on_shadow(get_std_math_lib) => {
    return get_std_math_lib()
  }
}
"#;
        let result = run_v5(source, "factory_edges", "on_arity", serde_json::json!({"x": 1.0}));
        expect_err(&result, "factory-arity");
        // A factory name shadowed by a bound parameter is NOT a factory call:
        // it falls through to the builtin table's refusal (bound names take
        // precedence, mirroring the v4 namespace rule).
        let result = run_v5(
            source,
            "factory_edges",
            "on_shadow",
            serde_json::json!({"get_std_math_lib": 1.0}),
        );
        let error = expect_err(&result, "unsupported-call");
        assert!(
            error["message"].as_str().unwrap().contains("numeric-builtin table"),
            "{result}"
        );
    }

    #[test]
    fn v5_union_collision_fails_at_handle_construction() {
        // `shared` exists in both list_lib and set_lib: the union handle must
        // refuse CONSTRUCTION (invoke never runs — TableHost would throw).
        let host = TableHost(&[
            ("list_lib", &["list_reverse", "shared"]),
            ("map_lib", &["map_get"]),
            ("set_lib", &["shared"]),
        ]);
        let result = run_v5_with(
            &host,
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_list_reverse",
            serde_json::json!({"lst": []}),
        );
        let error = expect_err(&result, "namespace-collision");
        let message = error["message"].as_str().unwrap();
        assert!(message.contains("shared"), "{result}");
        assert!(message.contains("list_lib") && message.contains("set_lib"), "{result}");
    }

    #[test]
    fn v5_missing_backing_namespace_fails_closed() {
        let host = TableHost(&[("math", &["clamp"])]);
        let result = run_v5_with(
            &host,
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_list_reverse",
            serde_json::json!({"lst": []}),
        );
        let error = expect_err(&result, "unknown-host-binding");
        assert!(
            error["message"].as_str().unwrap().contains("list_lib"),
            "{result}"
        );
    }

    #[test]
    fn v5_matches_v4_outside_factories() {
        // Same program, same args: byte-identical boundary output when no
        // factory construct executes.
        let args = serde_json::json!({"a": 2.0, "b": 3.0, "t": 3.0}).to_string();
        let v4 = evaluate_trait_handler_v4_json(
            MATH_TRAIT,
            "std_math_conformance",
            "on_lerp",
            &args,
            &MockHost,
        );
        let v5 = evaluate_trait_handler_v5_json(
            MATH_TRAIT,
            "std_math_conformance",
            "on_lerp",
            &args,
            &MockHost,
        );
        assert_eq!(v4, v5);
        // …and v4 itself still refuses factory calls, so the grammar only
        // grew under the v5 id.
        let raw = evaluate_trait_handler_v4_json(
            FACTORY_TRAIT,
            "std_factory_conformance",
            "on_clamp",
            &serde_json::json!({"x": 1.0}).to_string(),
            &MockHost,
        );
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        expect_err(&parsed, "unsupported-call");
    }

    // ===== v5 reality check: the REAL packaged @holoscript/std sources =====

    fn packaged_source(relative: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join(relative);
        std::fs::read_to_string(&path)
            .unwrap_or_else(|error| panic!("packaged source {} must be readable: {error}", path.display()))
    }

    fn packaged_handler<'a>(
        ast: &'a crate::ast::Ast,
        trait_name: &str,
        handler_name: &str,
    ) -> &'a GameEventBlockNode {
        for node in &ast.body {
            let AstNode::Trait(trait_node) = node else { continue };
            if trait_node.name != trait_name {
                continue;
            }
            for member in &trait_node.members {
                let AstNode::GameEventBlock(handler) = member else { continue };
                if handler.name == handler_name {
                    return handler;
                }
            }
        }
        panic!("packaged trait {trait_name} must declare @{handler_name}");
    }

    #[test]
    fn v5_reality_check_packaged_std_sources_parse_and_execute() {
        let math = packaged_source("../std/src/math.hsplus");
        let collections = packaged_source("../std/src/collections.hsplus");

        // (1) Statement-parse census over EVERY handler of every packaged
        // trait. Empirical finding pinned here: all packaged handler bodies
        // parse as statements — including the `??` handlers (the grammar has
        // a null-coalescing production) and the callback-delegation handlers.
        // Anything landing in `unparsed` is a regression to report.
        let mut unparsed = Vec::new();
        for (label, source) in [("math.hsplus", &math), ("collections.hsplus", &collections)] {
            let ast = crate::parse_ast(source)
                .unwrap_or_else(|d| panic!("packaged {label} must parse: {d:?}"));
            for node in &ast.body {
                let AstNode::Trait(trait_node) = node else { continue };
                for member in &trait_node.members {
                    let AstNode::GameEventBlock(handler) = member else { continue };
                    if handler.parsed_body.is_none() {
                        unparsed.push(format!("{label}:{}.{}", trait_node.name, handler.name));
                    }
                }
            }
        }
        assert!(
            unparsed.is_empty(),
            "packaged handler bodies failed the statement parse: {unparsed:?}"
        );

        // (2) Pinned specifics from the conformance program.
        let math_ast = crate::parse_ast(&math).expect("math.hsplus must parse");
        let clamp = packaged_handler(&math_ast, "std_math", "on_clamp");
        assert_eq!(clamp.params, ["value", "min", "max"]);
        assert!(clamp.parsed_body.as_ref().is_some_and(|b| !b.is_empty()));
        let identity = packaged_handler(&math_ast, "std_math", "on_quat_identity");
        assert!(
            identity.params.is_empty(),
            "the NO-PAREN header `@on_quat_identity =>` must produce a zero-param handler"
        );
        assert!(identity.parsed_body.as_ref().is_some_and(|b| !b.is_empty()));
        let collections_ast = crate::parse_ast(&collections).expect("collections.hsplus must parse");
        let reverse = packaged_handler(&collections_ast, "std_list", "on_reverse");
        assert!(reverse.parsed_body.as_ref().is_some_and(|b| !b.is_empty()));

        // (3) DIRECT execution of the packaged sources, as authored — the
        // whole point of v5. The on_spawn pre-pass lifts `math` / `list_lib`
        // / `set_lib` aliases; emit() is not executed.
        let result = run_v5(
            &math,
            "std_math",
            "on_clamp",
            serde_json::json!({"value": 42.0, "min": 0.0, "max": 10.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!(10.0));
        let result = run_v5(&math, "std_math", "on_quat_identity", serde_json::json!({}));
        assert_eq!(
            expect_ok(&result),
            &serde_json::json!({"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0})
        );
        // Pure-arithmetic packaged handler (no factory involvement) under v5.
        let result = run_v5(
            &math,
            "std_math",
            "on_lerp",
            serde_json::json!({"a": 2.0, "b": 3.0, "t": 3.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!(5.0));
        let result = run_v5(
            &collections,
            "std_list",
            "on_reverse",
            serde_json::json!({"lst": [1.0, 2.0, 3.0]}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!([3.0, 2.0, 1.0]));
        let result = run_v5(
            &collections,
            "std_set",
            "on_union",
            serde_json::json!({"s_a": [3.0, 1.0], "s_b": [2.0, 1.0]}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!([1.0, 2.0, 3.0]));

        // (4) `??` joined the v5 subset: the packaged on_range defaults its
        // JSON-null step through `step ?? 1` and executes; an explicit step
        // short-circuits the right operand.
        let result = run_v5(
            &collections,
            "std_list",
            "on_range",
            serde_json::json!({"start": 0.0, "end": 3.0, "step": null}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!([0.0, 1.0, 2.0]));
        let result = run_v5(
            &collections,
            "std_list",
            "on_range",
            serde_json::json!({"start": 0.0, "end": 4.0, "step": 2.0}),
        );
        assert_eq!(expect_ok(&result), &serde_json::json!([0.0, 2.0]));
    }

    #[test]
    fn null_coalescing_stays_closed_below_v5() {
        // The `??` operator is a v5 admission; the pinned v2–v4 subsets keep
        // refusing it so their receipt contracts do not drift.
        let source = r#"
@trait t {
  @on_f(x) => {
    return { value: x ?? 1 }
  }
}
"#;
        let result: serde_json::Value = serde_json::from_str(&evaluate_trait_handler_v4_json(
            source,
            "t",
            "on_f",
            "{\"x\":null}",
            &MockHost,
        ))
        .expect("v4 boundary returns JSON");
        let error = expect_err(&result, "unsupported-operator");
        assert!(error["message"].as_str().unwrap().contains("??"), "{result}");
    }
}
