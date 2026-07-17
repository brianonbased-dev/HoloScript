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
//! on every lexical-scope exit. Everything outside the selected contract fails closed
//! with a native compile diagnostic.

use std::collections::{HashMap, HashSet};
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use cranelift::codegen::ir::{
    condcodes::IntCC, types, AbiParam, InstBuilder, StackSlot, StackSlotData, StackSlotKind,
    UserFuncName, Value,
};
use cranelift::codegen::settings;
use cranelift::frontend::{FunctionBuilder, FunctionBuilderContext};
use cranelift::module::{default_libcall_names, FuncId, Linkage, Module};
use cranelift::object::{ObjectBuilder, ObjectModule};
use holoscript_wasm::ast::{
    AssignmentNode, Ast, AstNode, BinaryExpression, CallExpression, FunctionNode,
};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const MACHINE_CONTRACT: &str = "hs-machine-v0";
pub const TYPED_MACHINE_CONTRACT: &str = "hs-machine-v1";
pub const MEMORY_MACHINE_CONTRACT: &str = "hs-machine-v2";
pub const REFERENCE_MACHINE_CONTRACT: &str = "hs-machine-v3";
pub const REFERENCE_SCOPE_MACHINE_CONTRACT: &str = "hs-machine-v4";
pub const CONTROL_FLOW_MACHINE_CONTRACT: &str = "hs-machine-v5";

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

    if has_control_flow_machine_metadata(&ast) {
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
            "bool" if machine_contract == CONTROL_FLOW_MACHINE_CONTRACT => Ok(Self::Bool),
            "i32" => Ok(Self::I32),
            "i64" => Ok(Self::I64),
            other => {
                let supported = if machine_contract == CONTROL_FLOW_MACHINE_CONTRACT {
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

struct TypedFunctionSpec<'a> {
    node: &'a FunctionNode,
    params: Vec<MachineType>,
    result: MachineType,
}

#[derive(Clone)]
struct TypedFunctionAbi {
    func_id: FuncId,
    params: Vec<MachineType>,
    result: MachineType,
}

#[derive(Clone, Copy)]
struct TypedValue {
    value: Value,
    machine_type: MachineType,
}

#[derive(Clone, Copy)]
struct TypedStackSlot {
    slot: StackSlot,
    machine_type: MachineType,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct ReferenceType {
    pointee: MachineType,
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
        Ok(Some(Self {
            pointee: MachineType::parse(pointee, context, machine_contract)?,
            mutable,
        }))
    }
}

#[derive(Debug, Clone)]
struct TypedReference {
    slot_name: String,
    pointee: MachineType,
    mutable: bool,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct BorrowState {
    shared: usize,
    exclusive: bool,
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
    let specs = collect_typed_function_specs(ast, machine_contract)?;
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

            let block_params = builder.block_params(block).to_vec();
            let mut locals = HashMap::new();
            for ((name, machine_type), value) in spec
                .node
                .params
                .iter()
                .zip(spec.params.iter().copied())
                .zip(block_params)
            {
                if locals
                    .insert(
                        name.clone(),
                        TypedValue {
                            value,
                            machine_type,
                        },
                    )
                    .is_some()
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` declares duplicate parameter `{name}`",
                        spec.node.name
                    )));
                }
            }

            lower_typed_body(
                &mut builder,
                &mut module,
                &functions,
                &mut locals,
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
) -> Result<Vec<TypedFunctionSpec<'a>>, NativeCompileError> {
    if ast.body.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} requires at least one typed function"
        )));
    }

    let mut specs = Vec::with_capacity(ast.body.len());
    let mut names = HashMap::new();
    for node in &ast.body {
        let AstNode::Function(function) = node else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} accepts only top-level function declarations"
            )));
        };
        if matches!(
            machine_contract,
            MEMORY_MACHINE_CONTRACT
                | REFERENCE_MACHINE_CONTRACT
                | REFERENCE_SCOPE_MACHINE_CONTRACT
                | CONTROL_FLOW_MACHINE_CONTRACT
        ) && matches!(function.name.as_str(), "load" | "store")
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} reserves function name `{}` for explicit memory access",
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
            if matches!(
                machine_contract,
                REFERENCE_MACHINE_CONTRACT
                    | REFERENCE_SCOPE_MACHINE_CONTRACT
                    | CONTROL_FLOW_MACHINE_CONTRACT
            ) && type_name.starts_with('&')
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} references cannot appear in function parameters; `{param_name}` in `{}` would escape its declaring function",
                    function.name
                )));
            }
            params.push(MachineType::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
            )?);
        }
        let return_name = function.return_type.as_deref().ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` requires an explicit return type",
                function.name
            ))
        })?;
        if matches!(
            machine_contract,
            REFERENCE_MACHINE_CONTRACT
                | REFERENCE_SCOPE_MACHINE_CONTRACT
                | CONTROL_FLOW_MACHINE_CONTRACT
        ) && return_name.starts_with('&')
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} references cannot appear in function returns; `{}` would expose an address-bearing value",
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
    params: &[MachineType],
    result: MachineType,
) -> cranelift::codegen::ir::Signature {
    let mut signature = module.make_signature();
    signature
        .params
        .extend(params.iter().map(|ty| AbiParam::new(ty.ir_type())));
    signature.returns.push(AbiParam::new(result.ir_type()));
    signature
}

fn lower_typed_body(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &mut HashMap<String, TypedValue>,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(), NativeCompileError> {
    let mut stack_slots = HashMap::new();
    let mut references = HashMap::new();
    let mut borrow_states = HashMap::new();
    let mut function_borrow_leases = Vec::new();
    let outcome = lower_typed_statements(
        builder,
        module,
        functions,
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
                if let Some(reference_type) =
                    ReferenceType::parse(type_name, &type_context, machine_contract)?
                {
                    if !matches!(
                        machine_contract,
                        REFERENCE_MACHINE_CONTRACT
                            | REFERENCE_SCOPE_MACHINE_CONTRACT
                            | CONTROL_FLOW_MACHINE_CONTRACT
                    ) {
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
                        machine_type,
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
            AstNode::Assignment(assignment)
                if matches!(
                    machine_contract,
                    REFERENCE_MACHINE_CONTRACT
                        | REFERENCE_SCOPE_MACHINE_CONTRACT
                        | CONTROL_FLOW_MACHINE_CONTRACT
                ) =>
            {
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
            AstNode::LexicalScope(scope)
                if matches!(
                    machine_contract,
                    REFERENCE_SCOPE_MACHINE_CONTRACT | CONTROL_FLOW_MACHINE_CONTRACT
                ) =>
            {
                outcome = lower_lexical_scope(
                    builder,
                    module,
                    functions,
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
            AstNode::If(if_node) if machine_contract == CONTROL_FLOW_MACHINE_CONTRACT => {
                outcome = lower_typed_if(
                    builder,
                    module,
                    functions,
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
            AstNode::While(while_node) if machine_contract == CONTROL_FLOW_MACHINE_CONTRACT => {
                lower_typed_while(
                    builder,
                    module,
                    functions,
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
        locals,
        stack_slots,
        references,
        borrow_states,
        &scope.body,
        spec,
        machine_contract,
        memory_enabled,
        machine_contract == CONTROL_FLOW_MACHINE_CONTRACT,
    )
}

#[allow(clippy::too_many_arguments)]
fn lower_scoped_statements(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
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
    let remove_state = {
        let state = borrow_states.get_mut(&reference.slot_name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} lost borrow state for scoped reference to `{}`",
                reference.slot_name
            ))
        })?;
        if reference.mutable {
            if !state.exclusive {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} lost exclusive borrow state for scoped reference to `{}`",
                    reference.slot_name
                )));
            }
            state.exclusive = false;
        } else {
            state.shared = state.shared.checked_sub(1).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} lost shared borrow state for scoped reference to `{}`",
                    reference.slot_name
                ))
            })?;
        }
        state.shared == 0 && !state.exclusive
    };
    if remove_state {
        borrow_states.remove(&reference.slot_name);
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
            "{machine_contract} reference `{reference_name}` must be initialized directly with `&slot` or `&mut slot`"
        )));
    };
    let expected_operator = if reference_type.mutable { "&mut" } else { "&" };
    let expected_annotation = if reference_type.mutable {
        format!("&mut {}", reference_type.pointee.name())
    } else {
        format!("&{}", reference_type.pointee.name())
    };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` has type `{expected_annotation}`, but its initializer uses `{}`",
            borrow.operator,
        )));
    }
    let AstNode::Identifier(identifier) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` requires a declared stack slot as its provenance root"
        )));
    };
    let stack_slot = stack_slots.get(&identifier.name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` requires a declared stack slot; `{}` is not addressable",
            identifier.name
        ))
    })?;
    if stack_slot.machine_type != reference_type.pointee {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects `{}`, but stack slot `{}` stores `{}`",
            reference_type.pointee.name(),
            identifier.name,
            stack_slot.machine_type.name()
        )));
    }

    let state = borrow_states.entry(identifier.name.clone()).or_default();
    if reference_type.mutable {
        if state.exclusive || state.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably borrow stack slot `{}` because an active borrow already exists",
                identifier.name
            )));
        }
        state.exclusive = true;
    } else {
        if state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably borrow stack slot `{}` because an exclusive borrow is active",
                identifier.name
            )));
        }
        state.shared += 1;
    }

    Ok(TypedReference {
        slot_name: identifier.name.clone(),
        pointee: reference_type.pointee,
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
    if reference.pointee != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but reference `{}` points to `{}`; implicit coercions are forbidden",
            expected.name(),
            identifier.name,
            reference.pointee.name()
        )));
    }
    let stack_slot = stack_slots
        .get(&reference.slot_name)
        .copied()
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} reference `{}` lost its stack-slot provenance",
                identifier.name
            ))
        })?;
    Ok(TypedValue {
        value: builder
            .ins()
            .stack_load(reference.pointee.ir_type(), stack_slot.slot, 0),
        machine_type: reference.pointee,
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
    let stack_slot = stack_slots
        .get(&reference.slot_name)
        .copied()
        .ok_or_else(|| {
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
        reference.pointee,
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
            if references.contains_key(&identifier.name) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} reference `{}` cannot escape as a scalar value; dereference it with `*{}`",
                    identifier.name, identifier.name
                )));
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
                    stack_slots,
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
            let mut arguments = Vec::with_capacity(call.arguments.len());
            for (index, (argument, machine_type)) in call
                .arguments
                .iter()
                .zip(abi.params.iter().copied())
                .enumerate()
            {
                arguments.push(
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
                );
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

fn known_expression_type(
    node: &AstNode,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
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
                .map(|reference| reference.pointee)
        }
        AstNode::UnaryExpression(unary) if unary.operator == "-" => {
            known_expression_type(&unary.argument, functions, locals, stack_slots, references)
        }
        AstNode::BinaryExpression(binary)
            if matches!(
                binary.operator.as_str(),
                "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||"
            ) =>
        {
            Some(MachineType::Bool)
        }
        AstNode::BinaryExpression(binary) => {
            known_expression_type(&binary.left, functions, locals, stack_slots, references).or_else(
                || known_expression_type(&binary.right, functions, locals, stack_slots, references),
            )
        }
        AstNode::CallExpression(call) => {
            let AstNode::Identifier(callee) = call.callee.as_ref() else {
                return None;
            };
            if callee.name == "load" {
                let AstNode::Identifier(slot) = call.arguments.first()? else {
                    return None;
                };
                stack_slots.get(&slot.name).map(|slot| slot.machine_type)
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

    let left_type = known_expression_type(&binary.left, functions, locals, stack_slots, references);
    let right_type =
        known_expression_type(&binary.right, functions, locals, stack_slots, references);
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

fn lower_typed_load(
    builder: &mut FunctionBuilder<'_>,
    stack_slots: &HashMap<String, TypedStackSlot>,
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
    let AstNode::Identifier(identifier) = &call.arguments[0] else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `load` requires a stack-slot identifier"
        )));
    };
    let stack_slot = stack_slots.get(&identifier.name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `load` references unknown stack slot `{}`",
            identifier.name
        ))
    })?;
    if borrow_states
        .get(&identifier.name)
        .is_some_and(|state| state.exclusive)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot directly load stack slot `{}` while an exclusive borrow is active",
            identifier.name
        )));
    }
    if stack_slot.machine_type != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but stack slot `{}` stores `{}`; implicit coercions are forbidden",
            expected.name(),
            identifier.name,
            stack_slot.machine_type.name()
        )));
    }
    Ok(TypedValue {
        value: builder
            .ins()
            .stack_load(stack_slot.machine_type.ir_type(), stack_slot.slot, 0),
        machine_type: stack_slot.machine_type,
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
    let AstNode::Identifier(identifier) = &call.arguments[0] else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `store` requires a stack-slot identifier as its first argument"
        )));
    };
    let stack_slot = stack_slots.get(&identifier.name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `store` references unknown stack slot `{}`",
            identifier.name
        ))
    })?;
    if borrow_states
        .get(&identifier.name)
        .is_some_and(|state| state.shared > 0 || state.exclusive)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot store to stack slot `{}` while an active borrow exists",
            identifier.name
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
        &call.arguments[1],
        stack_slot.machine_type,
        &format!("store to stack slot `{}`", identifier.name),
        machine_contract,
        true,
    )?;
    builder.ins().stack_store(value.value, stack_slot.slot, 0);
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
