# @holoscript/llm-provider

Unified, multi-provider LLM adapter layer for HoloScript. One interface across
Anthropic, OpenAI, Gemini, xAI (Grok), OpenRouter, and local HoloLlama
(llama.cpp) endpoints, plus capability routing and a cost guard.

## Usage

```bash
pnpm install
```

```ts
import { createProvider } from '@holoscript/llm-provider';
import { OpenAIAdapter } from '@holoscript/llm-provider/adapters/openai';
```

Install the provider SDK you need as a peer dependency (`openai` or `@anthropic-ai/sdk`).

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
