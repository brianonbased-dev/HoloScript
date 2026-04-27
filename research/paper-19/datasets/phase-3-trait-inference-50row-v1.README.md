# Paper-19 Phase-3 Trait-Inference Dataset (50-row v1)

**File**: `phase-3-trait-inference-50row-v1.jsonl` (50 rows, JSONL)
**Generator**: `scripts/paper-19/generate-dataset-50row.py` (deterministic; re-running produces byte-identical output modulo line endings)
**Validator**: `scripts/paper-19/validate-dataset-50row.mjs` (gates: 50 rows / 35-8-7 splits / no leakage / ≥10 families / verbatim sources resolve / 3-5 negatives)
**Authoring task**: `task_1777174097244_yohk` (Paper 19 phase-3 dataset synthesis)

## Schema

Each row is a JSON object with these fields:

| Field | Type | Description |
|-------|------|-------------|
| `id` | `"row-NNN"` | Stable row identifier; the generator assigns these in source-file order |
| `split` | `"train" \| "dev" \| "test"` | Frozen split assignment. Test rows are the held-out evaluation set; do not look at them during training. |
| `snippet` | `string` | A `.hsplus`/`.holo` source fragment. May be a complete `object {}` or `template {}` block, or a multi-line excerpt. The classifier's input. |
| `gold_traits` | `string[]` | The defensible gold-label trait list — every `@trait` annotation present in the snippet. Empty list for negative-control rows. |
| `provenance.source` | `string` | Repo-relative path to the source `.hsplus`/`.holo` file the snippet came from |
| `provenance.lines` | `string` | Line range or hint inside the source file |
| `provenance.kind` | `"verbatim" \| "synth"` | `verbatim` = unmodified extraction; `synth` = synthesized (mutation, composition, or negative control) |
| `provenance.note` | `string` (optional) | Rationale for synthesis when `kind="synth"` |
| `metadata.trait_families` | `string[]` | Coarse-grained categorization (interaction, physics, networking, etc.) used for ablation slicing |
| `metadata.snippet_size_bucket` | `"solo" \| "two-to-three" \| "four-plus"` | Number of gold traits — used to slice F1 by snippet complexity |
| `metadata.negative_control` | `bool` (optional) | `true` only on the 5 negative-control rows where `gold_traits=[]` |

## Corpus statistics (verify via `node scripts/paper-19/validate-dataset-50row.mjs`)

Live counts — do not hardcode in downstream materials. Run the validator to refresh.

| Metric | Value |
|--------|-------|
| Total rows | 50 |
| Splits | train=35, dev=8, test=7 |
| Provenance | verbatim=24, synth=26 |
| Trait family coverage | 15 (≥10 required) |
| Negative-control rows | 5 (3-5 required) |
| Distinct gold traits | 34 |
| Top traits | `@physics=17`, `@collidable=14`, `@grabbable=8`, `@clickable=6`, `@metadata_display=6` |
| Size buckets | solo=14 (28%), two-to-three=28 (56%), four-plus=8 (16%) |

## Sourcing

The corpus was assembled from four origin types:

1. **`benchmarks/scenarios/01-05/*.holo`** — five hand-curated benchmark scenes (basic-scene, high-complexity, robotics-sim, multiplayer-vr, holomap-reconstruction). 15 verbatim rows extracted.
2. **`benchmarks/cross-compilation/compositions/01-15/*.holo`** — 15 industry-domain compositions (healthcare, education, retail, gaming, architecture, manufacturing, entertainment, real-estate, fitness, social, art, automotive, aerospace, tourism, robotics). 9 verbatim rows + 11 lightly-synth rows that mirror documented patterns from these files.
3. **Solo-trait synthesis** — 8 rows that isolate a single trait family for class-balance and minimal-context F1 measurement. Each is patterned on a documented usage in the verbatim corpus (e.g., `row-035 @glowing` pattern from `02-high-complexity.holo`).
4. **Composite synthesis** — 3 rows (`043 TrainingDummy`, `044 InteractiveSculpture`, `045 MultiplayerWeapon`) that merge templates from multiple sources to exercise 5+ trait composites for ablation coverage.
5. **Negative-control synthesis** — 5 rows with `gold_traits=[]` designed as classifier attractors:
   - `row-046 DecorativeCube` — pure styling, no traits
   - `row-047 PropMass` — has `physics_props` block but no `@physics` annotation
   - `row-048 PlainPlayer` — has `health` / `speed` properties but no `@health_system` / `@controllable`
   - `row-049 AmbientLightSource` — emissive material does not imply `@glowing` trait
   - `row-050 BaseTemplate` — template with `state{}` but no traits

## Split protocol

The generator assigns splits explicitly per row (no random seeding) so re-runs produce byte-identical output. The 35/8/7 distribution is locked at synthesis time — **the test set is frozen and must not be looked at during model selection**. Held-out novel-combination rows (the seven test rows) span 3 trait families that also appear in train (physics, robotics, holomap-decorators) so they're in-distribution for inputs but unseen-combination for outputs.

If a future expansion needs strict held-out novel-combination semantics in the Paper 19 §gate sense, a v2 generator should add a `held_out_novel_combination` flag and a separate adversarial split.

## Reviewer-survival argument

A reviewer can verify each load-bearing claim with a single command:

| Claim | Verification |
|-------|--------------|
| 50 labeled rows | `wc -l <jsonl>` returns 50 |
| Splits are frozen and leak-free | `node scripts/paper-19/validate-dataset-50row.mjs` returns PASS on the leakage check |
| Gold labels are defensible | Each row's snippet contains exactly the `@trait` tokens in `gold_traits` (verbatim rows) or has a documented note explaining the synth decision |
| Verbatim sources exist | The validator's path-resolution check passes for all 24 verbatim rows |
| Family coverage is broad | The validator prints the 15-family list |
| Negative controls test refusal-to-predict | 5 rows with `gold_traits=[]` and varied attractor patterns |

## Snippet collisions

The generator hashes each `.strip()`'d snippet to SHA-256 (12 hex prefix) and refuses to emit if any hash collides. The validator independently re-hashes and confirms no leakage across the train/dev/test boundary. Hash function is identical between generator and validator (Python `hashlib.sha256` and Node `crypto.createHash('sha256')` both compute UTF-8 SHA-256).

## Known limitations (Phase 1 stance — escalate via /founder if material)

- **N=50 is below the Paper 19 gate's ≥2,000 floor.** This v1 is the *seed corpus* — Phase 3 baseline + classifier work uses these 50 rows as a sanity-check fixture before scaling to the full corpus. The v2 generator should expand to ≥2,000 rows by sampling community-contributed `.hsplus` files plus Brittney-synthesized paraphrases per the Paper 19 §1 dataset-spec.
- **Synth rows (26/50) are mostly low-edit-distance variants of verbatim rows.** A strong classifier might overfit to the structural shape rather than the trait token. The v2 corpus should diversify synthesis strategies (paraphrase via LLM, structural mutation, cross-domain transfer).
- **Trait families are a hand-coded coarse-grained categorization**, not the canonical `packages/core/src/traits/constants/*.ts` family list. v2 should derive families programmatically from the constants directory so drift is caught at generate-time.
- **Negative controls are all "looks-like" attractors**, not "trait-bearing-but-mislabeled" rows. v2 should add adversarial mislabel cases for noise-robustness measurement.

## Re-generation

```bash
python3 scripts/paper-19/generate-dataset-50row.py     # writes the JSONL
node scripts/paper-19/validate-dataset-50row.mjs       # asserts gates
```

Both must pass before the corpus is considered shippable.

## Pre-registration

Per the `ml-experiments` skill discipline (no after-the-fact threshold-shopping), the Paper 19 headline metric is pre-registered as:

> **F1 (macro) ≥ 0.80 on the held-out novel-combination test split, with ≥15 percentage-point margin over the keyword-match baseline.**

This v1 corpus's `test` split is the seed for that measurement. Once a baseline runs on these 7 rows and the v2 ≥2,000-row corpus is generated, the gate threshold is locked.
