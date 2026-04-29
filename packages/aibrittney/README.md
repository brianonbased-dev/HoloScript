# <sup>AI</sup>Brittney

Interactive CLI agent for HoloScript, backed by a local Ollama model. v0.1 ships the REPL shell only — gateway daemon, channels, and MCP tool-calling are roadmap (BUILDS 2-4 in `research/2026-04-28_idea-run-3-openclaw-launch-parity.md`).

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
aibrittney --model brittney-qwen    # use a different model
aibrittney --host http://lan-host:11434
AIBRITTNEY_MODEL=qwen2.5-coder:7b aibrittney   # via env
```

### REPL slash commands

| Command | Effect |
|---|---|
| `/help` | list commands |
| `/exit` or `/quit` | leave |
| `/clear` | forget conversation history (keeps system prompt) |
| `/model <name>` | switch model mid-session |
| `/system <text>` | replace the system prompt and reset history |
| `/show` | print current model / host / message count |

Ctrl+C aborts an in-flight reply without exiting the REPL.

## Status (v0.1)

| Feature | State |
|---|---|
| REPL with streaming responses | ✅ |
| Slash commands | ✅ |
| Model + host overrides (flags + env) | ✅ |
| HoloScript-aware default system prompt | ✅ |
| MCP tool-calling against the connector mesh | ❌ (BUILD 2) |
| Cross-platform Gateway daemon | ❌ (BUILD 3) |
| Channel adapters (Discord, Telegram, Studio, HoloMesh) | ❌ (BUILD 4) |
| Refreshed `brittney-qwen` Modelfile + Q4_K_M base | ❌ (BUILD 5) |
| `ollama launch aibrittney` upstream entry | ❌ (post-PR) |

## Why "<sup>AI</sup>Brittney"

The display brand sets `AI` as a small superscript prefix on `Brittney` — typographically the way you'd write `2`<sup>`AI`</sup> in math. The persona's identity is Brittney; the `AI` exponent qualifies *what kind of* Brittney you're talking to. In monospaced contexts where superscripts don't render (logs, ollama list), the fallback is the camel-case `AIBrittney`. The package name and binary stay lowercase (`aibrittney`) for npm and POSIX shell hygiene.

## Architecture

Three files in v0.1, all under 200 LOC:

```
src/
├── cli.ts            argv parser + subcommand router (placeholders for v0.2+)
├── repl.ts           interactive loop, slash commands, ANSI styling
├── session.ts        chat history, system prompt, model+host config
└── ollama-stream.ts  thin wrapper around POST /api/chat with stream:true
```

`ollama-stream.ts` is intentionally direct (no `@holoscript/llm-provider` dependency for streaming yet) because LocalLLMAdapter's streaming surface is D.025 Phase 2 work in flight (`task_1777429959591_b9zw`). Once that lands the wrapper folds into `LocalLLMAdapter.streamCompletion()` and this file is deleted.

## Roadmap

See [`research/2026-04-28_idea-run-3-openclaw-launch-parity.md`](../../research/2026-04-28_idea-run-3-openclaw-launch-parity.md) for the 5-build plan and OpenClaw caliber comparison.
