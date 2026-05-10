# <sup>AI</sup>Brittney

Interactive CLI agent for HoloScript, backed by a local Ollama model. v0.2 adds opt-in MCP tool-calling against the orchestrator (`holo_query_codebase`, `holo_ask_codebase`, `knowledge_query`, `holo_parse_to_graph`) plus local config, channel registry, and gateway heartbeat commands.

The display name is **<sup>AI</sup>Brittney** with `AI` set as a math-style superscript exponent — a small lifted prefix on the persona name. Plain-text fallback: `AIBrittney`. POSIX/CLI fallback: `aibrittney`.

## Install (workspace-local — npm publish later)

```bash
pnpm --filter @holoscript/aibrittney build
node packages/aibrittney/dist/cli.js
# or, after pnpm install ties up bins:
aibrittney
```

## Prerequisites

- [Ollama](https://ollama.com) running on `http://127.0.0.1:11434`
- A pulled model. Default is `qwen2.5-coder:7b` (~4.7 GB Q4_K_M, fits a 6 GB GPU). Pull with:
  ```bash
  ollama pull qwen2.5-coder:7b
  ```

## Usage

```bash
aibrittney                          # start REPL with defaults
aibrittney --tools                  # start REPL with MCP tools enabled
aibrittney --model brittney-qwen    # use a different model
aibrittney --host http://lan-host:11434
AIBRITTNEY_MODEL=qwen2.5-coder:7b aibrittney   # via env

# Ollama Cloud (paid hosted endpoint, cloud-class models like kimi-k2.6:cloud)
export OLLAMA_API_KEY=<your-cloud-key>
aibrittney --cloud --model kimi-k2.6:cloud
```

### Local config and gateway

```bash
aibrittney configure
aibrittney configure set model qwen2.5-coder:14b
aibrittney configure set host https://ollama.com
aibrittney configure set api-key-env OLLAMA_API_KEY
aibrittney configure set tools on

aibrittney channels add studio webhook https://studio.local/events
aibrittney channels list

aibrittney gateway start
aibrittney gateway status
aibrittney gateway stop
```

The config file defaults to the platform config directory and can be overridden with `AIBRITTNEY_CONFIG`. API keys are resolved from an environment variable (`OLLAMA_API_KEY` by default, or the configured `api-key-env`) rather than written into the config file. Gateway mode runs as a detached local heartbeat process and records pid/status/last heartbeat in the same config file; channel adapters can consume that registry as the BUILD 4 transports land.

### REPL slash commands

| Command | Effect |
|---|---|
| `/help` | list commands |
| `/exit` or `/quit` | leave |
| `/clear` | forget conversation history (keeps system prompt) |
| `/model <name>` | switch model mid-session |
| `/system <text>` | replace the system prompt and reset history |
| `/show` | print current model / host / message count / tools state |
| `/tools` | toggle MCP tool calling on/off (resets system prompt + history) |

Ctrl+C aborts an in-flight reply without exiting the REPL.

## Ollama Cloud (v0.2.1, opt-in)

The same `/api/chat` protocol works against `ollama.com` when the request
carries `Authorization: Bearer <key>`. AIBrittney now threads an api-key
through `Session` → `streamChatFromOllama` / `chatOnceFromOllama`, so the
exact same REPL works against:

- **local Ollama** at `http://127.0.0.1:11434` (default; no key needed)
- **LAN Ollama** at any reachable host (key only if that host gates it)
- **Ollama Cloud** at `https://ollama.com` (paid; key required)

The `--cloud` flag is a shorthand for `--host https://ollama.com` and
pairs naturally with `--model kimi-k2.6:cloud` (or any other published
cloud model). The REPL warns at startup if the host is non-localhost
and `OLLAMA_API_KEY` isn't set — that prevents the "401 looks like an
outage" failure mode.

```bash
export OLLAMA_API_KEY=<your-cloud-key>
aibrittney --cloud --model kimi-k2.6:cloud --tools
```

Why care: cloud-class models (kimi-k2.6, llama3.1-405b, etc.) are
substantially more capable than what fits in 8 GB local VRAM but still
speak the same `/api/chat` shape. AIBrittney becomes a single CLI that
covers every provider tier — local 7B, LAN-shared mid-size, paid
cloud — without changing the REPL or the tool-calling protocol.

## Tool calling (v0.2, opt-in)

Pass `--tools` (or run `/tools` inside the REPL) to expose a curated MCP catalog
to the local model. Calls are dispatched through the orchestrator's
`/tools/call` endpoint, so one auth header (`HOLOSCRIPT_API_KEY` or
`MCP_API_KEY`) covers every backend (HoloScript MCP, knowledge store, parser).

Catalog:

| Tool | Routes to | When the model should reach for it |
|---|---|---|
| `holo_query_codebase` | `holoscript-tools` | "where is X", "what calls X", "imports of X" — structural lookups |
| `holo_ask_codebase` | `holoscript-tools` | "how does X work" — synthesis across files |
| `knowledge_query` | orchestrator knowledge store | recall prior wisdom/patterns/gotchas across the mesh |
| `holo_parse_to_graph` | `holoscript-tools` | validate or analyze pasted `.hs` / `.hsplus` / `.holo` source |

Requirements:

- The chosen Ollama model must natively support function/tool calls. Verified
  good: `qwen2.5-coder:7b`, `llama3.1`. Custom Brittney models built on
  bases without tool tokens fall back to plain chat (no calls).
- `HOLOSCRIPT_API_KEY` (or `MCP_API_KEY`) in the env. Override the orchestrator
  endpoint with `MCP_ORCHESTRATOR_URL`.

The loop caps at 6 iterations per user turn to keep a confused model from
spinning. Unknown tool names are rejected without crashing the loop — the
model gets a `role=tool` error message back and can recover.

## Status

| Feature | State |
|---|---|
| REPL with streaming responses | ✅ |
| Slash commands | ✅ |
| Model + host overrides (flags + env) | ✅ |
| HoloScript-aware default system prompt | ✅ |
| **MCP tool-calling against the orchestrator** | **✅ v0.2** |
| Local config command | ✅ |
| Channel registry command | ✅ |
| Cross-platform gateway heartbeat | ✅ |
| Channel transport adapters (Discord, Telegram, Studio, HoloMesh) | ❌ (BUILD 4) |
| Refreshed `brittney-qwen` Modelfile + Q4_K_M base | ❌ (BUILD 5) |
| `ollama launch aibrittney` upstream entry | ❌ (post-PR) |

## Why "<sup>AI</sup>Brittney"

The display brand sets `AI` as a small superscript prefix on `Brittney` — typographically the way you'd write `2`<sup>`AI`</sup> in math. The persona's identity is Brittney; the `AI` exponent qualifies *what kind of* Brittney you're talking to. In monospaced contexts where superscripts don't render (logs, ollama list), the fallback is the camel-case `AIBrittney`. The package name and binary stay lowercase (`aibrittney`) for npm and POSIX shell hygiene.

## Architecture

```
src/
├── cli.ts            argv parser + REPL/config/gateway/channel subcommand router
├── local-config.ts   local JSON config, channel registry, gateway state helpers
├── repl.ts           interactive loop, slash commands, ANSI styling
├── session.ts        chat history (system/user/assistant/tool roles)
├── ollama-stream.ts  POST /api/chat with stream:true — used when tools are OFF
├── ollama-chat.ts    POST /api/chat with stream:false — used inside the tool loop
├── tools.ts          static catalog of MCP tools exposed to the model
├── mcp-client.ts     thin orchestrator client for /tools/call
└── agent.ts          tool-loop runner: chat → dispatch tool calls → loop until plain text
```

`ollama-stream.ts` is intentionally direct (no `@holoscript/llm-provider` dependency for streaming yet) because LocalLLMAdapter's streaming surface is D.025 Phase 2 work in flight (`task_1777429959591_b9zw`). Once that lands the wrapper folds into `LocalLLMAdapter.streamCompletion()` and this file is deleted.

The split between `ollama-stream` (streaming, no tools) and `ollama-chat`
(non-streaming, tools-aware) is deliberate: Ollama's tool-call deltas aren't
reliably streamable across all backends, and at local 7B latency a single
non-streaming round-trip per loop step is fast enough that streaming through
a tool turn isn't worth the protocol complexity.

## Roadmap

See [`research/2026-04-28_idea-run-3-openclaw-launch-parity.md`](../../research/2026-04-28_idea-run-3-openclaw-launch-parity.md) for the 5-build plan and OpenClaw caliber comparison.
