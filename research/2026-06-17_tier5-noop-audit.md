# Tier-5 R3F Trait No-Op Audit

**Date:** 2026-06-17
**Author:** claude (claudecode-claude-x402)
**Task:** task_1781668885162_2mc6 — `[native-runtime] audit: classify Tier-5 R3F traits as native no-ops`
**Source doc:** research/2026-06-15_trait-parity-and-tsx-deprecation.md §4.2 / §5.1

---

## Executive Summary

The research doc estimated ~12 Tier-5 traits were likely "declarative/policy/compile-time only" and could be removed from the 79-trait parity backlog immediately.

**Actual result: 1 confirmed no-op, 1 parity-OK via different mechanism, 10 false no-ops.**

Backlog reduction: **2 of 12** removed (not 12). The 10 misclassified traits have full
TraitHandler implementations with active `onUpdate`/`onEvent` logic — they belong in the
Tier-1–4 registration backlog, not the no-op list.

---

## Methodology

Three-point audit for each trait:

1. **R3F emission:** search `R3FCompiler.ts` switch block (lines 3230–3520)
2. **Native handler file:** check `packages/core/src/traits/<Name>Trait.ts` for `onUpdate` / `onEvent` with active logic
3. **BrowserRuntime registration:** confirm absence from `BrowserRuntime.ts` `TraitSystem.register()` calls (lines 932–1006)

---

## Per-Trait Verdicts

### `attach`

- **R3F:** emits `props.attach = trait.config || true` (R3FCompiler.ts:3304-3305)
- **Handler file:** none — no `AttachTrait.ts` exists
- **BrowserRuntime:** not registered
- **Verdict: TRUE NO-OP** — Three.js child-hierarchy hint; compile-time structural only

### `material`

- **R3F:** emits `props.materialProps` from presets + trait config (R3FCompiler.ts:3279-3293)
- **Handler file:** none as a standalone TraitHandler
- **BrowserRuntime:** handled via `TraitVisualSystem` at object-build time (BrowserRuntime.ts:1362-1434) — `TraitCompositor.compose(traitNames)` → `MeshStandardMaterial` / `MeshPhysicalMaterial`
- **Verdict: PARITY-OK (different mechanism)** — processed at scene-build time, not as a registered tick handler. No gap.

### `accessible`

- **R3F:** emits `props.accessible` (R3FCompiler.ts:3421-3422)
- **Handler:** `AccessibleTrait.ts` — `onUpdate` processes announce queue + focus ring per frame; `onEvent` handles keyboard nav, ARIA state
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration**

### `alt_text`

- **R3F:** emits `props.altText` (R3FCompiler.ts:3423-3424)
- **Handler:** `AltTextTrait.ts` — `onAttach` registers text; `onEvent` handles query/generate/update; `onUpdate` is genuinely empty
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration**

### `high_contrast`

- **R3F:** emits `props.highContrast` (R3FCompiler.ts:3427-3428)
- **Handler:** `HighContrastTrait.ts` — `onAttach` checks system preference + applies mode; `onEvent` handles enable/disable/toggle/query with material palette swap; `onUpdate` is empty
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (event-driven but non-trivial)

### `motion_reduced`

- **R3F:** emits `props.motionReduced = true` + `props.animated = false` (R3FCompiler.ts:3429-3431)
- **Handler:** `MotionReducedTrait.ts` — `onUpdate` does per-frame velocity clamping and camera-shake detection; `onEvent` intercepts animation starts and camera transitions
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (active per-tick work)

### `moderation`

- **R3F:** emits `props.moderation` (R3FCompiler.ts:3394-3395)
- **Handler:** `ModerationTrait.ts` — `onEvent` handles full AI moderation pipeline with violation tracking, escalation, cooldowns; `onUpdate` is empty (event-driven)
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration**

### `anti_grief`

- **R3F:** emits `props.antiGrief` (R3FCompiler.ts:3396-3397)
- **Handler:** `AntiGriefTrait.ts` — `onUpdate` runs per-frame grief score computation with event window pruning and shield expiry; `onEvent` handles player_kill / object_destroyed / player_report events
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (active per-tick work)

### `token_gated`

- **R3F:** emits `props.tokenGated` (R3FCompiler.ts:3400-3401)
- **Handler:** `TokenGatedTrait.ts` — `onUpdate` polls for re-verification if `verify_interval > 0`; `onEvent` handles blockchain balance verification flow with fallback visibility behaviors (hide/blur/lock/message/redirect)
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (has polling behavior + access control)

### `data_binding`

- **R3F:** emits `props.dataBinding` (R3FCompiler.ts:3454-3455)
- **Handler:** `DataBindingTrait.ts` — `onUpdate` polls REST/GraphQL sources + applies property interpolation per frame; `onEvent` handles connect/disconnect/data/error/refresh events
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (active per-tick polling + interpolation)

### `world_state`

- **R3F:** emits `props.worldState` (R3FCompiler.ts:3398-3399)
- **Handler:** `WorldStateTrait.ts` — `onUpdate` runs 10 Hz CRDT sync timer and 30s autosave timer; `onEvent` handles full object/terrain/NPC-memory/inventory persistence via Loro CRDT
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (active per-tick CRDT management)

### `shared_world`

- **R3F:** emits `props.sharedWorld` (R3FCompiler.ts:3472-3473)
- **Handler:** `SharedWorldTrait.ts` — `onUpdate` runs sync accumulator at configurable Hz (default 20) + dispatches pending peer updates; `onEvent` handles full multiplayer state sync including spatial personas (visionOS V43 Tier 2)
- **BrowserRuntime:** NOT registered
- **Verdict: FALSE NO-OP — needs registration** (active per-Hz sync)

---

## Summary Table

| Trait            | Verdict            | Reason                                         |
| ---------------- | ------------------ | ---------------------------------------------- |
| `attach`         | TRUE NO-OP         | No handler file; Three.js structural hint only |
| `material`       | PARITY-OK          | TraitVisualSystem handles at build time        |
| `accessible`     | Needs registration | onUpdate + onEvent active                      |
| `alt_text`       | Needs registration | onAttach + onEvent active                      |
| `high_contrast`  | Needs registration | onEvent active (event-driven)                  |
| `motion_reduced` | Needs registration | onUpdate active (velocity clamp)               |
| `moderation`     | Needs registration | onEvent active (AI pipeline)                   |
| `anti_grief`     | Needs registration | onUpdate active (grief scores)                 |
| `token_gated`    | Needs registration | onUpdate active (polling)                      |
| `data_binding`   | Needs registration | onUpdate active (poll + interpolate)           |
| `world_state`    | Needs registration | onUpdate active (CRDT sync)                    |
| `shared_world`   | Needs registration | onUpdate active (peer sync)                    |

---

## Impact on Parity Backlog

- Original estimate: ~12 no-ops to remove
- Actual no-ops confirmed: **1** (`attach`) + **1** parity-OK (`material`)
- Remaining from the Tier-5 list that move to the "needs registration" pile: **10**
- Net reduction in 79-trait poison backlog: **2**

The 10 misclassified traits are well-suited to be prioritized alongside Tier-4 (audio)
since several (`accessible`, `alt_text`, `high_contrast`, `motion_reduced`) are
accessibility-surface traits with no dependencies on render passes or XR sensors.

---

## Artifact

Classification constant: `packages/core/src/traits/runtime-parity-noop-classification.ts`

This file exports:

- `RUNTIME_NOOP_TRAITS` — the single confirmed no-op (`attach`)
- `TIER5_MISCLASSIFIED_AS_NOOP` — the 10 false no-ops (documentation-only)
- `MATERIAL_TRAIT_PARITY_NOTE` — the `material` parity explanation
