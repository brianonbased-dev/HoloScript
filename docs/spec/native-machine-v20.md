# Native machine contract v20: caller-tied borrowed slice results

## Status

`hs-machine-v20` admits borrowed slice results whose lifetime is explicitly tied to one
caller-provided slice argument. The native ABI returns the slice base and runtime length as two
machine values. The compiler separately retains the concrete caller root and installs a lexical
lease for the result binding.

A base-plus-length pair is not ownership proof. V20 emits code only when the lifetime binder,
element type, mutability, source parameter, returned values, caller root, bounds, and lexical
release edge all agree.

## Source model

```hs
function borrow<'a>(values: &'a [i32]): &'a [i32] {
  return values
}

function borrow_mut<'a>(values: &'a mut [i32]): &'a mut [i32] {
  return values
}

function main(): i32 {
  slot values: [i32; 4] = [1, 2, 3, 4]
  scope {
    let view: &[i32] = borrow(&values[1..4])
    let observed: i32 = load(view[1])
  }
  scope {
    let writer: &mut [i32] = borrow_mut(&mut values[1..4])
    store(writer[1], 5)
  }
  return load(values[2])
}
```

Signature lifetimes use `function name<'a>`, `&'a [T]`, and `&'a mut [T]`. A result local omits
the source lifetime because its usable lifetime is the local lexical scope.

## Signature admission

A borrowed slice result is admitted only when:

- the function declares exactly one lifetime binder;
- the result carries that explicit lifetime;
- exactly one slice-reference parameter carries the same lifetime;
- parameter and result element types match exactly;
- parameter and result mutability match exactly; and
- the function returns that source parameter identifier directly.

Elided and undeclared lifetimes, multiple same-lifetime inputs, scalar references, element-type
changes, mutability changes, local slices, sub-slices, conditional selection, and nested calls at
the return edge fail closed.

## ABI and runtime guards

Each slice parameter and slice result uses the internal pair `(base: target_pointer, length: i32)`.
The caller validates a returned pair before installing it:

- length must be non-negative and fit target pointer arithmetic for the element size;
- base must be non-null and aligned for the element type; and
- every indexed access remains checked against the returned runtime length.

The returned length is authoritative for the view. A sub-slice result cannot accidentally regain
the bounds of its underlying array or owned buffer.

## Caller-root lease propagation

The selected argument may be a direct fixed-array range or a named stack- or owned-buffer-rooted
slice, including a runtime checked subrange. The compiler maps the result to that argument's
underlying root and installs a lexical shared or exclusive lease.

Multiple shared results may coexist. A mutable result requires exclusive access. While the result
is live, mutation, move, or drop of the root is rejected except through the mutable result.
The lease releases when the result binding's lexical scope exits.

V20 deliberately rejects returned-slice chaining and extension from a slice parameter. Those
forms need a deeper region model before a result can outlive intermediate reference metadata
without losing the original caller root.

## Boundary

Borrowed slices remain object-local compiler values. They cannot cross foreign entry points,
exports, raw-pointer or integer casts, globals/statics, aggregate fields, storage, asynchronous
capture, concurrency, atomics, custom destructors, or unwinding. Owned buffers retain their
versioned transfer ABI; v20 adds no foreign borrowed-reference ABI.

The executable and adversarial proofs live in
`packages/compiler-native/tests/native_smoke.rs`; the canonical program is
`examples/native/slice-borrowed-return-exit-five.hs`.

The aggregate borrowed-result predecessor is
[native machine contract v19](native-machine-v19.md).
