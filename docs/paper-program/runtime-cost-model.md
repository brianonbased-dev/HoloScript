# Runtime Cost Model Reports

Runtime cost reports are the decoder/runtime-cost counterpart to evidence
envelopes. They normalize per-paper benchmark artifacts into one table with:

- an explicit asymptotic class,
- a measured baseline,
- a measured contracted/runtime path,
- overhead in the same unit, and
- artifact and harness paths reviewers can rerun.

## Generate

```bash
node scripts/paper-runtime-cost-model.mjs \
  --out docs/public/evidence/paper-runtime-cost-model.json \
  --markdown
```

For a bounded update in a busy repository, merge only the selected paper into
the committed report:

```bash
node scripts/paper-runtime-cost-model.mjs \
  --paper 4 \
  --base-ref HEAD \
  --out docs/public/evidence/paper-runtime-cost-model.json
```

This preserves every unselected row byte-for-byte while recalculating the
report summary and hash.

## Current Targets

The first report consumes existing artifacts for:

- Paper 4: `docs/public/evidence/paper-4-sandbox-runtime-cost.json`
- Paper 6: `.bench-logs/paper-6-ablation-publication.json`
- Paper 11: `.bench-logs/paper-trait-semiring-overhead.json` paired with `.bench-logs/paper-trait-imperative-baseline.json`
- Paper 12: `.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md`

Paper 4 emits a tracked receipt directly from the executable plugin-sandbox
attack suite. The audit matrix can admit that receipt without copying benchmark
numbers into the paper source, so later benchmark reruns improve the evidence
pipeline instead of forcing editorial churn.
