# Native machine contract v24: caller-tied aggregate scalar-field results

## Status

`hs-machine-v24` admits a direct borrowed scalar-field result whose lifetime is tied to exactly one
aggregate-reference parameter. The native result ABI is one pointer. Compiler-only provenance
retains the source parameter, nominal aggregate ABI fingerprint, exact static scalar-leaf byte
offset and machine type, mutability, and the caller's original stack or owned-aggregate root.

## Source model

```hs
struct Header { code: i32 }
struct Packet { header: Header }

function code<'a>(packet: &'a Packet): &'a i32 {
  return &packet.header.code
}

function code_mut<'a>(packet: &'a mut Packet): &'a mut i32 {
  return &mut packet.header.code
}
```

The tuple `(nominal layout fingerprint, resolved scalar type, byte offset)` is the exact physical
identity of a static scalar leaf in HoloScript's non-overlapping aggregate layout. Nested named
aggregate fields are admitted. Computed projections, owned fields, reference fields, unions, and
dynamic field selection are not.

## Admission

V24 inherits the cumulative v0-v23 machine contracts. A borrowed scalar result additionally
requires:

- one explicit function lifetime binder and one aggregate-reference parameter carrying it;
- an `&'a bool`, `&'a i32`, `&'a i64`, or exact mutable counterpart return;
- exact result/source mutability under the current fail-closed borrow policy;
- a direct `&source.field` or `&mut source.field` return rooted at the lifetime-source parameter;
- a non-computed, statically resolved path ending in the declared scalar type; and
- no temporary, constructor, local, wrong root, owned leaf, or indirect returned-reference source.

Returning a scalar value, borrowing a local scalar or aggregate, selecting a computed field, or
binding the result to a reference with a different type or mutability is rejected during typed ABI
collection or lowering.

## One-pointer ABI and provenance check

The callee validates its aggregate-reference parameter, adds the statically resolved field offset,
checks the resulting scalar pointer for null and scalar alignment, and returns that one pointer.
No ownership or lifetime token crosses the machine ABI.

The caller independently reconstructs the expected pointer from the concrete argument passed at
the ABI's `source_parameter`. After the call it traps unless the returned address is exactly
`source_base + field_offset`. It then validates scalar alignment and installs a shared or exclusive
lexical lease on the original whole aggregate root. The local reference stores the returned base
alongside compiler-only layout fingerprint, field offset, machine type, mutability, and root name.

This redundant caller check makes a non-null, aligned pointer insufficient proof: a callee cannot
silently return a different root or field and still satisfy the declared result provenance.

## Borrow boundary

The first v24 implementation deliberately leases the whole source aggregate. While the returned
field reference is live, mutation of any root field and move or drop of any owned descendant are
rejected. The lease is released at lexical scope exit. A returned aggregate reference cannot be
fed into a second scalar-field-result call to extend a nested returned borrow; parameter reborrow
chains are rejected as well.

Subfield-disjoint borrowing, scalar-result forwarding, raw pointers, casts, globals/statics,
reference fields, async capture, concurrency, atomics, foreign borrowed ABIs, custom destructors,
and unwinding remain outside this contract.

The Kotlin bridge fails closed on the lifetime-bearing scalar reference annotation rather than
erasing native alias semantics. The live consumer is HoloMesh task
`task_1784425875654_mndh`. Executable and adversarial proofs live in
`packages/compiler-native/tests/native_smoke.rs`; parser shape proof lives in
`packages/compiler-wasm/src/parser.rs`; the bridge boundary lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/scalar-field-borrowed-return-exit-five.hs`.

The aggregate borrowed-result and forwarding predecessors are
[native machine contract v19](native-machine-v19.md) and
[native machine contract v23](native-machine-v23.md).
