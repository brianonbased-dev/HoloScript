/**
 * generate-plugin-manifests.mjs
 *
 * Generates `plugin.manifest.json` for every plugin in packages/plugins/.
 *
 * Data sources (in priority order):
 *   1. Existing `pluginMeta` export in src/index.ts (authoritative if present).
 *   2. `package.json` for id, version, description, peerDependencies.
 *   3. Source heuristics: grep for handler `name:` strings and
 *      `registerXxxTraitHandlers` exports to populate traits + autoRegister.
 *
 * Idempotent: re-run to refresh; existing manifests are overwritten.
 *
 * Usage:
 *   node scripts/generate-plugin-manifests.mjs [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = join(fileURLToPath(import.meta.url), '../../packages/plugins');

// ── Helpers ──────────────────────────────────────────────────────────────────

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function readSrc(path) {
  try { return readFileSync(path, 'utf8'); } catch { return ''; }
}

/** Derive plugin id from npm package name. */
function toId(pkgName) {
  // '@holoscript/plugin-government-civic' → 'government-civic'
  // '@holoscript/plugin-emergency-response' → 'emergency-response'
  return pkgName
    .replace(/^@holoscript\/plugin-?/, '')
    .replace(/^@[^/]+\//, '');
}

/** Extract trait names from source text heuristically. */
function extractTraitsFromSource(src, indexSrc) {
  const traits = new Set();
  const FALSE_POSITIVES = new Set([
    'string', 'number', 'boolean', 'object', 'id', 'type', 'null', 'name',
    'error', 'info', 'warn', 'debug', 'data', 'result', 'state', 'config',
    'message', 'value', 'key', 'label', 'status', 'mode', 'text', 'code',
    'title', 'path', 'url', 'tag', 'kind', 'role', 'scope', 'source',
  ]);

  // Pattern 1: pluginMeta.traits: [...] in index.ts
  const metaMatch = indexSrc.match(/pluginMeta\s*=\s*\{[\s\S]*?traits\s*:\s*\[([\s\S]*?)\]/);
  if (metaMatch) {
    for (const m of metaMatch[1].matchAll(/'([^']+)'|"([^"]+)"/g)) traits.add(m[1] || m[2]);
  }

  // Pattern 2: XXXX_TRAITS / PLUGIN_TRAITS / DOMAIN_TRAITS = [...] const arrays
  // Matches: export const AEROSPACE_TRAITS = ['orbital_trajectory', ...]
  const traitArrays = src.matchAll(/(?:export\s+)?const\s+\w*TRAITS?\w*\s*=\s*\[([\s\S]*?)\]\s*as\s+const/g);
  for (const arr of traitArrays) {
    for (const m of arr[1].matchAll(/'([a-z][a-z0-9_]+)'|"([a-z][a-z0-9_]+)"/g)) {
      traits.add(m[1] || m[2]);
    }
  }
  // Also without 'as const'
  const traitArrays2 = src.matchAll(/(?:export\s+)?const\s+\w*TRAITS?\w*\s*=\s*\[([\s\S]*?)\]/g);
  for (const arr of traitArrays2) {
    for (const m of arr[1].matchAll(/'([a-z][a-z0-9_]+)'|"([a-z][a-z0-9_]+)"/g)) {
      traits.add(m[1] || m[2]);
    }
  }

  // Pattern 3: handler objects { name: 'trait_name', ... }
  const nameMatches = src.matchAll(/\bname\s*:\s*['"]([a-z][a-z0-9_]*)['"](?!\s*:)/g);
  for (const m of nameMatches) {
    const n = m[1];
    if (!FALSE_POSITIVES.has(n)) traits.add(n);
  }

  // Pattern 4: @trait keyword in .hsplus brain/trait annotations in source comments
  const traitAnnotations = src.matchAll(/['"]@([a-z][a-z0-9_]+)['"]/g);
  for (const m of traitAnnotations) {
    if (!FALSE_POSITIVES.has(m[1])) traits.add(m[1]);
  }

  return [...traits].sort();
}

/** Check if a `registerXxxTraitHandlers` function is exported from runtime.ts. */
function hasRegisterExport(src) {
  return /export\s+(?:async\s+)?function\s+register\w+TraitHandlers/.test(src)
      || /export\s+const\s+register\w+TraitHandlers/.test(src);
}

// ── Main ─────────────────────────────────────────────────────────────────────

const dirs = readdirSync(ROOT, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => n !== 'domain-plugin-template'); // template is not a real plugin

let generated = 0;
let skipped = 0;

for (const dir of dirs) {
  const pluginDir = join(ROOT, dir);
  const pkgPath = join(pluginDir, 'package.json');
  const pkg = readJson(pkgPath);
  if (!pkg) { console.warn(`  SKIP ${dir}: no package.json`); skipped++; continue; }

  const manifestPath = join(pluginDir, 'plugin.manifest.json');

  // Source files
  const indexSrc = readSrc(join(pluginDir, 'src', 'index.ts'));
  const runtimePath = join(pluginDir, 'src', 'runtime.ts');
  const runtimeSrc = existsSync(runtimePath) ? readSrc(runtimePath) : '';
  const allSrc = indexSrc + '\n' + runtimeSrc;

  // ── Field extraction ────────────────────────────────────────────────────

  const id = toId(pkg.name || dir);
  const version = pkg.version ?? '1.0.0';
  const description = pkg.description ?? '';

  // Short display name: first sentence/clause of description (≤80 chars) or dir-name
  const rawName = description.split(/[—:]|\bfor\b|\bplugin\b/i)[0].trim().replace(/\s+/g, ' ');
  const name = (rawName.length >= 4 && rawName.length <= 80)
    ? rawName
    : dir.replace(/-plugin$/, '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  // Traits
  const traits = extractTraitsFromSource(allSrc, indexSrc);

  // autoRegister: true when a runtime.ts exists AND exports a register* function
  const autoRegister = existsSync(runtimePath) && hasRegisterExport(runtimeSrc);

  // coreVersion from peerDependencies
  const coreVersion = pkg.peerDependencies?.['@holoscript/core'] ?? '>=8.0.0';

  // runtimeEntry
  const runtimeEntry = existsSync(runtimePath) ? './src/runtime.ts' : undefined;

  // ── Build manifest ──────────────────────────────────────────────────────

  const manifest = {
    id,
    version,
    name,
    description,
    traits,
    autoRegister,
    coreVersion,
    ...(runtimeEntry ? { runtimeEntry } : {}),
  };

  const json = JSON.stringify(manifest, null, 2) + '\n';

  if (DRY_RUN) {
    console.log(`\n── ${dir} ──`);
    console.log(json);
  } else {
    writeFileSync(manifestPath, json, 'utf8');
    console.log(`  ✓ ${dir}/plugin.manifest.json (${traits.length} traits, autoRegister=${autoRegister})`);
  }
  generated++;
}

console.log(`\n${DRY_RUN ? '[DRY RUN] ' : ''}Generated ${generated} manifests, skipped ${skipped}.`);
