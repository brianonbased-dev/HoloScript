use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use cranelift::object::object::{Object, ObjectSection, ObjectSymbol, RelocationTarget};
use holoscript_native::{
    compile_executable, compile_object, inspect_native_layouts, NativeAggregateFfi,
    NativeCompileOptions, NativeOwnedBufferFfi, AFFINE_AGGREGATE_MACHINE_CONTRACT,
    AGGREGATE_REBORROW_MACHINE_CONTRACT, AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT,
    AGGREGATE_REFERENCE_MACHINE_CONTRACT, BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT,
    HOST_ALLOCATOR_PROVENANCE_ID, NATIVE_AGGREGATE_ABI_VERSION, OWNED_AGGREGATE_MACHINE_CONTRACT,
    OWNED_BUFFER_ABI_VERSION,
};

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
const CONTROL_FLOW_EXIT_FIVE: &str = r#"
    function below(left: i32, right: i32): bool {
        return left < right
    }

    function select(flag: bool, left: i32, right: i32): i32 {
        if (flag) {
            return left
        } else {
            return right
        }
    }

    function main(): i32 {
        slot counter: i32 = 0
        while (below(load(counter), 5)) {
            scope {
                let writer: &mut i32 = &mut counter
                *writer = *writer + 1
            }
        }
        scope {
            let view: &i32 = &counter
            if (*view == 5 && true) {
                return select(false, 2, *view)
            }
        }
        return 1
    }
"#;
const CONTROL_FLOW_BOOL_MEMORY_EXIT_FIVE: &str = r#"
    function ordered(left: i64, right: i64): bool {
        return left < right
    }

    function main(): i32 {
        slot flag: bool = false
        scope {
            let writer: &mut bool = &mut flag
            *writer = !*writer
        }
        if (load(flag) || false) {
            if (2 != 3 && 2 <= 2 && 3 > 2 && 3 >= 3 && ordered(-1, 2)) {
                return 5
            } else {
                return 2
            }
        } else {
            return 1
        }
    }
"#;
const AGGREGATE_EXIT_FIVE: &str = r#"
    struct Packet { enabled: bool, count: i64, code: i32 }

    function main(): i32 {
        slot packet: Packet = Packet(false, 2, 1)
        store(packet.enabled, true)
        while (load(packet.count) < 5) {
            store(packet.count, load(packet.count) + 1)
        }
        if (load(packet.enabled) && load(packet.count) == 5) {
            store(packet.code, 5)
        }
        return load(packet.code)
    }
"#;
const FIXED_ARRAY_EXIT_FIVE: &str = r#"
    struct Delta { amount: i32 }

    function main(): i32 {
        slot delta: Delta = Delta(2)
        slot values: [i32; 4] = [1, 2, 3, 4]
        let direct_index: i32 = 2
        let slice_index: i32 = 1
        store(values[1..4][slice_index], load(values[direct_index]) + load(delta.amount))
        return load(values[direct_index])
    }
"#;
const BORROWED_SLICE_EXIT_FIVE: &str = r#"
    struct Delta { amount: i32 }

    function main(): i32 {
        slot delta: Delta = Delta(2)
        slot values: [i32; 4] = [1, 2, 3, 4]
        scope {
            let view: &[i32] = &values[1..4]
            let index: i32 = 1
            let observed: i32 = load(view[index])
        }
        scope {
            let writer: &mut [i32] = &mut values[1..4]
            let index: i32 = 1
            store(writer[index], load(writer[index]) + load(delta.amount))
        }
        return load(values[2])
    }
"#;
const BORROWED_SLICE_CALL_EXIT_FIVE: &str = r#"
    function read(values: &[i32], index: i32): i32 {
        return load(values[index])
    }

    function add_two(values: &mut [i32], index: i32): i32 {
        store(values[index], load(values[index]) + 2)
        return load(values[index])
    }

    function main(): i32 {
        slot values: [i32; 4] = [1, 2, 3, 4]
        let observed: i32 = read(&values[1..4], 1)
        let updated: i32 = add_two(&mut values[1..4], 1)
        return read(&values[1..4], observed - 2) + updated - 5
    }
"#;
const FORWARDED_SLICE_CALL_EXIT_FIVE: &str = r#"
    function read(values: &[i32], index: i32): i32 {
        return load(values[index])
    }

    function descend(values: &[i32], depth: i32): i32 {
        if (depth == 0) {
            return read(&values[1..3], 0)
        } else {
            return descend(values, depth - 1)
        }
    }

    function add_two(values: &mut [i32], index: i32): i32 {
        store(values[index], load(values[index]) + 2)
        return load(values[index])
    }

    function forward_mut(values: &mut [i32], index: i32): i32 {
        return add_two(values, index)
    }

    function narrow_mut(values: &mut [i32]): i32 {
        return forward_mut(&mut values[1..3], 0)
    }

    function main(): i32 {
        slot values: [i32; 4] = [1, 2, 3, 4]
        let observed: i32 = descend(&values[0..4], 2)
        let updated: i32 = narrow_mut(&mut values[0..4])
        return observed + updated - 1
    }
"#;
const RUNTIME_SLICE_REBORROW_EXIT_FIVE: &str =
    include_str!("../../../examples/native/runtime-slice-reborrow-exit-five.hs");
const OWNED_BUFFER_MOVE_EXIT_FIVE: &str =
    include_str!("../../../examples/native/owned-buffer-move-exit-five.hs");
const OWNED_BUFFER_TRANSFER_EXIT_FIVE: &str =
    include_str!("../../../examples/native/owned-buffer-transfer-exit-five.hs");
const OWNED_AGGREGATE_DROP_EXIT_FIVE: &str =
    include_str!("../../../examples/native/owned-aggregate-drop-exit-five.hs");
const AFFINE_AGGREGATE_TRANSFER_EXIT_FIVE: &str =
    include_str!("../../../examples/native/affine-aggregate-transfer-exit-five.hs");
const AGGREGATE_REFERENCE_EXIT_FIVE: &str =
    include_str!("../../../examples/native/aggregate-reference-exit-five.hs");
const AGGREGATE_REFERENCE_CALL_EXIT_FIVE: &str =
    include_str!("../../../examples/native/aggregate-reference-call-exit-five.hs");
const AGGREGATE_REBORROW_EXIT_FIVE: &str =
    include_str!("../../../examples/native/aggregate-reborrow-exit-five.hs");
const AGGREGATE_BORROWED_RETURN_EXIT_FIVE: &str =
    include_str!("../../../examples/native/aggregate-borrowed-return-exit-five.hs");

fn scratch_executable(name: &str) -> std::path::PathBuf {
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock must follow the Unix epoch")
        .as_nanos();
    let suffix = if cfg!(windows) { ".exe" } else { "" };
    std::env::temp_dir().join(format!("holoscript-{name}-{nonce}{suffix}"))
}

fn remove_scratch_executable_with_retry(path: &std::path::Path) {
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
        "remove scratch executable {}: {}",
        path.display(),
        last_error.expect("a failed removal must record its error")
    );
}

fn relocation_count_to_symbol(object_bytes: &[u8], expected: &str) -> usize {
    let file = cranelift::object::object::File::parse(object_bytes)
        .expect("native compiler must emit a readable object");
    file.sections()
        .flat_map(|section| section.relocations())
        .filter(|(_, relocation)| {
            let RelocationTarget::Symbol(index) = relocation.target() else {
                return false;
            };
            file.symbol_by_index(index)
                .ok()
                .and_then(|symbol| symbol.name().ok())
                .is_some_and(|name| name.trim_start_matches('_') == expected)
        })
        .count()
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
fn compiles_bool_branches_loops_and_early_scope_cleanup_edges() {
    let executable = scratch_executable("native-control-flow");
    let artifact = compile_executable(
        CONTROL_FLOW_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("typed control flow should compile to a native executable");

    assert_eq!(artifact.machine_contract, "hs-machine-v5");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("control-flow executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove control-flow executable");

    let executable = scratch_executable("native-bool-memory");
    let artifact = compile_executable(
        CONTROL_FLOW_BOOL_MEMORY_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("bool slots, bool references, logical operators, and comparisons should compile");

    assert_eq!(artifact.machine_contract, "hs-machine-v5");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("bool-memory executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove bool-memory executable");
}

#[test]
fn compiles_contiguous_typed_aggregates_with_exact_layout() {
    let layouts = inspect_native_layouts(AGGREGATE_EXIT_FIVE)
        .expect("typed aggregate layout should be inspectable");
    assert_eq!(layouts.len(), 1);
    let packet = &layouts[0];
    assert_eq!(packet.name, "Packet");
    assert_eq!(packet.size, 24);
    assert_eq!(packet.alignment, 8);
    assert_eq!(packet.fields.len(), 3);
    assert_eq!(packet.fields[0].name, "enabled");
    assert_eq!(packet.fields[0].machine_type, "bool");
    assert_eq!(packet.fields[0].offset, 0);
    assert_eq!(packet.fields[1].name, "count");
    assert_eq!(packet.fields[1].machine_type, "i64");
    assert_eq!(packet.fields[1].offset, 8);
    assert_eq!(packet.fields[2].name, "code");
    assert_eq!(packet.fields[2].machine_type, "i32");
    assert_eq!(packet.fields[2].offset, 16);

    let executable = scratch_executable("native-aggregate");
    let artifact = compile_executable(
        AGGREGATE_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("typed aggregate should compile to a native executable");
    assert_eq!(artifact.machine_contract, "hs-machine-v6");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("aggregate executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove aggregate executable");
}

#[test]
fn compiles_fixed_arrays_and_bounds_checked_slice_projections() {
    let executable = scratch_executable("native-fixed-array");
    let artifact = compile_executable(
        FIXED_ARRAY_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("fixed arrays and bounded slice projections should compile");
    assert_eq!(artifact.machine_contract, "hs-machine-v7");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("fixed-array executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove fixed-array executable");

    for (name, index) in [("upper-bound", "4"), ("negative", "-1")] {
        let source = format!(
            "function main(): i32 {{ slot values: [i32; 4] = [1, 2, 3, 4] let index: i32 = {index} return load(values[index]) }}"
        );
        let executable = scratch_executable(&format!("native-array-{name}"));
        let artifact = compile_executable(&source, &executable, &NativeCompileOptions::host())
            .expect("dynamic out-of-bounds access should compile to a runtime trap");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("out-of-bounds executable should launch");
        assert!(!status.success(), "out-of-bounds index {index} must trap");
        remove_scratch_executable_with_retry(&artifact.executable);
    }
}

#[test]
fn compiles_non_escaping_borrowed_slices_with_lexical_alias_release() {
    let executable = scratch_executable("native-borrowed-slice");
    let artifact = compile_executable(
        BORROWED_SLICE_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("borrowed slices should compile with lexical alias release");
    assert_eq!(artifact.machine_contract, "hs-machine-v8");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("borrowed-slice executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove borrowed-slice executable");

    compile_object(
        r#"function main(): i32 {
           slot values: [i32; 4] = [1, 2, 3, 4]
           let first: &[i32] = &values[0..3]
           let second: &[i32] = &values[1..4]
           return load(first[0]) + load(second[0]) + 2
         }"#,
        &NativeCompileOptions::host(),
    )
    .expect("multiple shared slice borrows should coexist");

    for (name, index) in [("upper-bound", "2"), ("negative", "-1")] {
        let source = format!(
            "function main(): i32 {{ slot values: [i32; 4] = [1, 2, 3, 4] let view: &[i32] = &values[1..3] let index: i32 = {index} return load(view[index]) }}"
        );
        let executable = scratch_executable(&format!("native-slice-{name}"));
        let artifact = compile_executable(&source, &executable, &NativeCompileOptions::host())
            .expect("dynamic borrowed-slice out-of-bounds access should compile to a runtime trap");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("out-of-bounds borrowed-slice executable should launch");
        assert!(
            !status.success(),
            "out-of-bounds slice index {index} must trap"
        );
        remove_scratch_executable_with_retry(&artifact.executable);
    }
}

#[test]
fn compiles_call_safe_borrowed_slice_parameters() {
    let executable = scratch_executable("native-borrowed-slice-call");
    let artifact = compile_executable(
        BORROWED_SLICE_CALL_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("borrowed slice parameters should compile through the explicit pair ABI");
    assert_eq!(artifact.machine_contract, "hs-machine-v9");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("borrowed-slice call executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove borrowed-slice call executable");

    compile_object(
        r#"function sum(first: &[i32], second: &[i32]): i32 {
               return load(first[0]) + load(second[0])
           }
           function main(): i32 {
               slot values: [i32; 2] = [2, 3]
               return sum(&values[0..1], &values[1..2])
           }"#,
        &NativeCompileOptions::host(),
    )
    .expect("sibling shared reborrows of one root should coexist");

    for (name, index) in [("upper-bound", "2"), ("negative", "-1")] {
        let source = format!(
            "function read(values: &[i32], index: i32): i32 {{ return load(values[index]) }} function main(): i32 {{ slot values: [i32; 4] = [1, 2, 3, 4] return read(&values[1..3], {index}) }}"
        );
        let executable = scratch_executable(&format!("native-slice-call-{name}"));
        let artifact = compile_executable(&source, &executable, &NativeCompileOptions::host())
            .expect("callee-side out-of-bounds access should compile to a runtime trap");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("out-of-bounds slice-call executable should launch");
        assert!(
            !status.success(),
            "out-of-bounds slice parameter index {index} must trap"
        );
        remove_scratch_executable_with_retry(&artifact.executable);
    }
}

#[test]
fn compiles_forwarded_and_nested_reborrowed_slice_parameters() {
    let executable = scratch_executable("native-forwarded-slice-call");
    let artifact = compile_executable(
        FORWARDED_SLICE_CALL_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("slice parameters should forward and sub-slice through nested direct calls");
    assert_eq!(artifact.machine_contract, "hs-machine-v10");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("forwarded-slice executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove forwarded-slice executable");

    let executable = scratch_executable("native-local-slice-forward");
    let artifact = compile_executable(
        r#"function read(values: &[i32], index: i32): i32 {
               return load(values[index])
           }
           function add_two(values: &mut [i32], index: i32): i32 {
               store(values[index], load(values[index]) + 2)
               return load(values[index])
           }
           function main(): i32 {
               slot values: [i32; 3] = [1, 3, 4]
               let writer: &mut [i32] = &mut values[0..3]
               let observed: i32 = read(writer, 1)
               let updated: i32 = add_two(writer, 1)
               return observed + updated - 3
           }"#,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("a mutable local slice should permit shared and mutable call-duration reborrows");
    assert_eq!(artifact.machine_contract, "hs-machine-v10");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("local-slice forwarding executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove local-slice forwarding executable");

    compile_object(
        r#"function sum(first: &[i32], second: &[i32]): i32 {
               return load(first[0]) + load(second[0])
           }
           function relay(first: &[i32], second: &[i32]): i32 {
               return sum(first, second)
           }
           function main(): i32 {
               slot values: [i32; 2] = [2, 3]
               return relay(&values[0..1], &values[1..2])
           }"#,
        &NativeCompileOptions::host(),
    )
    .expect("shared parameter-derived slice forwarding should coexist");

    let source = r#"function read(values: &[i32], index: i32): i32 {
           return load(values[index])
       }
       function narrow(values: &[i32]): i32 {
           return read(&values[1..3], 0)
       }
       function main(): i32 {
           slot values: [i32; 2] = [1, 2]
           return narrow(&values[0..2])
       }"#;
    let executable = scratch_executable("native-forwarded-slice-bounds");
    let artifact = compile_executable(source, &executable, &NativeCompileOptions::host())
        .expect("parameter sub-slice bounds should compile to a runtime trap");
    assert_eq!(artifact.machine_contract, "hs-machine-v10");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("out-of-bounds parameter sub-slice executable should launch");
    assert!(
        !status.success(),
        "out-of-bounds parameter sub-slice must trap"
    );
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn compiles_runtime_indexed_named_slice_reborrows() {
    let executable = scratch_executable("native-runtime-slice-reborrow");
    let artifact = compile_executable(
        RUNTIME_SLICE_REBORROW_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("runtime-indexed shared and mutable parameter reborrows should compile");
    assert_eq!(artifact.machine_contract, "hs-machine-v11");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("runtime-indexed slice executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove runtime-indexed slice executable");

    let executable = scratch_executable("native-runtime-local-slice-reborrow");
    let artifact = compile_executable(
        r#"function read(values: &[i32], index: i32): i32 {
               return load(values[index])
           }
           function main(): i32 {
               slot values: [i32; 4] = [1, 2, 3, 4]
               let view: &[i32] = &values[1..4]
               let start: i32 = 1
               let end: i32 = 3
               return read(&view[start..end], 0) + 2
           }"#,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("runtime-indexed stack-rooted slice reborrows should compile");
    assert_eq!(artifact.machine_contract, "hs-machine-v11");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("runtime-indexed local-slice executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove runtime local-slice executable");
}

#[test]
fn runtime_indexed_slice_reborrows_trap_before_invalid_addressing() {
    for (name, start, end) in [
        ("negative-start", "-1", "2"),
        ("negative-end", "0", "-1"),
        ("reversed", "3", "2"),
        ("upper-bound", "0", "5"),
    ] {
        let source = format!(
            "function accept(values: &[i32]): i32 {{ return 5 }} function narrow(values: &[i32], start: i32, end: i32): i32 {{ return accept(&values[start..end]) }} function main(): i32 {{ slot values: [i32; 4] = [1, 2, 3, 4] return narrow(&values[0..4], {start}, {end}) }}"
        );
        let executable = scratch_executable(&format!("native-runtime-slice-{name}"));
        let artifact = compile_executable(&source, &executable, &NativeCompileOptions::host())
            .expect("invalid runtime range should compile to a checked trap");
        assert_eq!(artifact.machine_contract, "hs-machine-v11");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("invalid runtime range executable should launch");
        assert!(!status.success(), "runtime range {start}..{end} must trap");
        remove_scratch_executable_with_retry(&artifact.executable);
    }

    let executable = scratch_executable("native-runtime-empty-slice");
    let artifact = compile_executable(
        r#"function accept(values: &[i32]): i32 { return 5 }
           function narrow(values: &[i32], edge: i32): i32 {
               return accept(&values[edge..edge])
           }
           function main(): i32 {
               slot values: [i32; 4] = [1, 2, 3, 4]
               return narrow(&values[0..4], 2)
           }"#,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("an ordered empty runtime sub-slice should remain valid");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("empty runtime sub-slice executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove empty runtime-slice executable");
}

#[test]
fn runtime_indexed_slice_contract_preserves_type_alias_and_escape_boundaries() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "function write(values: &mut [i32]): i32 { return 5 } function relay(values: &[i32], start: i32, end: i32): i32 { return write(&mut values[start..end]) } function main(): i32 { return 5 }",
            "cannot mutably forward immutable slice `values`",
        ),
        (
            "function combine(first: &mut [i32], second: &[i32]): i32 { return 5 } function relay(first: &mut [i32], second: &[i32], start: i32, end: i32): i32 { return combine(&mut first[start..end], &second[start..end]) } function main(): i32 { return 5 }",
            "potentially aliasing provenance",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function narrow(values: &[i32], start: i32, end: i32): i32 { return read(&values[start..end]) } function leak(values: &[i32]): &[i32] { return values } function main(): i32 { return 5 }",
            "hs-machine-v11 references cannot appear in function returns",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function narrow(values: &[i32], start: i64, end: i32): i32 { return read(&values[start..end]) } function main(): i32 { return 5 }",
            "slice range start for `values` expects `i32`, found `i64`",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function select_v11(values: &[i32], start: i32, end: i32): i32 { return read(&values[start..end]) } function main(): i32 { slot values: [i32; 2] = [1, 2] let start: i32 = 0 return read(&values[start..2]) }",
            "slice start must be a non-negative integer literal",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn compiles_affine_owned_buffers_moves_borrows_and_return_cleanup() {
    let first = compile_object(OWNED_BUFFER_MOVE_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("first owned-buffer object should compile");
    let second = compile_object(OWNED_BUFFER_MOVE_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("second owned-buffer object should compile");
    assert_eq!(
        first, second,
        "owned-buffer cleanup order must be deterministic"
    );

    let executable = scratch_executable("native-owned-buffer-move");
    let artifact = compile_executable(
        OWNED_BUFFER_MOVE_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("owned buffers should compile through the allocator ABI");

    assert_eq!(artifact.machine_contract, "hs-machine-v13");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("owned-buffer executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove owned-buffer executable");
}

#[test]
fn owned_buffers_drop_on_scope_fallthrough_and_support_explicit_drop() {
    let executable = scratch_executable("native-owned-buffer-scope-drop");
    let artifact = compile_executable(
        r#"function main(): i32 {
               scope {
                   let temporary: [i64] = buffer(3, 9)
                   scope {
                       let view: &[i64] = &temporary
                       let observed: i64 = load(view[1])
                   }
               }
               let explicit: [bool] = buffer(2, true)
               drop(explicit)
               let empty: [i32] = buffer(0, 0)
               return 5
           }"#,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("scope cleanup, explicit drop, and zero-length ownership should compile");

    assert_eq!(artifact.machine_contract, "hs-machine-v13");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("owned-buffer cleanup executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove owned-buffer cleanup executable");
}

#[test]
fn owned_transfer_abi_returns_consumes_and_emits_one_deallocator() {
    assert_eq!(OWNED_BUFFER_ABI_VERSION, 1);
    assert_eq!(HOST_ALLOCATOR_PROVENANCE_ID, 1);
    assert_eq!(std::mem::offset_of!(NativeOwnedBufferFfi, data), 0);
    assert_eq!(
        std::mem::offset_of!(NativeOwnedBufferFfi, length),
        std::mem::size_of::<*mut u8>()
    );
    assert_eq!(
        std::mem::offset_of!(NativeOwnedBufferFfi, allocator_id),
        std::mem::size_of::<*mut u8>() + std::mem::size_of::<i32>()
    );

    let first = compile_object(
        OWNED_BUFFER_TRANSFER_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("owned transfer ABI should compile");
    let second = compile_object(
        OWNED_BUFFER_TRANSFER_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("owned transfer ABI should compile deterministically");
    assert_eq!(first, second);
    assert_eq!(
        relocation_count_to_symbol(&first, "free"),
        1,
        "producer and caller must transfer without emitting competing cleanup calls"
    );

    let executable = scratch_executable("native-owned-buffer-transfer");
    let artifact = compile_executable(
        OWNED_BUFFER_TRANSFER_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("owned return and consuming parameter should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v13");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("owned transfer executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove owned transfer executable");
}

#[test]
fn owned_transfer_conditional_join_accepts_equal_states() {
    let source = r#"
        function consume(values: [i32]): i32 {
            return 5
        }

        function main(): i32 {
            let values: [i32] = buffer(2, 5)
            if (true) {
                let result: i32 = consume(move(values))
            } else {
                let result: i32 = consume(move(values))
            }
            return 5
        }
    "#;
    let executable = scratch_executable("native-owned-buffer-join");
    let artifact = compile_executable(source, &executable, &NativeCompileOptions::host())
        .expect("equal ownership states from both branches should join");
    assert_eq!(artifact.machine_contract, "hs-machine-v13");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("conditional ownership executable should run");
    assert_eq!(status.code(), Some(5));
    fs::remove_file(&artifact.executable).expect("remove ownership join executable");
}

#[test]
fn owned_aggregate_fields_layout_move_call_and_recursive_drop_deterministically() {
    assert_eq!(OWNED_AGGREGATE_MACHINE_CONTRACT, "hs-machine-v14");
    let owned_size = u32::try_from(std::mem::size_of::<NativeOwnedBufferFfi>())
        .expect("owned ABI record size fits the public layout report");
    let owned_alignment = u32::try_from(std::mem::align_of::<NativeOwnedBufferFfi>())
        .expect("owned ABI record alignment fits the public layout report");
    let align_up = |value: u32, alignment: u32| (value + alignment - 1) & !(alignment - 1);
    let payload_size = align_up(owned_size * 2 + 4, owned_alignment);
    let envelope_size = align_up(payload_size + owned_size, owned_alignment);

    let layouts = inspect_native_layouts(OWNED_AGGREGATE_DROP_EXIT_FIVE)
        .expect("recursive owned aggregate layouts should be inspectable");
    assert_eq!(layouts.len(), 2);
    let payload = &layouts[0];
    assert_eq!(payload.name, "Payload");
    assert_eq!(payload.size, payload_size);
    assert_eq!(payload.alignment, owned_alignment);
    assert_eq!(payload.fields[0].machine_type, "[i32]");
    assert_eq!(payload.fields[0].offset, 0);
    assert_eq!(payload.fields[0].size, owned_size);
    assert_eq!(payload.fields[1].machine_type, "[i32]");
    assert_eq!(payload.fields[1].offset, owned_size);
    assert_eq!(payload.fields[2].machine_type, "i32");
    assert_eq!(payload.fields[2].offset, owned_size * 2);

    let envelope = &layouts[1];
    assert_eq!(envelope.name, "Envelope");
    assert_eq!(envelope.size, envelope_size);
    assert_eq!(envelope.alignment, owned_alignment);
    assert_eq!(envelope.fields[0].machine_type, "Payload");
    assert_eq!(envelope.fields[0].offset, 0);
    assert_eq!(envelope.fields[0].size, payload_size);
    assert_eq!(envelope.fields[1].machine_type, "[i32]");
    assert_eq!(envelope.fields[1].offset, payload_size);

    let first = compile_object(
        OWNED_AGGREGATE_DROP_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("recursive owned aggregate object should compile");
    let second = compile_object(
        OWNED_AGGREGATE_DROP_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("recursive owned aggregate object should compile deterministically");
    assert_eq!(first, second);
    assert_eq!(
        relocation_count_to_symbol(&first, "free"),
        3,
        "the consumed field and two untouched aggregate leaves must each have one deallocator"
    );

    let executable = scratch_executable("native-owned-aggregate-drop");
    let artifact = compile_executable(
        OWNED_AGGREGATE_DROP_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("recursive owned aggregate should compile to a native executable");
    assert_eq!(artifact.machine_contract, "hs-machine-v14");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("recursive owned aggregate executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn owned_aggregate_field_can_return_through_the_owned_result_abi() {
    let source = r#"
        struct Packet { values: [i32] }

        function make(): [i32] {
            slot packet: Packet = Packet(buffer(2, 5))
            return move(packet.values)
        }

        function consume(values: [i32]): i32 {
            let view: &[i32] = &values
            return load(view[0])
        }

        function main(): i32 {
            let values: [i32] = make()
            return consume(move(values))
        }
    "#;
    let object = compile_object(source, &NativeCompileOptions::host())
        .expect("owned aggregate field should return through the ABI");
    assert_eq!(relocation_count_to_symbol(&object, "free"), 1);

    let executable = scratch_executable("native-owned-aggregate-return");
    let artifact = compile_executable(source, &executable, &NativeCompileOptions::host())
        .expect("owned aggregate field return should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v14");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("owned aggregate field return executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn owned_aggregate_field_state_machine_rejects_copy_alias_and_escape() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { values: [i32] } function main(): i32 { let values: [i32] = buffer(1, 5) slot packet: Packet = Packet(values) return 5 }",
            "owned buffer `packet.values` must be initialized by `buffer(count, fill)` or `move(owner)`",
        ),
        (
            "struct Packet { first: [i32], second: [i32] } function main(): i32 { let values: [i32] = buffer(1, 5) slot packet: Packet = Packet(move(values), values) return 5 }",
            "owned buffer `packet.second` must be initialized by `buffer(count, fill)` or `move(owner)`",
        ),
        (
            "struct Packet { values: [i32] } function consume(values: [i32]): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let first: i32 = consume(move(packet.values)) let second: i32 = consume(move(packet.values)) return second }",
            "owned buffer `packet.values` was already moved before argument 1 to `consume`",
        ),
        (
            "struct Packet { values: [i32] } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let view: &[i32] = &packet.values drop(packet.values) return 5 }",
            "cannot drop owned buffer `packet.values` while a borrow is active",
        ),
        (
            "struct Packet { values: [i32] } function consume(values: [i32]): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) if (true) { let result: i32 = consume(move(packet.values)) } return 5 }",
            "conditional ownership join for `packet.values`",
        ),
        (
            "struct Packet { values: [i32] } function consume(values: [i32]): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) while (false) { let result: i32 = consume(move(packet.values)) } return 5 }",
            "loop body changes ownership of `packet.values`",
        ),
        (
            "struct Node { values: [i32], next: Node } function main(): i32 { return 5 }",
            "recursive by-value aggregate cycle is not finite: Node -> Node",
        ),
        (
            "struct Packet { values: [i32] } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) drop(packet) return 5 }",
            "`drop` references unknown owned buffer `packet`",
        ),
        (
            "struct Packet { values: [i32] } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) return load(packet.values) }",
            "owned aggregate field `packet.values` must be accessed with `move`, a borrow, or `drop`",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid owned aggregate program must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }

    let equal_branch_states = r#"
        struct Packet { values: [i32] }
        function consume(values: [i32]): i32 { return 5 }
        function main(): i32 {
            slot packet: Packet = Packet(buffer(1, 5))
            if (true) {
                let result: i32 = consume(move(packet.values))
            } else {
                let result: i32 = consume(move(packet.values))
            }
            return 5
        }
    "#;
    let executable = scratch_executable("native-owned-aggregate-join");
    let artifact = compile_executable(equal_branch_states, &executable, &options)
        .expect("equal owned-field states from both branches should join");
    assert_eq!(artifact.machine_contract, "hs-machine-v14");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("owned aggregate branch-join executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn affine_aggregate_moves_calls_returns_and_recursive_drop_are_deterministic() {
    assert_eq!(AFFINE_AGGREGATE_MACHINE_CONTRACT, "hs-machine-v15");
    assert_eq!(NATIVE_AGGREGATE_ABI_VERSION, 1);

    let first = compile_object(
        AFFINE_AGGREGATE_TRANSFER_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("affine aggregate calls and returns should compile");
    let second = compile_object(
        AFFINE_AGGREGATE_TRANSFER_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("affine aggregate ABI emission should be deterministic");
    assert_eq!(first, second);
    assert_eq!(
        relocation_count_to_symbol(&first, "free"),
        2,
        "only the final aggregate receiver should drop its two owned leaves"
    );

    let executable = scratch_executable("native-affine-aggregate-transfer");
    let artifact = compile_executable(
        AFFINE_AGGREGATE_TRANSFER_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("affine aggregate calls and returns should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v15");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("affine aggregate executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn affine_aggregate_ffi_descriptor_is_versioned_target_aware_and_fail_closed() {
    assert_eq!(std::mem::offset_of!(NativeAggregateFfi, data), 0);
    assert_eq!(
        std::mem::offset_of!(NativeAggregateFfi, byte_length),
        std::mem::size_of::<*mut u8>()
    );
    assert_eq!(
        std::mem::offset_of!(NativeAggregateFfi, alignment),
        std::mem::size_of::<*mut u8>() + 4
    );
    assert_eq!(
        std::mem::offset_of!(NativeAggregateFfi, layout_fingerprint),
        std::mem::size_of::<*mut u8>() + 8
    );
    assert_eq!(
        std::mem::offset_of!(NativeAggregateFfi, abi_version),
        std::mem::size_of::<*mut u8>() + 12
    );

    let layouts = inspect_native_layouts(AFFINE_AGGREGATE_TRANSFER_EXIT_FIVE)
        .expect("v15 layouts should publish ABI fingerprints");
    let envelope = layouts
        .iter()
        .find(|layout| layout.name == "Envelope")
        .expect("Envelope layout should be reported");
    let payload = layouts
        .iter()
        .find(|layout| layout.name == "Payload")
        .expect("Payload layout should be reported");
    assert_eq!(envelope.abi_version, NATIVE_AGGREGATE_ABI_VERSION);
    assert_ne!(envelope.abi_fingerprint, 0);
    assert_ne!(envelope.abi_fingerprint, payload.abi_fingerprint);

    #[repr(align(16))]
    struct AlignedPayload([u8; 256]);
    let mut storage = AlignedPayload([0; 256]);
    assert!(envelope.size as usize <= storage.0.len());
    let mut descriptor = NativeAggregateFfi {
        data: storage.0.as_mut_ptr(),
        byte_length: envelope.size,
        alignment: envelope.alignment,
        layout_fingerprint: envelope.abi_fingerprint,
        abi_version: envelope.abi_version,
    };
    envelope
        .validate_ffi_descriptor(&descriptor)
        .expect("matching host descriptor should validate");

    descriptor.abi_version += 1;
    assert!(envelope
        .validate_ffi_descriptor(&descriptor)
        .expect_err("unknown ABI versions must fail closed")
        .to_string()
        .contains("ABI version mismatch"));
    descriptor.abi_version = envelope.abi_version;
    descriptor.layout_fingerprint ^= 1;
    assert!(envelope
        .validate_ffi_descriptor(&descriptor)
        .expect_err("foreign layout identities must fail closed")
        .to_string()
        .contains("ABI fingerprint mismatch"));
    descriptor.layout_fingerprint = envelope.abi_fingerprint;
    descriptor.byte_length += 1;
    assert!(envelope
        .validate_ffi_descriptor(&descriptor)
        .expect_err("foreign byte sizes must fail closed")
        .to_string()
        .contains("ABI layout mismatch"));
    descriptor.byte_length = envelope.size;
    descriptor.data = descriptor.data.wrapping_add(1);
    assert!(envelope
        .validate_ffi_descriptor(&descriptor)
        .expect_err("misaligned payloads must fail closed")
        .to_string()
        .contains("null or misaligned"));
}

#[test]
fn affine_aggregate_state_machine_rejects_implicit_partial_and_repeated_moves() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { values: [i32], code: i32 } function consume(packet: Packet): i32 { return load(packet.code) } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5), 5) return consume(packet) }",
            "must use explicit `move(aggregate)`",
        ),
        (
            "struct Packet { values: [i32], code: i32 } function make(): Packet { slot packet: Packet = Packet(buffer(1, 5), 5) return packet } function main(): i32 { return 5 }",
            "must use explicit `move(aggregate)`",
        ),
        (
            "struct Packet { values: [i32], code: i32 } function consume(values: [i32]): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5), 5) let consumed: i32 = consume(move(packet.values)) slot forwarded: Packet = move(packet) return 5 }",
            "owned buffer `packet.values` was already moved",
        ),
        (
            "struct Packet { values: [i32], code: i32 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5), 5) slot forwarded: Packet = move(packet) return load(packet.code) }",
            "aggregate `packet` was already moved before `load`",
        ),
        (
            "struct Packet { values: [i32], code: i32 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5), 5) slot first: Packet = move(packet) slot second: Packet = move(packet) return 5 }",
            "aggregate `packet` was already moved",
        ),
        (
            "struct Packet { values: [i32], code: i32 } function consume(packet: Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5), 5) if (true) { let result: i32 = consume(move(packet)) } else { let result: i32 = consume(move(packet)) } return load(packet.code) }",
            "aggregate `packet` was already moved before `load`",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid affine aggregate transfer must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn aggregate_references_project_nested_fields_and_release_root_borrows() {
    assert_eq!(AGGREGATE_REFERENCE_MACHINE_CONTRACT, "hs-machine-v16");
    let first = compile_object(AGGREGATE_REFERENCE_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("aggregate and scalar-field references should compile");
    let second = compile_object(AGGREGATE_REFERENCE_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("aggregate reference lowering should be deterministic");
    assert_eq!(first, second);

    let executable = scratch_executable("native-aggregate-reference");
    let artifact = compile_executable(
        AGGREGATE_REFERENCE_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("aggregate reference projections should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v16");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("aggregate reference executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);

    let v15_layout_source = r#"
        struct Counters { current: i32, limit: i32 }
        struct Packet { counters: Counters, enabled: bool }
        function transfer(packet: Packet): Packet { return move(packet) }
        function main(): i32 {
            slot packet: Packet = Packet(Counters(1, 5), true)
            slot transferred: Packet = transfer(move(packet))
            return load(transferred.counters.limit)
        }
    "#;
    let v15_layouts = inspect_native_layouts(v15_layout_source)
        .expect("v15 aggregate layouts should remain inspectable");
    let v16_layouts = inspect_native_layouts(AGGREGATE_REFERENCE_EXIT_FIVE)
        .expect("v16 references should preserve aggregate layouts");
    assert_eq!(v16_layouts, v15_layouts);
}

#[test]
fn aggregate_reference_contract_rejects_alias_escape_and_moved_roots() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let view: &Packet = &packet let writer: &mut Packet = &mut packet return 5 }",
            "cannot mutably borrow stack slot `packet` because an active borrow already exists",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let field: &i32 = &packet.code let writer: &mut Packet = &mut packet return 5 }",
            "cannot mutably borrow stack slot `packet` because an active borrow already exists",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let field: &i32 = &packet.code slot moved: Packet = move(packet) return 5 }",
            "cannot move aggregate `packet` for initializer for aggregate `moved` while a borrow is active",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let writer: &mut Packet = &mut packet return load(packet.code) }",
            "cannot directly load stack slot `packet` while an exclusive borrow is active",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(1) let view: &Packet = &packet store(packet.code, 5) return 5 }",
            "cannot store to stack slot `packet` while an active borrow exists",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(1) let view: &Packet = &packet store(view.code, 5) return 5 }",
            "cannot write through immutable aggregate reference `view`",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) slot moved: Packet = move(packet) let view: &Packet = &packet return 5 }",
            "cannot borrow aggregate `packet` after move",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let view: &Packet = &packet return view }",
            "aggregate reference `view` cannot escape as a scalar value",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let field: &i32 = &packet.code *field = 2 return 5 }",
            "cannot write through immutable reference `field`",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let field: &i64 = &packet.code return 5 }",
            "reference `field` expects `i64`, but aggregate field `packet.code` stores `i32`",
        ),
        (
            "struct Packet { code: i32 } function main(): i32 { slot packet: Packet = Packet(5) let view: &Packet = &packet let alias: &Packet = &view return 5 }",
            "reborrows and nested aggregate borrows are not enabled",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid aggregate reference program must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn aggregate_reference_parameters_support_direct_borrows_and_forwarding() {
    assert_eq!(AGGREGATE_REFERENCE_CALL_MACHINE_CONTRACT, "hs-machine-v17");
    let first = compile_object(
        AGGREGATE_REFERENCE_CALL_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("aggregate-reference parameters and forwarding should compile");
    let second = compile_object(
        AGGREGATE_REFERENCE_CALL_EXIT_FIVE,
        &NativeCompileOptions::host(),
    )
    .expect("aggregate-reference call lowering should be deterministic");
    assert_eq!(first, second);
    let object = cranelift::object::object::File::parse(first.as_slice())
        .expect("aggregate-reference object should be inspectable");
    for symbol_name in ["hs_read", "hs_write", "hs_relay_read", "hs_relay_write"] {
        let symbol = object
            .symbols()
            .find(|symbol| symbol.name() == Ok(symbol_name))
            .unwrap_or_else(|| panic!("missing aggregate-reference symbol `{symbol_name}`"));
        assert!(
            !symbol.is_global(),
            "borrowed-pointer symbol `{symbol_name}` must remain local to the object"
        );
    }
    compile_object(
        "struct Packet { code: i32 } function sum(first: &Packet, second: &Packet): i32 { return load(first.code) + load(second.code) } function main(): i32 { slot packet: Packet = Packet(2) return sum(&packet, &packet) + 1 }",
        &NativeCompileOptions::host(),
    )
    .expect("sibling shared aggregate borrows of one root should coexist");
    compile_object(
        "struct Packet { code: i32 } function write_both(first: &mut Packet, second: &mut Packet): i32 { store(first.code, 2) store(second.code, 3) return load(first.code) + load(second.code) } function main(): i32 { slot first: Packet = Packet(0) slot second: Packet = Packet(0) return write_both(&mut first, &mut second) }",
        &NativeCompileOptions::host(),
    )
    .expect("mutable aggregate borrows of distinct roots should coexist");

    let executable = scratch_executable("native-aggregate-reference-call");
    let artifact = compile_executable(
        AGGREGATE_REFERENCE_CALL_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("aggregate-reference calls should link through the internal pointer ABI");
    assert_eq!(artifact.machine_contract, "hs-machine-v17");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("aggregate-reference call executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn aggregate_reference_call_contract_rejects_alias_escape_and_move_conflicts() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { code: i32 } function combine(first: &mut Packet, second: &Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(5) return combine(&mut packet, &packet) }",
            "cannot immutably borrow aggregate `packet` for call to `combine` because an exclusive sibling borrow exists",
        ),
        (
            "struct Packet { code: i32 } function write(packet: &mut Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(5) let view: &Packet = &packet return write(&mut packet) }",
            "cannot mutably borrow aggregate `packet` for call to `write` because an active or sibling borrow exists",
        ),
        (
            "struct Packet { code: i32 } function write(packet: &mut Packet): i32 { return 5 } function relay(packet: &Packet): i32 { return write(packet) } function main(): i32 { slot packet: Packet = Packet(5) return relay(&packet) }",
            "cannot mutably forward immutable aggregate reference `packet`",
        ),
        (
            "struct Packet { code: i32 } function read(packet: &Packet): i32 { store(packet.code, 5) return 5 } function main(): i32 { slot packet: Packet = Packet(1) return read(&packet) }",
            "cannot write through immutable aggregate reference parameter `packet`",
        ),
        (
            "struct Packet { code: i32 } function combine(first: &mut Packet, second: &Packet): i32 { return 5 } function relay(first: &mut Packet, second: &Packet): i32 { return combine(first, second) } function main(): i32 { slot first: Packet = Packet(1) slot second: Packet = Packet(2) return relay(&mut first, &second) }",
            "sibling mutable aggregate argument has the same or potentially aliasing provenance",
        ),
        (
            "struct Packet { code: i32 } struct Other { code: i32 } function read(packet: &Packet): i32 { return 5 } function main(): i32 { slot other: Other = Other(5) return read(&other) }",
            "expects `Packet`, but aggregate `other` stores `Other`",
        ),
        (
            "struct Packet { code: i32 } function read(packet: &Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(5) return read(&mut packet) }",
            "aggregate argument 1 to `read` expects `&`, found `&mut`",
        ),
        (
            "struct Packet { code: i32 } function consume(view: &Packet, packet: Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(5) return consume(&packet, move(packet)) }",
            "cannot move aggregate `packet` for argument 2 to `consume` while a sibling borrow exists",
        ),
        (
            "struct Packet { code: i32 } function consume(packet: Packet, view: &Packet): i32 { return 5 } function main(): i32 { slot packet: Packet = Packet(5) return consume(move(packet), &packet) }",
            "cannot borrow aggregate `packet` for call to `consume` after a sibling move",
        ),
        (
            "struct Packet { code: i32 } function leak(packet: &Packet): &Packet { return packet } function main(): i32 { return 5 }",
            "hs-machine-v17 references cannot appear in function returns",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid aggregate-reference call program must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn aggregate_reference_parameters_support_lexical_reborrows() {
    assert_eq!(AGGREGATE_REBORROW_MACHINE_CONTRACT, "hs-machine-v18");
    let first = compile_object(AGGREGATE_REBORROW_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("aggregate-reference parameter reborrows should compile");
    let second = compile_object(AGGREGATE_REBORROW_EXIT_FIVE, &NativeCompileOptions::host())
        .expect("aggregate-reference parameter reborrow lowering should be deterministic");
    assert_eq!(first, second);
    compile_object(
        "struct Packet { code: i32 } function read(packet: &Packet): i32 { return load(packet.code) } function alias(packet: &mut Packet): i32 { scope { let view: &Packet = &packet let direct: i32 = load(packet.code) let forwarded: i32 = read(packet) } store(packet.code, 5) return load(packet.code) } function main(): i32 { slot packet: Packet = Packet(1) return alias(&mut packet) }",
        &NativeCompileOptions::host(),
    )
    .expect("a shared reborrow may coexist with original reads and must release before mutation");

    let v17_layouts = inspect_native_layouts(AGGREGATE_REFERENCE_CALL_EXIT_FIVE)
        .expect("v17 aggregate-reference layouts should remain inspectable");
    let v18_layouts = inspect_native_layouts(AGGREGATE_REBORROW_EXIT_FIVE)
        .expect("v18 reborrows should preserve aggregate layouts");
    assert_eq!(v18_layouts, v17_layouts);

    let executable = scratch_executable("native-aggregate-reborrow");
    let artifact = compile_executable(
        AGGREGATE_REBORROW_EXIT_FIVE,
        &executable,
        &NativeCompileOptions::host(),
    )
    .expect("aggregate-reference parameter reborrows should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v18");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("aggregate-reference parameter reborrow executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn aggregate_parameter_reborrows_reject_alias_upgrade_chain_and_escape() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { code: i32 } function alias(packet: &Packet): i32 { let writer: &mut Packet = &mut packet return 5 } function main(): i32 { slot packet: Packet = Packet(5) return alias(&packet) }",
            "cannot mutably reborrow immutable aggregate reference parameter `packet`",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &mut Packet): i32 { let first: &mut Packet = &mut packet let second: &mut Packet = &mut packet return 5 } function main(): i32 { slot packet: Packet = Packet(5) return alias(&mut packet) }",
            "cannot mutably reborrow aggregate reference parameter `packet` because an active reborrow already exists",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &mut Packet): i32 { let view: &Packet = &packet store(packet.code, 5) return 5 } function main(): i32 { slot packet: Packet = Packet(1) return alias(&mut packet) }",
            "cannot store through aggregate reference parameter `packet` while an active reborrow exists",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &mut Packet): i32 { let writer: &mut Packet = &mut packet return load(packet.code) } function main(): i32 { slot packet: Packet = Packet(5) return alias(&mut packet) }",
            "cannot load through aggregate reference parameter `packet` while an exclusive reborrow is active",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &Packet): i32 { let view: &Packet = &packet let nested: &Packet = &view return 5 } function main(): i32 { slot packet: Packet = Packet(5) return alias(&packet) }",
            "cannot reborrow aggregate reference `view`; v18 permits one parameter reborrow layer",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &Packet): i32 { let writer: &mut i32 = &mut packet.code return 5 } function main(): i32 { slot packet: Packet = Packet(5) return alias(&packet) }",
            "cannot mutably reborrow immutable aggregate reference parameter `packet`",
        ),
        (
            "struct Packet { code: i32 } function leak(packet: &Packet): &Packet { let view: &Packet = &packet return view } function main(): i32 { return 5 }",
            "hs-machine-v18 references cannot appear in function returns",
        ),
        (
            "struct Packet { code: i32 } function alias(packet: &mut Packet): i32 { scope { let writer: &mut Packet = &mut packet scope { store(packet.code, 5) } } return 5 } function main(): i32 { slot packet: Packet = Packet(1) return alias(&mut packet) }",
            "cannot store through aggregate reference parameter `packet` while an active reborrow exists",
        ),
        (
            "struct Packet { code: i32 } function write(packet: &mut Packet): i32 { return 5 } function alias(packet: &mut Packet): i32 { let view: &Packet = &packet return write(packet) } function main(): i32 { slot packet: Packet = Packet(1) return alias(&mut packet) }",
            "cannot mutably forward aggregate reference parameter `packet` while an active reborrow exists",
        ),
        (
            "struct Packet { code: i32 } function read(packet: &Packet): i32 { return 5 } function alias(packet: &mut Packet): i32 { let writer: &mut Packet = &mut packet return read(packet) } function main(): i32 { slot packet: Packet = Packet(1) return alias(&mut packet) }",
            "cannot forward aggregate reference parameter `packet` while an exclusive reborrow is active",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid aggregate parameter reborrow must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn aggregate_reference_results_are_tied_to_the_callers_root() {
    assert_eq!(BORROWED_AGGREGATE_RETURN_MACHINE_CONTRACT, "hs-machine-v19");
    let options = NativeCompileOptions::host();
    let first = compile_object(AGGREGATE_BORROWED_RETURN_EXIT_FIVE, &options)
        .expect("caller-tied aggregate reference result should compile");
    let second = compile_object(AGGREGATE_BORROWED_RETURN_EXIT_FIVE, &options)
        .expect("caller-tied aggregate reference lowering should be deterministic");
    assert_eq!(first, second);

    compile_object(
        "struct Packet { code: i32 } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(1) scope { let view: &Packet = borrow(&packet) let observed: i32 = load(view.code) } store(packet.code, 5) return load(packet.code) }",
        &options,
    )
    .expect("a returned shared lease should release at lexical scope exit");
    compile_object(
        "struct Packet { code: i32 } function borrow_mut<'a>(packet: &'a mut Packet): &'a mut Packet { return packet } function main(): i32 { slot packet: Packet = Packet(1) let writer: &mut Packet = borrow_mut(&mut packet) store(writer.code, 5) return load(writer.code) }",
        &options,
    )
    .expect("a returned mutable lease should retain exclusive caller provenance");

    let executable = scratch_executable("native-aggregate-borrowed-return");
    let artifact = compile_executable(AGGREGATE_BORROWED_RETURN_EXIT_FIVE, &executable, &options)
        .expect("caller-tied aggregate reference result should link");
    assert_eq!(artifact.machine_contract, "hs-machine-v19");
    let status = Command::new(&artifact.executable)
        .status()
        .expect("aggregate borrowed-return executable should run");
    assert_eq!(status.code(), Some(5));
    remove_scratch_executable_with_retry(&artifact.executable);
}

#[test]
fn aggregate_reference_results_reject_ambiguous_or_escaping_provenance() {
    let options = NativeCompileOptions::host();
    for (source, expected) in [
        (
            "struct Packet { code: i32 } function leak(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { return 5 }",
            "parameter lifetime `'a` is not declared",
        ),
        (
            "struct Packet { code: i32 } function read(packet: &'a Packet): i32 { return load(packet.code) } function main(): i32 { return 5 }",
            "parameter lifetime `'a` is not declared",
        ),
        (
            "struct Packet { code: i32 } function leak(packet: &Packet): &'a Packet { return packet } function main(): i32 { return 5 }",
            "declares borrowed return lifetime `'a` without binding it",
        ),
        (
            "struct Packet { code: i32 } function leak<'a>(packet: &'a Packet): &Packet { return packet } function main(): i32 { return 5 }",
            "borrowed aggregate return requires an explicit declared lifetime",
        ),
        (
            "struct Packet { code: i32 } function choose<'a>(left: &'a Packet, right: &'a Packet): &'a Packet { return left } function main(): i32 { return 5 }",
            "borrowed return lifetime `'a` has ambiguous provenance",
        ),
        (
            "struct Packet { code: i32 } function leak<'a>(packet: &'a Packet): &'a Packet { slot local: Packet = Packet(5) let view: &Packet = &local return view } function main(): i32 { return 5 }",
            "must return source parameter `packet` directly",
        ),
        (
            "struct Packet { code: i32 } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(1) let view: &Packet = borrow(&packet) store(packet.code, 5) return load(view.code) }",
            "cannot store to stack slot `packet` while an active borrow exists",
        ),
        (
            "struct Packet { code: i32 } function borrow_mut<'a>(packet: &'a mut Packet): &'a mut Packet { return packet } function main(): i32 { slot packet: Packet = Packet(1) let first: &mut Packet = borrow_mut(&mut packet) let second: &mut Packet = borrow_mut(&mut packet) return 5 }",
            "cannot mutably borrow aggregate `packet` for call to `borrow_mut` because an active or sibling borrow exists",
        ),
        (
            "struct Packet { code: i32 } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(5) let code: i32 = borrow(&packet) return code }",
            "returns a borrowed aggregate reference; bind it to a typed reference local",
        ),
        (
            "struct Packet { values: [i32] } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let view: &Packet = borrow(&packet) drop(packet.values) return 5 }",
            "cannot drop owned buffer `packet.values` while aggregate ancestor `packet` is borrowed",
        ),
        (
            "struct Packet { values: [i32] } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let view: &Packet = borrow(&packet) let moved: [i32] = move(packet.values) return 5 }",
            "cannot move owned buffer `packet.values` while aggregate ancestor `packet` is borrowed",
        ),
        (
            "struct Packet { values: [i32] } function borrow_mut<'a>(packet: &'a mut Packet): &'a mut Packet { return packet } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let values: &[i32] = &packet.values let writer: &mut Packet = borrow_mut(&mut packet) return 5 }",
            "descendant `packet.values` already has a conflicting borrow",
        ),
        (
            "struct Packet { values: [i32] } function borrow<'a>(packet: &'a Packet): &'a Packet { return packet } function main(): i32 { slot packet: Packet = Packet(buffer(1, 5)) let moved: [i32] = move(packet.values) let view: &Packet = borrow(&packet) return 5 }",
            "cannot borrow aggregate root `packet` for borrowed result from `borrow` because owned leaf `packet.values` is moved",
        ),
    ] {
        let error = compile_object(source, &options)
            .expect_err("invalid borrowed aggregate result must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
}

#[test]
fn owned_buffer_runtime_guards_trap_before_invalid_allocation_or_access() {
    let cases = [
        (
            "negative-length",
            "function main(): i32 { let count: i32 = -1 let values: [i32] = buffer(count, 0) return 5 }",
        ),
        (
            "out-of-bounds",
            "function main(): i32 { let values: [i32] = buffer(2, 0) scope { let view: &[i32] = &values return load(view[2]) } }",
        ),
    ];

    for (name, source) in cases {
        let executable = scratch_executable(&format!("native-owned-buffer-{name}"));
        let artifact = compile_executable(source, &executable, &NativeCompileOptions::host())
            .expect("guarded owned-buffer program should compile");
        let status = Command::new(&artifact.executable)
            .status()
            .expect("guarded owned-buffer executable should launch");
        assert!(!status.success(), "{name} must trap");
        remove_scratch_executable_with_retry(&artifact.executable);
    }
}

#[test]
fn owned_buffer_contract_rejects_copy_double_drop_active_borrow_and_abi_escape() {
    let cases = [
        (
            "function main(): i32 { let first: [i32] = buffer(2, 0) let copied: [i32] = first return 5 }",
            "must be initialized by `buffer(count, fill)` or `move(owner)`",
        ),
        (
            "function main(): i32 { let first: [i32] = buffer(2, 0) let moved: [i32] = move(first) let again: [i32] = move(first) return 5 }",
            "owned buffer `first` was already moved",
        ),
        (
            "function main(): i32 { let values: [i32] = buffer(2, 0) drop(values) drop(values) return 5 }",
            "owned buffer `values` cannot be dropped twice",
        ),
        (
            "function main(): i32 { let values: [i32] = buffer(2, 0) let view: &[i32] = &values drop(values) return 5 }",
            "cannot drop owned buffer `values` while a borrow is active",
        ),
        (
            "function main(): i32 { let values: [i32] = buffer(2, 0) let view: &[i32] = &values let moved: [i32] = move(values) return 5 }",
            "cannot move owned buffer `values` while a borrow is active",
        ),
        (
            "function main(): i32 { let values: [i32] = buffer(2, 0) drop(values) let view: &[i32] = &values return 5 }",
            "cannot borrow owned buffer `values` after drop",
        ),
        (
            "function main(): i32 { let values: [i32] = buffer(2, 0) scope { let moved: [i32] = move(values) } return 5 }",
            "cannot move across a lexical scope boundary",
        ),
        (
            "function consume(values: [i32]): i32 { return 5 } function main(): i32 { let values: [i32] = buffer(2, 0) return consume(values) }",
            "must use explicit `move(owner)`",
        ),
        (
            "function make(): [i32] { let values: [i32] = buffer(2, 0) return values } function main(): i32 { return 5 }",
            "must use explicit `return move(owner)`",
        ),
        (
            "function consume(values: [i32]): i32 { return 5 } function main(): i32 { let values: [i32] = buffer(2, 0) let first: i32 = consume(move(values)) let second: i32 = consume(move(values)) return second }",
            "was already moved before argument 1 to `consume`",
        ),
        (
            "function consume(values: [i32]): i32 { return 5 } function main(): i32 { let values: [i32] = buffer(2, 0) if (true) { let result: i32 = consume(move(values)) } return 5 }",
            "conditional ownership join for `values`",
        ),
        (
            "function consume(values: [i32]): i32 { return 5 } function main(): i32 { let values: [i32] = buffer(2, 0) while (true) { let result: i32 = consume(move(values)) } return 5 }",
            "loop body changes ownership of `values`",
        ),
        (
            "function main(): i32 { slot values: [i32] = buffer(2, 0) return 5 }",
            "owned buffer `values` must use affine local `let` storage",
        ),
    ];

    for (source, expected) in cases {
        let error = compile_object(source, &NativeCompileOptions::host())
            .expect_err("invalid owned-buffer program must fail closed");
        assert!(
            error.to_string().contains(expected),
            "expected `{expected}` in `{error}`"
        );
    }
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
        CONTROL_FLOW_EXIT_FIVE,
        CONTROL_FLOW_BOOL_MEMORY_EXIT_FIVE,
        AGGREGATE_EXIT_FIVE,
        FIXED_ARRAY_EXIT_FIVE,
        BORROWED_SLICE_EXIT_FIVE,
        BORROWED_SLICE_CALL_EXIT_FIVE,
        FORWARDED_SLICE_CALL_EXIT_FIVE,
        RUNTIME_SLICE_REBORROW_EXIT_FIVE,
        AGGREGATE_REFERENCE_EXIT_FIVE,
        AGGREGATE_REFERENCE_CALL_EXIT_FIVE,
    ] {
        let first = compile_object(source, &options).expect("first object should compile");
        let second = compile_object(source, &options).expect("second object should compile");

        assert_eq!(first, second);
    }
}

#[test]
fn borrowed_slice_contract_enforces_bounds_aliasing_and_non_escape() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "function main(): i32 { slot values: [i32; 4] = [1, 2, 3, 4] let view: &[i32] = &values[1..3] return load(view[2]) }",
            "constant index 2 is outside bound 2",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] store(view[0], 5) return 5 }",
            "cannot write through immutable slice reference `view`",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] let writer: &mut [i32] = &mut values[0..2] return load(view[0]) }",
            "cannot mutably borrow stack slot `values`",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let writer: &mut [i32] = &mut values[0..2] let view: &[i32] = &values[0..2] return load(writer[0]) }",
            "cannot immutably borrow stack slot `values`",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] store(values[0], 5) return load(view[0]) }",
            "cannot store to stack slot `values` while an active borrow exists",
        ),
        (
            "function leak(): &[i32] { return 5 } function main(): i32 { return 5 }",
            "hs-machine-v8 references cannot appear in function returns",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] return view }",
            "slice reference `view` cannot escape as a scalar value",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i64] = &values[0..2] return 5 }",
            "slice reference `view` expects elements of `i64`, but stack slot `values` stores `i32`",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values return 5 }",
            "slice reference `view` requires a half-open fixed-array range",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0] return 5 }",
            "slice reference `view` requires a half-open fixed-array range",
        ),
        (
            "function main(): i32 { slot view: &[i32] = 5 return 5 }",
            "borrowed slice `view` cannot use addressable `slot` storage",
        ),
        (
            "struct Bad { view: &[i32] } function main(): i32 { return 5 }",
            "borrowed slices as aggregate fields are not enabled",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] return *view }",
            "slice reference `view` must be indexed",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn borrowed_slice_call_contract_enforces_abi_aliasing_and_non_escape() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "function write(values: &mut [i32]): i32 { store(values[0], 5) return 5 } function main(): i32 { slot values: [i32; 2] = [1, 2] return write(&values[0..2]) }",
            "slice argument 1 to `write` expects `&mut`, found `&`",
        ),
        (
            "function read(values: &[i64]): i32 { return 5 } function main(): i32 { slot values: [i32; 2] = [1, 2] return read(&values[0..2]) }",
            "expects elements of `i64`, but stack slot `values` stores `i32`",
        ),
        (
            "function combine(first: &mut [i32], second: &[i32]): i32 { return 5 } function main(): i32 { slot values: [i32; 4] = [1, 2, 3, 4] return combine(&mut values[0..2], &values[2..4]) }",
            "cannot immutably reborrow stack slot `values` for call to `combine` because an exclusive borrow exists",
        ),
        (
            "function write(values: &mut [i32]): i32 { return 5 } function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] return write(&mut values[0..2]) }",
            "cannot mutably reborrow stack slot `values` for call to `write` because an active or sibling borrow exists",
        ),
        (
            "function read(values: &[i32]): i32 { store(values[0], 5) return 5 } function main(): i32 { slot values: [i32; 1] = [1] return read(&values[0..1]) }",
            "cannot write through immutable slice parameter `values`",
        ),
        (
            "function leak(values: &[i32]): &[i32] { return values } function main(): i32 { return 5 }",
            "hs-machine-v9 references cannot appear in function returns",
        ),
        (
            "function read(value: &i32, values: &[i32]): i32 { return 5 } function main(): i32 { return 5 }",
            "hs-machine-v9 references cannot appear in function parameters",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn forwarded_slice_contract_preserves_mutability_provenance_and_non_escape() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "function write(values: &mut [i32]): i32 { return 5 } function relay(values: &[i32]): i32 { return write(values) } function main(): i32 { slot values: [i32; 1] = [1] return relay(&values[0..1]) }",
            "cannot mutably forward immutable slice `values`",
        ),
        (
            "function combine(first: &mut [i32], second: &[i32]): i32 { return 5 } function relay(first: &mut [i32], second: &[i32]): i32 { return combine(first, second) } function main(): i32 { return 5 }",
            "potentially aliasing provenance",
        ),
        (
            "function combine(first: &mut [i32], second: &mut [i32]): i32 { return 5 } function main(): i32 { slot values: [i32; 2] = [1, 2] let writer: &mut [i32] = &mut values[0..2] return combine(writer, writer) }",
            "sibling slice argument has the same or potentially aliasing provenance",
        ),
        (
            "function read(values: &[i64]): i32 { return 5 } function relay(values: &[i32]): i32 { return read(values) } function main(): i32 { return 5 }",
            "expects elements of `i64`, but slice `values` stores `i32`",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function main(): i32 { slot values: [i32; 3] = [1, 2, 3] let view: &[i32] = &values[1..3] return read(&view[1..3]) }",
            "slice range 1..3 exceeds fixed array length 2 for `view`",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function relay(values: &[i32]): i32 { return read(&values[2..1]) } function main(): i32 { return 5 }",
            "slice range 2..1 is not half-open and ordered for `values`",
        ),
        (
            "function read(values: &[i32]): i32 { return 5 } function relay(values: &[i32]): i32 { return read(&values[0..2147483648]) } function main(): i32 { return 5 }",
            "slice range end 2147483648 exceeds the i32 length ABI for `values`",
        ),
        (
            "function read(values: &[i32]): i32 { return load(values[0]) } function relay(values: &[i32]): i32 { return read(values) } function leak(values: &[i32]): &[i32] { return values } function main(): i32 { return 5 }",
            "hs-machine-v10 references cannot appear in function returns",
        ),
        (
            "function read(values: &[i32]): i32 { return load(values[0]) } function relay(values: &[i32]): i32 { return read(values) } function expose(values: &[i32]): i32 { return values } function main(): i32 { return 5 }",
            "slice reference `values` cannot escape as a scalar value",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn fixed_array_contract_rejects_ambiguous_layout_escape_and_bounds() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "function main(): i32 { slot values: [i32; 0] = [] return 5 }",
            "fixed array length must be greater than zero",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1] return 5 }",
            "expects 2 elements, found 1",
        ),
        (
            "function take(values: [i32; 2]): i32 { return 5 } function main(): i32 { return 5 }",
            "fixed arrays cannot appear in function parameters",
        ),
        (
            "function make(): [i32; 2] { return 5 } function main(): i32 { return 5 }",
            "fixed arrays cannot appear in function returns",
        ),
        (
            "function main(): i32 { let values: [i32; 2] = [1, 2] return 5 }",
            "fixed array local `values` must use addressable `slot` storage",
        ),
        (
            "struct Bad { values: [i32; 2] } function main(): i32 { return 5 }",
            "fixed arrays as aggregate fields are not enabled",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] return load(values) }",
            "fixed array slot `values` requires an element index",
        ),
        (
            "function main(): i32 { slot values: [i32; 2] = [1, 2] return load(values[2]) }",
            "constant index 2 is outside bound 2",
        ),
        (
            "function main(): i32 { slot values: [i32; 4] = [1, 2, 3, 4] return load(values[3..2][0]) }",
            "slice range 3..2 is not half-open and ordered",
        ),
        (
            "function main(): i32 { slot values: [i32; 4] = [1, 2, 3, 4] return load(values[1..5][0]) }",
            "slice range 1..5 exceeds fixed array length 4",
        ),
        (
            "function main(): i32 { slot values: [i32; 4] = [1, 2, 3, 4] return load(values[1..3]) }",
            "slice projection `values[1..3]` requires an element index",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn aggregate_contract_rejects_ambiguous_layout_and_escape() {
    let options = NativeCompileOptions::host();

    for (source, message) in [
        (
            "struct Pair { left: i32, left: i64 } function main(): i32 { return 5 }",
            "duplicate field `left`",
        ),
        (
            "struct Pair { left: i32 } struct Pair { right: i64 } function main(): i32 { return 5 }",
            "duplicate struct `Pair`",
        ),
        (
            "struct Empty {} struct Pair { value: i32 } function main(): i32 { return 5 }",
            "struct `Empty` must declare at least one field",
        ),
        (
            "struct Pair { left: i32, right } function main(): i32 { return 5 }",
            "requires a type for every field",
        ),
        (
            "struct Inner { value: i32 } struct Outer { inner: Inner } function main(): i32 { return 5 }",
            "field `inner` uses unsupported nested aggregate type `Inner`",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { let pair: Pair = Pair(5) return 5 }",
            "aggregate local `pair` must use addressable `slot` storage",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair() return 5 }",
            "constructor `Pair` expects 1 fields, found 0",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Other(5) return 5 }",
            "expects constructor `Pair`, found `Other`",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair(5) return load(pair.missing) }",
            "aggregate `Pair` has no field `missing`",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair(5) store(pair.value, true) return 5 }",
            "field `pair.value` expects `i32`, but found `bool`",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair(5) return load(pair) }",
            "aggregate slot `pair` requires a field projection",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair(5) return load(pair[\"value\"]) }",
            "does not support computed aggregate field access",
        ),
        (
            "struct Pair { value: i32 } function main(): i32 { scope { slot pair: Pair = Pair(5) } return load(pair.value) }",
            "references unknown aggregate slot `pair`",
        ),
    ] {
        let error = compile_object(source, &options).expect_err(message);
        assert!(error.to_string().contains(message), "{error}");
    }
}

#[test]
fn control_flow_contract_enforces_types_and_edge_scopes() {
    let options = NativeCompileOptions::host();

    let branch_local_escape = compile_object(
        r#"function main(): i32 {
           if (true) { let inner: i32 = 5 }
           return inner
         }"#,
        &options,
    )
    .expect_err("branch-local scalar bindings must not survive the join");
    assert!(branch_local_escape
        .to_string()
        .contains("references unknown local `inner`"));

    let branch_reference_escape = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           if (true) { let view: &i32 = &value }
           return *view
         }"#,
        &options,
    )
    .expect_err("branch-local references must not survive the join");
    assert!(branch_reference_escape
        .to_string()
        .contains("`view` is not a typed local reference"));

    let non_bool_condition = compile_object(
        "function main(): i32 { if (1) { return 5 } else { return 2 } }",
        &options,
    )
    .expect_err("if conditions must have type bool");
    assert!(non_bool_condition
        .to_string()
        .contains("if condition expects `bool`"));

    let mixed_comparison = compile_object(
        "function main(): i32 { if (1 == true) { return 5 } else { return 2 } }",
        &options,
    )
    .expect_err("comparison operands must have one concrete type");
    assert!(mixed_comparison
        .to_string()
        .contains("comparison operands have incompatible types"));

    let bool_arithmetic = compile_object(
        "function main(): i32 { let flag: bool = true + false return 5 }",
        &options,
    )
    .expect_err("boolean arithmetic must fail closed");
    assert!(bool_arithmetic
        .to_string()
        .contains("operator `+` requires integer operands"));

    let bool_ordering = compile_object(
        "function main(): i32 { if (true < false) { return 5 } else { return 2 } }",
        &options,
    )
    .expect_err("ordering comparisons must remain integer-only");
    assert!(bool_ordering
        .to_string()
        .contains("ordering comparison `<` requires integer operands"));

    let bool_main = compile_object("function main(): bool { return true }", &options)
        .expect_err("the process entry point must return an integer exit status");
    assert!(bool_main
        .to_string()
        .contains("process entry `main` must return `i32` or `i64`"));

    let bool_reference_abi = compile_object(
        r#"function leak(): &bool {
           slot flag: bool = false
           let view: &bool = &flag
           return view
         }
         function main(): i32 { return 5 }"#,
        &options,
    )
    .expect_err("v5 bool references must remain compiler-owned and non-escaping");
    assert!(bool_reference_abi
        .to_string()
        .contains("hs-machine-v5 references cannot appear in function returns"));

    let outer_borrow_after_join = compile_object(
        r#"function main(): i32 {
           slot value: i32 = 5
           let view: &i32 = &value
           if (true) {}
           let writer: &mut i32 = &mut value
           return *view
         }"#,
        &options,
    )
    .expect_err("a join must preserve outer borrow state");
    assert!(outer_borrow_after_join
        .to_string()
        .contains("cannot mutably borrow stack slot `value`"));

    let loop_local_escape = compile_object(
        r#"function main(): i32 {
           slot count: i32 = 0
           while (load(count) < 1) {
             let iteration: i32 = 5
             store(count, load(count) + 1)
           }
           return iteration
         }"#,
        &options,
    )
    .expect_err("loop-body bindings must not survive the back edge");
    assert!(loop_local_escape
        .to_string()
        .contains("references unknown local `iteration`"));
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
    .expect("v5 branch scopes must release their compiler-owned borrow leases");
    assert!(!branch_lifetime.is_empty());

    let scoped_return = compile_object(
        r#"function main(): i32 {
           scope { return 5 }
         }"#,
        &options,
    )
    .expect("v5 scope-internal returns must lower through a cleanup edge");
    assert!(!scoped_return.is_empty());

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
