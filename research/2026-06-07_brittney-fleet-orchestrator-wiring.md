# Brittney-Orchestrated Fleet Autonomy — Wiring Plan

**Date:** 2026-06-07
**Branch:** `claude/holoscript-gaps-map-7Q1aH`
**Decision:** Executor lives in **Studio, Brittney-orchestrated**; autonomous spend **authorized with a daily cap** (founder ruling, this session).
**Toolchain note:** Authored from a cloud session with **no `node_modules`** — the decision core ships with tests but was **not executed**. Everything below must pass `pnpm install && pnpm --filter @holoscript/studio build && pnpm test` on a desktop/hardware seat **before merge to `main`** (push to `main` auto-deploys every service; a broken commit bricks the monorepo build — CLAUDE.md Ship Path §5).

---

## 1. The gap this closes

The autonomy chain is `schedule → file board task → claim → EXECUTE → close`. Today:

- **Schedulers work**: HoloShell Team registry (30 ACTIVE rows, `--enqueue-due` every 15 min) + cloud routines file board tasks.
- **Claim works in live sessions only**: `auto-claim.ts` (posttooluse) + A-022 triage need a live LLM agent session. `team-connect --daemon` *can* auto-claim every 5 min but the family daemons run it `--no-auto-claim` (presence only).
- **EXECUTE has no autonomous path**: nothing assigns a claimed task to a capable agent and authorizes its execution. **Brittney can see the board but cannot dispatch.**

This plan makes Brittney the orchestrator that **selects → capability-matches → spend-gates → dispatches → executes → closes** board tasks.

## 2. Shipped this session (decision core)

| File | What | State |
|---|---|---|
| `packages/studio/src/lib/brittney/FleetOrchestrator.ts` | Pure decision logic: `normalizePriority`, `deriveTaskSkills`, `scoreAgentForTask`, `matchAgentToTask`, `rankTasks`/`selectNextTask`, `SpendGovernor` (daily cap), `estimateTaskSpendUsd`, `planFleetDispatch`. Zero app/framework imports → ~zero build blast radius. | ✅ committed, unit-tested-by-design |
| `packages/studio/src/lib/brittney/__tests__/FleetOrchestrator.test.ts` | Full contract coverage (priority, matching, ranking, spend cap, plan). | ✅ committed — **run on desktop to confirm green** |

The core is deliberately I/O-free: it decides **what** to dispatch and **whether** the cap allows it. The wiring layer below owns claiming, the LLM call, recording actual spend, and closing.

## 3. To wire on a desktop seat (toolchain-validated)

### 3a. Dispatch API route — `packages/studio/src/app/api/agents/fleet/dispatch/route.ts`

`POST` body: `{ teamId?: string, maxDispatches?: number, dryRun?: boolean }`. Flow:

1. Resolve `teamId` from auth/workspace context (do **not** hardcode — see §4).
2. `GET /api/holomesh/team/:id/board` → map tasks to `BoardTask[]`.
3. `GET /api/holomesh/team/:id/fleet` (+ `/members`) → map agents to `FleetAgent[]` (`skills` from mission `defaultSkills`, `currentTask`/`status` from heartbeat).
4. Hydrate `SpendGovernor` from a store (`snapshot()` persisted per team/day); `capUsd = Number(process.env.FLEET_DAILY_SPEND_CAP_USD) || DEFAULT_DAILY_SPEND_CAP_USD`.
5. `const plan = planFleetDispatch(tasks, agents, governor, { maxDispatches })`.
6. If `dryRun`, return `plan`. Otherwise for each decision:
   a. Claim via the board claim tool (`holomesh_board_claim`) as the chosen agent — abort that decision if the claim races/fails.
   b. Execute: call the existing Brittney provider (`lib/brittney/provider.ts` / `streamBrittney`) with a task-execution system prompt (task title/description + repo context). Reuse `MCPToolExecutor` + `StudioAPIExecutor` so the agent can actually act.
   c. `governor.record(actualUsd)` from provider usage; persist `governor.snapshot()`.
   d. Close via `holomesh_board_complete` with verification evidence; **route the evidence through `SimContractGate`** (already enforces test/commit/audit/receipt/peer-review) — never close without it.
7. Return `{ plan, executed, spend }`.

Guardrails: hard-stop the loop when `governor.remainingUsd()` is exhausted; emit `[fleet-metric]` telemetry per dispatch (mirror `fleetMetrics.ts`); structured logs per decision for receipts.

### 3b. Brittney tool — `dispatch_task_to_agent`

Add to `STUDIO_API_TOOLS` in `StudioAPITools.ts` and handle in `StudioAPIExecutor.ts` (`ENDPOINTS` registry → `POST /api/agents/fleet/dispatch`):

```ts
const dispatchTaskToAgent: StudioToolDefinition = {
  type: 'function',
  function: {
    name: 'dispatch_task_to_agent',
    description:
      'Autonomously assign the highest-priority open board task(s) to the best-matched free agent and execute. Spend-capped per day. Use when the user says "run the fleet", "work the board", or "have an agent take the next task". Pass dryRun to preview the plan without executing.',
    parameters: {
      type: 'object',
      properties: {
        teamId: { type: 'string', description: 'Team whose board to work (defaults to session team)' },
        maxDispatches: { type: 'number', description: 'Max tasks to dispatch this run (default 1)' },
        dryRun: { type: 'string', enum: ['true', 'false'], description: 'Preview plan only' },
      },
    },
  },
};
```

`ENDPOINTS['dispatch_task_to_agent'] = { method: 'POST', path: '/api/agents/fleet/dispatch', buildBody: (a) => ({ teamId: a.teamId, maxDispatches: a.maxDispatches, dryRun: a.dryRun === 'true' }) }`.

### 3c. Scheduler tick — execute declared schedules

`agentProfiles.ts` defines `schedules: string[]` (`nightly`, `daily`, …) but nothing reads them (`autospawnFleet.ts` only persists them). Add a tick endpoint/cron (`POST /api/agents/fleet/scheduler-tick`) that:
- reads each autospawned agent's `metadata.schedules`, resolves which are due now,
- for a due schedule, calls the dispatch flow (§3a) scoped to that agent/mission.
Reconcile with the **Tier-B HoloShell Team registry** (the working scheduler) — prefer one scheduler of record; this tick should consume registry-enqueued board tasks, not duplicate the cadence engine.

### 3d. Env + config

- `FLEET_DAILY_SPEND_CAP_USD` — daily autonomous-spend cap (default `25`).
- `FLEET_EXECUTOR_MAX_DISPATCH` — optional per-tick ceiling.
- Persist `SpendGovernor.snapshot()` per `{teamId, dayKey}` (DB table or KV) so the cap survives restarts.

### 3e. teamId de-hardcode

`FleetPanel.tsx` and `BoardPanel.tsx` hardcode `team_1777834718247_unr35n`. Pull `teamId` from auth/workspace context and thread it into the dispatch route + tools.

## 4. Validation gate (must pass before merge to main)

```bash
pnpm install
pnpm --filter @holoscript/studio test -- FleetOrchestrator   # green
pnpm --filter @holoscript/studio build                        # tsc + next build clean
pnpm --filter @holoscript/studio test                         # no regressions
# Live smoke: POST /api/agents/fleet/dispatch { dryRun: true } → inspect plan
# Then dryRun:false with FLEET_DAILY_SPEND_CAP_USD set low (e.g. 2) and watch one dispatch close with evidence.
```

## 5. What Remains After This Plan

This plan closes **decision + dispatch + spend-gating** and gives Brittney a callable execute path. It deliberately does **not** yet address:

- **Real execution sandboxing.** §3a executes via the Brittney provider in-process. Running untrusted/autonomous code changes safely (write scope, branch isolation, rollback) is unsolved here — needs the security-sandbox + scoped git worktree per agent before this runs against real repos unattended.
- **Commit/push by the executor.** Closing a board task with evidence ≠ shipping a commit. Wiring the executor to actually commit/push (and to which branch, with what signing) is a separate, founder-gated step.
- **Capability matching is heuristic.** `deriveTaskSkills` uses tags/role/keywords, not a learned router. Mis-routes are possible; keep `maxDispatches` low until observed.
- **Spend estimate is a heuristic, not token-accurate.** `estimateTaskSpendUsd` gates *before* execution by priority; real token cost is only known after. The cap is enforced on recorded actuals, but a single dispatch can overshoot its own estimate within the remaining budget.
- **No multi-agent contention control.** If both the desktop daemons and this Studio executor are live, two paths could claim the same task. The claim step (§3a.6a) must treat claim-races as expected and skip, and ideally one executor-of-record is designated per team.
- **Scheduler reconciliation is unfinished.** §3c overlaps the Tier-B HoloShell Team registry; which engine owns cadence must be decided to avoid double-firing.
- **Brittney can't yet *observe* in-flight dispatches.** No live status surface for running autonomous executions beyond `[fleet-metric]` logs; a Studio panel for active dispatches + spend-remaining is follow-up.
