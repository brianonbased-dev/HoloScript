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

## Current Targets

The first report consumes existing artifacts for:

- Paper 6: `.bench-logs/paper-6-ablation-publication.json`
- Paper 11: `.bench-logs/paper-trait-semiring-overhead.json` paired with `.bench-logs/paper-trait-imperative-baseline.json`
- Paper 12: `.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md`

Paper 11 is the cleanest decoderCost flip candidate because it has both the
`O(t)` class and paired measured overhead against the uncontracted imperative
baseline. The paper still needs a Runtime/Cost heading that cites the generated
JSON report before the audit-matrix detector can flip.
