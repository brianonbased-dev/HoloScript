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
//! - expressions: binary / unary / lambda / call / member / index / range / literals /
//!   identifiers
//!
//! Type policy: `.hs` logic functions are untyped. For the Quest logic surface the return
//! type is inferred (`Boolean` when the function only ever returns boolean-shaped
//! expressions; `Float` when it only ever returns numeric-shaped expressions; otherwise
//! `String`), and each parameter is typed by usage (`Float` when it participates in
//! arithmetic or is passed to a numeric builtin from the shared builtin table, otherwise `String`). This is a
//! deliberately small, predictable inference — the emitter's contract is "behaviourally
//! matches the hand-Kotlin", verified by golden I/O parity, not byte-identity.
//!
//! Numeric subset (added for the Quest locomotion math, authored in `.hs`): numeric literals
//! emit with the Kotlin `Float` `f` suffix; `+ - * /` arithmetic is re-parenthesized from the
//! parsed precedence so grouping survives (the parser discards parentheses, keeping only the
//! precedence-correct tree — the emitter must restore the parentheses the math needs); and a
//! `.hs` numeric builtin calls (`sqrt`, `abs`, `floor`, `min`, `max`, `pow`) map to Kotlin/JVM math. Statefulness, SDK/host calls, and
//! loops stay in the Kotlin shell — only pure single-assignment math lives in `.hs`.
//!
//! Anything outside the subset (the behavioural `move`/`action`/`on_*` blocks, object-graph
//! nodes) is skipped at the top level and reported via [`KotlinEmitError`] for function-body
//! constructs, so an unhandled node fails loud instead of silently emitting wrong Kotlin.

use std::collections::{HashMap, HashSet};

use crate::ast::{
    Ast, AstNode, EnumDeclarationNode, ImportNode, PropertyNode, StructDeclarationNode,
};

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

/// A semantic validation error that can be surfaced both by `validate_detailed` and by emitters.
#[derive(Debug, Clone)]
pub(crate) struct SemanticDiagnostic {
    pub(crate) message: String,
    pub(crate) line: usize,
    pub(crate) column: usize,
}

impl From<SemanticDiagnostic> for KotlinEmitError {
    fn from(value: SemanticDiagnostic) -> Self {
        KotlinEmitError::new(value.message)
    }
}

#[derive(Debug, Clone)]
struct DeclarationSite {
    name: String,
    kind: &'static str,
    line: usize,
    column: usize,
}

impl DeclarationSite {
    fn from_loc(name: &str, kind: &'static str, loc: &Option<crate::ast::Location>) -> Self {
        let (line, column) = loc
            .as_ref()
            .map(|loc| (loc.start.line, loc.start.column))
            .unwrap_or((0, 0));
        Self {
            name: name.to_string(),
            kind,
            line,
            column,
        }
    }
}

/// Reject top-level declaration names that would collide after caller-side import inlining.
pub(crate) fn check_top_level_declaration_collisions(ast: &Ast) -> Result<(), SemanticDiagnostic> {
    let mut declarations: HashMap<String, DeclarationSite> = HashMap::new();

    for node in &ast.body {
        let Some(site) = top_level_declaration_site(node) else {
            continue;
        };

        if let Some(first) = declarations.get(&site.name) {
            return Err(SemanticDiagnostic {
                message: format!(
                    "duplicate top-level declaration `{}` after caller-side import inlining: {} at line {}, column {} collides with {} at line {}, column {}",
                    site.name,
                    site.kind,
                    site.line,
                    site.column,
                    first.kind,
                    first.line,
                    first.column
                ),
                line: site.line,
                column: site.column,
            });
        }

        declarations.insert(site.name.clone(), site);
    }

    Ok(())
}

pub(crate) fn check_semantics(ast: &Ast) -> Result<(), SemanticDiagnostic> {
    check_top_level_declaration_collisions(ast)?;
    check_assignment_mutability(ast)
}

fn top_level_declaration_site(node: &AstNode) -> Option<DeclarationSite> {
    match node {
        AstNode::Function(f) => Some(DeclarationSite::from_loc(&f.name, "function", &f.loc)),
        AstNode::StructDeclaration(s) => Some(DeclarationSite::from_loc(&s.name, "struct", &s.loc)),
        AstNode::EnumDeclaration(e) => Some(DeclarationSite::from_loc(&e.name, "enum", &e.loc)),
        _ => None,
    }
}

fn check_assignment_mutability(ast: &Ast) -> Result<(), SemanticDiagnostic> {
    for node in &ast.body {
        match node {
            AstNode::Function(function) => {
                let mut scopes = vec![HashMap::new()];
                check_assignment_mutability_in_body(&function.body, &mut scopes)?;
            }
            AstNode::Export(export) => {
                if let AstNode::Function(function) = export.declaration.as_ref() {
                    let mut scopes = vec![HashMap::new()];
                    check_assignment_mutability_in_body(&function.body, &mut scopes)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn check_assignment_mutability_in_body(
    body: &[AstNode],
    scopes: &mut Vec<HashMap<String, bool>>,
) -> Result<(), SemanticDiagnostic> {
    for node in body {
        match node {
            AstNode::VariableDeclaration(v) => {
                if let Some(scope) = scopes.last_mut() {
                    scope.insert(v.name.clone(), v.mutable);
                }
            }
            AstNode::Assignment(a) => {
                if is_reference_dereference_target(&a.target) {
                    // Native v3 validates the reference's pointee type, mutability, provenance,
                    // and borrow state. The shared detailed validator must admit this canonical
                    // systems-language l-value without treating it as Kotlin-local reassignment.
                    continue;
                }
                let Some(target) = assignment_target_identifier(&a.target) else {
                    return Err(semantic_error(
                        "assignment target in .hs logic must be a local `var` identifier",
                        &a.loc,
                    ));
                };

                match lookup_binding_mutability(scopes, target) {
                    Some(true) => {}
                    Some(false) => {
                        return Err(semantic_error(
                            format!(
                                "cannot assign to immutable binding `{}`; declare it with `var` to opt into local mutable state",
                                target
                            ),
                            &a.loc,
                        ));
                    }
                    None => {
                        return Err(semantic_error(
                            format!(
                                "assignment to `{}` requires a previously-declared `var` binding",
                                target
                            ),
                            &a.loc,
                        ));
                    }
                }
            }
            AstNode::ForOf(f) => {
                scopes.push(HashMap::from([(f.var_name.clone(), false)]));
                check_assignment_mutability_in_body(&f.body, scopes)?;
                scopes.pop();
            }
            AstNode::While(w) => {
                scopes.push(HashMap::new());
                check_assignment_mutability_in_body(&w.body, scopes)?;
                scopes.pop();
            }
            AstNode::If(if_node) => {
                scopes.push(HashMap::new());
                check_assignment_mutability_in_body(&if_node.consequent, scopes)?;
                scopes.pop();

                if let Some(alt) = &if_node.alternate {
                    scopes.push(HashMap::new());
                    check_assignment_mutability_in_body(alt, scopes)?;
                    scopes.pop();
                }
            }
            AstNode::LexicalScope(scope) => {
                scopes.push(HashMap::new());
                check_assignment_mutability_in_body(&scope.body, scopes)?;
                scopes.pop();
            }
            _ => {}
        }
    }
    Ok(())
}

fn lookup_binding_mutability(scopes: &[HashMap<String, bool>], name: &str) -> Option<bool> {
    scopes
        .iter()
        .rev()
        .find_map(|scope| scope.get(name).copied())
}

fn assignment_target_identifier(node: &AstNode) -> Option<&str> {
    match node {
        AstNode::Identifier(id) => Some(&id.name),
        _ => None,
    }
}

fn is_reference_dereference_target(node: &AstNode) -> bool {
    matches!(
        node,
        AstNode::UnaryExpression(unary)
            if unary.operator == "*" && matches!(unary.argument.as_ref(), AstNode::Identifier(_))
    )
}

fn semantic_error(
    message: impl Into<String>,
    loc: &Option<crate::ast::Location>,
) -> SemanticDiagnostic {
    let (line, column) = loc
        .as_ref()
        .map(|loc| (loc.start.line, loc.start.column))
        .unwrap_or((0, 0));
    SemanticDiagnostic {
        message: message.into(),
        line,
        column,
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
    /// A `List<T>` — e.g. an array-literal return `[1, 2, 3]` ⇒ `List<Float>`, or a nested
    /// `[[1], [2]]` ⇒ `List<List<Float>>`. Carries the element type (boxed for recursion).
    List(Box<ValType>),
    /// A `Map<String, V>` emitted from object literals (`{ k: v }` -> `mapOf("k" to v)`).
    Map(Box<ValType>),
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
            ValType::List(inner) => format!("List<{}>", inner.kotlin()),
            ValType::Map(inner) => format!("Map<String, {}>", inner.kotlin()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KotlinBuiltinEmission {
    Function(&'static str),
    Pow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct KotlinBuiltin {
    name: &'static str,
    emission: KotlinBuiltinEmission,
    numeric: bool,
}

const KOTLIN_BUILTINS: &[KotlinBuiltin] = &[
    KotlinBuiltin {
        name: "abs",
        emission: KotlinBuiltinEmission::Function("kotlin.math.abs"),
        numeric: true,
    },
    KotlinBuiltin {
        name: "floor",
        emission: KotlinBuiltinEmission::Function("kotlin.math.floor"),
        numeric: true,
    },
    KotlinBuiltin {
        name: "max",
        emission: KotlinBuiltinEmission::Function("kotlin.math.max"),
        numeric: true,
    },
    KotlinBuiltin {
        name: "min",
        emission: KotlinBuiltinEmission::Function("kotlin.math.min"),
        numeric: true,
    },
    KotlinBuiltin {
        name: "pow",
        emission: KotlinBuiltinEmission::Pow,
        numeric: true,
    },
    KotlinBuiltin {
        name: "sqrt",
        emission: KotlinBuiltinEmission::Function("kotlin.math.sqrt"),
        numeric: true,
    },
];

fn kotlin_builtin(name: &str) -> Option<&'static KotlinBuiltin> {
    KOTLIN_BUILTINS.iter().find(|builtin| builtin.name == name)
}

fn is_numeric_builtin_call(name: &str) -> bool {
    kotlin_builtin(name).is_some_and(|builtin| builtin.numeric)
}

/// Emit Kotlin declarations for every top-level `enum` and `function` in `ast`.
///
/// Each declaration is rendered with the given `indent` prefix (e.g. two spaces when the
/// declarations live inside a Kotlin `object`). Declarations are separated by a blank line,
/// with `enum class` blocks emitted before the functions (so a function may name an enum as
/// its return type). Non-function/non-enum top-level nodes are ignored (they belong to the
/// object-graph surface, not the logic surface this emitter targets) — EXCEPT `import`, which
/// is validated (see [`check_imports_resolved`]) rather than silently ignored.
///
/// ## Import contract
///
/// The crate has no filesystem/module-loader layer: [`compile_source_to_kotlin`] takes a single
/// source string, so there is no path on which `import { helper } from "./file.hs"` could reach
/// out and read `./file.hs` itself. The supported linking model is therefore **caller-side
/// inlining**: whoever drives compilation concatenates the imported module's source ahead of the
/// importing module's source into one string before calling in (so both modules' declarations
/// land in the same `ast.body`). Given that, an `import` is satisfied when every specifier it
/// names already resolves to a function/struct/enum declared somewhere in `ast.body` — the
/// emitter does not need to emit a Kotlin `import` for a same-compilation-unit declaration, so a
/// resolved `Import` node is a silent no-op by design. An UNRESOLVED specifier (the referenced
/// module's source was never concatenated in) now fails loudly instead of being dropped without a
/// trace — see [`check_imports_resolved`].
pub fn emit_functions(ast: &Ast, indent: &str) -> Result<String, KotlinEmitError> {
    check_semantics(ast)?;

    if let Some((annotation, context)) = find_borrowed_slice_annotation(ast) {
        return Err(KotlinEmitError::new(format!(
            "borrowed slice type `{annotation}` in {context} requires target-specific borrow and bounds lowering; the Kotlin bridge does not erase native alias semantics"
        )));
    }
    if let Some((annotation, context)) = find_owned_buffer_annotation(ast) {
        return Err(KotlinEmitError::new(format!(
            "owned buffer type `{annotation}` in {context} requires target-specific allocator, move, and drop lowering; the Kotlin bridge does not erase affine ownership"
        )));
    }
    if let Some((annotation, context)) = find_fixed_array_annotation(ast) {
        return Err(KotlinEmitError::new(format!(
            "fixed array type `{annotation}` in {context} requires target-specific bounds lowering; the Kotlin bridge does not erase native array semantics"
        )));
    }

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
    if let Some(typed) = structs.iter().find(|decl| !decl.field_types.is_empty()) {
        return Err(KotlinEmitError::new(format!(
            "typed struct `{}` requires target-specific layout lowering; the Kotlin bridge supports only legacy inferred record fields",
            typed.name
        )));
    }
    let struct_names: Vec<String> = structs.iter().map(|s| s.name.clone()).collect();

    // Collect every top-level `function` name too, so an imported *function* specifier (the
    // common case — `import { helper } from "./file.hs"`) can be resolved. Enums/structs are
    // already named above; a specifier may legitimately name any of the three declaration kinds.
    let function_names: Vec<String> = ast
        .body
        .iter()
        .filter_map(|n| match n {
            AstNode::Function(f) => Some(f.name.clone()),
            _ => None,
        })
        .collect();

    // Fail loudly on any `import` whose specifiers don't resolve within this compilation unit,
    // instead of the previous behavior of silently discarding the Import node entirely (the
    // caller then got Kotlin that referenced an undefined symbol with no diagnostic at all).
    check_imports_resolved(ast, &function_names, &struct_names, &enum_names)?;

    // Infer each struct's per-field Kotlin type from its constructor-call sites (defaults to the
    // all-`Float` record when a struct is unconstructed or its args carry no literal signal).
    let struct_field_types = infer_struct_field_types(ast, &enum_names, &struct_names);

    let mut blocks: Vec<String> = Vec::new();
    // Data declarations (struct/enum) precede functions so a function may name them as a return
    // type or construct them.
    for s in &structs {
        let field_types = struct_field_types
            .get(&s.name)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        blocks.push(emit_struct(s, indent, field_types));
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

fn find_fixed_array_annotation(ast: &Ast) -> Option<(&str, String)> {
    find_type_annotation(ast, |annotation| {
        annotation.starts_with('[') && annotation.contains(';')
    })
}

pub(crate) fn find_owned_buffer_annotation(ast: &Ast) -> Option<(&str, String)> {
    find_type_annotation(ast, |annotation| {
        annotation.starts_with('[') && annotation.ends_with(']') && !annotation.contains(';')
    })
}

fn find_borrowed_slice_annotation(ast: &Ast) -> Option<(&str, String)> {
    find_type_annotation(ast, |annotation| {
        annotation.starts_with("&[") || annotation.starts_with("&mut [")
    })
}

fn find_type_annotation(ast: &Ast, predicate: fn(&str) -> bool) -> Option<(&str, String)> {
    ast.body
        .iter()
        .find_map(|node| find_type_annotation_in_node(node, predicate))
}

fn find_type_annotation_in_node(
    node: &AstNode,
    predicate: fn(&str) -> bool,
) -> Option<(&str, String)> {
    match node {
        AstNode::Function(function) => {
            if let Some(annotation) = function
                .return_type
                .as_deref()
                .filter(|annotation| predicate(annotation))
            {
                return Some((
                    annotation,
                    format!("return type of function `{}`", function.name),
                ));
            }
            for (index, annotation) in function.param_types.iter().enumerate() {
                if let Some(annotation) = annotation
                    .as_deref()
                    .filter(|annotation| predicate(annotation))
                {
                    let parameter = function
                        .params
                        .get(index)
                        .map(String::as_str)
                        .unwrap_or("<unknown>");
                    return Some((
                        annotation,
                        format!("parameter `{parameter}` of function `{}`", function.name),
                    ));
                }
            }
            function
                .body
                .iter()
                .find_map(|node| find_type_annotation_in_node(node, predicate))
        }
        AstNode::VariableDeclaration(local) => local
            .type_annotation
            .as_deref()
            .filter(|annotation| predicate(annotation))
            .map(|annotation| (annotation, format!("local `{}`", local.name))),
        AstNode::StackSlotDeclaration(slot) if predicate(&slot.type_annotation) => Some((
            slot.type_annotation.as_str(),
            format!("stack slot `{}`", slot.name),
        )),
        AstNode::StructDeclaration(structure) => {
            structure
                .field_types
                .iter()
                .enumerate()
                .find_map(|(index, annotation)| {
                    let annotation = annotation.as_deref().filter(|value| predicate(value))?;
                    let field_name = structure
                        .fields
                        .get(index)
                        .map(String::as_str)
                        .unwrap_or("<unknown>");
                    Some((
                        annotation,
                        format!("field `{field_name}` of struct `{}`", structure.name),
                    ))
                })
        }
        AstNode::If(if_node) => if_node
            .consequent
            .iter()
            .find_map(|node| find_type_annotation_in_node(node, predicate))
            .or_else(|| {
                if_node.alternate.as_ref().and_then(|alternate| {
                    alternate
                        .iter()
                        .find_map(|node| find_type_annotation_in_node(node, predicate))
                })
            }),
        AstNode::While(while_node) => while_node
            .body
            .iter()
            .find_map(|node| find_type_annotation_in_node(node, predicate)),
        AstNode::ForOf(for_node) => for_node
            .body
            .iter()
            .find_map(|node| find_type_annotation_in_node(node, predicate)),
        AstNode::LexicalScope(scope) => scope
            .body
            .iter()
            .find_map(|node| find_type_annotation_in_node(node, predicate)),
        AstNode::Export(export) => find_type_annotation_in_node(&export.declaration, predicate),
        _ => None,
    }
}

/// Validate every top-level `import { a, b, .. } from "source"` against the declarations that
/// actually exist in this compilation unit (see the "Import contract" note on [`emit_functions`]
/// for why resolution — not codegen — is the import's job here). A specifier resolves if it
/// names a top-level function, struct, or enum declared anywhere in `ast.body`. The first
/// unresolved specifier fails the whole compile with a message naming both the missing symbol
/// and the import's declared source path, so the caller knows exactly which module's source it
/// still needs to concatenate in.
fn check_imports_resolved(
    ast: &Ast,
    function_names: &[String],
    struct_names: &[String],
    enum_names: &[String],
) -> Result<(), KotlinEmitError> {
    let imports: Vec<&ImportNode> = ast
        .body
        .iter()
        .filter_map(|n| match n {
            AstNode::Import(i) => Some(i),
            _ => None,
        })
        .collect();

    for import in imports {
        for spec in &import.specifiers {
            let resolved = function_names.iter().any(|n| n == &spec.imported)
                || struct_names.iter().any(|n| n == &spec.imported)
                || enum_names.iter().any(|n| n == &spec.imported);
            if !resolved {
                return Err(KotlinEmitError::new(format!(
                    "unresolved import: `{}` from \"{}\" has no matching function/struct/enum \
                     declaration in this compilation unit — the compiler-wasm crate has no \
                     filesystem access, so the imported module's source must be concatenated \
                     ahead of the importing module's source before calling compile_to_kotlin \
                     (caller-side inlining; see emit_functions doc comment)",
                    spec.imported, import.source
                )));
            }
        }
    }
    Ok(())
}

/// Emit `data class <Name>(val <field>: <Type>, …)` for a `.hs` struct declaration. Fields are
/// untyped in the `.hs` logic subset, so each field's Kotlin type is inferred from the struct's
/// constructor-call sites (`field_types`, indexed by field position) — a string-literal argument
/// types that field `String`, a boolean `Boolean`, a nested struct constructor that struct type.
/// A field with no inferred type (no construction, or a non-literal/expression argument) falls
/// back to `Float` — the numeric default that matches the math/geometry use cases and keeps an
/// unconstructed record byte-identical to the prior all-`Float` output. A zero-field struct emits
/// `class <Name>` (Kotlin forbids an empty `data class`).
fn emit_struct(
    node: &StructDeclarationNode,
    indent: &str,
    field_types: &[Option<ValType>],
) -> String {
    if node.fields.is_empty() {
        return format!("{}class {}", indent, node.name);
    }
    let fields = node
        .fields
        .iter()
        .enumerate()
        .map(|(i, f)| {
            let ty = field_types
                .get(i)
                .and_then(|t| t.as_ref())
                .map(ValType::kotlin)
                .unwrap_or_else(|| "Float".to_string());
            format!("val {}: {}", f, ty)
        })
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
    let int_locals = collect_index_local_bindings(body);
    let param_list = params
        .iter()
        .map(|p| format!("{}: {}", p, infer_param_type(p, body, &int_locals).kotlin()))
        .collect::<Vec<_>>()
        .join(", ");

    let body_indent = format!("{}  ", indent);
    let mut lines: Vec<String> = Vec::new();
    for stmt in body {
        emit_statement(stmt, &body_indent, &mut lines, &int_locals)?;
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
    // List: every return is an array literal (`[1, 2, 3]`) ⇒ `List<element>`. The element type is
    // taken from the first NON-empty array (Float default when all returns are empty / signal-less —
    // Kotlin reconciles a bare `listOf()` against the annotated return type). Additive: this only
    // fires when EVERY return is an array, so no existing non-array function changes type (zero drift).
    if returns.iter().all(|n| matches!(n, AstNode::Array(_))) {
        let elem = returns
            .iter()
            .find_map(|n| match n {
                AstNode::Array(a) if !a.elements.is_empty() => Some(infer_array_element_type(
                    &a.elements,
                    enum_names,
                    struct_names,
                )),
                _ => None,
            })
            .unwrap_or(ValType::Float);
        return ValType::List(Box::new(elem));
    }
    // Map: every return is an object literal (`{ key: value }`) => `Map<String, value>`.
    // The value type is read from the first non-empty object; empty objects default to Float.
    if returns
        .iter()
        .all(|n| matches!(n, AstNode::ObjectLiteral(_)))
    {
        let value = returns
            .iter()
            .find_map(|n| match n {
                AstNode::ObjectLiteral(o) if !o.properties.is_empty() => Some(
                    infer_map_value_type(&o.properties, enum_names, struct_names),
                ),
                _ => None,
            })
            .unwrap_or(ValType::Float);
        return ValType::Map(Box::new(value));
    }
    // List via bare-identifier return: every return is an identifier bound to a `let xs = [..]` list
    // local with a consistent element type (the list analogue of the numeric-accumulator rule below,
    // `return total` ⇒ `Float`). Additive: only fires when a list local is both declared AND returned.
    let list_locals = collect_list_local_bindings(body, enum_names, struct_names);
    if !list_locals.is_empty() {
        let elem_at = |n: &AstNode| -> Option<ValType> {
            match n {
                AstNode::MemberExpression(member) if member.computed => {
                    if let AstNode::Identifier(id) = member.object.as_ref() {
                        list_locals
                            .iter()
                            .find(|(name, _)| name == &id.name)
                            .map(|(_, t)| t.clone())
                    } else {
                        None
                    }
                }
                _ => None,
            }
        };
        if let Some(first_elem) = returns.first().and_then(|n| elem_at(n)) {
            if returns
                .iter()
                .all(|n| elem_at(n).as_ref() == Some(&first_elem))
            {
                return first_elem;
            }
        }

        let elem_of = |n: &AstNode| -> Option<ValType> {
            match n {
                AstNode::Identifier(id) => list_locals
                    .iter()
                    .find(|(name, _)| name == &id.name)
                    .map(|(_, t)| t.clone()),
                _ => None,
            }
        };
        if let Some(first_elem) = returns.first().and_then(|n| elem_of(n)) {
            if returns
                .iter()
                .all(|n| elem_of(n).as_ref() == Some(&first_elem))
            {
                return ValType::List(Box::new(first_elem));
            }
        }
    }
    // Map via bare-identifier return: `let lookup = { a: 1 }` then `return lookup` infers
    // `Map<String, Float>` rather than falling through to the `String` default.
    let map_locals = collect_map_local_bindings(body, enum_names, struct_names);
    if !map_locals.is_empty() {
        let value_of = |n: &AstNode| -> Option<ValType> {
            match n {
                AstNode::Identifier(id) => map_locals
                    .iter()
                    .find(|(name, _)| name == &id.name)
                    .map(|(_, t)| t.clone()),
                _ => None,
            }
        };
        if let Some(first_value) = returns.first().and_then(|n| value_of(n)) {
            if returns
                .iter()
                .all(|n| value_of(n).as_ref() == Some(&first_value))
            {
                return ValType::Map(Box::new(first_value));
            }
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

/// Infer the Kotlin element type of an array literal for `List<T>` typing. The grammar has no
/// heterogeneous-array construct, so element type is read from the FIRST element and the array is
/// assumed homogeneous. Rules mirror the return/argument signal ladder: a nested array →
/// `List<inner>`; a declared enum member → that enum; otherwise the literal/struct signal
/// (`String`/`Boolean`/`Float`/`Struct`). An empty or signal-less array defaults to `Float`.
fn infer_array_element_type(
    elements: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
) -> ValType {
    match elements.first() {
        Some(first) => {
            literal_value_signal(first, enum_names, struct_names).unwrap_or(ValType::Float)
        }
        None => ValType::Float,
    }
}

/// Infer the Kotlin value type of an object literal for `Map<String, V>` typing. Like array
/// inference, object values are assumed homogeneous and the first property value supplies the
/// signal. An empty or signal-less object defaults to `Float`.
fn infer_map_value_type(
    properties: &[PropertyNode],
    enum_names: &[String],
    struct_names: &[String],
) -> ValType {
    match properties.first() {
        Some(first) => literal_value_signal(first.value.as_ref(), enum_names, struct_names)
            .unwrap_or(ValType::Float),
        None => ValType::Float,
    }
}

fn literal_value_signal(
    node: &AstNode,
    enum_names: &[String],
    struct_names: &[String],
) -> Option<ValType> {
    match node {
        AstNode::Array(inner) => Some(ValType::List(Box::new(infer_array_element_type(
            &inner.elements,
            enum_names,
            struct_names,
        )))),
        AstNode::ObjectLiteral(obj) => Some(ValType::Map(Box::new(infer_map_value_type(
            &obj.properties,
            enum_names,
            struct_names,
        )))),
        _ => enum_member_owner(node, enum_names)
            .map(ValType::Enum)
            .or_else(|| arg_literal_signal(node, struct_names)),
    }
}

/// Collect local bindings whose value is an array literal (`let xs = [1, 2, 3]`), mapped to their
/// `List` element type. Lets a function that returns a bare list identifier (`return xs`) infer
/// `List<element>` instead of the `String` default — the list analogue of
/// `collect_numeric_local_bindings` (which does the same for numeric accumulators). Walks nested
/// loop/if blocks.
fn collect_list_local_bindings(
    body: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
) -> Vec<(String, ValType)> {
    let mut out: Vec<(String, ValType)> = Vec::new();
    walk_collect_list_bindings(body, enum_names, struct_names, &mut out);
    out
}

fn walk_collect_list_bindings(
    body: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
    out: &mut Vec<(String, ValType)>,
) {
    for node in body {
        match node {
            AstNode::VariableDeclaration(v) => {
                if let AstNode::Array(arr) = v.value.as_ref() {
                    if !out.iter().any(|(n, _)| n == &v.name) {
                        let elem =
                            infer_array_element_type(&arr.elements, enum_names, struct_names);
                        out.push((v.name.clone(), elem));
                    }
                }
            }
            AstNode::ForOf(f) => walk_collect_list_bindings(&f.body, enum_names, struct_names, out),
            AstNode::While(w) => walk_collect_list_bindings(&w.body, enum_names, struct_names, out),
            AstNode::If(if_node) => {
                walk_collect_list_bindings(&if_node.consequent, enum_names, struct_names, out);
                if let Some(alt) = &if_node.alternate {
                    walk_collect_list_bindings(alt, enum_names, struct_names, out);
                }
            }
            _ => {}
        }
    }
}

/// Collect local bindings whose value is an object literal (`let m = { a: 1 }`), mapped to their
/// map value type. This mirrors list-local return inference.
fn collect_map_local_bindings(
    body: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
) -> Vec<(String, ValType)> {
    let mut out: Vec<(String, ValType)> = Vec::new();
    walk_collect_map_bindings(body, enum_names, struct_names, &mut out);
    out
}

fn walk_collect_map_bindings(
    body: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
    out: &mut Vec<(String, ValType)>,
) {
    for node in body {
        match node {
            AstNode::VariableDeclaration(v) => {
                if let AstNode::ObjectLiteral(obj) = v.value.as_ref() {
                    if !out.iter().any(|(n, _)| n == &v.name) {
                        let value = infer_map_value_type(&obj.properties, enum_names, struct_names);
                        out.push((v.name.clone(), value));
                    }
                }
            }
            AstNode::ForOf(f) => walk_collect_map_bindings(&f.body, enum_names, struct_names, out),
            AstNode::While(w) => walk_collect_map_bindings(&w.body, enum_names, struct_names, out),
            AstNode::If(if_node) => {
                walk_collect_map_bindings(&if_node.consequent, enum_names, struct_names, out);
                if let Some(alt) = &if_node.alternate {
                    walk_collect_map_bindings(alt, enum_names, struct_names, out);
                }
            }
            _ => {}
        }
    }
}

/// Infer a per-field Kotlin type for every declared struct from the literal arguments at its
/// constructor-call sites. Returns `struct name → per-field-index type`. A field is present only
/// when a single unambiguous signal was seen across all sites; a field with no signal, or with
/// conflicting signals, is `None` (the emitter defaults it to `Float`). This keeps a struct that
/// is never constructed — or constructed only from identifiers/expressions — byte-identical to
/// the prior all-`Float` output (zero drift), while typing the common `Person("Alice", 30)` /
/// nested-record cases correctly.
fn infer_struct_field_types(
    ast: &Ast,
    enum_names: &[String],
    struct_names: &[String],
) -> HashMap<String, Vec<Option<ValType>>> {
    // struct name → per-field-index list of the literal signals gathered across all ctor sites.
    let mut acc: HashMap<String, Vec<Vec<ValType>>> = HashMap::new();
    for node in &ast.body {
        if let AstNode::Function(func) = node {
            collect_ctor_calls(&func.body, enum_names, struct_names, &mut acc);
        }
    }

    acc.into_iter()
        .map(|(name, fields)| {
            let resolved = fields
                .into_iter()
                .map(|signals| {
                    // A single distinct signal wins; zero or conflicting → None (default Float).
                    let mut distinct: Vec<ValType> = Vec::new();
                    for s in signals {
                        if !distinct.contains(&s) {
                            distinct.push(s);
                        }
                    }
                    if distinct.len() == 1 {
                        distinct.into_iter().next()
                    } else {
                        None
                    }
                })
                .collect();
            (name, resolved)
        })
        .collect()
}

/// Walk every statement in `body`, recording the literal type signal of each positional argument
/// of every struct-constructor call into `acc` (keyed by struct name, indexed by argument
/// position). Recurses into loop/if/decl/assignment/return sub-bodies and into nested expressions.
fn collect_ctor_calls(
    body: &[AstNode],
    enum_names: &[String],
    struct_names: &[String],
    acc: &mut HashMap<String, Vec<Vec<ValType>>>,
) {
    for node in body {
        collect_ctor_calls_in_stmt(node, enum_names, struct_names, acc);
    }
}

fn collect_ctor_calls_in_stmt(
    node: &AstNode,
    enum_names: &[String],
    struct_names: &[String],
    acc: &mut HashMap<String, Vec<Vec<ValType>>>,
) {
    match node {
        AstNode::ForOf(f) => {
            collect_ctor_calls_in_expr(&f.range, enum_names, struct_names, acc);
            collect_ctor_calls(&f.body, enum_names, struct_names, acc);
        }
        AstNode::While(w) => {
            collect_ctor_calls_in_expr(&w.test, enum_names, struct_names, acc);
            collect_ctor_calls(&w.body, enum_names, struct_names, acc);
        }
        AstNode::If(if_node) => {
            collect_ctor_calls_in_expr(&if_node.test, enum_names, struct_names, acc);
            collect_ctor_calls(&if_node.consequent, enum_names, struct_names, acc);
            if let Some(alt) = &if_node.alternate {
                collect_ctor_calls(alt, enum_names, struct_names, acc);
            }
        }
        AstNode::VariableDeclaration(v) => {
            collect_ctor_calls_in_expr(&v.value, enum_names, struct_names, acc)
        }
        AstNode::Assignment(a) => {
            collect_ctor_calls_in_expr(&a.value, enum_names, struct_names, acc)
        }
        AstNode::Return(r) => {
            if let Some(arg) = &r.argument {
                collect_ctor_calls_in_expr(arg, enum_names, struct_names, acc);
            }
        }
        other => collect_ctor_calls_in_expr(other, enum_names, struct_names, acc),
    }
}

fn collect_ctor_calls_in_expr(
    node: &AstNode,
    enum_names: &[String],
    struct_names: &[String],
    acc: &mut HashMap<String, Vec<Vec<ValType>>>,
) {
    if let Some(name) = struct_ctor_owner(node, struct_names) {
        if let AstNode::CallExpression(c) = node {
            // Record this site's per-field signals first; scope the `entry` borrow so it ends
            // before the recursive walk re-borrows `acc` for nested constructors.
            {
                let entry = acc.entry(name).or_default();
                for (idx, arg) in c.arguments.iter().enumerate() {
                    if let Some(signal) = ctor_arg_field_signal(arg, enum_names, struct_names) {
                        if entry.len() <= idx {
                            entry.resize(idx + 1, Vec::new());
                        }
                        entry[idx].push(signal);
                    }
                }
            }
            // An argument may itself be a (nested) struct constructor — keep walking.
            for arg in &c.arguments {
                collect_ctor_calls_in_expr(arg, enum_names, struct_names, acc);
            }
        }
        return;
    }

    match node {
        AstNode::BinaryExpression(b) => {
            collect_ctor_calls_in_expr(&b.left, enum_names, struct_names, acc);
            collect_ctor_calls_in_expr(&b.right, enum_names, struct_names, acc);
        }
        AstNode::UnaryExpression(u) => {
            collect_ctor_calls_in_expr(&u.argument, enum_names, struct_names, acc)
        }
        AstNode::CallExpression(c) => {
            for arg in &c.arguments {
                collect_ctor_calls_in_expr(arg, enum_names, struct_names, acc);
            }
        }
        AstNode::Array(a) => {
            for elem in &a.elements {
                collect_ctor_calls_in_expr(elem, enum_names, struct_names, acc);
            }
        }
        AstNode::ObjectLiteral(obj) => {
            for prop in &obj.properties {
                collect_ctor_calls_in_expr(prop.value.as_ref(), enum_names, struct_names, acc);
            }
        }
        _ => {}
    }
}

fn ctor_arg_field_signal(
    node: &AstNode,
    enum_names: &[String],
    struct_names: &[String],
) -> Option<ValType> {
    match node {
        AstNode::Array(_) | AstNode::ObjectLiteral(_) => {
            literal_value_signal(node, enum_names, struct_names)
        }
        _ => enum_member_owner(node, enum_names)
            .map(ValType::Enum)
            .or_else(|| arg_literal_signal(node, struct_names)),
    }
}

/// The unambiguous Kotlin type signal carried by a constructor argument, if any: a string literal
/// ⇒ `String`, a boolean literal ⇒ `Boolean`, a number literal ⇒ `Float`, a nested struct
/// constructor ⇒ that struct type. Identifiers, member accesses, and arithmetic yield `None` (no
/// override of the `Float` default — their type can't be read from the call site alone).
fn arg_literal_signal(node: &AstNode, struct_names: &[String]) -> Option<ValType> {
    match node {
        AstNode::String(_) => Some(ValType::Str),
        AstNode::Boolean(_) => Some(ValType::Bool),
        AstNode::Number(_) => Some(ValType::Float),
        _ => struct_ctor_owner(node, struct_names).map(ValType::Struct),
    }
}

/// Infer a parameter's Kotlin type by how the function body uses it: `Float` when the
/// parameter participates in arithmetic (`+ - * /`), is the argument of a numeric builtin
/// (`sqrt`); `Boolean` when it is used only as a bare truth value (an `if (param)` test, or an
/// operand of `&& || !`); otherwise `String`. This is the analogue of the existing all-`String`
/// policy — a `.hs` logic function is pure single-assignment, so a parameter used arithmetically
/// (or booleanly) anywhere is that type everywhere. Numeric is checked first so a value used in
/// both arithmetic and a comparison reads as `Float`; the routing decision's flags
/// (`isWorldLink` / `autoImmerse` / `isOpenAction`) are used only as bare `if` tests → `Boolean`.
fn infer_param_type(param: &str, body: &[AstNode], int_locals: &[String]) -> ValType {
    // A param iterated as a bare list (`for (v in param)`) is a `List<T>` — checked first since that
    // usage carries the most specific signal (the element type comes from how the loop var is used).
    if let Some(elem) = body_uses_param_as_list(param, body) {
        ValType::List(Box::new(elem))
    } else if body_uses_param_as_range_bound(param, body)
        || body_uses_param_as_index(param, body)
        || body_uses_param_as_index_local_initializer(param, body, int_locals)
    {
        // A param that bounds a range (`for (i in 0..n)`) is definitively `Int` — Kotlin ranges are
        // integer-typed — so this is checked before the Float/Boolean/String fallbacks.
        ValType::Int
    } else if body_uses_param_numerically(param, body) {
        ValType::Float
    } else if body_uses_param_as_boolean(param, body) {
        ValType::Bool
    } else {
        ValType::Str
    }
}

/// Collect local bindings whose names are used in computed list indexes (`arr[i]`). These locals
/// are emitted in an integer context so a plain `let i = 1` becomes `val i = 1`, not `1f`.
fn collect_index_local_bindings(body: &[AstNode]) -> Vec<String> {
    let mut index_identifiers = HashSet::new();
    collect_index_identifiers_in_body(body, &mut index_identifiers);

    let mut locals = Vec::new();
    collect_declared_locals_matching(body, &index_identifiers, &mut locals);
    locals
}

fn collect_declared_locals_matching(
    body: &[AstNode],
    wanted: &HashSet<String>,
    out: &mut Vec<String>,
) {
    for node in body {
        match node {
            AstNode::VariableDeclaration(v)
                if wanted.contains(&v.name) && !out.iter().any(|n| n == &v.name) =>
            {
                out.push(v.name.clone());
            }
            AstNode::ForOf(f) => collect_declared_locals_matching(&f.body, wanted, out),
            AstNode::While(w) => collect_declared_locals_matching(&w.body, wanted, out),
            AstNode::If(if_node) => {
                collect_declared_locals_matching(&if_node.consequent, wanted, out);
                if let Some(alt) = &if_node.alternate {
                    collect_declared_locals_matching(alt, wanted, out);
                }
            }
            _ => {}
        }
    }
}

fn collect_index_identifiers_in_body(body: &[AstNode], out: &mut HashSet<String>) {
    for node in body {
        collect_index_identifiers_in_stmt(node, out);
    }
}

fn collect_index_identifiers_in_stmt(node: &AstNode, out: &mut HashSet<String>) {
    match node {
        AstNode::VariableDeclaration(v) => collect_index_identifiers_in_expr(&v.value, out),
        AstNode::Assignment(a) => {
            collect_index_identifiers_in_expr(&a.target, out);
            collect_index_identifiers_in_expr(&a.value, out);
        }
        AstNode::Return(r) => {
            if let Some(arg) = &r.argument {
                collect_index_identifiers_in_expr(arg, out);
            }
        }
        AstNode::If(if_node) => {
            collect_index_identifiers_in_expr(&if_node.test, out);
            collect_index_identifiers_in_body(&if_node.consequent, out);
            if let Some(alt) = &if_node.alternate {
                collect_index_identifiers_in_body(alt, out);
            }
        }
        AstNode::While(w) => {
            collect_index_identifiers_in_expr(&w.test, out);
            collect_index_identifiers_in_body(&w.body, out);
        }
        AstNode::ForOf(f) => {
            collect_index_identifiers_in_expr(&f.range, out);
            collect_index_identifiers_in_body(&f.body, out);
        }
        other => collect_index_identifiers_in_expr(other, out),
    }
}

fn collect_index_identifiers_in_expr(node: &AstNode, out: &mut HashSet<String>) {
    match node {
        AstNode::MemberExpression(m) if m.computed => {
            collect_identifiers(&m.property, out);
            collect_index_identifiers_in_expr(&m.object, out);
        }
        AstNode::MemberExpression(m) => {
            collect_index_identifiers_in_expr(&m.object, out);
            collect_index_identifiers_in_expr(&m.property, out);
        }
        AstNode::BinaryExpression(b) => {
            collect_index_identifiers_in_expr(&b.left, out);
            collect_index_identifiers_in_expr(&b.right, out);
        }
        AstNode::UnaryExpression(u) => collect_index_identifiers_in_expr(&u.argument, out),
        AstNode::CallExpression(c) => {
            collect_index_identifiers_in_expr(&c.callee, out);
            for arg in &c.arguments {
                collect_index_identifiers_in_expr(arg, out);
            }
        }
        AstNode::LambdaExpression(lambda) => collect_index_identifiers_in_expr(&lambda.body, out),
        AstNode::Array(arr) => {
            for element in &arr.elements {
                collect_index_identifiers_in_expr(element, out);
            }
        }
        AstNode::ObjectLiteral(obj) => {
            for prop in &obj.properties {
                collect_index_identifiers_in_expr(prop.value.as_ref(), out);
            }
        }
        _ => {}
    }
}

fn collect_identifiers(node: &AstNode, out: &mut HashSet<String>) {
    match node {
        AstNode::Identifier(id) => {
            out.insert(id.name.clone());
        }
        AstNode::BinaryExpression(b) => {
            collect_identifiers(&b.left, out);
            collect_identifiers(&b.right, out);
        }
        AstNode::UnaryExpression(u) => collect_identifiers(&u.argument, out),
        AstNode::MemberExpression(m) => {
            collect_identifiers(&m.object, out);
            collect_identifiers(&m.property, out);
        }
        AstNode::CallExpression(c) => {
            collect_identifiers(&c.callee, out);
            for arg in &c.arguments {
                collect_identifiers(arg, out);
            }
        }
        _ => {}
    }
}

/// If `param` is iterated as a bare list (`for (v in param)` — the range IS the param identifier, not
/// a `0..n` range), return `Some(element type)`. The element type is read from how the loop variable
/// is used in the body (numeric ⇒ `Float`, boolean ⇒ `Boolean`), defaulting to `Float` (the common
/// numeric-array case). Returns `None` when the param is never iterated as a list, so a non-list
/// param keeps its existing Int/Float/Bool/Str inference (zero drift). Walks nested blocks.
fn body_uses_param_as_list(param: &str, body: &[AstNode]) -> Option<ValType> {
    for node in body {
        if let Some(elem) = stmt_uses_param_as_list(param, node) {
            return Some(elem);
        }
    }
    None
}

fn stmt_uses_param_as_list(param: &str, node: &AstNode) -> Option<ValType> {
    match node {
        // `for (v in param)` — the iterable is the bare param identifier (not a `0..n` range).
        AstNode::ForOf(f) if matches!(f.range.as_ref(), AstNode::Identifier(id) if id.name == param) =>
        {
            let elem = if body_uses_param_numerically(&f.var_name, &f.body) {
                ValType::Float
            } else if body_uses_param_as_boolean(&f.var_name, &f.body) {
                ValType::Bool
            } else {
                ValType::Float
            };
            Some(elem)
        }
        AstNode::ForOf(f) => body_uses_param_as_list(param, &f.body),
        AstNode::While(w) => body_uses_param_as_list(param, &w.body),
        AstNode::If(if_node) => body_uses_param_as_list(param, &if_node.consequent).or_else(|| {
            if_node
                .alternate
                .as_ref()
                .and_then(|alt| body_uses_param_as_list(param, alt))
        }),
        _ => None,
    }
}

/// Does `param` appear as an operand of a range expression (`a..param`, `param..b`) anywhere in
/// `body`? Such a param is an integer range bound. Walks into loop/if/decl/assignment bodies.
fn body_uses_param_as_range_bound(param: &str, body: &[AstNode]) -> bool {
    body.iter()
        .any(|n| stmt_uses_param_as_range_bound(param, n))
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
        AstNode::LambdaExpression(lambda) => {
            !lambda.params.iter().any(|p| p == param)
                && expr_uses_param_as_range_bound(param, &lambda.body)
        }
        _ => false,
    }
}

/// Walk every statement in `body` looking for a bare-boolean use of `param`: it appears directly
/// as an `if (...)` test, or as a `&& || !` operand. A param NOT used this way (e.g. only compared
/// or returned) stays `String` under the conservative default.
fn body_uses_param_as_index(param: &str, body: &[AstNode]) -> bool {
    body.iter().any(|n| stmt_uses_param_as_index(param, n))
}

fn stmt_uses_param_as_index(param: &str, node: &AstNode) -> bool {
    match node {
        AstNode::ForOf(f) => {
            expr_uses_param_as_index(param, &f.range) || body_uses_param_as_index(param, &f.body)
        }
        AstNode::While(w) => {
            expr_uses_param_as_index(param, &w.test) || body_uses_param_as_index(param, &w.body)
        }
        AstNode::If(if_node) => {
            expr_uses_param_as_index(param, &if_node.test)
                || body_uses_param_as_index(param, &if_node.consequent)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alt| body_uses_param_as_index(param, alt))
        }
        AstNode::VariableDeclaration(v) => expr_uses_param_as_index(param, &v.value),
        AstNode::Assignment(a) => {
            expr_uses_param_as_index(param, &a.target) || expr_uses_param_as_index(param, &a.value)
        }
        AstNode::Return(r) => r
            .argument
            .as_ref()
            .is_some_and(|a| expr_uses_param_as_index(param, a)),
        other => expr_uses_param_as_index(param, other),
    }
}

fn expr_uses_param_as_index(param: &str, node: &AstNode) -> bool {
    let is_param = |n: &AstNode| matches!(n, AstNode::Identifier(id) if id.name == param);
    match node {
        AstNode::MemberExpression(m) if m.computed => {
            expr_contains_node(&m.property, &is_param) || expr_uses_param_as_index(param, &m.object)
        }
        AstNode::MemberExpression(m) => {
            expr_uses_param_as_index(param, &m.object)
                || expr_uses_param_as_index(param, &m.property)
        }
        AstNode::BinaryExpression(b) => {
            expr_uses_param_as_index(param, &b.left) || expr_uses_param_as_index(param, &b.right)
        }
        AstNode::UnaryExpression(u) => expr_uses_param_as_index(param, &u.argument),
        AstNode::CallExpression(c) => {
            expr_uses_param_as_index(param, &c.callee)
                || c.arguments
                    .iter()
                    .any(|a| expr_uses_param_as_index(param, a))
        }
        AstNode::LambdaExpression(lambda) => {
            !lambda.params.iter().any(|p| p == param)
                && expr_uses_param_as_index(param, &lambda.body)
        }
        AstNode::Array(arr) => arr
            .elements
            .iter()
            .any(|element| expr_uses_param_as_index(param, element)),
        AstNode::ObjectLiteral(obj) => obj
            .properties
            .iter()
            .any(|prop| expr_uses_param_as_index(param, prop.value.as_ref())),
        _ => false,
    }
}

fn body_uses_param_as_index_local_initializer(
    param: &str,
    body: &[AstNode],
    int_locals: &[String],
) -> bool {
    body.iter()
        .any(|n| stmt_uses_param_as_index_local_initializer(param, n, int_locals))
}

fn stmt_uses_param_as_index_local_initializer(
    param: &str,
    node: &AstNode,
    int_locals: &[String],
) -> bool {
    match node {
        AstNode::VariableDeclaration(v) if int_locals.iter().any(|n| n == &v.name) => {
            expr_contains_identifier(&v.value, param)
        }
        AstNode::ForOf(f) => body_uses_param_as_index_local_initializer(param, &f.body, int_locals),
        AstNode::While(w) => body_uses_param_as_index_local_initializer(param, &w.body, int_locals),
        AstNode::If(if_node) => {
            body_uses_param_as_index_local_initializer(param, &if_node.consequent, int_locals)
                || if_node.alternate.as_ref().is_some_and(|alt| {
                    body_uses_param_as_index_local_initializer(param, alt, int_locals)
                })
        }
        _ => false,
    }
}

fn expr_contains_identifier(node: &AstNode, name: &str) -> bool {
    expr_contains_node(
        node,
        &|n| matches!(n, AstNode::Identifier(id) if id.name == name),
    )
}

fn expr_contains_node(node: &AstNode, predicate: &impl Fn(&AstNode) -> bool) -> bool {
    if predicate(node) {
        return true;
    }
    match node {
        AstNode::BinaryExpression(b) => {
            expr_contains_node(&b.left, predicate) || expr_contains_node(&b.right, predicate)
        }
        AstNode::UnaryExpression(u) => expr_contains_node(&u.argument, predicate),
        AstNode::CallExpression(c) => {
            expr_contains_node(&c.callee, predicate)
                || c.arguments.iter().any(|a| expr_contains_node(a, predicate))
        }
        AstNode::LambdaExpression(lambda) => expr_contains_node(&lambda.body, predicate),
        AstNode::MemberExpression(m) => {
            expr_contains_node(&m.object, predicate) || expr_contains_node(&m.property, predicate)
        }
        AstNode::Array(arr) => arr
            .elements
            .iter()
            .any(|element| expr_contains_node(element, predicate)),
        AstNode::ObjectLiteral(obj) => obj
            .properties
            .iter()
            .any(|prop| expr_contains_node(prop.value.as_ref(), predicate)),
        _ => false,
    }
}

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
        AstNode::LambdaExpression(lambda) => {
            !lambda.params.iter().any(|p| p == param)
                && expr_uses_param_as_boolean(param, &lambda.body)
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
        | AstNode::UnaryExpression(_)
        | AstNode::LambdaExpression(_) => expr_uses_param_numerically(param, node),
        _ => false,
    }
}

/// Is `param` used in a numeric position anywhere inside `node`? A numeric position is: an
/// operand of an arithmetic operator, the operand of a unary `-`, or an argument to a shared
/// numeric builtin.
fn expr_uses_param_numerically(param: &str, node: &AstNode) -> bool {
    let direct_hit =
        |operand: &AstNode| matches!(operand, AstNode::Identifier(id) if id.name == param);
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
            let is_numeric_builtin = matches!(
                c.callee.as_ref(),
                AstNode::Identifier(id) if is_numeric_builtin_call(&id.name)
            );
            (is_numeric_builtin && c.arguments.iter().any(direct_hit))
                || c.arguments
                    .iter()
                    .any(|a| expr_uses_param_numerically(param, a))
        }
        AstNode::MemberExpression(m) => {
            expr_uses_param_numerically(param, &m.object)
                || expr_uses_param_numerically(param, &m.property)
        }
        AstNode::LambdaExpression(lambda) => {
            !lambda.params.iter().any(|p| p == param)
                && expr_uses_param_numerically(param, &lambda.body)
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
/// operator (`+ - * /` / `%`), or a shared numeric builtin call all read as `Float`. Used only
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
            matches!(c.callee.as_ref(), AstNode::Identifier(id) if is_numeric_builtin_call(&id.name))
        }
        _ => false,
    }
}

fn emit_statement(
    node: &AstNode,
    indent: &str,
    lines: &mut Vec<String>,
    int_locals: &[String],
) -> Result<(), KotlinEmitError> {
    match node {
        // `let`/`const x = expr` → immutable `val`; `var x = expr` → mutable `var`.
        AstNode::VariableDeclaration(v) => {
            let value = if int_locals.iter().any(|n| n == &v.name) {
                emit_int_expr(&v.value, int_locals)?
            } else {
                emit_expr(&v.value, int_locals)?
            };
            let kw = if v.mutable { "var" } else { "val" };
            if let AstNode::LambdaExpression(lambda) = v.value.as_ref() {
                let ty = emit_lambda_type(lambda)?;
                lines.push(format!("{}{} {}: {} = {}", indent, kw, v.name, ty, value));
            } else {
                lines.push(format!("{}{} {} = {}", indent, kw, v.name, value));
            }
            Ok(())
        }
        // Defensive: an object-graph `Property` reaching the logic emitter is treated as an
        // immutable binding (the parser now emits `VariableDeclaration` for `.hs` logic bindings).
        AstNode::Property(p) => {
            let value = emit_expr(&p.value, int_locals)?;
            lines.push(format!("{}val {} = {}", indent, p.key, value));
            Ok(())
        }
        // `x = expr` / `acc += expr` reassignment of a LOCAL `var`.
        AstNode::Assignment(a) => {
            let target = emit_expr(&a.target, int_locals)?;
            let value = emit_expr(&a.value, int_locals)?;
            lines.push(format!("{}{} {} {}", indent, target, a.operator, value));
            Ok(())
        }
        // `while (cond) { … }` → Kotlin `while (cond) { … }`.
        AstNode::While(w) => {
            lines.push(format!(
                "{}while ({}) {{",
                indent,
                emit_expr(&w.test, int_locals)?
            ));
            let inner = format!("{}  ", indent);
            for stmt in &w.body {
                emit_statement(stmt, &inner, lines, int_locals)?;
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
                emit_expr(&f.range, int_locals)?
            ));
            let inner = format!("{}  ", indent);
            for stmt in &f.body {
                emit_statement(stmt, &inner, lines, int_locals)?;
            }
            lines.push(format!("{}}}", indent));
            Ok(())
        }
        AstNode::Return(r) => {
            match &r.argument {
                Some(arg) => {
                    lines.push(format!("{}return {}", indent, emit_expr(arg, int_locals)?))
                }
                None => lines.push(format!("{}return", indent)),
            }
            Ok(())
        }
        AstNode::If(if_node) => {
            lines.push(format!(
                "{}if ({}) {{",
                indent,
                emit_expr(&if_node.test, int_locals)?
            ));
            let inner = format!("{}  ", indent);
            for stmt in &if_node.consequent {
                emit_statement(stmt, &inner, lines, int_locals)?;
            }
            if let Some(alt) = &if_node.alternate {
                lines.push(format!("{}}} else {{", indent));
                for stmt in alt {
                    emit_statement(stmt, &inner, lines, int_locals)?;
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
            lines.push(format!("{}{}", indent, emit_expr(node, int_locals)?));
            Ok(())
        }
        AstNode::Comment(_) => Ok(()),
        other => Err(KotlinEmitError::new(format!(
            "unsupported statement node in .hs logic body: {}",
            node_kind(other)
        ))),
    }
}

fn emit_expr(node: &AstNode, int_locals: &[String]) -> Result<String, KotlinEmitError> {
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
                let left = emit_range_operand(&b.left, parent, false, int_locals)?;
                let right = emit_range_operand(&b.right, parent, true, int_locals)?;
                return Ok(format!("{}..{}", left, right));
            }
            // The parser discards parentheses, keeping only a precedence-correct tree. To emit
            // Kotlin that means the SAME thing, re-parenthesize: wrap a child whose operator binds
            // LOOSER than this one, and wrap the right child of a left-associative operator when it
            // shares this precedence (so `a - (b - c)` and `(a + b) * c` survive intact).
            let parent = precedence(&b.operator);
            let op = map_binary_operator(&b.operator);
            let left = emit_operand(&b.left, parent, false, int_locals)?;
            let right = emit_operand(&b.right, parent, true, int_locals)?;
            Ok(format!("{} {} {}", left, op, right))
        }
        AstNode::UnaryExpression(u) => {
            // Parenthesize a binary argument so `-(a + b)` / `!(a && b)` keep their grouping.
            let arg = match u.argument.as_ref() {
                AstNode::BinaryExpression(_) => {
                    format!("({})", emit_expr(&u.argument, int_locals)?)
                }
                _ => emit_expr(&u.argument, int_locals)?,
            };
            Ok(format!("{}{}", u.operator, arg))
        }
        AstNode::MemberExpression(m) => {
            let object = emit_expr(&m.object, int_locals)?;
            if m.computed {
                Ok(format!(
                    "{}[{}]",
                    object,
                    emit_int_expr(&m.property, int_locals)?
                ))
            } else {
                let prop = match m.property.as_ref() {
                    AstNode::Identifier(id) => id.name.clone(),
                    other => emit_expr(other, int_locals)?,
                };
                Ok(format!("{}.{}", object, prop))
            }
        }
        AstNode::CallExpression(c) => {
            let args = c
                .arguments
                .iter()
                .map(|arg| emit_expr(arg, int_locals))
                .collect::<Result<Vec<_>, _>>()?;
            // Bare numeric builtins map through the shared table so emission and type inference
            // stay in lockstep. Member-call forms (e.g. `x.trim()`) pass through unchanged.
            if let AstNode::Identifier(id) = c.callee.as_ref() {
                if let Some(builtin) = kotlin_builtin(&id.name) {
                    return emit_builtin_call(builtin, &args);
                }
                return Ok(format!("{}({})", id.name, args.join(", ")));
            }
            let callee = emit_expr(&c.callee, int_locals)?;
            Ok(format!("{}({})", callee, args.join(", ")))
        }
        AstNode::LambdaExpression(lambda) => {
            let params = lambda.params.join(", ");
            Ok(format!(
                "{{ {} -> {} }}",
                params,
                emit_expr(&lambda.body, int_locals)?
            ))
        }
        AstNode::Array(arr) => {
            let elems = arr
                .elements
                .iter()
                .map(|element| emit_expr(element, int_locals))
                .collect::<Result<Vec<_>, _>>()?
                .join(", ");
            Ok(format!("listOf({})", elems))
        }
        AstNode::ObjectLiteral(obj) => {
            let mut entries: Vec<String> = Vec::new();
            for prop in &obj.properties {
                entries.push(format!(
                    "{} to {}",
                    emit_string_literal(&prop.key),
                    emit_expr(prop.value.as_ref(), int_locals)?
                ));
            }
            Ok(format!("mapOf({})", entries.join(", ")))
        }
        other => Err(KotlinEmitError::new(format!(
            "unsupported expression node in .hs logic body: {}",
            node_kind(other)
        ))),
    }
}

fn emit_lambda_type(lambda: &crate::ast::LambdaExpression) -> Result<String, KotlinEmitError> {
    if lambda.params.len() != 1 {
        return Err(KotlinEmitError::new(
            "unsupported lambda expression in .hs logic body: only single-parameter lambdas are supported",
        ));
    }

    let param_types = lambda
        .params
        .iter()
        .map(|param| infer_lambda_param_type(param, lambda.body.as_ref()).kotlin())
        .collect::<Vec<_>>()
        .join(", ");
    let ret = infer_lambda_return_type(lambda.body.as_ref()).kotlin();
    Ok(format!("({}) -> {}", param_types, ret))
}

fn infer_lambda_param_type(param: &str, body: &AstNode) -> ValType {
    if expr_uses_param_numerically(param, body) {
        ValType::Float
    } else if expr_uses_param_as_boolean(param, body) {
        ValType::Bool
    } else {
        ValType::Str
    }
}

fn infer_lambda_return_type(body: &AstNode) -> ValType {
    if is_boolean_expr(body) {
        ValType::Bool
    } else if is_numeric_expr(body) {
        ValType::Float
    } else {
        ValType::Str
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

/// Emit a table-backed bare `.hs` builtin call.
/// Most builtins are ordinary qualified functions; `pow` lowers through
/// `java.lang.Math.pow(...).toFloat()` because Kotlin's stdlib `pow` is an extension-style
/// call while `.hs` exposes a bare function.
fn emit_builtin_call(builtin: &KotlinBuiltin, args: &[String]) -> Result<String, KotlinEmitError> {
    match builtin.emission {
        KotlinBuiltinEmission::Function(_) => Ok(format!(
            "{}({})",
            map_builtin_call(builtin.name),
            args.join(", ")
        )),
        KotlinBuiltinEmission::Pow => {
            if args.len() != 2 {
                return Err(KotlinEmitError::new(format!(
                    "builtin pow expects 2 arguments, got {}",
                    args.len()
                )));
            }
            Ok(format!(
                "java.lang.Math.pow(({}).toDouble(), ({}).toDouble()).toFloat()",
                args[0], args[1]
            ))
        }
    }
}

fn map_builtin_call(name: &str) -> &str {
    match kotlin_builtin(name).map(|builtin| builtin.emission) {
        Some(KotlinBuiltinEmission::Function(path)) => path,
        Some(KotlinBuiltinEmission::Pow) => "java.lang.Math.pow",
        None => name,
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
fn emit_operand(
    node: &AstNode,
    parent: u8,
    is_right: bool,
    int_locals: &[String],
) -> Result<String, KotlinEmitError> {
    let emitted = emit_expr(node, int_locals)?;
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
fn emit_range_operand(
    node: &AstNode,
    parent: u8,
    is_right: bool,
    int_locals: &[String],
) -> Result<String, KotlinEmitError> {
    let emitted = emit_int_expr(node, int_locals)?;
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
fn emit_int_expr(node: &AstNode, int_locals: &[String]) -> Result<String, KotlinEmitError> {
    match node {
        AstNode::Number(n) => Ok(emit_int_literal(&n.raw)),
        AstNode::BinaryExpression(b)
            if matches!(b.operator.as_str(), "+" | "-" | "*" | "/" | "%") =>
        {
            let parent = precedence(&b.operator);
            let op = map_binary_operator(&b.operator);
            let left = emit_int_operand(&b.left, parent, false, int_locals)?;
            let right = emit_int_operand(&b.right, parent, true, int_locals)?;
            Ok(format!("{} {} {}", left, op, right))
        }
        other => emit_expr(other, int_locals),
    }
}

fn emit_int_operand(
    node: &AstNode,
    parent: u8,
    is_right: bool,
    int_locals: &[String],
) -> Result<String, KotlinEmitError> {
    let emitted = emit_int_expr(node, int_locals)?;
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
        Some(("", _frac)) => "0".to_string(),
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

/// Emit a Kotlin double-quoted string literal.
///
/// A `${ … }` segment is passed through verbatim as a Kotlin string-template expression — this is
/// HoloScript string interpolation (`"hi ${name}"` ⇒ Kotlin interpolates `name`). The inner
/// expression is handed to Kotlin as-is and validated at Kotlin-compile time (the `.hs` emitter
/// does not yet re-parse it). Every *other* `$` is escaped to `\$` so a bare dollar stays literal
/// (`"$cost"` ⇒ `"\$cost"`) — Kotlin treats an unescaped `$` specially, and bare-`$`-literal is the
/// shipped behaviour this preserves (so only the explicit `${ … }` form interpolates, never a bare
/// `$name`). Braces inside the interpolation are balanced so `${ … {…} … }` passes through whole;
/// an unbalanced `${` falls back to a literal `$`. `\`, `"`, and whitespace controls escape as usual.
fn emit_string_literal(value: &str) -> String {
    let chars: Vec<char> = value.chars().collect();
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    let mut i = 0;
    while i < chars.len() {
        let ch = chars[i];
        match ch {
            '$' if i + 1 < chars.len() && chars[i + 1] == '{' => {
                // `${ … }` — pass the whole balanced template expression through to Kotlin.
                if let Some(end) = matching_brace(&chars, i + 1) {
                    out.extend(&chars[i..=end]);
                    i = end + 1;
                    continue;
                }
                // Unbalanced `${` — no matching `}`, so treat the dollar as a literal.
                out.push_str("\\$");
            }
            '$' => out.push_str("\\$"),
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other => out.push(other),
        }
        i += 1;
    }
    out.push('"');
    out
}

/// Given `chars[open]` is `{`, return the index of the matching `}` (brace-balanced), or `None`
/// if the braces never balance before the end of the slice.
fn matching_brace(chars: &[char], open: usize) -> Option<usize> {
    let mut depth = 0usize;
    for (offset, &c) in chars[open..].iter().enumerate() {
        match c {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(open + offset);
                }
            }
            _ => {}
        }
    }
    None
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
        AstNode::EnumDeclaration(_) => "EnumDeclaration",
        AstNode::StructDeclaration(_) => "StructDeclaration",
        AstNode::VariableDeclaration(_) => "VariableDeclaration",
        AstNode::StackSlotDeclaration(_) => "StackSlotDeclaration",
        AstNode::LexicalScope(_) => "LexicalScope",
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
        assert!(
            out.contains("fun isEmpty(text: String): Boolean {"),
            "{out}"
        );
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

    // ── String interpolation `${ … }` (G7b) ─────────────────────────────────────────────────────

    #[test]
    fn interpolates_braced_expression() {
        // `${name}` passes through as a Kotlin template expression (NOT escaped to a literal).
        let src = r#"function greet(name) {
  return "hello ${name}"
}"#;
        let out = kotlin(src);
        assert!(out.contains("return \"hello ${name}\""), "{out}");
        assert!(
            !out.contains("\\${name}"),
            "must not escape an interpolation: {out}"
        );
    }

    #[test]
    fn interpolates_member_access_expression() {
        let src = r#"function f(user) {
  return "${user.name}"
}"#;
        let out = kotlin(src);
        assert!(out.contains("return \"${user.name}\""), "{out}");
    }

    #[test]
    fn bare_dollar_outside_braces_stays_literal_with_interpolation() {
        // A bare `$` (not `${`) stays literal even alongside an interpolation in the same string.
        let src = r#"function price(qty) {
  return "$5 for ${qty}"
}"#;
        let out = kotlin(src);
        assert!(out.contains("return \"\\$5 for ${qty}\""), "{out}");
    }

    #[test]
    fn unbalanced_interpolation_brace_falls_back_to_literal_dollar() {
        // `${` with no matching `}` is malformed as a template, so the dollar is emitted literal.
        let src = r#"function f() {
  return "${oops"
}"#;
        let out = kotlin(src);
        assert!(out.contains("return \"\\${oops\""), "{out}");
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
        assert!(
            !body.contains("("),
            "should not add spurious parens to body: {body}"
        );
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
        assert!(
            !body.contains("("),
            "no parens for naturally-left-assoc form: {body}"
        );
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
        assert!(
            out.contains("fun gazeLen(fx: Float, fz: Float): Float {"),
            "{out}"
        );
    }

    #[test]
    fn maps_common_numeric_builtins_to_shared_kotlin_table() {
        assert_eq!(map_builtin_call("sqrt"), "kotlin.math.sqrt");
        assert_eq!(map_builtin_call("abs"), "kotlin.math.abs");
        assert_eq!(map_builtin_call("floor"), "kotlin.math.floor");
        assert_eq!(map_builtin_call("min"), "kotlin.math.min");
        assert_eq!(map_builtin_call("max"), "kotlin.math.max");
        assert_eq!(map_builtin_call("pow"), "java.lang.Math.pow");
        assert_eq!(map_builtin_call("localHelper"), "localHelper");
    }

    #[test]
    fn emits_common_numeric_builtins_and_infers_float_params() {
        let src = r#"function shapeScore(x, y, z) {
  let ax = abs(x)
  let fy = floor(y)
  let cap = min(ax, max(fy, z))
  return pow(cap, 2)
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("fun shapeScore(x: Float, y: Float, z: Float): Float {"),
            "{out}"
        );
        assert!(out.contains("val ax = kotlin.math.abs(x)"), "{out}");
        assert!(out.contains("val fy = kotlin.math.floor(y)"), "{out}");
        assert!(
            out.contains("val cap = kotlin.math.min(ax, kotlin.math.max(fy, z))"),
            "{out}"
        );
        assert!(
            out.contains("return java.lang.Math.pow((cap).toDouble(), (2f).toDouble()).toFloat()"),
            "{out}"
        );
    }

    #[test]
    fn emits_single_expression_lambda_with_capture() {
        let src = r#"function addWith(x) {
  let inc = (y) => x + y
  return x + inc(1)
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun addWith(x: Float): Float {"), "{out}");
        assert!(
            out.contains("val inc: (Float) -> Float = { y -> x + y }"),
            "{out}"
        );
        assert!(out.contains("return x + inc(1f)"), "{out}");
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
        assert!(
            out.contains("fun both(a: Boolean, b: Boolean): Boolean {"),
            "{out}"
        );
    }

    #[test]
    fn enum_decl_with_optional_commas_and_trailing_comma() {
        // The member list tolerates a trailing comma (object-literal-style lenient commas).
        let src = r#"enum Color { Red, Green, Blue, }"#;
        let out = kotlin(src);
        assert!(
            out.contains("enum class Color { Red, Green, Blue }"),
            "{out}"
        );
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
    fn rejects_reassignment_of_immutable_let_binding() {
        let src = r#"function f() {
  let x = 1
  x = x + 1
  return x
}"#;
        let result = compile_source_to_kotlin(src, "  ");
        assert!(result.is_err(), "immutable reassignment must fail");
        let msg = result.unwrap_err().message;
        assert!(
            msg.contains("cannot assign to immutable binding `x`"),
            "{msg}"
        );
        assert!(msg.contains("declare it with `var`"), "{msg}");
    }

    #[test]
    fn detailed_semantics_admit_native_reference_dereference_assignment() {
        let src = r#"function main(): i32 {
  slot value: i32 = 2
  let writer: &mut i32 = &mut value
  *writer = 5
  return *writer
}"#;
        let ast = crate::parse_ast(src).expect("v3 reference syntax should parse");
        check_semantics(&ast).expect("native reference assignment should pass shared admission");
    }

    #[test]
    fn detailed_semantics_admit_native_lexical_reference_scopes() {
        let src = r#"function main(): i32 {
  slot value: i32 = 2
  scope {
    let writer: &mut i32 = &mut value
    *writer = 5
  }
  return load(value)
}"#;
        let ast = crate::parse_ast(src).expect("v4 lexical scope syntax should parse");
        check_semantics(&ast).expect("native lexical scope should pass shared admission");
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
        assert!(
            out.contains("fun countdown(start: Float): Float {"),
            "{out}"
        );
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
    fn typed_machine_structs_fail_closed_until_kotlin_layout_lowering_exists() {
        let src = r#"struct Packet { enabled: bool, count: i64, code: i32 }
function mk() {
  return Packet(false, 2, 1)
}"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not silently erase native field layout types");
        assert!(error
            .to_string()
            .contains("typed struct `Packet` requires target-specific layout lowering"));
    }

    #[test]
    fn fixed_machine_arrays_fail_closed_until_kotlin_bounds_lowering_exists() {
        let src = r#"function main(): i32 {
  slot values: [i32; 2] = [1, 2]
  return load(values[0])
}"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not silently erase native fixed-array bounds semantics");
        assert!(error.to_string().contains(
            "fixed array type `[i32; 2]` in stack slot `values` requires target-specific bounds lowering"
        ));
    }

    #[test]
    fn borrowed_machine_slices_fail_closed_until_kotlin_borrow_lowering_exists() {
        let src = r#"function main(): i32 {
  slot values: [i32; 2] = [1, 2]
  let view: &[i32] = &values[0..2]
  return load(view[0])
}"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not silently erase native slice borrow semantics");
        assert!(error.to_string().contains(
            "borrowed slice type `&[i32]` in local `view` requires target-specific borrow and bounds lowering"
        ));
    }

    #[test]
    fn owned_machine_buffers_fail_closed_until_kotlin_ownership_lowering_exists() {
        let src = r#"function main(): i32 {
  let values: [i32] = buffer(2, 0)
  return 5
}"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not silently erase native owned-buffer semantics");
        assert!(error.to_string().contains(
            "owned buffer type `[i32]` in local `values` requires target-specific allocator, move, and drop lowering"
        ));
    }

    #[test]
    fn owned_transfer_abi_fails_closed_on_kotlin_bridge() {
        let src = r#"function relay(values: [i32]): [i32] {
  return move(values)
}
function main(): i32 { return 5 }"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not silently erase the owned return ABI");
        assert!(error.to_string().contains(
            "owned buffer type `[i32]` in return type of function `relay` requires target-specific allocator, move, and drop lowering"
        ));
    }

    #[test]
    fn owned_aggregate_fields_fail_closed_on_kotlin_bridge() {
        let src = r#"struct Packet { values: [i32] }
function main(): i32 {
  slot packet: Packet = Packet(buffer(2, 5))
  return 5
}"#;
        let error = compile_source_to_kotlin(src, "  ")
            .expect_err("Kotlin must not erase owned aggregate field semantics");
        assert!(error.to_string().contains(
            "owned buffer type `[i32]` in field `values` of struct `Packet` requires target-specific allocator, move, and drop lowering"
        ));
    }

    #[test]
    fn infers_struct_return_for_struct_constructor() {
        // A function whose every return constructs the declared struct returns that struct type.
        let src = r#"struct Vec2 { x, y }
function scale(x, y, k) {
  return Vec2(x * k, y * k)
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Vec2(val x: Float, val y: Float)"),
            "{out}"
        );
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

    // ── Per-field struct types from constructor sites (G7) ───────────────────────────────────────

    #[test]
    fn struct_field_typed_string_from_ctor_literal() {
        // A field whose constructor argument is a string literal types `String`; a numeric-literal
        // argument stays `Float`.
        let src = r#"struct Person { name, age }
function mk() {
  return Person("Alice", 30.0)
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Person(val name: String, val age: Float)"),
            "{out}"
        );
    }

    #[test]
    fn struct_field_typed_boolean_from_ctor_literal() {
        let src = r#"struct Flag { on, label }
function mk() {
  return Flag(true, "ready")
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Flag(val on: Boolean, val label: String)"),
            "{out}"
        );
    }

    #[test]
    fn struct_nested_field_typed_as_struct() {
        // A field constructed from a nested struct constructor types that struct.
        let src = r#"struct Vec2 { x, y }
struct Segment { a, b }
function mk() {
  return Segment(Vec2(1.0, 2.0), Vec2(3.0, 4.0))
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Segment(val a: Vec2, val b: Vec2)"),
            "{out}"
        );
        // The nested constructor's own fields are still inferred (numeric → Float).
        assert!(
            out.contains("data class Vec2(val x: Float, val y: Float)"),
            "{out}"
        );
    }

    #[test]
    fn struct_field_typed_list_struct_from_array_ctor_arg() {
        let src = r#"struct Vec3 { x, y, z }
struct Path { pts }
function mk() {
  return Path([Vec3(1, 2, 3), Vec3(4, 5, 6)])
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Path(val pts: List<Vec3>)"),
            "{out}"
        );
        assert!(
            out.contains("data class Vec3(val x: Float, val y: Float, val z: Float)"),
            "{out}"
        );
        assert!(
            out.contains("return Path(listOf(Vec3(1f, 2f, 3f), Vec3(4f, 5f, 6f)))"),
            "{out}"
        );
    }

    #[test]
    fn struct_field_typed_list_string_from_array_ctor_arg() {
        let src = r#"struct Tags { labels }
function mk() {
  return Tags(["alpha", "beta"])
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Tags(val labels: List<String>)"),
            "{out}"
        );
        assert!(
            out.contains("return Tags(listOf(\"alpha\", \"beta\"))"),
            "{out}"
        );
    }

    #[test]
    fn struct_unconstructed_stays_all_float() {
        // Zero-drift guard: a struct that is never constructed keeps the all-`Float` record.
        let src = r#"struct Q { p, r }
function f(p) {
  return p
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Q(val p: Float, val r: Float)"),
            "{out}"
        );
    }

    #[test]
    fn struct_conflicting_field_signals_default_float() {
        // Conflicting literal signals across sites (string here, number there) fall back to the
        // conservative `Float` default rather than assert a wrong specific type.
        let src = r#"struct M { v }
function a() {
  return M("hi")
}
function b() {
  return M(2.0)
}"#;
        let out = kotlin(src);
        assert!(out.contains("data class M(val v: Float)"), "{out}");
    }

    #[test]
    fn struct_field_from_identifier_arg_stays_float() {
        // An identifier/expression argument carries no call-site signal, so the field stays `Float`
        // (matches the pre-G7 behaviour for `Vec2(x * k, y * k)`-style constructions).
        let src = r#"struct P { a }
function mk(a) {
  return P(a)
}"#;
        let out = kotlin(src);
        assert!(out.contains("data class P(val a: Float)"), "{out}");
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
        assert!(
            out.contains("fun newYaw(yaw: Float, turn: Float): Float {"),
            "{out}"
        );
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

    // ── Typed arrays `[1, 2, 3]` ⇒ `listOf(...)` with `List<T>` inference (G7c) ──────────────────

    #[test]
    fn infers_list_float_return_for_numeric_array_literal() {
        let src = r#"function pts() {
  return [1, 2, 3]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun pts(): List<Float> {"), "{out}");
        assert!(out.contains("return listOf(1f, 2f, 3f)"), "{out}");
    }

    #[test]
    fn infers_list_string_return_for_string_array_literal() {
        let src = r#"function names() {
  return ["a", "b"]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun names(): List<String> {"), "{out}");
        assert!(out.contains("return listOf(\"a\", \"b\")"), "{out}");
    }

    #[test]
    fn infers_list_boolean_return_for_bool_array_literal() {
        let src = r#"function flags() {
  return [true, false]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun flags(): List<Boolean> {"), "{out}");
        assert!(out.contains("return listOf(true, false)"), "{out}");
    }

    #[test]
    fn infers_nested_list_for_array_of_arrays() {
        let src = r#"function grid() {
  return [[1, 2], [3, 4]]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun grid(): List<List<Float>> {"), "{out}");
        assert!(
            out.contains("return listOf(listOf(1f, 2f), listOf(3f, 4f))"),
            "{out}"
        );
    }

    #[test]
    fn infers_list_struct_return_for_struct_array_literal() {
        // An array of declared-struct constructors infers `List<Struct>` (element type via the
        // same struct-ctor signal used by scalar return inference).
        let src = r#"struct Vec3 { x, y, z }
function points() {
  return [Vec3(1, 2, 3), Vec3(4, 5, 6)]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun points(): List<Vec3> {"), "{out}");
        assert!(
            out.contains("return listOf(Vec3(1f, 2f, 3f), Vec3(4f, 5f, 6f))"),
            "{out}"
        );
    }

    #[test]
    fn emits_listof_for_local_array_binding() {
        // A local array binding emits `listOf(...)`; Kotlin infers `List<Float>` from the value,
        // so no explicit annotation is needed on the `val`.
        let src = r#"function build() {
  let xs = [1, 2, 3]
  return ""
}"#;
        let out = kotlin(src);
        assert!(out.contains("val xs = listOf(1f, 2f, 3f)"), "{out}");
    }

    #[test]
    fn local_array_index_uses_int_binding_and_infers_element_return() {
        let src = r#"function pick() {
  let arr = [10, 20, 30]
  let i = 1
  return arr[i]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun pick(): Float {"), "{out}");
        assert!(out.contains("val arr = listOf(10f, 20f, 30f)"), "{out}");
        assert!(out.contains("val i = 1"), "{out}");
        assert!(!out.contains("val i = 1f"), "{out}");
        assert!(out.contains("return arr[i]"), "{out}");
    }

    #[test]
    fn literal_array_index_uses_int_context() {
        let src = r#"function pick() {
  let arr = [10, 20, 30]
  return arr[1]
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun pick(): Float {"), "{out}");
        assert!(out.contains("return arr[1]"), "{out}");
        assert!(!out.contains("return arr[1f]"), "{out}");
    }

    #[test]
    fn empty_array_return_defaults_to_list_float() {
        // No element signal ⇒ `List<Float>`; the bare `listOf()` reconciles against the annotation.
        let src = r#"function none() {
  return []
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun none(): List<Float> {"), "{out}");
        assert!(out.contains("return listOf()"), "{out}");
    }

    #[test]
    fn array_inference_leaves_non_array_functions_unchanged() {
        // Zero-drift guard: adding `List<T>` return inference must NOT perturb the shipped
        // String / Float / enum function shapes when they coexist with an array function.
        let src = r#"enum Route { A, B }
function pts() {
  return [1, 2, 3]
}
function worldId(text) {
  let seg = text.trim()
  return seg
}
function newYaw(yaw, turn) {
  return yaw + turn
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun pts(): List<Float> {"), "{out}");
        assert!(out.contains("fun worldId(text: String): String {"), "{out}");
        assert!(
            out.contains("fun newYaw(yaw: Float, turn: Float): Float {"),
            "{out}"
        );
        assert!(out.contains("enum class Route { A, B }"), "{out}");
    }

    // ── G7d: List<T> param inference + bare-identifier list-return inference ──────────────────────

    #[test]
    fn infers_list_param_for_iterated_param() {
        // A param iterated as a bare list (`for (v in xs)`) infers `List<Float>` (element type from
        // the loop var's numeric use); the accumulator return stays `Float`.
        let src = r#"function total(xs) {
  var t = 0
  for (v in xs) {
    t = t + v
  }
  return t
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun total(xs: List<Float>): Float {"), "{out}");
    }

    #[test]
    fn range_loop_param_still_infers_int_not_list() {
        // Zero-drift guard: a `0..n` range bound stays `Int` — the List branch must NOT mis-fire on a
        // range loop (its range is a `..` expression, not a bare param identifier).
        let src = r#"function loop(n) {
  var t = 0
  for (i in 0..n) {
    t = t + i
  }
  return t
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun loop(n: Int): Float {"), "{out}");
    }

    #[test]
    fn infers_list_float_return_for_bare_identifier_list_local() {
        // `let xs = [..]` then `return xs` infers `List<Float>` (bare-identifier list return) — the
        // list analogue of the numeric-accumulator `return total` ⇒ `Float` rule.
        let src = r#"function make() {
  let xs = [1, 2, 3]
  return xs
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun make(): List<Float> {"), "{out}");
        assert!(out.contains("val xs = listOf(1f, 2f, 3f)"), "{out}");
        assert!(out.contains("return xs"), "{out}");
    }

    #[test]
    fn infers_list_string_return_for_bare_identifier_list_local() {
        let src = r#"function labels() {
  let names = ["a", "b"]
  return names
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun labels(): List<String> {"), "{out}");
        assert!(out.contains("return names"), "{out}");
    }

    // G7e: Object literals `{ k: v }` => `mapOf(...)` with `Map<String, V>` inference.

    #[test]
    fn infers_map_float_return_for_numeric_object_literal() {
        let src = r#"function weights() {
  return { left: 1, right: 2 }
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun weights(): Map<String, Float> {"), "{out}");
        assert!(
            out.contains("return mapOf(\"left\" to 1f, \"right\" to 2f)"),
            "{out}"
        );
    }

    #[test]
    fn infers_map_string_return_for_string_object_literal() {
        let src = r#"function labels() {
  return { primary: "alpha", secondary: "beta" }
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun labels(): Map<String, String> {"), "{out}");
        assert!(
            out.contains("return mapOf(\"primary\" to \"alpha\", \"secondary\" to \"beta\")"),
            "{out}"
        );
    }

    #[test]
    fn infers_nested_map_for_object_of_objects() {
        let src = r#"function grid() {
  return { row: { x: 1 } }
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("fun grid(): Map<String, Map<String, Float>> {"),
            "{out}"
        );
        assert!(
            out.contains("return mapOf(\"row\" to mapOf(\"x\" to 1f))"),
            "{out}"
        );
    }

    #[test]
    fn infers_map_struct_return_for_struct_object_literal() {
        let src = r#"struct Vec3 { x, y, z }
function points() {
  return { start: Vec3(1, 2, 3) }
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun points(): Map<String, Vec3> {"), "{out}");
        assert!(
            out.contains("return mapOf(\"start\" to Vec3(1f, 2f, 3f))"),
            "{out}"
        );
    }

    #[test]
    fn infers_map_return_for_bare_identifier_map_local() {
        let src = r#"function make() {
  let lookup = { a: 1, b: 2 }
  return lookup
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun make(): Map<String, Float> {"), "{out}");
        assert!(
            out.contains("val lookup = mapOf(\"a\" to 1f, \"b\" to 2f)"),
            "{out}"
        );
        assert!(out.contains("return lookup"), "{out}");
    }

    #[test]
    fn empty_object_return_defaults_to_map_float() {
        let src = r#"function none() {
  return {}
}"#;
        let out = kotlin(src);
        assert!(out.contains("fun none(): Map<String, Float> {"), "{out}");
        assert!(out.contains("return mapOf()"), "{out}");
    }

    #[test]
    fn struct_field_typed_map_from_object_ctor_arg() {
        let src = r#"struct Bag { attrs }
function mk() {
  return Bag({ label: "alpha", alt: "beta" })
}"#;
        let out = kotlin(src);
        assert!(
            out.contains("data class Bag(val attrs: Map<String, String>)"),
            "{out}"
        );
        assert!(
            out.contains("return Bag(mapOf(\"label\" to \"alpha\", \"alt\" to \"beta\"))"),
            "{out}"
        );
    }

    // ===== import resolution (task_1783070734198_xa40) =====
    //
    // The `.hs` grammar parses `import { a, b } from "./file.hs"` into a real `Import` AST node
    // (parser.rs `parse_import`), but prior to this fix `emit_functions`'s top-level loop only
    // ever matched `AstNode::Function` — every other node, including `Import`, was silently
    // skipped. A two-file program (a helper `.hs` defining a function, and a caller `.hs`
    // importing and calling it) would compile the caller alone into Kotlin that calls an
    // undefined symbol, with zero diagnostic. These tests exercise the caller-side-inlining
    // contract described on `emit_functions`: concatenate the helper's source ahead of the
    // caller's source into one string; a resolved import is then a no-op, and an unresolved one
    // fails loudly instead of vanishing.

    #[test]
    fn resolved_import_is_a_no_op_and_both_functions_emit() {
        // Simulates the caller-side inlining contract: the "helper.hs" module's source is
        // concatenated ahead of the "caller.hs" module's source into one compilation unit.
        let helper_src = r#"function helper(x) {
  return x
}"#;
        let caller_src = r#"import { helper } from "./helper.hs"

function main(x) {
  return helper(x)
}"#;
        let combined = format!("{}\n\n{}", helper_src, caller_src);
        let out = kotlin(&combined);
        // Both functions are emitted; the import itself produces no Kotlin output.
        assert!(out.contains("fun helper(x: String): String {"), "{out}");
        assert!(out.contains("fun main(x: String): String {"), "{out}");
        assert!(out.contains("return helper(x)"), "{out}");
        assert!(!out.contains("import"), "{out}");
    }

    #[test]
    fn import_inlined_duplicate_function_fails_with_both_locations() {
        let helper_src = r#"function getValue() {
  return 100
}"#;
        let caller_src = r#"import { getValue } from "./helper.hs"

function getValue() {
  return 5
}

function main() {
  return getValue()
}"#;
        let combined = format!("{}\n\n{}", helper_src, caller_src);

        let detail: serde_json::Value =
            serde_json::from_str(&crate::validate_detailed(&combined)).expect("valid JSON");
        assert_eq!(detail["valid"], false, "{detail}");
        let validation_msg = detail["errors"][0]["message"]
            .as_str()
            .expect("message string");
        assert!(
            validation_msg.contains("duplicate top-level declaration `getValue`"),
            "{validation_msg}"
        );
        assert!(
            validation_msg.contains("function at line 7, column 1"),
            "{validation_msg}"
        );
        assert!(
            validation_msg.contains("function at line 1, column 1"),
            "{validation_msg}"
        );

        let result = compile_source_to_kotlin(&combined, "  ");
        assert!(
            result.is_err(),
            "expected duplicate declaration to fail emit"
        );
        let emit_msg = result.unwrap_err().message;
        assert!(emit_msg.contains("getValue"), "{emit_msg}");
        assert!(emit_msg.contains("line 7, column 1"), "{emit_msg}");
        assert!(emit_msg.contains("line 1, column 1"), "{emit_msg}");
    }

    #[test]
    fn resolved_import_of_struct_specifier() {
        let combined = r#"struct Vec3 { x, y, z }
import { Vec3 } from "./vec3.hs"

function origin() {
  return Vec3(0, 0, 0)
}"#;
        let out = kotlin(combined);
        assert!(out.contains("data class Vec3("), "{out}");
        assert!(out.contains("fun origin()"), "{out}");
    }

    #[test]
    fn unresolved_import_fails_loudly_instead_of_silently_dropping() {
        // The helper's source was NEVER concatenated in — this is exactly the prior silent-drop
        // bug's trigger. It must now fail the compile instead of emitting a call to an undefined
        // `helper` symbol with no diagnostic.
        let caller_only_src = r#"import { helper } from "./helper.hs"

function main(x) {
  return helper(x)
}"#;
        let result = compile_source_to_kotlin(caller_only_src, "  ");
        assert!(result.is_err(), "expected unresolved import to fail emit");
        let msg = result.unwrap_err().message;
        assert!(msg.contains("unresolved import"), "{msg}");
        assert!(msg.contains("helper"), "{msg}");
        assert!(msg.contains("./helper.hs"), "{msg}");
    }

    #[test]
    fn unresolved_import_reports_the_correct_missing_specifier_among_several() {
        let src = r#"function helper(x) {
  return x
}
import { helper, missingFn } from "./mixed.hs"

function main(x) {
  return helper(x)
}"#;
        let result = compile_source_to_kotlin(src, "  ");
        assert!(result.is_err(), "one unresolved specifier must still fail");
        let msg = result.unwrap_err().message;
        assert!(msg.contains("missingFn"), "{msg}");
    }

    #[test]
    fn import_alias_specifier_resolves_by_imported_name_not_local_alias() {
        // `import { helper as h } from "./helper.hs"` — resolution is keyed on the ORIGINAL
        // exported name (`ImportSpecifier.imported`, "helper"), not the local alias ("h"),
        // matching how `parse_import` records both fields (ast.rs `ImportSpecifier`). So this
        // import resolves (the `helper` function is declared in-unit) and compilation succeeds.
        //
        // NOTE — scope boundary: resolution is the only contract this fix adds. Rewriting call
        // sites from a local alias to the declared name is a SEPARATE, not-yet-built concern (the
        // emitter has no identifier-rewrite pass), so `main`'s body still emits a literal `h(x)`
        // call, which would not compile as real Kotlin. That gap is pre-existing and out of scope
        // for task_1783070734198_xa40 (whose contract is "resolve or fail loudly", not "alias
        // rewriting"); this test only asserts the resolution half doesn't false-positive-reject.
        let combined = r#"function helper(x) {
  return x
}
import { helper as h } from "./helper.hs"

function main(x) {
  return helper(x)
}"#;
        let out = kotlin(combined);
        assert!(out.contains("fun helper(x: String): String {"), "{out}");
        assert!(out.contains("fun main(x: String): String {"), "{out}");
    }
}
