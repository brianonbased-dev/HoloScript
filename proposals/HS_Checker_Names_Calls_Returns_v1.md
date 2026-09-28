# `.hs` checker: names, calls and returns (G11) — v1

**Status:** Accepted 2026-09-28 under the Spec v0.1 gate rule (approval by gates, not by a person; founder direction 2026-09-28). Implemented on branch `claude/hs-checker-names-g11` (gates 1–3 recorded below; gate 4, a reviewer from another seat and family, pending). Originally proposed under the Spec v0.1 no-break policy
(`docs/spec/holoscript-spec-v0.1.md`, "Any new syntax, or any change to syntax the readers accept
today, needs a written proposal before it is built").
**Gap:** G11 in [`docs/spec/spec-vs-reality-gap.md`](../docs/spec/spec-vs-reality-gap.md).
**Board:** task_1790587169083_0hnc.

## For Joseph, in plain words

Today the `.hs` checker calls a program valid even when it uses a name that does not exist, calls a
function that does not exist, passes the wrong number of inputs, or can finish without giving an
answer. Both engines then refuse the same program, each with its own message. So "valid" does not
mean "runs".

The change: in functions that state their types, the checker refuses those four mistakes itself,
with one clear reason and the line where it happened. Old untyped script functions are not touched.

What breaks: nothing we have. Checked on every `.hs` file that is valid today (68 files, 256 typed
functions) and on every typed function in hand-written `.hsplus` files (13).

**Decided 2026-09-28 (yes), as an agent decision under the gate rule.** The question as first posed: Should the `.hs` checker refuse, inside typed functions, names and functions
that do not exist, calls with the wrong number of inputs, and functions that can end without an
answer — yes or no?

## What the change is

The rules apply inside every function that declares a parameter type or a return type. Untyped
legacy functions keep today's reading.

| #   | Rule                                                                                                                                                                                                                                                                                                       | New diagnostic                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Every name used resolves to a parameter, a local declared earlier in the same or an enclosing block, a top-level function, struct, enum or import of the same program, or a built-in (`load`, `store`, `move`, `drop`, `buffer`, `known`, `unknown`, `isKnown`, `slice_length`, `u8_to_i32`, `i32_to_u8`). | `HS-NAME-001` unknown name                                     |
| 2   | Every called name resolves to a function, a struct constructor or a built-in.                                                                                                                                                                                                                              | `HS-NAME-002` unknown function                                 |
| 3   | A call to a function declared in the same program passes exactly its declared number of arguments. HoloScript functions have no parameter defaults.                                                                                                                                                        | `HS-ARITY-001`                                                 |
| 4   | A function with a declared return type returns a value on every path.                                                                                                                                                                                                                                      | `HS-RETURN-002`                                                |
| 5   | A declaration may not reuse a name visible from an enclosing block; sibling blocks may reuse a name; a block's locals are not visible after it.                                                                                                                                                            | `HS-SCOPE-001` (use after the block falls under `HS-NAME-001`) |

These are the rules the native backend already enforces (`hs-machine-v1`/`v5` messages) and that
`compile_to_uaal` enforces after PR #428. The checker becomes the one place that says so first.

Each new diagnostic carries the line and column of the offending node. Today every checker error
reports line 0, column 0.

**Fragment mode (`.hsplus`).** The `.hsplus` reader sends each typed function to the checker on its
own (`HoloScriptPlusParser.ts`, `checkTypedHsFunction`). It will also pass the names and argument
counts of the functions declared in the same `.hsplus` document, so a call to a sibling resolves.

**Not in this proposal:** `??` on a plain value (corpus case `g11-coalesce-plain-008`) belongs to
the pending `@unknown` decision; `break`/`continue` as statements would be new syntax (under this
proposal they are refused as unknown names inside typed functions, which both backends already do).

## Why

- Spec v0.1 decision (a) makes `validate_detailed` the definition of `.hs`. Today that definition
  includes programs no backend can run (G11 evidence, recorded as honest-gap corpus cases).
- Every route in the 2026-09-27 route study needs the checker to judge meaning; this is its first
  step.
- Agents write `.hs`. A checker that says "valid" to an unknown name hands an AI author a broken
  program with no signal, and a positionless error cannot guide a repair.

## Examples

| Program (inside a typed function)                               | Today | After                                                                 |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------- |
| `return y` with no `y`                                          | valid | `HS-NAME-001` unknown name `y`                                        |
| `return g(1)` with no `g`                                       | valid | `HS-NAME-002` unknown function `g`                                    |
| `add(1)` for `add(a: i32, b: i32)`                              | valid | `HS-ARITY-001` `add` expects 2 arguments, got 1                       |
| `f(): i32 { let x: i32 = 1 }`                                   | valid | `HS-RETURN-002` `f` can finish without a value                        |
| `if (x > 0) { return 1 }` as the whole body of `f(x: i32): i32` | valid | `HS-RETURN-002`                                                       |
| `x.peel()` with `x: Banana`, no `Banana` declared               | valid | still valid: a type annotation alone is not checked (open question 1) |
| `break` inside `while`                                          | valid | `HS-NAME-001` unknown name `break`                                    |
| `let x` inside `if` while an outer `x` is visible               | valid | `HS-SCOPE-001`                                                        |
| `let t` inside `if`, then `return t` after it                   | valid | `HS-NAME-001` unknown name `t`                                        |

Still valid after the change: recursion (`fib`), mutual recursion, the same name in sibling
blocks, struct constructors, enum members (`Route.EnterWorld`), `load`/`store` on references,
`known(21)` / `unknown("reason")`, and every untyped legacy function.

## What existing files would break

Measured 2026-09-28 on main `a1a0a0ef6` with the committed `pkg-node` checker and a measurement
prototype of these rules (scratch, not product code), cross-checked against both backends:

- **`.hs`: 0 of 68 valid files; 0 of their 256 typed functions.** 54 of the files compile natively
  and 6 more through `compile_to_uaal`, and both backends enforce these rules; 5 contain no typed
  functions; the last (`Routing.logic.hs`, one typed function) was inspected by hand.
- **`.hsplus`: 0 of 13 typed functions in hand-written files**, given fragment mode. Without it, 9
  functions in `packages/secrets-broker/src/repository_identity.hsplus` would be refused, because
  each calls a sibling function in the same document.
- **Spec corpus:** eight `g11-*` honest-gap cases flip from valid to refused (the intended change):
  001–005, 007, 009 and 010. Two stay on record: 006 (undeclared type names, open question 1) and
  008 (`??`, the `@unknown` decision). No other case changes.

## The test that proves it

1. The eight covered `g11-*` honest-gap cases in `hsplus-spec-corpus.v0.jsonl` flip to
   `valid: false` with `diagnostic_includes` naming the new code; `check-spec-corpus.mjs --strict`
   reports the drift until they are flipped, so the change cannot land silently.
2. A differential test runs every G11 case through the checker, the native compiler and
   `compile_to_uaal`, and asserts all three refuse.
3. A no-regression test pins the 68 currently valid `.hs` files and the 25 conformance programs as
   still valid.
4. A fragment-mode test: the typed functions of `repository_identity.hsplus` stay accepted; a typed
   `.hsplus` function calling an undeclared function is refused with `HS-NAME-002`.

## Implementation phases

1. `packages/compiler-wasm/src/semantic_types.rs`: it already keeps a function table and block
   scopes; add name resolution, arity, every-path return and scope rules for typed functions, with
   positions.
2. Fragment context for the `.hsplus` bridge (`hsplusRustTypeCheck.ts`): pass the document's
   function names and arities to the checker.
3. Rebuild `pkg-node`, flip the corpus cases, add the differential and no-regression tests.
4. Record the change in Spec v0.1 (Known gaps) and close G11.

## Open questions

1. Undeclared type names (`Banana`): should an unknown type name in an annotation be refused, or
   stay admissible until the type system names every type? This proposal leaves annotations as
   today; only names used as values are resolved.
2. Should untyped legacy functions ever get these rules? Not proposed; it would change old files.

## As built (2026-09-28)

Where the build differs from the text above, the build is right and this section says why.

- **The built-in list was incomplete.** Rule 1 now also accepts `unknownReason` (the native
  backend lowers it by name next to `isKnown`) and the Kotlin backend's math built-ins `abs`,
  `floor`, `max`, `min`, `pow` and `sqrt`, read from that backend's own table
  (`kotlin_emit::is_kotlin_builtin`), so the two lists cannot drift. Without them the checker
  would refuse typed functions a backend runs. The switch-off run found the gap: making every
  function strict broke the Kotlin `sqrt` tests.
- **Fragment mode carries more than functions.** The context is
  `{"functions":[{"name","arity"}],"names":[...]}` through a new export,
  `validate_detailed_in_context`. `names` are the document's structs, enums and imports. A
  function whose parameters have a default, an optional mark or a spread, or that is declared twice
  with different counts, is sent without an arity. Both `.hsplus` paths use it: `parse`, and
  `parseIncremental`, which checks each `logic`/`orb`/`template` block alone and now passes the
  whole document; without that a typed function calling a function in another block would be
  refused and its block dropped.
- **Positions.** Names, calls, `let`/`var`/`const`, `slot`, `return`, assignments and `for` loops
  now carry their line and column in the AST, so the older `HS-TYPE-*` errors on those nodes gained
  positions too. A `for (v in …)` loop variable counts as a declaration for rule 5.
- **One return rule.** Rule 4 and `compile_to_uaal` share `definitely_returns_value`
  (`semantic_types.rs`), which also counts a trailing `scope { … return … }` block, as native does.
  A bare `return` in a typed function keeps its `HS-TYPE-RETURN-001` message.
- **`compile_to_uaal` runs the checker first**, so for typed functions these programs are now
  refused with the checker's codes; its own guards still cover untyped functions.
- **Size.** The Node WASM grew from 541,496 to 552,730 bytes. A first draft read the context with
  a derived deserializer and cost 42 KB; the build reads it through `serde_json::Value`, which the
  crate already ships.

**Gate evidence.** (1) Measured breakage, re-run on the build: 68 of 68 valid `.hs` files stay
valid and 69 refused files keep the same first message; 25 of 25 conformance programs valid; all
2,474 tracked `.hsplus` files give the same error list as before; `compile_to_uaal` gives the same
bytecode for all 15 files it compiles and the same refusal for the other 122. (2)
`check-spec-corpus.mjs --strict`: 53/53, with exactly the eight named cases flipped on purpose.
(3) Switch-off run: each of the 15 checker switches and 5 `.hsplus` bridge switches fails a test.

## What remains after this proposal

- The `??` rule, through the `@unknown` decision.
- Types for untyped values: unknown evidence stays admissible.
- G12 (contextual keywords) and G15 (an empty tool allowlist) need their own proposals.
