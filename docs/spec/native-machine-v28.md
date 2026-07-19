# Native machine contract v28: caller-tied aggregate-buffer elements

## Status

`hs-machine-v28` admits caller-tied scalar references to dynamically indexed elements of owned
buffers embedded in aggregates, including one direct forwarding hop. The machine result remains
one pointer. Compiler-only provenance carries the nominal aggregate fingerprint, exact owned-field
byte coordinate, exact named index parameter, element type, mutability, and caller aggregate root.

## Source model

```hs
struct Packet { values: [i32], other: [i32] }

function element<'a>(packet: &'a Packet, index: i32): &'a i32 {
  return &packet.values[index]
}

function relay<'a>(index: i32, packet: &'a Packet): &'a i32 {
  return element(packet, index)
}
```

Mutable sources and results use `&'a mut Packet`, `&'a mut i32`, and `&mut
packet.values[index]`. Static nested paths such as `packet.payload.values[index]` are admitted when
every intermediate field is a nominal aggregate and the final field is an owned `[T]` buffer.

## Admission and ABI identity

V28 inherits the cumulative v0-v27 contracts. An aggregate-buffer element result additionally
requires:

- exactly one explicit lifetime source on a nominal aggregate-reference parameter;
- exactly one `i32` parameter in each result-producing leaf or relay;
- one direct top-level final return from an exact static owned-field path and exact named index;
- aggregate-source, element-type, and mutability agreement across the declared result; and
- for forwarding, one direct non-forwarding leaf call receiving the relay's exact aggregate and
  index identifiers at the leaf ABI's corresponding positions.

The field coordinate is derived from the nominal aggregate layout, not from the element type. Two
same-shaped owned-buffer fields therefore retain different provenance. The aggregate ABI
fingerprint and field offset must agree at each forwarding boundary.

## Runtime guards

At the leaf, relay, and outer caller, generated code loads the embedded version-1 owned-buffer
record at the exact field coordinate and validates its pointer, signed length, allocator provenance,
and element alignment. Each boundary then checks `0 <= index < length` before computing
`buffer_base + index * element_size`. The relay and caller trap unless the returned pointer equals
their independently reconstructed address exactly.

## Caller ownership

The result's lexical lease is tied to the complete caller aggregate root. Before the call, every
owned-buffer descendant of a concrete stack aggregate must still be live. Moving or dropping any
descendant, mutating through a conflicting alias, moving the aggregate, or moving a descendant in
the same call is rejected while the returned element is live. The lease is released at lexical
scope exit.

## Boundary

V28 excludes computed field paths, literal or computed result indices, multiple `i32` coordinate
parameters, conditional or multiple return selection, recursive or transitive forwarding, nested
returned or reborrowed aggregate laundering, disjoint-field alias relaxation, raw pointers, casts,
globals/statics, async capture, concurrency, atomics, foreign borrowed ABIs, custom destructors, and
unwinding. Kotlin emission fails closed rather than erasing affine aggregate ownership or the
native field/index provenance contract.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; Kotlin boundary proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/aggregate-buffer-element-forwarded-return-exit-five.hs`.

The slice-element and aggregate-subobject predecessors are
[native machine contract v27](native-machine-v27.md) and
[native machine contract v26](native-machine-v26.md).
