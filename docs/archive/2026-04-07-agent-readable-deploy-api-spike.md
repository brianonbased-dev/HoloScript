# Agent-readable deploy API spike

## Problem

Current deployment workflows rely too heavily on human-oriented CLI output, especially Railway. Agents need structured deploy state, stable logs, and explicit phase transitions rather than ANSI text streams and partial polling.

## Goal

Define a small deployment API that an agent can consume deterministically.

## Minimal resource model

### Deployment job

```json
{
  "id": "dep_123",
  "provider": "railway",
  "project": "studio-preview",
  "service": "web",
  "status": "queued|building|deploying|healthy|failed|rolled_back",
  "createdAt": "2026-04-07T00:00:00Z",
  "updatedAt": "2026-04-07T00:00:10Z",
  "commitSha": "abc123",
  "environment": "preview",
  "url": "https://preview.example.com",
  "health": {
    "ok": true,
    "statusCode": 200,
    "latencyMs": 132
  },
  "failure": null
}
```

### Structured log event

```json
{
  "deploymentId": "dep_123",
  "timestamp": "2026-04-07T00:00:03Z",
  "phase": "build",
  "level": "info|warn|error",
  "code": "BUILD_STEP_COMPLETE",
  "message": "Installed dependencies",
  "metadata": {
    "step": "pnpm install"
  }
}
```

## Required endpoints

- `POST /deployments` — create deployment job
- `GET /deployments/:id` — current state
- `GET /deployments/:id/events` — structured event stream
- `GET /deployments/:id/logs?cursor=` — append-only machine-readable logs
- `POST /deployments/:id/cancel` — cancel in-flight job
- `POST /deployments/:id/rollback` — rollback to previous healthy release
- `GET /deployments/:id/artifacts` — deployed image/build metadata

## Agent-oriented guarantees

1. Monotonic status transitions
2. Stable event codes, not just free-text logs
3. Cursor-based log pagination
4. Explicit health check result in API payload
5. Failure object with phase + probable cause + suggested remediation
6. Idempotent create via client request id

## Failure schema

```json
{
  "phase": "build",
  "code": "MISSING_ENV_VAR",
  "message": "Required env var DATABASE_URL was not set",
  "retryable": false,
  "suggestedActions": ["Set DATABASE_URL in project environment", "Re-run deployment"]
}
```

## Why this matters

This would let Brittney or any coding agent:

- detect deploy completion without scraping terminal output
- classify failures programmatically
- summarize deploy incidents accurately
- trigger remediation loops automatically
- compare provider behavior across Railway/Vercel/Docker hosts

## Recommended next spike

Build a thin adapter over one provider first:

1. provider adapter (`RailwayDeployAdapter`)
2. normalized deployment status model
3. normalized structured event model
4. one preview deploy endpoint
5. one health-check endpoint
