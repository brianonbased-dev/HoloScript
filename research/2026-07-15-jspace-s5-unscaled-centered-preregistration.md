# J-space S5 unscaled mean-centered preregistration

Status: frozen before generating an S5 subset artifact, implementing the S5
receipt binding, fitting an S5 lens, or collecting any S5 model output. S5
consumes no semantic labels. The reserved semantic corpus remains unopened and
out of scope.

## Registered residue from S4

S4 tested a mean-centered endpoint Jacobian with one frozen scalar calibration
per position-bin/layer cell. Its pilot failed the frozen ordinary gate. A/B
replication Pearson was `0.95381204`, but sign agreement was `0.83333333`.
Lane B's layer-2/layer-5 macro identity-gain lower bound was `-0.00578581`, and
the registered layer, entropy, maximum-probability, and mapped-diversity gates
did not all pass. S4 confirmation and all semantic-label access therefore
remain prohibited.

One preregistered S4 control was consistently better than the scalar-calibrated
primary transport on the already observed S4 pilot. Treating the unscaled
mean-centered control as primary gives exploratory macro means:

| Comparison                    |       Lane A |       Lane B |
| ----------------------------- | -----------: | -----------: |
| gain over identity            | `0.07344000` | `0.05669890` |
| gain over mean-final anchor   | `0.06748600` | `0.05335311` |
| gain over S4 scalar transport | `0.02001401` | `0.01768297` |
| gain over local Taylor        | `0.08001922` | `0.07734324` |

These post-hoc means select one already registered estimator factor; they do
not establish an ordinary gate, set a threshold, or contribute any S5 row.
The S4 control receipts do not contain the complete unscaled top-token,
entropy, or maximum-probability evidence needed for admission.

The failed S4 evidence manifest is sealed at
`sha256:21d7b5f82e141773fe32634ba50c62759c9929ba9386fd2ce2bbaaa76df8a38f`.
S5 does not reinterpret S4 as a pass and never invokes S4 confirmation
admission.

## Frozen estimator and receipt contract

S5 reuses the established estimator `endpoint_self_jacobian_affine_v1`; it is
not presented as a novel mathematical estimator. Its transport remains
`mean-anchored-affine-final-residual-v1`, under experiment/gate profile
`s5-unscaled-mean-centered-jacobian-v1`.

For calibration item `i`, source layer `l`, and the final continuation token,
let `x_i = h_l,i`, `y_i = h_9,i`, and
`J_i = d h_9,i / d h_l,i`. Within each absolute-position bin:

`Jbar = mean_i(J_i)`, `xbar = mean_i(x_i)`, and `ybar = mean_i(y_i)`.

The served transport is:

`M = Jbar`, `b = ybar - Jbar xbar`, and
`yhat = ybar + Jbar (x - xbar) = M x + b`.

The canonical UTF-8 formula string is
`endpoint_self_jacobian_affine_v1:M=mean_i(J_i);xbar=mean_i(x_i);ybar=mean_i(y_i);b=ybar-M@xbar;yhat=M@x+b`.
Its digest is
`sha256:b776c634fb7b171952149c5fed7a9e3a8a73ad98798e10ce469687fc6817c6a1`.

Accumulation is float64. `Jbar`, `xbar`, `ybar`, and `b` are cast to float32
only after the formula is evaluated and verified. Calibration is independent
for each of four position bins and source layers `[2, 5, 8]`; the target is the
post-block residual at layer 9. Runtime remains `dim_batch=8`,
`max_seq_len=512`, exact generated prefixes, and reject-over-limit behavior.
There is no ridge, scalar, clip, interpolation, fallback, parameter sweep, or
outcome-guided retry in the served S5 path.

S5 adds receipt-bound provenance without changing historical S1/V2 artifacts.
The fit binding schema is `holoscript.jspace-s5-fit-binding.v0.1.0`; the
required fit receipt schema is `holoscript.jspace-s5-fit-receipt.v0.1.0`.
The artifact continues to name the canonical estimator and transport, and is
distinguished by its S5 fit binding and experiment profile. A historical
receipt-unbound V2 artifact is not an S5 artifact and cannot be relabeled.

The fit binding seals the formula digest, checkpoint and tokenizer hashes,
source artifact hash, exact sample and per-bin counts, sequence-order digest,
sequence-set digest, tensor digest, estimator, transport, layers, position
bins, and preregistration/selector revision. The fit receipt additionally
seals the private lens hash. The loader requires the receipt for every S5
artifact and rejects a missing receipt, optional-receipt downgrade, V2/V4/S5
receipt confusion, source-order or source-set mismatch, malformed binding,
non-finite tensor, wrong dtype or shape, and matrix/bias mismatch. It recomputes
`b = ybar - Jbar xbar` in float64 and compares the serialized float32 bias with
`rtol=2e-5, atol=2e-5` before serving.

## Frozen controls and attribution

Controls use the same A/B calibration rows, H observations, checkpoint,
tokenizer, layers, and position bins. They require no additional H prompt:

1. Identity logit lens.
2. Bin-wise mean-final anchor.
3. S3 local-Taylor control, `M=Jbar` and
   `b=ybar-mean_i(J_i x_i)`.
4. S4 scalar-calibrated control, derived in the exact frozen S4 float64
   operation order with `rho=0.001` and clip bounds `[0,2]`.
5. Centered scalar-identity control, derived in the exact frozen S4 order.
6. The S5 unscaled mean-centered Jacobian transport.

For every H item and layer, record full-vocabulary natural-log JSD to target,
entropy error, maximum-probability error, and mapped top-token values for the
identity and S5 paths. Record target JSD for controls 2 through 5. The
following attribution gains are computed:

- `mean_centering_gain = JSD(localTaylor,target) - JSD(S5,target)`;
- `unscaled_gain = JSD(scalarCalibrated,target) - JSD(S5,target)`; and
- `jacobian_specific_gain = JSD(scalarIdentity,target) - JSD(S5,target)`.

Attribution never weakens or substitutes for an ordinary gate. A mean-centering
claim requires the layer-2/layer-5 macro bootstrap lower bound for
`mean_centering_gain` above zero in both lanes. An unscaled-over-calibrated
claim additionally requires the `unscaled_gain` lower bound above zero in both
lanes and every primary S4 alpha strictly inside `(0,2)`. A Jacobian-specific
claim requires its lower bound above zero in both lanes and every primary beta
strictly inside `(0,2)`. Ordinary fidelity may pass while a mechanism claim is
prohibited; all results are still published.

## Frozen source and exclusions

S5 consumes only the computationally unobserved S4 confirmation artifacts:

| Lane | Source artifact                                         | Rows | SHA-256                                                                   |
| ---- | ------------------------------------------------------- | ---: | ------------------------------------------------------------------------- |
| A    | `research/data/jspace-s4/fit-a-confirmation.jsonl`      |   72 | `sha256:005c411edc0a53684b95a627ced5672ea67ac74683531b2dd9016e52c0d68637` |
| B    | `research/data/jspace-s4/fit-b-confirmation.jsonl`      |   72 | `sha256:53c67df229050e9496d836d0a399e9dbe906dc2821efa5077813f976cc0d733b` |
| H    | `research/data/jspace-s4/fidelity-h-confirmation.jsonl` |   72 | `sha256:3bdbd1c027c5408fcd96d47825c2698b703fa92239ec01e6112138197dfd54d3` |

The common source-coordinate digest is
`sha256:1a5a1291a0f215c1a73f74683bbf34bef79b1ed953b8cb17e21192a46ce93ecc`.
The S4 selection-manifest self-hash is
`sha256:870a25aeb2462df8c57e0291e93a9785b74d366478a881f319c0dfa76a046a20`.

These files have been parsed and hash-validated by prior dry runs, but no
model target outputs have been collected for them. They are not described as
literally unread. The selector may inspect only sealed row identifiers and
coordinate metadata; it may not inspect prompt, ask, scenario, answer, or any
semantic field.

Before selection or fit, mechanically verify the S2 through S4 corpus,
leakage, reference, selection, preregistration, selector, failed-pilot,
promoted-observation, and receipt manifests; checkpoint and tokenizer hashes;
and `semanticLabelsAccessed: false` throughout. Every S5 row must be an exact
sealed S4-confirmation member. No S5 case ID, prompt hash, or sequence hash may
occur in an exposed S2/S3/S4 pilot artifact. A/B/H coordinates are identical
and lanes remain pairwise disjoint by case ID, prompt hash, and sequence hash.
Pilot and confirmation have zero overlap by all three identities. Any mismatch
aborts; substitution is prohibited.

The inherited S2 leakage admission remains binding: zero equality,
containment, normalized UTF-8 64-byte content-window overlap, and tokenizer
32-token content-window overlap against checkpoint train/validation data,
legacy sequences, S0 bodies, S1 corpora, and cross-lane S2 bodies. S5 performs
no prompt generation, edits, ranking by content, or semantic inspection.

## Frozen 36/36 split

Coordinate indices inherit these exact public mappings:

- family order: `[physical, relational, causal_temporal, normative,
semantic_pragmatic, planning_tension]`;
- position bins: `0=[0,127]`, `1=[128,255]`, `2=[256,383]`, and
  `3=[384,511]`; and
- endpoint slots: `0=analysis-colon/form_0/variant_0`,
  `1=evidence-equals/form_0/variant_1`,
  `2=decision-list/form_1/variant_0`,
  `3=options-object/form_1/variant_1`,
  `4=holoscript-object-name/form_2/variant_0`,
  `5=holoscript-line-comment/form_2/variant_1`,
  `6=trace-call/form_3/variant_0`, and
  `7=constraint-trait/form_3/variant_1`.

Every source lane contains exactly three endpoint slots in each of the 24
`family x position-bin` cells. The S5 pilot takes
`q(f,b)=1+((f+b) mod 2)` rows from cell `(f,b)`; confirmation is the exact
ordered complement. Both stages therefore contain 36 rows per lane, six rows
per family, and nine rows per position bin.

The following table is frozen from coordinate metadata alone. `P` lists pilot
endpoint slots and `C` lists confirmation slots.

| Family               | Bin 0          | Bin 1          | Bin 2          | Bin 3          |
| -------------------- | -------------- | -------------- | -------------- | -------------- |
| `physical`           | P `5`; C `6,7` | P `5,6`; C `7` | P `0`; C `3,4` | P `1,4`; C `2` |
| `relational`         | P `2,7`; C `3` | P `4`; C `1,6` | P `0,3`; C `5` | P `0`; C `1,2` |
| `causal_temporal`    | P `3`; C `4,5` | P `2,6`; C `7` | P `4`; C `0,7` | P `1,5`; C `6` |
| `normative`          | P `0,2`; C `1` | P `3`; C `2,4` | P `3,7`; C `0` | P `5`; C `1,6` |
| `semantic_pragmatic` | P `6`; C `5,7` | P `0,7`; C `2` | P `1`; C `3,4` | P `4,6`; C `5` |
| `planning_tension`   | P `1,3`; C `2` | P `6`; C `0,3` | P `5,7`; C `1` | P `2`; C `0,4` |

The table is the canonical lexicographically maximal feasible bit vector with
`1 > 0` over coordinates ordered by
`(familyIndex, positionBinIndex, endpointSlot)`: greedily set each earliest
coordinate to pilot if and only if the remaining constraint system is
feasible. The constraints are:

- exact quota `q(f,b)` in every cell;
- each stage has endpoint counts between four and five globally;
- each task-form pair occurs exactly nine times per stage;
- even and odd endpoint variants each occur exactly 18 times per stage;
- every bin/endpoint with source multiplicity at least two occurs in both
  stages;
- bin-0 singleton slots `{0,4}` and bin-1 singleton slots `{1,5}` are divided
  one singleton per stage; and
- every family retains at least five unique endpoint profiles in each stage.

Pilot endpoint counts for slots `0..7` are `[5,4,4,5,4,5,5,4]`;
confirmation counts are `[4,5,5,4,5,4,4,5]`. Slots 2 and 6 are absent from
source bin 2, while slots 3 and 7 are absent from source bin 3, so no uniform
endpoint-by-position claim is permitted. Within each stage, coordinates are
written in canonical lexicographic order. The selector must reproduce this
exact table, prove the constraints, and commit artifact byte hashes and a
self-hashed selection manifest before any model inference.

## Frozen ordinary fidelity gates

S5 carries every S4 ordinary threshold forward unchanged. JSD uses the full
vocabulary in natural-log units and receipt E8 quantization. Confidence
intervals use 10,000 whole-task-family bootstrap samples, seed
`7301642128954031337`, and percentiles `[2.5,50,97.5]`.

For A and B independently, all gates must pass:

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
  is no greater than `max(10%,1.25 * target maximum share)`;
- per bin, mapped unique count is at least
  `max(2,ceil(0.8 * target-bin unique count))` and maximum share is no greater
  than `max(20%,1.25 * target-bin maximum share)`; and
- artifacts, controls, distributions, and receipts are finite.

Across paired A/B H rows, macro identity-gain Pearson correlation and sign
agreement must each be at least `0.90`. A stage passes only if every A gate,
every B gate, replication, and artifact-integrity check pass. Attribution is
reported separately under the frozen rules above and cannot rescue a failed
ordinary stage.

## Frozen execution and promotion boundary

No S5 model observation starts until this preregistration, selector, pilot and
confirmation artifacts, selection manifest, receipt-bound S5 fitter/loader,
HoloServe evaluation controls, HoloLlama capability mapping, collection and
fidelity runner, fail-closed admission, dry runs, and relevant tests are
committed at one exact Git revision.

The pilot independently fits A and B on their 36-row subsets and observes only
the 36-row H subset through both lenses and all frozen controls. Any pilot
ordinary, integrity, or resource failure is preserved as a failed result and
prohibits confirmation, semantic labels, row replacement, threshold changes,
and an estimator retry on this sealed pool.

Only a hash-bound pilot manifest that passes every ordinary gate permits two
independent from-scratch 36-row confirmation fits and the 36-row confirmation
H observation. Pilot rows, matrices, sufficient statistics, and measurements
are never pooled into confirmation. Only a full independently sealed
confirmation ordinary pass may hand off to a separate semantic custodian.

Abort on source/hash mismatch, prior-row exposure, overlap, truncation, code or
corpus drift, semantic-label access, non-finite artifact, OOM, peak GPU memory
above 90%, projected A+B confirmation fit time above 45 minutes, or any
confirmation attempt without the exact hash-bound passing pilot admission.
No hardware scale-out occurs before confirmation passes.

This is the final admissible reuse of the canonical unscaled estimator on the
remaining sealed S4 source. An S5 failure exhausts this lineage: no S6 may be
carved from these rows. Further work requires a newly preregistered corpus or
checkpoint, or a genuinely new estimator derived without observing S5 output.
