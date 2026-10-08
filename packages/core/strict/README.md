# strict — the rejection layer

`@holoscript/core` parses but never refuses. `{{{@@@`, a SQL statement and an
empty file all come back as a successful parse of an empty composition, and
`parseHoloStrict` invents trait nodes named `"@"` and `""` from the same noise.
This folder adds the "no" without changing the parser.

```js
import { parseStrict, parseTolerant } from './strict/index.mjs';

await parseStrict('object Cube { position: [0, 1, 0] }');  // { ok: true, ast, diagnostics: [] }
await parseStrict('{{{@@@');                               // { ok: false, diagnostics: [HS1002, HS1005, ...] }
await parseTolerant(src);                                  // always ok, keeps the AST, same diagnostics
await parseStrict(src, { knownTraits: ['my_plugin_trait'] });  // add a vocabulary core does not ship
await parseStrict(src, { unknownTraits: 'error' });             // refuse unknown traits too
```

Every diagnostic has a code, a message and a real 1-based line and column.
Strict mode refuses what is not HoloScript (empty, unbalanced, unparseable, or
parsing into nothing). An unknown trait is a warning in both modes, as in
core's own validators, unless the caller passes `unknownTraits: 'error'`.

- `ERROR_CONTRACT.md` — the codes, the two modes, what counts as a known trait,
  the known gaps and the grammar decisions still open.
- `holo_strict.mjs` — the layer. It takes the tokenizer, parser and trait
  vocabulary as arguments and uses no Node built-ins.
- `index.mjs` — wires the layer to core.
- `corpus/` — hand-written valid and invalid files, verbatim copies of real
  repo files that must stay accepted, and `manifest.json` with the expected
  codes and positions.
- `test/corpus.test.mjs` — run `node --test test/corpus.test.mjs` from this
  folder (the package's `test` script). Core's vitest suite does not run it.

## How it finds core

It uses the core next to it (`../dist`) when it sits inside
`packages/core`, else the installed `@holoscript/core`, so it always tests
the build it ships with. Everything comes through core's public `exports` map:
the tokenizer and parser from `@holoscript/core/parser`, the trait lists from
`@holoscript/core/constants` and `@holoscript/core/traits/trait-registry.json`,
and, only when those miss a name, the rest of the vocabulary from core's main
entry. **The first source that uses a trait outside the light lists costs a
one-time load of core's main entry** (measured 6–8 s with a cold disk cache,
about 1 s warm); later calls in the same process do not pay it.

**If no trait list can be loaded, the unknown-trait check (`HS1006`) is
skipped** and everything else still runs. `coreInfo()` reports which lists
loaded and whether the check is on.

## Publishing it separately

The same files pack as `@holoscript/strict` (peer dependency on core) if you
want consumers to opt in without a core release.

## Scope

This layer rejects. The validator behind `holoscript validate`, the
`validate_holoscript` tool and the LSP (`validateCanonicalSource` in core)
gives the same accept-or-refuse verdict on every file in `corpus/`;
`src/validation/__tests__/rejection-corpus.test.ts` holds it to that.
`HoloScriptValidator` reports what the legacy `.hs` code parser finds and is
deprecated in favour of `validateCanonicalSource`.

`compileToWASM` does depend on its input: one object and two objects compile
to different output (measured 2026-10-07 with compositions from `parseHolo`).
Garbage and empty input give the same bytes only because both parse to an
empty composition, which this layer and the canonical validator refuse first.
Pass the composition (`parseHolo(src).ast`), not the source string or the
parse result, or every call compiles an empty composition.
