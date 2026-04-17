# The Lotus: One Architecture, Sixteen Papers, One Stack

> **STATUS: DRAFT — DO NOT PUBLISH.**
> **Embargo:** hold until Paper Program 2 Wave 1 is formally accepted.
> Expected lift: Spring 2027 (SCA / I3D decisions).
> **Rationale for embargo:** the pixel-provenance novelty claim in
> `P3-CENTER` is the strongest in the program. Releasing this public
> framing before Wave 1 accepts gives competitors a 12-month head
> start on the same architectural direction. Reveal the building
> after the first door is installed.
> **Committed by:** antigravity-seed on behalf of @brianonbased-dev,
> 2026-04-17. Ratified by decision #4 of
> [Program 3 scoping memo](../../../.ai-ecosystem/research/2026-04-17_program-3-stalk-center-scoping.md).

---

## One line

**HoloScript is the first spatial computing stack where every pixel on screen can be traced algebraically back to the source notation that produced it.** The trace is not metadata. It is the architecture.

---

## The lotus

Imagine a lotus flower.

The **roots**, hidden under water, are the substrate: a parser, a multi-target compiler, and a provenance semiring — the algebra that makes trust composable. These already exist; they have been running in shipped code since 2025.

The **stalk** that rises from the roots is a family of formats — `.hs`, `.hsplus`, `.holo`, and their documentation sibling `.hs.md`. Each is a declarative language with formal semantics. Each carries the provenance semiring as a first-class semantic feature. A compiled output of any of these formats stands in an algebraic relationship to its source.

The **flower** at the top has many petals. Each petal is a projection — a contracted derivation of scene state. One petal is physics simulation; another is animation; another is UI layout; another is AI-generated motion; another is forensic-evidence export. A flower with many petals but the same stalk.

The **center** of the flower, where the petals meet, is rendering. Every petal converges here. A pixel on screen is not a rendering decision; it is the algebraic synthesis of every contracted projection that contributed to it, composed through the provenance semiring, emerging through Dumb Glass — a renderer that performs zero semantic interpretation because all interpretation already happened upstream.

```
                    ┌─ Animation ─────┐
                    ├─ IK ────────────┤
                    ├─ Sim ───────────┤
                    ├─ SNN ───────────┤
                    ├─ Agent loop ────┤ ← PETALS (each a proof)
                    ├─ CRDT ──────────┤
                    ├─ Sandbox ───────┤
                    ├─ GraphRAG ──────┤
                    ├─ MCP tool use ──┤
                    ├─ AI motion ─────┤
                    ├─ UI (future) ───┤
                    └─ Evidence (fut) ┘
                             │
                             ▼
                  ╔════════════════════╗
                  ║    THE CENTER      ║
                  ║  Dumb Glass        ║
                  ║  Rendering as      ║
                  ║  Contracted        ║
                  ║  Synthesis         ║
                  ╚════════════════════╝
                             │
                     ━━━ STALK ━━━
                     .hs       core IR
                     .hsplus   reactive + traits
                     .holo     scene composition
                     .hs.md    knowledge docs
                             │
                     ━━━ ROOTS ━━━
                     parser · compiler ·
                     provenance semiring
```

## Why this matters

Three things in modern spatial computing have resisted a clean architectural answer, and all three come from the same root cause.

**First, sync bugs.** Unity's `AnimatePhysics` update mode, Unreal's Chaos + AnimBP synchronization failure, Ubisoft's AnvilNext one-frame lag between physics and animation — these are not implementation errors. They are inevitable symptoms of an architecture that runs animation and physics as parallel pipelines with no shared source of truth.

**Second, irreproducibility.** The same scene rendered on Chromium, Firefox, and Safari produces three slightly different images. The same simulation run on NVIDIA and AMD GPUs diverges after a few seconds. For entertainment this is tolerable. For surgical rehearsal, forensic reconstruction, and regulated digital twins, it is disqualifying.

**Third, AI opacity.** Generative motion models produce plausible-looking but physically impossible animations. Large language models generate code whose training-data provenance is unknowable. An AI tool outputs a decision that cannot be traced back to why.

The lotus addresses all three by making trust a compositional property of the architecture, not a runtime check applied after the fact. Sync bugs become unrepresentable because animation and physics write into the same transform graph under one hash. Cross-platform divergence becomes bounded because every compilation target's output is algebraically related to the source. AI opacity becomes auditable because every generated output carries a chain of hashes back through training data, through model checkpoint, to the original source code or dataset.

The trace is not a feature you add. It is the architecture you choose.

## Sixteen papers, three programs, one stack

The program that proves the lotus works is sixteen papers across three campaigns. Each paper is a **proof instrument** for a specific subsystem that has already shipped in code. The papers don't propose new software. They prove existing software works under contract.

### Program 1 — The first petals (8 papers, in flight)

The simulation and agent-side petals. Physics, spiking neural networks, agent loops, collaborative state, security sandboxing, codebase intelligence, tool-use trust, and their compositional capstone.

- `Trust by Construction: Provenance-Native Simulation Contracts` — IEEE TVCG, submitted
- `CAEL: Causal Agent-Environment Loops` — AAMAS 2026
- `Trust by Replay: Hash-Verified MCP Tool Use` — USENIX Security 2026
- `Browser-Native Spiking Neural Networks` — NeurIPS 2026
- `Conflict-Free Spatial State (CRDT)` — ECOOP 2027
- `Sandboxed Embodied Simulation` — USENIX Security 2026
- `Provenance-Backed Codebase Intelligence (GraphRAG)` — ICSE 2027
- `From Notation to Cognition (capstone)` — UIST 2027

### Program 2 — The animation petals (4 papers, skeletons drafted)

The animation petals. Retargeting, inverse kinematics, unified sim+anim synthesis, and AI-generated motion under plausibility contract.

- `Contracted Animation: Hash-Verified Retargeting` — SCA 2027
- `IK Under Contract` — SIGGRAPH 2027 short / I3D 2027
- `Unified Sim+Anim: Provenance Across the Transform Graph` — **SIGGRAPH 2027** (thesis paper)
- `Verifiable Motion: Provenance for AI-Generated Animation` — SIGGRAPH Asia 2027

### Program 3 — The stalk and the center (4 papers, skeletons drafted)

The formats themselves, and the rendering synthesis that brings every petal together.

- `HoloScript Core (.hs): A Contracted Compilation IR` — PLDI 2027
- `HoloScript+ (.hsplus): Reactive State and Interaction Traits` — ECOOP 2027
- `HoloScript Composition (.holo): Scene-Centric Semantics with Plugin Extension` — I3D 2027
- `Dumb Glass: Rendering as Contracted Synthesis of Projections` — **SIGGRAPH 2028** (center paper)

### Reading order for humans

If you read one paper, read *Trust by Construction* (TVCG) — it establishes the provenance semiring as the architectural commitment. If you read three, add *Unified Sim+Anim* (SIGGRAPH '27) for the sync-bug-as-unrepresentability proof, and *Dumb Glass* (SIGGRAPH '28, not yet submitted) for the full lotus. Every other paper is a petal — important, but a specialization of what those three establish.

## What is not a paper

Several things in the stack are real, shipped, and deliberately not papers.

- **The Absorb service** — a GraphRAG-backed codebase intelligence platform, live at `absorb.holoscript.net`. The codebase-intelligence paper (`Provenance-Backed Codebase Intelligence`) covers the theory; the service itself is product.
- **HoloMesh** — a decentralized mesh for AI agent coordination, live at `mcp.holoscript.net/api/holomesh`. The CRDT collaboration paper covers the theory; the mesh is where agents actually coordinate.
- **Studio** — the web-based authoring environment, live at `studio.holoscript.net`. Supports all four stalk formats; no single paper attempts to cover an entire authoring product.
- **Bounty teams, spatial IDE, characters-as-code, games** — designed and partially implemented. Held behind the directive filter *"what ships now opens a door."* The first external human through Absorb and the first external agent through HoloMesh come first. These follow.

## What the lotus commits the program to

One claim, articulated and defended across sixteen papers: **trust is a property of an architecture, not a feature added on top of one.**

If the lotus holds, the practical consequences follow immediately. Surgical-rehearsal systems can replay a simulation and know the replay is bit-identical to the original. Forensic-reconstruction tools can certify that a digital recreation derives from specific evidence inputs. Industrial digital twins can operate for months of continuous simulation and produce an audit trail a regulator can verify in finite time. Generative motion models can be deployed in regulated pipelines because their outputs carry provenance back to training data. AI agents can coordinate on shared spatial state and prove, after the fact, why each of them made the decision it made.

None of these applications is exotic. All of them are blocked today because the trust-of-process problem is unsolved. The lotus is a bet that solving it at the architectural level opens a set of verticals that soft-loss models and whole-file hashing cannot.

## When this goes public

This document publishes when Paper Program 2 Wave 1 (SCA / I3D / SIGGRAPH) accepts. Until then, the public narrative is `Trust by Construction` alone — a single simulation-contracts paper with a clear novelty claim and a working implementation. The full sixteen-paper architecture stays internal because publishing it now would:

1. Advertise the pixel-provenance direction to groups who could scoop the P3-CENTER paper with an approximate-but-faster implementation.
2. Dilute the *Trust by Construction* message by making it look like a small part of a sprawling program rather than the load-bearing first move.
3. Commit the team to a timeline that includes papers not yet submitted, creating unnecessary external accountability pressure on wave timing.

After Wave 1 acceptance, the calculus inverts. Publishing the full architecture reinforces the *Trust by Construction* paper's academic weight (it becomes visibly the first paper of a coherent program) and makes subsequent submissions easier for reviewers to contextualize. The flower is most beautiful the moment after the first petal unfolds in public, not the moment it is still a bud.

## One line, again

**HoloScript is the first spatial computing stack where every pixel on screen can be traced algebraically back to the source notation that produced it.** Sixteen papers. Three programs. One architecture.

---

## Appendix: Current program state

| Program | Papers | Stage | Venue timing |
|---|---|---|---|
| 1 | Trust by Construction | Submitted | IEEE TVCG 2026 |
| 1 | 7 petal papers | Drafts ready | AAMAS / USENIX / NeurIPS / ECOOP / ICSE 2026–27 |
| 1 | Capstone | Complete draft | UIST 2027 |
| 2 | P2-0 Contracted Animation | Skeleton | SCA 2027 (submit Dec 2026) |
| 2 | P2-1 IK Under Contract | Skeleton | SIGGRAPH 2027 short (submit Jan 2027) |
| 2 | **P2-2 Unified Sim+Anim** | **Skeleton + intro + §2 drafted** | **SIGGRAPH 2027 (submit May 2027)** |
| 2 | P2-3 Verifiable Motion | Skeleton | SIGGRAPH Asia 2027 |
| 3 | P3-S1 `.hs` Core IR | Skeleton | PLDI 2027 (submit Nov 2026) |
| 3 | P3-S2 `.hsplus` Traits | Skeleton | ECOOP 2027 (submit Feb 2027) |
| 3 | P3-S3 `.holo` Composition | Skeleton | I3D 2027 (submit Nov 2026) |
| 3 | **P3-CENTER Dumb Glass** | **Skeleton** | **SIGGRAPH 2028 (submit Jan 2028)** |

**Source of truth for paper state:** `.ai-ecosystem/research/` (all `.tex` files) and the three scoping memos dated 2026-04-12 and 2026-04-17. Grep for `\todo{` and `\stub{` to find what's drafted vs. scaffolded at any time.
