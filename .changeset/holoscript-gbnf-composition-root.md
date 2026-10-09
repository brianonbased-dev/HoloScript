---
'@holoscript/core': minor
'@holoscript/mcp-server': patch
---

`generateHoloScriptGbnf()` now returns the whole-program grammar by default: one
`composition "Name" { ... }` program, measured to parse with zero errors under the
parser and the strict layer. The `holoscript` grammar preset (LlamaServerCompiler,
`holoScriptGrammarForPreset`) is that grammar too. Callers that relied on the old
root-less first subset ask for it with `generateHoloScriptGbnf({ root: 'definitions' })`
or the new `holoscript-subset` preset, which is byte-identical to the grammar before
this change, so receipts that name it can still be re-derived. Core also exports the
reserved-name lists the grammar is built from (`RESERVED_PROPERTY_NAMES`,
`RESERVED_GROUP_NAMES`, `RESERVED_MACHINE_NAMES`).

The MCP server's `.holo` requests to `local-llm` carry the grammar; a local endpoint
that fails the call with it (one that takes a grammar name rather than GBNF) is asked
once more without it.
