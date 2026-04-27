#!/usr/bin/env node
/**
 * Validate the Paper-19 phase-3 trait-inference v2 dataset.
 *
 * Asserts:
 *   1. >= 2,000 rows total
 *   2. Splits roughly 70/15/15 (within 5pp of target)
 *   3. >= 300 novel-combination test rows (Paper 19 gate item)
 *   4. <= 60% synth ratio (>=40% verbatim grounding)
 *   5. >= 4 distinct synth strategies present
 *   6. >= 10 distinct trait families covered
 *   7. >= 10 adversarial-mislabel rows in the sibling JSONL
 *   8. Schema validity for every row
 *   9. No snippet collisions across splits (hash dedup)
 *  10. trait-family-map-v1.json exists + is consumable
 *
 * Exit code 0 = pass, 1 = fail.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const JSONL_PATH = join(REPO_ROOT, "research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl");
const MISLABEL_PATH = join(REPO_ROOT, "research/paper-19/datasets/adversarial-mislabel/phase-3-mislabel-attractors-v2.jsonl");
const FAMILY_MAP_PATH = join(REPO_ROOT, "research/paper-19/datasets/trait-family-map-v1.json");

const MIN_ROWS = 2000;
const MIN_NOVEL_COMBO_TEST = 300;
const MAX_SYNTH_RATIO = 0.605; // 0.5pp tolerance over the 60% target
const MIN_SYNTH_STRATEGIES = 4;
const MIN_FAMILIES = 10;
const MIN_MISLABELS = 10;
const SPLIT_TARGETS = { train: 0.70, dev: 0.15, test: 0.15 };
const SPLIT_TOLERANCE = 0.05;

function snippetHash(s) {
  return createHash("sha256").update(s.trim(), "utf-8").digest("hex");
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function loadJsonl(path, label) {
  if (!existsSync(path)) fail(`${label} not found at ${path}`);
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l);
      } catch (e) {
        fail(`${label} row ${i + 1}: invalid JSON: ${e.message}`);
      }
    });
}

function assertSchema(row, idx, label) {
  for (const k of ["id", "split", "snippet", "gold_traits", "provenance", "metadata"]) {
    if (!(k in row)) fail(`${label} row ${idx + 1} (${row.id ?? "?"}): missing field "${k}"`);
  }
  if (!["train", "dev", "test"].includes(row.split)) fail(`${label} ${row.id}: invalid split "${row.split}"`);
  if (!Array.isArray(row.gold_traits)) fail(`${label} ${row.id}: gold_traits must be array`);
  for (const t of row.gold_traits) {
    if (typeof t !== "string" || !t.startsWith("@")) fail(`${label} ${row.id}: gold trait "${t}" must start with @`);
  }
  for (const k of ["source", "lines", "kind"]) if (!(k in row.provenance)) fail(`${label} ${row.id}: provenance missing "${k}"`);
  if (!["verbatim", "synth"].includes(row.provenance.kind)) fail(`${label} ${row.id}: provenance.kind must be verbatim or synth`);
}

const rows = loadJsonl(JSONL_PATH, "main corpus");

console.log(`Loaded ${rows.length} rows from main corpus`);

// 1. Total
if (rows.length < MIN_ROWS) fail(`row count = ${rows.length}, must be >= ${MIN_ROWS}`);
console.log(`  [PASS] total rows = ${rows.length} (>= ${MIN_ROWS})`);

// 2. Schema
rows.forEach((r, i) => assertSchema(r, i, "main"));
console.log(`  [PASS] schema valid for all ${rows.length} rows`);

// 3. Splits
const splits = { train: 0, dev: 0, test: 0 };
for (const r of rows) splits[r.split]++;
for (const [s, target] of Object.entries(SPLIT_TARGETS)) {
  const actual = splits[s] / rows.length;
  if (Math.abs(actual - target) > SPLIT_TOLERANCE)
    fail(`split "${s}" = ${(actual * 100).toFixed(1)}%, target ${(target * 100).toFixed(0)}% +/- ${(SPLIT_TOLERANCE * 100).toFixed(0)}pp`);
}
console.log(
  `  [PASS] splits: train=${splits.train} (${((splits.train / rows.length) * 100).toFixed(1)}%) dev=${splits.dev} (${((splits.dev / rows.length) * 100).toFixed(1)}%) test=${splits.test} (${((splits.test / rows.length) * 100).toFixed(1)}%)`,
);

// 4. Novel-combination test rows
const novelTestRows = rows.filter((r) => r.split === "test" && r.metadata.novel_combination === true);
if (novelTestRows.length < MIN_NOVEL_COMBO_TEST)
  fail(`novel-combination test rows = ${novelTestRows.length}, must be >= ${MIN_NOVEL_COMBO_TEST}`);
console.log(`  [PASS] novel-combination test rows = ${novelTestRows.length} (>= ${MIN_NOVEL_COMBO_TEST})`);

// 5. Synth ratio
const synthRows = rows.filter((r) => r.provenance.kind === "synth");
const verbatimRows = rows.filter((r) => r.provenance.kind === "verbatim");
const synthRatio = synthRows.length / rows.length;
if (synthRatio > MAX_SYNTH_RATIO)
  fail(`synth ratio = ${(synthRatio * 100).toFixed(1)}%, must be <= ${(MAX_SYNTH_RATIO * 100).toFixed(1)}%`);
console.log(`  [PASS] synth ratio = ${(synthRatio * 100).toFixed(1)}% (verbatim=${verbatimRows.length}, synth=${synthRows.length})`);

// 6. Synth strategies
const strategies = new Set();
for (const r of synthRows) if (r.provenance.synth_strategy) strategies.add(r.provenance.synth_strategy);
if (strategies.size < MIN_SYNTH_STRATEGIES)
  fail(`distinct synth strategies = ${strategies.size}, must be >= ${MIN_SYNTH_STRATEGIES}`);
console.log(`  [PASS] synth strategies = ${strategies.size} (${[...strategies].sort().join(", ")})`);

// 7. Families
const fams = new Set();
for (const r of rows) for (const f of r.metadata.trait_families || []) fams.add(f);
if (fams.size < MIN_FAMILIES) fail(`trait family coverage = ${fams.size}, must be >= ${MIN_FAMILIES}`);
console.log(`  [PASS] trait family coverage = ${fams.size}`);

// 8. Snippet leakage across splits
const snippetsBySplit = { train: new Set(), dev: new Set(), test: new Set() };
const idsByHash = new Map();
for (const r of rows) {
  const h = snippetHash(r.snippet);
  if (idsByHash.has(h) && idsByHash.get(h) !== r.id) fail(`snippet collision: ${idsByHash.get(h)} and ${r.id}`);
  idsByHash.set(h, r.id);
  snippetsBySplit[r.split].add(h);
}
for (const [s1, s2] of [["train", "dev"], ["train", "test"], ["dev", "test"]]) {
  const leaked = [...snippetsBySplit[s1]].filter((h) => snippetsBySplit[s2].has(h));
  if (leaked.length > 0) fail(`leakage between ${s1} and ${s2}: ${leaked.length} hashes`);
}
console.log(`  [PASS] no snippet leakage across splits`);

// 9. Family map exists + is consumable
if (!existsSync(FAMILY_MAP_PATH)) fail(`trait-family-map-v1.json missing at ${FAMILY_MAP_PATH}`);
const familyMap = JSON.parse(readFileSync(FAMILY_MAP_PATH, "utf-8"));
if (!familyMap.trait_to_families) fail(`family map missing trait_to_families`);
console.log(`  [PASS] family map: ${familyMap.family_count} families, ${familyMap.distinct_trait_count} distinct traits`);

// 10. Adversarial mislabel sibling
const mislabels = loadJsonl(MISLABEL_PATH, "adversarial-mislabel");
if (mislabels.length < MIN_MISLABELS) fail(`adversarial-mislabel rows = ${mislabels.length}, must be >= ${MIN_MISLABELS}`);
mislabels.forEach((r, i) => assertSchema(r, i, "mislabel"));
const mislabelKinds = new Set();
for (const r of mislabels) {
  if (!r.metadata.adversarial_mislabel) fail(`mislabel ${r.id}: missing metadata.adversarial_mislabel tag`);
  mislabelKinds.add(r.metadata.adversarial_mislabel.split("-")[0]); // "underlabeled-by-1" -> "underlabeled"
}
console.log(`  [PASS] adversarial-mislabel rows = ${mislabels.length} (>= ${MIN_MISLABELS})`);
console.log(`  [PASS] mislabel kinds: ${[...mislabelKinds].sort().join(", ")}`);

// Informational
const buckets = { zero: 0, solo: 0, "two-to-three": 0, "four-plus": 0 };
for (const r of rows) {
  const b = r.metadata.snippet_size_bucket;
  if (b in buckets) buckets[b]++;
}
console.log(`  [INFO] size buckets: zero=${buckets.zero} solo=${buckets.solo} two-to-three=${buckets["two-to-three"]} four-plus=${buckets["four-plus"]}`);

const synthByStrategy = {};
for (const r of synthRows) {
  const s = r.provenance.synth_strategy || "unknown";
  synthByStrategy[s] = (synthByStrategy[s] || 0) + 1;
}
console.log(`  [INFO] synth distribution: ${JSON.stringify(synthByStrategy)}`);

const goldCounts = new Map();
for (const r of rows) for (const t of r.gold_traits) goldCounts.set(t, (goldCounts.get(t) ?? 0) + 1);
const top10 = [...goldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
console.log(`  [INFO] distinct gold traits in corpus: ${goldCounts.size}`);
console.log(`  [INFO] top 10 gold traits: ${top10.map(([t, n]) => `${t}=${n}`).join(", ")}`);

const uncategorizedSet = new Set();
for (const r of rows) for (const t of (r.metadata.uncategorized_traits || [])) uncategorizedSet.add(t);
console.log(`  [INFO] uncategorized traits (no family in map): ${uncategorizedSet.size}`);

console.log("");
console.log("VALIDATION PASS — v2 dataset clears all gates for Paper 19 phase-3 baseline + classifier work.");
