# Native machine contract v29: caller-tied aggregate-buffer sub-slices

## Status

`hs-machine-v29` admits checked half-open slice results derived from owned-buffer fields embedded
in nominal aggregates, including one direct forwarding hop. The native result ABI is the ordinary
slice pair `(base, length)`. Compiler-only provenance carries the nominal aggregate fingerprint,
exact owned-field byte coordinate, exact named start and end parameter coordinates, element type,
mutability, and caller aggregate root.

## Source model

```hs
struct Packet { values: [i32], other: [i32] }

function view<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return &packet.values[start..end]
}

function relay<'a>(packet: &'a Packet, start: i32, end: i32): &'a [i32] {
  return view(packet, start, end)
}
```

Mutable sources and results use `&'a mut Packet`, `&'a mut [i32]`, and `&mut
packet.values[start..end]`. Static nested paths such as `packet.payload.values[start..end]` are
admitted when every intermediate field is a nominal aggregate and the final field is an owned
`[T]` buffer.

## Admission and ABI identity

V29 inherits the cumulative v0-v28 contracts. An aggregate-buffer sub-slice result additionally
requires:

- exactly one explicit lifetime source on a nominal aggregate-reference parameter;
- exactly two distinct `i32` coordinate parameters in each result-producing leaf or relay;
- one direct top-level final return from an exact static owned-field path and exact named bounds;
- aggregate source, element type, and mutability agreement across the declared result; and
- for forwarding, one direct non-forwarding leaf call receiving the relay's exact aggregate,
  start, and end identifiers at the leaf ABI's corresponding positions.

The field coordinate is derived from the nominal aggregate layout. Same-shaped fields therefore
retain different provenance. Parameter positions, rather than identifier spelling, are ABI
identity: a relay may reorder its declaration list, but it cannot substitute literals,
computations, temporaries, or a different root for any retained coordinate.

## Runtime guards and reconstruction

The leaf, relay, and outer caller independently load the embedded version-1 owned-buffer record at
the exact field coordinate and validate its pointer, signed length, allocator provenance, and
element alignment. Each boundary performs all checks before pointer arithmetic:

1. `start >= 0`;
2. `end >= 0`;
3. `start <= end`;
4. `end <= buffer_length`; and
5. the scaled start offset fits the target pointer width.

Only then does lowering derive `expected_base = buffer_base + start * sizeof(T)` and
`expected_length = end - start`. Relay and caller code trap unless both returned values equal their
independently reconstructed pair. Empty ranges are valid, but dereferencing one remains
bounds-checked.

## Caller ownership

The lexical lease is tied to the complete caller aggregate root, not merely the selected field or
range. Before a call, every owned-buffer descendant of a concrete stack aggregate must remain
live. Moving or dropping a descendant, moving the aggregate, mutating through a conflicting alias,
or moving a descendant in the same call is rejected while the returned slice is live. The lease
releases at lexical scope exit. This intentionally preserves conservative whole-root aliasing;
disjoint fields or ranges do not create independent mutable roots.

## Boundary

V29 excludes computed field paths, literal or computed result bounds, additional `i32` coordinate
parameters, conditional or multiple return selection, recursive or transitive forwarding, nested
returned or reborrowed aggregate laundering, raw pointers, casts, globals/statics, asynchronous
capture, concurrency, atomics, foreign borrowed ABIs, custom destructors, and unwinding. Kotlin
emission fails closed rather than erasing affine aggregate ownership or field/range provenance.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; Kotlin boundary proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/aggregate-buffer-subslice-forwarded-return-exit-five.hs`.

The aggregate-buffer-element and borrowed-sub-slice predecessors are
[native machine contract v28](native-machine-v28.md) and
[native machine contract v21](native-machine-v21.md).
