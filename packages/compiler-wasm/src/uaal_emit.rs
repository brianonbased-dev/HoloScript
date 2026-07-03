//! Minimal `.hs` function-to-UAAL bytecode emitter.
//!
//! This backend intentionally starts at the narrow symbol-resolution seam the
//! VM can prove today: top-level functions, literal return values, and
//! non-recursive direct calls lowered to real `CALL`/`RET` instructions.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::ast::{Ast, AstNode, CallExpression, FunctionNode};
use crate::kotlin_emit::{check_top_level_declaration_collisions, SemanticDiagnostic};

const OP_PUSH: u16 = 0x01;
const OP_CALL: u16 = 0x32;
const OP_RET: u16 = 0x33;
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
    entry_points: HashMap<String, usize>,
    pending_calls: Vec<PendingCall>,
    instructions: Vec<UaalInstruction>,
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
    check_top_level_declaration_collisions(ast)?;

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

    validate_imports_resolved(ast, &function_names)?;

    let mut emitter = UaalEmitter {
        functions,
        function_names,
        entry_points: HashMap::new(),
        pending_calls: Vec::new(),
        instructions: Vec::new(),
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
            if !function.params.is_empty() {
                return Err(UaalEmitError::new(format!(
                    "compile_to_uaal does not support function parameters yet: `{}` has {}",
                    function.name,
                    function.params.len()
                )));
            }

            self.entry_points
                .insert(function.name.clone(), self.instructions.len());
            for statement in &function.body {
                self.emit_statement(statement)?;
            }
            self.emit_op(OP_RET, Vec::new());
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
        if !call.arguments.is_empty() {
            return Err(UaalEmitError::new(format!(
                "compile_to_uaal does not support call arguments yet: `{}` has {}",
                callee,
                call.arguments.len()
            )));
        }

        self.emit_call(callee);
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
