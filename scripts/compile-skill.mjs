#!/usr/bin/env node
/**
 * compile-skill.mjs — emit ONE .hs skill source to byte-identical SKILL.md
 * across every configured skill root. The dedup mechanism: a skill authored
 * once in HoloScript lands identically in all roots, so the cross-root drift
 * the surface-linter reports (12 duplicate names, 2026-05-22) becomes
 * impossible by construction — one source, N emitted copies.
 *
 * Generalizes compile-founder-skill.mjs (which proved the round-trip for the
 * founder skill). This is the reusable multi-root runner.
 *
 * Usage:
 *   node scripts/compile-skill.mjs <source.hs> --roots <r1>,<r2>,... [--name <skill>] [--dry-run <dir>]
 *
 * - skill name is derived from the @identity trait's `name` unless --name given.
 * - each root receives <root>/<skillName>/SKILL.md (byte-identical).
 * - --dry-run <dir> writes copies under <dir>/<rootIndex>/<skillName>/SKILL.md
 *   instead of the real roots (for validation without touching live skills).
 *
 * Exit codes: 0 ok · 1 parse error · 2 compile error · 3 no SKILL.md · 4 bad args
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHolo } from '../packages/core/dist/parser.js';
import { ContextCompiler } from '../packages/core/dist/compiler/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function log(msg) {
  process.stderr.write(`[compile-skill] ${msg}\n`);
}

function parseArgs(argv) {
  const args = { source: null, roots: [], name: null, dryRun: null };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--roots') args.roots = (argv[++i] ?? '').split(',').filter(Boolean);
    else if (a === '--name') args.name = argv[++i] ?? null;
    else if (a === '--dry-run') args.dryRun = argv[++i] ?? null;
    else positional.push(a);
  }
  args.source = positional[0] ?? null;
  return args;
}

function deriveSkillName(composition) {
  for (const obj of composition.objects ?? []) {
    for (const t of obj.traits ?? []) {
      if (t.name === 'identity' && t.config && typeof t.config.name === 'string') {
        return t.config.name;
      }
    }
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.source || (args.roots.length === 0 && !args.dryRun)) {
    log(
      'usage: node scripts/compile-skill.mjs <source.hs> --roots <r1>,<r2> [--name <skill>] [--dry-run <dir>]'
    );
    process.exit(4);
  }

  const sourcePath = resolve(REPO_ROOT, args.source);
  const source = readFileSync(sourcePath, 'utf8');
  const parsed = parseHolo(source);
  if (parsed.errors && parsed.errors.length > 0) {
    for (const e of parsed.errors) log(`PARSE ERROR: ${e.message ?? JSON.stringify(e)}`);
    process.exit(1);
  }
  const composition = parsed.ast;
  if (!composition) {
    log('PARSE OK but no AST');
    process.exit(1);
  }

  const skillName = args.name ?? deriveSkillName(composition);
  if (!skillName) {
    log('no skill name (no @identity.name and no --name)');
    process.exit(4);
  }

  let emitted;
  try {
    const result = new ContextCompiler({ formats: ['skill_md'] }).compile(composition, '');
    emitted = result.files['SKILL.md'];
  } catch (err) {
    log(`COMPILER ERROR: ${err.message}`);
    process.exit(2);
  }
  if (!emitted) {
    log('no SKILL.md emitted');
    process.exit(3);
  }

  // Resolve targets. ~ expands to home for real roots.
  const home = process.env.HOME || process.env.USERPROFILE || '';
  const expand = (p) => (p.startsWith('~') ? join(home, p.slice(1)) : p);

  const targets = args.dryRun
    ? args.roots
        .map((_, i) => join(resolve(args.dryRun), String(i), skillName, 'SKILL.md'))
        // if --roots omitted in dry-run, default to two synthetic roots
        .concat(
          args.roots.length === 0
            ? [
                join(resolve(args.dryRun), '0', skillName, 'SKILL.md'),
                join(resolve(args.dryRun), '1', skillName, 'SKILL.md'),
              ]
            : []
        )
    : args.roots.map((r) => join(expand(r), skillName, 'SKILL.md'));

  const written = [];
  for (const t of targets) {
    mkdirSync(dirname(t), { recursive: true });
    writeFileSync(t, emitted, 'utf8');
    written.push(t);
  }

  log(`skill "${skillName}" — ${emitted.length} chars emitted to ${written.length} root(s):`);
  for (const w of written) log(`  ${w}`);
  log('All copies are byte-identical (single source → N emits). Drift impossible by construction.');
}

main();
