# Metrics SSOT (Single Source of Truth)

Use this page when documentation needs ecosystem metrics. Do not hardcode mutable counts in prose.

## Canonical Sources

| Metric                        | SSOT source                                                      | Verification command                                                                           |
| ----------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Registered compile targets    | `ExportTarget` in `packages/core/src/compiler/CircuitBreaker.ts` | `grep -n "export enum ExportTarget" -A 200 packages/core/src/compiler/CircuitBreaker.ts`       |
| Compiler implementation files | `packages/core/src/**/*Compiler.ts`                              | `find packages/core/src -name "*Compiler.ts" -not -name "CompilerBase*" -not -name "*.test.*"` |
| Trait inventory               | `packages/core/src/traits/`                                      | `find packages/core/src/traits -name "*.ts" -not -name "*.test.*"`                             |
| MCP tool inventory            | `https://mcp.holoscript.net/health`                              | `curl https://mcp.holoscript.net/health`                                                       |
| Knowledge entries             | Orchestrator health                                              | `curl https://mcp-orchestrator-production-45f9.up.railway.app/health`                          |
| Package/service footprint     | Workspace dirs                                                   | `ls -d packages/*/ services/*/`                                                                |

## Documentation Pattern

Use wording like:

- "registered targets" instead of "25+ targets"
- "live tool inventory" instead of "122 tools"
- "trait inventory (see SSOT)" instead of "2,000+ traits"

## Utility-First Reminder

When writing entry docs, surface platform utility beyond rendering:

- pipelines (`.hs` source → transform → sink)
- schema mapping and code intelligence (Absorb)
- observability/telemetry for agent runtime
- knowledge market and team operations (HoloMesh/orchestrator)
