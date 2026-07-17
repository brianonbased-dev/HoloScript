use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use holoscript_native::{compile_executable, compile_object, NativeCompileOptions};

const EXIT_FIVE: &str = include_str!("../../../examples/native/exit-five.hs");
const TYPED_EXIT_FIVE: &str = include_str!("../../../examples/native/typed-exit-five.hs");
const I64_EXIT_FIVE: &str = r#"
    function add64(left: i64, right: i64): i64 {
        return left + right
    }

    function main(): i64 {
        let result: i64 = add64(2, 3)
        return result
    }
"#;
const STACK_SLOT_EXIT_FIVE: &str = include_str!("../../../examples/native/stack-slot-exit-five.hs");
const I64_STACK_SLOT_EXIT_FIVE: &str = r#"
    function main(): i64 {
        slot value: i64 = 2
        store(value, load(value) + 3)
        return load(value)
    }
"#;
const REFERENCE_EXIT_FIVE: &str = r#"
    function main(): i32 {
        slot readable: i32 = 5
        let view: &i32 = &readable
        return *view
    }
"#;
const MUTABLE_REFERENCE_EXIT_FIVE: &str = r#"
    function main(): i32 {
        slot writable: i32 = 2
        let writer: &mut i32 = &mut writable
        *writer = 5
        return *writer
    }
"#;
const SCOPED_REFERENCE_EXIT_FIVE: &str = r#"
    function main(): i32 {
        slot value: i32 = 2
        scope {
            let first: &i32 = &value
            let second: &i32 = &value
        }
        scope {
            let first: &mut i32 = &mut value
            *first = 5
        }
        return load(value)
    }
"#;

fn scratch_executable(name: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock must follow the Unix epoch")
        .as_nanos();
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    std::env::temp_dir().join(format!("holoscript-{name}-{nonce}{suffix}"))
}

#[test]
fn compiles_real_holoscript_to_a_native_executable() {
    let executable = scratch_executable("native-smoke");

    let artifact = compile_executable(EXIT_FIVE, &executable, &NativeCompileOptions::host())
        .expect("canonical .hs source should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v0");
    assert!(artifact.object_bytes > 0);
    assert_eq!(artifact.executable, executable);

    let status = Command::new(&artifact.executable)
        .status()
        .expect("native HoloScript executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&artifact.executable).expect("remove smoke-test executable");
}

#[test]
fn compiles_typed_functions_calls_and_local_bindings() {
    let executable = scratch_executable("native-typed");

    let artifact = compile_executable(TYPED_EXIT_FIVE, &executable, &NativeCompileOptions::host())
        .expect("typed .hs source should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v1");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("typed native HoloScript executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&artifact.executable).expect("remove typed smoke-test executable");
}

#[test]
fn compiles_i64_signatures_through_the_process_adapter() {
    let executable = scratch_executable("native-i64");

    let artifact = compile_executable(I64_EXIT_FIVE, &executable, &NativeCompileOptions::host())
        .expect("i64 signatures should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v1");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("i64 native HoloScript executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&artifact.executable).expect("remove i64 smoke-test executable");
}

#[test]
fn compiles_addressable_stack_slots_with_explicit_loads_and_stores() {
    let executable = scratch_executable("native-stack-slot");

    let artifact = compile_executable(
        STACK_SLOT_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("typed stack slots should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v2");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("stack-slot native HoloScript executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&artifact.executable).expect("remove stack-slot smoke-test executable");
}

#[test]
fn compiles_naturally_aligned_i64_stack_slots() {
    let executable = scratch_executable("native-i64-stack-slot");

    let artifact = compile_executable(
        I64_STACK_SLOT_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("i64 stack slots should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v2");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("i64 stack-slot executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&artifact.executable).expect("remove i64 stack-slot executable");
}

#[test]
fn compiles_typed_non_escaping_references() {
    for (name, source) in [
        ("native-reference", REFERENCE_EXIT_FIVE),
        ("native-mutable-reference", MUTABLE_REFERENCE_EXIT_FIVE),
    ] {
        let executable = scratch_executable(name);
        let artifact = compile_executable(source, &executable, &NativeCompileOptions::host())
            .expect("typed references should compile to a native executable");

        assert_eq!(artifact.machine_contract, "hs-machine-v3");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("reference executable should run");
        assert_eq!(status.code(), Some(5));
        fs::remove_file(&artifact.executable).expect("remove reference smoke-test executable");
    }
}

#[test]
fn compiles_scoped_reference_lifetimes_and_releases_borrows() {
    let executable = scratch_executable("native-scoped-reference");
    let artifact = compile_executable(
        SCOPED_REFERENCE_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("scoped references should release their borrows at lexical scope exit");

    assert_eq!(artifact.machine_contract, "hs-machine-v4");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("scoped-reference executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove scoped-reference executable");
}

#[test]
fn emits_deterministic_objects_for_the_same_source() {
    let options = NativeCompileOptions::host();

    for source in [
        "function main() { return 2 * 3 - 1 }",
        TYPED_EXIT_FIVE,
        STACK_SLOT_EXIT_FIVE,
        REFERENCE_EXIT_FIVE,
        MUTABLE_REFERENCE_EXIT_FIVE,
        SCOPED_REFERENCE_EXIT_FIVE,
    ] {
        let first = compile_object(source, &options).expect("first object should compile");
        let second = compile_object(source, &options).expect("second object should compile");

        assert_eq!(first, second);
    }
}

#[test]
fn scoped_reference_contract_removes_bindings_and_preserves_outer_borrows() {
    let options = NativeCompileOptions::host();

    let dangling_reference = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           scope { let view: &i32 = &value }
           return *view
         }"#,
        &options,
    )
    .expect_err("a scoped reference binding must disappear at scope exit");
    assert!(dangling_reference
        .to_string()
        .contains("`view` is not a typed local reference"));

    let dangling_local = compile_object(
        r#"function main(): i32 {
           scope { let inner: i32 = 5 }
           return inner
         }"#,
        &options,
    )
    .expect_err("a scoped scalar binding must disappear at scope exit");
    assert!(dangling_local
        .to_string()
        .contains("references unknown local `inner`"));

    let dangling_slot = compile_object(
        r#"function main(): i32 {
           scope { slot inner: i32 = 5 }
           return load(inner)
         }"#,
        &options,
    )
    .expect_err("a scoped stack-slot binding must disappear at scope exit");
    assert!(dangling_slot
        .to_string()
        .contains("`load` references unknown stack slot `inner`"));

    let outer_borrow = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           let view: &i32 = &value
           scope { let writer: &mut i32 = &mut value }
           return *view
         }"#,
        &options,
    )
    .expect_err("an inner scope must respect an active outer shared borrow");
    assert!(outer_borrow
        .to_string()
        .contains("cannot mutably borrow stack slot `value`"));

    let branch_lifetime = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           if (true) { scope { let view: &i32 = &value } }
           return load(value)
         }"#,
        &options,
    )
    .expect_err("branch-sensitive lifetime inference must fail closed");
    assert!(branch_lifetime
        .to_string()
        .contains("does not yet infer reference lifetimes across control-flow branches"));

    let scoped_return = compile_object(
        r#"function main(): i32 {
           scope { return 5 }
           return 0
         }"#,
        &options,
    )
    .expect_err("scope-internal returns require versioned control-flow lowering");
    assert!(scoped_return
        .to_string()
        .contains("returns inside lexical `scope` are not yet supported"));

    let active_shadow = compile_object(
        r#"function main(): i32 {
           let value: i32 = 2
           scope { let value: i32 = 5 }
           return value
         }"#,
        &options,
    )
    .expect_err("an active binding must not be shadowed inside a lexical scope");
    assert!(active_shadow
        .to_string()
        .contains("redeclares binding `value`"));

    let scoped_reference_return = compile_object(
        r#"function leak(): &i32 {
           scope {}
           slot value: i32 = 5
           let view: &i32 = &value
           return view
         }
         function main(): i32 { return 5 }"#,
        &options,
    )
    .expect_err("v4 references must not escape through function returns");
    assert!(scoped_reference_return
        .to_string()
        .contains("hs-machine-v4 references cannot appear in function returns"));

    let scoped_reference_parameter = compile_object(
        r#"function read(value: &i32): i32 {
           scope {}
           return *value
         }
         function main(): i32 { return 5 }"#,
        &options,
    )
    .expect_err("v4 references must not cross function ABIs");
    assert!(scoped_reference_parameter
        .to_string()
        .contains("hs-machine-v4 references cannot appear in function parameters"));
}

#[test]
fn reference_contract_enforces_aliasing_provenance_and_non_escape() {
    let options = NativeCompileOptions::host();

    let shared_then_mutable = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           let view: &i32 = &value
           let writer: &mut i32 = &mut value
           return *view
         }"#,
        &options,
    )
    .expect_err("a mutable borrow must be exclusive");
    assert!(
        shared_then_mutable
            .to_string()
            .contains("cannot mutably borrow stack slot `value`"),
        "unexpected diagnostic: {shared_then_mutable}"
    );

    let mutable_then_shared = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           let writer: &mut i32 = &mut value
           let view: &i32 = &value
           return *writer
         }"#,
        &options,
    )
    .expect_err("an exclusive borrow must reject aliases");
    assert!(mutable_then_shared
        .to_string()
        .contains("cannot immutably borrow stack slot `value`"));

    let shared_write = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 0
           let view: &i32 = &value
           *view = 5
           return *view
         }"#,
        &options,
    )
    .expect_err("an immutable reference must not write");
    assert!(shared_write
        .to_string()
        .contains("immutable reference `view`"));

    let owner_write_while_borrowed = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 0
           let view: &i32 = &value
           store(value, 5)
           return *view
         }"#,
        &options,
    )
    .expect_err("direct mutation must respect active borrows");
    assert!(owner_write_while_borrowed
        .to_string()
        .contains("active borrow"));

    let ssa_borrow = compile_object(
        "function main(): i32 { let value: i32 = 5 let view: &i32 = &value return *view }",
        &options,
    )
    .expect_err("only explicit stack slots are addressable");
    assert!(ssa_borrow
        .to_string()
        .contains("requires a declared stack slot"));

    let escaped_return = compile_object(
        "function main(): i32 { slot value: i32 = 5 let view: &i32 = &value return view }",
        &options,
    )
    .expect_err("references must not escape through returns");
    assert!(escaped_return.to_string().contains("cannot escape"));

    let reference_return_type = compile_object(
        "function leak(): &i32 { slot value: i32 = 5 let view: &i32 = &value return view }\
         function main(): i32 { return 5 }",
        &options,
    )
    .expect_err("v3 references must not appear in function return types");
    assert!(reference_return_type
        .to_string()
        .contains("cannot appear in function returns"));

    let reference_parameter = compile_object(
        "function read(value: &i32): i32 { return *value }\
         function main(): i32 { slot value: i32 = 5 return read(&value) }",
        &options,
    )
    .expect_err("v3 references must not cross function ABIs");
    assert!(reference_parameter
        .to_string()
        .contains("cannot appear in function parameters"));
}

#[test]
fn memory_contract_enforces_slot_provenance_and_binding_identity() {
    let options = NativeCompileOptions::host();

    let implicit_address = compile_object(
        "function main(): i32 {\
           let value: i32 = 2\
           store(value, 5)\
           return value\
         }",
        &options,
    )
    .expect_err("an SSA local must never become addressable implicitly");
    assert!(implicit_address.to_string().contains("hs-machine-v1"));

    let duplicate = compile_object(
        "function main(): i32 {\
           let value: i32 = 2\
           slot value: i32 = 3\
           return load(value)\
         }",
        &options,
    )
    .expect_err("a slot cannot collide with an SSA local");
    assert!(duplicate.to_string().contains("redeclares binding `value`"));

    let direct_return = compile_object(
        "function main(): i32 { slot value: i32 = 5 return value }",
        &options,
    )
    .expect_err("a stack slot cannot be returned as a scalar");
    assert!(direct_return.to_string().contains("is not a scalar value"));

    let escaped_argument = compile_object(
        "function identity(value: i32): i32 { return value }\
         function main(): i32 {\
           slot value: i32 = 5\
           return identity(value)\
         }",
        &options,
    )
    .expect_err("a stack slot cannot escape through a function argument");
    assert!(escaped_argument.to_string().contains("use `load(value)`"));

    let reserved_name = compile_object(
        "function load(value: i32): i32 { return value }\
         function main(): i32 { slot value: i32 = 5 return load(value) }",
        &options,
    )
    .expect_err("v2 reserves its memory operation names");
    assert!(reserved_name
        .to_string()
        .contains("reserves function name `load`"));
}

#[test]
fn memory_contract_rejects_invalid_loads_stores_and_layout_types() {
    let options = NativeCompileOptions::host();

    let wrong_width = compile_object(
        "function main(): i32 {\
           slot value: i32 = 0\
           store(value, 2147483648)\
           return load(value)\
         }",
        &options,
    )
    .expect_err("stores must fit the slot width exactly");
    assert!(wrong_width
        .to_string()
        .contains("requires an `i32` literal"));

    let wrong_result_width = compile_object(
        "function main(): i64 { slot value: i32 = 5 return load(value) }",
        &options,
    )
    .expect_err("loads must not widen implicitly");
    assert!(wrong_result_width
        .to_string()
        .contains("stack slot `value` stores `i32`"));

    let unknown_slot = compile_object(
        "function main(): i32 {\
           slot value: i32 = 0\
           store(missing, 5)\
           return load(value)\
         }",
        &options,
    )
    .expect_err("stores must name a declared stack slot");
    assert!(unknown_slot
        .to_string()
        .contains("unknown stack slot `missing`"));

    let wrong_load_arity = compile_object(
        "function main(): i32 { slot value: i32 = 0 return load() }",
        &options,
    )
    .expect_err("load arity must be exact");
    assert!(wrong_load_arity
        .to_string()
        .contains("exactly one stack slot"));

    let wrong_store_arity = compile_object(
        "function main(): i32 {\
           slot value: i32 = 0\
           store(value)\
           return load(value)\
         }",
        &options,
    )
    .expect_err("store arity must be exact");
    assert!(wrong_store_arity
        .to_string()
        .contains("a stack slot and one value"));

    let scalar_load = compile_object(
        "function main(): i32 {\
           slot marker: i32 = 0\
           let value: i32 = 5\
           return load(value)\
         }",
        &options,
    )
    .expect_err("load must not accept an SSA local");
    assert!(scalar_load
        .to_string()
        .contains("unknown stack slot `value`"));

    let unsupported_layout = compile_object(
        "function main(): i32 { slot value: i16 = 0 return 0 }",
        &options,
    )
    .expect_err("v2 supports only layouts it specifies exactly");
    assert!(unsupported_layout
        .to_string()
        .contains("supports only `i32` and `i64`"));
}

#[test]
fn typed_v1_preserves_user_functions_named_load() {
    let source = "function load(value: i32): i32 { return value }\
                  function main(): i32 { return load(5) }";
    let object = compile_object(source, &NativeCompileOptions::host())
        .expect("v1 function names remain compatible without a v2 slot declaration");

    assert!(!object.is_empty());
}

#[test]
fn rejects_values_and_operators_outside_hs_machine_v0() {
    let options = NativeCompileOptions::host();

    let fractional = compile_object("function main() { return 2.5 }", &options)
        .expect_err("fractional values must fail closed");
    assert!(fractional.to_string().contains("integral i64"));

    let division = compile_object("function main() { return 10 / 2 }", &options)
        .expect_err("unsupported operators must fail closed");
    assert!(division.to_string().contains("operator `/`"));

    let scene = compile_object("orb demo { color: \"red\" }", &options)
        .expect_err("world nodes must not be silently treated as machine code");
    assert!(scene.to_string().contains("function main"));
}

#[test]
fn typed_contract_rejects_partial_types_mutation_and_implicit_coercion() {
    let options = NativeCompileOptions::host();

    let partial_signature = compile_object(
        "function add(left: i32, right): i32 { return left + right }\
         function main(): i32 { return add(2, 3) }",
        &options,
    )
    .expect_err("every typed parameter must be annotated");
    assert!(partial_signature.to_string().contains("parameter `right`"));

    let untyped_local = compile_object(
        "function main(): i32 { let result = 5 return result }",
        &options,
    )
    .expect_err("typed locals must be annotated");
    assert!(untyped_local
        .to_string()
        .contains("local `result` requires"));

    let mutable_local = compile_object(
        "function main(): i32 { var result: i32 = 5 return result }",
        &options,
    )
    .expect_err("v1 locals must be immutable");
    assert!(mutable_local.to_string().contains("must be immutable"));

    let overflow = compile_object("function main(): i32 { return 2147483648 }", &options)
        .expect_err("i32 literals must fit exactly");
    assert!(overflow.to_string().contains("requires an `i32` literal"));

    let implicit_coercion = compile_object(
        "function preserve(value: i64): i64 { return value }\
         function main(): i32 {\
           let narrow: i32 = 2\
           let wide: i64 = preserve(narrow)\
           return 0\
         }",
        &options,
    )
    .expect_err("i32 must not coerce implicitly to i64");
    assert!(implicit_coercion
        .to_string()
        .contains("implicit coercions are forbidden"));
}

#[test]
fn cli_compiles_a_holoscript_file_to_a_runnable_binary() {
    let executable = scratch_executable("native-cli");
    let source_path =
        std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../examples/native/exit-five.hs");

    let compile = Command::new(env!("CARGO_BIN_EXE_holoscriptc"))
        .arg(&source_path)
        .arg("-o")
        .arg(&executable)
        .output()
        .expect("holoscriptc should launch");
    assert!(
        compile.status.success(),
        "holoscriptc failed: {}",
        String::from_utf8_lossy(&compile.stderr)
    );
    let receipt = String::from_utf8(compile.stdout).expect("receipt should be UTF-8 JSON");
    assert!(receipt.contains("\"machine_contract\": \"hs-machine-v0\""));

    let status = Command::new(&executable)
        .status()
        .expect("CLI-produced executable should run");
    assert_eq!(status.code(), Some(5));

    fs::remove_file(&executable).expect("remove CLI smoke-test executable");
}
