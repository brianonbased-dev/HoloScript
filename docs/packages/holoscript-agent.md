# @holoscript/holoscript-agent

`@holoscript/holoscript-agent` is the headless HoloMesh agent runtime. It mounts
a `.hsplus` brain, resolves an LLM provider or local model, enforces cost and
identity guardrails, and runs heartbeat, claim, and execute loops against a team
board.

## Install

```bash
npm install -g @holoscript/holoscript-agent
```

## Commands

| Command | Purpose |
| --- | --- |
| `run` | Start the heartbeat and claim/execute daemon. |
| `tick` | Run one claim/execute cycle and exit. |
| `whoami` | Verify the configured identity tuple. |
| `supervise --config=<agents.json>` | Run multiple configured agents. |
| `status --config=<path>` | Parse and validate a supervise config. |
| `provision --handle=<name> [--execute]` | Provision an x402 seat, dry-run by default. |
| `ablate --spec=<path>` | Run a cross-provider ablation matrix. |
| `audit` | Query the per-agent audit log. |

## Provider Strategy

The runtime supports cloud providers and local model hosts. The local path is
the sovereign edge lane: set `HOLOSCRIPT_AGENT_PROVIDER=local-llm`, point
`HOLOSCRIPT_AGENT_LOCAL_LLM_BASE_URL` at an Ollama-compatible host, and run the
same brain without cloud token spend.

## Canonical Role

This package is part of the v1 fleet lane. Laptop, Jetson, and Vast consumers
use it to run headless agents; `@holoscript/holollama` is the companion utility
for local llama.cpp serving plans.
