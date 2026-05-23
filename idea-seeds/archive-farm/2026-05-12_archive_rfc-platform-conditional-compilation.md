# RFC: @platform() Conditional Compilation

**Date:** 2026-05-12
**Class:** runtime-instinct
**Status:** promoted
**Repository:** HoloScript
**Source context:** docs/archive/RFC_PLATFORM_CONDITIONAL_COMPILATION.md
**Archive score:** 55
**Archive signals:** future:2, roadmap:3, phase:5, agent:11, runtime:7, vr:13, ar:14

## What Might Be Valuable

6. [Examples](6-examples) 7. [Implementation Roadmap](7-implementation-roadmap) 8. [Appendix: Existing Architecture Reference](8-appendix-existing-architecture-reference) ---

## Why Not Now

This came from an archive. Treat it as historical, incomplete, or superseded until a current owner verifies the idea against today's HoloScript/HoloLand direction.

## Smallest Next Experiment

Open the source archive, extract one current claim or feature idea, and decide whether it should become a build task, research artifact, paper row, or remain dormant.

## Reopen Trigger

Reopen when current roadmap, paper work, HoloLand product planning, runtime cleanup, or tool development touches the same theme.

## Do Not Preserve

Do not revive the archived implementation wholesale. Preserve the idea only if it survives current source contracts, product direction, and validation requirements.

## Links

- docs/archive/RFC_PLATFORM_CONDITIONAL_COMPILATION.md

## 2026-05-23 Marathon Review (task_1779505066683_8xtt)

**Actor:** codex-hardware
**Outcome:** integrated-current; no new implementation board item needed.

Reviewed the archive RFC against current source truth:

- `docs/archive/RFC_PLATFORM_CONDITIONAL_COMPILATION.md` now marks RFC-0012 as implemented and records the feature as shipping.
- `packages/core/src/parser/HoloCompositionParser.ts` parses `@platform(...)`, `not:` exclusions, string/hyphenated names, and parser-level syntax errors for empty, leading comma, trailing comma, and malformed negation cases.
- `packages/core/src/compiler/PlatformConditionalCompilerMixin.ts` expands aliases/categories, filters objects/templates/spatial groups/lights/norms plus nested object and trait variants, and validates unknown or empty platform constraints.
- `packages/core/src/compiler/BabylonCompiler.ts`, `R3FCompiler.ts`, `VisionOSCompiler.ts`, `OpenXRCompiler.ts`, and `AndroidXRCompiler.ts` route platform filtering into real compiler paths.
- `packages/core/src/lsp/LanguageService.ts` and `CompletionProvider.ts` expose `@platform()` hover/completion support.
- Platform conditional behavior is covered by parser, mixin, negative validation, LSP, and compiler emission tests under `packages/core/src/compiler/**/__tests__` and `packages/core/src/lsp/__tests__`.

The remaining RFC ideas are extension-level, not the original seed:

- Pipe union syntax (`@platform(quest3 | android-xr)`) remains explicitly future sugar.
- Deeper editor affordances such as CodeLens/inlay hints/status-bar target selection remain product/editor backlog, not compiler unblockers.

Decision: treat this seed as fulfilled by the current implementation. Reopen only if the pipe-union syntax or editor target-selection work becomes an active roadmap item.
