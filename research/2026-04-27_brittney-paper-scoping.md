---
date: 2026-04-27
type: research-scoping
status: pre-paper (NO paper slot allocated)
gate-status: ENGINEERING-NOT-READY (no SimulationContract grounding, no CAEL audit trail, no baseline benchmark)
authority: founder ruling 2026-04-27 (claude1 surface, ai-ecosystem session)
do-not-ship-as: paper without all 3 engineering gates closing first
---

# Brittney as Paper Candidate — Scoping Memo (NOT Paper 26 yet)

## Founder ruling 2026-04-27

**Brittney is NOT Paper 26 today.** She is paper-able as the user-facing
demonstration of [Algebraic Trust](D:/GOLD/wisdom/w_gold_188.md) (W.GOLD.188 +
W.GOLD.189) IF AND ONLY IF SimulationContract grounding + CAEL audit trail are
wired into the request loop. Without that, the paper has no defensible novelty
beyond published "LLM-with-scene-context" work and would fail [F.029
scaffold-existence ≠ defensibility](C:/Users/josep/.claude/projects/C--Users-josep--ai-ecosystem/memory/feedback_apply-four-refusals-to-own-analysis.md).

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

## Engineering gates (all 3 must close before Paper 26 declaration)

### Gate 1 — SimulationContract grounding in Brittney route
**Why**: Scene mutations today are unverified — Brittney emits them, the user accepts or rejects them visually. The paper needs every mutation to route through SimulationContract for binary pass/fail verification.

**Where to wire**: [route.ts:215-219](packages/studio/src/app/api/brittney/route.ts:215) — after `currentToolName` resolves, before `pendingToolCalls.push`. Each scene-mutation tool call should pre-validate against the current scene's SimulationContract.

**Acceptance**: 100% of `BRITTNEY_TOOLS` scene-mutation calls (BRITTNEY_TOOLS subset, not all four toolsets) emit a `simContractCheck` event with `{passed: bool, contractId, mutation, reason?}` to the SSE stream.

### Gate 2 — CAEL audit trail per toolset call
**Why**: Algebraic Trust's history layer requires a durable audit log. Brittney has none today. CAEL exists (per S.ANC) but is not wired into the chat path.

**Where to wire**: [route.ts:178](packages/studio/src/app/api/brittney/route.ts:178) (per-request CAEL record) + [route.ts:215-219](packages/studio/src/app/api/brittney/route.ts:215) (per-tool-call CAEL append).

**Acceptance**: Every Brittney session produces one CAEL chain (`fnv1a_chain` per W.111). Chain includes per-tool-call records with `tool_iters`, `evidence_paths`, and `simContractCheck` outcomes. Records carry `trust_epoch: 'post-w110'` (per W.110 artifact-grounding gate).

### Gate 3 — Baseline benchmark harness vs IDE-bound assistants
**Why**: Reviewer-survival requires head-to-head measurement. Without baselines, the paper is "we built a thing" not "we built a better thing."

**What to build**: 30-task spatial-creation benchmark + harness that runs same tasks through:
- Brittney (production endpoint)
- Cursor + Claude Sonnet (text-first baseline)
- Claude Code direct (no scene context)
- Vanilla Anthropic SDK call with no tools (zero baseline)

**Metrics**:
1. Creation-completion-rate (binary per task, judged against rubric)
2. SimulationContract pass-rate at first emit (binary per scene mutation)
3. Tool-rounds-to-completion (count)
4. Token-cost-per-task (USD)

**Acceptance**: Harness shipped at `packages/studio/src/__benchmarks__/brittney-vs-baselines/`. Initial run on 30 tasks produces a markdown table + JSON evidence file. N≥3 independent runs per task to address variance.

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
