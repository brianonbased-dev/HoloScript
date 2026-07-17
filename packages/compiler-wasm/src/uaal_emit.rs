//! Minimal `.hs` function-to-UAAL bytecode emitter.
//!
//! This backend intentionally starts at the narrow symbol-resolution seam the
//! VM can prove today: top-level functions, literal return values, stack-passed
//! call arguments, simple state-backed slots, and direct calls lowered to real
//! `CALL`/`RET` instructions.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::ast::{Ast, AstNode, CallExpression, FunctionNode};
use crate::kotlin_emit::{check_semantics, SemanticDiagnostic};

const OP_PUSH: u16 = 0x01;
const OP_JUMP: u16 = 0x30;
const OP_JUMP_IF: u16 = 0x31;
const OP_CALL: u16 = 0x32;
const OP_RET: u16 = 0x33;
const OP_STATE_SET: u16 = 0xcb;
const OP_STATE_GET: u16 = 0xcc;
const OP_HALT: u16 = 0xff;

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
    entry_points: HashMap<String, usize>,
    pending_calls: Vec<PendingCall>,
    instructions: Vec<UaalInstruction>,
    current_function: Option<String>,
    current_bindings: HashSet<String>,
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

    validate_imports_resolved(ast, &function_names)?;

    let mut emitter = UaalEmitter {
        functions,
        function_names,
        function_params,
        entry_points: HashMap::new(),
        pending_calls: Vec::new(),
        instructions: Vec::new(),
        current_function: None,
        current_bindings: HashSet::new(),
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
                    self.emit_expression(argument)?;
                }
                self.emit_op(OP_RET, Vec::new());
                Ok(())
            }
            AstNode::CallExpression(call) => self.emit_call_expression(call),
            AstNode::If(if_node) => self.emit_if(if_node),
            AstNode::VariableDeclaration(var) => {
                self.emit_expression(&var.value)?;
                let slot = Self::slot_key(self.current_function_name()?, &var.name);
                self.current_bindings.insert(var.name.clone());
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
                self.emit_expression(&assignment.value)?;
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

    fn emit_expression(&mut self, node: &AstNode) -> Result<(), UaalEmitError> {
        match node {
            AstNode::String(value) => {
                self.emit_op(OP_PUSH, vec![Value::from(value.value.clone())]);
                Ok(())
            }
            AstNode::Number(value) => {
                self.emit_op(OP_PUSH, vec![Value::from(value.value)]);
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

        for argument in &call.arguments {
            self.emit_expression(argument)?;
        }
        self.emit_call(callee);
        Ok(())
    }

    fn emit_if(&mut self, if_node: &crate::ast::IfNode) -> Result<(), UaalEmitError> {
        self.emit_expression(&if_node.test)?;

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

    fn slot_key(function_name: &str, name: &str) -> String {
        format!("__hs::{function_name}::{name}")
    }
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
