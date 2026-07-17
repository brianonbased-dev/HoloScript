use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use holoscript_native::{compile_executable, compile_object, NativeCompileOptions};

const EXIT_FIVE: &str = include_str!("../../../examples/native/exit-five.hs");

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
fn emits_deterministic_objects_for_the_same_source() {
    let source = "function main() { return 2 * 3 - 1 }";
    let options = NativeCompileOptions::host();

    let first = compile_object(source, &options).expect("first object should compile");
    let second = compile_object(source, &options).expect("second object should compile");

    assert_eq!(first, second);
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
