# J-space S4 centered scalar-calibration preregistration

Status: frozen before generating an S4 subset artifact, implementing the S4
estimator, fitting an S4 lens, or observing any S4 model output. S4 consumes no
semantic labels. The reserved semantic corpus remains unopened and out of
scope.

## Registered residue from S3

S3 repaired the S2 endpoint/bin sampling confound. All eight endpoint profiles
were represented in every position bin, every family saw every endpoint once,
and target top-token variation passed with 19 values globally and
`[7, 6, 7, 6]` by bin.

The balanced pilot nevertheless falsified the local-Taylor estimator under the
frozen gates. Layer-2/layer-5 macro identity gain was `-0.01149427` nats in
lane A and `-0.03402541` nats in lane B; macro mean-final-anchor gain was
`-0.01657170` and `-0.03496094`. Layer 5 was negative in every position bin.
A/B replication was `0.88300272` Pearson and `0.87500000` sign agreement.
Learned-map target-token diversity collapsed to 7 values for A and 6 for B.

S3 remains a failed pilot. Its confirmation and all semantic-label access are
prohibited. S4 neither pools S3 model observations nor reinterprets S3's
disposition. It changes one estimator factor: the affine intercept is centered
and the mean endpoint Jacobian receives one frozen scalar calibration per
position-bin/layer pair.

## Frozen estimator

The estimator is `endpoint_self_jacobian_scalar_calibrated_v1`, with
`paperParity: false`, `positionPolicy: endpoint-self-only`, transport profile
`mean-centered-scalar-jacobian-final-residual-v1`, and gate profile
`s4-mean-centered-scalar-jacobian-v1`.

For calibration item `i`, source layer `l`, and its final continuation token,
let `x_i = h_l,i`, `y_i = h_9,i`, and
`J_i = d h_9,i / d h_l,i`. Within each absolute-position bin:

`Jbar = mean_i(J_i)`, `xbar = mean_i(x_i)`, and `ybar = mean_i(y_i)`.

Define centered vectors:

`z_i = Jbar (x_i - xbar)` and `r_i = y_i - ybar`.

For hidden width `d` and sample count `n`, accumulate in float64:

`S = (1 / (n d)) sum_i dot(z_i, z_i)`

`C = (1 / (n d)) sum_i dot(z_i, r_i)`

With the fixed multiplicative shrink fraction `rho = 0.001`:

`alphaRaw = C / ((1 + rho) S)`

`alpha = clip(alphaRaw, 0, 2)`

`M = alpha Jbar`, `b = ybar - M xbar`, and `yhat = M x + b`.

`S`, `C`, and `alphaRaw` are computed in float64. `M` and `b` are cast to
float32 only after calibration. Calibration is independent for each of the
four position bins and source layers `[2, 5, 8]`; the target is the post-block
residual at layer 9. Runtime remains `dim_batch=8`, `max_seq_len=512`, exact
generated prefixes, and reject-over-limit behavior.

Non-finite statistics or `S <= 0` abort. There is no fallback, parameter
sweep, alternate ridge, alternate clipping range, or outcome-guided retry.
Any primary layer/bin with `alpha <= 0` or `alpha >= 2` fails the
calibration-attribution gate. The upper boundary indicates cap saturation; the
lower boundary is the mean-final anchor and cannot establish calibrated
transport.

The fixed `rho` is a roughly 0.1% multiplicative OLS shrink, not a tuned ridge.
Clipping supplies the stability bound and must be disclosed.

## Frozen controls and attribution

All controls use the same A/B calibration rows, H observations, checkpoint,
tokenizer, layers, and position bins. They require no additional H prompt.

1. Identity logit lens.
2. Bin-wise mean-final anchor, equivalent to `alpha=0`.
3. Unscaled centered Jacobian, `M=Jbar` and `b=ybar-Jbar xbar`.
4. S3 local-Taylor control, `M=Jbar` and
   `b=ybar-mean_i(J_i x_i)`.
5. Centered scalar-identity control. Let `u_i=x_i-xbar`,
   `S_I=mean(dot(u_i,u_i))/d`, `C_I=mean(dot(u_i,r_i))/d`,
   `betaRaw=C_I/((1+rho)S_I)`, and `beta=clip(betaRaw,0,2)`. It serves
   `beta I x + ybar - beta xbar`.
6. The registered S4 calibrated Jacobian transport.

For every H item and layer, record JSD to target for controls 2 through 6.
The ordinary frozen fidelity gates compare S4 with identity and the mean-final
anchor. Three mechanism-attribution gains are also computed:

- `centered_gain = JSD(unscaled centered Jacobian,target) - JSD(S4,target)`;
- `local_taylor_gain = JSD(S3 local Taylor,target) - JSD(S4,target)`; and
- `jacobian_specific_gain = JSD(centered scalar identity,target) - JSD(S4,target)`.

A scalar-calibration claim requires the layer-2/layer-5 macro bootstrap lower
bound above zero for `centered_gain` and `local_taylor_gain` in both A and B.
A Jacobian-specific claim additionally requires the macro lower bound above
zero for `jacobian_specific_gain` in both lanes. If the ordinary fidelity gates
pass but an attribution gate fails, the estimator may be called
fidelity-admitted, but the failed mechanism claim is prohibited.

## Frozen source and exclusions

S4 consumes only the still-unobserved S3 confirmation artifacts:

| Lane | Source artifact | SHA-256 |
|---|---|---|
| A | `research/data/jspace-s3/fit-a-confirmation.jsonl` | `sha256:8f903f6b8260d4e5feb2e07094ec246012213a3feccfb2807a577dd9657605da` |
| B | `research/data/jspace-s3/fit-b-confirmation.jsonl` | `sha256:2e89761d6810b5ad163405e2cc666df0b8d9261c6b77b26beeb770b7684d73de` |
| H | `research/data/jspace-s3/fidelity-h-confirmation.jsonl` | `sha256:5bbbb8925f172fba7686c2641b0849107e360c7879991666f95b967132b5563e` |

Their common coordinate-set digest is
`sha256:fc5c05858082a3a69aa22282f67d79f94ad4e1899c050f7fc790327111d79fff`.
The S3 selection-manifest self-hash is
`sha256:f09d04f0e8a18d06dc95acee5f26ac40e9f4f0490af93477a84edbd3c01ac7f2`.

Before selection or fit, mechanically verify the S2 corpus, leakage, and
reference manifests; the S3 preregistration, selector, selection manifest,
pilot artifacts, promoted rows, receipts, collection, fidelity evaluation,
and failed evidence manifest; checkpoint and tokenizer hashes; and
`semanticLabelsAccessed: false` throughout.

No S4 case ID, exact-prompt SHA-256, or sequence hash may occur in any exposed
S2 or S3 pilot input, row, receipt, collection, or evaluation artifact. Every
S4 row must be an exact sealed S3-confirmation member. A/B/H must use identical
coordinates while remaining pairwise disjoint by case ID, prompt hash, and
sequence hash. Pilot and confirmation must have zero overlap by all three
identities. An audit must attest that no selected source row was previously fit
or evaluated. Any mismatch aborts; substitution is prohibited.

The inherited S2 leakage admission remains binding: zero equality,
containment, normalized UTF-8 64-byte content-window overlap, and tokenizer
32-token content-window overlap against the checkpoint train/validation data,
legacy sequences, S0 bodies, S1 corpora, and cross-lane S2 bodies. S4 performs
no prompt generation, edits, ranking, or semantic inspection.

## Frozen 48-row pilot split

Endpoint slots remain:

| Slot | Endpoint profile | Task form | Variant |
|---:|---|---|---:|
| 0 | `analysis-colon` | `form_0` | 0 |
| 1 | `evidence-equals` | `form_0` | 1 |
| 2 | `decision-list` | `form_1` | 0 |
| 3 | `options-object` | `form_1` | 1 |
| 4 | `holoscript-object-name` | `form_2` | 0 |
| 5 | `holoscript-line-comment` | `form_2` | 1 |
| 6 | `trace-call` | `form_3` | 0 |
| 7 | `constraint-trait` | `form_3` | 1 |

Select these two slots per task family and position-bin index:

| Family | Bin 0 | Bin 1 | Bin 2 | Bin 3 |
|---|---:|---:|---:|---:|
| `physical` | 3,4 | 0,2 | 1,7 | 5,6 |
| `relational` | 0,1 | 2,3 | 4,7 | 5,6 |
| `causal_temporal` | 6,7 | 0,5 | 1,3 | 2,4 |
| `normative` | 3,7 | 1,6 | 4,5 | 0,2 |
| `semantic_pragmatic` | 1,2 | 3,4 | 5,6 | 0,7 |
| `planning_tension` | 5,6 | 4,7 | 0,2 | 1,3 |

This coverage-only table was chosen without model outputs or semantic labels
and is frozen before observation. It selects two rows per family/bin, 48 rows
per lane, 12 rows per bin, eight rows per family, every endpoint six times
globally, all eight endpoints in every bin, and every family seeing every
endpoint exactly once. Coordinates are ordered lexicographically by
`(familyIndex, binIndex, endpointSlot)`.

The pilot coordinate digest is
`sha256:b45a9913521be33b5889bbd326e76e87bd1e5ee28ab802f03440be3ae569ccde`.
With compact sorted-key JSON lines, LF separators, and a final LF, expected
pilot artifact SHA-256 values are:

- A: `sha256:2da3005d4c6c53e122b48388d612334d0b27577ae8cb7e3e7d2e6c598582eeae`
- B: `sha256:df0f238b2980bfe815d2e9f1c69296565e9de4ec0ca997e43047ae3793671d72`
- H: `sha256:f73c5f8398f809f7ef3dc3d6271dea7409cd2048354f59cd3cb1772510d8bd2d`

## Frozen 72-row confirmation split

The confirmation is the exact lexicographically ordered complement of the S4
pilot within each 120-row S3 confirmation source. It is committed before the
pilot but may be observed only after every S4 pilot gate passes.

The confirmation has 72 rows per lane, 18 per bin, 12 per family, and every
endpoint nine times globally. Every family retains every endpoint at least
once. Its coordinate digest is
`sha256:1a5a1291a0f215c1a73f74683bbf34bef79b1ed953b8cb17e21192a46ce93ecc`.
Expected artifact hashes are:

- A: `sha256:005c411edc0a53684b95a627ced5672ea67ac74683531b2dd9016e52c0d68637`
- B: `sha256:53c67df229050e9496d836d0a399e9dbe906dc2821efa5077813f976cc0d733b`
- H: `sha256:3bdbd1c027c5408fcd96d47825c2698b703fa92239ec01e6112138197dfd54d3`

Confirmation per-bin endpoint counts for slots `0..7` are:

- bin 0: `[1, 2, 3, 3, 1, 3, 2, 3]`
- bin 1: `[2, 1, 3, 2, 2, 1, 4, 3]`
- bin 2: `[4, 2, 0, 4, 3, 2, 0, 3]`
- bin 3: `[2, 4, 3, 0, 3, 3, 3, 0]`

Complete endpoint coverage in both stages is combinatorially impossible: after
S2 and S3 observations, only one row remains for slots 2 and 6 in bin 2 and
slots 3 and 7 in bin 3. The balanced pilot necessarily consumes those four
cells. Confirmation retains six endpoint profiles in each affected bin, so no
uniform endpoint-by-position claim is permitted.

## Artifact and loader invariants

Persist for each `[position bin, source layer]`:

- serialized `matrices = Jbar`, plus `sourceMeans`, `targetMeans`, and served
  `biases = ybar - alpha Jbar xbar`;
- `jacobianSourceProductMeans = mean_i(J_i x_i)` for the S3 control;
- `centeredJacobianEnergyMeans = S` and
  `centeredJacobianTargetCrossMeans = C`;
- scalar-identity `S_I` and `C_I` sufficient statistics;
- `ridgeFraction=0.001`, `clipBounds=[0,2]`; and
- exact sample counts, sequence-order digest, and sequence-set digest.

The serialized artifact and loader must reject unless they can recompute and
verify all formulas above, including `M`, `b`, S3-control bias, alpha, beta,
finite values, positive energies, tensor shapes, repeated target-mean
agreement, estimator/transport identity, checkpoint, tokenizer, corpus,
position bins, sample counts, sequence hashes, artifact self-hash, and lens
hash. Scalar-statistics and control-profile digests are bound into the lens and
fit receipt. Fitted alpha and beta are not separately serialized. The loader
derives them from the sufficient statistics, replaces the loaded serving matrix
with `alpha * matrices`, and retains the unscaled matrix only in the private
evaluation object needed for frozen controls.

HoloLlama exposes the exact estimator-to-transport capability mapping and lens
hash, but not numeric alpha/beta values. It rejects missing or tampered scalar
statistics, matrix/bias mismatch, S3/S4 cross-profile substitution,
unsupported shrink/clip metadata, or capability/receipt mismatch. No silent
downgrade is allowed.

## Frozen execution and ordinary fidelity gates

No S4 model observation starts until this preregistration, selector, pilot and
confirmation artifacts, selection manifest, estimator, loader, HoloLlama
mapping, collection/evaluation support, fail-closed runner, dry runs, and
relevant tests are committed at one exact Git revision.

The pilot independently fits A and B on their 48-row subsets and observes only
the 48-row H subset through both lenses and all frozen controls. A failure
prohibits confirmation. A pass permits independent from-scratch 72-row A/B
fits and the 72-row H observation; pilot rows, scalars, matrices, and
measurements are never pooled.

S4 retains every S3 ordinary gate and threshold unchanged. JSD uses the full
vocabulary in natural-log units and receipt E8 quantization. Confidence
intervals use 10,000 whole-task-family bootstrap samples, seed
`7301642128954031337`, and percentiles `[2.5, 50, 97.5]`.

For A and B independently, all ordinary gates must pass:

- the equal-layer macro over layers 2 and 5 has bootstrap lower bound above
  zero against identity and the mean-final anchor;
- layers 2 and 5 each have identity- and anchor-gain lower bounds above zero,
  at least 5% ratio-of-means identity-JSD reduction, Wilson 95% lower bound for
  `Pr(identity_gain > 0)` above 0.50, and positive identity-gain mean in every
  position bin;
- layer 8 has mean identity gain at least `-0.0001` nats and bootstrap lower
  bound above `-0.0005` nats;
- macro absolute entropy-error and maximum-probability-error improvements over
  identity each have bootstrap lower bounds above zero;
- target top token has at least four unique values globally, at least two per
  bin, and maximum share no greater than 50%;
- mapped unique count is at least 80% of target unique count and maximum share
  is no greater than `max(10%, 1.25 * target maximum share)`;
- per bin, mapped unique count is at least
  `max(2, ceil(0.8 * target-bin unique count))` and maximum share is no greater
  than `max(20%, 1.25 * target-bin maximum share)`; and
- artifacts, controls, distributions, and receipts are finite.

Across paired A/B H rows, macro identity-gain Pearson correlation and sign
agreement must each be at least 0.90. A stage passes only if every A gate,
every B gate, replication, and artifact integrity pass. Attribution results are
reported separately under the frozen rules above; thresholds cannot change
after observation.

Abort on source/hash mismatch, prior-row exposure, overlap, truncation, code or
corpus mutation, semantic-label access, non-finite artifact, OOM, peak GPU
memory above 90%, projected A+B confirmation fit time above 45 minutes, or any
confirmation attempt without a hash-bound passing pilot artifact.

## Promotion boundary

Only an independently sealed S4 confirmation that passes every ordinary
fidelity gate may permit a separate semantic custodian to open or author the
reserved semantic corpus and return a zero-overlap attestation. Neither the S4
pilot nor confirmation itself reads semantic labels. A failed S4 result is
preserved with its receipts; rerunning S4, relaxing gates, swapping rows, or
searching scalars is prohibited.
