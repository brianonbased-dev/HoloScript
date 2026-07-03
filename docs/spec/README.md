# HoloScript Language Specification

> **Status (2026-06-22): reclaimed + reconciled.** This directory is the canonical home of
> the HoloScript language specification. Its core — the uAAL/HOLO language definition — was
> authored in **January 2026** but lived only in a Gemini/Antigravity knowledge silo
> (`~/.gemini/antigravity/knowledge/uaa2_language_evolution_and_uaal/`), never committed to a
> repo. It was reclaimed here on 2026-06-22. See [Provenance](#provenance).

## What lives here

| File | What it is |
|------|------------|
| [`holoscript-grammar-ssot.md`](./holoscript-grammar-ssot.md) | The accepted-grammar router: parser-backed sources only, plus the conformance test that keeps `get_syntax_reference` examples aligned with the production parser path. |
| [`uaal-language-spec.md`](./uaal-language-spec.md) | The reclaimed uAAL (cognitive) + HOLO (spatial) language definition: primitives, instruction set, and a **real-vs-aspirational** reconciliation with the shipped code. |
| [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md) | The language-build backlog: each spec claim mapped to its actual code status (shipped / island / absent), with the seam that would close it. |
| [`motivation-trait.md`](./motivation-trait.md) | (pre-existing) trait-level spec note. |

Related existing docs (do not duplicate): [`../agents/uaal-vm.md`](../agents/uaal-vm.md) (VM API),
`../packages/uaal.md`, `../packages/holo-vm.md` (package docs).

## The three-format model

HoloScript is **one language in three surfaces** (MEMORY F.120), all descending from the
uaa2-service genesis:

| Format | Role | Descends from | Canonical compiler/runtime | Status |
|--------|------|---------------|----------------------------|--------|
| `.holo` | Spatial **IR** — scenes, entities, transforms | **HOLO VM** (spatial) | `core/compiler/HolobCompiler.ts` → `@holoscript/holo-vm` (`executor.ts`) | ✅ wired + e2e-tested to pixels (2026-06-05) |
| `.hsplus` | **Traits / brains** — declarative behavior authoring | uAAL handler-extension arch | parsed by `@holoscript/core` | ⚠️ parsed; native authoring coverage ~1.32% of traits |
| `.hs` | **Logic** — imperative/cognitive programs | **uAAL** (cognitive) | Rust/WASM grammar (`packages/compiler-wasm`); `.hs→Kotlin` emitter (2026-06-21) | ⚠️ grammar parses; emitter young; direct `.hs`→UAAL lowering remains unwired |

> **The load-bearing gap:** the cognitive runtime (`@holoscript/uaal`, 1,666 LOC, a real
> compiler + VM) still has an Intent-DSL compiler of its own, while the canonical
> parser bridge is only partially wired. Current reality: `holo compile --target uaal`
> exists for `.holo` compositions with behavior/action blocks and lowers through
> `UaalBehaviorCompiler` into `.uaal` bytecode. The remaining gap is direct
> `.hs`/`.hsplus` lowering to UAAL bytecode plus richer control-flow coverage. The pipeline
> `(.hs/.hsplus → uAA2++ compiler → UAAL bytecode → VM)` documented in
> [`../agents/uaal-vm.md`](../agents/uaal-vm.md) is therefore **partial**, not absent. See
> [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md).

## Provenance

- **Born:** `uaa2-service` (first commit 2025-10-30) as the **uAA2++ Standalone Service**.
- **Language conceived:** January 2026 as **uAAL** ("Universal Autonomous Agent Language",
  cognitive) + the **HOLO VM** (spatial). HoloScript's own first commit (2026-01-14) was
  literally *"Initial HoloScript repo with @holoscript/uaa2-client"* — HoloScript began as a
  client of uaa2-service.
- **Spec authored by:** Gemini-in-Antigravity (a peer family's tool), stored in that tool's
  knowledge store, **never graduated** to the shared git/GOLD/paper pipeline. This document is
  that graduation.
- **Reconciliation note:** the original spec is a genuine language definition but is concise
  (~155 lines across master-spec + instruction-set) and partly **mythologized** (opcodes like
  `OP_BECOME_SENTIENT`, `OP_COLLAPSE_WAVEFUNCTION`; "Omega Convergence" framing). The
  reclaimed [`uaal-language-spec.md`](./uaal-language-spec.md) separates the **real,
  implementable core** from the **aspirational** layer and maps each primitive to shipped code.
  Nothing here is ratified canon until reconciled against the code — the gap doc is that audit.

## Why this directory exists (the failure it closes)

The paper program produced ~40 application papers and three format-*named* papers
(P10 `.hs`, P11 `.hsplus`, P12 `.holo`) — but none of the three is a *specification* of its
format; all three are the same provenance-semiring theorem applied to three surfaces. The
actual language spec existed the whole time, stranded in a peer family's knowledge silo. This
directory reconnects the three silos that were never wired together: **spec** (was in Gemini
knowledge) ↔ **implementation** (TS packages) ↔ **papers** (ai-ecosystem `research/`).
See MEMORY P.017, D.104, D.105.
