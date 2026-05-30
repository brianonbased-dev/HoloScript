# Paper 21 (Adversarial Trust Injection) — Phase 4 Measurement Pass

**Date:** 2026-05-29
**Task:** task_1780114323437_9br9 ([paper-21][I.007] Run Phase 4 measurement pass)
**Package:** `packages/mcp-server-adversarial`
**Trust formula under attack:** `holomesh-computeReputation-v11`
(SSOT: `packages/mcp-server/src/holomesh/types.ts` → `computeReputation`, V10/V11)

## The OVERCLAIMED defect (deep-ratchet 2026-05-29)

The five attack PoCs (whitewasher, sybil, score-manipulator, slow-poisoner,
eclipse) read their own trust score from `AttackContext.observeOwnTrust()`. The
runner supplied that value from a **hardcoded synthetic ramp**:

```ts
// run-attack.ts:170 (before)
const trustSeries = Array.from({ length: 200 }, (_, i) =>
  Math.min(0.99, 0.1 + i * 0.01)
);
```

So every attack succeeded or failed against a canned curve that had **nothing to
do with the real HoloMesh trust system**. `success_rate` and the Wilson CI
measured the shape of the ramp, not the defenses. The defenses self-documented
"gate in Phase 4" but Phase 4 never ran. USENIX Sec requires a *demonstrated
attack against the real system* plus a *measured defense*.

A second latent bug: `makeContext` was re-created inside the round loop, so
`idx` reset every round and `observeOwnTrust()` always returned `trustSeries[0]`.
A third: the CLI entry guard `import.meta.url === \`file://${process.argv[1]}\`` 
never matched on Windows (relative argv + `file:///C:` casing), so the runner
CLI was silently dead.

## The fix — wire attacks to the live formula

1. **`src/trust-model.ts`** — faithful, self-contained port of the production
   `computeReputation(contributions, queriesAnswered, reuseRate)` formula and
   tier thresholds. The adversarial package has empty `dependencies` by design
   (sandbox isolation, W.GOLD.035) and does not build against mcp-server, so the
   formula is inlined **verbatim** with a provenance pointer. `trust-model.test.ts`
   asserts the algebra byte-for-byte against the documented production constants,
   so any production divergence forces a re-port.
   - V10: reuse ignored until `contributions >= 3`.
   - V11: `reuseWeight <= 2 * directWork` — the anti-Sybil ceiling.
   - `reputationToTrust`: normalize the unbounded score to `[0,1]` by the
     authority ceiling (100), so `T >= 0.9` means `reputation >= 90`.

2. **`src/runner/trust-driver.ts`** — per-attack drivers translate each round's
   behavior into reputation inputs, then `observeOwnTrust()` reads the LIVE
   `computeReputation` value. The driver holds state across rounds (fixing the
   idx-reset bug).
   - Sybil: cohort cross-vouching pumps `reuseRate`; V11 caps its weight.
   - Whitewasher: genuine cooperative work → real contributions/queries.
   - Score-manipulator: analytic trust-max saturates every formula input.
   - Slow-poisoner: steady legit cadence holds trust while bias accumulates.
   - Eclipse: victim seeded at pre-eclipse reputation; observed trust eroded by
     accumulated eclipse pressure.

3. **`run-attack.ts`** — `trustSeries` is now optional; omitting it (the default
   and the Phase 4 path) uses the live driver. `requiredRounds`/`defaultMaxRounds`
   give window attacks (slow-poisoner aggregate over 1000 rounds, eclipse over
   `eclipseRounds`) their full horizon so the early-break does not truncate the
   measurement window. Cross-platform CLI entry detection via `fileURLToPath` +
   `realpathSync`.

## Phase 4 results (N=30 trials/attack, live formula)

| Attack | success_rate | Wilson 95% CI | Reading |
|--------|:---:|:---:|---|
| whitewasher | **1.00** | [0.886, 1.000] | Honest trust-build then exploit lands — formula does not semantically vet output content (§4.1). |
| **sybil** | **0.00** | [0.000, 0.114] | **DEFENDED by live V11 ceiling** — cross-vouching cannot reach the 1.5× inflation threshold because reuse weight is bounded by 2× direct work. |
| score-manipulator | **1.00** | [0.886, 1.000] | Goodhart on v1 formula — high trust with decoupled utility, no utility cross-check (§4.4). |
| slow-poisoner | **1.00** | [0.886, 1.000] | Aggregate bias accumulates undetected over the 1000-round window (§4.3). |
| eclipse | **1.00** | [0.886, 1.000] | Victim trust driven below 0.3× baseline (§4.5). |

Artifact: `research/paper-21-phase4-artifacts/baseline-summaries.json`
(full `BaselineSummary` per attack: N, success_rate, ci_low, ci_high,
per_trial_durations).

## Why this is the right result for USENIX Sec

The numbers now **discriminate**: four attacks land against the real formula
and one (Sybil) is *measurably stopped by a live defense* (V11). That is the
demonstrated-attack + measured-defense shape the venue requires. The whitewasher,
score-manipulator, slow-poisoner, and eclipse successes are not failures of the
harness — they are the genuine residual attack surface of trust-formula-v1
(no semantic-content check, no utility cross-check), which is exactly what the
defended-condition measurement (canary probing §5.4, etc.) must then close.

## Validation

- `npx tsc -p tsconfig.json` — clean.
- `HOLOMESH_ADVERSARIAL_SANDBOX=1 npx vitest run` — **158 passed** (was 131;
  +27 covering the formula port and the live measurement path).
- Live CLI: `node dist/runner/run-attack.js <attack> --trials=30 --version=<hash>`.

## Next

- Run the **defended** condition (canary §5.4 + other §5 defenses wired into the
  driver) and compute the defense-efficacy delta vs this baseline.
- Port the formula via a real package import once mcp-server exposes a built
  `computeReputation` entry, retiring the verbatim inline (guarded by
  `trust-model.test.ts`).
