# HoloScript error contract, v1

**The rule this adds: HoloScript can say no.** Without it nothing in the
toolchain can. `{{{@@@`, a SQL statement, a JSON document and an empty file all
parse as a successful empty composition in the npm core.

This contract is implemented in `holo_strict.mjs` as a layer over the existing
tokenizer and parser, so it ships without a grammar rewrite and can be absorbed
into the parser later keeping the same codes.

## Two modes, both documented

| Mode | Returns | For |
| --- | --- | --- |
| `parseTolerant(src)` | `{ ok: true, ast, diagnostics }` — whatever parsed, plus every diagnostic | Editors, language servers, partial input while typing |
| `parseStrict(src)` | `{ ok: false, ast: null, diagnostics }` if any diagnostic has severity `error` | CI, compilers, agent-generated code, anything that acts on the result |

Both modes run the same checks and report the same diagnostics at the same
places; they differ only in what they return. Tolerant never throws and never
hides a diagnostic. Strict never returns an AST it had to guess at.
`parseHolo` keeps its current signature so nothing breaks; `parseHoloStrict`
is the name that changes behaviour, and today it is the one that fabricates
trait nodes named `"@"` and `""` from noise.

Both take an optional second argument:

- `knownTraits` — extra trait names for that call, for vocabularies core does
  not ship (a plugin's, a host's).
- `unknownTraits: "error"` — make `HS1006` an error, for a caller that wants
  invented traits refused (for example generated code checked against a closed
  vocabulary). The default is `"warning"`.

**Strict mode refuses what is not HoloScript**: empty, unbalanced, a token that
cannot start anything, a trait with no name, a parser error, or a source that
parses into nothing. It does not refuse a well-formed file over its trait
vocabulary (see `HS1006`).

## Codes

Every diagnostic carries `{ code, severity, message, line, column }` and an
optional `hint`. `line` and `column` are 1-based and point at a real place in
the source: the token the problem is about, or, for a trait, the `@` in front
of its name. Diagnostics about the whole file (`HS1001`, `HS1009`, `HS1010`)
point at line 1, column 1. Codes are stable: a new check gets a new code in a
minor release; renaming or removing one is a major release.

| Code | Severity | Means | Example input |
| --- | --- | --- | --- |
| `HS1001` | error | Source is empty — nothing but whitespace and comments | `""` |
| `HS1002` | error | A delimiter never closes, or closes with nothing open | `object Cube {` |
| `HS1003` | error | A token that cannot start a top-level item | `SELECT * FROM users;` |
| `HS1004` | error | Tokens exist, nothing parsed into the composition | `this is not holo at all` |
| `HS1005` | error | A trait with no name, including `@` alone | `{{{@@@` |
| `HS1006` | warning (both modes; error with `unknownTraits: "error"`) | Trait is in no known vocabulary | `@nope_xyz` |
| `HS1007` | error | The parser's own error, carried through (the parser's own code is kept when it has one, e.g. HS1005; only the first error on a token is kept) | `object Cube { position: [0, 1, 0]` |
| `HS1008` | warning | The parser's own warning, carried through | — |
| `HS1009` | error | Source was not a string | `parse(42)` |
| `HS1010` | error | The tokenizer or parser threw | — |

`HS1003` works from a deliberately short denylist of tokens that cannot begin a
top-level item in any reading of the grammar. A token missing from that list is
not reported, so adding grammar never turns a valid file into an error. The
cost is that some invalid files are caught by `HS1004` instead of `HS1003`,
which is the right way round. `;` is not on the list: core accepts it as a
statement terminator (`import "./x.holo";`).

`HS1004` counts any field of the composition AST as content except the fields
every node carries (`type`, `loc`, `provenance`) and the composition's `name`.
A construct added to the grammar therefore counts the day it lands.

### `HS1006` is a warning, in both modes

Decided 2026-10-07 by the requester of this layer, closing what was open
question 2. An unknown trait was an error in strict mode. Run over every
tracked `.holo` on that date, that rejected well over a hundred grammatically
valid files, most of them under `examples/`, whose only fault was a trait
missing from core's lists. Core's own validators treat an unknown trait as a warning: the parser
records any `@name`, and `ConfabulationValidator` calls it "a confabulation
risk but NOT always an error", because plugins add traits. Strict mode exists
to refuse garbage (non-HoloScript, empty, broken structure), not to be
stricter about the trait vocabulary than core is. So `HS1006` is a warning in
both modes, still reported at the trait's `@`, and `unknownTraits: "error"`
restores the refusal for a caller who wants it.

### What `HS1006` checks against

A trait is known if it is in any vocabulary core publishes, or declared where
it is used:

1. `VR_TRAITS` (`@holoscript/core/constants`).
2. The trait registry (`@holoscript/core/traits/trait-registry.json`).
3. `buildKnownTraitSet()` — the vocabulary core's parser, language server and
   linter share (VR_TRAITS plus Native2D panel, code-graph and runtime
   directive names).
4. `DERIVED_TRAIT_SCHEMAS` — every trait declared by a `.holo` `@trait { ... }`
   file under `packages/core/src/traits`.
5. Declared in the same source: `@trait { name: "@x" }` or `trait X { ... }`.
   `@trait` itself is the declaration form, not a use.
6. Passed by the caller in `knownTraits`.

Names compare across spellings: `@fooBar`, `@foo-bar` and `@foo_bar` are the
same trait. 3 and 4 live only on core's main entry, which is slow to load, so
the layer loads them once, the first time 1 and 2 miss a name: the first
source with such a trait pays a one-time load (measured at 6–8 s with a cold
disk cache, about 1 s warm). Without it, files using Native2D panel traits or
core's own `@trait` definitions would get false `HS1006` warnings.

**If no vocabulary can be loaded, `HS1006` is skipped** and every other check
still runs. `coreInfo()` says which vocabularies were loaded (`traitSources`)
and whether the check is on (`traitCheck`); the corpus test asserts all four
load inside this repo, so the check cannot switch itself off unnoticed here.

When the parser has read a trait name differently from how it is written,
`HS1006` says so, as a warning, and names the written form: that is a parser
defect, not a fault in the source. (The first known case, `@2d_canvas` read as
a trait named `2`, is fixed: the parser now reads digit-leading names whole.)

## How it is enforced

`test/corpus.test.mjs` (`node --test`, the package's `test` script) holds the
layer to `corpus/manifest.json`:

- `corpus/valid/*.holo` — small hand-written files; must be accepted, with the
  object count in the manifest.
- `corpus/real/*.holo` — verbatim copies of real files from this repo (each
  entry names where it came from): quickstart examples, `@trait` definitions,
  scenes, imports ending in `;`, panels, domain blocks. Must be accepted with no
  error diagnostics. These exist because the first version of this layer
  rejected most of the repo's own valid files and the hand-written corpus did
  not notice.
- `corpus/warns/*.holo` — must be accepted by strict mode, with exactly the
  listed warnings (an unknown trait; a trait name the parser misread).
- `corpus/invalid/*.holo` — must be rejected with exactly the listed error
  codes, each at the listed line and column.

The layer is not run by core's vitest suite (`packages/core/vitest.config.ts`
excludes `strict/**`); run it with `node --test test/corpus.test.mjs` from this
folder.

### Planned, not built

A second runtime: compile `holo_strict.mjs` to WASM so the Python package can
call the same layer, with a Python corpus runner that must reach the same
verdicts as the Node one on every corpus file. None of this exists yet — no
WASM build, no Python runner. `holo_strict.mjs` already takes its tokenizer,
parser and vocabulary as arguments and uses no Node built-ins, so that it can
be compiled this way later.

## Known gaps

- **Custom block keywords are accepted.** `blorp Thing { position: [0, 1, 0] }`
  passes: core's grammar accepts any word as the keyword of a domain block
  (`HoloDomainType` includes `'custom'`, "any user-defined block keyword"), so
  the AST holds a real block. Refusing it is a grammar decision, not a strict
  layer fix.
- **Real files that still fail.** Running every tracked `.holo` through core
  and this layer, the only files core accepts and strict refuses (outside this
  folder's invalid corpus) are JSON-shaped documents (most do not even parse as JSON) saved with a `.holo` extension
  (`examples/v5.0-hardened/`, some of `examples/v6/`,
  `packages/studio/holoscript-editor.holo`). Core accepts them as an empty
  composition; `HS1004` is right and core is wrong.
- **Traits nothing declares get a warning only.** Many real files use traits
  that no vocabulary above declares (`@interactable`, `@reactive`,
  `@ambient`, `@hand_tracked`, `@verified_view`, and more). Either core's
  vocabulary is missing them or the files use traits nothing defines; core's
  parser accepts any `@name`, so it cannot tell. Hosts that supply such
  traits pass them in `knownTraits`.

## Open questions — these are grammar decisions, not bugs

1. **Which constructs are actually implemented?** `zone Lobby { bounds: [10, 4, 10] }`
   parses to an empty composition, so the strict layer rejects it with
   `HS1004`. If zones are real grammar, that is a parser gap; if they are not
   yet, the error is correct.
2. **Which trait list is the truth?** The Python package's `list_traits()`
   advertises `@grabbable`, `@physics`, `@clickable`, `@color` and `@position`.
   The first three are in `VR_TRAITS`; `color` and `position` are properties,
   not traits, in every vocabulary core ships. Decide before either list is
   published again.

## Where this goes

The layer is a wrapper now so it can ship without a grammar change. Folding it
into the parser proper means moving `HS1002`, `HS1003` and `HS1005` into the
token loop, where they can carry exact spans, giving the lexer one column
convention (today words are reported 1-based and most symbols one column
early, and newlines inside strings are not counted), and making `HS1004`
unnecessary because the parser itself will have refused. Keep the codes when
that happens — the corpus is written against them.
