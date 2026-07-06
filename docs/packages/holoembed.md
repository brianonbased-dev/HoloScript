# @holoscript/holoembed

`@holoscript/holoembed` is now an internal/migration workspace package for the
HoloEmbed encoder implementation. The canonical consumer package for Absorb's
Graph + Embedding + Vector/RAG spine is `@holoscript/absorb-service/gev`.

## Install

```bash
npm install @holoscript/absorb-service
```

## Consumer Library

```ts
import {
  CodebaseGraph,
  EmbeddingIndex,
  GraphRAGEngine,
  HoloEmbedProvider,
} from '@holoscript/absorb-service/gev';

const graph = new CodebaseGraph();
const provider = new HoloEmbedProvider();
const index = new EmbeddingIndex({ provider });

const rag = new GraphRAGEngine(graph, index);
```

## Canonical Role

HoloEmbed is the native embedding substrate under Absorb, but Absorb is the
package boundary for product consumers. Use `@holoscript/absorb-service/gev`
for graph construction, HoloEmbed provider wiring, vector indexes, manifests,
and GraphRAG.

The standalone workspace package remains only to avoid breaking existing engine,
benchmark, and research call sites while the encoder implementation is folded
behind the Absorb GEV surface. Do not recommend a new direct
`@holoscript/holoembed` install for Absorb workflows.

## Boundary

- Absorb owns the public GEV package surface:
  `@holoscript/absorb-service/gev`.
- HoloGraph is the structural graph layer inside Absorb.
- HoloEmbed is the keyless native embedding lane inside the GEV surface.
- HoloLlama is the owned-model serving and local inference lane, not an
  embedding provider.

See [Absorb Intelligence Spine](../architecture/absorb-intelligence-spine.md)
for the full canonical map.

## Validation

```bash
corepack pnpm --filter @holoscript/absorb-service run build
corepack pnpm --filter @holoscript/absorb-service exec vitest run src/gev/index.test.ts
corepack pnpm --filter @holoscript/holoembed run bench:snn
```

Only claim WebGPU/SNN acceleration for a machine after the benchmark records
hardware-local evidence.
