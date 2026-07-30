# HoloScript Energy Discovery Lab

This experiment searches for overlooked usable energy gradients without
asserting energy creation. Its first vertical slice is a HoloScript-authored,
receipt-producing energy ledger that distinguishes accounted output from an
unexplained residual.

## Alignment

- **Goal:** turn ambient-energy claims into deterministic, replayable
  classifications.
- **Operator:** a researcher running simulations or a low-voltage instrumented
  bench experiment.
- **Current pain:** apparent excess-energy results commonly omit storage
  discharge, controller power, consumed electrode chemistry, or measurement
  uncertainty.
- **Must-have behavior:** reject malformed measurements; include hidden energy
  reservoirs; require replication, independent meters, and a closed boundary
  before advancing an anomaly.
- **Non-goals:** claiming perpetual motion, declaring a new physical law,
  capturing lightning, connecting experimental hardware to household mains, or
  treating a simulation as physical validation.
- **Evidence:** the `solve_logic` path returns the classification together with
  a CAEL trace that can be hash-chain checked and replayed.

## Classification contract

`energy-ledger.hs` returns:

| Code | Meaning |
| --- | --- |
| `0` | Invalid measurement boundary |
| `1` | Output is accounted for within uncertainty |
| `2` | Unexplained anomaly; improve the experiment and reproduce |
| `3` | Replicated candidate ready for independent investigation |

Code `3` is deliberately not named “verified free energy.” The logic receipt
proves that HoloScript reproduced the classification from the recorded inputs;
it does not prove that sensors measured physical reality correctly.

All energy values must use one declared unit. The initial contract accounts for:

- directly measured source energy;
- energy removed from storage during the run;
- externally supplied controller and instrumentation energy;
- chemical energy represented by consumed electrodes or reactants; and
- total measurement uncertainty.

## Campaign integration

This lab is the first domain consumer of the reusable
`../experiment-quest/` system. Its energy classifier supplies the scientific
outcome; the quest layer supplies the augmented Prepare, Calibrate, Run,
Capture, Classify, Earn, and Unlock loop. Accounted or null energy results earn
Evidence XP when their measurement process is sound, so the campaign advances
without incentivizing extraordinary claims.

## First tracer slice

Run `packages/mcp-server/src/__tests__/energy-discovery-ledger.test.ts`. The
tests cover malformed measurements, ordinary accounted output, battery
discharge, electrode consumption, an under-evidenced residual, and a replicated
candidate with a replay-verified CAEL trace.

The next slice should add a versioned experiment manifest that binds sensor
calibration, sampling windows, wiring topology, environmental channels, raw
data hashes, and quest receipts to these ledger inputs. Thermal,
electromagnetic, fluid, and materials simulations remain hypotheses until
matched by that physical evidence.
