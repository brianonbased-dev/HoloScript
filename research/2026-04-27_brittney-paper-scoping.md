---
date: 2026-04-27
type: research-scoping
status: pre-paper (NO paper slot allocated)
gate-status: ENGINEERING-NOT-READY (no SimulationContract grounding, no CAEL audit trail, no baseline benchmark)
authority: founder ruling 2026-04-27 (claude1 surface, ai-ecosystem session)
do-not-ship-as: paper without all 3 engineering gates closing first
---

# Brittney as Paper Candidate — Scoping Memo (NOT Paper 26 yet)

## REVISION 2026-04-27 18:30 PT — Reframe per founder

**Founder direct input (verbatim)**: "Brittney manages the Lotus Flower and
visually gardens the flower for the paper."

This **supersedes** the original framing below (SimulationContract grounding +
CAEL audit trail of generic scene mutations). The paper is no longer "Brittney
as a better LLM scene-editor"; the paper IS **"Brittney as the AI tender of a
visual representation of a 16-paper research program."**

The Lotus Flower (per `docs/strategy/lotus-architecture.md` + memory
`project_lotus-genesis-trigger.md`):
- **Roots** = parser, multi-target compiler, provenance semiring (substrate)
- **Stalk** = `.hs` / `.hsplus` / `.holo` / `.hs.md` (formats)
- **Petals** = 16 papers across Programs 1, 2, 3 (each a proof instrument)
- **Center** = Dumb Glass (rendering as contracted synthesis)

Brittney's job: **tend the garden**. Each petal has a bloom-state derived from
real evidence (commit hashes, benchmark presence, audit-matrix rows, anchor
status). Brittney CANNOT lie about a petal's bloom — the state is computed
from the actual research artifacts. Her tools edit the visualization to match
ground truth + suggest what evidence is needed for the next bloom.

**Why this framing is stronger** (vs the original SimulationContract grounding
on generic scenes):
1. **W.GOLD.001 Architecture beats alignment** — Brittney can't hallucinate a
   paper's bloom-state because the state is a pure function of repo evidence.
   Architecturally impossible to lie. This is the ideal demonstration of the
   Diamond claim on a user-visible surface.
2. **Self-referential and uniquely defensible** — there is no published prior
   work on "AI agents as living visualizers of long-horizon research programs
   tied to provenance evidence." The novelty is structural, not incremental.
3. **Demonstrates the WHOLE program** — Paper 26 becomes the meta-paper that
   visualizes Papers 1-25 maturing. Reviewer reading the paper SEES the
   program's empirical state through Brittney's eyes.
4. **Lotus Genesis Trigger alignment** (I.007) — the Lotus Flower
   visualization IS what fires when all 16 papers have real benchmarks. The
   paper writes itself as the bloom completes.

**Venue candidate (still no committed deadline per W.317)**: CHI 2028 (long
paper) or UIST 2027 (short paper). Final selection deferred until gate-3 data.
SIGGRAPH 2028 (Dumb Glass center paper) is the natural sibling — Paper 26
COULD be the application paper that demonstrates the Dumb Glass paper.

## Original framing (SUPERSEDED — kept for trace)

~~Brittney is NOT Paper 26 today. She is paper-able as the user-facing
demonstration of [Algebraic Trust](D:/GOLD/wisdom/w_gold_188.md) (W.GOLD.188 +
W.GOLD.189) IF AND ONLY IF SimulationContract grounding + CAEL audit trail are
wired into the request loop. Without that, the paper has no defensible novelty
beyond published "LLM-with-scene-context" work and would fail [F.029
scaffold-existence ≠ defensibility](C:/Users/josep/.claude/projects/C--Users-josep--ai-ecosystem/memory/feedback_apply-four-refusals-to-own-analysis.md).~~

The original framing was technically correct (SimContract grounding would
have been a paper) but TARGETED THE WRONG SCENE. The supersession above
moves Brittney from "tool that mutates generic scenes safely" to "tender of
the Lotus Flower visualization." Both framings can co-exist (SimContract
grounding still useful for generic scene editing) but Paper 26 = Lotus tender.

**Slot status**: scoping memo only. No paper number assigned. No venue declared.
No deadline surfaced (per [W.317 date discipline](research/2026-04-27_martinis-nobel-quantum-system-engineering.md) — engineering readiness is ❌ across all 5 W.310-W.317 columns; no matrix row exists; refusal to surface a date until at least one gate closes).

## What's actually shipped today

Verified [packages/studio/src/app/api/brittney/route.ts](packages/studio/src/app/api/brittney/route.ts) on 2026-04-27:

| Capability | Where | Status |
|---|---|---|
| Spatial-native chat with scene-context injection | [route.ts:138](packages/studio/src/app/api/brittney/route.ts:138) — `buildContextualPrompt(sceneContext)` | ✅ shipped |
| Four-toolset orchestration in single loop | [route.ts:31-53](packages/studio/src/app/api/brittney/route.ts:31) — `BRITTNEY_TOOLS + STUDIO_API_TOOLS + MCP_TOOLS + SIMULATION_TOOLS` | ✅ shipped |
| Bounded tool rounds (5) | [route.ts:158](packages/studio/src/app/api/brittney/route.ts:158) — `MAX_TOOL_ROUNDS = 5` | ✅ shipped |
| Streaming with 16K tokens (safe boundary) | [route.ts:187-191](packages/studio/src/app/api/brittney/route.ts:187) — `stream: true` | ✅ shipped, comment correctly explains the SDK timeout boundary |
| Production gating (auth + rate-limit + credits) | [route.ts:65-136](packages/studio/src/app/api/brittney/route.ts:65) | ✅ shipped |

## What the doctrine claims that has NO implementation

From [docs/agents/studio-first-agents.md](docs/agents/studio-first-agents.md):

| Claim | Reality | F.029 violation? |
|---|---|---|
| "Project memory and taste accumulates around Brittney" | No persistence layer in route.ts; each request stateless beyond `messages` array | YES — claim has zero implementation hook |
| "Spatial understanding accumulates" | No embedding store, no scene-history, no learning loop | YES — pure aspiration |
| Polyglot output across .holo/.hsplus/.hs/TS/Python (per 20-day-old project memory) | Unverified — needs `BrittneyTools.ts` audit | UNVERIFIED |

## The framing that survives /critic

Three candidate framings, ruled in order of strength:

### ❌ REJECTED: "Scene-grounded prompt context yields measurable accuracy lift"
- CHI/IUI flavor, weakest framing.
- Already published widely in adjacent literature (Voyager, MineDojo, MultiPLY, Cradle).
- Reviewer pushback: "Why not just use any of the existing scene-grounded LLM frameworks?"

### ❌ REJECTED: "Four-toolset agentic orchestration outperforms single-toolset"
- UIST flavor, engineering-paper.
- Tool-orchestration papers are a saturated subgenre at UIST 2024-2026.
- Reviewer pushback: "What's the principled selection? Why these four toolsets and not three or five?"

### ❌ REJECTED: "Polyglot format dispatch reduces task-completion time"
- PLDI/OOPSLA flavor.
- Premature — polyglot is unverified-aspirational. Cannot frame around a feature that may not exist.

### ✅ STRONGEST: "Architecturally-grounded AI creation: every mutation routes through SimulationContract verification + CAEL audit trail, evaluated against unverified-baselines on creation-completion + post-hoc safety-check pass-rate"

- **Connects to Diamond GOLD**:
  - W.GOLD.001 Architecture beats alignment — Brittney becomes the user-facing demonstration. Safety-by-construction not safety-by-asking.
  - W.GOLD.188 + W.GOLD.189 Algebraic Trust tri-layer — Brittney's outputs are tractable through algebra (SimulationContract) + history (CAEL audit) + oracle (LLM judgment). All three layers measurable.
- **Reviewer-defensible**: every claim becomes a measurable. "Did the scene mutation pass SimulationContract?" — binary, replayable, verifiable.
- **Venue match**: CHI/UIST 2027-2028 for the user-study angle; IUI 2027-2028 for the architecture-grounded-LLM angle. Final venue selection deferred until gate-3 (baseline benchmark) data lands.

## REVISED Engineering gates (post-Lotus reframe)

### Gate 1 (REVISED) — Lotus Flower seed scene + bloom-state derivation utility
**Why**: Brittney can't tend a garden that doesn't exist. The first concrete
artifact must be (a) the .holo scene defining the Lotus and (b) the pure
function that derives each petal's bloom-state from real evidence. The
derivation function is the **algebraic-trust hook** — Brittney's mutations
must agree with it, and any disagreement is detectable architecturally.

**What to build (this gate)**:
1. `examples/lotus-flower/garden.holo` — seed scene with 16 petal nodes,
   stalk segments, root nodes, and the Dumb Glass center node. Spatial
   layout per the lotus-architecture.md ASCII diagram.
2. `packages/studio/src/lib/brittney/lotus/derive-bloom-state.ts` — pure
   function `derivePetalBloomState(paperId, evidence) → BloomState` where
   `BloomState ∈ {sealed | budding | blooming | full | wilted}`.
3. Unit tests covering all 5 bloom-state outcomes against fixture evidence.

**Acceptance**: Scene file parses through `@holoscript/core`. Derivation
function pure (no I/O), tested across all 5 outcomes, with fixture data that
mirrors the actual paper-audit-matrix.md row schema.

**Status (2026-04-27 commit pending)**: Built this session as Gate 1 seed.

### Gate 2 (REVISED) — Lotus tools wired into Brittney + system prompt
**Why**: Brittney needs LOTUS_TOOLS (`bloom_petal`, `wilt_petal`,
`read_garden_state`, `tend_garden`, `propose_evidence`) wired into route.ts.
Tools must REJECT mutations that don't agree with derivePetalBloomState's
output. This is the architectural-trust enforcement.

**Where to wire**:
- New file `packages/studio/src/lib/brittney/lotus/LotusTools.ts` defining the tool schemas + executors.
- Append to [route.ts:31-53](packages/studio/src/app/api/brittney/route.ts:31) `convertToolsToClaudeFormat()`.
- Update [systemPrompt.ts](packages/studio/src/lib/brittney/systemPrompt.ts) to teach Brittney about the garden.

**Acceptance**: Brittney can be asked "what's the state of Paper 11?" and
respond with the derived bloom-state + the evidence backing it. Asking her
to "bloom Paper 11" with no evidence returns is_error and an explanation.

### Gate 3 (REVISED) — Live garden tending against ai-ecosystem
**Why**: The eval that survives review: human curator tends the garden by
hand for N=10 paper-program updates, then Brittney tends the same updates
autonomously. Compare bloom-state agreement rate, evidence-citation accuracy,
and time-to-correct-state.

**What to build**:
- Snapshot the ai-ecosystem `paper-audit-matrix.md` at 10 historical commits.
- For each snapshot, compute the human-baseline bloom-state for all 16 petals.
- Run Brittney's `tend_garden` against each snapshot.
- Measure agreement rate (per-petal, per-snapshot) + median time-to-tend.

**Acceptance**: Per-petal agreement ≥ 90% (one-petal disagreement allowed
out of 16); median tend time ≤ 30s. Markdown report committed.

## What's already shipped this session (Gate 1 seed)

- This memo update reflecting the Lotus reframe.
- (Coming in same commit) `examples/lotus-flower/garden.holo` seed scene.
- (Coming in same commit) `derive-bloom-state.ts` utility + unit tests.

## Out of scope for THIS memo (do NOT bundle)

- User study (N≥10 humans) — wait for gate-3 quant data first; user study is gate-4 in a future memo.
- Polyglot output benchmarks — verify polyglot is actually wired in [BrittneyTools.ts](packages/studio/src/lib/brittney/BrittneyTools.ts) before scoping. Separate scoping memo.
- IRB protocol design — premature; only relevant after the user-study scope is set.
- Venue final selection + deadline commit — refused per W.317 date discipline. Surface ONLY when gate-3 data shows ≥1 measurable lift over baselines.
- Editor contact — none. I.009 TVCG-revision-1 is already HELD; Paper 26 has no editor contact path until founder-explicit.

## Connection to existing program

Brittney's framing **slots between**:
- Paper 22 (Mechanized SimulationContract → CAV/FM) — supplies the verification primitive Brittney's gate-1 wires.
- Paper 23 (Formal Semantics of HoloScript Core → POPL/TyDe) — supplies the trait-composition formal foundation Brittney generates against.
- Paper 17 (SESL training → MLSys) — provides the per-domain SESL embeddings Brittney's scene-context could use (currently doesn't).
- Paper 18 (Motion-SESL) — provides motion/animation primitives Brittney's BRITTNEY_TOOLS could call (currently doesn't).

Brittney as Paper 26 = **the application paper** that demonstrates Papers 17 + 22 + 23 in a single user-facing surface. This sequencing is INTENTIONAL: the application paper benefits from the foundational papers being already-cited.

## When to reconvene

After ALL three engineering gates close, reconvene this memo and either:
1. Promote to Paper 26 slot allocation in `paper-audit-matrix.md` (with W.317-compliant date + 5 readiness columns).
2. Or, if gate data shows weak/null lift over baselines, archive this memo to `research/archive/` with a "negative result" note.

## Anti-citations (per F.023)

Do NOT cite the following — they are wrong / drifted / different entry:
- W.GOLD.044 — that's Affective Causality Pattern, NOT trust. The trust framing is W.GOLD.188 + W.GOLD.189 (per founder skill anti-citation explicit warning).
- "Brittney is novel because she has tool use" — saturated subgenre; novelty must be in the architectural grounding, not the tool-use mechanism.
- 20-day-old [project_brittney-polyglot.md](C:/Users/josep/.claude/projects/C--Users-josep--ai-ecosystem/memory/project_brittney-polyglot.md) — VERIFY before citing the polyglot claim; memory may be stale.

## Provenance

- Authored: claude1 surface (Claude Opus 4.7, ai-ecosystem session)
- Founder ruling: 2026-04-27, applied directly per skill output discipline
- Verification basis: live read of [route.ts](packages/studio/src/app/api/brittney/route.ts) + [studio-first-agents.md](docs/agents/studio-first-agents.md) on 2026-04-27
- Date discipline: W.317 — no bare dates, all blockers named, engineering readiness ❌ acknowledged
- F.029 + F.030 + F.031 applied to OWN analysis — refusing to scope an aspirational paper
