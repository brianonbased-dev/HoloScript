# Native machine contract v11: runtime-indexed slice reborrows

Status: implemented by `packages/compiler-native`

`hs-machine-v11` extends v10 with runtime-indexed sub-slice reborrows rooted in
named borrowed slices. Bounds are ordinary typed `i32` expressions, while the
slice remains a non-owning, non-escaping view whose provenance, mutability, and
alias class are owned by the compiler.

## Contract selection

A named slice range with at least one non-literal bound selects v11:

```hs
function read(values: &[i32], index: i32): i32 {
  return load(values[index])
}

function window(values: &[i32], start: i32, end: i32): i32 {
  return read(&values[start + 1..end], 0)
}
```

Literal named-slice forwarding continues to select `hs-machine-v10`. Direct
fixed-array call ranges remain literal in v11: runtime bounds first require a
named borrowed view. This keeps fixed stack allocation and initial borrow
formation statically laid out while allowing that view to be narrowed at
runtime.

## Preserved ABI

v11 does not introduce a slice descriptor object. Each slice parameter still
uses v9's ordered pair:

1. a target-width base pointer;
2. an `i32` element count.

Whole-slice forwarding passes the pair unchanged. A checked runtime sub-slice
passes `base + start * sizeof(T)` and `end - start`. Root identity, source
mutability, and may-alias membership remain compiler metadata and do not become
forgeable ABI fields.

## Range evaluation and guard order

For `&view[start..end]` and `&mut view[start..end]`, v11 lowers `start` and
`end` exactly once, from left to right, as ordinary `i32` expressions. It then
emits these guards in order:

1. `start < 0` traps;
2. `end < 0` traps;
3. `start > end` traps;
4. `end > source_length` traps;
5. on a 32-bit pointer target, an unrepresentable scaled byte offset traps.

Only after every guard does the compiler multiply `start` by the element size
or add that offset to the source base. This ordering prevents negative indices
from becoming wrapped unsigned addresses and prevents reversed or oversized
ranges from manufacturing a pointer.

The source length is a compile-time constant for a stack-rooted local view and
the incoming runtime length for a parameter-derived view. Parameter lengths are
already rejected when negative at function entry. Empty ordered ranges such as
`edge..edge` are valid; indexing the resulting zero-length slice still traps in
the receiving callee.

## Type and expression boundary

Runtime bounds use the normal typed expression pipeline. They may therefore be
`i32` parameters, locals, arithmetic expressions, loads, or direct calls that
produce `i32`. Implicit coercion remains forbidden: an `i64`, `bool`, reference,
slice, or unknown binding cannot serve as a bound.

Range expressions are evaluated before the new call-duration view is formed.
The resulting pointer-length pair exists only as arguments to the direct call;
it is not a storable slice value.

## Mutability, aliasing, and non-escape

v11 preserves v10's compiler-owned rules:

- a mutable source may be narrowed as shared or mutable;
- an immutable source cannot become mutable;
- stack-rooted views retain their exact stack provenance;
- all parameter-derived views share one conservative may-alias class;
- a mutable parameter-derived argument conflicts with every sibling
  parameter-derived argument, while shared siblings may coexist;
- slice returns, fields, addressable slice slots, raw pointer extraction,
  indirect calls, and scalar escape remain rejected.

The runtime pair cannot prove aliasing or lifetime facts. Safety therefore does
not depend on reconstructing provenance from an address.

## Safety invariant

Every accepted v11 sub-slice evaluates typed signed bounds, validates their
sign, order, source containment, and target offset representability, and only
then forms its address. Every receiving callee independently bounds-checks
element access against the forwarded length.

As in v9 and v10, a foreign caller must supply a base pointer valid for its
declared element count. HoloScript checks language-originated ranges, indices,
mutability, aliasing, and non-escape; it cannot repair an invalid foreign
pointer.
