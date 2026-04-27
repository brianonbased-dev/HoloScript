#!/usr/bin/env node
/**
 * derive-trait-families — parse packages/core/src/traits/constants/*.ts,
 * extract every `export const <NAME>_TRAITS = [...] as const;` array,
 * and build a JSON map of trait name → family name (file basename).
 *
 * Output: research/paper-19/datasets/trait-family-map-v1.json
 *
 * Pattern handled (the only one used by the constants/ directory):
 *
 *     export const PHYSICS_EXPANSION_TRAITS = [
 *       'stretchable',
 *       'cloth',
 *       ...
 *     ] as const;
 *
 * Multiple `export const ..._TRAITS` blocks per file are supported (some
 * files split traits into a primary + an `*_EXTENDED` array). All blocks
 * in the same file roll up to the same family (the file basename).
 */

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONSTANTS_DIR = join(REPO_ROOT, "packages", "core", "src", "traits", "constants");
const OUT_PATH = join(REPO_ROOT, "research", "paper-19", "datasets", "trait-family-map-v1.json");

function gitHead() {
  try {
    return execSync("git rev-parse HEAD", { cwd: REPO_ROOT }).toString().trim();
  } catch {
    return "unknown";
  }
}

/**
 * Extract every string-literal element inside an
 * `export const <NAME>_TRAITS = [ ... ] as const;` block.
 * The body is parsed by walking brackets — string contents themselves
 * cannot contain unescaped `]`, so the bracket walk is robust.
 */
function extractTraitArrays(src) {
  const out = [];
  // Find each export-const-trait-array block boundary.
  const headerRe = /export\s+const\s+([A-Z_][A-Z0-9_]*)_TRAITS\s*(?::\s*[^=]+)?=\s*\[/g;
  let m;
  while ((m = headerRe.exec(src)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "[") depth++;
      else if (ch === "]") depth--;
      else if (ch === "'" || ch === '"' || ch === "`") {
        // Skip past string literal
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i++;
          i++;
        }
      }
      i++;
    }
    const body = src.slice(start, i - 1); // exclude closing bracket
    // Now extract each string literal from the body.
    const stringRe = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
    let s;
    while ((s = stringRe.exec(body)) !== null) {
      const lit = s[1] !== undefined ? s[1] : s[2];
      out.push(lit);
    }
  }
  return out;
}

function familyFromFile(file) {
  return basename(file, ".ts");
}

function main() {
  const files = readdirSync(CONSTANTS_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".d.ts"))
    .sort();

  const traitToFamilies = new Map(); // trait name -> set of families
  const familyToTraits = new Map(); // family -> array of traits
  const unparseable = [];

  for (const fname of files) {
    const fpath = join(CONSTANTS_DIR, fname);
    const family = familyFromFile(fname);
    let traits;
    try {
      const src = readFileSync(fpath, "utf-8");
      traits = extractTraitArrays(src);
    } catch (e) {
      unparseable.push({ file: fname, error: String(e) });
      continue;
    }
    if (traits.length === 0) continue; // skip files with no _TRAITS array (index.ts, etc.)
    familyToTraits.set(family, traits);
    for (const t of traits) {
      if (!traitToFamilies.has(t)) traitToFamilies.set(t, new Set());
      traitToFamilies.get(t).add(family);
    }
  }

  // Build the output map.
  const traitMap = {};
  for (const [trait, families] of traitToFamilies.entries()) {
    traitMap[trait] = [...families].sort();
  }

  const out = {
    version: "v1",
    generated_at: new Date().toISOString(),
    git_head: gitHead(),
    constants_dir: "packages/core/src/traits/constants",
    family_count: familyToTraits.size,
    distinct_trait_count: traitToFamilies.size,
    parsed_files: files.length,
    unparseable_files: unparseable,
    // trait -> family-list mapping (trait names are bare, no @ prefix)
    trait_to_families: traitMap,
    // family -> trait-list mapping (for cross-checking and ablation slicing)
    family_to_traits: Object.fromEntries(
      [...familyToTraits.entries()].sort().map(([k, v]) => [k, [...v].sort()]),
    ),
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf-8");

  console.log(`OK: wrote trait-family-map to ${OUT_PATH.replace(REPO_ROOT, ".")}`);
  console.log(`  parsed_files: ${files.length}`);
  console.log(`  family_count: ${familyToTraits.size}`);
  console.log(`  distinct_trait_count: ${traitToFamilies.size}`);
  if (unparseable.length > 0) {
    console.log(`  unparseable_files: ${unparseable.length}`);
    for (const u of unparseable) console.log(`    ${u.file}: ${u.error}`);
  }
  console.log(`  git_head: ${out.git_head}`);
}

main();
