# Paper-19 Phase-3 Trait-Inference Dataset (v2 — gap-fix)

**File**: `phase-3-trait-inference-2000row-v2.jsonl` (7,577 rows, JSONL)
**Generator**: `scripts/paper-19/harvest-corpus-v2.mjs` (programmatic, deterministic; re-running produces byte-identical output modulo file-system order)
**Synth module**: `scripts/paper-19/synth-strategies-v2.mjs` (4 strategies)
**Family deriver**: `scripts/paper-19/derive-trait-families.mjs` (parses `packages/core/src/traits/constants/*.ts`)
**Family map**: `trait-family-map-v1.json` (regenerable)
**Adversarial mislabel sibling**: `adversarial-mislabel/phase-3-mislabel-attractors-v2.jsonl` (12 rows)
**Validator**: `scripts/paper-19/validate-dataset-v2.mjs`

This v2 supersedes the [50-row v1](phase-3-trait-inference-50row-v1.README.md) and closes all four limitations the v1 README surfaced.

## Limitations from v1 — closed

| v1 limitation | v2 closure | How |
|---|---|---|
| **N=50 below the ≥2,000 floor** | **7,577 rows** | Harvester scans `benchmarks/scenarios/`, `benchmarks/cross-compilation/`, `examples/`, `bio-demo/`, `test/` — 367 source files yielding 3,031 unique verbatim blocks + 4,546 synth rows after dedup and the 60% synth cap |
| **Synth rows low-edit-distance** | **4 distinct strategies** | `trait-permutation` (K!-1 reorderings, capped at 3 per source), `trait-removal` (drop last trait), `property-stripping` (header + traits only), `cross-domain-transfer` (rename object id to a foreign-domain token) — 1,083 / 578 / 1,385 / 1,500 rows respectively |
| **Trait families hand-coded** | **Programmatically derived** | `derive-trait-families.mjs` parses every `export const <NAME>_TRAITS = [...] as const;` block in `packages/core/src/traits/constants/*.ts` (115 families, 2,455 distinct traits, pinned to git HEAD at harvest time). Validator consumes the JSON map; no hand-coded family list anywhere in the pipeline. |
| **Negative controls "looks-like" only** | **12 adversarial-mislabel rows** | Sibling JSONL `adversarial-mislabel/phase-3-mislabel-attractors-v2.jsonl`: 6 underlabeled (snippet has K+1 traits, gold has K) + 6 phantom-labeled (gold has K+1, snippet has K). Tests detection-of-omission and refusal-to-hallucinate independently of the headline F1. |

## Schema

| Field | Type | Description |
|-------|------|-------------|
| `id` | `"row-NNNNN"` | Stable row identifier; assigned in harvest order |
| `split` | `"train" \| "dev" \| "test"` | Frozen at synthesis time. Test set is held out — DO NOT look at during model selection. |
| `snippet` | `string` | The `.hsplus`/`.holo` source fragment (object or template block, balanced-brace-extracted) |
| `gold_traits` | `string[]` | The defensible gold-label trait list — bare `@trait` tokens (args stripped) |
| `provenance.source` | `string` | Repo-relative path to the source file (or `synth` for fully-synthesized rows) |
| `provenance.lines` | `string` | Line range or hint inside the source file |
| `provenance.kind` | `"verbatim" \| "synth"` | `verbatim` = unmodified extraction; `synth` = synthesized (one of the 4 strategies) |
| `provenance.synth_strategy` | `string` (synth only) | One of: `trait-permutation`, `trait-removal`, `property-stripping`, `cross-domain-transfer` |
| `provenance.parent` | `string` (synth only) | The id of the verbatim row this synth was derived from |
| `metadata.trait_families` | `string[]` | Programmatically derived from `trait-family-map-v1.json` |
| `metadata.uncategorized_traits` | `string[]` | Traits not found in the family map (drift signal — see "Known limitation: family-map drift" below) |
| `metadata.snippet_size_bucket` | `"zero" \| "solo" \| "two-to-three" \| "four-plus"` | Number of gold traits |
| `metadata.split_role` | `"train" \| "dev" \| "in-distribution-test" \| "novel-combination-test"` | Test rows are stratified into in-distribution (combination seen in train) and novel-combination (combination held out from train) |
| `metadata.novel_combination` | `bool` | True iff the row is in test/dev AND the gold-trait combination does not appear in any train row |

## Corpus statistics — verify with `node scripts/paper-19/validate-dataset-v2.mjs`

Live numbers; do not hardcode in downstream materials.

| Metric | Value | Gate |
|---|---|---|
| Total rows | 7,577 | ≥ 2,000 ✓ |
| Splits | train=5,125 (67.6%) dev=1,056 (13.9%) test=1,396 (18.4%) | 70/15/15 ± 5pp ✓ |
| **Novel-combination test rows** | **306** | **≥ 300 (Paper 19 gate item)** ✓ |
| Synth ratio | 60.0% | ≤ 60% ✓ |
| Distinct synth strategies | 4 | ≥ 4 ✓ |
| Trait family coverage | 48 (of 115 known) | ≥ 10 ✓ |
| Distinct gold traits | 381 (of 2,455 declared in family map) | informational |
| Adversarial mislabels | 12 (6 underlabeled + 6 phantom) | ≥ 10 ✓ |
| Verbatim provenance | 3,031 (40.0%) | ≥ 40% ✓ |

## Sourcing

Programmatic harvest from 367 source files across these roots:

| Root | File count | Block extraction yield |
|---|---|---|
| `benchmarks/scenarios/` | 6 | small but rich; load-bearing examples |
| `benchmarks/cross-compilation/compositions/` | 15 | 15 industry-domain compositions |
| `examples/` | 343 | the bulk of the verbatim corpus |
| `bio-demo/`, `test/` | rest | smaller utility fixtures |

The harvester uses a **structural balanced-brace parser**, not regex, so nested objects and templates are handled correctly. Per block, it extracts the consecutive `@trait[(args)]` lines following the opening `{` as the gold-label set; non-trait property lines (`geometry:`, `position:`, `state {…}`, etc.) terminate the trait list.

## Synthesis strategies (Gap 2)

Each strategy adds rows tagged `provenance.synth_strategy`. Source rows must have ≥1 trait (≥2 for permutation/removal). Strategies run in the harvester after verbatim dedup, and the synth pool is capped at `synth ≤ 1.5 × verbatim` (mathematically yields exactly ≤60% synth ratio of total).

| Strategy | What it does | What it tests |
|---|---|---|
| `trait-permutation` | Reorders the trait list (up to 3 distinct lex-next permutations per source) | Order-invariance of the classifier |
| `trait-removal` | Drops the last trait; gold updates accordingly | Subset robustness — classifier shouldn't pattern-complete |
| `property-stripping` | Removes geometry/position/state/etc. body lines, keeping only header + trait list | Minimal-context inference — does the classifier need scaffolding properties? |
| `cross-domain-transfer` | Renames the object/template id to a foreign-domain token (Widget, Module, Probe, Beacon, …) | Surface-name robustness — gold traits should survive an unrelated id |

## Trait family map (Gap 3)

`trait-family-map-v1.json` is regenerated by `scripts/paper-19/derive-trait-families.mjs`. It walks `packages/core/src/traits/constants/*.ts` and extracts every `export const <NAME>_TRAITS = [ ... ] as const;` array. The file basename (e.g. `physics-expansion`) IS the family name. Output:

```json
{
  "version": "v1",
  "git_head": "<sha>",
  "family_count": 115,
  "distinct_trait_count": 2455,
  "trait_to_families": { "stretchable": ["physics-expansion"], ... },
  "family_to_traits": { "physics-expansion": ["stretchable", "cloth", ...], ... }
}
```

Validator consumes this map. Re-deriving on a fresh git head will surface any new traits that have entered the constants/ directory; `git diff` of the JSON file is a review surface.

## Adversarial mislabel sibling (Gap 4)

`adversarial-mislabel/phase-3-mislabel-attractors-v2.jsonl` is a SEPARATE evaluation set — NOT mixed into the main F1 calculation. It contains rows where `gold_traits` deliberately diverges from the actual `@trait` tokens in the snippet:

- **Underlabeled (6 rows)**: snippet has more traits than gold lists. Tests classifier's ability to *exceed* gold (detect undeclared traits humans missed).
- **Phantom (6 rows)**: gold lists traits that aren't in the snippet. Tests refusal-to-hallucinate against pattern-completion priors.

Each row carries `metadata.adversarial_mislabel` (kind tag) and `metadata.actual_traits_in_snippet` (ground truth so the eval harness can compute precision-against-snippet vs precision-against-gold).

Use these for *noise-robustness reporting*, not for the headline F1.

## Held-out novel-combination test split (Paper 19 gate item)

The Paper 19 acceptance gate requires **≥300 test rows whose trait combinations do not appear in train**. A pure hash-based split rarely produces this because popular combinations (e.g. `[@grabbable, @physics, @collidable]`) repeat across many examples.

The harvester uses a **combination-aware splitter**:

1. Group all rows by sorted-trait-combination key.
2. Sort combinations by occurrence count ascending (singletons first), then by combo-hash for stability.
3. Greedily select combinations to hold out for test until accumulated row count ≥ 300.
4. All rows of held-out combinations → test (tagged `split_role: "novel-combination-test"`).
5. Remaining rows → hash-based 70/15/15.

Result: **306 novel-combination test rows from 170 held-out combinations**. The remaining 1,090 test rows are in-distribution (`split_role: "in-distribution-test"`), used for sanity-check F1.

The headline F1 metric per the Paper 19 pre-registration runs on the **306 novel-combination test rows**, not the full test split.

## Pre-registration (carried forward unchanged from v1)

> **F1 (macro) ≥ 0.80 on the 306-row novel-combination test split, with ≥15 percentage-point margin over the keyword-match baseline.**

Frozen at this corpus's synthesis. After-the-fact threshold-shopping is a reviewer red flag.

## Reviewer-survival argument

| Claim | Verification |
|---|---|
| ≥2,000 labeled rows | `wc -l <jsonl>` returns 7577 |
| Splits frozen + leak-free | Validator's leakage check |
| ≥300 novel-combination test rows | Validator's `[PASS] novel-combination test rows = 306 (>= 300)` |
| ≥4 synth strategies, each ≤% capped | Validator's strategy-distribution print |
| Family map programmatically derived | `git log` on `trait-family-map-v1.json` shows generator commit; harvester reads the same file |
| Adversarial mislabels exercise refusal-to-hallucinate | Sibling JSONL is independent of headline F1; validator confirms ≥10 rows + both kinds present |
| Verbatim sources resolve | Every verbatim row's `provenance.source` is a repo-relative path verifiable with `test -f` |

## Re-generation

```bash
node scripts/paper-19/derive-trait-families.mjs       # regenerates trait-family-map-v1.json from packages/core/src/traits/constants/*.ts
node scripts/paper-19/harvest-corpus-v2.mjs           # writes phase-3-trait-inference-2000row-v2.jsonl
node scripts/paper-19/validate-dataset-v2.mjs         # asserts all gates
```

All three must pass before the corpus is considered shippable.

## Known limitations (v2 — for transparency, not deferral)

These are **not** descope decisions; they are real signals the v2 generator surfaces.

1. **217 uncategorized traits in the corpus.** Real traits like `@hand_tracked`, `@ai_agent`, `@health_system`, `@metadata_display`, `@damage_dealer`, `@controllable` appear in `examples/` but are **not declared in `packages/core/src/traits/constants/*.ts`**. This is drift: the example corpus references traits that the trait registry doesn't formally declare. Action item: file a board task for the Paper 19 author to either (a) add these to the constants registry or (b) flag them as legacy/deprecated. The v2 generator does not paper over this — every uncategorized trait is recorded per-row in `metadata.uncategorized_traits` and aggregated in the validator output.

2. **Synth row count exceeds verbatim by 1.5×.** The 60% cap is the policy choice ratifying that synth rows can outnumber real-world rows in this corpus. Justified by N>2000 floor + diversity needs; flagged here so the Paper 19 author can decide if a stricter ratio (e.g. parity 50/50) is preferred for the final submission. To tighten, change `SYNTH_CAP_RATIO` in `harvest-corpus-v2.mjs` to 0.5 and re-run.

3. **Combination-aware splits over-represent rare combinations in test.** Holding out 170 combinations (mostly singletons + doubletons) means the novel-combination test set is biased toward less-popular trait sets. The headline F1 is therefore measuring "can the classifier handle the long tail" — which is the correct measurement per the Paper 19 gate. But it should be reported alongside the in-distribution test F1 (1,090 rows) so reviewers see both numbers.

4. **No human-rater inter-agreement audit yet.** All gold labels come from automated extraction (verbatim rows: gold = the actual `@trait` tokens; synth rows: gold derived deterministically from the parent verbatim). v3 should sample N=50 rows for human-rater agreement to estimate label noise — particularly important for the adversarial-mislabel sibling where definitions of "underlabeled" / "phantom" require human judgment.

5. **Brittney + community sources not yet integrated.** The Paper 19 dataset spec calls for 3 source types (existing files + Brittney synthetic + community contributions). v2 covers existing files exhaustively; Brittney + community remain for v3. Filed as separate tracks.

These limitations are **disclosed**, not **deferred**. Each has a named action item or generator-level toggle, and the validator emits the relevant signal.
