# Ingest path entrypoints (Option C verification)

**Purpose:** Answer board Q2 — which runnable surfaces accept `marble | holomap | both`, beyond `packages/holomap/src/paperHarnessProbe.ts`.

**Verified in-tree (2026-04-19):** `grep` over `HOLOSCRIPT_INGEST_PATH`, `resolveIngestPath`, `--ingest-path`.

| Surface | Path | How ingest is selected |
|--------|------|-------------------------|
| Paper 2 SNN navigation harness | `packages/engine/src/simulation/__tests__/paper-snn-navigation.test.ts` | `resolveIngestPath(process)` — `HOLOSCRIPT_INGEST_PATH` and/or Vitest argv `-- --ingest-path=` (see `packages/holomap/src/ingestPath.ts`) |
| Paper 4 adversarial sandbox | `packages/security-sandbox/src/__tests__/adversarial-holo.test.ts` | `resolveIngestPath(process)` |
| HoloMap MCP tools | `packages/mcp-server/src/holomap-mcp-tools.ts` | Tool arg `ingestPath` overrides env |
| Shared resolver + probe | `packages/holomap/src/ingestPath.ts`, `paperHarnessProbe.ts`, `comparisonReport.ts` | Library + probe helpers |

**Operator docs:** `RUNBOOK_PAPER_HARNESSES.md`, `ROLLBACK_DEFAULTS.md`. **Env checklist:** `scripts/check-ingest-path-status.mjs`.

**Gap (explicit):** LaTeX `paper-2-*.tex` / `paper-4-*.tex` sources do not themselves parse CLI flags — harnesses and MCP are the executable entrypoints.
