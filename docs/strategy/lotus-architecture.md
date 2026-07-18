# The Lotus: One Architecture, Sixteen Papers, One Stack

> **Current-state boundary (2026-07-18).** This is a target architecture, not a
> shipped-capability inventory. Paper 0c currently provides hash-linked event
> recording and bounded `step`/`solve` replay, not full agent or world-mutation
> replay. Paper 13 currently provides a narrow CPU provenance-hashing slice; no
> validated GPU benchmark, full per-pixel provenance chain, or cross-backend
> bit identity exists. Lotus bloom state is a structural paper-readiness proxy,
> not empirical truth about the papers' claims.

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
> the founder-research memo
> `.ai-ecosystem/research/2026-04-17_program-3-stalk-center-scoping.md`.

---

## One line

**Target:** make every rendered output traceable through declared scene inputs
back to the source notation that produced it. End-to-end per-pixel provenance
remains an acceptance criterion, not a current result.

---

## The lotus

Imagine a lotus flower.

The **roots**, hidden under water, are the substrate: a parser, a multi-target
compiler, and a proposed provenance algebra. Parser and compiler paths exist;
their end-to-end composition into a verified rendering chain remains work.

The **stalk** that rises from the roots is a family of formats — `.hs`,
`.hsplus`, `.holo`, and their documentation sibling `.hs.md`. The target is for
each compiled output to carry a verifier-visible relationship to its source;
that relationship is not yet proven uniformly across formats and targets.

The **flower** at the top has many petals. Each petal is a projection — a contracted derivation of scene state. One petal is physics simulation; another is animation; another is UI layout; another is AI-generated motion; another is forensic-evidence export. A flower with many petals but the same stalk.

The **center** of the flower, where the petals meet, is the proposed Dumb Glass
rendering boundary. Its acceptance target is a renderer that receives declared
upstream semantics and emits independently checkable provenance. The current
Paper 13 path does not yet prove that property per pixel or on GPU.

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

The lotus proposes to address all three by making trust a compositional property
of the architecture, not a runtime check applied after the fact. Making sync
bugs unrepresentable, bounding cross-platform divergence, and tracing generated
outputs through model and data provenance are program acceptance criteria; they
are not established by the current paper-readiness matrix.

The trace is not a feature you add. It is the architecture you choose.

## Sixteen papers, three programs, one stack

The program uses papers across three campaigns as proposed **proof instruments**
for specific subsystems. Implementation and evidence maturity vary by paper;
structural readiness does not establish that a subsystem works under contract.

### Program 1 — The first petals (8 papers, in flight)

The simulation and agent-side petals. Physics, spiking neural networks, agent loops, collaborative state, security sandboxing, codebase intelligence, tool-use trust, and their compositional capstone.

- `Trust by Construction: Provenance-Native Simulation Contracts` — IEEE TVCG, submitted
- `CAEL: Causal Agent-Environment Loops` — AAMAS 2027 target (NOT SUBMITTED)
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

If you read one paper, read _Trust by Construction_ (TVCG) — it establishes the provenance semiring as the architectural commitment. If you read three, add _Unified Sim+Anim_ (SIGGRAPH '27) for the sync-bug-as-unrepresentability proof, and _Dumb Glass_ (SIGGRAPH '28, not yet submitted) for the full lotus. Every other paper is a petal — important, but a specialization of what those three establish.

## What is not a paper

Several things in the stack are real, shipped, and deliberately not papers.

- **The Absorb service** — a GraphRAG-backed codebase intelligence platform, live at `absorb.holoscript.net`. The codebase-intelligence paper (`Provenance-Backed Codebase Intelligence`) covers the theory; the service itself is product.
- **HoloMesh** — a decentralized mesh for AI agent coordination, live at `mcp.holoscript.net/api/holomesh`. The CRDT collaboration paper covers the theory; the mesh is where agents actually coordinate.
- **Studio** — the web-based authoring environment, live at `holoscript.studio`. Supports all four stalk formats; no single paper attempts to cover an entire authoring product.
- **Bounty teams, spatial IDE, characters-as-code, games** — designed and partially implemented. Held behind the directive filter _"what ships now opens a door."_ The first external human through Absorb and the first external agent through HoloMesh come first. These follow.

## What the lotus commits the program to

One claim, articulated and defended across sixteen papers: **trust is a property of an architecture, not a feature added on top of one.**

If the lotus gates close, the intended consequences include independently
checkable simulation replay, evidence-bound reconstruction, long-lived digital
twin audit trails, provenance-aware generated motion, and accountable shared
agent state. Bit-identical replay and causal explanation require separate
hardware, state-oracle, and intervention evidence; the architecture diagram
does not establish them.

None of these applications is exotic. All of them are blocked today because the trust-of-process problem is unsolved. The lotus is a bet that solving it at the architectural level opens a set of verticals that soft-loss models and whole-file hashing cannot.

## When this goes public

This document publishes when Paper Program 2 Wave 1 (SCA / I3D / SIGGRAPH) accepts. Until then, the public narrative is `Trust by Construction` alone — a single simulation-contracts paper with a clear novelty claim and a working implementation. The full sixteen-paper architecture stays internal because publishing it now would:

1. Advertise the pixel-provenance direction to groups who could scoop the P3-CENTER paper with an approximate-but-faster implementation.
2. Dilute the _Trust by Construction_ message by making it look like a small part of a sprawling program rather than the load-bearing first move.
3. Commit the team to a timeline that includes papers not yet submitted, creating unnecessary external accountability pressure on wave timing.

After Wave 1 acceptance, the calculus inverts. Publishing the full architecture reinforces the _Trust by Construction_ paper's academic weight (it becomes visibly the first paper of a coherent program) and makes subsequent submissions easier for reviewers to contextualize. The flower is most beautiful the moment after the first petal unfolds in public, not the moment it is still a bud.

## One line, again

**Target:** one architecture in which rendered outputs can be traced through
their declared projections to source. The current implementation has not yet
closed the per-pixel or cross-backend proof gates.

---

## Appendix: Historical program state

The table below preserves the 2026-04-17 planning snapshot. It is not current
submission, implementation, or empirical-evidence truth. Use the canonical
paper matrix and claim-bound receipts for current decisions.

| Program | Papers                    | Stage                             | Venue timing                                    |
| ------- | ------------------------- | --------------------------------- | ----------------------------------------------- |
| 1       | Trust by Construction     | Submitted                         | IEEE TVCG 2026                                  |
| 1       | 7 petal papers            | Drafts ready                      | AAMAS / USENIX / NeurIPS / ECOOP / ICSE 2026–27 |
| 1       | Capstone                  | Complete draft                    | UIST 2027                                       |
| 2       | P2-0 Contracted Animation | Skeleton                          | SCA 2027 (submit Dec 2026)                      |
| 2       | P2-1 IK Under Contract    | Skeleton                          | SIGGRAPH 2027 short (submit Jan 2027)           |
| 2       | **P2-2 Unified Sim+Anim** | **Skeleton + intro + §2 drafted** | **SIGGRAPH 2027 (submit May 2027)**             |
| 2       | P2-3 Verifiable Motion    | Skeleton                          | SIGGRAPH Asia 2027                              |
| 3       | P3-S1 `.hs` Core IR       | Skeleton                          | PLDI 2027 (submit Nov 2026)                     |
| 3       | P3-S2 `.hsplus` Traits    | Skeleton                          | ECOOP 2027 (submit Feb 2027)                    |
| 3       | P3-S3 `.holo` Composition | Skeleton                          | I3D 2027 (submit Nov 2026)                      |
| 3       | **P3-CENTER Dumb Glass**  | **Skeleton**                      | **SIGGRAPH 2028 (submit Jan 2028)**             |

**Current routing:** canonical manuscripts, novelty cards, and the paper matrix
live under `.ai-ecosystem/research/`. The generated readiness snapshot at
`docs/public/papers-status.json` is structural only; it is not empirical claim
evidence.
