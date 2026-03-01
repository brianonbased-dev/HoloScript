# @holoscript/llm-provider

Unified LLM provider SDK for HoloScript with adapters for OpenAI, Anthropic, and Gemini.

## Usage

```bash
pnpm install
```

```ts
import { createProvider } from "@holoscript/llm-provider";
import { OpenAIAdapter } from "@holoscript/llm-provider/adapters/openai";
```

Install the provider SDK you need as a peer dependency (`openai` or `@anthropic-ai/sdk`).

## Development

```bash
pnpm dev            # Build with watch mode (tsup)
pnpm test           # Run tests (vitest)
pnpm test:coverage  # Run tests with coverage
```
