# 26-BIC - Brain Intent Closure

**Parent paper:** Paper 26 - Brain-Composed LLM Agents
**Status:** Gated measurement arm
**Opened:** 2026-05-14
**Primary evidence:** `research/brain-intent-eval/`

## Claim Boundary

Brain Intent Closure is not a full runtime intent layer yet. It is the first
paper-grade measurement layer for brain-composed agents:

```text
brain contract -> task trace -> observed outcome -> eval receipt
```

The claim is deliberately narrow: a brain declaration matters only when its
expected behavior can be scored against what the agent actually did.

## Research Question

Can a specialized brain contract improve agent behavior in measurable ways:
correct task classification, expected tool/object selection, permission
discipline, refusal of reactive moves, receipt generation, and final state?

## Experimental Unit

| Unit | Description |
| --- | --- |
| Brain | A `.hsplus` or related source file declaring identity, priorities, anti-patterns, gates, or decision loops. |
| Case | A JSON fixture containing user intent, expected behavior, observed behavior, and refusal requirements. |
| Receipt | The scored eval output written by `scripts/evaluate-brain-intent-loop.mjs`. |
| Drift | A mismatch between declared brain contract, expected route, observed behavior, or final state. |

## Initial Cases

| Case | Brain surface | What it measures |
| --- | --- | --- |
| `holoshell-room-marathon.case.json` | Brittney / HoloShell operator | Compound shell workflow classification, guarded execution, workflow approval, no mutation before approval. |
| `trait-inference-gate-refusal.case.json` | `compositions/trait-inference-brain.hsplus` | Refusal to begin ML/paper work before dataset and preregistration gates. |

## Required Negative Controls

| Control | Why it matters |
| --- | --- |
| Prompt-only baseline | Shows whether the brain contract adds measurable behavior beyond ordinary instructions. |
| Wrong-brain run | Catches generic compliance where any brain passes any case. |
| Reactive-move case | Tests refusal of moves like rebranding comments as contracts or publishing claims before enforcement exists. |
| Mutation-before-approval case | Tests whether permission gates are observed under execution pressure. |

## Ablation Matrix

| Mode | Expected paper use |
| --- | --- |
| Prompt-only | Baseline behavior without explicit brain contract scoring. |
| Brain + post-hoc receipt | Measures whether the brain contract matched outcome after the run. |
| Brain + strict receipt gate | Fails the workflow when required checks fail. |
| Brain + runtime policy bridge | Blocks or allows real tool use from receipt-backed policy. |

## Gate To Paper-Grade Evidence

This subtrack becomes paper-grade only when it has:

| Gate | Evidence |
| --- | --- |
| Breadth | Three or more materially different brains represented in receipts. |
| Depth | Multiple cases per brain, including success, refusal, and negative-control cases. |
| Enforcement | Strict mode wired into a real CI or pre-merge path. |
| Runtime bridge | At least one HoloShell or tool-use workflow uses the receipt as an execution gate. |
| Cost study | Latency, token, and retry overhead compared across ablation modes. |
| Failure taxonomy | Drift categories reported with examples and fix paths. |

## Current Next Moves

1. Add a third brain family case outside HoloShell and trait inference.
2. Add wrong-brain fixtures that intentionally fail under `--strict`.
3. Add prompt-only baseline receipts for the two existing cases.
4. Wire strict receipt checks into the lowest-risk CI path first.
5. Promote one HoloShell workflow from post-hoc receipt to runtime-gated receipt.

## Non-Claims

This subtrack does not claim AGI intent understanding, full runtime policy
enforcement, or general alignment. It claims only that brain declarations can be
converted into testable contracts and measured against outcome traces.
