# Native machine contract v18: lifetime-bound aggregate reborrows

## Status

`hs-machine-v18` admits one lexical reborrow layer from an aggregate-reference parameter. A
function can create a local `&Aggregate`, `&mut Aggregate`, `&scalar`, or `&mut scalar` whose
storage still points into the caller's aggregate while the compiler retains the original parameter
as the provenance root.

V18 extends the v17 object-local pointer representation. It does not expose a raw pointer, add a
foreign reference ABI, or permit a borrowed result to escape its caller-owned lifetime.

## Source model

```hs
struct Counters { current: i32, limit: i32 }
struct Packet { counters: Counters, enabled: bool }

function read(packet: &Packet): i32 {
    return load(packet.counters.current)
}

function update(packet: &mut Packet): i32 {
    scope {
        let writer: &mut Packet = &mut packet
        store(writer.counters.current, load(writer.counters.current) + 1)
    }
    scope {
        let field: &mut i32 = &mut packet.counters.current
        *field = *field + 1
    }
    return load(packet.counters.current)
}

function inspect(packet: &Packet): i32 {
    scope {
        let view: &Packet = &packet
        let field: &i32 = &packet.counters.limit
        let forwarded: i32 = read(view)
        let observed: i32 = *field + forwarded
    }
    return load(packet.counters.limit)
}
```

The admitted sources are complete aggregate-reference parameters and their nested scalar field
paths. A mutable parameter may be reborrowed as shared or mutable. An immutable parameter may only
be reborrowed as shared.

## Provenance and lifetime model

Every parameter reborrow records:

- the original aggregate-reference parameter name as its compiler-owned root identity;
- the validated incoming payload pointer;
- the exact aggregate layout and, for scalar fields, its checked static offset;
- shared or mutable permission; and
- a lexical borrow lease released at the end of its `scope` or function.

The lease uses the same conservative whole-root state machine as v16 and v17. Multiple shared
reborrows may coexist. A mutable reborrow requires exclusive root access. Scalar-field reborrows do
not claim field disjointness; borrowing one field leases the complete parameter root.

Nested lexical cleanup retains an outer parameter-root lease, releases only bindings created by
the inner scope, and verifies that the outer alias state is unchanged. This prevents an inner scope
from silently dropping or extending a caller-root borrow.

## Original-parameter and forwarding rules

While a reborrow is active:

- an exclusive reborrow blocks loads and stores through the original parameter;
- a shared reborrow permits original reads but blocks original stores;
- forwarding the original parameter as mutable is blocked by any active reborrow;
- forwarding it as shared is blocked by an exclusive reborrow; and
- a named local reborrow may be forwarded under its active lease using the v17 synchronous-call
  rules.

When the lexical scope ends, the original parameter regains its declared access. Call forwarding
retains v17's conservative rule that different aggregate-reference parameters may alias whenever a
mutable argument is involved.

## One-level and non-escape boundary

V18 deliberately admits one layer only:

```hs
let view: &Packet = &packet       // admitted when packet is a parameter reference
let nested: &Packet = &view       // rejected
let field: &i32 = &view.code      // rejected
```

References still cannot appear in function results, aggregate fields, stack slots, globals,
owned values, or scalar expressions. HoloScript currently has no source-level lifetime parameters
that can prove a returned reference is tied to a particular caller argument, so borrowed returns
remain fail-closed rather than relying on an implicit convention.

Raw pointers, pointer arithmetic, stored references, asynchronous capture, field-disjoint alias
claims, globals/statics, concurrency, atomics, custom destructors, and unwinding remain outside the
contract.

## Contract selection and compatibility

A unit selects v18 when a typed local directly borrows an aggregate-reference parameter or one of
its nested scalar fields. Units with aggregate-reference parameters but no local parameter
reborrow retain v17. Units with only stack-rooted aggregate references retain v16.

V18 preserves `NativeAggregateFfi` ABI version `1`, target-specific aggregate size and alignment,
the v15 layout fingerprint, owned-leaf behavior, and v17 local linkage. Its reborrow pointer is the
same compiler-private object-local representation used by v17, not an ABI promise to foreign code.

The executable and rejection proofs live in
`packages/compiler-native/tests/native_smoke.rs`; the canonical program is
`examples/native/aggregate-reborrow-exit-five.hs`.

The aggregate-reference call predecessor is
[native machine contract v17](native-machine-v17.md).

The caller-tied borrowed-result successor is
[native machine contract v19](native-machine-v19.md).
