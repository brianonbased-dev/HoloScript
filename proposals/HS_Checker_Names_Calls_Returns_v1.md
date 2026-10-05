# `.hs` checker: names, calls and returns (G11) — v1

**Status:** Proposed 2026-09-28 under the Spec v0.1 gate rule (approval by gates, not by a person; founder direction 2026-09-28). Built in PR #438 with gates 1 to 3 (measured breakage, corpus, switch-off run); gate 4, a reviewer of another seat in another session, pending, so not yet accepted. Originally proposed under the Spec v0.1 no-break policy
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

Where the build differs from the text above, the build is right and this section says why. It
went through one independent review and one premortem (both from the author's own seat and model
family, so neither is gate 4). A second review, by claude3-x402 (a distinct seat in another
session) at `f15be4b45`, asked for one performance fix and tests for four fault classes, and
listed smaller findings; all are fixed in PR #438 (2026-10-05) and included below.

**Rules, as enforced**

- **Built-ins.** The native backend's twelve (`load`, `store`, `move`, `drop`, `buffer`, `known`,
  `unknown`, `isKnown`, `unknownReason`, `slice_length`, `u8_to_i32`, `i32_to_u8`) and the Kotlin
  backend's math built-ins (`abs`, `floor`, `max`, `min`, `pow`, `sqrt`), read from that
  backend's own table so the two cannot drift. The accepted text listed eleven and missed both
  `unknownReason` and the Kotlin set; without them the checker refused programs a backend runs.
- **Calls** resolve to a function, struct, import or built-in, or to a local that holds a
  lambda. Calling a parameter or other value is `HS-NAME-002` ("is a value, not a function"):
  the backends never call a value. A local that shares a function's name does not hide the
  function from a call, as in native. A local may be called only while every value it was given
  is a lambda: the checker does not follow branches, so after `g = 5` in any branch, `g(1)` is
  refused. An enum (and a `.hsplus` module) is read through its members (`Route.A`) and never
  called: `Route(1)` is `HS-NAME-002` ("is an enum or module, not a function").
- **Arity** covers struct constructors too (one value per field, too few as well as too many);
  both backends refuse the wrong count.
- **Imports.** `import { a as b }` binds `b` only.
- **Hiding.** Rule 5 covers `let`/`var`/`const`, `slot`, a `for (v in ...)` variable, and a
  repeated parameter name (native refused `f(a, a)`; UAAL ran it and returned 1).
- **Names are resolved wherever a typed function uses them:** expressions (index expressions
  included), call receivers, pointer-write targets, lambda bodies, spreads, statement-position
  arrays and object literals, an object literal's fallback values (`{ k: 1 = v }`), and the
  target and entity destination of a `move` statement (a target left out is `self`).
- **Returns.** Rule 4 and `compile_to_uaal` share `definitely_returns_value`, which counts a
  trailing `scope { ... return ... }` block as native does; `unit` and `()` return nothing for
  both. A loop never counts, because its body may not run; `compile_to_uaal` relies on the
  checker for this, and a test checks that both refuse. A bare `return` in a typed function
  keeps its `HS-TYPE-RETURN-001` message.
- **Positions** on names, calls, declarations, returns, assignments and `for` loops, so older
  `HS-TYPE-*` errors on those nodes gained positions too. `parse` output therefore carries new
  `loc` fields (69 of 137 tracked `.hs` files); no consumer was found that breaks on them. A
  repeated parameter is reported where its name is written the second time. Columns count UTF-16
  code units, set once in the lexer: every consumer is JavaScript or an LSP client (the LSP,
  the MCP validate tool through `validateCanonicalSource`, the `.hsplus` reader, the CLI), and
  none converts, so before this an emoji before a name moved the highlight by one per emoji.
- **Cost.** A lambda's parameters sit on top of the shared scope stack while its body is
  checked; the stack is not copied. Copying it made 6,000 locals plus 6,000 lambdas take 12.9 s
  to check in the release WASM (18.0 s in the review), against 0.2 s before G11; now 0.17 s. A
  test bounds the bytes a check allocates per declaration: 656 at 500 and at 8,000 declarations,
  against 27,236 and 427,525 with the copy put back.
- **`compile_to_uaal` runs the checker first**, so typed programs stop at these codes; the
  emitter's own every-path guard became unreachable and is removed. Its other guards still
  cover untyped functions.

**The `.hsplus` bridge (fragment mode)**

- The context, through the new export `validate_detailed_in_context`, is
  `{"functions":[{"name","arity"}],"names":[...],"namespaces":[...]}`: the document's functions;
  its structs and imports, which may be called; and its enums and `module` blocks, which are read
  through their members (`GameState.addScore(p)`) and never called. A reader that sends no
  `namespaces` gets the earlier behaviour. It is read from `.hsplus` tokens, including words that
  lexer types as keywords
  (`state`, `transition`, `match`, `none`, ...), with parameters counted by top-level commas.
  Import forms: `{ A, B }`, `* as NS`, `"p" as X`, and `"p"` alone (the file's name);
  `@import(...)` binds nothing.
- `parseIncremental` collects the context once per pass and caches a chunk that holds a
  function under its text plus that context, so an edit elsewhere re-checks it.
- **Decision (agent, under the gate rule):** typed `.hsplus` functions follow the `.hs` name
  rules. They may not call the JavaScript runtime's helpers (`log`, `emit`, `play_sound`, ...)
  by bare name, because no native target has them and typed `.hsplus` must not run through
  JavaScript (G14, G19). Measured: no tracked `.hsplus` file does. Declaring host functions for
  typed code is future work.

**Where the refusals show up**

- The MCP `validate_holoscript` tool and every `validateCanonicalSource` caller carry the code
  (`HS-NAME-001`, ...) instead of `E999`, and the geometry typo hint no longer rewrites names
  such as `console` to "cone".
- The mcp-server and absorb-service image smokes require `return y` to be `HS-NAME-001`, so a
  stale checker fails the image build; the studio image follows in its own commit.
- `check-hs-conformance` (pre-commit) holds a floor: the 68 tracked `.hs` files that are valid
  stay valid, and they keep at least 256 typed functions. Deleting types would clear every
  refusal while the pass count stayed green; the typed count makes that visible.
- The drift gate checks the pkg-node receipt against the WASM (digest, size, a full source
  commit this branch contains).

**Size.** Node WASM 541,496 → 555,148 bytes at the first review, 556,484 after the second. A
derived deserializer for the context cost 42 KB; reading it through `serde_json::Value`, which
the crate already ships, cost about 4 KB.

**Nesting.** About 400 nested parentheses trap the WASM, and every later call on the same
instance throws; this was true before G11 and is not fixed here (its own task). The second
review's fixes first lowered the depth that survives, because a new field on the largest AST node
grew every node, and new branches grew the checker's per-expression frame. Both were moved out
of the way, and the build now survives the same depth as `f15be4b45` or more: nested parentheses
175 (175), nested `if` 1,031 (1,031), a `+` chain 5,947 terms (4,674; 6,575 before G11).

**Gate evidence.** (1) Measured breakage against the pre-G11 checker, on every tracked file: 68
of 68 valid `.hs` files stay valid, 69 refused keep the same first message, 25 of 25
conformance programs valid, `compile_to_uaal` identical bytecode on the 15 it compiles and
identical refusal on 122; all 2,474 tracked `.hsplus` files give the same error list. After the
second review's fixes, against the `f15be4b45` build: every tracked `.hs` file in HoloScript
(137), Hololand (87) and ai-ecosystem (11) keeps its verdict, first message and first position,
with identical `compile_to_uaal` output; 2,474 HoloScript and 400 of 402 Hololand `.hsplus`
files give the same error lists (the other two hang or exhaust memory in both readers). (2) `check-spec-corpus.mjs --strict`: 53/53, exactly the eight named cases
flipped on purpose; a differential test runs each through the checker, `holoscriptc` and
`compile_to_uaal`. (3) Switch-off run: 26 of 26 checker switches and 11 of 11 `.hsplus` switches
each fail a test; the floor, receipt and MCP checks were fed real faults and went red. After the
second review: 21 of 21 planted checker faults (its F2 to F5 classes among them) and 4 of 4
`.hsplus` bridge faults turn their named tests red; the list is in the PR #438 body. (4) Review
by a distinct seat in another session (founder, 2026-10-04: a distinct Claude seat counts until a
reviewer of another family passes the native reviewer scorecard): required before merge.
claude3-x402 reviewed `f15be4b45` and asked for the fixes above; its re-read of the new head is
pending. Language changes are approved by these gates, not by a person (founder, 2026-10-05).

**Merge order:** #428, then #401, then this change. Build note: pkg-node here is built with
rustc 1.91.0; main's artifact used 1.98.1. A rebuild on 1.98.1 at merge time must update the
receipt, which the drift gate now checks.

## What remains after this proposal

- The `??` rule on plain values (corpus `g11-coalesce-plain-008`), through the `@unknown` change.
- Undeclared type names (`g11-unknown-types-006`), open question 1.
- "Valid" still does not mean "runs" for untyped functions (by design) or for operations a
  backend lacks (UAAL refuses integer `/`, `%`, unary `-` and `!`; native refuses `var` and
  loops in some machine contracts).
- Other builds of the checker are older: the browser build `packages/compiler-wasm/pkg/`
  (2026-08-04, the package's default export), the distribution and release builds, and npm 6.2.0
  and 7.0.0. They all report `version()` 3.0.0. A version bump and a browser rebuild are their
  own change.
- Built-in argument counts and imported functions' argument counts are not checked (the
  backends refuse with their own messages; an import carries no signature).
- The incremental parser still drops a refused chunk without reporting an error; its result has
  no error field (PR #461 reports refused chunks).
- Typed `.hsplus` functions inside `module` blocks are not sent to the checker.
- Deep nesting traps the WASM (see Nesting above); a depth bound and a reset after a trap are
  their own change.
- G12 (contextual keywords) and G15 (an empty tool allowlist) have their own proposals.
