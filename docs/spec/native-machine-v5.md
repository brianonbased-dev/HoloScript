# HoloScript Native Machine Contract v5

Status: experimental structured-control-flow tracer

`hs-machine-v5` extends the scoped-reference v4 contract with native booleans,
integer comparisons, short-circuit logical operators, `if`/`else`, and
condition-controlled `while` loops. Control flow lowers to explicit Cranelift
basic blocks. Every edge leaving a lexical scope releases compiler-owned borrow
leases before transferring control.

This is native systems-language control flow. It is not a scene-behavior DSL,
graph trigger, or emitter-side rewrite.

## Accepted surface

```hs
function below(left: i32, right: i32): bool {
  return left < right
}

function choose(flag: bool, left: i32, right: i32): i32 {
  if (flag) {
    return left
  } else {
    return right
  }
}

function main(): i32 {
  slot counter: i32 = 0

  while (below(load(counter), 5)) {
    scope {
      let writer: &mut i32 = &mut counter
      *writer = *writer + 1
    }
  }

  scope {
    let view: &i32 = &counter
    if (*view == 5 && true) {
      return choose(false, 2, *view)
    }
  }

  return 1
}
```

This program selects `hs-machine-v5`, compiles to native machine code, and
exits with code `5`.

`bool` is a concrete one-byte machine type. It may appear in scalar locals,
stack slots, function parameters, function returns, and typed references. The
process entry function `main` must still return `i32` or `i64` so its result has
an unambiguous operating-system exit-status representation.

## Operators and conditions

v5 accepts:

- equality `==` and inequality `!=` for operands of the same concrete type;
- signed ordering `<`, `<=`, `>`, and `>=` for `i32` and `i64`;
- boolean negation `!`;
- short-circuit boolean conjunction `&&` and disjunction `||`.

Conditions for `if` and `while` must have type `bool`. Integers are not truthy,
booleans do not participate in arithmetic, and implicit integer-width or
integer/boolean coercions remain forbidden. Integer literals are contextually
typed by the other comparison operand and otherwise default to `i32` within a
comparison.

Short-circuit operators lower their right operand into a distinct basic block.
`false && right` and `true || right` do not evaluate `right`.

## Structured joins and cleanup edges

Each `if` arm and `while` body is an implicit lexical scope. Lowering snapshots
the outer scalar bindings, stack-slot identities, reference bindings, and
borrow state before entering that scope. On every fallthrough, back edge, or
early return, it then:

1. releases borrow leases created by that scope in reverse declaration order;
2. removes scalar, stack-slot, and reference bindings created by that scope;
3. verifies that the exact outer borrow state has been restored;
4. transfers control only after the cleanup succeeds.

Branch-local and loop-local names never survive their block. An arm therefore
cannot inject an ambiguous reference or borrow into a join. Outer active borrows
remain active on both arms and after the join. If cleanup cannot reproduce the
outer state exactly, compilation fails closed.

An `if` whose two arms return is itself a returning statement. A one-armed `if`
and a `while` always retain a fallthrough path because their condition may be
false. Statements after an unconditional return remain rejected as unreachable.

`while` is condition-controlled and has no hidden runtime fuel counter. The
canonical bounded form uses an explicit typed counter or other program-visible
state in its boolean condition. v5 does not claim static termination proof;
termination remains a source-program obligation.

## Provenance, ABI, and compatibility

All v3 and v4 provenance rules remain mandatory. References point only to
explicit typed stack slots, stay compiler-owned metadata, never become integer
addresses, and cannot cross function parameters or returns. Pointer arithmetic,
pointer casts, null references, and ABI-visible addresses remain rejected.

Boolean syntax, comparisons, logical operators, `if`, `while`, or a return edge
inside lexical `scope` selects `hs-machine-v5`. Source that does not need v5
retains the earlier contract-selection rules. In particular, straight-line
lexical scopes remain v4, references without scopes remain v3, stack slots
remain v2, typed scalar functions remain v1, and the untyped integer entry
subset remains v0.

Infix `*` remains multiplication while prefix `*` dereferences a typed reference.
`&&` remains logical conjunction and cannot be reinterpreted as address syntax.
The HS010 lexical firewall still runs before AST construction.

The executable, deterministic-object, cleanup-edge, and rejection proofs live
in `packages/compiler-native/tests/native_smoke.rs`. Public Node/WASM validation
uses the same canonical Rust lexer and parser; target emitters that do not lower
these canonical AST nodes continue to fail closed.
