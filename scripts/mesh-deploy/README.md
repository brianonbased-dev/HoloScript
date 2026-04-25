# mesh-deploy — turn rented Vast.ai instances into HoloMesh agents

This directory ships everything needed to deploy `@holoscript/holoscript-agent`
onto N rented Vast.ai instances, one sovereign mesh agent per instance,
in ~20 minutes wall-clock (5-parallel × 6 batches).

**Use case**: founder rents 31 GPU instances on Vast.ai → wants each
running a headless agent that claims tasks from the team board → each
contributing real work (paper-19 dataset gen, paper-21 attack-vector
enumeration, paper-17 SESL self-play, etc.) instead of burning idle.

**Built**: 2026-04-24, same session that shipped `@holoscript/holoscript-agent`
v2.0.0 (commit `64c8ccfe0`). Closes the gap between "31 GPUs running" and
"31 mesh agents working."

---

## Files

| File | Purpose |
|---|---|
| `bootstrap-agent.sh` | Runs ON each instance. Installs node, clones repo, builds agent, starts daemon. Idempotent. |
| `agents-template.json` | Schema for per-agent identity (handle, brain, provider, model, wallet env key, bearer env key). Founder fills in. |
| `Deploy-MeshAgents.ps1` | Founder runs LOCALLY. Parallel-SSHes bootstrap.sh to each instance with composed env vars. |
| `README.md` | This file. |

---

## Pre-deployment checklist (founder authority)

Per F.001, F.002, F.027 — the things that ONLY the founder can do:

1. **Provision N x402 seats** on the HoloMesh team-board for the new agents.
   - One seat per agent in the deploy.
   - Per `agents-template.json` `_deployment_sequence` step 1.
2. **Generate N wallet keypairs** locally.
   - Per F.001/F.002 — wallets are identity-grade; never commit private
     keys; never let an agent auto-generate them.
   - Tooling: `cast wallet new` (foundry) or `python -c "from eth_account import Account; ..."`.
3. **Populate identity env vars** in `HoloScript/.env` (the SSOT per F.012):
   ```
   HOLOMESH_TEAM_ID=team_1775935947314_f0noxi
   HOLOSCRIPT_AGENT_WALLET_H200=0x...
   HOLOSCRIPT_AGENT_X402_BEARER_H200=...
   HOLOSCRIPT_AGENT_WALLET_TI1=0x...
   HOLOSCRIPT_AGENT_X402_BEARER_TI1=...
   ... (one pair per agent in agents.json)
   ```
   `.env` is gitignored — verified clean per F.001 pre-commit guard.

4. **Author or copy `agents.json`** from `agents-template.json`.
   - Customize the brain distribution (`_brain_distribution_plan`) to match
     the work load you want this fleet to do.
   - `enabled: false` to skip an agent without removing it.

5. **Verify SSH key registered on Vast.ai** matches `~/.ssh/id_rsa`
   private key. Already verified in this session — `vast_josep_work.pub`
   fingerprint `wtM+rW9VW0nPtJcnk0KIDUqi7m6Ykoi+8wSeTSLEas4` is on
   account 390660.

---

## Run

```powershell
cd C:\Users\josep\Documents\GitHub\HoloScript\scripts\mesh-deploy

# Stage 1: dry run — see the plan without executing
.\Deploy-MeshAgents.ps1 -ConfigPath .\agents.json -DryRun

# Stage 2: deploy ONLY to the H200 first to validate the install + run loop
.\Deploy-MeshAgents.ps1 -ConfigPath .\agents.json -InstanceFilter "H200"

# Stage 3: full deploy across remaining 30 instances (5-parallel)
.\Deploy-MeshAgents.ps1 -ConfigPath .\agents.json -MaxParallel 5
```

Per-instance log lands in `mesh-deploy-logs/<instance-id>-<handle>.log`.

---

## What each instance does after bootstrap

For each successfully bootstrapped instance:

1. `node /root/holoscript-mesh/packages/holoscript-agent/dist/index.js whoami` — validates the identity tuple resolves end-to-end (wallet/x402/provider/brain). Aborts the bootstrap on whoami failure (W.087 vertex B discipline).
2. `node ... run` daemon starts. Each tick:
   - Heartbeat to `/presence`.
   - Read `/board` for open tasks matching this agent's brain capability tags.
   - Claim the highest-priority match.
   - Execute (LLM call → response → optional commit-hook).
   - Mark done via `/board/done`.
3. CostGuard cuts off when daily budget exhausted (default $5/day, configurable per-agent in `agents.json`).
4. Logs to `/root/agent-logs/agent.log` on the instance; pull via `vastai logs <id>` or SSH.

---

## What this WILL and WON'T do for the 31-instance burn

**WILL**:
- Convert idle instance burn ($8.13/hr) into actual mesh work.
- Each agent claims real board tasks; done-log records measurable output.
- Local-LLM agents incur $0 LLM cost (just compute burn that you're already paying for).
- Mock-provider agents validate runtime + identity flow at $0 LLM cost.

**WON'T**:
- Auto-provision wallets or x402 seats (founder authority — F.001/F.002).
- Self-fund LLM API credits (founder owns ANTHROPIC_API_KEY etc.).
- Deploy to instances marked `enabled: false` in agents.json.
- Magically produce a Paper 19 dataset out of nothing — each agent works on board tasks; if the board has dataset-construction tasks (e.g. trait-inference Brittney synth), agents will pick them up and contribute.

---

## Cost model

- 31 instances × varies = $8.13/hr base burn (already incurred).
- Agent overhead: negligible (lightweight node process per instance).
- LLM cost per agent per day:
  - `mock`: $0
  - `local-llm` on the GPU: $0 LLM (compute is base burn)
  - `anthropic` Claude Opus 4.7: ~$3-15/day depending on tick rate + task complexity. Capped by `budgetUsdPerDay`.
- Worst case 31 anthropic agents × $5/day budget = $155/day LLM cost. Cap via `globalBudgetUsdPerDay` in agents.json.
- Recommended starting mix per template: 1 anthropic (H200), 25 local-llm, 5 mock = ~$5/day total LLM cost.

---

## Tear-down

When done, destroy instances via Vast.ai dashboard or:

```powershell
vastai show instances --raw | ConvertFrom-Json | ForEach-Object {
    vastai destroy instance $_.id
}
```

Agent state (cost-guard persistence, x402 seat) is local to each instance —
destroyed with it. Board tasks claimed-but-not-done get auto-released by
the team's release-claims hook within 2 ticks (~5 min).

---

## Honest deferrals + known limits

- **Per-instance health monitoring**: bootstrap.sh writes a single
  `agent.pid` + `agent.log` per instance. There's no centralized
  dashboard pulling logs — that's a separate observability task.
  For now: tail logs via `vastai logs <id>` or SSH.
- **Auto-restart on agent crash**: ✅ resolved 2026-04-25 — `bootstrap-agent.sh`
  installs a systemd unit (`holoscript-agent.service`) with `Restart=on-failure`,
  `RestartSec=10s`, `StartLimitBurst=5` (so a deterministically-broken config
  stops burning budget after 5 failures in 60s), and `KillMode=mixed` so child
  processes (vLLM, etc.) are also reaped on stop. On boxes without systemd the
  bootstrap falls back to `nohup` (no auto-restart there — fine for short
  ephemeral rentals; warning is logged).
- **Brain-composition sync**: bootstrap clones `ai-ecosystem` repo to
  `/root/ai-ecosystem` if the brain isn't found in HoloScript. Brain
  changes require re-running deploy (which `git pull`s).
- **Vast.ai instance restart**: ✅ resolved 2026-04-25 — same systemd unit is
  enabled (`systemctl enable holoscript-agent.service`) so the daemon comes
  back up automatically after a reboot. On non-systemd images the daemon is
  still nohup-style and dies with the SSH session.
- **F.014 compliance**: bootstrap.sh + Deploy-MeshAgents.ps1 do NOT
  parse `.hs/.hsplus/.holo` source. The agent runtime itself uses
  `@holoscript/core` per F.014.

---

## Provenance

- Author: ai-ecosystem session 2026-04-24.
- Closes: gap between commit `64c8ccfe0` (agent runtime shipped) and
  31-instance fleet rented same day.
- Per CLAUDE.md "Working Directory" + W.082 isolation: only the new
  `scripts/mesh-deploy/` files committed; peer's 514+ modified files
  untouched.
- Founder authority preserved: deployer NEVER provisions wallets,
  seats, or commits secrets. Per F.001/F.002/F.027.
