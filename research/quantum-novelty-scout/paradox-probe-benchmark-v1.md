# Paradox-probe quantum portfolio benchmark v1

**Date:** 2026-07-17 (America/Phoenix)

**Status:** simulator mechanics pilot; no novelty or quantum-advantage claim

## Purpose

This benchmark asks whether the existing QUBO scout can rank a diverse set of
Paradox-to-Proof follow-up probes while treating declared code state as a
hash-bound coefficient input. It does not ask a quantum computer to discover a
paradox or decide novelty.

The fixture contains twelve candidates: six PP-001 Living Artifact follow-ups
and six PP-003 Proof Adjacency follow-ups. Exact enumeration, greedy selection,
budget-matched random search, and Aer QAOA receive the same 12-variable QUBO and
target cardinality four.

## Input boundary

- Scores are author-assigned planning priors written after the two pilots. The
  authors were not blinded to pilot results.
- Score-field names and tags reject explicit Paradox-to-Proof result labels.
  Other channels are not claimed outcome-independent.
- The twelve author-adjudicated false-paradox controls are excluded from reward
  and similarity calculations. Their corpus, executor, and passing receipt are
  hash- and semantics-bound as validation evidence. The scout verifier does not
  independently execute the controls.
- Code states are fixed, resolved Git-blob features that alter unary path-churn
  coefficients and pairwise Jaccard similarity. They are not additional QUBO
  decision bits or qubits.

## Code-state bindings

PP-001 compares:

- state A `c83c2d3c8857c88357bee226df826114ab87432e`;
- state B `d225d6572e455d38d28d7482a315b4390870fb1b`;
- `packages/core/src/plugins/PluginSandboxRunner.ts` in both states.

That declared path changed, so all six PP-001 candidates receive path-churn
fraction `1.0`. They share the same state-blob set and therefore incur full
pairwise code redundancy.

PP-003 compares:

- pre-pilot `3b0650d8feb3c3ed6bb922e1deb5e5db471ed6b6`;
- pilot commit `1bb58109609c245a924b5af9b6857591dc99c757`;
- only production paths that exist in both states.

Those production paths did not change when the pilot evidence was added, so all
six PP-003 candidates receive path-churn fraction `0.0`. This is intentional:
PP-003 added a test corpus and artifacts, not production compiler enforcement.

## Agent-workflow tracer

- **User experience observable:** a four-probe recommendation with classical,
  random, and Aer outcomes plus an explicit hardware gate.
- **Code entry point:** `scripts/quantum_novelty_scout.py` with
  `research/quantum-novelty-scout/paradox-probes-v1.json`.
- **Rendered and receipt state:**
  `research/quantum-novelty-scout/paradox-probe-portfolio.holo` mirrors the
  matrix; `quantum_receipts/quantum_paradox_probe_scout_aer_receipt_v1.json`
  seals execution and source state.
- **Failure behavior:** malformed labels, one-state bindings, mismatched state
  path sets, missing Git blobs, forged control results, dirty durable sources,
  or scoped source drift during execution abort before a durable receipt.
- **Acceptance test:** the independent verifier recomputes fixture, code-state
  blobs, QUBO, baselines, receipt hash, and pre/post source stability; the
  existing hardware gate remains `NO_GO` unless every criterion passes.

## Declared run

```powershell
python scripts/quantum_novelty_scout.py `
  --input research/quantum-novelty-scout/paradox-probes-v1.json `
  --composition-out research/quantum-novelty-scout/paradox-probe-portfolio.holo `
  --out quantum_receipts/quantum_paradox_probe_scout_aer_receipt_v1.json `
  --shots 128 --grid-points 4 --seed 23

python scripts/quantum_receipt_verify.py `
  --receipt quantum_receipts/quantum_paradox_probe_scout_aer_receipt_v1.json
```

The 12-candidate scale fails the existing `candidate_count >= 18` hardware
criterion by construction, and every fresh-source kill test remains pending.
IBM hardware is therefore not authorized by this run even if Aer happens to
match or beat a classical baseline.

## Limits

- The optimizer ranks a declared candidate set; it does not generate research
  questions or search external literature.
- Scores can encode author judgment because this is not a blinded or
  preregistered selection experiment.
- Path churn measures declared Git-blob changes, not causality, semantic impact,
  or implementation completeness.
- The pre/post source guard proves enumerated source stability across measured
  execution. It is not bytecode attestation of already-imported Python modules.
- Exact enumeration is feasible at twelve candidates and remains the ground
  truth for this mechanics pilot. No speedup claim is available.
