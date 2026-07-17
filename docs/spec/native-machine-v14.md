# Native machine contract v14: recursively owned aggregates

Status: implemented by `packages/compiler-native`

`hs-machine-v14` makes owned resources valid fields of native stack aggregates.
Nested structs are laid out recursively, every owned `[T]` leaf remains an affine
compiler-known owner, and deterministic drop glue cleans live leaves on normal scope
exit and structured return.

## Source contract

An aggregate may contain scalar fields, owned-buffer fields, and nested aggregate
fields:

```hs
struct Payload { values: [i32], marker: i32 }
struct Envelope { payload: Payload, backup: [i32] }

let initial: [i32] = buffer(2, 5)
slot envelope: Envelope = Envelope(
  Payload(move(initial), 5),
  buffer(1, 9)
)
```

Every constructor argument initializes exactly one field in declaration order. An
owned field must be initialized by `buffer(count, fill)`, `move(owner)`, or an
owned-returning call. Bare owner expressions are copies and are rejected. Nested
constructors must name the declared nested type and initialize all of its fields.

Owned leaves use fully qualified compiler identities such as
`envelope.payload.values`. The identity may appear anywhere v13 accepts a named owner:

```hs
let view: &[i32] = &envelope.payload.values
let forwarded: [i32] = move(envelope.payload.values)
drop(envelope.backup)
```

Moving, returning, passing, borrowing, or dropping a leaf updates that leaf only.
The aggregate's scalar and other owned fields remain independently usable. Loading or
storing an owned leaf as a scalar is rejected; nested scalar projections such as
`load(envelope.payload.marker)` use ordinary v6 stack access.

## Recursive layout

Each aggregate is one contiguous, aligned native stack slot. Layout is recursive and
declaration ordered:

- scalar fields use their existing native size and alignment;
- owned fields embed the version-1 `NativeOwnedBufferFfi` record;
- nested fields embed their complete aggregate layout;
- final size is rounded to the maximum field alignment.

On a 64-bit target an owned field occupies 16 bytes at alignment 8; on a 32-bit
target it occupies 12 bytes at alignment 4. `inspect_native_layouts` reports owned
fields as `[T]` and nested fields by struct name. Recursive by-value cycles have no
finite layout and fail with a cycle path diagnostic.

The embedded ABI record is storage, not independent authority. Safe source cannot
load, forge, copy, or partially overwrite its pointer, length, or allocator id.
Runtime ownership operations use the compiler-held values and retain all v13 ingress,
bounds, provenance, and deallocation guards.

## Move state and joins

Each owned leaf has the v13 state machine: `Live`, `Moved`, or `Dropped`. Branch and
loop analysis keys state by the fully qualified leaf identity.

- Both falling-through conditional arms must produce the same state for every outer
  leaf.
- A single returning arm does not constrain the surviving arm's post-join state.
- A falling-through loop body cannot change an outer leaf's state, because another
  iteration could repeat the transfer or drop.
- Active shared or exclusive borrows prevent moving or dropping that leaf.

There is no runtime partially initialized aggregate state. Constructors are checked
completely during compilation, and accepted code writes every field before the
aggregate becomes addressable. HoloScript's admitted native subset has no unwinding
constructor expressions; a trap terminates the process under the existing v12-v13
trap policy.

## Recursive drop glue

Owned leaves enter cleanup order as their constructors execute. Normal aggregate
scope fallthrough and structured returns visit that order in reverse and call the
provenance-selected deallocator only for leaves still `Live`.

- A moved leaf is cleaned by its final receiver, not by the aggregate.
- An explicitly dropped leaf is not dropped again by aggregate cleanup.
- Untouched leaves at any nesting depth are cleaned exactly once.
- Scalar fields and nested aggregate storage require no deallocator.

This is compiler-generated field drop glue; no user destructor method or hidden
aggregate-wide owner exists.

## ABI boundary

Owned leaf transfer across a function call or return uses the unchanged v13
`NativeOwnedBufferFfi` ABI. Whole aggregates remain forbidden in parameters and
returns. This keeps layout-bearing aggregate ABI exports fail closed until a later
contract defines calling convention, versioning, foreign layout validation, and
cross-target compatibility.

Kotlin and UAAL emitters continue to reject typed owned aggregates rather than erase
allocator, move, provenance, or cleanup semantics.

## Compatibility and deliberate boundaries

Programs without owned aggregate fields retain their previous machine-contract
selection. A source unit containing an owned aggregate field selects v14 and may use
nested aggregate layout. v14 still rejects borrowed-slice fields, fixed-array fields,
standalone owned `slot` bindings, whole-aggregate moves, aggregate parameters and
returns, implicit owned copies, custom destructors, and cyclic by-value layouts.

## Safety invariant

For every accepted normal path, each allocated buffer is represented by exactly one
`Live` qualified owner. Aggregate construction and field transfer change storage and
identity without duplicating authority. Every allocation reaches exactly one normal-
path deallocator: explicit leaf drop, recursive aggregate drop glue, or cleanup by the
final call/return receiver.
