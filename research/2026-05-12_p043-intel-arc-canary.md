# P043 Intel Arc SKU Matrix — Canary Status

**Task:** task_1778592597749_qu1l
**Date:** 2026-05-12
**Agent:** claude-code
**Git head:** 6593b999febf9cc715d8575c8a334baa11fce681

## Canary Verdict

**PENDING** — all 9 Intel Arc cells are scaffolded and ready, but no GPU capture harness is wired.

## Matrix Health Check

The `scripts/p043-sku-matrix.mjs` scaffold was exercised:

- `--write-plan` emitted a valid 45-cell matrix plan (5 SKUs x 3 scenes x 3 N values)
- `--check-results` confirmed 0 captured, 45 pending, 0 invalid across all SKUs
- `--list-cells --sku intel-arc` listed all 9 Intel Arc capture commands correctly
- `scripts/__tests__/p043-sku-matrix.test.mjs` passed 204/204 tests

## Intel Arc Cell Inventory

| Cell ID | Scene | Views | Status | Artifact Path |
|---|---|---:|:---:|---|
| intel-arc__indoor-500k__n2 | indoor-500k | 2 | pending | `.bench-logs/p043-sku-matrix/intel-arc/indoor-500k/n2.json` |
| intel-arc__indoor-500k__n4 | indoor-500k | 4 | pending | `.bench-logs/p043-sku-matrix/intel-arc/indoor-500k/n4.json` |
| intel-arc__indoor-500k__n8 | indoor-500k | 8 | pending | `.bench-logs/p043-sku-matrix/intel-arc/indoor-500k/n8.json` |
| intel-arc__outdoor-1m__n2 | outdoor-1m | 2 | pending | `.bench-logs/p043-sku-matrix/intel-arc/outdoor-1m/n2.json` |
| intel-arc__outdoor-1m__n4 | outdoor-1m | 4 | pending | `.bench-logs/p043-sku-matrix/intel-arc/outdoor-1m/n4.json` |
| intel-arc__outdoor-1m__n8 | outdoor-1m | 8 | pending | `.bench-logs/p043-sku-matrix/intel-arc/outdoor-1m/n8.json` |
| intel-arc__dense-2m__n2 | dense-2m | 2 | pending | `.bench-logs/p043-sku-matrix/intel-arc/dense-2m/n2.json` |
| intel-arc__dense-2m__n4 | dense-2m | 4 | pending | `.bench-logs/p043-sku-matrix/intel-arc/dense-2m/n4.json` |
| intel-arc__dense-2m__n8 | dense-2m | 8 | pending | `.bench-logs/p043-sku-matrix/intel-arc/dense-2m/n8.json` |

## Blocker

`P043_BENCH_COMMAND` is not set. The `--run-cell` scaffold exits 2 with the required cell contract until a GPU capture runner is wired. No placeholder data was inserted.

## Capture Commands (ready to run when harness is available)

```bash
# One-liner for all Intel Arc cells
node scripts/p043-sku-matrix.mjs --list-cells --sku intel-arc

# Example single-cell run (requires P043_BENCH_COMMAND)
P043_BENCH_COMMAND="pnpm --filter @holoscript/engine run benchmark:p043:shared-sort" \
  node scripts/p043-sku-matrix.mjs --run-cell intel-arc__indoor-500k__n2 \
  --out .bench-logs/p043-sku-matrix/intel-arc/indoor-500k/n2.json
```

## Next Steps

1. Wire `P043_BENCH_COMMAND` to a real GPU capture runner for Intel Arc (WebGPU on Intel Arc A770/A750)
2. Run all 9 cells with the required 3 runs per cell
3. Verify adapter tokens `intel` + `arc` match in each artifact
4. Re-run `--check-results` and promote from projected to measured data in the paper table
