# Native machine contract v25: one-hop scalar-field result forwarding

## Status

`hs-machine-v25` admits one direct forwarding hop for a caller-tied aggregate scalar-field
reference. The relay preserves v24's one-pointer object-local ABI. Compiler-only provenance carries
the relay-facing source parameter, nominal aggregate ABI fingerprint, exact scalar field offset and
machine type, and mutability. No lifetime or ownership token crosses the machine ABI.

## Source model

```hs
struct Packet { code: i32 }

function relay<'a>(marker: i32, packet: &'a Packet): &'a i32 {
  return code(packet, marker)
}

function code<'a>(packet: &'a Packet, marker: i32): &'a i32 {
  return &packet.code
}
```

The relay and leaf source parameters may occupy different source and machine-ABI positions. The
compiler resolves the leaf independently of declaration order, verifies that the leaf has a direct
v24 field-borrow return, and rewrites only `source_parameter` into the relay's ABI coordinate
system. Layout fingerprint, field offset, scalar type, and mutability remain the leaf's exact
metadata.

## Admission

V25 inherits the cumulative v0-v24 machine contracts. A scalar-field relay additionally requires:

- exactly one direct top-level final `return leaf(...)` in the relay;
- a named, non-recursive HoloScript leaf with a direct v24 scalar-field borrow result;
- the relay's exact lifetime-source identifier at the leaf ABI's source-parameter position;
- identical nominal source aggregate, scalar machine type, field offset, and mutability; and
- no intermediate local, temporary, projection, reborrow, or returned-reference source.

The compiler rejects unknown or non-scalar leaves, wrong or indirect source arguments, nominal
layout/type/mutability disagreement, recursive or transitive relays, multiple or conditional call
selection, and a second forwarding hop. A scalar-returning call such as `load(...)` is not mistaken
for borrowed-result forwarding merely because its syntax is a call expression.

## Pointer identity and caller root

The direct leaf validates its aggregate parameter and returns `leaf_source_base + field_offset`.
The relay calls the leaf, validates scalar alignment, traps unless the returned address equals
`relay_source_base + field_offset`, and returns that same pointer unchanged. The outer caller repeats
the identity check against its concrete argument before binding the result.

The outer caller then installs v24's shared or exclusive lexical lease on the original whole
aggregate root. While the reference is live, root mutation and move or drop of any owned descendant
remain forbidden. Same-call owned-descendant moves are rejected before argument lowering, so an
owned sibling cannot be consumed earlier in the call that returns the reference.

## Boundary

V25 deliberately excludes recursive/transitive forwarding, conditional or multi-return selection,
forwarding through locals or projections, nested returned aggregate extension, subfield-disjoint
leases, reference fields, raw pointers, casts, globals/statics, async capture, concurrency, atomics,
foreign borrowed ABIs, custom destructors, and unwinding.

The Kotlin bridge continues to fail closed on lifetime-bearing scalar reference results. Executable
and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser shape proof
lives in `packages/compiler-wasm/src/parser.rs`; the bridge proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/scalar-field-forwarded-return-exit-five.hs`.

The direct scalar-field and aggregate-forwarding predecessors are
[native machine contract v24](native-machine-v24.md) and
[native machine contract v23](native-machine-v23.md).
