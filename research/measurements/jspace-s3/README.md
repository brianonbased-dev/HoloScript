# J-space S3 pilot result

The frozen S3 pilot failed admission. It does not authorize an S3
confirmation, semantic-label observation, or downstream semantic claims.

## Sampling correction succeeded

S3 changed only the label-blind subset selection. All eight endpoint profiles
were present in every position bin, and every task family saw every profile
exactly once. Target top-token diversity rose to 19 globally and
`[7, 6, 7, 6]` by position bin. The largest target-token share was 47.916667%
globally and at most 50% in each bin, so the frozen target-variation gate passed
for both independent lenses.

This isolates the remaining failure from the S2 endpoint/bin sampling
confound. It does not rescue the estimator.

## Estimator gates failed

- Lane A's layer-2/layer-5 macro identity gain was `-0.01149427` nats with a
  95% bootstrap lower bound of `-0.05010314`; its macro anchor gain was
  `-0.01657170`.
- Lane B's macro identity gain was `-0.03402541` nats with a lower bound of
  `-0.07190873`; its macro anchor gain was `-0.03496094`.
- Layer 5 was negative in every position bin for both lanes, and layer 2 was
  negative in the earliest bin for both lanes.
- A/B replication was `0.88300272` Pearson and `0.87500000` sign agreement,
  below the frozen `0.90` thresholds.
- Learned-map top-token diversity collapsed to 7 tokens for A and 6 for B,
  with an 81.25% maximum share in both lanes.
- Macro identity, anchor, primary-layer, entropy, max-probability,
  mapped-diversity, and replication gates failed. Only target variation and
  ceiling-layer non-inferiority passed.

The frozen disposition is therefore: do not run S3 confirmation and do not
open semantic labels. Any calibrated estimator is a separately preregistered
successor using still-unobserved rows.

## Evidence boundary

The [pilot manifest](./pilot-manifest.json) binds the historical source
revision, six promoted replay artifacts, omitted lens tensors, local billing
receipts, disclosure audit, and frozen disposition. The promoted artifacts
contain no raw prompts, raw activations, machine-local paths, or credentials.
They do contain bounded decoded top-token outputs needed to replay fidelity.

The large lens tensors and billing receipts remain hash-bound outside Git.
Billing receipts are omitted because fitter receipts contain machine-local
paths. The lenses are reproducible from the sealed corpus, checkpoint, and
committed estimator.

Frozen protocol: [S3 preregistration](../../2026-07-15-jspace-s3-latin-endpoint-preregistration.md).
