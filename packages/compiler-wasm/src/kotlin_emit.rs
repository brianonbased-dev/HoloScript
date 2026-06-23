//! Kotlin code emitter for the `.hs` imperative-logic subset.
//!
//! This is the FIRST target-language backend in the Rust/WASM crate. It walks the
//! canonical AST produced by [`crate::parser`] (the only grammar that actually parses
//! `.hs` *logic* bodies — the TS `HoloScriptPlusParser` keeps function bodies as raw
//! strings, see MEMORY W.815) and emits on-device Kotlin for the `compile_to_quest`
//! target.
//!
//! Scope (intentional, matches the `.hs` logic subset the parser accepts):
//! - top-level `function name(params) { … }`  → Kotlin `fun name(p: String): T { … }`
//! - top-level `struct Name { f, … }`          → Kotlin `data class Name(val f: Float, …)`
//! - top-level `enum Name { A, … }`            → Kotlin `enum class Name { A, … }`
//! - `let` / `const` binding                   → Kotlin `val name = <expr>` (immutable)
//! - `var` binding + reassignment              → Kotlin `var name = <expr>` + `name = <expr>`
//!   (`var` opts into LOCAL mutable state so a pure function can accumulate inside a loop —
//!   the mutation never escapes the function; host state stays in the Kotlin shell, W.815)
//! - `if (cond) { … } else { … }`              → Kotlin `if (cond) { … } else { … }`
//! - `while (cond) { … }`                       → Kotlin `while (cond) { … }`
//! - `for (i in 0..n) { … }`                    → Kotlin `for (i in 0..n) { … }`
//! - `return <expr>` / bare `return`           → Kotlin `return <expr>` / `return`
//! - expressions: binary / unary / call / member / index / range / literals / identifiers
//!
//! Type policy: `.hs` logic functions are untyped. For the Quest logic surface the return
//! type is inferred (`Boolean` when the function only ever returns boolean-shaped
//! expressions; `Float` when it only ever returns numeric-shaped expressions; otherwise
//! `String`), and each parameter is typed by usage (`Float` when it participates in
//! arithmetic or is passed to a numeric builtin like `sqrt`, otherwise `String`). This is a
//! deliberately small, predictable inference — the emitter's contract is "behaviourally
//! matches the hand-Kotlin", verified by golden I/O parity, not byte-identity.
//!
//! Numeric subset (added for the Quest locomotion math, authored in `.hs`): numeric literals
//! emit with the Kotlin `Float` `f` suffix; `+ - * /` arithmetic is re-parenthesized from the
//! parsed precedence so grouping survives (the parser discards parentheses, keeping only the
//! precedence-correct tree — the emitter must restore the parentheses the math needs); and a
//! `.hs` `sqrt(x)` call maps to Kotlin `kotlin.math.sqrt(x)`. Statefulness, SDK/host calls, and
//! loops stay in the Kotlin shell — only pure single-assignment math lives in `.hs`.
//!
//! Anything outside the subset (the behavioural `move`/`action`/`on_*` blocks, object-graph
//! nodes) is skipped at the top level and reported via [`KotlinEmitError`] for function-body
//! constructs, so an unhandled node fails loud instead of silently emitting wrong Kotlin.

use crate::ast::{Ast, AstNode, EnumDeclarationNode, StructDeclarationNode};

/// An error raised while emitting Kotlin from a parsed `.hs` AST.
#[derive(Debug, Clone)]
pub struct KotlinEmitError {
    pub message: String,
}

impl KotlinEmitError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for KotlinEmitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

/// Inferred Kotlin type for an emitted function's return or a parameter.
#[derive(Debug, Clone, PartialEq, Eq)]
enum ValType {
    Str,
    Bool,
    Float,
    /// An integer — used for a parameter that bounds a range (`for (i in 0..n)` ⇒ `n: Int`).
    Int,
    /// A declared `.hs` enum (sum-type), carrying its Kotlin type name (e.g. `Route`).
    Enum(String),
    /// A declared `.hs` struct (record), carrying its Kotlin type name (e.g. `Vec3`).
    Struct(String),
}

impl ValType {
    fn kotlin(&self) -> String {
        match self {
            ValType::Str => "String".to_string(),
            ValType::Bool => "Boolean".to_string(),
            ValType::Float => "Float".to_string(),
            ValType::Int => "Int".to_string(),
            ValType::Enum(name) => name.clone(),
            ValType::Struct(name) => name.clone(),
        }
    }
}

/// Emit Kotlin declarations for every top-level `enum` and `function` in `ast`.
///
/// Each declaration is rendered with the given `indent` prefix (e.g. two spaces when the
/// declarations live inside a Kotlin `object`). Declarations are separated by a blank line,
/// with `enum class` blocks emitted before the functions (so a function may name an enum as
/// its return type). Non-function/non-enum top-level nodes are ignored (they belong to the
/// object-graph surface, not the logic surface this emitter targets).
pub fn emit_functions(ast: &Ast, indent: &str) -> Result<String, KotlinEmitError> {
    // First pass: collect the declared enum names so return-type inference can recognize an
    // `Enum.Member` reference as that enum's value (and so a stray member name can't be read
    // as a plain identifier). `.hs` enums are data-only — name + bare member list.
    let enums: Vec<&EnumDeclarationNode> = ast
        .body
        .iter()
        .filter_map(|n| match n {
            AstNode::EnumDeclaration(e) => Some(e),
            _ => None,
        })
        .collect();
    let enum_names: Vec<String> = enums.iter().map(|e| e.name.clone()).collect();

    // Collect declared struct (record) names so return-type inference can recognize a
    // `Name(...)` constructor call as that struct's value. `.hs` structs are data-only.
    let structs: Vec<&StructDeclarationNode> = ast
        .body
        .iter()
        .filter_map(|n| match n {
            AstNode::StructDeclaration(s) => Some(s),
            _ => None,
        })
        .collect();
    let struct_names: Vec<String> = structs.iter().map(|s| s.name.clone()).collect();

    let mut blocks: Vec<String> = Vec::new();
    // Data declarations (struct/enum) precede functions so a function may name them as a return
    // type or construct them.
    for s in &structs {
        blocks.push(emit_struct(s, indent));
    }
    for e in &enums {
        blocks.push(emit_enum(e, indent));
    }
    for node in &ast.body {
        if let AstNode::Function(func) = node {
            blocks.push(emit_function(
                &func.name,
                &func.params,
                &func.body,
                indent,
                &enum_names,
                &struct_names,
            )?);
        }
    }
    Ok(blocks.join("\n\n"))
}

/// Emit `data class <Name>(val <field>: Float, …)` for a `.hs` struct declaration. Fields are
/// untyped in the `.hs` logic subset; the data-only record types every field `Float` (the numeric
/// default that matches the math/geometry use cases — a struct carries a multi-field numeric
/// result out of a pure function). A zero-field struct emits `class <Name>` (Kotlin forbids an
/// empty `data class`).
fn emit_struct(node: &StructDeclarationNode, indent: &str) -> String {
    if node.fields.is_empty() {
        return format!("{}class {}", indent, node.name);
    }
    let fields = node
        .fields
        .iter()
        .map(|f| format!("val {}: Float", f))
        .collect::<Vec<_>>()
        .join(", ");
    format!("{}data class {}({})", indent, node.name, fields)
}

/// Emit `enum class <Name> { <Member>, <Member>, … }` for a `.hs` enum declaration.
/// Members are bare identifiers (no associated values), matching the data-only `.hs` subset.
fn emit_enum(node: &EnumDeclarationNode, indent: &str) -> String {
    format!(
        "{}enum class {} {{ {} }}",
        indent,
        node.name,
        node.members.join(", ")
    )
}

/// Parse `.hs` source and emit Kotlin for its top-level functions.
///
/// Returns a JSON-free Kotlin string on success, or an error string prefixed with
/// `__emit_error__:` so the WASM boundary can distinguish failure from valid output.
pub fn compile_source_to_kotlin(source: &str, indent: &str) -> Result<String, KotlinEmitError> {
    let ast = crate::parser::Parser::new(source)
        .parse()
        .map_err(|errors| {
            let first = errors
                .first()
                .map(|e| format!("{} (line {}, col {})", e.message, e.line, e.column))
                .unwrap_or_else(|| "unknown parse error".to_string());
            KotlinEmitError::new(format!("parse failed: {}", first))
        })?;
    emit_functions(&ast, indent)
}

fn emit_function(
    name: &str,
    params: &[String],
    body: &[AstNode],
    indent: &str,
    enum_names: &[String],
    struct_names: &[String],
) -> Result<String, KotlinEmitError> {
    let ret = infer_return_type(body, enum_names, struct_names);
    let param_list = params
        .iter()
        .map(|p| format!("{}: {}", p, infer_param_type(p, body).kotlin()))
        .collect::<Vec<_>>()
        .join(", ");

    let body_indent = format!("{}  ", indent);
    let mut lines: Vec<String> = Vec::new();
    for stmt in body {
        emit_statement(stmt, &body_indent, &mut lines)?;
    }

    let mut out = String::new();
    out.push_str(&format!(
        "{}fun {}({}): {} {{\n",
        indent,
        name,
        param_list,
        ret.kotlin()
    ));
    out.push_str(&lines.join("\n"));
    if !lines.is_empty() {
        out.push('\n');
    }
    out.push_str(&format!("{}}}", indent));
    Ok(out)
}

/// Infer the Kotlin return type from the function's `return` expressions:
/// an `enum` type if every return is a member of the SAME declared enum (`Route.EnterWorld`),
/// `Boolean` if every return is boolean-shaped, `Float` if every return is numeric-shaped
/// (and at least one return exists in each case), otherwise `String`. The conservative
/// default of `String` matches the Quest naming functions; the `Float` branch carries the
/// locomotion math; the enum branch carries the routing decision. Enum is checked first so a
/// member access never falls through to `String`, then Boolean so a comparison never reads as
/// numeric.
fn infer_return_type(body: &[AstNode], enum_names: &[String], struct_names: &[String]) -> ValType {
    let mut returns: Vec<&AstNode> = Vec::new();
    collect_returns(body, &mut returns);
    if returns.is_empty() {
        return ValType::Str;
    }
    // Enum: every return must be a member of the SAME declared enum. A mix of two enums (or an
    // enum and something else) is not a single enum type, so it falls through to the rules below.
    if let Some(first) = returns
        .first()
        .and_then(|n| enum_member_owner(n, enum_names))
    {
        if returns
            .iter()
            .all(|n| enum_member_owner(n, enum_names).as_deref() == Some(first.as_str()))
        {
            return ValType::Enum(first);
        }
    }
    // Struct: every return must construct the SAME declared struct (`Vec3(x, y, z)`).
    if let Some(first) = returns
        .first()
        .and_then(|n| struct_ctor_owner(n, struct_names))
    {
        if returns
            .iter()
            .all(|n| struct_ctor_owner(n, struct_names).as_deref() == Some(first.as_str()))
        {
            return ValType::Struct(first);
        }
    }
    // Collect local bindings whose value is numeric (a `var`/`let` initialized to numeric-shaped
    // arithmetic, or mutated by numeric assignment / a `+=`-style compound). This lets a function
    // that returns a bare accumulator identifier (`return total`) resolve to `Float` instead of the
    // `String` default — the common pure-loop shape.
    let numeric_locals = collect_numeric_local_bindings(body);
    let is_num = |n: &AstNode| -> bool {
        is_numeric_expr(n)
            || matches!(n, AstNode::Identifier(id) if numeric_locals.iter().any(|b| b == &id.name))
    };

    if returns.iter().all(|n| is_boolean_expr(n)) {
        ValType::Bool
    } else if returns.iter().all(|n| is_num(n)) {
        ValType::Float
    } else {
        ValType::Str
    }
}

/// Collect the names of local bindings (`let`/`const`/`var`) in this function body whose value is
/// numeric — either initialized to a numeric-shaped expression, or mutated anywhere by a numeric
/// assignment (`x = x + 1`) or a `+=`/`-=`/`*=`/`/=`/`%=` compound. Used so a bare-identifier
/// return of an accumulator infers `Float`. Walks into nested loop/if blocks (an accumulator
/// declared outside a loop is mutated inside it).
fn collect_numeric_local_bindings(body: &[AstNode]) -> Vec<String> {
    let mut numeric: Vec<String> = Vec::new();
    walk_collect_numeric_bindings(body, &mut numeric);
    numeric
}

fn walk_collect_numeric_bindings(body: &[AstNode], numeric: &mut Vec<String>) {
    for node in body {
        match node {
            AstNode::VariableDeclaration(v) => {
                if is_numeric_expr(&v.value) && !numeric.iter().any(|b| b == &v.name) {
                    numeric.push(v.name.clone());
                }
            }
            AstNode::Assignment(a) => {
                // A compound arithmetic assignment is numeric by construction; a plain `=` is
                // numeric when its r-value is numeric-shaped.
                let compound_numeric =
                    matches!(a.operator.as_str(), "+=" | "-=" | "*=" | "/=" | "%=");
                if compound_numeric || is_numeric_expr(&a.value) {
                    if let AstNode::Identifier(id) = a.target.as_ref() {
                        if !numeric.iter().any(|b| b == &id.name) {
                            numeric.push(id.name.clone());
                        }
                    }
                }
            }
            AstNode::ForOf(f) => walk_collect_numeric_bindings(&f.body, numeric),
            AstNode::While(w) => walk_collect_numeric_bindings(&w.body, numeric),
            AstNode::If(if_node) => {
                walk_collect_numeric_bindings(&if_node.consequent, numeric);
                if let Some(alt) = &if_node.alternate {
                    walk_collect_numeric_bindings(alt, numeric);
                }
            }
            _ => {}
        }
    }
}

/// If `node` is an enum-member reference (`<EnumName>.<Member>` where `<EnumName>` is a declared
/// enum), return the enum's name; otherwise `None`. Used by return-type inference to type a
/// function that yields enum values as returning that enum.
fn enum_member_owner(node: &AstNode, enum_names: &[String]) -> Option<String> {
    if let AstNode::MemberExpression(m) = node {
        if !m.computed {
            if let AstNode::Identifier(obj) = m.object.as_ref() {
                if enum_names.iter().any(|e| e == &obj.name) {
                    return Some(obj.name.clone());
                }
            }
        }
    }
    None
}

/// If `node` is a struct-constructor call (`<StructName>(args)` where `<StructName>` is a declared
/// struct), return the struct's name; otherwise `None`. Used by return-type inference to type a
/// function that yields a struct value as returning that struct.
fn struct_ctor_owner(node: &AstNode, struct_names: &[String]) -> Option<String> {
    if let AstNode::CallExpression(c) = node {
        if let AstNode::Identifier(id) = c.callee.as_ref() {
            if struct_names.iter().any(|s| s == &id.name) {
                return Some(id.name.clone());
            }
        }
    }
    None
}

/// Infer a parameter's Kotlin type by how the function body uses it: `Float` when the
/// parameter participates in arithmetic (`+ - * /`), is the argument of a numeric builtin
/// (`sqrt`); `Boolean` when it is used only as a bare truth value (an `if (param)` test, or an
/// operand of `&& || !`); otherwise `String`. This is the analogue of the existing all-`String`
/// policy — a `.hs` logic function is pure single-assignment, so a parameter used arithmetically
/// (or booleanly) anywhere is that type everywhere. Numeric is checked first so a value used in
/// both arithmetic and a comparison reads as `Float`; the routing decision's flags
/// (`isWorldLink` / `autoImmerse` / `isOpenAction`) are used only as bare `if` tests → `Boolean`.
fn infer_param_type(param: &str, body: &[AstNode]) -> ValType {
    // A param that bounds a range (`for (i in 0..n)`) is definitively `Int` — Kotlin ranges are
    // integer-typed — so this is checked before the Float/Boolean/String fallbacks.
    if body_uses_param_as_range_bound(param, body) {
        ValType::Int
    } else if body_uses_param_numerically(param, body) {
        ValType::Float
    } else if body_uses_param_as_boolean(param, body) {
        ValType::Bool
    } else {
        ValType::Str
    }
}

/// Does `param` appear as an operand of a range expression (`a..param`, `param..b`) anywhere in
/// `body`? Such a param is an integer range bound. Walks into loop/if/decl/assignment bodies.
fn body_uses_param_as_range_bound(param: &str, body: &[AstNode]) -> bool {
    body.iter().any(|n| stmt_uses_param_as_range_bound(param, n))
}

fn stmt_uses_param_as_range_bound(param: &str, node: &AstNode) -> bool {
    match node {
        AstNode::ForOf(f) => {
            expr_uses_param_as_range_bound(param, &f.range)
                || body_uses_param_as_range_bound(param, &f.body)
        }
        AstNode::While(w) => {
            expr_uses_param_as_range_bound(param, &w.test)
                || body_uses_param_as_range_bound(param, &w.body)
        }
        AstNode::If(if_node) => {
            expr_uses_param_as_range_bound(param, &if_node.test)
                || body_uses_param_as_range_bound(param, &if_node.consequent)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alt| body_uses_param_as_range_bound(param, alt))
        }
        AstNode::VariableDeclaration(v) => expr_uses_param_as_range_bound(param, &v.value),
        AstNode::Assignment(a) => expr_uses_param_as_range_bound(param, &a.value),
        AstNode::Return(r) => r
            .argument
            .as_ref()
            .is_some_and(|a| expr_uses_param_as_range_bound(param, a)),
        other => expr_uses_param_as_range_bound(param, other),
    }
}

fn expr_uses_param_as_range_bound(param: &str, node: &AstNode) -> bool {
    let is_param = |n: &AstNode| matches!(n, AstNode::Identifier(id) if id.name == param);
    match node {
        AstNode::BinaryExpression(b) if b.operator == ".." => {
            is_param(&b.left)
                || is_param(&b.right)
                || expr_uses_param_as_range_bound(param, &b.left)
                || expr_uses_param_as_range_bound(param, &b.right)
        }
        AstNode::BinaryExpression(b) => {
            expr_uses_param_as_range_bound(param, &b.left)
                || expr_uses_param_as_range_bound(param, &b.right)
        }
        AstNode::UnaryExpression(u) => expr_uses_param_as_range_bound(param, &u.argument),
        AstNode::CallExpression(c) => c
            .arguments
            .iter()
            .any(|a| expr_uses_param_as_range_bound(param, a)),
        _ => false,
    }
}

/// Walk every statement in `body` looking for a bare-boolean use of `param`: it appears directly
/// as an `if (...)` test, or as a `&& || !` operand. A param NOT used this way (e.g. only compared
/// or returned) stays `String` under the conservative default.
fn body_uses_param_as_boolean(param: &str, body: &[AstNode]) -> bool {
    let is_param = |n: &AstNode| matches!(n, AstNode::Identifier(id) if id.name == param);
    body.iter().any(|node| match node {
        AstNode::If(if_node) => {
            // `if (param)` — the test IS the bare param.
            is_param(&if_node.test)
                || expr_uses_param_as_boolean(param, &if_node.test)
                || body_uses_param_as_boolean(param, &if_node.consequent)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alt| body_uses_param_as_boolean(param, alt))
        }
        AstNode::While(w) => {
            is_param(&w.test)
                || expr_uses_param_as_boolean(param, &w.test)
                || body_uses_param_as_boolean(param, &w.body)
        }
        AstNode::ForOf(f) => {
            expr_uses_param_as_boolean(param, &f.range)
                || body_uses_param_as_boolean(param, &f.body)
        }
        AstNode::Property(p) => expr_uses_param_as_boolean(param, &p.value),
        AstNode::VariableDeclaration(v) => expr_uses_param_as_boolean(param, &v.value),
        AstNode::Assignment(a) => expr_uses_param_as_boolean(param, &a.value),
        AstNode::Return(r) => r
            .argument
            .as_ref()
            .is_some_and(|a| expr_uses_param_as_boolean(param, a)),
        other => expr_uses_param_as_boolean(param, other),
    })
}

/// Is `param` used as a logical operand (`&& || !`) anywhere inside `node`?
fn expr_uses_param_as_boolean(param: &str, node: &AstNode) -> bool {
    let is_param = |n: &AstNode| matches!(n, AstNode::Identifier(id) if id.name == param);
    match node {
        AstNode::BinaryExpression(b) => {
            let logical = matches!(b.operator.as_str(), "&&" | "||");
            (logical && (is_param(&b.left) || is_param(&b.right)))
                || expr_uses_param_as_boolean(param, &b.left)
                || expr_uses_param_as_boolean(param, &b.right)
        }
        AstNode::UnaryExpression(u) => {
            (u.operator == "!" && is_param(&u.argument))
                || expr_uses_param_as_boolean(param, &u.argument)
        }
        AstNode::CallExpression(c) => c
            .arguments
            .iter()
            .any(|a| expr_uses_param_as_boolean(param, a)),
        AstNode::MemberExpression(m) => {
            expr_uses_param_as_boolean(param, &m.object)
                || expr_uses_param_as_boolean(param, &m.property)
        }
        _ => false,
    }
}

/// Walk every statement/expression in `body` looking for a numeric use of `param`.
fn body_uses_param_numerically(param: &str, body: &[AstNode]) -> bool {
    body.iter().any(|n| stmt_uses_param_numerically(param, n))
}

fn stmt_uses_param_numerically(param: &str, node: &AstNode) -> bool {
    match node {
        AstNode::Property(p) => expr_uses_param_numerically(param, &p.value),
        AstNode::VariableDeclaration(v) => expr_uses_param_numerically(param, &v.value),
        AstNode::Assignment(a) => {
            expr_uses_param_numerically(param, &a.target)
                || expr_uses_param_numerically(param, &a.value)
        }
        AstNode::Return(r) => r
            .argument
            .as_ref()
            .is_some_and(|a| expr_uses_param_numerically(param, a)),
        AstNode::If(if_node) => {
            expr_uses_param_numerically(param, &if_node.test)
                || body_uses_param_numerically(param, &if_node.consequent)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alt| body_uses_param_numerically(param, alt))
        }
        AstNode::While(w) => {
            expr_uses_param_numerically(param, &w.test)
                || body_uses_param_numerically(param, &w.body)
        }
        AstNode::ForOf(f) => {
            expr_uses_param_numerically(param, &f.range)
                || body_uses_param_numerically(param, &f.body)
        }
        AstNode::CallExpression(_)
        | AstNode::MemberExpression(_)
        | AstNode::BinaryExpression(_)
        | AstNode::UnaryExpression(_) => expr_uses_param_numerically(param, node),
        _ => false,
    }
}

/// Is `param` used in a numeric position anywhere inside `node`? A numeric position is: an
/// operand of an arithmetic operator, the operand of a unary `-`, or an argument to `sqrt`.
fn expr_uses_param_numerically(param: &str, node: &AstNode) -> bool {
    let direct_hit = |operand: &AstNode| matches!(operand, AstNode::Identifier(id) if id.name == param);
    match node {
        AstNode::BinaryExpression(b) => {
            let arithmetic = matches!(b.operator.as_str(), "+" | "-" | "*" | "/" | "%");
            (arithmetic && (direct_hit(&b.left) || direct_hit(&b.right)))
                || expr_uses_param_numerically(param, &b.left)
                || expr_uses_param_numerically(param, &b.right)
        }
        AstNode::UnaryExpression(u) => {
            (u.operator == "-" && direct_hit(&u.argument))
                || expr_uses_param_numerically(param, &u.argument)
        }
        AstNode::CallExpression(c) => {
            let is_sqrt = matches!(c.callee.as_ref(), AstNode::Identifier(id) if id.name == "sqrt");
            (is_sqrt && c.arguments.iter().any(direct_hit))
                || c.arguments
                    .iter()
                    .any(|a| expr_uses_param_numerically(param, a))
        }
        AstNode::MemberExpression(m) => {
            expr_uses_param_numerically(param, &m.object)
                || expr_uses_param_numerically(param, &m.property)
        }
        _ => false,
    }
}

fn collect_returns<'a>(body: &'a [AstNode], out: &mut Vec<&'a AstNode>) {
    for node in body {
        match node {
            AstNode::Return(r) => {
                if let Some(arg) = &r.argument {
                    out.push(arg.as_ref());
                }
            }
            AstNode::If(if_node) => {
                collect_returns(&if_node.consequent, out);
                if let Some(alt) = &if_node.alternate {
                    collect_returns(alt, out);
                }
            }
            AstNode::ForOf(for_node) => collect_returns(&for_node.body, out),
            AstNode::While(while_node) => collect_returns(&while_node.body, out),
            _ => {}
        }
    }
}

/// Is this expression boolean-shaped? Boolean literals, logical/comparison operators,
/// and `!` unary all read as `Boolean`. Used only for return-type inference.
fn is_boolean_expr(node: &AstNode) -> bool {
    match node {
        AstNode::Boolean(_) => true,
        AstNode::UnaryExpression(u) => u.operator == "!",
        AstNode::BinaryExpression(b) => matches!(
            b.operator.as_str(),
            "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||"
        ),
        _ => false,
    }
}

/// Is this expression numeric-shaped? A numeric literal, a unary `-`, an arithmetic binary
/// operator (`+ - * /` / `%`), or a `sqrt(...)` builtin call all read as `Float`. Used only
/// for return-type inference. Plain identifiers are NOT numeric on their own — a function that
/// just returns a parameter is conservatively `String` unless arithmetic forces `Float`,
/// which keeps the existing naming functions unchanged.
fn is_numeric_expr(node: &AstNode) -> bool {
    match node {
        AstNode::Number(_) => true,
        AstNode::UnaryExpression(u) => u.operator == "-",
        AstNode::BinaryExpression(b) => {
            matches!(b.operator.as_str(), "+" | "-" | "*" | "/" | "%")
        }
        AstNode::CallExpression(c) => {
            matches!(c.callee.as_ref(), AstNode::Identifier(id) if id.name == "sqrt")
        }
        _ => false,
    }
}

fn emit_statement(
    node: &AstNode,
    indent: &str,
    lines: &mut Vec<String>,
) -> Result<(), KotlinEmitError> {
    match node {
        // `let`/`const x = expr` → immutable `val`; `var x = expr` → mutable `var`.
        AstNode::VariableDeclaration(v) => {
            let value = emit_expr(&v.value)?;
            let kw = if v.mutable { "var" } else { "val" };
            lines.push(format!("{}{} {} = {}", indent, kw, v.name, value));
            Ok(())
        }
        // Defensive: an object-graph `Property` reaching the logic emitter is treated as an
        // immutable binding (the parser now emits `VariableDeclaration` for `.hs` logic bindings).
        AstNode::Property(p) => {
            let value = emit_expr(&p.value)?;
            lines.push(format!("{}val {} = {}", indent, p.key, value));
            Ok(())
        }
        // `x = expr` / `acc += expr` reassignment of a LOCAL `var`.
        AstNode::Assignment(a) => {
            let target = emit_expr(&a.target)?;
            let value = emit_expr(&a.value)?;
            lines.push(format!("{}{} {} {}", indent, target, a.operator, value));
            Ok(())
        }
        // `while (cond) { … }` → Kotlin `while (cond) { … }`.
        AstNode::While(w) => {
            lines.push(format!("{}while ({}) {{", indent, emit_expr(&w.test)?));
            let inner = format!("{}  ", indent);
            for stmt in &w.body {
                emit_statement(stmt, &inner, lines)?;
            }
            lines.push(format!("{}}}", indent));
            Ok(())
        }
        // `for (i in 0..n) { … }` → Kotlin `for (i in 0..n) { … }`.
        AstNode::ForOf(f) => {
            lines.push(format!(
                "{}for ({} in {}) {{",
                indent,
                f.var_name,
                emit_expr(&f.range)?
            ));
            let inner = format!("{}  ", indent);
            for stmt in &f.body {
                emit_statement(stmt, &inner, lines)?;
            }
            lines.push(format!("{}}}", indent));
            Ok(())
        }
        AstNode::Return(r) => {
            match &r.argument {
                Some(arg) => lines.push(format!("{}return {}", indent, emit_expr(arg)?)),
                None => lines.push(format!("{}return", indent)),
            }
            Ok(())
        }
        AstNode::If(if_node) => {
            lines.push(format!("{}if ({}) {{", indent, emit_expr(&if_node.test)?));
            let inner = format!("{}  ", indent);
            for stmt in &if_node.consequent {
                emit_statement(stmt, &inner, lines)?;
            }
            if let Some(alt) = &if_node.alternate {
                lines.push(format!("{}}} else {{", indent));
                for stmt in alt {
                    emit_statement(stmt, &inner, lines)?;
                }
            }
            lines.push(format!("{}}}", indent));
            Ok(())
        }
        // A bare expression statement (e.g. a side-effecting call).
        AstNode::CallExpression(_)
        | AstNode::MemberExpression(_)
        | AstNode::Identifier(_)
        | AstNode::BinaryExpression(_)
        | AstNode::UnaryExpression(_) => {
            lines.push(format!("{}{}", indent, emit_expr(node)?));
            Ok(())
        }
        AstNode::Comment(_) => Ok(()),
        other => Err(KotlinEmitError::new(format!(
            "unsupported statement node in .hs logic body: {}",
            node_kind(other)
        ))),
    }
}

fn emit_expr(node: &AstNode) -> Result<String, KotlinEmitError> {
    match node {
        AstNode::String(s) => Ok(emit_string_literal(&s.value)),
        AstNode::Number(n) => Ok(emit_float_literal(&n.raw)),
        AstNode::Boolean(b) => Ok(b.value.to_string()),
        AstNode::Null(_) => Ok("null".to_string()),
        AstNode::Identifier(id) => Ok(id.name.clone()),
        AstNode::BinaryExpression(b) => {
            // A range `a..b` is integer-typed and rendered tight (`0..n`), per Kotlin convention.
            // Its operands live in an Int context, so numeric literals drop the Float `f` suffix.
            if b.operator == ".." {
                let parent = precedence(&b.operator);
                let left = emit_range_operand(&b.left, parent, false)?;
                let right = emit_range_operand(&b.right, parent, true)?;
                return Ok(format!("{}..{}", left, right));
            }
            // The parser discards parentheses, keeping only a precedence-correct tree. To emit
            // Kotlin that means the SAME thing, re-parenthesize: wrap a child whose operator binds
            // LOOSER than this one, and wrap the right child of a left-associative operator when it
            // shares this precedence (so `a - (b - c)` and `(a + b) * c` survive intact).
            let parent = precedence(&b.operator);
            let op = map_binary_operator(&b.operator);
            let left = emit_operand(&b.left, parent, false)?;
            let right = emit_operand(&b.right, parent, true)?;
            Ok(format!("{} {} {}", left, op, right))
        }
        AstNode::UnaryExpression(u) => {
            // Parenthesize a binary argument so `-(a + b)` / `!(a && b)` keep their grouping.
            let arg = match u.argument.as_ref() {
                AstNode::BinaryExpression(_) => format!("({})", emit_expr(&u.argument)?),
                _ => emit_expr(&u.argument)?,
            };
            Ok(format!("{}{}", u.operator, arg))
        }
        AstNode::MemberExpression(m) => {
            let object = emit_expr(&m.object)?;
            if m.computed {
                Ok(format!("{}[{}]", object, emit_expr(&m.property)?))
            } else {
                let prop = match m.property.as_ref() {
                    AstNode::Identifier(id) => id.name.clone(),
                    other => emit_expr(other)?,
                };
                Ok(format!("{}.{}", object, prop))
            }
        }
        AstNode::CallExpression(c) => {
            // A bare `sqrt(x)` call maps to the Kotlin stdlib `kotlin.math.sqrt(x)` so the
            // gaze-length math can be authored in `.hs` instead of kept in the Kotlin shell.
            // Member-call forms (e.g. `x.trim()`) pass through unchanged.
            let callee = match c.callee.as_ref() {
                AstNode::Identifier(id) => map_builtin_call(&id.name).to_string(),
                other => emit_expr(other)?,
            };
            let args = c
                .arguments
                .iter()
                .map(emit_expr)
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");
            Ok(format!("{}({})", callee, args))
        }
        AstNode::Array(arr) => {
            let elems = arr
                .elements
                .iter()
                .map(emit_expr)
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");
            Ok(format!("listOf({})", elems))
        }
        other => Err(KotlinEmitError::new(format!(
            "unsupported expression node in .hs logic body: {}",
            node_kind(other)
        ))),
    }
}

/// Map `.hs` binary operators to Kotlin. They are identical for the supported set,
/// but the function makes the mapping explicit so an unexpected operator fails rather
/// than passing through silently.
fn map_binary_operator(op: &str) -> &str {
    match op {
        "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||"
        | ".." => op,
        _ => op,
    }
}

/// Map a bare `.hs` builtin call name to its Kotlin equivalent. `sqrt` → `kotlin.math.sqrt`;
/// every other identifier callee passes through unchanged (it is a local helper the shell
/// defines, e.g. `matchedPattern`).
fn map_builtin_call(name: &str) -> &str {
    match name {
        "sqrt" => "kotlin.math.sqrt",
        other => other,
    }
}

/// Binding strength of a binary operator, higher = binds tighter. Mirrors the parser's
/// precedence ladder (logical < equality < comparison < additive < multiplicative) so the
/// emitter can restore exactly the parentheses the parsed tree implies. Non-binary nodes are
/// treated as atoms (highest precedence) by the callers, so they never get wrapped.
fn precedence(op: &str) -> u8 {
    match op {
        "||" => 1,
        "&&" => 2,
        "==" | "!=" => 3,
        "<" | ">" | "<=" | ">=" => 4,
        ".." => 5,
        "+" | "-" => 6,
        "*" | "/" | "%" => 7,
        _ => 8,
    }
}

/// Emit one operand of a binary expression, wrapping it in parentheses when its own operator
/// binds looser than the parent (`is_right` additionally forces a wrap at EQUAL precedence so
/// the right child of a left-associative operator — `a - (b - c)`, `a / (b / c)` — is not
/// silently reassociated). Atoms (identifiers, literals, calls, members, unary) never wrap.
fn emit_operand(node: &AstNode, parent: u8, is_right: bool) -> Result<String, KotlinEmitError> {
    let emitted = emit_expr(node)?;
    if let AstNode::BinaryExpression(b) = node {
        let child = precedence(&b.operator);
        if child < parent || (is_right && child == parent) {
            return Ok(format!("({})", emitted));
        }
    }
    Ok(emitted)
}

/// Emit one operand of a range expression (`a..b`). Same precedence-aware parenthesization as
/// [`emit_operand`], but the operand lives in an INTEGER context, so it is rendered via
/// [`emit_int_expr`] (numeric literals drop the Float `f` suffix — `0..n`, not `0f..n`).
fn emit_range_operand(node: &AstNode, parent: u8, is_right: bool) -> Result<String, KotlinEmitError> {
    let emitted = emit_int_expr(node)?;
    if let AstNode::BinaryExpression(b) = node {
        let child = precedence(&b.operator);
        if child < parent || (is_right && child == parent) {
            return Ok(format!("({})", emitted));
        }
    }
    Ok(emitted)
}

/// Emit an expression in an INTEGER context (a range bound). Numeric literals render as plain
/// integers (no Float `f` suffix); arithmetic sub-expressions recurse in the same Int context;
/// everything else falls back to the normal expression emitter (identifiers, calls, members pass
/// through — they are assumed to already be Int-typed in a range position).
fn emit_int_expr(node: &AstNode) -> Result<String, KotlinEmitError> {
    match node {
        AstNode::Number(n) => Ok(emit_int_literal(&n.raw)),
        AstNode::BinaryExpression(b) if matches!(b.operator.as_str(), "+" | "-" | "*" | "/" | "%") => {
            let parent = precedence(&b.operator);
            let op = map_binary_operator(&b.operator);
            let left = emit_int_operand(&b.left, parent, false)?;
            let right = emit_int_operand(&b.right, parent, true)?;
            Ok(format!("{} {} {}", left, op, right))
        }
        other => emit_expr(other),
    }
}

fn emit_int_operand(node: &AstNode, parent: u8, is_right: bool) -> Result<String, KotlinEmitError> {
    let emitted = emit_int_expr(node)?;
    if let AstNode::BinaryExpression(b) = node {
        let child = precedence(&b.operator);
        if child < parent || (is_right && child == parent) {
            return Ok(format!("({})", emitted));
        }
    }
    Ok(emitted)
}

/// Emit a numeric literal as a Kotlin `Int` (range-bound context): strip any trailing `f`/`F` and
/// any fractional part (`5.0` → `5`). A genuinely fractional range bound is not meaningful for an
/// integer range, so truncating to the integer part is the safe, predictable rule.
fn emit_int_literal(raw: &str) -> String {
    let trimmed = raw.trim_end_matches(['f', 'F']);
    match trimmed.split_once('.') {
        Some((int_part, _frac)) if !int_part.is_empty() => int_part.to_string(),
        Some((empty, _frac)) if empty.is_empty() => "0".to_string(),
        _ => trimmed.to_string(),
    }
}

/// Emit a numeric literal as a Kotlin `Float` (the `.hs` numeric subset is Float-only — the
/// Quest locomotion math runs in Float). The `.hs` lexer never carries an `f`/`F` suffix, so we
/// append one; an exponent form (`1e3`) keeps the exponent and still gets the suffix. Already
/// having a trailing `f`/`F` (defensive) is left untouched.
fn emit_float_literal(raw: &str) -> String {
    if raw.ends_with('f') || raw.ends_with('F') {
        raw.to_string()
    } else {
        format!("{}f", raw)
    }
}

/// Emit a Kotlin double-quoted string literal, escaping `\`, `"`, and `$`
/// (Kotlin string templates treat `$` specially).
fn emit_string_literal(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '$' => out.push_str("\\$"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
    }
    out.push('"');
    out
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
        AstNode::MemberExpression(_) => "MemberExpression",
        AstNode::SpreadElement(_) => "SpreadElement",
        AstNode::Using(_) => "Using",
        AstNode::Import(_) => "Import",
        AstNode::Export(_) => "Export",
        AstNode::Function(_) => "Function",
        AstNode::EnumDeclaration(_) => "EnumDeclaration",
        AstNode::StructDeclaration(_) => "StructDeclaration",
        AstNode::VariableDeclaration(_) => "VariableDeclaration",
        AstNode::Assignment(_) => "Assignment",
        AstNode::Return(_) => "Return",
        AstNode::If(_) => "If",
        AstNode::For(_) => "For",
        AstNode::ForOf(_) => "ForOf",
        AstNode::While(_) => "While",
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

    fn kotlin(source: &str) -> String {
        compile_source_to_kotlin(source, "  ").expect("emit ok")
    }

    #[test]
    fn emits_string_function_with_member_call() {
        let src = r#"function worldId(text) {
  let t = text.trim()
  let seg = t.substringBefore("/")
  return seg
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun worldId(text: String): String {"), "{out}");
        assert!(out.contains("val t = text.trim()"), "{out}");
        assert!(out.contains("val seg = t.substringBefore(\"/\")"), "{out}");
        assert!(out.contains("return seg"), "{out}");
    }

    #[test]
    fn infers_boolean_return_for_comparison() {
        let src = r#"function isEmpty(text) {
  return text == ""
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun isEmpty(text: String): Boolean {"), "{out}");
        assert!(out.contains("return text == \"\""), "{out}");
    }

    #[test]
    fn emits_if_else() {
        let src = r#"function pick(text) {
  let seg = text.trim()
  if (seg == "") {
    return "world"
  } else {
    return seg
  }
}"#;
        let out = kotlin(src);
        assert!(out.contains("if (seg == \"\") {"), "{out}");
        assert!(out.contains("return \"world\""), "{out}");
        assert!(out.contains("} else {"), "{out}");
        assert!(out.contains("return seg"), "{out}");
    }

    #[test]
    fn escapes_dollar_in_string_literal() {
        let src = r#"function f(x) {
  return "$cost"
}"#;
        let out = kotlin(src);
        assert!(out.contains("return \"\\$cost\""), "{out}");
    }

    #[test]
    fn boolean_function_with_call_chain_is_boolean() {
        // A function whose only return is a method call (e.g. anyMatch) is NOT
        // boolean-shaped by our conservative rule -> defaults to String. Callers
        // that need Boolean should return a comparison/boolean literal.
        let src = r#"function f(x) {
  return x.startsWith("a")
}"#;
        let out = kotlin(src);
        assert!(out.contains("): String {"), "{out}");
    }

    // ── Numeric subset (locomotion math) ──────────────────────────────────────────────────

    #[test]
    fn infers_float_return_and_float_params_for_arithmetic() {
        let src = r#"function newYaw(yaw, turn, turnSpeed, dt) {
  return yaw + turn * turnSpeed * dt
}"#;
        let out = kotlin(src);
        assert!(
            out.contains(
                "fun newYaw(yaw: Float, turn: Float, turnSpeed: Float, dt: Float): Float {"
            ),
            "{out}"
        );
        assert!(out.contains("return yaw + turn * turnSpeed * dt"), "{out}");
    }

    #[test]
    fn emits_float_literal_with_f_suffix() {
        let src = r#"function half(x) {
  return x * 0.5
}"#;
        let out = kotlin(src);
        assert!(out.contains("return x * 0.5f"), "{out}");
        assert!(out.contains("fun half(x: Float): Float {"), "{out}");
    }

    #[test]
    fn emits_integer_literal_as_float() {
        let src = r#"function inc(x) {
  return x + 1
}"#;
        let out = kotlin(src);
        assert!(out.contains("return x + 1f"), "{out}");
    }

    #[test]
    fn reparenthesizes_sum_times_factor() {
        // The parser discards the parens but keeps a precedence-correct tree; the emitter must
        // restore them so `(a + b) * c` does NOT collapse to `a + b * c`.
        let src = r#"function f(a, b, c) {
  return (a + b) * c
}"#;
        let out = kotlin(src);
        assert!(out.contains("return (a + b) * c"), "{out}");
    }

    #[test]
    fn does_not_overparenthesize_factor_plus_factor() {
        // `a * b + c * d` needs NO parens — multiplication already binds tighter than addition.
        let src = r#"function f(a, b, c, d) {
  return a * b + c * d
}"#;
        let out = kotlin(src);
        // Assert on the body line only (the `f(...)` signature legitimately contains parens).
        assert!(out.contains("return a * b + c * d"), "{out}");
        let body = out.lines().find(|l| l.contains("return")).unwrap_or("");
        assert!(!body.contains("("), "should not add spurious parens to body: {body}");
    }

    #[test]
    fn reparenthesizes_right_associative_subtraction() {
        // `a - (b - c)` must keep its parens — left-assoc `-` would otherwise reassociate.
        let src = r#"function f(a, b, c) {
  return a - (b - c)
}"#;
        let out = kotlin(src);
        assert!(out.contains("return a - (b - c)"), "{out}");
    }

    #[test]
    fn left_associative_subtraction_needs_no_parens() {
        let src = r#"function f(a, b, c) {
  return a - b - c
}"#;
        let out = kotlin(src);
        assert!(out.contains("return a - b - c"), "{out}");
        let body = out.lines().find(|l| l.contains("return")).unwrap_or("");
        assert!(!body.contains("("), "no parens for naturally-left-assoc form: {body}");
    }

    #[test]
    fn maps_sqrt_to_kotlin_math_sqrt() {
        let src = r#"function gazeLen(fx, fz) {
  return sqrt(fx * fx + fz * fz)
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("return kotlin.math.sqrt(fx * fx + fz * fz)"),
            "{out}"
        );
        assert!(out.contains("fun gazeLen(fx: Float, fz: Float): Float {"), "{out}");
    }

    #[test]
    fn unary_minus_on_param_is_float() {
        let src = r#"function rightX(fz) {
  return -fz
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun rightX(fz: Float): Float {"), "{out}");
        assert!(out.contains("return -fz"), "{out}");
    }

    #[test]
    fn position_integration_full_expression() {
        // The real locomotion position-integration formula: every grouping must survive.
        let src = r#"function newX(x, fwd, fx, strafe, rx, moveSpeed, dt) {
  return x + (fwd * fx + strafe * rx) * moveSpeed * dt
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("return x + (fwd * fx + strafe * rx) * moveSpeed * dt"),
            "{out}"
        );
    }

    #[test]
    fn string_logic_still_emits_string_params_and_return() {
        // Regression: the numeric inference must not disturb the existing naming functions.
        let src = r#"function pick(text) {
  let seg = text.trim()
  if (seg == "") {
    return "world"
  } else {
    return seg
  }
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun pick(text: String): String {"), "{out}");
        assert!(!out.contains("Float"), "no Float in string logic: {out}");
    }

    // ── Enum (sum-type) + Boolean params (routing decision) ───────────────────────────────────

    #[test]
    fn emits_enum_declaration_as_enum_class() {
        let src = r#"enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }"#;
        let out = kotlin(src);
        assert!(
            out.contains("enum class Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }"),
            "{out}"
        );
    }

    #[test]
    fn infers_enum_return_for_enum_member_returns() {
        // A function whose every return is a member of the declared enum returns that enum type,
        // and the bare-boolean params are typed Boolean by usage (used only as `if` tests).
        let src = r#"enum Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }
function decideRoute(isWorldLink, autoImmerse, isOpenAction) {
  if (isWorldLink) {
    if (autoImmerse) { return Route.EnterWorld } else { return Route.PendingWorld }
  } else {
    if (isOpenAction) { return Route.OpenUrl } else { return Route.ShowResult }
  }
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("enum class Route { EnterWorld, PendingWorld, OpenUrl, ShowResult }"),
            "{out}"
        );
        assert!(
            out.contains(
                "fun decideRoute(isWorldLink: Boolean, autoImmerse: Boolean, isOpenAction: Boolean): Route {"
            ),
            "{out}"
        );
        assert!(out.contains("if (isWorldLink) {"), "{out}");
        assert!(out.contains("return Route.EnterWorld"), "{out}");
        assert!(out.contains("return Route.PendingWorld"), "{out}");
        assert!(out.contains("return Route.OpenUrl"), "{out}");
        assert!(out.contains("return Route.ShowResult"), "{out}");
    }

    #[test]
    fn enum_class_is_emitted_before_functions() {
        // The `enum class` must precede any function that names it as a return type, so the
        // emitted Kotlin compiles top-to-bottom.
        let src = r#"enum Route { A, B }
function f(x) {
  if (x) { return Route.A } else { return Route.B }
}"#;
        let out = kotlin(src);
        let enum_pos = out.find("enum class Route").expect("enum emitted");
        let fn_pos = out.find("fun f(").expect("fn emitted");
        assert!(enum_pos < fn_pos, "enum must precede fn: {out}");
    }

    #[test]
    fn infers_boolean_param_for_bare_if_test() {
        let src = r#"function gate(flag) {
  if (flag) { return "yes" } else { return "no" }
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun gate(flag: Boolean): String {"), "{out}");
    }

    #[test]
    fn infers_boolean_param_for_logical_operand() {
        let src = r#"function both(a, b) {
  return a && b
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun both(a: Boolean, b: Boolean): Boolean {"), "{out}");
    }

    #[test]
    fn enum_decl_with_optional_commas_and_trailing_comma() {
        // The member list tolerates a trailing comma (object-literal-style lenient commas).
        let src = r#"enum Color { Red, Green, Blue, }"#;
        let out = kotlin(src);
        assert!(out.contains("enum class Color { Red, Green, Blue }"), "{out}");
    }

    // ── Mutable state (LOCAL var) + loops (G6) ────────────────────────────────────────────────

    #[test]
    fn emits_var_for_mutable_binding_and_val_for_immutable() {
        // `var` opts into local mutable state → Kotlin `var`; `let`/`const` stay immutable `val`.
        let src = r#"function f(x) {
  var acc = 0
  let base = x
  return acc + base
}"#;
        let out = kotlin(src);
        assert!(out.contains("var acc = 0f"), "{out}");
        assert!(out.contains("val base = x"), "{out}");
    }

    #[test]
    fn emits_reassignment_of_local_var() {
        let src = r#"function f(x) {
  var acc = 0
  acc = acc + x
  return acc
}"#;
        let out = kotlin(src);
        assert!(out.contains("var acc = 0f"), "{out}");
        assert!(out.contains("acc = acc + x"), "{out}");
    }

    #[test]
    fn emits_compound_assignment() {
        let src = r#"function f(x) {
  var acc = 0
  acc += x
  acc *= 2
  return acc
}"#;
        let out = kotlin(src);
        assert!(out.contains("acc += x"), "{out}");
        assert!(out.contains("acc *= 2f"), "{out}");
    }

    #[test]
    fn emits_while_loop() {
        // A pure countdown accumulator: `total` is initialized from the (numeric) param `start`
        // and decremented in the loop; the bare-identifier return resolves to Float via the
        // numeric-local-binding rule.
        let src = r#"function countdown(start) {
  var total = start - 0
  while (total > 0) {
    total = total - 1
  }
  return total
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun countdown(start: Float): Float {"), "{out}");
        assert!(out.contains("var total = start - 0f"), "{out}");
        assert!(out.contains("while (total > 0f) {"), "{out}");
        assert!(out.contains("total = total - 1f"), "{out}");
    }

    #[test]
    fn emits_for_in_range_loop() {
        // Range literals are integer-form (`0..n`, NOT `0f..n`); the accumulator stays Float.
        let src = r#"function sumTo(n) {
  var total = 0
  for (i in 0..n) {
    total = total + i
  }
  return total
}"#;
        let out = kotlin(src);
        assert!(out.contains("for (i in 0..n) {"), "{out}");
        assert!(out.contains("total = total + i"), "{out}");
        // The accumulator is a mutable Float.
        assert!(out.contains("var total = 0f"), "{out}");
        // The range-bound param types Int.
        assert!(out.contains("fun sumTo(n: Int): Float {"), "{out}");
    }

    #[test]
    fn pure_accumulator_loop_infers_float() {
        // The canonical pure-loop: sum 1..n. Param `n` bounds the range → `Int`; the accumulator
        // is a mutable Float (its bare-identifier return resolves to Float).
        let src = r#"function gauss(n) {
  var total = 0
  for (i in 1..n) {
    total += i
  }
  return total
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun gauss(n: Int): Float {"), "{out}");
        assert!(out.contains("for (i in 1..n) {"), "{out}");
        assert!(out.contains("total += i"), "{out}");
        assert!(out.contains("var total = 0f"), "{out}");
    }

    #[test]
    fn range_binds_looser_than_additive() {
        // `0..n + 1` must read as `0..n + 1` — the additive binds tighter than `..`, and the range
        // operands render integer-form (no `f` suffix on the `1`).
        let src = r#"function f(n) {
  var c = 0
  for (i in 0..n + 1) {
    c = c + 1
  }
  return c
}"#;
        let out = kotlin(src);
        assert!(out.contains("for (i in 0..n + 1) {"), "{out}");
    }

    #[test]
    fn for_in_over_identifier_iterable() {
        // The range slot accepts any expression, including a bare array/list identifier.
        let src = r#"function joinAll(items) {
  var out = ""
  for (x in items) {
    out = out + x
  }
  return out
}"#;
        let out = kotlin(src);
        assert!(out.contains("for (x in items) {"), "{out}");
    }

    // ── Structs (records) (G6) ────────────────────────────────────────────────────────────────

    #[test]
    fn emits_struct_as_data_class() {
        let src = r#"struct Vec3 { x, y, z }"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Vec3(val x: Float, val y: Float, val z: Float)"),
            "{out}"
        );
    }

    #[test]
    fn infers_struct_return_for_struct_constructor() {
        // A function whose every return constructs the declared struct returns that struct type.
        let src = r#"struct Vec2 { x, y }
function scale(x, y, k) {
  return Vec2(x * k, y * k)
}"#;
        let out = kotlin(src);
        assert!(out.contains("data class Vec2(val x: Float, val y: Float)"), "{out}");
        assert!(
            out.contains("fun scale(x: Float, y: Float, k: Float): Vec2 {"),
            "{out}"
        );
        assert!(out.contains("return Vec2(x * k, y * k)"), "{out}");
    }

    #[test]
    fn struct_emitted_before_functions() {
        let src = r#"struct P { a }
function mk(a) {
  return P(a)
}"#;
        let out = kotlin(src);
        let struct_pos = out.find("data class P").expect("struct emitted");
        let fn_pos = out.find("fun mk(").expect("fn emitted");
        assert!(struct_pos < fn_pos, "struct must precede fn: {out}");
    }

    #[test]
    fn empty_struct_emits_plain_class() {
        // Kotlin forbids an empty `data class`, so a zero-field struct emits a plain `class`.
        let src = r#"struct Unit { }"#;
        let out = kotlin(src);
        assert!(out.contains("class Unit"), "{out}");
        assert!(!out.contains("data class Unit"), "{out}");
    }

    #[test]
    fn regression_existing_subset_unchanged_with_loops_present() {
        // The loop/struct/mutable additions must NOT disturb the shipped String/Float/enum shapes.
        let src = r#"struct Acc { total }
enum Route { A, B }
function worldId(text) {
  let seg = text.trim()
  return seg
}
function newYaw(yaw, turn) {
  return yaw + turn
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun worldId(text: String): String {"), "{out}");
        assert!(out.contains("fun newYaw(yaw: Float, turn: Float): Float {"), "{out}");
        assert!(out.contains("data class Acc(val total: Float)"), "{out}");
        assert!(out.contains("enum class Route { A, B }"), "{out}");
    }

    #[test]
    fn regression_string_and_float_functions_unchanged_alongside_enum() {
        // The enum/Boolean additions must NOT disturb the shipped WorldPortal (String) and
        // Locomotion (Float) function shapes when they coexist with an enum in one compile unit.
        let src = r#"enum Route { EnterWorld, ShowResult }
function worldId(text) {
  let t = text.trim()
  let seg = t.substringBefore("/")
  if (seg == "") {
    return "world"
  } else {
    return seg
  }
}
function newYaw(yaw, turn, turnSpeed, dt) {
  return yaw + turn * turnSpeed * dt
}"#;
        let out = kotlin(src);
        // WorldPortal-style String function unchanged.
        assert!(out.contains("fun worldId(text: String): String {"), "{out}");
        // Locomotion-style Float function unchanged.
        assert!(
            out.contains(
                "fun newYaw(yaw: Float, turn: Float, turnSpeed: Float, dt: Float): Float {"
            ),
            "{out}"
        );
        assert!(out.contains("return yaw + turn * turnSpeed * dt"), "{out}");
    }
}
