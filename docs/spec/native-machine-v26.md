# Native machine contract v26: caller-tied aggregate subobject results

## Status

`hs-machine-v26` admits a caller-tied reference to a nested nominal aggregate subobject, including
one direct forwarding hop. The machine ABI remains one pointer. Compiler provenance carries the
target aggregate fingerprint, source aggregate fingerprint, source parameter, exact byte offset,
and mutability; no lifetime or ownership token crosses the machine boundary.

## Source model

```hs
struct Header { code: i32 }
struct Packet { first: Header, second: Header }

function relay<'a>(marker: i32, packet: &'a Packet): &'a Header {
  return header(packet, marker)
}

function header<'a>(packet: &'a Packet, marker: i32): &'a Header {
  return &packet.second
}
```

The source and target layouts are intentionally distinct, while same-typed sibling fields make the
exact offset observable. Leaf and relay source parameters may occupy different source and machine
ABI positions. Declaration order does not affect resolution.

## Admission and identity

V26 inherits the cumulative v0-v25 contracts. A subobject result additionally requires:

- exactly one explicit lifetime source on an aggregate-reference parameter;
- a direct, non-computed, static aggregate field path rooted at that exact source;
- an aggregate final field with the exact nominal target layout and return mutability;
- for forwarding, one direct named non-recursive leaf call receiving the relay source identifier at
  the leaf ABI's source-parameter position; and
- no local, temporary, reborrowed, or previously returned reference laundering.

The leaf returns `source_base + field_offset`. A relay and the outer caller each validate the target
pointer and trap unless the returned address exactly equals their own source base plus that offset.
This prevents a same-layout sibling, a different root, or a forged aligned address from satisfying
the ABI merely by having the right target type.

## Caller ownership

The caller stores the actual returned subobject base for later loads, stores, and calls, but ties the
lexical lease to the original whole aggregate root. While the result is live, root mutation and move
or drop of any owned descendant are rejected. Same-call owned-descendant moves are rejected before
argument lowering. The lease is released at lexical scope exit.

## Boundary

V26 excludes recursive or transitive forwarding, conditional or multiple return selection,
computed paths, scalar or owned final fields, reference fields, subfield-disjoint leases, raw
pointers, casts, globals/statics, async capture, concurrency, atomics, foreign borrowed ABIs,
custom destructors, and unwinding. Kotlin emission fails closed rather than erasing the native
borrow and alias contract.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; Kotlin boundary proof lives in
`packages/compiler-wasm/src/kotlin_emit.rs`; and the canonical program is
`examples/native/aggregate-subobject-forwarded-return-exit-five.hs`.

The scalar-field forwarding predecessor is
[native machine contract v25](native-machine-v25.md).
