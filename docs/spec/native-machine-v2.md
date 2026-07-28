# HoloScript Native Machine Contract v2

Status: experimental addressable-memory tracer

`hs-machine-v2` extends the typed v1 contract with compiler-owned, addressable
stack storage. It proves concrete layout, alignment, loads, stores, and local
provenance without prematurely treating addresses as untyped integers.

## Accepted memory surface

```hs
function main(): i32 {
  slot value: i32 = 2
  store(value, 5)
  return load(value)
}
```

- `slot name: i32 = expression` creates a 4-byte stack object aligned to at
  least 4 bytes.
- `slot name: i64 = expression` creates an 8-byte stack object aligned to at
  least 8 bytes.
- The initializer is mandatory and must have exactly the slot's declared type.
- `load(slot)` produces the slot's typed scalar value.
- `store(slot, value)` is a statement that replaces the stored value. The value
  must match the slot type exactly.
- Slot names share a function-local namespace with parameters and SSA locals;
  every binding name must be unique.

All v1 function signatures, calls, immutable SSA locals, integer expressions,
ABI rules, and deterministic-object requirements remain in force.

## Layout and alignment

| HoloScript type |    Size | Minimum alignment | Cranelift alignment exponent |
| --------------- | ------: | ----------------: | ---------------------------: |
| `i32`           | 4 bytes |           4 bytes |                            2 |
| `i64`           | 8 bytes |           8 bytes |                            3 |

Each declaration lowers to a Cranelift `ExplicitSlot` with offset-zero
`stack_load` and `stack_store` operations. A target may place a slot at a
stronger alignment, but never a weaker one. There is no padding inside either
scalar object and no aggregate layout in v2.

## Provenance and lifetime

A slot identifier denotes one compiler-owned stack object in one function
activation. It is not a scalar pointer value. The compiler therefore rejects:

- returning a slot identifier directly;
- passing a slot identifier to another function;
- using a slot in arithmetic or as a local initializer without `load`;
- loading or storing through an expression that is not a declared slot name;
- duplicate slot/local/parameter names; and
- defining v2 functions named `load` or `store`, which are reserved operations.

This non-escaping rule gives every memory access exact origin, type, extent,
alignment, and lifetime. A slot exists from its declaration through the end of
its function activation. v2 exposes no address value, so pointer arithmetic,
forged addresses, dangling references, and cross-function aliases cannot be
expressed.

## Admission and diagnostics

The presence of a `slot` declaration selects `hs-machine-v2`. Unsupported
types, missing declarations, wrong builtin arity, width mismatches, unsupported
statements, or provenance violations fail compilation. The backend never
converts an SSA local into memory implicitly and never infers memory semantics
from optimizer placement.

```powershell
cargo run -p holoscript-native --bin holoscriptc -- examples/native/stack-slot-exit-five.hs -o stack-slot-exit-five.exe
```

The compile receipt reports `hs-machine-v2`; running the executable exits with
code `5`.

### Canonical validation and lexical security

`.hs` validation uses the Rust parser distributed by `@holoscript/wasm/node`,
the same parser crate consumed by the native compiler. Typed signatures, stack
slots, loads, and stores therefore do not depend on the legacy scene parser to
be admitted by the public `validate_holoscript` tool.

Before AST construction, that parser labels the canonical HS010 host-capability
lexemes as forbidden executable tokens. It reports HS010 with source location
and does not lower the source. Exact lexemes are matched case-insensitively;
their appearance inside comments or string data remains valid. This firewall is
compiler-owned, so callers and MCP handlers must not reimplement or bypass it.

## Compatibility and non-goals

Programs without `slot` declarations continue to select v0 or v1 unchanged.
In particular, v1 may still declare ordinary functions named `load` or `store`.
The new AST node is additive and legacy untyped AST serialization remains
unchanged.

v2 does not define first-class references or raw pointers, address-of, pointer
arithmetic, casts, heap or static allocation, aggregates, fields, arrays,
explicit user-selected alignment, volatile or atomic access, FFI, syscalls,
threads, or shared memory. Those require later contracts with explicit escape,
aliasing, lifetime, and target-ABI rules.
