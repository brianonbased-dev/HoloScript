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

/// Evaluation mode threaded through the statement/expression walkers. v1 keeps
/// `numeric_builtins` off (every `CallExpression` is `unsupported-call`, same
/// code and message as before the mode existed); v2 turns the builtin table on.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct EvalMode {
    numeric_builtins: bool,
}

const MODE_V1: EvalMode = EvalMode {
    numeric_builtins: false,
};
const MODE_V2: EvalMode = EvalMode {
    numeric_builtins: true,
};

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

fn evaluate_with_mode_json(
    source: &str,
    trait_name: &str,
    handler_name: &str,
    args_json: &str,
    mode: EvalMode,
) -> String {
    match evaluate(source, trait_name, handler_name, args_json, mode) {
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
    mode: EvalMode,
) -> Result<Value, EvalError> {
    let ast = crate::parse_ast(source).map_err(|diagnostics| {
        let detail = diagnostics
            .iter()
            .map(|d| format!("{} (line {}, column {})", d.message, d.line, d.column))
            .collect::<Vec<_>>()
            .join("; ");
        err("parse-error", format!("source failed to parse: {detail}"))
    })?;

    let handler = find_handler(&ast.body, trait_name, handler_name)?;

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

    let scope = bind_args(&handler.params, handler_name, args_json)?;
    run_handler(body, scope, handler_name, mode)
}

fn find_handler<'a>(
    top_level: &'a [AstNode],
    trait_name: &str,
    handler_name: &str,
) -> Result<&'a GameEventBlockNode, EvalError> {
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
    Ok(handlers[0])
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
    }
}

fn run_handler(
    body: &[AstNode],
    mut scope: BTreeMap<String, Value>,
    handler_name: &str,
    mode: EvalMode,
) -> Result<Value, EvalError> {
    match exec_block(body, &mut scope, mode)? {
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
    mode: EvalMode,
) -> Result<Flow, EvalError> {
    for statement in statements {
        if let Flow::Return(value) = exec_statement(statement, scope, mode)? {
            return Ok(Flow::Return(value));
        }
    }
    Ok(Flow::Normal)
}

fn exec_statement(
    node: &AstNode,
    scope: &mut BTreeMap<String, Value>,
    mode: EvalMode,
) -> Result<Flow, EvalError> {
    match node {
        AstNode::Return(ret) => {
            let value = match ret.argument.as_ref() {
                Some(argument) => eval_expr(argument, scope, mode)?,
                None => Value::Null,
            };
            Ok(Flow::Return(value))
        }
        AstNode::If(node) => {
            let Value::Bool(test) = eval_expr(&node.test, scope, mode)? else {
                return Err(err(
                    "type-mismatch",
                    "if condition requires a boolean (no truthiness in the deterministic subset)",
                ));
            };
            if test {
                exec_block(&node.consequent, scope, mode)
            } else if let Some(alternate) = node.alternate.as_ref() {
                exec_block(alternate, scope, mode)
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
            let value = eval_expr(&node.value, scope, mode)?;
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
    mode: EvalMode,
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
            let object = eval_expr(&member.object, scope, mode)?;
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
                eval_object_property(property, scope, mode, &mut entries)?;
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
                items.push(eval_expr(element, scope, mode)?);
            }
            Ok(Value::Arr(items))
        }
        AstNode::BinaryExpression(binary) => eval_binary(binary, scope, mode),
        AstNode::UnaryExpression(unary) => match unary.operator.as_str() {
            "!" => {
                let Value::Bool(argument) = eval_expr(&unary.argument, scope, mode)? else {
                    return Err(err("type-mismatch", "logical not requires a boolean"));
                };
                Ok(Value::Bool(!argument))
            }
            "-" => {
                let argument =
                    numeric_operand(eval_expr(&unary.argument, scope, mode)?, "negation")?;
                checked_number(-argument, "negation")
            }
            other => Err(err(
                "unsupported-operator",
                format!("unary operator \"{other}\" is not in the deterministic subset"),
            )),
        },
        AstNode::CallExpression(call) => {
            if !mode.numeric_builtins {
                // v1 behavior, byte-for-byte: every call is refused with the
                // same code and message as before the v2 mode existed.
                return Err(err(
                    "unsupported-call",
                    "function calls are not in the deterministic subset v0 (no host library, no math builtins)",
                ));
            }
            eval_builtin_call(call, scope, mode)
        }
        other => Err(err(
            "unsupported-node",
            format!("expression {} is not in the deterministic subset v0", node_kind(other)),
        )),
    }
}

/// Evaluate one whitelisted numeric builtin call (v2 mode only). Admission is
/// strictly: bare-identifier callee in [`NUMERIC_BUILTINS`], exact arity,
/// every argument a number; the f64 result passes through [`checked_number`]
/// so domain errors (`sqrt(-1)`, `acos(2)` → NaN) fail closed as `non-finite`.
fn eval_builtin_call(
    call: &crate::ast::CallExpression,
    scope: &BTreeMap<String, Value>,
    mode: EvalMode,
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
        let Value::Num(operand) = eval_expr(argument, scope, mode)? else {
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
    mode: EvalMode,
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
    let value = eval_expr(&property.value, scope, mode)?;
    entries.push((property.key.clone(), value));
    Ok(())
}

fn eval_binary(
    binary: &crate::ast::BinaryExpression,
    scope: &BTreeMap<String, Value>,
    mode: EvalMode,
) -> Result<Value, EvalError> {
    match binary.operator.as_str() {
        // Logical operators short-circuit exactly like the engine runtime.
        "&&" => {
            let Value::Bool(left) = eval_expr(&binary.left, scope, mode)? else {
                return Err(err("type-mismatch", "logical and requires booleans"));
            };
            if !left {
                return Ok(Value::Bool(false));
            }
            let Value::Bool(right) = eval_expr(&binary.right, scope, mode)? else {
                return Err(err("type-mismatch", "logical and requires booleans"));
            };
            Ok(Value::Bool(right))
        }
        "||" => {
            let Value::Bool(left) = eval_expr(&binary.left, scope, mode)? else {
                return Err(err("type-mismatch", "logical or requires booleans"));
            };
            if left {
                return Ok(Value::Bool(true));
            }
            let Value::Bool(right) = eval_expr(&binary.right, scope, mode)? else {
                return Err(err("type-mismatch", "logical or requires booleans"));
            };
            Ok(Value::Bool(right))
        }
        "+" => {
            let left = eval_expr(&binary.left, scope, mode)?;
            let right = eval_expr(&binary.right, scope, mode)?;
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
            let left = numeric_operand(eval_expr(&binary.left, scope, mode)?, "subtraction")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, mode)?, "subtraction")?;
            checked_number(left - right, "subtraction")
        }
        "*" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, mode)?, "multiplication")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, mode)?, "multiplication")?;
            checked_number(left * right, "multiplication")
        }
        "/" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, mode)?, "division")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, mode)?, "division")?;
            if right == 0.0 {
                return Err(err("division-by-zero", "division by zero is not admitted"));
            }
            checked_number(left / right, "division")
        }
        // `===`/`!==` never reach here through the wasm grammar (the lexer has no
        // triple-equals token), but the engine admits them as aliases of `==`/`!=`,
        // so keep the mapping total for AST-level callers.
        "==" | "===" => Ok(Value::Bool(primitive_equal(
            &eval_expr(&binary.left, scope, mode)?,
            &eval_expr(&binary.right, scope, mode)?,
        )?)),
        "!=" | "!==" => Ok(Value::Bool(!primitive_equal(
            &eval_expr(&binary.left, scope, mode)?,
            &eval_expr(&binary.right, scope, mode)?,
        )?)),
        "<" | ">" | "<=" | ">=" => {
            let left = numeric_operand(eval_expr(&binary.left, scope, mode)?, "comparison")?;
            let right = numeric_operand(eval_expr(&binary.right, scope, mode)?, "comparison")?;
            Ok(Value::Bool(match binary.operator.as_str() {
                "<" => left < right,
                ">" => left > right,
                "<=" => left <= right,
                _ => left >= right,
            }))
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
}
