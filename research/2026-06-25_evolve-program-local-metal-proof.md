# `@evolve_program` — gated self-improvement on local metal (Increment 1)

**Date:** 2026-06-25 · **Surface:** claude1 · **Domain:** language (D.101) · **Status:** shipped + proven

## What this is

A **verifier-gated evolutionary loop** ("AlphaEvolve done correctly, locally"),
authored native per D.101/D.108 as a trait + named backend — the safe inversion
of the "agents rewrite their own code without guardrails" framing from the Mo
Gawdat / DOAC interview (`youtu.be/RwlgFC6S-OE`). The thesis: **the guardrail IS
the engine.** AlphaEvolve / the Darwin Gödel Machine work _because_ of a hard
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
  Trait-parity gate green (`node scripts/holo-ci/check-trait-parity.mjs`).
- **`EvolveProgramBackend.ts`** (`packages/core/src/evolution/`): the gated
  executor. `runEvolution(seed, policy, {propose, gate})` is pure + injectable;
  `makeOllamaProposer(endpoint, model)` is the default **sovereign local-metal**
  proposer (Jetson Ollama, no cloud).

### The five guardrails (each is the engine, not the brake)

1. **Correctness gate** — a candidate that fails is _discarded, never archived_
   (`if (!gate.passed) continue`). This is the selection pressure.
2. **Numeric fitness** (lower-is-better) — the gradient evolution climbs.
3. **Sandbox / propose-not-ship** — `bestCode` is surfaced only when it _beat the
   seed_; promotion to the live tree is a human decision. The loop never self-ships.
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
and the system _did not degrade, did not self-ship, did not regress_ — it kept the
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

Founder insight: the _discarded failures are verifier-labeled training data_. The
same gate that protects the code (Loop 1) automatically labels the data for
improving the _model_ (Loop 2). This is already a live ecosystem pattern — the
runtime agent (`runner.ts recordTrace`) emits graded REC-SHAPE rows that
`scripts/corpus/harvest_real.py` reads; the grader-gate (`de632431`,
"close-the-poison-vector") routes them `passed:true → SFT`, `passed:false → DPO/
contrast`. The evolve loop is a _superior_ source: verifier-labeled by the test
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
which failed the JS-shaped gate. That model bias _is_ what DPO corrects, and it
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
but _fine-tuning_ is GPU: the Jetson (8GB) is too small, it needs the sovereign
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

---

## Strategic corpus accrual — first batch (quality / unique / strategic)

To accrue training data that is QUALITY, UNIQUE, and STRATEGIC (founder bar), the
accrual harness (`EvolveProgramBackend.accrue.test.ts`) runs the gated loop across
a portfolio of **real, diverse, HoloScript-native seeds** with **native parse
gates**, deduped:

- **Quality** = the gate is a real parser (`parseHolo` / HSPlus `parse`) PLUS a
  preserved-construct check — "pass" means valid + intact, not merely non-empty.
- **Unique** = a content-hash dedup sink drops repeats (reports the dedup ratio).
- **Strategic** = 5 real repo seeds spanning the surface the ecosystem needs the
  model to author (D.104/D.108): the `provenance_densify` + `evolve_program`
  `@trait` definitions, a `@state_machine` brain, and two `.holo` worlds.

**First clean batch on the Jetson (`brittney-edge:v0-4`):**

```
5 targets, ALL 5 seeds parsed | gated=8  UNIQUE=7  deduped=1
chosen/SFT=7  rejected/DPO=0  | quality(pass)=~100%  formats=2 (.holo + .hsplus)
IMPROVED: 3 (provenance_densify, evolve_program, brittney) | NO_IMPROVEMENT: 2
```

**The headline:** on _native_ targets the local model didn't just produce valid
candidates — it found **3 genuine improvements** (denser, parse-clean,
construct-preserved HoloScript), where on the JS toy it found 0/6. Native targets
match the HoloScript-tuned model's competence → quality data _and_ real wins. The
dedup sink caught 1 duplicate (uniqueness), 2 formats (diversity).

**Findings this iteration (honest):**

1. _Format is by CONSTRUCT, not extension._ `@trait {…}` files parse via
   `parseHolo`; `composition + @state_machine` via the HSPlus `parse` — regardless
   of the `.hsplus` extension (F.120, two parsers). My first labels were inverted
   (3/5 SEED_INVALID); a fast in-process seed-parseability diagnostic caught it and
   is now a permanent regression check.
2. _Big native seeds are slow._ The model regenerates the WHOLE 60–90-line file
   per proposal (~60s on the Jetson). A 5-target interactive batch stays small —
   so the **real corpus must grow via SCHEDULED/background accrual on the Jetson**,
   not interactive runs (free, but slow per step).
3. _Low DPO contrast._ With parse+preserve gates the tuned model passed everything
   (great SFT, 0 rejected). Richer DPO/negative data needs harder gates or harder
   targets — a fitness/gate-tightening follow-up.

Reproduce: `EVOLVE_ACCRUE=1 pnpm --filter @holoscript/core exec vitest run
src/evolution/__tests__/EvolveProgramBackend.accrue.test.ts` (writes deduped
REC-SHAPE rows to `EVOLVE_CORPUS_DIR`, default `.scratch/evolve-corpus`).

### Next: continuous accrual → fine-tune

The interactive batch PROVES the corpus generator. The corpus grows by scheduling
the accrual on the Jetson (free local metal) — e.g. `/scheduler` or a systemd timer
running the portfolio nightly, accumulating REC-SHAPE rows into
`HOLOSCRIPT_AGENT_TRACE_DIR`. When the corpus is large enough, the staged HoloTune
fine-tune (Vast fleet, GPU-spend gated) closes the loop to `brittney-edge:v0-5`.

### Continuous accrual — registered, and the honest executor reality

Scheduled as a HoloShell Team automation `evolve-corpus-accrual` (every 4h,
`b913f9d3`). **Verified execution model** (`scripts/holoshell-team-automations.mjs`):
the runner does NOT execute the command — every interval it **enqueues a BOARD
TASK** ("claim, run the local commands from the workspace, validate, close via
`/room done`"; false-green guard: only counts when a real task id returns). So the
schedule is a recurring _reminder-as-board-task_, not a self-running cron.

**Executor gap (W.GOLD.560, surfaced not papered over):** that task needs an agent
that can run `pnpm vitest` from the HoloScript workspace with the Jetson reachable
— i.e. this laptop. The Jetson agents can't (model store, not the repo+node*modules,
W.755), and no autonomous laptop board-claimer runs. So the recurring task waits
for a capable agent to execute it; the corpus grows when \_run*, which is proven but
not yet autonomous.

**Bootstrapped the real corpus** (manual run into the persistent dir): 7 unique
verifier-labeled rows across all 5 targets, cross-run dedup armed.

### CORRECTION (grounded in JETSON.md per F.123) — the "executor gap" above was wrong

Re-reading the Jetson SSOT corrected three assumptions the section above rests on:

1. **The agent runs on a DESKTOP SEAT (the laptop), not the Jetson** — JETSON.md:
   "the node joins the mesh as `jetson-orin-super` via the AgentRunner _driven from
   a desktop seat, pointed at the node for inference_." So the agent HAS the repo
   and CAN run `pnpm vitest`. "Jetson agents can't run it (no repo)" was false → the
   "executor gap" / the staged "Jetson idle-loop in-process" plan are largely moot.
   (The holoscript-agent is also no-`@holoscript/core`-dep by design, so an
   in-process `accrueOneStep` import was the wrong approach anyway.)
2. **The executor likely already exists**: the `evolve-corpus-accrual` automation
   (4h) enqueues a board task; a board-claiming agent on the laptop (e.g. `a-022`
   board-triage, 2h) can claim + run it → corpus grows. No bundle, no runner.ts
   change, no core dep. (An esbuild "Jetson bundle" started here was deleted — it
   solved a non-problem.)
3. **The fine-tune can be $0 on the Jetson** — JETSON.md: "fine-tune node — small
   LoRA/QLoRA runs on the 1 TB NVMe; large multi-GPU escalate to the fleet." So the
   staged fine-tune does NOT need the Vast-fleet GPU spend; the founder spend
   approval applies only to a _large_ multi-GPU run. Jetson model = `qwen3:4b` (not
   `brittney-edge`); corpus canonical home = `/mnt/nvme/holo/datasets/`.

Lesson (F.123, founder 2026-06-25): read the surface SSOT before building
deployment for it. The guardrails (founder-skill nudge + F.123) correctly caught
the assumption-based bundle before it shipped — the real remaining work is small:
verify the accrual automation fires + a board-claimer runs it, and (when the corpus
is adequate) run the small LoRA/QLoRA on the Jetson for $0.
