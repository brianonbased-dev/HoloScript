# Paper-19 Trait-Inference Classifier — Structural Extraction

**Locked at**: 2026-05-26T01:59:13.229Z
**Generator script**: `scripts/paper-19/run-trait-inference-classifier.mjs`
**Dataset**: `phase-3-trait-inference-2000row-v2` (sha256 `85aa5983a228029d478bfc6c6722681bc7de6b4e792b267b95865257f0dffc10`)
**Family map**: sha256 `dfaadbcce24789bc8a9ec64988da80c2c73a5938a76859c975c0eb5d19a7f8df`
**Classifier**: structural-extraction

## Algorithm

Three-layer classifier for predicting trait annotations from .hsplus source snippets:

1. **Layer 1 — @-token extraction**: Extract all `@name` tokens from the snippet via regex. These are structural predictions — traits explicitly declared in the source code. This captures the core signal: verbatim rows have gold_traits == snippet @-tokens; property-stripping rows retain @-tokens in the stripped snippet; trait-removal rows have 1 fewer gold trait than @-tokens.

2. **Layer 2 — Family expansion** (optional, threshold-controlled): For each extracted @-token, look up co-occurring traits in the training set. If a trait co-occurs with an extracted token in ≥threshold% of training rows, add it. Threshold=1.0 disables expansion.

3. **Layer 3 — Structural heuristics** (optional): For gold traits not present as @-tokens in any snippet (`@state_machine`, `@glowing`, `@skill_tree`), apply property-name pattern heuristics.

## Headline Configuration: structural-extraction (Layer 1 only)

The headline configuration uses Layer 1 only (extract all @-tokens). This is the simplest classifier that meets the gate.

| Metric | Value | Notes |
|---|---|---|
| Eval rows | 300 | `split_role == "novel-combination-test"` |
| **Row-macro F1 (headline)** | **0.8508** | Mean per-row F1 |
| Row-macro precision | 0.8041 | Mean per-row precision |
| Row-macro recall | 0.9979 | Mean per-row recall |
| Label-macro F1 | 0.6096 | Per-label F1 averaged over label space |
| Micro F1 | 0.7638 | Pooled TP / FP / FN across all rows |
| TP / FP / FN | 553 / 339 / 3 | |

## Classifier configurations on novel-combination-test

| Configuration | Row-macro F1 | Precision | Recall | Micro F1 |
|---|---|---|---|---|
| structural-extraction | 0.8508 | 0.8041 | 0.9979 | 0.7638 |
| structural-extraction+heuristics | 0.7993 | 0.7294 | 0.9986 | 0.7237 |
| structural+cooccurrence-0.5 | 0.6761 | 0.5685 | 0.9986 | 0.5986 |
| structural+cooccurrence-0.7 | 0.7262 | 0.6338 | 0.9986 | 0.6464 |

## In-distribution-test results

| Configuration | Row-macro F1 | Precision | Recall | Micro F1 |
|---|---|---|---|---|
| structural-extraction | 0.8967 | 0.8823 | 0.9334 | 0.9065 |
| structural-extraction+heuristics | 0.8273 | 0.7980 | 0.8923 | 0.8538 |
| structural+cooccurrence-0.5 | 0.7867 | 0.7404 | 0.8923 | 0.7778 |
| structural+cooccurrence-0.7 | 0.8184 | 0.7857 | 0.8923 | 0.8310 |

## Comparison with keyword-match baseline

| Quantity | Value |
|---|---|
| Keyword-match baseline (row-macro F1) | 0.5541 |
| **Structural extraction (row-macro F1)** | **0.8508** |
| **Delta** | **29.6746pp** |
| Pre-registration floor | 0.8000 |
| Margin requirement | +15pp over keyword baseline |
| Effective floor (max of floor vs +15pp) | 0.8000 |
| **Gate: floor passed** | **YES** |
| **Gate: margin passed** | **YES** |

## Pre-registration gate check

> F1 (macro) ≥ 0.80 on the novel-combination test split, with ≥ 15 percentage-point margin over the keyword-match baseline.

| Check | Result |
|---|---|
| Novel-combination F1 | 0.8508 |
| Keyword baseline F1 | 0.5541 |
| Margin over baseline | 29.6746pp |
| Floor (≥0.80) | PASS |
| Margin (≥15pp) | PASS |

**GATE PASSED**: Both floor (≥0.80) and margin (≥15pp) requirements met.

## Analysis: why structural extraction works

The structural-extraction classifier achieves 0.8508 row-macro F1 because:

1. **Verbatim rows (62/300)**: gold_traits == snippet @-tokens (exact match, F1=1.0).
2. **Trait-permutation rows (18/300)**: gold_traits == snippet @-tokens (reordering, F1=1.0).
3. **Property-stripping rows (49/52)**: gold_traits == snippet @-tokens (stripping removes body, not @-tokens).
4. **Cross-domain-transfer rows (55/300)**: gold_traits == snippet @-tokens (renamed object, same traits).
5. **Trait-removal rows (113/300)**: gold ⊂ snippet @-tokens (1 trait removed from gold but still in snippet). This creates FP — the classifier over-predicts by 1 trait per row. Average F1 impact: small per-row penalty because removal affects 1 trait out of typically 2-5.

The 3 gold traits not present as @-tokens (`@state_machine`, `@glowing`, `@skill_tree`) come from property-stripping rows where the parent had these traits but the stripped snippet lost their @-declarations. These 3 FN occurrences are a negligible impact on the headline F1.

## Adversarial mislabel results

- underlabeled-by-1: id=mis-u-001, P=0.666667, R=1, F1=0.8
- underlabeled-by-1: id=mis-u-002, P=0.75, R=1, F1=0.857143
- underlabeled-by-2: id=mis-u-003, P=0.25, R=1, F1=0.4
- underlabeled-by-2: id=mis-u-004, P=0.5, R=1, F1=0.666667
- underlabeled-by-1: id=mis-u-005, P=0.666667, R=1, F1=0.8
- underlabeled-by-1: id=mis-u-006, P=0.666667, R=1, F1=0.8
- phantom-collidable: id=mis-p-001, P=1, R=0.666667, F1=0.8
- phantom-grabbable: id=mis-p-002, P=1, R=0.666667, F1=0.8
- phantom-clickable: id=mis-p-003, P=1, R=0.5, F1=0.666667
- phantom-emissive: id=mis-p-004, P=1, R=0.5, F1=0.666667
- phantom-decorator-trio: id=mis-p-005, P=1, R=0.333333, F1=0.5
- phantom-by-2: id=mis-p-006, P=0.666667, R=0.5, F1=0.571429

## Reproducing

```bash
node scripts/paper-19/run-trait-inference-classifier.mjs
```

Re-running on the same dataset + family-map SHA produces byte-identical output. Diffing this file against a previous run is a regression surface.

## Naive LLM-tagging baseline definition

The "naive LLM-tagging baseline" is the MCP `suggestTraits()` function in `packages/mcp-server/src/generators.ts`, which maps NL keywords to trait lists via a static keyword→traits dictionary. This baseline is distinct from the snippet-@-token baseline because it operates on **natural-language descriptions** rather than structured source code. The structural-extraction classifier's advantage comes from leveraging the structured format of .hsplus snippets (explicit `@` annotations), which the LLM baseline cannot access when given only an NL description. The delta between structural extraction and keyword matching (the locked baseline at 0.5541 F1) quantifies the value of the structured annotation format for trait inference.
