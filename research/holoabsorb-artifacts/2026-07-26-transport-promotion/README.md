# HoloAbsorb sovereign transport promotion

Status: **PASS**, with bounded claims.

This receipt closes the 2026-07-26 HoloAbsorb transport, recovery, visual
context, and rebenchmark cycle. HoloAbsorb is the official umbrella for the
codebase-intelligence product; `absorb-service`, HoloGraph, HoloEmbed,
GraphRAG, visual graph context, refresh/checkpoint recovery, knowledge
extraction, and their MCP tools remain named implementation capabilities
within that umbrella.

Machine-readable receipt:
[`transport-promotion.json`](./transport-promotion.json)

## Live surfaces

### Hosted

- Railway deployment:
  `d2d242bd-666b-4315-8fa4-e56f8c8b6957`
- Deployed source:
  `bd316538892b2318d476b73499c8257f83f2ac70`
- Deployment state: `SUCCESS`
- Public canary: healthy HoloAbsorb `6.1.3`; database connected; stateless
  initialization; official manifest present; umbrella audit passed.
- Amplified deployment receipt:
  `rcpt-5f07ad3a74b23637a955a580`
- Receipt SHA-256:
  `b3a3ec8e023b1ce550b4df06ad594648289ebd424d0899592aecb8ab2c8b94a0`

### Local Codex transport

The Codex `holoscript-local` MCP entry now launches the sovereign stdio server
directly from `packages/mcp-server/dist/index.js`. It does not enter the hosted
OAuth browser flow. The resulting smoke test exposed 429 tools and completed a
live graph-status call. Existing desktop UI state may require one reload before
the obsolete **Authenticate** badge disappears.

### Jetson

- Node: Jetson Orin 8 GB at the existing private fleet address.
- Live HoloScript source:
  `bd316538892b2318d476b73499c8257f83f2ac70`.
- MCP after cutover: healthy `8.0.14`, 429 tools, PID `2253420`.
- Llama service: active, PID `1823127` before and after MCP restart.
- Official HoloAbsorb manifest: audit `pass`, 28 declared umbrella tools.
- Live graph: authoritative, GraphRAG ready, HoloEmbed semantic index ready.
- Coverage: 20,117 graph files of 20,117 expected Git-tracked files; ratio
  `1.0`; complete; uncapped; zero extra files.
- Live graph statistics: 364,699 symbols; 1,008,853 calls; 35,115 imports;
  6,389,285 lines.

The cutover terminated only the MCP process. Systemd restarted it from PID
`2234630` to `2253420`; the llama PID remained `1823127`.

## Fleet graph generation

The source corpus was the exact Jetson checkout at
`bd316538892b2318d476b73499c8257f83f2ac70`, including the preserved
operator-owned modification whose SHA-256 was independently checked before and
after the release operation.

- Scan: 20,117 files in 179 batches.
- Scan checkpoint reuse: 179/179 batches.
- Generation:
  `80c9de82bd48d9898f72503dcb186c5d`.
- Builder runtime:
  `4b27706fa27f16b102828feab00b4d8c69afea6a`.
- Docker memory ceiling: 8 GiB.
- Node old-space ceiling: 4 GiB.
- Application RSS ceiling: 7.5 GiB.
- Measured process peak RSS: 5,367,595,008 bytes.
- Successful duration: 111,702 ms.
- Graph bytes: 344,922,679.
- Graph SHA-256:
  `ea2346d2ea6bffb0d60aecf6939fe5300ff6cffe5951e910284734958399bcda`.
- Embedding bytes: 1,423,987,049.
- Embedding SHA-256:
  `f97414a7b87611f8a82fd6b6d5364b6c9c3c78e7ec09576a84485bf93f84de05`.
- Promotion archive bytes: 1,768,913,920.
- Promotion archive SHA-256:
  `c8615e8d4f98a6f9476eba800656a61a13fe2ab566e4c81ffa9d2b1f17c809e7`.

The first full generation completed scanning but exhausted the default Node
heap while serializing embeddings. The successful path combined durable
checkpoint reuse, best-progress checkpoint selection, a process/host-bound
writer lease, an explicit memory guard, and one-buffer embedding
serialization. The resulting graph and embedding digests matched before and
after transfer.

## Transport failure converted into a regression

The first live semantic canary found that tar had rounded the embedding
artifact's sub-second mtime. The graph remained authoritative, but the runtime
correctly refused to call the semantic generation ready because its old
identity check required exact byte length and exact mtime.

The admitted artifact was repaired without changing its content:

1. re-hash all 1,423,987,049 embedding bytes on the Jetson;
2. require the expected SHA-256 and byte length;
3. restore the graph-bound mtime; and
4. rerun the fail-closed canary.

The subsequent canary passed. Commit
`23f284b180aa7a93f872aff2cf001b2b8efae46d` prevents recurrence by allowing an
immutable selected generation manifest, digest, and byte length to preserve
the graph-to-embedding binding when archive transport changes timestamp
precision. Its regression rounds the mtime, requires semantic readiness, and
still rejects the existing changed-generation corruption case. Targeted test,
lint, and TypeScript checks passed.

## Accuracy and benchmark boundary

The companion tracked evidence remains authoritative for model-quality claims:

- [`../2026-07-26-visual-graph-four-arm/README.md`](../2026-07-26-visual-graph-four-arm/README.md)
  freezes 20 real duplicate-symbol cases. Correct visual selection produced
  MRR `1.0` and top-1 `100%`; stale selection exactly reproduced the
  no-selection baseline; an intentionally wrong resolved selection steered the
  wrong node to top-1 in all 20 cases. This proves selection behavior, not the
  correctness of arbitrary user selections.
- [`../2026-07-26-post-visual-rebenchmark/README.md`](../2026-07-26-post-visual-rebenchmark/README.md)
  records the umbrella audit, delta-refresh reuse, bounded Paper 5 bootstrap,
  and Paper 26 regressions. Paper 5 still needs at least 50 independently
  labeled dependency, impact, and reasoning queries before a
  publication-scale retrieval claim.

No GPU acceleration or general developer-accuracy claim is made by this
promotion.

## Remaining operational boundary

The live Jetson service still launches from the MCP package directory because
its root-owned systemd drop-in cannot be changed by this operator seat. The
admission therefore uses a content-identical hard-linked compatibility cache
for the package workspace; both aliases share the same graph and embedding
inodes. Pinning `HOLOSCRIPT_WORKSPACE_ROOT` to the repository root remains the
cleaner owner-level unit configuration when that root-owned maintenance window
is available.
