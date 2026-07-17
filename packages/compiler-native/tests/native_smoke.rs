use std::fs;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use holoscript_native::{
    compile_executable, compile_object, inspect_native_layouts, NativeCompileOptions,
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
        fs::remove_file(&artifact.executable).expect("remove trapping array executable");
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
        fs::remove_file(&artifact.executable).expect("remove trapping slice executable");
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
        fs::remove_file(&artifact.executable).expect("remove trapping slice-call executable");
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
            "function read(values: &[i32]): i32 { return load(values[0]) } function main(): i32 { slot values: [i32; 2] = [1, 2] let view: &[i32] = &values[0..2] return read(view) }",
            "must be a direct range reborrow",
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
            "struct Pair { value: i32 } function take(pair: Pair): i32 { return 5 } function main(): i32 { return 5 }",
            "aggregates cannot appear in function parameters",
        ),
        (
            "struct Pair { value: i32 } function make(): Pair { slot pair: Pair = Pair(5) return pair } function main(): i32 { return 5 }",
            "aggregates cannot appear in function returns",
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
            "struct Pair { value: i32 } function main(): i32 { slot pair: Pair = Pair(5) let view: &i32 = &pair.value return *view }",
            "field references are not enabled by hs-machine-v6",
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
