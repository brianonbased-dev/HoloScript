# Native machine contract v10: forwarded borrowed slices

Status: implemented by `packages/compiler-native`

`hs-machine-v10` extends the v9 base-plus-length slice ABI with call-duration
forwarding and literal sub-slice reborrows. A named slice remains a typed,
non-owning view. Passing it to another direct HoloScript function does not copy
an escapable descriptor or turn provenance into an integer address.

## Contract selection

Using a named slice as a direct call argument selects `hs-machine-v10`:

```hs
function read(values: &[i32], index: i32): i32 {
  return load(values[index])
}

function relay(values: &[i32], index: i32): i32 {
  return read(values, index)
}
```

A literal sub-slice reborrow rooted in a named slice also selects v10:

```hs
function middle(values: &[i32]): i32 {
  return read(&values[1..3], 0)
}
```

Programs whose slice arguments are only direct fixed-array range reborrows
continue to select `hs-machine-v9`. Programs with only local borrowed slices
continue to select `hs-machine-v8`.

## Native ABI

v10 deliberately preserves the v9 ABI. Every source slice parameter expands to
the same ordered pair:

1. a target-width base pointer;
2. an `i32` element count.

Whole-slice forwarding passes that pair unchanged. A sub-slice advances the
base by `start * sizeof(T)` and supplies `end - start` as the new length. The
callee still traps negative lengths at entry and bounds-checks every indexed
load or store.

Root identity and mutability lineage are compiler metadata, not new runtime
fields. This keeps the ABI stable without pretending that a raw pointer and
length can reconstruct provenance.

## Accepted call-duration reborrows

For a named slice `view`, v10 accepts:

- `callee(view)` for a whole-view call-duration reborrow;
- `callee(&view[start..end])` for a shared literal sub-slice;
- `callee(&mut view[start..end])` for a mutable literal sub-slice when `view`
  is mutable.

Bounds are non-negative integer literals and ranges are half-open and ordered.
Local slice bounds are proven against their static view length. Parameter
sub-slices compare `end` with the runtime length and trap before pointer
arithmetic. Negative and out-of-range element indices continue to trap in the
receiving callee.

A mutable source may be reborrowed immutably for a call. An immutable source
cannot become mutable. A mutable call argument conflicts with every sibling
argument that has the same proven stack root.

## Parameter provenance

Two slice parameters in the same function may have been supplied by foreign
code or by different HoloScript call sites. Their runtime pairs do not prove
whether they overlap. v10 therefore places all parameter-derived views in one
conservative may-alias class while lowering a nested call:

- shared parameter-derived forwards may coexist;
- a mutable parameter-derived forward conflicts with every sibling
  parameter-derived forward;
- parameter-derived views cannot alias stack storage declared by their current
  callee, so local stack roots retain their exact independent identity.

This can reject a nested call whose parameters are disjoint in one particular
execution. It cannot accept an overlapping mutable call merely because the ABI
omits provenance.

## Non-escape boundary

v10 still rejects:

- slice return types and returning a slice as a scalar value;
- slice fields, addressable slice slots, standalone descriptor copies, and heap
  storage;
- indirect calls and raw pointer extraction;
- mutable forwarding from an immutable slice;
- element-type changes and implicit coercions.

The forwarded pair exists only at a direct call boundary. It cannot be stored,
returned, exposed, or retained after the callee returns.

## Safety invariant

Every accepted v10 forwarding operation preserves the source element type,
mutability lineage, root provenance class, and call-duration alias lease. Every
accepted sub-slice proves or checks its range before changing the base pointer.
Every receiving callee checks its runtime length before element address
arithmetic.

Foreign callers must still provide a valid base pointer for the declared
element count. HoloScript validates lengths, sub-ranges, indices, and all
language-originated aliasing, but it cannot manufacture provenance for an
invalid foreign pointer.
