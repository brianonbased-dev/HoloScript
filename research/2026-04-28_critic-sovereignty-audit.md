---
date: 2026-04-28
task: task_1777366583512_sqr9
type: critic-audit
references: [W.700, W.704, G.700.01, G.700.02, D.026]
---

# Machine Summary (uAA2 COMPRESS)

**AUDIT 1 (layer-collapse):** CONFIRMED, SYSTEMIC. Four VR traits in `VRTraitSystem.ts`
directly mutate `node.properties` — the live user-authored AST node — during runtime
execution, with no output channel, no copy, no dirty flag. One of them stores internal
runtime state inside the user's property bag using a sentinel key. No audit trail. No
replay fidelity. Violates the four-layer contract at every frame tick.

**AUDIT 2 (sovereignty):** STRUCTURALLY WEAK. No code-level gates were found gating
`.holo` export behind tier, auth, or payment checks. But sovereignty is currently
maintained by absence of enforcement, not by presence of a guarantee. D.026 has no
test harness. A single auth middleware call added anywhere in the export path would
silently break the commitment, and CI would not catch it.

---

# Critic Audit: .holo Format Sovereignty + Trait Layer-Collapse Risk

**Scope:** `packages/core/src/traits/VRTraitSystem.ts`, `packages/core/src/traits/SkeletonTrait.ts`, all packages for tier/auth export gates.
**Style:** Brutal critique. File:line citations. No silver linings.

---

## AUDIT 1: Layer-Collapse — Traits That Destroy Semantic Truth

The four-layer contract says execution truth must not silently overwrite semantic truth.
These traits do exactly that, every frame, with no output channel, no copy, and no audit
trail. This is not a theoretical risk. This is shipped code.

---

### FINDING 1.1 — `@grabbable`: Grabs your source of truth and keeps it

**File:** `packages/core/src/traits/VRTraitSystem.ts`
**Lines:** 530–546

```typescript
if (node.properties) {
  node.properties.position = newPosition;     // line 531
}
// ...
if (!config.preserve_rotation && node.properties) {
  node.properties.rotation = hand.rotation;   // line 546
}
```

This is the `onUpdate` body of the grabbable handler. Every frame tick while the user
holds an object, the solver overwrites `node.properties.position` with the hand physics
result. There is no separate output buffer. There is no event. The user's `.holo` value:

```holo
object "Ball" @grabbable {
  position: [0, 1, 0]
}
```

…is gone the moment someone picks it up. `position: [0, 1, 0]` becomes the hand's
current world position, in the same field, without notice. If you serialize the scene
mid-grab, you get the physics runtime's position, not the authored position. If CAEL
captures this node, the provenance trace contains runtime garbage mixed with authored
values — with no marker distinguishing which is which. The rotation follows the same
pattern unless the author explicitly sets `preserve_rotation: true` (which is not the
default).

**Severity:** P0. This is the canonical layer-collapse: execution truth (grab solver)
silently replaces semantic truth (authored position) in the same field, at 60hz, with
no output channel, no copy, and no way to recover the original without external bookkeeping.

---

### FINDING 1.2 — `@pointable`: Uses your property bag as scratch RAM

**File:** `packages/core/src/traits/VRTraitSystem.ts`
**Lines:** 706–720

```typescript
if (config.highlight_on_point && node.properties) {
  node.properties.__originalEmissive = node.properties.emissive;  // line 707
  node.properties.emissive = config.highlight_color;               // line 708
}
// ...
if (config.highlight_on_point && node.properties) {
  node.properties.emissive = node.properties.__originalEmissive || null;  // line 719
  delete node.properties.__originalEmissive;                               // line 720
}
```

This is worse than a silent value stomp. The runtime is **stashing internal state inside
the user's property object** via a sentinel key `__originalEmissive`. During any pointer
interaction, any agent that calls `Object.keys(node.properties)` will see this key. If
the scene is serialized mid-interaction (which CAEL does), `__originalEmissive` appears
in the snapshot. If a downstream consumer iterates properties for rendering, it receives
an undocumented key with no schema entry. If the user has authored their own
`__originalEmissive` property for any reason, this code silently clobbers it.

This is using the semantic layer as scratch RAM. The correct fix is a private state map
keyed by node ID (which is exactly what `__hoverState` does via the cast to
`{ __hoverState }` — and yet the emissive save/restore uses a property key instead of
that state object, which is already allocated).

**Severity:** P0. Adding undocumented sentinel keys to user-authored objects is a schema
contract violation. The cleanup at line 720 does not redeem it: CAEL captures snapshots
at points-in-time, and any snapshot taken during a point interaction is permanently
polluted.

---

### FINDING 1.3 — `@hoverable`: Multiplies the problem with scale and emissive

**File:** `packages/core/src/traits/VRTraitSystem.ts`
**Lines:** 773–815

```typescript
// hover_enter:
node.properties.scale = state.originalScale * config.scale_on_hover;  // line 775
node.properties.emissive = config.highlight_color;                      // line 782
node.properties.emissiveIntensity = config.glow_intensity;             // line 783

// hover_exit:
node.properties.scale = state.originalScale;                           // line 806
node.properties.emissive = state.originalColor;                        // line 810
delete node.properties.emissiveIntensity;                              // line 812
```

Three separate authored properties stomped on hover. Line 783 introduces
`emissiveIntensity` as a **new key that may not have existed in the authored .holo**.
This means the runtime is not just modifying authored values — it is adding authored-looking
properties to nodes that the user never wrote.

The "restore" at hover_exit only works if nothing else changed scale or emissive between
`hover_enter` and `hover_exit`. If a user animates scale during hover, the animation's
result is discarded when hover exits. The `state.originalScale` was snapshotted at
`onAttach` or at hover_enter, not tracked dynamically — any authored change between those
events is lost.

**Severity:** P0. This trait actively creates authored-looking state that was never in the
original `.holo` and destroys programmatic changes made during hover without warning.

---

### FINDING 1.4 — `@scalable`: Writes to `node.properties.scale` every onUpdate tick

**File:** `packages/core/src/traits/VRTraitSystem.ts`
**Lines:** 893–895

```typescript
if (node.properties) {
  node.properties.scale = newScale;
}
```

Same pattern as grabbable, applied to scale. The `onUpdate` body runs every frame while
`state.isScaling` is true. During two-hand scale gesture, the user's authored
`scale:` value is overwritten at 60hz. No output channel. No copy.

**Severity:** P1. Same class as 1.1. Scale is typically less critical than position/rotation
for physics accuracy, but the layer contract is still violated identically.

---

### FINDING 1.5 — `SkeletonTrait`: IK and keyframe share one buffer with no layer separation

**File:** `packages/core/src/traits/SkeletonTrait.ts`
**Lines:** 388–404

```typescript
public getBoneTransform(boneName: string): BoneTransform | undefined {
  return this.boneTransforms.get(boneName);
}

public setBoneTransform(boneName: string, transform: Partial<BoneTransform>): void {
  const current = this.boneTransforms.get(boneName);
  if (current) {
    this.boneTransforms.set(boneName, { ... });
  }
}
```

`boneTransforms` is a single `Map<string, BoneTransform>`. There is no separation between
keyframe animation values and IK/procedural override values. Calling `setBoneTransform()`
for IK destroys the keyframe value for that bone. Reading back via `getBoneTransform()`
returns whichever writer ran last.

This is a quieter form of layer-collapse: both layers write to the same cell. There is no
weight blending, no priority system, no dirty flag, no layer index. When IK runs, it wins.
When animation playback writes, it wins. There is no deterministic contract.

**Severity:** P1. This is a design gap, not a trivial bug. Adding layer separation to
SkeletonTrait requires introducing a layered transform accumulator — it is not a one-line
fix.

---

### WHAT THE CORRECT PATTERN LOOKS LIKE

Execution-layer results should be placed in a **separate runtime state map** keyed by
node ID, not written into `node.properties`. The renderer reads:

1. `node.properties` — the authored semantic values (never mutated by runtime)
2. The runtime state map — the solver's current output for this node (ephemeral)
3. Merges (authored values override runtime unless a trait explicitly defers)

The `__hoverState` pattern in the existing code shows the team knows this approach:

```typescript
(node as unknown as { __hoverState: HoverState }).__hoverState = state;
```

The `__hoverState` state object is correctly separated from `node.properties`. The same
pattern was not applied to the actual property mutations (`emissive`, `scale`, `position`,
`rotation`). This is inconsistency, not ignorance — which makes it a worse finding, because
the correct pattern was already in the same file.

---

## AUDIT 2: Format Sovereignty — D.026 Has No Enforcement

**Claim under audit:** The `.holo` format is unconditionally free-exportable across ALL
HoloScript tiers today. (D.026)

### What Was Searched

Comprehensive grep across:
- `packages/core/src` — parser, traits, compilers, runtime
- `packages/studio/src` — Studio frontend
- `packages/framework/src` — board, team, economy
- `packages/mcp-server/src` — MCP tools including export paths

Patterns: `tier|premium|paid|subscription|exportGate|planRequired|requiresPro|requiresAuth|RBAC|checkPermission|auth.*export|export.*auth`

### Finding: No Code-Level Gate Found

No code in any of those paths gates `.holo` export behind tier, auth, or subscription
checks. The format is currently exportable without authentication by anyone with access
to the parser.

### Finding: The Guarantee Is Not Backed By A Test

D.026 is not enforced. No test in the suite asserts "export works without credentials."
No CI job exercises the export path without a valid API token. The sovereignty guarantee
is currently true because nobody added a gate — not because a gate would be caught and
rejected.

The risk is not theoretical. The `@holoscript/mcp-server` has RBAC on compilation
endpoints:

```typescript
// Required mock for ALL compiler tests
vi.mock('../../security/rbac', () => ({
  checkPermission: vi.fn().mockResolvedValue(true),
}));
```

This mock exists in tests specifically because RBAC checks exist in the compiler paths.
If someone adds a similar check to the parse/export path — which is a two-line change
— D.026 is silently violated. CI would not catch it because there is no test asserting
the opposite.

### Severity: P1

Not a P0 violation today. But "no gate currently" is not the same as "gate cannot be
added." D.026 needs a test. One test. Something like:

```typescript
it('parses .holo without auth token', async () => {
  const result = await parseHolo('composition "Test" {}', { token: undefined });
  expect(result.ast).toBeDefined();
  expect(result.ast.type).toBe('Composition');
});
```

Until that test exists, sovereignty is a convention, not a contract.

---

## Summary Table

| Finding | File | Line(s) | Severity | Type |
|---------|------|---------|----------|------|
| `@grabbable` stomps position/rotation every frame | VRTraitSystem.ts | 531, 546 | P0 | Layer-collapse |
| `@pointable` stores sentinel in `node.properties` | VRTraitSystem.ts | 707, 720 | P0 | Schema pollution |
| `@hoverable` stomps scale/emissive, adds new keys | VRTraitSystem.ts | 775, 782–783, 810–812 | P0 | Layer-collapse + schema inflation |
| `@scalable` stomps scale every onUpdate tick | VRTraitSystem.ts | 894 | P1 | Layer-collapse |
| `SkeletonTrait` IK/keyframe share one buffer | SkeletonTrait.ts | 393–402 | P1 | Layer separation missing |
| D.026 has no test harness | (no file) | — | P1 | Sovereignty unguaranteed |

---

## What Needs To Happen

1. **Introduce a runtime state map** in `VRTraitRegistry` or `HoloScriptRuntime` keyed by
   node ID. Traits write solver outputs there. Renderer merges authored values with runtime
   overrides per frame. `node.properties` becomes read-only from trait `onUpdate`.
2. **Delete the `__originalEmissive` pattern** from `@pointable`. Move save/restore into
   the already-allocated `__pointState` object (or equivalent). This is a one-session fix.
3. **Add layer separation to `SkeletonTrait`**: a `procedural` map and a `keyframe` map,
   with explicit blend weights. `getBoneTransform` returns the blended result.
4. **Write one test** asserting `.holo` parse works without auth. Pin it to a CI job.
   Call it `sovereignty.test.ts` so it is impossible to miss.
