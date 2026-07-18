# Native machine contract v16: aggregate references and field borrows

## Status

`hs-machine-v16` makes native aggregate storage borrowable without exposing an address-bearing
value. A local `&Aggregate` or `&mut Aggregate` reference can project nested scalar fields, and a
scalar reference can borrow one aggregate field directly. Provenance, layout, mutability, and
lifetime remain compiler metadata.

V16 inherits the v15 affine aggregate ABI. It changes local aliasing and projection semantics,
not the foreign descriptor or payload layout.

## Source model

```hs
struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function main(): i32 {
    slot packet: Packet = Packet(Counters(1, 5), true)

    scope {
        let view: &Packet = &packet
        let observed: i32 = load(view.counters.current)
    }

    scope {
        let writer: &mut Packet = &mut packet
        store(writer.counters.current, load(writer.counters.limit))
    }

    scope {
        let field: &i32 = &packet.counters.current
        let observed: i32 = *field
    }

    return load(packet.counters.current)
}
```

The admitted forms are:

- `let view: &T = &root` for an immutable reference to a complete aggregate root;
- `let writer: &mut T = &mut root` for an exclusive reference to a complete root;
- `load(view.nested.scalar)` through either reference kind;
- `store(writer.nested.scalar, value)` through a mutable aggregate reference; and
- `let field: &S = &root.nested.scalar` or its mutable form for scalar `S`.

Every projection is resolved against the compiler's deterministic aggregate layout. Nested
aggregate fields contribute their checked offsets, but the final projected field must be
`bool`, `i32`, or `i64`. Owned-buffer leaves retain their slice-borrow, move, and drop operations.

## Conservative alias contract

V16 deliberately leases an entire aggregate root even for a direct scalar-field borrow:

- shared aggregate or field references may coexist;
- a mutable aggregate or field reference requires exclusive root access;
- owner `store(root.field, ...)` is rejected while any root borrow exists;
- owner `load(root.field)` is rejected while an exclusive root borrow exists;
- immutable aggregate references cannot store through projected fields; and
- lexical scope exit releases the root lease using the v4 cleanup rules.

The compiler does not yet claim that two fields are disjoint. This conservative rule rejects
some safe programs, but it cannot silently admit an alias between a whole-root reference and a
field reference.

## Affine interaction

Aggregate move state and borrow state share the same root identity. Borrowing a moved root is
rejected. V15 whole-value transfer is rejected while a root borrow is active. A reference cannot
outlive the lexical binding that owns its lease, so a moved aggregate cannot leave a stale local
projection behind.

Aggregate references are not affine aggregate copies. They carry no owned-leaf authority and
never run drop glue.

## Provenance and non-escape

An aggregate reference records:

- the source stack-slot identity;
- the exact aggregate layout used for projection;
- shared or mutable permission; and
- the active root borrow lease.

Generated loads and stores use the original Cranelift stack slot plus a statically checked field
offset. HoloScript cannot observe, cast, increment, serialize, return, or pass that address.
Aggregate-reference parameters and results therefore fail closed. References to references,
nested aggregate-root borrows, and reborrow chains also remain outside this contract.

## Contract selection and compatibility

A unit selects v16 when a reference annotation names a declared aggregate, or when a scalar
reference initializer borrows a field from an aggregate slot. V15 programs without those forms
retain `hs-machine-v15`; older reference, aggregate, array, slice, and ownership contracts retain
their existing selection.

V16 keeps `NativeAggregateFfi` ABI version `1`, the v15 layout fingerprint, caller-owned result
storage, and recursive owned-leaf validation. It adds no ABI-visible reference representation.

The contract still rejects raw pointers, pointer arithmetic, null references, reference ABI
escape, aggregate dereference as a scalar, owned-field scalar projection, field-disjoint alias
claims, non-lexical lifetimes, reborrows, globals/statics, concurrency, volatile/atomic access,
custom destructors, and unwinding.

The executable and rejection proofs live in
`packages/compiler-native/tests/native_smoke.rs`; the canonical program is
`examples/native/aggregate-reference-exit-five.hs`.
