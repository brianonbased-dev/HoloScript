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
//! reborrows with signed range guards before pointer arithmetic. `hs-machine-v12` adds
//! affine, heap-backed owned buffers, explicit moves and drops, whole-buffer slice borrows,
//! and compiler-emitted cleanup through a host allocator ABI. `hs-machine-v13` adds consuming
//! owned parameters, owned returns through a versioned C-compatible out record, allocator
//! provenance, and path-sensitive ownership joins. `hs-machine-v14` adds recursively laid-out
//! aggregates whose owned-buffer leaves participate in the same affine state machine and
//! deterministic drop glue. `hs-machine-v15` adds whole-aggregate affine moves plus a versioned,
//! target-aware indirect ABI for aggregate parameters and results. `hs-machine-v16` adds
//! compiler-owned aggregate references and scalar-field borrows with conservative whole-root
//! aliasing. `hs-machine-v17` adds call-safe aggregate-reference parameters and controlled
//! forwarding through a guarded, object-local pointer representation. `hs-machine-v18` adds
//! one-level lexical reborrows from aggregate-reference parameters while retaining caller-root
//! provenance and conservative whole-root aliasing. `hs-machine-v19` adds explicit source lifetime
//! binders and aggregate-reference results tied to exactly one caller argument, then propagates the
//! caller's whole-root lease to the result binding. `hs-machine-v20` extends the same caller-tied
//! result model to borrowed slices, returning a guarded base-plus-length pair while retaining the
//! caller's concrete array, slice-parameter, or owned-buffer root as compiler-only provenance.
//! `hs-machine-v21` admits checked sub-slice results after all signed range guards. `hs-machine-v22`
//! admits one direct borrowed-slice return call while preserving the current function's exact source
//! parameter and rejecting a callee that already forwards its own borrowed result. `hs-machine-v23`
//! extends the same one-hop forwarding proof to caller-tied aggregate reference results while
//! preserving the exact aggregate ABI fingerprint and the outer caller's whole-root lease.
//! `hs-machine-v24` adds caller-tied scalar-field reference results, `hs-machine-v25` admits one
//! direct forwarding hop for those results, and `hs-machine-v26` extends the same exact-pointer
//! proof to nested nominal aggregate subobjects. `hs-machine-v27` adds checked slice-element
//! reference results whose ABI retains the exact slice source and runtime index coordinate through
//! one direct forwarding hop. `hs-machine-v28` composes aggregate-root and dynamic-index provenance
//! for elements borrowed from owned-buffer fields while preserving the aggregate's whole-root lease.
//! `hs-machine-v29` composes that aggregate-owned-buffer provenance with checked half-open sub-slice
//! results while retaining both range coordinates through one direct forwarding hop.
//! `hs-machine-v30` adds whole owned-buffer field slice results, `hs-machine-v31` replaces the
//! one-hop forwarding ceiling with deterministic typed summaries composed across acyclic call graphs,
//! and `hs-machine-v32` joins exhaustive control-flow branches only when every branch composes to the
//! same exact summary. `hs-machine-v33` adds deterministic, project-root-fenced multi-file modules
//! with explicit relative imports, named exports, aliases, cycle rejection, and isolated symbols.
//! `hs-machine-v34` adds inline, tagged `Uncertain<T>` scalar fields, canonical meaning-gap reason
//! codes, explicit `known(...)` / `unknown(...)` construction, and fail-closed `??`/honesty reads.
//! `hs-machine-v35` adds scalar IEEE-754 `f64` parameters, returns, locals, finite literals,
//! arithmetic, comparisons, and direct calls while keeping process entry results integral.
//! `hs-machine-v36` composes the v33 deterministic module loader with v35 scalar f64 lowering.
//! `hs-machine-v37` adds scalar IEEE-754 `f32` with single-precision literals and operations
//! while retaining the v35 f64 subset. `hs-machine-v38` composes that float lowering with modules.
//! `hs-machine-v39` composes the v38 float surface with recursively laid-out by-value aggregates.
//! `hs-machine-v40` adds bounded unsigned-byte scalars and one-byte owned buffers, preserving
//! the existing affine ownership and slice ABI while making byte-oriented native storage
//! observable through compiler-produced code.
//! `hs-machine-v41` adds checked signed integer division and remainder to the typed arithmetic
//! subset, trapping on zero divisors and the signed minimum divided by negative one.
//! The v35/v37/v39 finite-float contracts trap on non-finite parameters, division-by-zero results,
//! and arithmetic overflow before a non-finite value can cross a function or storage boundary.
//! Everything outside the selected contract fails closed with a native compile diagnostic.

mod project;

use std::collections::{HashMap, HashSet};
use std::env;
use std::fmt;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use cranelift::codegen::ir::{
    condcodes::{FloatCC, IntCC},
    types, AbiParam, InstBuilder, MemFlags, StackSlot, StackSlotData, StackSlotKind, TrapCode,
    Type, UserFuncName, Value,
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
pub const LOCAL_OWNED_BUFFER_MACHINE_CONTRACT: &str = "hs-machine-v12";
pub const OWNED_BUFFER_MACHINE_CONTRACT: &str = "hs-machine-v13";
pub const OWNED_AGGREGATE_MACHINE_CONTRACT: &str = "hs-machine-v14";
pub const AFFINE_AGGREGATE_MACHINE_CONTRACT: &str = "hs-machine-v15";
pub const AGGREGATE_REFERENCE_MACHINE_CONTRACT: &str = "hs-machine-v16";
pub const AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT: &str = "hs-machine-v17";
pub const AGGREGATE_REBORROW_MACHINE_CONTRACT: &str = "hs-machine-v18";
pub const BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v19";
pub const BORROWED_SLICE_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v20";
pub const BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v21";
pub const BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v22";
pub const BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v23";
pub const BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v24";
pub const BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v25";
pub const BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v26";
pub const BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v27";
pub const BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v28";
pub const BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v29";
pub const BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT: &str = "hs-machine-v30";
pub const COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT: &str = "hs-machine-v31";
pub const CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT: &str = "hs-machine-v32";
pub const MULTI_FILE_MODULE_MACHINE_CONTRACT: &str = "hs-machine-v33";
pub const UNCERTAIN_AGGREGATE_MACHINE_CONTRACT: &str = "hs-machine-v34";
pub const FLOAT64_MACHINE_CONTRACT: &str = "hs-machine-v35";
pub const FLOAT64_MODULE_MACHINE_CONTRACT: &str = "hs-machine-v36";
pub const FLOAT32_MACHINE_CONTRACT: &str = "hs-machine-v37";
pub const FLOAT32_MODULE_MACHINE_CONTRACT: &str = "hs-machine-v38";
pub const FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT: &str = "hs-machine-v39";
pub const BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT: &str = "hs-machine-v40";
pub const INTEGER_ARITHMETIC_MACHINE_CONTRACT: &str = "hs-machine-v41";
pub const OWNED_BUFFER_ABI_VERSION: u32 = 1;
pub const NATIVE_AGGREGATE_ABI_VERSION: u32 = 1;
pub const NATIVE_MEANING_GAP_REASON_ABI_VERSION: u32 = 1;
pub const HOST_ALLOCATOR_PROVENANCE_ID: u32 = 1;

/// Foreign bridge layout for an owned buffer returned by `hs-machine-v13` or later.
///
/// Native HoloScript calls pass owned parameters as these three fields in order.
/// Owned returns receive a trailing pointer to this record and initialize it before
/// returning. The receiver becomes the sole live owner after validating the record.
#[repr(C)]
#[derive(Debug)]
pub struct NativeOwnedBufferFfi {
    pub data: *mut u8,
    pub length: i32,
    pub allocator_id: u32,
}

/// Versioned foreign bridge descriptor for an affine aggregate parameter or result.
///
/// Aggregate values remain in target-native payload storage. Native calls pass a pointer to
/// this descriptor so the callee can reject ABI-version, layout, size, alignment, and pointer
/// mismatches before loading any field or accepting recursive drop responsibility.
#[repr(C)]
#[derive(Debug)]
pub struct NativeAggregateFfi {
    pub data: *mut u8,
    pub byte_length: u32,
    pub alignment: u32,
    pub layout_fingerprint: u32,
    pub abi_version: u32,
}

/// Stable native encoding of the canonical `@holoscript/meaning` gap-reason vocabulary.
///
/// Zero is reserved for the known branch. An unknown `Uncertain<T>` field always carries exactly
/// one of these non-zero codes beside its payload.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum NativeMeaningGapReason {
    Underdetermined = 1,
    UnprioritizedConflict = 2,
    CyclicDependency = 3,
    MissingPrecondition = 4,
    IrreducibleStochastic = 5,
}

impl NativeMeaningGapReason {
    fn parse(value: &str) -> Option<Self> {
        match value {
            "underdetermined" => Some(Self::Underdetermined),
            "unprioritized_conflict" => Some(Self::UnprioritizedConflict),
            "cyclic_dependency" => Some(Self::CyclicDependency),
            "missing_precondition" => Some(Self::MissingPrecondition),
            "irreducible_stochastic" => Some(Self::IrreducibleStochastic),
            _ => None,
        }
    }

    fn code(self) -> i32 {
        self as i32
    }
}

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
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uncertainty: Option<NativeUncertainFieldLayout>,
}

/// Relative offsets for the native inline `Uncertain<T>` carrier.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeUncertainFieldLayout {
    pub known_offset: u32,
    pub reason_offset: u32,
    pub value_offset: u32,
    pub reason_abi_version: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct NativeStructLayout {
    pub name: String,
    pub size: u32,
    pub alignment: u32,
    pub abi_fingerprint: u32,
    pub abi_version: u32,
    pub fields: Vec<NativeFieldLayout>,
}

impl NativeStructLayout {
    /// Validate a foreign aggregate descriptor without dereferencing its payload.
    ///
    /// Generated `hs-machine-v15` callees emit the same checks before loading fields. Foreign
    /// bridges can call this helper first to fail with a diagnostic instead of a machine trap.
    pub fn validate_ffi_descriptor(
        &self,
        descriptor: &NativeAggregateFfi,
    ) -> Result<(), NativeCompileError> {
        if descriptor.abi_version != self.abi_version {
            return Err(NativeCompileError::new(format!(
                "aggregate `{}` ABI version mismatch: expected {}, found {}",
                self.name, self.abi_version, descriptor.abi_version
            )));
        }
        if descriptor.layout_fingerprint != self.abi_fingerprint {
            return Err(NativeCompileError::new(format!(
                "aggregate `{}` ABI fingerprint mismatch: expected {:#010x}, found {:#010x}",
                self.name, self.abi_fingerprint, descriptor.layout_fingerprint
            )));
        }
        if descriptor.byte_length != self.size || descriptor.alignment != self.alignment {
            return Err(NativeCompileError::new(format!(
                "aggregate `{}` ABI layout mismatch: expected {} bytes aligned to {}, found {} bytes aligned to {}",
                self.name,
                self.size,
                self.alignment,
                descriptor.byte_length,
                descriptor.alignment
            )));
        }
        if descriptor.data.is_null()
            || (descriptor.data as usize) & (self.alignment as usize - 1) != 0
        {
            return Err(NativeCompileError::new(format!(
                "aggregate `{}` ABI payload pointer is null or misaligned",
                self.name
            )));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NativeCompileError {
    message: String,
}

impl NativeCompileError {
    pub(crate) fn new(message: impl Into<String>) -> Self {
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

/// Parse canonical HoloScript and report exact host-native aggregate layouts.
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
    let carries_u8 = has_u8_machine_metadata(&ast);
    let carries_recursive_aggregate = has_recursive_aggregate_machine_metadata(&ast);
    let machine_contract = if carries_u8 {
        BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
    } else if carries_recursive_aggregate
        && (has_f32_machine_metadata(&ast) || has_f64_machine_metadata(&ast))
    {
        FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT
    } else if has_f32_machine_metadata(&ast) {
        FLOAT32_MACHINE_CONTRACT
    } else if has_f64_machine_metadata(&ast) {
        FLOAT64_MACHINE_CONTRACT
    } else if has_integer_division_machine_metadata(&ast) {
        INTEGER_ARITHMETIC_MACHINE_CONTRACT
    } else if has_uncertain_aggregate_machine_metadata(&ast) {
        UNCERTAIN_AGGREGATE_MACHINE_CONTRACT
    } else if has_conditional_borrow_summary_machine_metadata(&ast) {
        CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
    } else if has_compositional_borrow_summary_machine_metadata(&ast) {
        COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_buffer_whole_slice_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_buffer_subslice_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_buffer_element_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_slice_element_return_machine_metadata(&ast) {
        BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_subobject_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_scalar_field_forward_return_machine_metadata(&ast) {
        BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_scalar_field_return_machine_metadata(&ast) {
        BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_forward_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_slice_forward_return_machine_metadata(&ast) {
        BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_subslice_return_machine_metadata(&ast) {
        BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_slice_return_machine_metadata(&ast) {
        BORROWED_SLICE_RETURN_MACHINE_CONTRACT
    } else if has_borrowed_aggregate_return_machine_metadata(&ast) {
        BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
    } else if has_aggregate_reborrow_machine_metadata(&ast) {
        AGGREGATE_REBORROW_MACHINE_CONTRACT
    } else if has_aggregate_reference_call_machine_metadata(&ast) {
        AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
    } else if has_aggregate_reference_machine_metadata(&ast) {
        AGGREGATE_REFERENCE_MACHINE_CONTRACT
    } else if has_affine_aggregate_machine_metadata(&ast) {
        AFFINE_AGGREGATE_MACHINE_CONTRACT
    } else if has_owned_aggregate_machine_metadata(&ast) {
        OWNED_AGGREGATE_MACHINE_CONTRACT
    } else {
        AGGREGATE_MACHINE_CONTRACT
    };
    let module = create_object_module()?;
    let pointer_type = module.target_config().pointer_type();
    collect_aggregate_layouts(&ast, machine_contract, pointer_type).map(|layouts| {
        layouts
            .into_iter()
            .map(|layout| layout.into_public(pointer_type))
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

    compile_ast_unit(ast)
}

fn compile_ast_unit(ast: Ast) -> Result<CompiledObject, NativeCompileError> {
    if has_u8_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT, true)?,
            machine_contract: BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT,
        })
    } else if has_recursive_aggregate_machine_metadata(&ast)
        && (has_f32_machine_metadata(&ast) || has_f64_machine_metadata(&ast))
    {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT,
        })
    } else if has_f32_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, FLOAT32_MACHINE_CONTRACT, true)?,
            machine_contract: FLOAT32_MACHINE_CONTRACT,
        })
    } else if has_f64_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, FLOAT64_MACHINE_CONTRACT, true)?,
            machine_contract: FLOAT64_MACHINE_CONTRACT,
        })
    } else if has_integer_division_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, INTEGER_ARITHMETIC_MACHINE_CONTRACT, true)?,
            machine_contract: INTEGER_ARITHMETIC_MACHINE_CONTRACT,
        })
    } else if has_uncertain_aggregate_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, UNCERTAIN_AGGREGATE_MACHINE_CONTRACT, true)?,
            machine_contract: UNCERTAIN_AGGREGATE_MACHINE_CONTRACT,
        })
    } else if has_conditional_borrow_summary_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT,
        })
    } else if has_compositional_borrow_summary_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_buffer_whole_slice_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_buffer_subslice_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_buffer_element_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_slice_element_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_subobject_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_scalar_field_forward_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_scalar_field_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_forward_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_slice_forward_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_subslice_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_slice_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, BORROWED_SLICE_RETURN_MACHINE_CONTRACT, true)?,
            machine_contract: BORROWED_SLICE_RETURN_MACHINE_CONTRACT,
        })
    } else if has_borrowed_aggregate_return_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT,
        })
    } else if has_aggregate_reborrow_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, AGGREGATE_REBORROW_MACHINE_CONTRACT, true)?,
            machine_contract: AGGREGATE_REBORROW_MACHINE_CONTRACT,
        })
    } else if has_aggregate_reference_call_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(
                &ast,
                AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT,
                true,
            )?,
            machine_contract: AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT,
        })
    } else if has_aggregate_reference_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, AGGREGATE_REFERENCE_MACHINE_CONTRACT, true)?,
            machine_contract: AGGREGATE_REFERENCE_MACHINE_CONTRACT,
        })
    } else if has_affine_aggregate_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, AFFINE_AGGREGATE_MACHINE_CONTRACT, true)?,
            machine_contract: AFFINE_AGGREGATE_MACHINE_CONTRACT,
        })
    } else if has_owned_aggregate_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, OWNED_AGGREGATE_MACHINE_CONTRACT, true)?,
            machine_contract: OWNED_AGGREGATE_MACHINE_CONTRACT,
        })
    } else if has_owned_buffer_machine_metadata(&ast) {
        Ok(CompiledObject {
            bytes: lower_typed_ast_to_object(&ast, OWNED_BUFFER_MACHINE_CONTRACT, true)?,
            machine_contract: OWNED_BUFFER_MACHINE_CONTRACT,
        })
    } else if has_runtime_slice_forward_machine_metadata(&ast) {
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
    link_compiled_object(compile_unit(source, options)?, executable.as_ref(), options)
}

/// Compile a canonical `.hs` entry module and all of its relative imports to an object.
pub fn compile_project_object(
    entry: impl AsRef<Path>,
    options: &NativeCompileOptions,
) -> Result<Vec<u8>, NativeCompileError> {
    Ok(compile_project_unit(entry.as_ref(), options)?.bytes)
}

/// Compile and link a canonical `.hs` entry module and its deterministic dependency graph.
pub fn compile_project_executable(
    entry: impl AsRef<Path>,
    executable: impl AsRef<Path>,
    options: &NativeCompileOptions,
) -> Result<NativeArtifact, NativeCompileError> {
    link_compiled_object(
        compile_project_unit(entry.as_ref(), options)?,
        executable.as_ref(),
        options,
    )
}

/// Compile a `.hs` path, selecting project mode only when import/export syntax is present.
pub fn compile_path_executable(
    entry: impl AsRef<Path>,
    executable: impl AsRef<Path>,
    options: &NativeCompileOptions,
) -> Result<NativeArtifact, NativeCompileError> {
    let entry = entry.as_ref();
    let source = fs::read_to_string(entry).map_err(|error| {
        NativeCompileError::new(format!("failed to read {}: {error}", entry.display()))
    })?;
    let ast = holoscript_wasm::parse_ast(&source).map_err(|diagnostics| {
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
    if project::uses_module_syntax(&ast) {
        compile_project_executable(entry, executable, options)
    } else {
        compile_executable(&source, executable, options)
    }
}

fn compile_project_unit(
    entry: &Path,
    _options: &NativeCompileOptions,
) -> Result<CompiledObject, NativeCompileError> {
    let ast = project::load_project_ast(entry)?;
    let carries_uncertainty = has_uncertain_aggregate_machine_metadata(&ast);
    let carries_u8 = has_u8_machine_metadata(&ast);
    let carries_recursive_aggregate = has_recursive_aggregate_machine_metadata(&ast);
    let carries_f32 = has_f32_machine_metadata(&ast);
    let carries_f64 = has_f64_machine_metadata(&ast);
    let mut compiled = compile_ast_unit(ast)?;
    if carries_u8 {
        compiled.machine_contract = BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT;
    } else if carries_recursive_aggregate && (carries_f32 || carries_f64) {
        compiled.machine_contract = FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT;
    } else if carries_f32 {
        compiled.machine_contract = FLOAT32_MODULE_MACHINE_CONTRACT;
    } else if carries_f64 {
        compiled.machine_contract = FLOAT64_MODULE_MACHINE_CONTRACT;
    } else if !carries_uncertainty {
        compiled.machine_contract = MULTI_FILE_MODULE_MACHINE_CONTRACT;
    }
    Ok(compiled)
}

fn link_compiled_object(
    compiled: CompiledObject,
    executable: &Path,
    options: &NativeCompileOptions,
) -> Result<NativeArtifact, NativeCompileError> {
    let executable = executable.to_path_buf();
    if let Some(parent) = executable.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            NativeCompileError::new(format!(
                "failed to create output directory {}: {error}",
                parent.display()
            ))
        })?;
    }

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

fn has_f64_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function.return_type.as_deref() == Some("f64")
            || function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation == "f64")
            || function.body.iter().any(|statement| {
                matches!(
                    statement,
                    AstNode::VariableDeclaration(local)
                        if local.type_annotation.as_deref() == Some("f64")
                )
            })
    })
}

fn has_f32_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function.return_type.as_deref() == Some("f32")
            || function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation == "f32")
            || function.body.iter().any(|statement| {
                matches!(
                    statement,
                    AstNode::VariableDeclaration(local)
                        if local.type_annotation.as_deref() == Some("f32")
                )
            })
    })
}

fn annotation_mentions_u8(annotation: &str) -> bool {
    annotation
        .split(|character: char| !character.is_ascii_alphanumeric() && character != '_')
        .any(|part| part == "u8")
}

fn node_uses_u8_machine_type(node: &AstNode) -> bool {
    match node {
        AstNode::VariableDeclaration(local) => local
            .type_annotation
            .as_deref()
            .is_some_and(annotation_mentions_u8),
        AstNode::StackSlotDeclaration(slot) => annotation_mentions_u8(&slot.type_annotation),
        AstNode::If(if_node) => {
            if_node.consequent.iter().any(node_uses_u8_machine_type)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alternate| alternate.iter().any(node_uses_u8_machine_type))
        }
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_u8_machine_type),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_u8_machine_type),
        AstNode::For(for_node) => {
            for_node
                .init
                .as_deref()
                .is_some_and(node_uses_u8_machine_type)
                || for_node
                    .test
                    .as_deref()
                    .is_some_and(node_uses_u8_machine_type)
                || for_node
                    .update
                    .as_deref()
                    .is_some_and(node_uses_u8_machine_type)
                || for_node.body.iter().any(node_uses_u8_machine_type)
        }
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_u8_machine_type),
        _ => false,
    }
}

fn has_u8_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| match node {
        AstNode::Function(function) => {
            function
                .return_type
                .as_deref()
                .is_some_and(annotation_mentions_u8)
                || function
                    .param_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_mentions_u8(annotation))
                || function.body.iter().any(node_uses_u8_machine_type)
        }
        AstNode::StructDeclaration(structure) => structure
            .field_types
            .iter()
            .flatten()
            .any(|annotation| annotation_mentions_u8(annotation)),
        _ => false,
    })
}

fn has_integer_division_machine_metadata(ast: &Ast) -> bool {
    has_typed_machine_metadata(ast)
        && ast.body.iter().any(|node| match node {
            AstNode::Function(function) => function.body.iter().any(node_uses_integer_division),
            _ => false,
        })
}

fn node_uses_integer_division(node: &AstNode) -> bool {
    match node {
        AstNode::If(if_node) => {
            if_node.consequent.iter().any(node_uses_integer_division)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alternate| alternate.iter().any(node_uses_integer_division))
        }
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_integer_division),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_integer_division),
        AstNode::For(for_node) => {
            for_node
                .init
                .as_deref()
                .is_some_and(node_uses_integer_division)
                || for_node
                    .test
                    .as_deref()
                    .is_some_and(node_uses_integer_division)
                || for_node
                    .update
                    .as_deref()
                    .is_some_and(node_uses_integer_division)
                || for_node.body.iter().any(node_uses_integer_division)
        }
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_integer_division),
        AstNode::VariableDeclaration(local) => node_uses_integer_division(&local.value),
        AstNode::StackSlotDeclaration(slot) => node_uses_integer_division(&slot.value),
        AstNode::UnaryExpression(unary) => node_uses_integer_division(&unary.argument),
        AstNode::BinaryExpression(binary) => {
            matches!(binary.operator.as_str(), "/" | "%")
                || node_uses_integer_division(&binary.left)
                || node_uses_integer_division(&binary.right)
        }
        AstNode::Assignment(assignment) => {
            node_uses_integer_division(&assignment.target)
                || node_uses_integer_division(&assignment.value)
        }
        AstNode::CallExpression(call) => {
            node_uses_integer_division(&call.callee)
                || call.arguments.iter().any(node_uses_integer_division)
        }
        AstNode::Return(return_node) => return_node
            .argument
            .as_deref()
            .is_some_and(node_uses_integer_division),
        _ => false,
    }
}

fn has_aggregate_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::StructDeclaration(structure) if !structure.field_types.is_empty()
        )
    })
}

fn has_recursive_aggregate_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::StructDeclaration(structure)
                if structure
                    .field_types
                    .iter()
                    .flatten()
                    .any(|annotation| aggregate_names.contains(annotation.as_str()))
        )
    })
}

fn has_uncertain_aggregate_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::StructDeclaration(structure)
                if structure
                    .field_annotations
                    .iter()
                    .flatten()
                    .any(|annotation| annotation == "unknown")
        )
    })
}

fn has_owned_aggregate_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::StructDeclaration(structure)
                if structure
                    .field_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_uses_owned_buffer(annotation))
        )
    })
}

fn has_affine_aggregate_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function
            .param_types
            .iter()
            .flatten()
            .any(|annotation| aggregate_names.contains(annotation.as_str()))
            || function
                .return_type
                .as_deref()
                .is_some_and(|annotation| aggregate_names.contains(annotation))
            || statements_use_whole_aggregate_move(&function.body, &aggregate_names)
    })
}

fn has_aggregate_reference_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    if aggregate_names.is_empty() {
        return false;
    }
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function
            .param_types
            .iter()
            .flatten()
            .any(|annotation| annotation_references_aggregate(annotation, &aggregate_names))
            || function.return_type.as_deref().is_some_and(|annotation| {
                annotation_references_aggregate(annotation, &aggregate_names)
            })
            || statements_use_aggregate_references(&function.body, &aggregate_names)
    })
}

fn has_aggregate_reference_call_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    !aggregate_names.is_empty()
        && ast.body.iter().any(|node| {
            let AstNode::Function(function) = node else {
                return false;
            };
            function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation_references_aggregate(annotation, &aggregate_names))
        })
}

fn has_aggregate_reborrow_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    !aggregate_names.is_empty()
        && ast.body.iter().any(|node| {
            let AstNode::Function(function) = node else {
                return false;
            };
            let parameter_references = function
                .params
                .iter()
                .zip(function.param_types.iter())
                .filter_map(|(name, annotation)| {
                    annotation
                        .as_deref()
                        .is_some_and(|annotation| {
                            annotation_references_aggregate(annotation, &aggregate_names)
                        })
                        .then_some(name.as_str())
                })
                .collect::<HashSet<_>>();
            !parameter_references.is_empty()
                && statements_contain_parameter_reborrow(&function.body, &parameter_references)
        })
}

fn has_borrowed_aggregate_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        !function.lifetimes.is_empty()
            || function
                .param_types
                .iter()
                .flatten()
                .any(|annotation| annotation.starts_with("&'"))
            || function
                .return_type
                .as_deref()
                .is_some_and(|annotation| annotation.starts_with("&'"))
    })
}

fn has_borrowed_scalar_field_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function.return_type.as_deref().is_some_and(|annotation| {
            annotation.starts_with("&'")
                && reference_annotation_pointee(annotation)
                    .is_some_and(|pointee| matches!(pointee, "bool" | "i32" | "i64"))
        })
    })
}

fn has_borrowed_slice_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function.param_types.iter().flatten().any(|annotation| {
            annotation.starts_with("&'")
                && reference_annotation_pointee(annotation)
                    .is_some_and(|pointee| pointee.starts_with('['))
        }) || function.return_type.as_deref().is_some_and(|annotation| {
            annotation.starts_with("&'")
                && reference_annotation_pointee(annotation)
                    .is_some_and(|pointee| pointee.starts_with('['))
        })
    })
}

fn has_borrowed_subslice_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        let returns_lifetimed_slice = function.return_type.as_deref().is_some_and(|annotation| {
            annotation.starts_with("&'")
                && reference_annotation_pointee(annotation)
                    .is_some_and(|pointee| pointee.starts_with('['))
        });
        returns_lifetimed_slice
            && function.body.iter().any(|statement| {
                let AstNode::Return(returned) = statement else {
                    return false;
                };
                let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
                    return false;
                };
                matches!(borrow.operator.as_str(), "&" | "&mut")
                    && matches!(borrow.argument.as_ref(), AstNode::MemberExpression(_))
            })
    })
}

fn has_borrowed_slice_forward_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function_returns_lifetimed_slice(function) && function_forwards_borrowed_result(function)
    })
}

fn has_borrowed_aggregate_forward_return_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    !aggregate_names.is_empty()
        && ast.body.iter().any(|node| {
            let AstNode::Function(function) = node else {
                return false;
            };
            function_returns_lifetimed_aggregate(function, &aggregate_names)
                && function_forwards_borrowed_result(function)
        })
}

fn has_borrowed_scalar_field_forward_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function_returns_lifetimed_scalar(function) && function_forwards_borrowed_result(function)
    })
}

fn function_directly_returns_aggregate_buffer_element(function: &FunctionNode) -> bool {
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    matches!(
        returned.argument.as_deref(),
        Some(AstNode::UnaryExpression(borrow))
            if matches!(borrow.operator.as_str(), "&" | "&mut")
                && matches!(
                    borrow.argument.as_ref(),
                    AstNode::MemberExpression(member)
                        if member.computed
                            && owned_buffer_path(member.object.as_ref())
                                .is_some_and(|path| path.contains('.'))
                )
    )
}

fn function_directly_returns_aggregate_buffer_subslice(function: &FunctionNode) -> bool {
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    matches!(
        returned.argument.as_deref(),
        Some(AstNode::UnaryExpression(borrow))
            if matches!(borrow.operator.as_str(), "&" | "&mut")
                && matches!(
                    borrow.argument.as_ref(),
                    AstNode::MemberExpression(member)
                        if member.computed
                            && matches!(
                                member.property.as_ref(),
                                AstNode::BinaryExpression(range) if range.operator == ".."
                            )
                            && owned_buffer_path(member.object.as_ref())
                                .is_some_and(|path| path.contains('.'))
                )
    )
}

fn function_directly_returns_aggregate_buffer_whole_slice(function: &FunctionNode) -> bool {
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    matches!(
        returned.argument.as_deref(),
        Some(AstNode::UnaryExpression(borrow))
            if matches!(borrow.operator.as_str(), "&" | "&mut")
                && matches!(
                    borrow.argument.as_ref(),
                    AstNode::MemberExpression(member)
                        if !member.computed
                            && owned_buffer_path(borrow.argument.as_ref())
                                .is_some_and(|path| path.contains('.'))
                )
    )
}

fn function_returns_aggregate_buffer_whole_slice_shape(
    ast: &Ast,
    function: &FunctionNode,
    remaining_hops: usize,
) -> bool {
    if function_directly_returns_aggregate_buffer_whole_slice(function) {
        return true;
    }
    if remaining_hops == 0 {
        return false;
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return false;
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return false;
    };
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(candidate)
                if candidate.name == callee.name
                    && function_returns_aggregate_buffer_whole_slice_shape(
                        ast,
                        candidate,
                        remaining_hops - 1,
                    )
        )
    })
}

fn has_borrowed_aggregate_buffer_whole_slice_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function)
                if function_returns_lifetimed_slice(function)
                    && function_directly_returns_aggregate_buffer_whole_slice(function)
        )
    })
}

fn direct_borrowed_forward_callee(function: &FunctionNode) -> Option<&str> {
    let AstNode::Return(returned) = function.body.last()? else {
        return None;
    };
    let AstNode::CallExpression(call) = returned.argument.as_deref()? else {
        return None;
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return None;
    };
    Some(callee.name.as_str())
}

fn has_compositional_borrow_summary_machine_metadata(ast: &Ast) -> bool {
    let functions = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::Function(function) => Some((function.name.as_str(), function)),
            _ => None,
        })
        .collect::<HashMap<_, _>>();
    functions.values().any(|function| {
        function
            .return_type
            .as_deref()
            .is_some_and(|annotation| annotation.starts_with("&'"))
            && direct_borrowed_forward_callee(function)
                .and_then(|callee| functions.get(callee))
                .is_some_and(|callee| {
                    callee
                        .return_type
                        .as_deref()
                        .is_some_and(|annotation| annotation.starts_with("&'"))
                        && function_forwards_borrowed_result(callee)
                })
    })
}

fn has_conditional_borrow_summary_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        function
            .return_type
            .as_deref()
            .is_some_and(|annotation| annotation.starts_with("&'"))
            && matches!(
                function.body.last(),
                Some(AstNode::If(if_node))
                    if count_borrowed_forward_returns(&if_node.consequent)
                        + if_node
                            .alternate
                            .as_deref()
                            .map_or(0, count_borrowed_forward_returns)
                        > 0
            )
    })
}

fn function_returns_aggregate_buffer_subslice_shape(
    ast: &Ast,
    function: &FunctionNode,
    remaining_hops: usize,
) -> bool {
    if function_directly_returns_aggregate_buffer_subslice(function) {
        return true;
    }
    if remaining_hops == 0 {
        return false;
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return false;
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return false;
    };
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(candidate)
                if candidate.name == callee.name
                    && function_returns_aggregate_buffer_subslice_shape(
                        ast,
                        candidate,
                        remaining_hops - 1,
                    )
        )
    })
}

fn has_borrowed_aggregate_buffer_subslice_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function)
                if function_returns_lifetimed_slice(function)
                    && function_directly_returns_aggregate_buffer_subslice(function)
        )
    })
}

fn function_returns_aggregate_buffer_element_shape(
    ast: &Ast,
    function: &FunctionNode,
    remaining_hops: usize,
) -> bool {
    if function_directly_returns_aggregate_buffer_element(function) {
        return true;
    }
    if remaining_hops == 0 {
        return false;
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return false;
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return false;
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return false;
    };
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(candidate)
                if candidate.name == callee.name
                    && function_returns_aggregate_buffer_element_shape(
                        ast,
                        candidate,
                        remaining_hops - 1,
                    )
        )
    })
}

fn has_borrowed_aggregate_buffer_element_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        matches!(
            node,
            AstNode::Function(function)
                if function_returns_lifetimed_scalar(function)
                    && function_directly_returns_aggregate_buffer_element(function)
        )
    })
}

fn has_borrowed_slice_element_return_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| {
        let AstNode::Function(function) = node else {
            return false;
        };
        if !function_returns_lifetimed_scalar(function) {
            return false;
        }
        let Some(return_lifetime) = function
            .return_type
            .as_deref()
            .and_then(reference_annotation_lifetime)
        else {
            return false;
        };
        function.param_types.iter().flatten().any(|annotation| {
            reference_annotation_lifetime(annotation) == Some(return_lifetime)
                && reference_annotation_pointee(annotation)
                    .is_some_and(|pointee| pointee.starts_with('['))
        })
    })
}

fn has_borrowed_aggregate_subobject_return_machine_metadata(ast: &Ast) -> bool {
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    !aggregate_names.is_empty()
        && ast.body.iter().any(|node| {
            let AstNode::Function(function) = node else {
                return false;
            };
            if !function_returns_lifetimed_aggregate(function, &aggregate_names) {
                return false;
            }
            matches!(
                function.body.last(),
                Some(AstNode::Return(returned))
                    if matches!(
                        returned.argument.as_deref(),
                        Some(AstNode::UnaryExpression(borrow))
                            if matches!(borrow.operator.as_str(), "&" | "&mut")
                                && matches!(borrow.argument.as_ref(), AstNode::MemberExpression(_))
                    )
            )
        })
}

fn function_returns_lifetimed_slice(function: &FunctionNode) -> bool {
    function.return_type.as_deref().is_some_and(|annotation| {
        annotation.starts_with("&'")
            && reference_annotation_pointee(annotation)
                .is_some_and(|pointee| pointee.starts_with('['))
    })
}

fn function_returns_lifetimed_aggregate(
    function: &FunctionNode,
    aggregate_names: &HashSet<&str>,
) -> bool {
    function.return_type.as_deref().is_some_and(|annotation| {
        annotation.starts_with("&'")
            && reference_annotation_pointee(annotation)
                .is_some_and(|pointee| aggregate_names.contains(pointee))
    })
}

fn function_returns_lifetimed_scalar(function: &FunctionNode) -> bool {
    function.return_type.as_deref().is_some_and(|annotation| {
        annotation.starts_with("&'")
            && reference_annotation_pointee(annotation)
                .is_some_and(|pointee| matches!(pointee, "bool" | "i32" | "i64"))
    })
}

fn function_forwards_borrowed_result(function: &FunctionNode) -> bool {
    count_borrowed_forward_returns(&function.body) > 0
}

fn count_borrowed_forward_returns(statements: &[AstNode]) -> usize {
    statements
        .iter()
        .map(|statement| match statement {
            AstNode::Return(returned)
                if matches!(
                    returned.argument.as_deref(),
                    Some(AstNode::CallExpression(_))
                ) =>
            {
                1
            }
            AstNode::LexicalScope(scope) => count_borrowed_forward_returns(&scope.body),
            AstNode::If(if_node) => {
                count_borrowed_forward_returns(&if_node.consequent)
                    + if_node
                        .alternate
                        .as_deref()
                        .map_or(0, count_borrowed_forward_returns)
            }
            AstNode::While(while_node) => count_borrowed_forward_returns(&while_node.body),
            AstNode::ForOf(for_node) => count_borrowed_forward_returns(&for_node.body),
            AstNode::For(for_node) => count_borrowed_forward_returns(&for_node.body),
            _ => 0,
        })
        .sum()
}

fn count_return_statements(statements: &[AstNode]) -> usize {
    statements
        .iter()
        .map(|statement| match statement {
            AstNode::Return(_) => 1,
            AstNode::LexicalScope(scope) => count_return_statements(&scope.body),
            AstNode::If(if_node) => {
                count_return_statements(&if_node.consequent)
                    + if_node
                        .alternate
                        .as_deref()
                        .map_or(0, count_return_statements)
            }
            AstNode::While(while_node) => count_return_statements(&while_node.body),
            AstNode::ForOf(for_node) => count_return_statements(&for_node.body),
            AstNode::For(for_node) => count_return_statements(&for_node.body),
            _ => 0,
        })
        .sum()
}

fn direct_borrowed_forward_return_count(function: &FunctionNode) -> usize {
    function
        .body
        .iter()
        .filter(|statement| {
            matches!(
                statement,
                AstNode::Return(returned)
                    if matches!(returned.argument.as_deref(), Some(AstNode::CallExpression(_)))
            )
        })
        .count()
}

fn collect_conditional_borrow_summary_calls<'a>(
    statements: &'a [AstNode],
    calls: &mut Vec<&'a CallExpression>,
) -> bool {
    match statements {
        [AstNode::Return(returned)] => {
            let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
                return false;
            };
            calls.push(call);
            true
        }
        [AstNode::If(if_node)] => {
            let Some(alternate) = if_node.alternate.as_deref() else {
                return false;
            };
            collect_conditional_borrow_summary_calls(&if_node.consequent, calls)
                && collect_conditional_borrow_summary_calls(alternate, calls)
        }
        _ => false,
    }
}

fn conditional_borrow_summary_calls(function: &FunctionNode) -> Option<Vec<&CallExpression>> {
    if !matches!(function.body.as_slice(), [AstNode::If(_)]) {
        return None;
    }
    let mut calls = Vec::new();
    if !collect_conditional_borrow_summary_calls(&function.body, &mut calls) || calls.len() < 2 {
        return None;
    }
    Some(calls)
}

fn borrowed_summary_forward_calls<'a>(
    function: &'a FunctionNode,
    machine_contract: &str,
) -> Result<Vec<&'a CallExpression>, NativeCompileError> {
    if machine_contract == CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT {
        if let Some(calls) = conditional_borrow_summary_calls(function) {
            return Ok(calls);
        }
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-summary forwarding requires a final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-summary forwarding requires a direct call or an exhaustive conditional join",
            function.name
        )));
    };
    Ok(vec![call])
}

fn validate_borrowed_forwarding_shapes(
    ast: &Ast,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if !matches!(
        machine_contract,
        BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
    ) {
        return Ok(());
    }
    let aggregate_names = ast
        .body
        .iter()
        .filter_map(|node| match node {
            AstNode::StructDeclaration(structure) => Some(structure.name.as_str()),
            _ => None,
        })
        .collect::<HashSet<_>>();
    for node in &ast.body {
        let AstNode::Function(function) = node else {
            continue;
        };
        let returns_supported_reference = function_returns_lifetimed_slice(function)
            || (matches!(
                machine_contract,
                BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            ) && function_returns_lifetimed_scalar(function))
            || (matches!(
                machine_contract,
                BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            ) && function_returns_lifetimed_aggregate(function, &aggregate_names));
        if !returns_supported_reference {
            continue;
        }
        let total = count_borrowed_forward_returns(&function.body);
        if total == 0 {
            continue;
        }
        let direct = direct_borrowed_forward_return_count(function);
        let conditional_join = machine_contract == CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            && conditional_borrow_summary_calls(function).is_some();
        if conditional_join {
            continue;
        }
        if total != 1 || direct != 1 {
            let forwarding_kind = if function_returns_lifetimed_slice(function) {
                "borrowed-slice"
            } else if function_returns_lifetimed_scalar(function) {
                if matches!(
                    machine_contract,
                    BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                ) {
                    "borrowed-buffer-element"
                } else {
                    "borrowed-scalar-field"
                }
            } else {
                "borrowed-reference"
            };
            let requirement = if machine_contract == CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT {
                format!(
                    "one direct top-level {forwarding_kind} forwarding return or one final exhaustive if/else whose reachable branches each return a borrowed call"
                )
            } else {
                format!("exactly one direct top-level {forwarding_kind} forwarding return")
            };
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` requires {requirement}; found {total} forwarding returns, {direct} top-level",
                function.name
            )));
        }
    }
    Ok(())
}

fn statements_contain_parameter_reborrow(
    statements: &[AstNode],
    parameter_references: &HashSet<&str>,
) -> bool {
    statements.iter().any(|statement| match statement {
        AstNode::VariableDeclaration(local)
            if local
                .type_annotation
                .as_deref()
                .is_some_and(|annotation| annotation.starts_with('&')) =>
        {
            let AstNode::UnaryExpression(borrow) = local.value.as_ref() else {
                return false;
            };
            if !matches!(borrow.operator.as_str(), "&" | "&mut") {
                return false;
            }
            match borrow.argument.as_ref() {
                AstNode::Identifier(identifier) => {
                    parameter_references.contains(identifier.name.as_str())
                }
                argument => owned_buffer_path(argument)
                    .and_then(|path| path.split('.').next().map(str::to_string))
                    .is_some_and(|root| parameter_references.contains(root.as_str())),
            }
        }
        AstNode::LexicalScope(scope) => {
            statements_contain_parameter_reborrow(&scope.body, parameter_references)
        }
        AstNode::If(if_node) => {
            statements_contain_parameter_reborrow(&if_node.consequent, parameter_references)
                || if_node.alternate.as_deref().is_some_and(|alternate| {
                    statements_contain_parameter_reborrow(alternate, parameter_references)
                })
        }
        AstNode::While(while_node) => {
            statements_contain_parameter_reborrow(&while_node.body, parameter_references)
        }
        _ => false,
    })
}

fn annotation_references_aggregate(annotation: &str, aggregate_names: &HashSet<&str>) -> bool {
    reference_annotation_pointee(annotation)
        .is_some_and(|pointee| aggregate_names.contains(pointee))
}

fn reference_annotation_pointee(annotation: &str) -> Option<&str> {
    let mut rest = annotation.strip_prefix('&')?;
    if let Some(lifetime_rest) = rest.strip_prefix('\'') {
        let (_, pointee_rest) = lifetime_rest.split_once(' ')?;
        rest = pointee_rest;
    }
    Some(rest.strip_prefix("mut ").unwrap_or(rest))
}

fn reference_annotation_lifetime(annotation: &str) -> Option<&str> {
    let lifetime_rest = annotation.strip_prefix("&'")?;
    let (lifetime, _) = lifetime_rest.split_once(' ')?;
    (!lifetime.is_empty()).then_some(lifetime)
}

fn annotation_references_machine_scalar(annotation: &str) -> bool {
    annotation
        .strip_prefix("&mut ")
        .or_else(|| annotation.strip_prefix('&'))
        .is_some_and(|pointee| matches!(pointee, "bool" | "i32" | "i64"))
}

fn statements_use_aggregate_references(
    statements: &[AstNode],
    aggregate_names: &HashSet<&str>,
) -> bool {
    let mut aggregate_slots = HashSet::new();
    collect_aggregate_slot_names(statements, aggregate_names, &mut aggregate_slots);
    statements_contain_aggregate_reference(statements, aggregate_names, &aggregate_slots)
}

fn collect_aggregate_slot_names(
    statements: &[AstNode],
    aggregate_names: &HashSet<&str>,
    names: &mut HashSet<String>,
) {
    for statement in statements {
        match statement {
            AstNode::StackSlotDeclaration(slot)
                if aggregate_names.contains(slot.type_annotation.as_str()) =>
            {
                names.insert(slot.name.clone());
            }
            AstNode::LexicalScope(scope) => {
                collect_aggregate_slot_names(&scope.body, aggregate_names, names);
            }
            AstNode::If(if_node) => {
                collect_aggregate_slot_names(&if_node.consequent, aggregate_names, names);
                if let Some(alternate) = if_node.alternate.as_deref() {
                    collect_aggregate_slot_names(alternate, aggregate_names, names);
                }
            }
            AstNode::While(while_node) => {
                collect_aggregate_slot_names(&while_node.body, aggregate_names, names);
            }
            _ => {}
        }
    }
}

fn statements_contain_aggregate_reference(
    statements: &[AstNode],
    aggregate_names: &HashSet<&str>,
    aggregate_slots: &HashSet<String>,
) -> bool {
    statements.iter().any(|statement| match statement {
        AstNode::VariableDeclaration(local) => {
            local.type_annotation.as_deref().is_some_and(|annotation| {
                annotation_references_aggregate(annotation, aggregate_names)
            }) || (local
                .type_annotation
                .as_deref()
                .is_some_and(annotation_references_machine_scalar)
                && matches!(
                    local.value.as_ref(),
                    AstNode::UnaryExpression(borrow)
                        if matches!(borrow.operator.as_str(), "&" | "&mut")
                            && owned_buffer_path(borrow.argument.as_ref())
                                .and_then(|path| path.split('.').next().map(str::to_string))
                                .is_some_and(|root| aggregate_slots.contains(&root))
                            && matches!(borrow.argument.as_ref(), AstNode::MemberExpression(_))
                ))
        }
        AstNode::LexicalScope(scope) => {
            statements_contain_aggregate_reference(&scope.body, aggregate_names, aggregate_slots)
        }
        AstNode::If(if_node) => {
            statements_contain_aggregate_reference(
                &if_node.consequent,
                aggregate_names,
                aggregate_slots,
            ) || if_node.alternate.as_deref().is_some_and(|alternate| {
                statements_contain_aggregate_reference(alternate, aggregate_names, aggregate_slots)
            })
        }
        AstNode::While(while_node) => statements_contain_aggregate_reference(
            &while_node.body,
            aggregate_names,
            aggregate_slots,
        ),
        _ => false,
    })
}

fn statements_use_whole_aggregate_move(
    statements: &[AstNode],
    aggregate_names: &HashSet<&str>,
) -> bool {
    statements.iter().any(|statement| match statement {
        AstNode::StackSlotDeclaration(slot)
            if aggregate_names.contains(slot.type_annotation.as_str()) =>
        {
            matches!(
                slot.value.as_ref(),
                AstNode::CallExpression(call)
                    if matches!(call.callee.as_ref(), AstNode::Identifier(callee) if callee.name == "move")
            )
        }
        AstNode::LexicalScope(scope) => {
            statements_use_whole_aggregate_move(&scope.body, aggregate_names)
        }
        AstNode::If(if_node) => {
            statements_use_whole_aggregate_move(&if_node.consequent, aggregate_names)
                || if_node.alternate.as_deref().is_some_and(|alternate| {
                    statements_use_whole_aggregate_move(alternate, aggregate_names)
                })
        }
        AstNode::While(while_node) => {
            statements_use_whole_aggregate_move(&while_node.body, aggregate_names)
        }
        _ => false,
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

fn annotation_uses_owned_buffer(annotation: &str) -> bool {
    annotation.starts_with('[') && annotation.ends_with(']') && !annotation.contains(';')
}

fn has_owned_buffer_machine_metadata(ast: &Ast) -> bool {
    ast.body.iter().any(|node| match node {
        AstNode::Function(function) => {
            function
                .return_type
                .as_deref()
                .is_some_and(annotation_uses_owned_buffer)
                || function
                    .param_types
                    .iter()
                    .flatten()
                    .any(|annotation| annotation_uses_owned_buffer(annotation))
                || function.body.iter().any(node_uses_owned_buffer_type)
        }
        AstNode::StructDeclaration(structure) => structure
            .field_types
            .iter()
            .flatten()
            .any(|annotation| annotation_uses_owned_buffer(annotation)),
        _ => false,
    })
}

fn node_uses_owned_buffer_type(node: &AstNode) -> bool {
    match node {
        AstNode::VariableDeclaration(local) => local
            .type_annotation
            .as_deref()
            .is_some_and(annotation_uses_owned_buffer),
        AstNode::StackSlotDeclaration(slot) => annotation_uses_owned_buffer(&slot.type_annotation),
        AstNode::If(if_node) => {
            if_node.consequent.iter().any(node_uses_owned_buffer_type)
                || if_node
                    .alternate
                    .as_ref()
                    .is_some_and(|alternate| alternate.iter().any(node_uses_owned_buffer_type))
        }
        AstNode::While(while_node) => while_node.body.iter().any(node_uses_owned_buffer_type),
        AstNode::ForOf(for_node) => for_node.body.iter().any(node_uses_owned_buffer_type),
        AstNode::LexicalScope(scope) => scope.body.iter().any(node_uses_owned_buffer_type),
        _ => false,
    }
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
    annotation.starts_with('[') && annotation.contains(';')
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
    U8,
    I32,
    I64,
    F32,
    F64,
}

impl MachineType {
    fn parse(
        name: &str,
        context: &str,
        machine_contract: &str,
    ) -> Result<Self, NativeCompileError> {
        match name {
            "bool" if bool_enabled(machine_contract) => Ok(Self::Bool),
            "u8" if u8_enabled(machine_contract) => Ok(Self::U8),
            "i32" => Ok(Self::I32),
            "i64" => Ok(Self::I64),
            "f32" if f32_enabled(machine_contract) => Ok(Self::F32),
            "f64" if f64_enabled(machine_contract) => Ok(Self::F64),
            other => {
                let supported = if u8_enabled(machine_contract) && f32_enabled(machine_contract) {
                    "`bool`, `i32`, `i64`, `f32`, `f64`, and `u8`"
                } else if u8_enabled(machine_contract) && f64_enabled(machine_contract) {
                    "`bool`, `i32`, `i64`, `f64`, and `u8`"
                } else if u8_enabled(machine_contract) {
                    "`bool`, `i32`, `i64`, and `u8`"
                } else if f32_enabled(machine_contract) {
                    "`bool`, `i32`, `i64`, `f32`, and `f64`"
                } else if f64_enabled(machine_contract) {
                    "`bool`, `i32`, `i64`, and `f64`"
                } else if bool_enabled(machine_contract) {
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
            Self::U8 => types::I8,
            Self::I32 => types::I32,
            Self::I64 => types::I64,
            Self::F32 => types::F32,
            Self::F64 => types::F64,
        }
    }

    fn name(self) -> &'static str {
        match self {
            Self::Bool => "bool",
            Self::U8 => "u8",
            Self::I32 => "i32",
            Self::I64 => "i64",
            Self::F32 => "f32",
            Self::F64 => "f64",
        }
    }

    fn stack_size(self) -> u32 {
        match self {
            Self::Bool => 1,
            Self::U8 => 1,
            Self::I32 => 4,
            Self::I64 => 8,
            Self::F32 => 4,
            Self::F64 => 8,
        }
    }

    fn stack_align_shift(self) -> u8 {
        match self {
            Self::Bool => 0,
            Self::U8 => 0,
            Self::I32 => 2,
            Self::I64 => 3,
            Self::F32 => 2,
            Self::F64 => 3,
        }
    }

    fn is_float(self) -> bool {
        matches!(self, Self::F32 | Self::F64)
    }
}

fn latest_reference_contract(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
            | FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT
            | FLOAT32_MACHINE_CONTRACT
            | FLOAT64_MACHINE_CONTRACT
            | UNCERTAIN_AGGREGATE_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
    )
}

fn f64_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        FLOAT64_MACHINE_CONTRACT
            | FLOAT32_MACHINE_CONTRACT
            | FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT
            | BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
    )
}

fn f32_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        FLOAT32_MACHINE_CONTRACT
            | FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT
            | BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
    )
}

fn u8_enabled(machine_contract: &str) -> bool {
    machine_contract == BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
}

fn trap_non_finite_float(
    builder: &mut FunctionBuilder<'_>,
    value: Value,
    machine_type: MachineType,
) {
    if !machine_type.is_float() {
        return;
    }
    let unordered = builder.ins().fcmp(FloatCC::Unordered, value, value);
    builder.ins().trapnz(unordered, TrapCode::unwrap_user(13));
    let magnitude = builder.ins().fabs(value);
    let maximum = match machine_type {
        MachineType::F32 => builder.ins().f32const(f32::MAX),
        MachineType::F64 => builder.ins().f64const(f64::MAX),
        _ => unreachable!("finite floating guard requires f32 or f64"),
    };
    let infinite = builder.ins().fcmp(FloatCC::GreaterThan, magnitude, maximum);
    builder.ins().trapnz(infinite, TrapCode::unwrap_user(13));
}

fn lower_checked_integer_division(
    builder: &mut FunctionBuilder<'_>,
    numerator: Value,
    denominator: Value,
    machine_type: MachineType,
    remainder: bool,
) -> Value {
    let zero = builder.ins().iconst(machine_type.ir_type(), 0);
    let denominator_is_zero = builder.ins().icmp(IntCC::Equal, denominator, zero);
    builder
        .ins()
        .trapnz(denominator_is_zero, TrapCode::unwrap_user(5));

    let minimum = match machine_type {
        MachineType::I32 => i64::from(i32::MIN),
        MachineType::I64 => i64::MIN,
        _ => unreachable!("checked integer division requires i32 or i64"),
    };
    let numerator_is_minimum = builder.ins().icmp_imm(IntCC::Equal, numerator, minimum);
    let denominator_is_negative_one = builder.ins().icmp_imm(IntCC::Equal, denominator, -1);
    let signed_overflow = builder
        .ins()
        .band(numerator_is_minimum, denominator_is_negative_one);
    builder
        .ins()
        .trapnz(signed_overflow, TrapCode::unwrap_user(6));

    if remainder {
        builder.ins().srem(numerator, denominator)
    } else {
        builder.ins().sdiv(numerator, denominator)
    }
}

fn bool_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn control_flow_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        CONTROL_FLOW_MACHINE_CONTRACT
            | AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn scoped_lifetimes_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
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
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn references_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
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
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn memory_contract_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
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
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn aggregate_contract_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        AGGREGATE_MACHINE_CONTRACT
            | FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn owned_buffers_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn fixed_arrays_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        FIXED_ARRAY_MACHINE_CONTRACT
            | SLICE_MACHINE_CONTRACT
            | SLICE_CALL_MACHINE_CONTRACT
            | SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn affine_aggregates_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn aggregate_references_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn aggregate_reference_calls_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
    )
}

fn aggregate_reborrows_enabled(machine_contract: &str) -> bool {
    if latest_reference_contract(machine_contract) {
        return true;
    }
    matches!(
        machine_contract,
        AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct OwnedBufferLayout {
    element_type: MachineType,
}

impl OwnedBufferLayout {
    fn parse(
        annotation: &str,
        context: &str,
        machine_contract: &str,
    ) -> Result<Option<Self>, NativeCompileError> {
        if !annotation_uses_owned_buffer(annotation) {
            return Ok(None);
        }
        if !owned_buffers_enabled(machine_contract) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} does not enable owned buffer storage"
            )));
        }
        let element = annotation
            .strip_prefix('[')
            .and_then(|element| element.strip_suffix(']'))
            .filter(|element| !element.is_empty())
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} {context} has malformed owned buffer type `{annotation}`"
                ))
            })?;
        Ok(Some(Self {
            element_type: MachineType::parse(element, context, machine_contract)?,
        }))
    }
}

#[derive(Debug, Clone)]
struct AggregateFieldLayout {
    name: String,
    field_type: AggregateFieldType,
    offset: u32,
    size: u32,
    align_shift: u8,
}

#[derive(Debug, Clone, Copy)]
struct UncertainScalarLayout {
    value_type: MachineType,
    size: u32,
    align_shift: u8,
}

impl UncertainScalarLayout {
    const KNOWN_OFFSET: u32 = 0;
    const REASON_OFFSET: u32 = 4;
    const VALUE_OFFSET: u32 = 8;

    fn new(value_type: MachineType) -> Self {
        let align_shift = value_type.stack_align_shift().max(2);
        let alignment = 1_u32 << align_shift;
        let unaligned_size = Self::VALUE_OFFSET + value_type.stack_size();
        let size = (unaligned_size + alignment - 1) & !(alignment - 1);
        Self {
            value_type,
            size,
            align_shift,
        }
    }

    fn public_layout(self) -> NativeUncertainFieldLayout {
        NativeUncertainFieldLayout {
            known_offset: Self::KNOWN_OFFSET,
            reason_offset: Self::REASON_OFFSET,
            value_offset: Self::VALUE_OFFSET,
            reason_abi_version: NATIVE_MEANING_GAP_REASON_ABI_VERSION,
        }
    }
}

#[derive(Debug, Clone)]
enum AggregateFieldType {
    Scalar(MachineType),
    UncertainScalar(UncertainScalarLayout),
    Owned(OwnedBufferLayout),
    Aggregate(Box<AggregateLayout>),
}

impl AggregateFieldType {
    fn name(&self) -> String {
        match self {
            Self::Scalar(machine_type) => machine_type.name().to_string(),
            Self::UncertainScalar(layout) => {
                format!("Uncertain<{}>", layout.value_type.name())
            }
            Self::Owned(layout) => format!("[{}]", layout.element_type.name()),
            Self::Aggregate(layout) => layout.name.clone(),
        }
    }
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

    fn abi_fingerprint(&self, pointer_type: Type) -> u32 {
        let mut digest = Sha256::new();
        digest.update(b"holoscript.native-aggregate-abi.v1\0");
        digest.update(pointer_type.bytes().to_le_bytes());
        hash_aggregate_layout(&mut digest, self);
        let digest = digest.finalize();
        u32::from_le_bytes([digest[0], digest[1], digest[2], digest[3]])
    }

    fn into_public(self, pointer_type: Type) -> NativeStructLayout {
        let alignment = self.alignment();
        let abi_fingerprint = self.abi_fingerprint(pointer_type);
        NativeStructLayout {
            name: self.name,
            size: self.size,
            alignment,
            abi_fingerprint,
            abi_version: NATIVE_AGGREGATE_ABI_VERSION,
            fields: self
                .fields
                .into_iter()
                .map(|field| {
                    let uncertainty = match &field.field_type {
                        AggregateFieldType::UncertainScalar(layout) => Some(layout.public_layout()),
                        _ => None,
                    };
                    NativeFieldLayout {
                        name: field.name,
                        machine_type: field.field_type.name(),
                        offset: field.offset,
                        size: field.size,
                        alignment: 1_u32 << field.align_shift,
                        uncertainty,
                    }
                })
                .collect(),
        }
    }
}

fn hash_aggregate_layout(digest: &mut Sha256, layout: &AggregateLayout) {
    digest.update(layout.name.as_bytes());
    digest.update([0]);
    digest.update(layout.size.to_le_bytes());
    digest.update([layout.align_shift]);
    for field in &layout.fields {
        digest.update(field.name.as_bytes());
        digest.update([0]);
        digest.update(field.offset.to_le_bytes());
        digest.update(field.size.to_le_bytes());
        digest.update([field.align_shift]);
        match &field.field_type {
            AggregateFieldType::Scalar(machine_type) => {
                digest.update(b"scalar\0");
                digest.update(machine_type.name().as_bytes());
            }
            AggregateFieldType::UncertainScalar(layout) => {
                digest.update(b"uncertain-scalar\0");
                digest.update(NATIVE_MEANING_GAP_REASON_ABI_VERSION.to_le_bytes());
                digest.update(layout.value_type.name().as_bytes());
                digest.update(UncertainScalarLayout::KNOWN_OFFSET.to_le_bytes());
                digest.update(UncertainScalarLayout::REASON_OFFSET.to_le_bytes());
                digest.update(UncertainScalarLayout::VALUE_OFFSET.to_le_bytes());
            }
            AggregateFieldType::Owned(owned) => {
                digest.update(b"owned\0");
                digest.update(owned.element_type.name().as_bytes());
            }
            AggregateFieldType::Aggregate(nested) => {
                digest.update(b"aggregate\0");
                hash_aggregate_layout(digest, nested);
            }
        }
        digest.update([0xff]);
    }
}

fn collect_aggregate_layouts(
    ast: &Ast,
    machine_contract: &str,
    pointer_type: Type,
) -> Result<Vec<AggregateLayout>, NativeCompileError> {
    let mut declarations = HashMap::new();
    let mut declaration_order = Vec::new();
    for node in &ast.body {
        let AstNode::StructDeclaration(structure) = node else {
            continue;
        };
        if declarations
            .insert(structure.name.clone(), structure)
            .is_some()
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} declares duplicate struct `{}`",
                structure.name
            )));
        }
        if matches!(
            structure.name.as_str(),
            "load" | "store" | "buffer" | "move" | "drop"
        ) {
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
        if !structure.field_annotations.is_empty()
            && structure.field_annotations.len() != structure.fields.len()
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} struct `{}` has misaligned field annotation metadata",
                structure.name
            )));
        }
        for (index, annotations) in structure.field_annotations.iter().enumerate() {
            if annotations.len() > 1 || annotations.iter().any(|value| value != "unknown") {
                let field_name = structure
                    .fields
                    .get(index)
                    .map(String::as_str)
                    .unwrap_or("<missing>");
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} field `{field_name}` in struct `{}` supports only one @unknown modifier",
                    structure.name
                )));
            }
        }
        declaration_order.push(structure.name.clone());
    }

    let mut layouts = HashMap::new();
    let mut resolving = Vec::new();
    for name in &declaration_order {
        resolve_aggregate_layout(
            name,
            &declarations,
            &mut layouts,
            &mut resolving,
            machine_contract,
            pointer_type,
        )?;
    }

    Ok(declaration_order
        .into_iter()
        .map(|name| {
            layouts
                .remove(&name)
                .expect("resolved aggregate layout must remain cached")
        })
        .collect())
}

fn resolve_aggregate_layout(
    name: &str,
    declarations: &HashMap<String, &holoscript_wasm::ast::StructDeclarationNode>,
    layouts: &mut HashMap<String, AggregateLayout>,
    resolving: &mut Vec<String>,
    machine_contract: &str,
    pointer_type: Type,
) -> Result<AggregateLayout, NativeCompileError> {
    if let Some(layout) = layouts.get(name) {
        return Ok(layout.clone());
    }
    if let Some(cycle_start) = resolving.iter().position(|resolving| resolving == name) {
        let mut cycle = resolving[cycle_start..].to_vec();
        cycle.push(name.to_string());
        return Err(NativeCompileError::new(format!(
            "{machine_contract} recursive by-value aggregate cycle is not finite: {}",
            cycle.join(" -> ")
        )));
    }
    let structure = declarations
        .get(name)
        .copied()
        .expect("aggregate resolution must start from a declaration");
    resolving.push(name.to_string());

    let mut offset = 0_u32;
    let mut align_shift = 0_u8;
    let mut fields = Vec::with_capacity(structure.fields.len());
    let mut field_names = HashSet::new();
    for (field_index, (field_name, type_name)) in structure
        .fields
        .iter()
        .zip(structure.field_types.iter())
        .enumerate()
    {
        let type_name = type_name
            .as_deref()
            .expect("typed aggregate fields were validated before layout");
        let is_unknown = structure
            .field_annotations
            .get(field_index)
            .is_some_and(|annotations| annotations.iter().any(|value| value == "unknown"));
        if !field_names.insert(field_name.as_str()) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} struct `{}` declares duplicate field `{field_name}`",
                structure.name
            )));
        }
        let context = format!("field `{field_name}` in struct `{}`", structure.name);
        if annotation_uses_slice_reference(type_name) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slices as aggregate fields are not enabled; field `{field_name}` in struct `{}` uses `{type_name}`",
                structure.name
            )));
        }

        let raw_field_type = if declarations.contains_key(type_name) {
            if !matches!(
                machine_contract,
                OWNED_AGGREGATE_MACHINE_CONTRACT
                    | AFFINE_AGGREGATE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
                    | AGGREGATE_REBORROW_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | UNCERTAIN_AGGREGATE_MACHINE_CONTRACT
                    | FLOAT_RECURSIVE_AGGREGATE_MACHINE_CONTRACT
            ) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} field `{field_name}` uses unsupported nested aggregate type `{type_name}` in struct `{}`",
                    structure.name,
                )));
            }
            AggregateFieldType::Aggregate(Box::new(resolve_aggregate_layout(
                type_name,
                declarations,
                layouts,
                resolving,
                machine_contract,
                pointer_type,
            )?))
        } else if let Some(layout) =
            OwnedBufferLayout::parse(type_name, &context, machine_contract)?
        {
            if !matches!(
                machine_contract,
                OWNED_AGGREGATE_MACHINE_CONTRACT
                    | AFFINE_AGGREGATE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
                    | AGGREGATE_REBORROW_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | UNCERTAIN_AGGREGATE_MACHINE_CONTRACT
            ) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned buffers as aggregate fields are not enabled; field `{field_name}` in struct `{}` uses `{type_name}`",
                    structure.name
                )));
            }
            AggregateFieldType::Owned(layout)
        } else if FixedArrayLayout::parse(type_name, &context, machine_contract)?.is_some() {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} fixed arrays as aggregate fields are not enabled; field `{field_name}` in struct `{}` uses `{type_name}`",
                structure.name
            )));
        } else {
            AggregateFieldType::Scalar(MachineType::parse(type_name, &context, machine_contract)?)
        };

        let field_type = if is_unknown {
            match raw_field_type {
                AggregateFieldType::Scalar(machine_type) => {
                    AggregateFieldType::UncertainScalar(UncertainScalarLayout::new(machine_type))
                }
                AggregateFieldType::Owned(_) | AggregateFieldType::Aggregate(_) => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} @unknown field `{field_name}` in struct `{}` must carry a scalar `bool`, `i32`, or `i64` payload in the first native carrier",
                        structure.name
                    )));
                }
                AggregateFieldType::UncertainScalar(_) => {
                    unreachable!("raw field types are never already uncertain")
                }
            }
        } else {
            raw_field_type
        };

        let (field_size, field_align_shift) = match &field_type {
            AggregateFieldType::Scalar(machine_type) => {
                (machine_type.stack_size(), machine_type.stack_align_shift())
            }
            AggregateFieldType::UncertainScalar(layout) => (layout.size, layout.align_shift),
            AggregateFieldType::Owned(_) => {
                let (_, _, size, align_shift) = owned_buffer_abi_offsets(pointer_type);
                (size, align_shift)
            }
            AggregateFieldType::Aggregate(layout) => (layout.size, layout.align_shift),
        };
        let field_alignment = 1_u32 << field_align_shift;
        offset = align_up(offset, field_alignment, machine_contract, &structure.name)?;
        fields.push(AggregateFieldLayout {
            name: field_name.clone(),
            field_type,
            offset,
            size: field_size,
            align_shift: field_align_shift,
        });
        offset = offset.checked_add(field_size).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} struct `{}` exceeds native stack layout limits",
                structure.name
            ))
        })?;
        align_shift = align_shift.max(field_align_shift);
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
    let layout = AggregateLayout {
        name: structure.name.clone(),
        size,
        align_shift,
        fields,
    };
    resolving.pop();
    layouts.insert(name.to_string(), layout.clone());
    Ok(layout)
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
    result: MachineResult,
}

#[derive(Clone)]
struct TypedFunctionAbi {
    func_id: FuncId,
    params: Vec<MachineParameter>,
    result: MachineResult,
    forwards_borrowed_result: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum MachineParameter {
    Scalar(MachineType),
    Slice {
        element_type: MachineType,
        mutable: bool,
        lifetime: Option<String>,
    },
    Owned {
        element_type: MachineType,
    },
    Aggregate {
        layout_fingerprint: u32,
    },
    AggregateReference {
        layout_name: String,
        mutable: bool,
        lifetime: Option<String>,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MachineResult {
    Scalar(MachineType),
    Owned(OwnedBufferLayout),
    Aggregate {
        layout_fingerprint: u32,
    },
    AggregateReference {
        layout_fingerprint: u32,
        source_parameter: usize,
        mutable: bool,
    },
    AggregateSubobjectReference {
        target_layout_fingerprint: u32,
        source_parameter: usize,
        source_layout_fingerprint: u32,
        field_offset: u32,
        mutable: bool,
    },
    ScalarReference {
        machine_type: MachineType,
        source_parameter: usize,
        source_layout_fingerprint: u32,
        field_offset: u32,
        mutable: bool,
    },
    SliceElementReference {
        machine_type: MachineType,
        source_parameter: usize,
        index_parameter: usize,
        mutable: bool,
    },
    AggregateBufferElementReference {
        machine_type: MachineType,
        source_parameter: usize,
        source_layout_fingerprint: u32,
        field_offset: u32,
        index_parameter: usize,
        mutable: bool,
    },
    AggregateBufferSliceReference {
        element_type: MachineType,
        source_parameter: usize,
        source_layout_fingerprint: u32,
        field_offset: u32,
        start_parameter: usize,
        end_parameter: usize,
        mutable: bool,
    },
    AggregateBufferWholeSliceReference {
        element_type: MachineType,
        source_parameter: usize,
        source_layout_fingerprint: u32,
        field_offset: u32,
        mutable: bool,
    },
    SliceReference {
        element_type: MachineType,
        source_parameter: usize,
        mutable: bool,
    },
}

impl MachineResult {
    fn name(self) -> String {
        match self {
            Self::Scalar(machine_type) => machine_type.name().to_string(),
            Self::Owned(layout) => format!("[{}]", layout.element_type.name()),
            Self::Aggregate { .. } => "aggregate".to_string(),
            Self::AggregateReference { .. } => "aggregate reference".to_string(),
            Self::AggregateSubobjectReference { .. } => "borrowed aggregate subobject".to_string(),
            Self::ScalarReference { machine_type, .. } => {
                format!("borrowed scalar `{}`", machine_type.name())
            }
            Self::SliceElementReference { machine_type, .. } => {
                format!("borrowed slice element `{}`", machine_type.name())
            }
            Self::AggregateBufferElementReference { machine_type, .. } => {
                format!(
                    "borrowed aggregate-buffer element `{}`",
                    machine_type.name()
                )
            }
            Self::AggregateBufferSliceReference { element_type, .. } => {
                format!(
                    "borrowed aggregate-buffer slice of `{}`",
                    element_type.name()
                )
            }
            Self::AggregateBufferWholeSliceReference { element_type, .. } => {
                format!(
                    "borrowed whole aggregate-buffer slice of `{}`",
                    element_type.name()
                )
            }
            Self::SliceReference { element_type, .. } => {
                format!("borrowed slice of `{}`", element_type.name())
            }
        }
    }
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

#[derive(Debug, Clone, PartialEq, Eq)]
enum ReferenceTarget {
    Scalar(MachineType),
    Slice(MachineType),
    Aggregate(String),
}

impl ReferenceTarget {
    fn display(&self) -> String {
        match self {
            Self::Scalar(machine_type) => machine_type.name().to_string(),
            Self::Slice(element_type) => format!("[{}]", element_type.name()),
            Self::Aggregate(name) => name.clone(),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ReferenceType {
    target: ReferenceTarget,
    mutable: bool,
    lifetime: Option<String>,
}

impl ReferenceType {
    fn parse(
        annotation: &str,
        context: &str,
        machine_contract: &str,
        aggregate_layouts: &HashMap<String, AggregateLayout>,
    ) -> Result<Option<Self>, NativeCompileError> {
        let Some(rest) = annotation.strip_prefix('&') else {
            return Ok(None);
        };
        let (lifetime, rest) = if let Some(lifetime_rest) = rest.strip_prefix('\'') {
            let (lifetime, pointee_rest) = lifetime_rest.split_once(' ').ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} {context} has malformed lifetime-bearing reference `{annotation}`"
                ))
            })?;
            if lifetime.is_empty() {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} has an empty reference lifetime"
                )));
            }
            (Some(lifetime.to_string()), pointee_rest)
        } else {
            (None, rest)
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
        } else if aggregate_references_enabled(machine_contract)
            && aggregate_layouts.contains_key(pointee)
        {
            ReferenceTarget::Aggregate(pointee.to_string())
        } else {
            ReferenceTarget::Scalar(MachineType::parse(pointee, context, machine_contract)?)
        };
        Ok(Some(Self {
            target,
            mutable,
            lifetime,
        }))
    }
}

#[derive(Debug, Clone)]
enum TypedReferenceLayout {
    Scalar {
        machine_type: MachineType,
        slot_name: String,
        offset: u32,
    },
    ParameterScalar {
        machine_type: MachineType,
        base: Value,
        offset: u32,
        root_name: String,
    },
    ReturnedScalar {
        machine_type: MachineType,
        base: Value,
        root_name: String,
        source_layout_fingerprint: u32,
        field_offset: u32,
    },
    ReturnedSliceElement {
        machine_type: MachineType,
        base: Value,
        root_name: String,
    },
    ReturnedAggregateBufferElement {
        machine_type: MachineType,
        base: Value,
        root_name: String,
        source_layout_fingerprint: u32,
        field_offset: u32,
    },
    Slice {
        element_type: MachineType,
        storage: SliceStorage,
    },
    Aggregate {
        layout: AggregateLayout,
        storage: AggregateReferenceStorage,
    },
}

#[derive(Debug, Clone)]
enum AggregateReferenceStorage {
    Stack { slot_name: String },
    ReturnedStack { slot_name: String },
    Parameter { base: Value },
    ParameterReborrow { base: Value, root_name: String },
    ReturnedSubobject { base: Value, root_name: String },
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
    Heap {
        owner_name: String,
        base: Value,
        length: Value,
    },
    Returned {
        base: Value,
        length: Value,
        root: ReturnedSliceRoot,
    },
}

#[derive(Debug, Clone)]
enum ReturnedSliceRoot {
    Stack(String),
    Heap(String),
}

impl ReturnedSliceRoot {
    fn name(&self) -> &str {
        match self {
            Self::Stack(name) | Self::Heap(name) => name,
        }
    }
}

#[derive(Debug, Clone)]
struct TypedReference {
    layout: TypedReferenceLayout,
    mutable: bool,
}

impl TypedReference {
    fn scalar_pointee(&self) -> Option<MachineType> {
        match &self.layout {
            TypedReferenceLayout::Scalar { machine_type, .. }
            | TypedReferenceLayout::ParameterScalar { machine_type, .. }
            | TypedReferenceLayout::ReturnedScalar { machine_type, .. }
            | TypedReferenceLayout::ReturnedSliceElement { machine_type, .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { machine_type, .. } => {
                Some(*machine_type)
            }
            TypedReferenceLayout::Slice { .. } | TypedReferenceLayout::Aggregate { .. } => None,
        }
    }

    fn stack_root(&self) -> Option<&str> {
        match &self.layout {
            TypedReferenceLayout::Scalar { slot_name, .. }
            | TypedReferenceLayout::Slice {
                storage: SliceStorage::Stack { slot_name, .. },
                ..
            } => Some(slot_name),
            TypedReferenceLayout::Aggregate {
                storage:
                    AggregateReferenceStorage::Stack { slot_name }
                    | AggregateReferenceStorage::ReturnedStack { slot_name },
                ..
            } => Some(slot_name),
            TypedReferenceLayout::Slice {
                storage: SliceStorage::Parameter { .. },
                ..
            }
            | TypedReferenceLayout::ParameterScalar { .. }
            | TypedReferenceLayout::ReturnedScalar { .. }
            | TypedReferenceLayout::ReturnedSliceElement { .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { .. }
            | TypedReferenceLayout::Aggregate {
                storage:
                    AggregateReferenceStorage::Parameter { .. }
                    | AggregateReferenceStorage::ParameterReborrow { .. }
                    | AggregateReferenceStorage::ReturnedSubobject { .. },
                ..
            } => None,
            TypedReferenceLayout::Slice {
                storage: SliceStorage::Heap { owner_name, .. },
                ..
            } => Some(owner_name),
            TypedReferenceLayout::Slice {
                storage:
                    SliceStorage::Returned {
                        root: ReturnedSliceRoot::Stack(root_name),
                        ..
                    },
                ..
            }
            | TypedReferenceLayout::Slice {
                storage:
                    SliceStorage::Returned {
                        root: ReturnedSliceRoot::Heap(root_name),
                        ..
                    },
                ..
            } => Some(root_name),
        }
    }

    fn borrow_root(&self) -> Option<&str> {
        match &self.layout {
            TypedReferenceLayout::ParameterScalar { root_name, .. }
            | TypedReferenceLayout::ReturnedScalar { root_name, .. }
            | TypedReferenceLayout::ReturnedSliceElement { root_name, .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { root_name, .. }
            | TypedReferenceLayout::Aggregate {
                storage: AggregateReferenceStorage::ParameterReborrow { root_name, .. },
                ..
            }
            | TypedReferenceLayout::Aggregate {
                storage: AggregateReferenceStorage::ReturnedSubobject { root_name, .. },
                ..
            } => Some(root_name),
            _ => self.stack_root(),
        }
    }

    fn parameter_reborrow_root(&self) -> Option<&str> {
        match &self.layout {
            TypedReferenceLayout::ParameterScalar { root_name, .. }
            | TypedReferenceLayout::Aggregate {
                storage: AggregateReferenceStorage::ParameterReborrow { root_name, .. },
                ..
            } => Some(root_name),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OwnedBufferState {
    Live,
    Moved,
    Dropped,
}

#[derive(Debug, Clone)]
struct OwnedBuffer {
    base: Value,
    length: Value,
    allocator_id: Value,
    element_type: MachineType,
    state: OwnedBufferState,
    scope_depth: usize,
}

#[derive(Clone, Copy)]
struct AllocatorAbi {
    allocate: FuncId,
    deallocate: FuncId,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct BorrowState {
    shared: usize,
    exclusive: bool,
    aggregate_moved: bool,
}

fn path_has_conflicting_borrow<'path>(
    borrow_states: &HashMap<String, BorrowState>,
    path: &'path str,
    mutable_access: bool,
) -> Option<&'path str> {
    path.match_indices('.')
        .map(|(index, _)| &path[..index])
        .chain(std::iter::once(path))
        .find(|candidate| {
            borrow_states.get(*candidate).is_some_and(|state| {
                state.aggregate_moved || state.exclusive || (mutable_access && state.shared > 0)
            })
        })
}

fn root_has_conflicting_descendant_borrow<'state>(
    borrow_states: &'state HashMap<String, BorrowState>,
    root_name: &str,
    mutable: bool,
) -> Option<&'state str> {
    let prefix = format!("{root_name}.");
    borrow_states.iter().find_map(|(name, state)| {
        (name.starts_with(&prefix) && (state.exclusive || (mutable && state.shared > 0)))
            .then_some(name.as_str())
    })
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum CallBorrowRoot {
    Stack(String),
    Owned(String),
    Parameter,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FlowOutcome {
    FallsThrough,
    Returns,
}

fn declare_allocator_abi(module: &mut ObjectModule) -> Result<AllocatorAbi, NativeCompileError> {
    let pointer_type = module.target_config().pointer_type();
    let mut allocate_signature = module.make_signature();
    allocate_signature.params.push(AbiParam::new(pointer_type));
    allocate_signature.returns.push(AbiParam::new(pointer_type));
    let allocate = module
        .declare_function("malloc", Linkage::Import, &allocate_signature)
        .map_err(|error| NativeCompileError::new(format!("declare allocator failed: {error}")))?;

    let mut deallocate_signature = module.make_signature();
    deallocate_signature
        .params
        .push(AbiParam::new(pointer_type));
    let deallocate = module
        .declare_function("free", Linkage::Import, &deallocate_signature)
        .map_err(|error| NativeCompileError::new(format!("declare deallocator failed: {error}")))?;

    Ok(AllocatorAbi {
        allocate,
        deallocate,
    })
}

fn owned_buffer_abi_offsets(pointer_type: Type) -> (i32, i32, u32, u8) {
    let pointer_bytes = pointer_type.bytes();
    let length_offset = i32::try_from(pointer_bytes).expect("pointer width fits native offsets");
    let allocator_offset = length_offset + 4;
    let unaligned_size = pointer_bytes + 8;
    let alignment = pointer_bytes;
    let size = (unaligned_size + alignment - 1) & !(alignment - 1);
    let align_shift = if pointer_type == types::I64 { 3 } else { 2 };
    (length_offset, allocator_offset, size, align_shift)
}

fn emit_owned_buffer_abi_guards(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    base: Value,
    length: Value,
    allocator_id: Value,
    element_type: MachineType,
) {
    let negative = builder.ins().icmp_imm(IntCC::SignedLessThan, length, 0);
    builder.ins().trapnz(negative, TrapCode::unwrap_user(1));
    let null = builder.ins().icmp_imm(IntCC::Equal, base, 0);
    builder.ins().trapnz(null, TrapCode::unwrap_user(2));
    let unknown_allocator = builder.ins().icmp_imm(
        IntCC::NotEqual,
        allocator_id,
        i64::from(HOST_ALLOCATOR_PROVENANCE_ID),
    );
    builder
        .ins()
        .trapnz(unknown_allocator, TrapCode::unwrap_user(3));

    let pointer_type = module.target_config().pointer_type();
    if let Some(max_length) = runtime_slice_start_limit(pointer_type, element_type.stack_size(), 0)
    {
        let too_large =
            builder
                .ins()
                .icmp_imm(IntCC::UnsignedGreaterThan, length, i64::from(max_length));
        builder.ins().trapnz(too_large, TrapCode::unwrap_user(1));
    }
}

fn emit_owned_buffer_result_record(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    out: Value,
    owner: &OwnedBuffer,
) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    builder.ins().store(MemFlags::new(), owner.base, out, 0);
    builder
        .ins()
        .store(MemFlags::new(), owner.length, out, length_offset);
    builder
        .ins()
        .store(MemFlags::new(), owner.allocator_id, out, allocator_offset);
}

fn create_owned_buffer_result_record(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
) -> (StackSlot, Value) {
    let pointer_type = module.target_config().pointer_type();
    let (_, _, size, align_shift) = owned_buffer_abi_offsets(pointer_type);
    let slot = builder.create_sized_stack_slot(StackSlotData::new(
        StackSlotKind::ExplicitSlot,
        size,
        align_shift,
    ));
    let address = builder.ins().stack_addr(pointer_type, slot, 0);
    (slot, address)
}

fn load_owned_buffer_result_record(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    slot: StackSlot,
    element_type: MachineType,
    scope_depth: usize,
) -> OwnedBuffer {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    let base = builder.ins().stack_load(pointer_type, slot, 0);
    let length = builder.ins().stack_load(types::I32, slot, length_offset);
    let allocator_id = builder.ins().stack_load(types::I32, slot, allocator_offset);
    emit_owned_buffer_abi_guards(builder, module, base, length, allocator_id, element_type);
    OwnedBuffer {
        base,
        length,
        allocator_id,
        element_type,
        state: OwnedBufferState::Live,
        scope_depth,
    }
}

fn aggregate_abi_offsets(pointer_type: Type) -> (i32, i32, i32, i32, u32, u8) {
    let pointer_bytes = pointer_type.bytes();
    let byte_length_offset =
        i32::try_from(pointer_bytes).expect("pointer width fits native offsets");
    let alignment_offset = byte_length_offset + 4;
    let fingerprint_offset = alignment_offset + 4;
    let version_offset = fingerprint_offset + 4;
    let unaligned_size = pointer_bytes + 16;
    let alignment = pointer_bytes;
    let size = (unaligned_size + alignment - 1) & !(alignment - 1);
    let align_shift = if pointer_type == types::I64 { 3 } else { 2 };
    (
        byte_length_offset,
        alignment_offset,
        fingerprint_offset,
        version_offset,
        size,
        align_shift,
    )
}

#[cfg(test)]
mod aggregate_abi_tests {
    use super::*;

    #[test]
    fn descriptor_layout_and_fingerprint_are_pointer_width_specific() {
        assert_eq!(aggregate_abi_offsets(types::I32), (4, 8, 12, 16, 20, 2));
        assert_eq!(aggregate_abi_offsets(types::I64), (8, 12, 16, 20, 24, 3));

        let layout = AggregateLayout {
            name: "Pair".to_string(),
            size: 8,
            align_shift: 2,
            fields: vec![AggregateFieldLayout {
                name: "value".to_string(),
                field_type: AggregateFieldType::Scalar(MachineType::I32),
                offset: 0,
                size: 4,
                align_shift: 2,
            }],
        };
        assert_ne!(
            layout.abi_fingerprint(types::I32),
            layout.abi_fingerprint(types::I64),
            "foreign layouts compiled for different pointer widths must not share ABI identity"
        );
    }
}

fn create_aggregate_ffi_record(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    payload_slot: StackSlot,
    payload_offset: i32,
    layout: &AggregateLayout,
) -> Value {
    let pointer_type = module.target_config().pointer_type();
    let (
        byte_length_offset,
        alignment_offset,
        fingerprint_offset,
        version_offset,
        size,
        align_shift,
    ) = aggregate_abi_offsets(pointer_type);
    let descriptor_slot = builder.create_sized_stack_slot(StackSlotData::new(
        StackSlotKind::ExplicitSlot,
        size,
        align_shift,
    ));
    let payload = builder
        .ins()
        .stack_addr(pointer_type, payload_slot, payload_offset);
    let byte_length = builder.ins().iconst(types::I32, i64::from(layout.size));
    let alignment = builder
        .ins()
        .iconst(types::I32, i64::from(layout.alignment()));
    let fingerprint = builder.ins().iconst(
        types::I32,
        i64::from(layout.abi_fingerprint(pointer_type) as i32),
    );
    let version = builder
        .ins()
        .iconst(types::I32, i64::from(NATIVE_AGGREGATE_ABI_VERSION));
    builder.ins().stack_store(payload, descriptor_slot, 0);
    builder
        .ins()
        .stack_store(byte_length, descriptor_slot, byte_length_offset);
    builder
        .ins()
        .stack_store(alignment, descriptor_slot, alignment_offset);
    builder
        .ins()
        .stack_store(fingerprint, descriptor_slot, fingerprint_offset);
    builder
        .ins()
        .stack_store(version, descriptor_slot, version_offset);
    builder.ins().stack_addr(pointer_type, descriptor_slot, 0)
}

fn validate_aggregate_ffi_record(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    descriptor: Value,
    layout: &AggregateLayout,
) -> Value {
    let pointer_type = module.target_config().pointer_type();
    let (byte_length_offset, alignment_offset, fingerprint_offset, version_offset, _, _) =
        aggregate_abi_offsets(pointer_type);
    let null_descriptor = builder.ins().icmp_imm(IntCC::Equal, descriptor, 0);
    builder
        .ins()
        .trapnz(null_descriptor, TrapCode::unwrap_user(2));
    let payload = builder
        .ins()
        .load(pointer_type, MemFlags::new(), descriptor, 0);
    let byte_length =
        builder
            .ins()
            .load(types::I32, MemFlags::new(), descriptor, byte_length_offset);
    let alignment = builder
        .ins()
        .load(types::I32, MemFlags::new(), descriptor, alignment_offset);
    let fingerprint =
        builder
            .ins()
            .load(types::I32, MemFlags::new(), descriptor, fingerprint_offset);
    let version = builder
        .ins()
        .load(types::I32, MemFlags::new(), descriptor, version_offset);
    for (actual, expected) in [
        (byte_length, layout.size),
        (alignment, layout.alignment()),
        (fingerprint, layout.abi_fingerprint(pointer_type)),
        (version, NATIVE_AGGREGATE_ABI_VERSION),
    ] {
        let mismatch = builder
            .ins()
            .icmp_imm(IntCC::NotEqual, actual, i64::from(expected as i32));
        builder.ins().trapnz(mismatch, TrapCode::unwrap_user(4));
    }
    let null_payload = builder.ins().icmp_imm(IntCC::Equal, payload, 0);
    builder.ins().trapnz(null_payload, TrapCode::unwrap_user(2));
    let misalignment = builder
        .ins()
        .band_imm(payload, i64::from(layout.alignment() - 1));
    builder.ins().trapnz(misalignment, TrapCode::unwrap_user(4));
    payload
}

fn validate_aggregate_reference_pointer(
    builder: &mut FunctionBuilder<'_>,
    base: Value,
    layout: &AggregateLayout,
) {
    let null = builder.ins().icmp_imm(IntCC::Equal, base, 0);
    builder.ins().trapnz(null, TrapCode::unwrap_user(2));
    let misalignment = builder
        .ins()
        .band_imm(base, i64::from(layout.alignment() - 1));
    builder.ins().trapnz(misalignment, TrapCode::unwrap_user(4));
}

fn validate_scalar_reference_pointer(
    builder: &mut FunctionBuilder<'_>,
    base: Value,
    machine_type: MachineType,
) {
    let null = builder.ins().icmp_imm(IntCC::Equal, base, 0);
    builder.ins().trapnz(null, TrapCode::unwrap_user(2));
    let alignment = 1_u32 << machine_type.stack_align_shift();
    if alignment > 1 {
        let misalignment = builder.ins().band_imm(base, i64::from(alignment - 1));
        builder.ins().trapnz(misalignment, TrapCode::unwrap_user(4));
    }
}

fn aggregate_layout_by_fingerprint<'a>(
    aggregate_layouts: &'a HashMap<String, AggregateLayout>,
    pointer_type: Type,
    layout_fingerprint: u32,
    context: &str,
    machine_contract: &str,
) -> Result<&'a AggregateLayout, NativeCompileError> {
    let mut matches = aggregate_layouts
        .values()
        .filter(|layout| layout.abi_fingerprint(pointer_type) == layout_fingerprint);
    let layout = matches.next().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} lost aggregate ABI layout {layout_fingerprint:#010x} for {context}"
        ))
    })?;
    if matches.next().is_some() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate ABI fingerprint collision {layout_fingerprint:#010x} for {context}"
        )));
    }
    Ok(layout)
}

#[allow(clippy::too_many_arguments)]
fn materialize_aggregate_from_pointer(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    payload: Value,
    destination: StackSlot,
    layout: &AggregateLayout,
    owner_prefix: &str,
    base_offset: u32,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &mut Vec<String>,
    scope_depth: usize,
) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    for field in &layout.fields {
        let offset = base_offset + field.offset;
        let native_offset = i32::try_from(offset).expect("aggregate offsets are validated");
        let owner_name = format!("{owner_prefix}.{}", field.name);
        match &field.field_type {
            AggregateFieldType::Scalar(machine_type) => {
                let value = builder.ins().load(
                    machine_type.ir_type(),
                    MemFlags::new(),
                    payload,
                    native_offset,
                );
                builder.ins().stack_store(value, destination, native_offset);
            }
            AggregateFieldType::UncertainScalar(uncertain) => {
                let known_offset = i32::try_from(UncertainScalarLayout::KNOWN_OFFSET)
                    .expect("uncertain offsets fit i32");
                let reason_offset = i32::try_from(UncertainScalarLayout::REASON_OFFSET)
                    .expect("uncertain offsets fit i32");
                let value_offset = i32::try_from(UncertainScalarLayout::VALUE_OFFSET)
                    .expect("uncertain offsets fit i32");
                let known = builder.ins().load(
                    types::I8,
                    MemFlags::new(),
                    payload,
                    native_offset + known_offset,
                );
                let reason = builder.ins().load(
                    types::I32,
                    MemFlags::new(),
                    payload,
                    native_offset + reason_offset,
                );
                let invalid_tag = builder.ins().icmp_imm(IntCC::UnsignedGreaterThan, known, 1);
                builder.ins().trapnz(invalid_tag, TrapCode::unwrap_user(10));
                let is_known = builder.ins().icmp_imm(IntCC::NotEqual, known, 0);
                let reason_is_nonzero = builder.ins().icmp_imm(IntCC::NotEqual, reason, 0);
                let known_with_reason = builder.ins().band(is_known, reason_is_nonzero);
                builder
                    .ins()
                    .trapnz(known_with_reason, TrapCode::unwrap_user(11));
                let is_unknown = builder.ins().icmp_imm(IntCC::Equal, known, 0);
                let reason_below_range = builder.ins().icmp_imm(IntCC::SignedLessThan, reason, 1);
                let reason_above_range =
                    builder.ins().icmp_imm(IntCC::SignedGreaterThan, reason, 5);
                let unknown_below_range = builder.ins().band(is_unknown, reason_below_range);
                let unknown_above_range = builder.ins().band(is_unknown, reason_above_range);
                let invalid_unknown_reason =
                    builder.ins().bor(unknown_below_range, unknown_above_range);
                builder
                    .ins()
                    .trapnz(invalid_unknown_reason, TrapCode::unwrap_user(12));
                let value = builder.ins().load(
                    uncertain.value_type.ir_type(),
                    MemFlags::new(),
                    payload,
                    native_offset + value_offset,
                );
                for (value, relative_offset) in [
                    (known, known_offset),
                    (reason, reason_offset),
                    (value, value_offset),
                ] {
                    builder
                        .ins()
                        .stack_store(value, destination, native_offset + relative_offset);
                }
            }
            AggregateFieldType::Owned(owned_layout) => {
                let base =
                    builder
                        .ins()
                        .load(pointer_type, MemFlags::new(), payload, native_offset);
                let length = builder.ins().load(
                    types::I32,
                    MemFlags::new(),
                    payload,
                    native_offset + length_offset,
                );
                let allocator_id = builder.ins().load(
                    types::I32,
                    MemFlags::new(),
                    payload,
                    native_offset + allocator_offset,
                );
                emit_owned_buffer_abi_guards(
                    builder,
                    module,
                    base,
                    length,
                    allocator_id,
                    owned_layout.element_type,
                );
                let owner = OwnedBuffer {
                    base,
                    length,
                    allocator_id,
                    element_type: owned_layout.element_type,
                    state: OwnedBufferState::Live,
                    scope_depth,
                };
                store_owned_buffer_in_aggregate(builder, module, destination, offset, &owner);
                owned_buffers.insert(owner_name.clone(), owner);
                owner_order.push(owner_name);
            }
            AggregateFieldType::Aggregate(nested) => materialize_aggregate_from_pointer(
                builder,
                module,
                payload,
                destination,
                nested,
                &owner_name,
                offset,
                owned_buffers,
                owner_order,
                scope_depth,
            ),
        }
    }
}

fn copy_aggregate_slot_to_slot(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    source: StackSlot,
    destination: StackSlot,
    layout: &AggregateLayout,
    source_base_offset: u32,
    destination_base_offset: u32,
) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    for field in &layout.fields {
        let source_offset = source_base_offset + field.offset;
        let destination_offset = destination_base_offset + field.offset;
        let native_source = i32::try_from(source_offset).expect("aggregate offsets are validated");
        let native_destination =
            i32::try_from(destination_offset).expect("aggregate offsets are validated");
        match &field.field_type {
            AggregateFieldType::Scalar(machine_type) => {
                let value = builder
                    .ins()
                    .stack_load(machine_type.ir_type(), source, native_source);
                builder
                    .ins()
                    .stack_store(value, destination, native_destination);
            }
            AggregateFieldType::UncertainScalar(uncertain) => {
                for (field_type, relative_offset) in [
                    (types::I8, UncertainScalarLayout::KNOWN_OFFSET),
                    (types::I32, UncertainScalarLayout::REASON_OFFSET),
                    (
                        uncertain.value_type.ir_type(),
                        UncertainScalarLayout::VALUE_OFFSET,
                    ),
                ] {
                    let relative_offset =
                        i32::try_from(relative_offset).expect("uncertain offsets fit i32");
                    let value = builder.ins().stack_load(
                        field_type,
                        source,
                        native_source + relative_offset,
                    );
                    builder.ins().stack_store(
                        value,
                        destination,
                        native_destination + relative_offset,
                    );
                }
            }
            AggregateFieldType::Owned(_) => {
                for (field_type, relative_offset) in [
                    (pointer_type, 0),
                    (types::I32, length_offset),
                    (types::I32, allocator_offset),
                ] {
                    let value = builder.ins().stack_load(
                        field_type,
                        source,
                        native_source + relative_offset,
                    );
                    builder.ins().stack_store(
                        value,
                        destination,
                        native_destination + relative_offset,
                    );
                }
            }
            AggregateFieldType::Aggregate(nested) => copy_aggregate_slot_to_slot(
                builder,
                module,
                source,
                destination,
                nested,
                source_offset,
                destination_offset,
            ),
        }
    }
}

fn copy_aggregate_slot_to_pointer(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    source: StackSlot,
    payload: Value,
    layout: &AggregateLayout,
    base_offset: u32,
) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    for field in &layout.fields {
        let offset = base_offset + field.offset;
        let native_offset = i32::try_from(offset).expect("aggregate offsets are validated");
        match &field.field_type {
            AggregateFieldType::Scalar(machine_type) => {
                let value = builder
                    .ins()
                    .stack_load(machine_type.ir_type(), source, native_offset);
                builder
                    .ins()
                    .store(MemFlags::new(), value, payload, native_offset);
            }
            AggregateFieldType::UncertainScalar(uncertain) => {
                for (field_type, relative_offset) in [
                    (types::I8, UncertainScalarLayout::KNOWN_OFFSET),
                    (types::I32, UncertainScalarLayout::REASON_OFFSET),
                    (
                        uncertain.value_type.ir_type(),
                        UncertainScalarLayout::VALUE_OFFSET,
                    ),
                ] {
                    let relative_offset =
                        i32::try_from(relative_offset).expect("uncertain offsets fit i32");
                    let value = builder.ins().stack_load(
                        field_type,
                        source,
                        native_offset + relative_offset,
                    );
                    builder.ins().store(
                        MemFlags::new(),
                        value,
                        payload,
                        native_offset + relative_offset,
                    );
                }
            }
            AggregateFieldType::Owned(_) => {
                for (field_type, relative_offset) in [
                    (pointer_type, 0),
                    (types::I32, length_offset),
                    (types::I32, allocator_offset),
                ] {
                    let value = builder.ins().stack_load(
                        field_type,
                        source,
                        native_offset + relative_offset,
                    );
                    builder.ins().store(
                        MemFlags::new(),
                        value,
                        payload,
                        native_offset + relative_offset,
                    );
                }
            }
            AggregateFieldType::Aggregate(nested) => {
                copy_aggregate_slot_to_pointer(builder, module, source, payload, nested, offset)
            }
        }
    }
}

fn aggregate_owned_leaf_names(
    layout: &AggregateLayout,
    owner_prefix: &str,
    names: &mut Vec<String>,
) {
    for field in &layout.fields {
        let owner_name = format!("{owner_prefix}.{}", field.name);
        match &field.field_type {
            AggregateFieldType::Owned(_) => names.push(owner_name),
            AggregateFieldType::Aggregate(nested) => {
                aggregate_owned_leaf_names(nested, &owner_name, names);
            }
            AggregateFieldType::Scalar(_) | AggregateFieldType::UncertainScalar(_) => {}
        }
    }
}

fn validate_aggregate_root_owned_leaves(
    layout: &AggregateLayout,
    root_name: &str,
    owned_buffers: &HashMap<String, OwnedBuffer>,
    context: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let mut leaf_names = Vec::new();
    aggregate_owned_leaf_names(layout, root_name, &mut leaf_names);
    for owner_name in leaf_names {
        let owner = owned_buffers.get(&owner_name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate root `{root_name}` lost owned leaf `{owner_name}` before {context}"
            ))
        })?;
        if owner.state != OwnedBufferState::Live {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot borrow aggregate root `{root_name}` for {context} because owned leaf `{owner_name}` is {}",
                match owner.state {
                    OwnedBufferState::Live => unreachable!("live owners were filtered"),
                    OwnedBufferState::Moved => "moved",
                    OwnedBufferState::Dropped => "dropped",
                }
            )));
        }
    }
    Ok(())
}

fn affine_aggregate_move_source(
    expression: &AstNode,
    context: &str,
    machine_contract: &str,
) -> Result<String, NativeCompileError> {
    let AstNode::CallExpression(transfer) = expression else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} must use explicit `move(aggregate)`"
        )));
    };
    if !matches!(transfer.callee.as_ref(), AstNode::Identifier(callee) if callee.name == "move")
        || transfer.arguments.len() != 1
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} must use explicit `move(aggregate)`"
        )));
    }
    let AstNode::Identifier(source) = &transfer.arguments[0] else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} requires a named whole aggregate; nested aggregate moves are not enabled"
        )));
    };
    Ok(source.name.clone())
}

struct PreparedAggregateTransfer {
    source_name: String,
    source: TypedStackSlot,
    owned_leaves: Vec<(String, OwnedBuffer)>,
}

#[allow(clippy::too_many_arguments)]
fn prepare_affine_aggregate_transfer(
    module: &ObjectModule,
    stack_slots: &HashMap<String, TypedStackSlot>,
    owned_buffers: &HashMap<String, OwnedBuffer>,
    borrow_states: &HashMap<String, BorrowState>,
    expression: &AstNode,
    expected_fingerprint: u32,
    context: &str,
    machine_contract: &str,
) -> Result<PreparedAggregateTransfer, NativeCompileError> {
    let source_name = affine_aggregate_move_source(expression, context, machine_contract)?;
    let source = stack_slots.get(&source_name).cloned().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} {context} references unknown aggregate `{source_name}`"
        ))
    })?;
    let StackSlotLayout::Aggregate(layout) = &source.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} requires an aggregate, but `{source_name}` is scalar storage"
        )));
    };
    let pointer_type = module.target_config().pointer_type();
    if layout.abi_fingerprint(pointer_type) != expected_fingerprint {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects an aggregate compatible with ABI layout {expected_fingerprint:#010x}, but `{source_name}` has `{}`",
            layout.name
        )));
    }
    let root_state = borrow_states.get(&source_name).copied().unwrap_or_default();
    if root_state.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate `{source_name}` was already moved before {context}"
        )));
    }
    if root_state.shared > 0 || root_state.exclusive {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot move aggregate `{source_name}` for {context} while a borrow is active"
        )));
    }
    let mut leaf_names = Vec::new();
    aggregate_owned_leaf_names(layout, &source_name, &mut leaf_names);
    let mut transferred = Vec::with_capacity(leaf_names.len());
    for owner_name in leaf_names {
        let owner = owned_buffers.get(&owner_name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate `{source_name}` lost owned leaf `{owner_name}` before {context}"
            ))
        })?;
        require_live_owned_transfer(
            owner,
            borrow_states,
            &owner_name,
            owner.element_type,
            context,
            machine_contract,
        )?;
        transferred.push((owner_name, owner.clone()));
    }
    Ok(PreparedAggregateTransfer {
        source_name,
        source,
        owned_leaves: transferred,
    })
}

fn commit_affine_aggregate_transfer(
    source_name: &str,
    transferred: &[(String, OwnedBuffer)],
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    borrow_states: &mut HashMap<String, BorrowState>,
) {
    for (owner_name, _) in transferred {
        owned_buffers
            .get_mut(owner_name)
            .expect("aggregate transfer leaf was just validated")
            .state = OwnedBufferState::Moved;
    }
    borrow_states
        .entry(source_name.to_string())
        .or_default()
        .aggregate_moved = true;
}

fn lower_typed_ast_to_object(
    ast: &Ast,
    machine_contract: &'static str,
    memory_enabled: bool,
) -> Result<Vec<u8>, NativeCompileError> {
    validate_borrowed_forwarding_shapes(ast, machine_contract)?;
    let mut module = create_object_module()?;
    let pointer_type = module.target_config().pointer_type();
    let aggregate_layouts = collect_aggregate_layouts(ast, machine_contract, pointer_type)?;
    let aggregate_layouts = aggregate_layouts
        .into_iter()
        .map(|layout| (layout.name.clone(), layout))
        .collect::<HashMap<_, _>>();
    let specs =
        collect_typed_function_specs(ast, machine_contract, &aggregate_layouts, pointer_type)?;
    let allocator = if owned_buffers_enabled(machine_contract) {
        Some(declare_allocator_abi(&mut module)?)
    } else {
        None
    };
    let mut functions = HashMap::new();

    for spec in &specs {
        let signature = machine_signature(&module, &spec.params, spec.result);
        let symbol = format!("hs_{}", spec.node.name);
        let linkage = if spec
            .params
            .iter()
            .any(|parameter| matches!(parameter, MachineParameter::AggregateReference { .. }))
            || matches!(
                spec.result,
                MachineResult::AggregateSubobjectReference { .. }
                    | MachineResult::SliceReference { .. }
                    | MachineResult::ScalarReference { .. }
                    | MachineResult::SliceElementReference { .. }
                    | MachineResult::AggregateBufferElementReference { .. }
            ) {
            Linkage::Local
        } else {
            Linkage::Export
        };
        let func_id = module
            .declare_function(&symbol, linkage, &signature)
            .map_err(|error| {
                NativeCompileError::new(format!("declare {symbol} failed: {error}"))
            })?;
        functions.insert(
            spec.node.name.clone(),
            TypedFunctionAbi {
                func_id,
                params: spec.params.clone(),
                result: spec.result,
                forwards_borrowed_result: matches!(
                    spec.result,
                    MachineResult::AggregateReference { .. }
                        | MachineResult::AggregateSubobjectReference { .. }
                        | MachineResult::ScalarReference { .. }
                        | MachineResult::SliceElementReference { .. }
                        | MachineResult::AggregateBufferElementReference { .. }
                        | MachineResult::AggregateBufferSliceReference { .. }
                        | MachineResult::AggregateBufferWholeSliceReference { .. }
                        | MachineResult::SliceReference { .. }
                ) && function_forwards_borrowed_result(spec.node),
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
            let mut parameter_stack_slots = HashMap::new();
            let mut parameter_references = HashMap::new();
            let mut parameter_owned_buffers = HashMap::new();
            let mut parameter_owner_order = Vec::new();
            for (name, parameter) in spec.node.params.iter().zip(spec.params.iter().cloned()) {
                if locals.contains_key(name)
                    || parameter_stack_slots.contains_key(name)
                    || parameter_references.contains_key(name)
                    || parameter_owned_buffers.contains_key(name)
                {
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
                        trap_non_finite_float(&mut builder, value, machine_type);
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
                        ..
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
                    MachineParameter::Owned { element_type } => {
                        let base = block_params
                            .next()
                            .expect("owned parameter must have an ABI base pointer");
                        let length = block_params
                            .next()
                            .expect("owned parameter must have an ABI length");
                        let allocator_id = block_params
                            .next()
                            .expect("owned parameter must have an ABI allocator provenance");
                        emit_owned_buffer_abi_guards(
                            &mut builder,
                            &module,
                            base,
                            length,
                            allocator_id,
                            element_type,
                        );
                        parameter_owned_buffers.insert(
                            name.clone(),
                            OwnedBuffer {
                                base,
                                length,
                                allocator_id,
                                element_type,
                                state: OwnedBufferState::Live,
                                scope_depth: 0,
                            },
                        );
                        parameter_owner_order.push(name.clone());
                    }
                    MachineParameter::Aggregate { layout_fingerprint } => {
                        let descriptor = block_params
                            .next()
                            .expect("aggregate parameter must have one ABI descriptor pointer");
                        let layout = aggregate_layout_by_fingerprint(
                            &aggregate_layouts,
                            pointer_type,
                            layout_fingerprint,
                            &format!("parameter `{name}` in `{}`", spec.node.name),
                            machine_contract,
                        )?;
                        let payload = validate_aggregate_ffi_record(
                            &mut builder,
                            &module,
                            descriptor,
                            layout,
                        );
                        let stack_slot = builder.create_sized_stack_slot(StackSlotData::new(
                            StackSlotKind::ExplicitSlot,
                            layout.size,
                            layout.align_shift,
                        ));
                        materialize_aggregate_from_pointer(
                            &mut builder,
                            &module,
                            payload,
                            stack_slot,
                            layout,
                            name,
                            0,
                            &mut parameter_owned_buffers,
                            &mut parameter_owner_order,
                            0,
                        );
                        parameter_stack_slots.insert(
                            name.clone(),
                            TypedStackSlot {
                                slot: stack_slot,
                                layout: StackSlotLayout::Aggregate(layout.clone()),
                            },
                        );
                    }
                    MachineParameter::AggregateReference {
                        layout_name,
                        mutable,
                        ..
                    } => {
                        let base = block_params
                            .next()
                            .expect("aggregate reference parameter must have one ABI pointer");
                        let layout = aggregate_layouts.get(&layout_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} reference parameter `{name}` in `{}` lost aggregate layout `{layout_name}`",
                                spec.node.name
                            ))
                        })?;
                        validate_aggregate_reference_pointer(&mut builder, base, layout);
                        parameter_references.insert(
                            name.clone(),
                            TypedReference {
                                layout: TypedReferenceLayout::Aggregate {
                                    layout: layout.clone(),
                                    storage: AggregateReferenceStorage::Parameter { base },
                                },
                                mutable,
                            },
                        );
                    }
                }
            }
            let return_out = match spec.result {
                MachineResult::Owned(_) => Some(
                    block_params
                        .next()
                        .expect("owned return must have an ABI out-record pointer"),
                ),
                MachineResult::Scalar(_) => None,
                MachineResult::AggregateReference { .. }
                | MachineResult::AggregateSubobjectReference { .. }
                | MachineResult::ScalarReference { .. }
                | MachineResult::SliceElementReference { .. }
                | MachineResult::AggregateBufferElementReference { .. }
                | MachineResult::AggregateBufferSliceReference { .. }
                | MachineResult::AggregateBufferWholeSliceReference { .. }
                | MachineResult::SliceReference { .. } => None,
                MachineResult::Aggregate { layout_fingerprint } => {
                    let descriptor = block_params
                        .next()
                        .expect("aggregate return must have an ABI descriptor pointer");
                    let layout = aggregate_layout_by_fingerprint(
                        &aggregate_layouts,
                        pointer_type,
                        layout_fingerprint,
                        &format!("return from `{}`", spec.node.name),
                        machine_contract,
                    )?;
                    Some(validate_aggregate_ffi_record(
                        &mut builder,
                        &module,
                        descriptor,
                        layout,
                    ))
                }
            };
            if matches!(spec.result, MachineResult::Owned(_)) {
                let out = return_out.expect("owned result must have an out record");
                let null_out = builder.ins().icmp_imm(IntCC::Equal, out, 0);
                builder.ins().trapnz(null_out, TrapCode::unwrap_user(2));
            }
            debug_assert!(block_params.next().is_none());

            lower_typed_body(
                &mut builder,
                &mut module,
                &functions,
                &aggregate_layouts,
                &mut locals,
                parameter_stack_slots,
                parameter_references,
                parameter_owned_buffers,
                parameter_owner_order,
                return_out,
                allocator,
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
            MachineResult::Scalar(MachineType::Bool) => builder.ins().uextend(types::I32, value),
            MachineResult::Scalar(MachineType::U8) => {
                unreachable!("typed main cannot return a u8 process exit code")
            }
            MachineResult::Scalar(MachineType::I32) => value,
            MachineResult::Scalar(MachineType::I64) => builder.ins().ireduce(types::I32, value),
            MachineResult::Scalar(MachineType::F32) => {
                unreachable!("typed main cannot return a floating-point process exit code")
            }
            MachineResult::Scalar(MachineType::F64) => {
                unreachable!("typed main cannot return a floating-point process exit code")
            }
            MachineResult::Owned(_)
            | MachineResult::Aggregate { .. }
            | MachineResult::AggregateReference { .. }
            | MachineResult::AggregateSubobjectReference { .. }
            | MachineResult::ScalarReference { .. }
            | MachineResult::SliceElementReference { .. }
            | MachineResult::AggregateBufferElementReference { .. }
            | MachineResult::AggregateBufferSliceReference { .. }
            | MachineResult::AggregateBufferWholeSliceReference { .. }
            | MachineResult::SliceReference { .. } => {
                unreachable!("typed main cannot return ownership")
            }
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

fn transitive_borrow_summary_enabled(machine_contract: &str) -> bool {
    matches!(
        machine_contract,
        COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
    )
}

fn borrowed_forward_placeholder(
    function: &FunctionNode,
    params: &[MachineParameter],
    reference_type: &ReferenceType,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<MachineResult, NativeCompileError> {
    let borrowed_result_kind = match &reference_type.target {
        ReferenceTarget::Aggregate(_) => "borrowed aggregate return",
        ReferenceTarget::Slice(_) => "borrowed slice return",
        ReferenceTarget::Scalar(_) => "borrowed scalar return",
    };
    let lifetime = reference_type.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` {borrowed_result_kind} requires an explicit declared lifetime",
            function.name
        ))
    })?;
    if !function
        .lifetimes
        .iter()
        .any(|declared| declared == lifetime)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` declares borrowed return lifetime `'{lifetime}` without binding it in `function {}<'{lifetime}>`",
            function.name, function.name
        )));
    }
    if function.lifetimes.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` supports exactly one borrowed-return lifetime binder",
            function.name
        )));
    }
    let sources = params
        .iter()
        .enumerate()
        .filter(|(_, parameter)| match parameter {
            MachineParameter::Slice {
                lifetime: Some(parameter_lifetime),
                ..
            }
            | MachineParameter::AggregateReference {
                lifetime: Some(parameter_lifetime),
                ..
            } => parameter_lifetime == lifetime,
            _ => false,
        })
        .collect::<Vec<_>>();
    if sources.len() > 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` has ambiguous provenance across {} parameters",
            function.name,
            sources.len()
        )));
    }
    let [(source_parameter, source)] = sources.as_slice() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed forwarding lifetime `'{lifetime}` must identify exactly one source parameter",
            function.name
        )));
    };
    let source_parameter = *source_parameter;
    match (&reference_type.target, *source) {
        (
            ReferenceTarget::Aggregate(target_layout_name),
            MachineParameter::AggregateReference {
                layout_name: source_layout_name,
                mutable,
                ..
            },
        ) => {
            if *mutable != reference_type.mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` borrowed return mutability must match source parameter `{}`",
                    function.name, function.params[source_parameter]
                )));
            }
            let target_layout = aggregate_layouts.get(target_layout_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} function `{}` names unknown borrowed result aggregate `{target_layout_name}`",
                    function.name
                ))
            })?;
            if target_layout_name == source_layout_name {
                Ok(MachineResult::AggregateReference {
                    layout_fingerprint: target_layout.abi_fingerprint(pointer_type),
                    source_parameter,
                    mutable: reference_type.mutable,
                })
            } else {
                let source_layout = aggregate_layouts
                    .get(source_layout_name)
                    .expect("aggregate-reference parameters retain a known layout");
                Ok(MachineResult::AggregateSubobjectReference {
                    target_layout_fingerprint: target_layout.abi_fingerprint(pointer_type),
                    source_parameter,
                    source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                    field_offset: 0,
                    mutable: reference_type.mutable,
                })
            }
        }
        (
            ReferenceTarget::Slice(element_type),
            MachineParameter::Slice {
                element_type: source_element_type,
                mutable,
                ..
            },
        ) if element_type == source_element_type && *mutable == reference_type.mutable => {
            Ok(MachineResult::SliceReference {
                element_type: *element_type,
                source_parameter,
                mutable: reference_type.mutable,
            })
        }
        (
            ReferenceTarget::Slice(element_type),
            MachineParameter::AggregateReference {
                layout_name,
                mutable,
                ..
            },
        ) if *mutable == reference_type.mutable => {
            let source_layout = aggregate_layouts
                .get(layout_name)
                .expect("aggregate-reference parameters retain a known layout");
            Ok(MachineResult::AggregateBufferWholeSliceReference {
                element_type: *element_type,
                source_parameter,
                source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                field_offset: 0,
                mutable: reference_type.mutable,
            })
        }
        (
            ReferenceTarget::Scalar(machine_type),
            MachineParameter::Slice {
                element_type,
                mutable,
                ..
            },
        ) if machine_type == element_type && *mutable == reference_type.mutable => {
            Ok(MachineResult::SliceElementReference {
                machine_type: *machine_type,
                source_parameter,
                index_parameter: 0,
                mutable: reference_type.mutable,
            })
        }
        (
            ReferenceTarget::Scalar(machine_type),
            MachineParameter::AggregateReference {
                layout_name,
                mutable,
                ..
            },
        ) if *mutable == reference_type.mutable => {
            let source_layout = aggregate_layouts
                .get(layout_name)
                .expect("aggregate-reference parameters retain a known layout");
            Ok(MachineResult::ScalarReference {
                machine_type: *machine_type,
                source_parameter,
                source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                field_offset: 0,
                mutable: reference_type.mutable,
            })
        }
        _ => Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed forwarding result does not match its exact lifetime source type or mutability",
            function.name
        ))),
    }
}

fn machine_parameters_abi_compatible(left: &MachineParameter, right: &MachineParameter) -> bool {
    match (left, right) {
        (MachineParameter::Scalar(left), MachineParameter::Scalar(right)) => left == right,
        (
            MachineParameter::Slice {
                element_type: left_type,
                mutable: left_mutable,
                ..
            },
            MachineParameter::Slice {
                element_type: right_type,
                mutable: right_mutable,
                ..
            },
        ) => left_type == right_type && left_mutable == right_mutable,
        (
            MachineParameter::Owned { element_type: left },
            MachineParameter::Owned {
                element_type: right,
            },
        ) => left == right,
        (
            MachineParameter::Aggregate {
                layout_fingerprint: left,
            },
            MachineParameter::Aggregate {
                layout_fingerprint: right,
            },
        ) => left == right,
        (
            MachineParameter::AggregateReference {
                layout_name: left_layout,
                mutable: left_mutable,
                ..
            },
            MachineParameter::AggregateReference {
                layout_name: right_layout,
                mutable: right_mutable,
                ..
            },
        ) => left_layout == right_layout && left_mutable == right_mutable,
        _ => false,
    }
}

fn borrowed_result_source_parameter(result: MachineResult) -> Option<usize> {
    match result {
        MachineResult::AggregateReference {
            source_parameter, ..
        }
        | MachineResult::AggregateSubobjectReference {
            source_parameter, ..
        }
        | MachineResult::ScalarReference {
            source_parameter, ..
        }
        | MachineResult::SliceElementReference {
            source_parameter, ..
        }
        | MachineResult::AggregateBufferElementReference {
            source_parameter, ..
        }
        | MachineResult::AggregateBufferSliceReference {
            source_parameter, ..
        }
        | MachineResult::AggregateBufferWholeSliceReference {
            source_parameter, ..
        }
        | MachineResult::SliceReference {
            source_parameter, ..
        } => Some(source_parameter),
        _ => None,
    }
}

fn borrowed_result_surface_matches(expected: MachineResult, actual: MachineResult) -> bool {
    let aggregate_surface = |result| match result {
        MachineResult::AggregateReference {
            layout_fingerprint,
            mutable,
            ..
        } => Some((layout_fingerprint, mutable)),
        MachineResult::AggregateSubobjectReference {
            target_layout_fingerprint,
            mutable,
            ..
        } => Some((target_layout_fingerprint, mutable)),
        _ => None,
    };
    let scalar_surface = |result| match result {
        MachineResult::ScalarReference {
            machine_type,
            mutable,
            ..
        }
        | MachineResult::SliceElementReference {
            machine_type,
            mutable,
            ..
        }
        | MachineResult::AggregateBufferElementReference {
            machine_type,
            mutable,
            ..
        } => Some((machine_type, mutable)),
        _ => None,
    };
    let slice_surface = |result| match result {
        MachineResult::SliceReference {
            element_type,
            mutable,
            ..
        }
        | MachineResult::AggregateBufferSliceReference {
            element_type,
            mutable,
            ..
        }
        | MachineResult::AggregateBufferWholeSliceReference {
            element_type,
            mutable,
            ..
        } => Some((element_type, mutable)),
        _ => None,
    };
    aggregate_surface(expected)
        .zip(aggregate_surface(actual))
        .is_some_and(|(left, right)| left == right)
        || scalar_surface(expected)
            .zip(scalar_surface(actual))
            .is_some_and(|(left, right)| left == right)
        || slice_surface(expected)
            .zip(slice_surface(actual))
            .is_some_and(|(left, right)| left == right)
}

fn remap_borrow_summary_parameter(
    callee_parameter: usize,
    role: &str,
    caller: &TypedFunctionSpec<'_>,
    callee: &TypedFunctionSpec<'_>,
    call: &CallExpression,
    machine_contract: &str,
) -> Result<usize, NativeCompileError> {
    let argument = call.arguments.get(callee_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call from `{}` to `{}` omitted borrowed-summary {role} argument at position {callee_parameter}",
            caller.node.name, callee.node.name
        ))
    })?;
    let AstNode::Identifier(argument) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` must forward borrowed-summary {role} as an exact named parameter to `{}`; found {}",
            caller.node.name,
            callee.node.name,
            ast_node_name(argument)
        )));
    };
    let caller_parameter = caller
        .node
        .params
        .iter()
        .position(|candidate| candidate == &argument.name)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` cannot substitute local or temporary `{}` for borrowed-summary {role} passed to `{}`",
                caller.node.name, argument.name, callee.node.name
            ))
        })?;
    let callee_type = callee.params.get(callee_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed summary references missing {role} parameter {callee_parameter}",
            callee.node.name
        ))
    })?;
    let caller_type = &caller.params[caller_parameter];
    if !machine_parameters_abi_compatible(caller_type, callee_type) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` changes borrowed-summary {role} type or mutability while forwarding to `{}`",
            caller.node.name, callee.node.name
        )));
    }
    Ok(caller_parameter)
}

fn remap_borrow_summary(
    result: MachineResult,
    caller: &TypedFunctionSpec<'_>,
    callee: &TypedFunctionSpec<'_>,
    call: &CallExpression,
    machine_contract: &str,
) -> Result<MachineResult, NativeCompileError> {
    if call.arguments.len() != callee.params.len() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards {} arguments to `{}`, expected {}",
            caller.node.name,
            call.arguments.len(),
            callee.node.name,
            callee.params.len()
        )));
    }
    let remap = |parameter, role| {
        remap_borrow_summary_parameter(parameter, role, caller, callee, call, machine_contract)
    };
    Ok(match result {
        MachineResult::AggregateReference {
            layout_fingerprint,
            source_parameter,
            mutable,
        } => MachineResult::AggregateReference {
            layout_fingerprint,
            source_parameter: remap(source_parameter, "source")?,
            mutable,
        },
        MachineResult::AggregateSubobjectReference {
            target_layout_fingerprint,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            mutable,
        } => MachineResult::AggregateSubobjectReference {
            target_layout_fingerprint,
            source_parameter: remap(source_parameter, "source")?,
            source_layout_fingerprint,
            field_offset,
            mutable,
        },
        MachineResult::ScalarReference {
            machine_type,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            mutable,
        } => MachineResult::ScalarReference {
            machine_type,
            source_parameter: remap(source_parameter, "source")?,
            source_layout_fingerprint,
            field_offset,
            mutable,
        },
        MachineResult::SliceElementReference {
            machine_type,
            source_parameter,
            index_parameter,
            mutable,
        } => MachineResult::SliceElementReference {
            machine_type,
            source_parameter: remap(source_parameter, "source")?,
            index_parameter: remap(index_parameter, "index coordinate")?,
            mutable,
        },
        MachineResult::AggregateBufferElementReference {
            machine_type,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            index_parameter,
            mutable,
        } => MachineResult::AggregateBufferElementReference {
            machine_type,
            source_parameter: remap(source_parameter, "source")?,
            source_layout_fingerprint,
            field_offset,
            index_parameter: remap(index_parameter, "index coordinate")?,
            mutable,
        },
        MachineResult::AggregateBufferSliceReference {
            element_type,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            start_parameter,
            end_parameter,
            mutable,
        } => MachineResult::AggregateBufferSliceReference {
            element_type,
            source_parameter: remap(source_parameter, "source")?,
            source_layout_fingerprint,
            field_offset,
            start_parameter: remap(start_parameter, "start coordinate")?,
            end_parameter: remap(end_parameter, "end coordinate")?,
            mutable,
        },
        MachineResult::AggregateBufferWholeSliceReference {
            element_type,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            mutable,
        } => MachineResult::AggregateBufferWholeSliceReference {
            element_type,
            source_parameter: remap(source_parameter, "source")?,
            source_layout_fingerprint,
            field_offset,
            mutable,
        },
        MachineResult::SliceReference {
            element_type,
            source_parameter,
            mutable,
        } => MachineResult::SliceReference {
            element_type,
            source_parameter: remap(source_parameter, "source")?,
            mutable,
        },
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` cannot forward non-borrowed result from `{}`",
                caller.node.name, callee.node.name
            )))
        }
    })
}

fn compose_transitive_borrow_summaries(
    specs: &mut [TypedFunctionSpec<'_>],
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if !transitive_borrow_summary_enabled(machine_contract) {
        return Ok(());
    }
    let names = specs
        .iter()
        .enumerate()
        .map(|(index, spec)| (spec.node.name.clone(), index))
        .collect::<HashMap<_, _>>();
    let initial_results = specs.iter().map(|spec| spec.result).collect::<Vec<_>>();
    let mut states = vec![0_u8; specs.len()];
    let mut summaries = vec![None; specs.len()];
    let mut stack = Vec::new();

    #[allow(clippy::too_many_arguments)]
    fn resolve(
        index: usize,
        specs: &[TypedFunctionSpec<'_>],
        names: &HashMap<String, usize>,
        initial_results: &[MachineResult],
        states: &mut [u8],
        summaries: &mut [Option<MachineResult>],
        stack: &mut Vec<usize>,
        machine_contract: &str,
    ) -> Result<MachineResult, NativeCompileError> {
        if let Some(summary) = summaries[index] {
            return Ok(summary);
        }
        if states[index] == 1 {
            let cycle_start = stack
                .iter()
                .position(|candidate| *candidate == index)
                .unwrap_or(0);
            let mut cycle = stack[cycle_start..]
                .iter()
                .map(|candidate| specs[*candidate].node.name.as_str())
                .collect::<Vec<_>>();
            cycle.push(specs[index].node.name.as_str());
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed-summary call graph must be acyclic; found {}",
                cycle.join(" -> ")
            )));
        }
        states[index] = 1;
        stack.push(index);
        let spec = &specs[index];
        let summary = if borrowed_result_source_parameter(initial_results[index]).is_some()
            && function_forwards_borrowed_result(spec.node)
        {
            let calls = borrowed_summary_forward_calls(spec.node, machine_contract)?;
            let mut joined = None::<(MachineResult, &str)>;
            for call in calls {
                let AstNode::Identifier(callee_name) = call.callee.as_ref() else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` borrowed-summary forwarding requires a named HoloScript function",
                        spec.node.name
                    )));
                };
                let callee_index = *names.get(&callee_name.name).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} function `{}` forwards an unknown function `{}`",
                        spec.node.name, callee_name.name
                    ))
                })?;
                let callee_summary = resolve(
                    callee_index,
                    specs,
                    names,
                    initial_results,
                    states,
                    summaries,
                    stack,
                    machine_contract,
                )?;
                let composed = remap_borrow_summary(
                    callee_summary,
                    spec,
                    &specs[callee_index],
                    call,
                    machine_contract,
                )?;
                if let Some((expected, expected_callee)) = joined {
                    if expected != composed {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed-summary branches must compose to one exact typed provenance summary; `{expected_callee}` produced {expected:?}, `{}` produced {composed:?}",
                            spec.node.name, callee_name.name
                        )));
                    }
                } else {
                    joined = Some((composed, callee_name.name.as_str()));
                }
            }
            let (composed, joined_callee) =
                joined.expect("forward shape retains at least one call");
            if !borrowed_result_surface_matches(initial_results[index], composed)
                || borrowed_result_source_parameter(initial_results[index])
                    != borrowed_result_source_parameter(composed)
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` declared borrowed result lifetime, type, or mutability disagrees with composed summary from `{}`",
                    spec.node.name, joined_callee
                )));
            }
            composed
        } else {
            initial_results[index]
        };
        stack.pop();
        states[index] = 2;
        summaries[index] = Some(summary);
        Ok(summary)
    }

    for index in 0..specs.len() {
        resolve(
            index,
            specs,
            &names,
            &initial_results,
            &mut states,
            &mut summaries,
            &mut stack,
            machine_contract,
        )?;
    }
    for (spec, summary) in specs.iter_mut().zip(summaries) {
        spec.result = summary.expect("every typed function receives a deterministic summary");
    }
    Ok(())
}

fn collect_typed_function_specs<'a>(
    ast: &'a Ast,
    machine_contract: &str,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
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
        if owned_buffers_enabled(machine_contract)
            && matches!(function.name.as_str(), "buffer" | "move" | "drop")
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} reserves function name `{}` for owned buffer lifetime operations",
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
            if let Some(layout) = OwnedBufferLayout::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
            )? {
                params.push(MachineParameter::Owned {
                    element_type: layout.element_type,
                });
                continue;
            }
            if let Some(reference_type) = ReferenceType::parse(
                type_name,
                &format!("parameter `{param_name}` in function `{}`", function.name),
                machine_contract,
                aggregate_layouts,
            )? {
                match &reference_type.target {
                    ReferenceTarget::Slice(element_type)
                        if matches!(
                            machine_contract,
                            SLICE_CALL_MACHINE_CONTRACT
                                | SLICE_FORWARD_MACHINE_CONTRACT
                                | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
                                | OWNED_BUFFER_MACHINE_CONTRACT
                                | OWNED_AGGREGATE_MACHINE_CONTRACT
                                | AFFINE_AGGREGATE_MACHINE_CONTRACT
                                | AGGREGATE_REFERENCE_MACHINE_CONTRACT
                                | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
                                | AGGREGATE_REBORROW_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                                | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                                | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                                | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                | BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
                        ) =>
                    {
                        params.push(MachineParameter::Slice {
                            element_type: *element_type,
                            mutable: reference_type.mutable,
                            lifetime: reference_type.lifetime.clone(),
                        });
                        continue;
                    }
                    ReferenceTarget::Aggregate(name)
                        if aggregate_reference_calls_enabled(machine_contract) =>
                    {
                        let layout = aggregate_layouts.get(name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} parameter `{param_name}` in function `{}` names unknown aggregate `{name}`",
                                function.name
                            ))
                        })?;
                        params.push(MachineParameter::AggregateReference {
                            layout_name: layout.name.clone(),
                            mutable: reference_type.mutable,
                            lifetime: reference_type.lifetime.clone(),
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
            if let Some(layout) = aggregate_layouts.get(type_name) {
                if !affine_aggregates_enabled(machine_contract) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregates cannot appear in function parameters; `{param_name}` in `{}` uses `{type_name}`",
                        function.name
                    )));
                }
                params.push(MachineParameter::Aggregate {
                    layout_fingerprint: layout.abi_fingerprint(pointer_type),
                });
                continue;
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
        for parameter in &params {
            let parameter_lifetime = match parameter {
                MachineParameter::Slice {
                    lifetime: Some(lifetime),
                    ..
                }
                | MachineParameter::AggregateReference {
                    lifetime: Some(lifetime),
                    ..
                } => Some(lifetime),
                _ => None,
            };
            if let Some(parameter_lifetime) = parameter_lifetime {
                if !function
                    .lifetimes
                    .iter()
                    .any(|declared| declared == parameter_lifetime)
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` parameter lifetime `'{parameter_lifetime}` is not declared",
                        function.name
                    )));
                }
            }
        }
        let return_name = function.return_type.as_deref().ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` requires an explicit return type",
                function.name
            ))
        })?;
        let result_context = format!("return type of function `{}`", function.name);
        let borrowed_result = ReferenceType::parse(
            return_name,
            &result_context,
            machine_contract,
            aggregate_layouts,
        )?;
        let forwarding_result = if transitive_borrow_summary_enabled(machine_contract)
            && function_forwards_borrowed_result(function)
        {
            borrowed_result
                .as_ref()
                .map(|reference_type| {
                    borrowed_forward_placeholder(
                        function,
                        &params,
                        reference_type,
                        aggregate_layouts,
                        pointer_type,
                        machine_contract,
                    )
                })
                .transpose()?
        } else {
            None
        };
        let result = if let Some(result) = forwarding_result {
            result
        } else if let Some(reference_type) = borrowed_result {
            if !matches!(
                machine_contract,
                BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            ) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} references cannot appear in function returns; `{}` would expose an address-bearing value",
                    function.name
                )));
            }
            let borrowed_result_kind = match &reference_type.target {
                ReferenceTarget::Aggregate(_) => "borrowed aggregate return",
                ReferenceTarget::Slice(_) => "borrowed slice return",
                ReferenceTarget::Scalar(_) => "borrowed scalar return",
            };
            let lifetime = reference_type.lifetime.as_deref().ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} function `{}` {borrowed_result_kind} requires an explicit declared lifetime",
                    function.name,
                ))
            })?;
            if !function
                .lifetimes
                .iter()
                .any(|declared| declared == lifetime)
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` declares borrowed return lifetime `'{lifetime}` without binding it in `function {}<'{lifetime}>`",
                    function.name, function.name
                )));
            }
            if function.lifetimes.len() != 1 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` supports exactly one borrowed-return lifetime binder",
                    function.name
                )));
            }
            let lifetime_source_count = params
                .iter()
                .filter(|parameter| match parameter {
                    MachineParameter::Slice {
                        lifetime: Some(parameter_lifetime),
                        ..
                    }
                    | MachineParameter::AggregateReference {
                        lifetime: Some(parameter_lifetime),
                        ..
                    } => parameter_lifetime == lifetime,
                    _ => false,
                })
                .count();
            if lifetime_source_count > 1 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` has ambiguous provenance across {lifetime_source_count} parameters",
                    function.name
                )));
            }
            match &reference_type.target {
                ReferenceTarget::Aggregate(layout_name) => {
                    let sources = params
                        .iter()
                        .enumerate()
                        .filter_map(|(index, parameter)| match parameter {
                            MachineParameter::AggregateReference {
                                layout_name: parameter_layout,
                                mutable,
                                lifetime: Some(parameter_lifetime),
                            } if parameter_lifetime == lifetime => {
                                Some((index, parameter_layout, *mutable))
                            }
                            _ => None,
                        })
                        .collect::<Vec<_>>();
                    if sources.len() > 1 {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` has ambiguous provenance across {} parameters",
                            function.name,
                            sources.len()
                        )));
                    }
                    let Some((source_parameter, parameter_layout, parameter_mutable)) =
                        sources.into_iter().next()
                    else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` does not identify exactly one aggregate-reference parameter",
                            function.name
                        )));
                    };
                    if parameter_layout != layout_name
                        && !latest_reference_contract(machine_contract)
                    {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return `{layout_name}` does not match source parameter aggregate `{parameter_layout}`",
                            function.name
                        )));
                    }
                    if parameter_mutable != reference_type.mutable {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return mutability must match source parameter `{}`",
                            function.name, function.params[source_parameter]
                        )));
                    }
                    let target_layout = aggregate_layouts
                        .get(layout_name)
                        .expect("parsed aggregate references retain a known layout");
                    if parameter_layout == layout_name {
                        MachineResult::AggregateReference {
                            layout_fingerprint: target_layout.abi_fingerprint(pointer_type),
                            source_parameter,
                            mutable: reference_type.mutable,
                        }
                    } else {
                        let source_layout = aggregate_layouts
                            .get(parameter_layout)
                            .expect("aggregate-reference parameters retain a known layout");
                        let field_offset = if function_forwards_borrowed_result(function) {
                            resolve_forwarded_borrowed_aggregate_subobject_return_field(
                                ast,
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                target_layout,
                                reference_type.mutable,
                                aggregate_layouts,
                                pointer_type,
                                machine_contract,
                            )?
                        } else {
                            resolve_borrowed_aggregate_subobject_return_field(
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                target_layout,
                                reference_type.mutable,
                                machine_contract,
                            )?
                        };
                        MachineResult::AggregateSubobjectReference {
                            target_layout_fingerprint: target_layout.abi_fingerprint(pointer_type),
                            source_parameter,
                            source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                            field_offset,
                            mutable: reference_type.mutable,
                        }
                    }
                }
                ReferenceTarget::Slice(element_type) => {
                    if !matches!(
                        machine_contract,
                        BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                            | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` can return only a caller-tied aggregate reference",
                            function.name
                        )));
                    }
                    if matches!(
                        machine_contract,
                        BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) && function_returns_aggregate_buffer_whole_slice_shape(ast, function, 2)
                    {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::AggregateReference {
                                    layout_name,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, layout_name, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        let Some((source_parameter, source_layout_name, source_mutable)) =
                            sources.first().copied()
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer whole-slice return lifetime `'{lifetime}` does not identify exactly one aggregate-reference parameter",
                                function.name
                            )));
                        };
                        if sources.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer whole-slice return lifetime `'{lifetime}` has ambiguous aggregate provenance across {} parameters",
                                function.name,
                                sources.len()
                            )));
                        }
                        if source_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer whole-slice return mutability must match source parameter `{}`",
                                function.name, function.params[source_parameter]
                            )));
                        }
                        let source_layout = aggregate_layouts
                            .get(source_layout_name)
                            .expect("aggregate-reference parameters retain a known layout");
                        let field_offset = if function_forwards_borrowed_result(function) {
                            resolve_forwarded_borrowed_aggregate_buffer_whole_slice_return(
                                ast,
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                *element_type,
                                reference_type.mutable,
                                aggregate_layouts,
                                pointer_type,
                                machine_contract,
                            )?
                        } else {
                            resolve_borrowed_aggregate_buffer_whole_slice_return(
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                *element_type,
                                reference_type.mutable,
                                machine_contract,
                            )?
                        };
                        MachineResult::AggregateBufferWholeSliceReference {
                            element_type: *element_type,
                            source_parameter,
                            source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                            field_offset,
                            mutable: reference_type.mutable,
                        }
                    } else if matches!(
                        machine_contract,
                        BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) && function_returns_aggregate_buffer_subslice_shape(
                        ast, function, 2,
                    ) {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::AggregateReference {
                                    layout_name,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, layout_name, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        let Some((source_parameter, source_layout_name, source_mutable)) =
                            sources.first().copied()
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer sub-slice return lifetime `'{lifetime}` does not identify exactly one aggregate-reference parameter",
                                function.name
                            )));
                        };
                        if sources.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer sub-slice return lifetime `'{lifetime}` has ambiguous aggregate provenance across {} parameters",
                                function.name,
                                sources.len()
                            )));
                        }
                        if source_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer sub-slice return mutability must match source parameter `{}`",
                                function.name, function.params[source_parameter]
                            )));
                        }
                        let source_layout = aggregate_layouts
                            .get(source_layout_name)
                            .expect("aggregate-reference parameters retain a known layout");
                        let (field_offset, start_parameter, end_parameter) =
                            if function_forwards_borrowed_result(function) {
                                resolve_forwarded_borrowed_aggregate_buffer_subslice_return(
                                    ast,
                                    function,
                                    &function.params[source_parameter],
                                    source_layout,
                                    *element_type,
                                    reference_type.mutable,
                                    aggregate_layouts,
                                    pointer_type,
                                    machine_contract,
                                )?
                            } else {
                                resolve_borrowed_aggregate_buffer_subslice_return(
                                    function,
                                    &function.params[source_parameter],
                                    source_layout,
                                    *element_type,
                                    reference_type.mutable,
                                    machine_contract,
                                )?
                            };
                        MachineResult::AggregateBufferSliceReference {
                            element_type: *element_type,
                            source_parameter,
                            source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                            field_offset,
                            start_parameter,
                            end_parameter,
                            mutable: reference_type.mutable,
                        }
                    } else {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::Slice {
                                    element_type: parameter_element,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, *parameter_element, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        if sources.len() > 1 {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` has ambiguous provenance across {} parameters",
                            function.name,
                            sources.len()
                        )));
                        }
                        let Some((source_parameter, parameter_element, parameter_mutable)) =
                            sources.into_iter().next()
                        else {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return lifetime `'{lifetime}` does not identify exactly one slice-reference parameter",
                            function.name
                        )));
                        };
                        if parameter_element != *element_type {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed slice return element `{}` does not match source parameter element `{}`",
                            function.name,
                            element_type.name(),
                            parameter_element.name()
                        )));
                        }
                        if parameter_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed return mutability must match source parameter `{}`",
                            function.name, function.params[source_parameter]
                        )));
                        }
                        MachineResult::SliceReference {
                            element_type: *element_type,
                            source_parameter,
                            mutable: reference_type.mutable,
                        }
                    }
                }
                ReferenceTarget::Scalar(machine_type) => {
                    if !matches!(
                        machine_contract,
                        BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                            | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` can return only a caller-tied aggregate or slice reference",
                            function.name
                        )));
                    }
                    let has_lifetimed_slice_source = params.iter().any(|parameter| {
                        matches!(
                            parameter,
                            MachineParameter::Slice {
                                lifetime: Some(parameter_lifetime),
                                ..
                            } if parameter_lifetime == lifetime
                        )
                    });
                    if matches!(
                        machine_contract,
                        BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) && function_returns_aggregate_buffer_element_shape(ast, function, 2)
                    {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::AggregateReference {
                                    layout_name,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, layout_name, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        let Some((source_parameter, source_layout_name, source_mutable)) =
                            sources.first().copied()
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer element return lifetime `'{lifetime}` does not identify exactly one aggregate-reference parameter",
                                function.name
                            )));
                        };
                        if sources.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer element return lifetime `'{lifetime}` has ambiguous aggregate provenance across {} parameters",
                                function.name,
                                sources.len()
                            )));
                        }
                        if source_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer element return mutability must match source parameter `{}`",
                                function.name, function.params[source_parameter]
                            )));
                        }
                        let source_layout = aggregate_layouts
                            .get(source_layout_name)
                            .expect("aggregate-reference parameters retain a known layout");
                        let (field_offset, index_parameter) =
                            if function_forwards_borrowed_result(function) {
                                resolve_forwarded_borrowed_aggregate_buffer_element_return(
                                    ast,
                                    function,
                                    &function.params[source_parameter],
                                    source_layout,
                                    *machine_type,
                                    reference_type.mutable,
                                    aggregate_layouts,
                                    pointer_type,
                                    machine_contract,
                                )?
                            } else {
                                resolve_borrowed_aggregate_buffer_element_return(
                                    function,
                                    &function.params[source_parameter],
                                    source_layout,
                                    *machine_type,
                                    reference_type.mutable,
                                    machine_contract,
                                )?
                            };
                        MachineResult::AggregateBufferElementReference {
                            machine_type: *machine_type,
                            source_parameter,
                            source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                            field_offset,
                            index_parameter,
                            mutable: reference_type.mutable,
                        }
                    } else if matches!(
                        machine_contract,
                        BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    ) && has_lifetimed_slice_source
                    {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::Slice {
                                    element_type,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, *element_type, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        let Some((source_parameter, source_element, source_mutable)) =
                            sources.first().copied()
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element return lifetime `'{lifetime}` does not identify exactly one slice-reference parameter",
                                function.name
                            )));
                        };
                        if sources.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element return lifetime `'{lifetime}` has ambiguous slice provenance across {} parameters",
                                function.name,
                                sources.len()
                            )));
                        }
                        if source_element != *machine_type {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element return `{}` does not match source parameter element `{}`",
                                function.name,
                                machine_type.name(),
                                source_element.name()
                            )));
                        }
                        if source_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element return mutability must match source parameter `{}`",
                                function.name, function.params[source_parameter]
                            )));
                        }
                        let index_parameter = if function_forwards_borrowed_result(function) {
                            resolve_forwarded_borrowed_slice_element_index_parameter(
                                ast,
                                function,
                                &function.params[source_parameter],
                                *machine_type,
                                reference_type.mutable,
                                aggregate_layouts,
                                machine_contract,
                            )?
                        } else {
                            resolve_borrowed_slice_element_index_parameter(
                                function,
                                &function.params[source_parameter],
                                *machine_type,
                                reference_type.mutable,
                                machine_contract,
                            )?
                        };
                        MachineResult::SliceElementReference {
                            machine_type: *machine_type,
                            source_parameter,
                            index_parameter,
                            mutable: reference_type.mutable,
                        }
                    } else {
                        let sources = params
                            .iter()
                            .enumerate()
                            .filter_map(|(index, parameter)| match parameter {
                                MachineParameter::AggregateReference {
                                    layout_name,
                                    mutable,
                                    lifetime: Some(parameter_lifetime),
                                } if parameter_lifetime == lifetime => {
                                    Some((index, layout_name, *mutable))
                                }
                                _ => None,
                            })
                            .collect::<Vec<_>>();
                        let Some((source_parameter, source_layout_name, source_mutable)) =
                            sources.first().copied()
                        else {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed scalar return lifetime `'{lifetime}` does not identify exactly one aggregate-reference parameter",
                            function.name
                        )));
                        };
                        if sources.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed scalar return lifetime `'{lifetime}` has ambiguous aggregate provenance across {} parameters",
                            function.name,
                            sources.len()
                        )));
                        }
                        if source_mutable != reference_type.mutable {
                            return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` borrowed scalar return mutability must match source parameter `{}`",
                            function.name, function.params[source_parameter]
                        )));
                        }
                        let source_layout = aggregate_layouts
                            .get(source_layout_name)
                            .expect("aggregate-reference parameters retain a known layout");
                        let field_offset = if matches!(
                            machine_contract,
                            BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                        ) && function_forwards_borrowed_result(function)
                        {
                            resolve_forwarded_borrowed_scalar_return_field(
                                ast,
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                *machine_type,
                                reference_type.mutable,
                                aggregate_layouts,
                                pointer_type,
                                machine_contract,
                            )?
                        } else {
                            resolve_borrowed_scalar_return_field(
                                function,
                                &function.params[source_parameter],
                                source_layout,
                                *machine_type,
                                reference_type.mutable,
                                machine_contract,
                            )?
                        };
                        MachineResult::ScalarReference {
                            machine_type: *machine_type,
                            source_parameter,
                            source_layout_fingerprint: source_layout.abi_fingerprint(pointer_type),
                            field_offset,
                            mutable: reference_type.mutable,
                        }
                    }
                }
            }
        } else if let Some(layout) =
            OwnedBufferLayout::parse(return_name, &result_context, machine_contract)?
        {
            MachineResult::Owned(layout)
        } else {
            if matches!(
                machine_contract,
                BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            ) && !function.lifetimes.is_empty()
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{}` declares a lifetime binder without a borrowed reference return",
                    function.name
                )));
            }
            if let Some(layout) = aggregate_layouts.get(return_name) {
                if !affine_aggregates_enabled(machine_contract) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregates cannot appear in function returns; `{}` returns `{return_name}`",
                        function.name
                    )));
                }
                MachineResult::Aggregate {
                    layout_fingerprint: layout.abi_fingerprint(pointer_type),
                }
            } else {
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
                MachineResult::Scalar(MachineType::parse(
                    return_name,
                    &format!("return type of function `{}`", function.name),
                    machine_contract,
                )?)
            }
        };
        specs.push(TypedFunctionSpec {
            node: function,
            params,
            result,
        });
    }

    compose_transitive_borrow_summaries(&mut specs, machine_contract)?;

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
    if !matches!(
        main.result,
        MachineResult::Scalar(MachineType::I32 | MachineType::I64)
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} process entry `main` must return `i32` or `i64`"
        )));
    }
    Ok(specs)
}

fn machine_signature(
    module: &ObjectModule,
    params: &[MachineParameter],
    result: MachineResult,
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
            MachineParameter::Owned { .. } => {
                signature
                    .params
                    .push(AbiParam::new(module.target_config().pointer_type()));
                signature.params.push(AbiParam::new(types::I32));
                signature.params.push(AbiParam::new(types::I32));
            }
            MachineParameter::Aggregate { .. } => signature
                .params
                .push(AbiParam::new(module.target_config().pointer_type())),
            MachineParameter::AggregateReference { .. } => signature
                .params
                .push(AbiParam::new(module.target_config().pointer_type())),
        }
    }
    match result {
        MachineResult::Scalar(machine_type) => {
            signature
                .returns
                .push(AbiParam::new(machine_type.ir_type()));
        }
        MachineResult::AggregateReference { .. }
        | MachineResult::AggregateSubobjectReference { .. }
        | MachineResult::ScalarReference { .. }
        | MachineResult::SliceElementReference { .. }
        | MachineResult::AggregateBufferElementReference { .. } => signature
            .returns
            .push(AbiParam::new(module.target_config().pointer_type())),
        MachineResult::SliceReference { .. }
        | MachineResult::AggregateBufferSliceReference { .. }
        | MachineResult::AggregateBufferWholeSliceReference { .. } => {
            signature
                .returns
                .push(AbiParam::new(module.target_config().pointer_type()));
            signature.returns.push(AbiParam::new(types::I32));
        }
        MachineResult::Owned(_) | MachineResult::Aggregate { .. } => signature
            .params
            .push(AbiParam::new(module.target_config().pointer_type())),
    }
    signature
}

fn machine_parameter_abi_offset(params: &[MachineParameter], parameter_index: usize) -> usize {
    params[..parameter_index]
        .iter()
        .map(|parameter| match parameter {
            MachineParameter::Scalar(_)
            | MachineParameter::Aggregate { .. }
            | MachineParameter::AggregateReference { .. } => 1,
            MachineParameter::Slice { .. } => 2,
            MachineParameter::Owned { .. } => 3,
        })
        .sum()
}

#[allow(clippy::too_many_arguments)]
fn lower_typed_body(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &mut HashMap<String, TypedValue>,
    mut stack_slots: HashMap<String, TypedStackSlot>,
    mut references: HashMap<String, TypedReference>,
    mut owned_buffers: HashMap<String, OwnedBuffer>,
    mut owner_order: Vec<String>,
    return_out: Option<Value>,
    allocator: Option<AllocatorAbi>,
    spec: &TypedFunctionSpec<'_>,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(), NativeCompileError> {
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
        &mut owned_buffers,
        &mut owner_order,
        allocator,
        &spec.node.body,
        spec,
        return_out,
        machine_contract,
        memory_enabled,
        true,
        0,
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
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &mut Vec<String>,
    allocator: Option<AllocatorAbi>,
    statements: &[AstNode],
    spec: &TypedFunctionSpec<'_>,
    owned_return_out: Option<Value>,
    machine_contract: &str,
    memory_enabled: bool,
    allow_return: bool,
    scope_depth: usize,
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
                if let Some(layout) =
                    OwnedBufferLayout::parse(type_name, &type_context, machine_contract)?
                {
                    if locals.contains_key(&local.name)
                        || stack_slots.contains_key(&local.name)
                        || references.contains_key(&local.name)
                        || owned_buffers.contains_key(&local.name)
                    {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` redeclares binding `{}`",
                            spec.node.name, local.name
                        )));
                    }
                    let allocator = allocator.ok_or_else(|| {
                        NativeCompileError::new(format!(
                            "{machine_contract} lost its owned buffer allocator ABI"
                        ))
                    })?;
                    let owner = lower_owned_buffer_initializer(
                        builder,
                        module,
                        functions,
                        locals,
                        stack_slots,
                        references,
                        borrow_states,
                        owned_buffers,
                        allocator,
                        &local.name,
                        layout.element_type,
                        &local.value,
                        machine_contract,
                        memory_enabled,
                        scope_depth,
                    )?;
                    owned_buffers.insert(local.name.clone(), owner);
                    owner_order.push(local.name.clone());
                    continue;
                }
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
                if let Some(reference_type) = ReferenceType::parse(
                    type_name,
                    &type_context,
                    machine_contract,
                    aggregate_layouts,
                )? {
                    if !references_enabled(machine_contract) {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} does not enable typed references"
                        )));
                    }
                    if locals.contains_key(&local.name)
                        || stack_slots.contains_key(&local.name)
                        || references.contains_key(&local.name)
                        || owned_buffers.contains_key(&local.name)
                    {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} function `{}` redeclares binding `{}`",
                            spec.node.name, local.name
                        )));
                    }
                    if reference_type.lifetime.is_some() {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} local reference `{}` cannot declare a source lifetime; its lexical lifetime is inferred from the initializer",
                            local.name
                        )));
                    }
                    let reference = if let AstNode::CallExpression(call) = local.value.as_ref() {
                        match &reference_type.target {
                            ReferenceTarget::Slice(_) => lower_borrowed_slice_call_initializer(
                                builder,
                                module,
                                functions,
                                aggregate_layouts,
                                locals,
                                stack_slots,
                                references,
                                borrow_states,
                                owned_buffers,
                                &local.name,
                                &reference_type,
                                call,
                                machine_contract,
                                memory_enabled,
                            )?,
                            ReferenceTarget::Scalar(_) => lower_borrowed_scalar_call_initializer(
                                builder,
                                module,
                                functions,
                                aggregate_layouts,
                                locals,
                                stack_slots,
                                references,
                                borrow_states,
                                owned_buffers,
                                &local.name,
                                &reference_type,
                                call,
                                machine_contract,
                                memory_enabled,
                            )?,
                            ReferenceTarget::Aggregate(_) => {
                                lower_borrowed_aggregate_call_initializer(
                                    builder,
                                    module,
                                    functions,
                                    aggregate_layouts,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &local.name,
                                    &reference_type,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                        }
                    } else {
                        lower_reference_initializer(
                            &local.name,
                            reference_type,
                            &local.value,
                            ReferenceInitializerContext {
                                stack_slots,
                                references,
                                aggregate_layouts,
                                owned_buffers,
                                borrow_states,
                                machine_contract,
                            },
                        )?
                    };
                    borrow_leases.push(reference.clone());
                    references.insert(local.name.clone(), reference);
                    continue;
                }
                let machine_type = MachineType::parse(type_name, &type_context, machine_contract)?;
                if locals.contains_key(&local.name)
                    || stack_slots.contains_key(&local.name)
                    || references.contains_key(&local.name)
                    || owned_buffers.contains_key(&local.name)
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} function `{}` redeclares binding `{}`",
                        spec.node.name, local.name
                    )));
                }
                let value = match local.value.as_ref() {
                    AstNode::CallExpression(call) if call_requires_owned_state(call, functions) => {
                        lower_scalar_call_with_ownership(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            borrow_states,
                            owned_buffers,
                            call,
                            machine_type,
                            &format!("initializer for `{}`", local.name),
                            machine_contract,
                            memory_enabled,
                        )?
                    }
                    _ => lower_typed_expression(
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
                    )?,
                };
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
                    || owned_buffers.contains_key(&slot.name)
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
                if annotation_uses_owned_buffer(&slot.type_annotation) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} owned buffer `{}` must use affine local `let` storage, not addressable `slot` storage",
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
                    let stack_slot = builder.create_sized_stack_slot(StackSlotData::new(
                        StackSlotKind::ExplicitSlot,
                        layout.size,
                        layout.align_shift,
                    ));
                    lower_aggregate_initializer(
                        builder,
                        module,
                        functions,
                        locals,
                        stack_slots,
                        references,
                        borrow_states,
                        owned_buffers,
                        owner_order,
                        allocator,
                        stack_slot,
                        &slot.name,
                        layout,
                        &slot.value,
                        0,
                        machine_contract,
                        memory_enabled,
                        scope_depth,
                    )?;
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
                if owned_buffers_enabled(machine_contract)
                    && matches!(
                        call.callee.as_ref(),
                        AstNode::Identifier(callee) if callee.name == "drop"
                    ) =>
            {
                lower_owned_buffer_drop(
                    builder,
                    module,
                    call,
                    owned_buffers,
                    borrow_states,
                    allocator.expect("owned-buffer contracts must declare their allocator ABI"),
                    machine_contract,
                    scope_depth,
                )?;
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
                    owned_buffers,
                    owner_order,
                    allocator,
                    scope,
                    spec,
                    owned_return_out,
                    machine_contract,
                    memory_enabled,
                    scope_depth,
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
                    owned_buffers,
                    owner_order,
                    allocator,
                    if_node,
                    spec,
                    owned_return_out,
                    machine_contract,
                    memory_enabled,
                    scope_depth,
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
                    owned_buffers,
                    owner_order,
                    allocator,
                    while_node,
                    spec,
                    owned_return_out,
                    machine_contract,
                    memory_enabled,
                    scope_depth,
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
                match spec.result {
                    MachineResult::Scalar(result_type) => {
                        let value = match argument {
                            AstNode::CallExpression(call)
                                if call_requires_owned_state(call, functions) =>
                            {
                                lower_scalar_call_with_ownership(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    call,
                                    result_type,
                                    &format!("return from `{}`", spec.node.name),
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => lower_typed_expression(
                                builder,
                                module,
                                functions,
                                locals,
                                stack_slots,
                                references,
                                borrow_states,
                                argument,
                                result_type,
                                &format!("return from `{}`", spec.node.name),
                                machine_contract,
                                memory_enabled,
                            )?,
                        };
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[value.value]);
                    }
                    MachineResult::AggregateBufferWholeSliceReference {
                        element_type,
                        source_parameter,
                        source_layout_fingerprint,
                        field_offset,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("aggregate-buffer source parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout
                        else {
                            unreachable!(
                                "aggregate-buffer whole-slice results require aggregate-reference parameters"
                            )
                        };
                        if layout.abi_fingerprint(module.target_config().pointer_type())
                            != source_layout_fingerprint
                            || source.mutable != mutable
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer source no longer matches its declared aggregate layout or mutability",
                                spec.node.name
                            )));
                        }
                        let AggregateReferenceStorage::Parameter { base: source_base } = storage
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer whole-slice result cannot escape local, returned, or reborrowed aggregate storage",
                                spec.node.name
                            )));
                        };
                        let (returned_base, returned_length) = match argument {
                            AstNode::CallExpression(call) => {
                                lower_forwarded_borrowed_aggregate_buffer_whole_slice_return(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    source_layout_fingerprint,
                                    field_offset,
                                    element_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let resolved_offset =
                                    resolve_borrowed_aggregate_buffer_whole_slice_return(
                                        spec.node,
                                        source_name,
                                        layout,
                                        element_type,
                                        mutable,
                                        machine_contract,
                                    )?;
                                if resolved_offset != field_offset {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` aggregate-buffer field changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                load_owned_buffer_from_aggregate_pointer(
                                    builder,
                                    module,
                                    *source_base,
                                    field_offset,
                                    element_type,
                                )
                            }
                        };
                        validate_borrowed_slice_result(
                            builder,
                            module,
                            returned_base,
                            returned_length,
                            element_type,
                        );
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base, returned_length]);
                    }
                    MachineResult::AggregateBufferSliceReference {
                        element_type,
                        source_parameter,
                        source_layout_fingerprint,
                        field_offset,
                        start_parameter,
                        end_parameter,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("aggregate-buffer source parameter was validated");
                        let start_name = spec
                            .node
                            .params
                            .get(start_parameter)
                            .expect("aggregate-buffer start parameter was validated");
                        let end_name = spec
                            .node
                            .params
                            .get(end_parameter)
                            .expect("aggregate-buffer end parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout
                        else {
                            unreachable!(
                                "aggregate-buffer sub-slice results require aggregate-reference parameters"
                            )
                        };
                        if layout.abi_fingerprint(module.target_config().pointer_type())
                            != source_layout_fingerprint
                            || source.mutable != mutable
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer source no longer matches its declared aggregate layout or mutability",
                                spec.node.name
                            )));
                        }
                        let AggregateReferenceStorage::Parameter { base: source_base } = storage
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer sub-slice result cannot escape local, returned, or reborrowed aggregate storage",
                                spec.node.name
                            )));
                        };
                        let start = locals.get(start_name).copied().ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer start parameter `{start_name}`",
                                spec.node.name
                            ))
                        })?;
                        let end = locals.get(end_name).copied().ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer end parameter `{end_name}`",
                                spec.node.name
                            ))
                        })?;
                        if start.machine_type != MachineType::I32
                            || end.machine_type != MachineType::I32
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer range parameters must remain `i32`",
                                spec.node.name
                            )));
                        }
                        let (returned_base, returned_length) = match argument {
                            AstNode::CallExpression(call) => {
                                lower_forwarded_borrowed_aggregate_buffer_subslice_return(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    source_layout_fingerprint,
                                    field_offset,
                                    start_name,
                                    end_name,
                                    element_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let (resolved_offset, resolved_start, resolved_end) =
                                    resolve_borrowed_aggregate_buffer_subslice_return(
                                        spec.node,
                                        source_name,
                                        layout,
                                        element_type,
                                        mutable,
                                        machine_contract,
                                    )?;
                                if resolved_offset != field_offset
                                    || resolved_start != start_parameter
                                    || resolved_end != end_parameter
                                {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` aggregate-buffer field or range coordinate changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                let (buffer_base, buffer_length) =
                                    load_owned_buffer_from_aggregate_pointer(
                                        builder,
                                        module,
                                        *source_base,
                                        field_offset,
                                        element_type,
                                    );
                                let pointer_type = module.target_config().pointer_type();
                                emit_runtime_slice_range_checks(
                                    builder,
                                    start.value,
                                    end.value,
                                    buffer_length,
                                    pointer_type,
                                    element_type.stack_size(),
                                    0,
                                );
                                let base = offset_runtime_slice_base(
                                    builder,
                                    pointer_type,
                                    buffer_base,
                                    start.value,
                                    element_type.stack_size(),
                                );
                                let length = builder.ins().isub(end.value, start.value);
                                (base, length)
                            }
                        };
                        validate_borrowed_slice_result(
                            builder,
                            module,
                            returned_base,
                            returned_length,
                            element_type,
                        );
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base, returned_length]);
                    }
                    MachineResult::AggregateBufferElementReference {
                        machine_type,
                        source_parameter,
                        source_layout_fingerprint,
                        field_offset,
                        index_parameter,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("aggregate-buffer source parameter was validated");
                        let index_name = spec
                            .node
                            .params
                            .get(index_parameter)
                            .expect("aggregate-buffer index parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout
                        else {
                            unreachable!(
                                "aggregate-buffer element results require aggregate-reference parameters"
                            )
                        };
                        if layout.abi_fingerprint(module.target_config().pointer_type())
                            != source_layout_fingerprint
                            || source.mutable != mutable
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer source no longer matches its declared aggregate layout or mutability",
                                spec.node.name
                            )));
                        }
                        let AggregateReferenceStorage::Parameter { base: source_base } = storage
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer element result cannot escape local, returned, or reborrowed aggregate storage",
                                spec.node.name
                            )));
                        };
                        let index = locals.get(index_name).copied().ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost aggregate-buffer index parameter `{index_name}`",
                                spec.node.name
                            ))
                        })?;
                        if index.machine_type != MachineType::I32 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` aggregate-buffer index parameter `{index_name}` must remain `i32`",
                                spec.node.name
                            )));
                        }
                        let returned_base = match argument {
                            AstNode::CallExpression(call) => {
                                lower_forwarded_borrowed_aggregate_buffer_element_return(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    source_layout_fingerprint,
                                    field_offset,
                                    index_name,
                                    machine_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let (resolved_offset, resolved_index) =
                                    resolve_borrowed_aggregate_buffer_element_return(
                                        spec.node,
                                        source_name,
                                        layout,
                                        machine_type,
                                        mutable,
                                        machine_contract,
                                    )?;
                                if resolved_offset != field_offset
                                    || resolved_index != index_parameter
                                {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` aggregate-buffer field or index coordinate changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                let (buffer_base, buffer_length) =
                                    load_owned_buffer_from_aggregate_pointer(
                                        builder,
                                        module,
                                        *source_base,
                                        field_offset,
                                        machine_type,
                                    );
                                let pointer_type = module.target_config().pointer_type();
                                emit_runtime_slice_element_checks(
                                    builder,
                                    index.value,
                                    buffer_length,
                                    pointer_type,
                                    machine_type.stack_size(),
                                );
                                offset_runtime_slice_base(
                                    builder,
                                    pointer_type,
                                    buffer_base,
                                    index.value,
                                    machine_type.stack_size(),
                                )
                            }
                        };
                        validate_scalar_reference_pointer(builder, returned_base, machine_type);
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base]);
                    }
                    MachineResult::SliceElementReference {
                        machine_type,
                        source_parameter,
                        index_parameter,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("borrowed slice-element source parameter was validated");
                        let index_name = spec
                            .node
                            .params
                            .get(index_parameter)
                            .expect("borrowed slice-element index parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost borrowed slice-element source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Slice {
                            element_type,
                            storage: SliceStorage::Parameter { base, length },
                        } = &source.layout
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element result cannot escape local, returned, or reborrowed slice storage",
                                spec.node.name
                            )));
                        };
                        if *element_type != machine_type || source.mutable != mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element source no longer matches its declared element type or mutability",
                                spec.node.name
                            )));
                        }
                        let index = locals.get(index_name).copied().ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost borrowed slice-element index parameter `{index_name}`",
                                spec.node.name
                            ))
                        })?;
                        if index.machine_type != MachineType::I32 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice-element index parameter `{index_name}` must remain `i32`",
                                spec.node.name
                            )));
                        }
                        let returned_base = match argument {
                            AstNode::CallExpression(call) => {
                                lower_forwarded_borrowed_slice_element_return(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    index_name,
                                    machine_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let resolved_index =
                                    resolve_borrowed_slice_element_index_parameter(
                                        spec.node,
                                        source_name,
                                        machine_type,
                                        mutable,
                                        machine_contract,
                                    )?;
                                if resolved_index != index_parameter {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice-element index coordinate changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                let pointer_type = module.target_config().pointer_type();
                                emit_runtime_slice_element_checks(
                                    builder,
                                    index.value,
                                    *length,
                                    pointer_type,
                                    machine_type.stack_size(),
                                );
                                offset_runtime_slice_base(
                                    builder,
                                    pointer_type,
                                    *base,
                                    index.value,
                                    machine_type.stack_size(),
                                )
                            }
                        };
                        validate_scalar_reference_pointer(builder, returned_base, machine_type);
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base]);
                    }
                    MachineResult::ScalarReference {
                        machine_type,
                        source_parameter,
                        source_layout_fingerprint,
                        field_offset,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("borrowed scalar result source parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost borrowed scalar source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout
                        else {
                            unreachable!(
                                "borrowed scalar field results require aggregate-reference parameters"
                            )
                        };
                        if layout.abi_fingerprint(module.target_config().pointer_type())
                            != source_layout_fingerprint
                            || source.mutable != mutable
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed scalar source no longer matches its declared aggregate layout or mutability",
                                spec.node.name
                            )));
                        }
                        let AggregateReferenceStorage::Parameter { base } = storage else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed scalar result cannot escape local, returned, or reborrowed aggregate storage",
                                spec.node.name
                            )));
                        };
                        let returned_base = match argument {
                            AstNode::CallExpression(call)
                                if matches!(
                                    machine_contract,
                                    BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) =>
                            {
                                lower_forwarded_borrowed_scalar_return(
                                    builder,
                                    module,
                                    functions,
                                    aggregate_layouts,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    source_layout_fingerprint,
                                    field_offset,
                                    machine_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let resolved_offset = resolve_borrowed_scalar_field_borrow(
                                    argument,
                                    &spec.node.name,
                                    source_name,
                                    layout,
                                    machine_type,
                                    mutable,
                                    machine_contract,
                                )?;
                                if resolved_offset != field_offset {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed scalar field path changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                if field_offset == 0 {
                                    *base
                                } else {
                                    builder.ins().iadd_imm(*base, i64::from(field_offset))
                                }
                            }
                        };
                        validate_scalar_reference_pointer(builder, returned_base, machine_type);
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base]);
                    }
                    MachineResult::AggregateSubobjectReference {
                        target_layout_fingerprint,
                        source_parameter,
                        source_layout_fingerprint,
                        field_offset,
                        mutable,
                    } => {
                        let source_name =
                            spec.node.params.get(source_parameter).expect(
                                "borrowed aggregate subobject source parameter was validated",
                            );
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost borrowed aggregate subobject source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Aggregate {
                            layout: source_layout,
                            storage,
                        } = &source.layout
                        else {
                            unreachable!(
                                "borrowed aggregate subobject results require aggregate-reference parameters"
                            )
                        };
                        if source_layout.abi_fingerprint(module.target_config().pointer_type())
                            != source_layout_fingerprint
                            || source.mutable != mutable
                        {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed aggregate subobject source no longer matches its declared layout or mutability",
                                spec.node.name
                            )));
                        }
                        let AggregateReferenceStorage::Parameter { base: source_base } = storage
                        else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed aggregate subobject result cannot escape local, returned, or reborrowed aggregate storage",
                                spec.node.name
                            )));
                        };
                        let target_layout = aggregate_layout_by_fingerprint(
                            aggregate_layouts,
                            module.target_config().pointer_type(),
                            target_layout_fingerprint,
                            &format!(
                                "borrowed aggregate subobject return from `{}`",
                                spec.node.name
                            ),
                            machine_contract,
                        )?;
                        let returned_base = match argument {
                            AstNode::CallExpression(call) => {
                                lower_forwarded_borrowed_aggregate_subobject_return(
                                    builder,
                                    module,
                                    functions,
                                    aggregate_layouts,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    source_layout_fingerprint,
                                    target_layout_fingerprint,
                                    field_offset,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let resolved_offset =
                                    resolve_borrowed_aggregate_subobject_return_field(
                                        spec.node,
                                        source_name,
                                        source_layout,
                                        target_layout,
                                        mutable,
                                        machine_contract,
                                    )?;
                                if resolved_offset != field_offset {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed aggregate subobject path changed after ABI collection",
                                        spec.node.name
                                    )));
                                }
                                if field_offset == 0 {
                                    *source_base
                                } else {
                                    builder
                                        .ins()
                                        .iadd_imm(*source_base, i64::from(field_offset))
                                }
                            }
                        };
                        validate_aggregate_reference_pointer(builder, returned_base, target_layout);
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base]);
                    }
                    MachineResult::AggregateReference {
                        layout_fingerprint,
                        source_parameter,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("borrowed result source parameter was validated");
                        let returned_base = match argument {
                            AstNode::Identifier(returned) => {
                                if returned.name != *source_name {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed aggregate result must return source parameter `{source_name}` directly; found `{}`",
                                        spec.node.name, returned.name
                                    )));
                                }
                                let source = references.get(source_name).ok_or_else(|| {
                                    NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` lost borrowed result source parameter `{source_name}`",
                                        spec.node.name
                                    ))
                                })?;
                                let TypedReferenceLayout::Aggregate { layout, storage } =
                                    &source.layout
                                else {
                                    unreachable!(
                                        "borrowed aggregate results require aggregate parameters"
                                    )
                                };
                                if layout.abi_fingerprint(module.target_config().pointer_type())
                                    != layout_fingerprint
                                    || source.mutable != mutable
                                {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed result source no longer matches its declared layout or mutability",
                                        spec.node.name
                                    )));
                                }
                                let AggregateReferenceStorage::Parameter { base } = storage else {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed aggregate result cannot escape local or reborrowed storage",
                                        spec.node.name
                                    )));
                                };
                                *base
                            }
                            AstNode::CallExpression(call)
                                if matches!(
                                    machine_contract,
                                    BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) =>
                            {
                                lower_forwarded_borrowed_aggregate_return(
                                    builder,
                                    module,
                                    functions,
                                    aggregate_layouts,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    layout_fingerprint,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            _ => {
                                let requirement = if matches!(
                                    machine_contract,
                                    BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) {
                                    format!(
                                        "return source parameter `{source_name}` directly or forward one direct borrowed-aggregate call"
                                    )
                                } else {
                                    format!("return source parameter `{source_name}` directly")
                                };
                                return Err(NativeCompileError::new(format!(
                                    "{machine_contract} function `{}` borrowed aggregate result must {requirement}",
                                    spec.node.name
                                )));
                            }
                        };
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base]);
                    }
                    MachineResult::SliceReference {
                        element_type,
                        source_parameter,
                        mutable,
                    } => {
                        let source_name = spec
                            .node
                            .params
                            .get(source_parameter)
                            .expect("borrowed slice result source parameter was validated");
                        let source = references.get(source_name).ok_or_else(|| {
                            NativeCompileError::new(format!(
                                "{machine_contract} function `{}` lost borrowed slice result source parameter `{source_name}`",
                                spec.node.name
                            ))
                        })?;
                        let TypedReferenceLayout::Slice {
                            element_type: source_element,
                            storage,
                        } = &source.layout
                        else {
                            unreachable!("borrowed slice results require slice parameters")
                        };
                        if *source_element != element_type || source.mutable != mutable {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice result source no longer matches its declared element type or mutability",
                                spec.node.name
                            )));
                        }
                        let SliceStorage::Parameter { base, length } = storage else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} function `{}` borrowed slice result cannot escape local or returned storage",
                                spec.node.name
                            )));
                        };
                        let (returned_base, returned_length) = match argument {
                            AstNode::Identifier(returned) => {
                                if returned.name != *source_name {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice result must return source parameter `{source_name}` directly; found `{}`",
                                        spec.node.name, returned.name
                                    )));
                                }
                                (*base, *length)
                            }
                            AstNode::CallExpression(call)
                                if matches!(
                                    machine_contract,
                                    BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) =>
                            {
                                lower_forwarded_borrowed_slice_return(
                                    builder,
                                    module,
                                    functions,
                                    locals,
                                    stack_slots,
                                    references,
                                    borrow_states,
                                    owned_buffers,
                                    &spec.node.name,
                                    source_name,
                                    element_type,
                                    mutable,
                                    call,
                                    machine_contract,
                                    memory_enabled,
                                )?
                            }
                            AstNode::UnaryExpression(borrow)
                                if matches!(
                                    machine_contract,
                                    BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) =>
                            {
                                let expected_operator = if mutable { "&mut" } else { "&" };
                                if borrow.operator != expected_operator {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result expects `{expected_operator}`, found `{}`",
                                        spec.node.name, borrow.operator
                                    )));
                                }
                                let AstNode::MemberExpression(member) = borrow.argument.as_ref()
                                else {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result must derive from source parameter `{source_name}`",
                                        spec.node.name
                                    )));
                                };
                                let AstNode::Identifier(returned_source) = member.object.as_ref()
                                else {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result must derive from source parameter `{source_name}`",
                                        spec.node.name
                                    )));
                                };
                                if returned_source.name != *source_name {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result must derive from source parameter `{source_name}`; found `{}`",
                                        spec.node.name, returned_source.name
                                    )));
                                }
                                let AstNode::BinaryExpression(range) = member.property.as_ref()
                                else {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result requires a half-open range",
                                        spec.node.name
                                    )));
                                };
                                if !member.computed || range.operator != ".." {
                                    return Err(NativeCompileError::new(format!(
                                        "{machine_contract} function `{}` borrowed slice subrange result requires a half-open range",
                                        spec.node.name
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
                                    &format!(
                                        "borrowed slice return range start for `{source_name}`"
                                    ),
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
                                    &format!("borrowed slice return range end for `{source_name}`"),
                                    machine_contract,
                                    memory_enabled,
                                )?
                                .value;
                                let pointer_type = module.target_config().pointer_type();
                                emit_runtime_slice_range_checks(
                                    builder,
                                    start,
                                    end,
                                    *length,
                                    pointer_type,
                                    element_type.stack_size(),
                                    0,
                                );
                                let derived_base = offset_runtime_slice_base(
                                    builder,
                                    pointer_type,
                                    *base,
                                    start,
                                    element_type.stack_size(),
                                );
                                let derived_length = builder.ins().isub(end, start);
                                (derived_base, derived_length)
                            }
                            _ => {
                                let requirement = if matches!(
                                    machine_contract,
                                    BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                                ) {
                                    format!(
                                        "return source parameter `{source_name}` directly, derive `&{source_name}[start..end]`, or forward one direct borrowed-slice call"
                                    )
                                } else {
                                    format!("return source parameter `{source_name}` directly")
                                };
                                return Err(NativeCompileError::new(format!(
                                    "{machine_contract} function `{}` borrowed slice result must {requirement}",
                                    spec.node.name
                                )));
                            }
                        };
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[returned_base, returned_length]);
                    }
                    MachineResult::Owned(result_layout) => {
                        let owner = lower_owned_buffer_return(
                            owned_buffers,
                            borrow_states,
                            argument,
                            result_layout.element_type,
                            &spec.node.name,
                            machine_contract,
                        )?;
                        let out = owned_return_out.expect("owned result must have an out record");
                        emit_owned_buffer_result_record(builder, module, out, &owner);
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[]);
                    }
                    MachineResult::Aggregate { layout_fingerprint } => {
                        let layout = aggregate_layout_by_fingerprint(
                            aggregate_layouts,
                            module.target_config().pointer_type(),
                            layout_fingerprint,
                            &format!("return from `{}`", spec.node.name),
                            machine_contract,
                        )?;
                        let context = format!("return from `{}`", spec.node.name);
                        let PreparedAggregateTransfer {
                            source_name,
                            source,
                            owned_leaves: transferred,
                        } = prepare_affine_aggregate_transfer(
                            module,
                            stack_slots,
                            owned_buffers,
                            borrow_states,
                            argument,
                            layout_fingerprint,
                            &context,
                            machine_contract,
                        )?;
                        let out = owned_return_out
                            .expect("aggregate result must have a validated payload pointer");
                        copy_aggregate_slot_to_pointer(
                            builder,
                            module,
                            source.slot,
                            out,
                            layout,
                            0,
                        );
                        commit_affine_aggregate_transfer(
                            &source_name,
                            &transferred,
                            owned_buffers,
                            borrow_states,
                        );
                        if let Some(allocator) = allocator {
                            emit_owned_buffer_cleanup(
                                builder,
                                module,
                                owned_buffers,
                                owner_order,
                                allocator,
                            );
                        }
                        builder.ins().return_(&[]);
                    }
                }
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
fn lower_aggregate_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &mut Vec<String>,
    allocator: Option<AllocatorAbi>,
    stack_slot: StackSlot,
    owner_prefix: &str,
    layout: &AggregateLayout,
    initializer: &AstNode,
    base_offset: u32,
    machine_contract: &str,
    memory_enabled: bool,
    scope_depth: usize,
) -> Result<(), NativeCompileError> {
    let AstNode::CallExpression(constructor) = initializer else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate `{owner_prefix}` must be initialized with `{}(...)`",
            layout.name
        )));
    };
    let AstNode::Identifier(constructor_name) = constructor.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate `{owner_prefix}` requires a named constructor"
        )));
    };
    let expected_fingerprint = layout.abi_fingerprint(module.target_config().pointer_type());
    if constructor_name.name == "move" {
        if !affine_aggregates_enabled(machine_contract) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} whole-aggregate moves require {AFFINE_AGGREGATE_MACHINE_CONTRACT}"
            )));
        }
        let context = format!("initializer for aggregate `{owner_prefix}`");
        let PreparedAggregateTransfer {
            source_name,
            source,
            owned_leaves: transferred,
        } = prepare_affine_aggregate_transfer(
            module,
            stack_slots,
            owned_buffers,
            borrow_states,
            initializer,
            expected_fingerprint,
            &context,
            machine_contract,
        )?;
        copy_aggregate_slot_to_slot(
            builder,
            module,
            source.slot,
            stack_slot,
            layout,
            0,
            base_offset,
        );
        commit_affine_aggregate_transfer(&source_name, &transferred, owned_buffers, borrow_states);
        for (source_owner, mut owner) in transferred {
            let suffix = source_owner
                .strip_prefix(&source_name)
                .expect("aggregate leaf must retain its source root");
            let destination_owner = format!("{owner_prefix}{suffix}");
            owner.state = OwnedBufferState::Live;
            owner.scope_depth = scope_depth;
            owned_buffers.insert(destination_owner.clone(), owner);
            owner_order.push(destination_owner);
        }
        return Ok(());
    }
    if let Some(abi) = functions.get(&constructor_name.name) {
        let MachineResult::Aggregate { layout_fingerprint } = abi.result else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate `{owner_prefix}` cannot be initialized by `{}` because it does not return an aggregate",
                constructor_name.name
            )));
        };
        if layout_fingerprint != expected_fingerprint {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate `{owner_prefix}` expects `{}`, but `{}` returns an incompatible aggregate layout",
                layout.name, constructor_name.name
            )));
        }
        let mut arguments = lower_call_arguments_with_ownership(
            builder,
            module,
            functions,
            locals,
            stack_slots,
            references,
            borrow_states,
            owned_buffers,
            constructor,
            abi,
            machine_contract,
            memory_enabled,
        )?;
        arguments.push(create_aggregate_ffi_record(
            builder,
            module,
            stack_slot,
            i32::try_from(base_offset).expect("aggregate offsets are validated"),
            layout,
        ));
        let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
        let call_inst = builder.ins().call(local_callee, &arguments);
        debug_assert!(builder.inst_results(call_inst).is_empty());
        let payload =
            builder
                .ins()
                .stack_addr(module.target_config().pointer_type(), stack_slot, 0);
        materialize_aggregate_from_pointer(
            builder,
            module,
            payload,
            stack_slot,
            layout,
            owner_prefix,
            base_offset,
            owned_buffers,
            owner_order,
            scope_depth,
        );
        return Ok(());
    }
    if constructor_name.name != layout.name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate `{owner_prefix}` expects constructor `{}`, found `{}`",
            layout.name, constructor_name.name
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

    for (field, argument) in layout.fields.iter().zip(&constructor.arguments) {
        let field_offset = base_offset.checked_add(field.offset).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate `{owner_prefix}` exceeds addressable native stack offsets"
            ))
        })?;
        let field_owner = format!("{owner_prefix}.{}", field.name);
        match &field.field_type {
            AggregateFieldType::Scalar(machine_type) => {
                let initial_value = lower_typed_expression(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    argument,
                    *machine_type,
                    &format!("field `{}` in constructor `{}`", field.name, layout.name),
                    machine_contract,
                    memory_enabled,
                )?;
                builder.ins().stack_store(
                    initial_value.value,
                    stack_slot,
                    i32::try_from(field_offset).expect("validated aggregate field offset"),
                );
            }
            AggregateFieldType::UncertainScalar(uncertain) => {
                let AstNode::CallExpression(state) = argument else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} @unknown field `{}` in constructor `{}` must be initialized with `known(value)` or `unknown(\"reason\")`",
                        field.name, layout.name
                    )));
                };
                let AstNode::Identifier(state_name) = state.callee.as_ref() else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} @unknown field `{}` in constructor `{}` requires a named epistemic constructor",
                        field.name, layout.name
                    )));
                };
                let (known, reason, value) = match state_name.name.as_str() {
                    "known" => {
                        if state.arguments.len() != 1 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} `known(value)` for field `{}` expects exactly one payload",
                                field.name
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
                            &state.arguments[0],
                            uncertain.value_type,
                            &format!(
                                "known payload for field `{}` in constructor `{}`",
                                field.name, layout.name
                            ),
                            machine_contract,
                            memory_enabled,
                        )?;
                        (1_i64, 0_i64, value.value)
                    }
                    "unknown" => {
                        let [AstNode::String(reason)] = state.arguments.as_slice() else {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} `unknown(\"reason\")` for field `{}` expects exactly one canonical meaning-gap reason string",
                                field.name
                            )));
                        };
                        let reason =
                            NativeMeaningGapReason::parse(&reason.value).ok_or_else(|| {
                                NativeCompileError::new(format!(
                                    "{machine_contract} unknown meaning-gap reason `{}` for field `{}`; expected underdetermined, unprioritized_conflict, cyclic_dependency, missing_precondition, or irreducible_stochastic",
                                    reason.value, field.name
                                ))
                            })?;
                        (
                            0_i64,
                            i64::from(reason.code()),
                            builder.ins().iconst(uncertain.value_type.ir_type(), 0),
                        )
                    }
                    other => {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} @unknown field `{}` in constructor `{}` cannot be initialized by `{other}`; use `known(value)` or `unknown(\"reason\")`",
                            field.name, layout.name
                        )));
                    }
                };
                let field_offset =
                    i32::try_from(field_offset).expect("validated aggregate field offset");
                let known = builder.ins().iconst(types::I8, known);
                let reason = builder.ins().iconst(types::I32, reason);
                builder.ins().stack_store(
                    known,
                    stack_slot,
                    field_offset
                        + i32::try_from(UncertainScalarLayout::KNOWN_OFFSET)
                            .expect("uncertain offsets fit i32"),
                );
                builder.ins().stack_store(
                    reason,
                    stack_slot,
                    field_offset
                        + i32::try_from(UncertainScalarLayout::REASON_OFFSET)
                            .expect("uncertain offsets fit i32"),
                );
                builder.ins().stack_store(
                    value,
                    stack_slot,
                    field_offset
                        + i32::try_from(UncertainScalarLayout::VALUE_OFFSET)
                            .expect("uncertain offsets fit i32"),
                );
            }
            AggregateFieldType::Owned(owned_layout) => {
                let allocator = allocator.ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} lost its owned buffer allocator ABI"
                    ))
                })?;
                let owner = lower_owned_buffer_initializer(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    owned_buffers,
                    allocator,
                    &field_owner,
                    owned_layout.element_type,
                    argument,
                    machine_contract,
                    memory_enabled,
                    scope_depth,
                )?;
                store_owned_buffer_in_aggregate(builder, module, stack_slot, field_offset, &owner);
                owned_buffers.insert(field_owner.clone(), owner);
                owner_order.push(field_owner);
            }
            AggregateFieldType::Aggregate(nested) => {
                lower_aggregate_initializer(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    borrow_states,
                    owned_buffers,
                    owner_order,
                    allocator,
                    stack_slot,
                    &field_owner,
                    nested,
                    argument,
                    field_offset,
                    machine_contract,
                    memory_enabled,
                    scope_depth,
                )?;
            }
        }
    }
    Ok(())
}

fn store_owned_buffer_in_aggregate(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    stack_slot: StackSlot,
    offset: u32,
    owner: &OwnedBuffer,
) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    let offset = i32::try_from(offset).expect("validated aggregate field offset");
    builder.ins().stack_store(owner.base, stack_slot, offset);
    builder
        .ins()
        .stack_store(owner.length, stack_slot, offset + length_offset);
    builder
        .ins()
        .stack_store(owner.allocator_id, stack_slot, offset + allocator_offset);
}

fn load_owned_buffer_from_aggregate_pointer(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    aggregate_base: Value,
    field_offset: u32,
    element_type: MachineType,
) -> (Value, Value) {
    let pointer_type = module.target_config().pointer_type();
    let (length_offset, allocator_offset, _, _) = owned_buffer_abi_offsets(pointer_type);
    let field_offset = i32::try_from(field_offset).expect("validated aggregate owned-field offset");
    let base = builder
        .ins()
        .load(pointer_type, MemFlags::new(), aggregate_base, field_offset);
    let length = builder.ins().load(
        types::I32,
        MemFlags::new(),
        aggregate_base,
        field_offset + length_offset,
    );
    let allocator_id = builder.ins().load(
        types::I32,
        MemFlags::new(),
        aggregate_base,
        field_offset + allocator_offset,
    );
    emit_owned_buffer_abi_guards(builder, module, base, length, allocator_id, element_type);
    (base, length)
}

fn owned_buffer_path(node: &AstNode) -> Option<String> {
    match node {
        AstNode::Identifier(identifier) => Some(identifier.name.clone()),
        AstNode::MemberExpression(member) if !member.computed => {
            let root = owned_buffer_path(&member.object)?;
            let AstNode::Identifier(property) = member.property.as_ref() else {
                return None;
            };
            Some(format!("{root}.{}", property.name))
        }
        _ => None,
    }
}

fn explicit_owned_move_path(node: &AstNode) -> Option<String> {
    let AstNode::CallExpression(call) = node else {
        return None;
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return None;
    };
    (callee.name == "move" && call.arguments.len() == 1)
        .then(|| owned_buffer_path(&call.arguments[0]))
        .flatten()
}

#[allow(clippy::too_many_arguments)]
fn lower_owned_buffer_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    allocator: AllocatorAbi,
    owner_name: &str,
    element_type: MachineType,
    initializer: &AstNode,
    machine_contract: &str,
    memory_enabled: bool,
    scope_depth: usize,
) -> Result<OwnedBuffer, NativeCompileError> {
    let AstNode::CallExpression(call) = initializer else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned buffer `{owner_name}` must be initialized by `buffer(count, fill)` or `move(owner)`"
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned buffer `{owner_name}` requires a direct lifetime operation"
        )));
    };

    match callee.name.as_str() {
        "buffer" => {
            if call.arguments.len() != 2 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `buffer` expects a signed `i32` element count and one fill value, found {} arguments",
                    call.arguments.len()
                )));
            }
            let length = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &call.arguments[0],
                MachineType::I32,
                &format!("length of owned buffer `{owner_name}`"),
                machine_contract,
                memory_enabled,
            )?;
            let fill = lower_typed_expression(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                &call.arguments[1],
                element_type,
                &format!("fill value of owned buffer `{owner_name}`"),
                machine_contract,
                memory_enabled,
            )?;
            let base = emit_owned_buffer_allocation(
                builder,
                module,
                allocator,
                length.value,
                fill.value,
                element_type,
            );
            let allocator_id = builder
                .ins()
                .iconst(types::I32, i64::from(HOST_ALLOCATOR_PROVENANCE_ID));
            Ok(OwnedBuffer {
                base,
                length: length.value,
                allocator_id,
                element_type,
                state: OwnedBufferState::Live,
                scope_depth,
            })
        }
        "move" => {
            if call.arguments.len() != 1 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `move` expects exactly one owned buffer, found {} arguments",
                    call.arguments.len()
                )));
            }
            let Some(source_name) = owned_buffer_path(&call.arguments[0]) else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `move` requires a named owned buffer or owned aggregate field"
                )));
            };
            let source = owned_buffers.get(&source_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} `move` references unknown owned buffer `{}`",
                    source_name
                ))
            })?;
            if source.scope_depth != scope_depth {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned buffer `{}` cannot move across a lexical scope boundary",
                    source_name
                )));
            }
            match source.state {
                OwnedBufferState::Live => {}
                OwnedBufferState::Moved => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} owned buffer `{}` was already moved",
                        source_name
                    )));
                }
                OwnedBufferState::Dropped => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} owned buffer `{}` was already dropped",
                        source_name
                    )));
                }
            }
            if let Some(borrowed_root) =
                path_has_conflicting_borrow(borrow_states, &source_name, true)
            {
                let conflict = if borrowed_root == source_name {
                    "while a borrow is active".to_string()
                } else {
                    format!("while aggregate ancestor `{borrowed_root}` is borrowed")
                };
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot move owned buffer `{source_name}` {conflict}"
                )));
            }
            if source.element_type != element_type {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned buffer `{owner_name}` expects elements of `{}`, but `{}` stores `{}`",
                    element_type.name(),
                    source_name,
                    source.element_type.name()
                )));
            }
            let moved = OwnedBuffer {
                base: source.base,
                length: source.length,
                allocator_id: source.allocator_id,
                element_type: source.element_type,
                state: OwnedBufferState::Live,
                scope_depth,
            };
            owned_buffers
                .get_mut(&source_name)
                .expect("owned source was just resolved")
                .state = OwnedBufferState::Moved;
            Ok(moved)
        }
        callee_name => {
            let abi = functions.get(callee_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} owned buffer `{owner_name}` cannot be initialized by unknown function `{callee_name}`"
                ))
            })?;
            let MachineResult::Owned(result_layout) = abi.result else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned buffer `{owner_name}` cannot be initialized by `{callee_name}` because it does not return ownership"
                )));
            };
            if result_layout.element_type != element_type {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned buffer `{owner_name}` expects elements of `{}`, but `{callee_name}` returns `[{}]`",
                    element_type.name(),
                    result_layout.element_type.name()
                )));
            }
            let mut arguments = lower_call_arguments_with_ownership(
                builder,
                module,
                functions,
                locals,
                stack_slots,
                references,
                borrow_states,
                owned_buffers,
                call,
                abi,
                machine_contract,
                memory_enabled,
            )?;
            let (result_slot, result_out) = create_owned_buffer_result_record(builder, module);
            arguments.push(result_out);
            let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
            let call_inst = builder.ins().call(local_callee, &arguments);
            debug_assert!(builder.inst_results(call_inst).is_empty());
            Ok(load_owned_buffer_result_record(
                builder,
                module,
                result_slot,
                element_type,
                scope_depth,
            ))
        }
    }
}

fn call_consumes_owned_arguments(
    call: &CallExpression,
    functions: &HashMap<String, TypedFunctionAbi>,
) -> bool {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return false;
    };
    functions.get(&callee.name).is_some_and(|abi| {
        abi.params.iter().any(|parameter| {
            matches!(
                parameter,
                MachineParameter::Owned { .. } | MachineParameter::Aggregate { .. }
            )
        })
    })
}

fn call_requires_owned_state(
    call: &CallExpression,
    functions: &HashMap<String, TypedFunctionAbi>,
) -> bool {
    call_consumes_owned_arguments(call, functions)
        || functions
            .get(match call.callee.as_ref() {
                AstNode::Identifier(identifier) => &identifier.name,
                _ => return false,
            })
            .is_some_and(|abi| {
                abi.params
                    .iter()
                    .any(|parameter| matches!(parameter, MachineParameter::Slice { .. }))
            })
}

#[allow(clippy::too_many_arguments)]
fn lower_scalar_call_with_ownership(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    call: &CallExpression,
    expected: MachineType,
    context: &str,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedValue, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} supports calls only to named HoloScript functions"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} calls unknown function `{}`",
            callee.name
        ))
    })?;
    let result_type = match abi.result {
        MachineResult::Scalar(result_type) => result_type,
        MachineResult::AggregateReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed aggregate reference; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::AggregateSubobjectReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed aggregate subobject; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::ScalarReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed scalar-field reference; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::SliceElementReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed slice-element reference; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::AggregateBufferElementReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed aggregate-buffer element; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::AggregateBufferSliceReference { .. }
        | MachineResult::AggregateBufferWholeSliceReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed aggregate-buffer slice; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::SliceReference { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} `{}` returns a borrowed slice reference; bind it to a typed reference local",
                callee.name
            )));
        }
        MachineResult::Owned(_) | MachineResult::Aggregate { .. } => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} {context} expects `{}`, but `{}` returns ownership; bind the result to an owned `[T]` local",
                expected.name(),
                callee.name
            )));
        }
    };
    if result_type != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but `{}` returns `{}`; implicit coercions are forbidden",
            expected.name(),
            callee.name,
            result_type.name()
        )));
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    Ok(TypedValue {
        value: builder.inst_results(call_inst)[0],
        machine_type: result_type,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_call_arguments_with_ownership(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    call: &CallExpression,
    abi: &TypedFunctionAbi,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Vec<Value>, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} supports calls only to named HoloScript functions"
        )));
    };
    if call.arguments.len() != abi.params.len() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} call to `{}` expects {} arguments, found {}",
            callee.name,
            abi.params.len(),
            call.arguments.len()
        )));
    }
    let mut arguments = Vec::with_capacity(call.arguments.len() * 3);
    let mut call_borrows = HashMap::new();
    for (index, (argument, parameter)) in call
        .arguments
        .iter()
        .zip(abi.params.iter().cloned())
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
                ..
            } => {
                let (base, length) = lower_borrowed_slice_call_argument(
                    builder,
                    module,
                    functions,
                    locals,
                    stack_slots,
                    references,
                    Some(owned_buffers),
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
            MachineParameter::AggregateReference {
                layout_name,
                mutable,
                ..
            } => arguments.push(lower_borrowed_aggregate_call_argument(
                builder,
                module,
                stack_slots,
                references,
                borrow_states,
                &mut call_borrows,
                argument,
                &layout_name,
                mutable,
                index,
                &callee.name,
                machine_contract,
            )?),
            MachineParameter::Owned { element_type } => {
                let transferred = lower_owned_call_argument(
                    owned_buffers,
                    borrow_states,
                    argument,
                    element_type,
                    index,
                    &callee.name,
                    machine_contract,
                )?;
                arguments.push(transferred.base);
                arguments.push(transferred.length);
                arguments.push(transferred.allocator_id);
            }
            MachineParameter::Aggregate { layout_fingerprint } => {
                let context = format!("argument {} to `{}`", index + 1, callee.name);
                let PreparedAggregateTransfer {
                    source_name,
                    source,
                    owned_leaves: transferred,
                } = prepare_affine_aggregate_transfer(
                    module,
                    stack_slots,
                    owned_buffers,
                    borrow_states,
                    argument,
                    layout_fingerprint,
                    &context,
                    machine_contract,
                )?;
                let siblings = call_borrows
                    .entry(CallBorrowRoot::Stack(source_name.clone()))
                    .or_default();
                if siblings.shared > 0 || siblings.exclusive {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} cannot move aggregate `{source_name}` for argument {} to `{}` while a sibling borrow exists",
                        index + 1,
                        callee.name
                    )));
                }
                siblings.aggregate_moved = true;
                let StackSlotLayout::Aggregate(layout) = &source.layout else {
                    unreachable!("aggregate transfer preparation validates aggregate storage")
                };
                arguments.push(create_aggregate_ffi_record(
                    builder,
                    module,
                    source.slot,
                    0,
                    layout,
                ));
                commit_affine_aggregate_transfer(
                    &source_name,
                    &transferred,
                    owned_buffers,
                    borrow_states,
                );
            }
        }
    }
    Ok(arguments)
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_aggregate_call_argument(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call_borrows: &mut HashMap<CallBorrowRoot, BorrowState>,
    argument: &AstNode,
    expected_layout_name: &str,
    mutable: bool,
    argument_index: usize,
    callee_name: &str,
    machine_contract: &str,
) -> Result<Value, NativeCompileError> {
    if !aggregate_reference_calls_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} does not enable aggregate-reference call arguments"
        )));
    }
    if let AstNode::Identifier(identifier) = argument {
        let reference = references.get(&identifier.name).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate argument {} to `{callee_name}` requires a direct borrow or named aggregate reference; `{}` is not a reference",
                argument_index + 1,
                identifier.name
            ))
        })?;
        let TypedReferenceLayout::Aggregate { layout, storage } = &reference.layout else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate argument {} to `{callee_name}` requires an aggregate reference; `{}` has incompatible reference storage",
                argument_index + 1,
                identifier.name
            )));
        };
        if layout.name != expected_layout_name {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate argument {} to `{callee_name}` expects `{expected_layout_name}`, but reference `{}` points to `{}`",
                argument_index + 1,
                identifier.name,
                layout.name
            )));
        }
        if mutable && !reference.mutable {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably forward immutable aggregate reference `{}` to argument {} of `{callee_name}`",
                identifier.name,
                argument_index + 1
            )));
        }
        let (root, base) = match storage {
            AggregateReferenceStorage::Stack { slot_name }
            | AggregateReferenceStorage::ReturnedStack { slot_name } => {
                let active = borrow_states.get(slot_name).copied().unwrap_or_default();
                let lease_is_active = if reference.mutable {
                    active.exclusive
                } else {
                    active.shared > 0 && !active.exclusive
                };
                if !lease_is_active {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{}` no longer owns a valid borrow lease",
                        identifier.name
                    )));
                }
                let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{}` lost stack-slot provenance `{slot_name}`",
                        identifier.name
                    ))
                })?;
                let pointer_type = module.target_config().pointer_type();
                (
                    CallBorrowRoot::Stack(slot_name.clone()),
                    builder.ins().stack_addr(pointer_type, stack_slot.slot, 0),
                )
            }
            AggregateReferenceStorage::Parameter { base } => {
                let active = borrow_states
                    .get(&identifier.name)
                    .copied()
                    .unwrap_or_default();
                if mutable && (active.shared > 0 || active.exclusive) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} cannot mutably forward aggregate reference parameter `{}` while an active reborrow exists",
                        identifier.name
                    )));
                }
                if !mutable && active.exclusive {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} cannot forward aggregate reference parameter `{}` while an exclusive reborrow is active",
                        identifier.name
                    )));
                }
                (CallBorrowRoot::Parameter, *base)
            }
            AggregateReferenceStorage::ParameterReborrow { base, root_name } => {
                let active = borrow_states.get(root_name).copied().unwrap_or_default();
                let lease_is_active = if reference.mutable {
                    active.exclusive
                } else {
                    active.shared > 0 && !active.exclusive
                };
                if !lease_is_active {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate parameter reborrow `{}` no longer owns a valid borrow lease",
                        identifier.name
                    )));
                }
                (CallBorrowRoot::Parameter, *base)
            }
            AggregateReferenceStorage::ReturnedSubobject { base, root_name } => {
                let active = borrow_states.get(root_name).copied().unwrap_or_default();
                let lease_is_active = if reference.mutable {
                    active.exclusive
                } else {
                    active.shared > 0 && !active.exclusive
                };
                if !lease_is_active {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} returned aggregate subobject reference `{}` no longer owns a valid whole-root borrow lease",
                        identifier.name
                    )));
                }
                let root = if stack_slots.contains_key(root_name) {
                    CallBorrowRoot::Stack(root_name.clone())
                } else {
                    CallBorrowRoot::Parameter
                };
                (root, *base)
            }
        };
        acquire_aggregate_call_borrow(
            call_borrows,
            root,
            mutable,
            &identifier.name,
            callee_name,
            machine_contract,
        )?;
        return Ok(base);
    }

    let AstNode::UnaryExpression(borrow) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` requires a direct complete-root borrow or named aggregate reference",
            argument_index + 1
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` expects `{expected_operator}`, found `{}`",
            argument_index + 1,
            borrow.operator
        )));
    }
    let AstNode::Identifier(root) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` requires a complete named aggregate root",
            argument_index + 1
        )));
    };
    if references.contains_key(&root.name) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` cannot directly reborrow reference `{}`; pass the named reference to forward it",
            argument_index + 1,
            root.name
        )));
    }
    let stack_slot = stack_slots.get(&root.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` requires a declared aggregate slot; `{}` is not addressable",
            argument_index + 1,
            root.name
        ))
    })?;
    let StackSlotLayout::Aggregate(layout) = &stack_slot.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` requires aggregate storage; `{}` is not an aggregate",
            argument_index + 1,
            root.name
        )));
    };
    if layout.name != expected_layout_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate argument {} to `{callee_name}` expects `{expected_layout_name}`, but aggregate `{}` stores `{}`",
            argument_index + 1,
            root.name,
            layout.name
        )));
    }

    let active = borrow_states.get(&root.name).copied().unwrap_or_default();
    let siblings = call_borrows
        .entry(CallBorrowRoot::Stack(root.name.clone()))
        .or_default();
    if siblings.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot borrow aggregate `{}` for call to `{callee_name}` after a sibling move",
            root.name
        )));
    }
    if active.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot borrow aggregate `{}` for call to `{callee_name}` after move",
            root.name
        )));
    }
    if mutable {
        if active.exclusive || active.shared > 0 || siblings.exclusive || siblings.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably borrow aggregate `{}` for call to `{callee_name}` because an active or sibling borrow exists",
                root.name
            )));
        }
        siblings.exclusive = true;
    } else {
        if active.exclusive || siblings.exclusive {
            let source = if siblings.exclusive {
                "an exclusive sibling borrow exists"
            } else {
                "an exclusive borrow is active"
            };
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably borrow aggregate `{}` for call to `{callee_name}` because {source}",
                root.name
            )));
        }
        siblings.shared += 1;
    }
    let pointer_type = module.target_config().pointer_type();
    Ok(builder.ins().stack_addr(pointer_type, stack_slot.slot, 0))
}

fn acquire_aggregate_call_borrow(
    call_borrows: &mut HashMap<CallBorrowRoot, BorrowState>,
    root: CallBorrowRoot,
    mutable: bool,
    reference_name: &str,
    callee_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let siblings = call_borrows.entry(root).or_default();
    if siblings.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot forward aggregate reference `{reference_name}` to `{callee_name}` after a sibling move"
        )));
    }
    if mutable {
        if siblings.exclusive || siblings.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably forward aggregate reference `{reference_name}` to `{callee_name}` because a sibling aggregate argument has the same or potentially aliasing provenance"
            )));
        }
        siblings.exclusive = true;
    } else {
        if siblings.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably forward aggregate reference `{reference_name}` to `{callee_name}` because a sibling mutable aggregate argument has the same or potentially aliasing provenance"
            )));
        }
        siblings.shared += 1;
    }
    Ok(())
}

fn lower_owned_call_argument(
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    borrow_states: &HashMap<String, BorrowState>,
    argument: &AstNode,
    expected_element: MachineType,
    argument_index: usize,
    callee_name: &str,
    machine_contract: &str,
) -> Result<OwnedBuffer, NativeCompileError> {
    let AstNode::CallExpression(transfer) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned argument {} to `{callee_name}` must use explicit `move(owner)`",
            argument_index + 1
        )));
    };
    let AstNode::Identifier(move_name) = transfer.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned argument {} to `{callee_name}` must use explicit `move(owner)`",
            argument_index + 1
        )));
    };
    if move_name.name != "move" || transfer.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned argument {} to `{callee_name}` must use explicit `move(owner)`",
            argument_index + 1
        )));
    }
    let Some(owner_name) = owned_buffer_path(&transfer.arguments[0]) else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned argument {} to `{callee_name}` requires a named owner or owned aggregate field",
            argument_index + 1
        )));
    };
    let owner = owned_buffers.get(&owner_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} owned argument {} to `{callee_name}` references unknown owner `{}`",
            argument_index + 1,
            owner_name
        ))
    })?;
    require_live_owned_transfer(
        owner,
        borrow_states,
        &owner_name,
        expected_element,
        &format!("argument {} to `{callee_name}`", argument_index + 1),
        machine_contract,
    )?;
    let transferred = owner.clone();
    owned_buffers
        .get_mut(&owner_name)
        .expect("owned call argument was just resolved")
        .state = OwnedBufferState::Moved;
    Ok(transferred)
}

fn lower_owned_buffer_return(
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    borrow_states: &HashMap<String, BorrowState>,
    argument: &AstNode,
    expected_element: MachineType,
    function_name: &str,
    machine_contract: &str,
) -> Result<OwnedBuffer, NativeCompileError> {
    let AstNode::CallExpression(transfer) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned return from `{function_name}` must use explicit `return move(owner)`"
        )));
    };
    let AstNode::Identifier(move_name) = transfer.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned return from `{function_name}` must use explicit `return move(owner)`"
        )));
    };
    if move_name.name != "move" || transfer.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned return from `{function_name}` must use explicit `return move(owner)`"
        )));
    }
    let Some(owner_name) = owned_buffer_path(&transfer.arguments[0]) else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned return from `{function_name}` requires a named owner or owned aggregate field"
        )));
    };
    let owner = owned_buffers.get(&owner_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} owned return from `{function_name}` references unknown owner `{}`",
            owner_name
        ))
    })?;
    require_live_owned_transfer(
        owner,
        borrow_states,
        &owner_name,
        expected_element,
        &format!("return from `{function_name}`"),
        machine_contract,
    )?;
    let transferred = owner.clone();
    owned_buffers
        .get_mut(&owner_name)
        .expect("owned return was just resolved")
        .state = OwnedBufferState::Moved;
    Ok(transferred)
}

fn require_live_owned_transfer(
    owner: &OwnedBuffer,
    borrow_states: &HashMap<String, BorrowState>,
    owner_name: &str,
    expected_element: MachineType,
    context: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    match owner.state {
        OwnedBufferState::Live => {}
        OwnedBufferState::Moved => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} owned buffer `{owner_name}` was already moved before {context}"
            )));
        }
        OwnedBufferState::Dropped => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} owned buffer `{owner_name}` was already dropped before {context}"
            )));
        }
    }
    if let Some(borrowed_root) = path_has_conflicting_borrow(borrow_states, owner_name, true) {
        let conflict = if borrowed_root == owner_name {
            "while a borrow is active".to_string()
        } else {
            format!("while aggregate ancestor `{borrowed_root}` is borrowed")
        };
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot move owned buffer `{owner_name}` for {context} {conflict}"
        )));
    }
    if owner.element_type != expected_element {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `[{}]`, but owned buffer `{owner_name}` stores `[{}]`",
            expected_element.name(),
            owner.element_type.name()
        )));
    }
    Ok(())
}

fn emit_owned_buffer_allocation(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    allocator: AllocatorAbi,
    length: Value,
    fill: Value,
    element_type: MachineType,
) -> Value {
    let negative = builder.ins().icmp_imm(IntCC::SignedLessThan, length, 0);
    builder.ins().trapnz(negative, TrapCode::unwrap_user(1));

    let pointer_type = module.target_config().pointer_type();
    if let Some(max_length) = runtime_slice_start_limit(pointer_type, element_type.stack_size(), 0)
    {
        let too_large =
            builder
                .ins()
                .icmp_imm(IntCC::UnsignedGreaterThan, length, i64::from(max_length));
        builder.ins().trapnz(too_large, TrapCode::unwrap_user(1));
    }
    let pointer_length = if pointer_type == types::I32 {
        length
    } else {
        builder.ins().uextend(pointer_type, length)
    };
    let bytes = builder
        .ins()
        .imul_imm(pointer_length, i64::from(element_type.stack_size()));
    let zero_bytes = builder.ins().icmp_imm(IntCC::Equal, bytes, 0);
    let one = builder.ins().iconst(pointer_type, 1);
    let allocation_size = builder.ins().select(zero_bytes, one, bytes);
    let allocate = module.declare_func_in_func(allocator.allocate, builder.func);
    let allocation = builder.ins().call(allocate, &[allocation_size]);
    let base = builder.inst_results(allocation)[0];
    let allocation_failed = builder.ins().icmp_imm(IntCC::Equal, base, 0);
    builder
        .ins()
        .trapnz(allocation_failed, TrapCode::unwrap_user(2));

    let header = builder.create_block();
    let body = builder.create_block();
    let exit = builder.create_block();
    builder.append_block_param(header, types::I32);
    let zero = builder.ins().iconst(types::I32, 0);
    builder.ins().jump(header, &[zero.into()]);

    builder.switch_to_block(header);
    let index = builder.block_params(header)[0];
    let has_next = builder.ins().icmp(IntCC::SignedLessThan, index, length);
    builder.ins().brif(has_next, body, &[], exit, &[]);

    builder.switch_to_block(body);
    let address = offset_runtime_slice_base(
        builder,
        pointer_type,
        base,
        index,
        element_type.stack_size(),
    );
    builder.ins().store(MemFlags::new(), fill, address, 0);
    let next = builder.ins().iadd_imm(index, 1);
    builder.ins().jump(header, &[next.into()]);

    builder.switch_to_block(exit);
    base
}

#[allow(clippy::too_many_arguments)]
fn lower_owned_buffer_drop(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    call: &CallExpression,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    borrow_states: &HashMap<String, BorrowState>,
    allocator: AllocatorAbi,
    machine_contract: &str,
    scope_depth: usize,
) -> Result<(), NativeCompileError> {
    if call.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `drop` expects exactly one owned buffer, found {} arguments",
            call.arguments.len()
        )));
    }
    let Some(owner_name) = owned_buffer_path(&call.arguments[0]) else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `drop` requires a named owned buffer or owned aggregate field"
        )));
    };
    let owner = owned_buffers.get(&owner_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `drop` references unknown owned buffer `{}`",
            owner_name
        ))
    })?;
    if owner.scope_depth != scope_depth {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} owned buffer `{}` cannot be dropped from a nested lexical scope",
            owner_name
        )));
    }
    match owner.state {
        OwnedBufferState::Live => {}
        OwnedBufferState::Moved => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} owned buffer `{}` cannot be dropped after move",
                owner_name
            )));
        }
        OwnedBufferState::Dropped => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} owned buffer `{}` cannot be dropped twice",
                owner_name
            )));
        }
    }
    if let Some(borrowed_root) = path_has_conflicting_borrow(borrow_states, &owner_name, true) {
        let conflict = if borrowed_root == owner_name {
            "while a borrow is active".to_string()
        } else {
            format!("while aggregate ancestor `{borrowed_root}` is borrowed")
        };
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot drop owned buffer `{owner_name}` {conflict}"
        )));
    }
    emit_owned_buffer_deallocation(builder, module, allocator, owner);
    owned_buffers
        .get_mut(&owner_name)
        .expect("owned buffer was just resolved")
        .state = OwnedBufferState::Dropped;
    Ok(())
}

fn emit_owned_buffer_deallocation(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    allocator: AllocatorAbi,
    owner: &OwnedBuffer,
) {
    emit_owned_buffer_abi_guards(
        builder,
        module,
        owner.base,
        owner.length,
        owner.allocator_id,
        owner.element_type,
    );
    let deallocate = module.declare_func_in_func(allocator.deallocate, builder.func);
    builder.ins().call(deallocate, &[owner.base]);
}

fn emit_owned_buffer_cleanup(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    owned_buffers: &HashMap<String, OwnedBuffer>,
    owner_order: &[String],
    allocator: AllocatorAbi,
) {
    emit_owned_buffer_cleanup_for_order(builder, module, owned_buffers, owner_order, allocator);
}

fn emit_owned_buffer_cleanup_for_order(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    owned_buffers: &HashMap<String, OwnedBuffer>,
    owner_order: &[String],
    allocator: AllocatorAbi,
) {
    let states = owned_buffers
        .iter()
        .map(|(name, owner)| (name.clone(), owner.state))
        .collect::<HashMap<_, _>>();
    for owner_name in owned_buffer_cleanup_order(&states, owner_order) {
        let owner = owned_buffers
            .get(&owner_name)
            .expect("owned cleanup order must reference a declared owner");
        emit_owned_buffer_deallocation(builder, module, allocator, owner);
    }
}

fn owned_buffer_cleanup_order(
    states: &HashMap<String, OwnedBufferState>,
    owner_order: &[String],
) -> Vec<String> {
    owner_order
        .iter()
        .rev()
        .filter(|name| states.get(*name) == Some(&OwnedBufferState::Live))
        .cloned()
        .collect()
}

#[cfg(test)]
mod owned_buffer_tests {
    use super::*;

    #[test]
    fn cleanup_is_reverse_declaration_order_and_skips_consumed_owners() {
        let states = HashMap::from([
            ("first".to_string(), OwnedBufferState::Live),
            ("moved".to_string(), OwnedBufferState::Moved),
            ("dropped".to_string(), OwnedBufferState::Dropped),
            ("last".to_string(), OwnedBufferState::Live),
        ]);
        let order = vec![
            "first".to_string(),
            "moved".to_string(),
            "dropped".to_string(),
            "last".to_string(),
        ];

        assert_eq!(
            owned_buffer_cleanup_order(&states, &order),
            vec!["last".to_string(), "first".to_string()]
        );
    }
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
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &[String],
    allocator: Option<AllocatorAbi>,
    if_node: &holoscript_wasm::ast::IfNode,
    spec: &TypedFunctionSpec<'_>,
    owned_return_out: Option<Value>,
    machine_contract: &str,
    memory_enabled: bool,
    scope_depth: usize,
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

    let mut consequent_locals = locals.clone();
    let mut consequent_stack_slots = stack_slots.clone();
    let mut consequent_references = references.clone();
    let mut consequent_borrow_states = borrow_states.clone();
    let mut consequent_owned_buffers = owned_buffers.clone();
    let mut consequent_owner_order = owner_order.to_vec();
    builder.switch_to_block(consequent_block);
    let consequent_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        &mut consequent_locals,
        &mut consequent_stack_slots,
        &mut consequent_references,
        &mut consequent_borrow_states,
        &mut consequent_owned_buffers,
        &mut consequent_owner_order,
        allocator,
        &if_node.consequent,
        spec,
        owned_return_out,
        machine_contract,
        memory_enabled,
        true,
        scope_depth + 1,
    )?;
    if consequent_outcome == FlowOutcome::FallsThrough {
        builder.ins().jump(merge_block, &[]);
    }

    let mut alternate_locals = locals.clone();
    let mut alternate_stack_slots = stack_slots.clone();
    let mut alternate_references = references.clone();
    let mut alternate_borrow_states = borrow_states.clone();
    let mut alternate_owned_buffers = owned_buffers.clone();
    let mut alternate_owner_order = owner_order.to_vec();
    builder.switch_to_block(alternate_block);
    let alternate = if_node.alternate.as_deref().unwrap_or(&[]);
    let alternate_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        &mut alternate_locals,
        &mut alternate_stack_slots,
        &mut alternate_references,
        &mut alternate_borrow_states,
        &mut alternate_owned_buffers,
        &mut alternate_owner_order,
        allocator,
        alternate,
        spec,
        owned_return_out,
        machine_contract,
        memory_enabled,
        true,
        scope_depth + 1,
    )?;
    if alternate_outcome == FlowOutcome::FallsThrough {
        builder.ins().jump(merge_block, &[]);
    }

    match (consequent_outcome, alternate_outcome) {
        (FlowOutcome::Returns, FlowOutcome::Returns) => Ok(FlowOutcome::Returns),
        (FlowOutcome::Returns, FlowOutcome::FallsThrough) => {
            apply_owned_branch_state(owned_buffers, &alternate_owned_buffers);
            apply_aggregate_move_branch_state(borrow_states, &alternate_borrow_states);
            builder.switch_to_block(merge_block);
            Ok(FlowOutcome::FallsThrough)
        }
        (FlowOutcome::FallsThrough, FlowOutcome::Returns) => {
            apply_owned_branch_state(owned_buffers, &consequent_owned_buffers);
            apply_aggregate_move_branch_state(borrow_states, &consequent_borrow_states);
            builder.switch_to_block(merge_block);
            Ok(FlowOutcome::FallsThrough)
        }
        (FlowOutcome::FallsThrough, FlowOutcome::FallsThrough) => {
            join_owned_branch_states(
                owned_buffers,
                &consequent_owned_buffers,
                &alternate_owned_buffers,
                &spec.node.name,
                machine_contract,
            )?;
            join_aggregate_move_branch_states(
                borrow_states,
                &consequent_borrow_states,
                &alternate_borrow_states,
                &spec.node.name,
                machine_contract,
            )?;
            builder.switch_to_block(merge_block);
            Ok(FlowOutcome::FallsThrough)
        }
    }
}

fn apply_owned_branch_state(
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    branch: &HashMap<String, OwnedBuffer>,
) {
    for (name, owner) in owned_buffers {
        owner.state = branch
            .get(name)
            .expect("branch ownership map must retain outer owners")
            .state;
    }
}

fn apply_aggregate_move_branch_state(
    borrow_states: &mut HashMap<String, BorrowState>,
    branch: &HashMap<String, BorrowState>,
) {
    for state in borrow_states.values_mut() {
        state.aggregate_moved = false;
    }
    for (name, branch_state) in branch {
        if branch_state.aggregate_moved {
            borrow_states
                .entry(name.clone())
                .or_default()
                .aggregate_moved = true;
        }
    }
}

fn join_aggregate_move_branch_states(
    borrow_states: &mut HashMap<String, BorrowState>,
    consequent: &HashMap<String, BorrowState>,
    alternate: &HashMap<String, BorrowState>,
    function_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let names = consequent
        .keys()
        .chain(alternate.keys())
        .collect::<HashSet<_>>();
    for name in names {
        let consequent_moved = consequent
            .get(name)
            .is_some_and(|state| state.aggregate_moved);
        let alternate_moved = alternate
            .get(name)
            .is_some_and(|state| state.aggregate_moved);
        if consequent_moved != alternate_moved {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} conditional aggregate-move join for `{name}` in function `{function_name}` disagrees between branches"
            )));
        }
        if consequent_moved {
            borrow_states
                .entry(name.clone())
                .or_default()
                .aggregate_moved = true;
        }
    }
    Ok(())
}

fn join_owned_branch_states(
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    consequent: &HashMap<String, OwnedBuffer>,
    alternate: &HashMap<String, OwnedBuffer>,
    function_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    for (name, owner) in owned_buffers {
        let consequent_state = consequent
            .get(name)
            .expect("consequent ownership map must retain outer owners")
            .state;
        let alternate_state = alternate
            .get(name)
            .expect("alternate ownership map must retain outer owners")
            .state;
        if consequent_state != alternate_state {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} conditional ownership join for `{name}` in function `{function_name}` disagrees: consequent is {consequent_state:?}, alternate is {alternate_state:?}"
            )));
        }
        owner.state = consequent_state;
    }
    Ok(())
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
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &[String],
    allocator: Option<AllocatorAbi>,
    while_node: &holoscript_wasm::ast::WhileNode,
    spec: &TypedFunctionSpec<'_>,
    owned_return_out: Option<Value>,
    machine_contract: &str,
    memory_enabled: bool,
    scope_depth: usize,
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

    let mut body_locals = locals.clone();
    let mut body_stack_slots = stack_slots.clone();
    let mut body_references = references.clone();
    let mut body_borrow_states = borrow_states.clone();
    let mut body_owned_buffers = owned_buffers.clone();
    let mut body_owner_order = owner_order.to_vec();
    builder.switch_to_block(body_block);
    let body_outcome = lower_scoped_statements(
        builder,
        module,
        functions,
        aggregate_layouts,
        &mut body_locals,
        &mut body_stack_slots,
        &mut body_references,
        &mut body_borrow_states,
        &mut body_owned_buffers,
        &mut body_owner_order,
        allocator,
        &while_node.body,
        spec,
        owned_return_out,
        machine_contract,
        memory_enabled,
        true,
        scope_depth + 1,
    )?;
    if body_outcome == FlowOutcome::FallsThrough {
        for (name, owner) in owned_buffers.iter() {
            let body_state = body_owned_buffers
                .get(name)
                .expect("loop ownership map must retain outer owners")
                .state;
            if owner.state != body_state {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} loop body changes ownership of `{name}` in function `{}` and could repeat the transfer",
                    spec.node.name
                )));
            }
        }
        let aggregate_state_names = borrow_states
            .keys()
            .chain(body_borrow_states.keys())
            .collect::<HashSet<_>>();
        for name in aggregate_state_names {
            let before = borrow_states
                .get(name)
                .is_some_and(|state| state.aggregate_moved);
            let after = body_borrow_states
                .get(name)
                .is_some_and(|state| state.aggregate_moved);
            if before != after {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} loop body changes affine aggregate state of `{name}` in function `{}` and could repeat the transfer",
                    spec.node.name
                )));
            }
        }
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
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &mut Vec<String>,
    allocator: Option<AllocatorAbi>,
    scope: &holoscript_wasm::ast::LexicalScopeNode,
    spec: &TypedFunctionSpec<'_>,
    owned_return_out: Option<Value>,
    machine_contract: &str,
    memory_enabled: bool,
    scope_depth: usize,
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
        owned_buffers,
        owner_order,
        allocator,
        &scope.body,
        spec,
        owned_return_out,
        machine_contract,
        memory_enabled,
        control_flow_enabled(machine_contract),
        scope_depth + 1,
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
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    owner_order: &mut Vec<String>,
    allocator: Option<AllocatorAbi>,
    statements: &[AstNode],
    spec: &TypedFunctionSpec<'_>,
    owned_return_out: Option<Value>,
    machine_contract: &str,
    memory_enabled: bool,
    allow_return: bool,
    scope_depth: usize,
) -> Result<FlowOutcome, NativeCompileError> {
    let outer_locals = locals.keys().cloned().collect::<HashSet<_>>();
    let outer_stack_slots = stack_slots.keys().cloned().collect::<HashSet<_>>();
    let outer_references = references.keys().cloned().collect::<HashSet<_>>();
    let outer_parameter_reborrow_roots = references
        .values()
        .filter_map(TypedReference::parameter_reborrow_root)
        .map(str::to_string)
        .collect::<HashSet<_>>();
    let outer_owned_buffers = owned_buffers.keys().cloned().collect::<HashSet<_>>();
    let outer_owner_order_len = owner_order.len();
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
        owned_buffers,
        owner_order,
        allocator,
        statements,
        spec,
        owned_return_out,
        machine_contract,
        memory_enabled,
        allow_return,
        scope_depth,
    )?;

    if outcome == FlowOutcome::FallsThrough {
        if let Some(allocator) = allocator {
            emit_owned_buffer_cleanup_for_order(
                builder,
                module,
                owned_buffers,
                &owner_order[outer_owner_order_len..],
                allocator,
            );
        }
    }
    for reference in scoped_borrow_leases.iter().rev() {
        release_borrow(reference, borrow_states, machine_contract)?;
    }
    locals.retain(|name, _| outer_locals.contains(name));
    references.retain(|name, _| outer_references.contains(name));
    stack_slots.retain(|name, _| outer_stack_slots.contains(name));
    owned_buffers.retain(|name, _| outer_owned_buffers.contains(name));
    owner_order.truncate(outer_owner_order_len);
    borrow_states.retain(|slot_name, state| {
        (outer_stack_slots.contains(slot_name)
            || outer_owned_buffers.contains(slot_name)
            || outer_parameter_reborrow_roots.contains(slot_name))
            && (state.shared > 0 || state.exclusive || state.aggregate_moved)
    });
    let borrow_names = borrow_states
        .keys()
        .chain(outer_borrow_states.keys())
        .collect::<HashSet<_>>();
    let alias_state_changed = borrow_names.into_iter().any(|name| {
        let current = borrow_states.get(name).copied().unwrap_or_default();
        let outer = outer_borrow_states.get(name).copied().unwrap_or_default();
        current.shared != outer.shared || current.exclusive != outer.exclusive
    });
    if alias_state_changed {
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
    let slot_name = reference.borrow_root().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} attempted to release a reference without a lexical borrow root"
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
        state.shared == 0 && !state.exclusive && !state.aggregate_moved
    };
    if remove_state {
        borrow_states.remove(slot_name);
    }
    Ok(())
}

fn validate_reference_lease(
    reference: &TypedReference,
    reference_name: &str,
    borrow_states: &HashMap<String, BorrowState>,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let Some(root_name) = reference.borrow_root() else {
        return Ok(());
    };
    let provenance = match &reference.layout {
        TypedReferenceLayout::ReturnedScalar {
            source_layout_fingerprint,
            field_offset,
            ..
        }
        | TypedReferenceLayout::ReturnedAggregateBufferElement {
            source_layout_fingerprint,
            field_offset,
            ..
        } => format!(
            " (aggregate ABI {source_layout_fingerprint:#010x}, field offset {field_offset})"
        ),
        _ => String::new(),
    };
    let state = borrow_states.get(root_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` lost its borrow lease for root `{root_name}`{provenance}"
        ))
    })?;
    let lease_is_active = if reference.mutable {
        state.exclusive
    } else {
        state.shared > 0 && !state.exclusive
    };
    if !lease_is_active {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` no longer owns a valid borrow lease{provenance}"
        )));
    }
    Ok(())
}

#[derive(Clone, Copy)]
struct AggregateScalarProjection {
    machine_type: MachineType,
    value_offset: u32,
    known_offset: Option<u32>,
    reason_offset: Option<u32>,
}

fn resolve_aggregate_scalar_projection_for_access(
    root_layout: &AggregateLayout,
    field_names: &[&str],
    path: &str,
    machine_contract: &str,
) -> Result<AggregateScalarProjection, NativeCompileError> {
    if field_names.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate `{}` requires a scalar field projection",
            root_layout.name
        )));
    }
    let mut layout = root_layout;
    let mut offset = 0_u32;
    for (index, field_name) in field_names.iter().enumerate() {
        let field = layout
            .fields
            .iter()
            .find(|field| field.name == *field_name)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate `{}` has no field `{field_name}`",
                    layout.name
                ))
            })?;
        offset = offset.checked_add(field.offset).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate field path `{path}` exceeds addressable native stack offsets"
            ))
        })?;
        let is_final = index + 1 == field_names.len();
        match (&field.field_type, is_final) {
            (AggregateFieldType::Scalar(machine_type), true) => {
                return Ok(AggregateScalarProjection {
                    machine_type: *machine_type,
                    value_offset: offset,
                    known_offset: None,
                    reason_offset: None,
                });
            }
            (AggregateFieldType::UncertainScalar(uncertain), true) => {
                return Ok(AggregateScalarProjection {
                    machine_type: uncertain.value_type,
                    value_offset: offset + UncertainScalarLayout::VALUE_OFFSET,
                    known_offset: Some(offset + UncertainScalarLayout::KNOWN_OFFSET),
                    reason_offset: Some(offset + UncertainScalarLayout::REASON_OFFSET),
                });
            }
            (AggregateFieldType::Owned(_), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} owned aggregate field `{path}` must be accessed with `move`, a borrow, or `drop`"
                )));
            }
            (AggregateFieldType::Aggregate(_), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate field `{path}` requires a scalar field projection"
                )));
            }
            (AggregateFieldType::Aggregate(nested), false) => layout = nested,
            (
                AggregateFieldType::Scalar(_)
                | AggregateFieldType::UncertainScalar(_)
                | AggregateFieldType::Owned(_),
                false,
            ) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} field path `{path}` projects through non-aggregate field `{field_name}`"
                )));
            }
        }
    }
    unreachable!("non-empty aggregate field projections always return or fail")
}

fn resolve_aggregate_scalar_projection(
    root_layout: &AggregateLayout,
    field_names: &[&str],
    path: &str,
    machine_contract: &str,
) -> Result<(MachineType, u32), NativeCompileError> {
    let projection = resolve_aggregate_scalar_projection_for_access(
        root_layout,
        field_names,
        path,
        machine_contract,
    )?;
    if projection.known_offset.is_some() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} @unknown aggregate field `{path}` cannot be borrowed or read as a raw `{}`; use `isKnown({path})` to gate the action and `load({path}) ?? <fallback>` to obtain a value",
            projection.machine_type.name()
        )));
    }
    Ok((projection.machine_type, projection.value_offset))
}

fn resolve_aggregate_owned_projection(
    root_layout: &AggregateLayout,
    field_names: &[&str],
    path: &str,
    expected_type: MachineType,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    if field_names.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer element result requires an owned-buffer field path; `{path}` names the complete source root"
        )));
    }
    let mut layout = root_layout;
    let mut offset = 0_u32;
    for (index, field_name) in field_names.iter().enumerate() {
        let field = layout
            .fields
            .iter()
            .find(|field| field.name == *field_name)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate `{}` has no field `{field_name}` in path `{path}`",
                    layout.name
                ))
            })?;
        offset = offset.checked_add(field.offset).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate-buffer field path `{path}` exceeds addressable native offsets"
            ))
        })?;
        let is_final = index + 1 == field_names.len();
        match (&field.field_type, is_final) {
            (AggregateFieldType::Owned(owned), true) => {
                if owned.element_type != expected_type {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer element return expects `{}`, but field `{path}` stores `[{}]`",
                        expected_type.name(),
                        owned.element_type.name()
                    )));
                }
                return Ok(offset);
            }
            (AggregateFieldType::Scalar(machine_type), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer element return expects an owned `[{}]` field, but `{path}` stores scalar `{}`",
                    expected_type.name(),
                    machine_type.name()
                )));
            }
            (AggregateFieldType::UncertainScalar(uncertain), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer element return cannot treat @unknown field `{path}` carrying `Uncertain<{}>` as owned storage",
                    uncertain.value_type.name()
                )));
            }
            (AggregateFieldType::Aggregate(nested), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer element return expects an owned `[{}]` field, but `{path}` stores aggregate `{}`",
                    expected_type.name(),
                    nested.name
                )));
            }
            (AggregateFieldType::Aggregate(nested), false) => layout = nested,
            (
                AggregateFieldType::Scalar(_)
                | AggregateFieldType::UncertainScalar(_)
                | AggregateFieldType::Owned(_),
                false,
            ) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer path `{path}` projects through non-aggregate field `{field_name}`"
                )));
            }
        }
    }
    unreachable!("non-empty aggregate owned projections always return or fail")
}

fn resolve_named_i32_coordinate_parameter(
    function: &FunctionNode,
    index_name: &str,
    context: &str,
    machine_contract: &str,
) -> Result<usize, NativeCompileError> {
    let index_parameter = function
        .params
        .iter()
        .position(|parameter| parameter == index_name)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` {context} index `{index_name}` must be a direct function parameter",
                function.name
            ))
        })?;
    if function
        .param_types
        .get(index_parameter)
        .and_then(Option::as_deref)
        != Some("i32")
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` {context} index parameter `{index_name}` must have type `i32`",
            function.name
        )));
    }
    let index_parameter_count = function
        .param_types
        .iter()
        .filter(|annotation| annotation.as_deref() == Some("i32"))
        .count();
    if index_parameter_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` {context} requires exactly one `i32` index parameter; found {index_parameter_count}",
            function.name
        )));
    }
    Ok(index_parameter)
}

fn resolve_named_i32_range_parameters(
    function: &FunctionNode,
    start_name: &str,
    end_name: &str,
    context: &str,
    machine_contract: &str,
) -> Result<(usize, usize), NativeCompileError> {
    if start_name == end_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` {context} requires distinct start and end parameters",
            function.name
        )));
    }
    let resolve = |name: &str, coordinate: &str| {
        let parameter = function
            .params
            .iter()
            .position(|candidate| candidate == name)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} function `{}` {context} {coordinate} `{name}` must be a direct function parameter",
                    function.name
                ))
            })?;
        if function
            .param_types
            .get(parameter)
            .and_then(Option::as_deref)
            != Some("i32")
        {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` {context} {coordinate} parameter `{name}` must have type `i32`",
                function.name
            )));
        }
        Ok(parameter)
    };
    let start_parameter = resolve(start_name, "start")?;
    let end_parameter = resolve(end_name, "end")?;
    let coordinate_count = function
        .param_types
        .iter()
        .filter(|annotation| annotation.as_deref() == Some("i32"))
        .count();
    if coordinate_count != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` {context} requires exactly two `i32` range parameters; found {coordinate_count}",
            function.name
        )));
    }
    Ok((start_parameter, end_parameter))
}

fn resolve_borrowed_aggregate_buffer_whole_slice_return(
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result must return a direct owned-field borrow from source parameter `{source_name}`",
            function.name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result expects `{expected_operator}`, found `{}`",
            function.name, borrow.operator
        )));
    }
    let AstNode::MemberExpression(field) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result requires `{expected_operator} {source_name}.field`",
            function.name
        )));
    };
    if field.computed {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result requires a non-computed static owned-field path",
            function.name
        )));
    }
    let path = owned_buffer_path(borrow.argument.as_ref()).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result requires a non-computed static owned-field path rooted at `{source_name}`",
            function.name
        ))
    })?;
    let mut segments = path.split('.');
    let root_name = segments
        .next()
        .expect("aggregate owned-field paths always contain a root");
    if root_name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result must derive from source parameter `{source_name}`; found root `{root_name}`",
            function.name
        )));
    }
    let field_names = segments.collect::<Vec<_>>();
    resolve_aggregate_owned_projection(
        source_layout,
        &field_names,
        &path,
        expected_type,
        machine_contract,
    )
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_aggregate_buffer_whole_slice_return(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice forwarding requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward aggregate-buffer whole-slice result from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared aggregate-buffer whole-slice result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer slice",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Slice(callee_type) = callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer slice",
            function.name, callee.name
        )));
    };
    if callee_type != expected_type || callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result disagrees with `{}` type or mutability",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    let callee_sources = callee_function
        .params
        .iter()
        .enumerate()
        .filter_map(|(index, parameter)| {
            let annotation = callee_function
                .param_types
                .get(index)
                .and_then(Option::as_deref)?;
            let reference = ReferenceType::parse(
                annotation,
                &format!("parameter `{parameter}` in function `{}`", callee.name),
                machine_contract,
                aggregate_layouts,
            )
            .ok()??;
            if reference.lifetime.as_deref() != Some(callee_lifetime) {
                return None;
            }
            let ReferenceTarget::Aggregate(layout_name) = reference.target else {
                return None;
            };
            Some((index, parameter.as_str(), layout_name, reference.mutable))
        })
        .collect::<Vec<_>>();
    let Some((callee_source_parameter, callee_source_name, callee_layout_name, callee_mutable)) =
        callee_sources.first()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result does not identify an aggregate-reference source parameter",
            callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer whole-slice result has ambiguous aggregate provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    let callee_layout = aggregate_layouts
        .get(callee_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if callee_layout.name != source_layout.name
        || callee_layout.abi_fingerprint(pointer_type)
            != source_layout.abi_fingerprint(pointer_type)
        || *callee_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer source ABI disagrees with `{}`",
            function.name, callee.name
        )));
    }
    let source_argument = call
        .arguments
        .get(*callee_source_parameter)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
                callee.name
            ))
        })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    resolve_borrowed_aggregate_buffer_whole_slice_return(
        callee_function,
        callee_source_name,
        callee_layout,
        expected_type,
        mutable,
        machine_contract,
    )
}

fn resolve_borrowed_aggregate_buffer_subslice_return(
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<(u32, usize, usize), NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result must return a direct owned-field range borrow from source parameter `{source_name}`",
            function.name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result expects `{expected_operator}`, found `{}`",
            function.name, borrow.operator
        )));
    }
    let AstNode::MemberExpression(ranged) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires `{expected_operator} {source_name}.field[start..end]`",
            function.name
        )));
    };
    let AstNode::BinaryExpression(range) = ranged.property.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires a half-open range",
            function.name
        )));
    };
    if !ranged.computed || range.operator != ".." {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires a computed half-open range",
            function.name
        )));
    }
    let path = owned_buffer_path(ranged.object.as_ref()).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires a non-computed static owned-field path rooted at `{source_name}`",
            function.name
        ))
    })?;
    let mut segments = path.split('.');
    let root_name = segments
        .next()
        .expect("aggregate owned-field paths always contain a root");
    if root_name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result must derive from source parameter `{source_name}`; found root `{root_name}`",
            function.name
        )));
    }
    let field_names = segments.collect::<Vec<_>>();
    let field_offset = resolve_aggregate_owned_projection(
        source_layout,
        &field_names,
        &path,
        expected_type,
        machine_contract,
    )?;
    let (AstNode::Identifier(start), AstNode::Identifier(end)) =
        (range.left.as_ref(), range.right.as_ref())
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result requires exact named `i32` start and end parameters",
            function.name
        )));
    };
    let (start_parameter, end_parameter) = resolve_named_i32_range_parameters(
        function,
        &start.name,
        &end.name,
        "aggregate-buffer sub-slice result",
        machine_contract,
    )?;
    Ok((field_offset, start_parameter, end_parameter))
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_aggregate_buffer_subslice_return(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<(u32, usize, usize), NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice forwarding requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward aggregate-buffer sub-slice result from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared aggregate-buffer sub-slice result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer slice",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Slice(callee_type) = callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer slice",
            function.name, callee.name
        )));
    };
    if callee_type != expected_type || callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result disagrees with `{}` type or mutability",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    let callee_sources = callee_function
        .params
        .iter()
        .enumerate()
        .filter_map(|(index, parameter)| {
            let annotation = callee_function
                .param_types
                .get(index)
                .and_then(Option::as_deref)?;
            let reference = ReferenceType::parse(
                annotation,
                &format!("parameter `{parameter}` in function `{}`", callee.name),
                machine_contract,
                aggregate_layouts,
            )
            .ok()??;
            if reference.lifetime.as_deref() != Some(callee_lifetime) {
                return None;
            }
            let ReferenceTarget::Aggregate(layout_name) = reference.target else {
                return None;
            };
            Some((index, parameter.as_str(), layout_name, reference.mutable))
        })
        .collect::<Vec<_>>();
    let Some((callee_source_parameter, callee_source_name, callee_layout_name, callee_mutable)) =
        callee_sources.first()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result does not identify an aggregate-reference source parameter",
            callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer sub-slice result has ambiguous aggregate provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    let callee_layout = aggregate_layouts
        .get(callee_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if callee_layout.name != source_layout.name
        || callee_layout.abi_fingerprint(pointer_type)
            != source_layout.abi_fingerprint(pointer_type)
        || *callee_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer source ABI disagrees with `{}`",
            function.name, callee.name
        )));
    }
    let source_argument = call
        .arguments
        .get(*callee_source_parameter)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
                callee.name
            ))
        })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let (field_offset, callee_start_parameter, callee_end_parameter) =
        resolve_borrowed_aggregate_buffer_subslice_return(
            callee_function,
            callee_source_name,
            callee_layout,
            expected_type,
            mutable,
            machine_contract,
        )?;
    let start_argument = call.arguments.get(callee_start_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer sub-slice start argument",
            callee.name
        ))
    })?;
    let end_argument = call.arguments.get(callee_end_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer sub-slice end argument",
            callee.name
        ))
    })?;
    let (AstNode::Identifier(start), AstNode::Identifier(end)) = (start_argument, end_argument)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` must forward exact named `i32` aggregate-buffer range parameters directly to `{}`",
            function.name, callee.name
        )));
    };
    let (start_parameter, end_parameter) = resolve_named_i32_range_parameters(
        function,
        &start.name,
        &end.name,
        "aggregate-buffer sub-slice forwarding",
        machine_contract,
    )?;
    Ok((field_offset, start_parameter, end_parameter))
}

fn resolve_borrowed_aggregate_buffer_element_return(
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<(u32, usize), NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result must return a direct indexed field borrow from source parameter `{source_name}`",
            function.name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result expects `{expected_operator}`, found `{}`",
            function.name, borrow.operator
        )));
    }
    let AstNode::MemberExpression(indexed) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires `{expected_operator} {source_name}.field[index]`",
            function.name
        )));
    };
    if !indexed.computed {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires computed indexing",
            function.name
        )));
    }
    let path = owned_buffer_path(indexed.object.as_ref()).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires a non-computed static owned-field path rooted at `{source_name}`",
            function.name
        ))
    })?;
    let mut segments = path.split('.');
    let root_name = segments
        .next()
        .expect("aggregate owned-field paths always contain a root");
    if root_name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result must derive from source parameter `{source_name}`; found root `{root_name}`",
            function.name
        )));
    }
    let field_names = segments.collect::<Vec<_>>();
    let field_offset = resolve_aggregate_owned_projection(
        source_layout,
        &field_names,
        &path,
        expected_type,
        machine_contract,
    )?;
    let AstNode::Identifier(index) = indexed.property.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result requires one exact named `i32` index parameter",
            function.name
        )));
    };
    let index_parameter = resolve_named_i32_coordinate_parameter(
        function,
        &index.name,
        "aggregate-buffer element result",
        machine_contract,
    )?;
    Ok((field_offset, index_parameter))
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_aggregate_buffer_element_return(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<(u32, usize), NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element forwarding requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward aggregate-buffer element result from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared aggregate-buffer element result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer element",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Scalar(callee_type) = callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate-buffer element",
            function.name, callee.name
        )));
    };
    if callee_type != expected_type || callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result disagrees with `{}` type or mutability",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    let callee_sources = callee_function
        .params
        .iter()
        .enumerate()
        .filter_map(|(index, parameter)| {
            let annotation = callee_function
                .param_types
                .get(index)
                .and_then(Option::as_deref)?;
            let reference = ReferenceType::parse(
                annotation,
                &format!("parameter `{parameter}` in function `{}`", callee.name),
                machine_contract,
                aggregate_layouts,
            )
            .ok()??;
            if reference.lifetime.as_deref() != Some(callee_lifetime) {
                return None;
            }
            let ReferenceTarget::Aggregate(layout_name) = reference.target else {
                return None;
            };
            Some((index, parameter.as_str(), layout_name, reference.mutable))
        })
        .collect::<Vec<_>>();
    let Some((callee_source_parameter, callee_source_name, callee_layout_name, callee_mutable)) =
        callee_sources.first()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result does not identify an aggregate-reference source parameter",
            callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer element result has ambiguous aggregate provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    let callee_layout = aggregate_layouts
        .get(callee_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if callee_layout.name != source_layout.name
        || callee_layout.abi_fingerprint(pointer_type)
            != source_layout.abi_fingerprint(pointer_type)
        || *callee_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer source ABI disagrees with `{}`",
            function.name, callee.name
        )));
    }
    let source_argument = call
        .arguments
        .get(*callee_source_parameter)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
                callee.name
            ))
        })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let (field_offset, callee_index_parameter) = resolve_borrowed_aggregate_buffer_element_return(
        callee_function,
        callee_source_name,
        callee_layout,
        expected_type,
        mutable,
        machine_contract,
    )?;
    let index_argument = call.arguments.get(callee_index_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer element index argument",
            callee.name
        ))
    })?;
    let AstNode::Identifier(index) = index_argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` must forward one exact named `i32` aggregate-buffer index directly to `{}`",
            function.name, callee.name
        )));
    };
    let index_parameter = resolve_named_i32_coordinate_parameter(
        function,
        &index.name,
        "aggregate-buffer element forwarding",
        machine_contract,
    )?;
    Ok((field_offset, index_parameter))
}

fn resolve_aggregate_subobject_projection<'a>(
    source_layout: &'a AggregateLayout,
    field_names: &[&str],
    path: &str,
    expected_target_layout: &AggregateLayout,
    machine_contract: &str,
) -> Result<(&'a AggregateLayout, u32), NativeCompileError> {
    if field_names.is_empty() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate subobject result requires a field path; `{path}` names the complete source root"
        )));
    }
    let mut layout = source_layout;
    let mut offset = 0_u32;
    for (index, field_name) in field_names.iter().enumerate() {
        let field = layout
            .fields
            .iter()
            .find(|field| field.name == *field_name)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate `{}` has no field `{field_name}` in path `{path}`",
                    layout.name
                ))
            })?;
        offset = offset.checked_add(field.offset).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} aggregate subobject path `{path}` exceeds addressable native stack offsets"
            ))
        })?;
        let is_final = index + 1 == field_names.len();
        match (&field.field_type, is_final) {
            (AggregateFieldType::Aggregate(nested), true) => {
                if nested.name != expected_target_layout.name {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate subobject return expects `{}`, but field `{path}` stores `{}`",
                        expected_target_layout.name, nested.name
                    )));
                }
                return Ok((nested, offset));
            }
            (AggregateFieldType::Scalar(machine_type), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate subobject return expects `{}`, but field `{path}` stores scalar `{}`",
                    expected_target_layout.name,
                    machine_type.name()
                )));
            }
            (AggregateFieldType::UncertainScalar(uncertain), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate subobject return cannot borrow @unknown field `{path}` carrying `Uncertain<{}>` as `{}`",
                    uncertain.value_type.name(),
                    expected_target_layout.name
                )));
            }
            (AggregateFieldType::Owned(owned), true) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate subobject return cannot borrow owned field `{path}` of type `[{}]`",
                    owned.element_type.name()
                )));
            }
            (AggregateFieldType::Aggregate(nested), false) => layout = nested,
            (
                AggregateFieldType::Scalar(_)
                | AggregateFieldType::UncertainScalar(_)
                | AggregateFieldType::Owned(_),
                false,
            ) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate subobject path `{path}` projects through non-aggregate field `{field_name}`"
                )));
            }
        }
    }
    unreachable!("non-empty aggregate subobject projections always return or fail")
}

fn resolve_borrowed_aggregate_subobject_return_field(
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    target_layout: &AggregateLayout,
    mutable: bool,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result must return a direct static field borrow from source parameter `{source_name}`",
            function.name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result expects `{expected_operator}`, found `{}`",
            function.name, borrow.operator
        )));
    }
    let path = owned_buffer_path(borrow.argument.as_ref()).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result requires a non-computed static field path rooted at `{source_name}`",
            function.name
        ))
    })?;
    let mut segments = path.split('.');
    let root_name = segments
        .next()
        .expect("aggregate field paths always contain a root");
    if root_name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result must derive from source parameter `{source_name}`; found root `{root_name}`",
            function.name
        )));
    }
    let field_names = segments.collect::<Vec<_>>();
    resolve_aggregate_subobject_projection(
        source_layout,
        &field_names,
        &path,
        target_layout,
        machine_contract,
    )
    .map(|(_, offset)| offset)
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_aggregate_subobject_return_field(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    target_layout: &AggregateLayout,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject forwarding requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward borrowed aggregate subobject from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared borrowed aggregate subobject result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate subobject",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Aggregate(callee_target_name) = &callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed aggregate subobject",
            function.name, callee.name
        )));
    };
    if callee_target_name != &target_layout.name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` returns borrowed `{}`, but `{}` returns borrowed `{}`",
            function.name, target_layout.name, callee.name, callee_target_name
        )));
    }
    if callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed return mutability must match the result of `{}`",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed aggregate result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    if callee_function.lifetimes.len() != 1
        || !callee_function
            .lifetimes
            .iter()
            .any(|declared| declared == callee_lifetime)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed aggregate lifetime is not bound exactly once",
            function.name, callee.name
        )));
    }
    let mut callee_sources = Vec::new();
    for (index, param_name) in callee_function.params.iter().enumerate() {
        let annotation = callee_function
            .param_types
            .get(index)
            .and_then(Option::as_deref)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} parameter `{param_name}` in function `{}` requires an explicit type",
                    callee.name
                ))
            })?;
        let Some(reference) = ReferenceType::parse(
            annotation,
            &format!("parameter `{param_name}` in function `{}`", callee.name),
            machine_contract,
            aggregate_layouts,
        )?
        else {
            continue;
        };
        if reference.lifetime.as_deref() != Some(callee_lifetime) {
            continue;
        }
        if let ReferenceTarget::Aggregate(layout_name) = reference.target {
            callee_sources.push((index, param_name.as_str(), layout_name, reference.mutable));
        }
    }
    let Some((callee_source_parameter, callee_source_name, callee_layout_name, callee_mutable)) =
        callee_sources.first()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result does not identify an aggregate-reference source parameter",
            callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject result has ambiguous aggregate provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    let callee_source_layout = aggregate_layouts
        .get(callee_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if callee_source_layout.name != source_layout.name
        || callee_source_layout.abi_fingerprint(pointer_type)
            != source_layout.abi_fingerprint(pointer_type)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` source aggregate `{}` does not match `{}` source aggregate `{}`",
            function.name, source_layout.name, callee.name, callee_source_layout.name
        )));
    }
    if *callee_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject source mutability disagrees with its result",
            callee.name
        )));
    }
    let source_argument = call
        .arguments
        .get(*callee_source_parameter)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its borrowed aggregate subobject source argument",
                callee.name
            ))
        })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    resolve_borrowed_aggregate_subobject_return_field(
        callee_function,
        callee_source_name,
        callee_source_layout,
        target_layout,
        callee_reference.mutable,
        machine_contract,
    )
}

fn resolve_borrowed_slice_element_index_parameter(
    function: &FunctionNode,
    source_name: &str,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<usize, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::UnaryExpression(borrow)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result must return a direct indexed borrow from source parameter `{source_name}`",
            function.name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result expects `{expected_operator}`, found `{}`",
            function.name, borrow.operator
        )));
    }
    let AstNode::MemberExpression(member) = borrow.argument.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires `{expected_operator} {source_name}[index]`",
            function.name
        )));
    };
    let AstNode::Identifier(source) = member.object.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires a direct source parameter root `{source_name}`",
            function.name
        )));
    };
    if source.name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result must derive from source parameter `{source_name}`; found `{}`",
            function.name, source.name
        )));
    }
    if !member.computed {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires computed indexing on `{source_name}`",
            function.name
        )));
    }
    let AstNode::Identifier(index) = member.property.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires one exact named `i32` index parameter for `{}` elements",
            function.name,
            expected_type.name()
        )));
    };
    let index_parameter = function
        .params
        .iter()
        .position(|parameter| parameter == &index.name)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` borrowed slice-element index `{}` must be a direct function parameter",
                function.name, index.name
            ))
        })?;
    if function
        .param_types
        .get(index_parameter)
        .and_then(Option::as_deref)
        != Some("i32")
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element index parameter `{}` must have type `i32`",
            function.name, index.name
        )));
    }
    let index_parameter_count = function
        .param_types
        .iter()
        .filter(|annotation| annotation.as_deref() == Some("i32"))
        .count();
    if index_parameter_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result requires exactly one `i32` index parameter; found {index_parameter_count}",
            function.name
        )));
    }
    Ok(index_parameter)
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_slice_element_index_parameter(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    expected_type: MachineType,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    machine_contract: &str,
) -> Result<usize, NativeCompileError> {
    let return_count = count_return_statements(&function.body);
    if return_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element forwarding requires exactly one direct top-level final return; found {return_count} returns",
            function.name
        )));
    }
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward borrowed slice-element result from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared borrowed slice-element result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed slice element",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Scalar(callee_type) = callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed slice element",
            function.name, callee.name
        )));
    };
    if callee_type != expected_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` returns borrowed `{}`, but `{}` returns borrowed `{}`",
            function.name,
            expected_type.name(),
            callee.name,
            callee_type.name()
        )));
    }
    if callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element mutability must match the result of `{}`",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed slice-element result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    let callee_sources = callee_function
        .params
        .iter()
        .enumerate()
        .filter_map(|(index, parameter)| {
            let annotation = callee_function
                .param_types
                .get(index)
                .and_then(Option::as_deref)?;
            let reference = ReferenceType::parse(
                annotation,
                &format!("parameter `{parameter}` in function `{}`", callee.name),
                machine_contract,
                aggregate_layouts,
            )
            .ok()??;
            if reference.lifetime.as_deref() != Some(callee_lifetime) {
                return None;
            }
            let ReferenceTarget::Slice(element_type) = reference.target else {
                return None;
            };
            Some((index, parameter.as_str(), element_type, reference.mutable))
        })
        .collect::<Vec<_>>();
    let Some((callee_source_parameter, callee_source_name, callee_element, callee_mutable)) =
        callee_sources.first().copied()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed slice element",
            function.name, callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element result has ambiguous slice provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    if callee_element != expected_type || callee_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(callee_source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed slice-element source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let callee_index_parameter = resolve_borrowed_slice_element_index_parameter(
        callee_function,
        callee_source_name,
        expected_type,
        mutable,
        machine_contract,
    )?;
    let index_argument = call.arguments.get(callee_index_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed slice-element index argument",
            callee.name
        ))
    })?;
    let AstNode::Identifier(index) = index_argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` must forward one exact named `i32` index parameter directly to `{}`",
            function.name, callee.name
        )));
    };
    let index_parameter = function
        .params
        .iter()
        .position(|parameter| parameter == &index.name)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` forwarded slice-element index `{}` must be a direct function parameter",
                function.name, index.name
            ))
        })?;
    if function
        .param_types
        .get(index_parameter)
        .and_then(Option::as_deref)
        != Some("i32")
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwarded slice-element index parameter `{}` must have type `i32`",
            function.name, index.name
        )));
    }
    let index_parameter_count = function
        .param_types
        .iter()
        .filter(|annotation| annotation.as_deref() == Some("i32"))
        .count();
    if index_parameter_count != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element forwarding requires exactly one `i32` index parameter; found {index_parameter_count}",
            function.name
        )));
    }
    Ok(index_parameter)
}

fn resolve_borrowed_scalar_return_field(
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result requires one direct top-level final return",
            function.name
        )));
    };
    let argument = returned.argument.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result requires a returned field borrow",
            function.name
        ))
    })?;
    resolve_borrowed_scalar_field_borrow(
        argument,
        &function.name,
        source_name,
        source_layout,
        expected_type,
        mutable,
        machine_contract,
    )
}

#[allow(clippy::too_many_arguments)]
fn resolve_forwarded_borrowed_scalar_return_field(
    ast: &Ast,
    function: &FunctionNode,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    pointer_type: Type,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let Some(AstNode::Return(returned)) = function.body.last() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar forwarding requires one direct top-level final return",
            function.name
        )));
    };
    let Some(AstNode::CallExpression(call)) = returned.argument.as_deref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar forwarding requires a direct named call return",
            function.name
        )));
    };
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar forwarding requires a named HoloScript function",
            function.name
        )));
    };
    let callee_function = ast.body.iter().find_map(|node| match node {
        AstNode::Function(candidate) if candidate.name == callee.name => Some(candidate),
        _ => None,
    });
    let callee_function = callee_function.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` forwards an unknown function `{}`",
            function.name, callee.name
        ))
    })?;
    let return_annotation = callee_function.return_type.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it has no declared borrowed scalar-field result",
            function.name, callee.name
        ))
    })?;
    let callee_reference = ReferenceType::parse(
        return_annotation,
        &format!("return type of function `{}`", callee.name),
        machine_contract,
        aggregate_layouts,
    )?
    .ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed scalar-field reference",
            function.name, callee.name
        ))
    })?;
    let ReferenceTarget::Scalar(callee_type) = callee_reference.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because it does not return a borrowed scalar-field reference",
            function.name, callee.name
        )));
    };
    if function_forwards_borrowed_result(callee_function) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward borrowed scalar-field result from forwarding function `{}`; only one direct forwarding hop is admitted",
            function.name, callee.name
        )));
    }
    if callee_type != expected_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` returns borrowed `{}`, but `{}` returns borrowed `{}`",
            function.name,
            expected_type.name(),
            callee.name,
            callee_type.name()
        )));
    }
    if callee_reference.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed return mutability must match the result of `{}`",
            function.name, callee.name
        )));
    }
    let callee_lifetime = callee_reference.lifetime.as_deref().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed scalar result has no explicit lifetime",
            function.name, callee.name
        ))
    })?;
    if callee_function.lifetimes.len() != 1
        || !callee_function
            .lifetimes
            .iter()
            .any(|declared| declared == callee_lifetime)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` cannot forward `{}` because its borrowed scalar lifetime is not bound exactly once",
            function.name, callee.name
        )));
    }

    let mut callee_sources = Vec::new();
    for (index, param_name) in callee_function.params.iter().enumerate() {
        let annotation = callee_function
            .param_types
            .get(index)
            .and_then(Option::as_deref)
            .ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} parameter `{param_name}` in function `{}` requires an explicit type",
                    callee.name
                ))
            })?;
        let Some(reference) = ReferenceType::parse(
            annotation,
            &format!("parameter `{param_name}` in function `{}`", callee.name),
            machine_contract,
            aggregate_layouts,
        )?
        else {
            continue;
        };
        if reference.lifetime.as_deref() != Some(callee_lifetime) {
            continue;
        }
        if let ReferenceTarget::Aggregate(layout_name) = reference.target {
            callee_sources.push((index, param_name.as_str(), layout_name, reference.mutable));
        }
    }
    let Some((callee_source_parameter, callee_source_name, callee_layout_name, callee_mutable)) =
        callee_sources.first()
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result does not identify an aggregate-reference source parameter",
            callee.name
        )));
    };
    if callee_sources.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result has ambiguous aggregate provenance across {} parameters",
            callee.name,
            callee_sources.len()
        )));
    }
    let callee_layout = aggregate_layouts
        .get(callee_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if callee_layout.name != source_layout.name
        || callee_layout.abi_fingerprint(pointer_type)
            != source_layout.abi_fingerprint(pointer_type)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` source aggregate `{}` does not match `{}` source aggregate `{}`",
            function.name, source_layout.name, callee.name, callee_layout.name
        )));
    }
    if *callee_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar source mutability disagrees with its result",
            callee.name
        )));
    }
    let source_argument = call
        .arguments
        .get(*callee_source_parameter)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its borrowed scalar source argument",
                callee.name
            ))
        })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                function.name, callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                function.name,
                callee.name,
                ast_node_name(other)
            )));
        }
    }

    resolve_borrowed_scalar_return_field(
        callee_function,
        callee_source_name,
        callee_layout,
        callee_type,
        callee_reference.mutable,
        machine_contract,
    )
}

fn resolve_borrowed_scalar_field_borrow(
    argument: &AstNode,
    function_name: &str,
    source_name: &str,
    source_layout: &AggregateLayout,
    expected_type: MachineType,
    mutable: bool,
    machine_contract: &str,
) -> Result<u32, NativeCompileError> {
    let AstNode::UnaryExpression(borrow) = argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result must return a direct static field borrow from source parameter `{source_name}`",
            function_name
        )));
    };
    let expected_operator = if mutable { "&mut" } else { "&" };
    if borrow.operator != expected_operator {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result expects `{expected_operator}`, found `{}`",
            function_name, borrow.operator
        )));
    }
    let path = owned_buffer_path(borrow.argument.as_ref()).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result requires a non-computed static aggregate field path rooted at `{source_name}`",
            function_name
        ))
    })?;
    let mut segments = path.split('.');
    let root_name = segments
        .next()
        .expect("aggregate field paths always contain a root");
    if root_name != source_name {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar result must derive from source parameter `{source_name}`; found root `{root_name}`",
            function_name
        )));
    }
    let field_names = segments.collect::<Vec<_>>();
    let (field_type, field_offset) =
        resolve_aggregate_scalar_projection(source_layout, &field_names, &path, machine_contract)?;
    if field_type != expected_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar return expects `{}`, but field `{path}` stores `{}`",
            function_name,
            expected_type.name(),
            field_type.name()
        )));
    }
    Ok(field_offset)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_aggregate_buffer_whole_slice_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_layout_fingerprint: u32,
    expected_field_offset: u32,
    expected_type: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(Value, Value), NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer whole-slice forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferWholeSliceReference {
        element_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed aggregate-buffer whole slice",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward aggregate-buffer whole-slice result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if element_type != expected_type
        || mutable != expected_mutable
        || source_layout_fingerprint != expected_layout_fingerprint
        || field_offset != expected_field_offset
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer field provenance does not match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its aggregate source parameter",
            callee.name
        )));
    };
    if *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its source mutability",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source is not an aggregate reference"
        )));
    };
    let AggregateReferenceStorage::Parameter { base } = storage else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer forwarding cannot escape local, returned, or reborrowed aggregate storage"
        )));
    };
    if layout.name != *layout_name
        || layout.abi_fingerprint(module.target_config().pointer_type())
            != expected_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source no longer matches its declared ABI"
        )));
    }
    let (expected_base, expected_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        *base,
        expected_field_offset,
        expected_type,
    );
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        expected_type,
    );
    let wrong_base = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_base, TrapCode::unwrap_user(4));
    let wrong_length = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_length, expected_length);
    builder.ins().trapnz(wrong_length, TrapCode::unwrap_user(4));
    Ok((returned_base, returned_length))
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_aggregate_buffer_subslice_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_layout_fingerprint: u32,
    expected_field_offset: u32,
    start_name: &str,
    end_name: &str,
    expected_type: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(Value, Value), NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer sub-slice forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferSliceReference {
        element_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        start_parameter,
        end_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed aggregate-buffer sub-slice",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward aggregate-buffer sub-slice result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if element_type != expected_type
        || mutable != expected_mutable
        || source_layout_fingerprint != expected_layout_fingerprint
        || field_offset != expected_field_offset
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer field provenance does not match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its aggregate source parameter",
            callee.name
        )));
    };
    if *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its source mutability",
            callee.name
        )));
    }
    if !matches!(
        (
            abi.params.get(start_parameter),
            abi.params.get(end_parameter)
        ),
        (
            Some(MachineParameter::Scalar(MachineType::I32)),
            Some(MachineParameter::Scalar(MachineType::I32))
        )
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its `i32` range coordinates",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    for (parameter, expected_name, coordinate) in [
        (start_parameter, start_name, "start"),
        (end_parameter, end_name, "end"),
    ] {
        let argument = call.arguments.get(parameter).ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} call to `{}` omitted its aggregate-buffer {coordinate} argument",
                callee.name
            ))
        })?;
        match argument {
            AstNode::Identifier(identifier) if identifier.name == expected_name => {}
            AstNode::Identifier(identifier) => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{function_name}` must forward exact aggregate-buffer {coordinate} parameter `{expected_name}` to `{}`; found `{}`",
                    callee.name, identifier.name
                )));
            }
            other => {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} function `{function_name}` must forward exact aggregate-buffer {coordinate} parameter `{expected_name}` directly to `{}`; found `{}`",
                    callee.name,
                    ast_node_name(other)
                )));
            }
        }
    }
    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source is not an aggregate reference"
        )));
    };
    let AggregateReferenceStorage::Parameter { base } = storage else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer forwarding cannot escape local, returned, or reborrowed aggregate storage"
        )));
    };
    if layout.name != *layout_name
        || layout.abi_fingerprint(module.target_config().pointer_type())
            != expected_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source no longer matches its declared ABI"
        )));
    }
    let start = locals.get(start_name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer start parameter `{start_name}`"
        ))
    })?;
    let end = locals.get(end_name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer end parameter `{end_name}`"
        ))
    })?;
    if start.machine_type != MachineType::I32 || end.machine_type != MachineType::I32 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer range no longer matches its declared ABI"
        )));
    }
    let (buffer_base, buffer_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        *base,
        expected_field_offset,
        expected_type,
    );
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_range_checks(
        builder,
        start.value,
        end.value,
        buffer_length,
        pointer_type,
        expected_type.stack_size(),
        0,
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        buffer_base,
        start.value,
        expected_type.stack_size(),
    );
    let expected_length = builder.ins().isub(end.value, start.value);
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        expected_type,
    );
    let wrong_base = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_base, TrapCode::unwrap_user(4));
    let wrong_length = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_length, expected_length);
    builder.ins().trapnz(wrong_length, TrapCode::unwrap_user(4));
    Ok((returned_base, returned_length))
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_aggregate_buffer_element_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_layout_fingerprint: u32,
    expected_field_offset: u32,
    index_name: &str,
    expected_type: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Value, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer element forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferElementReference {
        machine_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        index_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed aggregate-buffer element",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward aggregate-buffer element result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if machine_type != expected_type
        || mutable != expected_mutable
        || source_layout_fingerprint != expected_layout_fingerprint
        || field_offset != expected_field_offset
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer field provenance does not match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its aggregate source parameter",
            callee.name
        )));
    };
    if *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its source mutability",
            callee.name
        )));
    }
    if !matches!(
        abi.params.get(index_parameter),
        Some(MachineParameter::Scalar(MachineType::I32))
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its `i32` index coordinate",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let index_argument = call.arguments.get(index_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer index argument",
            callee.name
        ))
    })?;
    match index_argument {
        AstNode::Identifier(index) if index.name == index_name => {}
        AstNode::Identifier(index) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate-buffer index parameter `{index_name}` to `{}`; found `{}`",
                callee.name, index.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact aggregate-buffer index parameter `{index_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source is not an aggregate reference"
        )));
    };
    let AggregateReferenceStorage::Parameter { base } = storage else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer forwarding cannot escape local, returned, or reborrowed aggregate storage"
        )));
    };
    if layout.name != *layout_name
        || layout.abi_fingerprint(module.target_config().pointer_type())
            != expected_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer source no longer matches its declared ABI"
        )));
    }
    let index = locals.get(index_name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost aggregate-buffer index parameter `{index_name}`"
        ))
    })?;
    if index.machine_type != MachineType::I32 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` aggregate-buffer index no longer matches its declared ABI"
        )));
    }
    let (buffer_base, buffer_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        *base,
        expected_field_offset,
        expected_type,
    );
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_element_checks(
        builder,
        index.value,
        buffer_length,
        pointer_type,
        expected_type.stack_size(),
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        buffer_base,
        index.value,
        expected_type.stack_size(),
    );
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer element pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, expected_type);
    let wrong_element = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder
        .ins()
        .trapnz(wrong_element, TrapCode::unwrap_user(4));
    Ok(returned_base)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_slice_element_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    index_name: &str,
    expected_type: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Value, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed slice-element forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::SliceElementReference {
        machine_type,
        source_parameter,
        index_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed slice element",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward borrowed slice-element result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if machine_type != expected_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` returns borrowed `{}`, but `{}` returns borrowed `{}`",
            expected_type.name(),
            callee.name,
            machine_type.name()
        )));
    }
    if mutable != expected_mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed slice-element mutability must match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::Slice {
        element_type: source_element,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI lost its source parameter",
            callee.name
        )));
    };
    if *source_element != machine_type || *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI disagrees with its source parameter",
            callee.name
        )));
    }
    if !matches!(
        abi.params.get(index_parameter),
        Some(MachineParameter::Scalar(MachineType::I32))
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI lost its `i32` index coordinate",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed slice-element source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let index_argument = call.arguments.get(index_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed slice-element index argument",
            callee.name
        ))
    })?;
    match index_argument {
        AstNode::Identifier(index) if index.name == index_name => {}
        AstNode::Identifier(index) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact index parameter `{index_name}` to `{}`; found `{}`",
                callee.name, index.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact index parameter `{index_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost borrowed slice-element source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Slice {
        element_type,
        storage: SliceStorage::Parameter { base, length },
    } = &source.layout
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed slice-element forwarding cannot escape local, returned, or reborrowed storage"
        )));
    };
    let index = locals.get(index_name).copied().ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost borrowed slice-element index parameter `{index_name}`"
        ))
    })?;
    if *element_type != expected_type
        || source.mutable != expected_mutable
        || index.machine_type != MachineType::I32
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed slice-element source or index no longer matches its declared ABI"
        )));
    }
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_element_checks(
        builder,
        index.value,
        *length,
        pointer_type,
        expected_type.stack_size(),
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        *base,
        index.value,
        expected_type.stack_size(),
    );
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed slice-element pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, expected_type);
    let wrong_element = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder
        .ins()
        .trapnz(wrong_element, TrapCode::unwrap_user(4));
    Ok(returned_base)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_scalar_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_layout_fingerprint: u32,
    expected_field_offset: u32,
    expected_type: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Value, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed scalar forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::ScalarReference {
        machine_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed scalar-field reference",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward borrowed scalar-field result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if machine_type != expected_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` returns borrowed `{}`, but `{}` returns borrowed `{}`",
            expected_type.name(),
            callee.name,
            machine_type.name()
        )));
    }
    if mutable != expected_mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed return mutability must match the result of `{}`",
            callee.name
        )));
    }
    if source_layout_fingerprint != expected_layout_fingerprint
        || field_offset != expected_field_offset
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed scalar field provenance does not match the result of `{}`",
            callee.name
        )));
    }

    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost borrowed scalar source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate {
        layout: expected_layout,
        storage,
    } = &source.layout
    else {
        unreachable!("borrowed scalar forwarding requires an aggregate source parameter")
    };
    let AggregateReferenceStorage::Parameter { base: source_base } = storage else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed scalar forwarding cannot escape local, returned, or reborrowed storage"
        )));
    };
    let pointer_type = module.target_config().pointer_type();
    if expected_layout.abi_fingerprint(pointer_type) != expected_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed scalar source no longer matches its declared aggregate layout or mutability"
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: callee_layout_name,
        mutable: callee_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-scalar ABI lost its source parameter",
            callee.name
        )));
    };
    let callee_layout = aggregate_layouts.get(callee_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-scalar ABI lost layout `{callee_layout_name}`",
            callee.name
        ))
    })?;
    if callee_layout.name != expected_layout.name
        || callee_layout.abi_fingerprint(pointer_type) != source_layout_fingerprint
        || *callee_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-scalar ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed scalar source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }

    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed scalar pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, machine_type);
    let expected_base = if field_offset == 0 {
        *source_base
    } else {
        builder
            .ins()
            .iadd_imm(*source_base, i64::from(field_offset))
    };
    let wrong_field = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_field, TrapCode::unwrap_user(4));
    Ok(returned_base)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_aggregate_subobject_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_source_layout_fingerprint: u32,
    expected_target_layout_fingerprint: u32,
    expected_field_offset: u32,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Value, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate subobject forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateSubobjectReference {
        target_layout_fingerprint,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed aggregate subobject",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward borrowed aggregate subobject from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if target_layout_fingerprint != expected_target_layout_fingerprint
        || source_layout_fingerprint != expected_source_layout_fingerprint
        || field_offset != expected_field_offset
        || mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate subobject provenance does not match the result of `{}`",
            callee.name
        )));
    }

    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost borrowed aggregate subobject source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate {
        layout: expected_source_layout,
        storage,
    } = &source.layout
    else {
        unreachable!("borrowed aggregate subobject forwarding requires an aggregate source")
    };
    let AggregateReferenceStorage::Parameter { base: source_base } = storage else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate subobject forwarding cannot escape local, returned, or reborrowed storage"
        )));
    };
    let pointer_type = module.target_config().pointer_type();
    if expected_source_layout.abi_fingerprint(pointer_type) != expected_source_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate subobject source no longer matches its declared layout or mutability"
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: callee_source_layout_name,
        mutable: callee_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject ABI lost its source parameter",
            callee.name
        )));
    };
    let callee_source_layout = aggregate_layouts
        .get(callee_source_layout_name)
        .ok_or_else(|| {
            NativeCompileError::new(format!(
                "{machine_contract} function `{}` borrowed aggregate subobject ABI lost layout `{callee_source_layout_name}`",
                callee.name
            ))
        })?;
    if callee_source_layout.name != expected_source_layout.name
        || callee_source_layout.abi_fingerprint(pointer_type) != source_layout_fingerprint
        || *callee_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed aggregate subobject ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed aggregate subobject source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed aggregate subobject pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let target_layout = aggregate_layout_by_fingerprint(
        aggregate_layouts,
        pointer_type,
        target_layout_fingerprint,
        &format!("borrowed aggregate subobject result from `{}`", callee.name),
        machine_contract,
    )?;
    validate_aggregate_reference_pointer(builder, returned_base, target_layout);
    let expected_base = if field_offset == 0 {
        *source_base
    } else {
        builder
            .ins()
            .iadd_imm(*source_base, i64::from(field_offset))
    };
    let wrong_field = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_field, TrapCode::unwrap_user(4));
    Ok(returned_base)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_aggregate_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_layout_fingerprint: u32,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<Value, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateReference {
        layout_fingerprint,
        source_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed aggregate reference",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward borrowed aggregate result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }

    let source = references.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` lost borrowed aggregate source parameter `{source_name}`"
        ))
    })?;
    let TypedReferenceLayout::Aggregate {
        layout: expected_layout,
        storage,
    } = &source.layout
    else {
        unreachable!("borrowed aggregate forwarding requires an aggregate source parameter")
    };
    if !matches!(storage, AggregateReferenceStorage::Parameter { .. }) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate forwarding cannot escape local or reborrowed storage"
        )));
    }
    let pointer_type = module.target_config().pointer_type();
    if expected_layout.abi_fingerprint(pointer_type) != expected_layout_fingerprint
        || source.mutable != expected_mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed aggregate source no longer matches its declared layout or mutability"
        )));
    }
    if layout_fingerprint != expected_layout_fingerprint {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` returns aggregate `{}`, but `{}` returns a different aggregate layout",
            expected_layout.name, callee.name
        )));
    }
    if mutable != expected_mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed return mutability must match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-aggregate ABI lost its source parameter",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-aggregate ABI lost layout `{source_layout_name}`",
            callee.name
        ))
    })?;
    if source_layout.name != expected_layout.name
        || source_layout.abi_fingerprint(pointer_type) != layout_fingerprint
        || *source_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-aggregate ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed-aggregate source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }

    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed aggregate pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_aggregate_reference_pointer(builder, returned_base, expected_layout);
    Ok(returned_base)
}

#[allow(clippy::too_many_arguments)]
fn lower_forwarded_borrowed_slice_return(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    function_name: &str,
    source_name: &str,
    expected_element: MachineType,
    expected_mutable: bool,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<(Value, Value), NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed slice forwarding requires a named HoloScript function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` forwards an unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::SliceReference {
        element_type,
        source_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward `{}` because it does not return a borrowed slice reference",
            callee.name
        )));
    };
    if abi.forwards_borrowed_result && !transitive_borrow_summary_enabled(machine_contract) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` cannot forward borrowed slice result from forwarding function `{}`; only one direct forwarding hop is admitted",
            callee.name
        )));
    }
    if element_type != expected_element {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` returns elements of `{}`, but `{}` returns elements of `{}`",
            expected_element.name(),
            callee.name,
            element_type.name()
        )));
    }
    if mutable != expected_mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{function_name}` borrowed return mutability must match the result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::Slice {
        element_type: source_element,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-slice ABI lost its source parameter",
            callee.name
        )));
    };
    if *source_element != element_type || *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-slice ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed-slice source argument",
            callee.name
        ))
    })?;
    match source_argument {
        AstNode::Identifier(source) if source.name == source_name => {}
        AstNode::Identifier(source) => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` to `{}`; found `{}`",
                callee.name, source.name
            )));
        }
        other => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{function_name}` must forward exact source parameter `{source_name}` directly to `{}`; found `{}`",
                callee.name,
                ast_node_name(other)
            )));
        }
    }

    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        element_type,
    );
    Ok((returned_base, returned_length))
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_slice_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed slice initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed slice initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    if matches!(
        abi.result,
        MachineResult::AggregateBufferWholeSliceReference { .. }
    ) {
        return lower_borrowed_aggregate_buffer_whole_slice_call_initializer(
            builder,
            module,
            functions,
            aggregate_layouts,
            locals,
            stack_slots,
            references,
            borrow_states,
            owned_buffers,
            reference_name,
            reference_type,
            call,
            machine_contract,
            memory_enabled,
        );
    }
    if matches!(
        abi.result,
        MachineResult::AggregateBufferSliceReference { .. }
    ) {
        return lower_borrowed_aggregate_buffer_subslice_call_initializer(
            builder,
            module,
            functions,
            aggregate_layouts,
            locals,
            stack_slots,
            references,
            borrow_states,
            owned_buffers,
            reference_name,
            reference_type,
            call,
            machine_contract,
            memory_enabled,
        );
    }
    let MachineResult::SliceReference {
        element_type,
        source_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed slice reference",
            callee.name
        )));
    };
    let ReferenceTarget::Slice(expected_element) = &reference_type.target else {
        unreachable!("slice call initializers are selected from slice reference locals")
    };
    if *expected_element != element_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects elements of `{}`, but `{}` returns elements of `{}`",
            expected_element.name(),
            callee.name,
            element_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the borrowed slice result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::Slice {
        element_type: source_element,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-slice provenance is not a slice reference",
            callee.name
        )));
    };
    if *source_element != element_type || *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-slice ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed-slice source argument",
            callee.name
        ))
    })?;
    let returned_root = resolve_returned_slice_root(
        source_argument,
        stack_slots,
        references,
        &callee.name,
        machine_contract,
    )?;

    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        element_type,
    );
    acquire_returned_slice_borrow(
        borrow_states,
        returned_root.name(),
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;

    Ok(TypedReference {
        layout: TypedReferenceLayout::Slice {
            element_type,
            storage: SliceStorage::Returned {
                base: returned_base,
                length: returned_length,
                root: returned_root,
            },
        },
        mutable,
    })
}

fn resolve_returned_slice_root(
    source_argument: &AstNode,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    callee_name: &str,
    machine_contract: &str,
) -> Result<ReturnedSliceRoot, NativeCompileError> {
    let source_name = match source_argument {
        AstNode::Identifier(source) => source.name.as_str(),
        AstNode::UnaryExpression(borrow) => {
            let AstNode::MemberExpression(range) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} borrowed slice result source for `{callee_name}` must be a named slice or direct range reborrow"
                )));
            };
            let AstNode::Identifier(source) = range.object.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} borrowed slice result source for `{callee_name}` must retain one concrete caller root"
                )));
            };
            source.name.as_str()
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice result source for `{callee_name}` must be a named slice or direct range reborrow"
            )));
        }
    };

    if let Some(reference) = references.get(source_name) {
        let TypedReferenceLayout::Slice { storage, .. } = &reference.layout else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice result source `{source_name}` for `{callee_name}` is not a slice"
            )));
        };
        return match storage {
            SliceStorage::Stack { slot_name, .. } => {
                Ok(ReturnedSliceRoot::Stack(slot_name.clone()))
            }
            SliceStorage::Heap { owner_name, .. } => {
                Ok(ReturnedSliceRoot::Heap(owner_name.clone()))
            }
            SliceStorage::Parameter { .. } => Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice result from `{callee_name}` cannot extend slice parameter `{source_name}`; return chains require a concrete caller root"
            ))),
            SliceStorage::Returned { .. } => Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice result from `{callee_name}` cannot extend nested returned slice `{source_name}`"
            ))),
        };
    }

    let slot = stack_slots.get(source_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed slice result source for `{callee_name}` lost caller root `{source_name}`"
        ))
    })?;
    if !matches!(slot.layout, StackSlotLayout::FixedArray(_)) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed slice result source `{source_name}` for `{callee_name}` is not fixed-array storage"
        )));
    }
    Ok(ReturnedSliceRoot::Stack(source_name.to_string()))
}

fn validate_borrowed_slice_result(
    builder: &mut FunctionBuilder<'_>,
    module: &ObjectModule,
    base: Value,
    length: Value,
    element_type: MachineType,
) {
    let negative = builder.ins().icmp_imm(IntCC::SignedLessThan, length, 0);
    builder.ins().trapnz(negative, TrapCode::unwrap_user(1));
    let null = builder.ins().icmp_imm(IntCC::Equal, base, 0);
    builder.ins().trapnz(null, TrapCode::unwrap_user(2));
    let alignment = 1_u32 << element_type.stack_align_shift();
    if alignment > 1 {
        let misalignment = builder.ins().band_imm(base, i64::from(alignment - 1));
        builder.ins().trapnz(misalignment, TrapCode::unwrap_user(4));
    }
    if let Some(max_length) = runtime_slice_start_limit(
        module.target_config().pointer_type(),
        element_type.stack_size(),
        0,
    ) {
        let too_large =
            builder
                .ins()
                .icmp_imm(IntCC::UnsignedGreaterThan, length, i64::from(max_length));
        builder.ins().trapnz(too_large, TrapCode::unwrap_user(1));
    }
}

fn acquire_returned_slice_borrow(
    borrow_states: &mut HashMap<String, BorrowState>,
    root_name: &str,
    mutable: bool,
    reference_name: &str,
    callee_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let state = borrow_states.entry(root_name.to_string()).or_default();
    if state.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot bind returned slice `{reference_name}` from `{callee_name}` because caller root `{root_name}` was moved"
        )));
    }
    if mutable {
        if state.shared > 0 || state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot bind returned mutable slice `{reference_name}` from `{callee_name}` because caller root `{root_name}` already has an active borrow"
            )));
        }
        state.exclusive = true;
    } else {
        if state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot bind returned shared slice `{reference_name}` from `{callee_name}` because caller root `{root_name}` is exclusively borrowed"
            )));
        }
        state.shared += 1;
    }
    Ok(())
}

fn resolve_returned_slice_element_root(
    source_argument: &AstNode,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    owned_buffers: &HashMap<String, OwnedBuffer>,
    callee_name: &str,
    machine_contract: &str,
) -> Result<String, NativeCompileError> {
    if matches!(source_argument, AstNode::UnaryExpression(_)) {
        return resolve_returned_slice_root(
            source_argument,
            stack_slots,
            references,
            callee_name,
            machine_contract,
        )
        .map(|root| root.name().to_string());
    }
    let AstNode::Identifier(source) = source_argument else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed slice-element result source for `{callee_name}` must be a named slice or direct range reborrow"
        )));
    };
    if let Some(reference) = references.get(&source.name) {
        let TypedReferenceLayout::Slice { storage, .. } = &reference.layout else {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice-element result source `{}` for `{callee_name}` is not a slice",
                source.name
            )));
        };
        return match storage {
            SliceStorage::Stack { slot_name, .. } => Ok(slot_name.clone()),
            SliceStorage::Heap { owner_name, .. } => Ok(owner_name.clone()),
            SliceStorage::Parameter { .. } => Ok(source.name.clone()),
            SliceStorage::Returned { .. } => Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed slice-element result from `{callee_name}` cannot extend nested returned slice `{}`",
                source.name
            ))),
        };
    }
    if owned_buffers.contains_key(&source.name) {
        return Ok(source.name.clone());
    }
    let slot = stack_slots.get(&source.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed slice-element result source for `{callee_name}` lost caller root `{}`",
            source.name
        ))
    })?;
    if !matches!(slot.layout, StackSlotLayout::FixedArray(_)) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed slice-element result source `{}` for `{callee_name}` is not fixed-array storage",
            source.name
        )));
    }
    Ok(source.name.clone())
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_aggregate_buffer_whole_slice_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer whole-slice initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer whole-slice initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferWholeSliceReference {
        element_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed aggregate-buffer whole slice",
            callee.name
        )));
    };
    let ReferenceTarget::Slice(expected_element) = &reference_type.target else {
        unreachable!("aggregate-buffer whole-slice results bind to slice reference locals")
    };
    if *expected_element != element_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects elements of `{}`, but `{}` returns an aggregate-buffer slice of `{}`",
            expected_element.name(),
            callee.name,
            element_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the aggregate-buffer whole-slice result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer provenance is not an aggregate reference",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost aggregate layout `{source_layout_name}` for its buffer whole-slice result",
            callee.name
        ))
    })?;
    if source_layout.abi_fingerprint(module.target_config().pointer_type())
        != source_layout_fingerprint
        || *source_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its aggregate source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    let (root_name, validate_owned_leaves) = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer source for `{}` must be a complete aggregate root",
                    callee.name
                )));
            };
            (root.name.clone(), true)
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Stack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => (source.name.clone(), false),
                TypedReferenceLayout::Aggregate {
                    storage:
                        AggregateReferenceStorage::ReturnedStack { .. }
                        | AggregateReferenceStorage::ParameterReborrow { .. }
                        | AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer result from `{}` cannot extend nested returned or reborrowed aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                _ => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer source for `{}` requires an aggregate reference",
                        callee.name
                    )));
                }
            }
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate-buffer source for `{}` requires a direct aggregate borrow or named aggregate reference",
                callee.name
            )));
        }
    };
    if validate_owned_leaves {
        validate_aggregate_root_owned_leaves(
            source_layout,
            &root_name,
            owned_buffers,
            &format!("aggregate-buffer whole-slice result from `{}`", callee.name),
            machine_contract,
        )?;
    }
    for (parameter_index, (argument, parameter)) in
        call.arguments.iter().zip(&abi.params).enumerate()
    {
        if parameter_index == source_parameter
            || !matches!(parameter, MachineParameter::Owned { .. })
        {
            continue;
        }
        if let Some(moved_path) = explicit_owned_move_path(argument) {
            if moved_path == root_name
                || moved_path
                    .strip_prefix(&root_name)
                    .is_some_and(|suffix| suffix.starts_with('.'))
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} call to `{}` cannot move owned descendant `{moved_path}` while returning a slice tied to aggregate root `{root_name}`",
                    callee.name
                )));
            }
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = machine_parameter_abi_offset(&abi.params, source_parameter);
    let source_base = arguments[source_abi_index];
    let (expected_base, expected_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        source_base,
        field_offset,
        element_type,
    );
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        element_type,
    );
    let wrong_base = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_base, TrapCode::unwrap_user(4));
    let wrong_length = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_length, expected_length);
    builder.ins().trapnz(wrong_length, TrapCode::unwrap_user(4));
    acquire_returned_aggregate_borrow(
        borrow_states,
        &root_name,
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;
    Ok(TypedReference {
        layout: TypedReferenceLayout::Slice {
            element_type,
            storage: SliceStorage::Returned {
                base: returned_base,
                length: returned_length,
                root: ReturnedSliceRoot::Stack(root_name),
            },
        },
        mutable,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_aggregate_buffer_subslice_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer sub-slice initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer sub-slice initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferSliceReference {
        element_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        start_parameter,
        end_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed aggregate-buffer sub-slice",
            callee.name
        )));
    };
    let ReferenceTarget::Slice(expected_element) = &reference_type.target else {
        unreachable!("aggregate-buffer sub-slice results bind to slice reference locals")
    };
    if *expected_element != element_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects elements of `{}`, but `{}` returns an aggregate-buffer slice of `{}`",
            expected_element.name(),
            callee.name,
            element_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the aggregate-buffer sub-slice result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer provenance is not an aggregate reference",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost aggregate layout `{source_layout_name}` for its buffer sub-slice result",
            callee.name
        ))
    })?;
    if source_layout.abi_fingerprint(module.target_config().pointer_type())
        != source_layout_fingerprint
        || *source_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its aggregate source parameter",
            callee.name
        )));
    }
    if !matches!(
        (
            abi.params.get(start_parameter),
            abi.params.get(end_parameter)
        ),
        (
            Some(MachineParameter::Scalar(MachineType::I32)),
            Some(MachineParameter::Scalar(MachineType::I32))
        )
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its `i32` range coordinates",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    let (root_name, validate_owned_leaves) = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer source for `{}` must be a complete aggregate root",
                    callee.name
                )));
            };
            (root.name.clone(), true)
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Stack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => (source.name.clone(), false),
                TypedReferenceLayout::Aggregate {
                    storage:
                        AggregateReferenceStorage::ReturnedStack { .. }
                        | AggregateReferenceStorage::ParameterReborrow { .. }
                        | AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer result from `{}` cannot extend nested returned or reborrowed aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                _ => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer source for `{}` requires an aggregate reference",
                        callee.name
                    )));
                }
            }
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate-buffer source for `{}` requires a direct aggregate borrow or named aggregate reference",
                callee.name
            )));
        }
    };
    if validate_owned_leaves {
        validate_aggregate_root_owned_leaves(
            source_layout,
            &root_name,
            owned_buffers,
            &format!("aggregate-buffer sub-slice result from `{}`", callee.name),
            machine_contract,
        )?;
    }
    for (parameter_index, (argument, parameter)) in
        call.arguments.iter().zip(&abi.params).enumerate()
    {
        if parameter_index == source_parameter
            || !matches!(parameter, MachineParameter::Owned { .. })
        {
            continue;
        }
        if let Some(moved_path) = explicit_owned_move_path(argument) {
            if moved_path == root_name
                || moved_path
                    .strip_prefix(&root_name)
                    .is_some_and(|suffix| suffix.starts_with('.'))
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} call to `{}` cannot move owned descendant `{moved_path}` while returning a slice tied to aggregate root `{root_name}`",
                    callee.name
                )));
            }
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = machine_parameter_abi_offset(&abi.params, source_parameter);
    let start_abi_index = machine_parameter_abi_offset(&abi.params, start_parameter);
    let end_abi_index = machine_parameter_abi_offset(&abi.params, end_parameter);
    let source_base = arguments[source_abi_index];
    let start = arguments[start_abi_index];
    let end = arguments[end_abi_index];
    let (buffer_base, buffer_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        source_base,
        field_offset,
        element_type,
    );
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_range_checks(
        builder,
        start,
        end,
        buffer_length,
        pointer_type,
        element_type.stack_size(),
        0,
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        buffer_base,
        start,
        element_type.stack_size(),
    );
    let expected_length = builder.ins().isub(end, start);
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 2 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer base-plus-length result",
            callee.name
        )));
    }
    let returned_base = results[0];
    let returned_length = results[1];
    validate_borrowed_slice_result(
        builder,
        module,
        returned_base,
        returned_length,
        element_type,
    );
    let wrong_base = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_base, TrapCode::unwrap_user(4));
    let wrong_length = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_length, expected_length);
    builder.ins().trapnz(wrong_length, TrapCode::unwrap_user(4));
    acquire_returned_aggregate_borrow(
        borrow_states,
        &root_name,
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;
    Ok(TypedReference {
        layout: TypedReferenceLayout::Slice {
            element_type,
            storage: SliceStorage::Returned {
                base: returned_base,
                length: returned_length,
                root: ReturnedSliceRoot::Stack(root_name),
            },
        },
        mutable,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_aggregate_buffer_element_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer element initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} aggregate-buffer element initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::AggregateBufferElementReference {
        machine_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        index_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed aggregate-buffer element",
            callee.name
        )));
    };
    let ReferenceTarget::Scalar(expected_type) = reference_type.target else {
        unreachable!("aggregate-buffer element results bind to scalar reference locals")
    };
    if expected_type != machine_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects `{}`, but `{}` returns a borrowed aggregate-buffer element `{}`",
            expected_type.name(),
            callee.name,
            machine_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the aggregate-buffer element result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer provenance is not an aggregate reference",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost aggregate layout `{source_layout_name}` for its buffer-element result",
            callee.name
        ))
    })?;
    if source_layout.abi_fingerprint(module.target_config().pointer_type())
        != source_layout_fingerprint
        || *source_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI disagrees with its aggregate source parameter",
            callee.name
        )));
    }
    if !matches!(
        abi.params.get(index_parameter),
        Some(MachineParameter::Scalar(MachineType::I32))
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` aggregate-buffer ABI lost its `i32` index coordinate",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its aggregate-buffer source argument",
            callee.name
        ))
    })?;
    let (root_name, validate_owned_leaves) = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer source for `{}` must be a complete aggregate root",
                    callee.name
                )));
            };
            (root.name.clone(), true)
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate-buffer result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Stack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => (source.name.clone(), false),
                TypedReferenceLayout::Aggregate {
                    storage:
                        AggregateReferenceStorage::ReturnedStack { .. }
                        | AggregateReferenceStorage::ParameterReborrow { .. }
                        | AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer result from `{}` cannot extend nested returned or reborrowed aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                _ => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate-buffer source for `{}` requires an aggregate reference",
                        callee.name
                    )));
                }
            }
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} aggregate-buffer source for `{}` requires a direct aggregate borrow or named aggregate reference",
                callee.name
            )));
        }
    };
    if validate_owned_leaves {
        validate_aggregate_root_owned_leaves(
            source_layout,
            &root_name,
            owned_buffers,
            &format!("aggregate-buffer element result from `{}`", callee.name),
            machine_contract,
        )?;
    }
    for (parameter_index, (argument, parameter)) in
        call.arguments.iter().zip(&abi.params).enumerate()
    {
        if parameter_index == source_parameter
            || !matches!(parameter, MachineParameter::Owned { .. })
        {
            continue;
        }
        if let Some(moved_path) = explicit_owned_move_path(argument) {
            if moved_path == root_name
                || moved_path
                    .strip_prefix(&root_name)
                    .is_some_and(|suffix| suffix.starts_with('.'))
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} call to `{}` cannot move owned descendant `{moved_path}` while returning an element tied to aggregate root `{root_name}`",
                    callee.name
                )));
            }
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = machine_parameter_abi_offset(&abi.params, source_parameter);
    let index_abi_index = machine_parameter_abi_offset(&abi.params, index_parameter);
    let source_base = arguments[source_abi_index];
    let index = arguments[index_abi_index];
    let (buffer_base, buffer_length) = load_owned_buffer_from_aggregate_pointer(
        builder,
        module,
        source_base,
        field_offset,
        machine_type,
    );
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_element_checks(
        builder,
        index,
        buffer_length,
        pointer_type,
        machine_type.stack_size(),
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        buffer_base,
        index,
        machine_type.stack_size(),
    );
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared aggregate-buffer element pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, machine_type);
    let wrong_element = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder
        .ins()
        .trapnz(wrong_element, TrapCode::unwrap_user(4));
    acquire_returned_aggregate_borrow(
        borrow_states,
        &root_name,
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;
    Ok(TypedReference {
        layout: TypedReferenceLayout::ReturnedAggregateBufferElement {
            machine_type,
            base: returned_base,
            root_name,
            source_layout_fingerprint,
            field_offset,
        },
        mutable,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_slice_element_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed slice-element initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed slice-element initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    let MachineResult::SliceElementReference {
        machine_type,
        source_parameter,
        index_parameter,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed slice-element reference",
            callee.name
        )));
    };
    let ReferenceTarget::Scalar(expected_type) = reference_type.target else {
        unreachable!("slice-element results bind to scalar reference locals")
    };
    if expected_type != machine_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects `{}`, but `{}` returns a borrowed slice element `{}`",
            expected_type.name(),
            callee.name,
            machine_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the borrowed slice-element result of `{}`",
            callee.name
        )));
    }
    let Some(MachineParameter::Slice {
        element_type: source_element,
        mutable: source_mutable,
        ..
    }) = abi.params.get(source_parameter)
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element provenance is not a slice reference",
            callee.name
        )));
    };
    if *source_element != machine_type || *source_mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI disagrees with its source parameter",
            callee.name
        )));
    }
    if !matches!(
        abi.params.get(index_parameter),
        Some(MachineParameter::Scalar(MachineType::I32))
    ) {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed slice-element ABI lost its `i32` index coordinate",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed slice-element source argument",
            callee.name
        ))
    })?;
    let root_name = resolve_returned_slice_element_root(
        source_argument,
        stack_slots,
        references,
        owned_buffers,
        &callee.name,
        machine_contract,
    )?;
    for (parameter_index, (argument, parameter)) in
        call.arguments.iter().zip(&abi.params).enumerate()
    {
        if parameter_index == source_parameter
            || !matches!(parameter, MachineParameter::Owned { .. })
        {
            continue;
        }
        if explicit_owned_move_path(argument).as_deref() == Some(root_name.as_str()) {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} call to `{}` cannot move slice owner `{root_name}` while returning an element reference tied to that root",
                callee.name
            )));
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = machine_parameter_abi_offset(&abi.params, source_parameter);
    let index_abi_index = machine_parameter_abi_offset(&abi.params, index_parameter);
    let source_base = arguments[source_abi_index];
    let source_length = arguments[source_abi_index + 1];
    let index = arguments[index_abi_index];
    let pointer_type = module.target_config().pointer_type();
    emit_runtime_slice_element_checks(
        builder,
        index,
        source_length,
        pointer_type,
        machine_type.stack_size(),
    );
    let expected_base = offset_runtime_slice_base(
        builder,
        pointer_type,
        source_base,
        index,
        machine_type.stack_size(),
    );
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed slice-element pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, machine_type);
    let wrong_element = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder
        .ins()
        .trapnz(wrong_element, TrapCode::unwrap_user(4));
    acquire_returned_slice_borrow(
        borrow_states,
        &root_name,
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;
    Ok(TypedReference {
        layout: TypedReferenceLayout::ReturnedSliceElement {
            machine_type,
            base: returned_base,
            root_name,
        },
        mutable,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_scalar_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed scalar initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed scalar initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    if matches!(
        abi.result,
        MachineResult::AggregateBufferElementReference { .. }
    ) {
        return lower_borrowed_aggregate_buffer_element_call_initializer(
            builder,
            module,
            functions,
            aggregate_layouts,
            locals,
            stack_slots,
            references,
            borrow_states,
            owned_buffers,
            reference_name,
            reference_type,
            call,
            machine_contract,
            memory_enabled,
        );
    }
    if matches!(abi.result, MachineResult::SliceElementReference { .. }) {
        return lower_borrowed_slice_element_call_initializer(
            builder,
            module,
            functions,
            locals,
            stack_slots,
            references,
            borrow_states,
            owned_buffers,
            reference_name,
            reference_type,
            call,
            machine_contract,
            memory_enabled,
        );
    }
    let MachineResult::ScalarReference {
        machine_type,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
    } = abi.result
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` does not return a borrowed scalar-field reference",
            callee.name
        )));
    };
    let ReferenceTarget::Scalar(expected_type) = reference_type.target else {
        unreachable!("scalar result initializers are dispatched by reference target")
    };
    if expected_type != machine_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects `{}`, but `{}` returns a borrowed `{}` field",
            expected_type.name(),
            callee.name,
            machine_type.name()
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the borrowed scalar result of `{}`",
            callee.name
        )));
    }
    let source_parameter_abi = abi.params.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost borrowed scalar parameter provenance",
            callee.name
        ))
    })?;
    let MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    } = source_parameter_abi
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar provenance is not an aggregate reference",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost aggregate layout `{source_layout_name}` for its borrowed scalar result",
            callee.name
        ))
    })?;
    if source_layout.abi_fingerprint(module.target_config().pointer_type())
        != source_layout_fingerprint
        || *source_mutable != mutable
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed scalar ABI disagrees with its aggregate source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed scalar source argument",
            callee.name
        ))
    })?;
    let (root_name, validate_owned_leaves) = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} borrowed scalar source for `{}` must be a complete aggregate root",
                    callee.name
                )));
            };
            (root.name.clone(), true)
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} borrowed scalar result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ReturnedStack { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed scalar result from `{}` cannot extend nested returned aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Stack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => (source.name.clone(), false),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ParameterReborrow { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed scalar result from `{}` cannot extend nested aggregate reborrow `{}`",
                        callee.name, source.name
                    )));
                }
                _ => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed scalar source for `{}` requires an aggregate reference; `{}` has incompatible reference storage",
                        callee.name, source.name
                    )));
                }
            }
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed scalar source for `{}` requires a direct aggregate borrow or named aggregate reference",
                callee.name
            )));
        }
    };
    if validate_owned_leaves {
        validate_aggregate_root_owned_leaves(
            source_layout,
            &root_name,
            owned_buffers,
            &format!("borrowed scalar result from `{}`", callee.name),
            machine_contract,
        )?;
    }
    for (index, (argument, parameter)) in call.arguments.iter().zip(&abi.params).enumerate() {
        if index == source_parameter || !matches!(parameter, MachineParameter::Owned { .. }) {
            continue;
        }
        if let Some(moved_path) = explicit_owned_move_path(argument) {
            if moved_path == root_name
                || moved_path
                    .strip_prefix(&root_name)
                    .is_some_and(|suffix| suffix.starts_with('.'))
            {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} call to `{}` cannot move owned descendant `{moved_path}` while returning a scalar reference tied to aggregate root `{root_name}`",
                    callee.name
                )));
            }
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = abi.params[..source_parameter]
        .iter()
        .map(|parameter| match parameter {
            MachineParameter::Scalar(_)
            | MachineParameter::Aggregate { .. }
            | MachineParameter::AggregateReference { .. } => 1,
            MachineParameter::Slice { .. } => 2,
            MachineParameter::Owned { .. } => 3,
        })
        .sum::<usize>();
    let source_base = arguments[source_abi_index];
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed scalar pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_scalar_reference_pointer(builder, returned_base, machine_type);
    let expected_base = if field_offset == 0 {
        source_base
    } else {
        builder.ins().iadd_imm(source_base, i64::from(field_offset))
    };
    let wrong_field = builder
        .ins()
        .icmp(IntCC::NotEqual, returned_base, expected_base);
    builder.ins().trapnz(wrong_field, TrapCode::unwrap_user(4));

    acquire_returned_aggregate_borrow(
        borrow_states,
        &root_name,
        mutable,
        reference_name,
        &callee.name,
        machine_contract,
    )?;
    Ok(TypedReference {
        layout: TypedReferenceLayout::ReturnedScalar {
            machine_type,
            base: returned_base,
            root_name,
            source_layout_fingerprint,
            field_offset,
        },
        mutable,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_borrowed_aggregate_call_initializer(
    builder: &mut FunctionBuilder<'_>,
    module: &mut ObjectModule,
    functions: &HashMap<String, TypedFunctionAbi>,
    aggregate_layouts: &HashMap<String, AggregateLayout>,
    locals: &HashMap<String, TypedValue>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &mut HashMap<String, BorrowState>,
    owned_buffers: &mut HashMap<String, OwnedBuffer>,
    reference_name: &str,
    reference_type: &ReferenceType,
    call: &CallExpression,
    machine_contract: &str,
    memory_enabled: bool,
) -> Result<TypedReference, NativeCompileError> {
    let AstNode::Identifier(callee) = call.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed reference initializer `{reference_name}` requires a named function"
        )));
    };
    let abi = functions.get(&callee.name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} borrowed reference initializer `{reference_name}` calls unknown function `{}`",
            callee.name
        ))
    })?;
    let (
        target_layout_fingerprint,
        source_parameter,
        source_layout_fingerprint,
        field_offset,
        mutable,
        is_subobject,
    ) = match abi.result {
        MachineResult::AggregateReference {
            layout_fingerprint,
            source_parameter,
            mutable,
        } => (
            layout_fingerprint,
            source_parameter,
            layout_fingerprint,
            0,
            mutable,
            false,
        ),
        MachineResult::AggregateSubobjectReference {
            target_layout_fingerprint,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            mutable,
        } => (
            target_layout_fingerprint,
            source_parameter,
            source_layout_fingerprint,
            field_offset,
            mutable,
            true,
        ),
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} function `{}` does not return a borrowed aggregate reference",
                callee.name
            )));
        }
    };
    let ReferenceTarget::Aggregate(expected_layout_name) = &reference_type.target else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} borrowed result from `{}` must bind to an aggregate reference local",
            callee.name
        )));
    };
    let expected_layout = aggregate_layouts
        .get(expected_layout_name)
        .expect("parsed aggregate references retain a known layout");
    if expected_layout.abi_fingerprint(module.target_config().pointer_type())
        != target_layout_fingerprint
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` expects `{expected_layout_name}`, but `{}` returns an incompatible aggregate reference",
            callee.name
        )));
    }
    if reference_type.mutable != mutable {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{reference_name}` mutability must match the borrowed result of `{}`",
            callee.name
        )));
    }
    let source_parameter_abi = abi.params.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost borrowed-result parameter provenance",
            callee.name
        ))
    })?;
    let MachineParameter::AggregateReference {
        layout_name: source_layout_name,
        mutable: source_mutable,
        ..
    } = source_parameter_abi
    else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-result provenance is not an aggregate reference",
            callee.name
        )));
    };
    let source_layout = aggregate_layouts.get(source_layout_name).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} function `{}` lost source aggregate layout `{source_layout_name}`",
            callee.name
        ))
    })?;
    if source_layout.abi_fingerprint(module.target_config().pointer_type())
        != source_layout_fingerprint
        || *source_mutable != mutable
        || (!is_subobject && source_layout_name != expected_layout_name)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` borrowed-result ABI disagrees with its source parameter",
            callee.name
        )));
    }
    let source_argument = call.arguments.get(source_parameter).ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} call to `{}` omitted its borrowed-result source argument",
            callee.name
        ))
    })?;
    let (root_name, validate_owned_leaves) = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} borrowed result source for `{}` must be a complete aggregate root",
                    callee.name
                )));
            };
            (root.name.clone(), true)
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} borrowed result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Stack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => (source.name.clone(), false),
                TypedReferenceLayout::Aggregate {
                    storage:
                        AggregateReferenceStorage::ReturnedStack { .. }
                        | AggregateReferenceStorage::ParameterReborrow { .. }
                        | AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } if is_subobject => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed aggregate subobject result from `{}` cannot extend nested returned or reborrowed aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ReturnedStack { slot_name },
                    ..
                } => (slot_name.clone(), true),
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ParameterReborrow { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result from `{}` cannot extend a nested aggregate reborrow `{}`",
                        callee.name, source.name
                    )));
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result from `{}` cannot extend nested returned aggregate subobject `{}`",
                        callee.name, source.name
                    )));
                }
                _ => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result source for `{}` requires an aggregate reference",
                        callee.name
                    )));
                }
            }
        }
        _ => {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} borrowed result source for `{}` requires a direct aggregate borrow or named aggregate reference",
                callee.name
            )));
        }
    };
    if validate_owned_leaves {
        validate_aggregate_root_owned_leaves(
            source_layout,
            &root_name,
            owned_buffers,
            &format!("borrowed result from `{}`", callee.name),
            machine_contract,
        )?;
    }
    if is_subobject {
        for (index, (argument, parameter)) in call.arguments.iter().zip(&abi.params).enumerate() {
            if index == source_parameter || !matches!(parameter, MachineParameter::Owned { .. }) {
                continue;
            }
            if let Some(moved_path) = explicit_owned_move_path(argument) {
                if moved_path == root_name
                    || moved_path
                        .strip_prefix(&root_name)
                        .is_some_and(|suffix| suffix.starts_with('.'))
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} call to `{}` cannot move owned descendant `{moved_path}` while returning an aggregate subobject tied to root `{root_name}`",
                        callee.name
                    )));
                }
            }
        }
    }
    let arguments = lower_call_arguments_with_ownership(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        owned_buffers,
        call,
        abi,
        machine_contract,
        memory_enabled,
    )?;
    let source_abi_index = abi.params[..source_parameter]
        .iter()
        .map(|parameter| match parameter {
            MachineParameter::Scalar(_)
            | MachineParameter::Aggregate { .. }
            | MachineParameter::AggregateReference { .. } => 1,
            MachineParameter::Slice { .. } => 2,
            MachineParameter::Owned { .. } => 3,
        })
        .sum::<usize>();
    let source_base = arguments[source_abi_index];
    let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
    let call_inst = builder.ins().call(local_callee, &arguments);
    let results = builder.inst_results(call_inst);
    if results.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} function `{}` did not produce its declared borrowed pointer result",
            callee.name
        )));
    }
    let returned_base = results[0];
    validate_aggregate_reference_pointer(builder, returned_base, expected_layout);
    if is_subobject {
        let expected_base = if field_offset == 0 {
            source_base
        } else {
            builder.ins().iadd_imm(source_base, i64::from(field_offset))
        };
        let wrong_field = builder
            .ins()
            .icmp(IntCC::NotEqual, returned_base, expected_base);
        builder.ins().trapnz(wrong_field, TrapCode::unwrap_user(4));
    }

    let storage = match source_argument {
        AstNode::UnaryExpression(borrow) => {
            let AstNode::Identifier(root) = borrow.argument.as_ref() else {
                unreachable!("aggregate call lowering validates direct borrowed roots")
            };
            let slot = stack_slots.get(&root.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} borrowed result from `{}` lost caller root `{}`",
                    callee.name, root.name
                ))
            })?;
            let StackSlotLayout::Aggregate(layout) = &slot.layout else {
                unreachable!("aggregate call lowering validates aggregate roots")
            };
            if layout.name != source_layout.name {
                unreachable!("aggregate call lowering validates source layouts")
            }
            acquire_returned_aggregate_borrow(
                borrow_states,
                &root.name,
                mutable,
                reference_name,
                &callee.name,
                machine_contract,
            )?;
            if is_subobject {
                AggregateReferenceStorage::ReturnedSubobject {
                    base: returned_base,
                    root_name: root.name.clone(),
                }
            } else {
                AggregateReferenceStorage::ReturnedStack {
                    slot_name: root.name.clone(),
                }
            }
        }
        AstNode::Identifier(source) => {
            let source_reference = references.get(&source.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} borrowed result from `{}` lost source reference `{}`",
                    callee.name, source.name
                ))
            })?;
            match &source_reference.layout {
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ReturnedStack { .. },
                    ..
                } if matches!(
                    machine_contract,
                    BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                        | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                        | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                        | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                        | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                        | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                        | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                        | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                        | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                        | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                ) =>
                {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result from `{}` cannot extend nested returned aggregate `{}`",
                        callee.name, source.name
                    )));
                }
                TypedReferenceLayout::Aggregate {
                    storage:
                        AggregateReferenceStorage::Stack { slot_name }
                        | AggregateReferenceStorage::ReturnedStack { slot_name },
                    ..
                } => {
                    acquire_returned_aggregate_borrow(
                        borrow_states,
                        slot_name,
                        mutable,
                        reference_name,
                        &callee.name,
                        machine_contract,
                    )?;
                    if is_subobject {
                        AggregateReferenceStorage::ReturnedSubobject {
                            base: returned_base,
                            root_name: slot_name.clone(),
                        }
                    } else {
                        AggregateReferenceStorage::ReturnedStack {
                            slot_name: slot_name.clone(),
                        }
                    }
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::Parameter { .. },
                    ..
                } => {
                    acquire_returned_aggregate_borrow(
                        borrow_states,
                        &source.name,
                        mutable,
                        reference_name,
                        &callee.name,
                        machine_contract,
                    )?;
                    if is_subobject {
                        AggregateReferenceStorage::ReturnedSubobject {
                            base: returned_base,
                            root_name: source.name.clone(),
                        }
                    } else {
                        AggregateReferenceStorage::ParameterReborrow {
                            base: returned_base,
                            root_name: source.name.clone(),
                        }
                    }
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ParameterReborrow { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result from `{}` cannot extend a nested aggregate reborrow `{}`",
                        callee.name, source.name
                    )));
                }
                TypedReferenceLayout::Aggregate {
                    storage: AggregateReferenceStorage::ReturnedSubobject { .. },
                    ..
                } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} borrowed result from `{}` cannot extend nested returned aggregate subobject `{}`",
                        callee.name, source.name
                    )));
                }
                _ => unreachable!("aggregate call lowering validates aggregate references"),
            }
        }
        _ => unreachable!("aggregate call lowering validates borrowed-result source arguments"),
    };

    Ok(TypedReference {
        layout: TypedReferenceLayout::Aggregate {
            layout: expected_layout.clone(),
            storage,
        },
        mutable,
    })
}

fn acquire_returned_aggregate_borrow(
    borrow_states: &mut HashMap<String, BorrowState>,
    root_name: &str,
    mutable: bool,
    reference_name: &str,
    callee_name: &str,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    if let Some(descendant) =
        root_has_conflicting_descendant_borrow(borrow_states, root_name, mutable)
    {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot bind returned reference `{reference_name}` from `{callee_name}` because descendant `{descendant}` already has a conflicting borrow"
        )));
    }
    let state = borrow_states.entry(root_name.to_string()).or_default();
    if state.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot bind returned reference `{reference_name}` from `{callee_name}` because aggregate `{root_name}` was moved"
        )));
    }
    if mutable {
        if state.shared > 0 || state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot bind returned mutable reference `{reference_name}` from `{callee_name}` because caller root `{root_name}` already has an active borrow"
            )));
        }
        state.exclusive = true;
    } else {
        if state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot bind returned shared reference `{reference_name}` from `{callee_name}` because caller root `{root_name}` is exclusively borrowed"
            )));
        }
        state.shared += 1;
    }
    Ok(())
}

struct ReferenceInitializerContext<'a> {
    stack_slots: &'a HashMap<String, TypedStackSlot>,
    references: &'a HashMap<String, TypedReference>,
    aggregate_layouts: &'a HashMap<String, AggregateLayout>,
    owned_buffers: &'a HashMap<String, OwnedBuffer>,
    borrow_states: &'a mut HashMap<String, BorrowState>,
    machine_contract: &'a str,
}

fn acquire_parameter_reborrow(
    root_name: &str,
    mutable: bool,
    borrow_states: &mut HashMap<String, BorrowState>,
    machine_contract: &str,
) -> Result<(), NativeCompileError> {
    let state = borrow_states.entry(root_name.to_string()).or_default();
    if mutable {
        if state.exclusive || state.shared > 0 {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot mutably reborrow aggregate reference parameter `{root_name}` because an active reborrow already exists"
            )));
        }
        state.exclusive = true;
    } else {
        if state.exclusive {
            return Err(NativeCompileError::new(format!(
                "{machine_contract} cannot immutably reborrow aggregate reference parameter `{root_name}` because an exclusive reborrow is active"
            )));
        }
        state.shared += 1;
    }
    Ok(())
}

fn lower_reference_initializer(
    reference_name: &str,
    reference_type: ReferenceType,
    initializer: &AstNode,
    context: ReferenceInitializerContext<'_>,
) -> Result<TypedReference, NativeCompileError> {
    let ReferenceInitializerContext {
        stack_slots,
        references,
        aggregate_layouts,
        owned_buffers,
        borrow_states,
        machine_contract,
    } = context;
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
            if matches!(borrow.argument.as_ref(), AstNode::MemberExpression(_)) {
                if !aggregate_references_enabled(machine_contract) {
                    return Err(NativeCompileError::new(format!(
                        "field references are not enabled by {machine_contract}; reference `{reference_name}` must borrow a scalar stack slot"
                    )));
                }
                let path = owned_buffer_path(borrow.argument.as_ref()).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} reference `{reference_name}` requires a named aggregate scalar field"
                    ))
                })?;
                let mut segments = path.split('.');
                let root_name = segments
                    .next()
                    .expect("aggregate field paths always contain a root");
                let field_names = segments.collect::<Vec<_>>();
                if let Some(source) = references.get(root_name) {
                    if !aggregate_reborrows_enabled(machine_contract) {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} reference `{reference_name}` cannot reborrow through aggregate reference `{root_name}`; reborrow chains are not enabled"
                        )));
                    }
                    let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} reference `{reference_name}` requires aggregate-reference parameter provenance; `{root_name}` is not an aggregate reference"
                        )));
                    };
                    let AggregateReferenceStorage::Parameter { base } = storage else {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot reborrow aggregate reference `{root_name}`; v18 permits one parameter reborrow layer"
                        )));
                    };
                    if reference_type.mutable && !source.mutable {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot mutably reborrow immutable aggregate reference parameter `{root_name}`"
                        )));
                    }
                    let (machine_type, offset) = resolve_aggregate_scalar_projection(
                        layout,
                        &field_names,
                        &path,
                        machine_contract,
                    )?;
                    if machine_type != expected {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} reference `{reference_name}` expects `{}`, but aggregate field `{path}` stores `{}`",
                            expected.name(),
                            machine_type.name()
                        )));
                    }
                    acquire_parameter_reborrow(
                        root_name,
                        reference_type.mutable,
                        borrow_states,
                        machine_contract,
                    )?;
                    return Ok(TypedReference {
                        layout: TypedReferenceLayout::ParameterScalar {
                            machine_type,
                            base: *base,
                            offset,
                            root_name: root_name.to_string(),
                        },
                        mutable: reference_type.mutable,
                    });
                }
                let stack_slot = stack_slots.get(root_name).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} reference `{reference_name}` requires a declared aggregate slot; `{root_name}` is not addressable"
                    ))
                })?;
                let StackSlotLayout::Aggregate(root_layout) = &stack_slot.layout else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} reference `{reference_name}` requires an aggregate field; `{root_name}` has incompatible storage"
                    )));
                };
                let (machine_type, offset) = resolve_aggregate_scalar_projection(
                    root_layout,
                    &field_names,
                    &path,
                    machine_contract,
                )?;
                if machine_type != expected {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} reference `{reference_name}` expects `{}`, but aggregate field `{path}` stores `{}`",
                        expected.name(),
                        machine_type.name()
                    )));
                }
                (
                    root_name.to_string(),
                    TypedReferenceLayout::Scalar {
                        machine_type,
                        slot_name: root_name.to_string(),
                        offset,
                    },
                )
            } else {
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
                        "{machine_contract} reference `{reference_name}` cannot borrow aggregate stack slot `{}` without an aggregate reference type or field projection",
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
                        offset: 0,
                    },
                )
            }
        }
        ReferenceTarget::Aggregate(expected_name) => {
            if !aggregate_references_enabled(machine_contract) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} does not enable aggregate references"
                )));
            }
            let AstNode::Identifier(identifier) = borrow.argument.as_ref() else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` requires a complete named aggregate root; reborrows and nested aggregate borrows are not enabled"
                )));
            };
            if let Some(source) = references.get(&identifier.name) {
                if !aggregate_reborrows_enabled(machine_contract) {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{reference_name}` cannot borrow reference `{}`; reborrows and nested aggregate borrows are not enabled",
                        identifier.name
                    )));
                }
                let TypedReferenceLayout::Aggregate { layout, storage } = &source.layout else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{reference_name}` requires aggregate-reference parameter provenance; `{}` is not an aggregate reference",
                        identifier.name
                    )));
                };
                let AggregateReferenceStorage::Parameter { base } = storage else {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} cannot reborrow aggregate reference `{}`; v18 permits one parameter reborrow layer",
                        identifier.name
                    )));
                };
                if !source.mutable && reference_type.mutable {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} cannot mutably reborrow immutable aggregate reference parameter `{}`",
                        identifier.name
                    )));
                }
                let expected_layout = aggregate_layouts.get(&expected_name).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{reference_name}` names unknown aggregate type `{expected_name}`"
                    ))
                })?;
                if layout.name != expected_layout.name {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate reference `{reference_name}` expects `{expected_name}`, but reference parameter `{}` points to `{}`",
                        identifier.name,
                        layout.name
                    )));
                }
                acquire_parameter_reborrow(
                    &identifier.name,
                    reference_type.mutable,
                    borrow_states,
                    machine_contract,
                )?;
                return Ok(TypedReference {
                    layout: TypedReferenceLayout::Aggregate {
                        layout: layout.clone(),
                        storage: AggregateReferenceStorage::ParameterReborrow {
                            base: *base,
                            root_name: identifier.name.clone(),
                        },
                    },
                    mutable: reference_type.mutable,
                });
            }
            let stack_slot = stack_slots.get(&identifier.name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` requires a declared aggregate slot; `{}` is not addressable",
                    identifier.name
                ))
            })?;
            let StackSlotLayout::Aggregate(layout) = &stack_slot.layout else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` requires aggregate storage; `{}` is not an aggregate",
                    identifier.name
                )));
            };
            let expected_layout = aggregate_layouts.get(&expected_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` names unknown aggregate type `{expected_name}`"
                ))
            })?;
            if layout.name != expected_layout.name {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` expects `{expected_name}`, but stack slot `{}` stores `{}`",
                    identifier.name,
                    layout.name
                )));
            }
            (
                identifier.name.clone(),
                TypedReferenceLayout::Aggregate {
                    layout: layout.clone(),
                    storage: AggregateReferenceStorage::Stack {
                        slot_name: identifier.name.clone(),
                    },
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
                    | OWNED_BUFFER_MACHINE_CONTRACT
                    | OWNED_AGGREGATE_MACHINE_CONTRACT
                    | AFFINE_AGGREGATE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
                    | AGGREGATE_REBORROW_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | BOUNDED_BYTE_BUFFER_MACHINE_CONTRACT
            ) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} does not enable borrowed slice values"
                )));
            }
            if let Some(owner_name) = owned_buffer_path(borrow.argument.as_ref()) {
                if let Some(owner) = owned_buffers.get(&owner_name) {
                    match owner.state {
                        OwnedBufferState::Live => {}
                        OwnedBufferState::Moved => {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} cannot borrow owned buffer `{}` after move",
                                owner_name
                            )));
                        }
                        OwnedBufferState::Dropped => {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} cannot borrow owned buffer `{}` after drop",
                                owner_name
                            )));
                        }
                    }
                    if owner.element_type != expected_element {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} slice reference `{reference_name}` expects elements of `{}`, but owned buffer `{}` stores `{}`",
                            expected_element.name(),
                            owner_name,
                            owner.element_type.name()
                        )));
                    }
                    let slot_name = owner_name.clone();
                    let layout = TypedReferenceLayout::Slice {
                        element_type: owner.element_type,
                        storage: SliceStorage::Heap {
                            owner_name,
                            base: owner.base,
                            length: owner.length,
                        },
                    };
                    let state = borrow_states.entry(slot_name.clone()).or_default();
                    if state.aggregate_moved {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot borrow aggregate `{slot_name}` after move"
                        )));
                    }
                    if reference_type.mutable {
                        if state.exclusive || state.shared > 0 {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} cannot mutably borrow owned buffer `{slot_name}` because an active borrow already exists"
                            )));
                        }
                        state.exclusive = true;
                    } else {
                        if state.exclusive {
                            return Err(NativeCompileError::new(format!(
                                "{machine_contract} cannot immutably borrow owned buffer `{slot_name}` because an exclusive borrow is active"
                            )));
                        }
                        state.shared += 1;
                    }
                    return Ok(TypedReference {
                        layout,
                        mutable: reference_type.mutable,
                    });
                }
            }

            let AstNode::MemberExpression(range_access) = borrow.argument.as_ref() else {
                let source_boundary = if owned_buffers_enabled(machine_contract) {
                    "a whole owned buffer or a half-open fixed-array range"
                } else {
                    "a half-open fixed-array range"
                };
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} slice reference `{reference_name}` requires {source_boundary}"
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
    if state.aggregate_moved {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} cannot borrow aggregate `{slot_name}` after move"
        )));
    }
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

#[allow(clippy::too_many_arguments)]
fn lower_reference_dereference(
    builder: &mut FunctionBuilder<'_>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
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
        let message = match &reference.layout {
            TypedReferenceLayout::Slice { .. } => format!(
                "{machine_contract} slice reference `{}` must be indexed; it cannot be dereferenced as a scalar",
                identifier.name
            ),
            TypedReferenceLayout::Aggregate { .. } => format!(
                "{machine_contract} aggregate reference `{}` requires a scalar field projection; it cannot be dereferenced as a scalar",
                identifier.name
            ),
            TypedReferenceLayout::Scalar { .. }
            | TypedReferenceLayout::ParameterScalar { .. }
            | TypedReferenceLayout::ReturnedScalar { .. }
            | TypedReferenceLayout::ReturnedSliceElement { .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { .. } => {
                unreachable!("scalar pointee was checked")
            }
        };
        return Err(NativeCompileError::new(message));
    };
    if pointee != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but reference `{}` points to `{}`; implicit coercions are forbidden",
            expected.name(),
            identifier.name,
            pointee.name()
        )));
    }
    validate_reference_lease(reference, &identifier.name, borrow_states, machine_contract)?;
    let value =
        match &reference.layout {
            TypedReferenceLayout::Scalar {
                slot_name, offset, ..
            } => {
                let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                    NativeCompileError::new(format!(
                        "{machine_contract} reference `{}` lost its stack-slot provenance",
                        identifier.name
                    ))
                })?;
                builder.ins().stack_load(
                    pointee.ir_type(),
                    stack_slot.slot,
                    i32::try_from(*offset).expect("aggregate offsets are validated"),
                )
            }
            TypedReferenceLayout::ParameterScalar { base, offset, .. } => builder.ins().load(
                pointee.ir_type(),
                MemFlags::new(),
                *base,
                i32::try_from(*offset).expect("aggregate offsets are validated"),
            ),
            TypedReferenceLayout::ReturnedScalar { base, .. }
            | TypedReferenceLayout::ReturnedSliceElement { base, .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { base, .. } => builder
                .ins()
                .load(pointee.ir_type(), MemFlags::new(), *base, 0),
            TypedReferenceLayout::Slice { .. } | TypedReferenceLayout::Aggregate { .. } => {
                unreachable!("scalar references always retain scalar layout")
            }
        };
    Ok(TypedValue {
        value,
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
        let guidance = match &reference.layout {
            TypedReferenceLayout::Slice { .. } => {
                format!("use `store({}[index], value)`", identifier.name)
            }
            TypedReferenceLayout::Aggregate { .. } => {
                format!("use `store({}.field, value)`", identifier.name)
            }
            TypedReferenceLayout::Scalar { .. }
            | TypedReferenceLayout::ParameterScalar { .. }
            | TypedReferenceLayout::ReturnedScalar { .. }
            | TypedReferenceLayout::ReturnedSliceElement { .. }
            | TypedReferenceLayout::ReturnedAggregateBufferElement { .. } => {
                unreachable!("scalar pointee was checked")
            }
        };
        return Err(NativeCompileError::new(format!(
            "{machine_contract} reference `{}` cannot be assigned as a scalar; {guidance}",
            identifier.name
        )));
    };
    validate_reference_lease(reference, &identifier.name, borrow_states, machine_contract)?;
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
    match &reference.layout {
        TypedReferenceLayout::Scalar {
            slot_name, offset, ..
        } => {
            let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} reference `{}` lost its stack-slot provenance",
                    identifier.name
                ))
            })?;
            builder.ins().stack_store(
                value.value,
                stack_slot.slot,
                i32::try_from(*offset).expect("aggregate offsets are validated"),
            );
        }
        TypedReferenceLayout::ParameterScalar { base, offset, .. } => {
            builder.ins().store(
                MemFlags::new(),
                value.value,
                *base,
                i32::try_from(*offset).expect("aggregate offsets are validated"),
            );
        }
        TypedReferenceLayout::ReturnedScalar { base, .. }
        | TypedReferenceLayout::ReturnedSliceElement { base, .. }
        | TypedReferenceLayout::ReturnedAggregateBufferElement { base, .. } => {
            builder.ins().store(MemFlags::new(), value.value, *base, 0);
        }
        TypedReferenceLayout::Slice { .. } | TypedReferenceLayout::Aggregate { .. } => {
            unreachable!("scalar references always retain scalar layout")
        }
    }
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
            if expected == MachineType::F32 {
                let value = number.raw.parse::<f32>().map_err(|_| {
                    NativeCompileError::new(format!(
                        "{machine_contract} {context} requires a finite `f32` literal; found `{}`",
                        number.raw
                    ))
                })?;
                if !value.is_finite() {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} {context} requires a finite `f32` literal; found `{}`",
                        number.raw
                    )));
                }
                return Ok(TypedValue {
                    value: builder.ins().f32const(value),
                    machine_type: MachineType::F32,
                });
            }
            if expected == MachineType::F64 {
                let value = number.raw.parse::<f64>().map_err(|_| {
                    NativeCompileError::new(format!(
                        "{machine_contract} {context} requires a finite `f64` literal; found `{}`",
                        number.raw
                    ))
                })?;
                if !value.is_finite() {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} {context} requires a finite `f64` literal; found `{}`",
                        number.raw
                    )));
                }
                return Ok(TypedValue {
                    value: builder.ins().f64const(value),
                    machine_type: MachineType::F64,
                });
            }
            let value = match expected {
                MachineType::Bool => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} {context} expects `bool`, but `{}` is an integer literal",
                        number.raw
                    )));
                }
                MachineType::U8 => number
                    .raw
                    .parse::<u16>()
                    .ok()
                    .filter(|value| *value <= u16::from(u8::MAX))
                    .map(i64::from)
                    .ok_or_else(|| {
                        NativeCompileError::new(format!(
                            "{machine_contract} {context} requires a `u8` literal in the range 0..=255; found `{}`",
                            number.raw
                        ))
                    })?,
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
                MachineType::F32 => unreachable!("f32 literals return above"),
                MachineType::F64 => unreachable!("f64 literals return above"),
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
                let message = match &reference.layout {
                    TypedReferenceLayout::Scalar { .. }
                    | TypedReferenceLayout::ParameterScalar { .. }
                    | TypedReferenceLayout::ReturnedScalar { .. }
                    | TypedReferenceLayout::ReturnedSliceElement { .. }
                    | TypedReferenceLayout::ReturnedAggregateBufferElement { .. } => format!(
                        "{machine_contract} reference `{}` cannot escape as a scalar value; dereference it with `*{}`",
                        identifier.name, identifier.name
                    ),
                    TypedReferenceLayout::Slice { .. } => format!(
                        "{machine_contract} slice reference `{}` cannot escape as a scalar value; index it with `{}[index]`",
                        identifier.name, identifier.name
                    ),
                    TypedReferenceLayout::Aggregate { .. } => format!(
                        "{machine_contract} aggregate reference `{}` cannot escape as a scalar value; project a field with `{}.field`",
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
            if matches!(expected, MachineType::Bool | MachineType::U8) {
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
                value: if expected.is_float() {
                    builder.ins().fneg(argument.value)
                } else {
                    builder.ins().ineg(argument.value)
                },
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
            borrow_states,
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
        AstNode::BinaryExpression(binary) if binary.operator == "??" => {
            return lower_uncertain_coalesce(
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
            let value = match (expected, binary.operator.as_str()) {
                (MachineType::F32, "+") => builder.ins().fadd(left.value, right.value),
                (MachineType::F32, "-") => builder.ins().fsub(left.value, right.value),
                (MachineType::F32, "*") => builder.ins().fmul(left.value, right.value),
                (MachineType::F32, "/") => builder.ins().fdiv(left.value, right.value),
                (MachineType::F64, "+") => builder.ins().fadd(left.value, right.value),
                (MachineType::F64, "-") => builder.ins().fsub(left.value, right.value),
                (MachineType::F64, "*") => builder.ins().fmul(left.value, right.value),
                (MachineType::F64, "/") => builder.ins().fdiv(left.value, right.value),
                (_, "+") => builder.ins().iadd(left.value, right.value),
                (_, "-") => builder.ins().isub(left.value, right.value),
                (_, "*") => builder.ins().imul(left.value, right.value),
                (MachineType::I32 | MachineType::I64, "/") => lower_checked_integer_division(
                    builder,
                    left.value,
                    right.value,
                    expected,
                    false,
                ),
                (MachineType::I32 | MachineType::I64, "%") => {
                    lower_checked_integer_division(builder, left.value, right.value, expected, true)
                }
                (_, operator) => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} does not support binary operator `{operator}` for `{}`",
                        expected.name()
                    )));
                }
            };
            trap_non_finite_float(builder, value, expected);
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
            if memory_enabled && matches!(callee.name.as_str(), "isKnown" | "unknownReason") {
                return lower_uncertain_metadata_read(
                    builder,
                    stack_slots,
                    references,
                    borrow_states,
                    call,
                    expected,
                    &callee.name,
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
            let result_type = match abi.result {
                MachineResult::Scalar(result_type) => result_type,
                MachineResult::AggregateReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed aggregate reference; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::AggregateSubobjectReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed aggregate subobject; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::ScalarReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed scalar-field reference; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::SliceElementReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed slice-element reference; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::AggregateBufferElementReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed aggregate-buffer element; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::AggregateBufferSliceReference { .. }
                | MachineResult::AggregateBufferWholeSliceReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed aggregate-buffer slice; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::SliceReference { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} `{}` returns a borrowed slice reference; bind it to a typed reference local",
                        callee.name
                    )));
                }
                MachineResult::Owned(_) | MachineResult::Aggregate { .. } => {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} {context} expects `{}`, but `{}` returns ownership; bind the result to an owned `[T]` local",
                        expected.name(),
                        callee.name
                    )));
                }
            };
            if result_type != expected {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} {context} expects `{}`, but `{}` returns `{}`; implicit coercions are forbidden",
                    expected.name(),
                    callee.name,
                    result_type.name()
                )));
            }
            let mut arguments = Vec::with_capacity(call.arguments.len() * 2);
            let mut call_borrows = HashMap::new();
            for (index, (argument, parameter)) in call
                .arguments
                .iter()
                .zip(abi.params.iter().cloned())
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
                        ..
                    } => {
                        let (base, length) = lower_borrowed_slice_call_argument(
                            builder,
                            module,
                            functions,
                            locals,
                            stack_slots,
                            references,
                            None,
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
                    MachineParameter::AggregateReference {
                        layout_name,
                        mutable,
                        ..
                    } => arguments.push(lower_borrowed_aggregate_call_argument(
                        builder,
                        module,
                        stack_slots,
                        references,
                        borrow_states,
                        &mut call_borrows,
                        argument,
                        &layout_name,
                        mutable,
                        index,
                        &callee.name,
                        machine_contract,
                    )?),
                    MachineParameter::Owned { .. } | MachineParameter::Aggregate { .. } => {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} call to `{}` consumes ownership and must be used as a direct typed initializer or return expression",
                            callee.name
                        )));
                    }
                }
            }
            let local_callee = module.declare_func_in_func(abi.func_id, builder.func);
            let call = builder.ins().call(local_callee, &arguments);
            TypedValue {
                value: builder.inst_results(call)[0],
                machine_type: result_type,
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
    owned_buffers: Option<&HashMap<String, OwnedBuffer>>,
    borrow_states: &HashMap<String, BorrowState>,
    call_borrows: &mut HashMap<CallBorrowRoot, BorrowState>,
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
    if let AstNode::Identifier(root) = borrow.argument.as_ref() {
        if let Some(owned_buffers) = owned_buffers {
            if let Some(owner) = owned_buffers.get(&root.name) {
                match owner.state {
                    OwnedBufferState::Live => {}
                    OwnedBufferState::Moved => {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot borrow owned buffer `{}` after move",
                            root.name
                        )));
                    }
                    OwnedBufferState::Dropped => {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot borrow owned buffer `{}` after drop",
                            root.name
                        )));
                    }
                }
                if owner.element_type != expected_element {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} slice argument {} to `{callee_name}` expects elements of `{}`, but owned buffer `{}` stores `{}`",
                        argument_index + 1,
                        expected_element.name(),
                        root.name,
                        owner.element_type.name()
                    )));
                }
                let active = borrow_states.get(&root.name).copied().unwrap_or_default();
                let siblings = call_borrows
                    .entry(CallBorrowRoot::Owned(root.name.clone()))
                    .or_default();
                if mutable {
                    if active.exclusive
                        || active.shared > 0
                        || siblings.exclusive
                        || siblings.shared > 0
                    {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot mutably borrow owned buffer `{}` for call to `{callee_name}` because an active or sibling borrow exists",
                            root.name
                        )));
                    }
                    siblings.exclusive = true;
                } else {
                    if active.exclusive || siblings.exclusive {
                        return Err(NativeCompileError::new(format!(
                            "{machine_contract} cannot immutably borrow owned buffer `{}` for call to `{callee_name}` because an exclusive borrow exists",
                            root.name
                        )));
                    }
                    siblings.shared += 1;
                }
                return Ok((owner.base, owner.length));
            }
        }
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
        .entry(CallBorrowRoot::Stack(root.name.clone()))
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
    call_borrows: &mut HashMap<CallBorrowRoot, BorrowState>,
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
        SLICE_FORWARD_MACHINE_CONTRACT
            | SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
            | OWNED_BUFFER_MACHINE_CONTRACT
            | OWNED_AGGREGATE_MACHINE_CONTRACT
            | AFFINE_AGGREGATE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_MACHINE_CONTRACT
            | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
            | AGGREGATE_REBORROW_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
            | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
            | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
            | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
            | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
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
        Some((_, range_node))
            if matches!(
                machine_contract,
                SLICE_DYNAMIC_FORWARD_MACHINE_CONTRACT
                    | OWNED_BUFFER_MACHINE_CONTRACT
                    | OWNED_AGGREGATE_MACHINE_CONTRACT
                    | AFFINE_AGGREGATE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_MACHINE_CONTRACT
                    | AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT
                    | AGGREGATE_REBORROW_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_RETURN_MACHINE_CONTRACT
                    | BORROWED_SCALAR_FIELD_FORWARD_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_SUBOBJECT_RETURN_MACHINE_CONTRACT
                    | BORROWED_SLICE_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_ELEMENT_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_SUBSLICE_RETURN_MACHINE_CONTRACT
                    | BORROWED_AGGREGATE_BUFFER_WHOLE_SLICE_RETURN_MACHINE_CONTRACT
                    | COMPOSITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
                    | CONDITIONAL_BORROW_SUMMARY_MACHINE_CONTRACT
            ) =>
        {
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
            CallBorrowRoot::Stack(slot_name.clone())
        }
        SliceStorage::Parameter { .. } => CallBorrowRoot::Parameter,
        SliceStorage::Heap { owner_name, .. } => {
            let active = borrow_states.get(owner_name).copied().unwrap_or_default();
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
            CallBorrowRoot::Owned(owner_name.clone())
        }
        SliceStorage::Returned { root, .. } => {
            let root_name = root.name();
            let active = borrow_states.get(root_name).copied().unwrap_or_default();
            if reference.mutable {
                if !active.exclusive {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} lost the exclusive caller-root lease for returned mutable slice `{reference_name}`"
                    )));
                }
            } else if active.shared == 0 {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} lost the caller-root lease for returned slice `{reference_name}`"
                )));
            }
            match root {
                ReturnedSliceRoot::Stack(name) => CallBorrowRoot::Stack(name.clone()),
                ReturnedSliceRoot::Heap(name) => CallBorrowRoot::Owned(name.clone()),
            }
        }
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
        SliceStorage::Parameter { base, length }
        | SliceStorage::Heap { base, length, .. }
        | SliceStorage::Returned { base, length, .. } => match forwarded_range {
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

fn emit_runtime_slice_element_checks(
    builder: &mut FunctionBuilder<'_>,
    index: Value,
    source_length: Value,
    pointer_type: Type,
    element_size: u32,
) {
    let negative = builder.ins().icmp_imm(IntCC::SignedLessThan, index, 0);
    builder.ins().trapnz(negative, TrapCode::unwrap_user(1));
    let outside = builder
        .ins()
        .icmp(IntCC::SignedGreaterThanOrEqual, index, source_length);
    builder.ins().trapnz(outside, TrapCode::unwrap_user(1));
    if let Some(max_index) = runtime_slice_start_limit(pointer_type, element_size, 0) {
        let offset_overflows =
            builder
                .ins()
                .icmp_imm(IntCC::UnsignedGreaterThan, index, i64::from(max_index));
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
    call_borrows: &mut HashMap<CallBorrowRoot, BorrowState>,
    root: CallBorrowRoot,
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
            if callee.name == "isKnown" {
                Some(MachineType::Bool)
            } else if callee.name == "unknownReason" {
                Some(MachineType::I32)
            } else if callee.name == "load" {
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
                functions
                    .get(&callee.name)
                    .and_then(|abi| match abi.result {
                        MachineResult::Scalar(machine_type) => Some(machine_type),
                        MachineResult::Owned(_)
                        | MachineResult::Aggregate { .. }
                        | MachineResult::AggregateReference { .. }
                        | MachineResult::AggregateSubobjectReference { .. }
                        | MachineResult::ScalarReference { .. }
                        | MachineResult::SliceElementReference { .. }
                        | MachineResult::AggregateBufferElementReference { .. }
                        | MachineResult::AggregateBufferSliceReference { .. }
                        | MachineResult::AggregateBufferWholeSliceReference { .. }
                        | MachineResult::SliceReference { .. } => None,
                    })
            }
        }
        _ => None,
    }
}

fn load_direct_stack_access(
    builder: &mut FunctionBuilder<'_>,
    access: &ResolvedStackAccess<'_>,
    machine_type: MachineType,
    offset: i32,
    machine_contract: &str,
) -> Result<Value, NativeCompileError> {
    if access.dynamic_index.is_some() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} @unknown state is not yet supported inside indexed storage"
        )));
    }
    Ok(if let Some(base) = access.base_address {
        builder
            .ins()
            .load(machine_type.ir_type(), MemFlags::new(), base, offset)
    } else {
        builder.ins().stack_load(
            machine_type.ir_type(),
            access
                .slot
                .expect("direct uncertain access must retain storage"),
            offset,
        )
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_uncertain_coalesce(
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
    let AstNode::CallExpression(load) = binary.left.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} native `??` requires `load(@unknownField) ?? fallback` on its left side"
        )));
    };
    let AstNode::Identifier(callee) = load.callee.as_ref() else {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} native `??` requires a named `load` call"
        )));
    };
    if callee.name != "load" || load.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} native `??` requires exactly `load(@unknownField) ?? fallback`"
        )));
    }
    let access = resolve_stack_access(
        &load.arguments[0],
        stack_slots,
        references,
        "uncertain coalesce",
        machine_contract,
    )?;
    validate_stack_access_borrow(
        &access,
        borrow_states,
        "uncertain coalesce",
        machine_contract,
    )?;
    let uncertainty = access.uncertainty.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `??` left side `{}` is not an @unknown field",
            access.display
        ))
    })?;
    if access.machine_type != expected {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} {context} expects `{}`, but @unknown field `{}` carries `Uncertain<{}>`",
            expected.name(),
            access.display,
            access.machine_type.name()
        )));
    }

    let known = load_direct_stack_access(
        builder,
        &access,
        MachineType::Bool,
        uncertainty.known_offset,
        machine_contract,
    )?;
    let known_block = builder.create_block();
    let fallback_block = builder.create_block();
    let merge_block = builder.create_block();
    let result = builder.append_block_param(merge_block, expected.ir_type());
    builder
        .ins()
        .brif(known, known_block, &[], fallback_block, &[]);

    builder.switch_to_block(known_block);
    let payload = load_direct_stack_access(
        builder,
        &access,
        access.machine_type,
        access.offset,
        machine_contract,
    )?;
    builder.ins().jump(merge_block, &[payload.into()]);

    builder.switch_to_block(fallback_block);
    let fallback = lower_typed_expression(
        builder,
        module,
        functions,
        locals,
        stack_slots,
        references,
        borrow_states,
        &binary.right,
        expected,
        "uncertain fallback",
        machine_contract,
        memory_enabled,
    )?;
    builder.ins().jump(merge_block, &[fallback.value.into()]);

    builder.switch_to_block(merge_block);
    Ok(TypedValue {
        value: result,
        machine_type: expected,
    })
}

#[allow(clippy::too_many_arguments)]
fn lower_uncertain_metadata_read(
    builder: &mut FunctionBuilder<'_>,
    stack_slots: &HashMap<String, TypedStackSlot>,
    references: &HashMap<String, TypedReference>,
    borrow_states: &HashMap<String, BorrowState>,
    call: &CallExpression,
    expected: MachineType,
    operation: &str,
    machine_contract: &str,
) -> Result<TypedValue, NativeCompileError> {
    if call.arguments.len() != 1 {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}(@unknownField)` expects exactly one field, found {}",
            call.arguments.len()
        )));
    }
    let access = resolve_stack_access(
        &call.arguments[0],
        stack_slots,
        references,
        operation,
        machine_contract,
    )?;
    validate_stack_access_borrow(&access, borrow_states, operation, machine_contract)?;
    let uncertainty = access.uncertainty.ok_or_else(|| {
        NativeCompileError::new(format!(
            "{machine_contract} `{operation}` requires an @unknown field; `{}` stores a plain `{}`",
            access.display,
            access.machine_type.name()
        ))
    })?;
    let (result_type, offset) = match operation {
        "isKnown" => (MachineType::Bool, uncertainty.known_offset),
        "unknownReason" => (MachineType::I32, uncertainty.reason_offset),
        _ => unreachable!("only native uncertainty metadata builtins call this helper"),
    };
    if expected != result_type {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} `{operation}` produces `{}`, but this expression expects `{}`",
            result_type.name(),
            expected.name()
        )));
    }
    let value = load_direct_stack_access(builder, &access, result_type, offset, machine_contract)?;
    Ok(TypedValue {
        value,
        machine_type: result_type,
    })
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
            "{machine_contract} ordering comparison `{}` requires numeric operands",
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
    let value = if operand_type.is_float() {
        let condition = match binary.operator.as_str() {
            "==" => FloatCC::Equal,
            "!=" => FloatCC::NotEqual,
            "<" => FloatCC::LessThan,
            "<=" => FloatCC::LessThanOrEqual,
            ">" => FloatCC::GreaterThan,
            ">=" => FloatCC::GreaterThanOrEqual,
            _ => unreachable!("comparison operators are filtered by the caller"),
        };
        builder.ins().fcmp(condition, left.value, right.value)
    } else {
        let condition = if operand_type == MachineType::U8 {
            match binary.operator.as_str() {
                "==" => IntCC::Equal,
                "!=" => IntCC::NotEqual,
                "<" => IntCC::UnsignedLessThan,
                "<=" => IntCC::UnsignedLessThanOrEqual,
                ">" => IntCC::UnsignedGreaterThan,
                ">=" => IntCC::UnsignedGreaterThanOrEqual,
                _ => unreachable!("comparison operators are filtered by the caller"),
            }
        } else {
            match binary.operator.as_str() {
                "==" => IntCC::Equal,
                "!=" => IntCC::NotEqual,
                "<" => IntCC::SignedLessThan,
                "<=" => IntCC::SignedLessThanOrEqual,
                ">" => IntCC::SignedGreaterThan,
                ">=" => IntCC::SignedGreaterThanOrEqual,
                _ => unreachable!("comparison operators are filtered by the caller"),
            }
        };
        builder.ins().icmp(condition, left.value, right.value)
    };
    Ok(TypedValue {
        value,
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
    AggregateReference {
        reference_name: String,
        mutable: bool,
    },
    AggregateReferenceParameter {
        reference_name: String,
        mutable: bool,
        requires_lease: bool,
    },
    ReturnedAggregateSubobject {
        reference_name: String,
        mutable: bool,
    },
    Slice {
        reference_name: String,
        mutable: bool,
    },
    SliceParameter {
        reference_name: String,
        mutable: bool,
    },
}

#[derive(Clone, Copy)]
struct ResolvedUncertainAccess {
    known_offset: i32,
    reason_offset: i32,
}

struct ResolvedStackAccess<'a> {
    slot: Option<StackSlot>,
    base_address: Option<Value>,
    machine_type: MachineType,
    offset: i32,
    uncertainty: Option<ResolvedUncertainAccess>,
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
                let requirement = match &reference.layout {
                    TypedReferenceLayout::Scalar { .. }
                    | TypedReferenceLayout::ParameterScalar { .. }
                    | TypedReferenceLayout::ReturnedScalar { .. }
                    | TypedReferenceLayout::ReturnedSliceElement { .. }
                    | TypedReferenceLayout::ReturnedAggregateBufferElement { .. } => {
                        "must be dereferenced with `*`"
                    }
                    TypedReferenceLayout::Slice { .. } => "must be indexed",
                    TypedReferenceLayout::Aggregate { .. } => "must project a scalar field",
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
                uncertainty: None,
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
            let Some(path) = owned_buffer_path(argument) else {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} `{operation}` requires a named aggregate field path"
                )));
            };
            let mut segments = path.split('.');
            let root_name = segments
                .next()
                .expect("owned buffer paths always contain a root identifier");
            let field_names = segments.collect::<Vec<_>>();
            let (slot, base_address, root_layout, borrow_root, provenance) = if let Some(
                reference,
            ) =
                references.get(root_name)
            {
                let TypedReferenceLayout::Aggregate { layout, storage } = &reference.layout else {
                    return Err(NativeCompileError::new(format!(
                            "{machine_contract} reference `{root_name}` does not expose aggregate fields for `{operation}`"
                        )));
                };
                match storage {
                    AggregateReferenceStorage::Stack { slot_name }
                    | AggregateReferenceStorage::ReturnedStack { slot_name } => {
                        let stack_slot = stack_slots.get(slot_name).ok_or_else(|| {
                                NativeCompileError::new(format!(
                                    "{machine_contract} aggregate reference `{root_name}` lost stack-slot provenance `{slot_name}`"
                                ))
                            })?;
                        let StackSlotLayout::Aggregate(current_layout) = &stack_slot.layout else {
                            return Err(NativeCompileError::new(format!(
                                    "{machine_contract} aggregate reference `{root_name}` points to incompatible storage"
                                )));
                        };
                        if current_layout.name != layout.name {
                            return Err(NativeCompileError::new(format!(
                                    "{machine_contract} aggregate reference `{root_name}` layout provenance changed from `{}` to `{}`",
                                    layout.name, current_layout.name
                                )));
                        }
                        (
                            Some(stack_slot.slot),
                            None,
                            layout,
                            slot_name.clone(),
                            StackAccessProvenance::AggregateReference {
                                reference_name: root_name.to_string(),
                                mutable: reference.mutable,
                            },
                        )
                    }
                    AggregateReferenceStorage::Parameter { base } => (
                        None,
                        Some(*base),
                        layout,
                        root_name.to_string(),
                        StackAccessProvenance::AggregateReferenceParameter {
                            reference_name: root_name.to_string(),
                            mutable: reference.mutable,
                            requires_lease: false,
                        },
                    ),
                    AggregateReferenceStorage::ParameterReborrow {
                        base,
                        root_name: borrow_root,
                    } => (
                        None,
                        Some(*base),
                        layout,
                        borrow_root.clone(),
                        StackAccessProvenance::AggregateReferenceParameter {
                            reference_name: root_name.to_string(),
                            mutable: reference.mutable,
                            requires_lease: true,
                        },
                    ),
                    AggregateReferenceStorage::ReturnedSubobject {
                        base,
                        root_name: borrow_root,
                    } => (
                        None,
                        Some(*base),
                        layout,
                        borrow_root.clone(),
                        StackAccessProvenance::ReturnedAggregateSubobject {
                            reference_name: root_name.to_string(),
                            mutable: reference.mutable,
                        },
                    ),
                }
            } else {
                let stack_slot = stack_slots.get(root_name).ok_or_else(|| {
                        NativeCompileError::new(format!(
                            "{machine_contract} `{operation}` references unknown aggregate slot `{root_name}`"
                        ))
                    })?;
                let StackSlotLayout::Aggregate(root_layout) = &stack_slot.layout else {
                    return Err(NativeCompileError::new(format!(
                            "{machine_contract} scalar stack slot `{root_name}` has no aggregate fields"
                        )));
                };
                (
                    Some(stack_slot.slot),
                    None,
                    root_layout,
                    root_name.to_string(),
                    StackAccessProvenance::Owner,
                )
            };
            let projection = resolve_aggregate_scalar_projection_for_access(
                root_layout,
                &field_names,
                &path,
                machine_contract,
            )?;
            Ok(ResolvedStackAccess {
                slot,
                base_address,
                machine_type: projection.machine_type,
                offset: i32::try_from(projection.value_offset)
                    .expect("validated aggregate field offset"),
                uncertainty: projection.known_offset.zip(projection.reason_offset).map(
                    |(known_offset, reason_offset)| ResolvedUncertainAccess {
                        known_offset: i32::try_from(known_offset)
                            .expect("validated aggregate field offset"),
                        reason_offset: i32::try_from(reason_offset)
                            .expect("validated aggregate field offset"),
                    },
                ),
                dynamic_index: None,
                root_name: borrow_root,
                display: path,
                provenance,
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
                    uncertainty: None,
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
                SliceStorage::Heap {
                    owner_name,
                    base,
                    length,
                } => Ok(ResolvedStackAccess {
                    slot: None,
                    base_address: Some(*base),
                    machine_type: *element_type,
                    offset: 0,
                    uncertainty: None,
                    dynamic_index: Some(DynamicArrayIndex {
                        expression: member.property.as_ref(),
                        bound: DynamicArrayBound::Runtime(*length),
                        element_size: element_type.stack_size(),
                    }),
                    root_name: owner_name.clone(),
                    display: format!("{}[index]", root.name),
                    provenance: StackAccessProvenance::Slice {
                        reference_name: root.name.clone(),
                        mutable: reference.mutable,
                    },
                }),
                SliceStorage::Returned {
                    base,
                    length,
                    root: returned_root,
                } => Ok(ResolvedStackAccess {
                    slot: None,
                    base_address: Some(*base),
                    machine_type: *element_type,
                    offset: 0,
                    uncertainty: None,
                    dynamic_index: Some(DynamicArrayIndex {
                        expression: member.property.as_ref(),
                        bound: DynamicArrayBound::Runtime(*length),
                        element_size: element_type.stack_size(),
                    }),
                    root_name: returned_root.name().to_string(),
                    display: format!("{}[index]", root.name),
                    provenance: StackAccessProvenance::Slice {
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
            uncertainty: None,
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
        uncertainty: None,
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
            if state.aggregate_moved {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate `{}` was already moved before `{operation}`",
                    access.root_name
                )));
            }
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
        StackAccessProvenance::AggregateReference {
            reference_name,
            mutable,
        } => {
            if operation == "store" && !mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot write through immutable aggregate reference `{reference_name}`"
                )));
            }
            let state = borrow_states.get(&access.root_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} lost active borrow state for aggregate reference `{reference_name}`"
                ))
            })?;
            if state.aggregate_moved {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` points to moved root `{}`",
                    access.root_name
                )));
            }
            let lease_is_active = if *mutable {
                state.exclusive
            } else {
                state.shared > 0 && !state.exclusive
            };
            if !lease_is_active {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} aggregate reference `{reference_name}` no longer owns a valid borrow lease"
                )));
            }
        }
        StackAccessProvenance::AggregateReferenceParameter {
            reference_name,
            mutable,
            requires_lease,
        } => {
            if operation == "store" && !mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot write through immutable aggregate reference parameter `{reference_name}`"
                )));
            }
            let state = borrow_states
                .get(&access.root_name)
                .copied()
                .unwrap_or_default();
            if *requires_lease {
                let lease_is_active = if *mutable {
                    state.exclusive
                } else {
                    state.shared > 0 && !state.exclusive
                };
                if !lease_is_active {
                    return Err(NativeCompileError::new(format!(
                        "{machine_contract} aggregate parameter reborrow `{reference_name}` no longer owns a valid borrow lease"
                    )));
                }
            } else if operation == "load" && state.exclusive {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot load through aggregate reference parameter `{reference_name}` while an exclusive reborrow is active"
                )));
            } else if operation == "store" && (state.shared > 0 || state.exclusive) {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot store through aggregate reference parameter `{reference_name}` while an active reborrow exists"
                )));
            }
        }
        StackAccessProvenance::ReturnedAggregateSubobject {
            reference_name,
            mutable,
        } => {
            if operation == "store" && !mutable {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} cannot write through immutable returned aggregate subobject `{reference_name}`"
                )));
            }
            let state = borrow_states.get(&access.root_name).ok_or_else(|| {
                NativeCompileError::new(format!(
                    "{machine_contract} lost active borrow state for returned aggregate subobject `{reference_name}`"
                ))
            })?;
            let lease_is_active = if *mutable {
                state.exclusive
            } else {
                state.shared > 0 && !state.exclusive
            };
            if !lease_is_active {
                return Err(NativeCompileError::new(format!(
                    "{machine_contract} returned aggregate subobject `{reference_name}` no longer owns a valid borrow lease"
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
    if access.uncertainty.is_some() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} bare `load({})` would erase first-class ignorance; gate with `isKnown({})` and read with `load({}) ?? <fallback>`",
            access.display, access.display, access.display
        )));
    }
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
    } else if let Some(base) = access.base_address {
        builder.ins().load(
            access.machine_type.ir_type(),
            MemFlags::new(),
            base,
            access.offset,
        )
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
    if access.uncertainty.is_some() {
        return Err(NativeCompileError::new(format!(
            "{machine_contract} raw `store({}, value)` would erase the @unknown carrier; reconstruct the aggregate with `known(value)` or `unknown(\"reason\")`",
            access.display
        )));
    }
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
        access
            .base_address
            .map(|base| (base, access.offset))
            .map(|(base, offset)| {
                if offset == 0 {
                    base
                } else {
                    let pointer_type = module.target_config().pointer_type();
                    let offset = builder.ins().iconst(pointer_type, i64::from(offset));
                    builder.ins().iadd(base, offset)
                }
            })
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
