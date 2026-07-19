# Native machine contract v22: one-hop borrowed slice return forwarding

## Status

`hs-machine-v22` admits one direct function-call edge in a caller-tied borrowed-slice return. The
forwarding function keeps the same `(base, length)` native result ABI and the same compile-time
`source_parameter` provenance as v20 and v21. No pointer, runtime tag, or returned address becomes
an ownership root.

## Source model

```hs
function view<'a>(values: &'a [i32], start: i32, end: i32): &'a [i32] {
  return &values[start..end]
}

function relay<'a>(values: &'a [i32], start: i32, end: i32): &'a [i32] {
  return view(values, start, end)
}
```

The mutable form is admitted only when source parameter, callee parameter, callee result, and relay
result are all `&'a mut [T]`.

## Admission

V22 inherits every v21 direct and derived return form. A forwarded return additionally requires:

- exactly one top-level return expression in the forwarding function is a direct call to a named
  HoloScript function;
- the callee returns a borrowed slice whose ABI names exactly one slice `source_parameter`;
- the callee result and relay result have the same element type and mutability;
- the argument at the callee's `source_parameter` is exactly the relay's own lifetime-source
  parameter identifier, without a temporary, local, cast, member, or range expression; and
- the callee is not itself marked as forwarding a borrowed-slice result.

The final rule makes the contract structurally one-hop. Self-recursion, mutual forwarding, and a
second relay cannot turn the v22 edge into unbounded interprocedural lifetime inference.

## Lowering and caller provenance

The relay lowers its ordinary typed arguments, calls the object-local callee, validates the returned
base and length, and returns that pair unchanged. If the callee is a v21 sub-slice function, its
signed/order/source-length and pointer-width guards still execute before any pointer derivation.

The relay ABI continues to name its own exact lifetime-source parameter. At the outer call site the
compiler resolves that argument to the concrete stack array or owned buffer, validates the returned
pair, and installs the shared or exclusive lexical lease on that original root. The forwarded base
is runtime data; it is not provenance.

## Fail-closed boundary

V22 rejects wrong element type or mutability, an unknown or non-slice-returning callee, a different
source argument, temporary or ranged forwarding, a callee that already forwards, local binding from
a slice parameter, nested returned-slice extension, and root mutation, move, or drop while the
outer result is live. Multiple or conditional return-call selection, aggregate storage,
globals/statics, asynchronous capture, concurrency, atomics, foreign borrowed ABIs, raw casts,
custom destructors, and unwinding remain outside the admitted model.

The live consumer is HoloMesh task `task_1784419865179_jrh6`. Executable and adversarial proofs
live in `packages/compiler-native/tests/native_smoke.rs`; parser shape proof lives in
`packages/compiler-wasm/src/parser.rs`; Kotlin deliberately fails closed in
`packages/compiler-wasm/src/kotlin_emit.rs`; the canonical program is
`examples/native/slice-forwarded-return-exit-five.hs`.

The derived borrowed-slice predecessor is
[native machine contract v21](native-machine-v21.md).
