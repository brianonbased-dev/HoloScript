# GOLD Game — Enhancement Backlog (from deep-ratchet, 2026-05-24)

> Produced by the `/deep-ratchet` workflow: subagents read the ACTUAL implementation behind each
> gate (not the verifier) and returned REAL / THIN / OVERCLAIMED + file:line. Bounded-safe gaps
> were **fixed in place** (G8 lookup bug `58cd9a715`; G4 wording `4d5f106fb`; G11 claim `58cd9a715`).
> The entries below are the gaps whose real fix is **unbounded or touches production behavior other
> consumers depend on** — so they get CONTEXT + INTENT + PATH here instead of a silent rewrite.
> Each is a candidate `/room` board task. Anything marked FOUNDER-GATE changes shared doctrine.

---

## E-G11 — Quantum-inspired curation that actually sharpens decisions — ✅ SHIPPED 2026-05-24

> Built plan-first + module-first via the founder-cleared NON-shared path (2): a gold-game-LOCAL
> sharpening layer — `gold-game-curation-sharpen.mjs` (9/9 unit tests). It is a mean-field-annealing
> analogue (Ising Hamiltonian, deterministic anneal) that FUSES a second noisy view and ferromagnetically
> COUPLES similar entries, moving near-boundary items off the fence. The SHARED `QuantumInspiredTrait`
> CPU fallback was deliberately NOT touched. gate-11 now asserts (19/19): ≥1 real flip vs the raw 0.5
> threshold (anti-tautology), mean curation accuracy 0.8625→0.9173 (+0.0548) over 200 synthetic cohorts,
> 73.1% of flips move TOWARD ground truth, 92.3% are near-boundary (confident items locked), and a
> NEGATIVE CONTROL (no evidence/coupling) collapses EXACTLY to raw (0 flips, equal accuracy) — proving the
> gain is the mechanism's, not annealing luck. GATES.md G11 tightened PASS\* → PASS. The GPU `SnnAccelerator`
> path (option 1) and real operator traces remain future deepenings, not blocking. Real-QPU stays /quantum-lab.

- **CONTEXT.** Gate 11 runs `CpuFallbackAccelerator.encode` → `cpuSigmoidActivation` (`packages/core/src/traits/QuantumInspiredTrait.ts:115-122`): a 0.5-centered logistic (k=10). It is monotonic and 0.5-centered, so it is **decision-neutral** against a 0.5 graduate/defer threshold — it cannot change which entries graduate. The `available=false` fallback (`:128-142`) is what runs CPU-side; the genuine annealing-analogue `SnnAccelerator` (GPU) is not exercised. Real `__qiState`/event wiring + receipt are genuine.
- **INTENT.** "Quantum-inspired curation **sharpens** graduate/defer decisions" should be TRUE: the transform should measurably move near-boundary (ambiguous) items off the fence using cohort context — i.e. change decisions a plain 0.5 threshold would not, in a way that improves curation quality.
- **PATH (founder-ruled 2026-05-24).** Do NOT change the shared `cpuSigmoidActivation` to satisfy this gate — coupling one gate's needs into shared curation infra is the wrong move (vision pillar 2 + Four Refusals). Two agent-decidable paths that DON'T touch shared behavior: (1) wire + verify the EXISTING real `SnnAccelerator` GPU path (the genuine annealing-analogue already in the trait) so the gate exercises real sharpening; or (2) build a gold-game-LOCAL sharpening layer. Either way add a verifier assertion that ≥1 decision FLIPS vs the raw 0.5 threshold (anti-tautology) and that flips improve a labelled quality metric.
- **RISK / OWNER.** The non-shared paths above are agent-decidable. What stays **JOSEPH-REVIEW-REQUIRED** is changing the _shared_ `QuantumInspiredTrait` CPU fallback's decision behavior ecosystem-wide — that's a runtime/product-behavior change to how ALL curation decides (not needed; the non-shared path exists). Until pursued, the honest `PASS*` stands. Co-owns with `/quantum-lab`.

## E-G16 — Acoustic traits as real Godot DSP, not comments — ✅ SHIPPED 2026-05-24

> Built plan-first + module-first: `packages/core/src/compiler/godot-acoustic-bus.ts` (pure module,
> 7/7 unit tests incl. metal≠glass negative control) composed into GodotCompiler; gate-16 evidence
> rewritten from comment-regex to structural + negative control; GodotCompiler 65/65 tests still pass.

- **CONTEXT.** `GodotCompiler.compileAudio` emits real `AudioStreamPlayer3D`/`AudioStreamPlayer` nodes from parsed data (`packages/.../GodotCompiler.ts:649-680`) — REAL. But `@audio_material` / `@audio_occlusion` / `@audio_portal` are emitted only as GDScript **comments** (`:536-545`, `# @audio_material — spatial audio: {config}`), not functional audio buses / `AudioEffect` nodes.
- **INTENT.** The acoustic annotations should drive real Godot acoustics: material → reverb/absorption bus, occlusion → low-pass on obstruction, portal → send between zones — so the soundscape actually changes with geometry, not just carries config.
- **PATH.** Map each acoustic trait to a Godot `AudioBus` + `AudioEffect*` (Reverb/LowPassFilter/Send) in `compileObject`; route `AudioStreamPlayer3D.bus` to the material bus; emit the bus layout. Add a verifier assertion that a material/occlusion change alters the emitted bus graph (not just a comment string).
- **RISK / OWNER.** Bounded to GodotCompiler audio path; no shared-doctrine impact. Good first board task.

## E-G5a — Fair baseline + non-trivial task for the trained policy — ✅ SHIPPED 2026-05-24

> Built plan-first + module-first: ML logic extracted to `gold-game-curation-policy.mjs` (6/6 unit
> tests); truth made NON-LINEAR (L·D keystone interaction); baseline replaced with a FAIR all-feature
> linear rule. Result: trained 1.00 vs fair 0.867 (margin 0.133) — wins by capturing the interaction
> a linear hand-rule can't; fair is non-trivial (<0.95) and beats the old crippled 0.60. gate-5a 10/10.
> Note: still synthetic data — real operator traces remain a future deepening (not blocking).

- **CONTEXT.** Gate 5a does genuine gradient descent and recovers the hidden linear generator on a held-out split (`gate-5a-trained-policy-verify.mjs:69-110`) — REAL learning. But the headline "1.00 vs 0.65" compares a correctly-specified linear model against a **deliberately crippled** baseline (`argmax lineage only`, `:108`) on **synthetic** data the verifier authored — a linear-fits-linear task vs a strawman.
- **INTENT.** The "trained beats heuristic" claim should hold against a _fair_ baseline on _real_ data, so the win reflects learning value, not a rigged contest.
- **PATH.** (1) Make the baseline use all 3 features with sensible hand-weights (fair strawman); (2) source real operator curation traces (or a non-linear synthetic generator) so the linear model can't trivially recover ground truth; (3) report the honest margin — even if it shrinks, that's the true result. Keep the held-out split.
- **RISK / OWNER.** Bounded to the gate; may lower the headline number (acceptable — honesty over flattery). Board task.

## E-G4 — Cross-process memory (+ learned-policy sub-item RETIRED) — ✅ SHIPPED 2026-05-24

> Built plan-first + module-first. Cross-process DONE: sessions now run in separate OS processes
> (`gold-game-causal-session.mjs` CLI spawned twice; distinct PIDs asserted; disk file the only
> channel), closing the "process-separated" overclaim; digests reproduce cross-process. gate-4 14/14.
> The "learned value policy" sub-item is RETIRED, not built: with 5 entries / 2 sessions, training a
> model would be ML theater — the honest mechanism is the experiential payoff memory (the plan-gate
> caught this before manufacturing thin work; F.076).

- **CONTEXT.** CausalWorldModel is a genuine Pearl SCM (`hololand-platform/src/world/causal.ts:113-209`, 30 tests) — REAL. NPC memory is real disk persistence that re-plans session 2, BUT both sessions run in one node process (no second invocation), and the value policy is a hand-authored payoff heuristic (self-disclosed honestScope).
- **INTENT.** "NPC memory across sessions" should survive a _real_ process boundary, and the re-plan should come from a _learned_ value model, not a hand-coded heuristic.
- **PATH.** (1) Split the verifier into two `node` invocations sharing the memory file (true cross-process proof); (2) replace the payoff heuristic with the Gate-5a-style learned policy reading persisted features.
- **RISK / OWNER.** Bounded to the gate + a small policy module. Board task.

## E-G10 — Reframed "recall 1.0" → lossless property; measured-recall RETIRED as a gate patch — ✅ RESOLVED 2026-05-24

> The plan-gate hit THREE walls on the proposed "measured recall" fix: (1) "point at live D:/GOLD"
> breaks the gate's portability (vault not in repo — the corpus is pinned ON PURPOSE); (2) lineage-recall
> is subjective (citations ≠ semantic similarity); (3) same-domain precision is dead on arrival — only
> ~5 vault entries carry a `domain` label. Forcing any of these = a contrived/meaningless metric (thin
> work). Done instead (bounded + honest): reframed the misleading word — "graph recall 1.0" → "LOSSLESS
> BY CONSTRUCTION (a correctness property, NOT a measured recall)" in the verifier check + receipt. The
> encoder is already proven REAL (genuine 768-dim, deterministic). The genuine enhancement — a semantic
> recall@k metric — needs a LABELED retrieval benchmark the vault doesn't have; that's a separate build,
> not a gate-10 patch. (Second time this session plan-first prevented a manufactured metric; cf. E-G4.)

- **CONTEXT.** HoloEmbedEncoder is a real 768-dim deterministic embedding + cosine retrieval (`HoloEmbedEncoder.ts:88-242`) — REAL. But "graph recall 1.0" is tautological: edges ARE the entries' stored `refs` and `traverse()` returns those same edges (self-disclosed `honestScope`), over a 6-entry pinned snapshot — the production `CodebaseGraph` over the live ~vault is not exercised.
- **INTENT.** Recall should be measured over the live GOLD vault graph (hundreds of entries) where retrieval is non-trivial, so "recall" reflects real retrieval quality, not stored-adjacency echo.
- **PATH.** Point the gate at the real vault catalog (reuse Gate-28's `vault-ops.readVaultCatalog`), build the lineage graph from real entries, hold out a query set, and measure recall@k against ground-truth lineage — report the honest (sub-1.0) number.
- **RISK / OWNER.** Bounded to the gate; depends on Gate-28 catalog (already REAL). Board task.

## E-G33 — Real anchor pose + trajectory + drift — ✅ SHIPPED 2026-05-24 (`10fb28d4a`, reconciled `3ce86da95`)

> Built by Codex (founder-cleared, E4) directly in production `HoloMapRuntime.step`, NOT as a gate-local
> patch — the coordinated multi-consumer change the plan-gate originally sized. Now derived (not canned):
> anchor pose = centroid of EVERY observed point (one tampered point moves the anchor — a bounds center
> wouldn't); anchor rotation = yaw aligned to the camera-trajectory heading; descriptor = observed-volume
> extent + global mean confidence; `estimatedDriftMeters` = registration residual (camera-pose deviation
> from a constant-velocity prediction), with loop closure firing on keyframe-position revisit. gate-33
> adds falsifiable negative controls: a one-byte capture tamper changes BOTH the anchor pose and the drift;
> drift accumulates > 0; descriptor equals the observed bounds extent (not the old `[1,0,0,1]` stub). The
> Gate-33/35 receipts were reconciled to the new anchor-pose density (`3ce86da95`). Honest residual scope
> (still NOT claimed, disclosed in `anchorScope`): a real physical-room scan video (a deterministic
> room-shaped fixture stands in) and full bundle-adjustment loop closure (revisit detection only); the
> micro-encoder still uses random-seeded weights, not a trained checkpoint — a larger ML task, spec'd separately.

- **CONTEXT.** The HoloMap reconstruct pipeline is real end-to-end — frame decode, tiling, 8-kernel transformer encode, point/bounds accumulation, real export compile (`HoloMapRuntime.ts:505-666`, `holo-reconstruct-export.ts:119-165`) — REAL. THIN only at: anchor pose is a constant `[0,0,0]`/identity and trajectory keyframes are empty with `estimatedDriftMeters=0` (`HoloMapRuntime.ts:629-644`); the micro-encoder uses random-seeded weights, not a trained checkpoint.
- **INTENT.** The anchor should carry a real estimated pose and the trajectory real keyframes derived from the per-frame encoder latents/centroids, so "anchored space" reflects actual reconstruction, not a placeholder transform.
- **PATH.** Derive pose from the accumulated point centroid + principal axes per frame; populate trajectory keyframes; estimate drift from inter-frame pose deltas. Longer term: load a trained micro-encoder checkpoint.
- **RISK / OWNER.** Bounded for pose/trajectory; the trained checkpoint is a larger ML task (spec separately). Board task for pose/trajectory.

---

### How this file is maintained

Every `/deep-ratchet` run appends/updates entries here for THIN/OVERCLAIMED findings it does not
fix in place. When an entry is built, move it to a `## SHIPPED` note with the landing commit (or
delete it — git is truth, F.009) and tighten the gate's `PASS*` back to `PASS` if the caveat is gone.
