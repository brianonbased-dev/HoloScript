#!/usr/bin/env node
/**
 * check:embodied-mind — the "the body renders, but does it load the mind?" gate.
 *
 * Track C of the ultra-unique+interactive language plan (research/2026-07-03_
 * ultra-unique-interactive-language-plan.md) and the D.102 keystone: a portable
 * agent mind (wallet-keyed identity + private:<wallet> memory) should inhabit the
 * scene's body across substrates (Jetson node → headset). The pieces all exist as
 * native traits — @portable_mind (packages/holoscript-agent) binds a MeshCharacterMind
 * via bind_mind(mind); @portable_mind_seam (packages/xr-embodiment) carries it into an
 * XR avatar at spawn and emits a CrossSubstrateIdentityReceipt. The GAP is that nothing
 * checks a scene actually USES them: an agent body can render and never load its mind,
 * and no one notices. (Ground truth at build time: even brittney.holo — the flagship
 * embodied agent — and 07-cross-reality-agent-continuity.holo — a demo explicitly ABOUT
 * agent continuity — rendered bodies with an empty identity_wallet and no seam.)
 *
 * The gate flags an EMBODIED AGENT (an entity with BOTH an agent marker and a rendered
 * body) that carries no mind-carry seam ("soulless body"), and a seam that is present but
 * INCOMPLETE (missing the config it needs to resolve identity/memory). Compute-only agents
 * (an @agent with no body — e.g. a pipeline stage) are NOT flagged; a plain character model
 * with no agent marker is NOT flagged.
 *
 * This is the declare-and-gate half of Track C (type the freeform → gate the generic). The
 * dissolve-the-TS half — making the XR/OpenXR compile targets EMIT the bind seam instead of
 * an inert @agent comment — is the runtime-coupled follow-up (see plan Track C gap 2).
 *
 * WARN→BLOCK ladder (matches check-authoring-richness / check-interaction-taste): advisory
 * with a committed baseline; wire --check --max-soulless=<baseline> into CI once clean.
 *
 * Usage:
 *   node scripts/holo-ci/check-embodied-mind.mjs                     # scan (examples + compositions)
 *   node scripts/holo-ci/check-embodied-mind.mjs --dir=<path>        # scan a different dir
 *   node scripts/holo-ci/check-embodied-mind.mjs --json              # machine-readable JSON
 *   node scripts/holo-ci/check-embodied-mind.mjs --check --baseline=<file> [--max-soulless=N]
 *   node scripts/holo-ci/check-embodied-mind.mjs --save-baseline [--baseline=<file>]
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DEFAULT_BASELINE_PATH = join(ROOT, 'examples', '.embodied-mind-baseline-2026-07-03.json');
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.turbo',
  'out',
  '.scratch',
]);
// Default scan roots: authored scenes live in examples/ and compositions/.
const DEFAULT_DIRS = ['examples', 'compositions'];

let parseHolo = null;
try {
  const mod = require(join(ROOT, 'packages', 'core', 'dist', 'parser.cjs'));
  parseHolo = mod.parseHolo || mod.parse || null;
} catch {
  /* parser unavailable → parse-guard is a no-op; source analysis still runs */
}

// A rendered body — the thing that shows up in the world.
const BODY_RE =
  /@avatar_embodiment\b|@avatar\b|@agent_body\b|geometry\s*:\s*"avatar"|model\s*:\s*"[^"]*\.(?:glb|gltf)"|@skeleton\b|@body\s*\(/i;
// An AI agent — an entity meant to be inhabited by a portable, wallet-keyed mind.
// NOTE: @avatar_embodiment is deliberately NOT here — it is a BODY marker that
// player and plain-human avatars also carry (the human is the mind; they need no
// portable AGENT mind). The agent signal must be explicit, or this over-flags.
const AGENT_RE =
  /@agent_identity\b|@agent_body\b|@agent\b|@daimon\b|@ai_npc_brain\b|@sovereign_npc\b|@npc_brain\b|\bidentity_wallet\b|\bmemory_scope\b|\bagent_id\b|archetype\s*:\s*"embodied_agent"/i;
// The mind-carry seam (either the acquisition trait or the XR spawn seam).
const SEAM_SEAM_RE = /@portable_mind_seam\b/;
const SEAM_MIND_RE = /@portable_mind\b/;

function toRepoPath(p) {
  return relative(ROOT, p).split(sep).join('/');
}

function collectHoloFiles(dir) {
  const files = [];
  (function walk(cur) {
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(join(cur, e.name));
        continue;
      }
      if (e.isFile() && /\.holo$/i.test(e.name)) files.push(join(cur, e.name));
    }
  })(dir);
  return files;
}

/** Brace-match a block body starting at the '{' index. */
function matchBlock(text, braceIdx) {
  let depth = 0;
  for (let i = braceIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(braceIdx, i + 1);
    }
  }
  return text.slice(braceIdx);
}

/** Check a mind-seam decorator carries the config it needs to resolve identity/memory. */
function seamComplete(block) {
  if (SEAM_SEAM_RE.test(block)) {
    // @portable_mind_seam needs a mesh endpoint + team scope (bearer may be env-resolved).
    return /\bmesh_api_base\b/.test(block) && /\bteam_id\b/.test(block);
  }
  if (SEAM_MIND_RE.test(block)) {
    // @portable_mind needs at least a team scope for private:<wallet> memory.
    return /\bteam_id\b/.test(block);
  }
  return false;
}

function classify(absPath) {
  const rel = toRepoPath(absPath);
  let code = '';
  try {
    code = readFileSync(absPath, 'utf8');
  } catch {
    return { path: rel, category: 'unreadable', entities: [] };
  }
  if (parseHolo) {
    try {
      const r = parseHolo(code);
      if (!r.success) return { path: rel, category: 'parse-error', entities: [] };
    } catch {
      /* fall through */
    }
  }

  const entities = [];
  // Match object/entity/avatar/npc/character headers with their inline decorators + block.
  const re = /\b(?:object|entity|avatar|npc|character)\s+"([^"]+)"([^{]*)\{/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const name = m[1];
    const header = m[2] || '';
    const braceIdx = m.index + m[0].length - 1;
    const block = matchBlock(code, braceIdx);
    const scope = header + block;
    const isBody = BODY_RE.test(scope);
    const isAgent = AGENT_RE.test(scope);
    if (!(isBody && isAgent)) continue; // only EMBODIED AGENTS are in scope
    const line = code.slice(0, m.index).split('\n').length;
    const hasSeam = SEAM_SEAM_RE.test(scope) || SEAM_MIND_RE.test(scope);
    let state;
    if (!hasSeam) state = 'soulless';
    else if (!seamComplete(scope)) state = 'incomplete-seam';
    else state = 'minded';
    entities.push({ name, line, state });
  }

  const soulless = entities.filter((e) => e.state === 'soulless');
  const incomplete = entities.filter((e) => e.state === 'incomplete-seam');
  let category = 'none';
  if (entities.length)
    category = soulless.length ? 'soulless' : incomplete.length ? 'incomplete' : 'minded';
  return { path: rel, category, entities, soulless, incomplete };
}

function scan(dirs) {
  const files = [];
  for (const d of dirs) {
    const abs = join(ROOT, d);
    if (existsSync(abs)) files.push(...collectHoloFiles(abs));
  }
  files.sort((a, b) => a.localeCompare(b));
  const results = files.map(classify);
  const counts = {
    minded: 0,
    soulless: 0,
    incomplete: 0,
    none: 0,
    'parse-error': 0,
    unreadable: 0,
  };
  const soullessHits = [];
  const incompleteHits = [];
  let embodiedAgents = 0;
  for (const r of results) {
    counts[r.category] = (counts[r.category] || 0) + 1;
    embodiedAgents += r.entities.length;
    for (const e of r.soulless || [])
      soullessHits.push({ file: r.path, line: e.line, name: e.name });
    for (const e of r.incomplete || [])
      incompleteHits.push({ file: r.path, line: e.line, name: e.name });
  }
  return {
    totalFiles: files.length,
    embodiedAgents,
    counts,
    soullessHits,
    incompleteHits,
    results,
  };
}

function snapshot(dirs, s) {
  return {
    generatedAt: new Date().toISOString(),
    scanDirs: dirs,
    totalFiles: s.totalFiles,
    embodiedAgents: s.embodiedAgents,
    counts: s.counts,
    soullessCount: s.soullessHits.length,
    incompleteCount: s.incompleteHits.length,
  };
}

function parseArgs(argv) {
  const f = { positional: [], dirs: null };
  for (const a of argv) {
    if (a.startsWith('--dir=')) f.dirs = [a.slice(6)];
    else if (a.startsWith('--baseline=')) f.baseline = a.slice(11);
    else if (a.startsWith('--max-soulless=')) f.maxSoulless = Number(a.slice(15));
    else if (a === '--json') f.json = true;
    else if (a === '--check') f.check = true;
    else if (a === '--save-baseline') f.saveBaseline = true;
    else if (!a.startsWith('--')) f.positional.push(a);
  }
  if (!f.dirs && f.positional[0]) f.dirs = [f.positional[0]];
  return f;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const dirs = flags.dirs || DEFAULT_DIRS;
  const s = scan(dirs);
  const snap = snapshot(dirs, s);

  console.log('Embodied-mind scan (D.102: does the body load the mind?)');
  console.log(
    `  scanned: ${dirs.join(', ')} (${s.totalFiles} .holo, ${s.embodiedAgents} embodied agent(s))`
  );
  console.log(
    `  minded:          ${s.counts.minded}   (body carries @portable_mind / @portable_mind_seam)`
  );
  console.log(
    `  soulless:        ${s.counts.soulless}   (${s.soullessHits.length} body renders but loads no mind)`
  );
  console.log(
    `  incomplete-seam: ${s.counts.incomplete}   (${s.incompleteHits.length} seam present, config missing)`
  );

  if (s.soullessHits.length) {
    console.log('\n  SOULLESS bodies (embodied agent, no mind-carry seam — D.102 gap):');
    for (const h of s.soullessHits)
      console.log(
        `    ${h.file}:${h.line}  "${h.name}"  → add @portable_mind_seam(mesh_api_base, team_id[, bearer]) or @portable_mind(team_id)`
      );
  }
  if (s.incompleteHits.length) {
    console.log('\n  INCOMPLETE seams (present but cannot resolve identity/memory):');
    for (const h of s.incompleteHits)
      console.log(`    ${h.file}:${h.line}  "${h.name}"  → seam needs mesh_api_base + team_id`);
  }

  let failed = false;
  if (flags.baseline) {
    const bp = join(ROOT, flags.baseline);
    if (existsSync(bp)) {
      const base = JSON.parse(readFileSync(bp, 'utf8'));
      const delta = s.soullessHits.length - base.soullessCount;
      console.log(
        `\n  baseline: ${base.soullessCount} soulless → now ${s.soullessHits.length}  (delta: ${delta >= 0 ? '+' : ''}${delta})`
      );
      if (flags.check) {
        const cap =
          typeof flags.maxSoulless === 'number' && !Number.isNaN(flags.maxSoulless)
            ? flags.maxSoulless
            : base.soullessCount;
        console.log(`  gate: soulless bodies must be <= ${cap}, got ${s.soullessHits.length}`);
        if (s.soullessHits.length > cap) {
          console.error('ERROR embodied-mind regressed: more soulless agent bodies than allowed.');
          failed = true;
        }
      }
    } else if (flags.check) {
      console.error(`ERROR baseline not found: ${flags.baseline}`);
      process.exit(1);
    }
  }

  if (flags.json)
    process.stdout.write(
      `\n__EMBODIED_MIND__\n${JSON.stringify({ ...snap, soullessHits: s.soullessHits, incompleteHits: s.incompleteHits }, null, 2)}\n`
    );

  if (flags.saveBaseline) {
    const out = flags.baseline ? join(ROOT, flags.baseline) : DEFAULT_BASELINE_PATH;
    writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline written: ${toRepoPath(out)}`);
  }

  process.exit(flags.check && failed ? 1 : 0);
}

export { scan, classify, seamComplete };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
