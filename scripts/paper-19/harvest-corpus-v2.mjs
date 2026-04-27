#!/usr/bin/env node
/**
 * harvest-corpus-v2 — programmatic harvester for the Paper-19 v2 trait
 * inference corpus. Reads .holo and .hsplus files, parses each top-level
 * `object "<id>" {…}` and `template "<name>" {…}` block via a structural
 * balanced-brace walker (NOT regex), extracts the trait set, and emits
 * JSONL rows with deterministic split assignment.
 *
 * Inputs:
 *   - benchmarks/scenarios/**\/*.{holo,hsplus}
 *   - benchmarks/cross-compilation/**\/*.{holo,hsplus}
 *   - packages/*\/test/**\/*.{holo,hsplus} (if present)
 *   - test/**\/*.{holo,hsplus} (top-level test fixtures)
 *
 * Output: research/paper-19/datasets/phase-3-trait-inference-2000row-v2.jsonl
 *
 * Process:
 *   1. Glob source files.
 *   2. For each file, parse blocks (depth-aware, string-aware).
 *   3. Per block, extract trait list (consecutive @trait lines after `{`).
 *   4. Emit a verbatim row.
 *   5. Apply synth strategies to each verbatim row with K>=2 traits.
 *   6. SHA-256 dedup across the entire pool.
 *   7. Hash mod 100 → split (0..69 train / 70..84 dev / 85..99 test).
 *   8. Look up trait families from trait-family-map-v1.json.
 *   9. Identify novel-combination test rows (combinations not present in train).
 *  10. Write JSONL.
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import {
  traitPermutation,
  traitRemoval,
  propertyStripping,
  crossDomainTransfer,
} from "./synth-strategies-v2.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const FAMILY_MAP_PATH = join(REPO_ROOT, "research", "paper-19", "datasets", "trait-family-map-v1.json");
const OUT_PATH = join(REPO_ROOT, "research", "paper-19", "datasets", "phase-3-trait-inference-2000row-v2.jsonl");

const SOURCE_GLOBS = [
  "benchmarks/scenarios",
  "benchmarks/cross-compilation",
  "examples",
  "bio-demo",
  "test",
];

const SYNTH_CAP_RATIO = 0.6; // <= 60% synth

function listFilesRec(dir, exts) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      // Skip node_modules + dist + .git
      if (name === "node_modules" || name === "dist" || name === ".git") continue;
      out.push(...listFilesRec(p, exts));
    } else if (st.isFile()) {
      if (exts.some((e) => name.endsWith(e))) out.push(p);
    }
  }
  return out;
}

function gatherSources() {
  const exts = [".holo", ".hsplus"];
  const files = [];
  for (const sub of SOURCE_GLOBS) {
    const dir = join(REPO_ROOT, sub);
    if (existsSync(dir)) files.push(...listFilesRec(dir, exts));
  }
  // Also: packages/*/test/ if any test fixtures live there
  const pkgs = join(REPO_ROOT, "packages");
  if (existsSync(pkgs)) {
    for (const pkg of readdirSync(pkgs)) {
      const testDir = join(pkgs, pkg, "test");
      if (existsSync(testDir)) files.push(...listFilesRec(testDir, exts));
      const fixturesDir = join(pkgs, pkg, "fixtures");
      if (existsSync(fixturesDir)) files.push(...listFilesRec(fixturesDir, exts));
    }
  }
  return [...new Set(files)].sort();
}

/**
 * Balanced-brace block parser.
 *
 * Walks the source character-by-character, tracking string state and
 * brace depth. Whenever it encounters a top-level `object "<id>" {` or
 * `template "<name>" {`, captures the entire block (header through the
 * matched closing `}`) including any nested children.
 *
 * Returns array of { kind, name, snippet, startLine, endLine }.
 */
function parseBlocks(src) {
  const blocks = [];
  let i = 0;
  const N = src.length;

  function lineNumberAt(idx) {
    let n = 1;
    for (let k = 0; k < idx; k++) if (src[k] === "\n") n++;
    return n;
  }

  while (i < N) {
    // Skip whitespace and line comments.
    while (i < N && /\s/.test(src[i])) i++;
    if (i >= N) break;
    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < N && src[i] !== "\n") i++;
      continue;
    }
    if (src[i] === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < N && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    // Look for `object "..."` or `template "..."` keyword head at this position.
    const head = src.slice(i, i + 12);
    let kind = null;
    let kindLen = 0;
    if (/^object[\s\(]/.test(head) || /^object\s/.test(head)) {
      kind = "object";
      kindLen = "object".length;
    } else if (/^template[\s\(]/.test(head) || /^template\s/.test(head)) {
      kind = "template";
      kindLen = "template".length;
    }

    if (!kind) {
      i++;
      continue;
    }

    // Parse: `object "<name>" ... {`. Capture name + skip to opening brace.
    const blockStart = i;
    let p = i + kindLen;
    while (p < N && /\s/.test(src[p])) p++;
    if (src[p] !== '"') {
      i++;
      continue;
    }
    const nameStart = p + 1;
    p++;
    while (p < N && src[p] !== '"') {
      if (src[p] === "\\") p++;
      p++;
    }
    const name = src.slice(nameStart, p);
    p++; // past closing quote
    // Now scan for the opening brace, handling possible inheritance like `using "Base"`.
    while (p < N && src[p] !== "{") p++;
    if (p >= N) {
      i = blockStart + 1;
      continue;
    }
    // Found `{`. Now walk braces with string awareness.
    let depth = 1;
    let q = p + 1;
    while (q < N && depth > 0) {
      const ch = src[q];
      if (ch === "/" && src[q + 1] === "/") {
        while (q < N && src[q] !== "\n") q++;
        continue;
      }
      if (ch === "/" && src[q + 1] === "*") {
        q += 2;
        while (q < N && !(src[q] === "*" && src[q + 1] === "/")) q++;
        q += 2;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        const quote = ch;
        q++;
        while (q < N && src[q] !== quote) {
          if (src[q] === "\\") q++;
          q++;
        }
        q++;
        continue;
      }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      q++;
    }
    if (depth !== 0) {
      // Unbalanced — bail.
      i = blockStart + 1;
      continue;
    }
    const blockEnd = q;
    const snippet = src.slice(blockStart, blockEnd).trim();
    blocks.push({
      kind,
      name,
      snippet,
      startLine: lineNumberAt(blockStart),
      endLine: lineNumberAt(blockEnd),
    });
    i = blockEnd;
  }

  return blocks;
}

/** Extract `@trait` tokens from the consecutive trait-only lines after `{`. */
function extractTraitTokens(snippet) {
  const lines = snippet.split("\n");
  // Find header line ending with `{`
  let headerIdx = lines.findIndex((l) => /(?:object|template)\s+"[^"]+"[^{]*\{/.test(l));
  if (headerIdx === -1) return { traits: [], traitArgs: [] };
  let i = headerIdx + 1;
  const traits = [];
  const traitArgs = [];
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (trimmed === "" || trimmed.startsWith("//")) {
      i++;
      continue;
    }
    if (!trimmed.startsWith("@")) break;
    // strip args: @physics(mass: 1.0) -> @physics
    const m = /^(@[A-Za-z_][A-Za-z0-9_]*)/.exec(trimmed);
    if (m) {
      traits.push(m[1]);
      traitArgs.push(trimmed);
    }
    i++;
  }
  return { traits, traitArgs };
}

function snippetHash(s) {
  return createHash("sha256").update(s.trim(), "utf-8").digest("hex");
}

function splitFromHash(s) {
  const h = snippetHash(s);
  const slot = parseInt(h.slice(0, 8), 16) % 100;
  if (slot < 70) return "train";
  if (slot < 85) return "dev";
  return "test";
}

const NOVEL_COMBO_TEST_TARGET = 300;

/**
 * Combination-aware split assignment.
 *
 * Some trait combinations are deliberately held OUT of train so they
 * appear ONLY in test as novel combinations. This is required by the
 * Paper 19 gate (≥300 novel-combination test rows). Without this, a
 * pure hash-based split rarely produces novel combinations because
 * popular trait sets repeat across many examples.
 *
 * Strategy:
 *   1. Group rows by sorted-trait-combination key (the gold_traits set).
 *   2. Select combinations to hold out: deterministic ordering by
 *      combo-key hash, accumulating row counts until the held-out pool
 *      reaches NOVEL_COMBO_TEST_TARGET. Skip empty-trait combinations
 *      (they cannot be "novel combinations" of traits).
 *   3. All rows of held-out combinations → test, tagged novel.
 *   4. Remaining rows → hash-based 70/15/15.
 *
 * Returns: { row -> { split, splitRole } }
 */
function assignSplits(rows) {
  // Group by combo key.
  const byCombo = new Map();
  for (const r of rows) {
    const key = r.gold_traits.slice().sort().join("|");
    if (!byCombo.has(key)) byCombo.set(key, []);
    byCombo.get(key).push(r);
  }

  // Select held-out combinations (deterministic by combo-hash).
  const heldOut = new Set();
  let heldOutRowCount = 0;
  const orderedCombos = [...byCombo.entries()]
    .filter(([key]) => key !== "") // never hold out empty-trait combinations
    .sort((a, b) => {
      // Sort by row count ascending (singletons first), then by hash for stability.
      if (a[1].length !== b[1].length) return a[1].length - b[1].length;
      return createHash("sha256").update(a[0]).digest("hex").localeCompare(createHash("sha256").update(b[0]).digest("hex"));
    });
  for (const [key, group] of orderedCombos) {
    if (heldOutRowCount >= NOVEL_COMBO_TEST_TARGET) break;
    heldOut.add(key);
    heldOutRowCount += group.length;
  }

  // Apply assignments.
  const out = new Map();
  for (const r of rows) {
    const key = r.gold_traits.slice().sort().join("|");
    if (heldOut.has(key)) {
      out.set(r, { split: "test", splitRole: "novel-combination-test" });
    } else {
      const s = splitFromHash(r.snippet);
      const role = s === "test" ? "in-distribution-test" : s;
      out.set(r, { split: s, splitRole: role });
    }
  }
  return { assignments: out, heldOutCombos: heldOut.size, heldOutRows: heldOutRowCount };
}

function loadFamilyMap() {
  const raw = readFileSync(FAMILY_MAP_PATH, "utf-8");
  return JSON.parse(raw);
}

function familiesForTraits(goldTraits, familyMap) {
  const fams = new Set();
  const uncategorized = [];
  for (const t of goldTraits) {
    const bare = t.startsWith("@") ? t.slice(1) : t;
    const flist = familyMap.trait_to_families[bare];
    if (flist && flist.length > 0) {
      for (const f of flist) fams.add(f);
    } else {
      uncategorized.push(bare);
    }
  }
  return { families: [...fams].sort(), uncategorized };
}

function bucketize(traitCount) {
  if (traitCount === 0) return "zero";
  if (traitCount === 1) return "solo";
  if (traitCount <= 3) return "two-to-three";
  return "four-plus";
}

function main() {
  const familyMap = loadFamilyMap();
  console.log(`Loaded family map: ${familyMap.family_count} families, ${familyMap.distinct_trait_count} distinct traits`);

  const sourceFiles = gatherSources();
  console.log(`Source files: ${sourceFiles.length}`);

  // Phase 1: harvest verbatim rows.
  const verbatimRows = [];
  let totalBlocks = 0;
  let blocksWithTraits = 0;
  for (const fpath of sourceFiles) {
    let src;
    try {
      src = readFileSync(fpath, "utf-8");
    } catch {
      continue;
    }
    const rel = relative(REPO_ROOT, fpath).split("\\").join("/");
    const blocks = parseBlocks(src);
    totalBlocks += blocks.length;
    for (const b of blocks) {
      const { traits, traitArgs } = extractTraitTokens(b.snippet);
      if (traits.length > 0) blocksWithTraits++;
      const goldTraits = traits;
      const { families, uncategorized } = familiesForTraits(goldTraits, familyMap);
      verbatimRows.push({
        kind: b.kind,
        name: b.name,
        snippet: b.snippet,
        gold_traits: goldTraits,
        traitArgs,
        provenance: {
          source: rel,
          lines: `${b.startLine}-${b.endLine}`,
          kind: "verbatim",
        },
        metadata: {
          trait_families: families,
          uncategorized_traits: uncategorized,
          snippet_size_bucket: bucketize(goldTraits.length),
          block_kind: b.kind,
        },
      });
    }
  }
  console.log(`Verbatim blocks parsed: ${totalBlocks}`);
  console.log(`Verbatim blocks with >=1 trait: ${blocksWithTraits}`);

  // Phase 2: dedup verbatim by snippet hash.
  const seen = new Map();
  const verbatimUnique = [];
  for (const row of verbatimRows) {
    const h = snippetHash(row.snippet);
    if (seen.has(h)) continue;
    seen.set(h, row);
    verbatimUnique.push(row);
  }
  console.log(`Verbatim unique after SHA-256 dedup: ${verbatimUnique.length}`);

  // Phase 3: synth strategies on verbatim rows.
  const synthRows = [];
  for (let idx = 0; idx < verbatimUnique.length; idx++) {
    const r = verbatimUnique[idx];
    if (r.gold_traits.length === 0) continue; // no traits → skip synth
    synthRows.push(...traitPermutation(r));
    synthRows.push(...traitRemoval(r));
    synthRows.push(...propertyStripping(r));
    synthRows.push(...crossDomainTransfer(r, idx));
  }
  // Dedup synth against verbatim AND against each other.
  const synthUnique = [];
  for (const r of synthRows) {
    const h = snippetHash(r.snippet);
    if (seen.has(h)) continue;
    seen.set(h, r);
    synthUnique.push(r);
  }
  console.log(`Synth rows generated: ${synthRows.length} | unique: ${synthUnique.length}`);

  // Phase 4: cap synth so that synth/(verb+synth) <= SYNTH_CAP_RATIO.
  // Algebra: synth <= ratio * (verb + synth)  =>  synth <= ratio/(1-ratio) * verb
  // For ratio=0.6 this is exactly synth <= 1.5 * verb.
  const ratioMultiplier = SYNTH_CAP_RATIO / (1 - SYNTH_CAP_RATIO);
  const maxSynth = Math.floor(verbatimUnique.length * ratioMultiplier);
  let synthFinal = synthUnique;
  if (synthUnique.length > maxSynth) {
    // Trim deterministically by sorting by snippet hash.
    const annotated = synthUnique.map((r) => ({ row: r, h: snippetHash(r.snippet) }));
    annotated.sort((a, b) => a.h.localeCompare(b.h));
    synthFinal = annotated.slice(0, maxSynth).map((x) => x.row);
  }

  const allRows = [...verbatimUnique, ...synthFinal];
  console.log(`Total before split: ${allRows.length} (verbatim=${verbatimUnique.length}, synth=${synthFinal.length})`);

  // Phase 5: combination-aware split assignment.
  const splitInfo = assignSplits(allRows);
  console.log(`Held-out combinations for novel-combo test: ${splitInfo.heldOutCombos} (${splitInfo.heldOutRows} rows)`);

  const finalRows = allRows.map((r, i) => {
    const a = splitInfo.assignments.get(r);
    const pad = String(i + 1).padStart(5, "0");
    const id = r.id ? r.id : `row-${pad}`;
    const { traitArgs: _ta, ...rest } = r;
    return {
      id,
      split: a.split,
      ...rest,
      metadata: { ...rest.metadata, split_role: a.splitRole },
    };
  });

  // Phase 6: novel-combination flag verification (sanity-check for the test set).
  const trainCombos = new Set();
  for (const r of finalRows) {
    if (r.split === "train") trainCombos.add(r.gold_traits.slice().sort().join("|"));
  }
  let novelCount = 0;
  for (const r of finalRows) {
    const key = r.gold_traits.slice().sort().join("|");
    const isNovel = (r.split === "test" || r.split === "dev") && r.gold_traits.length > 0 && !trainCombos.has(key);
    r.metadata.novel_combination = isNovel;
    if (isNovel && r.split === "test") novelCount++;
  }

  // Phase 7: write JSONL.
  mkdirSync(dirname(OUT_PATH), { recursive: true });
  const lines = finalRows.map((r) => JSON.stringify(r)).join("\n") + "\n";
  writeFileSync(OUT_PATH, lines, "utf-8");

  // Stats
  const splits = { train: 0, dev: 0, test: 0 };
  for (const r of finalRows) splits[r.split]++;
  const verb = finalRows.filter((r) => r.provenance.kind === "verbatim").length;
  const synth = finalRows.filter((r) => r.provenance.kind === "synth").length;
  const synthByStrategy = {};
  for (const r of finalRows) {
    if (r.provenance.kind === "synth") {
      const s = r.provenance.synth_strategy || "unknown";
      synthByStrategy[s] = (synthByStrategy[s] || 0) + 1;
    }
  }
  const fams = new Set();
  for (const r of finalRows) for (const f of r.metadata.trait_families) fams.add(f);
  const uncategorized = new Set();
  for (const r of finalRows) for (const t of (r.metadata.uncategorized_traits || [])) uncategorized.add(t);

  console.log("");
  console.log(`OK: wrote ${finalRows.length} rows to ${OUT_PATH.replace(REPO_ROOT, ".")}`);
  console.log(`  splits: train=${splits.train} dev=${splits.dev} test=${splits.test}`);
  console.log(`  verbatim=${verb} synth=${synth} (synth ratio=${(synth / finalRows.length * 100).toFixed(1)}%)`);
  console.log(`  synth by strategy: ${JSON.stringify(synthByStrategy)}`);
  console.log(`  trait families covered: ${fams.size}`);
  console.log(`  novel-combination test rows: ${novelCount}`);
  if (uncategorized.size > 0) {
    console.log(`  uncategorized traits (no family in map): ${uncategorized.size} -> ${[...uncategorized].slice(0, 10).join(", ")}${uncategorized.size > 10 ? "..." : ""}`);
  }
}

main();
