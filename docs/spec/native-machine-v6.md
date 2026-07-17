# HoloScript Native Machine Contract v6

Status: experimental typed-aggregate tracer

`hs-machine-v6` extends the structured-control-flow v5 contract with typed,
contiguous, function-local aggregates. A typed `struct` declaration defines a
deterministic native layout, and a `slot` of that struct type owns one aligned
Cranelift stack allocation. Field loads and stores use the offsets from that
same layout object.

This is systems-language data layout. It is not a scene schema, property bag,
host object, or emitter-side record rewrite.

## Accepted surface

```hs
struct Packet {
  enabled: bool,
  count: i64,
  code: i32
}

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
```

This program selects `hs-machine-v6`, compiles to native machine code, and
exits with code `5`.

Aggregate values are addressable storage, not scalar SSA values. They must be
declared with `slot`, initialized by their named constructor in declaration
order, and accessed through explicit `load(slot.field)` or
`store(slot.field, value)` operations.

## Deterministic layout

v6 supports `bool`, `i32`, and `i64` fields. Each field receives its natural
size and alignment:

| Type | Size | Alignment |
|---|---:|---:|
| `bool` | 1 | 1 |
| `i32` | 4 | 4 |
| `i64` | 8 | 8 |

Fields remain in source declaration order. Each field offset is rounded up to
that field's alignment. The aggregate alignment is the maximum field
alignment, and the final size is rounded up to the aggregate alignment.

For `Packet`, the contract therefore reports:

| Field | Type | Offset |
|---|---|---:|
| `enabled` | `bool` | 0 |
| `count` | `i64` | 8 |
| `code` | `i32` | 16 |

`Packet` has size 24 and alignment 8. The public Rust
`inspect_native_layouts(source)` API returns these exact layouts for tooling,
tests, and future ABI work. Native lowering consumes the same internal layout
objects, preventing inspection and code generation from independently
inventing offsets.

## Fail-closed boundary

v6 deliberately rejects semantics that do not yet have one unambiguous native
meaning:

- partially typed or empty structs;
- duplicate struct or field names;
- nested aggregate fields;
- aggregate function parameters or returns;
- scalar `let`/`const` aggregate bindings;
- constructor name or arity mismatches;
- whole-aggregate loads and stores;
- computed, nested, or unknown field projections;
- references to aggregate fields;
- aggregate bindings that escape their lexical scope.

These are contract boundaries, not silent fallbacks. Pointer exposure,
aggregate copying, nested layout, field borrows, ABI passing, and heap storage
require later machine contracts with explicit ownership and calling rules.

## Compatibility and selection

A struct with at least one explicit field type selects `hs-machine-v6`. Once
selected, every struct in the compilation unit must type every field. Legacy
untyped structs retain their existing AST representation and Kotlin behavior
when no typed machine struct is present. The Kotlin bridge rejects typed machine
structs until it has target-specific layout lowering instead of pretending its
data classes provide the native contract.

All v5 control-flow rules and all v2-v4 storage, provenance, borrow, and lexical
cleanup rules remain mandatory. Scoped aggregate slots disappear at the same
cleanup edges as scalar slots. Field references remain disabled, so the borrow
tracker continues to reason only about complete scalar stack-slot roots.

The executable, layout, deterministic-object, compatibility, and rejection
proofs live in `packages/compiler-native/tests/native_smoke.rs` and the parser
and Kotlin tests in `packages/compiler-wasm`.
