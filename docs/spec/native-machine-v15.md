# Native machine contract v15: affine aggregate values and ABI

## Status

`hs-machine-v15` promotes native aggregates from addressable field containers to affine
values. A complete aggregate can move between stack bindings, into a function parameter,
or out through a function result without copying ownership, leaking a leaf, or assigning
drop responsibility twice.

The v14 recursive layout and qualified owned-leaf state machine remain authoritative.
V15 adds one aggregate-wide move state and a versioned indirect ABI; it does not replace
the owned-buffer ABI embedded in resource fields.

## Source model

Addressable aggregate bindings continue to use `slot`. Whole-value transfer is explicit:

```hs
struct Payload { values: [i32], code: i32 }

function relay(payload: Payload): Payload {
    return move(payload)
}

function main(): i32 {
    slot first: Payload = Payload(buffer(2, 5), 5)
    slot second: Payload = relay(move(first))
    return load(second.code)
}
```

The admitted whole-aggregate forms are:

- `slot destination: T = move(source)`;
- `callee(move(source))` where the corresponding parameter is `T`;
- `return move(source)` from a function returning `T`;
- `slot destination: T = callee(...)` where the callee returns `T`.

`source` must name a complete aggregate root. Nested aggregate moves are deliberately
fail-closed in v15; owned leaf moves such as `move(packet.payload.values)` retain the v14
rules.

## Atomic affine transition

Before a whole move changes compiler state, the compiler validates the complete transfer:

1. the source is a live aggregate root with the expected target layout fingerprint;
2. no aggregate-root borrow is active;
3. every recursively owned leaf exists and is `Live`;
4. no owned leaf has an active shared or exclusive borrow.

Only after all checks pass does one atomic transition occur:

- every source leaf becomes `Moved`;
- the source aggregate root becomes `Moved`;
- a local or callee destination receives fresh `Live` leaf authorities;
- scalar bytes move with the same aggregate payload but do not create resource authority.

Using any scalar field through a moved root is rejected. A previously moved or dropped
leaf makes a later whole move a partial-move error. This preserves v14's useful rule that
other fields remain usable after a leaf-only move while preventing a partially destroyed
value from crossing the aggregate ABI.

Conditional joins require the same aggregate-root move state on both surviving arms.
Loops reject a root-state change that could repeat. Returning arms do not constrain the
surviving arm. These rules mirror the existing owned-leaf joins.

## Versioned indirect ABI

The aggregate ABI version is `1`. Each aggregate parameter is one pointer to a
`NativeAggregateFfi` descriptor. Each aggregate-returning function receives one trailing
descriptor pointer whose payload storage belongs to the caller:

```c
typedef struct NativeAggregateFfi {
    void *data;
    uint32_t byte_length;
    uint32_t alignment;
    uint32_t layout_fingerprint;
    uint32_t abi_version;
} NativeAggregateFfi;
```

This indirect convention avoids target-specific register flattening and multi-register
return rules. The payload itself uses the exact recursive native layout reported by
`inspect_native_layouts`.

The target-aware layout fingerprint covers:

- aggregate and field names;
- target pointer width;
- aggregate size and alignment;
- every field offset, size, alignment, and machine type;
- nested aggregate structure;
- owned-buffer element types;
- the aggregate ABI version domain.

`inspect_native_layouts` publishes `abi_fingerprint` and `abi_version` for every layout.
Two structurally or target-incompatible layouts therefore do not silently share a bridge
identity.

## Callee validation and foreign bridges

Before touching payload memory, every generated v15 callee traps unless all of these are
true:

- the descriptor pointer is non-null;
- `abi_version == 1`;
- `layout_fingerprint` equals the function's compiled target layout;
- `byte_length` and `alignment` exactly match that layout;
- the payload pointer is non-null and actually aligned;
- every embedded `NativeOwnedBufferFfi` record passes the v13 length, pointer, allocator,
  and address-width guards.

`NativeStructLayout::validate_ffi_descriptor` exposes the metadata portion of the same
check to host bridges so they can return a diagnostic before calling generated code.
Foreign code still crosses an `unsafe` boundary: it must provide writable result storage,
must not forge owned leaves, and must relinquish each input aggregate after a consuming
call succeeds.

## Caller and callee drop responsibility

An aggregate argument is marked moved in the caller before the call is emitted. The
callee materializes the payload into callee-owned stack storage and becomes responsible
for all recursively live leaves. An aggregate result reverses that direction: the callee
writes into caller-owned result storage, marks its source moved, and the caller materializes
fresh leaf authority.

Normal fallthrough and structured returns keep v14 reverse-construction cleanup order.
Moved leaves emit no cleanup. Consequently a make/forward/consume chain has exactly one
final receiver for every leaf and exactly one deallocator path per leaf.

## Contract selection and compatibility

A source unit selects v15 when an aggregate appears in a function parameter or result, or
when an aggregate `slot` uses a whole-value `move` initializer. V14 programs that only use
constructors, field access, leaf moves, and recursive drop glue remain v14. Earlier scalar,
array, slice, reference, and owned-buffer contracts retain their existing selection.

V15 still rejects unversioned foreign descriptors, implicit aggregate copies, bare
aggregate arguments or returns, nested aggregate roots in whole moves, aggregate
references, fixed-array aggregate fields, borrowed-slice aggregate fields, custom
destructors, unwinding, and cyclic by-value layouts.
