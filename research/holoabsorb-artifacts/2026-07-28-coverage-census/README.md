# HoloAbsorb authoritative coverage census

This evidence bundle records the 2026-07-28 laptop repair and rebenchmark of
HoloAbsorb's graph-coverage authority contract.

## Outcome

The prior selected generation contained 11,650 TypeScript files but compared
itself against 20,287 Git-visible files because its persisted scan policy
omitted the requested language filter. The repaired generation records
`languages=["typescript"]`, binds that normalized policy into the checkpoint,
and reports every excluded Git entry by stable reason.

Independent generation readback:

- graph files: 11,650
- selected scanner-eligible candidates: 11,650
- exact file-set match: true
- missing graph files: 0
- unexpected graph files: 0
- coverage ratio: 1.0
- graph authoritative: true
- authority caveats: none
- refresh checkpoints: 136/136, 11,650/11,650 files

The 21,041 tracked Git-visible entries partition into 11,650 selected
TypeScript files plus 9,391 explicit exclusions: 580 path-policy, 159
non-absorbable extension, and 8,652 language-filtered entries.

## Validation

- `pnpm --filter @holoscript/absorb-service build` — PASS
- complete `codebase-tools.absorb-root.test.ts` — 74/74 PASS
- `absorb-refresh-checkpoint.test.ts` — 11/11 PASS
- `CodebaseScanner.batched.test.ts` — 8/8 PASS
- full real-corpus TypeScript refresh — PASS in 414,975 ms
- independent forced graph-status readback — authoritative, exact match
- HoloAbsorb umbrella audit — PASS
- HoloAbsorb umbrella rebenchmark — PASS

The uncapped checkpoint receipt scanned 20,287 parser-plus-plaintext files and
383,719 symbols. It reused 179 completed batches covering 20,286 files and
rescanned only the one-file interrupted tail. Compact status was 1,895 bytes
versus 50,071 bytes for full detail. The earlier intentionally capped 4,000-file
run is retained in `checkpoints.json`; it passed reuse and retention checks but
correctly failed the benchmark's full-corpus gate.

## Paper and visual results

The frozen Paper 5 dataset audit passed for 54 source-audited held-out queries.
On the 200-file retrieval run, Graph RAG MRR was 0.463 versus 0.449 for the
keyword baseline, while Graph RAG Precision@5 was 0.178 versus 0.200. This does
not support a blanket retrieval-superiority claim.

The structured visual-focus ablation covered all 335 selected package files.
Correct resolved visual selection raised MRR from 0.304 to 0.975 and top-1 from
0% to 95%. Stale unresolved selection reproduced the baseline; wrong resolved
selection was followed. This supports receipted graph-selection intent, not a
literal-pixel vision claim.

Paper 26 tests passed. The measured synthetic 8,000-symbol lane reported exact
HoloGraph recall and a 120,609x lookup speedup over the structural embedding
baseline; the bounded NL-to-code test reported HoloEmbed recall@10 of 100%
versus 10% for the structural floor. These remain synthetic/offline benchmark
claims, not universal production throughput claims.

## Resource boundary

The authoritative refresh intentionally used `outputFormat="stats"` and did
not allocate a new HoloEmbed index. Independent readback therefore reports
`semanticIndexReady=false` and `graphRAGReady=false`. At the decision point the
laptop had 5.4 GB free RAM, while the prior embedding artifact alone occupied
about 1.3 GB. The authoritative graph was published without risking an
unbounded semantic rebuild; a generation-matched embedding warm remains a
separate guarded operation.

## Post-commit incremental admission repair

The first post-commit convergence probe exposed a second defect: the
incremental patch lane admitted 13 untracked JavaScript files even though the
persisted policy declared `includeUntracked=false`. HoloAbsorb refused
authority because those files were outside the selected census.

The follow-up fix makes incremental add/modify admission use the same exact
Git-visible selected-file census as full scans and evicts any existing graph
entry outside that census. The live repair removed all 13 unexpected files,
reparsed only the two scoped modified TypeScript files, and restored exact
11,650/11,650 authority with no caveats. The complete root/refresh suite then
passed 75/75 tests, including a new tracked-only incremental regression.

## Runtime and semantic convergence

The later runtime pass closed the resource boundary above. It found that the
sealed `HoloScript-runtime` projection was 44 commits behind source and that
its still-importable dist predated the scanner-eligible coverage contract.
After advancing and rebuilding the projection, fresh sovereign HTTP readback
restored exact 11,650/11,650 authority. The already-open stdio client retained
old module state, which confirms that a client reconnect is still required
after replacing runtime dist.

The first guarded HoloEmbed warm cancelled correctly when a scheduled Ollama
workflow reduced free host memory below the 2,048 MiB floor. It preserved the
prior graph and committed nothing. A later isolated retry completed in
196,340 ms with 4,066 MiB peak RSS and 2,888 MiB minimum free host memory. The
new immutable generation contains a 1,396,403,032-byte HoloEmbed artifact and
reports both `semanticIndexReady=true` and `graphRAGReady=true`.

Process-restart readback retained the same graph generation and embedding
artifact. Cold semantic hydration measured 38,521 ms before restart and
58,694 ms after restart; warm searches measured 2,025-2,301 ms before restart
and 6,875 ms after restart on the concurrently loaded workstation. Exact
`publishCacheGeneration` retrieval remained rank 1.

The frozen Paper 5 benchmark reproduced its earlier bounded result: Graph RAG
MRR 0.463 versus keyword 0.449, but Precision@5 0.178 versus 0.200. The visual
focus ablation also reproduced MRR 0.304 to 0.975 and top-1 0% to 95% across
20 frozen cases. The deterministic 4,096-connection transport lifecycle
benchmark passed every check at 58.249 ms p95. Exact receipts and claim
boundaries are in `runtime-semantic-convergence.json`.

The stdio bootstrap now detects source-newer dist, binds verification to a
Git-HEAD build stamp, rebuilds only commit-affected workspace packages, and
forces a one-time rebuild of the sovereign Absorb/MCP owners when no trusted
stamp exists. Repair-only MCP builds preserve the committed example catalog
instead of dirtying the sealed projection. Verified per-group input mtimes
also prevent rebuild loops when generated bytes legitimately remain unchanged,
while package-scoped Git changes still force repair.
Its targeted suite passes 17/17 tests.
