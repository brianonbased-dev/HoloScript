# HoloScript Grammar SSOT

Status: active guardrail, established 2026-07-03 for LANG 4/6.

This file is the router for accepted HoloScript grammar truth. It does not
replace the parsers; it defines which artifacts are allowed to describe syntax
as accepted by the tools.

## Accepted Grammar Sources

| Surface | Accepted source | Public reference |
| --- | --- | --- |
| `.holo` scene/composition syntax | `packages/core/src/parser/HoloCompositionParser.ts` | `packages/mcp-server/src/documentation.ts` `SYNTAX_DOCS` examples, checked by `packages/mcp-server/src/__tests__/syntax-reference-conformance.test.ts` |
| `.hsplus` trait/brain syntax | `packages/core/src/parser/HoloScriptPlusParser.ts` | Same `SYNTAX_DOCS` examples when the example is not a full `.holo` composition |
| `.hs` logic syntax | `packages/compiler-wasm/src/` for the Rust/WASM grammar and logic emitters; TS parser coverage remains a known bridge gap | `docs/spec/spec-vs-reality-gap.md` |

## Rule

Docs, MCP `get_syntax_reference`, examples, LSP diagnostics, and paper claims may
only present syntax as accepted when a conformance test parses that exact
example through the production parser path.

The current executable guard is:

```bash
corepack pnpm --filter @holoscript/mcp-server exec vitest run src/__tests__/syntax-reference-conformance.test.ts
```

That test calls the real `get_syntax_reference` handler and parses every
returned example. A new syntax topic or example must either pass there or be
explicitly labeled historical/aspirational outside the accepted reference.

## Non-Authoritative Inputs

These are useful research inputs but are not accepted grammar on their own:

- `docs/language/holoscript-language-spec.md`, a compressed historical language
  note that contains spatial/component/zone forms not accepted by the current
  parser.
- Papers that describe six-form or theoretical grammar surfaces without a
  parser-backed conformance fixture.
- Legacy examples that only parse after migration or wrapping. They should be
  shown as migration notes, not as `get_syntax_reference` accepted examples.

## Next Guardrails

- Add an LSP/compiler agreement suite that runs `hs_diagnostics` and the parser
  on the same byte-for-byte fixtures.
- Move syntax examples into a small typed fixture module if `documentation.ts`
  grows beyond a maintainable inline table.
- Extend the conformance guard to trait docs and `get_examples` after the
  syntax-reference surface stays green.
