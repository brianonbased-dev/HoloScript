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

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { dirname, basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const CONSTANTS_DIR = join(REPO_ROOT, "packages", "core", "src", "traits", "constants");
const PLUGINS_DIR = join(REPO_ROOT, "packages", "plugins");
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

/**
 * Extract the `traits: [...]` array from a `pluginMeta` (or any object
 * literal that names traits this way). Returns the string-literal
 * elements found inside the inner `[ ... ]` block.
 *
 *   export const pluginMeta = { name: '@x', traits: ['a', 'b'] };
 *   export const pluginMeta: PluginMeta = {
 *     ...,
 *     traits: ['a', 'b', 'c'],
 *   };
 *
 * Multiple `pluginMeta` declarations per file are handled (rare; only
 * relevant when a plugin re-exports multiple meta blocks).
 */
function extractPluginTraits(src) {
  const out = [];
  const headerRe = /pluginMeta\s*(?::\s*[^=]+)?=\s*\{/g;
  let m;
  while ((m = headerRe.exec(src)) !== null) {
    const start = m.index + m[0].length;
    let depth = 1;
    let i = start;
    while (i < src.length && depth > 0) {
      const ch = src[i];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      else if (ch === "'" || ch === '"' || ch === "`") {
        const quote = ch;
        i++;
        while (i < src.length && src[i] !== quote) {
          if (src[i] === "\\") i++;
          i++;
        }
      }
      i++;
    }
    const body = src.slice(start, i - 1);
    // Find traits: [...]
    const traitsRe = /\btraits\s*:\s*\[/g;
    let tm;
    while ((tm = traitsRe.exec(body)) !== null) {
      const arrStart = tm.index + tm[0].length;
      let arrDepth = 1;
      let j = arrStart;
      while (j < body.length && arrDepth > 0) {
        const ch = body[j];
        if (ch === "[") arrDepth++;
        else if (ch === "]") arrDepth--;
        else if (ch === "'" || ch === '"' || ch === "`") {
          const quote = ch;
          j++;
          while (j < body.length && body[j] !== quote) {
            if (body[j] === "\\") j++;
            j++;
          }
        }
        j++;
      }
      const arrBody = body.slice(arrStart, j - 1);
      const stringRe = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"/g;
      let s;
      while ((s = stringRe.exec(arrBody)) !== null) {
        const lit = s[1] !== undefined ? s[1] : s[2];
        out.push(lit);
      }
    }
  }
  return out;
}

function listPluginDirs() {
  if (!existsSync(PLUGINS_DIR)) return [];
  const out = [];
  for (const name of readdirSync(PLUGINS_DIR)) {
    const p = join(PLUGINS_DIR, name);
    try {
      if (statSync(p).isDirectory()) out.push({ name, path: p });
    } catch {
      // ignore
    }
  }
  return out;
}

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
      if (name === "node_modules" || name === "dist" || name === ".git" || name === "test" || name === "tests") continue;
      out.push(...listFilesRec(p, exts));
    } else if (st.isFile() && exts.some((e) => name.endsWith(e))) {
      out.push(p);
    }
  }
  return out;
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

  // ─── Plugin pass: walk packages/plugins/* and pull pluginMeta + array forms ───
  const pluginDirs = listPluginDirs();
  let pluginsScanned = 0;
  for (const { name, path: pluginPath } of pluginDirs) {
    const family = `plugin/${name}`;
    const traitsForPlugin = new Set();

    // (a) pluginMeta in src/index.ts (canonical)
    const indexPath = join(pluginPath, "src", "index.ts");
    if (existsSync(indexPath)) {
      try {
        const src = readFileSync(indexPath, "utf-8");
        for (const t of extractPluginTraits(src)) traitsForPlugin.add(t);
        // Also catch legacy *_TRAITS arrays inside the index.
        for (const t of extractTraitArrays(src)) traitsForPlugin.add(t);
      } catch (e) {
        unparseable.push({ file: indexPath, error: String(e) });
      }
    }

    // (b) src/constants/*.ts arrays (some plugins keep them separate, e.g. radio-astronomy)
    const pluginConstantsDir = join(pluginPath, "src", "constants");
    if (existsSync(pluginConstantsDir)) {
      for (const cf of readdirSync(pluginConstantsDir)) {
        if (!cf.endsWith(".ts") || cf.endsWith(".d.ts")) continue;
        try {
          const src = readFileSync(join(pluginConstantsDir, cf), "utf-8");
          for (const t of extractTraitArrays(src)) traitsForPlugin.add(t);
        } catch (e) {
          unparseable.push({ file: join(pluginConstantsDir, cf), error: String(e) });
        }
      }
    }

    // (c) src/**/*Trait.ts files — single-trait `name: '<bare>'` declarations
    const srcRoot = join(pluginPath, "src");
    if (existsSync(srcRoot)) {
      const traitFiles = listFilesRec(srcRoot, [".ts"]).filter((p) => /Trait\.ts$/i.test(p));
      const nameRe = /\bname\s*:\s*'([a-z_][a-z0-9_]*)'\s*,/g;
      for (const tf of traitFiles) {
        try {
          const src = readFileSync(tf, "utf-8");
          let m;
          while ((m = nameRe.exec(src)) !== null) {
            traitsForPlugin.add(m[1]);
          }
        } catch (e) {
          unparseable.push({ file: tf, error: String(e) });
        }
      }
    }

    if (traitsForPlugin.size === 0) continue;
    pluginsScanned++;
    familyToTraits.set(family, [...traitsForPlugin].sort());
    for (const t of traitsForPlugin) {
      if (!traitToFamilies.has(t)) traitToFamilies.set(t, new Set());
      traitToFamilies.get(t).add(family);
    }
  }
  console.log(`Plugins scanned: ${pluginsScanned} of ${pluginDirs.length}`);

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
