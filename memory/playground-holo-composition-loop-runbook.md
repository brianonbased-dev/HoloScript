# PLAYGROUND — End-to-end `.holo` composition loop (runbook)

**Board:** `task_1776382769854_sljy`  
**Source narrative:** `README.md` — **Description → running business** (`.holo` → contract → compile → deploy → meter → monitor → self-improve).

This document is a **repeatable procedure + metrics template**. A full run needs **credentials** (Railway, API keys, org billing). Logged metrics should be stored outside public git (founder ops / internal log).

## Time box

| Suggestion | Owner |
|------------|--------|
| 60–120 minutes wall clock for first successful pass | Whoever runs PLAYGROUND |
| Stop after first **deployed health check** if meter wiring is not configured | Avoid fake “done” |

## Chain → concrete surfaces (code truth)

| README step | Primary mechanism | Where to look |
|-------------|-------------------|---------------|
| `.holo` / service description | Composition or contract-generated `.holo` | `examples/services/`, Studio, or output of `generate_service_contract` |
| `generate_service_contract` | MCP tool | `packages/mcp-server/src/service-contract-tools.ts` |
| `compile_to_node_service` | MCP compiler tool | `packages/mcp-server/src/compiler-tools.ts` (targets include `compile_to_node_service`) |
| `connector-railway` (deploy) | Connector layer | `packages/connector-railway/`, env + Railway CLI / dashboard |
| `economy` (meter) | Economy / metering traits & routes | Trace via product MCP `economy` tools if enabled for workspace |
| `observability` (monitor) | Health / monitoring hooks | Deploy URL `/health` or connector-reported status |
| `self-improve` (iterate) | Absorb / self-improve pipeline | `packages/mcp-server/src/self-improve-tools.ts`, absorb-service |

## Metrics capture template (fill per run)

```
Date (UTC):
Operator:
Composition / contract ID (hash or path):
compile_to_node_service target revision:
Deploy: Railway service URL (redacted in public notes):
Deploy timestamp (UTC):
Health check: HTTP ___ latency ___ ms, body OK y/n
Meter: token / usage line item (if any) — or "not wired"
Monitor: dashboard link or log tail pointer — or "manual smoke only"
Self-improve: absorb / diff / PR link — or "skipped"
Blockers:
```

## Definition of “done” for this PLAYGROUND

Minimum acceptable:

1. One `.holo` or generated composition compiled with **`compile_to_node_service`** to a **known artifact path** in the workspace or CI log.
2. **Deploy** reaches **running** state OR a documented **blocker** (e.g. missing `RAILWAY_TOKEN`) with owner.
3. Metrics row **filled** (template above), even if some cells are “N/A”.

## Honest gap

A **fully metered** production loop may be **blocked** on economy connector configuration — the runbook still counts as progress if steps and blockers are recorded.
