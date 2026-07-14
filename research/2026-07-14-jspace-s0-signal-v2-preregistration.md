# J-space S0 signal v2 preregistration

Status: frozen before computing the v2 signal on any labeled J-space example.
The field contract was amended during pre-computation code review to name raw
JSD units, define cross-runtime integer rounding, and add non-primary final-layer
fidelity diagnostics; no v2 labeled value had been computed.

## Post-diagnostic integrity amendment

The first computation on the already-exposed 196-case development bundle found
no useful primary signal. A subsequent adversarial code review found independent
integrity defects in sparse probability rounding, receipt validation, comparator
selection, bootstrap implementation, cell completeness, and the meaning of a
`fresh` run. That first v2 row artifact is invalidated and cannot support model
selection, a delta claim, or promotion. No fresh corpus exists and no fresh label
has been observed.

Before recollecting the exposed diagnostic—and therefore before any future fresh
collection—the following contracts are frozen for the corrected implementation:

- sparse top-k probabilities and one aggregate tail are quantized together with
  Hamilton largest-remainder apportionment to exactly 100,000,000 E8 units;
  descending fractional remainder is used with original category order as the
  deterministic tie-break;
- mapped-to-final and control-to-final JSD values are quantized first, and signed
  lens gain is their exact integer difference;
- the registered legacy comparator is normalized union-top-k JSD in natural-log
  units, with one E8 pseudocount added to every mapped and control union
  coordinate before normalization; its binary64 `float.hex()` representation is
  retained so evaluation does not introduce a second quantization tie;
- bootstrap intervals resample whole verticals only, use 10,000 samples, and use
  seed `4731550821279453854`; template groups are not resampled inside a selected
  vertical;
- every promotable run contains the complete Cartesian product of the same cases
  across `{unprimed, primed} x {a, b}`, with distinct A/B lens hashes and the
  primary cell fixed to `unprimed:a`; and
- `fresh` requires a self-hashed, pre-observation corpus manifest bound to the
  preregistration, prompt and label commitments, exact 240-case/120:120/six-by-40
  design, compact frames, checkpoint/tokenizer/distinct lenses, run parameters,
  zero-match leakage report, and independent adjudication report. The collection
  binds that manifest and evaluation revalidates it. A local self-hash detects
  mutation but is not temporal proof; promotion also requires a verified Git or
  signed HoloRepo seal made before observation.
- the fresh run policy binds an exact implementation commit plus hashes for the
  complete HoloServe Python package tree and `pyproject.toml`; collection
  verifies both the file set and current bytes against `git show` before its
  first request and requires the corpus seal to descend from that implementation
  commit; and
- collection preserves every canonical source receipt in a separately hashed
  artifact. Evaluation revalidates those receipt hashes, provenance, sparse
  distributions, and score derivations against the original prompt manifest.

These are fail-closed corrections to the registered measurement and evidence
path, not features selected from fresh outcomes. Any score, threshold, feature,
or corpus change after a fresh seal remains a new preregistration version.

## Claim boundary

The existing 392-row S0 evaluation has already been inspected under the v1
sparse-readout score. It is diagnostic-only for this iteration. In particular,
no result computed on those rows will be described as a new blind result.

The Jacobian-lens estimator remains `corpus_position_average_v1` with
`parityScope: reference-estimator-only`. The change under test is a HoloScript
readout and scoring policy, not parity with Anthropic's paper experiment or a
claim that token-distribution divergence measures concepts, intent, identity,
truth, or consciousness.

## Fixed v2 signal

HoloServe will compute the following from the complete mapped and control
softmax distributions before either distribution is truncated to its top-k
receipt view:

- Jensen-Shannon divergence in natural-log units;
- mapped-to-final and control-to-final Jensen-Shannon divergence, plus their
  signed difference, as a lens-fidelity diagnostic;
- total-variation distance;
- mapped and control entropy in natural-log units;
- mapped and control maximum probability; and
- exact E8 tail mass for both sparse top-k views.

All measurements are quantized once to receipt-bound E8 safe integers. Sparse
probabilities use the top-k-plus-tail largest-remainder contract above. The
primary score is fixed as the arithmetic mean of mapped-versus-control
full-vocabulary Jensen-Shannon divergence across every requested layer-position
observation. Integer aggregation uses round-half-up after summing the E8 layer
values. The score profile is
`mean-mapped-control-full-vocabulary-jsd-nats-v1`; it will not be reweighted or
combined with the secondary metrics after results are seen. Final-distribution
comparisons diagnose lens fidelity only and are not alternate primary scores.

The comparator is the prior normalized score reconstructed from the union of
separately truncated mapped/control top-k supports using the add-one-E8 rule
frozen above. That reconstruction discards most of the vocabulary mass and is
retained only to quantify the measurement delta.

## Leakage-safe evaluation

The 14 known held-out-gap verticals have all been observed previously, so none
is an untouched final holdout. Development evidence will therefore use nested,
grouped evaluation with vertical as the indivisible group:

1. Each outer fold withholds one complete vertical.
2. Any threshold selection is performed only inside the remaining verticals.
3. The operating threshold maximizes recall subject to development FPR <= 0.05.
4. Primed and unprimed conditions are reported separately.
5. Independently fitted A/B lenses are reported separately, with agreement as
   a replication check rather than pooled item-level evidence.
6. Confidence intervals resample complete verticals, not individual rows or
   templates within a selected vertical.

The exhausted fixture bundle contains 196 case IDs but only 166 unique
normalized scenario/ask inputs. Its sorted file-hash bundle digest is
`sha256:3a0fc862bb55117b48914ab4121ae6ae19d501bc39d46813a39e9eeca32f801e`.
All 196 cases are development data. Duplicate scenario/template groups remain
indivisible inside vertical folds and clustered resampling; frames and A/B lens
receipts are repeated measurements, never independent cases.

The fixed primary cell is the unprimed frame with lens A. Lens B and the primed
frame are locked replications rather than cells from which the best result may
be selected. Every scored prompt must contain at most 512 tokens and every
receipt must record `truncated: false`; a truncation, duplicate prompt/template
identity, nonzero leakage match, or label access before score-manifest sealing
invalidates the run.

For v2 diagnostics and the eventual frozen holdout, `unprimed` uses one compact
cross-vertical frame with no inherited vertical-specific system text:
`"\nSituation: {scenario}\n\nTask: {ask} Output JSON only.\n"`. `primed` adds
only the single registered gap-abstention paragraph before that same frame.
Vertical-specific output-contract text, including the longer beneficiary
sentence, is excluded. This removes the v1 development/blind truncation and
system-length shift. The legacy vertical-specific frame may be rerun only as a
named diagnostic and cannot replace the compact primary cell after results are
observed.

Nested results are model-selection evidence, not the final promotion claim. A
final gate requires a newly authored content-disjoint corpus whose ordered
content hash is frozen before any v2 observation is made.

The fresh target is 240 unique cases balanced 120/120 across at least six
verticals, with at least 40 cases per vertical and independent label
adjudication. Existing telos, occlusion, and motif corpora are checkpoint
training inputs and are not fresh merely because the v1 evaluator did not query
them. Fresh prompts must pass exact and preregistered byte/token n-gram leakage
checks against the signed training/validation bins and this exhausted bundle.

Deterministic salts bound to checkpoint
`abbda748c6bd6dec69bd72f25ca5ab28876fbbdbf195f218439ddbd0a10ff914` are:

- nested folds: `242f18a05772a8d6d2dbb79a776398dc1d4453091110b96d0bfc252ae3d74e0a`;
- fresh ordering: `fd183e9dbfc9907a2201d50a5b492242f23a19fc78ab0c57ca539c65ba179170`;
- bootstrap: `41a9d8673311d29ead766869bf95cd3c203e41474b713d08f1bf8936f2b82332`.

## Outcome promotion gates

- blind ROC-AUC >= 0.70;
- AUC improvement over the registered control >= 0.10 with a confidence
  interval lower bound above zero; and
- A/B lens decision agreement >= 0.90.

Scaling remains stopped if any gate fails. No paid fleet expansion,
activation intervention, steering, ablation, or policy authority is authorized
by this experiment.

Fresh-corpus attestation, complete-cell checks, zero truncation, frozen run
configuration, distinct replication lenses, and nondegenerate reliability are
admission constraints. They are stricter evidence-integrity predicates rather
than additional outcome metrics; promotion is impossible if any is absent.

Any later feature, weighting, threshold rule, or dataset change is a new
version and must be frozen before it observes its evaluation labels.

## Corrected exposed-bundle diagnostic result

The corrected diagnostic was recollected after all integrity amendments above.
It contains 196 cases, four complete frame/lens cells, 784 derived rows, 784
canonical source receipts, and zero truncations. It is development evidence
only; `promotionAllowed` is false by construction and by outcome.

The fixed primary cell (`unprimed:a`) produced:

- full-vocabulary JSD ROC-AUC: `0.5049122074`;
- vertical-macro ROC-AUC: `0.4672619048`;
- registered legacy sparse-comparator ROC-AUC: `0.4951923077`;
- AUC delta: `0.0097198997`;
- whole-vertical 10,000-sample delta interval: `[-0.0343325958,
0.0583517841]` (median `0.0091145833`);
- leave-one-vertical-out recall/FPR: `0.0000000000 / 0.0869565217`;
- A/B decision agreement/kappa: `1.0000000000 / 1.0000000000`; and
- frame decision agreement/kappa: `0.9540816327 / 0.6188418323`.

The AUC and delta gates fail. A/B replication is stable, while the frame-kappa
admission check also fails. Mean signed lens gain is `-11,684,445` E8. By layer,
mean mapped-versus-final JSD exceeds control-versus-final JSD at layers 2 and 5
(`63,473,423` vs `59,860,895`; `48,659,473` vs `17,217,788`) and is effectively
tied at layer 8 (`124,696` vs `125,574`). For this checkpoint, the fitted
Jacobian lens is therefore not a better target-distribution transport than the
uncorrected logit lens through the useful early/middle band.

Evidence bindings:

- prompt manifest: `sha256:2885bc0ce110f361885d93817466988e79cdc07d7bb55c72cd97b70f50332e31`;
- sealed row artifact: `sha256:60823cad7927fba4292e738f5de4e7eaf74746fc39d2ea27ff4aedf5c690deab`;
- canonical source-receipt artifact:
  `sha256:f4f2a81912a7cf91dfba9e6717745343b80918e8b1c6aebba82819ef5c4338b6`;
- collection manifest: `sha256:b4bd67b7166832c7874874eb2fc6f4e01121050a44a5126a644eda7a9d352e96`
  with self-hash
  `sha256:fc6fbd2d36a3459e083c3850bd351a6e87f1e7a42e25b44813301c0742dde534`;
- evaluator source: `sha256:5354325bb08afb502f41e1856d353d2db6daf18bbdac21649dc807c56328c161`;
- labels: `sha256:6b0ebe9cac7131ecb56e793547c000fec1f2dbb5d2562e4873d9ea665f8143ea`;
- evaluation artifact: `sha256:18a0754bc371664028a2087c0ad21990e6e762e694dbe889d9c1a06a6c300ad2`;
- live HoloServe-to-HoloLlama proof receipt:
  `sha256:b3530086673980e38d5cc059e35a31eeda8e3fc7b76332747cdbe495f4b74f7e`;
  and
- derived HoloLlama signal receipt:
  `sha256:3af13af161c2a5dfcae45b06ae811e63578335199bb51e71b0885de071986e3a`.

Scaling remains stopped. The next admissible experiment is a new, preregistered
representation-quality lane: improve the checkpoint and/or fit a task-balanced,
content-disjoint Jacobian lens, require positive target-fidelity gain before a
semantic gate, then author and Git-seal the 240-case fresh corpus. Threshold or
feature search on these exposed labels is not an admissible next step.
