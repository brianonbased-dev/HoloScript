#!/usr/bin/env node
/**
 * check:native-authoring-shape — the "author as data, not control-flow" WARN gate.
 *
 * The doctrine-registry (ai-ecosystem/config/doctrine-registry.json) reflex
 * `handwrite-not-native` had two enforced sub-cases (SURFACE-GREW for .tsx render,
 * no-regex-hs-parsing for parsing) but the CORE "author-as-data-not-control-flow"
 * shape was counter-by-PROSE-only (the native-authoring handbook table, lines 40-50).
 * P.019 shows the reflex fired twice with the handbook open — prose doesn't catch it.
 *
 * This is the missing detector. It scans HoloScript content + trait sources for the
 * handbook's named anti-pattern shapes and WARNS (never blocks). It is **warn-only by
 * design**, NOT warn-first-then-harden: several targets (class-as-export vs
 * class-as-hidden-impl) are ambiguous without full AST analysis, so a hard block would
 * false-positive on legitimate hidden-impl classes. A loud advisory at commit time is
 * the right lever; a blocking gate here would train laundering, not native authoring.
 * (Same reasoning the deflection Stop-hooks landed on — roundtable 2026-06-13.)
 *
 * Detected shapes (handbook holoscript-native-authoring-vs-pretrained.md):
 *   1. `if`/`else if`/`else`/`switch` inside an `@on_update {…}` block (.hsplus)
 *      → phase logic belongs in `@state_machine { states: {…} }` (handbook L42).
 *   2. A `*Trait.ts` whose trait is exported AS a class (`export … class …Trait`)
 *      with no sibling handler-object export → should export a `TraitHandler` object,
 *      class is hidden impl (handbook L40/L61). Advisory: hidden-impl classes are fine.
 *   3. Agent task routing by title string (`task.title.includes` / `switch (task`)
 *      → route by `capability_tags` set-intersection (handbook L48).
 *
 * Usage:
 *   node scripts/holo-ci/check-native-authoring-shape.mjs           # warn (always exit 0)
 *   node scripts/holo-ci/check-native-authoring-shape.mjs --json    # findings as JSON
 *   node scripts/holo-ci/check-native-authoring-shape.mjs --staged  # only git-staged files
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.turbo',
  '.tmp-g4', 'out', '.bench-logs', 'target', '.scratch',
]);

/** Recursively collect files under `dir` whose ext is in `exts`. */
function walk(dir, exts, acc = []) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), exts, acc);
    } else if (e.isFile() && exts.has(path.extname(e.name))) {
      acc.push(path.join(dir, e.name));
    }
  }
  return acc;
}

function stagedFiles() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { cwd: REPO_ROOT, encoding: 'utf-8' })
      .split('\n').map(s => s.trim()).filter(Boolean)
      .map(rel => path.join(REPO_ROOT, rel))
      .filter(p => fs.existsSync(p));
  } catch { return []; }
}

/** Find `@on_update { … }` blocks and flag control-flow keywords inside them. */
export function scanHsplusOnUpdate(text) {
  const hits = [];
  // Match @on_update followed by a brace block (brace-count to find the block end).
  const re = /@on_update\b[^{]*\{/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index + m[0].length - 1; // position of the opening '{'
    let depth = 0, i = start, end = -1;
    for (; i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end === -1) continue;
    const body = text.slice(start + 1, end);
    if (/\b(?:if|else\s+if|else|switch)\b/.test(body)) {
      const line = text.slice(0, m.index).split('\n').length;
      hits.push({ line, kind: 'if-else-in-on_update' });
    }
  }
  return hits;
}

/** Flag a *Trait.ts that exports a class AS the trait with no handler-object export. */
export function scanTraitClassExport(text) {
  const exportsClassTrait = /export\s+(?:default\s+)?(?:abstract\s+)?class\s+\w*Trait\b/.test(text);
  if (!exportsClassTrait) return [];
  // Legitimate pattern: a handler object literal is also exported (class is hidden impl).
  const hasHandlerObjectExport = /export\s+const\s+\w*(?:Handler|Trait)\s*(?::[^=]+)?=\s*\{/.test(text)
    || /\bTraitHandler\b/.test(text);
  if (hasHandlerObjectExport) return [];
  const line = text.slice(0, text.search(/export\s+(?:default\s+)?(?:abstract\s+)?class\s+\w*Trait\b/)).split('\n').length;
  return [{ line, kind: 'class-as-trait-export' }];
}

/** Flag task routing by title string instead of capability_tags. */
export function scanTaskStringRouting(text) {
  const hits = [];
  const re = /\btask(?:\.title)?\.(?:includes|startsWith|match|indexOf)\s*\(|switch\s*\(\s*task(?:\.\w+)?\s*\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const line = text.slice(0, m.index).split('\n').length;
    hits.push({ line, kind: 'task-string-routing' });
  }
  return hits;
}

const FIX = {
  'if-else-in-on_update': '@on_update holds if/else phase logic → move to @state_machine { states: {…} } (handbook L42; compiler can\'t extract the transition graph otherwise)',
  'class-as-trait-export': 'trait is exported as a class → export a TraitHandler object; the class is hidden impl (handbook L40/L61)',
  'task-string-routing': 'task routed by title string → route by identity.capability_tags set-intersection (handbook L48; empty tags = silent permanent idle)',
};

export function analyze(files) {
  const findings = [];
  for (const abs of files) {
    let text;
    try { text = fs.readFileSync(abs, 'utf-8'); } catch { continue; }
    const ext = path.extname(abs);
    const base = path.basename(abs);
    const rel = path.relative(REPO_ROOT, abs);
    if (ext === '.hsplus' || ext === '.holo') {
      for (const h of scanHsplusOnUpdate(text)) findings.push({ file: rel, ...h });
    }
    if (base.endsWith('Trait.ts') && !base.endsWith('.test.ts') && abs.includes(`${path.sep}src${path.sep}`)) {
      for (const h of scanTraitClassExport(text)) findings.push({ file: rel, ...h });
    }
    if (/(?:runner|agent|dispatch|route)/i.test(base) && (ext === '.ts' || ext === '.mjs')) {
      for (const h of scanTaskStringRouting(text)) findings.push({ file: rel, ...h });
    }
  }
  return findings;
}

function main() {
  const args = process.argv.slice(2);
  const files = args.includes('--staged')
    ? stagedFiles().filter(p => /\.(hsplus|holo|ts|mjs)$/.test(p))
    : [
        ...walk(path.join(REPO_ROOT, 'packages'), new Set(['.hsplus', '.holo', '.ts'])),
        ...walk(path.join(REPO_ROOT, 'examples'), new Set(['.hsplus', '.holo'])),
      ];

  const findings = analyze(files);

  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify({ findings, count: findings.length }, null, 2) + '\n');
    return;
  }

  if (findings.length === 0) {
    console.log('✓ native-authoring-shape: no author-as-control-flow anti-patterns found.');
    return;
  }

  console.warn(`\n⚠ native-authoring-shape: ${findings.length} advisory finding(s) (WARN-ONLY — never blocks):`);
  for (const f of findings) {
    console.warn(`  ${f.file}:${f.line}  [${f.kind}]`);
    console.warn(`      → ${FIX[f.kind]}`);
  }
  console.warn('\n  Warn-only by design: these shapes are the pretrained "author as control-flow" reflex the');
  console.warn('  native-authoring handbook (F.126) names. Fix toward data-a-tool-consumes; a false positive');
  console.warn('  (legitimate conditional / hidden-impl class) is fine to ignore — this never blocks a commit.\n');
  // WARN-ONLY: always exit 0.
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
