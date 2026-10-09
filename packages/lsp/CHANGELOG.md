# @holoscript/lsp

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
