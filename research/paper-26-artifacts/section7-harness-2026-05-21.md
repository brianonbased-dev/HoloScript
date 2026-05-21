# Paper 26 Section 7 Harness Evidence

Generated: 2026-05-21T14:54:31.864Z

JSON artifact: research/paper-26-artifacts/section7-harness-2026-05-21.json
Git HEAD: 2e8daae9c70c0dd3575fb4ee682ad46d07918a55

## Table 7.3 - HoloGraph Event-Chain Lookup

| Provider | Files | Symbols | Events | HoloGraph us | Embedding us | HG recall | Emb recall@10 | Speedup |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| StructuralEmbeddingProvider | 50 | 200 | 10 | 0.95 | 302.3 | 1 | 0.125 | 318.2x |
| StructuralEmbeddingProvider | 500 | 2000 | 50 | 4.145 | 2365.1 | 1 | 0.025 | 570.6x |
| StructuralEmbeddingProvider | 2000 | 8000 | 100 | 7.96 | 12416.8 | 1 | 0.025 | 1559.9x |
| Xenova/all-MiniLM-L6-v2 | 50 | 200 | 10 | 1.65 | 3880.8 | 1 | 0.125 | 2352x |

## Table 7.4 - HoloEmbed NL-to-Code Recall

| Provider | Recall@10 | Notes |
|---|---:|---|
| structural | 0.0% | topology only, no name encoding |
| holoembed | 90.0% | structural + char-trigram subwords |

## Table 7.5 - HoloMesh Team-Protocol Coordination

| Mode | Sequential p50 ms | Sequential p95 ms | Sequential req/s | Burst req/s | Success rate |
|---|---:|---:|---:|---:|---:|
| live-holomesh | 53.159 | 222.387 | 12.039 | 19.74 | 100.0% |

Coordination protocol: GET /api/holomesh/team/:teamId/board
