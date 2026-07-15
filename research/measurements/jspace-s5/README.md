# J-space S5 pilot evidence

This directory preserves the label-blind S5 unscaled mean-centered Jacobian
pilot at exact HoloScript revision
`c36043724c0be14ca110893515f9d06a2424d7c0`.

The frozen ordinary gate failed. Both lanes earned positive macro identity
gain lower bounds, but neither earned the macro anchor lower bound or
primary-layer robustness. Both also failed maximum-probability-error and
mapped-token-diversity gates; lane A additionally failed entropy error.
Replication missed both frozen floors: Pearson correlation was `0.87402843`
and sign agreement was `0.77777778`.

The separate attribution analysis found a reproducible mean-centering signal:
the primary-layer bootstrap lower bound was `0.03970726` nats in lane A and
`0.02621909` in lane B. It did not establish that unscaled transport beats the
scalar-calibrated control, and it did not establish a Jacobian-specific gain.
All primary alpha and beta controls were interior, so clipping does not explain
those attribution failures. Attribution does not substitute for the failed
ordinary gate.

S5 confirmation and all semantic-label access therefore remain closed. This
failure exhausts the sealed S2-through-S5 holdout lineage under the
preregistration; there is no admissible S6 carve from the same source. The next
scale lane must move upstream to training/model capacity or use a separately
preregistered untouched corpus, rather than tuning another estimator against
this holdout.

The two private lens artifacts are not stored in the repository. The evidence
manifest records only their byte counts and SHA-256 digests. Promoted fit
receipts are private-state-redacted; promoted collection and fidelity artifacts
bind 72 A/B observations without raw prompts, raw activations, credentials, or
absolute local paths.

Operationally, the first lane-B process was externally terminated with Windows
status `DBG_TERMINATE_PROCESS` (`0x40010004`) before either B output existed.
After a clean output-boundary and GPU check, the exact retry completed and its
receipt-bound loadback passed.
