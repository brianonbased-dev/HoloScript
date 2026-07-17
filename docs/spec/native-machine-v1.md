# HoloScript Native Machine Contract v1

Status: experimental typed-machine tracer

`hs-machine-v1` extends the v0 source-to-native proof with exact integer types,
multiple functions, direct calls, and immutable local value bindings. The
compiler still consumes the canonical Rust AST and emits machine code directly
through Cranelift.

## Accepted compilation unit

```hs
function add(left: i32, right: i32): i32 {
  return left + right
}

function main(): i32 {
  let result: i32 = add(2, 3)
  return result
}
```

- Every parameter and return value has an explicit `i32` or `i64` type.
- A unit contains one or more uniquely named functions and exactly one
  parameterless `main`.
- A body contains zero or more explicitly typed immutable `let`/`const`
  bindings followed by exactly one `return`.
- Expressions support exact-width decimal integer literals, local/parameter
  references, direct calls to functions in the unit, unary `-`, and binary
  `+`, `-`, and `*`.
- Arguments, local initializers, and returns must match exactly. v1 has no
  implicit widening, narrowing, or truthy conversion.

Any partial signature, unsupported type, mutable local, unknown name, duplicate
name, arity mismatch, out-of-range literal, unsupported operator, or unsupported
AST node is a compile error.

## Integer semantics

`i32` and `i64` are signed two's-complement integers of exactly 32 and 64 bits.
Literals must fit their contextual type. Arithmetic and unary negation wrap
modulo 2^32 or 2^64; debug and release builds therefore have identical overflow
behavior.

## Native ABI

Each source function is exported as `hs_<source_name>` using the host calling
convention and its exact Cranelift integer signature. The compiler adds a C
runtime `main() -> i32` adapter that calls `hs_main`. An `i32` result is returned
directly; an `i64` result is truncated to the low 32 bits for the process exit
code.

Local bindings lower to typed SSA values. v1 does not assign addressable stack
slots, expose addresses, or define aggregate layout. Those semantics belong to
the memory contract rather than being inferred from optimizer placement.

## CLI proof

```powershell
cargo run -p holoscript-native --bin holoscriptc -- examples/native/typed-exit-five.hs -o typed-exit-five.exe
```

The compile receipt reports `hs-machine-v1`; running the executable exits with
code `5`.

## Compatibility and non-goals

Untyped v0 source remains accepted under `hs-machine-v0`. Optional AST type
fields are omitted when absent, preserving the serialized shape consumed by
legacy emitters.

v1 does not define casts, mutable locals, branches, loops, recursion admission,
pointers, addressable stack slots, structs, alignment, allocation, FFI imports,
syscalls, strings, files, concurrency, or cross-compilation.
