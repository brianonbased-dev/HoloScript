//! Sovereign native machine-code backend for HoloScript.
//!
//! `hs-machine-v0` is deliberately narrow: a compilation unit contains exactly one
//! parameterless `main` function whose body returns an integral `number` expression.
//! The expression subset is integer literals, unary negation, addition, subtraction,
//! and multiplication. Everything else fails closed with a native compile diagnostic.

use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use cranelift::codegen::ir::{types, AbiParam, InstBuilder, UserFuncName, Value};
use cranelift::codegen::settings;
use cranelift::frontend::{FunctionBuilder, FunctionBuilderContext};
use cranelift::module::{default_libcall_names, Linkage, Module};
use cranelift::object::{ObjectBuilder, ObjectModule};
use holoscript_wasm::ast::{Ast, AstNode, FunctionNode};
use serde::Serialize;
use sha2::{Digest, Sha256};

pub const MACHINE_CONTRACT: &str = "hs-machine-v0";

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
    _options: &NativeCompileOptions,
) -> Result<Vec<u8>, NativeCompileError> {
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

    lower_ast_to_object(&ast)
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

    let object = compile_object(source, options)?;
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
        machine_contract: MACHINE_CONTRACT,
        object_bytes: object.len(),
        object_sha256: format!("{digest:x}"),
        executable,
    })
}

fn lower_ast_to_object(ast: &Ast) -> Result<Vec<u8>, NativeCompileError> {
    let function = select_entry_function(ast)?;
    let expression = select_entry_expression(function)?;

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
    let mut module = ObjectModule::new(object_builder);

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
