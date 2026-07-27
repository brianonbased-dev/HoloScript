//! Minimal `.hs` function-to-UAAL bytecode emitter.
//!
//! This backend intentionally starts at the narrow symbol-resolution seam the
//! VM can prove today: top-level functions, literal return values, stack-passed
//! call arguments, simple state-backed slots, and direct calls lowered to real
//! `CALL`/`RET` instructions.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::ast::{Ast, AstNode, BinaryExpression, CallExpression, FunctionNode};
use crate::kotlin_emit::{check_semantics, find_owned_buffer_annotation, SemanticDiagnostic};

const OP_PUSH: u16 = 0x01;
const OP_EXEC: u16 = 0x20;
const OP_JUMP: u16 = 0x30;
const OP_JUMP_IF: u16 = 0x31;
const OP_CALL: u16 = 0x32;
const OP_RET: u16 = 0x33;
const OP_STATE_SET: u16 = 0xcb;
const OP_STATE_GET: u16 = 0xcc;
const OP_HALT: u16 = 0xff;

/// Host-handler ABI used for i32 arithmetic/comparison on UAAL's generic EXEC seam.
///
/// Stack contract: the emitter pushes `left`, then `right`; the handler pops
/// `right`, then `left`, applies the named signed-i32 operation, and pushes the
/// result. Arithmetic results use wrapping i32 semantics. Comparisons push bool.
const HS_I32_BINARY_ABI: &str = "hs.i32.binary.v1";

/// Host-handler ABI used for scalar f32 arithmetic/comparison on UAAL's generic EXEC seam.
///
/// The emitter rounds literals to binary32. The embedding host must round both operands and
/// every arithmetic result to binary32 so JavaScript's default binary64 arithmetic cannot leak.
const HS_F32_BINARY_ABI: &str = "hs.f32.binary.v1";

/// Host-handler ABI used for scalar f64 arithmetic/comparison on UAAL's generic EXEC seam.
///
/// Stack order matches the i32 ABI. The host preserves JavaScript/JSON's IEEE-754 binary64
/// values without integer coercion. The first conformance contract covers finite operands.
const HS_F64_BINARY_ABI: &str = "hs.f64.binary.v1";

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UaalBytecode {
    pub version: u8,
    pub instructions: Vec<UaalInstruction>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct UaalInstruction {
    #[serde(rename = "opCode")]
    pub op_code: u16,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub operands: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UaalEmitError {
    pub message: String,
}

impl UaalEmitError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for UaalEmitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for UaalEmitError {}

impl From<SemanticDiagnostic> for UaalEmitError {
    fn from(value: SemanticDiagnostic) -> Self {
        UaalEmitError::new(value.message)
    }
}

#[derive(Debug)]
struct PendingCall {
    instruction_index: usize,
    target: String,
}

#[derive(Debug)]
struct UaalEmitter<'a> {
    functions: Vec<&'a FunctionNode>,
    function_names: HashSet<String>,
    function_params: HashMap<String, Vec<String>>,
    function_param_types: HashMap<String, Vec<Option<String>>>,
    function_return_types: HashMap<String, Option<String>>,
    entry_points: HashMap<String, usize>,
    pending_calls: Vec<PendingCall>,
    instructions: Vec<UaalInstruction>,
    current_function: Option<String>,
    current_bindings: HashSet<String>,
    current_binding_types: HashMap<String, Option<String>>,
}

pub fn compile_source_to_uaal(source: &str) -> Result<UaalBytecode, UaalEmitError> {
    let ast = crate::parser::Parser::new(source)
        .parse()
        .map_err(|errors| {
            let first = errors
                .first()
                .map(|e| format!("{} (line {}, col {})", e.message, e.line, e.column))
                .unwrap_or_else(|| "unknown parse error".to_string());
            UaalEmitError::new(format!("parse failed: {}", first))
        })?;
    emit_uaal_bytecode(&ast)
}

pub fn compile_source_to_uaal_json(source: &str) -> Result<String, UaalEmitError> {
    let bytecode = compile_source_to_uaal(source)?;
    serde_json::to_string(&bytecode)
        .map_err(|e| UaalEmitError::new(format!("UAAL serialization failed: {}", e)))
}

pub fn emit_uaal_bytecode(ast: &Ast) -> Result<UaalBytecode, UaalEmitError> {
    check_semantics(ast)?;
    if let Some((annotation, context)) = find_owned_buffer_annotation(ast) {
        return Err(UaalEmitError::new(format!(
            "owned buffer type `{annotation}` in {context} requires allocator, move, and drop opcodes; compile_to_uaal does not erase affine ownership"
        )));
    }

    let functions = collect_functions(ast)?;
    if functions.is_empty() {
        return Err(UaalEmitError::new(
            "compile_to_uaal requires at least one top-level function",
        ));
    }

    let function_names = functions
        .iter()
        .map(|f| f.name.clone())
        .collect::<HashSet<_>>();
    let function_params = functions
        .iter()
        .map(|f| (f.name.clone(), f.params.clone()))
        .collect::<HashMap<_, _>>();
    let function_param_types = functions
        .iter()
        .map(|function| {
            let types = if function.param_types.is_empty() {
                vec![None; function.params.len()]
            } else {
                function.param_types.clone()
            };
            (function.name.clone(), types)
        })
        .collect::<HashMap<_, _>>();
    let function_return_types = functions
        .iter()
        .map(|function| (function.name.clone(), function.return_type.clone()))
        .collect::<HashMap<_, _>>();

    validate_imports_resolved(ast, &function_names)?;

    let mut emitter = UaalEmitter {
        functions,
        function_names,
        function_params,
        function_param_types,
        function_return_types,
        entry_points: HashMap::new(),
        pending_calls: Vec::new(),
        instructions: Vec::new(),
        current_function: None,
        current_bindings: HashSet::new(),
        current_binding_types: HashMap::new(),
    };

    emitter.emit_bootstrap()?;
    emitter.emit_functions()?;
    emitter.patch_calls()?;

    Ok(UaalBytecode {
        version: 1,
        instructions: emitter.instructions,
    })
}

fn collect_functions(ast: &Ast) -> Result<Vec<&FunctionNode>, UaalEmitError> {
    let mut functions = Vec::new();
    for node in &ast.body {
        match node {
            AstNode::Function(function) => functions.push(function),
            AstNode::Export(export) => match export.declaration.as_ref() {
                AstNode::Function(function) => functions.push(function),
                other => {
                    return Err(UaalEmitError::new(format!(
                        "unsupported exported declaration for compile_to_uaal: {}",
                        node_kind(other)
                    )));
                }
            },
            AstNode::Import(_) | AstNode::StructDeclaration(_) | AstNode::EnumDeclaration(_) => {}
            AstNode::Comment(_) => {}
            other => {
                return Err(UaalEmitError::new(format!(
                    "unsupported top-level node for compile_to_uaal: {}",
                    node_kind(other)
                )));
            }
        }
    }
    Ok(functions)
}

fn validate_imports_resolved(
    ast: &Ast,
    function_names: &HashSet<String>,
) -> Result<(), UaalEmitError> {
    for node in &ast.body {
        if let AstNode::Import(import) = node {
            for specifier in &import.specifiers {
                if !function_names.contains(&specifier.imported) {
                    return Err(UaalEmitError::new(format!(
                        "unresolved import `{}` from `{}`; compile_to_uaal expects caller-side inlining before compilation",
                        specifier.imported, import.source
                    )));
                }
            }
        }
    }
    Ok(())
}

impl<'a> UaalEmitter<'a> {
    fn emit_bootstrap(&mut self) -> Result<(), UaalEmitError> {
        let entry = if self.function_names.contains("main") {
            "main"
        } else {
            &self.functions[0].name
        };
        self.emit_call(entry);
        self.emit_op(OP_HALT, Vec::new());
        Ok(())
    }

    fn emit_functions(&mut self) -> Result<(), UaalEmitError> {
        let functions = self.functions.clone();
        for function in functions {
            self.entry_points
                .insert(function.name.clone(), self.instructions.len());
            self.current_function = Some(function.name.clone());
            self.current_bindings = function.params.iter().cloned().collect();
            self.current_binding_types = function
                .params
                .iter()
                .enumerate()
                .map(|(index, name)| {
                    let type_annotation = function.param_types.get(index).cloned().unwrap_or(None);
                    (name.clone(), type_annotation)
                })
                .collect();

            for param in function.params.iter().rev() {
                self.emit_op(
                    OP_STATE_SET,
                    vec![Value::from(Self::slot_key(&function.name, param))],
                );
            }

            for statement in &function.body {
                self.emit_statement(statement)?;
            }
            self.emit_op(OP_RET, Vec::new());
            self.current_function = None;
            self.current_bindings.clear();
            self.current_binding_types.clear();
        }
        Ok(())
    }

    fn patch_calls(&mut self) -> Result<(), UaalEmitError> {
        for pending in &self.pending_calls {
            let target = self
                .entry_points
                .get(&pending.target)
                .copied()
                .ok_or_else(|| {
                    UaalEmitError::new(format!("unresolved function `{}`", pending.target))
                })?;
            self.instructions[pending.instruction_index].operands = vec![Value::from(target)];
        }
        Ok(())
    }

    fn emit_statement(&mut self, node: &AstNode) -> Result<(), UaalEmitError> {
        match node {
            AstNode::Return(ret) => {
                if let Some(argument) = &ret.argument {
                    let expected = self.current_function_return_type()?.cloned();
                    self.emit_expression_with_expected(argument, expected.as_deref())?;
                }
                self.emit_op(OP_RET, Vec::new());
                Ok(())
            }
            AstNode::CallExpression(call) => self.emit_call_expression(call),
            AstNode::If(if_node) => self.emit_if(if_node),
            AstNode::While(while_node) => self.emit_while(while_node),
            AstNode::VariableDeclaration(var) => {
                self.emit_expression_with_expected(&var.value, var.type_annotation.as_deref())?;
                let slot = Self::slot_key(self.current_function_name()?, &var.name);
                self.current_bindings.insert(var.name.clone());
                self.current_binding_types
                    .insert(var.name.clone(), var.type_annotation.clone());
                self.emit_op(OP_STATE_SET, vec![Value::from(slot)]);
                Ok(())
            }
            AstNode::Assignment(assignment) => {
                let target = match assignment.target.as_ref() {
                    AstNode::Identifier(identifier) => &identifier.name,
                    other => {
                        return Err(UaalEmitError::new(format!(
                            "unsupported assignment target for compile_to_uaal: {}",
                            node_kind(other)
                        )));
                    }
                };
                if assignment.operator != "=" {
                    return Err(UaalEmitError::new(format!(
                        "unsupported assignment operator for compile_to_uaal: `{}`",
                        assignment.operator
                    )));
                }
                if !self.current_bindings.contains(target) {
                    return Err(UaalEmitError::new(format!(
                        "assignment to unknown slot `{}` in compile_to_uaal",
                        target
                    )));
                }
                let expected = self
                    .current_binding_types
                    .get(target)
                    .and_then(|annotation| annotation.clone());
                self.emit_expression_with_expected(&assignment.value, expected.as_deref())?;
                let slot = Self::slot_key(self.current_function_name()?, target);
                self.emit_op(OP_STATE_SET, vec![Value::from(slot)]);
                Ok(())
            }
            AstNode::Comment(_) => Ok(()),
            other => Err(UaalEmitError::new(format!(
                "unsupported statement node for compile_to_uaal: {}",
                node_kind(other)
            ))),
        }
    }

    fn emit_expression_with_expected(
        &mut self,
        node: &AstNode,
        expected_type: Option<&str>,
    ) -> Result<(), UaalEmitError> {
        match node {
            AstNode::String(value) => {
                self.emit_op(OP_PUSH, vec![Value::from(value.value.clone())]);
                Ok(())
            }
            AstNode::Number(value) => {
                let emitted = if expected_type == Some("f32") {
                    let rounded = value.value as f32;
                    if !rounded.is_finite() {
                        return Err(Self::target_capability_error(
                            "HS-UAAL-CAP-001",
                            "uaal.expression.f32.binary.v1",
                            format!(
                                "numeric literal `{}` is not representable as finite `f32`",
                                value.raw
                            ),
                        ));
                    }
                    f64::from(rounded)
                } else {
                    value.value
                };
                self.emit_op(OP_PUSH, vec![Value::from(emitted)]);
                Ok(())
            }
            AstNode::Boolean(value) => {
                self.emit_op(OP_PUSH, vec![Value::from(value.value)]);
                Ok(())
            }
            AstNode::Null(_) => {
                self.emit_op(OP_PUSH, vec![Value::Null]);
                Ok(())
            }
            AstNode::Identifier(identifier) => {
                if !self.current_bindings.contains(&identifier.name) {
                    return Err(UaalEmitError::new(format!(
                        "unresolved slot `{}` in compile_to_uaal",
                        identifier.name
                    )));
                }
                let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
                self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
                Ok(())
            }
            AstNode::BinaryExpression(binary) => self.emit_binary_expression(binary, expected_type),
            AstNode::CallExpression(call) => self.emit_call_expression(call),
            other => Err(UaalEmitError::new(format!(
                "unsupported expression node for compile_to_uaal: {}",
                node_kind(other)
            ))),
        }
    }

    fn emit_call_expression(&mut self, call: &CallExpression) -> Result<(), UaalEmitError> {
        let callee = match call.callee.as_ref() {
            AstNode::Identifier(identifier) => &identifier.name,
            other => {
                return Err(UaalEmitError::new(format!(
                    "unsupported call callee for compile_to_uaal: {}",
                    node_kind(other)
                )));
            }
        };

        if !self.function_names.contains(callee) {
            return Err(UaalEmitError::new(format!(
                "unresolved function call `{}` in compile_to_uaal",
                callee
            )));
        }
        let expected_arity = self
            .function_params
            .get(callee)
            .map(|params| params.len())
            .unwrap_or(0);
        if call.arguments.len() != expected_arity {
            return Err(UaalEmitError::new(format!(
                "arity mismatch calling `{}` in compile_to_uaal: expected {}, got {}",
                callee,
                expected_arity,
                call.arguments.len()
            )));
        }

        let param_types = self
            .function_param_types
            .get(callee)
            .cloned()
            .unwrap_or_else(|| vec![None; call.arguments.len()]);
        for (index, argument) in call.arguments.iter().enumerate() {
            let expected = param_types
                .get(index)
                .and_then(|annotation| annotation.as_deref());
            self.emit_expression_with_expected(argument, expected)?;
        }
        self.emit_call(callee);
        Ok(())
    }

    fn emit_if(&mut self, if_node: &crate::ast::IfNode) -> Result<(), UaalEmitError> {
        self.emit_expression_with_expected(&if_node.test, Some("bool"))?;

        let jump_to_consequent = self.emit_op(OP_JUMP_IF, Vec::new());

        if let Some(alternate) = &if_node.alternate {
            for statement in alternate {
                self.emit_statement(statement)?;
            }
        }

        let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
        let consequent_start = self.instructions.len();
        self.instructions[jump_to_consequent].operands = vec![Value::from(consequent_start)];

        for statement in &if_node.consequent {
            self.emit_statement(statement)?;
        }

        let end = self.instructions.len();
        self.instructions[jump_to_end].operands = vec![Value::from(end)];
        Ok(())
    }

    fn emit_while(&mut self, while_node: &crate::ast::WhileNode) -> Result<(), UaalEmitError> {
        let condition_start = self.instructions.len();
        self.emit_expression_with_expected(&while_node.test, Some("bool"))?;

        let jump_to_body = self.emit_op(OP_JUMP_IF, Vec::new());
        let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
        let body_start = self.instructions.len();
        self.instructions[jump_to_body].operands = vec![Value::from(body_start)];

        for statement in &while_node.body {
            self.emit_statement(statement)?;
        }
        self.emit_op(OP_JUMP, vec![Value::from(condition_start)]);

        let end = self.instructions.len();
        self.instructions[jump_to_end].operands = vec![Value::from(end)];
        Ok(())
    }

    fn emit_binary_expression(
        &mut self,
        binary: &BinaryExpression,
        expected_type: Option<&str>,
    ) -> Result<(), UaalEmitError> {
        if matches!(binary.operator.as_str(), "&&" | "||") {
            return self.emit_logical_expression(binary, expected_type);
        }

        let is_comparison = matches!(
            binary.operator.as_str(),
            "==" | "!=" | "<" | "<=" | ">" | ">="
        );
        if !is_comparison && !matches!(binary.operator.as_str(), "+" | "-" | "*" | "/") {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-001",
                "uaal.expression.numeric.binary.v2",
                format!(
                    "operator `{}` is unavailable; supported operators are `+`, `-`, `*`, floating-point `/`, `==`, `!=`, `<`, `<=`, `>`, and `>=`",
                    binary.operator
                ),
            ));
        }

        if !is_comparison && expected_type.is_none() {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-001",
                "uaal.expression.numeric.binary.v2",
                format!(
                    "operator `{}` has no proven result width; annotate the containing return, local, or parameter as `i32`, `f32`, or `f64`",
                    binary.operator
                ),
            ));
        }

        if is_comparison {
            if let Some(expected) = expected_type {
                if !is_bool_annotation(expected) {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-001",
                        "uaal.expression.numeric.binary.v2",
                        format!(
                            "operator `{}` produces `bool`, but this expression requires `{expected}`",
                            binary.operator
                        ),
                    ));
                }
            }
        }

        let operand_type = if is_comparison {
            self.infer_numeric_operand_type(binary)?
        } else {
            let expected = expected_type.expect("arithmetic width is checked above");
            if !matches!(expected, "i32" | "f32" | "f64") {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-001",
                    "uaal.expression.numeric.binary.v2",
                    format!(
                        "operator `{}` requires an explicit `i32`, `f32`, or `f64` result, but this expression requires `{expected}`",
                        binary.operator
                    ),
                ));
            }
            expected
        };

        if binary.operator == "/" && !matches!(operand_type, "f32" | "f64") {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-001",
                "uaal.expression.float.binary.v1",
                "operator `/` is available only for explicitly typed `f32` or `f64` expressions",
            ));
        }

        for (side, operand) in [
            ("left", binary.left.as_ref()),
            ("right", binary.right.as_ref()),
        ] {
            if !self.is_proven_numeric_expression(operand, operand_type) {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-001",
                    "uaal.expression.numeric.binary.v2",
                    format!(
                        "{side} operand of `{}` is not proven `{operand_type}`; annotate parameters, locals, and callee returns because compile_to_uaal does not erase numeric widths",
                        binary.operator,
                    ),
                ));
            }
        }

        self.emit_expression_with_expected(&binary.left, Some(operand_type))?;
        self.emit_expression_with_expected(&binary.right, Some(operand_type))?;
        let abi = match operand_type {
            "f32" => HS_F32_BINARY_ABI,
            "f64" => HS_F64_BINARY_ABI,
            _ => HS_I32_BINARY_ABI,
        };
        self.emit_op(
            OP_EXEC,
            vec![Value::from(abi), Value::from(binary.operator.clone())],
        );
        Ok(())
    }

    fn emit_logical_expression(
        &mut self,
        binary: &BinaryExpression,
        expected_type: Option<&str>,
    ) -> Result<(), UaalEmitError> {
        if let Some(expected) = expected_type {
            if !is_bool_annotation(expected) {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-002",
                    "uaal.expression.logical.short_circuit.v1",
                    format!(
                        "operator `{}` produces `bool`, but this expression requires `{expected}`",
                        binary.operator
                    ),
                ));
            }
        }

        for (side, operand) in [
            ("left", binary.left.as_ref()),
            ("right", binary.right.as_ref()),
        ] {
            if !self.is_proven_bool_expression(operand) {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-002",
                    "uaal.expression.logical.short_circuit.v1",
                    format!(
                        "{side} operand of `{}` is not proven `bool`; annotate bindings and callee returns because compile_to_uaal does not inherit the VM's generic truthiness",
                        binary.operator
                    ),
                ));
            }
        }

        self.emit_expression_with_expected(&binary.left, Some("bool"))?;
        let jump_if = self.emit_op(OP_JUMP_IF, Vec::new());

        match binary.operator.as_str() {
            "&&" => {
                self.emit_op(OP_PUSH, vec![Value::from(false)]);
                let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
                let right_start = self.instructions.len();
                self.instructions[jump_if].operands = vec![Value::from(right_start)];
                self.emit_expression_with_expected(&binary.right, Some("bool"))?;
                let end = self.instructions.len();
                self.instructions[jump_to_end].operands = vec![Value::from(end)];
            }
            "||" => {
                self.emit_expression_with_expected(&binary.right, Some("bool"))?;
                let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
                let true_start = self.instructions.len();
                self.instructions[jump_if].operands = vec![Value::from(true_start)];
                self.emit_op(OP_PUSH, vec![Value::from(true)]);
                let end = self.instructions.len();
                self.instructions[jump_to_end].operands = vec![Value::from(end)];
            }
            _ => unreachable!("emit_logical_expression only admits && and ||"),
        }

        Ok(())
    }

    fn infer_numeric_operand_type(
        &self,
        binary: &BinaryExpression,
    ) -> Result<&'static str, UaalEmitError> {
        let left = self.known_numeric_expression_type(&binary.left);
        let right = self.known_numeric_expression_type(&binary.right);
        match (left, right) {
            (Some(left), Some(right)) if left != right => Err(Self::target_capability_error(
                "HS-UAAL-CAP-001",
                "uaal.expression.numeric.binary.v2",
                format!(
                    "operator `{}` has incompatible `{left}` and `{right}` operands; implicit numeric coercions are forbidden",
                    binary.operator
                ),
            )),
            (Some(known), _) | (_, Some(known)) => Ok(known),
            (None, None) => Ok("i32"),
        }
    }

    fn known_numeric_expression_type(&self, node: &AstNode) -> Option<&'static str> {
        let annotation_type = |annotation: &str| match annotation {
            "i32" => Some("i32"),
            "f32" => Some("f32"),
            "f64" => Some("f64"),
            _ => None,
        };
        match node {
            AstNode::Identifier(identifier) => self
                .current_binding_types
                .get(&identifier.name)
                .and_then(|annotation| annotation.as_deref())
                .and_then(annotation_type),
            AstNode::CallExpression(call) => {
                let AstNode::Identifier(callee) = call.callee.as_ref() else {
                    return None;
                };
                self.function_return_types
                    .get(&callee.name)
                    .and_then(|annotation| annotation.as_deref())
                    .and_then(annotation_type)
            }
            AstNode::BinaryExpression(binary)
                if matches!(binary.operator.as_str(), "+" | "-" | "*" | "/") =>
            {
                let left = self.known_numeric_expression_type(&binary.left);
                let right = self.known_numeric_expression_type(&binary.right);
                match (left, right) {
                    (Some(left), Some(right)) if left == right => Some(left),
                    (Some(known), None) | (None, Some(known)) => Some(known),
                    _ => None,
                }
            }
            _ => None,
        }
    }

    fn is_proven_numeric_expression(&self, node: &AstNode, expected: &str) -> bool {
        match node {
            AstNode::Number(value) if expected == "f32" => {
                value.value.is_finite() && (value.value as f32).is_finite()
            }
            AstNode::Number(value) if expected == "f64" => value.value.is_finite(),
            AstNode::Number(value) if expected == "i32" => {
                value.value.is_finite()
                    && value.value.fract() == 0.0
                    && value.value >= i32::MIN as f64
                    && value.value <= i32::MAX as f64
            }
            AstNode::Identifier(identifier) => {
                self.current_binding_types
                    .get(&identifier.name)
                    .and_then(|annotation| annotation.as_deref())
                    == Some(expected)
            }
            AstNode::CallExpression(call) => {
                let AstNode::Identifier(callee) = call.callee.as_ref() else {
                    return false;
                };
                self.function_return_types
                    .get(&callee.name)
                    .and_then(|annotation| annotation.as_deref())
                    == Some(expected)
            }
            AstNode::BinaryExpression(binary) => {
                let operator_supported = if matches!(expected, "f32" | "f64") {
                    matches!(binary.operator.as_str(), "+" | "-" | "*" | "/")
                } else {
                    matches!(binary.operator.as_str(), "+" | "-" | "*")
                };
                operator_supported
                    && self.is_proven_numeric_expression(&binary.left, expected)
                    && self.is_proven_numeric_expression(&binary.right, expected)
            }
            _ => false,
        }
    }

    fn is_proven_bool_expression(&self, node: &AstNode) -> bool {
        match node {
            AstNode::Boolean(_) => true,
            AstNode::Identifier(identifier) => self
                .current_binding_types
                .get(&identifier.name)
                .and_then(|annotation| annotation.as_deref())
                .is_some_and(is_bool_annotation),
            AstNode::CallExpression(call) => {
                let AstNode::Identifier(callee) = call.callee.as_ref() else {
                    return false;
                };
                self.function_return_types
                    .get(&callee.name)
                    .and_then(|annotation| annotation.as_deref())
                    .is_some_and(is_bool_annotation)
            }
            AstNode::BinaryExpression(binary) => {
                matches!(
                    binary.operator.as_str(),
                    "==" | "!=" | "<" | "<=" | ">" | ">="
                ) || (matches!(binary.operator.as_str(), "&&" | "||")
                    && self.is_proven_bool_expression(&binary.left)
                    && self.is_proven_bool_expression(&binary.right))
            }
            _ => false,
        }
    }

    fn emit_call(&mut self, target: &str) {
        let instruction_index = self.emit_op(OP_CALL, Vec::new());
        self.pending_calls.push(PendingCall {
            instruction_index,
            target: target.to_string(),
        });
    }

    fn emit_op(&mut self, op_code: u16, operands: Vec<Value>) -> usize {
        let index = self.instructions.len();
        self.instructions
            .push(UaalInstruction { op_code, operands });
        index
    }

    fn current_function_name(&self) -> Result<&str, UaalEmitError> {
        self.current_function
            .as_deref()
            .ok_or_else(|| UaalEmitError::new("internal compile_to_uaal error: no active function"))
    }

    fn current_function_return_type(&self) -> Result<Option<&String>, UaalEmitError> {
        let function_name = self.current_function_name()?;
        Ok(self
            .function_return_types
            .get(function_name)
            .and_then(Option::as_ref))
    }

    fn target_capability_error(
        code: &str,
        capability: &str,
        detail: impl Into<String>,
    ) -> UaalEmitError {
        UaalEmitError::new(format!(
            "[{code}] target capability `{capability}` is unavailable: {}",
            detail.into()
        ))
    }

    fn slot_key(function_name: &str, name: &str) -> String {
        format!("__hs::{function_name}::{name}")
    }
}

fn is_bool_annotation(annotation: &str) -> bool {
    matches!(annotation.trim(), "bool" | "Boolean")
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

    fn compile(src: &str) -> UaalBytecode {
        compile_source_to_uaal(src).expect("compile_to_uaal should succeed")
    }

    #[test]
    fn lowers_main_call_to_helper_with_call_ret() {
        let bytecode = compile(
            r#"function helper() {
  return 42
}

function main() {
  return helper()
}"#,
        );

        let ops = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();

        assert_eq!(bytecode.version, 1);
        assert_eq!(
            ops,
            vec![OP_CALL, OP_HALT, OP_PUSH, OP_RET, OP_RET, OP_CALL, OP_RET, OP_RET]
        );
        assert_eq!(bytecode.instructions[0].operands, vec![Value::from(5)]);
        assert_eq!(bytecode.instructions[5].operands, vec![Value::from(2)]);
    }

    #[test]
    fn lowers_function_parameter_to_state_slot_and_call_argument() {
        let bytecode = compile(
            r#"function echo(x) {
  return x
}

function main() {
  return echo(42)
}"#,
        );

        let ops = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();

        assert_eq!(
            ops,
            vec![
                OP_CALL,
                OP_HALT,
                OP_STATE_SET,
                OP_STATE_GET,
                OP_RET,
                OP_RET,
                OP_PUSH,
                OP_CALL,
                OP_RET,
                OP_RET
            ]
        );
        assert_eq!(bytecode.instructions[0].operands, vec![Value::from(6)]);
        assert_eq!(
            bytecode.instructions[2].operands,
            vec![Value::from("__hs::echo::x")]
        );
        assert_eq!(
            bytecode.instructions[3].operands,
            vec![Value::from("__hs::echo::x")]
        );
        assert_eq!(bytecode.instructions[6].operands, vec![Value::from(42.0)]);
        assert_eq!(bytecode.instructions[7].operands, vec![Value::from(2)]);
    }

    #[test]
    fn lowers_recursive_parameterized_if_to_jumps_and_calls() {
        let bytecode = compile(
            r#"function countdown(active) {
  if (active) {
    return countdown(false)
  } else {
    return "done"
  }
}

function main() {
  return countdown(true)
}"#,
        );

        let ops = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();

        assert!(ops.contains(&OP_JUMP_IF), "{ops:?}");
        assert!(ops.contains(&OP_JUMP), "{ops:?}");
        assert_eq!(
            ops.iter().filter(|op| **op == OP_CALL).count(),
            3,
            "{ops:?}"
        );
        assert_eq!(
            bytecode.instructions[2].operands,
            vec![Value::from("__hs::countdown::active")]
        );
        assert_eq!(
            bytecode.instructions[3].operands,
            vec![Value::from("__hs::countdown::active")]
        );
    }

    #[test]
    fn lowers_i32_decision_kernel_with_binary_exec_and_bounded_while() {
        let bytecode = compile(
            r#"function decide(score: i32): i32 {
  while (score >= 6) {
    return score * 7
  }
  return score + 1
}

function main(): i32 {
  return decide(6)
}"#,
        );

        let binary_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| instruction.op_code == 0x20)
            .collect::<Vec<_>>();
        assert_eq!(binary_instructions.len(), 3);
        assert_eq!(
            binary_instructions[0].operands,
            vec![Value::from("hs.i32.binary.v1"), Value::from(">=")]
        );
        assert_eq!(
            binary_instructions[1].operands,
            vec![Value::from("hs.i32.binary.v1"), Value::from("*")]
        );
        assert_eq!(
            binary_instructions[2].operands,
            vec![Value::from("hs.i32.binary.v1"), Value::from("+")]
        );

        let back_edge = bytecode
            .instructions
            .iter()
            .enumerate()
            .find(|(index, instruction)| {
                instruction.op_code == OP_JUMP
                    && instruction
                        .operands
                        .first()
                        .and_then(Value::as_u64)
                        .is_some_and(|target| target < *index as u64)
            });
        assert!(
            back_edge.is_some(),
            "bounded while lowering must contain a real backward jump: {:?}",
            bytecode.instructions
        );
    }

    #[test]
    fn lowers_f64_arithmetic_and_comparisons_to_the_typed_exec_abi() {
        let bytecode = compile(
            r#"function blend(start: f64, end: f64, amount: f64): f64 {
  return start + (end - start) * amount
}

function half(value: f64): f64 {
  return value / 2.0
}

function main(): i32 {
  let blended: f64 = blend(2.0, 8.0, 0.5)
  if (blended == 5.0 && half(10.0) >= 5.0) {
    return 5
  }
  return 1
}"#,
        );

        let f64_binary_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| {
                instruction.op_code == OP_EXEC
                    && instruction.operands.first()
                        == Some(&Value::from("hs.f64.binary.v1"))
            })
            .collect::<Vec<_>>();
        assert_eq!(f64_binary_instructions.len(), 6);
        assert_eq!(
            f64_binary_instructions
                .iter()
                .map(|instruction| instruction.operands[1].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["-", "*", "+", "/", "==", ">="]
        );
    }

    #[test]
    fn lowers_f32_with_rounded_literals_and_a_distinct_exec_abi() {
        let bytecode = compile(
            r#"function rounded_literal(): f32 {
  return 16777217.0
}

function blend(start: f32, end: f32, amount: f32): f32 {
  return start + (end - start) * amount
}

function tenth(value: f32): f32 {
  return value / 10.0
}

function main(): i32 {
  let midpoint: f32 = blend(16777216.0, 16777218.0, 0.5)
  if (rounded_literal() == 16777216.0 && midpoint == 16777216.0 && tenth(1.0) == 0.10000000149011612) {
    return 5
  }
  return 1
}"#,
        );

        let f32_binary_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| {
                instruction.op_code == OP_EXEC
                    && instruction.operands.first()
                        == Some(&Value::from("hs.f32.binary.v1"))
            })
            .collect::<Vec<_>>();
        assert_eq!(f32_binary_instructions.len(), 7);
        assert_eq!(
            f32_binary_instructions
                .iter()
                .map(|instruction| instruction.operands[1].as_str().unwrap())
                .collect::<Vec<_>>(),
            vec!["-", "*", "+", "/", "==", "==", "=="]
        );
        assert!(
            bytecode.instructions.iter().any(|instruction| {
                instruction.op_code == OP_PUSH
                    && instruction.operands == vec![Value::from(16_777_216.0)]
            }),
            "f32 literal 16777217.0 must be rounded before entering UAAL"
        );
        assert!(
            bytecode.instructions.iter().all(|instruction| {
                instruction.op_code != OP_PUSH
                    || instruction.operands != vec![Value::from(16_777_217.0)]
            }),
            "unrounded f32 literal must never enter UAAL"
        );
    }

    #[test]
    fn lowers_typed_short_circuit_logic_to_lazy_jump_graphs() {
        let bytecode = compile(
            r#"function expensive_policy(): bool {
  return false
}

function main(): i32 {
  if (false && expensive_policy()) {
    return 9
  }
  if (true || expensive_policy()) {
    return 5
  }
  return 0
}"#,
        );

        let ops = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();

        assert_eq!(
            ops.iter().filter(|op| **op == OP_CALL).count(),
            3,
            "bootstrap plus both statically present RHS calls must be emitted: {ops:?}"
        );
        assert!(
            ops.iter().filter(|op| **op == OP_JUMP_IF).count() >= 4,
            "logical and outer if branches must use real conditional jumps: {ops:?}"
        );
        assert!(
            ops.iter().filter(|op| **op == OP_JUMP).count() >= 4,
            "each logical expression and outer if must patch a real end jump: {ops:?}"
        );
    }

    #[test]
    fn lowers_nested_logical_expressions_over_typed_boolean_bindings() {
        let bytecode = compile(
            r#"function decide(enabled: bool, ready: bool): bool {
  return enabled && (ready || false)
}

function main(): bool {
  return decide(false, true)
}"#,
        );

        let ops = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();
        assert_eq!(
            ops.iter().filter(|op| **op == OP_JUMP_IF).count(),
            2,
            "nested logical expressions must retain both lazy branches: {ops:?}"
        );
        assert_eq!(
            ops.iter().filter(|op| **op == OP_JUMP).count(),
            2,
            "nested logical expressions must patch both branch ends: {ops:?}"
        );
    }

    #[test]
    fn patches_logical_branch_targets_to_stack_balanced_joins() {
        let and_bytecode = compile(
            r#"function rhs(): bool { return true }
function main(): bool { return false && rhs() }"#,
        );
        let and_jump_if = and_bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_JUMP_IF)
            .expect("&& must emit JUMP_IF");
        let and_jump = and_bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_JUMP)
            .expect("&& must emit JUMP");
        let and_rhs_call = and_bytecode
            .instructions
            .iter()
            .rposition(|instruction| instruction.op_code == OP_CALL)
            .expect("&& RHS call must remain in bytecode");
        assert_eq!(
            and_bytecode.instructions[and_jump_if].operands,
            vec![Value::from(and_rhs_call)]
        );
        assert_eq!(
            and_bytecode.instructions[and_jump].operands,
            vec![Value::from(and_rhs_call + 1)]
        );
        assert_eq!(
            and_bytecode.instructions[and_jump_if + 1],
            UaalInstruction {
                op_code: OP_PUSH,
                operands: vec![Value::from(false)],
            }
        );

        let or_bytecode = compile(
            r#"function rhs(): bool { return false }
function main(): bool { return true || rhs() }"#,
        );
        let or_jump_if = or_bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_JUMP_IF)
            .expect("|| must emit JUMP_IF");
        let or_jump = or_bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_JUMP)
            .expect("|| must emit JUMP");
        let true_start = or_jump + 1;
        let end = true_start + 1;
        assert_eq!(
            or_bytecode.instructions[or_jump_if].operands,
            vec![Value::from(true_start)]
        );
        assert_eq!(
            or_bytecode.instructions[or_jump].operands,
            vec![Value::from(end)]
        );
        assert_eq!(
            or_bytecode.instructions[true_start],
            UaalInstruction {
                op_code: OP_PUSH,
                operands: vec![Value::from(true)],
            }
        );
    }

    #[test]
    fn rejects_known_non_boolean_logical_operands_before_lowering() {
        for (condition, side) in [("1 && true", "left"), ("true || 1", "right")] {
            let source = format!(
                r#"function main(): i32 {{
  if ({condition}) {{
    return 1
  }}
  return 0
}}"#
            );
            let error = compile_source_to_uaal(&source)
                .expect_err("known non-boolean logical operands must fail semantic checking");

            assert!(
                error.message.contains("[HS-TYPE-LOGICAL-001]"),
                "{}",
                error.message
            );
            assert!(
                error.message.contains(&format!("{side} operand")),
                "{}",
                error.message
            );
        }
    }

    #[test]
    fn rejects_unproven_logical_operands_instead_of_inheriting_vm_truthiness() {
        let error = compile_source_to_uaal(
            r#"function dynamic_flag() {
  return true
}

function main(): i32 {
  if (dynamic_flag() && true) {
    return 1
  }
  return 0
}"#,
        )
        .expect_err("UAAL lowering requires target-proven boolean operands");

        assert!(
            error.message.contains("[HS-UAAL-CAP-002]"),
            "{}",
            error.message
        );
        assert!(
            error
                .message
                .contains("does not inherit the VM's generic truthiness"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_untyped_arithmetic_instead_of_assuming_i32_width() {
        let error = compile_source_to_uaal(
            r#"function main() {
  return 20 + 22
}"#,
        )
        .expect_err("untyped numeric arithmetic must not silently become wrapping i32");

        assert!(
            error.message.contains("[HS-UAAL-CAP-001]"),
            "{}",
            error.message
        );
        assert!(
            error.message.contains("no proven result width"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_explicit_return_type_mismatch_before_lowering() {
        let error = compile_source_to_uaal(r#"function main(): i32 { return true }"#)
            .expect_err("typed return mismatch must fail before UAAL lowering");

        assert!(
            error.message.contains("[HS-TYPE-RETURN-001]"),
            "{}",
            error.message
        );
        assert!(
            error.message.contains("expected `i32`, found `bool`"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_explicit_assignment_type_mismatch_before_lowering() {
        let error = compile_source_to_uaal(
            r#"function main(): i32 {
  var decision: i32 = 1
  decision = false
  return decision
}"#,
        )
        .expect_err("typed assignment mismatch must fail before UAAL lowering");

        assert!(
            error.message.contains("[HS-TYPE-ASSIGN-001]"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_explicit_call_argument_type_mismatch_before_lowering() {
        let error = compile_source_to_uaal(
            r#"function decide(score: i32): i32 { return score }
function main(): i32 { return decide(true) }"#,
        )
        .expect_err("typed call argument mismatch must fail before UAAL lowering");

        assert!(
            error.message.contains("[HS-TYPE-ARG-001]"),
            "{}",
            error.message
        );
    }

    #[test]
    fn rejects_unresolved_function_calls() {
        let error = compile_source_to_uaal(
            r#"function main() {
  return missing()
}"#,
        )
        .expect_err("missing function should fail");

        assert!(error.message.contains("unresolved function call `missing`"));
    }

    #[test]
    fn rejects_owned_buffers_until_ownership_opcodes_exist() {
        let error = compile_source_to_uaal(
            r#"function main(): i32 {
  let values: [i32] = buffer(2, 0)
  return 5
}"#,
        )
        .expect_err("compile_to_uaal must not silently erase native owned-buffer semantics");

        assert!(error.message.contains(
            "owned buffer type `[i32]` in local `values` requires allocator, move, and drop opcodes"
        ));
    }

    #[test]
    fn rejects_owned_transfer_abi_until_ownership_opcodes_exist() {
        let error = compile_source_to_uaal(
            r#"function relay(values: [i32]): [i32] {
  return move(values)
}
function main(): i32 { return 5 }"#,
        )
        .expect_err("compile_to_uaal must not erase the owned return ABI");

        assert!(error.message.contains(
            "owned buffer type `[i32]` in return type of function `relay` requires allocator, move, and drop opcodes"
        ));
    }

    #[test]
    fn rejects_owned_aggregate_fields_until_ownership_opcodes_exist() {
        let error = compile_source_to_uaal(
            r#"struct Packet { values: [i32] }
function main(): i32 {
  slot packet: Packet = Packet(buffer(2, 5))
  return 5
}"#,
        )
        .expect_err("compile_to_uaal must not erase owned aggregate field semantics");

        assert!(error.message.contains(
            "owned buffer type `[i32]` in field `values` of struct `Packet` requires allocator, move, and drop opcodes"
        ));
    }

    #[test]
    fn rejects_function_call_arity_mismatch() {
        let error = compile_source_to_uaal(
            r#"function echo(x) {
  return x
}

function main() {
  return echo()
}"#,
        )
        .expect_err("arity mismatch should fail");

        assert!(
            error
                .message
                .contains("arity mismatch calling `echo` in compile_to_uaal: expected 1, got 0"),
            "{}",
            error.message
        );
    }

    #[test]
    fn native_json_export_serializes_bytecode_packet() {
        let json = compile_source_to_uaal_json(
            r#"function main() {
  return "ready"
}"#,
        )
        .expect("compile_to_uaal json should succeed");

        assert!(json.contains(r#""version":1"#), "{json}");
        assert!(json.contains(r#""opCode":1"#), "{json}");
        assert!(json.contains(r#""opCode":255"#), "{json}");
    }
}
