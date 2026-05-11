# Fleet-Scale Composability Test

Empirical defense for **W.GOLD.189 (Diamond) — Algebraic Trust (tropical-semiring tri-layer framing)**.

**Spec**: `ai-ecosystem/research/2026-04-25_fleet-empirical-composability-w-gold-189.md`

**Status**: LIVE-FIRST — `run-test.mjs` reads CAEL audit records from the live HoloMesh endpoint by default and marks every artifact with evidence provenance. Synthetic mode still exists for smoke tests, but it requires `--source synthetic --allow-synthetic` and writes `paper_evidence_eligible:false`.

## Quick Start

```bash
# Live CAEL evidence run (requires HOLOMESH_API_KEY)
node scripts/fleet-composability/run-test.mjs --run-id live-smoke --tick-windows 2

# Full 24h sweep (4 windows over the last 24h)
node scripts/fleet-composability/run-test.mjs --run-id 2026-04-25-A --tick-windows 4

# Synthetic scaffold smoke (never paper evidence)
node scripts/fleet-composability/run-test.mjs --run-id scaffold-smoke --tick-windows 2 --source synthetic --allow-synthetic
```

Live artifacts include:

```json
{
  "evidence_provenance": {
    "source": "cael",
    "scaffold": false,
    "paper_evidence_eligible": true
  },
  "summary": {
    "records_observed": 123,
    "observation_gap_windows": 0
  }
}
```

If any live window has missing CAEL observations, the script writes the artifact with `paper_evidence_eligible:false` and exits before reporting a paper outcome. Use `--allow-observation-gaps` only for diagnostics.

## Synthetic Mode

Synthetic mode is useful for smoke-testing the reduction mechanics on machines without fleet CAEL logs. It is not evidence for W.GOLD.189. The script requires the explicit `--allow-synthetic` tripwire and records:

- `evidence_provenance.source: "synthetic"`
- `evidence_provenance.scaffold: true`
- `paper_evidence_eligible: false`

## Outputs

`results/<run-id>.json`:

```json
{
  "fleet_n": 31,
  "evidence_provenance": {
    "source": "cael",
    "paper_evidence_eligible": true
  },
  "summary": {
    "associativity_passes": 4,
    "permutation_invariance_passes": 4,
    "idempotency_passes": 4,
    "tractability_pass": true
  },
  "windows": []
}
```

## Outcome Cases

- **Case A**: all live gates pass, giving W.GOLD.189 its fleet-scale empirical defense.
- **Case B**: algebraic gates fail on live CAEL data, indicating a structural limit.
- **Case C**: composability holds but tractability fails.

Synthetic runs report `OUTCOME: Scaffold smoke only` and never enter these paper-evidence cases.

## Companion Fleet Artifacts

- **Adversarial harness**: `scripts/fleet-adversarial/run-harness.mjs` — every adversarial trial generates hash-chain CAEL records.
- **Paper 25 corpus**: composability results feed `paper-25-fleet-multi-brain-aamas` when the artifact is paper-eligible.

## Production Evidence Rules

1. Default source is `cael`; no API key means the run fails before artifacting.
2. Synthetic source requires `--allow-synthetic`.
3. Live CAEL observation gaps fail the run unless `--allow-observation-gaps` is passed for diagnostics.
4. Paper evidence requires `paper_evidence_eligible:true` at the artifact root.
