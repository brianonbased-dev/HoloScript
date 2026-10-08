# HoloScript error contract, v1

**The rule this adds: HoloScript can say no.** Today nothing in the toolchain
can. `{{{@@@`, a SQL statement and an empty file all parse as a successful empty
composition in both the npm core and (through a stub) the Python package.

This contract is implemented in `holo_strict.mjs` as a layer over the existing
tokenizer and parser, so it ships without a grammar rewrite and can be absorbed
into the parser later keeping the same codes.

## Two modes, both documented

| Mode | Returns | For |
| --- | --- | --- |
| `parseTolerant(src)` | `{ ok: true, ast, diagnostics }` — whatever parsed, plus every diagnostic | Editors, language servers, partial input while typing |
| `parseStrict(src)` | `{ ok: false, ast: null, diagnostics }` if any diagnostic has severity `error` | CI, compilers, agent-generated code, anything that acts on the result |

Tolerant never throws and never hides a diagnostic. Strict never returns an AST
it had to guess at. `parseHolo` keeps its current signature so nothing breaks;
`parseHoloStrict` is the name that changes behaviour, and today it is the one
that fabricates trait nodes named `"@"` and `""` from noise.

## Codes

Every diagnostic carries `{ code, severity, message, line, column }` and an
optional `hint`. Codes are stable: a new check gets a new code in a minor
release; renaming or removing one is a major release.

| Code | Severity | Means | Example input |
| --- | --- | --- | --- |
| `HS1001` | error | Source is empty — no tokens but EOF | `""` |
| `HS1002` | error | A delimiter never closes, or closes with nothing open | `object Cube {` |
| `HS1003` | error | A token that cannot start a top-level item | `SELECT * FROM users;` |
| `HS1004` | error | Tokens exist, nothing parsed into the composition | `this is not holo at all` |
| `HS1005` | error | A trait with no name, including `@` alone | `{{{@@@` |
| `HS1006` | error (strict) / warning (tolerant) | Trait is not in the registry | `@nope_xyz` |
| `HS1007` | error | The parser's own error, carried through unchanged | `object Cube { position: [0, 1, 0]` |
| `HS1008` | warning | The parser's own warning, carried through | — |
| `HS1009` | error | Source was not a string | `parse(42)` |
| `HS1010` | error | The tokenizer or parser threw | — |

`HS1003` works from a deliberately short denylist of tokens that cannot begin a
top-level item in any reading of the grammar. A token missing from that list is
not reported, so adding grammar never turns a valid file into an error. The
cost is that some invalid files are caught by `HS1004` instead of `HS1003`,
which is the right way round.

## How it is enforced

One corpus, two runtimes, same verdicts:

- `corpus/valid/*.holo` — must be accepted, with the object count in the manifest.
- `corpus/invalid/*.holo` — must be rejected, carrying at least the expected codes.
- `node run_corpus.mjs <core>` runs it through the TS parser plus this layer.
- `python run_corpus.py parser-strict.wasm` runs the same files through the WASM
  build the Python package uses, and compares its verdicts against the Node run.

Measured 2026-10-06 against `@holoscript/core@8.7.0`: 6 valid files accepted
with zero diagnostics, 9 invalid files rejected with the expected codes, and
every verdict identical in both runtimes.

## Open questions — these are grammar decisions, not bugs

1. **Which constructs are actually implemented?** `zone Lobby { bounds: [10, 4, 10] }`
   parses to an empty composition today, so the strict layer rejects it with
   `HS1004`. If zones are real grammar, that is a parser gap; if they are not
   yet, the error is correct. Same question for timelines, audio, transitions,
   conditionals, iterators and npcs — each has an AST array and no sample that
   fills it.
2. **Unknown traits: error or warning in strict mode?** It is `HS1006` error
   here. If the registry is meant to be open — plugins registering traits at
   runtime — this becomes a warning, and the registry needs a public way to add
   to it before validation.
3. **The registry does not contain four of the five traits the Python package
   advertises.** `list_traits()` returns `@grabbable`, `@physics`, `@clickable`,
   `@color`, `@position`; the registry's 302 ids contain `grabbable`,
   `rigidbody` and `gpu_physics` but none of the other four. Decide which list
   is the truth before either one is published again.
4. **Does any real `.holo` file in the repo fail this?** Run the strict layer
   over every `.holo` under `holo-dev` before turning strict on by default. A
   failure there is information, not a reason to weaken the contract.

## Where this goes

The layer is a wrapper now so it can ship this week. Folding it into the parser
proper means moving `HS1002`, `HS1003` and `HS1005` into the token loop, where
they can carry exact spans rather than a token position, and making `HS1004`
unnecessary because the parser itself will have refused. Keep the codes when
that happens — the corpus is written against them.
