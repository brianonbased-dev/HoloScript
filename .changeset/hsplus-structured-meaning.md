---
'@holoscript/core': minor
'@holoscript/core-types': minor
'@holoscript/lsp': patch
---

Expose structured HoloScript+ record fields through the supported core and parser entry points,
including a fail-closed source-to-HoloMeaning projection for `@unknown` fields. Canonical parser
APIs now return `HSPlusParseResult` with a required typed AST while `HSPlusCompileResult` retains
optional typed AST compatibility for handwritten results. Keep the zero-runtime core-types mirror
in sync and harden LSP safety extraction against malformed or cyclic AST input.
