# HoloAbsorb + HoloRepo integration rebenchmark

Date: 2026-07-27

Status: **PASS** (12/12 rebenchmark stages)

## Provenance

- HoloScript implementation commit: `dbf269281910417e304f9c151848072b17a04acb`
- Worktree dirty at benchmark start: `false`
- Unified receipt: `holoabsorb-rebenchmark.json`
- Unified receipt SHA-256: `0faa18f9849b7fdd076f1cdeb2e9cbf5c9e0b270442a341b932e335a44a69937`
- Visual-focus receipt SHA-256: `c40ff5f6596b797bdc31df261d7dd743ec1120cd28c3e8621481b47bb6077ecc`
- HoloRepo bridge commit: `facf7ea6a3c2540a9b534290cbfcb41952886805`
- HoloRepo promotion capsule SHA-256: `830ef437c4cfce631fcf59af21c551217badc21cfd83be3b4868069cf0fe302e`
- Live HoloRepo-to-local-HoloAbsorb manifest receipt:
  `sha256:1b756f0842236a00ccbf869aed6c01bbfa53d0334288f1a78ee9532f742adabf`

## Product boundary

HoloAbsorb is the official codebase-intelligence umbrella. It owns Absorb
scan/query/ask/diff/transform behavior, HoloGraph, HoloEmbed, HoloEmitter, GEV,
receipted visual focus, and the related benchmark and paper evidence.

HoloRepo remains the source and repository-system authority: repoGraph, database,
knowledge-store, admission, and promotion receipts stay in HoloRepo custody.
HoloAbsorb enriches that source truth; it does not replace it.

## Visual-focus result

The real-code ablation covered all 335 Git-tracked files under
`packages/absorb-service`, with 12,008 graph symbols and 12,035 indexed entries.
Twenty duplicate-symbol cases were frozen before any visual arm ran.

| Arm | MRR | Top-1 | Resolution |
|---|---:|---:|---:|
| No selection | 0.304 | 0.00 | n/a |
| Correct selection | 0.975 | 0.95 | 1.00 |
| Stale/unresolved | 0.304 | 0.00 | 0.00 |
| Wrong/resolved | 0.327 | 0.00 | 1.00 |

The stale arm reproduced the baseline ranking exactly (`1.00` match rate).
Wrong resolved selections were followed at rate `1.00`; the fixed target was
harmed in `0.05` of cases. This is important: visual focus is explicit caller
intent and can steer retrieval correctly or incorrectly.

This measurement is structured `graph.holo` node selection over real source
code. It is not literal pixel understanding, rendering quality, human visual
perception, or a whole-monorepo retrieval claim.

## Other measurements

- The full visual-focus stage completed in 18.022 seconds.
- Refresh reused 2,880 of 2,895 symbols (`0.994819`) after the bounded delta.
  Initial scan was 3.203 seconds and refresh was 3.662 seconds, so this run does
  not support a universal refresh-speedup claim.
- The synthetic visual topology fixture measured file coverage `1.00`, edge
  recall `1.00`, and edge precision `1.00`.
- The synthetic transport lifecycle benchmark passed every check; its
  4,096-connection registry p95 was 28.102 ms. This is not network throughput or
  end-to-end MCP latency.
- Paper 5 held-out results remain: keyword-only P@5/MRR `0.200/0.449`,
  semantic-only `0.093/0.240`, hybrid `0.185/0.458`, and GraphRAG
  `0.193/0.463`. The study remains `publicationReady: false`.
- Paper 26 synthetic HoloGraph speedups were 2,045.1x, 13,964.2x, and 120,145x
  at 50, 500, and 2,000 files respectively. These are synthetic event-query
  measurements, not end-to-end agent speedups. Name-derived NL recall@10 was
  `0.10` structural and `1.00` HoloEmbed.

## Validation

- Absorb-service full bounded suite: 101 test files passed, 1 skipped; 1,364
  tests passed, 1 skipped.
- Rebased package build: pass.
- Heavy exact multi-root authority and large small-delta tests: 2 passed.
- HoloRepo package suite: 151 tests passed.
- HoloRepo Absorb tests: 10 passed.
- HoloRepo capability tests: 12 passed.
- HoloRepo fold-in audit: 0 pending client-folded entries.
- Sovereign HTTP service recovered through the bounded supervisor and reported
  healthy on `127.0.0.1:7411` with 429 tools.
- Fresh Codex MCP smoke: hosted and local surfaces both passed.
- Live HoloRepo `manifest` invocation reached local `holo_absorb_manifest` over
  streamable HTTP and returned HTTP 200.

## Remaining evidence gates

- Paper 5 still needs independent multi-human relevance labeling and external
  codebase replication before a publication-grade accuracy claim.
- Literal image-content value remains governed by the frozen four-arm v4
  protocol; this structured-selection benchmark does not substitute for it.
- Paper 26 hardware and end-to-end claims require separate target-hardware
  captures.
