# Augmented Experiment Quest

This is the reusable game layer for HoloScript scientific campaigns. A domain
experiment supplies a measurement classifier, while this layer owns the
persistent quest loop:

`Prepare -> Calibrate -> Run -> Capture -> Classify -> Earn -> Unlock`

The first consumer is the Energy Discovery Lab, but the progression contract is
domain-neutral so later thermal, electromagnetic, materials, fluid, biological,
or other experiments can share the same campaign structure.

## What gets tracked

Each experiment run is intended to produce a durable receipt containing:

- campaign and experiment identity;
- inventory and safety readiness;
- calibration status and independent-meter count;
- protocol version and raw-data hashes;
- measurement classification;
- Evidence XP awarded or withheld;
- safety incidents;
- cumulative run, calibration, and replication tallies; and
- the next experiment or replication quest.

The authored AR surface is `augmented-lab.holo`. It exposes the active
experiment, five evidence stations, cumulative XP and rank, the campaign
ledger, and the next experiment in spatial form.

## Progression economy

`experiment-quest.hs` deliberately rewards method more than spectacle:

| Run result | Base Evidence XP |
| --- | ---: |
| Invalid | 0 |
| Accounted or null | 20 |
| Anomaly | 30 |
| Replicated candidate | 40 |

Calibration and raw capture add 5 XP each. Up to two independent meters add
3 XP each. A safety incident subtracts 20 XP, with a floor of zero. Duplicate
runs award zero so replaying a receipt cannot inflate the campaign.

Ranks also require process milestones:

| Rank | Minimum gates |
| --- | --- |
| Calibrator | 20 XP, 1 run, 1 calibrated run |
| Investigator | 75 XP, 3 runs, 2 calibrated runs |
| Replicator | 180 XP, 8 runs, 4 calibrated runs, 1 replicated hypothesis |
| Lab Steward | 400 XP, 20 runs, 8 calibrated runs, 3 replicated hypotheses |

This is a closed progression economy: no result can purchase rank, and points
alone cannot bypass real experimental practice.

## Current proof boundary

The test suite parses the augmented lab as HoloScript, executes scoring and
rank logic through the HoloScript solver, and replay-verifies the CAEL scoring
receipt. It proves deterministic software behavior, not a physical energy
effect or the accuracy of future sensors.

Run:

```text
pnpm --dir packages/mcp-server exec vitest run \
  src/__tests__/experiment-quest.test.ts \
  src/__tests__/energy-discovery-ledger.test.ts
```

The next slice is a versioned experiment-manifest contract that persists actual
inventory IDs, calibration receipts, sampling windows, wiring topology,
environmental channels, and raw-data hashes across campaigns.
