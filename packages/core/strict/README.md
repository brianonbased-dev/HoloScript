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
```

- `ERROR_CONTRACT.md` — the ten codes, the two modes, and the grammar decisions still open.
- `holo_strict.mjs` — the layer. No Node built-ins, so the same file compiles into the WASM build the Python package will call in 6.1.0.
- `corpus/` — 6 valid files, 9 invalid ones, `manifest.json` of expected codes.
- `test/corpus.test.mjs` — `node --test strict/test/corpus.test.mjs` from this package.

It resolves the parser from `../dist` when it sits inside core, so it always
tests the build next to it.

## Publishing it separately

The same files pack as `@holoscript/strict` (peer dependency on core) if you
want consumers to opt in without a core release. The tarball built on
2026-10-06 passed all 16 corpus tests against `@holoscript/core@8.7.0`.

## Scope

This layer rejects. It does not touch the other two silences in core:
`HoloScriptValidator.validate()` still returns `[]` for any source, and
`compileToWASM` still emits identical bytes for valid, garbage and empty input.
