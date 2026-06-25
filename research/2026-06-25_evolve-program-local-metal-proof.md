# `@evolve_program` — gated self-improvement on local metal (Increment 1)

**Date:** 2026-06-25 · **Surface:** claude1 · **Domain:** language (D.101) · **Status:** shipped + proven

## What this is

A **verifier-gated evolutionary loop** ("AlphaEvolve done correctly, locally"),
authored native per D.101/D.108 as a trait + named backend — the safe inversion
of the "agents rewrite their own code without guardrails" framing from the Mo
Gawdat / DOAC interview (`youtu.be/RwlgFC6S-OE`). The thesis: **the guardrail IS
the engine.** AlphaEvolve / the Darwin Gödel Machine work *because* of a hard
verifier, not despite one; strip it and a self-rewriting agent reward-hacks and
rots. We already own the verifiers (tests, WASM smoke, conformance) — this closes
them into a standing select-and-keep loop.

## Deliverable (native, D.101-clean)

Mirrors the `@provenance_densify` + `GenerativeDensifierBackend` precedent — a
**trait + named backend**, reusing existing gates as fitness (no new tooling, no
carve-out needed):

- **`@evolve_program` trait** (3 native layers): `evolve_program.hsplus`
  (authoring surface — the policy as DATA), `evolve_program.holo` (IR),
  `EvolveProgramTrait.ts` (ECS handler). Registered in the barrel + `VRTraitSystem`.
  Trait-parity gate: ✓ 101 traits covered.
- **`EvolveProgramBackend.ts`** (`packages/core/src/evolution/`): the gated
  executor. `runEvolution(seed, policy, {propose, gate})` is pure + injectable;
  `makeOllamaProposer(endpoint, model)` is the default **sovereign local-metal**
  proposer (Jetson Ollama, no cloud).

### The five guardrails (each is the engine, not the brake)

1. **Correctness gate** — a candidate that fails is *discarded, never archived*
   (`if (!gate.passed) continue`). This is the selection pressure.
2. **Numeric fitness** (lower-is-better) — the gradient evolution climbs.
3. **Sandbox / propose-not-ship** — `bestCode` is surfaced only when it *beat the
   seed*; promotion to the live tree is a human decision. The loop never self-ships.
4. **Bounded search** (`generations`) — the compute guardrail.
5. **Provenance receipt** — `{result, traceJSONL, verifyUrl}` with a per-candidate
   trail + a `cael:sha256:` content anchor. Fully auditable.

## Local-metal proof (real Jetson, 33.6s inference)

Ran the gated loop with the on-device `brittney-edge:v0-4` model proposing real
mutations of a small function (goal: "make it shorter while it still greets by
name"). Receipt:

```
result: NO_IMPROVEMENT      proposerModel: brittney-edge:v0-4 (holojetson.local:11434)
seedScore: 78  →  bestScore: 78        evaluated: 7   survivors: 1   discarded: 6
verifierGated: true   selfShips: false   verifyUrl: cael:sha256:2230fedb5efb4cc0…947a9460
```

Per-candidate trace: the small model proposed **6 mutations — every one longer
(135–145B vs 78) and gate-failing** (it dropped the `greet`/`name` markers). The
verifier **discarded all 6**; the validated seed survived; nothing was shipped.

**This is the whole point.** A weak proposer produced 6 broken/longer candidates
and the system *did not degrade, did not self-ship, did not regress* — it kept the
baseline and reported `NO_IMPROVEMENT` honestly, with a full audit trail. Without
the gate those candidates corrupt the program; with it, the loop is sound even on
a weak local model. (Reproduce: `EVOLVE_LOCAL_METAL_PROOF=1 pnpm --filter
@holoscript/core exec vitest run
src/evolution/__tests__/EvolveProgramBackend.local-metal.test.ts`.)

## Validation

- Unit: `EvolveProgramTrait.test.ts` (4) + `EvolveProgramBackend.test.ts` (4) —
  8/8 green; proves discard-on-fail, archive-on-improve, SEED_INVALID,
  NO_IMPROVEMENT, propose-not-ship, deterministic anchor.
- Trait-parity gate ✓ · core typecheck clean.
- Local-metal proof (guarded) ✓ on the live Jetson.

## Next increments (clearly scoped, not done here)

1. **Deep target run** — wire the `WASMCompiler` (`.holo`→WAT) gate
   (`pnpm --filter @holoscript/core exec vitest run src/compiler/WASMCompiler.test.ts`,
   fitness = `result.wat.length` / `memoryLayout.totalSize`, baselines seeded) as
   the fitness oracle, with a stronger sovereign-fleet coder (qwen3-coder) as the
   proposer for mutation quality. Worktree-isolated per-candidate eval (the
   monorepo-install cost is the open practical problem — amortize one worktree per
   run).
2. **Full `compile_to_evolved_program` MCP target** — the 10-step registration
   (CircuitBreaker union → sovereign-targets classification → CompilerFactory →
   DialectRegistry → MCP tool) so the loop is invokable as a first-class compile
   target and schedulable on the Jetson via `/scheduler`.
3. **Trait→backend wiring** — `evolve_program_declared` event drives the backend
   at compile time.

---

## Loop 2 — the training-data bridge (shipped, closes the "small agent problem")

Founder insight: the *discarded failures are verifier-labeled training data*. The
same gate that protects the code (Loop 1) automatically labels the data for
improving the *model* (Loop 2). This is already a live ecosystem pattern — the
runtime agent (`runner.ts recordTrace`) emits graded REC-SHAPE rows that
`scripts/corpus/harvest_real.py` reads; the grader-gate (`de632431`,
"close-the-poison-vector") routes them `passed:true → SFT`, `passed:false → DPO/
contrast`. The evolve loop is a *superior* source: verifier-labeled by the test
suite, not just artifact-grounding.

**Built:** `EvolveProgramBackend` now emits every gated candidate via an injected
`onCandidate` hook, and `toGradedTraceRow()` renders the exact harvest REC-SHAPE
(`{system, user, target, grader, family:'program-evolution', modality:'code',
source:'evolve-loop', agentId, ts}`). Pure + injectable; the sink is the caller's.

**Proven on local metal (same Jetson run):** the 6 gated failures became **6
graded DPO-rejected rows**, harvest-ready. Confirmed against `harvest_real.py`'s
`_grader_passed(rec)` — `rec.grader.passed is True → SFT`, else `→ DPO/contrast` —
so the evolve rows flow into the existing pipeline **unchanged**.

**An honest signal in the generated data:** `brittney-edge:v0-4` (fine-tuned on
HoloScript) kept rewriting the JS seed into `@trait { … }` HoloScript syntax —
which failed the JS-shaped gate. That model bias *is* what DPO corrects, and it
argues for HoloScript-native targets (the WASMCompiler / `.hs` next increment
matches the model's competence). The loop captured the bias as labeled rejection
data — exactly the point.

**The closed loop:**
```
evolve (Loop 1, test-gated) → graded REC-SHAPE rows (chosen=SFT / rejected=DPO)
  → harvest_real.py grader-gate → DPO/SFT corpus → HoloTune fine-tune
  → brittney-edge:v0-5 → proposes better → finds improvements v0-4 couldn't → ↻
```
Data generation is **free on local metal** and accumulates per run.

**Loop-2 guardrails (mirror Loop 1's propose-not-ship):** (a) grader-gate on the
harvest (existing) — train only on verifier-labeled data; (b) held-out eval before
`holotune_promote` — never auto-redeploy a regression; (c) verifier independent of
the proposer (the test-gate ≠ the model); (d) **spend** — generating data is free,
but *fine-tuning* is GPU: the Jetson (8GB) is too small, it needs the sovereign
Vast fleet, and >$100/day GPU is the founder gate.

### Staged: the fine-tune run (the one GPU-spend step)

Not run here — it needs accumulated data (one run ≈ 6 rows) and the spend
decision. The pipeline already exists: point an `@evolve_program` policy at a
HoloScript-native target, schedule N runs on the Jetson (free) to accumulate the
trace corpus, then `holotune` curate → launch (Vast fleet, qwen3-coder or a
brittney-edge continue-train) → eval (held-out) → promote → serve back to the
Jetson as `brittney-edge:v0-5`. Reproduce the data step:
`EVOLVE_LOCAL_METAL_PROOF=1 pnpm --filter @holoscript/core exec vitest run
src/evolution/__tests__/EvolveProgramBackend.local-metal.test.ts`.
