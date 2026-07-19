# Native machine contract v27: caller-tied slice-element results

## Status

`hs-machine-v27` admits a caller-tied scalar reference to one dynamically indexed slice element,
including one direct forwarding hop. The machine ABI remains one pointer. Compiler provenance
carries the source slice parameter, exact named index parameter, element type, and mutability; no
lifetime, slice descriptor, or ownership token crosses the result boundary.

## Source model

```hs
function element<'a>(index: i32, values: &'a [i32]): &'a i32 {
  return &values[index]
}

function relay<'a>(values: &'a [i32], index: i32): &'a i32 {
  return element(index, values)
}
```

The slice and index parameters may occupy different source and machine ABI positions in the leaf
and relay. Declaration order does not affect resolution.

## Admission, bounds, and identity

V27 inherits the cumulative v0-v26 contracts. A slice-element result additionally requires:

- exactly one explicit lifetime source on a slice-reference parameter;
- exactly one `i32` parameter in each result-producing leaf or relay;
- one direct top-level final return of `&source[index]` or `&mut source[index]`, where both names
  are the exact admitted source and index parameters;
- an element type and mutability exactly matching the source slice and declared result; and
- for forwarding, one direct named non-recursive leaf call receiving the relay source and index
  identifiers at the leaf ABI's corresponding parameter positions.

The leaf checks `0 <= index < source_length` before computing
`source_base + index * element_size`. A relay and the outer caller repeat that bound check before
their own pointer arithmetic, reconstruct the expected address from their source and index, and
trap unless the returned pointer is exactly equal. This prevents a different index, different root,
forged aligned address, or stale coordinate from satisfying the ABI merely by having the right
scalar type.

## Caller ownership

The caller stores the returned element address for later loads and stores, while tying its lexical
lease to the original whole slice root. Stack-root mutation and move or drop of an owned-buffer root
are rejected while the result is live. Same-call owner moves are rejected before argument lowering.
The lease is released at lexical scope exit.

## Boundary

V27 excludes literal or computed result indices, multiple `i32` coordinate parameters, recursive or
transitive forwarding, conditional or multiple return selection, nested returned-slice laundering,
different-root forwarding, subrange-disjoint leases, raw pointers, casts, globals/statics, async
capture, concurrency, atomics, foreign borrowed ABIs, custom destructors, and unwinding. Kotlin
emission fails closed rather than erasing the native borrow, bounds, and alias contract.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; Kotlin boundary proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/slice-element-forwarded-return-exit-five.hs`.

The aggregate-subobject predecessor is
[native machine contract v26](native-machine-v26.md).
