# Paper-19 Production Trait-Inference Corpus

**File**: `phase-3-trait-inference-production.jsonl`
**Generator**: `scripts/paper-19/harvest-corpus-production.mjs`
**Corpus SHA-256 (id-list hash)**: `3b7e3bd027f3f2c437703f55ea2ca3b4a749326012786aefd16a4507ff51af57`
**Generated**: 2026-07-15T06:59:14.168Z

## What this corpus is

Real natural-language -> .hsplus-trait-annotation pairs harvested from production source files and logged trait-authoring sessions. Each row carries a `description` extracted from the leading comment block of the source file, paired with a structurally extracted `snippet` (object or template block) and its `gold_traits`.

## Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `"row-NNNNN"` | Stable identifier |
| `split` | `"train" | "dev" | "test"` | Frozen split |
| `description` | `string | null` | Leading-comment NL description from the source file |
| `snippet` | `string` | Structurally extracted object/template block |
| `gold_traits` | `string[]` | Bare `@trait` tokens (args stripped) |
| `provenance.source` | `string` | Repo-relative path |
| `provenance.lines` | `string` | Line range |
| `provenance.kind` | `"verbatim"` | Always verbatim in this production corpus |
| `metadata.*` | `various` | Same as v2: trait_families, snippet_size_bucket, split_role, novel_combination |

## Live statistics

| Metric | Value |
|---|---|
| Total rows | 4300 |
| Train | 2790 |
| Dev | 608 |
| Test | 902 |
| Novel-combination test rows | 309 |
| Distinct gold traits | 412 |
| Trait families covered | 58 |
| Uncategorized traits | 217 |
| Source files scanned | 485 |
| Files with description | 419 |
| Files without description | 66 |
| Total blocks parsed | 4821 |
| Blocks with traits | 1814 |
| After snippet dedup | 4652 |
| Production rows (with description) | 4300 |

## Sourcing

Roots scanned (recursive):

- `packages/core/src/__tests__/fixtures`
- `.scratch`
- `benchmarks/scenarios`
- `benchmarks/cross-compilation`
- `examples`
- `bio-demo`
- `test`
- `.bench-logs/format-stress`
- `packages/*/test` and `packages/*/fixtures` (auto-discovered)
- `.bench-logs/format-stress` (logged trait-authoring sessions)

## Split methodology

Same combination-aware split as the v2 corpus:

1. Group rows by sorted trait-combination key.
2. Hold out combinations deterministically until >= 300 test rows.
3. Remaining rows → hash-mod 70/15/15.

Held-out combinations: 300
Held-out rows: 300

## Determinism

Re-running the generator on the same git tree produces byte-identical output (modulo file-system order). The split is derived from the SHA-256 of each snippet; the novel-combination selection is derived from the sorted combo-key hash.

## Re-generation

```bash
node scripts/paper-19/harvest-corpus-production.mjs
```
