# J-space S2 pilot result

The frozen S2 pilot failed admission and does not authorize a full S2
confirmation or semantic-label observation.

## Signal recovered

Both independently fit `endpoint_self_jacobian_local_taylor_v1` lenses beat the
identity logit lens at the equal-weight layer-2/layer-5 macro. Lane A gained
`0.09571180` nats with bootstrap lower bound `0.08160579`; lane B gained
`0.05097283` nats with lower bound `0.01683122`. The varied endpoints also
raised global target top-token diversity from S1's one token to eight.

This is stronger evidence than S1 that endpoint-conditioned residual transport
exists. It is not sufficient admission evidence.

## Gates that failed

- Neither lens beat the bin-wise mean-final anchor: macro anchor-gain lower
  bounds were `-0.06812489` and `-0.15484542` nats.
- Layers 2 and 5 had negative mean identity gain in one or more early position
  bins, and the primary-layer reliability gate failed.
- A/B replication was `0.87088720` Pearson and `0.83333333` sign agreement,
  below the frozen `0.90` thresholds.
- The target produced eight top tokens globally, but position-bin diversity was
  `[4, 1, 3, 2]`; the second bin therefore failed the preregistered target
  variation gate.
- Entropy/max-probability gates did not replicate across A and B.

The pilot selection formula was globally balanced across all eight endpoint
profiles but coupled only two profiles to each position bin. That is a design
confound because the frozen gate asks for variation inside every bin. It does
not retroactively invalidate or pass S2; any Latin-balanced sampling correction
is a separately preregistered successor using rows not observed in S2.

## Evidence boundary

The [pilot manifest](./pilot-manifest.json) binds the historical source
revision, six promoted evaluation-replay artifacts, omitted lens tensors, local
billing receipts, disclosure audit, and frozen disposition. Promoted artifacts
contain no raw prompts, raw activations, machine-local paths, or credentials.
The large lens tensors remain hash-bound and reproducible from the sealed corpus
and checkpoint rather than committed to Git.

Frozen protocol: [S2 preregistration](../../2026-07-15-jspace-s2-varied-endpoint-preregistration.md).
