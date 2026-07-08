# HoloScript Positioning — The Open OS for Agents & Spatial Computing

> **Current, on-thesis copy.** This file supersedes the framing in the archived
> `ANNOUNCEMENT_POSTS.md` and `SOCIAL_POSTS.md` (both stale). Lead with the OS /
> model-agnostic thesis, not the consumer "no-code games" angle. Keep numbers out
> of copy — verify counts live (`curl https://mcp.holoscript.net/health`,
> `docs/NUMBERS.md`) before pinning any figure in a post.

## The one-liner

> HoloScript is an open, model-agnostic OS for agents and spatial computing — the
> substrate any frontier model can plug into instead of rebuilding.

## The thesis (elevator version)

Frontier models are becoming the primary way software gets built. But every model
still rebuilds the same substrate underneath: the formats agents author in, the
tools they call, the runtime that executes intent, and the targets that ship it.
HoloScript is that substrate, built once and open (MIT). Any MCP-capable model —
Claude, GPT, Gemini, Llama — connects through one surface, authors the same typed
`.holo`/`.hsplus`/`.hs` source, and compiles it to many targets. The model stays
the intelligence; HoloScript is the OS it operates.

**Honesty guardrail:** say "model-agnostic by architecture" and "designed for any
frontier lab to adopt and integrate" — not that any lab *has* adopted it. The real
evidence is `@holoscript/llm-provider` (already unifies OpenAI · Anthropic ·
Gemini) and a public, provider-neutral MCP endpoint. Claim the capability, not the
adoption.

## Proof points (all verifiable)

- MIT-licensed monorepo; packages published under the `@holoscript/*` npm scope.
- Public, model-agnostic MCP endpoint (`mcp.holoscript.net`) — any MCP client
  connects, no API key and no human approval step for read-only tools.
- One source → many compile targets (browsers, engines, robots, services); verify
  the current target list against `ExportTarget` in
  `packages/core/src/compiler/CircuitBreaker.ts`.
- `@holoscript/llm-provider` unifies OpenAI · Anthropic · Gemini — literal evidence
  of the "any frontier model" claim.

## Sample posts

### Hacker News (Show HN)

```
Show HN: HoloScript — an open, model-agnostic OS for agents and spatial computing

Frontier models are becoming the main way software gets built, but each one
rebuilds the same substrate: the formats agents author in, the tools they call,
the runtime that runs the intent, and the targets that ship it.

HoloScript is that substrate, open and MIT-licensed. Any MCP-capable model —
Claude, GPT, Gemini, Llama — connects through one surface, authors typed
.holo/.hsplus/.hs source, and compiles it to many targets (web, game engines,
robotics, services). The model stays the intelligence; HoloScript is the OS it
operates.

It's model-agnostic by architecture (the provider layer already unifies OpenAI,
Anthropic, and Gemini) and designed for any lab to integrate — no lab has adopted
it yet, and I'd love feedback from anyone building agent tooling or XR.

GitHub: https://github.com/brianonbased-dev/HoloScript
```

### X / Twitter

```
HoloScript is an open, model-agnostic OS for agents and spatial computing.

Every frontier model rebuilds the same substrate — formats, tools, runtime,
compile targets. HoloScript is that substrate, built once and open.

One source. Any model. Many targets. MIT.
```

```
The model is the intelligence. HoloScript is the OS it operates.

Typed .holo source → one MCP surface any model can call → compiles to web,
engines, robots, and services. Open + MIT.
```

### LinkedIn / longer form

```
We're building HoloScript as an open, model-agnostic OS for agents and spatial
computing.

The bet: as frontier models become the primary builders of software, they
shouldn't each rebuild the substrate underneath — the authoring formats, the tool
surface, the runtime, the compile targets. That substrate should be built once,
open, and neutral across models.

HoloScript is model-agnostic by architecture: any MCP-capable model connects
through one surface, and the provider layer already unifies OpenAI, Anthropic, and
Gemini. It's MIT-licensed and designed for any lab to adopt and integrate.
```
