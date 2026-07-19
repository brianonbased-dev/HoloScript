# Native machine contract v23: one-hop aggregate borrow return forwarding

## Status

`hs-machine-v23` admits one direct named-function call in a caller-tied borrowed aggregate return.
The relay preserves v19's single native-pointer result ABI and compile-time `source_parameter`
provenance. A returned address remains runtime data; it never becomes an ownership root or proof of
lifetime validity.

## Source model

```hs
struct Packet { code: i32 }

function borrow<'a>(packet: &'a Packet): &'a Packet {
  return packet
}

function relay<'a>(packet: &'a Packet): &'a Packet {
  return borrow(packet)
}
```

The mutable form is admitted only when the relay source, callee source, callee result, and relay
result are all `&'a mut Aggregate`.

## Admission

V23 inherits v19 direct aggregate returns and the cumulative v20-v22 borrowed-slice contracts. An
aggregate forwarding return additionally requires:

- exactly one top-level borrowed-reference return expression in the relay is a direct call;
- the callee is a known, named, object-local HoloScript function;
- the callee returns a borrowed aggregate and its ABI names exactly one aggregate-reference
  `source_parameter`;
- relay source, callee source, callee result, and relay result have the same nominal aggregate
  layout, ABI fingerprint, and mutability;
- the argument at the callee's `source_parameter` is exactly the relay's lifetime-source parameter
  identifier, without a temporary, local, reborrow, projection, cast, or constructor; and
- the callee is not itself marked as forwarding a borrowed result.

The last rule makes forwarding structurally one-hop. Self-recursion, mutual relays, and a second
relay cannot convert v23 into open-ended interprocedural lifetime inference.

## Lowering and caller provenance

The relay lowers its typed arguments, calls the leaf function, requires exactly one pointer result,
checks that result for null and declared aggregate alignment, and returns the pointer unchanged.
It does not create a new provenance root or acquire an intermediate lease.

At the outer call site, the existing v19 initializer follows the relay ABI's `source_parameter`
back to the concrete stack or owned-aggregate root. It validates the nominal layout, ABI
fingerprint, mutability, and returned pointer before acquiring the shared or exclusive lexical
lease on that original root. Root mutation, move, or drop remains forbidden until the result local
leaves scope.

This division keeps the runtime ABI small while making lifetime authority entirely compiler-owned:
the pointer is transported by the callee chain, while provenance is reconstructed only from
checked signatures and the caller's exact source argument.

## Fail-closed boundary

V23 rejects a wrong or indirect source argument, layout/fingerprint or mutability mismatch, an
unknown or non-aggregate-returning callee, a callee that already forwards, multiple or conditional
return-call selection, local/reborrowed escape, and mutation, move, or drop of the outer root while
the result is live. Nested aggregate-return extension, raw pointers, casts, globals/statics,
reference fields, asynchronous capture, concurrency, atomics, foreign borrowed ABIs, custom
destructors, and unwinding remain outside the admitted model.

The Kotlin bridge detects all non-slice borrowed-reference annotations and fails closed before
typed-struct emission; it does not erase native aggregate alias semantics into managed references.

The live consumer is HoloMesh task `task_1784422054381_yrl8`. Executable and adversarial proofs
live in `packages/compiler-native/tests/native_smoke.rs`; parser shape proof lives in
`packages/compiler-wasm/src/parser.rs`; the bridge boundary lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; the canonical program is
`examples/native/aggregate-forwarded-return-exit-five.hs`.

The direct aggregate borrowed-result predecessor is
[native machine contract v19](native-machine-v19.md). The analogous slice relay is
[native machine contract v22](native-machine-v22.md).
