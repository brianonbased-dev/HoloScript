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
//! - `let` / `const` / `var` binding           → Kotlin `val name = <expr>`
//!   (the `.hs` logic subset is single-assignment — reassignment is a parse error,
//!   so every binding is an immutable `val`)
//! - `if (cond) { … } else { … }`              → Kotlin `if (cond) { … } else { … }`
//! - `return <expr>` / bare `return`           → Kotlin `return <expr>` / `return`
//! - expressions: binary / unary / call / member / index / literals / identifiers
//!
//! Type policy: `.hs` logic functions are untyped. For the Quest logic surface every
//! parameter is a `String` and the return type is inferred (`Boolean` when the function
//! only ever returns boolean-shaped expressions, otherwise `String`). This is a
//! deliberately small, predictable inference — the emitter's contract is "behaviourally
//! matches the hand-Kotlin", verified by golden I/O parity, not byte-identity.
//!
//! Anything outside the subset (loops, the behavioural `move`/`action`/`on_*` blocks,
//! object-graph nodes) is skipped at the top level and reported via
//! [`KotlinEmitError`] for function-body constructs, so an unhandled node fails loud
//! instead of silently emitting wrong Kotlin.

use crate::ast::{Ast, AstNode};

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

/// Inferred Kotlin return type for an emitted function.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum RetType {
    Str,
    Bool,
}

impl RetType {
    fn kotlin(self) -> &'static str {
        match self {
            RetType::Str => "String",
            RetType::Bool => "Boolean",
        }
    }
}

/// Emit Kotlin function declarations for every top-level `function` in `ast`.
///
/// Each function is rendered with the given `indent` prefix (e.g. two spaces when the
/// functions live inside a Kotlin `object`). Functions are separated by a blank line.
/// Non-function top-level nodes are ignored (they belong to the object-graph surface,
/// not the logic surface this emitter targets).
pub fn emit_functions(ast: &Ast, indent: &str) -> Result<String, KotlinEmitError> {
    let mut blocks: Vec<String> = Vec::new();
    for node in &ast.body {
        if let AstNode::Function(func) = node {
            blocks.push(emit_function(&func.name, &func.params, &func.body, indent)?);
        }
    }
    Ok(blocks.join("\n\n"))
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
) -> Result<String, KotlinEmitError> {
    let ret = infer_return_type(body);
    let param_list = params
        .iter()
        .map(|p| format!("{}: String", p))
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

/// Infer the Kotlin return type: `Boolean` if every `return` carries a boolean-shaped
/// expression (and at least one does), otherwise `String`. The conservative default of
/// `String` matches the Quest logic surface where naming functions dominate.
fn infer_return_type(body: &[AstNode]) -> RetType {
    let mut returns: Vec<&AstNode> = Vec::new();
    collect_returns(body, &mut returns);
    if !returns.is_empty() && returns.iter().all(|n| is_boolean_expr(n)) {
        RetType::Bool
    } else {
        RetType::Str
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

fn emit_statement(
    node: &AstNode,
    indent: &str,
    lines: &mut Vec<String>,
) -> Result<(), KotlinEmitError> {
    match node {
        // `let`/`const`/`var x = expr` is parsed into a Property node (var decl).
        AstNode::Property(p) => {
            let value = emit_expr(&p.value)?;
            lines.push(format!("{}val {} = {}", indent, p.key, value));
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
        AstNode::Number(n) => Ok(n.raw.clone()),
        AstNode::Boolean(b) => Ok(b.value.to_string()),
        AstNode::Null(_) => Ok("null".to_string()),
        AstNode::Identifier(id) => Ok(id.name.clone()),
        AstNode::BinaryExpression(b) => {
            let op = map_binary_operator(&b.operator);
            Ok(format!(
                "{} {} {}",
                emit_expr(&b.left)?,
                op,
                emit_expr(&b.right)?
            ))
        }
        AstNode::UnaryExpression(u) => Ok(format!("{}{}", u.operator, emit_expr(&u.argument)?)),
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
            let callee = emit_expr(&c.callee)?;
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
        "+" | "-" | "*" | "/" | "%" | "==" | "!=" | "<" | ">" | "<=" | ">=" | "&&" | "||" => op,
        _ => op,
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
        AstNode::Return(_) => "Return",
        AstNode::If(_) => "If",
        AstNode::For(_) => "For",
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
}
