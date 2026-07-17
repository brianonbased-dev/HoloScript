# HoloScript Native Machine Contract v3

Status: experimental typed-reference tracer

`hs-machine-v3` extends the addressable v2 contract with typed, non-escaping
references. References are compiler-owned provenance records: they never lower
to integer addresses, never cross a function ABI, and can point only to an
explicitly declared stack slot.

## Accepted reference surface

```hs
function read(): i32 {
  slot value: i32 = 5
  let view: &i32 = &value
  return *view
}

function main(): i32 {
  slot value: i32 = 2
  let writer: &mut i32 = &mut value
  *writer = 5
  return *writer
}
```

- `&T` is a shared reference to a stack slot containing exactly `T`.
- `&mut T` is an exclusive reference that may read and replace that value.
- `&slot` and `&mut slot` are valid only as the initializer of a correspondingly
  typed immutable local binding.
- `*reference` reads the pointee. `*mutable_reference = value` replaces it.
- The only v3 pointee types are the concrete machine scalars `i32` and `i64`.
- Reference locals share the function-local namespace with parameters, scalar
  locals, and stack slots.

The compiler retains `(slot identity, pointee type, mutability)` as metadata and
lowers dereferences directly to typed Cranelift stack loads or stores. No raw
pointer value is materialized in HoloScript source or exposed to the ABI.

## Borrow and lifetime rules

v3 uses deliberately conservative function-long borrows:

- any number of shared references may borrow one slot;
- a mutable reference requires exclusive access;
- an exclusive borrow rejects shared or second mutable aliases;
- direct `store(slot, value)` is rejected while any borrow is active;
- direct `load(slot)` is rejected while an exclusive borrow is active; and
- borrows end only when the declaring function returns.

There is no lexical shortening, explicit drop, reborrow, reference copying, or
non-lexical lifetime analysis in v3. These restrictions make alias decisions
deterministic while the language acquires richer control flow.

## Provenance and non-escape

Addressability comes only from `slot`; an SSA local, parameter, literal,
calculation, call result, or undeclared name cannot be borrowed. The compiler
also rejects reference parameters, reference return types, passing a reference
as a scalar argument, returning a reference local, or using it in arithmetic.
References therefore cannot outlive the stack object or function activation to
which the compiler tied them.

v3 does not define raw pointers, pointer-to-integer casts, pointer arithmetic,
null references, heap/static/global storage, fields, arrays, FFI addresses,
volatile/atomic access, or cross-thread sharing. Such capabilities require new
contracts with explicit layout, lifetime, alias, and target-ABI rules.

## Admission and compatibility

Any `&T`, `&mut T`, address-of expression, or dereference selects
`hs-machine-v3`. Programs using stack slots without reference syntax continue
to select v2; typed scalar programs continue to select v1; untyped integer-entry
programs continue to select v0. Single `&` is a distinct token, so `&&` remains
logical conjunction and `*` remains multiplication when used infix.

Canonical `.hs` validation uses the same Rust parser distributed in
`@holoscript/wasm/node` and consumed by the native compiler. The compiler-owned
HS010 lexical firewall still runs before AST construction.

The executable proof is maintained as
`compiles_typed_non_escaping_references` in the native smoke suite. Both shared
and mutable reference programs compile with an `hs-machine-v3` receipt and exit
with code `5`.
