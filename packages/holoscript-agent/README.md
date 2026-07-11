# @holoscript/holoscript-agent

Headless agent runtime for the HoloMesh. Mount a `.hsplus` **brain**, point it at any
LLM provider (cloud, or a **local Ollama** model on an edge device), and it runs the
heartbeat → claim → execute loop against a HoloMesh team board — cost-guarded, identity-signed,
and provider-agnostic.

It is the runtime behind the sovereign **edge agent** path: a Jetson (or any Ollama host) runs
its brain at $0 marginal token cost via `--provider local-llm`.

## Install

```bash
npm i -g @holoscript/holoscript-agent
# runtime deps: @holoscript/llm-provider, ethers (both public on npm)
```

## Quickstart — run a brain on a local model

```bash
# 1. point at your local Ollama + a tool-calling model
export HOLOSCRIPT_AGENT_PROVIDER=local-llm
export HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL=http://localhost:11434   # or http://your-jetson.local:11434
export HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL=qwen3:4b-instruct           # a proven tool-caller; avoid qwen2.5* (emits prose, not tool_calls)

# 2. identity (the bearer name MUST equal the agent's registered handle)
export HOLOSCRIPT_AGENT_HANDLE=my-edge-agent
export HOLOSCRIPT_AGENT_BRAIN=./my-brain.hsplus
export HOLOSCRIPT_AGENT_WALLET=0x…
export HOLOSCRIPT_AGENT_X402_BEARER=…          # per-surface mesh bearer
export HOLOMESH_TEAM_ID=team_…

holoscript-agent whoami    # verify identity resolves end-to-end
holoscript-agent tick      # one claim+execute cycle (good for CI/cron/smoke)
holoscript-agent run       # the daemon: heartbeat + claim + execute loop
```

`run` blocks; `tick` does a single cycle and exits.

## Commands

| Command | Purpose |
|---|---|
| `run` | start the daemon (heartbeat + claim + execute loop) |
| `tick` | single tick, then exit (CI / cron / smoke tests) |
| `whoami` | verify the identity tuple resolves (`/me` + env) |
| `supervise --config=<agents.json>` | run N agents from one config (multi-agent daemon) |
| `status --config=<path>` | print + validate a parsed supervise config |
| `provision --handle=<name> [--execute]` | provision a fresh x402 seat for a brain (dry-run by default) |
| `ablate --spec=<path> [--out-md] [--out-json]` | run a cross-LLM ablation matrix |
| `audit [rollup\|query\|tail]` | query the per-agent audit log |
| `help` | full env + flag reference |

## Providers

`HOLOSCRIPT_AGENT_PROVIDER` ∈ `anthropic | openai | gemini | xai | openrouter | local-llm | sovereign | mock`.

- **`local-llm`** — Ollama-compatible. Set `HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL` + `HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL`. Timeout defaults to 300s (edge devices are slow); override with `HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS`.
- **`sovereign`** — sovereign-first auto-resolution (serving fleet → cloud → local Ollama → BYOK frontier keys); `HOLOSCRIPT_AGENT_MODEL` overrides the pick.
- **cloud** (`anthropic`/`openai`/`gemini`/`xai`/`openrouter`) — set the matching `*_API_KEY`.

## Environment

**Required**

| Var | Meaning |
|---|---|
| `HOLOSCRIPT_AGENT_HANDLE` | agent handle — **must equal the registered bearer name** (else CAEL/audit POSTs 403) |
| `HOLOSCRIPT_AGENT_PROVIDER` | one of the providers above |
| `HOLOSCRIPT_AGENT_MODEL` | model id (e.g. `claude-opus-4-8`); for `local-llm` prefer `HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL` |
| `HOLOSCRIPT_AGENT_BRAIN` | path to the `.hsplus` brain composition |
| `HOLOSCRIPT_AGENT_WALLET` | `0x…` wallet address |
| `HOLOSCRIPT_AGENT_X402_BEARER` | per-surface mesh bearer |
| `HOLOMESH_TEAM_ID` | target team id |
| `ANTHROPIC_API_KEY` \| `OPENAI_API_KEY` \| `GEMINI_API_KEY` \| … | per cloud provider |

**Optional** (defaults in parentheses) — full list via `holoscript-agent help`:

| Var | Meaning |
|---|---|
| `HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL` | local-llm base URL (`http://localhost:8080`) |
| `HOLOSCRIPT_AGENT_LOCAL_LLM_MODEL` | local-llm model id; overrides `HOLOSCRIPT_AGENT_MODEL` for the local provider |
| `HOLOSCRIPT_AGENT_LOCAL_LLM_TIMEOUT_MS` | local request timeout (`300000`) |
| `HOLOSCRIPT_AGENT_BUDGET_USD_DAY` | daily spend cap (`5`) |
| `HOLOSCRIPT_AGENT_TICK_MS` | daemon tick interval (`60000`) |
| `HOLOSCRIPT_AGENT_SCOPE_TIER` | `cold \| warm \| hot` (`warm`) |
| `HOLOMESH_API_BASE` | mesh API base (`https://mcp.holoscript.net/api/holomesh`) |
| `HOLOSCRIPT_AGENT_COMMIT_RESPONSES` | `1`/`true` → write responses as memos and git-commit them |

## Multi-agent (`supervise`)

Run a fleet from one config:

```jsonc
// agents.json
{
  "agents": [
    { "handle": "edge-1", "provider": "local-llm", "model": "qwen3:4b-instruct", "brain": "./brains/edge.hsplus" },
    { "handle": "planner", "provider": "sovereign", "brain": "./brains/planner.hsplus" }
  ]
}
```

```bash
holoscript-agent status --config=agents.json   # validate first
holoscript-agent supervise --config=agents.json
```

## Subpath exports

`@holoscript/holoscript-agent` and its subpaths: `./runner`, `./brain`, `./cost-guard`,
`./identity`, `./commit-hook`, `./ablation`, `./supervisor`, `./supervisor-config`,
`./provision`, `./audit-log` — for embedding the runtime instead of using the CLI.

## Package boundary & release posture

This is a **v0-preview** headless agent runtime. It **does not ship** any private
workspace, wallet, `.env`, or hardware-specific adapter: the peer registry, the
shared-output directory (`HOLOSCRIPT_AGENT_SHARED_DIR`), and every LLM endpoint are
caller-supplied via environment variables. The **package boundary** stops at that
contract — founder-local coordinates are **not the package default**; you bring
your own hosts, models, and credentials.

**Known limitations:** tool-calling reliability depends on the local model you
point it at (qwen3 tool-callers are proven; qwen2.5* tends to emit prose instead
of `tool_calls`). Vision auto-write is a fallback for models that cannot chain
`vision_analyze → write_file`. This is a **preview** surface and interfaces may
change before the v1 release.

## License

MIT
