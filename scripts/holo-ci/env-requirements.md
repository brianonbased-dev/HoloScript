# HoloScript Studio — Railway Env Requirements

> **Who reads this**: Railway deployments, CI pre-flight checks, and agents wiring
> new service env vars. Describes every env var that has a non-obvious Railway-specific
> constraint (i.e. "it exists in `.env.example` but silently breaks at runtime without
> the right Railway value").

---

## studio-service

### HOLOSCRIPT_REPO_ROOT (REQUIRED for fleet executor)

| Field         | Value                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required when | `FLEET_EXECUTOR_ENABLED=true` OR any self-improve-tagged board task is dispatched                                                                                                                                     |
| Railway value | `/app` (nixpacks default build root; verify with `echo $PWD` in a Railway one-shot command)                                                                                                                           |
| Fallback      | `process.cwd()` — the Railway **build/container root**, NOT the monorepo root                                                                                                                                         |
| Failure mode  | `ENOENT: no such file or directory, spawn 'packages/absorb-service/...'` (W.691-class repo-routing failure)                                                                                                           |
| Startup guard | `dispatch/route.ts` logs a `STARTUP GUARD FAILED` warning at module load if this is set but the runner path doesn't exist at `$HOLOSCRIPT_REPO_ROOT/packages/absorb-service/src/self-improvement/run-self-improve.ts` |

**Why it matters**: the fleet executor spawns `npx tsx packages/absorb-service/src/self-improvement/run-self-improve.ts` with `cwd: REPO_ROOT`. This path is repo-relative. On Railway, `process.cwd()` is the container build root (typically `/app` after nixpacks, but do not rely on that — set `HOLOSCRIPT_REPO_ROOT=/app` explicitly).

**Verification**: after adding to Railway, trigger a GET `/api/agents/fleet/dispatch` — the response `executorEnabled` field should match your intent, and the Railway build logs should show `[fleet-dispatch] REPO_ROOT guard OK: runner found at /app/packages/absorb-service/...`.

---

### FLEET_EXECUTOR_ENABLED

| Field         | Value                                                 |
| ------------- | ----------------------------------------------------- |
| Required      | No (default: `false` / claim-only)                    |
| Railway value | `true` to enable actual task execution                |
| Safe default  | Unset or `false` — tasks are claimed but not executed |

Enable only after `HOLOSCRIPT_REPO_ROOT` is confirmed valid. The startup guard will log a warning if `HOLOSCRIPT_REPO_ROOT` is wrong before any tasks execute.

---

### FLEET_DAILY_SPEND_CAP_USD

| Field         | Value                                                             |
| ------------- | ----------------------------------------------------------------- |
| Required      | No                                                                |
| Default       | `1.00` (see `FleetOrchestrator.ts` `DEFAULT_DAILY_SPEND_CAP_USD`) |
| Railway value | e.g. `5.00` for production fleets                                 |

---

## mcp-server / absorb-service

### HOLOSCRIPT_REPO_ROOT (self-improve runner)

Same variable, same semantics. The `run-self-improve.ts` runner also reads
`process.env['HOLOSCRIPT_REPO_ROOT'] || process.cwd()` as its `rootDir` default
(line 45 of `run-self-improve.ts`). Set it in mcp-server / absorb-service Railway
environments when those services run the runner directly (e.g. via a HoloShell job).

---

## Validation script (future)

A pre-deploy env-requirements check should:

1. Assert `HOLOSCRIPT_REPO_ROOT` is set when `FLEET_EXECUTOR_ENABLED=true`
2. Check that `$HOLOSCRIPT_REPO_ROOT/packages/absorb-service/src/self-improvement/run-self-improve.ts` exists
3. Log a clear FAIL with the W.691 reference if the path is missing

Until that script exists, the startup guard in `dispatch/route.ts` is the only automated check.

---

_Added 2026-06-08 — task task_1780931665675_8f9f (W.691-class cwd fix)_
