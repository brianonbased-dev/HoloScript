---
date: 2026-04-28
task: task_1777366583512_rwpn
type: design-memo
status: plan-only
references: [W.703, G.700.01, D.027, SimulationContract, Paper-22]
---

# Design Memo: `physics_validate_animation` MCP Tool

**Scope:** Plan-only. No implementation. This memo specifies the tool contract,
input/output shape, composition strategy, Brittney operator integration, and
SimulationContract mapping for Paper 22.

---

## 1. Context: What Cascadeur AutoPhysics Gets Right

Cascadeur's AutoPhysics runs AFTER the animator's keyframes are finished and treats
them as immutable. Its job is not to replace the animation — it is to surface where
the animation violates physics laws (balance, momentum, contact forces), and optionally
produce a refined version that corrects those violations. The animator decides whether
to accept the correction.

The key architectural insight: **AutoPhysics is a validator, not a generator.** It
produces a deviation score and a suggested correction, not a replacement animation.
The animator's intent survives.

`physics_validate_animation` must implement this same pattern in HoloScript's MCP layer.

---

## 2. Tool Contract

### 2.1 MCP Tool Definition

```text
tool name:       physics_validate_animation
tool namespace:  holoscript.physics
tier:            free (D.026 — no auth gate)
mutates input:   NEVER
```

### 2.2 Input Schema

```typescript
interface PhysicsValidateAnimationInput {
  // The .holo animation block to validate, as a parsed string or AST fragment.
  // The tool NEVER modifies this value.
  animation: string | HoloAnimationAST;

  // Physics constraints. If omitted, defaults are applied (Earth gravity,
  // unit mass distribution, no external contacts).
  physics_constraints?: {
    gravity?: [number, number, number];       // default: [0, -9.81, 0]
    mass_distribution?: BoneMassMap;          // per-bone kg values
    contact_set?: ContactPoint[];             // world contact surfaces
    solver_substeps?: number;                 // default: 8
    sim_duration_seconds?: number;            // default: full clip duration
  };

  // Optional: which deviation types to check. Default: all.
  checks?: Array<
    | 'balance'         // center-of-mass outside support polygon?
    | 'momentum'        // velocity discontinuities across keyframes?
    | 'contact_force'   // contact penetration / foot skating?
    | 'joint_torque'    // torques exceeding anatomical limits?
    | 'secondary'       // secondary motion (hair, cloth) missing?
  >;
}
```

### 2.3 Output Schema — Refusable Diff Contract (W.703)

```typescript
interface PhysicsValidateAnimationOutput {
  // The original animation, UNTOUCHED. Always equal to input.animation.
  // Returned so callers can pass the whole output object without keeping
  // a separate reference to the original.
  original: string | HoloAnimationAST;

  // The physics-corrected version of the animation.
  // Produced by composing the input with the engine's physics solver
  // and applying the minimum correction that satisfies the constraint set.
  // NULL if the animation already passes all checks (deviation_metric < threshold).
  validated: string | HoloAnimationAST | null;

  // Scalar deviation between original and validated.
  // Units: average joint angular displacement in radians, aggregated across
  // all frames and all bones. Range: [0, ∞). 0 = physics-perfect.
  deviation_metric: number;

  // Structured patch that transforms original → validated.
  // Frame-by-frame deltas: {frame_index, bone_name, delta_rotation, delta_position}.
  // Suitable for partial-blend: lerp each delta by t ∈ [0,1] to get
  // a validated-at-t animation without re-running the solver.
  suggested_patch: AnimationPatch | null;

  // Per-check violation detail. Present even if validated is null
  // (so callers can display the clean-bill-of-health list).
  violations: PhysicsViolation[];

  // Solver metadata for CAEL provenance logging.
  _provenance: {
    solver_version: string;
    substeps_used: number;
    sim_duration_seconds: number;
    wall_time_ms: number;
  };
}

interface PhysicsViolation {
  check: string;                     // e.g. 'balance'
  severity: 'warning' | 'error';    // warning = fixable, error = unfixable with min-patch
  frame_range: [number, number];     // inclusive frame indices where violation occurs
  description: string;               // human-readable, e.g. "CoM exits support polygon at frame 14"
  suggested_fix?: string;            // optional: NL description of the correction applied
}

interface AnimationPatch {
  format: 'frame-delta-v1';
  frames: FrameDelta[];
}

interface FrameDelta {
  frame_index: number;
  deltas: BoneDelta[];
}

interface BoneDelta {
  bone_name: string;
  delta_rotation?: [number, number, number, number];  // quaternion
  delta_position?: [number, number, number];
}
```

---

## 3. Composition with Engine Physics Solvers

The tool does not contain a physics engine. It composes with existing
`packages/engine/src/physics/` infrastructure.

### 3.1 Composition Path

```text
MCP tool call
  → validate input (parse .holo animation block if string)
  → extract bone timeline: {frame → Map<boneName, Transform>}
  → instantiate PhysicsWorld from physics_constraints
  → for each frame in timeline:
      → apply authored transform as kinematic target
      → run solver substeps
      → compute residual forces/torques
      → record constraint violations
  → run MinPatch solver: find minimal ΔTransform per frame that
      eliminates each violation (BFGS or projected gradient, ≤N solver steps)
  → serialize patch as AnimationPatch
  → compute deviation_metric = mean(|delta| across all frames × bones)
  → return RefusableDiff payload
```

### 3.2 Immutability Constraint

The tool receives the animation by value. It NEVER calls any method on the input
that mutates in-place. The `original` field in the output is a reference to the
same parsed value that was received — if the caller passes a mutable object, they
own immutability. The tool contract explicitly documents this boundary.

### 3.3 PhysicsWorld Instantiation

`PhysicsWorldImpl` is already instantiated via `PhysicsWorldFactory.create()` in
`packages/engine/src/physics/PhysicsWorldImpl.ts`. The tool creates a fresh
instance per call (no shared state) with the constraint set from the input. This
is a clean subprocess-style invocation — no side effects on the caller's scene.

---

## 4. Brittney Operator Contract (D.027)

D.027 defines the "Brittney operator": a natural-language animation directive that
composes with the refusable-diff workflow. The contract for `physics_validate_animation`
in Brittney context is:

### 4.1 NL → Tool Call Mapping

```
User: "make this jump physically plausible"
         ↓
Brittney NL parser extracts intent: {type: "physics_plausibility", scope: "jump"}
         ↓
Brittney invokes physics_validate_animation with:
  - animation: the current selection in Studio (the jump clip)
  - checks: ['balance', 'momentum', 'contact_force']
  - physics_constraints: { gravity: [0, -9.81, 0] }  (default earth)
         ↓
Tool returns PhysicsValidateAnimationOutput
         ↓
Brittney wraps output in RefusableDiff component (see research/2026-04-28_refusable-diff-spec.md)
         ↓
Studio renders: [Original] vs [Validated] + deviation_metric display + Accept/Reject/Blend controls
         ↓
User: accepts the correction at t=0.7 (partial blend)
         ↓
Brittney calls onPartialBlend(0.7), which interpolates each FrameDelta by 0.7
         ↓
Merged result written to scene — only at this point, first write to user data
```

### 4.2 Key D.027 Invariants (must be preserved)

1. **No write-before-accept.** The tool's output NEVER enters the live scene state
   unless the user calls `accept()` or `onPartialBlend(t)`. Not on confidence threshold,
   not on "obvious" corrections, not automatically.

2. **Partial blend is first-class, not a workaround.** The `suggested_patch` format
   is designed for linear interpolation. Partial acceptance at t ∈ (0, 1) is
   explicitly supported, not approximated. This is the mechanism that makes the
   tool useful for animators who want 30% physics correction, not the full
   AutoPhysics treatment.

3. **Deviation surfaced, not hidden.** The deviation_metric is always displayed to the
   user before any interaction. If the correction is small (deviation_metric < 0.05 rad),
   the UI shows "minor adjustment." If it is large (> 0.5 rad), the UI warns
   "significant deviation from authored intent." The user must see the magnitude
   before deciding.

4. **Rejection leaves no trace.** If the user rejects, `original` is unchanged,
   `suggested_patch` is discarded, and the tool's execution leaves no side effects
   anywhere in the scene state.

### 4.3 Operator Composition Table

| NL Phrase | Checks Activated | Expected deviation_metric | Typical UX |
| --------- | --------------- | ------------------------ | --------- |
| "make this jump physically plausible" | balance, momentum, contact_force | 0.1–0.4 rad | show deviation + blend slider |
| "fix the foot sliding" | contact_force | 0.05–0.2 rad | targeted fix, high acceptance rate |
| "tighten the physics on this fight clip" | all | 0.3–1.0 rad | warning if > 0.5 |
| "does this look real?" | all, check-only | 0 (no patch) | display violations list only |
| "auto-fix all physics issues" | all | varies | FULL ACCEPT ONLY with explicit confirm |

The last row is a special case: "auto-fix all" bypasses the diff UI and applies the
full correction automatically. This requires an explicit secondary confirmation dialog
(not a single NL prompt acceptance) per D.027 §4.2 "destructive operations."

---

## 5. SimulationContract Mapping (Paper 22)

### 5.1 Paper 22 Context

Paper 22 is the motivating example for the SimulationContract architecture. It
requires a system where a user-authored animation can be evaluated against a
physics oracle, the deviation is quantified, and the oracle's correction is
surfaced as a refusable diff. `physics_validate_animation` IS the Paper 22 example
tool.

### 5.2 SimulationContract Mapping

The `PhysicsValidateAnimationOutput` maps directly to the SimulationContract
evidence layer:

```typescript
// How the tool output maps to SimulationContract fields:
simulationContract = {
  // Semantic truth: what the user authored
  authored_state: output.original,

  // Execution truth: what physics says happened
  solver_state: output.validated,

  // Interaction truth: the diff surface (RefusableDiff) lets the
  // user intervene at any deviation threshold
  intervention_event: {
    type: 'physics_validate_animation',
    deviation: output.deviation_metric,
    accepted: false,  // until user acts
  },

  // Evidence truth: CAEL provenance
  provenance: output._provenance,
};
```

The four-layer contract is satisfied:

- **Semantic** → `original` is never touched
- **Execution** → `validated` is the solver's truth, separate from semantic
- **Interaction** → user must explicitly accept/reject/blend (not implicit)
- **Evidence** → `_provenance` records solver version, substep count, timing

### 5.3 Paper 22 Motivating Example Walkthrough

```text
1. User authors:
     animation "HeroJump" {
       keyframe 0 { hips: [0, 1.0, 0], ... }
       keyframe 15 { hips: [0, 2.4, 0], ... }  // peak
       keyframe 30 { hips: [0, 1.0, 0], ... }  // landing
     }

2. User says: "does this jump follow physics?"

3. physics_validate_animation runs:
   - gravity: [0, -9.81, 0]
   - checks: balance, momentum, contact_force
   - finds: peak height 2.4m from standing position would require
     initial vertical velocity ~6.7 m/s → in a 0.5s clip, that's
     plausible, but contact_force shows feet penetrating ground at
     frame 28 (foot skating).

4. Output:
   - deviation_metric: 0.08 rad (small — only foot correction needed)
   - suggested_patch: [frame 26-30, pelvis -0.04m, ankles adjusted]
   - violations: [{check: 'contact_force', severity: 'warning',
       frame_range: [26, 30], description: 'left foot penetrates floor surface'}]

5. Studio shows:
   [Original] 2.4m peak jump, foot skating at landing
   [Validated] 2.4m peak jump, clean landing, deviation: 4.6°
   [Blend slider 0% ←→ 100%] [Reject] [Accept]

6. Animator drags slider to 80%, says "that's enough"
   → final animation is 80% corrected, authored peak preserved
```

This is the minimal viable Paper 22 example. It demonstrates:

- Physics oracle as a first-class planning tool (not auto-apply)
- Deviation surfacing as a feature, not a warning
- Partial-blend acceptance as the primary workflow
- Zero mutation of authored data until explicit accept

---

## 6. What This Tool Is NOT

The design must be explicit about scope to prevent scope creep:

1. **Not a generative tool.** It does not generate animation from a physics sim.
   It corrects an existing animation. If the input has no keyframes, the tool
   returns an error, not a generated clip.

2. **Not a real-time solver.** This is a batch MCP tool call. It is not suitable
   for per-frame physics trait updates. The trait-layer equivalent of this tool
   is `@physics` + `@kinematic` — those exist in `VRTraitSystem`. This tool
   operates on full clips, not live frames.

3. **Not a replacement for `@physics` trait.** The trait handles live simulation.
   This tool handles offline validation. They compose: run `@physics` to get
   a runtime reference trajectory, then use `physics_validate_animation` to
   compare against the authored animation.

4. **Not an auth gate.** The tool must be callable without credentials on any tier
   (D.026). If the engine physics solver becomes a paid cloud service, this tool
   must either fall back to a local solver or expose a `local_only: true` flag.
   The auth boundary must never be inside the tool itself.

---

## 7. Implementation Sequence (for the implementing agent)

This section is informational for whoever executes the implementation task:

1. **Add tool schema** to `packages/mcp-server/src/physics-tools.ts` (create if not exists).
   Register in `packages/mcp-server/src/cli.ts` tool list.

2. **Implement animation parser bridge**: convert `.holo` animation block → per-frame
   bone transform timeline. The `.holo` parser already exists in `packages/core/src/parsers/`.

3. **Implement PhysicsWorld bridge**: instantiate `PhysicsWorldFactory.create()` with
   constraint overrides, drive kinematic targets per frame, collect residuals.

4. **Implement MinPatch solver**: gradient descent on frame deltas, minimize
   `||delta|| subject to constraints satisfied`. Cap max iterations at 100 per
   frame to bound wall time.

5. **Implement deviation_metric**: `mean(|delta_rotation| in rad)` across all
   bones and frames.

6. **Wire to RefusableDiff output format**: ensure output shape matches
   `PhysicsValidateAnimationOutput` exactly.

7. **Add sovereignty test**: one test in
   `packages/mcp-server/src/__tests__/sovereignty.test.ts` asserting the tool
   can be called without auth headers.

8. **CAEL integration**: emit `_provenance` block using the existing CAEL trace
   writer in `packages/core/src/cael/` (or equivalent). This is the evidence layer.

---

## 8. Open Questions (not resolved in this memo)

| Question | Impact | Owner |
| -------- | ------ | ----- |
| Which local physics solver is viable for offline batch (Rapier, Bullet, custom)? | determines MinPatch complexity | engine team |
| Should the tool expose a `streaming` mode (SSE per-frame progress)? | UX for long clips | mcp-server team |
| What is the max clip duration before the tool should return a "too large, batch instead" error? | latency SLA | product |
| Is `deviation_metric` in radians the right unit for a UX label (most animators think in degrees)? | display only, not contract-breaking | studio team |
| Should `suggested_patch` be stored in CAEL as an artifact, or only the `_provenance` metadata? | evidence layer scope | CAEL team |
