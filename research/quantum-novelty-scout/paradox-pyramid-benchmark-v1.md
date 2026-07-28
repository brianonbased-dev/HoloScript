# Paradox Pyramid Quantum Mechanics Pilot v1

**Date:** 2026-07-17  
**Status:** completed local mechanics pilot; IBM hardware gate `NO_GO`  
**Pinned source commit:** `1dc0261c4fa669f39d5ddce9fff1b7bf10c5caa5`

## Result

The Pyramid-9 and Pyramid-12 models now exist and are independently replayable,
but this pilot provides **no evidence that quantum processing finds novelty**.
Both models have nine substantive binary variables arranged as three declared
three-item faces. Pyramid-12 adds three deterministic Rosenberg ancillas to encode
three cubic aligned-face interactions. Those ancillas are encoding overhead, not
additional research variables.

The exact semantic optimum is the same in both variants:

1. `QP-PP001-04` — instrument the loaded-module dependency closure;
2. `QP-PP001-03` — replace the VM timing control with an untreated control;
3. `QP-PP003-02` — promote the SVG scope wall into the emitter.

That portfolio is a consequence of declared author priors, repository-bound code
evidence, and declared interaction coefficients. It is not an independently
discovered novelty result. Fresh primary-source kill tests remain required.

## What “code as a variable” means here

Each semantic decision variable is a paradox probe with a named
`paradox_probe.code_state.variable_id`. Its before/after Git references, pinned
Git-blob hashes, declared path churn, file availability, and state-blob overlap
contribute classical coefficients to the QUBO. Raw source text is **not** encoded
as qubits, and the tool does not claim semantic understanding from hashes.

A future mixed-state model could make discrete code-state choices explicit—for
example, selection bit `x_i` plus mutually exclusive state bits `z_i,before` and
`z_i,after`. That would be a larger, separately preregistered QUBO. It should not
be described as amplitude-encoding “actual code” unless such an encoding and its
measurement semantics are genuinely implemented.

## Model contract

| Variant                         | Substantive variables | Ancillas | Encoded qubits | Interaction model                                                                         |
| ------------------------------- | --------------------: | -------: | -------------: | ----------------------------------------------------------------------------------------- |
| Pyramid-9 `pairwise`            |                     9 |        0 |              9 | base portfolio QUBO plus same-face, aligned-cross-face, and other-cross-face pair terms   |
| Pyramid-12 `volume_quadratized` |                     9 |        3 |             12 | Pyramid-9 plus three aligned cubic terms, exactly reduced with Rosenberg product ancillas |

The three faces are `observability`, `falsification`, and `proof-scope`, with
three candidates per face. The target portfolio cardinality is three. Structural
coefficients are author-assigned mechanics-pilot priors:

- same face: `+0.25`;
- aligned across faces: `-0.20`;
- other cross-face: `+0.05`;
- each aligned cubic term: `-0.75`;
- Rosenberg margin: `0.50`, giving penalty strength `M = 1.25` per cubic term.

The visual pyramid is a metaphor for this interaction topology. Neither model
performs literal three-dimensional quantum processing.

## Experimental configuration

Both runs used Python 3.14.0, Qiskit 2.1.2, NumPy 2.3.5, seed 23, QAOA depth
`p=1`, 128 shots per parameter setting, and a 4-by-4 parameter grid. The executor
API calls this mode `aer`, but the concrete backend reported by the receipt is
Qiskit's local seeded `StatevectorSampler`, **not** `AerSimulator` and not quantum
hardware.

The integer sampler seed can produce common random numbers across parameter
evaluations. The 2,048-sample budget is therefore a counting match to the random
baseline, not a claim that all trials are statistically independent.

## Benchmark results

| Metric                           |       Pyramid-9 |                         Pyramid-12 |
| -------------------------------- | --------------: | ---------------------------------: |
| Semantic configuration space     |             512 |                                512 |
| Encoded configuration space      |             512 |                              4,096 |
| QAOA sampled objective           | -125.9666666667 |                    -124.0641666667 |
| Exact objective                  | -126.2066666667 |                    -126.9566666667 |
| QAOA optimality gap              |    0.2400000000 |                       2.8925000000 |
| QAOA runtime                     |        0.1373 s |                           0.6712 s |
| Semantic exact runtime           |        0.0040 s |                           0.0100 s |
| QAOA beat greedy                 |              no |                                 no |
| QAOA beat budget-matched random  |              no |                                 no |
| QAOA met cardinality 3           |             yes |                                yes |
| QAOA met one-per-face constraint |              no |                                 no |
| Sampled ancillas feasible        |             n/a | no (`001` sampled, `000` required) |
| Hardware gate                    |         `NO_GO` |                            `NO_GO` |

Pyramid-9 sampled the same portfolio as its greedy baseline:
`QP-PP001-01`, `QP-PP003-01`, and `QP-PP003-02`. That set contains no
falsification-face candidate and two proof-scope candidates. Pyramid-12 sampled
`QP-PP001-05`, `QP-PP003-02`, and `QP-PP003-06`; it has the same face imbalance
and one inconsistent ancilla. The verifier reports these states as infeasible and
does not silently repair them when describing QAOA performance.

The budget-matched semantic random baseline found the exact portfolio in both
runs. This is unsurprising: its 2,048 draws exceed the 512-state semantic search
space, while exact enumeration is trivial at this scale. The result argues
against spending IBM hardware time on the present instance.

## Exact quadratization certificate

The Pyramid-12 verifier independently enumerated all 512 semantic assignments
and all 4,096 encoded assignments:

| Certificate field                             |                   Result |
| --------------------------------------------- | -----------------------: |
| Maximum minimized-objective error             | `5.6843418860808015e-14` |
| Minimum infeasible-ancilla gap                |    `0.49999999999994316` |
| Every minimizing ancilla equals its product   |                     true |
| Expanded optimum projects to semantic optimum |                     true |
| Semantic optimum                              |              `010010010` |
| Expanded optimum                              |           `010010010010` |

This establishes equivalence of the declared cubic objective and its 12-bit
quadratic encoding within the verifier tolerance. It does not establish that the
cubic terms are scientifically correct or productive.

## Receipt integrity boundary

The v3 verifier now:

- rebuilds the QUBO, structural blocks, cubic reduction, baselines, and gates
  from pinned fixture and Git blobs;
- independently reconstructs the exact `.holo` matrix mirror, input hash, code
  evidence hash, and variable order;
- rejects recognized schema-only receipts and malformed, non-finite,
  non-upper-triangular, or oversized matrices before exponential work;
- deterministically replays the local QAOA result under the recorded Python,
  Qiskit, and NumPy versions;
- rejects fully rehashed composition substitution, matrix, structure, ancilla,
  certificate, schema, and QAOA-result forgeries in regression tests.

Deterministic replay proves that the reported simulator result follows from the
pinned model, seed, software stack, and algorithm. It is not cryptographic proof
that a historical execution event occurred at the receipt timestamp.

Durable receipts:

- `quantum_receipts/quantum_paradox_pyramid9_statevector_receipt_v1.json`
  (`e90a042fa8a48ea322d9ef8bed8e777a7e1626720235901ee66bbb8b704edbb7`);
- `quantum_receipts/quantum_paradox_pyramid12_statevector_receipt_v1.json`
  (`da45bf0924abd41662774dfee6c693f2343cbd881d09aed19703ad200c589a46`).

Both receipts record `source_state.scoped_dirty = false`, bind source commit
`1dc0261c4fa669f39d5ddce9fff1b7bf10c5caa5`, independently recompute, and record
`ibm_job_submitted = false`.

## Decision and next experiment

Treat the pyramid as a useful **paper-program hypothesis-structuring tool**, not
as evidence of novelty and not yet as a quantum advantage surface. The next
scientifically meaningful experiment would require all of the following before
hardware:

1. preregister coefficients or learn them on a training split before viewing a
   held-out outcome set;
2. use at least 18 substantive candidates, multiple seeds, and classical exact,
   greedy, random, and modern classical heuristic baselines;
3. define an external novelty/falsification outcome that is excluded from the
   optimizer inputs;
4. use a constraint-preserving formulation or ansatz that respects one-per-face
   and product-ancilla feasibility;
5. require the simulator gate to show comparative signal before any IBM run.

The present exact portfolio is actionable as an editorial queue, but its three
items must be tested classically and sourced before entering any paper claim.

## Reproduction

```powershell
python scripts/quantum_novelty_scout.py --input research/quantum-novelty-scout/paradox-pyramid-probes-v1.json --pyramid-variant pairwise --composition-out research/quantum-novelty-scout/paradox-pyramid9-portfolio.holo --out quantum_receipts/quantum_paradox_pyramid9_statevector_receipt_v1.json --shots 128 --grid-points 4 --seed 23

python scripts/quantum_novelty_scout.py --input research/quantum-novelty-scout/paradox-pyramid-probes-v1.json --pyramid-variant volume_quadratized --composition-out research/quantum-novelty-scout/paradox-pyramid12-portfolio.holo --out quantum_receipts/quantum_paradox_pyramid12_statevector_receipt_v1.json --shots 128 --grid-points 4 --seed 23

python scripts/quantum_receipt_verify.py --receipt quantum_receipts/quantum_paradox_pyramid9_statevector_receipt_v1.json --receipt quantum_receipts/quantum_paradox_pyramid12_statevector_receipt_v1.json
```
