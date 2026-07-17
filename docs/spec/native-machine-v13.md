# Native machine contract v13: owned transfer ABI

Status: implemented by `packages/compiler-native`

`hs-machine-v13` extends v12 ownership across native HoloScript function calls.
Owned buffers remain affine compiler values; the ABI transports their data pointer,
signed element length, and allocator provenance without turning any of those fields
into independent ownership authority.

## Source contract

Owned parameters consume their argument. Every call site must spell the transfer:

```hs
function consume(values: [i32]): i32 {
  return 5
}

let result: i32 = consume(move(values))
```

A bare `consume(values)` is rejected. After the call is formed, the caller binding is
`Moved`; the callee parameter is a new `Live` owner and is cleaned up unless it is
explicitly moved again.

Owned returns also require an explicit source owner:

```hs
function make_values(count: i32): [i32] {
  let values: [i32] = buffer(count, 0)
  return move(values)
}

let values: [i32] = make_values(4)
```

`return values` is rejected. An owned-returning call must initialize an owned local
before that owner is borrowed, moved, dropped, or returned. Consuming calls used in a
scalar expression are currently admitted only as a direct typed local initializer or
direct return expression; nested ownership-consuming arithmetic fails closed.

## Versioned ABI

The ABI version is `1`. `NativeOwnedBufferFfi` is the canonical C-compatible record:

```c
typedef struct HsOwnedBufferV1 {
    void *data;
    int32_t length;
    uint32_t allocator_id;
} HsOwnedBufferV1;
```

On a 64-bit target the offsets are `data=0`, `length=8`, `allocator_id=12`, with
size and alignment `16/8`. On a 32-bit target they are `0`, `4`, and `8`, with
size and alignment `12/4`.

An owned parameter is flattened into `(data, length, allocator_id)` in source
parameter order. An owned-returning `hs_*` function receives a trailing
`HsOwnedBufferV1* out` parameter, initializes all three fields, and has no scalar
return. This out-record convention avoids target-specific multi-register aggregate
returns and is the required foreign bridge layout.

Calling this ABI from foreign code is an `unsafe` systems boundary. The foreign caller
must provide an aligned writable out record and may construct an owned input only from
a live allocation produced by the declared allocator provenance. The integer
`allocator_id` selects a deallocator; it is not cryptographic proof that an arbitrary
pointer came from that allocator. Safe HoloScript source cannot forge any ABI field.

Every ABI ingress checks, before access or cleanup:

1. `length >= 0`;
2. `data != null`, including logical zero-length buffers;
3. the element scale fits the target pointer width;
4. `allocator_id` is recognized.

The only v13 allocator provenance is `1`, `hs.host.malloc.v1`. It pairs the host
`malloc` allocation entry with host `free`. Unknown provenance traps rather than
guessing a deallocator. Custom allocators require a later registry-backed contract.

## Ownership joins

Conditional lowering snapshots compiler-owned `Live`, `Moved`, and `Dropped` state
before compiling either arm.

- When both arms fall through, every outer owner must have the same state in both
  arms; the equal state becomes the post-join state.
- When one arm returns, the fallthrough arm supplies the post-join state.
- When both arms return, no post-join ownership state exists.
- A loop body that falls through may not change an outer owner's state, because the
  transfer could execute again. A loop arm may transfer an owner only on a path that
  returns from the function.

These rules allow symmetric conditional consumption while rejecting the silent
double-free shape where only one arm consumes and later code assumes a single state.

## Cleanup and failure behavior

Parameters enter the callee's reverse-declaration cleanup order before local owners.
`return move(owner)` marks the returned binding `Moved`, writes the out record, then
cleans every other `Live` owner. A consuming caller marks its source `Moved`; therefore
only the receiving callee or a later receiver can deallocate the allocation.

Normal fallthrough, explicit `drop`, and structured returns run deterministic cleanup.
Native traps do not unwind ownership cleanup; the process relies on operating-system
reclamation after a trap, matching v12.

## Deliberate boundaries

v13 still rejects owned aggregate fields, addressable owned `slot` storage, implicit
copies, unversioned foreign records, unknown allocator provenance, and nested
ownership-consuming expressions. Kotlin and UAAL emitters fail closed until they
implement compatible allocator, transfer, provenance, and cleanup semantics.

## Compatibility

All v0-v11 source contracts retain their prior machine-contract selection. Valid v12
local-buffer programs compile under v13 without source changes and preserve v12 move,
borrow, bounds, drop, cleanup-order, and trap behavior. v13 only admits the previously
rejected owned parameter and owned return boundaries under the explicit transfer ABI.

## Safety invariant

For every accepted normal execution path, each allocation has exactly one `Live`
compiler-known owner. A call boundary changes which binding owns the allocation; it
does not duplicate ownership. Exactly one normal-path deallocator is reachable after
the final receiver drops or cleans that owner.
