#!/usr/bin/env node
/**
 * check:generative-taste — "does this generate a UNIQUE instance per seed, or N clones?"
 *
 * Track B of the ultra-unique+interactive language plan (research/2026-07-03_ultra-unique-
 * interactive-language-plan.md) and the most direct answer to "ultra-unique": a frontier
 * model gives you THE average forest; a considered generator gives you THIS forest from THIS
 * seed and never the same twice. The gate mechanizes the line the compiler already draws.
 *
 * GROUNDED IN THE REAL COMPILE PATH (not invented): SceneIRCompiler.compileProceduralScatterNode
 * seeds a single mulberry32 PRNG (math/tropicalSpmv.ts) with a fixed 1337 fallback and NEVER
 * Math.random — so seeded generation is byte-deterministic AND per-instance varied. The
 * authorable constructs that reach it are the scatter{} / distribute{} / procedural{} /
 * pcg_graph{} blocks (domain 'procedural') and the world-generation traits (@biome_scatter,
 * @procedural_placement, @city_generator, @world_generator, @phyllotaxis, @world_seed, …).
 * NOTE: @generator / @scatter_generated / @constrain do NOT exist — they parse as inert no-op
 * traits and bind to nothing, so the gate deliberately does NOT credit them (building a real
 * @generator construct is a deferred parser task; see plan Track B gap 1).
 *
 * The assembled tell: an instance set (count / instance_count / density) with NO per-instance
 * variation range (random_scale / scale_range / random_rotation / randomize_rotation / …) →
 * N identical clones — the statistical-average "forest of 200 identical trees." A CONSIDERED
 * generator carries per-instance variation AND a declared seed (intentional reproducibility).
 * A single procedural surface (terrain/noise, no instance count) is not judged as clones.
 *
 * WARN→BLOCK ladder (matches the sibling gates): advisory with a committed baseline.
 *
 * Usage:
 *   node scripts/holo-ci/check-generative-taste.mjs                      # scan examples/
 *   node scripts/holo-ci/check-generative-taste.mjs --dir=<path> | <path>
 *   node scripts/holo-ci/check-generative-taste.mjs --json
 *   node scripts/holo-ci/check-generative-taste.mjs --check --baseline=<file> [--max-clone=N]
 *   node scripts/holo-ci/check-generative-taste.mjs --save-baseline [--baseline=<file>]
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DEFAULT_BASELINE_PATH = join(ROOT, 'examples', '.generative-taste-baseline-2026-07-03.json');
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', 'out', '.scratch']);

let parseHolo = null;
try {
  const mod = require(join(ROOT, 'packages', 'core', 'dist', 'parser.cjs'));
  parseHolo = mod.parseHolo || mod.parse || null;
} catch { /* parser unavailable → parse-guard is a no-op; source analysis still runs */ }

// The real, parse-verified generation-block keywords (tokens.ts: procedural/generate/scatter/
// distribute/pcg_graph all resolve to domain 'procedural'). Anchored to the START OF A LINE so
// the keyword only matches a BLOCK HEADER — never the same word inside a string literal (e.g.
// `composition "Procedural Starter" {`), a comment, or an emit("procedural:…") call.
const GEN_BLOCK_RE = /^[ \t]*(scatter|distribute|procedural|pcg_graph)\b[^{}\n]*\{/gim;
// World-generation TRAITS that carry seed + variation semantics natively.
const GEN_TRAIT_RE = /@(biome_scatter|procedural_placement|city_generator|world_generator|phyllotaxis|dungeon_generator|maze_generator|voxel_terrain|noise_field)\b/;
// An OBJECT that generates an instance set (the AsteroidBelt form: instance_count + @instanced).
const OBJECT_INSTANCE_RE = /@instanced\b|@instances\b|\binstance_count\s*[:=]|\binstances\s*[:=]/i;
// An instance SET — the thing that can degenerate into clones.
const COUNT_RE = /\b(?:count|instance_count|instances|density)\s*[:=]/i;
// Per-instance VARIATION — what makes each instance unique (the anti-clone signal).
const VARIATION_RE = /\b(?:random_rotation|randomize_rotation|random_scale|scale_range|rotation_range|random_position|position_jitter|jitter|per_instance)\s*[:=]|random_scale|scale_range/i;
// A DECLARED seed — intentional reproducibility (compiler honors it; else falls back to 1337).
const SEED_RE = /\bseed\s*[:=]|@seed\b|@world_seed\b/i;

function toRepoPath(p) { return relative(ROOT, p).split(sep).join('/'); }

function collectHoloFiles(dir) {
  const files = [];
  (function walk(cur) {
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) walk(join(cur, e.name)); continue; }
      if (e.isFile() && /\.holo$/i.test(e.name)) files.push(join(cur, e.name));
    }
  })(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

function matchBlock(text, braceIdx) {
  let depth = 0;
  for (let i = braceIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(braceIdx, i + 1); }
  }
  return text.slice(braceIdx);
}

/** Classify one generation block's text (header + body). */
function classifyBlock(scope) {
  const isInstanceSet = COUNT_RE.test(scope);
  const hasVariation = VARIATION_RE.test(scope);
  const hasSeed = SEED_RE.test(scope);
  if (isInstanceSet && !hasVariation) return { state: 'clone', hasSeed };        // N identical copies
  if (isInstanceSet && hasVariation && !hasSeed) return { state: 'unseeded', hasSeed }; // varied but not pinned
  if (isInstanceSet && hasVariation && hasSeed) return { state: 'considered', hasSeed };
  return { state: 'procedural-single', hasSeed }; // a single procedural surface, not an instance set
}

function classify(absPath) {
  const rel = toRepoPath(absPath);
  let code = '';
  try { code = readFileSync(absPath, 'utf8'); } catch { return { path: rel, category: 'unreadable', blocks: [] }; }
  if (parseHolo) {
    try { const r = parseHolo(code); if (!r.success) return { path: rel, category: 'parse-error', blocks: [] }; } catch { /* fall through */ }
  }

  const blocks = [];
  // 1) generation keyword blocks: scatter/distribute/procedural/pcg_graph
  const re = new RegExp(GEN_BLOCK_RE.source, 'gim');
  let m;
  while ((m = re.exec(code)) !== null) {
    const braceIdx = m.index + m[0].length - 1;
    const body = matchBlock(code, braceIdx);
    const line = code.slice(0, m.index).split('\n').length;
    const { state, hasSeed } = classifyBlock(m[0] + body);
    blocks.push({ kind: m[1].toLowerCase(), line, state, hasSeed });
  }
  // 2) objects carrying a world-generation trait (their whole object block is the scope)
  const objRe = /\b(?:object|entity)\s+"([^"]+)"([^{]*)\{/g;
  while ((m = objRe.exec(code)) !== null) {
    const header = m[2] || '';
    const braceIdx = m.index + m[0].length - 1;
    const body = matchBlock(code, braceIdx);
    const scope = header + body;
    const isGenTrait = GEN_TRAIT_RE.test(scope);
    const isInstanceObj = OBJECT_INSTANCE_RE.test(scope);
    if (!isGenTrait && !isInstanceObj) continue;
    const line = code.slice(0, m.index).split('\n').length;
    const { state, hasSeed } = classifyBlock(scope);
    blocks.push({ kind: isGenTrait ? 'gen-trait' : 'instanced', name: m[1], line, state, hasSeed });
  }

  const clones = blocks.filter((b) => b.state === 'clone');
  const unseeded = blocks.filter((b) => b.state === 'unseeded');
  const considered = blocks.filter((b) => b.state === 'considered');
  let category = 'none';
  if (blocks.some((b) => b.state !== 'procedural-single')) {
    category = clones.length ? 'clone' : unseeded.length ? 'unseeded' : considered.length ? 'considered' : 'none';
  }
  return { path: rel, category, blocks, clones, unseeded, considered };
}

function scan(dir) {
  const files = collectHoloFiles(dir);
  const results = files.map(classify);
  const counts = { considered: 0, clone: 0, unseeded: 0, none: 0, 'parse-error': 0, unreadable: 0 };
  const cloneHits = [];
  const unseededHits = [];
  let genFiles = 0;
  for (const r of results) {
    counts[r.category] = (counts[r.category] || 0) + 1;
    if (r.blocks && r.blocks.some((b) => b.state !== 'procedural-single')) genFiles++;
    for (const b of (r.clones || [])) cloneHits.push({ file: r.path, line: b.line, kind: b.kind, name: b.name });
    for (const b of (r.unseeded || [])) unseededHits.push({ file: r.path, line: b.line, kind: b.kind, name: b.name });
  }
  return { totalFiles: files.length, genFiles, counts, cloneHits, unseededHits, results };
}

function snapshot(dir, s) {
  return {
    generatedAt: new Date().toISOString(), scanDir: toRepoPath(dir),
    totalFiles: s.totalFiles, generativeFiles: s.genFiles, counts: s.counts,
    cloneCount: s.cloneHits.length, unseededCount: s.unseededHits.length,
  };
}

function parseArgs(argv) {
  const f = { positional: [] };
  for (const a of argv) {
    if (a.startsWith('--dir=')) f.dir = a.slice(6);
    else if (a.startsWith('--baseline=')) f.baseline = a.slice(11);
    else if (a.startsWith('--max-clone=')) f.maxClone = Number(a.slice(12));
    else if (a === '--json') f.json = true;
    else if (a === '--check') f.check = true;
    else if (a === '--save-baseline') f.saveBaseline = true;
    else if (!a.startsWith('--')) f.positional.push(a);
  }
  return f;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dir = join(ROOT, flags.dir || flags.positional[0] || 'examples');
  if (!existsSync(dir)) { console.error(`ERROR scan dir not found: ${toRepoPath(dir)}`); process.exit(1); }
  const s = scan(dir);
  const snap = snapshot(dir, s);

  console.log('Generative-taste scan (unique per seed, or N clones?)');
  console.log(`  scanned: ${snap.scanDir} (${s.totalFiles} .holo, ${s.genFiles} with seeded/procedural generation)`);
  console.log(`  considered:  ${s.counts.considered}   (seed + per-instance variation → unique-per-seed)`);
  console.log(`  clone:       ${s.counts.clone}   (${s.cloneHits.length} instance-set(s) with no variation → identical copies)`);
  console.log(`  unseeded:    ${s.counts.unseeded}   (${s.unseededHits.length} varied but no declared seed → not intentionally reproducible)`);

  if (s.cloneHits.length) {
    console.log('\n  CLONE generativity (instance set, no per-instance variation → N identical):');
    for (const h of s.cloneHits) console.log(`    ${h.file}:${h.line}  ${h.kind}${h.name ? ` "${h.name}"` : ''}  → add variation (random_scale/scale_range, random_rotation) + a declared seed`);
  }
  if (s.unseededHits.length) {
    console.log('\n  UNSEEDED generativity (varied but no seed — pin it for reproducibility):');
    for (const h of s.unseededHits) console.log(`    ${h.file}:${h.line}  ${h.kind}${h.name ? ` "${h.name}"` : ''}  → add seed: <n>`);
  }

  let failed = false;
  if (flags.baseline) {
    const bp = join(ROOT, flags.baseline);
    if (existsSync(bp)) {
      const base = JSON.parse(readFileSync(bp, 'utf8'));
      const delta = s.cloneHits.length - base.cloneCount;
      console.log(`\n  baseline: ${base.cloneCount} clone → now ${s.cloneHits.length}  (delta: ${delta >= 0 ? '+' : ''}${delta})`);
      if (flags.check) {
        const cap = typeof flags.maxClone === 'number' && !Number.isNaN(flags.maxClone) ? flags.maxClone : base.cloneCount;
        console.log(`  gate: clone generators must be <= ${cap}, got ${s.cloneHits.length}`);
        if (s.cloneHits.length > cap) { console.error('ERROR generative-taste regressed: more clone-scatter generators than allowed.'); failed = true; }
      }
    } else if (flags.check) { console.error(`ERROR baseline not found: ${flags.baseline}`); process.exit(1); }
  }

  if (flags.json) process.stdout.write(`\n__GENERATIVE_TASTE__\n${JSON.stringify({ ...snap, cloneHits: s.cloneHits, unseededHits: s.unseededHits }, null, 2)}\n`);

  if (flags.saveBaseline) {
    const out = flags.baseline ? join(ROOT, flags.baseline) : DEFAULT_BASELINE_PATH;
    writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline written: ${toRepoPath(out)}`);
  }

  process.exit(flags.check && failed ? 1 : 0);
}

export { scan, classify, classifyBlock };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
