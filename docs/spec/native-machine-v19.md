# Native machine contract v19: caller-tied aggregate reference results

## Status

`hs-machine-v19` admits borrowed aggregate results whose lifetime is explicitly tied to one
caller-owned aggregate-reference argument. The compiler returns an object-local pointer and, at
the call site, converts the selected argument's proven root into a lexical borrow lease held by the
typed reference local.

V19 does not treat a pointer as proof of validity. The source lifetime, exact parameter provenance,
aggregate layout, mutability, caller root, and lexical release edge must all agree before native
code is emitted.

## Source model

```hs
struct Packet { code: i32 }

function borrow<'a>(packet: &'a Packet): &'a Packet {
    return packet
}

function borrow_mut<'a>(packet: &'a mut Packet): &'a mut Packet {
    return packet
}

function main(): i32 {
    slot packet: Packet = Packet(1)
    scope {
        let view: &Packet = borrow(&packet)
        let observed: i32 = load(view.code)
    }
    scope {
        let writer: &mut Packet = borrow_mut(&mut packet)
        store(writer.code, 5)
    }
    return load(packet.code)
}
```

The lifetime marker is part of the canonical lexer, parser, serialized AST, and native type
contract. Signature lifetimes use the exact forms `function name<'a>`, `&'a Aggregate`, and
`&'a mut Aggregate`. A local binding omits the source lifetime because its lifetime is the local
lexical scope: `let view: &Aggregate = borrow(&root)`.

## Signature admission rules

A borrowed aggregate result is admitted only when all of these conditions hold:

- the function declares exactly one source lifetime binder;
- the result is `&'a Aggregate` or `&'a mut Aggregate` with that declared lifetime;
- exactly one aggregate-reference parameter carries the same lifetime;
- the parameter and result name the same aggregate layout;
- parameter and result mutability match exactly; and
- the function returns that source parameter identifier directly.

An undeclared or elided result lifetime is rejected. Two parameters carrying the result lifetime
are ambiguous even if their layouts match. A local reference, stack slot, reborrow, field
projection, conditional choice, or nested call cannot be substituted for the declared source
parameter at the return edge.

These rules make provenance a checked function contract rather than a naming convention.

## Caller lease propagation

The result must initialize a typed aggregate-reference local. The source argument may be a direct
complete-root borrow such as `&packet` or `&mut packet`, or a named aggregate reference already
valid under the v17/v18 forwarding rules.

After validating every call argument and executing the synchronous call, the compiler:

1. verifies that the returned pointer is non-null and aligned for the declared aggregate;
2. maps the result back to the selected caller argument;
3. acquires a shared or exclusive whole-root lease on the caller's actual provenance root;
4. stores the reference as compiler-owned typed metadata, never as an integer address; and
5. releases the lease when the binding's lexical scope exits.

Multiple shared returned references may coexist. A mutable result requires exclusive access. A
live returned shared reference blocks mutation or moving of its root; a live mutable result blocks
all competing access except through that reference. Mutable named-reference forwarding cannot
duplicate an existing exclusive alias. Parameter-root results retain the v18 one-level reborrow
boundary and cannot extend a nested reborrow. Moving or dropping an owned aggregate leaf is also a
root mutation and is rejected while the returned lease is active; an aggregate with an already
moved or dropped owned leaf cannot become a borrowed result source.

## Internal ABI and foreign boundary

A borrowed aggregate result uses one target-native pointer result. The selected source parameter
already uses the v17 guarded pointer parameter representation. Functions with aggregate-reference
parameters remain at local object linkage, and the callee can return only the validated incoming
source pointer.

This is not a foreign reference ABI. `NativeAggregateFfi` remains the versioned boundary for affine
aggregate values, not borrows. Foreign borrowed-reference entry points, exported reference
results, raw pointers, pointer arithmetic, integer casts, globals/statics, stored references,
aggregate reference fields, asynchronous capture, concurrency, atomics, custom destructors, and
unwinding remain outside the contract.

## Contract selection and compatibility

A unit selects v19 when a function declares a source lifetime binder or a lifetime-bearing
reference result. Aggregate-reference programs without lifetime-bound results retain v16-v18
selection.

V19 preserves aggregate layout, alignment, the v15 layout fingerprint, owned-leaf state, drop
behavior, `NativeAggregateFfi` ABI version `1`, and v17 object-local linkage. Its only machine ABI
addition is a compiler-private pointer result whose validity is inseparable from the caller lease.

The executable and adversarial proofs live in
`packages/compiler-native/tests/native_smoke.rs`; the canonical program is
`examples/native/aggregate-borrowed-return-exit-five.hs`.

The aggregate-parameter reborrow predecessor is
[native machine contract v18](native-machine-v18.md).
