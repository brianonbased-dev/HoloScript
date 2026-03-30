# Railway Ecosystem Ops (Agent-Ready)

This guide defines a consistent agent workflow for managing Railway deployments across the HoloScript ecosystem.

## Why this exists

Railway CLI auth can fail for project-scoped tokens (`railway whoami` / `railway link`), but the same token may still have valid project-scoped GraphQL access.

The automation in `scripts/railway-ecosystem.ts` uses Railway GraphQL directly to:

1. discover projects/services accessible by the token,
2. resolve service + environment IDs by name,
3. trigger deployments via `serviceInstanceDeploy`,
4. verify endpoint health via configured health URLs.

## Configuration

Targets are defined in:

- `scripts/data/railway-ecosystem.targets.json`

Each target includes:

- `project` (Railway project name)
- `environment` (typically `production`)
- `service` (Railway service name)
- `healthUrl` (public health endpoint)

## Required environment variables

- `RAILWAY_API_TOKEN` (preferred)
- or `RAILWAY_TOKEN` (fallback)

Optional:

- target-specific API-key env vars if health endpoints need auth headers.

## Commands

From repo root:

- `pnpm railway:discover` — list Railway projects visible to token scope
- `pnpm railway:status` — evaluate configured targets (deployment + health)
- `pnpm railway:recover` — trigger deploy and poll recovery for `mcp-orchestrator`
- `pnpm railway:deploy -- --target <targetName>` — deploy and poll any configured target

## Agent process (recommended)

1. Run `pnpm railway:status`.
2. If target is unhealthy (`HTTP_5xx` / `NO_RESPONSE`), run:
   - `pnpm railway:deploy -- --target <targetName>`
3. Re-run `pnpm railway:status` until target reports healthy.
4. If deployment remains `CRASHED`, gather deployment metadata and logs via the same GraphQL token and fix source/config before re-deploy.

## Notes

- Service IDs and environment IDs are resolved dynamically each run.
- This avoids brittle hardcoded IDs in agent workflows.
- Keep `scripts/data/railway-ecosystem.targets.json` updated as services are added/renamed.
