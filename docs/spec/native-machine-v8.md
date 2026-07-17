# HoloScript Native Machine Contract v8

Status: experimental lexical slice-borrow tracer

`hs-machine-v8` extends the fixed-array v7 contract with local borrowed slice
values. A slice borrow has a scalar element type, a fixed-array provenance root,
a checked half-open range, mutability, and a lexical lease. The compiler owns
that descriptor and never exposes its address as a HoloScript integer or ABI
value.

This is systems-language alias and bounds enforcement over contiguous native
storage. It is not a scene collection, host-language list, or dynamic array.

## Accepted surface

```hs
function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]

  scope {
    let view: &[i32] = &values[1..4]
    let index: i32 = 1
    let observed: i32 = load(view[index])
  }

  scope {
    let writer: &mut [i32] = &mut values[1..4]
    let index: i32 = 1
    store(writer[index], 5)
  }

  return load(values[2])
}
```

This program selects `hs-machine-v8`, compiles to native machine code, and
exits with code `5`. The immutable slice lease ends at the first scope boundary,
so the second scope may acquire an exclusive mutable lease over the same array.

Slice annotations are `&[T]` and `&mut [T]`. v8 accepts `bool`, `i32`, and
`i64` elements. Initializers must directly borrow a literal half-open range of
an addressable fixed-array slot: `&array[start..end]` or
`&mut array[start..end]`.

## Compiler-owned representation

A local slice value is a typed compile-time descriptor:

```text
provenance root = fixed-array stack slot
element type    = bool | i32 | i64
base offset     = start * element_size
length          = end - start
lease           = shared | exclusive
```

The descriptor is first-class within a function because it may be named and
indexed repeatedly. It is deliberately non-escaping: it has no runtime fat
pointer representation, cannot be copied as a scalar, and cannot cross a
function ABI. Cranelift forms an internal stack address only after the shared
v7 bounds check succeeds.

## Bounds and access contract

`slice[index]` uses the same checked-access path as v7 arrays and projections.
Literal indices outside `0..length` are compile errors. Dynamic indices must be
`i32`; an unsigned `index >= length` comparison traps before address arithmetic,
which also traps negative values.

Loads are allowed through shared or mutable slices. Stores require a mutable
slice. Direct owner loads remain legal during shared borrows, but direct owner
stores are rejected while any borrow is active. Direct owner loads are rejected
during an exclusive borrow.

## Lexical alias contract

v8 uses conservative whole-root aliasing:

- multiple shared slices of one array may coexist, including overlapping ones;
- an exclusive mutable slice requires no other active borrow of that array;
- no shared slice may be created while an exclusive slice is active;
- an array owner cannot mutate storage around an active slice lease;
- every lexical scope exit releases its slice leases, including branch, loop,
  and early-return cleanup edges.

The compiler does not yet prove that disjoint subranges are non-aliasing. Two
mutable slices of disjoint ranges are therefore rejected in v8.

## Fail-closed boundary

v8 deliberately rejects semantics without one native meaning:

- slice function parameters, returns, and calls;
- slice fields, stack slots, copies, scalar comparisons, or returned values;
- whole-array borrows and element references;
- non-literal slice boundaries and non-array provenance roots;
- nested, aggregate-element, dynamically sized, or heap-backed slices;
- pointer extraction, pointer arithmetic, lifetime inference, and slice ABIs;
- scalar dereference syntax such as `*view` for a slice.

The Kotlin bridge recognizes borrowed-slice annotations and rejects them until
it has target-specific borrow and bounds lowering. It never silently converts
a v8 slice to a Kotlin collection.

## Compatibility and selection

Local `&[T]` or `&mut [T]` annotations select `hs-machine-v8`. Borrowed slice
parameters select the successor [`hs-machine-v9`](native-machine-v9.md)
contract; slice returns remain rejected. v8 inherits v7 fixed arrays and
checked indexing, v6 aggregate layouts, v5 control flow and booleans, and
v2-v4 storage, scalar-reference provenance, and lexical cleanup. Existing
scalar references retain their v3-v7 behavior.

Executable, runtime-trap, compile-time rejection, deterministic-object, parser,
and Kotlin fail-closed proofs live in
`packages/compiler-native/tests/native_smoke.rs` and the compiler-WASM tests.
