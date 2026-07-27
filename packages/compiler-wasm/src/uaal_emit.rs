//! Minimal `.hs` function-to-UAAL bytecode emitter.
//!
//! This backend intentionally starts at the narrow symbol-resolution seam the
//! VM can prove today: top-level functions, literal return values, stack-passed
//! call arguments, simple state-backed slots, and direct calls lowered to real
//! `CALL`/`RET` instructions.

use std::collections::{HashMap, HashSet};

use serde::Serialize;
use serde_json::Value;

use crate::ast::{
    Ast, AstNode, BinaryExpression, CallExpression, FunctionNode, MemberExpression,
    StructDeclarationNode,
};
use crate::kotlin_emit::{check_semantics, SemanticDiagnostic};

const OP_PUSH: u16 = 0x01;
const OP_EXEC: u16 = 0x20;
const OP_JUMP: u16 = 0x30;
const OP_JUMP_IF: u16 = 0x31;
const OP_CALL: u16 = 0x32;
const OP_RET: u16 = 0x33;
const OP_HS_BUFFER_ALLOC: u16 = 0xb7;
const OP_HS_BUFFER_MOVE: u16 = 0xb8;
const OP_HS_BUFFER_DROP: u16 = 0xbb;
const OP_HS_AGGREGATE_BORROW: u16 = 0xbd;
const OP_HS_AGGREGATE_LOAD: u16 = 0xbe;
const OP_HS_AGGREGATE_STORE: u16 = 0xbf;
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

/// Host-handler ABI for flat, explicitly typed POD aggregate values.
///
/// A record occupies one UAAL operand-stack entry. `construct` pops one value per declared field
/// and pushes an immutable, layout-tagged record; `project` pops that record and pushes one
/// layout-checked scalar field. Whole-record calls therefore preserve native HoloScript arity
/// instead of projecting records into unrelated scalar parameters.
const HS_AGGREGATE_VALUE_ABI: &str = "hs.aggregate.value.v1";

/// Host-handler ABI for recursively nested, explicitly typed POD aggregate values.
///
/// Nested records remain one UAAL operand-stack entry. Constructors carry recursive semantic
/// layout descriptors, while `project_path` validates every record boundary before returning a
/// scalar leaf. The v1 flat-record instruction shape remains unchanged.
const HS_AGGREGATE_VALUE_ABI_V2: &str = "hs.aggregate.value.v2";

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

#[derive(Debug, Clone, PartialEq, Eq)]
struct UaalAggregateField {
    name: String,
    type_annotation: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UaalAggregateLayout {
    name: String,
    fields: Vec<UaalAggregateField>,
    schema_id: String,
    contains_nested: bool,
}

impl UaalAggregateLayout {
    fn value_abi(&self) -> &'static str {
        if self.contains_nested {
            HS_AGGREGATE_VALUE_ABI_V2
        } else {
            HS_AGGREGATE_VALUE_ABI
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UaalAggregateProjection {
    root_name: String,
    root_layout: UaalAggregateLayout,
    field_names: Vec<String>,
    field_indices: Vec<usize>,
    leaf: UaalAggregateField,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct UaalBorrowedAggregate {
    layout: String,
    mutable: bool,
}

#[derive(Debug)]
struct UaalEmitter<'a> {
    functions: Vec<&'a FunctionNode>,
    function_names: HashSet<String>,
    function_params: HashMap<String, Vec<String>>,
    function_param_types: HashMap<String, Vec<Option<String>>>,
    function_return_types: HashMap<String, Option<String>>,
    aggregate_layouts: HashMap<String, UaalAggregateLayout>,
    entry_points: HashMap<String, usize>,
    pending_calls: Vec<PendingCall>,
    instructions: Vec<UaalInstruction>,
    current_function: Option<String>,
    current_bindings: HashSet<String>,
    current_binding_types: HashMap<String, Option<String>>,
    current_moved_aggregates: HashSet<String>,
    current_owned_buffers: HashMap<String, String>,
    current_unavailable_owned_buffers: HashSet<String>,
    current_owned_buffer_order: Vec<String>,
    current_borrowed_aggregates: HashMap<String, UaalBorrowedAggregate>,
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
    reject_pending_owned_aggregate_surfaces(ast)?;

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
    let aggregate_layouts = collect_aggregate_layouts(ast)?;

    validate_imports_resolved(ast, &function_names)?;

    let mut emitter = UaalEmitter {
        functions,
        function_names,
        function_params,
        function_param_types,
        function_return_types,
        aggregate_layouts,
        entry_points: HashMap::new(),
        pending_calls: Vec::new(),
        instructions: Vec::new(),
        current_function: None,
        current_bindings: HashSet::new(),
        current_binding_types: HashMap::new(),
        current_moved_aggregates: HashSet::new(),
        current_owned_buffers: HashMap::new(),
        current_unavailable_owned_buffers: HashSet::new(),
        current_owned_buffer_order: Vec::new(),
        current_borrowed_aggregates: HashMap::new(),
    };

    emitter.emit_bootstrap()?;
    emitter.emit_functions()?;
    emitter.patch_calls()?;

    Ok(UaalBytecode {
        version: 1,
        instructions: emitter.instructions,
    })
}

fn owned_buffer_element_type(annotation: &str) -> Option<&str> {
    let inner = annotation.strip_prefix('[')?.strip_suffix(']')?;
    if inner.is_empty() || inner.contains(';') {
        None
    } else {
        Some(inner)
    }
}

fn aggregate_reference_annotation(annotation: &str) -> Option<(bool, &str)> {
    let mut rest = annotation.strip_prefix('&')?.trim_start();
    if rest.starts_with('\'') {
        rest = rest.split_once(' ')?.1.trim_start();
    }
    let (mutable, pointee) = if let Some(pointee) = rest.strip_prefix("mut ") {
        (true, pointee)
    } else {
        (false, rest)
    };
    (!pointee.is_empty() && !pointee.starts_with('[')).then_some((mutable, pointee))
}

fn reject_pending_owned_aggregate_surfaces(ast: &Ast) -> Result<(), UaalEmitError> {
    fn reject_node(node: &AstNode) -> Result<(), UaalEmitError> {
        match node {
            AstNode::StructDeclaration(structure) => {
                for (index, annotation) in structure.field_types.iter().enumerate() {
                    if let Some(annotation) = annotation
                        .as_deref()
                        .filter(|annotation| owned_buffer_element_type(annotation).is_some())
                    {
                        let field = structure
                            .fields
                            .get(index)
                            .map(String::as_str)
                            .unwrap_or("<unknown>");
                        return Err(UaalEmitError::new(format!(
                            "owned buffer type `{annotation}` in field `{field}` of struct `{}` requires allocator, move, and drop opcodes for the pending owned-aggregate ABI; compile_to_uaal does not erase affine ownership",
                            structure.name
                        )));
                    }
                }
            }
            AstNode::Export(export) => reject_node(&export.declaration)?,
            _ => {}
        }
        Ok(())
    }

    for node in &ast.body {
        reject_node(node)?;
    }
    Ok(())
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

fn collect_aggregate_layouts(
    ast: &Ast,
) -> Result<HashMap<String, UaalAggregateLayout>, UaalEmitError> {
    let mut declarations = HashMap::new();
    for node in &ast.body {
        let structure = match node {
            AstNode::StructDeclaration(structure) => structure,
            AstNode::Export(export) => match export.declaration.as_ref() {
                AstNode::StructDeclaration(structure) => structure,
                _ => continue,
            },
            _ => continue,
        };
        declarations.insert(structure.name.clone(), structure);
    }

    let mut layouts = HashMap::new();
    let mut resolving = Vec::new();
    let names = declarations.keys().cloned().collect::<Vec<_>>();
    for name in names {
        resolve_aggregate_layout(&name, &declarations, &mut layouts, &mut resolving)?;
    }
    Ok(layouts)
}

fn resolve_aggregate_layout(
    name: &str,
    declarations: &HashMap<String, &StructDeclarationNode>,
    layouts: &mut HashMap<String, UaalAggregateLayout>,
    resolving: &mut Vec<String>,
) -> Result<UaalAggregateLayout, UaalEmitError> {
    if let Some(layout) = layouts.get(name) {
        return Ok(layout.clone());
    }

    if let Some(cycle_start) = resolving.iter().position(|entry| entry == name) {
        let mut cycle = resolving[cycle_start..].to_vec();
        cycle.push(name.to_string());
        return Err(UaalEmitter::target_capability_error(
            "HS-UAAL-CAP-003",
            "uaal.aggregate.value.v2",
            format!(
                "recursive by-value aggregate cycle `{}` has no finite POD layout",
                cycle.join(" -> ")
            ),
        ));
    }

    let structure = declarations.get(name).copied().ok_or_else(|| {
        UaalEmitter::target_capability_error(
            "HS-UAAL-CAP-003",
            "uaal.aggregate.value.v2",
            format!("aggregate layout `{name}` is not declared"),
        )
    })?;
    if structure.field_types.len() != structure.fields.len()
        || structure.field_types.iter().any(Option::is_none)
    {
        return Err(UaalEmitter::target_capability_error(
            "HS-UAAL-CAP-003",
            "uaal.aggregate.value.v2",
            format!(
                "aggregate `{}` requires explicit field types; recursive POD fields must resolve to scalars or declared aggregates",
                structure.name
            ),
        ));
    }

    resolving.push(name.to_string());
    let result = (|| {
        let mut contains_nested = false;
        let mut schema_fields = Vec::with_capacity(structure.fields.len());
        let mut fields = Vec::with_capacity(structure.fields.len());
        for (field_name, type_annotation) in structure.fields.iter().zip(&structure.field_types) {
            let type_annotation = type_annotation
                .as_deref()
                .expect("field type completeness checked above")
                .trim();
            let normalized_type = if type_annotation == "Boolean" {
                "bool"
            } else {
                type_annotation
            };
            let descriptor = if matches!(normalized_type, "i32" | "f32" | "f64" | "bool") {
                normalized_type.to_string()
            } else if declarations.contains_key(normalized_type) {
                contains_nested = true;
                resolve_aggregate_layout(normalized_type, declarations, layouts, resolving)?
                    .schema_id
            } else {
                return Err(UaalEmitter::target_capability_error(
                    "HS-UAAL-CAP-003",
                    "uaal.aggregate.value.v2",
                    format!(
                        "field `{field_name}` of aggregate `{}` has unsupported type `{type_annotation}`; recursive POD fields must resolve to scalars or declared aggregates",
                        structure.name
                    ),
                ));
            };
            fields.push(UaalAggregateField {
                name: field_name.clone(),
                type_annotation: normalized_type.to_string(),
            });
            schema_fields.push(format!("{field_name}:{descriptor}"));
        }

        Ok(UaalAggregateLayout {
            name: structure.name.clone(),
            fields,
            schema_id: format!("{}{{{}}}", structure.name, schema_fields.join(",")),
            contains_nested,
        })
    })();
    resolving.pop();
    let layout = result?;
    layouts.insert(name.to_string(), layout.clone());
    Ok(layout)
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
            self.current_moved_aggregates.clear();
            self.current_owned_buffers.clear();
            self.current_unavailable_owned_buffers.clear();
            self.current_owned_buffer_order.clear();
            self.current_borrowed_aggregates.clear();
            for (index, param) in function.params.iter().enumerate() {
                if let Some(element_type) = function
                    .param_types
                    .get(index)
                    .and_then(|annotation| annotation.as_deref())
                    .and_then(owned_buffer_element_type)
                {
                    Self::validate_owned_buffer_element_type(param, element_type)?;
                    self.current_owned_buffers
                        .insert(param.clone(), element_type.to_string());
                    self.current_owned_buffer_order.push(param.clone());
                    continue;
                }
                let Some((mutable, layout)) = function
                    .param_types
                    .get(index)
                    .and_then(|annotation| annotation.as_deref())
                    .and_then(aggregate_reference_annotation)
                else {
                    continue;
                };
                if !self.aggregate_layouts.contains_key(layout) {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "parameter `{param}` of function `{}` borrows unsupported aggregate type `{layout}`",
                            function.name
                        ),
                    ));
                }
                self.current_borrowed_aggregates.insert(
                    param.clone(),
                    UaalBorrowedAggregate {
                        layout: layout.to_string(),
                        mutable,
                    },
                );
            }

            for param in function.params.iter().rev() {
                self.emit_op(
                    OP_STATE_SET,
                    vec![Value::from(Self::slot_key(&function.name, param))],
                );
            }

            for statement in &function.body {
                self.emit_statement(statement)?;
            }
            if !matches!(function.body.last(), Some(AstNode::Return(_))) {
                self.emit_owned_buffer_cleanup()?;
                self.emit_op(OP_RET, Vec::new());
            }
            self.current_function = None;
            self.current_bindings.clear();
            self.current_binding_types.clear();
            self.current_moved_aggregates.clear();
            self.current_owned_buffers.clear();
            self.current_unavailable_owned_buffers.clear();
            self.current_owned_buffer_order.clear();
            self.current_borrowed_aggregates.clear();
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
                self.emit_owned_buffer_cleanup()?;
                self.emit_op(OP_RET, Vec::new());
                Ok(())
            }
            AstNode::CallExpression(call) => self.emit_call_expression(call),
            AstNode::If(if_node) => self.emit_if(if_node),
            AstNode::While(while_node) => self.emit_while(while_node),
            AstNode::VariableDeclaration(var) => {
                if let Some(element_type) = var
                    .type_annotation
                    .as_deref()
                    .and_then(owned_buffer_element_type)
                {
                    if var.mutable {
                        return Err(Self::target_capability_error(
                            "HS-UAAL-CAP-004",
                            "uaal.buffer.owned.v1",
                            format!(
                                "owned buffer `{}` must use affine `let` storage, not mutable `var` storage",
                                var.name
                            ),
                        ));
                    }
                    self.emit_owned_buffer_initializer(&var.name, element_type, &var.value)?;
                    let slot = Self::slot_key(self.current_function_name()?, &var.name);
                    self.current_bindings.insert(var.name.clone());
                    self.current_binding_types
                        .insert(var.name.clone(), var.type_annotation.clone());
                    self.current_owned_buffers
                        .insert(var.name.clone(), element_type.to_string());
                    self.current_unavailable_owned_buffers.remove(&var.name);
                    self.current_owned_buffer_order.push(var.name.clone());
                    self.emit_op(OP_STATE_SET, vec![Value::from(slot)]);
                    return Ok(());
                }
                if var
                    .type_annotation
                    .as_deref()
                    .is_some_and(|annotation| self.aggregate_layouts.contains_key(annotation))
                {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v1",
                        format!(
                            "aggregate local `{}` must use addressable `slot` storage so affine move state is explicit",
                            var.name
                        ),
                    ));
                }
                self.emit_expression_with_expected(&var.value, var.type_annotation.as_deref())?;
                let slot = Self::slot_key(self.current_function_name()?, &var.name);
                self.current_bindings.insert(var.name.clone());
                self.current_binding_types
                    .insert(var.name.clone(), var.type_annotation.clone());
                self.emit_op(OP_STATE_SET, vec![Value::from(slot)]);
                Ok(())
            }
            AstNode::StackSlotDeclaration(slot) => {
                if !self.aggregate_layouts.contains_key(&slot.type_annotation) {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        format!(
                            "stack slot `{}` uses unsupported type `{}`; compile_to_uaal currently admits slots only for recursively laid-out POD aggregates",
                            slot.name, slot.type_annotation
                        ),
                    ));
                }
                self.emit_expression_with_expected(&slot.value, Some(&slot.type_annotation))?;
                let key = Self::slot_key(self.current_function_name()?, &slot.name);
                self.current_bindings.insert(slot.name.clone());
                self.current_binding_types
                    .insert(slot.name.clone(), Some(slot.type_annotation.clone()));
                self.current_moved_aggregates.remove(&slot.name);
                self.emit_op(OP_STATE_SET, vec![Value::from(key)]);
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
                if self.current_owned_buffers.contains_key(target) {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-004",
                        "uaal.buffer.owned.v1",
                        format!(
                            "owned buffer `{target}` is affine and cannot be overwritten by assignment"
                        ),
                    ));
                }
                if self.binding_aggregate_layout(target).is_some() {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v1",
                        format!(
                            "aggregate slot `{target}` is affine and cannot be overwritten by scalar assignment lowering"
                        ),
                    ));
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
                if self.current_owned_buffers.contains_key(&identifier.name) {
                    self.require_owned_buffer_available(&identifier.name, "read")?;
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-004",
                        "uaal.buffer.owned.v1",
                        format!(
                            "owned buffer `{}` requires explicit `move` or `drop`; implicit copies are forbidden and element access requires the borrowed-slice contract",
                            identifier.name
                        ),
                    ));
                }
                if self.binding_aggregate_layout(&identifier.name).is_some() {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v1",
                        format!(
                            "aggregate value `{}` requires explicit `move({})`; implicit copies are forbidden",
                            identifier.name, identifier.name
                        ),
                    ));
                }
                let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
                self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
                Ok(())
            }
            AstNode::BinaryExpression(binary) => self.emit_binary_expression(binary, expected_type),
            AstNode::CallExpression(call) => {
                let is_owned_move = matches!(
                    call.callee.as_ref(),
                    AstNode::Identifier(identifier) if identifier.name == "move"
                );
                if let Some(element_type) = expected_type
                    .and_then(owned_buffer_element_type)
                    .filter(|_| !is_owned_move)
                {
                    self.emit_owned_buffer_returning_call(call, element_type)
                } else {
                    self.emit_call_expression(call)
                }
            }
            AstNode::MemberExpression(_) => Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                "aggregate fields must be projected with `load(record.field)`",
            )),
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

        if self.aggregate_layouts.contains_key(callee) {
            return self.emit_aggregate_constructor(callee, &call.arguments);
        }
        if callee == "load" {
            return self.emit_aggregate_load(call);
        }
        if callee == "store" {
            return self.emit_borrowed_aggregate_store(call);
        }
        if callee == "drop" {
            return self.emit_owned_buffer_drop(call);
        }
        if callee == "move" {
            if call.arguments.first().is_some_and(|argument| {
                matches!(
                    argument,
                    AstNode::Identifier(identifier)
                        if self.current_owned_buffers.contains_key(&identifier.name)
                )
            }) {
                return self.emit_owned_buffer_move(call);
            }
            return self.emit_aggregate_move(call);
        }
        if callee == "buffer" {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "`buffer(count, fill)` is valid only as the initializer of an explicitly typed owned-buffer `let` binding",
            ));
        }
        if !self.function_names.contains(callee) {
            return Err(UaalEmitError::new(format!(
                "unresolved function call `{}` in compile_to_uaal",
                callee
            )));
        }
        if self
            .function_return_types
            .get(callee)
            .and_then(|annotation| annotation.as_deref())
            .and_then(owned_buffer_element_type)
            .is_some()
        {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned-buffer return from `{callee}` must initialize an explicitly typed owner or flow into an owned return/parameter"
                ),
            ));
        }
        self.emit_user_function_call(callee, call)
    }

    fn emit_owned_buffer_returning_call(
        &mut self,
        call: &CallExpression,
        expected_element_type: &str,
    ) -> Result<(), UaalEmitError> {
        let AstNode::Identifier(callee) = call.callee.as_ref() else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "owned-buffer calls require a named function",
            ));
        };
        let return_annotation = self
            .function_return_types
            .get(&callee.name)
            .and_then(|annotation| annotation.as_deref())
            .ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-004",
                    "uaal.buffer.owned.v1",
                    format!(
                        "function `{}` does not declare an owned-buffer return",
                        callee.name
                    ),
                )
            })?;
        let actual_element_type =
            owned_buffer_element_type(return_annotation).ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-004",
                    "uaal.buffer.owned.v1",
                    format!(
                        "function `{}` returns `{return_annotation}`, not an owned buffer",
                        callee.name
                    ),
                )
            })?;
        if actual_element_type != expected_element_type {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned-buffer call `{}` returns `[{actual_element_type}]`, expected `[{expected_element_type}]`",
                    callee.name
                ),
            ));
        }
        Self::validate_owned_buffer_element_type(&callee.name, actual_element_type)?;
        self.emit_user_function_call(&callee.name, call)
    }

    fn emit_user_function_call(
        &mut self,
        callee: &str,
        call: &CallExpression,
    ) -> Result<(), UaalEmitError> {
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
        let param_names = self
            .function_params
            .get(callee)
            .cloned()
            .unwrap_or_default();
        let mut call_borrows = HashMap::new();
        let mut acquired_params = Vec::new();
        for (index, argument) in call.arguments.iter().enumerate() {
            let expected = param_types
                .get(index)
                .and_then(|annotation| annotation.as_deref());
            if let Some(expected) =
                expected.filter(|annotation| aggregate_reference_annotation(annotation).is_some())
            {
                if self.emit_aggregate_reference_argument(argument, expected, &mut call_borrows)? {
                    acquired_params.push(index);
                }
            } else {
                self.emit_expression_with_expected(argument, expected)?;
            }
        }
        self.emit_call(callee);
        for index in acquired_params.into_iter().rev() {
            let parameter = param_names.get(index).ok_or_else(|| {
                UaalEmitError::new(format!(
                    "internal parameter metadata mismatch releasing borrow for `{callee}`"
                ))
            })?;
            let slot = Self::slot_key(callee, parameter);
            self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
            self.emit_op(OP_HS_AGGREGATE_BORROW, vec![Value::from("release")]);
        }
        Ok(())
    }

    fn emit_aggregate_reference_argument(
        &mut self,
        argument: &AstNode,
        expected_annotation: &str,
        call_borrows: &mut HashMap<String, bool>,
    ) -> Result<bool, UaalEmitError> {
        let (expected_mutable, expected_layout) =
            aggregate_reference_annotation(expected_annotation).ok_or_else(|| {
                UaalEmitError::new(format!(
                    "internal aggregate-reference annotation mismatch: `{expected_annotation}`"
                ))
            })?;
        let expected_schema = self
            .aggregate_layouts
            .get(expected_layout)
            .map(|layout| layout.schema_id.clone())
            .ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-005",
                    "uaal.aggregate.ref.v1",
                    format!("unsupported borrowed aggregate layout `{expected_layout}`"),
                )
            })?;

        let (root_key, acquired) = match argument {
            AstNode::UnaryExpression(borrow) => {
                let requested_mutable = match borrow.operator.as_str() {
                    "&" => false,
                    "&mut" => true,
                    _ => {
                        return Err(Self::target_capability_error(
                            "HS-UAAL-CAP-005",
                            "uaal.aggregate.ref.v1",
                            "aggregate reference arguments require `&root` or `&mut root`",
                        ));
                    }
                };
                if requested_mutable != expected_mutable {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "aggregate reference argument mutability does not match `{expected_annotation}`"
                        ),
                    ));
                }
                let AstNode::Identifier(identifier) = borrow.argument.as_ref() else {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        "the first aggregate-reference ABI borrows a complete named stack-slot root",
                    ));
                };
                let actual_layout = self
                    .binding_aggregate_layout(&identifier.name)
                    .map(|layout| layout.name.clone())
                    .ok_or_else(|| {
                        Self::target_capability_error(
                            "HS-UAAL-CAP-005",
                            "uaal.aggregate.ref.v1",
                            format!("`{}` is not an addressable aggregate root", identifier.name),
                        )
                    })?;
                if actual_layout != expected_layout {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "aggregate reference argument expects `{expected_layout}`, found `{actual_layout}`"
                        ),
                    ));
                }
                if self.current_moved_aggregates.contains(&identifier.name) {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "aggregate `{}` was already moved before borrow",
                            identifier.name
                        ),
                    ));
                }
                let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
                self.emit_op(
                    OP_HS_AGGREGATE_BORROW,
                    vec![
                        Value::from("acquire"),
                        Value::from(expected_schema),
                        Value::from(slot.clone()),
                        Value::from(expected_mutable),
                    ],
                );
                (slot, true)
            }
            AstNode::Identifier(identifier) => {
                let borrowed = self
                    .current_borrowed_aggregates
                    .get(&identifier.name)
                    .cloned()
                    .ok_or_else(|| {
                        Self::target_capability_error(
                            "HS-UAAL-CAP-005",
                            "uaal.aggregate.ref.v1",
                            format!(
                                "aggregate reference argument `{}` must use an explicit borrow",
                                identifier.name
                            ),
                        )
                    })?;
                if borrowed.layout != expected_layout {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "forwarded aggregate reference `{}` has layout `{}`, expected `{expected_layout}`",
                            identifier.name, borrowed.layout
                        ),
                    ));
                }
                if borrowed.mutable != expected_mutable {
                    let mode = if borrowed.mutable {
                        "mutable"
                    } else {
                        "shared"
                    };
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-005",
                        "uaal.aggregate.ref.v1",
                        format!(
                            "cannot forward {mode} aggregate reference `{}` as `{expected_annotation}`",
                            identifier.name
                        ),
                    ));
                }
                let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
                self.emit_op(OP_STATE_GET, vec![Value::from(slot.clone())]);
                (slot, false)
            }
            _ => {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-005",
                    "uaal.aggregate.ref.v1",
                    "aggregate reference arguments require an explicit root borrow or forwarded reference parameter",
                ));
            }
        };

        if let Some(existing_mutable) = call_borrows.get(&root_key) {
            if expected_mutable || *existing_mutable {
                return Err(Self::target_capability_error(
                    "HS-UAAL-CAP-005",
                    "uaal.aggregate.ref.v1",
                    format!("aggregate borrow alias conflict for `{root_key}` in one call"),
                ));
            }
        }
        call_borrows.insert(root_key, expected_mutable);
        Ok(acquired)
    }

    fn emit_owned_buffer_initializer(
        &mut self,
        owner_name: &str,
        element_type: &str,
        initializer: &AstNode,
    ) -> Result<(), UaalEmitError> {
        Self::validate_owned_buffer_element_type(owner_name, element_type)?;
        let AstNode::CallExpression(call) = initializer else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned buffer `{owner_name}` must be initialized by `buffer(count, fill)` or `move(owner)`"
                ),
            ));
        };
        let AstNode::Identifier(callee) = call.callee.as_ref() else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned buffer `{owner_name}` must be initialized by `buffer(count, fill)` or `move(owner)`"
                ),
            ));
        };
        if callee.name == "move" {
            return self.emit_owned_buffer_move(call);
        }
        if self.function_names.contains(&callee.name) {
            return self.emit_owned_buffer_returning_call(call, element_type);
        }
        if callee.name != "buffer" || call.arguments.len() != 2 {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned buffer `{owner_name}` must be initialized by `buffer(count, fill)` or `move(owner)`"
                ),
            ));
        }
        self.emit_expression_with_expected(&call.arguments[0], Some("i32"))?;
        self.emit_expression_with_expected(&call.arguments[1], Some(element_type))?;
        self.emit_op(
            OP_HS_BUFFER_ALLOC,
            vec![Value::from(element_type.to_string())],
        );
        Ok(())
    }

    fn validate_owned_buffer_element_type(
        owner_name: &str,
        element_type: &str,
    ) -> Result<(), UaalEmitError> {
        if matches!(element_type, "i32" | "f32" | "f64" | "bool") {
            return Ok(());
        }
        Err(Self::target_capability_error(
            "HS-UAAL-CAP-004",
            "uaal.buffer.owned.v1",
            format!(
                "owned buffer `{owner_name}` uses unsupported UAAL element type `{element_type}`; supported types are i32, f32, f64, and bool"
            ),
        ))
    }

    fn owned_buffer_element(&self, owner_name: &str) -> Result<String, UaalEmitError> {
        self.current_owned_buffers
            .get(owner_name)
            .cloned()
            .ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-004",
                    "uaal.buffer.owned.v1",
                    format!("`{owner_name}` is not a local owned buffer"),
                )
            })
    }

    fn require_owned_buffer_available(
        &self,
        owner_name: &str,
        operation: &str,
    ) -> Result<(), UaalEmitError> {
        if self.current_unavailable_owned_buffers.contains(owner_name) {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                format!(
                    "owned buffer `{owner_name}` was already moved or dropped before `{operation}`"
                ),
            ));
        }
        Ok(())
    }

    fn emit_owned_buffer_move(&mut self, call: &CallExpression) -> Result<(), UaalEmitError> {
        if call.arguments.len() != 1 {
            return Err(UaalEmitError::new(format!(
                "owned-buffer `move` in compile_to_uaal expects 1 argument, got {}",
                call.arguments.len()
            )));
        }
        let AstNode::Identifier(identifier) = &call.arguments[0] else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "owned-buffer `move` requires a complete named owner",
            ));
        };
        let element_type = self.owned_buffer_element(&identifier.name)?;
        self.require_owned_buffer_available(&identifier.name, "move")?;
        let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
        self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
        self.emit_op(OP_HS_BUFFER_MOVE, vec![Value::from(element_type)]);
        self.current_unavailable_owned_buffers
            .insert(identifier.name.clone());
        Ok(())
    }

    fn emit_owned_buffer_drop(&mut self, call: &CallExpression) -> Result<(), UaalEmitError> {
        if call.arguments.len() != 1 {
            return Err(UaalEmitError::new(format!(
                "owned-buffer `drop` in compile_to_uaal expects 1 argument, got {}",
                call.arguments.len()
            )));
        }
        let AstNode::Identifier(identifier) = &call.arguments[0] else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "owned-buffer `drop` requires a complete named owner",
            ));
        };
        let element_type = self.owned_buffer_element(&identifier.name)?;
        self.require_owned_buffer_available(&identifier.name, "drop")?;
        let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
        self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
        self.emit_op(OP_HS_BUFFER_DROP, vec![Value::from(element_type)]);
        self.current_unavailable_owned_buffers
            .insert(identifier.name.clone());
        Ok(())
    }

    fn emit_owned_buffer_cleanup(&mut self) -> Result<(), UaalEmitError> {
        let live = self
            .current_owned_buffer_order
            .iter()
            .rev()
            .filter(|name| !self.current_unavailable_owned_buffers.contains(*name))
            .filter_map(|name| {
                self.current_owned_buffers
                    .get(name)
                    .map(|element_type| (name.clone(), element_type.clone()))
            })
            .collect::<Vec<_>>();
        for (owner_name, element_type) in live {
            let slot = Self::slot_key(self.current_function_name()?, &owner_name);
            self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
            self.emit_op(OP_HS_BUFFER_DROP, vec![Value::from(element_type)]);
        }
        Ok(())
    }

    fn emit_aggregate_constructor(
        &mut self,
        aggregate_name: &str,
        arguments: &[AstNode],
    ) -> Result<(), UaalEmitError> {
        let layout = self
            .aggregate_layouts
            .get(aggregate_name)
            .cloned()
            .ok_or_else(|| UaalEmitError::new("internal aggregate layout lookup failed"))?;
        if arguments.len() != layout.fields.len() {
            return Err(UaalEmitError::new(format!(
                "arity mismatch constructing aggregate `{aggregate_name}` in compile_to_uaal: expected {}, got {}",
                layout.fields.len(),
                arguments.len()
            )));
        }
        for (argument, field) in arguments.iter().zip(&layout.fields) {
            self.emit_expression_with_expected(argument, Some(&field.type_annotation))?;
        }
        let field_descriptors = layout
            .fields
            .iter()
            .map(|field| {
                self.aggregate_layouts
                    .get(&field.type_annotation)
                    .map(|nested| nested.schema_id.clone())
                    .unwrap_or_else(|| field.type_annotation.clone())
            })
            .collect::<Vec<_>>();
        self.emit_op(
            OP_EXEC,
            vec![
                Value::from(layout.value_abi()),
                Value::from("construct"),
                Value::from(layout.schema_id),
                Value::Array(
                    layout
                        .fields
                        .iter()
                        .map(|field| Value::from(field.name.clone()))
                        .collect(),
                ),
                Value::Array(field_descriptors.into_iter().map(Value::from).collect()),
            ],
        );
        Ok(())
    }

    fn emit_aggregate_load(&mut self, call: &CallExpression) -> Result<(), UaalEmitError> {
        if call.arguments.len() != 1 {
            return Err(UaalEmitError::new(format!(
                "aggregate `load` in compile_to_uaal expects 1 argument, got {}",
                call.arguments.len()
            )));
        }
        let AstNode::MemberExpression(member) = &call.arguments[0] else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                "the first aggregate `load` contract requires a named scalar field projection",
            ));
        };
        let projection = self.resolve_aggregate_field_projection(member)?;
        if self
            .current_borrowed_aggregates
            .contains_key(&projection.root_name)
        {
            let slot = Self::slot_key(self.current_function_name()?, &projection.root_name);
            self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
            self.emit_op(
                OP_HS_AGGREGATE_LOAD,
                vec![
                    Value::Array(
                        projection
                            .field_names
                            .into_iter()
                            .map(Value::from)
                            .collect(),
                    ),
                    Value::Array(
                        projection
                            .field_indices
                            .into_iter()
                            .map(Value::from)
                            .collect(),
                    ),
                    Value::from(projection.leaf.type_annotation),
                ],
            );
            return Ok(());
        }
        if self
            .current_moved_aggregates
            .contains(&projection.root_name)
        {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v2",
                format!(
                    "aggregate `{}` was already moved before `load`",
                    projection.root_name
                ),
            ));
        }
        let slot = Self::slot_key(self.current_function_name()?, &projection.root_name);
        self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
        if projection.root_layout.contains_nested {
            self.emit_op(
                OP_EXEC,
                vec![
                    Value::from(HS_AGGREGATE_VALUE_ABI_V2),
                    Value::from("project_path"),
                    Value::from(projection.root_layout.schema_id),
                    Value::Array(
                        projection
                            .field_names
                            .into_iter()
                            .map(Value::from)
                            .collect(),
                    ),
                    Value::Array(
                        projection
                            .field_indices
                            .into_iter()
                            .map(Value::from)
                            .collect(),
                    ),
                    Value::from(projection.leaf.type_annotation),
                ],
            );
        } else {
            self.emit_op(
                OP_EXEC,
                vec![
                    Value::from(HS_AGGREGATE_VALUE_ABI),
                    Value::from("project"),
                    Value::from(projection.root_layout.schema_id),
                    Value::from(projection.field_names[0].clone()),
                    Value::from(projection.field_indices[0]),
                    Value::from(projection.leaf.type_annotation),
                ],
            );
        }
        Ok(())
    }

    fn emit_borrowed_aggregate_store(
        &mut self,
        call: &CallExpression,
    ) -> Result<(), UaalEmitError> {
        if call.arguments.len() != 2 {
            return Err(UaalEmitError::new(format!(
                "borrowed aggregate `store` in compile_to_uaal expects 2 arguments, got {}",
                call.arguments.len()
            )));
        }
        let AstNode::MemberExpression(member) = &call.arguments[0] else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-005",
                "uaal.aggregate.ref.v1",
                "borrowed aggregate `store` requires a named scalar field projection",
            ));
        };
        let projection = self.resolve_aggregate_field_projection(member)?;
        let borrowed = self
            .current_borrowed_aggregates
            .get(&projection.root_name)
            .cloned()
            .ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-005",
                    "uaal.aggregate.ref.v1",
                    "aggregate `store` requires a mutable aggregate-reference parameter",
                )
            })?;
        if !borrowed.mutable {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-005",
                "uaal.aggregate.ref.v1",
                format!(
                    "cannot store through shared aggregate reference `{}`",
                    projection.root_name
                ),
            ));
        }
        let slot = Self::slot_key(self.current_function_name()?, &projection.root_name);
        self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
        self.emit_expression_with_expected(
            &call.arguments[1],
            Some(&projection.leaf.type_annotation),
        )?;
        self.emit_op(
            OP_HS_AGGREGATE_STORE,
            vec![
                Value::Array(
                    projection
                        .field_names
                        .into_iter()
                        .map(Value::from)
                        .collect(),
                ),
                Value::Array(
                    projection
                        .field_indices
                        .into_iter()
                        .map(Value::from)
                        .collect(),
                ),
                Value::from(projection.leaf.type_annotation),
            ],
        );
        Ok(())
    }

    fn emit_aggregate_move(&mut self, call: &CallExpression) -> Result<(), UaalEmitError> {
        if call.arguments.len() != 1 {
            return Err(UaalEmitError::new(format!(
                "aggregate `move` in compile_to_uaal expects 1 argument, got {}",
                call.arguments.len()
            )));
        }
        let AstNode::Identifier(identifier) = &call.arguments[0] else {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                "the first aggregate value contract moves only a complete named aggregate root",
            ));
        };
        if self
            .current_borrowed_aggregates
            .contains_key(&identifier.name)
        {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-005",
                "uaal.aggregate.ref.v1",
                format!(
                    "borrowed aggregate `{}` cannot be moved by the callee",
                    identifier.name
                ),
            ));
        }
        if self.binding_aggregate_layout(&identifier.name).is_none() {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v2",
                format!(
                    "`move({})` requires a binding with a supported POD aggregate type",
                    identifier.name
                ),
            ));
        }
        if self.current_moved_aggregates.contains(&identifier.name) {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                format!("aggregate `{}` was already moved", identifier.name),
            ));
        }
        let slot = Self::slot_key(self.current_function_name()?, &identifier.name);
        self.emit_op(OP_STATE_GET, vec![Value::from(slot)]);
        self.current_moved_aggregates
            .insert(identifier.name.clone());
        Ok(())
    }

    fn resolve_aggregate_field_projection(
        &self,
        member: &MemberExpression,
    ) -> Result<UaalAggregateProjection, UaalEmitError> {
        let (root_name, field_names) = flatten_aggregate_member_path(member)?;
        let root_layout = self
            .binding_aggregate_layout(&root_name)
            .cloned()
            .ok_or_else(|| {
                Self::target_capability_error(
                    "HS-UAAL-CAP-003",
                    "uaal.aggregate.value.v2",
                    format!("binding `{root_name}` does not have a supported POD aggregate type"),
                )
            })?;
        let mut current_layout = root_layout.clone();
        let mut field_indices = Vec::with_capacity(field_names.len());
        let mut leaf = None;
        for (path_index, field_name) in field_names.iter().enumerate() {
            let (field_index, field) = current_layout
                .fields
                .iter()
                .enumerate()
                .find(|(_, field)| field.name == *field_name)
                .map(|(index, field)| (index, field.clone()))
                .ok_or_else(|| {
                    Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        format!(
                            "aggregate `{}` has no field `{field_name}`",
                            current_layout.name
                        ),
                    )
                })?;
            field_indices.push(field_index);
            let nested_layout = self.aggregate_layouts.get(&field.type_annotation);
            let is_leaf = path_index + 1 == field_names.len();
            if is_leaf {
                if nested_layout.is_some() {
                    return Err(Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        format!(
                            "nested aggregate field `{}.{}` cannot be copied by `load`; project a scalar leaf or move the complete root",
                            root_name,
                            field_names.join(".")
                        ),
                    ));
                }
                leaf = Some(field);
            } else {
                current_layout = nested_layout.cloned().ok_or_else(|| {
                    Self::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        format!(
                            "cannot project through scalar field `{}.{}`",
                            root_name,
                            field_names[..=path_index].join(".")
                        ),
                    )
                })?;
            }
        }

        Ok(UaalAggregateProjection {
            root_name,
            root_layout,
            field_names,
            field_indices,
            leaf: leaf.expect("aggregate member path always contains a leaf"),
        })
    }

    fn binding_aggregate_layout(&self, name: &str) -> Option<&UaalAggregateLayout> {
        self.current_binding_types
            .get(name)
            .and_then(|annotation| annotation.as_deref())
            .and_then(|annotation| {
                aggregate_reference_annotation(annotation)
                    .map(|(_, layout)| layout)
                    .or(Some(annotation))
            })
            .and_then(|annotation| self.aggregate_layouts.get(annotation))
    }

    fn aggregate_load_field_type(&self, node: &AstNode) -> Option<String> {
        let AstNode::CallExpression(call) = node else {
            return None;
        };
        let AstNode::Identifier(callee) = call.callee.as_ref() else {
            return None;
        };
        if callee.name != "load" || call.arguments.len() != 1 {
            return None;
        }
        let AstNode::MemberExpression(member) = &call.arguments[0] else {
            return None;
        };
        self.resolve_aggregate_field_projection(member)
            .ok()
            .map(|projection| projection.leaf.type_annotation)
    }

    fn emit_if(&mut self, if_node: &crate::ast::IfNode) -> Result<(), UaalEmitError> {
        self.emit_expression_with_expected(&if_node.test, Some("bool"))?;
        let moved_before = self.current_moved_aggregates.clone();
        let unavailable_owned_before = self.current_unavailable_owned_buffers.clone();

        let jump_to_consequent = self.emit_op(OP_JUMP_IF, Vec::new());

        if let Some(alternate) = &if_node.alternate {
            self.current_moved_aggregates = moved_before.clone();
            self.current_unavailable_owned_buffers = unavailable_owned_before.clone();
            for statement in alternate {
                self.emit_statement(statement)?;
            }
        }
        let alternate_moved = self.current_moved_aggregates.clone();
        let alternate_unavailable_owned = self.current_unavailable_owned_buffers.clone();

        let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
        let consequent_start = self.instructions.len();
        self.instructions[jump_to_consequent].operands = vec![Value::from(consequent_start)];

        self.current_moved_aggregates = moved_before.clone();
        self.current_unavailable_owned_buffers = unavailable_owned_before;
        for statement in &if_node.consequent {
            self.emit_statement(statement)?;
        }
        let consequent_moved = self.current_moved_aggregates.clone();
        if consequent_moved != alternate_moved {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                "aggregate move state differs across `if` branches; both paths must transfer the same whole values",
            ));
        }
        self.current_moved_aggregates = consequent_moved;
        let consequent_unavailable_owned = self.current_unavailable_owned_buffers.clone();
        if consequent_unavailable_owned != alternate_unavailable_owned {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "owned-buffer move/drop state differs across `if` branches; both paths must transfer or release the same owners",
            ));
        }
        self.current_unavailable_owned_buffers = consequent_unavailable_owned;

        let end = self.instructions.len();
        self.instructions[jump_to_end].operands = vec![Value::from(end)];
        Ok(())
    }

    fn emit_while(&mut self, while_node: &crate::ast::WhileNode) -> Result<(), UaalEmitError> {
        let condition_start = self.instructions.len();
        self.emit_expression_with_expected(&while_node.test, Some("bool"))?;
        let moved_before = self.current_moved_aggregates.clone();
        let unavailable_owned_before = self.current_unavailable_owned_buffers.clone();

        let jump_to_body = self.emit_op(OP_JUMP_IF, Vec::new());
        let jump_to_end = self.emit_op(OP_JUMP, Vec::new());
        let body_start = self.instructions.len();
        self.instructions[jump_to_body].operands = vec![Value::from(body_start)];

        for statement in &while_node.body {
            self.emit_statement(statement)?;
        }
        if self.current_moved_aggregates != moved_before {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v1",
                "aggregate move state changes inside `while`; loop-carried affine values are not in the first UAAL aggregate contract",
            ));
        }
        self.current_moved_aggregates = moved_before;
        if self.current_unavailable_owned_buffers != unavailable_owned_before {
            return Err(Self::target_capability_error(
                "HS-UAAL-CAP-004",
                "uaal.buffer.owned.v1",
                "owned-buffer move/drop state changes inside `while`; loop-carried affine ownership is not admitted by uaal.buffer.owned.v1",
            ));
        }
        self.current_unavailable_owned_buffers = unavailable_owned_before;
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
                if let Some(field_type) = self.aggregate_load_field_type(node) {
                    return match field_type.as_str() {
                        "i32" => Some("i32"),
                        "f32" => Some("f32"),
                        "f64" => Some("f64"),
                        _ => None,
                    };
                }
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
                if let Some(field_type) = self.aggregate_load_field_type(node) {
                    return field_type == expected;
                }
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
                if let Some(field_type) = self.aggregate_load_field_type(node) {
                    return is_bool_annotation(&field_type);
                }
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

fn flatten_aggregate_member_path(
    member: &MemberExpression,
) -> Result<(String, Vec<String>), UaalEmitError> {
    fn visit(node: &AstNode, fields: &mut Vec<String>) -> Result<String, UaalEmitError> {
        match node {
            AstNode::Identifier(identifier) => Ok(identifier.name.clone()),
            AstNode::MemberExpression(member) => {
                if member.computed {
                    return Err(UaalEmitter::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        "computed aggregate field access is unavailable; use declared field names",
                    ));
                }
                let root = visit(member.object.as_ref(), fields)?;
                let AstNode::Identifier(property) = member.property.as_ref() else {
                    return Err(UaalEmitter::target_capability_error(
                        "HS-UAAL-CAP-003",
                        "uaal.aggregate.value.v2",
                        "aggregate projection requires a named field",
                    ));
                };
                fields.push(property.name.clone());
                Ok(root)
            }
            _ => Err(UaalEmitter::target_capability_error(
                "HS-UAAL-CAP-003",
                "uaal.aggregate.value.v2",
                "aggregate projection must start from a named aggregate root",
            )),
        }
    }

    if member.computed {
        return Err(UaalEmitter::target_capability_error(
            "HS-UAAL-CAP-003",
            "uaal.aggregate.value.v2",
            "computed aggregate field access is unavailable; use declared field names",
        ));
    }
    let mut fields = Vec::new();
    let root = visit(member.object.as_ref(), &mut fields)?;
    let AstNode::Identifier(property) = member.property.as_ref() else {
        return Err(UaalEmitter::target_capability_error(
            "HS-UAAL-CAP-003",
            "uaal.aggregate.value.v2",
            "aggregate projection requires a named field",
        ));
    };
    fields.push(property.name.clone());
    Ok((root, fields))
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
            vec![OP_CALL, OP_HALT, OP_PUSH, OP_RET, OP_CALL, OP_RET]
        );
        assert_eq!(bytecode.instructions[0].operands, vec![Value::from(4)]);
        assert_eq!(bytecode.instructions[4].operands, vec![Value::from(2)]);
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
                OP_PUSH,
                OP_CALL,
                OP_RET
            ]
        );
        assert_eq!(bytecode.instructions[0].operands, vec![Value::from(5)]);
        assert_eq!(
            bytecode.instructions[2].operands,
            vec![Value::from("__hs::echo::x")]
        );
        assert_eq!(
            bytecode.instructions[3].operands,
            vec![Value::from("__hs::echo::x")]
        );
        assert_eq!(bytecode.instructions[5].operands, vec![Value::from(42.0)]);
        assert_eq!(bytecode.instructions[6].operands, vec![Value::from(2)]);
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
                    && instruction.operands.first() == Some(&Value::from("hs.f64.binary.v1"))
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
                    && instruction.operands.first() == Some(&Value::from("hs.f32.binary.v1"))
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
    fn lowers_local_owned_buffers_to_explicit_ownership_opcodes() {
        let bytecode = compile_source_to_uaal(
            r#"function main(): i32 {
  let values: [i32] = buffer(3, 5)
  let moved: [i32] = move(values)
  drop(moved)
  return 5
}"#,
        )
        .expect("local owned buffers should lower to the UAAL ownership ABI");

        let opcodes = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();
        assert!(
            opcodes.contains(&0xb7),
            "allocation opcode missing: {opcodes:?}"
        );
        assert!(opcodes.contains(&0xb8), "move opcode missing: {opcodes:?}");
        assert!(opcodes.contains(&0xbb), "drop opcode missing: {opcodes:?}");
    }

    #[test]
    fn inserts_owned_buffer_cleanup_before_return() {
        let bytecode = compile_source_to_uaal(
            r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  return 5
}"#,
        )
        .expect("live local owners should receive deterministic return cleanup");

        let first_return = bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_RET)
            .expect("return opcode");
        let first_drop = bytecode
            .instructions
            .iter()
            .position(|instruction| instruction.op_code == OP_HS_BUFFER_DROP)
            .expect("automatic drop opcode");
        assert!(first_drop < first_return, "{:?}", bytecode.instructions);
    }

    #[test]
    fn rejects_owned_buffer_copy_use_after_move_and_double_drop() {
        for (source, expected) in [
            (
                r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  let copied: [i32] = values
  return 5
}"#,
                "must be initialized by `buffer(count, fill)` or `move(owner)`",
            ),
            (
                r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  let moved: [i32] = move(values)
  drop(values)
  return 5
}"#,
                "was already moved or dropped before `drop`",
            ),
            (
                r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  drop(values)
  drop(values)
  return 5
}"#,
                "was already moved or dropped before `drop`",
            ),
        ] {
            let error = compile_source_to_uaal(source).expect_err(expected);
            assert!(error.message.contains(expected), "{}", error.message);
        }
    }

    #[test]
    fn rejects_owned_buffer_branch_and_loop_ownership_divergence() {
        for (source, expected) in [
            (
                r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  if (true) { drop(values) } else { let untouched: i32 = 0 }
  return 5
}"#,
                "move/drop state differs across `if` branches",
            ),
            (
                r#"function main(): i32 {
  let values: [i32] = buffer(2, 5)
  while (false) { drop(values) }
  return 5
}"#,
                "move/drop state changes inside `while`",
            ),
        ] {
            let error = compile_source_to_uaal(source).expect_err(expected);
            assert!(error.message.contains(expected), "{}", error.message);
        }
    }

    #[test]
    fn lowers_owned_buffer_parameters_and_returns_as_single_owner_transfers() {
        let bytecode = compile_source_to_uaal(
            r#"function make_values(fill: i32): [i32] {
  let values: [i32] = buffer(2, fill)
  return move(values)
}
function relay(values: [i32]): [i32] {
  return move(values)
}
function consume(values: [i32]): i32 {
  return 5
}
function main(): i32 {
  let initial: [i32] = make_values(5)
  let values: [i32] = relay(move(initial))
  return consume(move(values))
}"#,
        )
        .expect("owned parameters and returns should preserve one live owner across each call");

        let opcodes = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();
        assert_eq!(
            opcodes
                .iter()
                .filter(|opcode| **opcode == OP_HS_BUFFER_ALLOC)
                .count(),
            1,
            "the reusable producer body must allocate exactly one owner"
        );
        assert_eq!(
            opcodes
                .iter()
                .filter(|opcode| **opcode == OP_HS_BUFFER_MOVE)
                .count(),
            4,
            "producer return, relay argument/return, and consumer argument must each transfer once"
        );
        assert_eq!(
            opcodes
                .iter()
                .filter(|opcode| **opcode == OP_HS_BUFFER_DROP)
                .count(),
            1,
            "the final consumer must receive one automatic parameter cleanup"
        );
    }

    #[test]
    fn rejects_implicit_owned_call_copy_and_caller_use_after_transfer() {
        for (source, expected) in [
            (
                r#"function consume(values: [i32]): i32 {
  drop(values)
  return 5
}
function main(): i32 {
  let values: [i32] = buffer(2, 5)
  return consume(values)
}"#,
                "requires explicit `move` or `drop`",
            ),
            (
                r#"function consume(values: [i32]): i32 {
  drop(values)
  return 5
}
function main(): i32 {
  let values: [i32] = buffer(2, 5)
  let result: i32 = consume(move(values))
  drop(values)
  return result
}"#,
                "was already moved or dropped before `drop`",
            ),
            (
                r#"function make_values(fill: i32): [i32] {
  let values: [i32] = buffer(2, fill)
  return move(values)
}
function main(): i32 {
  make_values(5)
  return 5
}"#,
                "must initialize an explicitly typed owner",
            ),
            (
                r#"function relay(values: [i32]): [i32] {
  return values
}
function main(): i32 { return 5 }"#,
                "requires explicit `move` or `drop`",
            ),
        ] {
            let error = compile_source_to_uaal(source)
                .expect_err("owned call boundaries must remain affine");
            assert!(error.message.contains(expected), "{}", error.message);
        }
    }

    #[test]
    fn lowers_call_scoped_shared_and_mutable_aggregate_references() {
        let bytecode = compile_source_to_uaal(
            r#"struct Packet { code: i32 }
function write(packet: &mut Packet): i32 {
  store(packet.code, 9)
  return load(packet.code)
}
function read(packet: &Packet): i32 {
  return load(packet.code)
}
function main(): i32 {
  slot packet: Packet = Packet(5)
  let changed: i32 = write(&mut packet)
  return changed + read(&packet)
}"#,
        )
        .expect("aggregate references should cross calls without copying their roots");

        let opcodes = bytecode
            .instructions
            .iter()
            .map(|instruction| instruction.op_code)
            .collect::<Vec<_>>();
        assert!(
            opcodes.contains(&0xbd),
            "borrow opcode missing: {opcodes:?}"
        );
        assert!(
            opcodes.contains(&0xbe),
            "borrowed load opcode missing: {opcodes:?}"
        );
        assert!(
            opcodes.contains(&0xbf),
            "borrowed store opcode missing: {opcodes:?}"
        );
    }

    #[test]
    fn rejects_aggregate_reference_alias_conflicts_and_mutability_escalation() {
        for (source, expected) in [
            (
                r#"struct Packet { code: i32 }
function combine(first: &mut Packet, second: &Packet): i32 { return 5 }
function main(): i32 {
  slot packet: Packet = Packet(5)
  return combine(&mut packet, &packet)
}"#,
                "aggregate borrow alias conflict",
            ),
            (
                r#"struct Packet { code: i32 }
function write(packet: &mut Packet): i32 { return 5 }
function relay(packet: &Packet): i32 { return write(packet) }
function main(): i32 {
  slot packet: Packet = Packet(5)
  return relay(&packet)
}"#,
                "expected `&mut Packet`, found `&Packet`",
            ),
        ] {
            let error = compile_source_to_uaal(source).expect_err(expected);
            assert!(error.message.contains(expected), "{}", error.message);
        }
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

    #[test]
    fn lowers_flat_pod_aggregate_calls_and_returns_as_single_affine_values() {
        let bytecode = compile(
            r#"struct Vec3I32 { x: i32, y: i32, z: i32 }

function make(x: i32, y: i32, z: i32): Vec3I32 {
  slot value: Vec3I32 = Vec3I32(x, y, z)
  return move(value)
}

function dot(left: Vec3I32, right: Vec3I32): i32 {
  return load(left.x) * load(right.x) +
    load(left.y) * load(right.y) +
    load(left.z) * load(right.z)
}

function main(): i32 {
  slot left: Vec3I32 = make(1, 2, 3)
  slot right: Vec3I32 = make(4, 5, 6)
  return dot(move(left), move(right))
}"#,
        );

        let aggregate_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| {
                instruction.op_code == OP_EXEC
                    && instruction.operands.first() == Some(&Value::from("hs.aggregate.value.v1"))
            })
            .collect::<Vec<_>>();
        assert_eq!(
            aggregate_instructions
                .iter()
                .filter(|instruction| instruction.operands[1] == Value::from("construct"))
                .count(),
            1,
            "the reusable constructor body must create one aggregate per call"
        );
        assert_eq!(
            aggregate_instructions
                .iter()
                .filter(|instruction| instruction.operands[1] == Value::from("project"))
                .count(),
            6
        );
        assert!(aggregate_instructions.iter().all(|instruction| {
            instruction.operands[2] == Value::from("Vec3I32{x:i32,y:i32,z:i32}")
        }));
    }

    #[test]
    fn aggregate_value_lowering_rejects_implicit_copies_and_unbalanced_branch_moves() {
        let implicit_copy = compile_source_to_uaal(
            r#"struct Packet { code: i32 }
function consume(packet: Packet): i32 { return load(packet.code) }
function main(): i32 {
  slot packet: Packet = Packet(5)
  return consume(packet)
}"#,
        )
        .expect_err("aggregate calls must use an explicit affine move");
        assert!(
            implicit_copy
                .message
                .contains("aggregate value `packet` requires explicit `move(packet)`"),
            "{}",
            implicit_copy.message
        );

        let branch_move = compile_source_to_uaal(
            r#"struct Packet { code: i32 }
function consume(packet: Packet): i32 { return load(packet.code) }
function main(): i32 {
  slot packet: Packet = Packet(5)
  if (true) {
    let consumed: i32 = consume(move(packet))
  }
  return 5
}"#,
        )
        .expect_err("moves that occur on only one branch must fail closed");
        assert!(
            branch_move
                .message
                .contains("aggregate move state differs across `if` branches"),
            "{}",
            branch_move.message
        );
    }

    #[test]
    fn lowers_recursive_pod_aggregate_construction_and_scalar_projection_paths() {
        let bytecode = compile(
            r#"struct Vec3I32 { x: i32, y: i32, z: i32 }
struct Aabb3I32 { min: Vec3I32, max: Vec3I32 }

function make_vec(x: i32, y: i32, z: i32): Vec3I32 {
  slot value: Vec3I32 = Vec3I32(x, y, z)
  return move(value)
}

function make_bounds(min: Vec3I32, max: Vec3I32): Aabb3I32 {
  slot value: Aabb3I32 = Aabb3I32(move(min), move(max))
  return move(value)
}

function volume(bounds: Aabb3I32): i32 {
  return (load(bounds.max.x) - load(bounds.min.x)) *
    (load(bounds.max.y) - load(bounds.min.y)) *
    (load(bounds.max.z) - load(bounds.min.z))
}

function main(): i32 {
  slot min: Vec3I32 = make_vec(1, 2, 3)
  slot max: Vec3I32 = make_vec(4, 6, 8)
  slot bounds: Aabb3I32 = make_bounds(move(min), move(max))
  return volume(move(bounds))
}"#,
        );

        let flat_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| {
                instruction.op_code == OP_EXEC
                    && instruction.operands.first() == Some(&Value::from(HS_AGGREGATE_VALUE_ABI))
            })
            .collect::<Vec<_>>();
        let nested_instructions = bytecode
            .instructions
            .iter()
            .filter(|instruction| {
                instruction.op_code == OP_EXEC
                    && instruction.operands.first() == Some(&Value::from(HS_AGGREGATE_VALUE_ABI_V2))
            })
            .collect::<Vec<_>>();

        assert_eq!(
            flat_instructions
                .iter()
                .filter(|instruction| instruction.operands[1] == Value::from("construct"))
                .count(),
            1
        );
        assert_eq!(
            nested_instructions
                .iter()
                .filter(|instruction| instruction.operands[1] == Value::from("construct"))
                .count(),
            1
        );
        let projections = nested_instructions
            .iter()
            .filter(|instruction| instruction.operands[1] == Value::from("project_path"))
            .collect::<Vec<_>>();
        assert_eq!(projections.len(), 6);
        assert!(projections.iter().all(|instruction| {
            instruction.operands[2]
                == Value::from(
                    "Aabb3I32{min:Vec3I32{x:i32,y:i32,z:i32},max:Vec3I32{x:i32,y:i32,z:i32}}",
                )
                && instruction.operands[3]
                    .as_array()
                    .is_some_and(|path| path.len() == 2)
        }));
    }

    #[test]
    fn aggregate_value_lowering_rejects_cycles_owned_fields_and_nested_copies() {
        for (source, expected) in [
            (
                "struct Node { next: Node } function main(): i32 { return 5 }",
                "recursive by-value aggregate cycle `Node -> Node`",
            ),
            (
                "struct Packet { values: [i32] } function main(): i32 { return 5 }",
                "owned buffer type `[i32]`",
            ),
            (
                "struct Inner { value: i32 } struct Outer { inner: Inner } function main(): i32 { slot inner: Inner = Inner(5) slot outer: Outer = Outer(move(inner)) return load(outer.inner) }",
                "cannot be copied by `load`",
            ),
        ] {
            let error = compile_source_to_uaal(source)
                .expect_err("unsupported aggregate layouts must fail closed");
            assert!(error.message.contains(expected), "{}", error.message);
        }
    }
}
