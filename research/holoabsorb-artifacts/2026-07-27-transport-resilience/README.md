# HoloAbsorb sovereign transport resilience

Status: **PASS**, with synthetic-lifecycle claim boundaries.

The official HoloAbsorb transport now self-heartbeats every open sovereign MCP
lease and indexes lease candidates by process ID before planning cleanup. This
closes the quiet-client eviction failure mode and removes the repeated
full-registry scan from the ownership-checked reaper.

Machine-readable receipt:
[`benchmark.json`](./benchmark.json)

- Evaluated commit: `f7403821de248cdc15501d257047db2b5cf62922`
- Receipt SHA-256:
  `fdcc46ea895f3caf3f3d17e6cd97d77cb449681006c4a31f9cb6d5f6625fc6d2`
- Worktree at benchmark start: clean
- Runtime: Node `v24.15.0`, Windows x64
- Samples per scale: 50

## Fault-injection result

All seven checks passed:

- six healthy leases remained protected under a four-connection capacity
  ceiling because their heartbeats kept them inside the idle grace period;
- the dead-parent lease was selected with `parent_dead`;
- the expired lease was selected with `lease_expired`;
- exactly the two faulted leases were pruned while four healthy leases
  remained;
- all six heartbeat timers were unreferenced and cleared on close; and
- the 4,096-connection registry produced no false-positive reap candidates.

The benchmark injects process-kill results through the canonical reaper
interface. It does not terminate real processes.

## Registry planning measurements

| Synthetic connections | Median | p95 | p99 |
| ---: | ---: | ---: | ---: |
| 64 | 0.379 ms | 0.804 ms | 1.432 ms |
| 256 | 1.227 ms | 1.791 ms | 2.653 ms |
| 1,024 | 5.024 ms | 6.610 ms | 9.066 ms |
| 4,096 | 21.309 ms | 26.516 ms | 29.801 ms |

An immediate same-host pre-index spot baseline at commit `db1fe584c` measured
94.087 ms median and 103.814 ms p95 for 4,096 connections over five trials.
The 50-trial admitted post-index receipt is therefore about **4.42x faster at
the median** and **3.92x faster at p95**. The trial counts differ, so the ratios
are engineering deltas rather than publication-grade performance estimates.

## Claim boundary

This proves the deterministic lifecycle logic and its local registry-scaling
behavior. It does not measure network throughput, end-to-end MCP request
latency, remote transport availability, or multi-host failover. Those remain
separate soak and fleet-observation lanes.
