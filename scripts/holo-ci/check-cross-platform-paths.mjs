#!/usr/bin/env node
/**
 * check-cross-platform-paths.mjs — fail loud on path code that breaks across the
 * mixed cloud-Linux / Windows-local agent fleet.
 *
 * WHY THIS GATE EXISTS (W.726): path bugs flow in BOTH directions across our fleet.
 * Cloud Claude/Codex sessions author on Linux; the founder's daily seats run Windows;
 * services deploy to Railway (Linux). Two real bugs stranded on cloud branches in one
 * day (2026-06-15):
 *   - Linux-authored → breaks Windows: `holoscript-agent` used `path.startsWith('/')`
 *     as an absolute-path test (3 sites) → the env-override sandbox silently fell back
 *     to fleet defaults on a Windows seat.
 *   - Windows-authored → breaks Linux deploy: mcp-server/studio carried hardcoded
 *     `C:/Users/Josep/...` paths → dead paths on the Railway target.
 * Neither was caught because HoloCI only ran on `main` and the author's OS never
 * exercised the other side. This gate runs in BOTH HoloCI and local preflight so the
 * bug is caught at the source, not when a branch strands.
 *
 * WHAT IT FLAGS (HARD — exit 1):
 *   R1 windows-drive-literal   string literal with a Windows drive root: "C:/...", 'D:\\...'
 *   R2 user-home-literal       a specific user's home dir: "/home/<u>/...", "/Users/<u>/...",
 *                              "C:/Users/<u>/..." (machine-specific; dead on any other box)
 *   R3 posix-absolute-check    `.startsWith('/')` used as an is-absolute test (false on Windows)
 *   R4 hardcoded-sep-contain   `.startsWith(<expr> + '/')` containment (wrong sep on Windows)
 *
 * The FIX in every case: `path.isAbsolute()`, `path.sep`, `os.homedir()` + `path.join()`,
 * and env-var overrides — never literal drive roots, user homes, or '/' separators.
 *
 * SCOPE: shipped/deployed source + cross-platform scripts only —
 *   packages/<pkg>/src/**  and  scripts/**  (.ts .tsx .mjs .cjs .js)
 * EXCLUDED: tests (__tests__, *.test.*, *.spec.*), fixtures, dist, node_modules,
 *   archive/_archived, *.d.ts, and anything in the allowlist. Comment-only lines are
 *   skipped for matching (a documented '/root/...' fleet path in a comment is fine).
 *
 * ALLOWLIST: scripts/holo-ci/cross-platform-paths-allowlist.json
 *   { "files": ["path/substr", ...], "lines": ["file::code-substr", ...] }
 *   `files` suppresses a whole file; `lines` suppresses one finding whose file path
 *   contains the left side and whose code contains the right side (split on "::").
 *
 * Usage:  node scripts/holo-ci/check-cross-platform-paths.mjs [--root <dir>] [--json]
 * Exit 0 = clean, 1 = violations found, 2 = usage error.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : fallback;
}
const ROOT = path.resolve(arg('--root', process.env.HOLO_ROOT || process.cwd()));
const JSON_OUT = process.argv.includes('--json');
// --changed <ref>: scan ONLY files changed vs <ref> (git diff). This is the translator's
//   mode — it catches exactly what a cloud branch introduces, with no pre-existing-debt
//   noise, so --strict is auto-enabled (the FP cost is bounded to a few changed files).
// --include-scripts: also scan scripts/** in whole-repo mode (warn-class tooling).
const CHANGED_REF = arg('--changed', null);
const INCLUDE_SCRIPTS = process.argv.includes('--include-scripts');
// R3/R4 (`startsWith('/')`) are inherently ambiguous — `/` is the correct separator for
// URLs, import specifiers, USD prim paths, HTTP routes, and REPL commands, so a blunt
// regex false-positives heavily. They run ONLY under --strict (e.g. the translator runs
// --strict against a cloud branch's CHANGED files, where the FP cost is bounded). The
// default gate is the high-precision hardcoded-machine-path check (R1/R2).
const STRICT = process.argv.includes('--strict') || !!CHANGED_REF;

if (!fs.existsSync(ROOT)) {
  console.error(`[cross-platform-paths] root not found: ${ROOT}`);
  process.exit(2);
}

// ── allowlist ────────────────────────────────────────────────────────────────
let allow = { files: [], lines: [] };
const allowPath = path.join(ROOT, 'scripts/holo-ci/cross-platform-paths-allowlist.json');
if (fs.existsSync(allowPath)) {
  try {
    const a = JSON.parse(fs.readFileSync(allowPath, 'utf8'));
    allow = { files: a.files || [], lines: a.lines || [] };
  } catch (e) {
    console.error(`[cross-platform-paths] bad allowlist: ${e.message}`);
    process.exit(2);
  }
}
const fileAllowed = (rel) => allow.files.some((f) => rel.includes(f));
const lineAllowed = (rel, code) =>
  allow.lines.some((entry) => {
    const [f, c] = entry.split('::');
    return rel.includes(f) && (c === undefined || code.includes(c));
  });

// ── file discovery ───────────────────────────────────────────────────────────
const CODE_EXT = new Set(['.ts', '.tsx', '.mjs', '.cjs', '.js']);
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', '.git', '.next', 'coverage', 'pkg', 'target']);
const isTestOrFixture = (p) =>
  /(^|[\\/])__tests__[\\/]/.test(p) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(p) ||
  /[\\/](fixtures?|__fixtures__|__mocks__|__snapshots__)[\\/]/.test(p) ||
  /[\\/](archive|_archived)[\\/]/.test(p) ||
  /\.d\.ts$/.test(p);

function walk(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') && e.name !== '.') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIR.has(e.name)) continue;
      walk(full, out);
    } else if (CODE_EXT.has(path.extname(e.name)) && !isTestOrFixture(full)) {
      out.push(full);
    }
  }
}

// --changed mode: only the files a branch added/modified vs <ref>.
function changedFiles(ref) {
  let out = '';
  for (const spec of [`${ref}...HEAD`, `${ref}`]) {
    try {
      out = execSync(`git diff --name-only --diff-filter=d ${spec}`, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      break;
    } catch {
      /* try next spec */
    }
  }
  return out
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((rel) => path.join(ROOT, rel))
    .filter((f) => CODE_EXT.has(path.extname(f)) && !isTestOrFixture(f) && fs.existsSync(f));
}

function collectFiles() {
  if (CHANGED_REF) return changedFiles(CHANGED_REF);
  const files = [];
  // DEFAULT scope = deploy-critical shipped code: packages/<pkg>/src/**. Hardcoded
  // machine paths here break the Railway/Linux deploy. scripts/** is local tooling
  // (often legitimately local) — opt in with --include-scripts (warn-class).
  const pkgRoot = path.join(ROOT, 'packages');
  if (fs.existsSync(pkgRoot)) {
    for (const e of fs.readdirSync(pkgRoot, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const src = path.join(pkgRoot, e.name, 'src');
      if (fs.existsSync(src)) walk(src, files);
    }
  }
  if (INCLUDE_SCRIPTS) {
    const scriptsRoot = path.join(ROOT, 'scripts');
    if (fs.existsSync(scriptsRoot)) walk(scriptsRoot, files);
  }
  return files;
}

// ── matchers ─────────────────────────────────────────────────────────────────
// Strip line/inline comments and string-free regions cheaply: we only NULL out
// `//...` tail comments and lines that are pure block-comment continuations. This is
// deliberately conservative — false negatives on commented code are acceptable
// (comments don't run); false positives on real code are what we must avoid.
function stripComment(line) {
  const t = line.trimStart();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return '';
  const idx = line.indexOf('//');
  // crude: drop a // only if it's not inside an obvious URL (`://`)
  if (idx >= 0 && line.slice(Math.max(0, idx - 1), idx + 1) !== ':/') return line.slice(0, idx);
  return line;
}

const RULES = [
  {
    id: 'R1 windows-drive-literal',
    // a string literal containing a Windows drive root  "C:/  'D:\\  `E:/
    re: /['"`][A-Za-z]:[\\/]/,
    hint: "Windows drive path is dead on Linux/Railway — use os.homedir()/path.join() + env override",
  },
  {
    id: 'R2 user-home-literal',
    // a specific user's home dir inside a string: /home/<u>/  /Users/<u>/  C:/Users/<u>/
    re: /(?:[\\/](?:home|Users)[\\/][A-Za-z0-9._-]+[\\/])/,
    hint: 'machine-specific home dir — use os.homedir()/path.join() + env override',
  },
  {
    id: 'R3 posix-absolute-check',
    strict: true, // ambiguous vs URL/import/USD/route uses of '/' — opt-in only
    // .startsWith('/')  — using a leading slash as an is-absolute test
    re: /\.startsWith\(\s*['"`]\/['"`]\s*\)/,
    hint: 'leading "/" is not absolute on Windows — use path.isAbsolute() (verify it is a FILESYSTEM path, not a URL/import/route)',
  },
  {
    id: 'R4 hardcoded-sep-contain',
    strict: true,
    // .startsWith(<expr> + '/')  — containment using a hardcoded POSIX separator
    re: /\.startsWith\([^)]*\+\s*['"`]\/['"`]\s*\)/,
    hint: 'hardcoded "/" separator breaks on Windows — use path.sep (verify FILESYSTEM path)',
  },
];

// URL guard for R1/R2: skip a match that is clearly inside an http(s)/ws URL.
function isUrlContext(code, matchIdx) {
  const before = code.slice(0, matchIdx);
  return /https?:|wss?:|:\/\/\s*$/.test(before.slice(-10));
}

// ── scan ─────────────────────────────────────────────────────────────────────
const findings = [];
for (const file of collectFiles()) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (fileAllowed(rel)) continue;
  let text;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  const lines = text.split('\n');
  for (let n = 0; n < lines.length; n++) {
    const raw = lines[n];
    const code = stripComment(raw);
    if (!code.trim()) continue;
    for (const rule of RULES) {
      if (rule.strict && !STRICT) continue;
      const m = rule.re.exec(code);
      if (!m) continue;
      if ((rule.id.startsWith('R1') || rule.id.startsWith('R2')) && isUrlContext(code, m.index)) continue;
      const snippet = raw.trim().slice(0, 140);
      if (lineAllowed(rel, snippet)) continue;
      findings.push({ file: rel, line: n + 1, rule: rule.id, hint: rule.hint, snippet });
    }
  }
}

// ── report ───────────────────────────────────────────────────────────────────
if (JSON_OUT) {
  console.log(JSON.stringify({ ok: findings.length === 0, count: findings.length, findings }, null, 2));
  process.exit(findings.length === 0 ? 0 : 1);
}

console.log(`\n[cross-platform-paths] scanning shipped src + scripts @ ${ROOT}`);
if (findings.length === 0) {
  console.log('  [ok]   no cross-platform path hazards found');
  console.log('\nRESULT: CLEAN — no Windows/Linux path portability hazards.');
  process.exit(0);
}
const byRule = {};
for (const f of findings) (byRule[f.rule] ||= []).push(f);
for (const [rule, fs_] of Object.entries(byRule)) {
  console.error(`\n  [FAIL] ${rule}  (${fs_.length}) — ${fs_[0].hint}`);
  for (const f of fs_) console.error(`         ${f.file}:${f.line}  ${f.snippet}`);
}
console.error(
  `\nRESULT: ${findings.length} cross-platform path hazard(s). These break across the cloud-Linux / Windows-local fleet (W.726). Fix with path.isAbsolute()/path.sep/os.homedir()/env overrides, or allowlist a documented exception in scripts/holo-ci/cross-platform-paths-allowlist.json.`
);
process.exit(1);
