# HoloScript Native Machine Contract v0

Status: experimental tracer bullet

`hs-machine-v0` is the first sovereign source-to-machine-code contract for
HoloScript. It proves that canonical `.hs` source can pass through the shared
Rust parser, lower directly to native object code, link into a host executable,
and run without translation through C++, TypeScript, Kotlin, or another source
language.

## Accepted compilation unit

The v0 unit is intentionally fail-closed:

```hs
function main() {
  return 2 + 3
}
```

- Exactly one top-level node: a parameterless function named `main`.
- Exactly one statement: `return <expression>`.
- Decimal integer literals represent signed 64-bit values.
- Expressions support unary `-` and binary `+`, `-`, and `*`.
- Every other declaration, statement, value, operator, or call is a compile
  error. The backend never drops an unsupported node or substitutes a default.

## Native ABI

The backend emits two symbols using the host calling convention:

- `hs_main() -> i64` is the HoloScript machine entry point.
- `main() -> i32` is the C-runtime adapter. It calls `hs_main` and truncates the
  result to the process exit-code width.

The compiler emits a host relocatable object with Cranelift and links it through
an installed `clang` or `cc`. `HOLOSCRIPT_NATIVE_LINKER` or `--linker` selects an
explicit linker. The successful compile receipt includes the machine-contract
version, object byte count, SHA-256 digest, and executable path.

## CLI

```powershell
cargo run -p holoscript-native --bin holoscriptc -- examples/native/exit-five.hs -o exit-five.exe
```

Running `exit-five.exe` exits with code `5`.

## Determinism and admission

The same source, compiler version, contract version, and host target must emit
byte-identical relocatable objects. Tests compile the same program twice and
compare every object byte. A native target is admitted only when the generated
executable runs and returns the expected value on that target.

## Deliberate non-goals

v0 does not yet define typed function signatures, pointers, layout, allocation,
FFI imports, syscalls, files, strings, concurrency, or cross-compilation. Those
enter through later versioned contracts; none are inferred from the legacy
untyped `number` surface.

The typed successor is [HoloScript Native Machine Contract v1](native-machine-v1.md).
