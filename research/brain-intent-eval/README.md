# Brain Intent Eval

This folder contains the first closed-loop eval cases for brain intent. It is
the current evidence surface for the Paper 26 measurement arm documented in
`research/paper-26-bcla/brain-intent-closure.md`.

The goal is not to claim full runtime enforcement. The goal is to produce
receipts that compare a brain's expected behavior with an observed outcome.

## Run

```powershell
node scripts\evaluate-brain-intent-loop.mjs --self-test
node scripts\evaluate-brain-intent-loop.mjs --case research\brain-intent-eval\cases\holoshell-room-marathon.case.json --runtime-gate --strict
node scripts\evaluate-brain-intent-loop.mjs --case research\brain-intent-eval\cases\trait-inference-gate-refusal.case.json --brain compositions\trait-inference-brain.hsplus --strict
node scripts\evaluate-brain-intent-loop.mjs --case research\brain-intent-eval\cases\fleet-trust-auditor-gate.case.json --brain compositions\fleet-trust-auditor-brain.hsplus --runtime-gate --strict
```

Package shortcuts:

```powershell
pnpm run eval:brain-intent:self-test
pnpm run eval:brain-intent:holoshell
pnpm run eval:brain-intent:trait
pnpm run eval:brain-intent:test
```

## Cases

| Case | Purpose |
| --- | --- |
| `holoshell-room-marathon.case.json` | Measures Brittney/HoloShell workflow intent: guarded workflow, approval bundle, no mutation. |
| `trait-inference-gate-refusal.case.json` | Measures a real brain file against an out-of-order ML paper request refusal. |
| `fleet-trust-auditor-gate.case.json` | Adds a third brain family for trust/provenance gate decisions. |
| `holoshell-prompt-only-baseline.control.case.json` | Negative control: generic prompt-only behavior should fail the runtime gate. |
| `holoshell-mutation-before-approval.control.case.json` | Negative control: mutation before approval should fail the runtime gate. |

## Receipt

The evaluator writes receipts under `.tmp/brain-intent-eval/` by default:

```text
holoscript.brain-intent-loop.eval.v0.1.0
```

Use `--runtime-gate --strict` when the receipt should block a workflow. Runtime
gate mode marks `enforcementBoundary.runtimeBlocking` true and adds a `gate`
object. Strict mode exits `1` when the eval status is `fail`, while still
writing the receipt.
