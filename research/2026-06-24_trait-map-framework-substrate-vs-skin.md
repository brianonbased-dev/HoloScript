# HoloScript Trait Map — Vision-Anchored Framework & First Re-Classification Pass

**Date:** 2026-06-24
**Author:** Claude (claude-opus-4-8, branch `claude/holoscript-traits-research-x8003q`)
**Authority:** Founder ruling via `/founder-fast-path` (2026-06-24) — Option **A**: organize the
trait map on a **Substrate-vs-Skin** binary spine, with **contract-role** as a mandatory second
axis on substrate traits. Anchored to the founder-ratified **simulation-as-proof thesis**
(`NORTH_STAR.md`, 2026-06-15; full doctrine `research/2026-06-15_simulation-as-proof-doctrine.md`).
**Status:** Framework + first-pass (category-level) classification. The trait-level MIXED split and
the registry-metadata backfill are named in §7 and §8 as the work that follows.
**Method:** Scripted counting over `packages/core/src/traits/constants/` + direct source reading.

---

## 1. Why the Map Needs a Vision First

The catalog today is sorted by **theme** — `animals`, `magic-fantasy`, `cooking-food`,
`facial-expression`, `npc-roles`. Theme is a dimension of _appearance_. The ratified thesis names
a different axis as the one everything is judged on:

> The axis everything is judged on: **looks-right vs is-right.** … _Substrate (substance)_ carries
> the proof; _Skin (distribution)_ is how a human inhabits the proof and carries zero proof
> guarantee. Never let the skin claim the substrate's guarantee.

So the catalog is sorted on the axis the vision explicitly subordinates. That is the root cause of
the sprawl (2,400 names, 8 property schemas): nothing ever forced a trait to declare whether it
**carries proof** or **paints**. The trait map's job is to re-sort the catalog onto the axis the
moat actually lives on.

---

## 2. The Spine (founder-ruled)

### Axis 1 — Substrate vs Skin (binary, primary)

Every trait is exactly one of:

- **SUBSTRATE** — carries a proof obligation about reality. It lives on the **provable frontier**
  (physics, quantum, geometry, kinematics, causal), and its execution _is_ the proof: it has a
  contract that **discharges or falsifies, loudly and honestly**. Example: `@rigidbody`,
  `@solve_thermal`, `@kinematic_chain`, `@measurement`, `@provenance`.
- **SKIN** — distribution / presentation. How a human inhabits the proof. **No proof guarantee.**
  Example: `@glowing`, `@bioluminescent`, `@billboard`, `@npc_merchant`, `@stripe`.

The binary is the **honesty boundary** itself: the thesis says "prove only where reality has
checkable mathematical truth; label everything else as presentation." There is no third top-level
class — anything not on the provable frontier is skin. (For _navigability_ we sub-tag skin below;
that is a tag, not a third class, and does not weaken the binary.)

**Skin sub-tags (navigational only, not a class):**

- `skin/presentation` — render, audio, haptics, visual/thematic content (the literal "look").
- `skin/operational` — service/plumbing: auth, payment, devops, persistence, networking infra,
  integration. Neither proof nor render; the machinery that wires the system to the world.

> **Boundary note — crypto/ZK proofs.** `@zero_knowledge_proof`, signatures, etc. carry a proof,
> but it is a _cryptographic_ proof, **not** a proof about physical reality. They are
> `skin/operational`, not SUBSTRATE. Keeping these distinct preserves the honesty boundary: only
> reality-proofs may claim the substrate guarantee.

### Axis 2 — Contract Role (mandatory on SUBSTRATE, N/A on Skin)

The thesis's unit is "a parametric, proof-carrying, content-addressed, composable module" with one
contract shape: **preconditions → invariants → receipt.** So every substrate trait declares which
role(s) it plays in that shape (a trait may play more than one):

| Role             | Meaning                                                                               | Example trait : what it asserts                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **precondition** | Entry conditions that must hold for the proof to apply (the valid-parameter envelope) | `@rigidbody`: mass > 0 ∧ collider present · `@solve_thermal`: boundary conditions + conductivity defined                                                               |
| **invariant**    | A property maintained _during_ execution, checkable every step                        | `@rigidbody`: momentum/energy within solver tolerance · `@kinematic_chain`: joints within limits, no self-collision · `@safety_envelope`: actuation stays inside bound |
| **receipt**      | Verifiable evidence emitted of what actually happened                                 | `@provenance`: per-point class (observed\|interpolated\|generative) · `@spatial_proof`: composed proof artifact · `@measurement`: timestamped reading + uncertainty    |

This axis is what makes substrate traits **compose with the proof intact** — it is the machinery
remix inherits. Skin traits carry no contract role (`role: none`); claiming one is the exact
"skin claims the substrate's guarantee" violation the thesis forbids, and should be a gate error.

---

## 3. Decision Rules (reproducible — so the map is auditable, not vibes)

Apply in order to any trait:

1. **Does failure of this trait falsify a claim about reality?** (Would a physicist/engineer say
   "that's wrong," not "that's ugly"?) → if yes, **SUBSTRATE**.
2. **Does it solve/integrate/measure on the provable frontier** (physics, quantum, geometry,
   kinematics, causal)? → **SUBSTRATE**.
3. Otherwise, **does it make the system perceivable** (render/audio/haptic/visual/thematic)? →
   `skin/presentation`.
4. Otherwise it is `skin/operational` (auth, payment, data, devops, networking, integration).
5. If a single trait genuinely does both 1–2 _and_ 3 (e.g. a cloth trait that both simulates and
   shades), it is **MIXED** and must be **split into two traits** in the map — one substrate, one
   skin — never left straddling. MIXED is a _to-do marker_, not a final class.

---

## 4. First-Pass Result (category-level)

Classifying all 87 populated categories (2,400 names) by their dominant class:

| Class                             |  Names |    Share |
| --------------------------------- | -----: | -------: |
| **SUBSTRATE** (provable frontier) | **82** | **3.4%** |
| skin/presentation                 |  1,371 |    57.1% |
| skin/operational                  |    505 |    21.0% |
| MIXED (needs trait-level split)   |    442 |    18.4% |

**SUBSTRATE categories (today):** `simulation-domains` (23), `water-fluid` (19),
`measurement-sensing` (17), `physics-expansion` (12), `holomap-reconstruction` (11).

**The finding:** the proof-carrying core — _the entire moat_ — is **~3.4% of the named
vocabulary**, and even the optimistic ceiling (if every MIXED trait split majority-substrate, which
it won't) is ~22%. The catalog is ~78% skin. This is not a criticism of the skin — distribution is
real and necessary — it is the thesis made measurable: **the substance is a tiny, scattered
minority that the current theme-sorting actively hides.** Surfacing it is the point of the map.

**MIXED categories needing a trait-level split (442 names):** `material-properties` (33),
`fabric-cloth` (31), `weather-phenomena` (28), `object-interaction` (25), `construction-building`
(25), `physical-affordances` (22), `terrain-ocean` (20), `humanoid-avatar` (19), `safety-boundaries`
(15), `affinity` (15), `locomotion-movement` (14), `core-vr-interaction` (14), `audio` (10),
`fabrication-devices` (10), `geospatial-web3` (10), `transportation-vehicles` (12),
`healthcare-medical` (32), `intelligence-behavior` (41), `iot-autonomous-agents` (36),
`maritime-naval` (30). These are exactly the categories where physics/measurement sits fused with
appearance — e.g. cloth-sim + cloth-shading, terrain-erosion + terrain-look, real
physiology-sim + medical theming.

---

## 5. The Map Schema (what every trait carries after migration)

The trait map replaces theme-as-primary with a record per trait:

```jsonc
{
  "name": "rigidbody",
  "class": "substrate", // Axis 1 (binary, required)
  "frontier": "physics", // provable-frontier domain (substrate only)
  "contractRoles": ["precondition", "invariant", "receipt"], // Axis 2 (substrate only, ≥1)
  "domainTag": ["game-mechanics"], // theme demoted to a secondary tag (multi)
  "proofStatus": "real", // real | thin | overclaimed (per deep-ratchet taxonomy)
  "handler": "RigidbodyTrait.ts",
}
```

Two consequences fall out for free:

- **Gate rule:** `class: skin` ∧ non-empty `contractRoles` → build error (skin claiming the
  substrate guarantee). Directly enforces the thesis's central prohibition.
- **`proofStatus`** lets the map carry the deep-ratchet REAL/THIN/OVERCLAIMED verdicts
  (`research/2026-05-24_deep-ratchet-trait-solver.md`) so "is this substrate trait _actually_
  proving anything" is a queryable field, not tribal knowledge.

---

## 6. How This Serves the Vision

- It makes the **moat legible**: one query returns "the 82+ traits that carry proof," which is the
  product, separated from the 2,000+ that paint.
- It enforces the **honesty boundary** structurally (the gate rule), so skin can never silently
  borrow substrate's credibility — the deepest poison the thesis names.
- It turns **composition** into a checkable property: substrate traits compose via their
  precondition→invariant→receipt contracts, which is the "remix inherits the proof machinery"
  promise.
- It re-frames the §4 prior research's "92% are declarations" from a quality complaint into a
  **navigational fact**: most traits are skin, and skin _legitimately_ has no proof — the problem
  was only ever that substrate traits were indistinguishable from skin in the catalog.

---

## 7. Next Steps (the actual mapping work this framework unlocks)

1. **Trait-level MIXED split (442 names).** Walk each MIXED category; for every trait decide
   substrate-half vs skin-half per §3 rule 5, splitting where it genuinely straddles. This is where
   the substrate count grows from its 3.4% floor toward its true value.
2. **Substrate `contractRoles` assignment.** For every confirmed substrate trait, fill Axis 2 from
   its handler (preconditions it checks, invariants it maintains, receipt it emits). This _is_ the
   registry-metadata backfill from the §4 prior research, now with a vision-shaped schema.
3. **Wire the gate.** Implement `class: skin ∧ contractRoles≠∅ → error` in the pre-commit /
   HoloCI trait checks.
4. **Backfill `proofStatus`** from existing audits (deep-ratchet) and a `/stub-audit` sweep over
   the remaining substrate candidates.
5. **Emit the map** as the new generated artifact replacing the skeleton `trait-registry.json`
   (extend `scripts/generate-trait-registry.ts`).

---

## 8. What Remains After This Plan (Completeness Gaps)

- **This is category-level, not trait-level.** The 3.4% SUBSTRATE figure is a _floor_ derived from
  dominant-class-per-category; the true substrate count is unknown until the 442 MIXED names are
  split per trait (§7.1). The number will rise — by how much is not yet measured.
- **No code, no gate, no schema shipped.** This is the framework + ruling record. No traits were
  reclassified in source, the gate rule is specified but not implemented, and the map schema (§5)
  is proposed, not generated.
- **`contractRoles` are illustrative.** The §2 examples are hand-derived from trait names, not
  read out of each handler. Per-handler verification (§7.2) may find a "substrate" trait that
  actually carries no checkable contract — i.e. an OVERCLAIM — which the proofStatus field is meant
  to catch but which this pass did not audit.
- **Boundary calls are contestable.** crypto/ZK→operational, `intelligence-behavior`→MIXED,
  `procedural-generation`→presentation are defensible but not founder-ratified individually; a few
  may move on review.
- **Skin is not sub-audited.** The presentation/operational split is navigational; no claim is made
  about the quality or completeness of skin traits — only that they carry no proof obligation.
