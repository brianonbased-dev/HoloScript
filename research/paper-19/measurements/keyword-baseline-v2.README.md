# Paper-19 Keyword-Match Baseline (v2 — LOCKED)

**Locked at**: 2026-04-27T07:59:05.587Z
**Generator script**: `scripts/paper-19/run-keyword-baseline.mjs`
**Dataset**: `phase-3-trait-inference-2000row-v2` (sha256 `85aa5983a228029d478bfc6c6722681bc7de6b4e792b267b95865257f0dffc10`)
**Family map**: sha256 `dfaadbcce24789bc8a9ec64988da80c2c73a5938a76859c975c0eb5d19a7f8df` (2564 traits, 144 families)
**Eval split**: `novel-combination-test` — 300 rows

> **Row-count note**: The v2 dataset README narrative quotes "306 novel-combination test rows", but the live dataset contains exactly **300** rows with `split_role == "novel-combination-test"` (verifiable: `grep -c '"novel-combination-test"' research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl`). The pre-registration gate text says "≥300", which the live count satisfies. This baseline filters by the actual `split_role` field (the dataset is the source of truth), not by hardcoded N=306. If the harvester is re-run and the count changes, this number adapts.

## Algorithm

For each row in the `novel-combination-test` split:

1. Tokenize the snippet by `/@([a-zA-Z_][a-zA-Z0-9_]*)/g` (strip args / block bodies — we keep only the bare `@name` head).
2. For each token T in (snippet tokens) ∩ (family-map keys), predict `@T`.
3. Compute per-row TP / FP / FN against `gold_traits`.

The candidate set is the family map's `trait_to_families` keys (2564 traits derived from `packages/core/src/traits/constants/*.ts`). Traits that appear in gold but not in the family map (registry-drift traits — see dataset README §"Known limitations") are unreachable by this baseline by construction. **160** of 300 eval rows contain at least one out-of-family-map gold token (226 tokens total).

## LOCKED NUMBERS

| Metric | Value | Notes |
|---|---|---|
| Eval rows | 300 | `split_role == "novel-combination-test"` |
| **Row-macro F1 (headline)** | **0.5541** | Mean per-row F1 — what /ml-experiments §F1 calls "macro-average across the rows" |
| Row-macro precision | 0.5750 | Mean per-row precision |
| Row-macro recall | 0.5732 | Mean per-row recall |
| Label-macro F1 | 0.4217 | Per-label F1 averaged over the 208-label space |
| Label-macro precision | 0.4127 | |
| Label-macro recall | 0.4424 | |
| Micro F1 | 0.6567 | Pooled TP / FP / FN across all rows |
| Distinct trait labels in gold | 208 | |
| Distinct trait predictions | 125 | |
| Out-of-family-map gold rows | 160 / 300 | Lower bound on the floor — these rows are unreachable for keyword match by design |

## Classifier gate (+15pp margin)

Per the v2 dataset pre-registration:

> F1 (macro) ≥ 0.80 on the novel-combination test split, with ≥ 15 percentage-point margin over the keyword-match baseline.

| Quantity | Value |
|---|---|
| Pre-registration floor | 0.8000 |
| Margin requirement | +15pp over keyword-match baseline |
| **Classifier must clear (row-macro F1)** | **≥ 0.7041** |
| Effective floor (max of pre-reg vs +15pp) | 0.8000 |

The classifier must beat **0.7041** row-macro F1 to clear the +15pp gate. If it lands below the pre-registration floor (0.80) it fails regardless of the margin.

## Top-10 hits (where keyword match works)

| Label | Precision | Recall | F1 | TP / FP / FN |
|---|---|---|---|---|
| `@networked` | 1.0000 | 1.0000 | 1.0000 | 12 / 0 / 0 |
| `@llm_agent` | 1.0000 | 1.0000 | 1.0000 | 10 / 0 / 0 |
| `@collidable` | 1.0000 | 1.0000 | 1.0000 | 10 / 0 / 0 |
| `@anchor` | 1.0000 | 1.0000 | 1.0000 | 9 / 0 / 0 |
| `@animated` | 1.0000 | 1.0000 | 1.0000 | 8 / 0 / 0 |
| `@throwable` | 1.0000 | 1.0000 | 1.0000 | 7 / 0 / 0 |
| `@spawn_point` | 1.0000 | 1.0000 | 1.0000 | 6 / 0 / 0 |
| `@stackable` | 1.0000 | 1.0000 | 1.0000 | 6 / 0 / 0 |
| `@gpu_particle` | 1.0000 | 1.0000 | 1.0000 | 5 / 0 / 0 |
| `@draggable` | 1.0000 | 1.0000 | 1.0000 | 5 / 0 / 0 |

## Top-10 misses (where keyword match has zero recall)

| Label | Gold support | TP / FN | Notes |
|---|---|---|---|
| `@state` | 7 | 0 / 7 | recall=0.0000 |
| `@experience` | 6 | 0 / 6 | recall=0.0000 |
| `@health` | 6 | 0 / 6 | recall=0.0000 |
| `@mana` | 6 | 0 / 6 | recall=0.0000 |
| `@stamina` | 6 | 0 / 6 | recall=0.0000 |
| `@level` | 5 | 0 / 5 | recall=0.0000 |
| `@cultural_memory` | 5 | 0 / 5 | recall=0.0000 |
| `@holdable` | 5 | 0 / 5 | recall=0.0000 |
| `@npc` | 4 | 0 / 4 | recall=0.0000 |
| `@carriable` | 4 | 0 / 4 | recall=0.0000 |

These are the labels with the most gold support that the baseline never recovers — typically registry-drift traits not declared in any `*_TRAITS` constant array (see dataset README §"Known limitations"). The classifier must close these gaps.

## Reproducing

```bash
node scripts/paper-19/run-keyword-baseline.mjs
```

Re-running on the same dataset + family-map SHA produces byte-identical output. Diffing this file against a previous run is a regression surface.

## Why baseline-first

Per /ml-experiments discipline:

> Refuse the lazy framing "the system works qualitatively, no metric needed" — ML venues require numbers.

Locking the keyword-match floor BEFORE the classifier ships removes the temptation to retroactively pick a margin that the classifier happens to clear. Reviewers see: (1) baseline pinned with commit + dataset SHA, (2) classifier number, (3) margin computed against the locked floor. Pre-registration intact.
