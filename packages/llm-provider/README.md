# @holoscript/llm-provider

Unified, multi-provider LLM adapter layer for HoloScript. One interface across
Anthropic, OpenAI, Gemini, xAI (Grok), OpenRouter, local HoloLlama
(llama.cpp), and native HoloServe (PyTorch-direct) endpoints, plus capability
routing and a cost guard.

It serves external developers, founder/operators, and agent frameworks that
need a public provider contract while retaining caller custody of credentials,
model choice, endpoints, tool authorization, and execution.

## Usage

```bash
npm install @holoscript/llm-provider openai
```

```ts
import { createProvider } from '@holoscript/llm-provider';
import { OpenAIAdapter } from '@holoscript/llm-provider/adapters/openai';
```

Install the provider SDK you need as a peer dependency (`openai` or `@anthropic-ai/sdk`).

Provider-native function calls use the same request shape across adapters. A
caller that needs a tool call rather than optional prose can require it without
reaching into the OpenAI SDK:

```ts
import { createOpenAIProvider } from '@holoscript/llm-provider';

const provider = createOpenAIProvider({
  apiKey: process.env.OPENAI_API_KEY,
  timeoutMs: 60_000,
  maxRetries: 0,
  parallelToolCalls: false,
  store: false,
});

const response = await provider.complete(
  {
    messages: [{ role: 'user', content: 'Submit one bounded plan.' }],
    tools: [callerOwnedToolSchema],
    provider: {
      openai: { toolChoice: 'required', parallelToolCalls: false },
    },
  },
  callerSelectedModel,
);
```

`toolChoice: 'required'` is sent through OpenAI Responses, OpenAI Chat
Completions, and the OpenRouter OpenAI-compatible route. Each path returns the
same `toolUses` shape. Authorization and tool execution remain caller
responsibilities.

Pass `{ signal }` as the optional third `complete` argument to cancel the
underlying provider transport. Responses also distinguish compatibility values
from provider evidence: `usage.reported === false` and `reportedModel === null`
mean the provider omitted those fields; zeroes and the requested model remain in
the legacy fields only for caller compatibility.

## Native HoloServe routing and artifact pins

HoloServe is the native PyTorch-direct route for HOLO-family checkpoints. Use
the asynchronous resolver so the package can verify the live `/health`
sovereignty claim and the exact model artifact binding before returning a
provider:

```bash
HOLOSERVE_URL=http://127.0.0.1:8099
HOLO_LLM_MODEL=holorunner-s0
HOLOSERVE_PARITY_PINS=holorunner-s0@sha256:<64-hex-binding>
```

```ts
import { resolveSovereignProviderAsync } from '@holoscript/llm-provider';

const resolved = await resolveSovereignProviderAsync();
const response = await resolved.provider.complete(
  { messages: [{ role: 'user', content: 'Return one bounded next action.' }] },
  resolved.model,
);
```

A valid per-model parity pin makes that model HoloServe-only and carries the
verified value in `resolved.artifactBindingSha256`. The synchronous resolver
refuses pinned models because it cannot perform live binding verification.
Unpinned, missing, or malformed pin sources preserve the prior routing behavior.

Callers may use `HOLOSERVE_PARITY_REGISTRY` instead of the inline environment
value. The JSON registry must use schema `holoserve-parity-pin-registry/v0`; only
entries with `verdict: "pass"` and a valid `bindingSha256` are admitted. The
registry, endpoint, checkpoint, and receipt remain caller-owned.

## Consumer validation gate

Cold consumers and release agents can inspect the exact public fileset and run
the package contract without private repository state:

```bash
npm pack @holoscript/llm-provider --dry-run --json
pnpm test
pnpm build
pnpm check
```

Completion responses are machine-readable provider receipts: provider/model,
finish reason, token usage, native tool calls, and hashed or caller-managed
request provenance can be recorded without serializing credentials.

## Development

```bash
pnpm dev            # Build with watch mode (tsup)
pnpm test           # Run tests (vitest)
pnpm test:coverage  # Run tests with coverage
```

## Package boundary & release posture

This is a **v0-preview** provider-adapter layer for developers who want one
surface across LLM vendors with capability routing and cost guarding. It is the
**adapter + routing + cost-guard layer only** — it does not implement agent
orchestration, HoloScript compilation, or a chat UI.

It **ships no API keys, secrets, or private endpoints**. Every credential and
base URL is **caller-owned and env-driven** (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, and the
fleet registry directory via `SOVEREIGN_DEVICES_DIR`). Local and fleet endpoints
(HoloLlama / Vast) are **caller-configured, not a package default** — point them
at your own nodes before use.

**Known limitations:** provider capability manifests track a moving vendor
target and may lag the latest model releases; cost-guard figures are heuristic
estimates, not billed amounts; local/fleet routing assumes reachable endpoints
that *you* supply. Interfaces may change before the v1 release.
