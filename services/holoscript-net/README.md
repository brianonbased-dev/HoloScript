# holoscript.net Service

## Authoritative Validation

Use the workspace package build as the current health check:

```bash
pnpm --filter @holoscript/net-service run build
```

Do not treat root-level `*.log` or TypeScript error text files in this service as
current blockers. They are local run artifacts and are ignored by git.

## Archived Stale Logs

March 2026 build-error captures were moved out of the service root to:

```text
services/holoscript-net/archive/stale-build-artifacts/2026-03/
```

Those files document historical failures only. Reproduce current status with the
authoritative build command above.
