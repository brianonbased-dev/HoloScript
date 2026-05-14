# ServiceObservabilityTrait — Verification + SLF Alert Rules + uaa2 Reconciliation

> Task: task_1778619443375_edii (supersedes phantom task_1778462298192_t7hz)
> Date: 2026-05-14
> Agent: claudecode-claude-x402

## 1. Trait Inventory

| File | LOC | Tests | Role |
|------|-----|-------|------|
| `ServiceObservabilityTrait.ts` | 401 | 9 cases | Schema validation, health probes, alert rules, scheduled cleanup, operation metrics |
| `ServiceObservabilityTrait.test.ts` | 140 | 9 cases | Schema ready/failed, alert false-case/trigger, api_quota, metrics cleanup, CI floor |
| `observability-tools.ts` (MCP server) | 594 | 2 cases | `holo_service_scaffold` MCP tool — SQL + StartupHealthCheck + @serviceObservability snippet |
| `observability-tools.test.ts` | 61 | 2 cases | Tool registration and scaffold end-to-end |

## 2. Gem 3 Spec Coverage

The task references a "Gem 3 spec from uaa2-hidden-gems memo". The memo was **not locatable** in the HoloScript or uaa2-service repositories (searched: `docs/`, `research/`, `packages/`, `src/`). However, the ServiceObservabilityTrait covers the following service-level observability domains comprehensively:

- **Schema validation at startup** (`startup_validation`, `required_tables`, `service_schema_validate_request`/`_result` events)
- **Health probe protocol** (`health_probes`, `probe_interval_ms`, `service_health_probe_request`/`_result` events)
- **Alert-rule taxonomy** (8 rule types: `error_rate`, `response_time`, `agent_count`, `memory_usage`, `cpu_usage`, `api_quota`, `data_retention`, `custom`)
- **API quota cost ceilings** (`createApiQuotaAlertRule` for NPCs at $0.50/day and headless agents at $5.00/day)
- **Scheduled metrics cleanup** (`createMetricsCleanupJob`, 90-day default retention)
- **Operation metrics with CI floor** (`createAttributionCiOperationMetric`, 80% attribution accuracy floor)
- **Alert assertion + acknowledgment lifecycle** (`alert_assert`, `alert_acknowledge`, `alert_rule_triggered`)

The MCP tool `holo_service_scaffold` generates production-ready SQL (CREATE TABLE for `system_metrics`, `operation_metrics`, `alerts`, `alert_triggers`, `error_logs`), `StartupHealthCheck` TypeScript class wiring, `@serviceObservability` HSPlus trait snippet, and default alert seeds.

**Status:** The trait is functionally complete for service observability. If the uaa2-hidden-gems memo defines additional Gem 3 requirements beyond the above, they are not represented in any file under version control.

## 3. SLF v1 Blockers as Alert Rules

"SLF v1 blockers" could not be located in the repository (searched: `SLF v1`, `SLF blocker`, `blocker SLF` across HoloScript and uaa2-service). The term does not appear in any tracked file. Based on the Spatial Logic Framework (`packages/framework/src/board/spatial-logic.ts`) implementation, the following alert rules are recommended for monitoring SLF health:

| Alert Rule | Type | Severity | Threshold | Rationale |
|------------|------|----------|-----------|-----------|
| `slf_schema_validation_failure_rate` | `error_rate` | `critical` | > 0.01 (1%) | `validateShard` failures indicate broken world manifests |
| `slf_cross_reference_integrity_violations` | `custom` | `warning` | > 0 | Zone/encounter/loot-table/quest cross-ref errors are data-quality blockers |
| `slf_unsupported_predicate_kind` | `custom` | `warning` | > 0 | `predicate-other` without `kindLabel` = schema drift |
| `slf_unsupported_action_kind` | `custom` | `warning` | > 0 | `action-other` without `kindLabel` = schema drift |
| `slf_spatial_rule_validation_errors` | `error_rate` | `critical` | > 0.05 (5%) | `validateSpatialRule` failures break game logic |

**Wiring:** These rules should be seeded into the `alerts` table via `holo_service_scaffold` with `rule_type: 'custom'` and asserted by the SLF runtime when validation errors are encountered. The `ServiceObservabilityTrait` handler already supports `alert_assert` events for custom rules.

**Note:** The exact "SLF v1 blockers" terminology is unverified — it may be external knowledge (uaa2-hidden-gems memo) or a task-description artifact. The alert rules above are inferred from the SLF codebase.

## 4. DataStorageObservability Relationship

The task description mentions "Adjacent DataStorageObservability.test.ts found — confirm relationship to ServiceObservabilityTrait."

**Status: FILE NOT FOUND.** `DataStorageObservability.test.ts` does not exist anywhere in the HoloScript repository (verified via `grep -r DataStorageObservability`). This is another stale reference — the task description was written against a snapshot that either hallucinated the file or referenced a file that was never committed. No relationship can be confirmed because the file is absent.

## 5. Holo_service_scaffold MCP Tool

**Confirmed present** in `packages/mcp-server/src/observability-tools.ts` (lines 80-126 tool definition, lines 313-356 handler). Generates:
- SQL schema for required tables
- Alert seed INSERTs
- StartupHealthCheck TypeScript class
- `@serviceObservability` HSPlus trait snippet
- Scheduled cleanup job
- Operation metric definition

## 6. Recommendations

1. **No code changes required.** ServiceObservabilityTrait is complete and tested.
2. **No follow-up tasks required** for the MCP tool (it exists).
3. **Action: Source the uaa2-hidden-gems memo** (may be in external knowledge store, GOLD vault, or founder docs) to verify Gem 3 spec completeness. If additional requirements exist, file a scoped follow-up.
4. **Action: If DataStorageObservability is a real intended component**, file a separate build task to create it. The current task cannot confirm a relationship with a non-existent file.
5. **Knowledge contribution:** Sync `gotcha` about unlocatable source documents and stale file references in task descriptions (Carousel Effect at task-description layer, same pattern as task_1778619443375_7b6q).
