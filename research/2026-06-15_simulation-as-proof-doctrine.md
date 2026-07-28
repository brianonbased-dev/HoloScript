# Doctrine: Simulation as Proof — the HoloScript North Star

**Date:** 2026-06-15
**Status:** CANON (founder-ratified 2026-06-15). This is the full articulation behind the
foundational thesis pinned at the top of `NORTH_STAR.md`. The hot file holds the compact pin; this
is the cold detail. Read this when a decision about papers, compilers, the runtime, the asset
pipeline, or the MMO needs to be tested against _why the project exists_.
**Branch:** `claude/hololand-holoscript-aaa-mmo-rbhty7`

---

## 1. The thesis in one sentence

**HoloScript exists so that anyone, using any AI, can produce a simulation that _is_ a theorem
about reality — where the simulation's execution constitutes the proof of its own correctness — and
where that proof is universal and remixable because it is parametric and composes.**

Not "here is a simulation, it kinda looks right." But "**the math is right**, and the simulation
_is_ that math, embodied."

---

## 2. The axis everything is judged on: _looks-right_ vs _is-right_

Conventional AI and graphics optimize for **looking right**. Games, diffusion models, neural
world-models — the loss is perceptual; the output is _plausible_; whether the underlying reality is
_true_ is incidental. "Kinda looks right" is the ceiling and the math is decorative or absent.

This project optimizes for **being right**. The AI is embodied as a mathematically-correct construct
whose very execution constitutes the proof — not a render that a separate checker validates after
the fact, but an object where _being the simulation_ and _proving the math_ are the same act.
Looking-right is downstream and optional; being-provably-right is the substance.

This is **proofs-as-programs** (Curry–Howard) lifted into embodiment: a well-typed program _is_ a
proof of its proposition; here a contract-bound simulation _is_ a proof of the reality it claims.
The CAEL receipt is not evidence stapled to a guess — it is the witness that the math held. The
quantum receipt chain is the purest case: you cannot fake the N₂ ground-state energy by looking
right; either it matches the Hamiltonian's true value or it does not.

**Why this is categorically bigger:** "looks right" is collapsing to a commodity — anyone with a
GPU has it. "Is provably right" is a different category of artifact and is the entire sovereign
moat. The product is not better-looking simulations; it is **true** ones — simulations you can build
a science, an economy, and a civilization on because their correctness is a theorem, not an
impression.

---

## 3. The substrate / skin cleave

Everything in the system is one of two things, and they must never be confused:

- **Math-true substrate (the substance).** SimulationContract / CAEL / Lean mechanization /
  conjecture engine, and the simulation-target compilers (USD-physics/Isaac, URDF/SDF robotics,
  quantum, SCM/causal, NIR/neuromorphic). These can carry "the math is right."
- **Perceptual skin (the distribution / embodiment).** The native runtime render, asset pipeline,
  Gaussian splats, the HoloLand MMO client. These are how a human _inhabits_ the true simulation —
  never the proof itself.

**The deepest poison is optimizing for "looks right."** It is the same gravity well as the `.tsx`
escape hatch, one level up: it pulls the whole enterprise back toward appearance and away from
proof. Visuals are how the proof becomes inhabitable (the MMO's real job); they must never claim the
substrate's guarantee.

---

## 4. The provable frontier (honesty boundary)

"The math is right" is achievable **only where reality has a checkable mathematical ground truth** —
physics, quantum, geometry, kinematics, causal structure. That is exactly where the flagship work
lives. Where reality is genuinely perceptual or behavioral (aesthetics, open narrative, human social
dynamics), there _is no theorem to discharge_, and claiming proof there is "looks right" dishonesty
in a lab coat.

**The discipline:** prove what is provable, label the rest as presentation, and never let the skin
claim the substrate's guarantee. This boundary is what keeps "the math is right" from eroding into
"trust us."

---

## 5. Universal + adjustable, without breaking the proof

A proof is exact and fixed; remix and alternative games demand open, infinite adjustability. The
contradiction is resolved by one move:

**Prove the _space_, not the _instance_.** A contract never says "this value is correct." It says
"for any parameters satisfying these preconditions, the output satisfies these invariants" — a
parametric (dependent) proof. Adjustment then has two cases, and the system always knows which:

- **Within the proven envelope** → still provably correct, automatically. The proof travels with the
  parameters; you tuned, the math still holds, no re-work.
- **Beyond the envelope** (structural change, not a knob) → the contract **re-discharges or
  falsifies, loudly and honestly**: "your remix left the proven region; here is what is no longer
  guaranteed." Adjustability is preserved; the lie that it is still proven is not.

The unit of the system therefore is not "a finished simulation" but **a parametric, proof-carrying,
content-addressed, composable module.** A remix is a new region of parameter-space plus a new
composition of modules, and it **inherits the proof machinery** — fork, adjust, and the contract
re-runs and tells you instantly whether your fork is still true and _where_ it broke if not.
Prosperity comes from remixes that are _trustable_, not merely pretty.

### Tiered adjustability (mapped onto the cleave)

| Layer                                            | Adjust freely?  | Proof obligation                                  |
| ------------------------------------------------ | --------------- | ------------------------------------------------- |
| **Skin** (visuals, assets, aesthetics)           | Yes, infinitely | None — never claimed proven                       |
| **Parametric substrate** (knobs within envelope) | Yes             | Proof auto-travels                                |
| **Structural substrate** (new physics/equations) | Yes             | Must re-discharge — certified or honestly flagged |
| **Game logic** (rules over the proven world)     | Yes             | Bounded by the substrate's guarantees             |

**Game vs reality:** alternative games are different rule-sets / objectives / narratives layered
over the _same proven physics substrate_. The reality is shared and provable; the game on top is
freely adjustable. Ten alternative games = ten rule-sets over one true world.

### What "universal" means concretely

1. **One substrate — target/family/embodiment-neutral.** A single `.holo` semantic graph, authored
   by _any_ AI, embodied on _any_ surface (web/VR/MMO/headset). Universality is impossible with N
   forked render compilers; it _demands_ one substrate.
2. **One contract shape.** Every module — quantum, kinematic, causal — carries the same proof
   interface (preconditions → invariants → receipt). That uniformity is what lets _arbitrary_
   remixes compose and be checked the same way.

---

## 6. Consequences this thesis forces (the downstream rulings)

1. **Native-runtime consolidation is non-negotiable.** Universality requires one substrate, so the
   apex-poison web compilers (R3F/`.tsx`, ThreeJS, Babylon, PlayCanvas, Native2D, …) must collapse
   into the single native runtime. (See `2026-06-15_compiler-poison-and-native-runtime.md` and
   `2026-06-15_trait-parity-and-tsx-deprecation.md`.) This is not hygiene — it is a requirement of
   the north star.
2. **Promote Paper 29 (Algebraic Trust / composition law) and Paper 3 (Spatial CRDT) to CORE.**
   Paper 29 is the theorem that _composition of verified modules stays verified_ — the backbone of
   "remixable AND provable." Paper 3 is convergence for _concurrent_ adjustment (many users, one
   world). (See `2026-06-15_paper-program-vs-northstar.md` if filed.)
3. **Re-gate the paper program** from "novel + publishable" (STRATEGY.md D.042) to **"proves the
   loop OR advances the distribution engine (MMO/marketplace) — everything else is an infra report,
   not a paper slot."** ~17/40 papers are domain trophies against this north star; the _gate_ is the
   real distraction.
4. **The contract must carry its own envelope.** HoloScript needs the _valid parameter domain_ to be
   first-class on a SimulationContract, and remix must auto-re-run the contract. "Did my adjustment
   stay true?" must be a question the substrate answers, not the user.
5. **Skin work is scoped as distribution, never as proof.** Photoreal assets, splats, AAA visuals,
   the MMO render — necessary for embodiment and prosperity, but they inherit zero proof guarantees
   and must never be presented as if they do.

---

## 7. The flagships that already are this north star

- **TVCG — Trust by Construction:** the manifesto of the generate→simulate→falsify→prove contract,
  scale-aware (quantum→continuum).
- **Paper 22 — Mechanized SimulationContract (Lean 4):** the literal "MATHEMATICALLY PROVES" — 4
  invariants kernel-checked, 0 `sorry`.
- **Paper 23 — Formal Semantics of HS Core (Lean):** proves the language substrate itself is sound.
- **Paper 37 — Quantum Receipt Chain:** the hardest exotic-domain proof; you cannot fake it by
  looking right.
- **Paper 34 — Differentiable Surrogate + Receipts**, **0c — CAEL**, **36 — Conjecture Engine:** the
  fast path, the falsification machinery, the symbolic/geometric extension.

---

## 8. What Remains (honest gap)

- This doctrine pins the _why_; it does not by itself build the contract-carries-envelope mechanism,
  consolidate the runtime, or re-gate the program. Those are the forced consequences (§6), each its
  own track.
- The provable frontier (§4) is asserted, not formally delimited. A precise statement of _which
  domains admit a discharged proof vs. which are inherently perceptual_ is itself worth a paper.
- "Composition preserves proof" (§5) is conditional on the algebraic-trust conditions (Paper 29);
  some compositions will not preserve the proof and the system must flag them. The conditions are
  not yet fully mechanized.
- The MMO-scale multiplayer and live marketplace backend remain unbuilt (see the readiness
  scorecard in `2026-06-15_trait-parity-and-tsx-deprecation.md`); this doctrine governs them but
  does not deliver them.
