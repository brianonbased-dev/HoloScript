#!/usr/bin/env node
/**
 * check:interaction-taste — the "does this thing BEHAVE with a point of view?" gate.
 *
 * The sibling of the /taste FORM work (research/2026-07-03_ultra-unique-interactive-
 * language-plan.md, Track A). The form-taste pass made scene GEOMETRY considered;
 * this gate extends the same lens one level up, to BEHAVIOR/INTERACTION.
 *
 * The assembled tell it catches: an object whose only interactive behavior is a
 * handler whose entire body is a bare `trigger`/`emit` of a GENERIC panel/info event
 * (show_info_panel, show_details, …) — the statistical-average interaction every
 * clickable object in an assembled scene shares. A CONSIDERED interaction instead
 * has a point of view about how the object lives:
 *   - an @state_machine (or a `state "x" {…}` graph), OR
 *   - a distinctive world/temporal/spatial reaction (on_dusk/on_approach/on_wind/…), OR
 *   - a handler body with real object-specific logic (state mutation / conditional /
 *     multiple statements / a non-generic trigger), OR
 *   - an @interaction_profile(react_to: "…") that is actually DELIVERED (every event it
 *     declares has a matching on_<event> handler — declared-and-delivered, gate-derived).
 *
 * Gate-derived, not asserted: @interaction_profile is cross-checked against the object's
 * real handlers, so the declaration cannot lie. Files that don't parse are skipped (the
 * examples-health matrix owns parse); non-interactive static scenes are NOT flagged
 * (absence of interaction is not assembled interaction).
 *
 * WARN→BLOCK ladder (matches check-authoring-richness): starts advisory with a committed
 * baseline; wire a --check --max-assembled=<baseline> ratchet into CI once the corpus is clean.
 *
 * Usage:
 *   node scripts/holo-ci/check-interaction-taste.mjs                       # scan examples/, summary
 *   node scripts/holo-ci/check-interaction-taste.mjs --dir=<path>          # scan a different dir
 *   node scripts/holo-ci/check-interaction-taste.mjs <path>                # positional dir form
 *   node scripts/holo-ci/check-interaction-taste.mjs --json                # machine-readable JSON
 *   node scripts/holo-ci/check-interaction-taste.mjs --baseline=<file>     # before/after delta
 *   node scripts/holo-ci/check-interaction-taste.mjs --check --baseline=<file> [--max-assembled=N]
 *                                                                          # exit 1 if assembled > N (default: baseline)
 *   node scripts/holo-ci/check-interaction-taste.mjs --save-baseline [--baseline=<file>]
 */
import { createRequire } from 'module';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DEFAULT_BASELINE_PATH = join(ROOT, 'examples', '.interaction-taste-baseline-2026-07-03.json');
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

// The parser is the sovereign one used by the examples-health matrix.
let parseHolo = null;
try {
  const mod = require(join(ROOT, 'packages', 'core', 'dist', 'parser.cjs'));
  parseHolo = mod.parseHolo || mod.parse || null;
} catch {
  /* parser unavailable → parse-guard becomes a no-op; source analysis still runs */
}

// Generic info/panel events — a handler whose ENTIRE body is a bare trigger/emit of
// one of these is the statistical-average "assembled" interaction.
const GENERIC_EVENTS = new Set([
  'show_info_panel',
  'show_gallery_info',
  'show_info',
  'show_details',
  'show_detail_panel',
  'show_panel',
  'open_info',
  'open_panel',
  'show_dialog',
  'display_info',
  'info_panel',
  'show_gallery_details',
  'open_details',
]);

// Interaction traits that make an object "interactive" even without a handler.
const INTERACTION_TRAITS = new Set([
  'clickable',
  'hoverable',
  'grabbable',
  'sittable',
  'pointable',
  'scalable',
  'rotatable',
  'draggable',
  'throwable',
  'usable',
  'interactable',
]);

// Distinctive world/temporal/spatial/physical reactions — evidence of a point of view
// about how the object LIVES (not just a generic pointer surface).
const DISTINCTIVE_EVENTS = new Set([
  'on_dusk',
  'on_dawn',
  'on_night',
  'on_day',
  'on_sunrise',
  'on_sunset',
  'on_tick',
  'on_time',
  'on_interval',
  'on_schedule',
  'on_wind',
  'on_gust',
  'on_rain',
  'on_storm',
  'on_temperature',
  'on_approach',
  'on_leave',
  'on_gaze',
  'on_look',
  'on_proximity',
  'on_nearby',
  'on_collision',
  'on_impact',
  'on_cast',
  'on_player_attack',
  'on_damage',
  'on_enter',
  'on_exit',
  'on_stay',
]);

// Generic pointer events — considered ONLY if the body has real logic (not a generic stub).
const POINTER_EVENTS = new Set([
  'on_click',
  'on_hover',
  'on_hover_enter',
  'on_hover_exit',
  'on_point',
  'on_press',
  'on_tap',
  'on_select',
]);

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
  return files.sort((a, b) => a.localeCompare(b));
}

/** Brace-match the body of a handler starting at the '{' index. Returns {body, endIndex}. */
function matchBlock(text, braceIdx) {
  let depth = 0;
  for (let i = braceIdx; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return { body: text.slice(braceIdx + 1, i), endIndex: i };
    }
  }
  return { body: '', endIndex: text.length };
}

/** True when a handler body is only a bare trigger/emit of a GENERIC event. */
function isGenericStub(body) {
  const stmts = body
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith('//'));
  if (stmts.length !== 1) return { stub: false };
  const m = stmts[0].match(/^(?:trigger|emit)\s+["']([\w.-]+)["']\s*$/);
  if (m && GENERIC_EVENTS.has(m[1])) return { stub: true, event: m[1] };
  return { stub: false };
}

/** A body has "real logic" (object-specific behavior) if it mutates state / branches / does several things. */
function hasRealLogic(body) {
  const stmts = body
    .split(/[\n;]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith('//'));
  if (stmts.length >= 2) return true;
  if (/\bif\b|\belse\b|\bfor\b|\bwhile\b|\bmatch\b/.test(body)) return true;
  if (/\bstate\s*\.\w+\s*=|\bset\s+\w+\s*:|\w+\s*[+\-*/]?=[^=]/.test(body)) return true; // mutation
  const trig = body.match(/(?:trigger|emit)\s+["']([\w.-]+)["']/);
  if (trig && !GENERIC_EVENTS.has(trig[1])) return true; // a specific, non-generic trigger
  return false;
}

function classify(absPath) {
  const rel = toRepoPath(absPath);
  let code = '';
  try {
    code = readFileSync(absPath, 'utf8');
  } catch {
    return { path: rel, category: 'unreadable' };
  }

  // Parse guard: a broken file is the matrix's problem, not ours.
  if (parseHolo) {
    try {
      const r = parseHolo(code);
      if (!r.success) return { path: rel, category: 'parse-error' };
    } catch {
      /* fall through */
    }
  }

  const interactionTraits = [...code.matchAll(/@(\w+)/g)]
    .map((m) => m[1])
    .filter((t) => INTERACTION_TRAITS.has(t));
  const hasStateMachine =
    /@state_machine\b|\bstate_machine\b/.test(code) ||
    /\bstate\s+"[^"]+"\s*\{[^}]*(?:->|on_)/.test(code);

  // @interaction_profile(react_to: "a b c", …) — declared reactivity.
  const profiles = [...code.matchAll(/@interaction_profile\s*\(([^)]*)\)/g)].map((m) => {
    const rt = m[1].match(/react_to\s*:\s*["']([^"']+)["']/);
    const events = rt ? rt[1].split(/[\s,]+/).filter(Boolean) : [];
    return { events, raw: m[0] };
  });

  // Walk every on_<event>(…){ … } handler.
  const handlers = [];
  const re = /\b(on_[a-z_]+)\b\s*(?:\([^)]*\))?\s*\{/gi;
  let m;
  while ((m = re.exec(code)) !== null) {
    const braceIdx = m.index + m[0].length - 1;
    const { body } = matchBlock(code, braceIdx);
    const event = m[1].toLowerCase();
    const line = code.slice(0, m.index).split('\n').length;
    handlers.push({ event, line, body });
  }

  const assembledHits = [];
  let realLogicCount = 0;
  let distinctiveCount = 0;
  const presentEvents = new Set();
  for (const h of handlers) {
    presentEvents.add(h.event);
    if (DISTINCTIVE_EVENTS.has(h.event)) distinctiveCount++;
    const g = isGenericStub(h.body);
    if (g.stub) {
      assembledHits.push({ file: rel, line: h.line, event: h.event, generic: g.event });
      continue;
    }
    if (hasRealLogic(h.body)) realLogicCount++;
  }

  // @interaction_profile is only "delivered" (a considered signal) if every declared
  // event has a matching handler. Otherwise it's a mismatch (declared-not-delivered).
  const profileMismatches = [];
  let profileDelivered = false;
  for (const p of profiles) {
    if (p.events.length === 0) continue;
    const missing = p.events.filter((e) => !presentEvents.has(`on_${e}`) && !presentEvents.has(e));
    if (missing.length === 0) profileDelivered = true;
    else profileMismatches.push({ file: rel, declared: p.events, missing });
  }

  const isInteractive =
    interactionTraits.length > 0 || handlers.length > 0 || hasStateMachine || profiles.length > 0;
  const consideredSignal =
    hasStateMachine || distinctiveCount > 0 || realLogicCount > 0 || profileDelivered;

  let category;
  if (!isInteractive) category = 'non-interactive';
  else if (assembledHits.length > 0) category = 'assembled';
  else if (consideredSignal) category = 'considered';
  else category = 'bare'; // interactive surface (e.g. @clickable) with no behavior and no POV

  return {
    path: rel,
    category,
    assembledHits,
    profileMismatches,
    counts: {
      handlers: handlers.length,
      distinctive: distinctiveCount,
      realLogic: realLogicCount,
      traits: interactionTraits.length,
      profiles: profiles.length,
    },
  };
}

function scan(dir) {
  const files = collectHoloFiles(dir);
  const results = files.map(classify);
  const counts = {
    considered: 0,
    assembled: 0,
    bare: 0,
    'non-interactive': 0,
    'parse-error': 0,
    unreadable: 0,
  };
  const assembledHits = [];
  const profileMismatches = [];
  for (const r of results) {
    counts[r.category] = (counts[r.category] || 0) + 1;
    if (r.assembledHits) assembledHits.push(...r.assembledHits);
    if (r.profileMismatches) profileMismatches.push(...r.profileMismatches);
  }
  const interactive = counts.considered + counts.assembled + counts.bare;
  return {
    totalFiles: files.length,
    interactive,
    counts,
    assembledHits,
    profileMismatches,
    results,
  };
}

function snapshot(scanDir, s) {
  return {
    generatedAt: new Date().toISOString(),
    scanDir: toRepoPath(scanDir),
    totalFiles: s.totalFiles,
    interactive: s.interactive,
    counts: s.counts,
    assembledCount: s.assembledHits.length,
    profileMismatchCount: s.profileMismatches.length,
  };
}

function parseArgs(argv) {
  const f = { positional: [] };
  for (const a of argv) {
    if (a.startsWith('--dir=')) f.dir = a.slice(6);
    else if (a.startsWith('--baseline=')) f.baseline = a.slice(11);
    else if (a.startsWith('--max-assembled=')) f.maxAssembled = Number(a.slice(16));
    else if (a === '--json') f.json = true;
    else if (a === '--check') f.check = true;
    else if (a === '--save-baseline') f.saveBaseline = true;
    else if (!a.startsWith('--')) f.positional.push(a);
  }
  return f;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const scanDir = join(ROOT, flags.dir || flags.positional[0] || 'examples');
  if (!existsSync(scanDir)) {
    console.error(`ERROR scan dir not found: ${toRepoPath(scanDir)}`);
    process.exit(1);
  }

  const s = scan(scanDir);
  const snap = snapshot(scanDir, s);

  console.log('Interaction-taste scan');
  console.log(`  scanned: ${snap.scanDir} (${s.totalFiles} .holo, ${s.interactive} interactive)`);
  console.log(`  considered:      ${s.counts.considered}`);
  console.log(
    `  assembled:       ${s.counts.assembled}   (${s.assembledHits.length} generic-stub handler(s))`
  );
  console.log(`  bare (no POV):   ${s.counts.bare}`);
  console.log(`  non-interactive: ${s.counts['non-interactive']}`);
  if (s.counts['parse-error'])
    console.log(
      `  parse-error:     ${s.counts['parse-error']} (skipped; owned by examples-health matrix)`
    );

  if (s.assembledHits.length) {
    console.log('\n  ASSEMBLED interactions (handler body is only a generic trigger):');
    for (const h of s.assembledHits)
      console.log(
        `    ${h.file}:${h.line}  ${h.event} → trigger "${h.generic}"  (give it a point of view: @state_machine / on_dusk|on_approach / real logic)`
      );
  }
  if (s.profileMismatches.length) {
    console.log(
      '\n  @interaction_profile declared-not-delivered (add the missing handlers or drop the claim):'
    );
    for (const p of s.profileMismatches)
      console.log(
        `    ${p.file}  declares react_to [${p.declared.join(', ')}] but has no handler for [${p.missing.join(', ')}]`
      );
  }

  let failed = false;
  if (flags.baseline) {
    const bp = join(ROOT, flags.baseline);
    if (existsSync(bp)) {
      const base = JSON.parse(readFileSync(bp, 'utf8'));
      const delta = s.assembledHits.length - base.assembledCount;
      console.log(
        `\n  baseline: ${base.assembledCount} assembled → now ${s.assembledHits.length}  (delta: ${delta >= 0 ? '+' : ''}${delta})`
      );
      if (flags.check) {
        const cap =
          typeof flags.maxAssembled === 'number' && !Number.isNaN(flags.maxAssembled)
            ? flags.maxAssembled
            : base.assembledCount;
        console.log(`  gate: assembled must be <= ${cap}, got ${s.assembledHits.length}`);
        if (s.assembledHits.length > cap) {
          console.error(
            'ERROR interaction-taste regressed: more assembled-interaction stubs than allowed.'
          );
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
      `\n__INTERACTION_TASTE__\n${JSON.stringify({ ...snap, assembledHits: s.assembledHits, profileMismatches: s.profileMismatches }, null, 2)}\n`
    );

  if (flags.saveBaseline) {
    const out = flags.baseline ? join(ROOT, flags.baseline) : DEFAULT_BASELINE_PATH;
    writeFileSync(out, JSON.stringify(snap, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline written: ${toRepoPath(out)}`);
  }

  process.exit(flags.check && failed ? 1 : 0);
}

export { scan, classify, isGenericStub, hasRealLogic };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
