# @holoscript/holoembed

`@holoscript/holoembed` is the reusable HoloScript-native embedding package. It
encodes symbols and natural-language queries into the shared vector space used
by Absorb GraphRAG without requiring cloud embedding keys.

## Install

```bash
npm install @holoscript/holoembed
```

## Library

```ts
import { HoloEmbedEncoder } from '@holoscript/holoembed';

const encoder = new HoloEmbedEncoder();
await encoder.initialize();

const symbolVector = encoder.encode(symbol, {
  fanIn: 3,
  eventNames: ['pillar:spike'],
});

const queryVector = encoder.encodeText('pillar slice emitter');
```

## Canonical Role

HoloEmbed is the native embedding substrate under Absorb. It stays as a separate
package because edge, research, benchmark, and future graph consumers may need
encoding without the Absorb service stack.

Absorb consumes HoloEmbed through `HoloEmbedProvider`, which satisfies
Absorb's `EmbeddingProvider` interface. Shared GraphRAG caches should use
HoloEmbed so projects do not mix embedding spaces or silently fall back to
external providers.

## Boundary

- HoloEmbed owns deterministic symbol and query encoding, optional SNN-WebGPU
  population coding, and embedding constants.
- Absorb owns scanning, graph construction, cache policy, GraphRAG enrichment,
  MCP handlers, credits, and self-improvement workflows.
- HoloGraph is the structural graph layer inside Absorb.
- HoloLlama is the owned-model serving and local inference lane, not an
  embedding provider.

See [Absorb Intelligence Spine](../architecture/absorb-intelligence-spine.md)
for the full canonical map.

## Validation

```bash
corepack pnpm --filter @holoscript/holoembed run build
corepack pnpm --filter @holoscript/holoembed run test
corepack pnpm --filter @holoscript/holoembed run bench:snn
```

Only claim WebGPU/SNN acceleration for a machine after the benchmark records
hardware-local evidence.
