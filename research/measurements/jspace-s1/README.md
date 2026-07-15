# J-space S1 pilot result

The frozen S1 pilot failed its preregistered admission gate. It therefore does
not authorize a full S1 confirmation run or any semantic-label observation.
The failure is preserved rather than repaired in place.

## What worked

Two independently fit `endpoint_self_jacobian_affine_v1` lenses reduced the
identity logit-lens divergence by 98--99% at primary layers. Their per-case
macro gains replicated with Pearson correlation `0.96146476` and sign agreement
`1.0`. Lane A also beat the bin-wise mean-final anchor with a positive
whole-family bootstrap lower bound.

These results establish that the same-position affine Jacobian path is real and
reproducible on this checkpoint. They do not establish paper parity or semantic
validity.

## Why the gate failed

Every fidelity prompt ended with the same `Output JSON.` suffix. The target
distribution consequently had one top token across all 24 holdout cases, the
same JSON-opening token that dominated the mapped and mean-anchor controls.
That made two frozen gates fail:

- lane B's macro map-over-anchor bootstrap interval crossed zero; and
- the per-position-bin anti-collapse rule failed because both target and map
  had only one top token.

The estimator still beat identity by a large margin, but a nearly constant
target cannot show input-dependent transport beyond the mean-final anchor.
The S1 diversity failure is not retroactively waived: the fixed endpoint is a
new experimental residue.

## Disposition

S1 stops at the pilot. The successor experiment must be separately
preregistered before new model observation, use varied continuation endpoints,
fit the local Taylor intercept `mean(y_i - J_i x_i)`, retain the mean-final
anchor, and compare mapped diversity relative to target diversity. S1's paper
parity path, estimator, artifacts, and thresholds remain unchanged.

The [pilot manifest](./pilot-manifest.json) binds the promoted fit receipts,
receipt-derived rows, full source receipts, collection manifest, and frozen
evaluation. Large reproducible lens binaries are identified by hash rather
than committed. Billing receipts are also hash-bound but omitted because the
training receipts contain machine-local paths. Promoted JSON/JSONL contains no
raw prompts, raw activations, credentials, or absolute local paths.

The [replay manifest](./pilot-replay-manifest.json) pins the historical source
revision and hashes, exact evaluator arguments, disclosure audit, and canonical
comparison projection. Its replay scope is evaluation from sealed receipts;
bit-exact re-collection additionally requires regenerating the two hash-bound
lens tensors from the sealed fit inputs and checkpoint.

Frozen protocol: [S1 preregistration](../../2026-07-14-jspace-s1-target-fidelity-preregistration.md).
