# GRPO Diversity Experiment — Paper 26 Contribution 3 (tractable subset)

**Date:** 2026-05-24
**Script:** `packages/core/src/traits/pillar/sim/grpo-diversity-experiment.ts`
**Run:** `npx tsx packages/core/src/traits/pillar/sim/grpo-diversity-experiment.ts`

## What is measured

Drives the **real** `sliceEmitterHandler` (SliceEmitter.ts, unmodified) and the
**real** seed Pillars (PillarRegistry.ts) over two slice streams of W=1000.
Diversity ratio ρ = unique_fingerprints / total, fingerprint =
`axis_1:axis_2:pos_1.toFixed(2):pos_2.toFixed(2)`. Alert threshold = 0.8.

## Result 1 — Diversity guarantee (mode-collapse guard)

| Stream | total | unique | ρ (lifetime) | alert fired | first alert step |
|--------|------:|-------:|----:|:-----------:|:----------------:|
| healthy | 1000 | 371 | 0.3710 | true | 3 |
| collapsed | 1000 | 1 | 0.0010 | true | 1 |

ρ at checkpoints (unique / N):

| N | healthy ρ | collapsed ρ |
|--:|----------:|------------:|
| 10 | 0.8000 | 0.1000 |
| 100 | 0.5300 | 0.0100 |
| 1000 | 0.3710 | 0.0010 |

**Collapse detected: true** — the collapsed agent's
ρ drops to 0.0010 and the alert fires (true positive; the mode-collapse
guard catches it). Discrimination ratio (unique_healthy / unique_collapsed) at
N=1000: **371×**.

### HONEST FINDING — fixed threshold is miscalibrated for a cumulative ratio

SliceEmitter's `diversity_ratio` is a **lifetime cumulative** ratio: the
`unique_fingerprints` Set never evicts while `total_count` grows unbounded
(SliceEmitter.ts:212–216). For any stream with a bounded fingerprint vocabulary,
ρ → 0 as total → ∞. Consequently the **healthy** stream also trips the fixed
0.8 threshold over a long run (ρ_healthy = 0.371 at N=1000), so the
static-threshold guard **over-alerts on healthy long-running streams** — a real
mis-tuning, not a pass. The *robust* collapse signal is the discrimination ratio
and the unique-count growth rate (healthy unique keeps climbing; collapsed
plateaus at 1), not absolute ρ vs a static threshold. Recommended fix
for SliceEmitter: compute ρ over a true rolling window of the last W slices, or
evict fingerprints alongside the buffer eviction it already does.

## Result 2 — Advantage-variance link (synthetic reward proxy)

Reward r = −L_total = −‖(p1,p2)−target‖². GRPO advantage A_i = (r_i − mean)/(std+ε).
Within-group reward variance drives the policy-gradient signal magnitude.

| Stream | mean within-group reward variance | mean |advantage| |
|--------|---------------------------------:|----------------:|
| healthy | 4.151e-2 | 0.8902 |
| collapsed | 1.813e-7 | 0.8500 |

Variance ratio (healthy / collapsed): **2.290e+5** —
diverse groups carry a non-zero gradient signal; collapsed groups carry ≈0.

## Deferred (honest scope boundary)

**Poverty-of-stimulus M/N generalization is NOT measured here.** A policy trained
on N slices generalizing to M>N held-out scenarios requires a real long-running
GRPO training loop with the live reward pipeline (GRPORewardFunctions /
GRPORewardOrchestrator, which shell out to vitest/tsc/eslint per completion).
That remains future work. This artifact measures only the diversity-guarantee +
advantage-variance link, which is tractable in-process today.
