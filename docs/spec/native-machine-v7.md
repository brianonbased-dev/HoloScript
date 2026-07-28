# HoloScript Native Machine Contract v7

Status: experimental fixed-storage tracer

`hs-machine-v7` extends the typed-aggregate v6 contract with fixed-size scalar
arrays and bounds-checked half-open slice projections. Array storage is one
contiguous, aligned native stack allocation. Every computed load and store
passes through the same compiler-owned access descriptor before Cranelift may
form an internal address.

This is systems-language storage and checked address calculation. It is not a
scene list, host collection, dynamic array, or target-emitter rewrite.

## Accepted surface

```hs
struct Delta { amount: i32 }

function main(): i32 {
  slot delta: Delta = Delta(2)
  slot values: [i32; 4] = [1, 2, 3, 4]
  let direct_index: i32 = 2
  let slice_index: i32 = 1

  store(
    values[1..4][slice_index],
    load(values[direct_index]) + load(delta.amount)
  )
  return load(values[direct_index])
}
```

This program selects `hs-machine-v7`, compiles to native machine code, and
exits with code `5`. The range `1..4` is half-open: it projects elements 1, 2,
and 3. Index 1 within that projection resolves to element 2 of `values`.

Fixed arrays are addressable storage, not scalar SSA values. They must use
`slot`, carry an explicit `[Element; Length]` type, and be initialized by an
array literal with exactly `Length` elements. Direct access uses
`array[index]`. A bounded subrange uses `array[start..end][index]`.

## Deterministic layout

v7 array elements may be `bool`, `i32`, or `i64`. An array has the element's
natural alignment, no inter-element padding, and this exact size:

```text
array_size = element_size * length
element_offset = element_size * index
```

| Element | Size | Alignment | `[Element; 4]` size |
| ------- | ---: | --------: | ------------------: |
| `bool`  |    1 |         1 |                   4 |
| `i32`   |    4 |         4 |                  16 |
| `i64`   |    8 |         8 |                  32 |

The compiler rejects zero-length arrays, lengths that overflow native stack
offsets, nested element layouts, and initializer-count mismatches. Source
order determines every initializer store and object emission is deterministic.

## Bounds contract

Literal indices are checked while compiling. A literal outside the selected
array or slice bound is a compile error.

Dynamic indices must be `i32`. Native lowering emits an unsigned
`index >= bound` comparison and traps before address calculation when it is
true. The unsigned comparison also rejects negative `i32` values. Only after
that check does the compiler extend the index to the target pointer width,
scale it by the element size, and add it to Cranelift's internal stack address.
That address never becomes a HoloScript value and cannot cross a function ABI.

Slice boundaries are compile-time, non-negative integer literals. The range is
ordered and half-open, with `start <= end <= array_length`. The dynamic index
is checked against `end - start`; address calculation begins at
`start * element_size`.

## Slice projection boundary

v7 provides bounded slice projections only at an explicit `load` or `store`
site. It does not introduce a first-class slice value or a `&[T]` type. A
projection therefore cannot be assigned to a local, returned, passed to a
function, stored in an aggregate, or borrowed. First-class slices require a
later contract that specifies representation, lifetime, aliasing, escape, and
ABI rules instead of implying them from index syntax.

## Fail-closed boundary

v7 deliberately rejects semantics without one native meaning:

- array function parameters or returns;
- scalar `let`/`const` array bindings;
- whole-array loads, stores, copies, or comparisons;
- zero-length, dynamically sized, nested, or aggregate-element arrays;
- non-literal slice boundaries or ranges outside the source array;
- array-element and slice references;
- first-class slice values and slice ABIs;
- heap allocation, resizing, and pointer extraction.

The Kotlin bridge recognizes fixed-array annotations and rejects them until it
has target-specific bounds and storage lowering. It never silently treats a
v7 array as a legacy Kotlin list.

## Compatibility and selection

Any fixed-array type annotation selects `hs-machine-v7`. v7 inherits the exact
v6 aggregate layouts, v5 structured control flow and booleans, and v2-v4
storage, reference-provenance, and lexical-cleanup rules. Existing untyped
array literals retain their legacy AST and target behavior when no fixed-array
annotation is present.

Executable, runtime-trap, compile-time rejection, deterministic-object, parser,
and Kotlin fail-closed proofs live in
`packages/compiler-native/tests/native_smoke.rs` and the compiler-WASM tests.
