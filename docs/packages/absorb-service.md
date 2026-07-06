# @holoscript/absorb-service

`@holoscript/absorb-service` is the public package for HoloScript codebase
intelligence. It owns the reusable Absorb engine: scanners, graph construction,
GraphRAG query machinery, embeddings, MCP tool definitions, credit metering, and
the recursive self-improvement pipeline.

## Install

```bash
npm install @holoscript/absorb-service
```

The package is primarily consumed by HoloScript services and agent tooling. Most
end users should reach Absorb through MCP tools such as `holo_absorb_repo`,
`holo_query_codebase`, `holo_semantic_search`, and `holo_ask_codebase`.

## Entry Points

| Entry point                                   | Purpose                                                        |
| --------------------------------------------- | -------------------------------------------------------------- |
| `@holoscript/absorb-service`                  | Default engine and bridge exports                              |
| `@holoscript/absorb-service/engine`           | Scanner, graph, embeddings, visualization, and query machinery |
| `@holoscript/absorb-service/ingest`           | Professional ingest contracts and format registry              |
| `@holoscript/absorb-service/gev`              | Canonical Graph + Embedding + Vector/RAG surface               |
| `@holoscript/absorb-service/pipeline`         | Recursive self-improvement orchestrator                        |
| `@holoscript/absorb-service/daemon`           | HoloDaemon actions, errors, and prompt profiles                |
| `@holoscript/absorb-service/self-improvement` | GRPO, OPLoRA, DPO, quality scoring, and convergence helpers    |
| `@holoscript/absorb-service/mcp`              | MCP tool definitions and handlers                              |
| `@holoscript/absorb-service/credits`          | Credit service, pricing, and metered LLM wrapper               |
| `@holoscript/absorb-service/schema`           | Drizzle ORM schema                                             |
| `@holoscript/absorb-service/bridge`           | Absorb completion to pipeline trigger                          |

## Package Boundary

There are two Absorb surfaces in the repo by design:

- `packages/absorb-service`: package-owned engine and domain logic.
- `services/absorb-service`: deployment host for routes, auth, database wiring,
  webhooks, and Railway runtime.

New scanners, graph logic, query logic, provider adapters, MCP handler logic,
credit rules, and self-improvement behavior belong in the package. The service
host should stay thin and import the package.

## Canonical Substrates

Absorb is the umbrella package for HoloScript codebase intelligence. Its native
Graph + Embedding + Vector/RAG spine is consumed through
`@holoscript/absorb-service/gev`, not by asking callers to install separate
GraphRAG or embed packages.

- **HoloGraph**: structural graph behavior inside
  `packages/absorb-service/src/engine`, including `CodebaseGraph`, event and
  provenance edges, communities, manifest-backed graph artifacts, and impact
  analysis.
- **HoloEmbed**: the keyless embedding lane consumed through
  `HoloEmbedProvider` and the GEV entry point. The workspace package at
  `packages/holoembed` is an implementation/migration detail for existing
  engine and research consumers, not the recommended Absorb consumer package.
- **HoloLlama**: the owned-model serving utility at `packages/holollama`.
  HoloLlama owns llama.cpp serving plans and fleet receipts; Absorb may consume
  its local inference endpoints or receipts for synthesis, but HoloLlama does
  not own GraphRAG state.

See [Absorb Intelligence Spine](../architecture/absorb-intelligence-spine.md)
for the canonical dependency direction and naming rules.

## Strategy Role

This package is a supported service package, not a default v1 fleet install. Use
it when a service, MCP server, Studio route, or agent runtime needs codebase
intelligence as a library. Do not promote it into the laptop, Jetson, or Vast
fleet consumption matrix unless a concrete fleet consumer needs to install the
engine directly.

Before creating a new package for codebase intelligence, run:

```bash
corepack pnpm package:opportunity-map
```

If the map points at Absorb, foster this package first.

## Validation

```bash
corepack pnpm --filter @holoscript/absorb-service run build
corepack pnpm --filter @holoscript/absorb-service run test
corepack pnpm run package:opportunity-map
corepack pnpm run check:publish-surface
corepack pnpm run check:package-architecture
```
