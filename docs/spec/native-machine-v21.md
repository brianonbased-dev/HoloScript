# Native machine contract v21: caller-tied borrowed sub-slice results

## Status

`hs-machine-v21` admits a checked sub-slice derived from the one slice parameter named by an
explicit borrowed-return lifetime. The native ABI still returns `(base, length)`. The caller still
maps that pair to the concrete root of the lifetime source argument and installs the lexical lease.

The derived pointer is runtime data, not provenance. V21 emits it only after the signed range,
source length, element size, result mutability, exact lifetime source, and caller-root lease agree.

## Source model

```hs
function view<'a>(values: &'a [i32], start: i32, end: i32): &'a [i32] {
  return &values[start..end]
}

function view_mut<'a>(values: &'a mut [i32], start: i32, end: i32): &'a mut [i32] {
  return &mut values[start..end]
}
```

`start` and `end` are ordinary typed `i32` expressions. The returned view is half-open and has
runtime length `end - start`.

## Admission and derivation

V21 inherits v20's exact lifetime-source admission and additionally accepts one direct derived
return edge:

- the return expression is `&source[start..end]` or `&mut source[start..end]`;
- `source` is exactly the slice parameter selected by the result lifetime;
- borrow operator, source parameter, and result mutability match;
- the property is a computed half-open `..` range; and
- both bounds type-check as `i32` without coercion.

The compiler emits all range checks before offset multiplication or pointer addition:

1. `start >= 0`;
2. `end >= 0`;
3. `start <= end`;
4. `end <= source_length`; and
5. the scaled start offset fits the target pointer-width contract.

Only after those guards does lowering compute `derived_base = source_base + start * sizeof(T)` and
`derived_length = end - start`. Empty ranges are valid. Every later access is checked against the
derived length, so a returned view cannot regain the source slice's wider bounds.

## Caller-root lease propagation

The ABI's `source_parameter` index remains unchanged by derivation. At the call site the compiler
resolves that argument to its stack-array or owned-buffer root, validates the returned base and
length, and acquires a shared or exclusive lease for the result binding. Sub-slicing never creates
a new ownership root.

Multiple shared results may coexist. A mutable result is root-exclusive. Mutation, move, or drop of
the root is rejected while the returned result is live, and the lease releases at lexical scope
exit. This deliberately keeps v21 conservative: disjoint mutable sub-slices do not bypass root-wide
exclusivity.

## Fail-closed boundary

V21 rejects a different parameter or local root, non-range members, wrong bound types, borrow
operator changes, mixed-lifetime ambiguity, returned-slice chaining, slice-parameter extension,
overlapping mutable roots, and root mutation while a result is live. Conditional return selection,
aggregate storage, globals/statics, asynchronous capture, concurrency, atomics, foreign borrowed
ABIs, raw casts, custom destructors, and unwinding remain outside the admitted model.

The live consumer is HoloMesh task `task_1784416956556_jmpy`. This contract reuses the canonical
parser range AST and the v11 runtime range guards; it retires v20's prohibition on direct sub-slice
return edges without adding a second syntax or provenance path.

Executable and adversarial proofs live in `packages/compiler-native/tests/native_smoke.rs`; parser
shape proof lives in `packages/compiler-wasm/src/parser.rs`; the canonical program is
`examples/native/slice-subrange-return-exit-five.hs`.

The direct borrowed-slice-return predecessor is
[native machine contract v20](native-machine-v20.md).
