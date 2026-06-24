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

| Field         | Value                                                                  |
| ------------- | ---------------------------------------------------------------------- |
| Required      | No                                                                     |
| Default       | `100` (see `scripts/lib/autoscaler-decision.mjs` `DEFAULT_DAILY_CAP_USD`) |
| Railway value | `100` (remote GPU fleet compute cap — Vast.ai rental + paid LLM API)  |

**Dual-cap spend policy (F.129, 2026-06-20):** Two independent $100/day caps tracked separately (up to $200/day total): (1) **remote GPU fleet compute** (Vast.ai + paid LLM API) — this variable; (2) **wallet/on-chain spend** (Base ETH gas, x402 USDC micropayments, seat-wallet top-ups) — policy-only, no ledger yet. Local fleet (Jetson Orin + laptop GPU, owned hardware) is FREE / uncapped. Within each cap, agents act autonomously — no per-action founder approval. Agents may self-fund seat wallets up to the wallet cap. Still founder-only regardless of cap: Trezor seed/recovery, treasury master wallet, governance-tier mutations, and any single action or cumulative daily total exceeding a cap. **Supersedes**: the `1.00` default, the per-action `>$5` gate, `$120/day` single GPU budget, and "every GPU fleet run is founder-gated." GPU cap is live-enforced by autoscaler SpendGovernor (`scripts/lib/autoscaler-decision.mjs`).

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
