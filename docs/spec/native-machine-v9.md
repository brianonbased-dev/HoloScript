# Native machine contract v9: call-safe borrowed slices

Status: implemented by `packages/compiler-native`

`hs-machine-v9` extends the v8 local-slice contract with borrowed slice
parameters for direct HoloScript function calls. A slice parameter is a typed
view over caller-owned contiguous storage; it is not an owning container, an
integer address, or a general-purpose runtime object.

## Contract selection

Any function parameter annotated `&[T]` or `&mut [T]` selects
`hs-machine-v9`. Programs that use only local borrowed slices continue to
select `hs-machine-v8`.

```hs
function read(values: &[i32], index: i32): i32 {
  return load(values[index])
}

function add_two(values: &mut [i32], index: i32): i32 {
  store(values[index], load(values[index]) + 2)
  return load(values[index])
}

function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  let observed: i32 = read(&values[1..4], 1)
  return add_two(&mut values[1..4], observed - 2)
}
```

## Native ABI

Each source slice parameter expands to exactly two native parameters, in this
order:

1. a target-width base pointer to the first element of the borrowed range;
2. an `i32` element count.

Element type and mutability are compile-time metadata and are not duplicated in
the runtime pair. Scalar parameters keep their existing one-value ABI. The
callee traps on a negative length before executing its body.

The ABI is intentionally explicit and deterministic. It does not expose the
compiler's local v8 descriptor or borrow-state representation.

## Caller rules

A slice argument must be a direct reborrow of a fixed-array range:

- `&values[start..end]` for `&[T]`;
- `&mut values[start..end]` for `&mut [T]`.

Bounds remain literal, half-open, ordered, and within the fixed array. Element
types and mutability must match exactly. Named slice forwarding and descriptor
copying are not part of v9.

Borrowing is conservative at the fixed-array root. Shared reborrows may
coexist. A mutable reborrow conflicts with every active local borrow and every
sibling call argument rooted in the same array, even when their ranges are
disjoint. Scalar argument expressions are evaluated before the call-duration
leases begin; sibling slice leases become active together at the direct call.

## Callee rules

Every `load(parameter[index])` and `store(parameter[index], value)` compares the
`i32` index against the runtime length using an unsigned bounds check before
address arithmetic. This makes negative indices and indices equal to the length
trap. A non-zero caller range offset is already incorporated into the base
pointer.

Stores require `&mut [T]`. An immutable slice parameter is read-only.

## Non-escape boundary

v9 remains deliberately non-escaping:

- slice returns are rejected;
- scalar reference parameters remain rejected;
- slice fields, addressable slice slots, and heap persistence are rejected;
- named slice forwarding and descriptor copies are rejected;
- indirect calls and raw pointer extraction are rejected.

The direct caller owns the storage lifetime. Foreign callers of exported
`hs_*` symbols must provide a valid pointer for the declared element count; v9
validates the length and every index but cannot manufacture foreign-pointer
provenance.

## Safety invariant

For every accepted HoloScript call, the compiler proves the base pointer comes
from a live fixed-array stack slot, the length comes from a validated range, the
element type matches, and mutable aliases do not coexist. The callee then
checks every index against that length before forming an address.

