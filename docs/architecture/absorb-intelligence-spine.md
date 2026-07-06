# Absorb Intelligence Spine

Absorb is the canonical umbrella for HoloScript codebase intelligence. It is
the product and service surface that scans source, builds a graph, indexes
native embeddings, answers questions, emits `.holo` graph scenes, and feeds
self-improvement loops.

This umbrella has three native substrate lanes:

| Lane      | Canonical home                                          | Role                                                                                                                    | Boundary                                                                                                                                                                    |
| --------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absorb    | `packages/absorb-service` and `services/absorb-service` | Public codebase-intelligence package, MCP tools, service API, credits, GraphRAG, self-improvement pipeline              | Owns orchestration, cache policy, MCP handlers, and service behavior.                                                                                                       |
| HoloGraph | `packages/absorb-service/src/engine`                    | Structural graph layer: symbols, imports, calls, event edges, provenance, communities, impact analysis, graph manifests | A named subsystem inside Absorb today, not a separate npm package unless external consumers need a small graph-only install.                                                |
| HoloEmbed | `packages/holoembed`                                    | Keyless native embedding encoder for NL-to-code and symbol search                                                       | Reusable package. It must remain independent of Absorb so edge and research consumers can encode without the service stack.                                                 |
| HoloLlama | `packages/holollama`                                    | Owned-model serving planner and fleet receipts for llama.cpp-compatible local inference                                 | Fleet utility package. It plans and proves serving nodes; Absorb may consume local inference endpoints or receipts, but HoloLlama must not become the graph or MCP gateway. |

## Canonical Flow

```text
source tree
  -> Absorb scanner
  -> HoloGraph structural graph
  -> HoloEmbed vector index
  -> GraphRAG search and enrichment
  -> optional HoloLlama/local/cloud LLM synthesis
  -> citations, receipts, `.holo` graph scenes, and improvement tasks
```

HoloEmbed is the default shared GraphRAG embedding lane. External embedding
providers remain low-level experiments and must not silently replace HoloEmbed
in shared caches. HoloLlama is the local inference lane for answer synthesis,
planning, and fleet receipts; it is not an embedding provider and does not own
the code graph.

## Naming Rules

- Use **Absorb** for the umbrella product, service, MCP tool family, and
  recursive codebase-intelligence pipeline.
- Use **HoloGraph** for structural graph behavior inside Absorb: `CodebaseGraph`,
  event/provenance edges, community detection, manifest-backed graph artifacts,
  and impact analysis.
- Use **HoloEmbed** for the reusable keyless embedding package and the
  `HoloEmbedProvider` wrapper that satisfies Absorb's `EmbeddingProvider`
  interface.
- Use **HoloLlama** for owned llama.cpp serving plans, Brain routing receipts,
  lifecycle receipts, and local inference fleet handoffs.
- Do not create shadow names like `holograph-service`, `embed-service`, or
  `llama-absorb`. Add new behavior under the lane that owns it.

## Promotion Rules

HoloGraph can become a separate package only when a concrete consumer needs
graph construction or traversal without Absorb's scanning, MCP, credits, or
pipeline modules. Until then, the canonical implementation stays inside
`@holoscript/absorb-service/engine`.

HoloEmbed stays separate because it is already the small, reusable encoder
surface. Absorb consumes it through `HoloEmbedProvider`; HoloEmbed must not
depend on Absorb.

HoloLlama stays separate because fleet serving plans, model paths, launcher
artifacts, and device receipts are operational concerns. Absorb can use
HoloLlama-proved local endpoints for LLM synthesis, but HoloLlama should not
own GraphRAG state or codebase cache policy.

## Dependency Direction

Allowed direction:

```text
Absorb -> HoloEmbed
Absorb -> HoloLlama receipts or local inference endpoints
MCP server -> Absorb MCP handlers
Studio/services -> Absorb service API or MCP tools
```

Avoid:

```text
HoloEmbed -> Absorb
HoloLlama -> Absorb cache internals
HoloGraph shadow implementation outside Absorb without a migration plan
Service routes duplicating packages/absorb-service business logic
```

The operating principle is simple: Absorb is the umbrella, HoloGraph is its
structural graph core, HoloEmbed is its native embedding substrate, and
HoloLlama is the owned-model inference lane beside it.
