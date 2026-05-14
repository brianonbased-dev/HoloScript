---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-14
canonical_for: paper-17-19-production-ml-corpus-gates
supersedes: ''
extends: ''
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Paper 17 now has 10 CAEL-verified SESL Phase 1 pairs (4990 remaining to the 5,000-pair publication gate). Paper 19's structural corpus gates pass on 7577 rows, but real Brittney/community source integration and constrained-decoder training evidence are still open gates.

- **W --** A corpus gate needs both volume and proof source: Paper 17 pass-rate is green, but CAEL volume remains the blocker.
- **P --** Track structural dataset gates separately from source-integration and model-training gates so reviewers can see exactly what is proved.
- **G --** Treating Paper 19's 7,577 rows as "production-ready" would hide the Brittney/community source-mix gap.

**Evidence:** `research/paper-17-sesl-pairs/INDEX.json`; `research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl`; `research/paper-19/datasets/adversarial-mislabel/phase-3-mislabel-attractors-v2.jsonl`; `scripts/paper-17-19-gate-delta.mjs`.

---

# Paper 17/19 Production ML Corpus Gates

Generated: 2026-05-14T07:23:43.781Z

## Paper 17 SESL Gate

| Metric                | Current | Target |  Gap | Pass |
| --------------------- | ------: | -----: | ---: | ---- |
| CAEL-verified pairs   |      10 |   5000 | 4990 | no   |
| Measured pairs        |      10 |   5000 | 4990 | no   |
| SimContract pass rate |       1 |    0.6 |    0 | yes  |

Next milestone: 100 CAEL-verified pairs (90 remaining).

## Paper 19 ATI Gate

| Structural metric           |  Current |   Target | Pass |
| --------------------------- | -------: | -------: | ---- |
| Rows                        |     7577 |     2000 | yes  |
| Novel-combination test rows |      306 |      300 | yes  |
| Synth ratio                 | 0.599974 | <= 0.605 | yes  |
| Adversarial mislabel rows   |       12 |    >= 10 | yes  |

| Source-integration metric | Current | Target | Gap | Pass |
| ------------------------- | ------: | -----: | --: | ---- |
| Existing HoloScript rows  |    7513 |    500 |   0 | yes  |
| Brittney rows             |      64 |    500 | 436 | no   |
| Community rows            |       0 |    500 | 500 | no   |

Constrained-decoder training measurement present: **no**.

## Reviewer-Facing Read

Paper 17 has moved from smoke-only proof to a 10-row CAEL-verified tranche, but remains a volume problem. Paper 19 has enough rows and the novel-combination split, but the current dataset is still effectively existing-code plus synthetic transforms. The next reviewer-visible delta should be either:

1. Paper 17: scale the deterministic CAEL tranche toward 100 verified pairs.
2. Paper 19: add 500 Brittney-origin rows and 500 community-origin rows, then rerun the baseline/training gates.
