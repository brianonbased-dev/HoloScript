use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use holoscript_native::{
    compile_path_executable, compile_project_object, NativeCompileOptions,
    MULTI_FILE_MODULE_MACHINE_CONTRACT, TYPED_MACHINE_CONTRACT,
};

fn example_entry() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../examples/native/multi-file-modules/entry.hs")
}

fn scratch_path(name: &str) -> PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock must follow the Unix epoch")
        .as_nanos();
    std::env::temp_dir().join(format!("holoscript-v33-{name}-{nonce}"))
}

fn write(path: &Path, source: &str) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).expect("create test module directory");
    }
    fs::write(path, source).expect("write test module");
}

fn remove_executable(path: &Path) {
    let mut last_error = None;
    for _ in 0..20 {
        match fs::remove_file(path) {
            Ok(()) => return,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return,
            Err(error) => last_error = Some(error),
        }
        std::thread::sleep(std::time::Duration::from_millis(25));
    }
    panic!(
        "remove executable {}: {}",
        path.display(),
        last_error.expect("failed removal must record an error")
    );
}

#[test]
fn compiles_multi_file_modules_deterministically_and_runs_them() {
    let entry = example_entry();
    let options = NativeCompileOptions::host();
    let first = compile_project_object(&entry, &options).expect("first project compile");
    let second = compile_project_object(&entry, &options).expect("second project compile");
    assert_eq!(
        first, second,
        "the same project must emit identical object bytes"
    );

    let executable =
        scratch_path("positive").with_extension(if cfg!(windows) { "exe" } else { "" });
    let artifact =
        compile_path_executable(&entry, &executable, &options).expect("link module project");
    assert_eq!(
        artifact.machine_contract,
        MULTI_FILE_MODULE_MACHINE_CONTRACT
    );
    let status = Command::new(&artifact.executable)
        .status()
        .expect("run module executable");
    assert_eq!(status.code(), Some(5));
    remove_executable(&artifact.executable);
}

#[test]
fn preserves_the_single_file_predecessor_contract() {
    let entry =
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../examples/native/typed-exit-five.hs");
    let executable =
        scratch_path("predecessor").with_extension(if cfg!(windows) { "exe" } else { "" });
    let artifact = compile_path_executable(&entry, &executable, &NativeCompileOptions::host())
        .expect("compile predecessor");
    assert_eq!(artifact.machine_contract, TYPED_MACHINE_CONTRACT);
    remove_executable(&artifact.executable);
}

#[test]
fn rejects_imports_of_private_declarations() {
    let root = scratch_path("private-export");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { hidden } from "./math.hs"
function main(): i32 { return hidden() }
"#,
    );
    write(
        &root.join("math.hs"),
        "function hidden(): i32 { return 5 }\n",
    );

    let error = compile_project_object(&entry, &NativeCompileOptions::host())
        .expect_err("private declaration import must fail");
    assert!(error.to_string().contains("does not export `hidden`"));
    fs::remove_dir_all(&root).expect("remove private-export project");
}

#[test]
fn isolates_same_named_private_symbols_across_dependencies() {
    let root = scratch_path("symbol-isolation");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { value as left } from "./left.hs"
import { value as right } from "./right.hs"
function main(): i32 { return left() + right() }
"#,
    );
    write(
        &root.join("left.hs"),
        r#"
function hidden(): i32 { return 2 }
export function value(): i32 { return hidden() }
"#,
    );
    write(
        &root.join("right.hs"),
        r#"
function hidden(): i32 { return 3 }
export function value(): i32 { return hidden() }
"#,
    );

    let executable =
        scratch_path("symbol-isolation-exe").with_extension(if cfg!(windows) { "exe" } else { "" });
    let artifact = compile_path_executable(&entry, &executable, &NativeCompileOptions::host())
        .expect("same-named private declarations must remain isolated");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("run symbol-isolation executable");
    assert_eq!(status.code(), Some(5));
    remove_executable(&artifact.executable);
    fs::remove_dir_all(&root).expect("remove symbol-isolation project");
}

#[test]
fn rewrites_exported_aggregate_types_across_module_boundaries() {
    let root = scratch_path("aggregate-types");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { Packet, read } from "./packet.hs"
function main(): i32 {
  slot packet: Packet = Packet(5)
  return read(&packet)
}
"#,
    );
    write(
        &root.join("packet.hs"),
        r#"
export struct Packet { code: i32 }
export function read(packet: &Packet): i32 { return load(packet.code) }
"#,
    );

    let executable =
        scratch_path("aggregate-types-exe").with_extension(if cfg!(windows) { "exe" } else { "" });
    let artifact = compile_path_executable(&entry, &executable, &NativeCompileOptions::host())
        .expect("exported aggregate types must cross the module boundary");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("run cross-module aggregate executable");
    assert_eq!(status.code(), Some(5));
    remove_executable(&artifact.executable);
    fs::remove_dir_all(&root).expect("remove aggregate-types project");
}

#[test]
fn rejects_module_cycles_with_the_exact_cycle() {
    let root = scratch_path("cycle");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { helper } from "./helper.hs"
export function main(): i32 { return helper() }
"#,
    );
    write(
        &root.join("helper.hs"),
        r#"
import { main } from "./entry.hs"
export function helper(): i32 { return main() }
"#,
    );

    let error = compile_project_object(&entry, &NativeCompileOptions::host())
        .expect_err("module cycle must fail");
    assert!(error.to_string().contains("module cycle detected"));
    assert!(error
        .to_string()
        .contains("entry.hs -> helper.hs -> entry.hs"));
    fs::remove_dir_all(&root).expect("remove cycle project");
}

#[test]
fn rejects_imports_that_escape_the_entry_project_root() {
    let parent = scratch_path("escape");
    let root = parent.join("project");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { outside } from "../outside.hs"
function main(): i32 { return outside() }
"#,
    );
    write(
        &parent.join("outside.hs"),
        "export function outside(): i32 { return 5 }\n",
    );

    let error = compile_project_object(&entry, &NativeCompileOptions::host())
        .expect_err("project-root escape must fail");
    assert!(error.to_string().contains("escapes project root"));
    fs::remove_dir_all(&parent).expect("remove path-escape project");
}

#[test]
fn rejects_bare_module_specifiers() {
    let root = scratch_path("bare");
    let entry = root.join("entry.hs");
    write(
        &entry,
        r#"
import { add } from "math.hs"
function main(): i32 { return add(2, 3) }
"#,
    );

    let error = compile_project_object(&entry, &NativeCompileOptions::host())
        .expect_err("bare module specifier must fail");
    assert!(error.to_string().contains("explicit relative `.hs` path"));
    fs::remove_dir_all(&root).expect("remove bare-specifier project");
}
