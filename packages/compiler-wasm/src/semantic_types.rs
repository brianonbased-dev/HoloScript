//! Conservative semantic type evidence for explicit `.hs` contracts.
//!
//! The structural parser intentionally continues to admit legacy untyped functions. This pass
//! only rejects a program when the source provides an explicit type boundary and the AST carries
//! enough evidence to prove that the value crossing it is incompatible. Unknown evidence remains
//! admissible; a known mismatch never reaches a target emitter.

use std::collections::HashMap;

use crate::ast::{Ast, AstNode, FunctionNode, Location};
use crate::kotlin_emit::SemanticDiagnostic;

const RETURN_MISMATCH: &str = "HS-TYPE-RETURN-001";
const ASSIGNMENT_MISMATCH: &str = "HS-TYPE-ASSIGN-001";
const ARGUMENT_MISMATCH: &str = "HS-TYPE-ARG-001";
const LOGICAL_MISMATCH: &str = "HS-TYPE-LOGICAL-001";

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

#[derive(Debug, Clone)]
struct BindingEvidence {
    declared_type: Option<String>,
    observed_type: TypeEvidence,
    mutable: bool,
}

struct TypeChecker {
    functions: HashMap<String, FunctionSignature>,
}

pub(crate) fn check_explicit_type_contracts(ast: &Ast) -> Result<(), SemanticDiagnostic> {
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

    let checker = TypeChecker { functions };
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
        let mut function_scope = HashMap::new();
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
        )
    }

    fn check_body(
        &self,
        body: &[AstNode],
        function_name: &str,
        expected_return: Option<&str>,
        scopes: &mut Vec<HashMap<String, BindingEvidence>>,
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
        scopes: &mut Vec<HashMap<String, BindingEvidence>>,
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
                        },
                    );
                }
            }
            AstNode::StackSlotDeclaration(slot) => {
                let actual = self.infer_expression(&slot.value, scopes)?;
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
                        },
                    );
                }
            }
            AstNode::Assignment(assignment) => {
                let actual = self.infer_expression(&assignment.value, scopes)?;
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
                    }
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
                scopes.push(HashMap::from([(
                    for_node.var_name.clone(),
                    BindingEvidence {
                        declared_type: None,
                        observed_type: TypeEvidence::Unknown,
                        mutable: false,
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
                ) {
                    self.infer_expression(other, scopes)?;
                }
            }
        }
        Ok(())
    }

    fn infer_expression(
        &self,
        node: &AstNode,
        scopes: &[HashMap<String, BindingEvidence>],
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
            AstNode::Identifier(identifier) => Ok(lookup_binding(scopes, &identifier.name)
                .map(|binding| binding.observed_type.clone())
                .unwrap_or(TypeEvidence::Unknown)),
            AstNode::CallExpression(call) => {
                let arguments = call
                    .arguments
                    .iter()
                    .map(|argument| self.infer_expression(argument, scopes))
                    .collect::<Result<Vec<_>, _>>()?;
                let AstNode::Identifier(callee) = call.callee.as_ref() else {
                    return Ok(TypeEvidence::Unknown);
                };
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
                    if !is_assignable(expected, argument) {
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
                    "+" | "-" | "*" | "/" | "%" => numeric_result_evidence(&left, &right),
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
                }
                Ok(TypeEvidence::Unknown)
            }
            _ => Ok(TypeEvidence::Unknown),
        }
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

fn is_assignable(expected: &str, actual: &TypeEvidence) -> bool {
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

fn lookup_binding<'a>(
    scopes: &'a [HashMap<String, BindingEvidence>],
    name: &str,
) -> Option<&'a BindingEvidence> {
    scopes.iter().rev().find_map(|scope| scope.get(name))
}

fn lookup_binding_mut<'a>(
    scopes: &'a mut [HashMap<String, BindingEvidence>],
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
