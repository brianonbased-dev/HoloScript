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
fn emits_deterministic_objects_for_the_same_source() {
    let options = NativeCompileOptions::host();

    for source in ["function main() { return 2 * 3 - 1 }", TYPED_EXIT_FIVE] {
        let first = compile_object(source, &options).expect("first object should compile");
        let second = compile_object(source, &options).expect("second object should compile");

        assert_eq!(first, second);
    }
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
