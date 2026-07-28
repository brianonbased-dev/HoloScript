# @holoscript/holoembed

HoloEmbed: 768-dim NL→code embeddings via structural features + char-trigram
subwords, with optional SNN-WebGPU population coding for GPU-accelerated batch
encoding.

External and public consumers — operators and agent-framework integrators
wiring semantic code search or symbol retrieval into their own tools — bring
their own symbol graph and query text. This package only turns those inputs
into vectors; it does not ship a vector store, a graph builder, or a network
client.

## Installation

```bash
npm install @holoscript/holoembed
```

## Quick start

```ts
import { HoloEmbedEncoder } from '@holoscript/holoembed';

const enc = new HoloEmbedEncoder();
await enc.initialize(); // no-op in CI, activates GPU when available

// Encode a symbol (full fidelity):
const docVec = enc.encode(sym, { fanIn: 3, eventNames: ['pillar:spike'] });

// Encode an NL query:
const queryVec = enc.encodeText('pillar slice emitter');

// Cosine similarity (both vectors are L2-normalized):
const score = queryVec.reduce((s, v, i) => s + v * docVec[i], 0);
```

## Dimensions

| Dims    | Source                | Description                           |
| ------- | --------------------- | ------------------------------------- |
| 0–383   | Structural (topology) | File path, call-graph, event-chain    |
| 384–511 | Trigrams (name+sig)   | camelSplit → 128-bin FNV-1a histogram |
| 512–639 | Trigrams (docComment) | Same algorithm on doc text            |
| 640–767 | Trigrams (eventNames) | Same algorithm on event name tokens   |

With SNN GPU active, each trigram block is transformed through 128 LIF
neurons (50ms simulated at dt=1ms) into a spike-rate population code. Falls
back to a plain histogram whenever GPU/WebGPU is unavailable.

## API surface

- `HoloEmbedEncoder` — `initialize()`, `encode()`, `encodeText()`,
  `encodeTexts()` (batched), `snnActive`, `dispose()`.
- `SnnAccelerator`, `encodeLifPopulationCpu` — the SNN population-coding path,
  exported for callers who want to drive it directly.
- `camelSplit`, `trigramHistogram`, `hashString`, `spreadHash`, `l2Normalize`
  — the subword-hashing primitives, exported for reuse.

## Package boundary & release posture

This package does not ship a symbol graph, a vector store, or a GPU driver —
the `SymbolInput`/`GraphEnrichment` you pass to `encode()`/`encodeText()` is
entirely caller-owned, and WebGPU acceleration is an optional peer dependency
you supply yourself (falls back to a pure-CPU histogram path when GPU is
unavailable). There is no founder-local or private-workspace default baked
into the encoder — it is a pure function of the input you give it.

Release posture: v0-preview. Known limitations — evidence posture on SNN
acceleration is explicit: do not claim the GPU path is faster on a given
machine until you validate it — run `pnpm --filter @holoscript/holoembed run
bench:snn` yourself and record a CPU-reference versus WebGPU latency/recall
report for that machine. Embedding dimensions and trigram bucket counts are still v0 and may
change between releases — pin an exact version if you persist vectors across
upgrades; there is no in-package rollback/migration for a vector store you
build on top of it.

## Testing

```bash
npm test               # vitest run --passWithNoTests
npm run test:webgpu    # WebGPU parity check (requires build)
npm run bench:snn      # CPU-reference vs WebGPU latency/recall on this machine
```

## License

MIT License - See [LICENSE](./LICENSE) for details.
