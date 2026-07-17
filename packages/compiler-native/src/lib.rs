//! Sovereign native machine-code backend for HoloScript.
//!
//! `hs-machine-v0` proves a single untyped integer entry point. `hs-machine-v1` adds
//! explicit `i32`/`i64` function signatures, direct HoloScript calls, and immutable
//! typed local bindings. `hs-machine-v2` adds typed, non-escaping addressable stack
//! slots with explicit loads and stores. `hs-machine-v3` adds typed references whose
//! provenance and borrow state remain compiler-owned rather than becoming integer
//! addresses. `hs-machine-v4` adds lexical lifetime boundaries that release scoped
//! borrows and remove scoped bindings. `hs-machine-v5` adds native booleans,
//! comparisons, short-circuit logic, branches, and bounded while loops with cleanup
//! on every lexical-scope exit. `hs-machine-v6` adds typed, contiguous stack aggregates
//! with deterministic field layout. `hs-machine-v7` adds fixed-size scalar arrays and
//! bounds-checked half-open slice projections. `hs-machine-v8` adds local, non-escaping
//! borrowed slice values with lexical alias leases. `hs-machine-v9` adds direct-call
//! borrowed slice parameters with an explicit base-plus-length ABI, caller-side alias
//! validation, and callee-side bounds checks. `hs-machine-v10` adds call-duration
//! forwarding and literal sub-slice reborrows while keeping root provenance and alias
//! state compiler-owned. `hs-machine-v11` adds runtime-indexed named sub-slice
//! reborrows with signed range guards before pointer arithmetic. Everything outside the
//! selected contract fails closed with a native compile diagnostic.

use std::collections::{HashMap, HashSet};
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use cranelift::codegen::ir::{
    condcodes::IntCC, types, AbiParam, InstBuilder, MemFlags, StackSlot, StackSlotData,
    StackSlotKind, TrapCode, Type, UserFuncName, Value,
};
use cranelift::codegen::settings;
use cranelift::frontend::{FunctionBuilder, FunctionBuilderContext};
use cranelift::module::{default_libcall_names, FuncId, Linkage, Module};
use cranelift::object::{ObjectBuilder, ObjectModule};
use holoscript_wasm::ast::{
    AssignmentNode, Ast, AstNode, BinaryExpression, CallExpression, FunctionNode, MemberExpression,
};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const MACHINE_CONTRACT: &str = "hs-machine-v0";
pub const TYPED_MACHINE_CONTRACT: &str = "hs-machine-v1";
pub const MEMORY_MACHINE_CONTRACT: &str = "hs-machine-v2";
pub const REFERENCE_MACHINE_CONTRACT: &str = "hs-machine-v3";
pub const REFERENCE_SCOPE_MACHINE_CONTRACT: &str = "hs-machine-v4";
pub const CONTROL_FLOW_MACHINE_CONTRACT: &str = "hs-machine-v5";
pub const AGGREGATE_MACHINE_CONTRACT: &str = "hs-machine-v6";
pub const FIXED_ARRAY_MACHINE_CONTRACT: &str = "hs-machine-v7";
pub const SLICE_MACHINE_CONTRACT: &str = "hs-machine-v8";
pub const SLICE_CALL_MACHINE_CONTRACT: &str = "hs-machine-v9";
pub const SLICE_FORWARD_MACHINE_CONTRACT: &str = "hs-machine-v10";
pub const SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT: &str = "hs-machine-v11";

struct CompiledObject {
    bytes: Vec<u8>,
    machine_contract: &'static str,
}

#[derive(Debug, Clone, Default)]
pub struct NativeCompileOptions {
    pub linker: Option<PathBuf>,
}

impl NativeCompileOptions {
    pub fn host() -> Self {
        Self::default()
    }

    pub fn with_linker(linker: impl Into<PathBuf>) -> Self {
        Self {
            linker: Some(linker.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeArtifact {
    pub machine_contract: &'static str,
    pub object_bytes: usize,
    pub object_sha256: String,
    pub executable: PathBuf,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeFieldLayout {
    pub name: String,
    pub machine_type: String,
    pub offset: u32,
    pub size: u32,
    pub alignment: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeStructLayout {
    pub name: String,
    pub size: u32,
    pub alignment: u32,
    pub fields: Vec<NativeFieldLayout>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeCompileError {
    message: String,
}

impl NativeCompileError {
    fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for NativeCompileError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.message)
    }
}

impl std::error::Error for NativeCompileError {}

/// Compile canonical `.hs` source into a host-native relocatable object.
pub fn compile_object(
    source: &str,
    options: &NativeCompileOptions,
) -> Result<Vec<u8>, NativeCompileError> {
    Ok(compile_unit(source, options)?.bytes)
}

/// Parse canonical HoloScript and report the exact native v6 aggregate layouts.
pub fn inspect_native_layouts(source: &str) -> Result<Vec<NativeStructLayout>, NativeCompileError> {
    let ast = holoscript_wasm::parse_ast(source).map_err(|diagnostics| {
        let rendered = diagnostics
            .into_iter()
            .map(|diagnostic| {
                format!(
                    "{}:{}: {}",
                    diagnostic.line, diagnostic.column, diagnostic.message
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        NativeCompileError::new(format!("HoloScript parse failed: {rendered}"))
    })?;
    collect_aggregate_layouts(&ast, AGGREGATE_MACHINE_CONTRACT).map(|layouts| {
        layouts
            .into_iter()
            .map(AggregateLayout::into_public)
            .collect()
    })
}

fn compile_unit(
    source: &str,
    _options: &NativeCompileOptions,
) -> Result<CompiledObject, NativeCompileError> {
    let ast = holoscript_wasm::parse_ast(source).map_err(|diagnostics| {
        let rendered = diagnostics
            .into_iter()
            .map(|diagnostic| {
                format!(
                    "{}:{}: {}",
                    diagnostic.line, diagnostic.column, diagnostic.message
                )
            })
            .collect::<Vec<_>>()
            .join("; ");
        NativeCompileError::new(format!("HoloScript parse failed: {rendered}"))
    })?;

    if has_runtime_slice_forward_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT, true)?,
            machine_contract: SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT,
        })
    } else if has_slice_forward_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, SLICE_FORWARD_MACHINE_CONTRACT, true)?,
            machine_contract: SLICE_FORWARD_MACHINE_CONTRACT,
        })
    } else if has_slice_parameter_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, SLICE_CALL_MACHINE_CONTRACT, true)?,
            machine_contract: SLICE_CALL_MACHINE_CONTRACT,
        })
    } else if has_slice_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, SLICE_MACHINE_CONTRACT, true)?,
            machine_contract: SLICE_MACHINE_CONTRACT,
        })
    } else if has_fixed_array_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, FIXED_ARRAY_MACHINE_CONTRACT, true)?,
            machine_contract: FIXED_ARRAY_MACHINE_CONTRACT,
        })
    } else if has_aggregate_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, AGGREGATE_MACHINE_CONTRACT, true)?,
            machine_contract: AGGREGATE_MACHINE_CONTRACT,
        })
    } else if has_control_flow_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, CONTROL_FLOW_MACHINE_CONTRACT, true)?,
            machine_contract: CONTROL_FLOW_MACHINE_CONTRACT,
        })
    } else if has_scope_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, REFERENCE_SCOPE_MACHINE_CONTRACT, true)?,
            machine_contract: REFERENCE_SCOPE_MACHINE_CONTRACT,
        })
    } else if has_reference_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, REFERENCE_MACHINE_CONTRACT, true)?,
            machine_contract: REFERENCE_MACHINE_CONTRACT,
        })
    } else if has_memory_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, MEMORY_MACHINE_CONTRACT, true)?,
            machine_contract: MEMORY_MACHINE_CONTRACT,
        })
    } else if has_typed_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, TYPED_MACHINE_CONTRACT, false)?,
            machine_contract: TYPED_MACHINE_CONTRACT,
        })
    } else {
        Ok(CompiledObject {
            bytes: lower_v0_ast_to_object(&ast)?,
            machine_contract: MACHINE_CONTRACT,
        })
    }
}

/// Compile canonical `.hs` source, link it with the host C runtime, and return a receipt.
pub fn compile_executable(
    source: &str,
    executable: impl AsRef<Path>,
    options: &NativeCompileOptions,
) -> Result<NativeArtifact, NativeCompileError> {
    let executable = executable.as_ref().to_path_buf();
    if let Some(parent) = executable.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeCompileError::new(format!(
                "failed to create output directory {}: {error}",
                parent.display()
            ))
        })?;
    }

    let compiled = compile_unit(source, options)?;
    let object = compiled.bytes;
    let object_path = executable.with_extension(if cfg!(windows) { "obj" } else { "o" });
    fs::write(&object_path, &object).map_err(|error| {
        NativeCompileError::new(format!(
            "failed to write native object {}: {error}",
            object_path.display()
        ))
    })?;

    let linker = resolve_linker(options)?;
    let output = Command::new(&linker)
        .arg(&object_path)
        .arg("-o")
        .arg(&executable)
        .output()
        .map_err(|error| {
            NativeCompileError::new(format!(
                "failed to start native linker {}: {error}",
                linker.display()
            ))
        })?;

    let _ = fs::remove_file(&object_path);
    if !output.status.success() {
        return Err(NativeCompileError::new(format!(
            "native linker {} failed: {}",
            linker.display(),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    let digest = Sha256::digest(&object);
    Ok(NativeArtifact {
        machine_contract: compiled.machine_contract,
        object_bytes: object.len(),
        object_sha256: format!("{digest:x}"),
        executable,
    })
}

fn lower_v0_ast_to_object(ast: &Ast) -> Result<Vec<u8>, NativeCompileError> {
    let function = select_entry_function(ast)?;
    let expression = select_entry_expression(function)?;

    let mut module = create_object_module()?;

    let mut hs_signature = module.make_signature();
    hs_signature.returns.push(AbiParam::new(types::I64));
    let hs_main = module
        .declare_function("hs_main", Linkage::Export, &hs_signature)
        .map_err(|error| NativeCompileError::new(format!("declare hs_main failed: {error}")))?;

    let mut entry_signature = module.make_signature();
    entry_signature.returns.push(AbiParam::new(types::I32));
    let entry = module
        .declare_function("main", Linkage::Export, &entry_signature)
        .map_err(|error| NativeCompileError::new(format!("declare main failed: {error}")))?;

    let mut hs_context = module.make_context();
    hs_context.func.name = UserFuncName::user(0, hs_main.as_u32());
    hs_context.func.signature = hs_signature;
    let mut hs_builder_context = FunctionBuilderContext::new();
    {
        let mut builder = FunctionBuilder::new(&mut hs_context.func, &mut hs_builder_context);
        let block = builder.create_block();
        builder.switch_to_block(block);
        let value = lower_integer_expression(&mut builder, expression)?;
        builder.ins().return_(&[value]);
        builder.seal_all_blocks();
        builder.finalize();
    }
    module
        .define_function(hs_main, &mut hs_context)
        .map_err(|error| NativeCompileError::new(format!("define hs_main failed: {error}")))?;

    let mut entry_context = module.make_context();
    entry_context.func.name = UserFuncName::user(0, entry.as_u32());
    entry_context.func.signature = entry_signature;
    let mut entry_builder_context = FunctionBuilderContext::new();
    {
        let mut builder = FunctionBuilder::new(&mut entry_context.func, &mut entry_builder_context);
        let block = builder.create_block();
        builder.switch_to_block(block);
        let local_hs_main = module.declare_func_in_func(hs_main, builder.func);
        let call = builder.ins().call(local_hs_main, &[]);
        let value = builder.inst_results(call)[0];
        let exit_code = builder.ins().ireduce(types::I32, value);
        builder.ins().return_(&[exit_code]);
        builder.seal_all_blocks();
        builder.finalize();
    }
    module
        .define_function(entry, &mut entry_context)
        .map_err(|error| NativeCompileError::new(format!("define main failed: {error}")))?;

    module
        .finish()
        .emit()
        .map_err(|error| NativeCompileError::new(format!("object emission failed: {error}")))
}

fn create_object_module() -> Result<ObjectModule, NativeCompileError> {
    let flag_builder = settings::builder();
    let isa_builder = cranelift::native::builder()
        .map_err(|error| NativeCompileError::new(format!("unsupported host target: {error}")))?;
    let isa = isa_builder
        .finish(settings::Flags::new(flag_builder))
        .map_err(|error| NativeCompileError::new(format!("invalid host ISA settings: {error}")))?;
    let object_builder =
        ObjectBuilder::new(isa, "holoscript", default_libcall_names()).map_err(|error| {
            NativeCompileError::new(format!("object backend setup failed: {error}"))
        })?;
    Ok(ObjectModule::new(object_builder))
}

fn has_typed_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function.return_type.is_some()
            || !function.param_types.is_empty()
            || function.body.iter().any(|statement| {
                matches!(
                    statement,
                    AstNode::VariableDeclaration(local) if local.type_annotation.is_some()
                )
            })
    })
}

fn has_aggregate_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::StructDeclaration(structure) if !structure.field_types.is_empty()
        )
    })
}

fn has_fixed_array_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| match node {
        AstNode::Function(function) => {
            function
                .return_type
                .as_deref()
                .is_some_and(annotation_uses_fixed_array)
                || function
                    .param_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_uses_fixed_array(annotation))
                || function.body.iter().any(node_uses_fixed_array_type)
        }
        AstNode::StructDeclaration(structure) => structure
            .field_types
            .iter()
            .flatten()
            .any(|annotation| annotation_uses_fixed_array(annotation)),
        _ => false,
    })
}

fn has_slice_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| match node {
        AstNode::Function(function) => {
            function
                .return_type
                .as_deref()
                .is_some_and(annotation_uses_slice_reference)
                || function
                    .param_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_uses_slice_reference(annotation))
                || function.body.iter().any(node_uses_slice_reference_type)
        }
        AstNode::StructDeclaration(structure) => structure
            .field_types
            .iter()
            .flatten()
            .any(|annotation| annotation_uses_slice_reference(annotation)),
        _ => false,
    })
}

fn has_slice_parameter_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function)
                if function
                    .param_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_uses_slice_reference(annotation))
        )
    })
}

fn has_slice_forward_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        let mut slice_names = function
            .params
            .iter()
            .zip(function.param_types.iter())
            .filter_map(|(name, annotation)| {
                if annotation
                    .as_deref()
                    .is_some_and(annotation_uses_slice_reference)
                {
                    Some(name.clone())
                } else {
                    None
                }
            })
            .collect::<HashSet<_>>();
        body_uses_slice_forward(&function.body, &mut slice_names)
    })
}

fn body_uses_slice_forward(nodes: &[AstNode], slice_names: &mut HashSet<String>) -> bool {
    for node in nodes {
        if node_uses_slice_forward(node, slice_names) {
            return true;
        }
        if let AstNode::VariableDeclaration(local) = node {
            if local
                .type_annotation
                .as_deref()
                .is_some_and(annotation_uses_slice_reference)
            {
                slice_names.insert(local.name.clone());
            }
        }
    }
    false
}

fn node_uses_slice_forward(node: &AstNode, slice_names: &HashSet<String>) -> bool {
    match node {
        AstNode::CallExpression(call) => {
            call.arguments
                .iter()
                .any(|argument| slice_forward_argument(argument, slice_names))
                || node_uses_slice_forward(&call.callee, slice_names)
                || call
                    .arguments
                    .iter()
                    .any(|argument| node_uses_slice_forward(argument, slice_names))
        }
        AstNode::VariableDeclaration(local) => node_uses_slice_forward(&local.value, slice_names),
        AstNode::StackSlotDeclaration(slot) => node_uses_slice_forward(&slot.value, slice_names),
        AstNode::Return(return_node) => return_node
            .argument
            .as_deref()
            .is_some_and(|argument| node_uses_slice_forward(argument, slice_names)),
        AstNode::If(if_node) => {
            node_uses_slice_forward(&if_node.test, slice_names)
                || {
                    let mut consequent_names = slice_names.clone();
                    body_uses_slice_forward(&if_node.consequent, &mut consequent_names)
                }
                || if_node.alternate.as_ref().is_some_and(|alternate| {
                    let mut alternate_names = slice_names.clone();
                    body_uses_slice_forward(alternate, &mut alternate_names)
                })
        }
        AstNode::While(while_node) => {
            node_uses_slice_forward(&while_node.test, slice_names) || {
                let mut body_names = slice_names.clone();
                body_uses_slice_forward(&while_node.body, &mut body_names)
            }
        }
        AstNode::ForOf(for_node) => {
            node_uses_slice_forward(&for_node.range, slice_names) || {
                let mut body_names = slice_names.clone();
                body_uses_slice_forward(&for_node.body, &mut body_names)
            }
        }
        AstNode::For(for_node) => {
            for_node
                .init
                .as_deref()
                .is_some_and(|value| node_uses_slice_forward(value, slice_names))
                || for_node
                    .test
                    .as_deref()
                    .is_some_and(|value| node_uses_slice_forward(value, slice_names))
                || for_node
                    .update
                    .as_deref()
                    .is_some_and(|value| node_uses_slice_forward(value, slice_names))
                || {
                    let mut body_names = slice_names.clone();
                    body_uses_slice_forward(&for_node.body, &mut body_names)
                }
        }
        AstNode::LexicalScope(scope) => {
            let mut body_names = slice_names.clone();
            body_uses_slice_forward(&scope.body, &mut body_names)
        }
        AstNode::Assignment(assignment) => {
            node_uses_slice_forward(&assignment.target, slice_names)
                || node_uses_slice_forward(&assignment.value, slice_names)
        }
        AstNode::BinaryExpression(binary) => {
            node_uses_slice_forward(&binary.left, slice_names)
                || node_uses_slice_forward(&binary.right, slice_names)
        }
        AstNode::UnaryExpression(unary) => node_uses_slice_forward(&unary.argument, slice_names),
        AstNode::MemberExpression(member) => {
            node_uses_slice_forward(&member.object, slice_names)
                || node_uses_slice_forward(&member.property, slice_names)
        }
        _ => false,
    }
}

fn slice_forward_argument(argument: &AstNode, slice_names: &HashSet<String>) -> bool {
    match argument {
        AstNode::Identifier(identifier) => slice_names.contains(&identifier.name),
        AstNode::UnaryExpression(borrow) if matches!(borrow.operator.as_str(), "&" | "&mut") => {
            let AstNode::MemberExpression(range) = borrow.argument.as_ref() else {
                return false;
            };
            let AstNode::Identifier(root) = range.object.as_ref() else {
                return false;
            };
            slice_names.contains(&root.name)
        }
        _ => false,
    }
}

fn has_runtime_slice_forward_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        let mut slice_names = function
            .params
            .iter()
            .zip(function.param_types.iter())
            .filter_map(|(name, annotation)| {
                if annotation
                    .as_deref()
                    .is_some_and(annotation_uses_slice_reference)
                {
                    Some(name.clone())
                } else {
                    None
                }
            })
            .collect::<HashSet<_>>();
        body_uses_runtime_slice_forward(&function.body, &mut slice_names)
    })
}

fn body_uses_runtime_slice_forward(nodes: &[AstNode], slice_names: &mut HashSet<String>) -> bool {
    for node in nodes {
        if node_uses_runtime_slice_forward(node, slice_names) {
            return true;
        }
        if let AstNode::VariableDeclaration(local) = node {
            if local
                .type_annotation
                .as_deref()
                .is_some_and(annotation_uses_slice_reference)
            {
                slice_names.insert(local.name.clone());
            }
        }
    }
    false
}

fn node_uses_runtime_slice_forward(node: &AstNode, slice_names: &HashSet<String>) -> bool {
    match node {
        AstNode::CallExpression(call) => {
            call.arguments
                .iter()
                .any(|argument| runtime_slice_forward_argument(argument, slice_names))
                || node_uses_runtime_slice_forward(&call.callee, slice_names)
                || call
                    .arguments
                    .iter()
                    .any(|argument| node_uses_runtime_slice_forward(argument, slice_names))
        }
        AstNode::VariableDeclaration(local) => {
            node_uses_runtime_slice_forward(&local.value, slice_names)
        }
        AstNode::StackSlotDeclaration(slot) => {
            node_uses_runtime_slice_forward(&slot.value, slice_names)
        }
        AstNode::Return(return_node) => return_node
            .argument
            .as_deref()
            .is_some_and(|argument| node_uses_runtime_slice_forward(argument, slice_names)),
        AstNode::If(if_node) => {
            node_uses_runtime_slice_forward(&if_node.test, slice_names)
                || {
                    let mut consequent_names = slice_names.clone();
                    body_uses_runtime_slice_forward(&if_node.consequent, &mut consequent_names)
                }
                || if_node.alternate.as_ref().is_some_and(|alternate| {
                    let mut alternate_names = slice_names.clone();
                    body_uses_runtime_slice_forward(alternate, &mut alternate_names)
                })
        }
        AstNode::While(while_node) => {
            node_uses_runtime_slice_forward(&while_node.test, slice_names) || {
                let mut body_names = slice_names.clone();
                body_uses_runtime_slice_forward(&while_node.body, &mut body_names)
            }
        }
        AstNode::ForOf(for_node) => {
            node_uses_runtime_slice_forward(&for_node.range, slice_names) || {
                let mut body_names = slice_names.clone();
                body_uses_runtime_slice_forward(&for_node.body, &mut body_names)
            }
        }
        AstNode::For(for_node) => {
            for_node
                .init
                .as_deref()
                .is_some_and(|value| node_uses_runtime_slice_forward(value, slice_names))
                || for_node
                    .test
                    .as_deref()
                    .is_some_and(|value| node_uses_runtime_slice_forward(value, slice_names))
                || for_node
                    .update
                    .as_deref()
                    .is_some_and(|value| node_uses_runtime_slice_forward(value, slice_names))
                || {
                    let mut body_names = slice_names.clone();
                    body_uses_runtime_slice_forward(&for_node.body, &mut body_names)
                }
        }
        AstNode::LexicalScope(scope) => {
            let mut body_names = slice_names.clone();
            body_uses_runtime_slice_forward(&scope.body, &mut body_names)
        }
        AstNode::Assignment(assignment) => {
            node_uses_runtime_slice_forward(&assignment.target, slice_names)
                || node_uses_runtime_slice_forward(&assignment.value, slice_names)
        }
        AstNode::BinaryExpression(binary) => {
            node_uses_runtime_slice_forward(&binary.left, slice_names)
                || node_uses_runtime_slice_forward(&binary.right, slice_names)
        }
        AstNode::UnaryExpression(unary) => {
            node_uses_runtime_slice_forward(&unary.argument, slice_names)
        }
        AstNode::MemberExpression(member) => {
            node_uses_runtime_slice_forward(&member.object, slice_names)
                || node_uses_runtime_slice_forward(&member.property, slice_names)
        }
        _ => false,
    }
}

fn runtime_slice_forward_argument(argument: &AstNode, slice_names: &HashSet<String>) -> bool {
    let AstNode::UnaryExpression(borrow) = argument else {
        return false;
    };
    if !matches!(borrow.operator.as_str(), "&" | "&mut") {
        return false;
    }
    let AstNode::MemberExpression(range) = borrow.argument.as_ref() else {
        return false;
    };
    let AstNode::Identifier(root) = range.object.as_ref() else {
        return false;
    };
    slice_names.contains(&root.name) && slice_range_uses_runtime_bounds(&range.property)
}

fn slice_range_uses_runtime_bounds(node: &AstNode) -> bool {
    let AstNode::BinaryExpression(range) = node else {
        return false;
    };
    range.operator == ".."
        && (!is_non_negative_u32_literal(&range.left) || !is_non_negative_u32_literal(&range.right))
}

fn is_non_negative_u32_literal(node: &AstNode) -> bool {
    matches!(node, AstNode::Number(number) if number.raw.parse::<u32>().is_ok())
}

fn annotation_uses_slice_reference(annotation: &str) -> bool {
    annotation.starts_with("&[") || annotation.starts_with("&mut [")
}

fn node_uses_slice_reference_type(node: &AstNode) -> bool {
    match node {
        AstNode::VariableDeclaration(local) => local
            .type_annotation
            .as_deref()
            .is_some_and(annotation_uses_slice_reference),
        AstNode::StackSlotDeclaration(slot) => {
            annotation_uses_slice_reference(&slot.type_annotation)
        }
        AstNode::If(if_node) => {
            if_node
                .consequent
                .iter()
                .any(node_uses_slice_reference_type)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alternate| alternate.iter().any(node_uses_slice_reference_type))
        }
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_slice_reference_type),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_slice_reference_type),
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_slice_reference_type),
        _ => false,
    }
}

fn annotation_uses_fixed_array(annotation: &str) -> bool {
    annotation.starts_with('[')
}

fn node_uses_fixed_array_type(node: &AstNode) -> bool {
    match node {
        AstNode::VariableDeclaration(local) => local
            .type_annotation
            .as_deref()
            .is_some_and(annotation_uses_fixed_array),
        AstNode::StackSlotDeclaration(slot) => annotation_uses_fixed_array(&slot.type_annotation),
        AstNode::If(if_node) => {
            if_node.consequent.iter().any(node_uses_fixed_array_type)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alternate| alternate.iter().any(node_uses_fixed_array_type))
        }
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_fixed_array_type),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_fixed_array_type),
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_fixed_array_type),
        _ => false,
    }
}

fn has_memory_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function)
                if function
                    .body
                    .iter()
                    .any(|statement| matches!(statement, AstNode::StackSlotDeclaration(_)))
        )
    })
}

fn has_reference_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function
            .return_type
            .as_deref()
            .is_some_and(|annotation| annotation.starts_with('&'))
            || function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation.starts_with('&'))
            || function.body.iter().any(node_uses_reference_syntax)
    })
}

fn has_scope_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function) if function.body.iter().any(node_uses_lexical_scope)
        )
    })
}

fn has_control_flow_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function
            .return_type
            .as_deref()
            .is_some_and(annotation_uses_bool)
            || function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation_uses_bool(annotation))
            || function.body.iter().any(node_uses_control_flow)
    })
}

fn annotation_uses_bool(annotation: &str) -> bool {
    matches!(annotation, "bool" | "&bool" | "&mut bool")
}

fn node_uses_control_flow(node: &AstNode) -> bool {
    match node {
        AstNode::Boolean(_) | AstNode::If(_) | AstNode::While(_) => true,
        AstNode::VariableDeclaration(local) => {
            local
                .type_annotation
                .as_deref()
                .is_some_and(annotation_uses_bool)
                || node_uses_control_flow(&local.value)
        }
        AstNode::StackSlotDeclaration(slot) => {
            annotation_uses_bool(&slot.type_annotation) || node_uses_control_flow(&slot.value)
        }
        AstNode::LexicalScope(scope) => scope.body.iter().any(|statement| {
            matches!(statement, AstNode::Return(_)) || node_uses_control_flow(statement)
        }),
        AstNode::UnaryExpression(unary) => {
            unary.operator == "!" || node_uses_control_flow(&unary.argument)
        }
        AstNode::BinaryExpression(binary) => {
            matches!(
                binary.operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||"
            ) || node_uses_control_flow(&binary.left)
                || node_uses_control_flow(&binary.right)
        }
        AstNode::Assignment(assignment) => {
            node_uses_control_flow(&assignment.target) || node_uses_control_flow(&assignment.value)
        }
        AstNode::CallExpression(call) => {
            node_uses_control_flow(&call.callee)
                || call.arguments.iter().any(node_uses_control_flow)
        }
        AstNode::Return(return_node) => return_node
            .argument
            .as_deref()
            .is_some_and(node_uses_control_flow),
        _ => false,
    }
}

fn node_uses_lexical_scope(node: &AstNode) -> bool {
    match node {
        AstNode::LexicalScope(_) => true,
        AstNode::If(if_node) => {
            if_node.consequent.iter().any(node_uses_lexical_scope)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|body| body.iter().any(node_uses_lexical_scope))
        }
        AstNode::For(for_node) => for_node.body.iter().any(node_uses_lexical_scope),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_lexical_scope),
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_lexical_scope),
        _ => false,
    }
}

fn node_uses_reference_syntax(node: &AstNode) -> bool {
    match node {
        AstNode::VariableDeclaration(local) => {
            local
                .type_annotation
                .as_deref()
                .is_some_and(|annotation| annotation.starts_with('&'))
                || node_uses_reference_syntax(&local.value)
        }
        AstNode::StackSlotDeclaration(slot) => node_uses_reference_syntax(&slot.value),
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_reference_syntax),
        AstNode::UnaryExpression(unary) => {
            matches!(unary.operator.as_str(), "&" | "&mut" | "*")
                || node_uses_reference_syntax(&unary.argument)
        }
        AstNode::BinaryExpression(binary) => {
            node_uses_reference_syntax(&binary.left) || node_uses_reference_syntax(&binary.right)
        }
        AstNode::Assignment(assignment) => {
            node_uses_reference_syntax(&assignment.target)
                || node_uses_reference_syntax(&assignment.value)
        }
        AstNode::CallExpression(call) => {
            node_uses_reference_syntax(&call.callee)
                || call.arguments.iter().any(node_uses_reference_syntax)
        }
        AstNode::Return(return_node) => return_node
            .argument
            .as_deref()
            .is_some_and(node_uses_reference_syntax),
        _ => false,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MachineType {
    Bool,
    I32,
    I64,
}

impl MachineType {
    fn parse(
        name: &str,
        context: &str,
        machine_contract: &str,
    ) -> Result<Self, NativeCompileError> {
        match name {
            "bool" if bool_enabled(machine_contract) => Ok(Self::Bool),
            "i32" => Ok(Self::I32),
            "i64" => Ok(Self::I64),
            other => {
                let supported = if bool_enabled(machine_contract) {
                    "`bool`, `i32`, and `i64`"
                } else {
                    "`i32` and `i64`"
                };
                Err(NativeCompileError::new(format!(
                    "{machine_contract} supports only {supported}; {context} uses `{other}`"
                )))
            }
        }
    }

    fn ir_type(self) -> cranelift::codegen::ir::Type {
        match self {
            Self::Bool => types::I8,
            Self::I32 => types::I32,
            Self::I64 => types::I64,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::I32 => "i32",
            Self::I64 => "i64",
        }
    }

    fn stack_size(self) -> u32 {
        match self {
            Self::Bool => 1,
            Self::I32 => 4,
            Self::I64 => 8,
        }
    }

    fn stack_align_shift(self) -> u8 {
        match self {
            Self::Bool => 0,
            Self::I32 => 2,
            Self::I64 => 3,
        }
    }
}

fn bool_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn control_flow_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn scoped_lifetimes_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        REFERENCE_SCOPE_MACHINE_CONTRACT
            | CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn references_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        REFERENCE_MACHINE_CONTRACT
            | REFERENCE_SCOPE_MACHINE_CONTRACT
            | CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn memory_contract_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        MEMORY_MACHINE_CONTRACT
            | REFERENCE_MACHINE_CONTRACT
            | REFERENCE_SCOPE_MACHINE_CONTRACT
            | CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn aggregate_contract_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

fn fixed_arrays_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    )
}

#[derive(Debug, Clone)]
struct FixedArrayLayout {
    element_type: MachineType,
    length: u32,
    size: u32,
}

impl FixedArrayLayout {
    fn parse(
        annotation: &str,
        context: &str,
        machine_contract: &str,
    ) -> Result<Option<Self>, NativeCompileError> {
        if !annotation_uses_fixed_array(annotation) {
            return Ok(None);
        }
        if !fixed_arrays_enabled(machine_contract) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} does not enable fixed array storage"
            )));
        }

        let Some(body) = annotation
            .strip_prefix('[')
            .and_then(|body| body.strip_suffix(']'))
        else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} has malformed fixed array type `{annotation}`"
            )));
        };
        let Some((element, length)) = body.split_once(';') else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} has malformed fixed array type `{annotation}`"
            )));
        };
        let element_type = MachineType::parse(element.trim(), context, machine_contract)?;
        let length = length.trim().parse::<u32>().map_err(|_| {
            NativeCompileError::new(format!(
                "{machine_contract} {context} requires an unsigned integer fixed array length; found `{}`",
                length.trim()
            ))
        })?;
        if length == 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} fixed array length must be greater than zero"
            )));
        }
        let size = element_type
            .stack_size()
            .checked_mul(length)
            .filter(|size| *size <= i32::MAX as u32)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} {context} fixed array exceeds addressable native stack offsets"
                ))
            })?;
        Ok(Some(Self {
            element_type,
            length,
            size,
        }))
    }
}

#[derive(Debug, Clone)]
struct AggregateFieldLayout {
    name: String,
    machine_type: MachineType,
    offset: u32,
}

#[derive(Debug, Clone)]
struct AggregateLayout {
    name: String,
    size: u32,
    align_shift: u8,
    fields: Vec<AggregateFieldLayout>,
}

impl AggregateLayout {
    fn alignment(&self) -> u32 {
        1_u32 << self.align_shift
    }

    fn into_public(self) -> NativeStructLayout {
        let alignment = self.alignment();
        NativeStructLayout {
            name: self.name,
            size: self.size,
            alignment,
            fields: self
                .fields
                .into_iter()
                .map(|field| NativeFieldLayout {
                    name: field.name,
                    machine_type: field.machine_type.name().to_string(),
                    offset: field.offset,
                    size: field.machine_type.stack_size(),
                    alignment: 1_u32 << field.machine_type.stack_align_shift(),
                })
                .collect(),
        }
    }
}

fn collect_aggregate_layouts(
    ast: &Ast,
    machine_contract: &str,
) -> Result<Vec<AggregateLayout>, NativeCompileError> {
    let struct_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    let mut layouts = Vec::new();
    let mut declared_names = HashSet::new();

    for node in &ast.body {
        let AstNode::StructDeclaration(structure) = node else {
            continue;
        };
        if !declared_names.insert(structure.name.as_str()) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} declares duplicate struct `{}`",
                structure.name
            )));
        }
        if matches!(structure.name.as_str(), "load" | "store") {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} reserves struct name `{}` for explicit memory access",
                structure.name
            )));
        }
        if structure.fields.is_empty() {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} struct `{}` must declare at least one field",
                structure.name
            )));
        }
        if structure.field_types.len() != structure.fields.len()
            || structure.field_types.iter().any(Option::is_none)
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} struct `{}` requires a type for every field",
                structure.name
            )));
        }

        let mut offset = 0_u32;
        let mut align_shift = 0_u8;
        let mut fields = Vec::with_capacity(structure.fields.len());
        let mut field_names = HashSet::new();
        for (field_name, type_name) in structure
            .fields
            .iter()
            .zip(structure.field_types.iter().flatten())
        {
            if !field_names.insert(field_name.as_str()) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} struct `{}` declares duplicate field `{field_name}`",
                    structure.name
                )));
            }
            if struct_names.contains(type_name.as_str()) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} field `{field_name}` uses unsupported nested aggregate type `{type_name}` in struct `{}`",
                    structure.name,
                )));
            }
            if annotation_uses_slice_reference(type_name) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} borrowed slices as aggregate fields are not enabled; field `{field_name}` in struct `{}` uses `{type_name}`",
                    structure.name
                )));
            }
            if FixedArrayLayout::parse(
                type_name,
                &format!("field `{field_name}` in struct `{}`", structure.name),
                machine_contract,
            )?
            .is_some()
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} fixed arrays as aggregate fields are not enabled; field `{field_name}` in struct `{}` uses `{type_name}`",
                    structure.name
                )));
            }
            let machine_type = MachineType::parse(
                type_name,
                &format!("field `{field_name}` in struct `{}`", structure.name),
                machine_contract,
            )?;
            let field_alignment = 1_u32 << machine_type.stack_align_shift();
            offset = align_up(offset, field_alignment, machine_contract, &structure.name)?;
            fields.push(AggregateFieldLayout {
                name: field_name.clone(),
                machine_type,
                offset,
            });
            offset = offset
                .checked_add(machine_type.stack_size())
                .ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} struct `{}` exceeds native stack layout limits",
                        structure.name
                    ))
                })?;
            align_shift = align_shift.max(machine_type.stack_align_shift());
        }
        let size = align_up(
            offset,
            1_u32 << align_shift,
            machine_contract,
            &structure.name,
        )?;
        if size > i32::MAX as u32 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} struct `{}` exceeds addressable native stack offsets",
                structure.name
            )));
        }
        layouts.push(AggregateLayout {
            name: structure.name.clone(),
            size,
            align_shift,
            fields,
        });
    }
    Ok(layouts)
}

fn align_up(
    value: u32,
    alignment: u32,
    machine_contract: &str,
    struct_name: &str,
) -> Result<u32, NativeCompileError> {
    let mask = alignment - 1;
    value
        .checked_add(mask)
        .map(|padded| padded & !mask)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} struct `{struct_name}` exceeds native stack layout limits"
            ))
        })
}

struct TypedFunctionSpec<'a> {
    node: &'a FunctionNode,
    params: Vec<MachineParameter>,
    result: MachineType,
}

#[derive(Clone)]
struct TypedFunctionAbi {
    func_id: FuncId,
    params: Vec<MachineParameter>,
    result: MachineType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MachineParameter {
    Scalar(MachineType),
    Slice {
        element_type: MachineType,
        mutable: bool,
    },
}

#[derive(Clone, Copy)]
struct TypedValue {
    value: Value,
    machine_type: MachineType,
}

#[derive(Clone)]
struct TypedStackSlot {
    slot: StackSlot,
    layout: StackSlotLayout,
}

#[derive(Clone)]
enum StackSlotLayout {
    Scalar(MachineType),
    Aggregate(AggregateLayout),
    FixedArray(FixedArrayLayout),
}

impl TypedStackSlot {
    fn scalar_type(&self) -> Option<MachineType> {
        match self.layout {
            StackSlotLayout::Scalar(machine_type) => Some(machine_type),
            StackSlotLayout::Aggregate(_) | StackSlotLayout::FixedArray(_) => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReferenceTarget {
    Scalar(MachineType),
    Slice(MachineType),
}

impl ReferenceTarget {
    fn display(self) -> String {
        match self {
            Self::Scalar(machine_type) => machine_type.name().to_string(),
            Self::Slice(element_type) => format!("[{}]", element_type.name()),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ReferenceType {
    target: ReferenceTarget,
    mutable: bool,
}

impl ReferenceType {
    fn parse(
        annotation: &str,
        context: &str,
        machine_contract: &str,
    ) -> Result<Option<Self>, NativeCompileError> {
        let Some(rest) = annotation.strip_prefix('&') else {
            return Ok(None);
        };
        let (mutable, pointee) = if let Some(pointee) = rest.strip_prefix("mut ") {
            (true, pointee)
        } else {
            (false, rest)
        };
        if pointee.is_empty() {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} has an incomplete reference type `{annotation}`"
            )));
        }
        let target = if pointee.starts_with('[') {
            let Some(element) = pointee
                .strip_prefix('[')
                .and_then(|element| element.strip_suffix(']'))
            else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} has malformed slice reference type `{annotation}`"
                )));
            };
            if element.contains(';') || element.is_empty() {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} slice references use `&[T]` or `&mut [T]`; found `{annotation}`"
                )));
            }
            ReferenceTarget::Slice(MachineType::parse(element, context, machine_contract)?)
        } else {
            ReferenceTarget::Scalar(MachineType::parse(pointee, context, machine_contract)?)
        };
        Ok(Some(Self { target, mutable }))
    }
}

#[derive(Debug, Clone)]
enum TypedReferenceLayout {
    Scalar {
        machine_type: MachineType,
        slot_name: String,
    },
    Slice {
        element_type: MachineType,
        storage: SliceStorage,
    },
}

#[derive(Debug, Clone)]
enum SliceStorage {
    Stack {
        slot_name: String,
        base_offset: u32,
        length: u32,
    },
    Parameter {
        base: Value,
        length: Value,
    },
}

#[derive(Debug, Clone)]
struct TypedReference {
    layout: TypedReferenceLayout,
    mutable: bool,
}

impl TypedReference {
    fn scalar_pointee(&self) -> Option<MachineType> {
        match &self.layout {
            TypedReferenceLayout::Scalar { machine_type, .. } => Some(*machine_type),
            TypedReferenceLayout::Slice { .. } => None,
        }
    }

    fn stack_root(&self) -> Option<&str> {
        match &self.layout {
            TypedReferenceLayout::Scalar { slot_name, .. }
            | TypedReferenceLayout::Slice {
                storage: SliceStorage::Stack { slot_name, .. },
                ..
            } => Some(slot_name),
            TypedReferenceLayout::Slice {
                storage: SliceStorage::Parameter { .. },
                ..
            } => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct BorrowState {
    shared: usize,
    exclusive: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum SliceBorrowRoot {
    Stack(String),
    Parameter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FlowOutcome {
    FallsThrough,
    Returns,
}

fn lower_typed_ast_to_object(
    ast: &Ast,
    machine_contract: &'static str,
    memory_enabled: bool,
) -> Result<Vec<u8>, NativeCompileError> {
    let aggregate_layouts = collect_aggregate_layouts(ast, machine_contract)?;
    let aggregate_layouts = aggregate_layouts
        .into_iter()
        .map(|layout| (layout.name.clone(), layout))
        .collect::<HashMap<_, _>>();
    let specs = collect_typed_function_specs(ast, machine_contract, &aggregate_layouts)?;
    let mut module = create_object_module()?;
    let mut functions = HashMap::new();

    for spec in &specs {
        let signature = machine_signature(&module, &spec.params, spec.result);
        let symbol = format!("hs_{}", spec.node.name);
        let func_id = module
            .declare_function(&symbol, Linkage::Export, &signature)
            .map_err(|error| {
                NativeCompileError::new(format!("declare {symbol} failed: {error}"))
            })?;
        functions.insert(
            spec.node.name.clone(),
            TypedFunctionAbi {
                func_id,
                params: spec.params.clone(),
                result: spec.result,
            },
        );
    }

    let mut entry_signature = module.make_signature();
    entry_signature.returns.push(AbiParam::new(types::I32));
    let entry = module
        .declare_function("main", Linkage::Export, &entry_signature)
        .map_err(|error| NativeCompileError::new(format!("declare main failed: {error}")))?;

    for spec in &specs {
        let abi = functions
            .get(&spec.node.name)
            .expect("typed function ABI must exist")
            .clone();
        let mut context = module.make_context();
        context.func.name = UserFuncName::user(0, abi.func_id.as_u32());
        context.func.signature = machine_signature(&module, &abi.params, abi.result);
        let mut builder_context = FunctionBuilderContext::new();
        {
            let mut builder = FunctionBuilder::new(&mut context.func, &mut builder_context);
            let block = builder.create_block();
            builder.append_block_params_for_function_params(block);
            builder.switch_to_block(block);

            let mut block_params = builder.block_params(block).to_vec().into_iter();
            let mut locals = HashMap::new();
            let mut parameter_references = HashMap::new();
            for (name, parameter) in spec.node.params.iter().zip(spec.params.iter().copied()) {
                if locals.contains_key(name) || parameter_references.contains_key(name) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` declares duplicate parameter `{name}`",
                        spec.node.name
                    )));
                }
                match parameter {
                    MachineParameter::Scalar(machine_type) => {
                        let value = block_params
                            .next()
                            .expect("scalar parameter must have one ABI value");
                        locals.insert(
                            name.clone(),
                            TypedValue {
                                value,
                                machine_type,
                            },
                        );
                    }
                    MachineParameter::Slice {
                        element_type,
                        mutable,
                    } => {
                        let base = block_params
                            .next()
                            .expect("slice parameter must have an ABI base pointer");
                        let length = block_params
                            .next()
                            .expect("slice parameter must have an ABI length");
                        let negative_length =
                            builder.ins().icmp_imm(IntCC::SignedLessThan, length, 0);
                        builder
                            .ins()
                            .trapnz(negative_length, TrapCode::unwrap_user(1));
                        parameter_references.insert(
                            name.clone(),
                            TypedReference {
                                layout: TypedReferenceLayout::Slice {
                                    element_type,
                                    storage: SliceStorage::Parameter { base, length },
                                },
                                mutable,
                            },
                        );
                    }
                }
            }
            debug_assert!(block_params.next().is_none());

            lower_typed_body(
                &mut builder,
                &mut module,
                &functions,
                &aggregate_layouts,
                &mut locals,
                parameter_references,
                spec,
                machine_contract,
                memory_enabled,
            )?;
            builder.seal_all_blocks();
            builder.finalize();
        }
        module
            .define_function(abi.func_id, &mut context)
            .map_err(|error| {
                NativeCompileError::new(format!(
                    "define typed function `{}` failed: {error}",
                    spec.node.name
                ))
            })?;
    }

    let source_main = functions
        .get("main")
        .expect("typed main ABI must exist")
        .clone();
    let mut entry_context = module.make_context();
    entry_context.func.name = UserFuncName::user(0, entry.as_u32());
    entry_context.func.signature = entry_signature;
    let mut entry_builder_context = FunctionBuilderContext::new();
    {
        let mut builder = FunctionBuilder::new(&mut entry_context.func, &mut entry_builder_context);
        let block = builder.create_block();
        builder.switch_to_block(block);
        let local_main = module.declare_func_in_func(source_main.func_id, builder.func);
        let call = builder.ins().call(local_main, &[]);
        let value = builder.inst_results(call)[0];
        let exit_code = match source_main.result {
            MachineType::Bool => builder.ins().uextend(types::I32, value),
            MachineType::I32 => value,
            MachineType::I64 => builder.ins().ireduce(types::I32, value),
        };
        builder.ins().return_(&[exit_code]);
        builder.seal_all_blocks();
        builder.finalize();
    }
    module
        .define_function(entry, &mut entry_context)
        .map_err(|error| NativeCompileError::new(format!("define main failed: {error}")))?;

    module
        .finish()
        .emit()
        .map_err(|error| NativeCompileError::new(format!("object emission failed: {error}")))
}

fn collect_typed_function_specs<'a>(
    ast: &'a Ast,
    machine_contract: &str,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
) -> Result<Vec<TypedFunctionSpec<'a>>, NativeCompileError> {
    if ast.body.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} requires at least one typed function"
        )));
    }

    let mut specs = Vec::with_capacity(ast.body.len());
    let mut names = HashMap::new();
    for node in &ast.body {
        if matches!(node, AstNode::StructDeclaration(_))
            && aggregate_contract_enabled(machine_contract)
        {
            continue;
        }
        let AstNode::Function(function) = node else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} accepts only top-level function declarations"
            )));
        };
        if memory_contract_enabled(machine_contract)
            && matches!(function.name.as_str(), "load" | "store")
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} reserves function name `{}` for explicit memory access",
                function.name
            )));
        }
        if aggregate_layouts.contains_key(&function.name) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` collides with an aggregate constructor",
                function.name
            )));
        }
        if names.insert(function.name.as_str(), ()).is_some() {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} declares duplicate function `{}`",
                function.name
            )));
        }
        if function.params.len() != function.param_types.len() && !function.params.is_empty() {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` requires a type annotation for every parameter",
                function.name
            )));
        }

        let mut params = Vec::with_capacity(function.params.len());
        for (index, param_name) in function.params.iter().enumerate() {
            let type_name = function
                .param_types
                .get(index)
                .and_then(Option::as_deref)
                .ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} parameter `{param_name}` in function `{}` requires an explicit type",
                        function.name
                    ))
                })?;
            if let Some(reference_type) = ReferenceType::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
            )? {
                match reference_type.target {
                    ReferenceTarget::Slice(element_type)
                        if matches!(
                            machine_contract,
                            SLICE_CALL_MACHINE_CONTRACT
                                | SLICE_FORWARD_MACHINE_CONTRACT
                                | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
                        ) =>
                    {
                        params.push(MachineParameter::Slice {
                            element_type,
                            mutable: reference_type.mutable,
                        });
                        continue;
                    }
                    _ => {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} references cannot appear in function parameters; `{param_name}` in `{}` would escape its declaring function",
                            function.name
                        )));
                    }
                }
            }
            if aggregate_layouts.contains_key(type_name) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregates cannot appear in function parameters; `{param_name}` in `{}` uses `{type_name}`",
                    function.name
                )));
            }
            if FixedArrayLayout::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
            )?
            .is_some()
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} fixed arrays cannot appear in function parameters; `{param_name}` in `{}` uses `{type_name}`",
                    function.name
                )));
            }
            params.push(MachineParameter::Scalar(MachineType::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
            )?));
        }
        let return_name = function.return_type.as_deref().ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` requires an explicit return type",
                function.name
            ))
        })?;
        if references_enabled(machine_contract) && return_name.starts_with('&') {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} references cannot appear in function returns; `{}` would expose an address-bearing value",
                function.name
            )));
        }
        if aggregate_layouts.contains_key(return_name) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregates cannot appear in function returns; `{}` returns `{return_name}`",
                function.name
            )));
        }
        if FixedArrayLayout::parse(
            return_name,
            &format!("return type of function `{}`", function.name),
            machine_contract,
        )?
        .is_some()
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} fixed arrays cannot appear in function returns; `{}` returns `{return_name}`",
                function.name
            )));
        }
        let result = MachineType::parse(
            return_name,
            &format!("return type of function `{}`", function.name),
            machine_contract,
        )?;
        specs.push(TypedFunctionSpec {
            node: function,
            params,
            result,
        });
    }

    let main = specs
        .iter()
        .find(|spec| spec.node.name == "main")
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} requires a typed `main` function"
            ))
        })?;
    if !main.params.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `main` cannot declare parameters"
        )));
    }
    if main.result == MachineType::Bool {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} process entry `main` must return `i32` or `i64`"
        )));
    }
    Ok(specs)
}

fn machine_signature(
    module: &ObjectModule,
    params: &[MachineParameter],
    result: MachineType,
) -> cranelift::codegen::ir::Signature {
    let mut signature = module.make_signature();
    for parameter in params {
        match parameter {
            MachineParameter::Scalar(machine_type) => {
                signature.params.push(AbiParam::new(machine_type.ir_type()));
            }
            MachineParameter::Slice { .. } => {
                signature
                    .params
                    .push(AbiParam::new(module.target_config().pointer_type()));
                signature.params.push(AbiParam::new(types::I32));
            }
        }
    }
    signature.returns.push(AbiParam::new(result.ir_type()));
    signature
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_body(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    mut references: HashMap<String, TypedReference>,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(), NativeCompileError> {
    let mut stack_slots = HashMap::new();
    let mut borrow_states = HashMap::new();
    let mut function_borrow_leases = Vec::new();
    let outcome = lower_typed_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        &mut stack_slots,
        &mut references,
        &mut borrow_states,
        &mut function_borrow_leases,
        &spec.node.body,
        spec,
        machine_contract,
        memory_enabled,
        true,
    )?;

    if outcome != FlowOutcome::Returns {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` has no return statement",
            spec.node.name
        )));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_statements(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    stack_slots: &mut HashMap<String, TypedStackSlot>,
    references: &mut HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    borrow_leases: &mut Vec<TypedReference>,
    statements: &[AstNode],
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
    allow_return: bool,
) -> Result<FlowOutcome, NativeCompileError> {
    let mut outcome = FlowOutcome::FallsThrough;
    for (index, statement) in statements.iter().enumerate() {
        if outcome == FlowOutcome::Returns {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` contains unreachable statements after return",
                spec.node.name
            )));
        }
        match statement {
            AstNode::VariableDeclaration(local) => {
                if local.mutable {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} local `{}` must be immutable (`let` or `const`)",
                        local.name
                    )));
                }
                let type_name = local.type_annotation.as_deref().ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} local `{}` requires an explicit type",
                        local.name
                    ))
                })?;
                let type_context =
                    format!("local `{}` in function `{}`", local.name, spec.node.name);
                if aggregate_layouts.contains_key(type_name) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate local `{}` must use addressable `slot` storage",
                        local.name
                    )));
                }
                if FixedArrayLayout::parse(type_name, &type_context, machine_contract)?.is_some() {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} fixed array local `{}` must use addressable `slot` storage",
                        local.name
                    )));
                }
                if let Some(reference_type) =
                    ReferenceType::parse(type_name, &type_context, machine_contract)?
                {
                    if !references_enabled(machine_contract) {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} does not enable typed references"
                        )));
                    }
                    if locals.contains_key(&local.name)
                        || stack_slots.contains_key(&local.name)
                        || references.contains_key(&local.name)
                    {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` redeclares binding `{}`",
                            spec.node.name, local.name
                        )));
                    }
                    let reference = lower_reference_initializer(
                        &local.name,
                        reference_type,
                        &local.value,
                        stack_slots,
                        borrow_states,
                        machine_contract,
                    )?;
                    borrow_leases.push(reference.clone());
                    references.insert(local.name.clone(), reference);
                    continue;
                }
                let machine_type = MachineType::parse(type_name, &type_context, machine_contract)?;
                if locals.contains_key(&local.name)
                    || stack_slots.contains_key(&local.name)
                    || references.contains_key(&local.name)
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` redeclares binding `{}`",
                        spec.node.name, local.name
                    )));
                }
                let value = lower_typed_expression(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    &local.value,
                    machine_type,
                    &format!("initializer for `{}`", local.name),
                    machine_contract,
                    memory_enabled,
                )?;
                locals.insert(local.name.clone(), value);
            }
            AstNode::StackSlotDeclaration(slot) => {
                if !memory_enabled {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} does not enable addressable stack slots"
                    )));
                }
                if locals.contains_key(&slot.name)
                    || stack_slots.contains_key(&slot.name)
                    || references.contains_key(&slot.name)
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` redeclares binding `{}`",
                        spec.node.name, slot.name
                    )));
                }
                let array_context = format!(
                    "stack slot `{}` in function `{}`",
                    slot.name, spec.node.name
                );
                if annotation_uses_slice_reference(&slot.type_annotation) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed slice `{}` cannot use addressable `slot` storage; slice descriptors are local reference values",
                        slot.name
                    )));
                }
                if let Some(layout) = FixedArrayLayout::parse(
                    &slot.type_annotation,
                    &array_context,
                    machine_contract,
                )? {
                    let AstNode::Array(initializer) = slot.value.as_ref() else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} fixed array stack slot `{}` must be initialized with an array literal",
                            slot.name
                        )));
                    };
                    if initializer.elements.len() != layout.length as usize {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} fixed array stack slot `{}` expects {} elements, found {}",
                            slot.name,
                            layout.length,
                            initializer.elements.len()
                        )));
                    }
                    let mut initial_values = Vec::with_capacity(initializer.elements.len());
                    for (index, element) in initializer.elements.iter().enumerate() {
                        initial_values.push(lower_typed_expression(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            borrow_states,
                            element,
                            layout.element_type,
                            &format!("element {index} of fixed array `{}`", slot.name),
                            machine_contract,
                            memory_enabled,
                        )?);
                    }
                    let stack_slot = builder.create_sized_stack_slot(StackSlotData::new(
                        StackSlotKind::ExplicitSlot,
                        layout.size,
                        layout.element_type.stack_align_shift(),
                    ));
                    for (index, initial_value) in initial_values.into_iter().enumerate() {
                        let offset = u32::try_from(index)
                            .expect("fixed array length is validated")
                            .checked_mul(layout.element_type.stack_size())
                            .expect("fixed array size is validated");
                        builder.ins().stack_store(
                            initial_value.value,
                            stack_slot,
                            i32::try_from(offset).expect("fixed array offset is validated"),
                        );
                    }
                    stack_slots.insert(
                        slot.name.clone(),
                        TypedStackSlot {
                            slot: stack_slot,
                            layout: StackSlotLayout::FixedArray(layout),
                        },
                    );
                    continue;
                }
                if let Some(layout) = aggregate_layouts.get(&slot.type_annotation) {
                    let AstNode::CallExpression(constructor) = slot.value.as_ref() else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} aggregate stack slot `{}` must be initialized with `{}(...)`",
                            slot.name, layout.name
                        )));
                    };
                    let AstNode::Identifier(constructor_name) = constructor.callee.as_ref() else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} aggregate stack slot `{}` requires a named constructor",
                            slot.name
                        )));
                    };
                    if constructor_name.name != layout.name {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} stack slot `{}` expects constructor `{}`, found `{}`",
                            slot.name, layout.name, constructor_name.name
                        )));
                    }
                    if constructor.arguments.len() != layout.fields.len() {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} constructor `{}` expects {} fields, found {}",
                            layout.name,
                            layout.fields.len(),
                            constructor.arguments.len()
                        )));
                    }

                    let mut initial_values = Vec::with_capacity(layout.fields.len());
                    for (field, argument) in layout.fields.iter().zip(&constructor.arguments) {
                        initial_values.push(lower_typed_expression(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            borrow_states,
                            argument,
                            field.machine_type,
                            &format!("field `{}` in constructor `{}`", field.name, layout.name),
                            machine_contract,
                            memory_enabled,
                        )?);
                    }
                    let stack_slot = builder.create_sized_stack_slot(StackSlotData::new(
                        StackSlotKind::ExplicitSlot,
                        layout.size,
                        layout.align_shift,
                    ));
                    for (field, initial_value) in layout.fields.iter().zip(initial_values) {
                        builder.ins().stack_store(
                            initial_value.value,
                            stack_slot,
                            i32::try_from(field.offset).expect("validated aggregate field offset"),
                        );
                    }
                    stack_slots.insert(
                        slot.name.clone(),
                        TypedStackSlot {
                            slot: stack_slot,
                            layout: StackSlotLayout::Aggregate(layout.clone()),
                        },
                    );
                    continue;
                }
                let machine_type = MachineType::parse(
                    &slot.type_annotation,
                    &format!(
                        "stack slot `{}` in function `{}`",
                        slot.name, spec.node.name
                    ),
                    machine_contract,
                )?;
                let initial_value = lower_typed_expression(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    &slot.value,
                    machine_type,
                    &format!("initializer for stack slot `{}`", slot.name),
                    machine_contract,
                    memory_enabled,
                )?;
                let stack_slot = builder.create_sized_stack_slot(StackSlotData::new(
                    StackSlotKind::ExplicitSlot,
                    machine_type.stack_size(),
                    machine_type.stack_align_shift(),
                ));
                builder
                    .ins()
                    .stack_store(initial_value.value, stack_slot, 0);
                stack_slots.insert(
                    slot.name.clone(),
                    TypedStackSlot {
                        slot: stack_slot,
                        layout: StackSlotLayout::Scalar(machine_type),
                    },
                );
            }
            AstNode::CallExpression(call)
                if memory_enabled
                    && matches!(
                        call.callee.as_ref(),
                        AstNode::Identifier(callee) if callee.name == "store"
                    ) =>
            {
                lower_typed_store(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    call,
                    machine_contract,
                )?;
            }
            AstNode::Assignment(assignment) if references_enabled(machine_contract) => {
                lower_reference_assignment(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    assignment,
                    machine_contract,
                )?;
            }
            AstNode::LexicalScope(scope) if scoped_lifetimes_enabled(machine_contract) => {
                outcome = lower_lexical_scope(
                    builder,
                    module,
                    functions,
                    aggregate_layouts,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    scope,
                    spec,
                    machine_contract,
                    memory_enabled,
                )?;
            }
            AstNode::If(if_node) if control_flow_enabled(machine_contract) => {
                outcome = lower_typed_if(
                    builder,
                    module,
                    functions,
                    aggregate_layouts,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    if_node,
                    spec,
                    machine_contract,
                    memory_enabled,
                )?;
            }
            AstNode::While(while_node) if control_flow_enabled(machine_contract) => {
                lower_typed_while(
                    builder,
                    module,
                    functions,
                    aggregate_layouts,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    while_node,
                    spec,
                    machine_contract,
                    memory_enabled,
                )?;
            }
            AstNode::If(_) if machine_contract == REFERENCE_SCOPE_MACHINE_CONTRACT => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` does not yet infer reference lifetimes across control-flow branches",
                    spec.node.name
                )));
            }
            AstNode::Return(return_node) => {
                if !allow_return {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} returns inside lexical `scope` are not yet supported; return after the scope exits"
                    )));
                }
                if index + 1 != statements.len() {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} return must be the final statement in function `{}`",
                        spec.node.name
                    )));
                }
                let argument = return_node.argument.as_deref().ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} function `{}` must return `{}`",
                        spec.node.name,
                        spec.result.name()
                    ))
                })?;
                let value = lower_typed_expression(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    argument,
                    spec.result,
                    &format!("return from `{}`", spec.node.name),
                    machine_contract,
                    memory_enabled,
                )?;
                builder.ins().return_(&[value.value]);
                outcome = FlowOutcome::Returns;
            }
            _ => {
                let supported = if memory_enabled {
                    "typed immutable locals, typed stack slots, explicit stores, and a final return"
                } else {
                    "typed immutable locals and a final return"
                };
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` supports only {supported}",
                    spec.node.name,
                )));
            }
        }
    }

    Ok(outcome)
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_if(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    stack_slots: &mut HashMap<String, TypedStackSlot>,
    references: &mut HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    if_node: &holoscript_wasm::ast::IfNode,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<FlowOutcome, NativeCompileError> {
    let condition = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &if_node.test,
        MachineType::Bool,
        "if condition",
        machine_contract,
        memory_enabled,
    )?;
    let consequent_block = builder.create_block();
    let alternate_block = builder.create_block();
    let merge_block = builder.create_block();
    builder
        .ins()
        .brif(condition.value, consequent_block, &[], alternate_block, &[]);

    builder.switch_to_block(consequent_block);
    let consequent_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        stack_slots,
        references,
        borrow_states,
        &if_node.consequent,
        spec,
        machine_contract,
        memory_enabled,
        true,
    )?;
    if consequent_outcome == FlowOutcome::FallsThrough {
        builder.ins().jump(merge_block, &[]);
    }

    builder.switch_to_block(alternate_block);
    let alternate = if_node.alternate.as_deref().unwrap_or(&[]);
    let alternate_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        stack_slots,
        references,
        borrow_states,
        alternate,
        spec,
        machine_contract,
        memory_enabled,
        true,
    )?;
    if alternate_outcome == FlowOutcome::FallsThrough {
        builder.ins().jump(merge_block, &[]);
    }

    if consequent_outcome == FlowOutcome::Returns && alternate_outcome == FlowOutcome::Returns {
        Ok(FlowOutcome::Returns)
    } else {
        builder.switch_to_block(merge_block);
        Ok(FlowOutcome::FallsThrough)
    }
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_while(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    stack_slots: &mut HashMap<String, TypedStackSlot>,
    references: &mut HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    while_node: &holoscript_wasm::ast::WhileNode,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(), NativeCompileError> {
    let header_block = builder.create_block();
    let body_block = builder.create_block();
    let exit_block = builder.create_block();
    builder.ins().jump(header_block, &[]);

    builder.switch_to_block(header_block);
    let condition = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &while_node.test,
        MachineType::Bool,
        "while condition",
        machine_contract,
        memory_enabled,
    )?;
    builder
        .ins()
        .brif(condition.value, body_block, &[], exit_block, &[]);

    builder.switch_to_block(body_block);
    let body_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        stack_slots,
        references,
        borrow_states,
        &while_node.body,
        spec,
        machine_contract,
        memory_enabled,
        true,
    )?;
    if body_outcome == FlowOutcome::FallsThrough {
        builder.ins().jump(header_block, &[]);
    }

    builder.switch_to_block(exit_block);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn lower_lexical_scope(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    stack_slots: &mut HashMap<String, TypedStackSlot>,
    references: &mut HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    scope: &holoscript_wasm::ast::LexicalScopeNode,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<FlowOutcome, NativeCompileError> {
    lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        stack_slots,
        references,
        borrow_states,
        &scope.body,
        spec,
        machine_contract,
        memory_enabled,
        control_flow_enabled(machine_contract),
    )
}

#[allow(clippy::too_many_arguments)]
fn lower_scoped_statements(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    stack_slots: &mut HashMap<String, TypedStackSlot>,
    references: &mut HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    statements: &[AstNode],
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
    allow_return: bool,
) -> Result<FlowOutcome, NativeCompileError> {
    let outer_locals = locals.keys().cloned().collect::<HashSet<_>>();
    let outer_stack_slots = stack_slots.keys().cloned().collect::<HashSet<_>>();
    let outer_references = references.keys().cloned().collect::<HashSet<_>>();
    let outer_borrow_states = borrow_states.clone();
    let mut scoped_borrow_leases = Vec::new();

    let outcome = lower_typed_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        locals,
        stack_slots,
        references,
        borrow_states,
        &mut scoped_borrow_leases,
        statements,
        spec,
        machine_contract,
        memory_enabled,
        allow_return,
    )?;

    for reference in scoped_borrow_leases.iter().rev() {
        release_borrow(reference, borrow_states, machine_contract)?;
    }
    locals.retain(|name, _| outer_locals.contains(name));
    references.retain(|name, _| outer_references.contains(name));
    stack_slots.retain(|name, _| outer_stack_slots.contains(name));
    borrow_states.retain(|slot_name, state| {
        outer_stack_slots.contains(slot_name) && (state.shared > 0 || state.exclusive)
    });
    if *borrow_states != outer_borrow_states {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cleanup edge changed outer borrow state in function `{}`",
            spec.node.name
        )));
    }
    Ok(outcome)
}

fn release_borrow(
    reference: &TypedReference,
    borrow_states: &mut HashMap<String, BorrowState>,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let slot_name = reference.stack_root().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} attempted to release a non-local slice parameter borrow"
        ))
    })?;
    let remove_state = {
        let state = borrow_states.get_mut(slot_name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} lost borrow state for scoped reference to `{}`",
                slot_name
            ))
        })?;
        if reference.mutable {
            if !state.exclusive {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} lost exclusive borrow state for scoped reference to `{}`",
                    slot_name
                )));
            }
            state.exclusive = false;
        } else {
            state.shared = state.shared.checked_sub(1).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} lost shared borrow state for scoped reference to `{}`",
                    slot_name
                ))
            })?;
        }
        state.shared == 0 && !state.exclusive
    };
    if remove_state {
        borrow_states.remove(slot_name);
    }
    Ok(())
}

fn lower_reference_initializer(
    reference_name: &str,
    reference_type: ReferenceType,
    initializer: &AstNode,
    stack_slots: &HashMap<String, TypedStackSlot>,
    borrow_states: &mut HashMap<String, BorrowState>,
    machine_contract: &str,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::UnaryExpression(borrow) = initializer else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` must be initialized directly with a matching borrow expression"
        )));
    };
    let expected_operator = if reference_type.mutable { "&mut" } else { "&" };
    let target_display = reference_type.target.display();
    let expected_annotation = if reference_type.mutable {
        format!("&mut {target_display}")
    } else {
        format!("&{target_display}")
    };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` has type `{expected_annotation}`, but its initializer uses `{}`",
            borrow.operator,
        )));
    }
    let (slot_name, layout) = match reference_type.target {
        ReferenceTarget::Scalar(expected) => {
            if aggregate_contract_enabled(machine_contract)
                && matches!(borrow.argument.as_ref(), AstNode::MemberExpression(_))
            {
                return Err(NativeCompileError::new(format!(
                    "field references are not enabled by {machine_contract}; reference `{reference_name}` must borrow a scalar stack slot"
                )));
            }
            let AstNode::Identifier(identifier) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} reference `{reference_name}` requires a declared stack slot as its provenance root"
                )));
            };
            let stack_slot = stack_slots.get(&identifier.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} reference `{reference_name}` requires a declared stack slot; `{}` is not addressable",
                    identifier.name
                ))
            })?;
            let Some(machine_type) = stack_slot.scalar_type() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} reference `{reference_name}` cannot borrow aggregate stack slot `{}` without a field projection",
                    identifier.name
                )));
            };
            if machine_type != expected {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} reference `{reference_name}` expects `{}`, but stack slot `{}` stores `{}`",
                    expected.name(),
                    identifier.name,
                    machine_type.name()
                )));
            }
            (
                identifier.name.clone(),
                TypedReferenceLayout::Scalar {
                    machine_type,
                    slot_name: identifier.name.clone(),
                },
            )
        }
        ReferenceTarget::Slice(expected_element) => {
            if !matches!(
                machine_contract,
                SLICE_MACHINE_CONTRACT
                    | SLICE_CALL_MACHINE_CONTRACT
                    | SLICE_FORWARD_MACHINE_CONTRACT
                    | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            ) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} does not enable borrowed slice values"
                )));
            }
            let AstNode::MemberExpression(range_access) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a half-open fixed-array range"
                )));
            };
            if !range_access.computed {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a half-open fixed-array range"
                )));
            }
            let AstNode::Identifier(root) = range_access.object.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a direct fixed-array slot as its provenance root"
                )));
            };
            let Some((start, end)) = parse_slice_range(&range_access.property, machine_contract)?
            else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a half-open fixed-array range"
                )));
            };
            let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a declared fixed-array slot; `{}` is not addressable",
                    root.name
                ))
            })?;
            let StackSlotLayout::FixedArray(array) = &stack_slot.layout else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires a fixed-array slot; `{}` has incompatible storage",
                    root.name
                )));
            };
            validate_slice_range(start, end, array.length, &root.name, machine_contract)?;
            if array.element_type != expected_element {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` expects elements of `{}`, but stack slot `{}` stores `{}`",
                    expected_element.name(),
                    root.name,
                    array.element_type.name()
                )));
            }
            let base_offset = start
                .checked_mul(array.element_type.stack_size())
                .expect("fixed array size is validated");
            (
                root.name.clone(),
                TypedReferenceLayout::Slice {
                    element_type: array.element_type,
                    storage: SliceStorage::Stack {
                        slot_name: root.name.clone(),
                        base_offset,
                        length: end - start,
                    },
                },
            )
        }
    };

    let state = borrow_states.entry(slot_name.clone()).or_default();
    if reference_type.mutable {
        if state.exclusive || state.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably borrow stack slot `{}` because an active borrow already exists",
                slot_name
            )));
        }
        state.exclusive = true;
    } else {
        if state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably borrow stack slot `{}` because an exclusive borrow is active",
                slot_name
            )));
        }
        state.shared += 1;
    }

    Ok(TypedReference {
        layout,
        mutable: reference_type.mutable,
    })
}

fn lower_reference_dereference(
    builder: &mut FunctionBuilder<'_>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    argument: &AstNode,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
) -> Result<TypedValue, NativeCompileError> {
    let AstNode::Identifier(identifier) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} dereference requires a named local reference"
        )));
    };
    let reference = references.get(&identifier.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `{}` is not a typed local reference",
            identifier.name
        ))
    })?;
    let Some(pointee) = reference.scalar_pointee() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice reference `{}` must be indexed; it cannot be dereferenced as a scalar",
            identifier.name
        )));
    };
    if pointee != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but reference `{}` points to `{}`; implicit coercions are forbidden",
            expected.name(),
            identifier.name,
            pointee.name()
        )));
    }
    let slot_name = reference
        .stack_root()
        .expect("scalar references always retain stack provenance");
    let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} reference `{}` lost its stack-slot provenance",
            identifier.name
        ))
    })?;
    Ok(TypedValue {
        value: builder
            .ins()
            .stack_load(pointee.ir_type(), stack_slot.slot, 0),
        machine_type: pointee,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_reference_assignment(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    assignment: &AssignmentNode,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if assignment.operator != "=" {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} dereference assignment supports only `=`"
        )));
    }
    let AstNode::UnaryExpression(target) = assignment.target.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} assignment target must be a mutable dereference"
        )));
    };
    if target.operator != "*" {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} assignment target must be a mutable dereference"
        )));
    }
    let AstNode::Identifier(identifier) = target.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} dereference assignment requires a named local reference"
        )));
    };
    let reference = references.get(&identifier.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `{}` is not a typed local reference",
            identifier.name
        ))
    })?;
    if !reference.mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot write through immutable reference `{}`",
            identifier.name
        )));
    }
    let Some(pointee) = reference.scalar_pointee() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice reference `{}` must be indexed; use `store({}[index], value)`",
            identifier.name, identifier.name
        )));
    };
    let slot_name = reference
        .stack_root()
        .expect("scalar references always retain stack provenance");
    let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} reference `{}` lost its stack-slot provenance",
            identifier.name
        ))
    })?;
    let value = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &assignment.value,
        pointee,
        &format!("assignment through reference `{}`", identifier.name),
        machine_contract,
        true,
    )?;
    builder.ins().stack_store(value.value, stack_slot.slot, 0);
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_expression(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    node: &AstNode,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedValue, NativeCompileError> {
    let value = match node {
        AstNode::Number(number) => {
            let value = match expected {
                MachineType::Bool => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} {context} expects `bool`, but `{}` is an integer literal",
                        number.raw
                    )));
                }
                MachineType::I32 => number.raw.parse::<i32>().map(i64::from).map_err(|_| {
                    NativeCompileError::new(format!(
                        "{machine_contract} {context} requires an `i32` literal; found `{}`",
                        number.raw
                    ))
                })?,
                MachineType::I64 => number.raw.parse::<i64>().map_err(|_| {
                    NativeCompileError::new(format!(
                        "{machine_contract} {context} requires an `i64` literal; found `{}`",
                        number.raw
                    ))
                })?,
            };
            TypedValue {
                value: builder.ins().iconst(expected.ir_type(), value),
                machine_type: expected,
            }
        }
        AstNode::Boolean(boolean) => {
            if expected != MachineType::Bool {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} expects `{}`, but found `bool`",
                    expected.name()
                )));
            }
            TypedValue {
                value: builder.ins().iconst(types::I8, i64::from(boolean.value)),
                machine_type: MachineType::Bool,
            }
        }
        AstNode::Identifier(identifier) => {
            if let Some(reference) = references.get(&identifier.name) {
                let message = match reference.layout {
                    TypedReferenceLayout::Scalar { .. } => format!(
                        "{machine_contract} reference `{}` cannot escape as a scalar value; dereference it with `*{}`",
                        identifier.name, identifier.name
                    ),
                    TypedReferenceLayout::Slice { .. } => format!(
                        "{machine_contract} slice reference `{}` cannot escape as a scalar value; index it with `{}[index]`",
                        identifier.name, identifier.name
                    ),
                };
                return Err(NativeCompileError::new(message));
            }
            if stack_slots.contains_key(&identifier.name) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} stack slot `{}` is not a scalar value; use `load({})`",
                    identifier.name, identifier.name
                )));
            }
            let value = locals.get(&identifier.name).copied().ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} {context} references unknown local `{}`",
                    identifier.name
                ))
            })?;
            require_type(value, expected, context, machine_contract)?
        }
        AstNode::UnaryExpression(unary) if unary.operator == "-" => {
            if expected == MachineType::Bool {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} unary `-` requires an integer operand"
                )));
            }
            let argument = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &unary.argument,
                expected,
                context,
                machine_contract,
                memory_enabled,
            )?;
            TypedValue {
                value: builder.ins().ineg(argument.value),
                machine_type: expected,
            }
        }
        AstNode::UnaryExpression(unary) if unary.operator == "!" => {
            if expected != MachineType::Bool {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} logical `!` produces `bool`, but {context} expects `{}`",
                    expected.name()
                )));
            }
            let argument = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &unary.argument,
                MachineType::Bool,
                context,
                machine_contract,
                memory_enabled,
            )?;
            TypedValue {
                value: builder.ins().icmp_imm(IntCC::Equal, argument.value, 0),
                machine_type: MachineType::Bool,
            }
        }
        AstNode::UnaryExpression(unary) if unary.operator == "*" => lower_reference_dereference(
            builder,
            stack_slots,
            references,
            &unary.argument,
            expected,
            context,
            machine_contract,
        )?,
        AstNode::UnaryExpression(unary) if matches!(unary.operator.as_str(), "&" | "&mut") => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} address-of expression `{}` is allowed only as a typed reference-local initializer",
                unary.operator
            )));
        }
        AstNode::BinaryExpression(binary)
            if matches!(
                binary.operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">="
            ) =>
        {
            return lower_typed_comparison(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                binary,
                expected,
                context,
                machine_contract,
                memory_enabled,
            );
        }
        AstNode::BinaryExpression(binary) if matches!(binary.operator.as_str(), "&&" | "||") => {
            return lower_typed_logical(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                binary,
                expected,
                context,
                machine_contract,
                memory_enabled,
            );
        }
        AstNode::BinaryExpression(binary) => {
            if expected == MachineType::Bool {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} operator `{}` requires integer operands",
                    binary.operator
                )));
            }
            let left = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &binary.left,
                expected,
                context,
                machine_contract,
                memory_enabled,
            )?;
            let right = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &binary.right,
                expected,
                context,
                machine_contract,
                memory_enabled,
            )?;
            let value = match binary.operator.as_str() {
                "+" => builder.ins().iadd(left.value, right.value),
                "-" => builder.ins().isub(left.value, right.value),
                "*" => builder.ins().imul(left.value, right.value),
                operator => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} does not support binary operator `{operator}`"
                    )));
                }
            };
            TypedValue {
                value,
                machine_type: expected,
            }
        }
        AstNode::CallExpression(call) => {
            let AstNode::Identifier(callee) = call.callee.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} supports calls only to named HoloScript functions"
                )));
            };
            if memory_enabled && callee.name == "load" {
                return lower_typed_load(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    call,
                    expected,
                    context,
                    machine_contract,
                );
            }
            if memory_enabled && callee.name == "store" {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `store(slot, value)` is a statement and cannot be used as a value"
                )));
            }
            let abi = functions.get(&callee.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} calls unknown function `{}`",
                    callee.name
                ))
            })?;
            if call.arguments.len() != abi.params.len() {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} call to `{}` expects {} arguments, found {}",
                    callee.name,
                    abi.params.len(),
                    call.arguments.len()
                )));
            }
            if abi.result != expected {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} expects `{}`, but `{}` returns `{}`; implicit coercions are forbidden",
                    expected.name(),
                    callee.name,
                    abi.result.name()
                )));
            }
            let mut arguments = Vec::with_capacity(call.arguments.len() * 2);
            let mut call_borrows = HashMap::new();
            for (index, (argument, parameter)) in call
                .arguments
                .iter()
                .zip(abi.params.iter().copied())
                .enumerate()
            {
                match parameter {
                    MachineParameter::Scalar(machine_type) => arguments.push(
                        lower_typed_expression(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            borrow_states,
                            argument,
                            machine_type,
                            &format!("argument {} to `{}`", index + 1, callee.name),
                            machine_contract,
                            memory_enabled,
                        )?
                        .value,
                    ),
                    MachineParameter::Slice {
                        element_type,
                        mutable,
                    } => {
                        let (base, length) = lower_borrowed_slice_call_argument(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            borrow_states,
                            &mut call_borrows,
                            argument,
                            element_type,
                            mutable,
                            index,
                            &callee.name,
                            machine_contract,
                            memory_enabled,
                        )?;
                        arguments.push(base);
                        arguments.push(length);
                    }
                }
            }
            let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
            let call = builder.ins().call(local_callee, &arguments);
            TypedValue {
                value: builder.inst_results(call)[0],
                machine_type: abi.result,
            }
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} does not support expression node `{}`",
                ast_node_name(other)
            )));
        }
    };
    Ok(value)
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_slice_call_argument(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call_borrows: &mut HashMap<SliceBorrowRoot, BorrowState>,
    argument: &AstNode,
    expected_element: MachineType,
    mutable: bool,
    argument_index: usize,
    callee_name: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(Value, Value), NativeCompileError> {
    if let AstNode::Identifier(identifier) = argument {
        return lower_forwarded_slice_call_argument(
            builder,
            module,
            functions,
            locals,
            stack_slots,
            references,
            borrow_states,
            call_borrows,
            &identifier.name,
            None,
            expected_element,
            mutable,
            argument_index,
            callee_name,
            machine_contract,
            memory_enabled,
        );
    }

    let AstNode::UnaryExpression(borrow) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` must be a direct range reborrow or a named slice forwarding",
            argument_index + 1
        )));
    };
    if let AstNode::MemberExpression(range_access) = borrow.argument.as_ref() {
        if let AstNode::Identifier(root) = range_access.object.as_ref() {
            if references.contains_key(&root.name) {
                if !range_access.computed {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} slice argument {} to `{callee_name}` requires a half-open named slice range",
                        argument_index + 1
                    )));
                }
                return lower_forwarded_slice_call_argument(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    call_borrows,
                    &root.name,
                    Some((borrow.operator.as_str(), range_access.property.as_ref())),
                    expected_element,
                    mutable,
                    argument_index,
                    callee_name,
                    machine_contract,
                    memory_enabled,
                );
            }
        }
    }

    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` expects `{expected_operator}`, found `{}`",
            argument_index + 1,
            borrow.operator
        )));
    }
    let AstNode::MemberExpression(range_access) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a half-open fixed-array range",
            argument_index + 1
        )));
    };
    if !range_access.computed {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a half-open fixed-array range",
            argument_index + 1
        )));
    }
    let AstNode::Identifier(root) = range_access.object.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a direct fixed-array slot as its provenance root",
            argument_index + 1
        )));
    };
    let Some((start, end)) = parse_slice_range(&range_access.property, machine_contract)? else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a half-open fixed-array range",
            argument_index + 1
        )));
    };
    let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a declared fixed-array slot; `{}` is not addressable",
            argument_index + 1,
            root.name
        ))
    })?;
    let StackSlotLayout::FixedArray(array) = &stack_slot.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a fixed-array slot; `{}` has incompatible storage",
            argument_index + 1,
            root.name
        )));
    };
    validate_slice_range(start, end, array.length, &root.name, machine_contract)?;
    if array.element_type != expected_element {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` expects elements of `{}`, but stack slot `{}` stores `{}`",
            argument_index + 1,
            expected_element.name(),
            root.name,
            array.element_type.name()
        )));
    }

    let active = borrow_states.get(&root.name).copied().unwrap_or_default();
    let siblings = call_borrows
        .entry(SliceBorrowRoot::Stack(root.name.clone()))
        .or_default();
    if mutable {
        if active.exclusive || active.shared > 0 || siblings.exclusive || siblings.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably reborrow stack slot `{}` for call to `{callee_name}` because an active or sibling borrow exists",
                root.name
            )));
        }
        siblings.exclusive = true;
    } else {
        if active.exclusive || siblings.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably reborrow stack slot `{}` for call to `{callee_name}` because an exclusive borrow exists",
                root.name
            )));
        }
        siblings.shared += 1;
    }

    let base_offset = start
        .checked_mul(array.element_type.stack_size())
        .expect("fixed array size is validated");
    let pointer_type = module.target_config().pointer_type();
    let base = builder.ins().stack_addr(
        pointer_type,
        stack_slot.slot,
        i32::try_from(base_offset).expect("fixed array offset is validated"),
    );
    let length = builder.ins().iconst(types::I32, i64::from(end - start));
    Ok((base, length))
}

#[derive(Clone, Copy)]
enum ForwardedSliceRange {
    Whole,
    Literal { start: u32, end: u32 },
    Runtime { start: Value, end: Value },
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_slice_call_argument(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call_borrows: &mut HashMap<SliceBorrowRoot, BorrowState>,
    reference_name: &str,
    subrange: Option<(&str, &AstNode)>,
    expected_element: MachineType,
    mutable: bool,
    argument_index: usize,
    callee_name: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(Value, Value), NativeCompileError> {
    if !matches!(
        machine_contract,
        SLICE_FORWARD_MACHINE_CONTRACT | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` must be a direct range reborrow",
            argument_index + 1
        )));
    }
    let reference = references.get(reference_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` references unknown slice `{reference_name}`",
            argument_index + 1
        ))
    })?;
    let TypedReferenceLayout::Slice {
        element_type,
        storage,
    } = &reference.layout
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` requires a borrowed slice reference; `{reference_name}` is scalar",
            argument_index + 1
        )));
    };
    if *element_type != expected_element {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice argument {} to `{callee_name}` expects elements of `{}`, but slice `{reference_name}` stores `{}`",
            argument_index + 1,
            expected_element.name(),
            element_type.name()
        )));
    }
    if mutable && !reference.mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot mutably forward immutable slice `{reference_name}` to argument {} of `{callee_name}`",
            argument_index + 1
        )));
    }
    if let Some((operator, _)) = subrange {
        let expected_operator = if mutable { "&mut" } else { "&" };
        if operator != expected_operator {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} slice argument {} to `{callee_name}` expects `{expected_operator}`, found `{operator}`",
                argument_index + 1
            )));
        }
    }

    let forwarded_range = match subrange {
        Some((_, range_node)) if machine_contract == SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT => {
            let AstNode::BinaryExpression(range) = range_node else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice argument {} to `{callee_name}` requires a half-open named slice range",
                    argument_index + 1
                )));
            };
            if range.operator != ".." {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice argument {} to `{callee_name}` requires a half-open named slice range",
                    argument_index + 1
                )));
            }
            let start = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &range.left,
                MachineType::I32,
                &format!("slice range start for `{reference_name}`"),
                machine_contract,
                memory_enabled,
            )?
            .value;
            let end = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &range.right,
                MachineType::I32,
                &format!("slice range end for `{reference_name}`"),
                machine_contract,
                memory_enabled,
            )?
            .value;
            ForwardedSliceRange::Runtime { start, end }
        }
        Some((_, range)) => {
            let Some((start, end)) = parse_slice_range(range, machine_contract)? else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice argument {} to `{callee_name}` requires a half-open named slice range",
                    argument_index + 1
                )));
            };
            if start > end {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice range {start}..{end} is not half-open and ordered for `{reference_name}`"
                )));
            }
            if end > i32::MAX as u32 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice range end {end} exceeds the i32 length ABI for `{reference_name}`"
                )));
            }
            ForwardedSliceRange::Literal { start, end }
        }
        None => ForwardedSliceRange::Whole,
    };

    let borrow_root = match storage {
        SliceStorage::Stack { slot_name, .. } => {
            let active = borrow_states.get(slot_name).copied().unwrap_or_default();
            if reference.mutable {
                if !active.exclusive {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} lost the exclusive provenance lease for mutable slice `{reference_name}`"
                    )));
                }
            } else if active.shared == 0 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} lost the shared provenance lease for slice `{reference_name}`"
                )));
            }
            SliceBorrowRoot::Stack(slot_name.clone())
        }
        SliceStorage::Parameter { .. } => SliceBorrowRoot::Parameter,
    };
    acquire_forwarded_call_borrow(
        call_borrows,
        borrow_root,
        mutable,
        reference_name,
        callee_name,
        machine_contract,
    )?;

    let pointer_type = module.target_config().pointer_type();
    match storage {
        SliceStorage::Stack {
            slot_name,
            base_offset,
            length,
        } => {
            let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} forwarded slice `{reference_name}` lost its stack-slot provenance"
                ))
            })?;
            match forwarded_range {
                ForwardedSliceRange::Whole => {
                    let base = builder.ins().stack_addr(
                        pointer_type,
                        stack_slot.slot,
                        i32::try_from(*base_offset).map_err(|_| {
                            NativeCompileError::new(format!(
                                "{machine_contract} slice `{reference_name}` byte offset exceeds the native stack ABI"
                            ))
                        })?,
                    );
                    let length = builder.ins().iconst(types::I32, i64::from(*length));
                    Ok((base, length))
                }
                ForwardedSliceRange::Literal { start, end } => {
                    validate_slice_range(start, end, *length, reference_name, machine_contract)?;
                    let relative_offset = start
                        .checked_mul(element_type.stack_size())
                        .and_then(|offset| base_offset.checked_add(offset))
                        .ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} slice `{reference_name}` byte offset overflowed"
                            ))
                        })?;
                    let base = builder.ins().stack_addr(
                        pointer_type,
                        stack_slot.slot,
                        i32::try_from(relative_offset).map_err(|_| {
                            NativeCompileError::new(format!(
                                "{machine_contract} slice `{reference_name}` byte offset exceeds the native stack ABI"
                            ))
                        })?,
                    );
                    let length = builder.ins().iconst(types::I32, i64::from(end - start));
                    Ok((base, length))
                }
                ForwardedSliceRange::Runtime { start, end } => {
                    let source_length = builder.ins().iconst(types::I32, i64::from(*length));
                    emit_runtime_slice_range_checks(
                        builder,
                        start,
                        end,
                        source_length,
                        pointer_type,
                        element_type.stack_size(),
                        *base_offset,
                    );
                    let source_base = builder.ins().stack_addr(
                        pointer_type,
                        stack_slot.slot,
                        i32::try_from(*base_offset).map_err(|_| {
                            NativeCompileError::new(format!(
                                "{machine_contract} slice `{reference_name}` byte offset exceeds the native stack ABI"
                            ))
                        })?,
                    );
                    let base = offset_runtime_slice_base(
                        builder,
                        pointer_type,
                        source_base,
                        start,
                        element_type.stack_size(),
                    );
                    let length = builder.ins().isub(end, start);
                    Ok((base, length))
                }
            }
        }
        SliceStorage::Parameter { base, length } => match forwarded_range {
            ForwardedSliceRange::Whole => Ok((*base, *length)),
            ForwardedSliceRange::Literal { start, end } => {
                let end_value = builder.ins().iconst(types::I32, i64::from(end));
                let outside = builder
                    .ins()
                    .icmp(IntCC::UnsignedGreaterThan, end_value, *length);
                builder.ins().trapnz(outside, TrapCode::unwrap_user(1));

                let byte_offset = u64::from(start) * u64::from(element_type.stack_size());
                if pointer_type == types::I32 && byte_offset > u64::from(u32::MAX) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} slice `{reference_name}` byte offset exceeds the target pointer width"
                    )));
                }
                let forwarded_base = if byte_offset == 0 {
                    *base
                } else {
                    let offset = builder.ins().iconst(
                        pointer_type,
                        i64::try_from(byte_offset)
                            .expect("i32 slice length bounds the byte offset"),
                    );
                    builder.ins().iadd(*base, offset)
                };
                let forwarded_length = builder.ins().iconst(types::I32, i64::from(end - start));
                Ok((forwarded_base, forwarded_length))
            }
            ForwardedSliceRange::Runtime { start, end } => {
                emit_runtime_slice_range_checks(
                    builder,
                    start,
                    end,
                    *length,
                    pointer_type,
                    element_type.stack_size(),
                    0,
                );
                let forwarded_base = offset_runtime_slice_base(
                    builder,
                    pointer_type,
                    *base,
                    start,
                    element_type.stack_size(),
                );
                let forwarded_length = builder.ins().isub(end, start);
                Ok((forwarded_base, forwarded_length))
            }
        },
    }
}

fn emit_runtime_slice_range_checks(
    builder: &mut FunctionBuilder<'_>,
    start: Value,
    end: Value,
    source_length: Value,
    pointer_type: Type,
    element_size: u32,
    base_offset: u32,
) {
    let negative_start = builder.ins().icmp_imm(IntCC::SignedLessThan, start, 0);
    builder
        .ins()
        .trapnz(negative_start, TrapCode::unwrap_user(1));
    let negative_end = builder.ins().icmp_imm(IntCC::SignedLessThan, end, 0);
    builder.ins().trapnz(negative_end, TrapCode::unwrap_user(1));
    let reversed = builder.ins().icmp(IntCC::SignedGreaterThan, start, end);
    builder.ins().trapnz(reversed, TrapCode::unwrap_user(1));
    let outside = builder
        .ins()
        .icmp(IntCC::SignedGreaterThan, end, source_length);
    builder.ins().trapnz(outside, TrapCode::unwrap_user(1));

    if let Some(max_start) = runtime_slice_start_limit(pointer_type, element_size, base_offset) {
        let offset_overflows =
            builder
                .ins()
                .icmp_imm(IntCC::UnsignedGreaterThan, start, i64::from(max_start));
        builder
            .ins()
            .trapnz(offset_overflows, TrapCode::unwrap_user(1));
    }
}

fn runtime_slice_start_limit(
    pointer_type: Type,
    element_size: u32,
    base_offset: u32,
) -> Option<u32> {
    if pointer_type != types::I32 {
        return None;
    }
    let max_start = (u32::MAX - base_offset) / element_size;
    (max_start < i32::MAX as u32).then_some(max_start)
}

fn offset_runtime_slice_base(
    builder: &mut FunctionBuilder<'_>,
    pointer_type: Type,
    base: Value,
    start: Value,
    element_size: u32,
) -> Value {
    let pointer_start = if pointer_type == types::I32 {
        start
    } else {
        builder.ins().uextend(pointer_type, start)
    };
    let byte_offset = builder
        .ins()
        .imul_imm(pointer_start, i64::from(element_size));
    builder.ins().iadd(base, byte_offset)
}

#[cfg(test)]
mod runtime_slice_tests {
    use super::*;

    #[test]
    fn offset_limit_covers_32_bit_scaling_and_skips_safe_widths() {
        assert_eq!(runtime_slice_start_limit(types::I32, 1, 0), None);
        assert_eq!(
            runtime_slice_start_limit(types::I32, 4, 0),
            Some(u32::MAX / 4)
        );
        assert_eq!(
            runtime_slice_start_limit(types::I32, 8, 16),
            Some((u32::MAX - 16) / 8)
        );
        assert_eq!(runtime_slice_start_limit(types::I64, 8, 16), None);
    }
}

fn acquire_forwarded_call_borrow(
    call_borrows: &mut HashMap<SliceBorrowRoot, BorrowState>,
    root: SliceBorrowRoot,
    mutable: bool,
    reference_name: &str,
    callee_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let siblings = call_borrows.entry(root).or_default();
    if mutable {
        if siblings.exclusive || siblings.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably forward slice `{reference_name}` to `{callee_name}` because a sibling slice argument has the same or potentially aliasing provenance"
            )));
        }
        siblings.exclusive = true;
    } else {
        if siblings.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably forward slice `{reference_name}` to `{callee_name}` because a sibling mutable slice argument has the same or potentially aliasing provenance"
            )));
        }
        siblings.shared += 1;
    }
    Ok(())
}

fn known_expression_type(
    node: &AstNode,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    machine_contract: &str,
) -> Option<MachineType> {
    match node {
        AstNode::Boolean(_) => Some(MachineType::Bool),
        AstNode::Identifier(identifier) => {
            locals.get(&identifier.name).map(|value| value.machine_type)
        }
        AstNode::UnaryExpression(unary) if unary.operator == "!" => Some(MachineType::Bool),
        AstNode::UnaryExpression(unary) if unary.operator == "*" => {
            let AstNode::Identifier(identifier) = unary.argument.as_ref() else {
                return None;
            };
            references
                .get(&identifier.name)
                .and_then(TypedReference::scalar_pointee)
        }
        AstNode::UnaryExpression(unary) if unary.operator == "-" => known_expression_type(
            &unary.argument,
            functions,
            locals,
            stack_slots,
            references,
            machine_contract,
        ),
        AstNode::BinaryExpression(binary)
            if matches!(
                binary.operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||"
            ) =>
        {
            Some(MachineType::Bool)
        }
        AstNode::BinaryExpression(binary) => known_expression_type(
            &binary.left,
            functions,
            locals,
            stack_slots,
            references,
            machine_contract,
        )
        .or_else(|| {
            known_expression_type(
                &binary.right,
                functions,
                locals,
                stack_slots,
                references,
                machine_contract,
            )
        }),
        AstNode::CallExpression(call) => {
            let AstNode::Identifier(callee) = call.callee.as_ref() else {
                return None;
            };
            if callee.name == "load" {
                resolve_stack_access(
                    call.arguments.first()?,
                    stack_slots,
                    references,
                    "load",
                    machine_contract,
                )
                .ok()
                .map(|access| access.machine_type)
            } else {
                functions.get(&callee.name).map(|abi| abi.result)
            }
        }
        _ => None,
    }
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_comparison(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    binary: &BinaryExpression,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedValue, NativeCompileError> {
    if expected != MachineType::Bool {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} comparison `{}` produces `bool`, but {context} expects `{}`",
            binary.operator,
            expected.name()
        )));
    }

    let left_type = known_expression_type(
        &binary.left,
        functions,
        locals,
        stack_slots,
        references,
        machine_contract,
    );
    let right_type = known_expression_type(
        &binary.right,
        functions,
        locals,
        stack_slots,
        references,
        machine_contract,
    );
    let operand_type = match (left_type, right_type) {
        (Some(left), Some(right)) if left == right => left,
        (Some(left), None) if left != MachineType::Bool => left,
        (None, Some(right)) if right != MachineType::Bool => right,
        (None, None) => MachineType::I32,
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} comparison operands have incompatible types"
            )));
        }
    };
    if operand_type == MachineType::Bool && !matches!(binary.operator.as_str(), "==" | "!=") {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} ordering comparison `{}` requires integer operands",
            binary.operator
        )));
    }

    let left = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &binary.left,
        operand_type,
        "left comparison operand",
        machine_contract,
        memory_enabled,
    )?;
    let right = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &binary.right,
        operand_type,
        "right comparison operand",
        machine_contract,
        memory_enabled,
    )?;
    let condition = match binary.operator.as_str() {
        "==" => IntCC::Equal,
        "!=" => IntCC::NotEqual,
        "<" => IntCC::SignedLessThan,
        "<=" => IntCC::SignedLessThanOrEqual,
        ">" => IntCC::SignedGreaterThan,
        ">=" => IntCC::SignedGreaterThanOrEqual,
        _ => unreachable!("comparison operators are filtered by the caller"),
    };
    Ok(TypedValue {
        value: builder.ins().icmp(condition, left.value, right.value),
        machine_type: MachineType::Bool,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_logical(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    binary: &BinaryExpression,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedValue, NativeCompileError> {
    if expected != MachineType::Bool {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} logical `{}` produces `bool`, but {context} expects `{}`",
            binary.operator,
            expected.name()
        )));
    }
    let left = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &binary.left,
        MachineType::Bool,
        "left logical operand",
        machine_contract,
        memory_enabled,
    )?;
    let right_block = builder.create_block();
    let short_block = builder.create_block();
    let merge_block = builder.create_block();
    let result = builder.append_block_param(merge_block, types::I8);
    if binary.operator == "&&" {
        builder
            .ins()
            .brif(left.value, right_block, &[], short_block, &[]);
    } else {
        builder
            .ins()
            .brif(left.value, short_block, &[], right_block, &[]);
    }

    builder.switch_to_block(short_block);
    let short_value = builder
        .ins()
        .iconst(types::I8, i64::from(binary.operator == "||"));
    builder.ins().jump(merge_block, &[short_value.into()]);

    builder.switch_to_block(right_block);
    let right = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &binary.right,
        MachineType::Bool,
        "right logical operand",
        machine_contract,
        memory_enabled,
    )?;
    builder.ins().jump(merge_block, &[right.value.into()]);

    builder.switch_to_block(merge_block);
    Ok(TypedValue {
        value: result,
        machine_type: MachineType::Bool,
    })
}

struct DynamicArrayIndex<'a> {
    expression: &'a AstNode,
    bound: DynamicArrayBound,
    element_size: u32,
}

#[derive(Clone, Copy)]
enum DynamicArrayBound {
    Constant(u32),
    Runtime(Value),
}

enum StackAccessProvenance {
    Owner,
    Slice {
        reference_name: String,
        mutable: bool,
    },
    SliceParameter {
        reference_name: String,
        mutable: bool,
    },
}

struct ResolvedStackAccess<'a> {
    slot: Option<StackSlot>,
    base_address: Option<Value>,
    machine_type: MachineType,
    offset: i32,
    dynamic_index: Option<DynamicArrayIndex<'a>>,
    root_name: String,
    display: String,
    provenance: StackAccessProvenance,
}

fn resolve_stack_access<'a>(
    argument: &'a AstNode,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    operation: &str,
    machine_contract: &str,
) -> Result<ResolvedStackAccess<'a>, NativeCompileError> {
    match argument {
        AstNode::Identifier(identifier) => {
            if let Some(reference) = references.get(&identifier.name) {
                let requirement = match reference.layout {
                    TypedReferenceLayout::Scalar { .. } => "must be dereferenced with `*`",
                    TypedReferenceLayout::Slice { .. } => "must be indexed",
                };
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} reference `{}` {requirement} before `{operation}`",
                    identifier.name
                )));
            }
            let stack_slot = stack_slots.get(&identifier.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} `{operation}` references unknown stack slot `{}`",
                    identifier.name
                ))
            })?;
            let Some(machine_type) = stack_slot.scalar_type() else {
                let storage = match stack_slot.layout {
                    StackSlotLayout::Aggregate(_) => "aggregate",
                    StackSlotLayout::FixedArray(_) => "fixed array",
                    StackSlotLayout::Scalar(_) => unreachable!("scalar type was already checked"),
                };
                let requirement = if matches!(stack_slot.layout, StackSlotLayout::FixedArray(_)) {
                    "an element index"
                } else {
                    "a field projection"
                };
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {storage} slot `{}` requires {requirement}",
                    identifier.name
                )));
            };
            Ok(ResolvedStackAccess {
                slot: Some(stack_slot.slot),
                base_address: None,
                machine_type,
                offset: 0,
                dynamic_index: None,
                root_name: identifier.name.clone(),
                display: identifier.name.clone(),
                provenance: StackAccessProvenance::Owner,
            })
        }
        AstNode::MemberExpression(member) => {
            if member.computed {
                return resolve_array_access(
                    member,
                    stack_slots,
                    references,
                    operation,
                    machine_contract,
                );
            }
            let AstNode::Identifier(root) = member.object.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `{operation}` requires a direct aggregate slot as the field root"
                )));
            };
            let AstNode::Identifier(property) = member.property.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `{operation}` requires a named aggregate field"
                )));
            };
            let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} `{operation}` references unknown aggregate slot `{}`",
                    root.name
                ))
            })?;
            let StackSlotLayout::Aggregate(layout) = &stack_slot.layout else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} scalar stack slot `{}` has no field `{}`",
                    root.name, property.name
                )));
            };
            let field = layout
                .fields
                .iter()
                .find(|field| field.name == property.name)
                .ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} aggregate `{}` has no field `{}`",
                        layout.name, property.name
                    ))
                })?;
            Ok(ResolvedStackAccess {
                slot: Some(stack_slot.slot),
                base_address: None,
                machine_type: field.machine_type,
                offset: i32::try_from(field.offset).expect("validated aggregate field offset"),
                dynamic_index: None,
                root_name: root.name.clone(),
                display: format!("{}.{}", root.name, property.name),
                provenance: StackAccessProvenance::Owner,
            })
        }
        _ => Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` requires a stack slot or aggregate field"
        ))),
    }
}

fn resolve_array_access<'a>(
    member: &'a MemberExpression,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    operation: &str,
    machine_contract: &str,
) -> Result<ResolvedStackAccess<'a>, NativeCompileError> {
    if let AstNode::Identifier(root) = member.object.as_ref() {
        if let Some(reference) = references.get(&root.name) {
            let TypedReferenceLayout::Slice {
                element_type,
                storage,
            } = &reference.layout
            else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} scalar reference `{}` does not support indexed access",
                    root.name
                )));
            };
            return match storage {
                SliceStorage::Stack {
                    slot_name,
                    base_offset,
                    length,
                } => {
                    let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                        NativeCompileError::new(format!(
                            "{machine_contract} slice reference `{}` lost its stack-slot provenance",
                            root.name
                        ))
                    })?;
                    finish_array_access(
                        slot_name,
                        stack_slot,
                        *element_type,
                        member.property.as_ref(),
                        *base_offset,
                        *length,
                        format!("{}[index]", root.name),
                        StackAccessProvenance::Slice {
                            reference_name: root.name.clone(),
                            mutable: reference.mutable,
                        },
                        machine_contract,
                    )
                }
                SliceStorage::Parameter { base, length } => Ok(ResolvedStackAccess {
                    slot: None,
                    base_address: Some(*base),
                    machine_type: *element_type,
                    offset: 0,
                    dynamic_index: Some(DynamicArrayIndex {
                        expression: member.property.as_ref(),
                        bound: DynamicArrayBound::Runtime(*length),
                        element_size: element_type.stack_size(),
                    }),
                    root_name: root.name.clone(),
                    display: format!("{}[index]", root.name),
                    provenance: StackAccessProvenance::SliceParameter {
                        reference_name: root.name.clone(),
                        mutable: reference.mutable,
                    },
                }),
            };
        }
        let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} `{operation}` references unknown stack slot `{}`",
                root.name
            ))
        })?;
        let StackSlotLayout::FixedArray(layout) = &stack_slot.layout else {
            let message = if matches!(stack_slot.layout, StackSlotLayout::Aggregate(_)) {
                format!(
                    "{machine_contract} `{operation}` does not support computed aggregate field access"
                )
            } else {
                format!(
                    "{machine_contract} scalar stack slot `{}` does not support indexed access",
                    root.name
                )
            };
            return Err(NativeCompileError::new(message));
        };
        if let Some((start, end)) = parse_slice_range(&member.property, machine_contract)? {
            validate_slice_range(start, end, layout.length, &root.name, machine_contract)?;
            return Err(NativeCompileError::new(format!(
                "{machine_contract} slice projection `{}[{start}..{end}]` requires an element index",
                root.name
            )));
        }
        return finish_array_access(
            root.name.as_str(),
            stack_slot,
            layout.element_type,
            member.property.as_ref(),
            0,
            layout.length,
            format!("{}[index]", root.name),
            StackAccessProvenance::Owner,
            machine_contract,
        );
    }

    let AstNode::MemberExpression(slice) = member.object.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` requires a direct fixed array slot or slice projection"
        )));
    };
    if !slice.computed {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` supports nested access only for a computed slice projection"
        )));
    }
    let AstNode::Identifier(root) = slice.object.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` requires a direct fixed array slot as the slice root"
        )));
    };
    let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `{operation}` references unknown stack slot `{}`",
            root.name
        ))
    })?;
    let StackSlotLayout::FixedArray(layout) = &stack_slot.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` slice root `{}` is not a fixed array slot",
            root.name
        )));
    };
    let Some((start, end)) = parse_slice_range(&slice.property, machine_contract)? else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` supports nested computed access only for `array[start..end][index]` slice projections"
        )));
    };
    validate_slice_range(start, end, layout.length, &root.name, machine_contract)?;
    let base_offset = start
        .checked_mul(layout.element_type.stack_size())
        .expect("fixed array size is validated");
    finish_array_access(
        root.name.as_str(),
        stack_slot,
        layout.element_type,
        member.property.as_ref(),
        base_offset,
        end - start,
        format!("{}[{start}..{end}][index]", root.name),
        StackAccessProvenance::Owner,
        machine_contract,
    )
}

fn parse_slice_range(
    node: &AstNode,
    machine_contract: &str,
) -> Result<Option<(u32, u32)>, NativeCompileError> {
    let AstNode::BinaryExpression(range) = node else {
        return Ok(None);
    };
    if range.operator != ".." {
        return Ok(None);
    }
    let start = parse_slice_bound(&range.left, "start", machine_contract)?;
    let end = parse_slice_bound(&range.right, "end", machine_contract)?;
    Ok(Some((start, end)))
}

fn parse_slice_bound(
    node: &AstNode,
    boundary: &str,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let AstNode::Number(number) = node else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice {boundary} must be a non-negative integer literal"
        )));
    };
    number.raw.parse::<u32>().map_err(|_| {
        NativeCompileError::new(format!(
            "{machine_contract} slice {boundary} must be a non-negative integer literal; found `{}`",
            number.raw
        ))
    })
}

fn validate_slice_range(
    start: u32,
    end: u32,
    array_length: u32,
    array_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if start > end {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice range {start}..{end} is not half-open and ordered for `{array_name}`"
        )));
    }
    if end > array_length {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} slice range {start}..{end} exceeds fixed array length {array_length} for `{array_name}`"
        )));
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn finish_array_access<'a>(
    root_name: &str,
    stack_slot: &TypedStackSlot,
    element_type: MachineType,
    index: &'a AstNode,
    base_offset: u32,
    bound: u32,
    display: String,
    provenance: StackAccessProvenance,
    machine_contract: &str,
) -> Result<ResolvedStackAccess<'a>, NativeCompileError> {
    if let AstNode::Number(number) = index {
        let index = number.raw.parse::<u32>().map_err(|_| {
            NativeCompileError::new(format!(
                "{machine_contract} fixed array index must be a non-negative `i32` integer; found `{}`",
                number.raw
            ))
        })?;
        if index >= bound {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} constant index {index} is outside bound {bound} for `{root_name}`"
            )));
        }
        let offset = base_offset
            .checked_add(
                index
                    .checked_mul(element_type.stack_size())
                    .expect("fixed array size is validated"),
            )
            .expect("fixed array size is validated");
        return Ok(ResolvedStackAccess {
            slot: Some(stack_slot.slot),
            base_address: None,
            machine_type: element_type,
            offset: i32::try_from(offset).expect("fixed array offset is validated"),
            dynamic_index: None,
            root_name: root_name.to_string(),
            display,
            provenance,
        });
    }

    Ok(ResolvedStackAccess {
        slot: Some(stack_slot.slot),
        base_address: None,
        machine_type: element_type,
        offset: i32::try_from(base_offset).expect("fixed array offset is validated"),
        dynamic_index: Some(DynamicArrayIndex {
            expression: index,
            bound: DynamicArrayBound::Constant(bound),
            element_size: element_type.stack_size(),
        }),
        root_name: root_name.to_string(),
        display,
        provenance,
    })
}

fn validate_stack_access_borrow(
    access: &ResolvedStackAccess<'_>,
    borrow_states: &HashMap<String, BorrowState>,
    operation: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    match &access.provenance {
        StackAccessProvenance::Owner => {
            let state = borrow_states
                .get(&access.root_name)
                .copied()
                .unwrap_or_default();
            if operation == "load" && state.exclusive {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot directly load stack slot `{}` while an exclusive borrow is active",
                    access.root_name
                )));
            }
            if operation == "store" && (state.shared > 0 || state.exclusive) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot store to stack slot `{}` while an active borrow exists",
                    access.root_name
                )));
            }
        }
        StackAccessProvenance::Slice {
            reference_name,
            mutable,
        } => {
            if operation == "store" && !mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot write through immutable slice reference `{reference_name}`"
                )));
            }
            let state = borrow_states.get(&access.root_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} lost active borrow state for slice reference `{reference_name}`"
                ))
            })?;
            let lease_is_active = if *mutable {
                state.exclusive
            } else {
                state.shared > 0 && !state.exclusive
            };
            if !lease_is_active {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` no longer owns a valid borrow lease"
                )));
            }
        }
        StackAccessProvenance::SliceParameter {
            reference_name,
            mutable,
        } => {
            if operation == "store" && !mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot write through immutable slice parameter `{reference_name}`"
                )));
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn lower_checked_stack_address(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    access: &ResolvedStackAccess<'_>,
    machine_contract: &str,
) -> Result<Value, NativeCompileError> {
    let dynamic = access
        .dynamic_index
        .as_ref()
        .expect("checked address requires a dynamic array index");
    let index = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        dynamic.expression,
        MachineType::I32,
        &format!("index for `{}`", access.display),
        machine_contract,
        true,
    )?;
    let out_of_bounds = match dynamic.bound {
        DynamicArrayBound::Constant(bound) => builder.ins().icmp_imm(
            IntCC::UnsignedGreaterThanOrEqual,
            index.value,
            i64::from(bound),
        ),
        DynamicArrayBound::Runtime(bound) => {
            builder
                .ins()
                .icmp(IntCC::UnsignedGreaterThanOrEqual, index.value, bound)
        }
    };
    builder
        .ins()
        .trapnz(out_of_bounds, TrapCode::unwrap_user(1));

    let pointer_type = module.target_config().pointer_type();
    let pointer_index = if pointer_type == types::I32 {
        index.value
    } else {
        builder.ins().uextend(pointer_type, index.value)
    };
    let scaled_index = builder
        .ins()
        .imul_imm(pointer_index, i64::from(dynamic.element_size));
    let base = if let Some(base) = access.base_address {
        debug_assert_eq!(builder.func.dfg.value_type(base), pointer_type);
        base
    } else {
        builder.ins().stack_addr(
            pointer_type,
            access
                .slot
                .expect("local checked access must retain its stack slot"),
            access.offset,
        )
    };
    Ok(builder.ins().iadd(base, scaled_index))
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_load(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call: &CallExpression,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
) -> Result<TypedValue, NativeCompileError> {
    if call.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `load` expects exactly one stack slot, found {} arguments",
            call.arguments.len()
        )));
    }
    let access = resolve_stack_access(
        &call.arguments[0],
        stack_slots,
        references,
        "load",
        machine_contract,
    )?;
    validate_stack_access_borrow(&access, borrow_states, "load", machine_contract)?;
    if access.machine_type != expected {
        let storage = if access.display.contains('.') {
            format!("aggregate field `{}`", access.display)
        } else {
            format!("stack slot `{}`", access.display)
        };
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but {storage} stores `{}`; implicit coercions are forbidden",
            expected.name(),
            access.machine_type.name()
        )));
    }
    let value = if access.dynamic_index.is_some() {
        let address = lower_checked_stack_address(
            builder,
            module,
            functions,
            locals,
            stack_slots,
            references,
            borrow_states,
            &access,
            machine_contract,
        )?;
        builder
            .ins()
            .load(access.machine_type.ir_type(), MemFlags::new(), address, 0)
    } else {
        builder.ins().stack_load(
            access.machine_type.ir_type(),
            access
                .slot
                .expect("direct access must retain its stack slot"),
            access.offset,
        )
    };
    Ok(TypedValue {
        value,
        machine_type: access.machine_type,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_store(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call: &CallExpression,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if call.arguments.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `store` expects a stack slot and one value, found {} arguments",
            call.arguments.len()
        )));
    }
    let access = resolve_stack_access(
        &call.arguments[0],
        stack_slots,
        references,
        "store",
        machine_contract,
    )?;
    validate_stack_access_borrow(&access, borrow_states, "store", machine_contract)?;
    let value_context = if access.display.contains('.') {
        format!("field `{}`", access.display)
    } else {
        format!("store to stack slot `{}`", access.display)
    };
    let address = if access.dynamic_index.is_some() {
        Some(lower_checked_stack_address(
            builder,
            module,
            functions,
            locals,
            stack_slots,
            references,
            borrow_states,
            &access,
            machine_contract,
        )?)
    } else {
        None
    };
    let value = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &call.arguments[1],
        access.machine_type,
        &value_context,
        machine_contract,
        true,
    )?;
    if let Some(address) = address {
        builder
            .ins()
            .store(MemFlags::new(), value.value, address, 0);
    } else {
        builder.ins().stack_store(
            value.value,
            access
                .slot
                .expect("direct access must retain its stack slot"),
            access.offset,
        );
    }
    Ok(())
}

fn require_type(
    value: TypedValue,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
) -> Result<TypedValue, NativeCompileError> {
    if value.machine_type != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, found `{}`; implicit coercions are forbidden",
            expected.name(),
            value.machine_type.name()
        )));
    }
    Ok(value)
}

fn select_entry_function(ast: &Ast) -> Result<&FunctionNode, NativeCompileError> {
    if ast.body.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} requires exactly one top-level `function main`; found {} nodes",
            ast.body.len()
        )));
    }

    let AstNode::Function(function) = &ast.body[0] else {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} supports only a top-level `function main`"
        )));
    };
    if function.name != "main" {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} entry function must be named `main`, found `{}`",
            function.name
        )));
    }
    if !function.params.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} `main` cannot declare parameters"
        )));
    }
    Ok(function)
}

fn select_entry_expression(function: &FunctionNode) -> Result<&AstNode, NativeCompileError> {
    if function.body.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} `main` must contain exactly one return statement"
        )));
    }
    let AstNode::Return(return_node) = &function.body[0] else {
        return Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} `main` body must be a return statement"
        )));
    };
    return_node.argument.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} `main` must return an integral expression"
        ))
    })
}

fn lower_integer_expression(
    builder: &mut FunctionBuilder<'_>,
    node: &AstNode,
) -> Result<Value, NativeCompileError> {
    match node {
        AstNode::Number(number) => {
            let value = number.raw.parse::<i64>().map_err(|_| {
                NativeCompileError::new(format!(
                    "{MACHINE_CONTRACT} accepts only integral i64 number literals; found `{}`",
                    number.raw
                ))
            })?;
            Ok(builder.ins().iconst(types::I64, value))
        }
        AstNode::UnaryExpression(unary) if unary.operator == "-" => {
            let value = lower_integer_expression(builder, &unary.argument)?;
            Ok(builder.ins().ineg(value))
        }
        AstNode::BinaryExpression(binary) => {
            let left = lower_integer_expression(builder, &binary.left)?;
            let right = lower_integer_expression(builder, &binary.right)?;
            match binary.operator.as_str() {
                "+" => Ok(builder.ins().iadd(left, right)),
                "-" => Ok(builder.ins().isub(left, right)),
                "*" => Ok(builder.ins().imul(left, right)),
                operator => Err(NativeCompileError::new(format!(
                    "{MACHINE_CONTRACT} does not support binary operator `{operator}`"
                ))),
            }
        }
        other => Err(NativeCompileError::new(format!(
            "{MACHINE_CONTRACT} does not support expression node `{}`",
            ast_node_name(other)
        ))),
    }
}

fn ast_node_name(node: &AstNode) -> &'static str {
    match node {
        AstNode::String(_) => "String",
        AstNode::Boolean(_) => "Boolean",
        AstNode::Null(_) => "Null",
        AstNode::Identifier(_) => "Identifier",
        AstNode::CallExpression(_) => "CallExpression",
        AstNode::MemberExpression(_) => "MemberExpression",
        AstNode::Array(_) => "Array",
        AstNode::ObjectLiteral(_) => "ObjectLiteral",
        AstNode::LexicalScope(_) => "LexicalScope",
        _ => "unsupported",
    }
}

fn resolve_linker(options: &NativeCompileOptions) -> Result<PathBuf, NativeCompileError> {
    if let Some(linker) = &options.linker {
        return Ok(linker.clone());
    }
    if let Some(linker) = env::var_os("HOLOSCRIPT_NATIVE_LINKER") {
        return Ok(PathBuf::from(linker));
    }

    let mut candidates = vec![PathBuf::from("clang"), PathBuf::from("cc")];
    if cfg!(windows) {
        if let Some(program_files) = env::var_os("ProgramFiles") {
            candidates.insert(
                0,
                PathBuf::from(program_files)
                    .join("LLVM")
                    .join("bin")
                    .join("clang.exe"),
            );
        }
    }

    candidates
        .into_iter()
        .find(|candidate| {
            Command::new(candidate)
                .arg("--version")
                .output()
                .map(|output| output.status.success())
                .unwrap_or(false)
        })
        .ok_or_else(|| {
            NativeCompileError::new(
                "no native linker found; set HOLOSCRIPT_NATIVE_LINKER to clang or cc",
            )
        })
}
