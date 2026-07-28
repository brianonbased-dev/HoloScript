# HoloAbsorb visual-context four-arm evaluation

Status: **PASS**, with bounded claims.

This evaluation freezes the same real-repository duplicate-symbol targets
across four GraphRAG arms:

1. no visual selection;
2. the correct collision-safe graph node;
3. a stale, unresolved node ID; and
4. a resolved but intentionally wrong same-name node from another file.

Canonical receipt:
[`hybrid-visual-four-arm-full.json`](./hybrid-visual-four-arm-full.json)

The case-set SHA-256 is
`c8d94dab9db951ced72d65bb75e132f96e4fa307b64ef72840a562e828ffccd7`.
Targets were frozen before any visual arm ran. Public-identifier-shaped
duplicate names were ordered by a stable digest instead of taking the first
lexicographic prefixes.

## Corpus and execution boundary

- HoloScript head:
  `fd78674b44a1cc7b6dbd6add4fed39627203b0cc`
- Benchmark source commit:
  `70bf9e7d7a28cba086f3fababbe1b438f8059db3`
- Eligible Git-tracked files: 20,092
- Scanned files: 20,092
- Coverage ratio: 1.0; no `maxFiles` truncation
- Graph symbols: 379,613
- HoloEmbed index entries: 384,255
- Parser-light file entries: 4,642
- Embedding execution: CPU
- Setup time: 414,819.766 ms
- Peak process RSS delta: 3,375,517,696 bytes

The shared worktree was globally dirty because peer work coexisted in the
checkout. The receipt separately proves that the benchmark script and its
visual-context regression test were clean at the recorded head.

## Results

| Arm               | Fixed-target MRR | Fixed target top-1 | Mean target rank |   Mean query |
| ----------------- | ---------------: | -----------------: | ---------------: | -----------: |
| No selection      |            0.392 |                 0% |             3.55 | 1,101.348 ms |
| Correct selection |            1.000 |               100% |             1.00 | 1,089.598 ms |
| Stale/unresolved  |            0.392 |                 0% |             3.55 | 1,097.036 ms |
| Wrong/resolved    |            0.392 |                 0% |             3.55 | 1,073.511 ms |

All 20 correct selections resolved and promoted the fixed target to rank 1.
All 20 stale selections remained unresolved and reproduced the complete
no-selection ranking exactly.

All 20 intentionally wrong selections resolved, and the supplied wrong node
became rank 1 in every case. That is caller-directed steering, not hidden model
accuracy. On this frozen set:

- fixed-target harmful-override rate: 0%;
- mean fixed-target rank delta: 0;
- wrong-selection follow rate: 100%;
- wrong-selection isolation rate: 90%; and
- the fixed target received a nonzero related visual boost in 10% of cases.

The 10% related boost is diagnostic evidence that graph neighborhood or
community context can legitimately reach beyond the exact selected node. It
does not change the fixed target's aggregate rank here, but it remains a metric
to watch as the labeled corpus expands.

Cold construction of the selection index took 678.684 ms. Reusing the cached
index took 0.062 ms in this run. The ratio is timing-sensitive; the durable
claim is that warm reuse avoids rebuilding the full symbol-selection index.

## Coverage failure preserved

[`hybrid-visual-four-arm-capped-10000.json`](./hybrid-visual-four-arm-capped-10000.json)
is the preserved failed predecessor. Its 10,000-file scan omitted both
`scripts/safe-commit.ps1` and `scripts/safe-commit.sh`, so both parser-light
control queries failed. That run exposed the hidden subset problem and led to
the v3 whole-repository coverage inventory and fail-closed `cappedByMaxFiles`
gate.

## Reproduction

```powershell
pnpm --filter @holoscript/absorb-service test
pnpm --filter @holoscript/absorb-service build
node packages/absorb-service/scripts/bench-holoabsorb-hybrid.mjs `
  --repo C:/Users/josep/Documents/GitHub/HoloScript `
  --out research/holoabsorb-artifacts/2026-07-26-visual-graph-four-arm/hybrid-visual-four-arm-full.json `
  --max-files 21000 `
  --top-k 5
```

Validation before the benchmark source commit:

- Absorb package: 99 test files passed, 1 opt-in file skipped;
  1,348 tests passed, 1 skipped.
- Absorb package build: passed.
- Safe-commit lint and typecheck gates: passed.

## Claim boundary and next gap

This run proves visual-context behavior for 20 deterministically sampled
duplicate-symbol disambiguation cases on one real HoloScript checkout. It does
not prove that arbitrary user graph selections are correct, that visual
context improves every code question, or that a wrong resolved selection
should be ignored. A wrong resolved selection is explicit intent and is
therefore reported as steering.

Paper 5 still needs the separately tracked publication-scale corpus of at least
50 independently labeled dependency, impact, and reasoning queries. The
full-repository CPU cost also confirms that the 8 GB Jetson should consume
checkpointed or delegated indexes rather than repeat this one-shot build while
serving another memory-heavy process.
