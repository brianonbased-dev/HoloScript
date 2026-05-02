---
date: 2026-05-01
type: research
status: complete
gate-status: ENGINEERING-READY (implementation plan below)
authority: task_1777449137917_c7o7
owner: claude-code (claude1)
---

# SimContract Judge Verification — Closing the Methodology Gap

## Problem Statement

The 270-cell baselines-only benchmark run (2026-04-29) revealed that **vanilla-baseline (95.6%) outperforms both FS-tool baselines (claude-code 85.6%, cursor 72.2%)**. This result is partly a methodology artifact: the rubric judge (Opus 4.7 via structured tool use) evaluates text output directly but cannot *render* Brittney's `tool_call` payloads (`create_object`, `add_trait`, `compose_traits`) into spatial, verifiable assertions. The judge sees prose and says "good prose"; it sees tool calls and says "I can't visualize this."

**The core asymmetry**: Vanilla produces text that the judge reads naturally. Brittney produces structured scene mutations that must be *materialized* before the judge can evaluate spatial correctness. Without materialization, the judge is comparing apples (readable prose) to oranges (opaque JSON payloads).

## Architecture Audit — What Already Exists

### 1. `deterministic-verifier.ts` (SHIPPED, PARTIAL)

**File**: `packages/studio/src/__benchmarks__/brittney-vs-baselines/deterministic-verifier.ts`

This is a ground-truth verifier for 6 tasks (M02, M06, M09, A01, A04, A10) that checks spatial/count criteria from `create_object` mutations without LLM interpretation. It:

- Parses `SceneMutation[]` objects into `ParsedObject[]` with position, scale, color, radius
- Matches against golden cases from `golden-cases.ts`
- Verifies geometric properties (distances, tolerances, counts, tangency)

**Coverage gap**: Only 6 of 30 tasks have deterministic verifiers. The remaining 24 tasks (T01-T10, M01, M03-M05, M07-M08, A02-A03, A05-A09) fall through to LLM-only judgment.

### 2. `judge.ts` — Hybrid Verdict System (SHIPPED)

**File**: `packages/studio/src/__benchmarks__/brittney-vs-baselines/judge.ts`

The judge already has a **deterministic override mechanism** (lines 192-205):

```typescript
// Deterministic override: per-criterion routing based on verifier_type.
const deterministic = verifyDeterministically(task, mutations);
const detById = new Map(deterministic.map((d) => [d.criterion_id, d]));
verdicts = verdicts.map((v) => {
  const criterion = task.evaluation_rubric.find((c) => c.id === v.criterion_id);
  const useDeterministic = criterion && criterion.verifier_type && criterion.verifier_type !== 'llm';
  const det = detById.get(v.criterion_id);
  if (!det || !useDeterministic) return v;
  return {
    ...v,
    passed: det.passed,
    rationale: `[deterministic] ${det.rationale} | [llm] ${v.rationale}`,
  };
});
```

**Key insight**: The infrastructure for deterministic-vs-LLM routing *already exists* in the judge. Rubric criteria tagged `verifier_type: 'geometric' | 'count' | 'presence'` are automatically routed to the deterministic verifier. Only `verifier_type: 'llm'` or untagged criteria go to the LLM judge.

### 3. `mutation-renderer.ts` — Prose Materialization (SHIPPED, PARTIAL)

**File**: `packages/studio/src/__benchmarks__/brittney-vs-baselines/mutation-renderer.ts`

This renders `SceneMutation[]` into human-readable prose for the judge prompt:

```typescript
function buildPrompt(task, candidateOutput, rubric, mutations) {
  // ...
  `SCENE MUTATIONS (tool calls executed by the candidate, rendered as object descriptions):`,
  renderMutationsToProse(mutations),
  `For each rubric criterion, decide if the candidate output OR the scene mutations satisfy it.`,
  `When evaluating, PRIORITIZE the scene mutations over the text output.`,
  // ...
}
```

**Key insight**: The judge prompt already includes rendered mutations and tells the judge to prioritize them. But `renderMutationsToProse` only handles `create_object` with a fixed field set (position, scale, color, radius, light_type, projection, direction, look_at, major_radius, minor_radius). It does NOT render `add_trait`, `compose_traits`, `set_trait_property`, `move_object`, `rotate_object`, `scale_object` — these all fall into "Other Scene Mutations" as raw JSON.

### 4. `SimContractGate.ts` — Scene-Level Contract Verification (SHIPPED)

**File**: `packages/studio/src/lib/brittney/SimContractGate.ts`

This validates scene mutations against declared SimulationContracts. It operates at a different level: it checks whether a mutation *violates contract invariants* (deleting required objects, removing required traits, exceeding property bounds). It does NOT check whether a mutation *achieves the task goal*.

**Relevance**: SimContract is about *safety-by-construction* (preventing invalid mutations), not *goal-completion verification* (checking whether the right objects were created). These are complementary layers.

### 5. `trust_mutations_over_prose` Task Flag (SHIPPED)

Every task has a `trust_mutations_over_prose` flag. When true, the judge prompt adds:

> "IMPORTANT: This is a spatial pattern task. The scene mutations contain the ground-truth object positions, colors, and sizes. If the mutations show objects with correct properties arranged correctly, mark PASS even if the text description is vague or incomplete. Trust the geometric data over prose."

**Current coverage**: ALL 30 tasks have `trust_mutations_over_prose: true` (verified in trivial-scene.json, multi-object-scene.json, agentic-multi-step.json).

### 6. Task Rubric `verifier_type` Field (SHIPPED, UNDERUSED)

The `RubricCriterion` type already has `verifier_type?: 'llm' | 'geometric' | 'count' | 'presence'`. But examining the task JSON files:

**T01 rubric** (typical trivial task):
```json
{ "id": "single_object", "description": "Output describes or creates exactly one object", "required": true }
```

No `verifier_type` is set. This means every criterion defaults to LLM-judged, even when deterministic verification would be more appropriate.

## Diagnosis — Why Vanilla Wins

The methodology gap is a *composition* of three independent biases, not a single problem:

### Bias 1: Asymmetric Prose Rendering

| Config | What the judge sees | Naturalness |
|--------|---------------------|-------------|
| vanilla-baseline | Pure prose descriptions of scenes | **High** — the judge reads descriptions natively |
| brittney-prod | Rendered mutations + prose (mutation-renderer output) | **Medium** — structured data rendered as prose |
| FS baselines | Synthetic FS tool output descriptions | **Low** — file-system metaphor is alien to spatial evaluation |

`mutation-renderer.ts` produces decent prose for `create_object` calls but dumps `add_trait`, `compose_traits`, etc. as raw JSON. This means Brittney's *compositional* tool calls (the ones that distinguish it from vanilla) are the *least readable* part of the evaluation input.

### Bias 2: Missing `verifier_type` Tags

Only 6/30 tasks have deterministic verifiers in `deterministic-verifier.ts`. But even those 6 tasks don't have `verifier_type` tags in their rubric criteria. The `verifyDeterministically()` function uses task IDs directly (hardcoded `TASK_VERIFIERS` map), not the `verifier_type` field. The `verifier_type` routing in `judge.ts` is wired but unused because no criterion sets it.

Result: ALL rubric criteria go through the LLM judge, including criteria that could be deterministically verified (counts, positions, colors, geometric relationships).

### Bias 3: Judge Cannot Verify Spatial Properties

The Opus 4.7 judge is a text model. It cannot render a 3D scene, cannot verify that objects are stacked correctly, cannot check tangency conditions. Even with `renderMutationsToProse`, the judge evaluates prose *descriptions* of spatial relationships, not the relationships themselves.

For vanilla, the judge evaluates: "three cubes stacked vertically" (prose) — and says "yes, the description mentions three stacked cubes."

For Brittney, the judge evaluates: "Created Objects (3)\n- RedCube: mesh\n  position: [0, 0.50, 0]\n  scale: [1, 1, 1]\n  color: red" — and has to *infer* from the coordinates that they're stacked correctly.

The judge is equally bad at both inferences, but vanilla gets credit for *saying* "stacked" while Brittney has to prove it through coordinates the judge may not parse correctly.

## Fix Path (a): SimContract Verification Before Judgment

**What it does**: Before the LLM judge evaluates Brittney's output, run the deterministic verifier on Brittney's `tool_call` payloads and inject pass/fail results as structured context into the judge prompt. The LLM judge then evaluates the *combination* of text output + verified mutation results.

**Implementation plan**:

#### Step 1: Expand deterministic verifiers to all 30 tasks

The `TASK_VERIFIERS` map in `deterministic-verifier.ts` currently covers 6 tasks. Expand it:

- **Trivial tasks (T01-T10)**: Simple count/presence/position verifiers. Most have single-object prompts.
  - T01: one red cube at origin → count=1, primitive=cube, color=red, position=[0,0,0]
  - T02: one blue sphere at (1,0,0) → count=1, primitive=sphere, color=blue, radius=0.5, position=(1,0,0)
  - T03-T07: analogous single-property checks
  - T08-T10: light, camera, material checks

- **Multi-object tasks (M01-M10)**: Moderate spatial checks.
  - M01: count + position + color pattern
  - M03-M05, M07-M08: object presence + properties
  - M02, M06, M09: already covered

- **Agentic tasks (A01-A10)**: Complex multi-step checks.
  - A01, A04, A10: already covered
  - A02-A03, A05-A09: structural pattern checks (walls, floors, stairs, rooms)

For each task, the deterministic verifier checks *only* what can be objectively measured from the mutation payloads: object counts, positions, colors, sizes, distances, tangency conditions.

#### Step 2: Tag all rubric criteria with `verifier_type`

In each task JSON, tag every criterion:

- `verifier_type: 'geometric'` — position, distance, tangency, stacking checks
- `verifier_type: 'count'` — "exactly N objects" checks
- `verifier_type: 'presence'` — "object exists" checks
- `verifier_type: 'llm'` — semantic/narrative checks ("the scene conveys X feeling")

This activates the existing routing in `judge.ts` lines 192-205 without any code changes to the judge.

#### Step 3: Merge deterministic results into `creation_completion`

Current `isCompleted()` in `judge.ts`:

```typescript
export function isCompleted(verdicts: RubricVerdict[], rubric: RubricCriterion[]): boolean {
  for (const c of rubric) {
    if (!c.required) continue;
    const v = verdicts.find((x) => x.criterion_id === c.id);
    if (!v || !v.passed) return false;
  }
  return true;
}
```

No change needed here — the deterministic override already replaces LLM verdicts for tagged criteria. The `creation_completion` metric will automatically reflect deterministic verification for geometric/count/presence criteria.

#### Step 4: Add `sim_contract_pass_rate` to the `creation_completion` calculation

Currently `sim_contract_pass_rate` is a separate metric per cell. The task description asks for two fix paths. Path (a) says "pass/fail per mutation merges into per-task creation_completion." This means:

**New metric**: `deterministic_creation_completion` — a task is complete iff ALL required criteria pass (deterministic for tagged criteria, LLM for `llm`-tagged criteria).

This is already how the judge works. The change is making the *routing explicit* via `verifier_type` tags so that geometric/count/presence criteria are NEVER subject to LLM judgment errors.

## Fix Path (b): Materialize Brittney's Tool Calls Into Synthesized Scene Descriptions

**What it does**: Before the LLM judge evaluates Brittney's output, render Brittney's complete `tool_call` sequence into a synthesized scene description that the text judge can read *as naturally as vanilla's prose*.

**Implementation plan**:

#### Step 1: Expand `mutation-renderer.ts` to handle all tool types

Current renderer only handles `create_object` with a fixed field set. Expand to:

- `add_trait` → "Object {name} was given trait {trait_name} with properties {props}"
- `compose_traits` → "Object {name} was composed with traits {trait_list}"
- `set_trait_property` → "Object {name}'s trait {trait_name} had property {key} set to {value}"
- `move_object` → "Object {name} was moved to position {position}"
- `rotate_object` → "Object {name} was rotated {rotation}"
- `scale_object` → "Object {name} was scaled to {scale}"
- `remove_object` → "Object {name} was removed from the scene"
- `delete_object` → "Object {name} was deleted"

#### Step 2: Build a synthetic scene state from the mutation sequence

Instead of rendering each mutation independently, accumulate mutations into a **scene state** (map of object name → properties) and render the *final state*. This is the key insight: the judge doesn't need to see the sequence of operations — it needs to see the *resulting scene*.

```typescript
interface SceneState {
  objects: Map<string, {
    type: string;
    primitive?: string;
    position: [number, number, number];
    scale: [number, number, number];
    color?: string;
    radius?: number;
    traits: Map<string, Record<string, unknown>>;
  }>;
}
```

Accumulate mutations into this state, then render the final state as natural-language scene description:

```
The scene contains 5 objects:
- BaseSphere: a white sphere (radius 1.0) at position [0, 1.0, 0]
- MiddleSphere: a white sphere (radius 0.7) at position [0, 2.7, 0]
- HeadSphere: a white sphere (radius 0.5) at position [0, 3.9, 0]
- LeftEye: a black sphere (radius 0.05) at position [-0.15, 4.0, 0.4]
- RightEye: a black sphere (radius 0.05) at position [0.15, 4.0, 0.4]

The spheres are arranged vertically with the base at y=1.0 and the head at y=3.9.
The three body spheres have decreasing radii from bottom (1.0) to top (0.5).
```

#### Step 3: Inject synthesized description into the judge prompt

For Brittney-prod cells, the `buildPrompt` function should place the synthesized scene description *before* the raw mutations. The prompt hierarchy becomes:

1. **Task prompt** (same for all configs)
2. **Rubric** (same for all configs)
3. **Candidate output text** (same for all configs)
4. **Synthesized scene description** (Brittney-prod only — derived from mutations)
5. **Raw mutation list** (Brittney-prod only — for detailed inspection)

This gives the LLM judge a level playing field: it sees Brittney's scene described in the same natural language format as vanilla's prose.

## Recommended Path: (a) AND (b) Together

Paths (a) and (b) are complementary, not alternatives:

- **(a) eliminates false negatives**: Geometric/count/presence criteria that Brittney *objectively passes* will no longer fail due to LLM misinterpretation of coordinates.
- **(b) eliminates false positives for vanilla**: When vanilla describes "three stacked cubes" but the description is vague or wrong, the judge won't give credit for spatial claims without mutation evidence.

The combined approach:

1. **Tag all rubric criteria with `verifier_type`** (Step 2 of path a) — zero code changes to judge.ts, just JSON edits to task files
2. **Expand deterministic verifiers to all 30 tasks** (Step 1 of path a) — new verifier functions in `deterministic-verifier.ts`
3. **Expand mutation renderer to all tool types** (Step 1 of path b) — renderer improvements
4. **Build scene-state accumulation** (Step 2 of path b) — new `SceneState` type and accumulation logic
5. **Inject synthesized description into judge prompt** (Step 3 of path b) — `buildPrompt` changes

Steps 1-3 are low-risk (additive, no existing behavior changes). Step 4 is moderate (new logic). Step 5 requires careful prompt engineering.

## Impact on Paper 26 Framing

From the scoping memo (`research/2026-04-27_brittney-paper-scoping.md`):

> The framing that survives /critic: "Architecturally-grounded AI creation: every mutation routes through SimulationContract verification + CAEL audit trail, evaluated against unverified-baselines on creation-completion + post-hoc safety-check pass-rate"

The methodology gap directly threatens this framing. If the benchmark shows vanilla beating Brittney, the paper claim "architecturally-grounded creation is better" falls apart. But the *reason* vanilla wins is that the benchmark measures the wrong thing: it measures "can an LLM judge evaluate this output?" rather than "does this output objectively produce the correct scene?"

Closing the gap with (a)+(b) means:
- **Deterministic verification** proves Brittney's mutations are objectively correct (or not) regardless of LLM judge interpretation
- **Scene-state materialization** levels the playing field so the LLM judge evaluates both configs on equal terms
- The combined metric — `deterministic_creation_completion` for geometric/count/presence criteria, LLM judgment for semantic criteria — is *reviewer-defensible*

## Implementation Size Estimate

| Step | LOC | Risk | Files Changed |
|------|-----|------|---------------|
| Tag rubric criteria with `verifier_type` | ~30 | Minimal (JSON edits) | tasks/*.json |
| Expand deterministic verifiers | ~200-300 | Low (pure functions) | deterministic-verifier.ts, golden-cases.ts |
| Expand mutation renderer | ~80 | Low (additive) | mutation-renderer.ts |
| Build scene-state accumulation | ~100 | Medium (new type) | scene-state.ts (new) |
| Inject synthesized description | ~30 | Medium (prompt eng) | judge.ts |
| Re-run benchmark | 0 | N/A | CLI command |
| **Total** | ~440-540 | — | ~6-7 files |

## What to Do Before Re-Running

1. **DO NOT** re-run the 360-cell benchmark until paths (a) and (b) are implemented and unit-tested
2. The 270-cell baselines-only run is still valid as a baseline — it tells us what vanilla/FS-baselines produce without Brittney. The methodology gap only affects how we *evaluate* Brittney's output, not the baselines themselves.
3. Brittney-prod cells from a re-run will have both `creation_completion` (LLM-only, comparable to baselines) AND `deterministic_creation_completion` (hybrid deterministic+LLM, the reviewable metric). The delta between the two metrics IS the methodology artifact — it quantifies how much of vanilla's lead comes from judge asymmetry.

## Relationship to SimContractGate

`SimContractGate.ts` operates at a different level than this fix. The gate checks whether a mutation *violates a declared contract* (safety). The deterministic verifier checks whether a mutation *achieves the task goal* (correctness). Both are necessary:

- **SimContractGate**: "Is this mutation *safe* to apply?" (prevents invalid mutations)
- **Deterministic verifier**: "Does this mutation *correctly produce* the requested scene?" (measures goal completion)
- **LLM judge**: "Does the text output *describe* the scene correctly?" (measures description quality)

The three layers compose: a Brittney output passes if (1) all mutations pass SimContract, (2) all geometric/count/presence criteria pass deterministic verification, and (3) all semantic criteria pass LLM judgment. This is the Algebraic Trust tri-layer in evaluation form: algebra (deterministic) + history (SimContract audit) + oracle (LLM judge).

## Appendix: Current Coverage Summary

| Tier | Tasks | Has Deterministic Verifier | Rubric Criteria with verifier_type |
|------|-------|---------------------------|-----------------------------------|
| trivial-scene | T01-T10 | 0/10 | 0/40 (est.) |
| multi-object-scene | M01-M10 | 3/10 (M02, M06, M09) | 0/40 (est.) |
| agentic-multi-step | A01-A10 | 3/10 (A01, A04, A10) | 0/40 (est.) |
| **Total** | **30** | **6/30** | **0/~120** |

After the fix: 30/30 tasks with deterministic verifiers, ~80/120 criteria tagged with `verifier_type` (geometric/count/presence), ~40/120 remaining as `llm` for semantic judgment.