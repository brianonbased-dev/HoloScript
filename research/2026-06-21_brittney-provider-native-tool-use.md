---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-06-21
canonical_for: 'brittney-provider-native-tool-use'
supersedes: ''
extends: ''
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Brittney's local sovereign provider path is verified live: `LocalLLMAdapter.complete()` sent tools to both desktop Ollama and `holojetson.local`, and both returned native `message.tool_calls` parsed into `toolUses` with `finishReason: tool_use`. The package-level Vast serverless route/envelope and tool-call parser tests pass, but the live serverless lane is not configured in this environment and the historical endpoint probe timed out. Treat local/Jetson as green and serverless live verification as a follow-up, not as passed.

- **W -** Model capability flags are only a starting signal; a live adapter-level tool call is the trust boundary for local sovereign inference.
- **P -** Verify the provider at three layers: installed model capabilities, adapter contract tests, and a real `LocalLLMAdapter.complete()` tool-turn probe.
- **G -** `VAST_API_KEY` alone does not activate Brittney serverless; `FLEET_SERVERLESS_ENDPOINT` or `VAST_QWEN_ENDPOINT_NAME` must name a reachable endpoint.

**Evidence:** `packages/llm-provider/src/__tests__/local-llm.toolcall.test.ts`, `packages/llm-provider/src/__tests__/vast-serverless.test.ts`, `packages/llm-provider/src/adapters/local-llm.ts`, `packages/llm-provider/src/adapters/vast-serverless.ts`.

---

# Brittney Provider Native Tool-Use Receipt - 2026-06-21

## Board Task

- Task: `task_1781079001103_rrak`
- Title: `Brittney provider: verify native tool-use support on sovereign/ollama path`
- Claimed by: `codex-hardware`

## Static Implementation State

The implementation exists in prior commits:

- `3311a4d4c` - `LocalLLMAdapter.complete()` sends tools and parses native Ollama `message.tool_calls` into the unified `toolUses` shape.
- `61648cb7c` - `VastServerlessAdapter` route/envelope transport and Brittney `resolveServerless()` wiring.
- `16cddefb2`, `a3920f55a`, `b841e18e1` - qwen3/Ollama thinking and `/no_think` fixes that keep the tool-call grammar mask intact on the local agent loop.

## Verification Commands

Passed:

```powershell
pnpm --filter @holoscript/llm-provider test -- src/__tests__/local-llm.toolcall.test.ts src/__tests__/vast-serverless.test.ts
```

Result: 2 test files passed, 5 tests passed.

Passed:

```powershell
pnpm --filter @holoscript/llm-provider build
```

Result: `tsup` CJS/ESM build succeeded and declaration emit succeeded.

## Live Ollama Adapter Probes

Desktop Ollama:

- Endpoint: `http://localhost:11434`
- Model observed in `/api/tags`: `qwen3:4b-instruct`
- Capabilities observed: `completion`, `tools`
- Adapter call: `LocalLLMAdapter.complete()` with `tend_garden` tool schema
- Result: `finishReason: "tool_use"`, `contentLength: 0`
- Parsed tool use:

```json
{
  "type": "tool_use",
  "name": "tend_garden",
  "input": {
    "action": "water",
    "bed": "lotus"
  }
}
```

Jetson Ollama:

- Endpoint: `http://holojetson.local:11434`
- Model observed in `/api/tags`: `qwen3:4b-instruct`
- Capabilities observed: `completion`, `tools`
- Adapter call: `LocalLLMAdapter.complete()` with the same `tend_garden` tool schema
- Result: `finishReason: "tool_use"`, `contentLength: 0`
- Parsed tool use:

```json
{
  "type": "tool_use",
  "name": "tend_garden",
  "input": {
    "action": "water",
    "bed": "lotus"
  }
}
```

Both live probes returned native Ollama `message.tool_calls`; the text JSON rescue path was not needed.

## Vast Serverless State

Package contract verification passed:

- `vast-serverless.test.ts` proves route-to-worker envelope shape.
- It proves fragmented streaming `tool_calls.function.arguments` are assembled into `tool_use_start`, `tool_use_input_delta`, `tool_use_end`, and `message_stop`.
- It proves non-streaming OpenAI-compatible `message.tool_calls` parse into `toolUses` and `finishReason: "tool_use"`.

Live serverless verification is not green in this environment:

- `.env` has `VAST_API_KEY`.
- `.env` does not set `FLEET_SERVERLESS_ENDPOINT`.
- `.env` does not set `VAST_QWEN_ENDPOINT_NAME`.
- A bounded live probe using historical endpoint name `holoscript-qwen-coder` and current `FLEET_DEFAULT_MODEL` timed out after the shell command limit without a result.
- The timed-out probe left three child Node processes, which were stopped by PID immediately after inspection.

## Closeout Decision

The local sovereign/Ollama path is verified live on desktop and Jetson.

The Vast serverless adapter contract is verified by focused tests, but the live serverless lane still needs endpoint activation and a fresh live qwen3 tool-call receipt before anyone should claim full serverless green.

Recommended follow-up board task:

> Configure `FLEET_SERVERLESS_ENDPOINT` or `VAST_QWEN_ENDPOINT_NAME` for Brittney serverless, verify the endpoint serves a non-blacklisted qwen3 tool-calling model, and capture a live `VastServerlessAdapter.complete()` receipt with `finishReason: "tool_use"`.
