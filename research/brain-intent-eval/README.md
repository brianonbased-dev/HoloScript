# Brain Intent Eval

This folder contains the first closed-loop eval cases for brain intent. It is
the current evidence surface for the Paper 26 measurement arm documented in
`research/paper-26-bcla/brain-intent-closure.md`.

The goal is not to claim full runtime enforcement. The goal is to produce
receipts that compare a brain's expected behavior with an observed outcome.

## Run

```powershell
node scripts\evaluate-brain-intent-loop.mjs --self-test
node scripts\evaluate-brain-intent-loop.mjs --case research\brain-intent-eval\cases\holoshell-room-marathon.case.json --strict
node scripts\evaluate-brain-intent-loop.mjs --case research\brain-intent-eval\cases\trait-inference-gate-refusal.case.json --brain compositions\trait-inference-brain.hsplus --strict
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

## Receipt

The evaluator writes receipts under `.tmp/brain-intent-eval/` by default:

```text
holoscript.brain-intent-loop.eval.v0.1.0
```

Use `--strict` when the receipt should act as a gate. Strict mode exits `1`
when the eval status is `fail`, while still writing the receipt.
