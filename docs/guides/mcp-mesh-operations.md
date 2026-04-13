# MCP Mesh Operations

This guide covers first-response checks for the local MCP mesh used by HoloScript and adjacent workspaces.

## First 60 Seconds

1. Check mesh health endpoint:

```bash
curl http://localhost:5567/health
```

1. If healthy, check server registry:

```bash
curl -H "x-mcp-api-key: dev-key-12345" http://localhost:5567/servers
```

1. If unhealthy, run recovery script:

```powershell
./scripts/mcp/check-and-recover.ps1
```

## Local Health Script

A helper script is available at:

- `scripts/mcp/check-and-recover.ps1`

It checks `http://localhost:5567/health` and, if needed, attempts to start the orchestrator using the sibling `mcp-orchestrator` workspace.

## Operator Notes

- The script is non-destructive and only starts the mesh when health checks fail.
- If the orchestrator path cannot be found, start it manually from the `mcp-orchestrator` repository.
- Keep `HOLOSCRIPT_API_KEY` set if you run secured endpoints from scripts.

## Troubleshooting

- Port conflict: stop stale local processes using port `5567`.
- Auth failures: verify the API key header and environment.
- Partial server list: start required servers from project tasks, then re-check `/servers`.
