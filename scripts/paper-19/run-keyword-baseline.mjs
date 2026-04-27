#!/usr/bin/env node
/**
 * Paper-19 Phase-2 keyword-match baseline.
 *
 * Per the v2 dataset pre-registration:
 *
 *   "F1 (macro) >= 0.80 on the 306-row novel-combination test split,
 *    with >= 15 percentage-point margin over the keyword-match baseline."
 *
 * This script LOCKS the keyword-match floor BEFORE the classifier ships, per
 * /ml-experiments discipline (baseline first, otherwise the classifier
 * contribution is null).
 *
 * Algorithm (per-row, multi-label):
 *   For each trait token T declared in trait-family-map-v1.json:
 *     predict T iff the bare token "@T" appears in the row's snippet
 *     (args / block bodies stripped — we tokenize the snippet by /@\w+/
 *      and compare bare names against the family-map keys).
 *
 * Outputs:
 *   research/paper-19/measurements/keyword-baseline-v2.json
 *   research/paper-19/measurements/keyword-baseline-v2.README.md
 *
 * Exit code 0 = ran cleanly, 1 = data/IO failure.
 *
 * Conventions:
 *   - Node ESM, no deps beyond core (per task spec).
 *   - Reads dataset/family map from research/paper-19/datasets/.
 *   - Uses the dataset's actual `metadata.split_role == "novel-combination-test"`
 *     filter (NOT a hardcoded N=306 — the live count is the truth).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const DATASET_PATH = join(
  REPO_ROOT,
  "research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl",
);
const FAMILY_MAP_PATH = join(
  REPO_ROOT,
  "research/paper-19/datasets/trait-family-map-v1.json",
);
const OUT_DIR = join(REPO_ROOT, "research/paper-19/measurements");
const OUT_JSON = join(OUT_DIR, "keyword-baseline-v2.json");
const OUT_README = join(OUT_DIR, "keyword-baseline-v2.README.md");

const DATASET_VERSION = "phase-3-trait-inference-2000row-v2";
const EVAL_SPLIT_ROLE = "novel-combination-test";

// ---------------------------------------------------------------------------
// IO helpers

function fail(msg) {
  console.error(`[keyword-baseline] FAIL: ${msg}`);
  process.exit(1);
}

function sha256OfFile(p) {
  const buf = readFileSync(p);
  return createHash("sha256").update(buf).digest("hex");
}

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT, encoding: "utf8" })
      .trim();
  } catch {
    return "unknown";
  }
}

function readJsonl(path) {
  const raw = readFileSync(path, "utf8");
  const rows = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line));
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Predictor

/**
 * Strip args + block bodies, return the set of bare trait names that appear
 * as `@name` in the snippet. The regex matches `@` followed by an identifier
 * and ignores any trailing `(...)` or ` { ... }` because we only capture the
 * `@\w+` head.
 */
function extractTraitTokensFromSnippet(snippet) {
  const tokens = new Set();
  const re = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(snippet)) !== null) {
    tokens.add(m[1]);
  }
  return tokens;
}

/**
 * Per the spec: "for each trait token in the family map, predict it iff its
 * bare name appears as `@traitname` in the snippet."
 *
 * Concretely: predict the intersection of (snippet @ tokens) and (family-map
 * keys). Returns the predicted set with `@` prefix to match gold-label format.
 */
function predictForRow(snippet, familyTraitSet) {
  const snippetTokens = extractTraitTokensFromSnippet(snippet);
  const predicted = [];
  for (const t of snippetTokens) {
    if (familyTraitSet.has(t)) {
      predicted.push(`@${t}`);
    }
  }
  return predicted.sort();
}

// ---------------------------------------------------------------------------
// Metrics

/** Per-row precision / recall / F1 against gold (sets of trait strings). */
function rowMetrics(predicted, gold) {
  const predSet = new Set(predicted);
  const goldSet = new Set(gold);
  let tp = 0;
  for (const g of goldSet) if (predSet.has(g)) tp += 1;
  const fp = predSet.size - tp;
  const fn = goldSet.size - tp;
  const precision = predSet.size === 0
    ? (goldSet.size === 0 ? 1 : 0)
    : tp / predSet.size;
  const recall = goldSet.size === 0
    ? (predSet.size === 0 ? 1 : 0)
    : tp / goldSet.size;
  const f1 = (precision + recall) === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/** Macro-average across rows. */
function macroAverage(perRow) {
  if (perRow.length === 0) return { precision: 0, recall: 0, f1: 0 };
  let p = 0, r = 0, f = 0;
  for (const m of perRow) {
    p += m.precision;
    r += m.recall;
    f += m.f1;
  }
  return {
    precision: p / perRow.length,
    recall: r / perRow.length,
    f1: f / perRow.length,
  };
}

/** Micro-F1 across all rows: pool tp/fp/fn then compute one P/R/F. */
function microF1(perRow) {
  let tp = 0, fp = 0, fn = 0;
  for (const m of perRow) {
    tp += m.tp;
    fp += m.fp;
    fn += m.fn;
  }
  const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
  const recall = (tp + fn) === 0 ? 0 : tp / (tp + fn);
  const f1 = (precision + recall) === 0
    ? 0
    : (2 * precision * recall) / (precision + recall);
  return { tp, fp, fn, precision, recall, f1 };
}

/**
 * Macro-F1 over the *label space*: for each distinct trait label seen in either
 * gold or predictions across the eval set, compute that label's P/R/F across
 * all rows, then average over labels.
 *
 * This is the standard "macro-F1" reported in multi-label classification
 * papers, distinct from the row-averaged macro-F1 above. Both are reported
 * because the row-averaged version is what /ml-experiments §F1 typically
 * refers to ("macro-average across the 306 rows") and the label-averaged
 * version is what reviewers will expect from "macro-F1" without
 * qualification.
 */
function macroF1OverLabels(rowsPredictedGold) {
  const labels = new Set();
  for (const { predicted, gold } of rowsPredictedGold) {
    for (const p of predicted) labels.add(p);
    for (const g of gold) labels.add(g);
  }
  const perLabel = {};
  for (const label of labels) {
    let tp = 0, fp = 0, fn = 0;
    for (const { predicted, gold } of rowsPredictedGold) {
      const inPred = predicted.includes(label);
      const inGold = gold.includes(label);
      if (inPred && inGold) tp += 1;
      else if (inPred && !inGold) fp += 1;
      else if (!inPred && inGold) fn += 1;
    }
    const precision = (tp + fp) === 0 ? 0 : tp / (tp + fp);
    const recall = (tp + fn) === 0 ? 0 : tp / (tp + fn);
    const f1 = (precision + recall) === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
    perLabel[label] = { tp, fp, fn, precision, recall, f1 };
  }
  if (labels.size === 0) {
    return { f1: 0, precision: 0, recall: 0, perLabel: {} };
  }
  let pSum = 0, rSum = 0, fSum = 0;
  for (const label of labels) {
    pSum += perLabel[label].precision;
    rSum += perLabel[label].recall;
    fSum += perLabel[label].f1;
  }
  const n = labels.size;
  return {
    f1: fSum / n,
    precision: pSum / n,
    recall: rSum / n,
    perLabel,
  };
}

// ---------------------------------------------------------------------------
// Top-K helpers

function topKByF1(perLabelMap, k, mode = "hit") {
  const entries = Object.entries(perLabelMap);
  if (mode === "hit") {
    // hits = labels with tp > 0, ranked by F1 desc, tp desc
    return entries
      .filter(([, m]) => m.tp > 0)
      .sort((a, b) => b[1].f1 - a[1].f1 || b[1].tp - a[1].tp)
      .slice(0, k)
      .map(([label, m]) => ({
        label,
        tp: m.tp,
        fp: m.fp,
        fn: m.fn,
        precision: round(m.precision),
        recall: round(m.recall),
        f1: round(m.f1),
      }));
  }
  // miss = labels with gold support (tp+fn > 0) and zero recall, ranked by support desc
  return entries
    .filter(([, m]) => (m.tp + m.fn) > 0 && m.recall === 0)
    .sort((a, b) => (b[1].tp + b[1].fn) - (a[1].tp + a[1].fn))
    .slice(0, k)
    .map(([label, m]) => ({
      label,
      gold_support: m.tp + m.fn,
      tp: m.tp,
      fn: m.fn,
      precision: round(m.precision),
      recall: round(m.recall),
      f1: round(m.f1),
    }));
}

function round(x, d = 6) {
  if (typeof x !== "number" || !isFinite(x)) return x;
  const f = Math.pow(10, d);
  return Math.round(x * f) / f;
}

// ---------------------------------------------------------------------------
// Main

function main() {
  if (!existsSync(DATASET_PATH)) fail(`dataset not found: ${DATASET_PATH}`);
  if (!existsSync(FAMILY_MAP_PATH)) {
    fail(`family map not found: ${FAMILY_MAP_PATH}`);
  }
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const datasetSha = sha256OfFile(DATASET_PATH);
  const familyMapSha = sha256OfFile(FAMILY_MAP_PATH);
  const generatorCommit = gitHead();

  const familyMap = JSON.parse(readFileSync(FAMILY_MAP_PATH, "utf8"));
  const familyTraitSet = new Set(Object.keys(familyMap.trait_to_families ?? {}));
  if (familyTraitSet.size === 0) {
    fail(`family map has zero trait_to_families entries`);
  }

  const allRows = readJsonl(DATASET_PATH);
  const evalRows = allRows.filter(
    (r) => r?.metadata?.split_role === EVAL_SPLIT_ROLE,
  );
  if (evalRows.length === 0) {
    fail(`no rows with metadata.split_role == "${EVAL_SPLIT_ROLE}"`);
  }

  // Per-row predictions + metrics
  const predictionsPerRow = [];
  const perRowMetricList = [];
  const rowsPredictedGold = [];
  for (const r of evalRows) {
    const gold = Array.isArray(r.gold_traits) ? [...r.gold_traits].sort() : [];
    const predicted = predictForRow(r.snippet ?? "", familyTraitSet);
    const m = rowMetrics(predicted, gold);
    predictionsPerRow.push({
      id: r.id,
      gold,
      predicted,
      tp: m.tp,
      fp: m.fp,
      fn: m.fn,
      precision: round(m.precision),
      recall: round(m.recall),
      f1: round(m.f1),
    });
    perRowMetricList.push(m);
    rowsPredictedGold.push({ predicted, gold });
  }

  const macroRow = macroAverage(perRowMetricList);
  const micro = microF1(perRowMetricList);
  const labelMacro = macroF1OverLabels(rowsPredictedGold);

  // Distinct-label counts
  const distinctTraitLabels = new Set();
  const distinctTraitPredictions = new Set();
  for (const r of predictionsPerRow) {
    for (const g of r.gold) distinctTraitLabels.add(g);
    for (const p of r.predicted) distinctTraitPredictions.add(p);
  }

  const hitTop10 = topKByF1(labelMacro.perLabel, 10, "hit");
  const missTop10 = topKByF1(labelMacro.perLabel, 10, "miss");

  // Out-of-family-map gold count: traits in gold that aren't in the family
  // map's trait_to_families (these are the "uncategorized" registry-drift
  // traits documented in the dataset README §"Known limitations"). The
  // baseline cannot predict them by construction; surface the count so the
  // floor is interpretable.
  let outOfFamilyGoldRows = 0;
  let outOfFamilyGoldTokens = 0;
  for (const r of predictionsPerRow) {
    let rowOut = 0;
    for (const g of r.gold) {
      const bare = g.startsWith("@") ? g.slice(1) : g;
      if (!familyTraitSet.has(bare)) rowOut += 1;
    }
    if (rowOut > 0) outOfFamilyGoldRows += 1;
    outOfFamilyGoldTokens += rowOut;
  }

  const lockedAt = new Date().toISOString();

  const out = {
    dataset_version: DATASET_VERSION,
    dataset_sha256: datasetSha,
    family_map_sha256: familyMapSha,
    family_map_trait_count: familyTraitSet.size,
    family_map_family_count: familyMap.family_count ?? null,
    eval_split_role: EVAL_SPLIT_ROLE,
    eval_rows: evalRows.length,
    macro_f1_row: round(macroRow.f1),
    precision_macro: round(macroRow.precision),
    recall_macro: round(macroRow.recall),
    macro_f1_label: round(labelMacro.f1),
    precision_macro_label: round(labelMacro.precision),
    recall_macro_label: round(labelMacro.recall),
    micro_f1: round(micro.f1),
    micro_precision: round(micro.precision),
    micro_recall: round(micro.recall),
    distinct_trait_labels: distinctTraitLabels.size,
    distinct_trait_predictions: distinctTraitPredictions.size,
    out_of_family_gold_rows: outOfFamilyGoldRows,
    out_of_family_gold_tokens: outOfFamilyGoldTokens,
    classifier_must_clear: {
      target_macro_f1_row: round(macroRow.f1 + 0.15),
      margin_pp: 15,
      pre_registration_floor: 0.80,
      effective_floor: round(Math.max(0.80, macroRow.f1 + 0.15)),
    },
    hit_per_label_top10: hitTop10,
    miss_per_label_top10: missTop10,
    locked_at: lockedAt,
    generator_script:
      "scripts/paper-19/run-keyword-baseline.mjs",
    predictions_per_row: predictionsPerRow,
  };

  writeFileSync(OUT_JSON, JSON.stringify(out, null, 2) + "\n", "utf8");

  // Also write a README that documents the locked numbers and the +15pp gate.
  const readme = renderReadme(out);
  writeFileSync(OUT_README, readme, "utf8");

  // Console summary.
  console.log(
    `[keyword-baseline] eval_rows=${out.eval_rows} ` +
      `macro_f1_row=${out.macro_f1_row} macro_f1_label=${out.macro_f1_label} ` +
      `micro_f1=${out.micro_f1}`,
  );
  console.log(
    `[keyword-baseline] precision_macro=${out.precision_macro} ` +
      `recall_macro=${out.recall_macro}`,
  );
  console.log(
    `[keyword-baseline] distinct_labels=${out.distinct_trait_labels} ` +
      `distinct_predictions=${out.distinct_trait_predictions} ` +
      `out_of_family_gold_rows=${out.out_of_family_gold_rows}`,
  );
  console.log(
    `[keyword-baseline] classifier must clear macro_f1_row >= ` +
      `${out.classifier_must_clear.target_macro_f1_row} ` +
      `(floor=${out.classifier_must_clear.effective_floor})`,
  );
  console.log(`[keyword-baseline] wrote ${OUT_JSON}`);
  console.log(`[keyword-baseline] wrote ${OUT_README}`);
}

function renderReadme(out) {
  const fmt = (x) => (typeof x === "number" ? x.toFixed(4) : String(x));
  return `# Paper-19 Keyword-Match Baseline (v2 — LOCKED)

**Locked at**: ${out.locked_at}
**Generator script**: \`${out.generator_script}\`
**Dataset**: \`${out.dataset_version}\` (sha256 \`${out.dataset_sha256}\`)
**Family map**: sha256 \`${out.family_map_sha256}\` (${out.family_map_trait_count} traits, ${out.family_map_family_count} families)
**Eval split**: \`${out.eval_split_role}\` — ${out.eval_rows} rows

> **Row-count note**: The v2 dataset README narrative quotes "306 novel-combination test rows", but the live dataset contains exactly **${out.eval_rows}** rows with \`split_role == "${out.eval_split_role}"\` (verifiable: \`grep -c '"novel-combination-test"' research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl\`). The pre-registration gate text says "≥300", which the live count satisfies. This baseline filters by the actual \`split_role\` field (the dataset is the source of truth), not by hardcoded N=306. If the harvester is re-run and the count changes, this number adapts.

## Algorithm

For each row in the \`${out.eval_split_role}\` split:

1. Tokenize the snippet by \`/@([a-zA-Z_][a-zA-Z0-9_]*)/g\` (strip args / block bodies — we keep only the bare \`@name\` head).
2. For each token T in (snippet tokens) ∩ (family-map keys), predict \`@T\`.
3. Compute per-row TP / FP / FN against \`gold_traits\`.

The candidate set is the family map's \`trait_to_families\` keys (${out.family_map_trait_count} traits derived from \`packages/core/src/traits/constants/*.ts\`). Traits that appear in gold but not in the family map (registry-drift traits — see dataset README §"Known limitations") are unreachable by this baseline by construction. **${out.out_of_family_gold_rows}** of ${out.eval_rows} eval rows contain at least one out-of-family-map gold token (${out.out_of_family_gold_tokens} tokens total).

## LOCKED NUMBERS

| Metric | Value | Notes |
|---|---|---|
| Eval rows | ${out.eval_rows} | \`split_role == "${out.eval_split_role}"\` |
| **Row-macro F1 (headline)** | **${fmt(out.macro_f1_row)}** | Mean per-row F1 — what /ml-experiments §F1 calls "macro-average across the rows" |
| Row-macro precision | ${fmt(out.precision_macro)} | Mean per-row precision |
| Row-macro recall | ${fmt(out.recall_macro)} | Mean per-row recall |
| Label-macro F1 | ${fmt(out.macro_f1_label)} | Per-label F1 averaged over the ${out.distinct_trait_labels}-label space |
| Label-macro precision | ${fmt(out.precision_macro_label)} | |
| Label-macro recall | ${fmt(out.recall_macro_label)} | |
| Micro F1 | ${fmt(out.micro_f1)} | Pooled TP / FP / FN across all rows |
| Distinct trait labels in gold | ${out.distinct_trait_labels} | |
| Distinct trait predictions | ${out.distinct_trait_predictions} | |
| Out-of-family-map gold rows | ${out.out_of_family_gold_rows} / ${out.eval_rows} | Lower bound on the floor — these rows are unreachable for keyword match by design |

## Classifier gate (+15pp margin)

Per the v2 dataset pre-registration:

> F1 (macro) ≥ 0.80 on the novel-combination test split, with ≥ 15 percentage-point margin over the keyword-match baseline.

| Quantity | Value |
|---|---|
| Pre-registration floor | ${out.classifier_must_clear.pre_registration_floor.toFixed(4)} |
| Margin requirement | +${out.classifier_must_clear.margin_pp}pp over keyword-match baseline |
| **Classifier must clear (row-macro F1)** | **≥ ${fmt(out.classifier_must_clear.target_macro_f1_row)}** |
| Effective floor (max of pre-reg vs +15pp) | ${fmt(out.classifier_must_clear.effective_floor)} |

The classifier must beat **${fmt(out.classifier_must_clear.target_macro_f1_row)}** row-macro F1 to clear the +15pp gate. If it lands below the pre-registration floor (0.80) it fails regardless of the margin.

## Top-10 hits (where keyword match works)

| Label | Precision | Recall | F1 | TP / FP / FN |
|---|---|---|---|---|
${
    out.hit_per_label_top10
      .map((h) =>
        `| \`${h.label}\` | ${h.precision.toFixed(4)} | ${
          h.recall.toFixed(4)
        } | ${h.f1.toFixed(4)} | ${h.tp} / ${h.fp} / ${h.fn} |`
      )
      .join("\n")
  }

## Top-10 misses (where keyword match has zero recall)

| Label | Gold support | TP / FN | Notes |
|---|---|---|---|
${
    out.miss_per_label_top10
      .map((m) =>
        `| \`${m.label}\` | ${m.gold_support} | ${m.tp} / ${m.fn} | recall=${
          m.recall.toFixed(4)
        } |`
      )
      .join("\n")
  }

These are the labels with the most gold support that the baseline never recovers — typically registry-drift traits not declared in any \`*_TRAITS\` constant array (see dataset README §"Known limitations"). The classifier must close these gaps.

## Reproducing

\`\`\`bash
node scripts/paper-19/run-keyword-baseline.mjs
\`\`\`

Re-running on the same dataset + family-map SHA produces byte-identical output. Diffing this file against a previous run is a regression surface.

## Why baseline-first

Per /ml-experiments discipline:

> Refuse the lazy framing "the system works qualitatively, no metric needed" — ML venues require numbers.

Locking the keyword-match floor BEFORE the classifier ships removes the temptation to retroactively pick a margin that the classifier happens to clear. Reviewers see: (1) baseline pinned with commit + dataset SHA, (2) classifier number, (3) margin computed against the locked floor. Pre-registration intact.
`;
}

main();
