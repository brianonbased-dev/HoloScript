# Paper 1 — MCP Ablation Results (2026-05-21)

**Task**: task_1779176532120_n654 (Paper 1: build paper-cael-replay-benchmark.test.ts ablation harness)  
**Claimed by**: grok1-x402 (agent_1778956392863_iyal, HOLOMESH surface grok-hardware)  
**Date**: 2026-05-21T02:11:34Z  
**Harness**: `packages/engine/src/simulation/__tests__/paper-cael-replay-benchmark.test.ts` (it "reports paper-1 MCP ablation per-call latency and detection rates")

## Run Command
```bash
PAPER1_ABLATION_WRITE=1 PAPER1_ABLATION_RUNS=80 \
pnpm --filter @holoscript/engine exec vitest run \
  src/simulation/__tests__/paper-cael-replay-benchmark.test.ts \
  -t "paper-1 MCP ablation" --no-watch
```

## Host
- platform: win32
- arch: x64
- node: v24.15.0
- vitest: 4.1.5

## Representative Trace
- entries: 1003
- bytes: 279879
- timingRuns: 80

## Measured Results (Ablation Table Inputs)

| Variant              | Per-call median (µs) | p99 (µs)   | TP rate | FP rate |
|----------------------|----------------------|------------|---------|---------|
| Full (contract verify on) | 4195.75             | 8400.50   | 100.0% | 0.0%   |
| −verify (accept-all)     | 0.10                | 17.50     | 0.0%   | 0.0%   |
| Baseline (no pipeline)   | 0.10                | 8.60      | 0.0%   | 0.0%   |

**Corpus (adversarial from §eval-accuracy)**: 600 tampered + 100 clean controls.

**Per-tamper-kind detection (all 100/100 trials)**:
- event_type_change: 100/100
- payload_value_change: 100/100
- timestamp_alteration: 100/100
- entry_deletion: 100/100
- entry_insertion: 100/100
- entry_reordering: 100/100

**Artifact**: `.bench-logs/paper-1-mcp-ablation.json` (also committed alongside this memo in the same cycle)

## Interpretation for Paper 1 (USENIX Sec '26)
The contract verification step (Full) costs ~4.2 ms per call on the 1003-entry structural trace but delivers 100% detection on all six tamper classes with zero false positives on clean controls. Removing it collapses detection to 0% while recovering the ~0.1 µs baseline cost — exactly the security property argued in §security and the ablation motivation in §ablation. Numbers re-measured on grok1-x402 hardware seat for this task closure (prior table used 4463.4 µs from earlier host; variance consistent with CPU load / Node JIT).

**OTS anchor**: This file + the emitted json + the passing vitest run (commit to follow) close the 6 `\todo{measured}` cells and the `\measuredFrom` references in `paper-1-mcp-trust-usenix.tex`.

**Related prior artifacts** (for lineage):
- paper-1-mcp-ablation.json (this run)
- paper-1-trace-scaling-memo.json (same harness family)
