# OAUTH_MIGRATION_MODE Audit — 2026-06-09

## Status: permissive → strict BLOCKED (active legacy-key callers)

### Finding

`OAUTH_MIGRATION_MODE` defaults to `permissive` at 4 call sites in mcp-server. No `OAUTH_MIGRATION_MODE` override is set in Railway (neither shared project vars nor per-service mcp-server vars). The migration window has been open indefinitely.

### Active Legacy-Key Callers (x-mcp-api-key + static HOLOSCRIPT_API_KEY)

| Caller                        | File                                                  | Header                                          |
| ----------------------------- | ----------------------------------------------------- | ----------------------------------------------- |
| mcpAuthHeaders()              | `packages/config/src/auth.ts:83`                      | `x-mcp-api-key` + `x-holoscript-api-key`        |
| Aibrittney MCP client         | `packages/aibrittney/src/mcp-client.ts:65`            | `x-mcp-api-key`                                 |
| Oracle tools                  | `packages/absorb-service/src/mcp/oracle-tools.ts:119` | `x-mcp-api-key`                                 |
| Studio-ui-graph publish       | `packages/studio-ui-graph/src/publish.ts:120`         | `x-mcp-api-key`                                 |
| Claude MCP proxy              | `scripts/claude-holoscript-mcp-proxy.mjs:63`          | `x-mcp-api-key`                                 |
| Codex MCP proxy               | `scripts/codex-mcp-proxy.mjs:16`                      | `x-mcp-api-key` + `Authorization: Bearer <key>` |
| Grok MCP proxy                | `scripts/grok-mcp-proxy.mjs:31`                       | `x-mcp-api-key` + `Authorization: Bearer <key>` |
| connector-github CI templates | `packages/connector-github/templates/...`             | `x-mcp-api-key`                                 |

### Why strict would break these

`validateLegacyKey()` returns `{active:false}` immediately in strict mode (oauth21.ts:481). The async fallback `validateTenantKey()` hits PostgreSQL `api_keys` table — which is **empty** (verified 2026-06-09). There are no registered OAuth clients for any of the above callers. They would all get HTTP 401 / 403.

### What safe promotion requires

1. All callers above migrate to `Authorization: Bearer <oauth-token>` via client_credentials grant (`POST /oauth/token`)
2. Each service registers a client via `POST /oauth/register`
3. Token refresh logic added (1h TTL)

### Blocker tasks filed

- `task_1781040294095_kexp` — migrate packages/config mcpAuthHeaders()
- `task_1781040294095_9gk7` — migrate packages/aibrittney MCP client
- `task_1781040294095_3yf9` — migrate ai-ecosystem proxy scripts
- `task_1781040294095_8oze` — migrate absorb-service oracle-tools.ts
- `task_1781040294095_fjrc` — migrate studio-ui-graph publish.ts

### OAUTH_REQUIRE_DPOP

Also defaults to `false`. Should be enabled after strict migration (lower priority — not blocking any current clients). Add to the final promote-to-strict task.

### Done condition

When all 5 blocker tasks are closed: set `OAUTH_MIGRATION_MODE=strict` (and optionally `OAUTH_REQUIRE_DPOP=true`) in Railway mcp-server per-service env and deploy.
