#!/usr/bin/env node
/**
 * check-hardcoded-stats.mjs — gate the "Zero Hardcoded Stats" rule so the NUMBERS.md SSOT
 * stops rotting. Ecosystem COUNTS (tool/trait/compiler/target/test/knowledge-entry counts) change
 * with every deploy; a hardcoded "158 MCP tools" is a lie within weeks. docs/NUMBERS.md is the SSOT —
 * docs must reference it or a verification command, never pin the number.
 *
 * Scope (deliberately conservative — gate NEW violations, don't retro-break the backlog):
 *   - Scans the markdown files passed as args (pre-commit hands it the STAGED .md files), or
 *     `--all` to audit every doc, or `--staged` to scan `git diff --cached` markdown.
 *   - Flags a bare integer directly preceding a known VOLATILE noun (traits, compilers, MCP tools,
 *     compile/export targets, knowledge entries, …).
 *   - SKIPS: docs/NUMBERS.md (the SSOT), archives, fenced code blocks, and any line carrying an
 *     escape marker (a NUMBERS.md reference, a verify/find/grep command, an approximation ~/approx,
 *     or a date-qualified "at time of writing" / "as of <date>"). LOC counts are code facts (allowed).
 *
 * Exit 1 on a violation with a file:line + remediation. Wire as `check:hardcoded-stats` + pre-commit.
 *
 * Usage:
 *   node scripts/holo-ci/check-hardcoded-stats.mjs <file.md> [more.md ...]
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --staged
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --all
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --help
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join, relative, sep } from 'node:path';

const REPO = resolve(process.cwd());

// Volatile ecosystem nouns: a bare count in front of one of these is the rot pattern.
const VOLATILE =
  '(?:VR\\s+)?(?:traits?|compilers?|MCP\\s+tools?|export\\s+targets?|compile\\s+targets?|domain\\s+plugins?|knowledge\\s+entries|knowledge\\s+nodes?)';
// "N tools"/"N tests" are common but ambiguous (test counts in CI logs etc.) — include only the
// HoloScript-metric framings to avoid noise.
const COUNT_RE = new RegExp(`(?<![\\w.])(\\d{2,5})\\+?\\s+${VOLATILE}\\b`, 'i');

// A line carrying any of these is intentionally pointing at the SSOT / a live check / an approximation.
const ESCAPE_RE =
  /NUMBERS\.md|verify|verif\w*|\bfind\b|\bgrep\b|\bgit\b|at time of writing|as of \d|approx|~\s*\d|≈|\bLOC\b|lines of code|placeholder|e\.g\.|for example/i;

function isExcludedPath(p) {
  const rel = relative(REPO, p).split(sep).join('/');
  return (
    rel.endsWith('docs/NUMBERS.md') ||
    /(^|\/)(_?archive|archives?|node_modules|dist)(\/|$)/i.test(rel) ||
    /STALE|frozen|legacy/i.test(rel)
  );
}

function scanFile(p) {
  const violations = [];
  const text = readFileSync(p, 'utf8');
  const lines = text.split(/\r?\n/);
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return; // code blocks legitimately contain counts
    if (ESCAPE_RE.test(line)) return;
    const m = COUNT_RE.exec(line);
    if (m) violations.push({ line: i + 1, count: m[1], text: line.trim().slice(0, 140) });
  });
  return violations;
}

function collectAllDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (/node_modules|\.git|dist|\.vitepress/.test(full)) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (e.endsWith('.md')) out.push(full);
    }
  };
  if (existsSync(join(REPO, 'docs'))) walk(join(REPO, 'docs'));
  for (const e of readdirSync(REPO)) if (e.endsWith('.md')) out.push(join(REPO, e));
  return out;
}

function stagedDocs() {
  try {
    return execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf8' })
      .split('\n')
      .filter((f) => f.endsWith('.md'))
      .map((f) => resolve(REPO, f));
  } catch {
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'check-hardcoded-stats — gate the Zero Hardcoded Stats rule (docs/NUMBERS.md is the SSOT).',
        '',
        'Usage:',
        '  node scripts/holo-ci/check-hardcoded-stats.mjs <file.md> [...]   scan specific files',
        '  node scripts/holo-ci/check-hardcoded-stats.mjs --staged          scan git-staged markdown',
        '  node scripts/holo-ci/check-hardcoded-stats.mjs --all             audit every doc',
        '',
        'Flags a bare count before a volatile noun (traits/compilers/MCP tools/targets/knowledge entries).',
        'Escape a legit number with a NUMBERS.md ref, a verify/find/grep command, ~approx, or "as of <date>".',
      ].join('\n')
    );
    return;
  }

  let files;
  if (args.includes('--all')) files = collectAllDocs();
  else if (args.includes('--staged')) files = stagedDocs();
  else files = args.map((a) => resolve(REPO, a)).filter((f) => f.endsWith('.md'));

  files = files.filter((f) => existsSync(f) && !isExcludedPath(f));
  if (!files.length) {
    console.log('check:hardcoded-stats — no markdown files to scan.');
    return;
  }

  const findings = [];
  for (const f of files) for (const v of scanFile(f)) findings.push({ file: relative(REPO, f), ...v });

  if (!findings.length) {
    console.log(`check:hardcoded-stats — OK (${files.length} file(s) clean).`);
    return;
  }

  console.error(`\n  ✗ check:hardcoded-stats — ${findings.length} hardcoded ecosystem count(s):\n`);
  for (const f of findings) {
    console.error(`    ${f.file}:${f.line}  "${f.count} …"  →  ${f.text}`);
  }
  console.error(
    [
      '',
      '  Ecosystem counts change every deploy — a pinned number is a lie within weeks.',
      '  Reference docs/NUMBERS.md or the verification command instead of the literal count,',
      '  or date-qualify it ("as of <date>") / mark it approximate (~N).',
      '',
    ].join('\n')
  );
  process.exit(1);
}

main();
