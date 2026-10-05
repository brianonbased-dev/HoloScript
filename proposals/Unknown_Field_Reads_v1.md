# Reading an `@unknown` field: one written form, and the tag reads — v1

**Status:** Proposed 2026-09-28 under the Spec v0.1 gate rule: language changes are approved by
the gates, not by a person (founder, 2026-10-05). Built in PR #444 (stacked on #438) with gates 1
to 3; gate 4, a reviewer of another seat in another session, pending, so not yet accepted. The
written form `load(record.field) ?? fallback` follows Grok's language notes
(`checker-35-of-137/unknown-proposal.md`).
**Gaps:** the `@unknown` half of G11 (corpus case `g11-coalesce-plain-008`) and the three-way
disagreement recorded in Grok's notes.

## For Joseph, in plain words

A field marked `@unknown` may not hold a real value. There are three safe ways to touch it: ask
whether it is known, ask why it is not, or read it with a backup value. The native engine did all
three, and its own error messages taught them. The checker refused the first two and taught a
fourth way the native engine refuses. Now the checker accepts the three safe ways, refuses the
fourth, and its messages name the one way to read the value.

After the second review, the checker also looks up which record a field belongs to. The three safe
ways work only on a field that record really marks `@unknown`, and a field with the same name on
another record is read like any other field, as the native engine does.

## What disagreed (measured 2026-09-28)

| Program (`struct Snapshot { @unknown count: i32 }`)           | checker before                       | native                                                                             |
| ------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `examples/native/uncertain-steward-honesty-gate-exit-five.hs` | refused (bare read inside `isKnown`) | runs, exit 5                                                                       |
| `snapshot.count ?? 7`, the form the checker's message taught  | valid                                | refused: "native `??` requires `load(@unknownField) ?? fallback` on its left side" |
| `load(snapshot.count) ?? 7`                                   | valid                                | runs, exit 7                                                                       |
| `isKnown(snapshot.count)` / `unknownReason(snapshot.count)`   | refused                              | runs, exit 4                                                                       |
| `a ?? 3` on a plain `i32` (corpus `g11-coalesce-plain-008`)   | valid                                | refused                                                                            |

The native contract (`docs/spec/native-machine-v34.md`, Honesty operations) already names the
three operations: `isKnown(record.field)` reads only the tag and gates actions;
`unknownReason(record.field)` reads the reason code; `load(record.field) ?? fallback` branches on
the tag.

## What the change is

1. **Tag reads are accepted.** `isKnown(record.field)` and `unknownReason(record.field)` read the
   tag and the reason code, never the value, so their argument is not an unguarded read.
2. **One written form for the value:** `load(record.field) ?? fallback`. A bare `record.field ??
fallback` on an `@unknown` struct field is refused, `HS-UNKNOWN-002`, and the message names the
   load form.
3. **A bare read is refused**, `HS-UNKNOWN-001` (a code now; the rule is unchanged): `record.field`
   used as a value, or `load(record.field)` without a fallback. The message names the load form and
   `isKnown`.
4. **Inside a function that states a type, `??` needs `load(record.field)` on its left**
   (`HS-UNKNOWN-002`): a fallback on a plain value (`a ?? 3`) or on an ordinary field is refused,
   as both backends refuse it. Untyped legacy functions keep their earlier reading.
5. **The Kotlin (Quest) bridge reads the same form.** `load(record.field) ?? d` lowers to the same
   `(record.field).orElse { d }` the bare form produced; `isKnown(record.field)` lowers to
   `((record.field) is Uncertain.Known)`; `unknownReason` is refused on Kotlin for now (the native
   reason is an `i32` code; the Kotlin carrier holds a text reason).
6. **The three forms apply only to an `@unknown` field of the record's own struct** (second review,
   2026-10-05). A field resolves through its record's declared struct type, as native resolves it:
   typed parameters, slots, typed locals, locals built by a constructor or returned by a function
   that states its type, and struct-typed fields on the way. Each form takes exactly one named field
   (`record.a.b`), and the rest of its argument is read like any expression. A tag read of a plain
   or missing field, of a value with no fields, with extra or no arguments, or of anything but a
   named field is `HS-UNKNOWN-003`, naming the field; the load form on the same is `HS-UNKNOWN-002`.
   A same-named plain field of another struct is read normally. When the record's type cannot be
   seen (an untyped parameter, a struct from another file, an index or a call), the field's name
   decides: a name some struct in view declares `@unknown` is held to the rule, any other is left to
   the backends. A `.hsplus` typed function is checked with its document's structs. On Kotlin,
   `isKnown` lowers only for an `@unknown` field and refuses anything else with a message; on UAAL,
   `load(record.field) ?? d` is the uncertainty capability refusal, `HS-UAAL-CAP-008`.

`@trait` fields (`reading ?? 20.0` in trait bodies) are unchanged: they are not struct fields and
are not read through `load`.

## What existing files would break

Measured on every tracked file (numbers in "Gate evidence" below):

- `packages/core/src/compiler/quest-mr-logic/Routing.logic.hs:31` used the bare form
  `intent.inferred ?? "deny"`. It migrates to `load(intent.inferred) ?? "deny"` in the same change;
  the Kotlin it compiles to is byte-identical (`RoutingLogic.parity.test.ts` pins it).
- `examples/native/uncertain-steward-honesty-gate-exit-five.hs` was refused and allow-listed in
  `check-hs-conformance`; it is now valid unchanged and leaves the allow-list (the gate now refuses
  an allow-list entry the checker accepts).
- Kotlin bridge tests that used the bare form move to the load form with identical output.

## The test that proves it

- Rust: tag reads accepted; both codes with line and column; the Kotlin lowering of `load(...) ??`
  and `isKnown`; the `unknownReason` refusal on Kotlin; `a ?? 3` refused in a typed function and
  accepted in an untyped one. Second review: the owner rule both ways, the four programs that
  were wrongly valid, plain and missing fields, argument counts and shapes, the Kotlin lowering
  called directly, each UAAL uncertainty operation, positions, every expression position, and a
  lifted function with its document's structs.
- Differential (`wasm-api.test.ts`): the steward example valid and exit 5 natively; the load form
  valid and exit 7; the tag reads valid and exit 4; the bare form refused by both; nine refused
  programs of the second review refused by both, and `load(tally.count) + 1` valid and exit 5.
- Spec corpus: `g11-coalesce-plain-008` flips to refused; fifteen `unknown-struct-*` cases pin the
  forms.
- `RoutingLogic.parity.test.ts` compiles today's `Routing.logic.hs` and holds the generated Kotlin
  to it.
- Switch-off run: each rule removed fails a test.

## Gate evidence

1. **Measured breakage**, against the G11 checker (b23ffa3a), every tracked file: the 68 valid
   `.hs` files stay valid (Routing.logic.hs after its migration, Kotlin byte-identical); the
   steward example becomes valid; no other verdict or first message changes; `compile_to_uaal`
   gives identical bytecode on the 15 files it compiles (the steward example's UAAL refusal is
   now `HS-UAAL-CAP-008`); all 2,474 tracked `.hsplus` files give the same error list.
2. **Corpus** `check-spec-corpus.mjs --strict`: 58/58; `g11-coalesce-plain-008` flipped on
   purpose, five `unknown-struct-*` cases added; four honest gaps remain on record. The
   differential test (`wasm-api.test.ts`) agrees with native on every form.
3. **Switch-off run**: 9 of 9 switches (tag reads, the bare fallback, the typed `??` rule, the
   Kotlin `load` lowering, `isKnown` and `unknownReason`, the UAAL capability, the bare-read code
   and its position) each fail a test. The allow-list rule was fed a stale entry and went red.
4. **Review by a distinct seat in another session** (founder, 2026-10-04): claude3-x402 reviewed
   `77939d364` and asked for the second-review changes (point 6); its re-read is pending.

After the second review, against the `77939d364` build: (1) every tracked `.hs` file in
HoloScript (137), Hololand (87) and ai-ecosystem (11) keeps its verdict, first message and first
position, with identical `compile_to_uaal` and `parse()` output; 2,474 HoloScript and 400 Hololand
`.hsplus` files give identical error lists. On claude3's 67 programs the checker now agrees with
native except on six outside this rule (it was 26). (2) `--strict`: 68/68, nine cases added. (3)
20 of 20 Rust faults (claude3's MF1 to MF5 among them) and 5 of 5 reader faults each turn a test
red; the list is in the PR #444 body.

## Open questions

1. ~~Should `load(record.field) ?? d` be refused when `field` is not `@unknown`?~~ Yes, answered by
   the second review: refused when the record's struct is in view (a `.hsplus` typed function sees
   its document's structs); left to the backends when the record's type cannot be seen.
2. How should `unknownReason` map to Kotlin: an `i32` code on both sides, or a text reason on both?

## What remains after this proposal

- Flow narrowing (a bare `load` inside `if (isKnown(x))`) stays out: it is a new checker rule
  (Grok's notes put it in the idea inbox).
- `unknownReason` on the Kotlin bridge (open question 2).
- The same forms on UAAL, which refuses `@unknown` aggregates today.
- A struct imported from another file is not visible to the checker: reads of its fields go by the
  field's name until the checker follows imports.
- The browser build `pkg/` (2026-08-04) still gives the old verdicts; PR #448 rebuilds it.
