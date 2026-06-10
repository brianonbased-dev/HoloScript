# Brittney Lane Routing — Task-Type Modulation (Phase 1)

**Date:** 2026-06-10
**Branch:** `claude/brittney-modulation-models-85owz4`
**Question answered:** "Should we modulate Brittney into different models?" → Yes —
as task-lane routing layered on the existing tier router, not a rebuild.

## What shipped

The InferenceRouter already routed by **tier** (pro = Kimi K2.5, standard =
Fireworks → Fleet → Together → Ollama). This change adds **lanes** — what KIND
of work a request is — per the multi-lane model strategy
(ai-ecosystem `research/2026-05-13_brittney-holoshell-local-model-options.md`
"Routing Policy") and the EXP-1 router-bench finding that small models have
complementary strengths.

Lanes: `operator` (conversation/status/routing) · `code` (HoloScript
generation/repair — the pre-lane default) · `vision` (screenshot/visual state) ·
`reasoning` (hard source-wide reasoning).

Surfaces touched:

- `services/llm-service/src/services/InferenceRouter.ts` — `BrittneyLane` type,
  `detectLane()` heuristic, `applyLaneRouting()`, lane-aware `chat()` + logging.
- `services/llm-service/src/server.ts` — `/api/chat` accepts + validates `lane`;
  `tier` now passes through unset (router semantics unchanged) so lane promotion
  can fire.
- `packages/llm-provider/src/adapters/brittney-cloud.ts` — `lane` config option
  sent on the wire; `tier` omitted when unconfigured; latent-bug fix: model name
  `brittney-pro` now actually maps to `tier=pro` when no tier is configured.
- `packages/studio/src/lib/brittney/provider.ts` — `BRITTNEY_LANE` env
  pass-through; `BRITTNEY_TIER` no longer force-defaults to `standard`.

## Behavior contract (backward-compatible by construction)

1. Lane → model overrides come **only** from env:
   `BRITTNEY_LANE_OPERATOR_MODEL` / `BRITTNEY_LANE_CODE_MODEL` /
   `BRITTNEY_LANE_VISION_MODEL` / `BRITTNEY_LANE_REASONING_MODEL`.
   No env + no explicit lane = byte-identical routing to before.
2. An explicit `request.model` always wins over a lane override.
3. Tier promotion (vision/reasoning → pro, Kimi K2.5 being the only
   vision-capable provider) fires **only for an explicit `request.lane`**, never
   from heuristic detection — heuristics must not move a request onto a more
   expensive tier on their own. Pinned tiers are always respected.
4. Heuristic detection (when no lane given): vision keywords → `vision`;
   tools present → `code`; short tool-less turn (≤280 chars) → `operator`;
   else `code`.

Sovereign-first (founder directive 2026-06-05) is preserved: lanes modulate
*which sovereign model* serves a request; the Anthropic BYOK fallback ordering
is untouched.

## Validation

- `services/llm-service`: 26/26 vitest pass (12 new lane tests), `tsc --noEmit` clean.
- `packages/llm-provider`: 393/393 vitest pass (2 new adapter tests; 1 updated
  to the new omit-tier-when-unset contract).
- `packages/studio` provider resolution: 19/19 pass.

## What Remains After This Plan

Deliberately unaddressed in this phase:

- **No lane-specific models are deployed.** The env overrides are plumbing; the
  recommended lane models (Qwen3.5-4B operator, qwen2.5-coder:7b code specialist,
  Qwen2.5-VL vision) still need serving endpoints + env configuration per deploy.
- **The embeddings/retrieval lane is not wired.** EXP-1 showed the win comes from
  model-task fit *plus* offload retrieval; `nomic-embed-text` source recall is a
  separate integration.
- **Brittney-v3 fine-tune undecided.** The 240K/1M datasets exist
  (`scripts/training/generate-brittney-v3*-dataset.ts`) but no trained model is
  deployed; the code lane currently has no Brittney-specific fine-tune behind it.
- **Heuristic lane detection is keyword/length-based**, not learned; callers that
  know their intent should send `lane` explicitly. Studio chat UI does not yet
  set per-request lanes (only the process-wide `BRITTNEY_LANE` env).
- **No per-lane usage/cost telemetry** — FleetMetrics records provider, not lane.
