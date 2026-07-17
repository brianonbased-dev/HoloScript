# HoloScript Native Machine Contract v4

Status: experimental scoped-lifetime tracer

`hs-machine-v4` extends the typed-reference v3 contract with explicit lexical
lifetime boundaries. A `scope { ... }` statement owns every scalar local, stack
slot, reference binding, and borrow lease declared directly within its body.
When control reaches the closing brace, the compiler removes those bindings and
releases those borrows as one scope-exit operation.

This is a systems-language lifetime contract, not a scene-graph or configuration
block. The canonical AST records `LexicalScope` as its own statement node.

## Accepted surface

```hs
function main(): i32 {
  slot value: i32 = 2

  scope {
    let view: &i32 = &value
  }

  scope {
    let view: &mut i32 = &mut value
    *view = 5
  }

  return load(value)
}
```

The first scope's shared borrow ends at its closing brace. The second scope may
therefore reuse the released local name and borrow `value` exclusively. This
program selects `hs-machine-v4`, compiles to native machine code, and exits with
code `5`.

Nested lexical scopes are accepted. Outer bindings remain visible within an
inner scope, but an active binding cannot be shadowed. Once a scope exits, its
names may be reused by a later sibling scope.

## Scope-exit rules

On successful scope exit, the compiler performs these logical operations:

1. Release references declared by that scope in reverse declaration order.
2. Remove reference bindings declared by that scope.
3. Remove scalar-local bindings declared by that scope.
4. Remove stack-slot bindings and their inactive borrow state when declared by
   that scope.

Cranelift may retain physical stack storage until the function returns, but the
HoloScript binding and provenance identity are no longer accessible. A reference,
scalar local, or stack slot used after its scope is rejected rather than becoming
a dangling compiler metadata handle.

References declared at the function root preserve v3 compatibility: their
borrows remain active until function return. Inner scopes must respect all outer
shared and exclusive borrows. Direct `load` and `store` retain the v3 aliasing
rules while a borrow is active.

## Conservative control flow

v4 models straight-line lexical scope exit. It rejects a `return` inside
`scope`, because early exit requires versioned cleanup-edge lowering. It also
rejects branch-sensitive lifetime inference when a lexical scope appears under
an `if`. These cases fail closed; the compiler never guesses which borrow or
binding survives a control-flow edge.

Future machine contracts may add cleanup edges, loops, branch joins, reborrows,
and non-lexical lifetime analysis without weakening v4's deterministic rules.

## Provenance, ABI, and compatibility

All v3 provenance and non-escape rules remain mandatory. References point only
to explicit typed stack slots, remain compiler-owned metadata, never become raw
integer addresses, and cannot cross function parameters or returns. Pointer
arithmetic, pointer casts, null references, and ABI-visible addresses remain
undefined and rejected.

Any canonical `LexicalScope` selects `hs-machine-v4`, including a scope that
contains only scalar locals or stack slots. Source without lexical scopes keeps
the existing selection rules: reference syntax selects v3, stack slots select
v2, typed scalar functions select v1, and the untyped integer-entry subset
selects v0. `&&` remains logical conjunction, infix `*` remains multiplication,
and the HS010 lexical firewall still runs before AST construction.

The executable and rejection proofs live in
`packages/compiler-native/tests/native_smoke.rs`. Public Node/WASM validation
uses the same canonical Rust parser and admits `LexicalScope`; target emitters
that have not implemented the node continue to fail closed.
