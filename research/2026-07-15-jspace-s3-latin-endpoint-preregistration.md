# J-space S3 Latin-balanced endpoint preregistration

Status: frozen before generating an S3 subset artifact, fitting an S3 lens,
or computing any S3 model measurement. S3 consumes no semantic labels. The
reserved semantic corpus remains unopened and out of scope.

## Registered residue from S2

S2 recovered replicated directional evidence against the identity logit lens,
but failed its frozen admission gates. The layer-2/layer-5 macro identity gains
were `0.09571180` nats in lane A and `0.05097283` nats in lane B, while the
macro gains against the bin-wise mean-final anchor were negative. A/B Pearson
replication was `0.87088720`, sign agreement was `0.83333333`, and target
top-token diversity by position bin was `[4, 1, 3, 2]`.

The S2 pilot selector was globally balanced but coupled only two of the eight
endpoint profiles to each absolute-position bin. Because the frozen fidelity
gates are conditional on position bin, that sampling defect makes the failed
target-variation gate inconclusive as a test of varied endpoints. S2 remains a
failed pilot. S3 neither pools S2 observations nor changes its disposition.

S3 changes one factor only: it selects a Latin-balanced, previously unobserved
subset from the already generated and leakage-sealed S2 full corpus. The S2
estimator, transport, controls, layers, bins, evaluator, bootstrap, and gate
thresholds remain unchanged. Scalar calibration and all other estimator changes
are prohibited in S3.

## Frozen estimator and runtime contract

S3 retains `endpoint_self_jacobian_local_taylor_v1` with
`paperParity: false`, `positionPolicy: endpoint-self-only`, and transport
profile `local-taylor-affine-final-residual-v1`.

For source layer `l`, calibration prompt `i`, and its final continuation token:

- `J_i,l = d h_9,i / d h_l,i`;
- within each position bin, `J_l = mean_i(J_i,l)`;
- `b_l = mean_i(h_9,i - J_i,l h_l,i)`; and
- serving uses `hhat_9 = J_l h_l + b_l`.

Source layers are exactly `[2, 5, 8]`; the target is the post-block residual at
layer 9. Inclusive absolute-position bins are `[0,127]`, `[128,255]`,
`[256,383]`, and `[384,511]`. Calibration uses `dim_batch=8`,
`max_seq_len=512`, exact generated prefixes, and reject-over-limit behavior.
The identity logit lens and bin-wise mean-final target-residual anchor remain
the two controls. No HoloServe estimator, HoloLlama capability, transport,
receipt, or anchor-control contract is added or changed for S3.

## Frozen source and exclusion boundary

S3 consumes only the committed full A/B/H artifacts from the sealed S2 corpus
manifest. It must verify the S2 corpus manifest self-hash, full-artifact hashes,
pilot-artifact hashes, leakage-report hash and self-hash, checkpoint hash,
tokenizer hash, and `semanticLabelsAccessed: false` before selection.

Every case ID, SHA-256 hash of the exact UTF-8 prompt, and token-sequence hash
in the 24-row S2 pilot artifact for the same lane is an exposed observation and
must be excluded. S3 selection fails if any selected pilot or confirmation row
overlaps that exposed set, if a selected row is not an exact member of its
sealed S2 full artifact, or if A/B/H select different
`(family, position bin, task form, variant)` coordinates. The selected A/B/H
sets must also remain mutually disjoint by all three identities. No exposed S2
row may be pooled into an S3 fit, holdout, confidence interval, or confirmation.

The inherited S2 leakage admission remains binding: zero equality,
containment, normalized UTF-8 64-byte content-window overlap, and tokenizer
32-token content-window overlap against the checkpoint train/validation data,
legacy sequences, S0 bodies, S1 corpora, and cross-lane S2 bodies. S3 performs
no prompt generation or substitution.

## Frozen 48-row pilot selector

Use the S2 family order:

1. `physical`
2. `relational`
3. `causal_temporal`
4. `normative`
5. `semantic_pragmatic`
6. `planning_tension`

Map endpoint slot `0..7` to `(task form, variant)` in this exact order:

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

For family index `f in [0,5]` and position-bin index `b in [0,3]`, define:

`g_f = (1 + 4 * (f mod 2) + 2 * floor(f / 4)) mod 8`.

Select the two endpoint slots:

`s_f,b,k = (2 * b + g_f + k) mod 8`, for `k in {0,1}`.

Apply the identical coordinate selector independently to A, B, and H. Each S3
pilot lane therefore has exactly 48 rows: two endpoint profiles per family and
position bin, 12 rows per bin, all eight endpoint profiles in every bin, each
endpoint profile six times globally, and every family seeing every endpoint
profile exactly once. The selector must mechanically prove these invariants,
zero overlap with the S2 pilot case IDs, exact-prompt hashes, and sequence
hashes, and a self-hashed selection manifest before any model observation.

## Frozen independent confirmation set

If and only if every S3 pilot gate passes, the S3 confirmation uses all rows in
the sealed S2 full split that are in neither the exposed S2 pilot nor the S3
pilot. This leaves exactly 120 independently unobserved rows per A/B/H lane.

For each lane the confirmation must have exactly 30 rows per position bin,
each endpoint profile 15 times globally, all eight endpoint profiles present in
every bin, and the same coordinate set across A/B/H. It must be disjoint by both
case ID and sequence hash from every S2 and S3 pilot row. The selector commits
the confirmation artifacts and their hashes before the S3 pilot starts, but a
failed pilot prohibits fitting or observing them.

## Frozen execution stages

No S3 model observation may start until this preregistration, the selector,
pilot and confirmation artifacts, selection manifest, fit runner, dry-run
validation, and relevant tests are committed and the exact Git revision is
recorded.

The pilot fits A and B independently on their 48-row subsets and observes only
the 48-row H subset through both lenses. A passing pilot permits the separately
sealed 120-row confirmation; it does not permit semantic-label access.

Abort on source/hash mismatch, overlap, truncation, corpus or code mutation,
semantic-label access, non-finite artifacts, OOM, peak GPU memory above 90%, or
projected A+B confirmation fit time above 45 minutes on the active rail. A
compute abort may move the identical sealed run to a larger leased rail; it may
not alter the experiment.

## Frozen label-blind metrics and gates

S3 reuses the S2 label-blind evaluator and its exact gate profile. For holdout
item `i` and layer `l`:

`identity_gain_i,l = JSD(identity_i,l, target_i) - JSD(mapped_i,l, target_i)`

and:

`anchor_gain_i,l = JSD(anchor_i, target_i) - JSD(mapped_i,l, target_i)`.

JSD uses the complete vocabulary in natural-log units and receipt E8
quantization. Confidence intervals use 10,000 whole-task-family bootstrap
samples, seed `7301642128954031337`, and percentiles `[2.5, 50, 97.5]`.

For both A and B independently, all gates must pass:

- the equal-layer macro gain over layers 2 and 5 has bootstrap lower bound
  above zero against identity and the mean-final anchor;
- layers 2 and 5 each have identity- and anchor-gain lower bounds above zero,
  at least 5% ratio-of-means identity-JSD reduction, Wilson 95% lower bound for
  `Pr(identity_gain > 0)` above 0.50, and positive identity-gain mean in every
  position bin;
- layer 8 is non-inferior: mean identity gain at least `-0.0001` nats and
  bootstrap lower bound above `-0.0005` nats;
- macro absolute entropy-error and maximum-probability-error improvements over
  identity each have bootstrap lower bounds above zero;
- the target top token has at least four unique values globally, at least two
  in every position bin, and maximum share no greater than 50%;
- mapped top-token unique count is at least 80% of target unique count and its
  maximum share is no greater than `max(10%, 1.25 x target maximum share)`;
- in each position bin, mapped unique count is at least
  `max(2, ceil(0.8 x target-bin unique count))` and mapped maximum share is no
  greater than `max(20%, 1.25 x target-bin maximum share)`; and
- all artifacts, distributions, and receipt measurements are finite.

Across paired A/B holdout rows, macro identity-gain Pearson correlation and
sign agreement must each be at least 0.90. A stage passes only if every A gate,
every B gate, and replication pass. Thresholds may not be relaxed after an
observation.

## Promotion and successor boundary

No semantic AUC, threshold, feature, label, or reserved prompt is read in S3.
Only a sealed 120-row confirmation pass may permit an independent custodian to
open or author the reserved semantic corpus and return a zero-overlap
attestation.

If the balanced S3 pilot still beats identity but not the mean-final anchor,
its result is preserved and scalar calibration may be proposed only as a
separately named, separately preregistered S4 estimator. S3 itself performs no
alpha fit, ridge search, endpoint search, gate search, or outcome-guided row
substitution.
