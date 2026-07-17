# Native machine contract v12: affine owned buffers

Status: implemented by `packages/compiler-native`

`hs-machine-v12` extends v11 with local, heap-backed contiguous buffers whose
ownership, move state, borrow state, and cleanup order remain compiler metadata.
It is the first native HoloScript contract that acquires and deterministically
releases dynamic storage.

## Surface types and operations

The array family now has three distinct storage meanings:

```hs
let owned: [i32] = buffer(count, 0) // dynamic, owning value
slot fixed: [i32; 4] = [1, 2, 3, 4] // fixed stack storage
let view: &[i32] = &owned           // shared, non-owning view
let writer: &mut [i32] = &mut owned // exclusive, non-owning view
```

`buffer(count, fill)` evaluates a typed `i32` element count and one fill value.
Every element is initialized before the owner becomes usable. `move(owner)` is
the only ownership transfer; ordinary identifier initialization is not an
implicit copy. `drop(owner)` ends a live owner's lifetime explicitly. Otherwise
the compiler inserts a drop at the owner's lexical-scope exit.

The existing spatial `move target to destination` statement remains valid.
The parser treats `move(...)` as the ownership operation only in expression
position, removing the prior keyword collision without creating a second
grammar.

## Allocator ABI

The host-native v12 baseline imports the C allocator ABI:

1. `malloc(size_t) -> void*`;
2. `free(void*) -> void`.

The allocator calls are compiler-generated. Source cannot obtain the returned
address or call `free` directly. A zero-length buffer retains logical length
zero and receives a minimum one-byte allocation so that every live owner has a
non-null, uniformly freeable allocation. Allocation failure traps.

Before allocation, v12 traps a negative count. On a 32-bit pointer target it
also traps an element count whose `count * sizeof(T)` byte size is not
representable. Only after those guards may lowering form the allocation size or
element addresses. The initial fill loop uses the same checked element scale.

## Affine ownership state

Each source owner is in exactly one compiler-owned state:

- `Live`: may be borrowed, moved, or dropped;
- `Moved`: no longer authorizes borrow, move, drop, or cleanup;
- `Dropped`: no longer authorizes borrow, move, or another drop.

`move(source)` transfers the source base, `i32` length, and element type to a
new live binding and marks the source moved. A move or explicit drop is rejected
while any shared or exclusive borrow is active. v12 keeps explicit moves and
drops in the owner's declaring lexical scope; cross-scope transfer waits for a
control-flow ownership join model rather than guessing at path-dependent state.

The pointer and length do not encode any ownership state. Copying those machine
values cannot manufacture a second owner because source programs have no
operation that exposes them.

## Borrow and call ABI

Whole-owner borrows use `&owner` or `&mut owner`. The resulting local view uses
v9's established ordered pair internally:

1. target-width base pointer;
2. signed `i32` element count.

Loads, stores, direct-call forwarding, and runtime-indexed sub-slice reborrows
reuse the v9-v11 bounds, mutability, alias, and provenance checks. Heap-rooted
views retain the owner's identity as compiler metadata. Shared borrows may
coexist; an exclusive borrow conflicts with every other live borrow of that
owner.

Borrowed parameters continue to cross direct HoloScript calls as a pointer and
length. No ownership bit, allocator handle, or provenance token is added to the
ABI.

## Deterministic cleanup

The compiler records owners in declaration order and emits `free` in reverse
order for every structured language exit:

- normal lexical-scope fallthrough;
- explicit `drop`;
- final function return;
- returns inside nested scopes and either control-flow branch.

Moved and already-dropped bindings are skipped. Cleanup order never depends on
hash-map iteration, so repeated compilation of the same v12 source remains
byte-deterministic.

Cranelift traps do not unwind v12 scopes. A bounds, size, or allocation trap
terminates the process and relies on operating-system process reclamation; it
does not execute language drops. Unwinding and recoverable allocation errors
require a later error/effect contract.

## Deliberate v12 boundary

Owned buffers cannot yet appear as function parameters, function returns,
aggregate fields, or addressable `slot` storage. Borrowed slices remain the
call-safe access boundary. Owned returns require a stable owner-transfer ABI;
aggregate ownership requires recursive drop layout; path-dependent cross-scope
moves require ownership joins. v12 rejects all three instead of lowering a raw
pointer copy that could leak or double-free.

The supported element types are the current native scalar set: `bool`, `i32`,
and `i64`. Custom allocators, capacity-changing buffers, owned return values,
and foreign owner transfer are later contracts.

## Safety invariant

Every accepted v12 allocation has one live compiler-known owner, initialized
elements, a checked byte extent, and exactly one generated deallocation path at
each structured language exit. A borrow can exist only while that owner is
live, and neither move nor drop can occur while the borrow lease is active. No
source-visible integer or pointer can forge ownership, suppress cleanup, or
create a second deallocator. Process-terminating traps are outside the v12 drop
model and do not unwind.
