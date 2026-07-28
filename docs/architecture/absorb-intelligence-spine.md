# Absorb Intelligence Spine

**HoloAbsorb** is the official umbrella for HoloScript codebase intelligence.
The historical short name Absorb, the `@holoscript/absorb-service` package, and
the `absorb-service` deployment slug remain stable compatibility contracts.
HoloAbsorb scans source, builds a graph, indexes native embeddings, answers
questions, emits `.holo` graph scenes, protects cache authority, and feeds
self-improvement and evidence loops.

The official executable ownership map is
`@holoscript/absorb-service/holoabsorb`. GEV remains the canonical Graph +
Embedding + Vector/RAG consumer spine at `@holoscript/absorb-service/gev`;
HoloGraph and HoloEmbed remain named substrate lanes.

| Lane       | Canonical home                                          | Role                                                                                                                    | Boundary                                                                                                                                                                     |
| ---------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HoloAbsorb | `packages/absorb-service` and `services/absorb-service` | Product umbrella, package, MCP tools, service API, reliability, GraphRAG, self-improvement, and evidence                | Owns orchestration, cache policy, MCP handlers, service behavior, the GEV spine, and the executable capability/evidence manifest.                                            |
| HoloGraph  | `packages/absorb-service/src/engine`                    | Structural graph layer: symbols, imports, calls, event edges, provenance, communities, impact analysis, graph manifests | A named subsystem inside Absorb today, not a separate npm package unless external consumers need a small graph-only install.                                                 |
| HoloEmbed  | `@holoscript/absorb-service/gev`                        | Keyless native embedding lane for NL-to-code and symbol search                                                          | Public consumers enter through Absorb GEV. `packages/holoembed` may remain as an implementation/migration workspace package until direct engine/research imports are folded. |
| HoloLlama  | `packages/holollama`                                    | Owned-model serving planner and fleet receipts for llama.cpp-compatible local inference                                 | Fleet utility package. It plans and proves serving nodes; Absorb may consume local inference endpoints or receipts, but HoloLlama must not become the graph or MCP gateway.  |

## Canonical Flow

```text
source tree
  -> HoloAbsorb scanner
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

## Revalidation Rule

Before marking HoloAbsorb consolidation done, verify the live package and service
shape instead of relying on this architecture note:

```bash
corepack pnpm --filter @holoscript/absorb-service run build
corepack pnpm --filter @holoscript/absorb-service run audit:holoabsorb
corepack pnpm --filter @holoscript/absorb-service run benchmark:holoabsorb
corepack pnpm --filter @holoscript/absorb-service run test
corepack pnpm run check:package-architecture
corepack pnpm run package:opportunity-map
```

Then inspect new imports and service routes:

- new consumers should use `@holoscript/absorb-service/gev` for Graph +
  Embedding + Vector/RAG workflows;
- direct `@holoscript/holoembed` imports are allowed only for existing
  implementation, benchmark, or research migration paths;
- `services/absorb-service` should stay a thin deploy host that imports package
  behavior rather than duplicating scanner, graph, embedding, or MCP logic;
- hosted MCP status is not proof of local repo authority unless the local
  adapter/cache path has also been checked.

## Naming Rules

- Use **HoloAbsorb** for the official product umbrella.
- Keep **Absorb**, `@holoscript/absorb-service`, `absorb-service`, and existing
  `absorb_*` / `holo_*` tools as compatibility names; do not fork their logic.
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

The operating principle is simple: HoloAbsorb is the product umbrella, Absorb
is its stable package/service compatibility boundary, GEV is the consumer
spine, HoloGraph is the structural core, HoloEmbed is the native embedding lane,
and HoloLlama is the owned-model inference lane beside it.
