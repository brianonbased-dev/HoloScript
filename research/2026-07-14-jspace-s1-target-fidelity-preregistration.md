# J-space S1 endpoint target-fidelity preregistration

Status: frozen before generating the S1 A/B calibration corpora, fitting an S1
lens, or computing an S1 target-fidelity value. No semantic label is an input to
this experiment. The already exposed S0 labels and the reserved 240-case
semantic corpus are out of scope and must not be opened by the S1 fitter or
evaluator.

## Why this is a new estimator

The pinned Anthropic estimator remains implemented and named
`corpus_position_average_v1`. It averages the causal influence of each source
position over current and future targets. HoloServe's S0 fidelity diagnostic,
by contrast, compared a lens applied at one endpoint with the model's final
distribution at that same endpoint. The negative S0 result is stable across A/B
fits and is consistent with that objective mismatch; it is not evidence that
the pinned implementation is defective.

S1 does not change or relabel the paper-parity path. It introduces the separate
estimator `endpoint_self_jacobian_affine_v1`, with `paperParity: false`,
`positionPolicy: endpoint-self-only`, and transport profile
`mean-anchored-affine-final-residual-v1`. It may establish same-position causal
transport fidelity for this checkpoint. It does not establish parity with the
paper experiment or recover concepts, intent, identity, truth, consciousness,
or policy authority.

## Frozen estimator

For source layer `l`, calibration prompt `i`, and final token `t_i`, the linear
term is the endpoint self-Jacobian

`J_i,l = d h_9,t_i / d h_l,t_i`.

The served map is fit separately in four absolute-position bins. Within a bin:

- `J_l = mean_i(J_i,l)`;
- `xbar_l = mean_i(h_l,t_i)`;
- `ybar = mean_i(h_9,t_i)`;
- `b_l = ybar - J_l xbar_l`; and
- the readout residual is `hhat_9 = J_l h_l + b_l`.

The target is the post-block residual at layer 9. Source layers are exactly
`[2, 5, 8]`. The fixed inclusive absolute-position bins are `[0,127]`,
`[128,255]`, `[256,383]`, and `[384,511]`. Calibration uses `dim_batch=8`,
`max_seq_len=512`, complete prompts only, and reject-over-limit behavior. No
prompt is sliced from a concatenated token stream and no calibration prompt is
silently truncated.

HoloServe applies the bin-selected `J h + b` map only at the final observed
token. HoloLlama must reject estimator, transport, position-policy, position-bin,
or receipt mismatches. HoloServe receipts must retain the full-distribution
identity comparison and a bin-wise mean-final anchor control. The anchor control
is a collapse check, not an alternate semantic score.

## Frozen A/B/H corpus design

Three independently generated, mutually disjoint, label-free corpora are used:
fit A, fit B, and fidelity holdout H. Each full split has 192 complete prompts:

`6 task families x 4 opaque task forms x 4 position bins x 2 variants`.

The six task families cover physical access/action, relational composition,
causal/temporal state, normative commitment/benefit, semantic/pragmatic
interpretation, and planning/tension. They are prompt-shape strata, not outcome
labels. A, B, and H use domain-separated seeds, lexicons, and grammar packs.

Prompt token-count ranges, including BOS, are fixed at `96-127`, `160-223`,
`288-351`, and `416-479`, respectively. Every split contains the same number of
prompts from every family and position bin. All prompts end before the model's
512-token limit and must report `truncated: false`.

The generator seed for split `s` is:

`SHA256(preregistration_sha256 || checkpoint_sha256 || "jspace-s1-" || s)`.

Survivors are ranked by `SHA256(seed || canonical_body_sha256)`; the lowest two
admissible variants in each family/form/bin cell are selected. An underfilled
cell fails. Manual substitutions, outcome-guided edits, and relaxed leakage
criteria are prohibited.

The exclusion reference is built from the exact checkpoint-bound
`train.bin`, `val.bin`, and tokenizer, not a regenerated current dataset. It
also includes every legacy A/B lens calibration sequence and the content-bearing
scenario/ask bodies from the exposed S0 prompt manifest. Windows never cross an
EOS row boundary. Fixed evaluation-frame boilerplate is checked separately and
excluded from content-window matching.

Admission requires:

- zero raw or NFKC/casefold/collapsed-whitespace full-body equality;
- zero complete candidate token-sequence equality;
- zero candidate/reference body containment in either direction;
- zero shared normalized UTF-8 64-byte content windows;
- zero shared tokenizer 32-token content windows;
- the same zero-overlap checks across A, B, and H; and
- at least 64 normalized content bytes and 32 content tokens per candidate.

The corpus manifest binds the generator source, grammar packs, checkpoint,
tokenizer, train/validation binaries, exposed prompt commitment, split hashes,
scanner widths, normalization version, reference-index digest, per-reference
zero counts, and a self-hash.

## Frozen execution stages

An engineering smoke may use the first lexicographically ranked prompt from
each family/bin cell: 24 fit-A, 24 fit-B, and 24 holdout-H prompts. It uses the
same estimator, bins, layers, metrics, and thresholds. It can detect runtime,
memory, or sign failures but cannot authorize a semantic gate.

The confirmation run fits all 192 A and all 192 B prompts and evaluates both
lenses on all 192 H prompts. Pilot outcomes cannot change the confirmation
settings. Abort conditions are OOM, a non-finite artifact or receipt, peak GPU
memory above 90%, projected causal-fit wall time above 45 minutes on the active
rail, leakage, truncation, corpus mutation, or semantic-label access. A compute
abort may move the identical sealed run to a larger leased rail; it may not
change the estimator.

## Frozen label-blind metrics and gates

For holdout item `i` and layer `l`:

`gain_i,l = JSD(identity_i,l, target_i) - JSD(mapped_i,l, target_i)`.

The anchor gain replaces identity with the bin-wise mean-final anchor. All JSDs
use complete vocabulary distributions in natural-log units and receipt E8
quantization. Confidence intervals use 10,000 whole-task-family bootstrap
samples with seed `7301642128954031337` and percentile `[2.5, 50, 97.5]`.

For both A and B independently, all of these must pass:

- the equal-layer macro gain over layers 2 and 5 has bootstrap lower bound
  above zero against identity and against the mean-final anchor;
- each of layers 2 and 5 has identity-gain and anchor-gain lower bounds above
  zero, ratio-of-means JSD reduction at least 5%, Wilson 95% lower bound for
  `Pr(gain > 0)` above 0.50, and positive mean gain in every position bin;
- layer 8 is non-inferior: mean gain at least `-0.0001` nats and bootstrap lower
  bound above `-0.0005` nats;
- macro absolute entropy-error improvement and maximum-probability-error
  improvement over identity each have bootstrap lower bounds above zero;
- mapped top-token diversity is at least 80% of target diversity, mapped maximum
  token share is no greater than `max(10%, 1.25 x target share)`, and no position
  bin collapses to one mapped top token; and
- all artifacts, distributions, and receipt measurements are finite.

Across the paired A/B holdout rows, macro-gain Pearson correlation and sign
agreement must each be at least 0.90. The confirmation pre-gate passes only if
every A gate, every B gate, and the A/B replication gate pass.

The optional positive control is a separately named residual-correction ridge
affine map with fixed scale-normalized regularization
`lambda = 0.01 * trace(Cxx) / 640` and an unpenalized intercept. It consumes no
semantic labels. Ridge success can show that final residuals are linearly
predictable, but it cannot substitute for a failed causal Jacobian gate and
cannot authorize J-space semantic promotion.

## Promotion boundary

No semantic AUC, threshold, feature, or label is computed in S1. A passing smoke
does not authorize fresh-corpus work. Only a sealed full confirmation pass may
allow an independent custodian to author or open the reserved 240-case corpus.
The custodian must attest zero overlap against the sealed A/B/H corpora without
returning prompts or row hashes to the S1 fitter before the semantic observation.

If endpoint Jacobian confirmation fails, semantic scaling remains stopped. The
failure and the ridge-control disposition, if run, become a new registered
residue; thresholds or features are not searched on exposed semantic labels.
