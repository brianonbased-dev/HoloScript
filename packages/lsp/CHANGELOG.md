# @holoscript/lsp

## 6.2.1

### Patch Changes

- Fixes merged 2026-10-15:

  - `@holoscript/core/constants` and `@holoscript/core/tools` can be `require()`d (CJS export conditions), and the Docker core build emits `dist/constants.cjs`, so the mcp-server image boots again (#582, #583, #585).
  - Unknown traits produce an HS1006 warning in parseHolo, HoloScriptValidator, the strict layer, CLI `validate`, MCP and LSP. It's a warning only, so exit codes don't change (#592).
  - Garbage-input hardening: `parseHolo('')` → HS1001, non-string input → HS1009 without throwing, `parseHoloStrict` no longer fabricates traits, and HS1006 output is capped at 100 plus a summary (also in strict). Locations come from a single linear pass, so 20k unknown traits parse in about 140 ms instead of about 29 s. `compileToWASM` parses source text and refuses non-Composition objects with HS1009 (#593).
  - Likeness: the canonical validator applies HS1011 fail-closed across CLI, MCP and LSP. face/body tracking need `source: live_self` (or a recording). Live pose, face and voice stay on the device unless the tracked person grants sharing. An unbound tracked person fails closed. `@collaborative` voice joins muted, and each voice use needs its own grant (#590, #591).
  - Studio Verify runs the real parser, and no rule passes without running (#594).

- Updated dependencies [4ecc50e]
- Updated dependencies [268e183]
- Updated dependencies [857c54a]
- Updated dependencies
  - @holoscript/core@8.10.0
  - @holoscript/framework@6.1.8

## 6.2.0

### Patch Changes

- 64f7022: Expose structured HoloScript+ record fields through the supported core and parser entry points,
  including a fail-closed source-to-HoloMeaning projection for `@unknown` fields. Canonical parser
  APIs now return `HSPlusParseResult` with a required typed AST while `HSPlusCompileResult` retains
  optional typed AST compatibility for handwritten results. Keep the zero-runtime core-types mirror
  in sync and harden LSP safety extraction against malformed or cyclic AST input.
- Updated dependencies [7c22951]
- Updated dependencies [664f178]
- Updated dependencies [38156cd]
- Updated dependencies [64f7022]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
  - @holoscript/wasm@6.2.0

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- @holoscript/core@6.0.3
- @holoscript/linter@6.0.3
