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
 *   - DIFF-SCOPED on the pre-commit / `--staged` / file-arg path: only the lines you ADDED are
 *     policed, so editing a doc that already carries legitimate point-in-time counts elsewhere
 *     (e.g. design-record seeds) does not block your unrelated change. `--all` scans whole files.
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
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --files-from <list.txt>
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --staged
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --all
 *   node scripts/holo-ci/check-hardcoded-stats.mjs --help
 */
import { appendFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readScopedFileList } from './read-scoped-files.mjs';

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
    rel === 'CHANGELOG.md' ||
    rel === 'docs/founder-skill-cutover-prep.md' ||
    rel === 'docs/handbooks/idea-seeds.md' ||
    rel === 'docs/reference/DEVELOPMENT_CHRONICLE.md' ||
    rel === 'docs/reference/WHITEPAPER.md' ||
    rel === 'docs/strategy/v8-IDEAS-BACKLOG.md' ||
    /^docs\/(audit-reports|examples-health|planning|reviews)\//i.test(rel) ||
    /^docs\/strategy\/(analysis|audits|research|vision)\//i.test(rel) ||
    /(^|\/)(_?archive|archives?|node_modules|dist)(\/|$)/i.test(rel) ||
    /STALE|frozen|legacy/i.test(rel)
  );
}

function scanFile(p, onlyAdded = null) {
  const violations = [];
  const text = readFileSync(p, 'utf8');
  if (/^\s*>?\s*\*\*ARCHIVED\b|\bstale as of \d{4}-\d{2}-\d{2}\b/im.test(text.slice(0, 1000)))
    return violations;
  const lines = text.split(/\r?\n/);
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return; // code blocks legitimately contain counts
    if (onlyAdded && !onlyAdded.has(i + 1)) return; // diff-scoped: police only ADDED lines
    if (ESCAPE_RE.test(line)) return;
    const m = COUNT_RE.exec(line);
    if (m) violations.push({ line: i + 1, count: m[1], text: line.trim().slice(0, 140) });
  });
  return violations;
}

// One `git diff --cached` per file blows the pre-commit timeout on a large doc
// set (896 staged markdown files took ~35s on Windows; the hook's 20s limit
// killed it with status 124). Batch the paths instead.
//
// Chunked argv, not `--pathspec-from-file`: this repo does not pin a git
// minimum, and `--pathspec-from-file` / `--pathspec-file-nul` need Git 2.25.
// The chunked `git diff --cached -U0 -- <paths>` form is the same invocation
// the checker already depended on. Each command line stays near 8,000
// characters, well under Windows' 32,767-character CreateProcess limit.
export const GIT_DIFF_CHUNK_BUDGET = 8000;

const DIFF_ARGV_HEAD = ['git', '-c', 'core.quotepath=off', 'diff', '--cached', '-U0', '--'];

export function diffArgvLength(rels) {
  return [...DIFF_ARGV_HEAD, ...rels].join(' ').length;
}

export function chunkPathspecs(rels, budget = GIT_DIFF_CHUNK_BUDGET) {
  const chunks = [];
  let cur = [];
  for (const rel of rels) {
    if (cur.length > 0 && diffArgvLength([...cur, rel]) > budget) {
      chunks.push(cur);
      cur = [rel];
    } else {
      cur.push(rel);
    }
  }
  if (cur.length) chunks.push(cur);
  return chunks;
}

function toPosixRel(p) {
  return relative(REPO, p).split(sep).join('/');
}

// Decode a git C-quoted path (core.quotepath). Octal escapes are raw bytes.
function readGitQuoted(s) {
  const bytes = [];
  let i = 1;
  while (i < s.length) {
    const c = s[i];
    if (c === '"') return { value: Buffer.from(bytes).toString('utf8'), rest: s.slice(i + 1) };
    if (c === '\\') {
      const n = s[i + 1];
      if (n === 'n') {
        bytes.push(10);
        i += 2;
        continue;
      }
      if (n === 't') {
        bytes.push(9);
        i += 2;
        continue;
      }
      if (n === '"' || n === '\\') {
        bytes.push(n.charCodeAt(0));
        i += 2;
        continue;
      }
      const oct = /^[0-7]{1,3}/.exec(s.slice(i + 1));
      if (oct) {
        bytes.push(parseInt(oct[0], 8));
        i += 1 + oct[0].length;
        continue;
      }
      if (n) bytes.push(n.charCodeAt(0));
      i += n ? 2 : 1;
      continue;
    }
    for (const b of Buffer.from(c, 'utf8')) bytes.push(b);
    i += 1;
  }
  return { value: Buffer.from(bytes).toString('utf8'), rest: '' };
}

function stripHeaderTab(line) {
  const tab = line.indexOf('\t');
  return tab === -1 ? line : line.slice(0, tab);
}

function stripBPrefix(path) {
  return path.startsWith('b/') ? path.slice(2) : path;
}

// `diff --git a/<path> b/<path>`. Spaces stay inside the path. With
// core.quotepath=off, non-ASCII is literal; quotes and controls stay C-quoted.
function pathFromDiffGit(line) {
  const rest = stripHeaderTab(line).slice('diff --git '.length);
  if (rest.startsWith('"')) {
    const a = readGitQuoted(rest);
    const bSrc = a.rest.trimStart();
    const b = bSrc.startsWith('"') ? readGitQuoted(bSrc).value : bSrc;
    return stripBPrefix(b);
  }
  if (!rest.startsWith('a/')) return null;
  const marker = ' b/';
  let idx = rest.indexOf(marker);
  while (idx !== -1) {
    const aPath = rest.slice(2, idx);
    const bPath = rest.slice(idx + marker.length);
    if (bPath === aPath) return aPath;
    idx = rest.indexOf(marker, idx + 1);
  }
  const last = rest.lastIndexOf(marker);
  return last === -1 ? null : rest.slice(last + marker.length);
}

function pathFromPlusPlus(line) {
  const rest = stripHeaderTab(line).slice(4);
  if (rest === '/dev/null') return null;
  if (rest.startsWith('"')) {
    const value = readGitQuoted(rest).value;
    if (value === '/dev/null') return null;
    return stripBPrefix(value);
  }
  if (rest.startsWith('b/')) return rest.slice(2);
  return null;
}

// New-file-side line numbers ADDED, keyed by repo-relative posix path.
// A path missing from the diff maps to null (no staged diff → scan the whole
// file). A path present with no additions maps to an empty set.
export function parseAddedLines(diffText) {
  const map = new Map();
  let current = null;
  let newLine = 0;
  let inHunk = false;
  const touch = (rel) => {
    if (!rel) return null;
    if (!map.has(rel)) map.set(rel, new Set());
    return rel;
  };
  for (const raw of String(diffText).split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      current = touch(pathFromDiffGit(raw));
      inHunk = false;
      continue;
    }
    if (raw.startsWith('+++ ')) {
      const next = pathFromPlusPlus(raw);
      if (next) current = touch(next);
      continue;
    }
    if (!current) continue;
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (h) {
      newLine = parseInt(h[1], 10);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (raw.startsWith('+') && !raw.startsWith('+++')) {
      map.get(current).add(newLine);
      newLine += 1;
    }
    // '-' lines (deletions) and "\ No newline" do not advance the new-file counter.
  }
  return map;
}

function defaultGitDiff(rels) {
  const args = ['-c', 'core.quotepath=off', 'diff', '--cached', '-U0', '--', ...rels];
  const log = process.env.HOLO_STATS_GIT_SPAWN_LOG;
  if (log) appendFileSync(log, `${diffArgvLength(rels)}\n`);
  return execFileSync('git', args, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
}

// rels are repo-relative posix paths. runGit(chunk) returns that chunk's diff
// text. One call per chunk, not one call per file. A git failure leaves those
// paths as null so the caller scans the whole file (same as the old per-file catch).
export function addedLineSetsFor(rels, runGit = defaultGitDiff) {
  const out = new Map();
  for (const rel of rels) out.set(rel, null);
  for (const chunk of chunkPathspecs(rels)) {
    let text = '';
    try {
      text = runGit(chunk);
    } catch {
      continue;
    }
    if (!text || !text.trim()) continue;
    for (const [rel, set] of parseAddedLines(text)) out.set(rel, set);
  }
  return out;
}

function collectAllDocs() {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      const full = join(dir, e);
      if (/node_modules|\.git|dist/.test(full)) continue;
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
    return execFileSync(
      'git',
      ['-c', 'core.quotepath=off', 'diff', '--cached', '--name-only', '--diff-filter=ACM'],
      { cwd: REPO, encoding: 'utf8', windowsHide: true }
    )
      .split(/\r?\n/)
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
        '  node scripts/holo-ci/check-hardcoded-stats.mjs --files-from <list.txt>',
        '  node scripts/holo-ci/check-hardcoded-stats.mjs --staged          scan git-staged markdown',
        '  node scripts/holo-ci/check-hardcoded-stats.mjs --all             audit every doc',
        '',
        'Flags a bare count before a volatile noun (traits/compilers/MCP tools/targets/knowledge entries).',
        'Escape a legit number with a NUMBERS.md ref, a verify/find/grep command, ~approx, or "as of <date>".',
      ].join('\n')
    );
    return;
  }

  // --all is full-tree. --staged asks git. --files-from is the pre-commit path
  // (newline list, CRLF-tolerant, off the command line). Positional paths stay
  // for existing callers. --all and --staged win if combined with --files-from.
  let files;
  if (args.includes('--all')) files = collectAllDocs();
  else if (args.includes('--staged')) files = stagedDocs();
  else if (args.includes('--files-from') || args.includes('--files')) {
    files = readScopedFileList(args)
      .map((a) => resolve(REPO, a))
      .filter((f) => f.endsWith('.md'));
  } else files = args.map((a) => resolve(REPO, a)).filter((f) => f.endsWith('.md'));

  files = files.filter((f) => existsSync(f) && !isExcludedPath(f));
  if (!files.length) {
    console.log('check:hardcoded-stats — no markdown files to scan.');
    return;
  }

  // --all = whole-file audit; every other path (pre-commit file-args / --staged) is diff-scoped.
  const diffScoped = !args.includes('--all');
  const addedByRel = diffScoped ? addedLineSetsFor(files.map((f) => toPosixRel(f))) : null;
  const findings = [];
  for (const f of files) {
    const onlyAdded = diffScoped ? (addedByRel.get(toPosixRel(f)) ?? null) : null;
    for (const v of scanFile(f, onlyAdded)) findings.push({ file: relative(REPO, f), ...v });
  }

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

function invokedAsCli() {
  const entry = process.argv[1];
  if (!entry) return false;
  return resolve(entry) === fileURLToPath(import.meta.url);
}

if (invokedAsCli()) main();
