# Paper 26 - Brain-Composed LLM Agents

**Program slot:** Gated research track 26
**Short title:** Anti-pattern discipline as capacity multiplier
**Status:** Gated; Phase 1 prompt/skill discipline exists, measurement arm opened
**Created:** 2026-05-14

## Thesis

Brain-composed agents should be evaluated by whether declared brain contracts
change observable outcomes, not by whether a prompt contains impressive
sections. The paper claim is only credible when brain declarations produce
measurable differences in routing, refusal, permission boundaries, receipts,
and final task state.

This track treats the brain file as an agent operating contract. The research
question is:

```text
When an agent is composed with a specialized brain, does the observed behavior
match the contract better than prompt-only or unscored operation?
```

## Program Position

This is the primary home for **Brain Intent Closure**. It should not become a
new main paper yet. It is a Paper 26 measurement arm until the evidence covers
multiple brains, negative controls, strict receipts, runtime gates, and cost
comparisons.

| Track | Status | Purpose | Evidence |
| --- | --- | --- | --- |
| 26-BIC Brain Intent Closure | Open measurement arm | Convert declared brain intent into scored outcome receipts | `research/paper-26-bcla/brain-intent-closure.md`; `research/brain-intent-eval/` |

## Evidence Already Landed

| Artifact | Role |
| --- | --- |
| `research/2026-05-13_brain-closed-loop-eval-contract.md` | Defines the first closed-loop eval contract and refusal list. |
| `scripts/evaluate-brain-intent-loop.mjs` | Produces brain-intent eval receipts from case files. |
| `research/brain-intent-eval/cases/holoshell-room-marathon.case.json` | Brittney/HoloShell guarded workflow case. |
| `research/brain-intent-eval/cases/trait-inference-gate-refusal.case.json` | Trait-inference brain refusal case. |
| `scripts/__tests__/evaluate-brain-intent-loop.test.mjs` | Harness regression tests, including strict-mode failure behavior. |

## Promotion Gate

Brain Intent Closure can be promoted from Paper 26 measurement arm to a
standalone paper only after all of these are true:

| Gate | Required evidence |
| --- | --- |
| Multi-brain coverage | Three or more materially different brain families produce receipts. |
| Case depth | Each included brain has a nontrivial suite with happy-path, refusal, and wrong-brain cases. |
| Negative controls | The suite includes prompt-only, wrong-brain, and reactive-move controls. |
| Strict gating | Receipts run in strict mode in a CI or pre-merge path. |
| Runtime bridge | At least one high-risk workflow is blocked or allowed by the receipt layer, not only audited after the fact. |
| Ablation | The paper compares prompt-only, receipt-scored, and strict-gated behavior. |
| Cost envelope | The paper reports latency, token, and failure-recovery overhead for the eval loop. |

Until those gates close, this stays inside Paper 26.

## Cross-Paper Links

| Program track | Relationship |
| --- | --- |
| Paper 25 - Coordinated Multi-Brain | Brain Intent Closure becomes fleet evidence when multiple brains are evaluated on shared tasks. |
| Paper 29 - Algebraic Trust + Tool-Use Sandbox | The receipt layer becomes trust evidence when eval receipts compose with sandbox/tool gates. |
| HoloShell / Brittney | Provides the first operating-system-level case: assistant intent, shell object selection, approvals, and guarded execution. |

## Refusals

Do not claim that Brain Intent Closure is already a full runtime intent layer.
Do not rename prompt comments as typed contracts. Do not publish a
counter-framework before the eval receipts and runtime gates exist. Do not move
this to a new paper number until the promotion gate closes.
