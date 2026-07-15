# J-space S2 varied-endpoint local-Taylor preregistration

Status: frozen before generating an S2 A/B/H corpus, fitting an S2 lens, or
computing any S2 model measurement. S2 consumes no semantic labels. The
reserved semantic corpus remains unopened and out of scope.

## Registered residue from S1

S1 showed large, replicated improvement over the identity logit lens, but its
fidelity prompts all ended with `Output JSON.`. The target, mapped, and
mean-final anchor distributions consequently shared one top token across the
pilot. Lane B did not beat the anchor with a positive bootstrap lower bound,
and the frozen absolute per-bin diversity gate failed. S1 remains failed; this
document does not reinterpret or modify its result.

S2 tests two changes that follow directly from that residue:

1. prompts end at eight preregistered continuation contexts instead of one
   shared output suffix; and
2. the affine intercept averages the local Taylor residual
   `y_i - J_i x_i` instead of multiplying two independently averaged terms.

Both changes are label-blind. They define a new estimator, corpus, transport
profile, evaluator profile, and receipt family.

## Frozen estimator

For source layer `l`, calibration prompt `i`, and its deliberately constructed
final continuation token `t_i`:

`J_i,l = d h_9,t_i / d h_l,t_i`.

Within each absolute-position bin, fit:

- `J_l = mean_i(J_i,l)`;
- `b_l = mean_i(h_9,t_i - J_i,l h_l,t_i)`; and
- `hhat_9 = J_l h_l + b_l`.

This is named `endpoint_self_jacobian_local_taylor_v1`, with
`paperParity: false`, `positionPolicy: endpoint-self-only`, and transport
profile `local-taylor-affine-final-residual-v1`. The existing
`corpus_position_average_v1` paper-parity estimator and S1
`endpoint_self_jacobian_affine_v1` estimator remain unchanged.

Source layers are exactly `[2, 5, 8]`; the target is the post-block residual at
layer 9. Absolute-position bins are `[0,127]`, `[128,255]`, `[256,383]`, and
`[384,511]`. Calibration uses `dim_batch=8`, `max_seq_len=512`, exact generated
prefixes, and reject-over-limit behavior. HoloServe selects the bin by the
observed final-token position. HoloLlama must reject estimator, transport,
position policy, position bins, lens hash, or anchor-control mismatches.

The mean-final anchor remains the target-residual mean for the selected bin.
It is intentionally unchanged so S2 must demonstrate input-dependent value
beyond a constant target average.

## Frozen A/B/H design

Fit A, fit B, and fidelity H are independently generated, mutually disjoint,
label-free corpora. Each full split has 192 generated continuation prefixes:

`6 task families x 4 opaque task forms x 4 position bins x 2 endpoint variants`.

The task families remain physical access/action, relational composition,
causal/temporal state, normative commitment/benefit, semantic/pragmatic
interpretation, and planning/tension. They are bootstrap strata, never outcome
labels. A, B, and H use new lane-specific grammar packs and lexicons that are
disjoint from S1.

The exact endpoint contexts are selected by `(task form, endpoint variant)`:

| Task form | Variant 0 terminal text | Variant 1 terminal text |
|---|---|---|
| `form_0` | `Analysis:` | `Evidence =` |
| `form_1` | `Decision [` | `Options {` |
| `form_2` | `HoloScript:` then `object "` | `HoloScript:` then `//` |
| `form_3` | `Trace step(` | `Constraint @` |

Each terminal text is preceded by two newlines and is the exact end of the
generated prefix: there is no shared trailing whitespace, period, newline, or
output-format suffix. A prefix ending in open syntax is intentional test input,
not truncation; every row records `truncated: false` and its endpoint profile.

Token-count ranges including BOS are `96-127`, `160-223`, `288-351`, and
`416-479`. Padding appears in the situation body before the terminal context.
No generated prefix is sliced from a stream or silently shortened.

For lane `s`, the generator seed is:

`SHA256(preregistration_sha256 || checkpoint_sha256 || "jspace-s2-" || s)`.

Candidates are ranked by `SHA256(seed || canonical_body_sha256 ||
endpoint_profile)` and selected deterministically. An underfilled cell fails;
manual substitutions, endpoint edits, outcome-guided changes, and relaxed
leakage criteria are prohibited.

## Frozen isolation and leakage admission

The reference index is built from the exact checkpoint-bound `train.bin`,
`val.bin`, and tokenizer; every legacy lens sequence; exposed S0 prompt bodies;
and all sealed S1 A/B/H bodies and token sequences. S2 also performs the same
cross-lane A/B/H checks. Windows never cross an EOS boundary. Registered frame
and endpoint boilerplate is verified separately and excluded from body-window
matching.

Admission requires zero raw or normalized body equality, zero complete token
sequence equality, zero containment in either direction, zero shared normalized
UTF-8 64-byte content windows, and zero shared tokenizer 32-token content
windows. Every body must contain at least 64 normalized bytes and 32 content
tokens. The report binds source hashes, widths, normalization, reference-index
digest, S1 manifest, per-reference counts, failed case IDs, and a self-hash.

No S2 model observation may start until the preregistration, generator, corpus,
leakage report, estimator implementation, evaluator profile, and tests are
committed and the exact Git revision is recorded.

## Frozen execution stages

The engineering pilot uses the first selected row from each family and position
bin: 24 A, 24 B, and 24 H rows, balanced across the eight endpoint profiles.
The full confirmation uses all 192 rows in each split. Both stages use the same
estimator, layers, bins, metrics, bootstrap seed, and gates. The pilot may stop
an inadmissible or wasteful full run but can never authorize semantic work.

Abort on leakage, truncation, corpus or code mutation, semantic-label access,
non-finite artifacts, OOM, peak GPU memory above 90%, or projected A+B full-fit
wall time above 45 minutes on the active rail. A compute abort may move the
identical sealed run to a larger leased rail; it may not alter the experiment.

## Frozen label-blind metrics and gates

For holdout item `i` and layer `l`:

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
sign agreement must each be at least 0.90. The S2 gate passes only if every A
gate, every B gate, and replication pass. Target-diversity failure is an
inconclusive-corpus failure, not permission to relax the gate after observation.

## Promotion boundary

No semantic AUC, threshold, feature, label, or reserved prompt is read in S2.
Only a sealed full confirmation pass may permit an independent custodian to
open or author the reserved semantic corpus and return a zero-overlap
attestation. If the pilot or confirmation fails, the result is preserved as a
new residue; thresholds, endpoint contexts, and estimator terms are not searched
against exposed semantic labels.
