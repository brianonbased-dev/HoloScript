# Native machine contract v17: call-safe aggregate references

## Status

`hs-machine-v17` admits aggregate references at native HoloScript function boundaries. Functions
can accept `&Aggregate` and `&mut Aggregate`, project nested scalar fields, and forward an existing
reference to another HoloScript function without copying the aggregate or exposing a raw address.

V17 inherits the v16 root-borrow model and the v15 aggregate layout fingerprint. Its pointer-shaped
call representation is compiler-owned and local to one object; it is not a new foreign ABI.

## Source model

```hs
struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function read(packet: &Packet): i32 {
    return load(packet.counters.current)
}

function write(packet: &mut Packet, value: i32): i32 {
    store(packet.counters.current, value)
    return load(packet.counters.current)
}

function relay(packet: &mut Packet): i32 {
    return write(packet, load(packet.counters.current) + 1)
}

function main(): i32 {
    slot packet: Packet = Packet(Counters(1, 5), true)
    let observed: i32 = read(&packet)
    let staged: i32 = write(&mut packet, 4)
    return relay(&mut packet)
}
```

The admitted argument forms are:

- `read(&root)` for a call-scoped shared borrow of a complete aggregate root;
- `write(&mut root, value)` for a call-scoped exclusive borrow;
- `read(view)` to forward a local `&Aggregate` or downgrade a local `&mut Aggregate` to shared;
- `write(writer, value)` to forward a local `&mut Aggregate`; and
- the same named-reference forwarding from one aggregate-reference parameter to another call.

The callee can `load(parameter.nested.scalar)` through either reference kind and can
`store(parameter.nested.scalar, value)` only through `&mut`. The final projected field remains a
native scalar (`bool`, `i32`, or `i64`).

## Internal call representation

Each aggregate-reference parameter lowers to one target-native payload pointer. The compiler:

1. proves the caller's root layout and borrow permission before emitting the call;
2. keeps every function with an aggregate-reference parameter at local object linkage;
3. traps a null or misaligned pointer at callee entry; and
4. resolves every field access from the declared aggregate layout and a checked static offset.

No source construct can observe, cast, increment, serialize, store, or return the pointer. Foreign
callers must continue to use the versioned `NativeAggregateFfi` descriptor for affine aggregate
values; v17 does not define an FFI reference type.

## Call-scoped alias and move rules

V17 retains whole-root conservatism:

- sibling shared arguments with the same root may coexist;
- any mutable sibling argument requires exclusive provenance;
- an active lexical shared borrow rejects a direct mutable call borrow;
- an active lexical mutable borrow rejects any direct sibling borrow;
- a borrow and a whole-aggregate move cannot target the same root in one call, in either argument
  order; and
- forwarding multiple reference parameters treats their provenance as potentially aliasing when a
  mutable argument is involved.

Call borrows end when the synchronous native call returns. They are compiler facts rather than
storable runtime values. Distinct local aggregate roots retain distinct provenance and can be
borrowed independently.

## Mutability, forwarding, and non-escape

A mutable reference may be forwarded to a shared parameter for one call. An immutable reference
cannot be upgraded to mutable. Direct call syntax must match the parameter exactly: `&` for shared
and `&mut` for mutable. Named references are forwarded without adding a reference-to-reference
layer.

Reference returns remain rejected. Aggregate references cannot be placed in `slot` storage,
aggregate fields, globals, owned values, or scalar expressions. Local `let alias: &T = &parameter`
reborrows and nested aggregate-root borrows also remain outside the contract.

## Contract selection and compatibility

A unit selects v17 when a function parameter reference names a declared aggregate. Units that use
only local aggregate references retain v16. V17 otherwise inherits v16 references, v15 affine
aggregate moves, v13 owned buffers, slices, fixed arrays, structured control flow, and scalar
memory operations.

V17 keeps `NativeAggregateFfi` ABI version `1` and does not change aggregate size, alignment,
fingerprint, owned-leaf, or drop semantics. It still rejects raw pointers, reference results,
foreign borrowed-reference entry points, pointer arithmetic, field-disjoint alias claims,
asynchronous reference capture, globals/statics, concurrency, atomics, custom destructors, and
unwinding.

The executable and rejection proofs live in
`packages/compiler-native/tests/native_smoke.rs`; the canonical program is
`examples/native/aggregate-reference-call-exit-five.hs`.

The local-reference predecessor is
[native machine contract v16](native-machine-v16.md).
