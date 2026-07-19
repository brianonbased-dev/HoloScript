# Native machine contract v30: caller-tied aggregate-buffer whole slices

## Status

`hs-machine-v30` admits whole-slice results borrowed from owned-buffer fields embedded in nominal
aggregates, including one direct forwarding hop. The native result ABI is the ordinary slice pair
`(base, length)`. Compiler-only provenance carries the nominal aggregate fingerprint, exact
owned-field byte coordinate, element type, mutability, and caller aggregate root.

## Source model

```hs
struct Packet { values: [i32], other: [i32] }

function view<'a>(packet: &'a Packet): &'a [i32] {
  return &packet.values
}

function relay<'a>(packet: &'a Packet): &'a [i32] {
  return view(packet)
}
```

Mutable sources and results use `&'a mut Packet`, `&'a mut [i32]`, and `&mut packet.values`.
Static nested paths such as `packet.payload.values` are admitted when every intermediate field is
a nominal aggregate and the final field is an owned `[T]` buffer.

## Admission and ABI identity

V30 inherits the cumulative v0-v29 contracts. An aggregate-buffer whole-slice result additionally
requires:

- exactly one explicit lifetime source on a nominal aggregate-reference parameter;
- one direct top-level final return from an exact non-computed static owned-field path;
- aggregate source, element type, and mutability agreement across the declared result; and
- for forwarding, one direct non-forwarding leaf call receiving the relay's exact aggregate
  identifier at the leaf ABI's corresponding position.

The field coordinate is derived from the nominal aggregate layout. Same-shaped fields therefore
retain different provenance. No range coordinates are part of V30 identity: the returned length is
the embedded owned buffer's complete live length.

## Runtime guards and reconstruction

The leaf, relay, and outer caller independently load the embedded version-1 owned-buffer record at
the exact field coordinate and validate its pointer, signed length, allocator provenance, element
alignment, and target-width length bound. Relay and caller code trap unless both returned values
equal the independently loaded `(buffer_base, buffer_length)` pair. Element access through the
returned reference remains slice-bounds checked.

## Caller ownership

The lexical lease is tied to the complete caller aggregate root, not merely the selected field.
Before a call, every owned-buffer descendant of a concrete stack aggregate must remain live.
Moving or dropping a descendant, moving the aggregate, mutating through a conflicting alias, or
moving a descendant in the same call is rejected while the returned slice is live. The lease
releases at lexical scope exit. This intentionally preserves conservative whole-root aliasing;
disjoint fields do not create independent mutable roots.

## Boundary

V30 excludes computed field paths, partial ranges, conditional or multiple return selection,
recursive or transitive forwarding, nested returned or reborrowed aggregate laundering, raw
pointers, casts, globals/statics, asynchronous capture, concurrency, atomics, foreign borrowed
ABIs, custom destructors, and unwinding. Kotlin emission fails closed rather than erasing affine
aggregate ownership or field provenance.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; Kotlin boundary proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/aggregate-buffer-whole-slice-forwarded-return-exit-five.hs`.

The aggregate-buffer sub-slice and borrowed whole-slice predecessors are
[native machine contract v29](native-machine-v29.md) and
[native machine contract v20](native-machine-v20.md).
