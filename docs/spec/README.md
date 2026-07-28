# HoloScript Language Specification

> **Status (2026-07-23): stratum taxonomy ratified and three-surface closure gated.**
> This directory is the canonical home of
> the HoloScript language specification, now topped by
> [`language-architecture.md`](./language-architecture.md) — the ratified three-strata
> taxonomy that scopes every other doc here. Its historical core — the reclaimed uAAL/HOLO
> definition — was authored in **January 2026** but lived only in a Gemini/Antigravity
> knowledge silo (`~/.gemini/antigravity/knowledge/uaa2_language_evolution_and_uaal/`), never
> committed to a repo, reclaimed 2026-06-22. See [Provenance](#provenance).

## What lives here

| File                                                                                                     | What it is                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`language-architecture.md`](./language-architecture.md)                                                 | **The ratified top of the language canon (2026-07-17)**: three strata — ① surface (the three formats) · ② meaning (**HoloMeaning**, `@holoscript/meaning`, defined once) · ③ execution (uAAL cognitive VM + HOLO VM). Bans bare "uAAL" as a language name; gate `check:language-strata --strict`. Every doc below is scoped by it.                                                               |
| [`language-identity.md`](./language-identity.md)                                                         | The canonical category and wording contract: general-purpose semantic systems programming language, current honesty boundary, and systems-language acceptance gates.                                                                                                                                                                                                                             |
| [`holoscript-grammar-ssot.md`](./holoscript-grammar-ssot.md)                                             | The accepted-grammar router: parser-backed sources only, plus the conformance test that keeps `get_syntax_reference` examples aligned with the production parser path.                                                                                                                                                                                                                           |
| [`three-surface-semantic-closure.md`](./three-surface-semantic-closure.md)                               | The executable `.holo` + `.hsplus` + `.hs` product contract: causal bindings, canonical diagnostics, per-construct semantic stages, strict receipt rules, and demonstrated limits.                                                                                                                                                                                                               |
| P10 `.hs`, P11 `.hsplus`, P12 `.holo` (canonical drafts: `ai-ecosystem/research/paper-{10,11,12}-*.tex`) | Subordinate **vision/design papers**: roadmap-generating language arguments written in `target`, `formal`, `observed`, and `gap` registers. They may describe the intended fixed point beyond current implementation, but they are not syntax specifications or capability inventories. See [`language-architecture.md` §1.1](./language-architecture.md#11-document-roles-and-claim-registers). |
| [`uaal-language-spec.md`](./uaal-language-spec.md)                                                       | The reclaimed uAAL (cognitive) + HOLO (spatial) language definition: primitives, instruction set, and a **real-vs-aspirational** reconciliation with the shipped code.                                                                                                                                                                                                                           |
| [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md)                                                     | The language-build backlog: each spec claim mapped to its actual code status (shipped / island / absent), with the seam that would close it.                                                                                                                                                                                                                                                     |
| [`motivation-trait.md`](./motivation-trait.md)                                                           | (pre-existing) trait-level spec note.                                                                                                                                                                                                                                                                                                                                                            |

Related existing docs (do not duplicate): [`../agents/uaal-vm.md`](../agents/uaal-vm.md) (VM API),
`../packages/uaal.md`, `../packages/holo-vm.md` (package docs).

## The three-format model

HoloScript is a **general-purpose semantic systems programming language in three surfaces**
(MEMORY F.120), all descending from the uaa2-service genesis. The table records current
implementation strengths; it does not define a permanent set of domains:

| Format    | Strongest role                                                                                                                            | Canonical authority                                                                      | Demonstrated closure                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.holo`   | Whole-system composition, worlds, events, effects, and orchestration                                                                      | `HoloCompositionParser`; spatial `HolobCompiler`; behavioral `UaalBehaviorCompiler`      | ✅ spatial render path plus executable event/action behavior, typed action parameters, and observable VM effects                                                       |
| `.hsplus` | TypeScript-like typed semantic programs: reusable behavior, traits, reactive state, effects, pipelines, applications, devices, and agents | preprocessing + `HoloScriptPlusParser`; specialized runtimes/compiler paths by construct | ✅ broad parser/authoring surface; strict brain projection, deterministic cognition/reflection, and frame enforcement are the currently receipt-closed tracer vertical |
| `.hs`     | Deterministic typed policy and systems logic                                                                                              | Rust/WASM grammar and shared semantic type pass                                          | ✅ conservative typed subset lowers to UAAL and executes natively with parity; broader language coverage remains active work                                           |

> **The load-bearing gap has narrowed, not disappeared.** The checked-in
> [`three-surface-agent`](../../examples/three-surface-agent/) now proves one causal
> `.holo → .hsplus → .hs → .holo` product with a construct-complete HoloMeaning
> receipt. Direct whole-document `.hsplus` lowering, general `.hs` coverage,
> recursive `.holo` parameter frames, and formal cross-target preservation remain
> open. See [`three-surface-semantic-closure.md`](./three-surface-semantic-closure.md)
> and [`spec-vs-reality-gap.md`](./spec-vs-reality-gap.md).

## Provenance

- **Born:** `uaa2-service` (first commit 2025-10-30) as the **uAA2++ Standalone Service**.
- **Language conceived:** January 2026 as **uAAL** ("Universal Autonomous Agent Language",
  cognitive) + the **HOLO VM** (spatial). HoloScript's own first commit (2026-01-14) was
  literally _"Initial HoloScript repo with @holoscript/uaa2-client"_ — HoloScript began as a
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

The paper program produced ~40 application papers and three format-_named_ papers
(P10 `.hs`, P11 `.hsplus`, P12 `.holo`). None is a _specification_ of its
format. They are vision/design papers whose job is to propose and pressure-test
the formats' desired fixed points; their `observed` claims still bind to current
artifacts. The actual language spec existed the whole time, stranded in a peer
family's knowledge silo. This directory reconnects the three silos that were
never wired together: **spec** (was in Gemini knowledge) ↔ **implementation**
(TS packages) ↔ **papers** (ai-ecosystem `research/`).
See MEMORY P.017, D.104, D.105.
