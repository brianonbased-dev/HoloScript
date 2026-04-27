#!/usr/bin/env node
/**
 * Validate the Paper-19 phase-3 trait-inference 50-row dataset.
 *
 * Asserts:
 *   1. Exactly 50 rows total
 *   2. Split sizes match declared 35/8/7 (train/dev/test)
 *   3. No snippet collision across splits (no train/dev/test leakage)
 *   4. ≥10 distinct trait families covered
 *   5. Every provenance.source path with kind="verbatim" resolves on disk
 *   6. Every row has the required schema (id, split, snippet, gold_traits, provenance, metadata)
 *   7. Negative-control rows (gold_traits=[]) are present and counted
 *
 * Exit code 0 = pass, 1 = fail. Pastes a structured report on stdout.
 */

import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..");
const JSONL_PATH = join(
  REPO_ROOT,
  "research",
  "paper-19",
  "datasets",
  "phase-3-trait-inference-50row-v1.jsonl",
);

const REQUIRED_SPLIT_SIZES = { train: 35, dev: 8, test: 7 };
const FAMILIES_FLOOR = 10;
const TOTAL_ROWS = 50;

function snippetHash(s) {
  return createHash("sha256").update(s.trim(), "utf-8").digest("hex").slice(0, 12);
}

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exit(1);
}

function loadRows() {
  if (!existsSync(JSONL_PATH)) fail(`JSONL not found at ${JSONL_PATH}`);
  const lines = readFileSync(JSONL_PATH, "utf-8").split("\n").filter((l) => l.trim().length > 0);
  return lines.map((line, idx) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      fail(`row ${idx + 1}: invalid JSON: ${e.message}`);
    }
  });
}

function assertSchema(row, idx) {
  for (const key of ["id", "split", "snippet", "gold_traits", "provenance", "metadata"]) {
    if (!(key in row)) fail(`row ${idx + 1} (${row.id ?? "?"}): missing field "${key}"`);
  }
  if (!["train", "dev", "test"].includes(row.split))
    fail(`row ${row.id}: invalid split "${row.split}"`);
  if (!Array.isArray(row.gold_traits)) fail(`row ${row.id}: gold_traits must be array`);
  for (const t of row.gold_traits) {
    if (typeof t !== "string" || !t.startsWith("@"))
      fail(`row ${row.id}: gold trait "${t}" must be a string starting with @`);
  }
  for (const k of ["source", "lines", "kind"]) {
    if (!(k in row.provenance)) fail(`row ${row.id}: provenance missing "${k}"`);
  }
  if (!["verbatim", "synth"].includes(row.provenance.kind))
    fail(`row ${row.id}: provenance.kind must be verbatim or synth`);
  if (!Array.isArray(row.metadata.trait_families))
    fail(`row ${row.id}: metadata.trait_families must be array`);
}

const rows = loadRows();

console.log(`Loaded ${rows.length} rows from ${JSONL_PATH.replace(REPO_ROOT, ".")}`);

// 1. Total count
if (rows.length !== TOTAL_ROWS) fail(`expected ${TOTAL_ROWS} rows, got ${rows.length}`);
console.log(`  [PASS] total rows = ${rows.length}`);

// 2. Schema
rows.forEach((r, i) => assertSchema(r, i));
console.log(`  [PASS] schema valid for all ${rows.length} rows`);

// 3. Split sizes
const splitCounts = { train: 0, dev: 0, test: 0 };
for (const r of rows) splitCounts[r.split]++;
for (const [s, expected] of Object.entries(REQUIRED_SPLIT_SIZES)) {
  if (splitCounts[s] !== expected)
    fail(`split "${s}" size = ${splitCounts[s]}, expected ${expected}`);
}
console.log(
  `  [PASS] split sizes: train=${splitCounts.train} dev=${splitCounts.dev} test=${splitCounts.test}`,
);

// 4. Snippet leakage across splits
const snippetsBySplit = { train: new Set(), dev: new Set(), test: new Set() };
const idsByHash = new Map();
for (const r of rows) {
  const h = snippetHash(r.snippet);
  if (idsByHash.has(h) && idsByHash.get(h) !== r.id) {
    fail(`snippet collision: ${idsByHash.get(h)} and ${r.id} share hash ${h}`);
  }
  idsByHash.set(h, r.id);
  snippetsBySplit[r.split].add(h);
}
for (const [s1, s2] of [
  ["train", "dev"],
  ["train", "test"],
  ["dev", "test"],
]) {
  const leaked = [...snippetsBySplit[s1]].filter((h) => snippetsBySplit[s2].has(h));
  if (leaked.length > 0) fail(`leakage between ${s1} and ${s2}: ${leaked.length} hashes`);
}
console.log(`  [PASS] no snippet leakage across splits`);

// 5. Family coverage
const families = new Set();
for (const r of rows) for (const f of r.metadata.trait_families) families.add(f);
if (families.size < FAMILIES_FLOOR)
  fail(`family coverage = ${families.size}, must be >= ${FAMILIES_FLOOR}`);
console.log(`  [PASS] trait family coverage = ${families.size} (>= ${FAMILIES_FLOOR})`);
console.log(`         families: ${[...families].sort().join(", ")}`);

// 6. Verbatim provenance source paths resolve
const verbatim = rows.filter((r) => r.provenance.kind === "verbatim");
const missing = [];
for (const r of verbatim) {
  const p = join(REPO_ROOT, r.provenance.source);
  if (!existsSync(p)) missing.push({ id: r.id, source: r.provenance.source });
}
if (missing.length > 0) {
  console.error(`FAIL: ${missing.length} verbatim provenance sources not found on disk:`);
  for (const m of missing) console.error(`    ${m.id}: ${m.source}`);
  process.exit(1);
}
console.log(`  [PASS] all ${verbatim.length} verbatim provenance sources resolve on disk`);

// 7. Negative controls
const negatives = rows.filter((r) => r.metadata.negative_control === true);
if (negatives.length < 3 || negatives.length > 5) {
  fail(`negative controls = ${negatives.length}, expected 3-5`);
}
for (const n of negatives) {
  if (n.gold_traits.length !== 0)
    fail(`negative control ${n.id} must have empty gold_traits, got ${JSON.stringify(n.gold_traits)}`);
}
console.log(`  [PASS] ${negatives.length} negative-control rows (3-5 expected) all have empty gold_traits`);

// 8. Snippet bucket distribution (informational, not gating)
const buckets = { solo: 0, "two-to-three": 0, "four-plus": 0 };
for (const r of rows) {
  const b = r.metadata.snippet_size_bucket;
  if (b in buckets) buckets[b]++;
}
console.log(
  `  [INFO] size buckets: solo=${buckets.solo} two-to-three=${buckets["two-to-three"]} four-plus=${buckets["four-plus"]}`,
);

// 9. Provenance kind tally (informational)
const verbatimCount = rows.filter((r) => r.provenance.kind === "verbatim").length;
const synthCount = rows.filter((r) => r.provenance.kind === "synth").length;
console.log(`  [INFO] provenance: verbatim=${verbatimCount} synth=${synthCount}`);

// 10. Gold-trait distribution (informational — for class-imbalance awareness)
const goldCounts = new Map();
for (const r of rows) for (const t of r.gold_traits) goldCounts.set(t, (goldCounts.get(t) ?? 0) + 1);
const top5 = [...goldCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
console.log(`  [INFO] top 5 gold traits: ${top5.map(([t, n]) => `${t}=${n}`).join(", ")}`);
console.log(`  [INFO] distinct gold traits: ${goldCounts.size}`);

console.log("");
console.log("VALIDATION PASS — dataset ready for Paper 19 phase-3 baseline + classifier work.");
