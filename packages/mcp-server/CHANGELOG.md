# @holoscript/mcp-server

## 8.1.0

### Minor Changes

- d587a34: Add an opt-in `parse_hs` projection for parser-admitted `.hsplus` `@unknown` struct fields,
  including stable source identity and fail-closed HoloMeaning stage diagnostics.

### Patch Changes

- 4ecc50e: `generateHoloScriptGbnf()` now returns the whole-program grammar by default: one
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

- 857c54a: The whole-program grammar writes `@platform(...)` on objects with at least one name, the
  only form the parser takes there, and keeps quoted keys out of a state transition's
  `condition:` and `when:`. The MCP server now retries a local-llm call without the grammar
  only when the server refuses it (400 or 422), not after a 5xx or a timeout, and a result
  that was not held to the grammar says so with `grammarDropped: true`.
- 2ff7533: Security and correctness fixes merged since 8.0.14 (the last npm release):
  POST /a2a and /a2a/tasks run the same tool-call gate as /mcp and /tools/call and
  are audited under their own path; a self-registered OAuth client that proved
  nothing gets `tools:execute` as `tools:write` only; a call without a caller is
  the local user only on the stdio server; a customer key never carries an
  operator scope; the server no longer runs orchestrator job commands with its
  secrets in scope; a codebase scan opens only allowed server folders; the
  video-reconstruction and mesh-invoke fetches reach only the public internet
  unless the caller is an operator or local; `@types/express` and `@types/qrcode`
  are declared.
- Fixes merged 2026-10-15:

  - `@holoscript/core/constants` and `@holoscript/core/tools` can be `require()`d (CJS export conditions), and the Docker core build emits `dist/constants.cjs`, so the mcp-server image boots again (#582, #583, #585).
  - Unknown traits produce an HS1006 warning in parseHolo, HoloScriptValidator, the strict layer, CLI `validate`, MCP and LSP. It's a warning only, so exit codes don't change (#592).
  - Garbage-input hardening: `parseHolo('')` → HS1001, non-string input → HS1009 without throwing, `parseHoloStrict` no longer fabricates traits, and HS1006 output is capped at 100 plus a summary (also in strict). Locations come from a single linear pass, so 20k unknown traits parse in about 140 ms instead of about 29 s. `compileToWASM` parses source text and refuses non-Composition objects with HS1009 (#593).
  - Likeness: the canonical validator applies HS1011 fail-closed across CLI, MCP and LSP. face/body tracking need `source: live_self` (or a recording). Live pose, face and voice stay on the device unless the tracked person grants sharing. An unbound tracked person fails closed. `@collaborative` voice joins muted, and each voice use needs its own grant (#590, #591).
  - Studio Verify runs the real parser, and no rule passes without running (#594).

- Updated dependencies [9498a8f]
- Updated dependencies [4ecc50e]
- Updated dependencies [268e183]
- Updated dependencies [857c54a]
- Updated dependencies
  - @holoscript/secrets-broker@6.2.0
  - @holoscript/core@8.10.0
  - @holoscript/llm-provider@1.7.0
  - @holoscript/framework@6.1.8
  - @holoscript/uaal@8.10.0

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- c330bbf: # CAEL cognition + MCP provenance patch release

  Align CAEL cognition and release metadata for recent simulation and MCP work.
  - Default Phase 2 CAEL cognition wiring to `SNNCognitionEngine` (async-safe `think()`/`tick()` path).
  - Add explicit initialized WebGPU cognition integration coverage with deterministic CPU fallback assertions.
  - Remove/deprecate legacy inline `SNNCognition` export path from active simulation wiring.
  - Add MCP absorb provenance answer envelope dispatch and tool wiring coverage.
  - Add contracted sandbox execution flow with CAEL trace metadata.
  - Sync root changelog and release versioning documentation to current repository state.

- Updated dependencies [c330bbf]
  - @holoscript/engine@6.0.3
  - @holoscript/core@6.0.3
  - @holoscript/framework@6.0.3
