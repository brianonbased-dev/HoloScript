# GOLD Game — Enhancement Backlog (from deep-ratchet, 2026-05-24)

> Produced by the `/deep-ratchet` workflow: subagents read the ACTUAL implementation behind each
> gate (not the verifier) and returned REAL / THIN / OVERCLAIMED + file:line. Bounded-safe gaps
> were **fixed in place** (G8 lookup bug `58cd9a715`; G4 wording `4d5f106fb`; G11 claim `58cd9a715`).
> The entries below are the gaps whose real fix is **unbounded or touches production behavior other
> consumers depend on** — so they get CONTEXT + INTENT + PATH here instead of a silent rewrite.
> Each is a candidate `/room` board task. Anything marked FOUNDER-GATE changes shared doctrine.

---

## E-G11 — Quantum-inspired curation that actually sharpens decisions
- **CONTEXT.** Gate 11 runs `CpuFallbackAccelerator.encode` → `cpuSigmoidActivation` (`packages/core/src/traits/QuantumInspiredTrait.ts:115-122`): a 0.5-centered logistic (k=10). It is monotonic and 0.5-centered, so it is **decision-neutral** against a 0.5 graduate/defer threshold — it cannot change which entries graduate. The `available=false` fallback (`:128-142`) is what runs CPU-side; the genuine annealing-analogue `SnnAccelerator` (GPU) is not exercised. Real `__qiState`/event wiring + receipt are genuine.
- **INTENT.** "Quantum-inspired curation **sharpens** graduate/defer decisions" should be TRUE: the transform should measurably move near-boundary (ambiguous) items off the fence using cohort context — i.e. change decisions a plain 0.5 threshold would not, in a way that improves curation quality.
- **PATH (founder-ruled 2026-05-24).** Do NOT change the shared `cpuSigmoidActivation` to satisfy this gate — coupling one gate's needs into shared curation infra is the wrong move (vision pillar 2 + Four Refusals). Two agent-decidable paths that DON'T touch shared behavior: (1) wire + verify the EXISTING real `SnnAccelerator` GPU path (the genuine annealing-analogue already in the trait) so the gate exercises real sharpening; or (2) build a gold-game-LOCAL sharpening layer. Either way add a verifier assertion that ≥1 decision FLIPS vs the raw 0.5 threshold (anti-tautology) and that flips improve a labelled quality metric.
- **RISK / OWNER.** The non-shared paths above are agent-decidable. What stays **JOSEPH-REVIEW-REQUIRED** is changing the *shared* `QuantumInspiredTrait` CPU fallback's decision behavior ecosystem-wide — that's a runtime/product-behavior change to how ALL curation decides (not needed; the non-shared path exists). Until pursued, the honest `PASS*` stands. Co-owns with `/quantum-lab`.

## E-G16 — Acoustic traits as real Godot DSP, not comments — ✅ SHIPPED 2026-05-24
> Built plan-first + module-first: `packages/core/src/compiler/godot-acoustic-bus.ts` (pure module,
> 7/7 unit tests incl. metal≠glass negative control) composed into GodotCompiler; gate-16 evidence
> rewritten from comment-regex to structural + negative control; GodotCompiler 65/65 tests still pass.
- **CONTEXT.** `GodotCompiler.compileAudio` emits real `AudioStreamPlayer3D`/`AudioStreamPlayer` nodes from parsed data (`packages/.../GodotCompiler.ts:649-680`) — REAL. But `@audio_material` / `@audio_occlusion` / `@audio_portal` are emitted only as GDScript **comments** (`:536-545`, `# @audio_material — spatial audio: {config}`), not functional audio buses / `AudioEffect` nodes.
- **INTENT.** The acoustic annotations should drive real Godot acoustics: material → reverb/absorption bus, occlusion → low-pass on obstruction, portal → send between zones — so the soundscape actually changes with geometry, not just carries config.
- **PATH.** Map each acoustic trait to a Godot `AudioBus` + `AudioEffect*` (Reverb/LowPassFilter/Send) in `compileObject`; route `AudioStreamPlayer3D.bus` to the material bus; emit the bus layout. Add a verifier assertion that a material/occlusion change alters the emitted bus graph (not just a comment string).
- **RISK / OWNER.** Bounded to GodotCompiler audio path; no shared-doctrine impact. Good first board task.

## E-G5a — Fair baseline + real operator traces for the trained policy
- **CONTEXT.** Gate 5a does genuine gradient descent and recovers the hidden linear generator on a held-out split (`gate-5a-trained-policy-verify.mjs:69-110`) — REAL learning. But the headline "1.00 vs 0.65" compares a correctly-specified linear model against a **deliberately crippled** baseline (`argmax lineage only`, `:108`) on **synthetic** data the verifier authored — a linear-fits-linear task vs a strawman.
- **INTENT.** The "trained beats heuristic" claim should hold against a *fair* baseline on *real* data, so the win reflects learning value, not a rigged contest.
- **PATH.** (1) Make the baseline use all 3 features with sensible hand-weights (fair strawman); (2) source real operator curation traces (or a non-linear synthetic generator) so the linear model can't trivially recover ground truth; (3) report the honest margin — even if it shrinks, that's the true result. Keep the held-out split.
- **RISK / OWNER.** Bounded to the gate; may lower the headline number (acceptable — honesty over flattery). Board task.

## E-G4 — Cross-process memory + learned value policy
- **CONTEXT.** CausalWorldModel is a genuine Pearl SCM (`hololand-platform/src/world/causal.ts:113-209`, 30 tests) — REAL. NPC memory is real disk persistence that re-plans session 2, BUT both sessions run in one node process (no second invocation), and the value policy is a hand-authored payoff heuristic (self-disclosed honestScope).
- **INTENT.** "NPC memory across sessions" should survive a *real* process boundary, and the re-plan should come from a *learned* value model, not a hand-coded heuristic.
- **PATH.** (1) Split the verifier into two `node` invocations sharing the memory file (true cross-process proof); (2) replace the payoff heuristic with the Gate-5a-style learned policy reading persisted features. 
- **RISK / OWNER.** Bounded to the gate + a small policy module. Board task.

## E-G10 — Live-vault graph recall (not a 6-entry pinned snapshot)
- **CONTEXT.** HoloEmbedEncoder is a real 768-dim deterministic embedding + cosine retrieval (`HoloEmbedEncoder.ts:88-242`) — REAL. But "graph recall 1.0" is tautological: edges ARE the entries' stored `refs` and `traverse()` returns those same edges (self-disclosed `honestScope`), over a 6-entry pinned snapshot — the production `CodebaseGraph` over the live ~vault is not exercised.
- **INTENT.** Recall should be measured over the live GOLD vault graph (hundreds of entries) where retrieval is non-trivial, so "recall" reflects real retrieval quality, not stored-adjacency echo.
- **PATH.** Point the gate at the real vault catalog (reuse Gate-28's `vault-ops.readVaultCatalog`), build the lineage graph from real entries, hold out a query set, and measure recall@k against ground-truth lineage — report the honest (sub-1.0) number.
- **RISK / OWNER.** Bounded to the gate; depends on Gate-28 catalog (already REAL). Board task.

## E-G33 — Real anchor pose + trajectory (not canned constants)
- **CONTEXT.** The HoloMap reconstruct pipeline is real end-to-end — frame decode, tiling, 8-kernel transformer encode, point/bounds accumulation, real export compile (`HoloMapRuntime.ts:505-666`, `holo-reconstruct-export.ts:119-165`) — REAL. THIN only at: anchor pose is a constant `[0,0,0]`/identity and trajectory keyframes are empty with `estimatedDriftMeters=0` (`HoloMapRuntime.ts:629-644`); the micro-encoder uses random-seeded weights, not a trained checkpoint.
- **INTENT.** The anchor should carry a real estimated pose and the trajectory real keyframes derived from the per-frame encoder latents/centroids, so "anchored space" reflects actual reconstruction, not a placeholder transform.
- **PATH.** Derive pose from the accumulated point centroid + principal axes per frame; populate trajectory keyframes; estimate drift from inter-frame pose deltas. Longer term: load a trained micro-encoder checkpoint.
- **RISK / OWNER.** Bounded for pose/trajectory; the trained checkpoint is a larger ML task (spec separately). Board task for pose/trajectory.

---

### How this file is maintained
Every `/deep-ratchet` run appends/updates entries here for THIN/OVERCLAIMED findings it does not
fix in place. When an entry is built, move it to a `## SHIPPED` note with the landing commit (or
delete it — git is truth, F.009) and tighten the gate's `PASS*` back to `PASS` if the caveat is gone.
