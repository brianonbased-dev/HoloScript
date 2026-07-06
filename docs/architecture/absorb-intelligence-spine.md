# Absorb Intelligence Spine

Absorb is the canonical umbrella for HoloScript codebase intelligence. It is
the product and service surface that scans source, builds a graph, indexes
native embeddings, answers questions, emits `.holo` graph scenes, and feeds
self-improvement loops.

This umbrella has one canonical consumer package surface:
`@holoscript/absorb-service/gev`. HoloGraph and HoloEmbed remain named substrate
lanes, but callers should not assemble a separate GraphRAG package plus an embed
package for Absorb workflows.

| Lane      | Canonical home                                          | Role                                                                                                                    | Boundary                                                                                                                                                                    |
| --------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Absorb    | `packages/absorb-service` and `services/absorb-service` | Public codebase-intelligence package, MCP tools, service API, credits, GraphRAG, self-improvement pipeline              | Owns orchestration, cache policy, MCP handlers, service behavior, and the canonical GEV package surface.                                                                    |
| HoloGraph | `packages/absorb-service/src/engine`                    | Structural graph layer: symbols, imports, calls, event edges, provenance, communities, impact analysis, graph manifests | A named subsystem inside Absorb today, not a separate npm package unless external consumers need a small graph-only install.                                                |
| HoloEmbed | `@holoscript/absorb-service/gev`                        | Keyless native embedding lane for NL-to-code and symbol search                                                          | Public consumers enter through Absorb GEV. `packages/holoembed` may remain as an implementation/migration workspace package until direct engine/research imports are folded. |
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

- Use **Absorb** for the umbrella product, service, MCP tool family, recursive
  codebase-intelligence pipeline, and public GEV package boundary.
- Use **GEV** for Absorb's Graph + Embedding + Vector/RAG consumer entry point:
  `@holoscript/absorb-service/gev`.
- Use **HoloGraph** for structural graph behavior inside Absorb: `CodebaseGraph`,
  event/provenance edges, community detection, manifest-backed graph artifacts,
  and impact analysis.
- Use **HoloEmbed** for the keyless embedding lane and the `HoloEmbedProvider`
  wrapper that satisfies Absorb's `EmbeddingProvider` interface.
- Use **HoloLlama** for owned llama.cpp serving plans, Brain routing receipts,
  lifecycle receipts, and local inference fleet handoffs.
- Do not create shadow names like `holograph-service`, `embed-service`, or
  `llama-absorb`. Add new behavior under the lane that owns it.

## Promotion Rules

HoloGraph can become a separate package only when a concrete consumer needs
graph construction or traversal without Absorb's scanning, MCP, credits, or
pipeline modules. Until then, the canonical implementation stays inside
`@holoscript/absorb-service/engine`.

Do not promote HoloEmbed as the normal standalone consumer package for Absorb
workflows. Existing direct imports can remain during migration, but new graph,
embedding, vector, and GraphRAG consumers should import
`@holoscript/absorb-service/gev`.

HoloLlama stays separate because fleet serving plans, model paths, launcher
artifacts, and device receipts are operational concerns. Absorb can use
HoloLlama-proved local endpoints for LLM synthesis, but HoloLlama should not
own GraphRAG state or codebase cache policy.

## Dependency Direction

Allowed direction:

```text
Absorb GEV -> HoloGraph + HoloEmbed lanes
Absorb -> HoloLlama receipts or local inference endpoints
MCP server -> Absorb MCP handlers
Studio/services -> Absorb service API or MCP tools
```

Avoid:

```text
New Absorb consumers -> @holoscript/holoembed direct install
HoloLlama -> Absorb cache internals
HoloGraph shadow implementation outside Absorb without a migration plan
Service routes duplicating packages/absorb-service business logic
```

The operating principle is simple: Absorb is the package mold, GEV is the
consumer entry point, HoloGraph is its structural graph core, HoloEmbed is its
native embedding lane, and HoloLlama is the owned-model inference lane beside it.
