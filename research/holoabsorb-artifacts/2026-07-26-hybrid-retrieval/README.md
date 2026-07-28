# HoloAbsorb hybrid retrieval rebenchmark

This receipt set measures the exact-name/file-node and GraphRAG reranking
changes on 2026-07-26. It preserves both failed discovery runs and the final
passing runs; no failed artifact was rewritten as a pass.

## Real ai-ecosystem corpus

`hybrid-recall-ai-ecosystem.json` is the passing full local run:

- 8,524 tracked files scanned.
- 107,966 graph symbols and 113,676 indexed entries.
- 5,710 parser-light files received explicit `file` entries.
- `safe-commit.ps1` and `safe-commit.sh` are both in the top three for
  `safe-commit`.
- Both files are also in the top three for the longer
  `safe-commit ... git commit --only ...` query.
- Cold first-query time was 963.493 ms; warm query time was 304.08 ms.
- Setup peak RSS delta was 1,167,032,320 bytes on the CPU HoloEmbed path.

`hybrid-recall-ai-ecosystem-failed-v1.json` preserves the first failed run. It
showed that repeated `commit` tokens inflated lexical scores and that later
`git commit` phrases were incorrectly tied with the leading `safe-commit`
intent. The fixed scorer deduplicates overlap tokens and gives the earliest
explicit phrase the strongest exact-intent priority.

## Paper 5

The passing `unified-v2/holoabsorb-rebenchmark.json` receipt reports the
10-query deterministic bootstrap:

| System                |   P@5 |   MRR | Runtime |
| --------------------- | ----: | ----: | ------: |
| Keyword-only          | 0.180 | 0.711 |   69 ms |
| Pure HoloEmbed vector | 0.140 | 0.484 |  178 ms |
| HoloAbsorb hybrid     | 0.180 | 0.867 |  231 ms |
| Hybrid + GraphRAG     | 0.180 | 0.867 |  185 ms |

The graph stage now preserves the hybrid result instead of reducing MRR. This
remains a bootstrap, not the publication-scale 50-query evaluation.

## Refresh, transport, and Paper 26

- `refresh-worker-path.json` proves 2,880/2,895 embeddings reused, 15 embedded,
  a 5,866-byte refresh response, and fresh-process status/query parity.
- `unified/holoabsorb-rebenchmark.json` is the preserved failed unified run. It
  exposed a bundled-worker path lookup under `dist/mcp/workers`.
- `unified-v2/holoabsorb-rebenchmark.json` passes all seven umbrella, refresh,
  Paper 5, timing, and Paper 26 subprocesses after worker discovery was made
  bundle-layout independent.
- Paper 26 still reports exact HoloGraph event recall of 1.0 and HoloEmbed
  NL-to-code recall@10 of 1.0; the optional Xenova download ablation was not
  run.

## Replay

```bash
pnpm --filter @holoscript/absorb-service build
pnpm --filter @holoscript/absorb-service benchmark:holoabsorb-hybrid -- --repo C:/Users/josep/.ai-ecosystem --max-files 10000
node packages/absorb-service/scripts/bench-holoabsorb.mjs --skip-build --out-dir <new-output-directory>
```
