//! Conservative semantic type evidence for explicit `.hs` contracts.
//!
//! The structural parser intentionally continues to admit legacy untyped functions. This pass
//! only rejects a program when the source provides an explicit type boundary and the AST carries
//! enough evidence to prove that the value crossing it is incompatible. Unknown evidence remains
//! admissible; a known mismatch never reaches a target emitter.

use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};

use crate::ast::{Ast, AstNode, FunctionNode, Location, MovementDestination};
use crate::kotlin_emit::SemanticDiagnostic;

const RETURN_MISMATCH: &str = "HS-TYPE-RETURN-001";
const ASSIGNMENT_MISMATCH: &str = "HS-TYPE-ASSIGN-001";
const ARGUMENT_MISMATCH: &str = "HS-TYPE-ARG-001";
const LOGICAL_MISMATCH: &str = "HS-TYPE-LOGICAL-001";

// Names, calls and returns in functions that declare a type (proposals/HS_Checker_Names_Calls_Returns_v1.md).
const UNKNOWN_NAME: &str = "HS-NAME-001";
const UNKNOWN_FUNCTION: &str = "HS-NAME-002";
const ARITY_MISMATCH: &str = "HS-ARITY-001";
const MISSING_RETURN: &str = "HS-RETURN-002";
const HIDDEN_NAME: &str = "HS-SCOPE-001";

/// Built-in functions the native backend lowers by name (the UAAL backend lowers the memory ones).
/// The Kotlin backend's math built-ins come from its own table (`kotlin_emit::is_kotlin_builtin`).
const BUILTINS: &[&str] = &[
    "load",
    "store",
    "move",
    "drop",
    "buffer",
    "known",
    "unknown",
    "isKnown",
    "unknownReason",
    "slice_length",
    "u8_to_i32",
    "i32_to_u8",
];

/// Declarations of a surrounding document when one function is checked on its own, as the
/// `.hsplus` reader does.
#[derive(Debug, Default, Clone)]
pub(crate) struct ExternalDeclarations {
    /// Function name -> number of parameters, or `None` when the document does not say.
    pub(crate) functions: HashMap<String, Option<usize>>,
    /// Other names the document declares that may be called: structs and imports.
    pub(crate) names: HashSet<String>,
    /// Names that are read only through their members and never called: enums (`Route.A`) and
    /// `.hsplus` modules (`GameState.addScore(p)`).
    pub(crate) namespaces: HashSet<String>,
}

/// True when every path through `body` ends in `return <value>` and no `return` in it is bare.
/// The checker and the UAAL emitter share this one definition.
pub(crate) fn definitely_returns_value(body: &[AstNode]) -> bool {
    ends_in_value_return(body) && every_return_has_value(body)
}

/// The end of `body` is unreachable except through `return <value>`: the last statement returns
/// a value, is an `if`/`else` whose branches both do, or is a block that does. A loop never counts,
/// because its body may not run. Trailing comments are ignored. The native backend uses the same
/// rule.
fn ends_in_value_return(body: &[AstNode]) -> bool {
    match body
        .iter()
        .rev()
        .find(|node| !matches!(node, AstNode::Comment(_)))
    {
        Some(AstNode::Return(ret)) => ret.argument.is_some(),
        Some(AstNode::If(if_node)) => {
            ends_in_value_return(&if_node.consequent)
                && if_node
                    .alternate
                    .as_deref()
                    .is_some_and(ends_in_value_return)
        }
        Some(AstNode::LexicalScope(scope)) => ends_in_value_return(&scope.body),
        _ => false,
    }
}

fn every_return_has_value(body: &[AstNode]) -> bool {
    body.iter().all(|node| match node {
        AstNode::Return(ret) => ret.argument.is_some(),
        AstNode::If(if_node) => {
            every_return_has_value(&if_node.consequent)
                && if_node
                    .alternate
                    .as_deref()
                    .is_none_or(every_return_has_value)
        }
        AstNode::While(while_node) => every_return_has_value(&while_node.body),
        _ => true,
    })
}

#[derive(Debug, Clone, PartialEq)]
enum TypeEvidence {
    Known(String),
    IntegerLiteral(f64),
    FloatLiteral,
    Null,
    Unknown,
}

impl TypeEvidence {
    fn display_name(&self) -> &str {
        match self {
            TypeEvidence::Known(name) => name,
            TypeEvidence::IntegerLiteral(_) => "integer literal",
            TypeEvidence::FloatLiteral => "floating-point literal",
            TypeEvidence::Null => "null",
            TypeEvidence::Unknown => "unknown",
        }
    }
}

#[derive(Debug, Clone)]
struct FunctionSignature {
    param_types: Vec<Option<String>>,
    return_type: Option<String>,
}

/// Not `Clone` on purpose: a lambda's body sees the frames around it on the one shared stack.
/// Copying them for each lambda made checking time grow with lambdas x visible names (the second
/// review of PR #438 measured 18 s for 6,000 of each, against 0.15 s before G11);
/// `checking_cost_grows_linearly_with_lambdas_and_locals` bounds it.
#[derive(Debug)]
struct BindingEvidence {
    declared_type: Option<String>,
    observed_type: TypeEvidence,
    mutable: bool,
    /// Every value the binding has held is a lambda, so it may be called. Parameters and other
    /// locals may not: the backends resolve a called name to a function, never to a value.
    callable: bool,
}

/// The names one block declares. A function's visible names are a stack of these, innermost
/// last.
type Frame = HashMap<String, BindingEvidence>;

struct TypeChecker {
    functions: HashMap<String, FunctionSignature>,
    /// Top-level names a typed function may refer to: functions, structs, enums, imports, and the
    /// surrounding document's functions, names and namespaces.
    values: HashSet<String>,
    /// The names in `values` that may be called: everything but enums and namespaces, which are
    /// read through their members.
    callables: HashSet<String>,
    /// Parameter counts of functions declared in this program or its surrounding document.
    arities: HashMap<String, usize>,
    /// Field counts of structs declared in this program: a constructor takes one value per field.
    struct_fields: HashMap<String, usize>,
    /// Set while checking a function that declares a parameter or return type.
    strict: Cell<bool>,
    /// The function being checked, for messages.
    function_name: RefCell<String>,
}

pub(crate) fn check_explicit_type_contracts_with(
    ast: &Ast,
    external: &ExternalDeclarations,
) -> Result<(), SemanticDiagnostic> {
    let mut callables = external
        .functions
        .keys()
        .chain(external.names.iter())
        .cloned()
        .collect::<HashSet<_>>();
    let mut values = callables
        .iter()
        .chain(external.namespaces.iter())
        .cloned()
        .collect::<HashSet<_>>();
    let mut struct_fields = HashMap::new();
    let mut arities = external
        .functions
        .iter()
        .filter_map(|(name, arity)| arity.map(|arity| (name.clone(), arity)))
        .collect::<HashMap<_, _>>();
    for node in &ast.body {
        let declaration = match node {
            AstNode::Export(export) => export.declaration.as_ref(),
            other => other,
        };
        match declaration {
            AstNode::Function(function) => {
                values.insert(function.name.clone());
                callables.insert(function.name.clone());
                arities.insert(function.name.clone(), function.params.len());
            }
            AstNode::StructDeclaration(structure) => {
                values.insert(structure.name.clone());
                callables.insert(structure.name.clone());
                struct_fields.insert(structure.name.clone(), structure.fields.len());
            }
            AstNode::EnumDeclaration(enumeration) => {
                // Read through its members (`Route.A`); neither backend calls an enum.
                values.insert(enumeration.name.clone());
            }
            AstNode::Import(import) => {
                for specifier in &import.specifiers {
                    values.insert(specifier.local.clone());
                    callables.insert(specifier.local.clone());
                }
            }
            _ => {}
        }
    }

    let mut functions = HashMap::new();
    for node in &ast.body {
        let function = match node {
            AstNode::Function(function) => Some(function),
            AstNode::Export(export) => match export.declaration.as_ref() {
                AstNode::Function(function) => Some(function),
                _ => None,
            },
            _ => None,
        };
        let Some(function) = function else {
            continue;
        };
        let param_types = if function.param_types.is_empty() {
            vec![None; function.params.len()]
        } else {
            function
                .param_types
                .iter()
                .map(|annotation| annotation.as_deref().map(normalize_type))
                .collect()
        };
        functions.insert(
            function.name.clone(),
            FunctionSignature {
                param_types,
                return_type: function.return_type.as_deref().map(normalize_type),
            },
        );
    }

    let checker = TypeChecker {
        functions,
        values,
        callables,
        arities,
        struct_fields,
        strict: Cell::new(false),
        function_name: RefCell::new(String::new()),
    };
    for node in &ast.body {
        match node {
            AstNode::Function(function) => checker.check_function(function)?,
            AstNode::Export(export) => {
                if let AstNode::Function(function) = export.declaration.as_ref() {
                    checker.check_function(function)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

impl TypeChecker {
    fn check_function(&self, function: &FunctionNode) -> Result<(), SemanticDiagnostic> {
        // Names, calls, arity, hiding and every-path return are checked only in functions that
        // state a type. Untyped legacy functions keep their earlier reading.
        let strict = function.return_type.is_some()
            || function.param_types.iter().any(|annotation| annotation.is_some());
        self.strict.set(strict);
        *self.function_name.borrow_mut() = function.name.clone();
        if strict {
            let mut seen = HashSet::new();
            for (index, parameter) in function.params.iter().enumerate() {
                if !seen.insert(parameter.as_str()) {
                    // At the second occurrence, where the name is written again.
                    let at = match function.param_locs.get(index) {
                        Some(loc) => Some(loc.clone()),
                        None => function.loc.clone(),
                    };
                    return Err(diagnostic(
                        format!(
                            "[{HIDDEN_NAME}] function `{}` names parameter `{parameter}` twice; each parameter needs its own name",
                            function.name
                        ),
                        &at,
                    ));
                }
            }
        }
        let mut function_scope = Frame::new();
        for (index, parameter) in function.params.iter().enumerate() {
            let declared_type = function
                .param_types
                .get(index)
                .and_then(|annotation| annotation.as_deref())
                .map(normalize_type);
            let observed_type = declared_type
                .as_ref()
                .map(|annotation| TypeEvidence::Known(annotation.clone()))
                .unwrap_or(TypeEvidence::Unknown);
            function_scope.insert(
                parameter.clone(),
                BindingEvidence {
                    declared_type,
                    observed_type,
                    mutable: false,
                    callable: false,
                },
            );
        }

        let mut scopes = vec![function_scope];
        let expected_return = function.return_type.as_deref().map(normalize_type);
        self.check_body(
            &function.body,
            &function.name,
            expected_return.as_deref(),
            &mut scopes,
        )?;
        if let Some(return_type) = expected_return
            .as_deref()
            .filter(|annotation| !annotation.is_empty() && *annotation != "void")
        {
            if !definitely_returns_value(&function.body) {
                return Err(diagnostic(
                    format!(
                        "[{MISSING_RETURN}] function `{}` declares `{return_type}` but can finish without returning a value; every path must end in `return <value>`",
                        function.name
                    ),
                    &function.loc,
                ));
            }
        }
        Ok(())
    }

    fn check_body(
        &self,
        body: &[AstNode],
        function_name: &str,
        expected_return: Option<&str>,
        scopes: &mut Vec<Frame>,
    ) -> Result<(), SemanticDiagnostic> {
        for node in body {
            self.check_statement(node, function_name, expected_return, scopes)?;
        }
        Ok(())
    }

    fn check_statement(
        &self,
        node: &AstNode,
        function_name: &str,
        expected_return: Option<&str>,
        scopes: &mut Vec<Frame>,
    ) -> Result<(), SemanticDiagnostic> {
        match node {
            AstNode::Return(ret) => {
                let actual = match &ret.argument {
                    Some(argument) => self.infer_expression(argument, scopes)?,
                    None => TypeEvidence::Known("void".to_string()),
                };
                if let Some(expected) = expected_return {
                    if !is_assignable(expected, &actual) {
                        return Err(diagnostic(
                            format!(
                                "[{RETURN_MISMATCH}] return type mismatch in function `{function_name}`: expected `{expected}`, found `{}`",
                                actual.display_name()
                            ),
                            &ret.loc,
                        ));
                    }
                }
            }
            AstNode::VariableDeclaration(variable) => {
                let actual = self.infer_expression(&variable.value, scopes)?;
                self.require_fresh_name(&variable.name, scopes, &variable.loc)?;
                let declared_type = variable.type_annotation.as_deref().map(normalize_type);
                if let Some(expected) = declared_type.as_deref() {
                    self.require_binding_type(
                        &variable.name,
                        "initializer",
                        expected,
                        &actual,
                        &variable.loc,
                    )?;
                }
                let observed_type = declared_type
                    .as_ref()
                    .map(|annotation| TypeEvidence::Known(annotation.clone()))
                    .unwrap_or(actual);
                if let Some(scope) = scopes.last_mut() {
                    scope.insert(
                        variable.name.clone(),
                        BindingEvidence {
                            declared_type,
                            observed_type,
                            mutable: variable.mutable,
                            callable: matches!(
                                variable.value.as_ref(),
                                AstNode::LambdaExpression(_)
                            ),
                        },
                    );
                }
            }
            AstNode::StackSlotDeclaration(slot) => {
                let actual = self.infer_expression(&slot.value, scopes)?;
                self.require_fresh_name(&slot.name, scopes, &slot.loc)?;
                let declared_type = normalize_type(&slot.type_annotation);
                self.require_binding_type(
                    &slot.name,
                    "initializer",
                    &declared_type,
                    &actual,
                    &slot.loc,
                )?;
                if let Some(scope) = scopes.last_mut() {
                    scope.insert(
                        slot.name.clone(),
                        BindingEvidence {
                            observed_type: TypeEvidence::Known(declared_type.clone()),
                            declared_type: Some(declared_type),
                            mutable: true,
                            callable: false,
                        },
                    );
                }
            }
            AstNode::Assignment(assignment) => {
                let actual = self.infer_expression(&assignment.value, scopes)?;
                if self.strict.get() {
                    self.infer_expression(&assignment.target, scopes)?;
                }
                if let AstNode::Identifier(identifier) = assignment.target.as_ref() {
                    if let Some(binding) = lookup_binding_mut(scopes, &identifier.name) {
                        if let Some(expected) = binding.declared_type.as_deref() {
                            self.require_binding_type(
                                &identifier.name,
                                "assignment",
                                expected,
                                &actual,
                                &assignment.loc,
                            )?;
                        } else if binding.mutable {
                            // An untyped mutable binding has no stable contract after a write.
                            binding.observed_type = TypeEvidence::Unknown;
                        }
                        // After `g = 5` the local holds a value. The checker does not follow
                        // branches, so a local stays callable only while every value it was
                        // given is a lambda.
                        binding.callable = binding.callable
                            && matches!(assignment.value.as_ref(), AstNode::LambdaExpression(_));
                    }
                }
            }
            AstNode::MovementStatement(movement) if self.strict.get() => {
                // `move <target> to <entity>` names two things. A target left out is `self`.
                if movement.target != "self" {
                    self.require_name(&movement.target, scopes, &movement.loc)?;
                }
                if let MovementDestination::EntityId(entity) = &movement.destination {
                    self.require_name(entity, scopes, &movement.loc)?;
                }
            }
            AstNode::CallExpression(_) => {
                self.infer_expression(node, scopes)?;
            }
            AstNode::If(if_node) => {
                self.infer_expression(&if_node.test, scopes)?;
                scopes.push(HashMap::new());
                self.check_body(&if_node.consequent, function_name, expected_return, scopes)?;
                scopes.pop();
                if let Some(alternate) = &if_node.alternate {
                    scopes.push(HashMap::new());
                    self.check_body(alternate, function_name, expected_return, scopes)?;
                    scopes.pop();
                }
            }
            AstNode::While(while_node) => {
                self.infer_expression(&while_node.test, scopes)?;
                scopes.push(HashMap::new());
                self.check_body(&while_node.body, function_name, expected_return, scopes)?;
                scopes.pop();
            }
            AstNode::ForOf(for_node) => {
                self.infer_expression(&for_node.range, scopes)?;
                self.require_fresh_name(&for_node.var_name, scopes, &for_node.loc)?;
                scopes.push(HashMap::from([(
                    for_node.var_name.clone(),
                    BindingEvidence {
                        declared_type: None,
                        observed_type: TypeEvidence::Unknown,
                        mutable: false,
                        callable: false,
                    },
                )]));
                self.check_body(&for_node.body, function_name, expected_return, scopes)?;
                scopes.pop();
            }
            AstNode::For(for_node) => {
                scopes.push(HashMap::new());
                if let Some(init) = &for_node.init {
                    self.check_statement(init, function_name, expected_return, scopes)?;
                }
                if let Some(test) = &for_node.test {
                    self.infer_expression(test, scopes)?;
                }
                if let Some(update) = &for_node.update {
                    self.check_statement(update, function_name, expected_return, scopes)?;
                }
                self.check_body(&for_node.body, function_name, expected_return, scopes)?;
                scopes.pop();
            }
            AstNode::LexicalScope(scope) => {
                scopes.push(HashMap::new());
                self.check_body(&scope.body, function_name, expected_return, scopes)?;
                scopes.pop();
            }
            AstNode::Comment(_) => {}
            other => {
                // Expression-shaped statements can still contain typed calls. Structural and
                // target-specific statements stay outside this conservative pass.
                if matches!(
                    other,
                    AstNode::BinaryExpression(_)
                        | AstNode::UnaryExpression(_)
                        | AstNode::MemberExpression(_)
                        | AstNode::Identifier(_)
                ) || (self.strict.get()
                    && matches!(
                        other,
                        AstNode::Array(_)
                            | AstNode::ObjectLiteral(_)
                            | AstNode::LambdaExpression(_)
                            | AstNode::SpreadElement(_)
                    ))
                {
                    self.infer_expression(other, scopes)?;
                }
            }
        }
        Ok(())
    }

    /// `scopes` is mutable only so a lambda can put its parameters on top of it for its body;
    /// the stack is as it was when this returns `Ok`.
    fn infer_expression(
        &self,
        node: &AstNode,
        scopes: &mut Vec<Frame>,
    ) -> Result<TypeEvidence, SemanticDiagnostic> {
        match node {
            AstNode::String(_) => Ok(TypeEvidence::Known("string".to_string())),
            AstNode::Boolean(_) => Ok(TypeEvidence::Known("bool".to_string())),
            AstNode::Number(number) => {
                if number.value.fract() == 0.0 {
                    Ok(TypeEvidence::IntegerLiteral(number.value))
                } else {
                    Ok(TypeEvidence::FloatLiteral)
                }
            }
            AstNode::Null(_) => Ok(TypeEvidence::Null),
            AstNode::Identifier(identifier) => {
                if let Some(binding) = lookup_binding(scopes, &identifier.name) {
                    return Ok(binding.observed_type.clone());
                }
                if self.strict.get() && !self.is_program_name(&identifier.name) {
                    return Err(self.unknown_name(&identifier.name, &identifier.loc));
                }
                Ok(TypeEvidence::Unknown)
            }
            AstNode::CallExpression(call) => {
                let arguments = call
                    .arguments
                    .iter()
                    .map(|argument| self.infer_expression(argument, scopes))
                    .collect::<Result<Vec<_>, _>>()?;
                let AstNode::Identifier(callee) = call.callee.as_ref() else {
                    if self.strict.get() {
                        // `value.method(...)`: the receiver must resolve. The method name is not
                        // a program name, so it is not looked up.
                        self.infer_expression(&call.callee, scopes)?;
                    }
                    return Ok(TypeEvidence::Unknown);
                };
                let binding = lookup_binding(scopes, &callee.name);
                let callable_local = binding.is_some_and(|binding| binding.callable);
                if self.strict.get() && !callable_local {
                    if !self.is_callable_name(&callee.name) {
                        let what = if binding.is_some() {
                            format!(
                                "`{}` is a value, not a function, in function `{}`",
                                callee.name,
                                self.function_name.borrow()
                            )
                        } else if self.is_program_name(&callee.name) {
                            format!(
                                "`{}` is an enum or module, not a function, in function `{}`",
                                callee.name,
                                self.function_name.borrow()
                            )
                        } else {
                            format!(
                                "unknown function `{}` called in function `{}`",
                                callee.name,
                                self.function_name.borrow()
                            )
                        };
                        return Err(diagnostic(
                            format!(
                                "[{UNKNOWN_FUNCTION}] {what}; a called name must be a function or struct of this program, an import, a built-in, or a local holding a lambda"
                            ),
                            &call.loc,
                        ));
                    }
                    let got = call.arguments.len();
                    if let Some(&expected) = self.arities.get(&callee.name) {
                        if expected != got {
                            return Err(diagnostic(
                                format!(
                                    "[{ARITY_MISMATCH}] `{}` expects {expected} argument{}, got {got} (in function `{}`); HoloScript parameters have no defaults",
                                    callee.name,
                                    if expected == 1 { "" } else { "s" },
                                    self.function_name.borrow()
                                ),
                                &call.loc,
                            ));
                        }
                    } else if let Some(&fields) = self.struct_fields.get(&callee.name) {
                        if fields != got {
                            return Err(diagnostic(
                                format!(
                                    "[{ARITY_MISMATCH}] constructor `{}` takes one value per field ({fields}), got {got} (in function `{}`)",
                                    callee.name,
                                    self.function_name.borrow()
                                ),
                                &call.loc,
                            ));
                        }
                    }
                }
                let Some(signature) = self.functions.get(&callee.name) else {
                    return Ok(TypeEvidence::Unknown);
                };
                for (index, (argument, expected)) in arguments
                    .iter()
                    .zip(signature.param_types.iter())
                    .enumerate()
                {
                    let Some(expected) = expected.as_deref() else {
                        continue;
                    };
                    if !is_assignable_at(expected, argument, TypeBoundary::CallArgument) {
                        return Err(diagnostic(
                            format!(
                                "[{ARGUMENT_MISMATCH}] argument {} to `{}` has incompatible type: expected `{expected}`, found `{}`",
                                index + 1,
                                callee.name,
                                argument.display_name()
                            ),
                            &call.loc,
                        ));
                    }
                }
                Ok(signature
                    .return_type
                    .as_ref()
                    .map(|annotation| TypeEvidence::Known(annotation.clone()))
                    .unwrap_or(TypeEvidence::Unknown))
            }
            AstNode::BinaryExpression(binary) => {
                let left = self.infer_expression(&binary.left, scopes)?;
                let right = self.infer_expression(&binary.right, scopes)?;
                let evidence = match binary.operator.as_str() {
                    "&&" | "||" => {
                        self.require_logical_operand("left", &binary.operator, &left, &binary.loc)?;
                        self.require_logical_operand(
                            "right",
                            &binary.operator,
                            &right,
                            &binary.loc,
                        )?;
                        TypeEvidence::Known("bool".to_string())
                    }
                    "==" | "!=" | "<" | "<=" | ">" | ">=" => {
                        TypeEvidence::Known("bool".to_string())
                    }
                    "+" if is_string_evidence(&left) || is_string_evidence(&right) => {
                        TypeEvidence::Known("string".to_string())
                    }
                    "+" | "-" | "*" | "/" | "%" | "&" | "|" | "^" | "<<" | ">>" => {
                        numeric_result_evidence(&left, &right)
                    }
                    "??" => match left {
                        TypeEvidence::Unknown | TypeEvidence::Null => right,
                        known => known,
                    },
                    _ => TypeEvidence::Unknown,
                };
                Ok(evidence)
            }
            AstNode::UnaryExpression(unary) => {
                let argument = self.infer_expression(&unary.argument, scopes)?;
                Ok(match unary.operator.as_str() {
                    "!" => TypeEvidence::Known("bool".to_string()),
                    "-" | "+" => argument,
                    _ => TypeEvidence::Unknown,
                })
            }
            AstNode::MemberExpression(member) => {
                self.infer_expression(&member.object, scopes)?;
                if member.computed {
                    self.infer_expression(&member.property, scopes)?;
                }
                Ok(TypeEvidence::Unknown)
            }
            AstNode::Array(array) => {
                for element in &array.elements {
                    self.infer_expression(element, scopes)?;
                }
                Ok(TypeEvidence::Unknown)
            }
            AstNode::ObjectLiteral(object) => {
                for property in &object.properties {
                    self.infer_expression(&property.value, scopes)?;
                    if self.strict.get() {
                        if let Some(default) = &property.default_value {
                            // `{ k: 1 = fallback }`: the fallback is an expression too.
                            self.infer_expression(default, scopes)?;
                        }
                    }
                }
                Ok(TypeEvidence::Unknown)
            }
            AstNode::LambdaExpression(lambda) if self.strict.get() => {
                // The parameters get a frame on top of the shared stack for the body, which is
                // one expression and declares nothing, then the frame comes off. The frames
                // below are shared, not copied.
                scopes.push(
                    lambda
                        .params
                        .iter()
                        .map(|parameter| {
                            (
                                parameter.clone(),
                                BindingEvidence {
                                    declared_type: None,
                                    observed_type: TypeEvidence::Unknown,
                                    mutable: false,
                                    callable: false,
                                },
                            )
                        })
                        .collect(),
                );
                let body = self.infer_expression(&lambda.body, scopes);
                scopes.pop();
                body?;
                Ok(TypeEvidence::Unknown)
            }
            AstNode::SpreadElement(spread) if self.strict.get() => {
                self.infer_expression(&spread.argument, scopes)?;
                Ok(TypeEvidence::Unknown)
            }
            _ => Ok(TypeEvidence::Unknown),
        }
    }

    /// A top-level function, struct, enum or import of this program, a function, name or
    /// namespace of the surrounding document, or a built-in.
    fn is_program_name(&self, name: &str) -> bool {
        self.values.contains(name) || is_builtin(name)
    }

    /// A program name that may be called: not an enum or module.
    fn is_callable_name(&self, name: &str) -> bool {
        self.callables.contains(name) || is_builtin(name)
    }

    /// A bare name (not an expression node) must be visible: a `move` target or destination.
    fn require_name(
        &self,
        name: &str,
        scopes: &[Frame],
        loc: &Option<Location>,
    ) -> Result<(), SemanticDiagnostic> {
        if lookup_binding(scopes, name).is_some() || self.is_program_name(name) {
            return Ok(());
        }
        Err(self.unknown_name(name, loc))
    }

    fn unknown_name(&self, name: &str, loc: &Option<Location>) -> SemanticDiagnostic {
        let hint = match name {
            "break" | "continue" => {
                "; HoloScript has no `break` or `continue` statement: end the loop through its condition"
            }
            _ => "; a name must be a parameter, a local declared earlier in this block or an enclosing one, a top-level function, struct, enum or import, or a built-in",
        };
        diagnostic(
            format!(
                "[{UNKNOWN_NAME}] unknown name `{name}` in function `{}`{hint}",
                self.function_name.borrow()
            ),
            loc,
        )
    }

    /// A declaration may not reuse a name that is still visible, from its own block or an
    /// enclosing one. Sibling blocks may reuse a name, because a block's locals end with it.
    fn require_fresh_name(
        &self,
        name: &str,
        scopes: &[Frame],
        loc: &Option<Location>,
    ) -> Result<(), SemanticDiagnostic> {
        if !self.strict.get() || lookup_binding(scopes, name).is_none() {
            return Ok(());
        }
        Err(diagnostic(
            format!(
                "[{HIDDEN_NAME}] `{name}` is declared in function `{}` while an earlier `{name}` is still visible; give it a new name (a name may be reused only in a sibling block)",
                self.function_name.borrow()
            ),
            loc,
        ))
    }

    fn require_binding_type(
        &self,
        binding_name: &str,
        operation: &str,
        expected: &str,
        actual: &TypeEvidence,
        loc: &Option<Location>,
    ) -> Result<(), SemanticDiagnostic> {
        if is_assignable(expected, actual) {
            return Ok(());
        }
        Err(diagnostic(
            format!(
                "[{ASSIGNMENT_MISMATCH}] {operation} type mismatch for binding `{binding_name}`: expected `{expected}`, found `{}`",
                actual.display_name()
            ),
            loc,
        ))
    }

    fn require_logical_operand(
        &self,
        side: &str,
        operator: &str,
        actual: &TypeEvidence,
        loc: &Option<Location>,
    ) -> Result<(), SemanticDiagnostic> {
        if is_assignable("bool", actual) {
            return Ok(());
        }
        Err(diagnostic(
            format!(
                "[{LOGICAL_MISMATCH}] {side} operand of logical operator `{operator}` must be `bool`, found `{}`",
                actual.display_name()
            ),
            loc,
        ))
    }
}

fn normalize_type(annotation: &str) -> String {
    match annotation.trim() {
        "Boolean" => "bool".to_string(),
        "String" | "str" => "string".to_string(),
        "unit" | "()" => "void".to_string(),
        other => other.to_string(),
    }
}

/// Where two types are being compared. Call arguments additionally allow a
/// mutable reference to satisfy a shared reference (read-only downgrade).
#[derive(Clone, Copy, PartialEq, Eq)]
enum TypeBoundary {
    Assignment,
    CallArgument,
}

fn is_assignable(expected: &str, actual: &TypeEvidence) -> bool {
    is_assignable_at(expected, actual, TypeBoundary::Assignment)
}

fn is_assignable_at(expected: &str, actual: &TypeEvidence, boundary: TypeBoundary) -> bool {
    let expected = normalize_type(expected);
    if matches!(expected.as_str(), "any" | "unknown") {
        return true;
    }

    match actual {
        TypeEvidence::Unknown => true,
        TypeEvidence::Null => {
            matches!(
                expected.as_str(),
                "null" | "Orb" | "Entity" | "Composition" | "World" | "Template" | "Group"
            ) || expected.starts_with('&')
                || expected.starts_with("Object")
                || expected.starts_with('[')
        }
        TypeEvidence::Known(actual) => {
            let actual = normalize_type(actual);
            actual == "any"
                || actual == "unknown"
                || expected == actual
                || (expected == "number" && is_numeric_type(&actual))
                || references_assignable(&expected, &actual, boundary)
        }
        TypeEvidence::IntegerLiteral(value) => match expected.as_str() {
            "i8" => *value >= i8::MIN as f64 && *value <= i8::MAX as f64,
            "i16" => *value >= i16::MIN as f64 && *value <= i16::MAX as f64,
            "i32" => *value >= i32::MIN as f64 && *value <= i32::MAX as f64,
            "i64" | "isize" => true,
            "u8" => *value >= 0.0 && *value <= u8::MAX as f64,
            "u16" => *value >= 0.0 && *value <= u16::MAX as f64,
            "u32" => *value >= 0.0 && *value <= u32::MAX as f64,
            "u64" | "usize" => *value >= 0.0,
            "f32" | "f64" | "number" => true,
            _ => false,
        },
        TypeEvidence::FloatLiteral => {
            matches!(expected.as_str(), "f32" | "f64" | "number")
        }
    }
}

/// A reference as the checker stores it: `&[T]`, `&mut T`, `&'a T`, `&'a mut [T]`.
/// Lifetimes are not a separate lattice. They exist only inside this string, so two
/// different names are never unified.
struct ReferenceShape {
    lifetime: Option<String>,
    mutable: bool,
    pointee: String,
}

fn parse_reference_type(annotation: &str) -> Option<ReferenceShape> {
    let rest = annotation.strip_prefix('&')?;
    if let Some(after_tick) = rest.strip_prefix('\'') {
        let (lifetime, after_lifetime) = after_tick.split_once(' ')?;
        if lifetime.is_empty()
            || !lifetime
                .chars()
                .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
        {
            return None;
        }
        if let Some(pointee) = after_lifetime.strip_prefix("mut ") {
            if pointee.is_empty() {
                return None;
            }
            return Some(ReferenceShape {
                lifetime: Some(lifetime.to_string()),
                mutable: true,
                pointee: pointee.to_string(),
            });
        }
        if after_lifetime.is_empty() {
            return None;
        }
        return Some(ReferenceShape {
            lifetime: Some(lifetime.to_string()),
            mutable: false,
            pointee: after_lifetime.to_string(),
        });
    }
    if let Some(pointee) = rest.strip_prefix("mut ") {
        if pointee.is_empty() {
            return None;
        }
        return Some(ReferenceShape {
            lifetime: None,
            mutable: true,
            pointee: pointee.to_string(),
        });
    }
    if rest.is_empty() {
        return None;
    }
    Some(ReferenceShape {
        lifetime: None,
        mutable: false,
        pointee: rest.to_string(),
    })
}

/// An unwritten lifetime matches the same reference written with one named lifetime.
/// `'a` does not match `'b`.
fn lifetimes_compatible(expected: &Option<String>, actual: &Option<String>) -> bool {
    match (expected, actual) {
        (Some(expected_name), Some(actual_name)) => expected_name == actual_name,
        _ => true,
    }
}

fn references_assignable(expected: &str, actual: &str, boundary: TypeBoundary) -> bool {
    let Some(expected_ref) = parse_reference_type(expected) else {
        return false;
    };
    let Some(actual_ref) = parse_reference_type(actual) else {
        return false;
    };
    if expected_ref.pointee != actual_ref.pointee {
        return false;
    }
    if !lifetimes_compatible(&expected_ref.lifetime, &actual_ref.lifetime) {
        return false;
    }
    if expected_ref.mutable == actual_ref.mutable {
        return true;
    }
    // Read-only downgrade is a call-argument rule only. `&mut T` may be passed
    // where `&T` is expected. The reverse stays a mismatch, including on `let`.
    boundary == TypeBoundary::CallArgument && !expected_ref.mutable && actual_ref.mutable
}

fn numeric_result_evidence(left: &TypeEvidence, right: &TypeEvidence) -> TypeEvidence {
    match (left, right) {
        (TypeEvidence::Known(left), TypeEvidence::Known(right))
            if left == right && is_numeric_type(left) =>
        {
            TypeEvidence::Known(left.clone())
        }
        (TypeEvidence::Known(known), TypeEvidence::IntegerLiteral(_))
        | (TypeEvidence::IntegerLiteral(_), TypeEvidence::Known(known))
            if is_numeric_type(known) =>
        {
            TypeEvidence::Known(known.clone())
        }
        (TypeEvidence::Known(known), TypeEvidence::FloatLiteral)
        | (TypeEvidence::FloatLiteral, TypeEvidence::Known(known))
            if matches!(known.as_str(), "f32" | "f64" | "number") =>
        {
            TypeEvidence::Known(known.clone())
        }
        (TypeEvidence::IntegerLiteral(_), TypeEvidence::IntegerLiteral(_)) => {
            TypeEvidence::IntegerLiteral(0.0)
        }
        (TypeEvidence::IntegerLiteral(_), TypeEvidence::FloatLiteral)
        | (TypeEvidence::FloatLiteral, TypeEvidence::IntegerLiteral(_))
        | (TypeEvidence::FloatLiteral, TypeEvidence::FloatLiteral) => TypeEvidence::FloatLiteral,
        _ => TypeEvidence::Unknown,
    }
}

fn is_numeric_type(annotation: &str) -> bool {
    matches!(
        annotation,
        "i8" | "i16"
            | "i32"
            | "i64"
            | "isize"
            | "u8"
            | "u16"
            | "u32"
            | "u64"
            | "usize"
            | "f32"
            | "f64"
            | "number"
    )
}

fn is_string_evidence(evidence: &TypeEvidence) -> bool {
    matches!(evidence, TypeEvidence::Known(name) if name == "string")
}

fn is_builtin(name: &str) -> bool {
    BUILTINS.contains(&name) || crate::kotlin_emit::is_kotlin_builtin(name)
}

fn lookup_binding<'a>(scopes: &'a [Frame], name: &str) -> Option<&'a BindingEvidence> {
    scopes.iter().rev().find_map(|scope| scope.get(name))
}

fn lookup_binding_mut<'a>(
    scopes: &'a mut [Frame],
    name: &str,
) -> Option<&'a mut BindingEvidence> {
    scopes
        .iter_mut()
        .rev()
        .find_map(|scope| scope.get_mut(name))
}

fn diagnostic(message: String, loc: &Option<Location>) -> SemanticDiagnostic {
    let (line, column) = loc
        .as_ref()
        .map(|location| (location.start.line, location.start.column))
        .unwrap_or((0, 0));
    SemanticDiagnostic {
        message,
        line,
        column,
    }
}

#[cfg(test)]
mod tests {
    use super::ARGUMENT_MISMATCH;
    use super::ASSIGNMENT_MISMATCH;
    use super::{
        ExternalDeclarations, ARITY_MISMATCH, HIDDEN_NAME, MISSING_RETURN, RETURN_MISMATCH,
        UNKNOWN_FUNCTION, UNKNOWN_NAME,
    };
    use crate::kotlin_emit::{check_semantics, check_semantics_with};
    use crate::parse_ast;

    fn admit(source: &str) {
        let ast = parse_ast(source).expect("fixture should parse");
        check_semantics(&ast)
            .unwrap_or_else(|error| panic!("expected admission, got {}", error.message));
    }

    fn reject(source: &str) -> String {
        let ast = parse_ast(source).expect("fixture should parse");
        check_semantics(&ast)
            .expect_err("expected a checker rejection")
            .message
    }

    #[test]
    fn elided_lifetime_reference_matches_named_lifetime_on_let() {
        admit(
            r#"struct Packet { code: i32 }
function borrow<'a>(packet: &'a Packet): &'a Packet { return packet }
function main(): i32 {
  slot packet: Packet = Packet(1)
  let view: &Packet = borrow(&packet)
  return 1
}"#,
        );
    }

    #[test]
    fn elided_lifetime_slice_reference_matches_named_lifetime_on_let() {
        admit(
            r#"function borrow<'a>(values: &'a [i32]): &'a [i32] { return values }
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  let view: &[i32] = borrow(&values[1..4])
  return 1
}"#,
        );
    }

    #[test]
    fn elided_lifetime_mut_reference_matches_named_lifetime_on_let() {
        admit(
            r#"function borrow_mut<'a>(values: &'a mut [i32]): &'a mut [i32] { return values }
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  let writer: &mut [i32] = borrow_mut(&mut values[1..4])
  return 1
}"#,
        );
    }

    #[test]
    fn elided_lifetime_matches_named_lifetime_on_later_assignment() {
        admit(
            r#"function borrow<'a>(values: &'a [i32]): &'a [i32] { return values }
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  var view: &[i32] = borrow(&values[1..4])
  view = borrow(&values[1..4])
  return 1
}"#,
        );
    }

    #[test]
    fn call_argument_accepts_mut_reference_where_shared_is_expected() {
        admit(
            r#"struct Packet { code: i32 }
function read(packet: &Packet): i32 { return 1 }
function main(): i32 {
  slot packet: Packet = Packet(1)
  let writer: &mut Packet = &mut packet
  let downgraded: i32 = read(writer)
  return downgraded
}"#,
        );
    }

    #[test]
    fn call_argument_accepts_named_mut_reference_where_elided_shared_is_expected() {
        admit(
            r#"function read(values: &[i32]): i32 { return 1 }
function borrow_mut<'a>(values: &'a mut [i32]): &'a mut [i32] { return values }
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  let writer: &'a mut [i32] = borrow_mut(&mut values[1..4])
  return read(writer)
}"#,
        );
    }

    #[test]
    fn call_argument_rejects_shared_reference_where_mut_is_expected() {
        let message = reject(
            r#"struct Packet { code: i32 }
function write(packet: &mut Packet): i32 { return 1 }
function main(): i32 {
  slot packet: Packet = Packet(1)
  let view: &Packet = &packet
  return write(view)
}"#,
        );
        assert!(message.contains(ARGUMENT_MISMATCH), "{message}");
        assert!(
            message.contains("expected `&mut Packet`, found `&Packet`"),
            "{message}"
        );
    }

    #[test]
    fn let_rejects_shared_named_lifetime_where_mut_reference_is_expected() {
        let message = reject(
            r#"function borrow<'a>(value: &'a i32): &'a i32 { return value }
function main(): i32 {
  slot value: i32 = 1
  let writer: &mut i32 = borrow(&value)
  return 1
}"#,
        );
        assert!(message.contains(ASSIGNMENT_MISMATCH), "{message}");
        assert!(
            message.contains("expected `&mut i32`, found `&'a i32`"),
            "{message}"
        );
    }

    #[test]
    fn let_rejects_named_mut_reference_where_elided_shared_is_expected() {
        let message = reject(
            r#"function borrow_mut<'a>(values: &'a mut [i32]): &'a mut [i32] { return values }
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  let view: &[i32] = borrow_mut(&mut values[1..4])
  return 1
}"#,
        );
        assert!(message.contains(ASSIGNMENT_MISMATCH), "{message}");
        assert!(
            message.contains("expected `&[i32]`, found `&'a mut [i32]`"),
            "{message}"
        );
    }

    #[test]
    fn distinct_named_lifetimes_are_not_unified() {
        let message = reject(
            r#"function give<'a>(value: &'a i32): &'a i32 { return value }
function main(): i32 {
  slot value: i32 = 1
  let view: &'b i32 = give(&value)
  return 1
}"#,
        );
        assert!(message.contains(ASSIGNMENT_MISMATCH), "{message}");
        assert!(
            message.contains("expected `&'b i32`, found `&'a i32`"),
            "{message}"
        );
    }

    fn reject_at(source: &str) -> (String, usize, usize) {
        let ast = parse_ast(source).expect("fixture should parse");
        let error = check_semantics(&ast).expect_err("expected a checker rejection");
        (error.message, error.line, error.column)
    }

    /// The eight G11 programs from the spec corpus, and a loop variable that hides a parameter: each
    /// is refused with its code, at the line and column of the offending name, call, declaration,
    /// loop or function.
    #[test]
    fn typed_functions_refuse_unknown_names_calls_arity_hiding_and_missing_returns() {
        let cases: &[(&str, &str, usize, usize, &str)] = &[
            (
                "function f(): i32 {\n  return y\n}",
                UNKNOWN_NAME,
                2,
                10,
                "unknown name `y` in function `f`",
            ),
            (
                "function f(): i32 {\n  return g(1)\n}",
                UNKNOWN_FUNCTION,
                2,
                10,
                "unknown function `g` called in function `f`",
            ),
            (
                "function add(a: i32, b: i32): i32 {\n  return a + b\n}\n\nfunction main(): i32 {\n  return add(1)\n}",
                ARITY_MISMATCH,
                6,
                10,
                "`add` expects 2 arguments, got 1",
            ),
            (
                "function f(): i32 {\n  let x: i32 = 1\n}",
                MISSING_RETURN,
                1,
                1,
                "function `f` declares `i32` but can finish without returning a value",
            ),
            (
                "function f(x: i32): i32 {\n  if (x > 0) {\n    return 1\n  }\n}",
                MISSING_RETURN,
                1,
                1,
                "can finish without returning a value",
            ),
            (
                "function main(): i32 {\n  var i: i32 = 0\n  while (i < 10) {\n    if (i == 3) {\n      break\n    }\n    i = i + 1\n  }\n  return i\n}",
                UNKNOWN_NAME,
                5,
                7,
                "HoloScript has no `break` or `continue` statement",
            ),
            (
                "function main(): i32 {\n  if (true) {\n    let t: i32 = 7\n  }\n  return t\n}",
                UNKNOWN_NAME,
                5,
                10,
                "unknown name `t` in function `main`",
            ),
            (
                "function main(): i32 {\n  let x: i32 = 1\n  if (true) {\n    let x: i32 = 2\n  }\n  return x\n}",
                HIDDEN_NAME,
                4,
                5,
                "`x` is declared in function `main` while an earlier `x` is still visible",
            ),
            (
                "function f(v: i32): i32 {\n  for (v in [1, 2]) {\n  }\n  return v\n}",
                HIDDEN_NAME,
                2,
                3,
                "`v` is declared in function `f` while an earlier `v` is still visible",
            ),
        ];
        for (source, code, line, column, text) in cases {
            let (message, actual_line, actual_column) = reject_at(source);
            assert!(message.contains(code), "{source}\n=> {message}");
            assert!(message.contains(text), "{source}\n=> {message}");
            assert_eq!(
                (actual_line, actual_column),
                (*line, *column),
                "{source}\n=> {message}"
            );
        }
    }

    #[test]
    fn typed_functions_keep_what_the_backends_run() {
        // Recursion, mutual recursion, a name reused in sibling blocks, a struct constructor, an
        // enum member, loads and stores through references, an imported name, a function whose
        // last block returns, and the Kotlin math built-ins.
        admit(
            r#"struct Packet { code: i32 }
enum Route { EnterWorld, Deny }
import { clamp } from "./math"

function fib(n: i32): i32 {
  if (n < 2) {
    return n
  }
  return fib(n - 1) + fib(n - 2)
}

function is_even(n: i32): i32 {
  if (n == 0) {
    return 1
  }
  return is_odd(n - 1)
}

function is_odd(n: i32): i32 {
  if (n == 0) {
    return 0
  }
  return is_even(n - 1)
}

function route(ok: bool): Route {
  if (ok) {
    return Route.EnterWorld
  } else {
    return Route.Deny
  }
}

function siblings(x: i32): i32 {
  if (x > 0) {
    let t: i32 = 1
  } else {
    let t: i32 = 2
  }
  return clamp(x)
}

function write(packet: &mut Packet): i32 {
  store(packet.code, 7)
  return load(packet.code)
}

function block_return(x: i32): i32 {
  scope {
    return x
  }
}

function hypotenuse(x: f64, y: f64): f64 {
  return sqrt(pow(x, 2.0) + pow(y, 2.0)) + abs(floor(min(x, max(y, 0.0))))
}

function main(): i32 {
  slot packet: Packet = Packet(5)
  let written: i32 = write(&mut packet)
  return fib(10) + is_even(4) + siblings(written) + block_return(1)
}"#,
        );
    }

    #[test]
    fn typed_functions_may_build_uncertain_values() {
        // `known` and `unknown` are built-ins. Reading an `@unknown` field is the separate
        // `@unknown` rule, not this one.
        admit(
            r#"struct Snapshot {
  @unknown count: i32
}

function main(): i32 {
  slot missing: Snapshot = Snapshot(unknown("missing_precondition"))
  slot present: Snapshot = Snapshot(known(5))
  return 1
}"#,
        );
    }

    #[test]
    fn untyped_legacy_functions_keep_their_earlier_reading() {
        // No parameter or return type: names, calls, arity and returns are not checked.
        admit(
            r#"function legacy(a, b) {
  let x = someHelper(a)
  if (b) {
    let x = 2
  }
  return undeclaredName
}"#,
        );
    }

    #[test]
    fn a_bare_return_in_a_typed_function_keeps_its_return_type_message() {
        let (message, _, _) = reject_at("function f(x: i32): i32 {\n  if (x > 0) {\n    return\n  }\n  return 1\n}");
        assert!(message.contains(RETURN_MISMATCH), "{message}");
    }

    #[test]
    fn a_fragment_resolves_the_functions_its_document_declares() {
        let fragment = "function outer(a: i32): i32 {\n  return sibling(a, 1) + loose(a)\n}";
        let ast = parse_ast(fragment).expect("fixture should parse");

        // Alone, the sibling is unknown.
        let alone = check_semantics(&ast).expect_err("sibling is not declared in the fragment");
        assert!(alone.message.contains(UNKNOWN_FUNCTION), "{}", alone.message);

        // With the document's declarations it resolves; `loose` is named without an arity.
        let mut external = ExternalDeclarations::default();
        external.functions.insert("sibling".to_string(), Some(2));
        external.functions.insert("loose".to_string(), None);
        check_semantics_with(&ast, &external)
            .unwrap_or_else(|error| panic!("expected admission, got {}", error.message));

        // The document's arity still counts.
        external.functions.insert("sibling".to_string(), Some(3));
        let arity = check_semantics_with(&ast, &external).expect_err("sibling takes 3");
        assert!(arity.message.contains(ARITY_MISMATCH), "{}", arity.message);
    }

    /// Findings of the first independent review, one program each.
    #[test]
    fn calls_resolve_to_functions_structs_imports_builtins_or_lambda_locals() {
        // A parameter is a value; the backends never call a value.
        let (message, _, _) = reject_at("function apply(f: i32): i32 {\n  return f(3)\n}");
        assert!(message.contains(UNKNOWN_FUNCTION), "{message}");
        assert!(message.contains("`f` is a value, not a function"), "{message}");

        // A local that shares a function's name does not hide the function from a call.
        let (message, line, _) = reject_at(
            "function helper(x: i32): i32 {\n  return x\n}\n\nfunction main(): i32 {\n  let helper: i32 = 5\n  return helper(1, 2)\n}",
        );
        assert!(message.contains(ARITY_MISMATCH), "{message}");
        assert_eq!(line, 7, "{message}");

        // A local holding a lambda may be called.
        admit("function main(): i32 {\n  let inc = (x) => x + 1\n  return inc(1)\n}");

        // `import { helper as h }` binds `h`, not `helper`.
        let (message, _, _) = reject_at(
            "import { helper as h } from \"./lib.hs\"\n\nfunction main(): i32 {\n  return helper(1)\n}",
        );
        assert!(message.contains("unknown function `helper`"), "{message}");
        admit("import { helper as h } from \"./lib.hs\"\n\nfunction main(): i32 {\n  return h(1)\n}");
    }

    #[test]
    fn struct_constructors_take_one_value_per_field() {
        let (message, line, column) = reject_at(
            "struct Packet { code: i32 }\n\nfunction main(): i32 {\n  slot packet: Packet = Packet(1, 2, 3)\n  return 1\n}",
        );
        assert!(message.contains(ARITY_MISMATCH), "{message}");
        assert!(message.contains("constructor `Packet` takes one value per field (1), got 3"), "{message}");
        assert_eq!((line, column), (4, 25), "{message}");
    }

    #[test]
    fn a_parameter_name_may_not_repeat() {
        // Reported where the name is written the second time, not at the function.
        let (message, line, column) =
            reject_at("function f(a: i32, a: i32): i32 {\n  return a\n}");
        assert!(message.contains(HIDDEN_NAME), "{message}");
        assert!(message.contains("names parameter `a` twice"), "{message}");
        assert_eq!((line, column), (1, 20), "{message}");
        let (_, line, column) =
            reject_at("function f(\n  a: i32,\n  b: i32,\n  a: i32\n): i32 {\n  return a\n}");
        assert_eq!((line, column), (4, 3));
        // Untyped legacy functions keep their earlier reading.
        admit("function f(a, a) {\n  return a\n}");
    }

    #[test]
    fn slots_assignment_targets_receivers_and_lambda_bodies_resolve_their_names() {
        let (message, _, _) = reject_at("function main(): i32 {\n  let x: i32 = 1\n  slot x: i32 = 2\n  return x\n}");
        assert!(message.contains(HIDDEN_NAME), "{message}");

        let (message, _, _) = reject_at("function main(): i32 {\n  *nowhere = 2\n  return 1\n}");
        assert!(message.contains(UNKNOWN_NAME), "{message}");
        assert!(message.contains("unknown name `nowhere`"), "{message}");

        let (message, line, column) = reject_at("function main(): i32 {\n  return nowhere.method()\n}");
        assert!(message.contains("unknown name `nowhere`"), "{message}");
        assert_eq!((line, column), (2, 10), "{message}");

        let (message, _, _) = reject_at("function main(): i32 {\n  let g = (x) => x + zzz\n  return 1\n}");
        assert!(message.contains("unknown name `zzz`"), "{message}");
        admit("function main(): i32 {\n  let g = (x) => x + 1\n  return 1\n}");

        let (message, _, _) = reject_at("function main(): i32 {\n  [zzz]\n  return 1\n}");
        assert!(message.contains("unknown name `zzz`"), "{message}");
        let (message, _, _) =
            reject_at("function main(): i32 {\n  let xs = [...zzz]\n  return 1\n}");
        assert!(message.contains("unknown name `zzz`"), "{message}");
    }

    #[test]
    fn every_built_in_name_resolves_in_a_typed_function() {
        // Stated here, not read from `BUILTINS`, so dropping a name from the list fails this test.
        // The native backend lowers the first twelve; the Kotlin backend the last six.
        let names = [
            "load",
            "store",
            "move",
            "drop",
            "buffer",
            "known",
            "unknown",
            "isKnown",
            "unknownReason",
            "slice_length",
            "u8_to_i32",
            "i32_to_u8",
            "abs",
            "floor",
            "max",
            "min",
            "pow",
            "sqrt",
        ];
        for name in names {
            let source = format!("function f(a: i32): i32 {{\n  let r = {name}(a)\n  return 1\n}}");
            let ast = parse_ast(&source).expect("fixture should parse");
            if let Err(error) = check_semantics(&ast) {
                assert!(
                    !error.message.contains(UNKNOWN_FUNCTION),
                    "built-in `{name}` did not resolve: {}",
                    error.message
                );
            }
        }
    }

    #[test]
    fn unit_return_types_need_no_value() {
        admit("function f(x: i32): unit {\n  let y: i32 = x\n}");
        admit("function f(x: i32): void {\n  let y: i32 = x\n}");
    }

    // Findings of the second independent review (PR #438, claude3): four classes of fault that
    // left every test green, one test each, then the smaller findings.

    /// F2: a loop whose body returns, counted as returning. Its body may not run, and native never
    /// counts a loop. `compile_to_uaal` has no every-path guard of its own any more, so the checker
    /// is what keeps such a function out of UAAL bytecode.
    #[test]
    fn a_loop_at_the_end_never_counts_as_returning() {
        for source in [
            "function f(x: i32): i32 {\n  while (x > 0) {\n    return 1\n  }\n}",
            "function f(x: i32): i32 {\n  for (i in 0..3) {\n    return i\n  }\n}",
            "function f(x: i32): i32 {\n  if (x > 0) {\n    return 1\n  } else {\n    while (x < 0) {\n      return 2\n    }\n  }\n}",
            "function f(x: i32): i32 {\n  scope {\n    while (x > 0) {\n      return 1\n    }\n  }\n}",
        ] {
            let (message, line, column) = reject_at(source);
            assert!(message.contains(MISSING_RETURN), "{source}\n=> {message}");
            assert_eq!((line, column), (1, 1), "{source}\n=> {message}");

            let program = format!("{source}\n\nfunction main(): i32 {{\n  return f(1)\n}}");
            let error = crate::uaal_emit::compile_source_to_uaal(&program)
                .expect_err("compile_to_uaal must refuse a function that can end without a value");
            assert!(
                error.message.contains(MISSING_RETURN),
                "{program}\n=> {}",
                error.message
            );
        }
    }

    /// F3: a constructor takes exactly one value per field, too few as well as too many.
    #[test]
    fn a_struct_constructor_takes_exactly_one_value_per_field() {
        let program = |values: &str| {
            format!(
                "struct V {{ x: i32, y: i32, z: i32 }}\n\nfunction f(): i32 {{\n  slot v: V = V({values})\n  return 1\n}}"
            )
        };
        for (values, got) in [("1, 2", 2), ("", 0), ("1, 2, 3, 4", 4)] {
            let (message, line, column) = reject_at(&program(values));
            assert!(message.contains(ARITY_MISMATCH), "V({values})\n=> {message}");
            assert!(
                message.contains(&format!(
                    "constructor `V` takes one value per field (3), got {got}"
                )),
                "V({values})\n=> {message}"
            );
            assert_eq!((line, column), (4, 15), "V({values})\n=> {message}");
        }
        admit(&program("1, 2, 3"));
    }

    /// F4: a name resolves wherever an expression uses it. The index in `a[nope]` was not walked.
    #[test]
    fn a_name_resolves_wherever_an_expression_uses_it() {
        for statement in [
            "return values[nope]",
            "store(values[nope], 1)\n  return 1",
            "return -nope",
            "return 1 + nope",
            "return x ?? nope",
            "return id(nope)",
            "return id(id(nope))",
            "return nope.code",
            "let xs = [1, nope]\n  return 1",
            "let xs = [...nope]\n  return 1",
            "let o = { k: nope }\n  return 1",
            "let g = (a) => a + nope\n  return 1",
            "let g = (a) => (b) => a + b + nope\n  return 1",
            "if (nope > 0) {\n    return 1\n  }\n  return 2",
            "while (nope) {\n  }\n  return 2",
            "for (i in 0..nope) {\n  }\n  return 2",
        ] {
            let source = format!(
                "function id(a: i32): i32 {{\n  return a\n}}\n\nfunction f(x: i32): i32 {{\n  slot values: [i32; 2] = [1, 2]\n  {statement}\n}}"
            );
            let (message, line, _) = reject_at(&source);
            assert!(message.contains(UNKNOWN_NAME), "{statement}\n=> {message}");
            assert!(
                message.contains("unknown name `nope`"),
                "{statement}\n=> {message}"
            );
            assert_eq!(line, 7, "{statement}\n=> {message}");
        }
    }

    /// F5: a block's locals end with the block, for every kind of block. Without a frame of its
    /// own, a `while` body's locals stayed visible after the loop.
    #[test]
    fn a_blocks_locals_end_with_the_block() {
        for block in [
            "while (n < 3) {\n    let t: i32 = n\n    n = n + 1\n  }",
            "for (i in 0..3) {\n    let t: i32 = i\n  }",
            "if (n > 0) {\n    let t: i32 = n\n  }",
            "if (n > 0) {\n  } else {\n    let t: i32 = n\n  }",
            "scope {\n    let t: i32 = n\n  }",
        ] {
            // Read after the block, the local is unknown.
            let message = reject(&format!(
                "function f(x: i32): i32 {{\n  var n: i32 = x\n  {block}\n  return t\n}}"
            ));
            assert!(message.contains(UNKNOWN_NAME), "{block}\n=> {message}");
            assert!(message.contains("unknown name `t`"), "{block}\n=> {message}");
            // Declared again after the block, it is a new local, not a hidden one.
            admit(&format!(
                "function f(x: i32): i32 {{\n  var n: i32 = x\n  {block}\n  let t: i32 = n\n  return t\n}}"
            ));
        }
        // A loop variable ends with its loop.
        let message = reject("function f(x: i32): i32 {\n  for (i in 0..3) {\n  }\n  return i\n}");
        assert!(message.contains("unknown name `i`"), "{message}");
    }

    /// The spec's HS-NAME-002 covers a call to an enum: an enum, like a `.hsplus` module, is read
    /// through its members and never called. Neither backend calls one.
    #[test]
    fn an_enum_or_module_is_read_through_its_members_and_never_called() {
        let (message, line, column) =
            reject_at("enum Route { A, B }\n\nfunction f(x: i32): i32 {\n  return Route(1)\n}");
        assert!(message.contains(UNKNOWN_FUNCTION), "{message}");
        assert!(
            message.contains("`Route` is an enum or module, not a function"),
            "{message}"
        );
        assert_eq!((line, column), (4, 10), "{message}");
        admit("enum Route { A, B }\n\nfunction f(ok: bool): Route {\n  if (ok) {\n    return Route.A\n  }\n  return Route.B\n}");

        // A `.hsplus` document's modules and enums arrive as namespaces.
        let mut external = ExternalDeclarations::default();
        external.namespaces.insert("GameState".to_string());
        let reads =
            parse_ast("function score(p: i32): i32 {\n  GameState.addScore(p)\n  return p\n}")
                .expect("fixture should parse");
        let alone = check_semantics(&reads).expect_err("alone, the module is unknown");
        assert!(
            alone.message.contains("unknown name `GameState`"),
            "{}",
            alone.message
        );
        check_semantics_with(&reads, &external)
            .unwrap_or_else(|error| panic!("expected admission, got {}", error.message));
        let calls = parse_ast("function score(p: i32): i32 {\n  return GameState(p)\n}")
            .expect("fixture should parse");
        let called = check_semantics_with(&calls, &external).expect_err("a module is not called");
        assert!(
            called
                .message
                .contains("`GameState` is an enum or module, not a function"),
            "{}",
            called.message
        );
    }

    /// A local may be called only while every value it was given is a lambda. The checker does
    /// not follow branches, so a value given in one branch is enough.
    #[test]
    fn a_local_stops_being_callable_once_it_is_given_a_value() {
        admit("function f(a: i32): i32 {\n  var g = (x) => x + 1\n  g = (x) => x + 2\n  return g(1)\n}");
        let (message, line, column) =
            reject_at("function f(a: i32): i32 {\n  var g = (x) => x + 1\n  g = 5\n  return g(1)\n}");
        assert!(message.contains(UNKNOWN_FUNCTION), "{message}");
        assert!(message.contains("`g` is a value, not a function"), "{message}");
        assert_eq!((line, column), (4, 10), "{message}");
        for source in [
            "function f(a: i32): i32 {\n  var g = (x) => x + 1\n  if (a > 0) {\n    g = 5\n  }\n  return g(1)\n}",
            // The later lambda does not undo the value: either branch may have run.
            "function f(a: i32): i32 {\n  var g = (x) => x + 1\n  if (a > 0) {\n    g = 5\n  } else {\n    g = (x) => x + 2\n  }\n  return g(1)\n}",
            "function f(a: i32): i32 {\n  var g = 5\n  g = (x) => x + 2\n  return g(1)\n}",
        ] {
            let message = reject(source);
            assert!(
                message.contains("`g` is a value, not a function"),
                "{source}\n=> {message}"
            );
        }
    }

    /// Names in an object literal's fallback values and in `move` statements resolve too.
    #[test]
    fn object_fallback_values_and_move_statements_resolve_their_names() {
        for (body, name) in [
            ("let o = { k: 1 = nowhere }\n  return 1", "nowhere"),
            ("move nope to [1, 2, 3]\n  return 1", "nope"),
            ("move to nope\n  return 1", "nope"),
            ("move x to nope\n  return 1", "nope"),
        ] {
            let (message, line, _) =
                reject_at(&format!("function f(x: i32): i32 {{\n  {body}\n}}"));
            assert!(message.contains(UNKNOWN_NAME), "{body}\n=> {message}");
            assert!(
                message.contains(&format!("unknown name `{name}`")),
                "{body}\n=> {message}"
            );
            assert_eq!(line, 2, "{body}\n=> {message}");
        }
        admit("function f(x: i32): i32 {\n  let o = { k: 1 = x }\n  return 1\n}");
        admit("function f(x: i32, door: i32): i32 {\n  move x to door\n  move to [1, 2, 3]\n  return 1\n}");
        // Untyped functions keep their earlier reading.
        admit("function f(x) {\n  move nope to elsewhere\n  let o = { k: 1 = nowhere }\n  return 1\n}");
    }

    /// Columns count UTF-16 code units, the unit of a JavaScript string index and of an LSP
    /// position: an emoji is two, a CJK character, an accented letter or a tab one.
    #[test]
    fn columns_count_utf16_code_units() {
        for line in [
            "  let s: string = \"abc\" let t: i32 = zz",
            "  let s: string = \"日本語\" let t: i32 = zz",
            "  let s: string = \"😀😀\" let t: i32 = zz",
            "  let s: string = \"éé\" let t: i32 = zz",
            "\tlet t: i32 = zz",
        ] {
            let at = line.find("zz").expect("fixture names zz");
            let column = line[..at].encode_utf16().count() + 1;
            for eol in ["\n", "\r\n"] {
                let source = ["function f(): i32 {", line, "  return 1", "}"].join(eol);
                let (message, actual_line, actual_column) = reject_at(&source);
                assert!(message.contains("unknown name `zz`"), "{line:?}\n=> {message}");
                assert_eq!(
                    (actual_line, actual_column),
                    (2, column),
                    "{line:?} with {eol:?}"
                );
            }
        }
    }

    /// Bytes this thread allocates, counted by the test binary's allocator, so a test can bound
    /// the work a check does without timing it.
    mod allocation {
        use std::alloc::{GlobalAlloc, Layout, System};
        use std::cell::Cell;

        thread_local! {
            static BYTES: Cell<u64> = const { Cell::new(0) };
        }

        struct Counting;

        // SAFETY: every call is passed straight to `System`; the count is a side effect.
        unsafe impl GlobalAlloc for Counting {
            unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
                count(layout.size());
                System.alloc(layout)
            }

            unsafe fn alloc_zeroed(&self, layout: Layout) -> *mut u8 {
                count(layout.size());
                System.alloc_zeroed(layout)
            }

            unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
                System.dealloc(ptr, layout)
            }

            unsafe fn realloc(&self, ptr: *mut u8, layout: Layout, new_size: usize) -> *mut u8 {
                count(new_size);
                System.realloc(ptr, layout, new_size)
            }
        }

        fn count(bytes: usize) {
            // An allocation while the thread's locals are being torn down is not counted.
            let _ = BYTES.try_with(|total| total.set(total.get() + bytes as u64));
        }

        #[global_allocator]
        static COUNTING: Counting = Counting;

        pub(super) fn allocated() -> u64 {
            BYTES.with(Cell::get)
        }
    }

    /// The second review measured each lambda copying every binding in scope: 6,000 locals and
    /// 6,000 lambdas took 18 s to check in the WASM build, against 0.15 s before G11. This bounds
    /// the cost by counting the bytes a check allocates, not by timing it, so a loaded machine
    /// cannot change the verdict: per declaration, a program sixteen times larger may cost at
    /// most four times as much. Copying the scope for each lambda again costs sixteen times as
    /// much per declaration here.
    #[test]
    fn checking_cost_grows_linearly_with_lambdas_and_locals() {
        fn program(locals: usize) -> String {
            let mut source = String::from("function f(x: i32): i32 {\n");
            for i in 0..locals {
                source.push_str(&format!("  let v{i}: i32 = x\n"));
            }
            for i in 0..locals {
                source.push_str(&format!("  let g{i} = (a) => a + v{i}\n"));
            }
            source.push_str("  return x\n}\n");
            source
        }
        fn bytes_per_declaration(locals: usize) -> f64 {
            let ast = parse_ast(&program(locals)).expect("fixture should parse");
            let before = allocation::allocated();
            check_semantics(&ast)
                .unwrap_or_else(|error| panic!("expected admission, got {}", error.message));
            (allocation::allocated() - before) as f64 / (2 * locals) as f64
        }
        let small = bytes_per_declaration(250);
        let large = bytes_per_declaration(4_000);
        assert!(
            large <= 4.0 * small,
            "checking allocated {small:.0} bytes per declaration for 500 declarations and \
             {large:.0} for 8,000: the cost grows faster than the program"
        );
    }
}
