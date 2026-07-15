# J-space S4 pilot evidence

This directory preserves the label-blind S4 mean-centered scalar-Jacobian
pilot at exact HoloScript revision
`ad1576afef78dee746fd7978b05839300c9efc0f`.

The frozen gate failed. Lane A earned positive macro identity and anchor gains,
while lane B earned a positive anchor lower bound but missed the identity lower
bound. Both lanes failed primary-layer robustness, mapped-token diversity, and
max-probability-error gates. Replication Pearson correlation passed its floor,
but sign agreement did not.

The attribution controls isolate the next residue: scalar calibration beat the
registered local-Taylor control in both lanes, yet lost to the unscaled
mean-centered Jacobian control by about 0.018 to 0.020 nats on the primary-layer
macro. S4 confirmation and all semantic-label access therefore remain closed.

The two private lens artifacts are not stored in the repository. The evidence
manifest records only their byte counts and SHA-256 digests. Promoted fit
receipts are scalar-redacted; promoted collection and fidelity artifacts bind
96 A/B holdout observations without raw prompts, raw activations, credentials,
or absolute local paths.

The next admissible experiment is a separately preregistered unscaled
mean-centered Jacobian transport over only the still-unobserved S4 confirmation
source. This failed pilot is not admission evidence for S4 confirmation.
