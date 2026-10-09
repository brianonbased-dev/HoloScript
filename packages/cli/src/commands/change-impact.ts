/**
 * `holoscript impact --since <ref>` — HoloCI change report built on the
 * absorbed codebase graph (task_1791232117105_b2p1).
 *
 * Three answers about a git change, all read from the SAME Absorb handlers and
 * workspace cache that serve the `holo_impact_analysis` / `holo_query_codebase`
 * MCP tools (no second scanner, no second index):
 *
 *   1. Test selection — the test files the change can reach through the
 *      import graph, instead of every test in the touched packages. When no
 *      authoritative graph exists (or the traversal was cut short) it falls
 *      back to "every test in the touched packages" and says so. Selecting too
 *      FEW tests is the dangerous failure, so whatever the graph cannot place
 *      keeps a whole suite, with the reason in `tests.fullSuitePackages`:
 *        - a deleted (or renamed-away) code file the graph no longer holds —
 *          the files that imported it cannot be listed;
 *        - a changed code file the graph has no node for;
 *        - any changed non-code file (fixture, snapshot, data, manifest,
 *          lockfile, config) — tests read those without an import edge;
 *        - test/build config with a code extension (vitest.config.ts, ...);
 *        - changed test support code (a setup file, helper or fixture under a
 *          test directory) — a runner or a test loads it by path;
 *      and such a file outside every package keeps EVERY test in the repo.
 *      A test can also name a file by path: read a docs page, spawn a CLI,
 *      start a worker. So a changed file, and with the graph every file in its
 *      reach, also selects the tests that name it (`tests.namedBy`): prose from
 *      any test, code from tests in its own package or outside every package.
 *      Tests that read Markdown or code files by pattern (`*.md`,
 *      `.endsWith('.ts')`) count as naming every such file. A helper (test
 *      support code) that names a file passes the change on to its users: with
 *      the graph, the helper's own reach joins the selection reach and goes
 *      through these same rules, repeating until no new helper appears
 *      (`tests.viaHelpers`). Without the graph, when the graph cannot list a
 *      helper's users, or when nothing imports it or names it by name, the
 *      helper's package suite is kept (except a helper that runs on its own: a
 *      `#!` program, or a *.bench / *.benchmark file run by hand with vitest
 *      bench; it is listed instead). A setup file a runner config names keeps
 *      that config's suite. Prose no test names selects nothing;
 *      that is the only inert change. Every git call pins its output shape
 *      (--no-color, -z, fixed diff prefixes), and a search whose output cannot
 *      be read keeps every test.
 *   2. Forgotten callers — for each exported symbol whose declaration line
 *      changed, the call sites in files the change did NOT touch.
 *   3. Reviewer brief — a short plain-text summary of 1 and 2.
 *
 * Known limit, stated in every report: the graph resolves relative imports
 * only. A consumer that imports a package by name (`@holoscript/core`) is not
 * traced, so graph mode covers reach WITHIN each package. The report lists the
 * workspace packages that depend on a touched package so nobody reads
 * "3 tests" as "nothing else can break". For the same reason a test that reads
 * ANOTHER package's data file (JSON, YAML, .rs, ...) by path is not found: data
 * names are not matched across packages (`res.json()` reads like a file name).
 * The brief says so whenever a changed data file sits inside a package
 * (`tests.untracedDataFiles`). Path aliases and vi.importActual are not import
 * edges the graph holds either: a test that reaches a changed file, or a
 * helper, only that way is not found; nor is a test that runs a program (a
 * `#!` file) or a benchmark by a computed path. Such files that nothing
 * imports or names are listed in `tests.viaHelpers` (`runsAlone`), not dropped
 * silently. The brief says so whenever a helper was followed.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

type ToolHandler = (name: string, args: Record<string, unknown>) => Promise<unknown>;

export interface ChangeImpactDeps {
  handleCodebaseTool: ToolHandler;
  /** Run git in repoRoot and return stdout. */
  git: (args: string[]) => string;
  fileExists: (absPath: string) => boolean;
  readFile: (absPath: string) => string;
}

export interface ChangeImpactOptions {
  /** Git top-level directory: changed paths, packages and tests are relative to it. */
  repoRoot: string;
  /**
   * Root the codebase graph covers (default: repoRoot). A package-scoped graph
   * is enough for test selection because the graph traces relative imports
   * only; changed files outside it keep their package's whole suite.
   */
  graphRoot?: string;
  /** `<ref>` (diff vs working tree) or `<a>..<b>` / `<a>...<b>` (commit range). */
  since: string;
  /** Absorb (force:false, incremental) before reading the graph. */
  refresh?: boolean;
  /** Poll interval while a backgrounded absorb runs (tests pass 0). */
  absorbPollMs?: number;
}

export interface ChangedSymbol {
  name: string;
  owner?: string;
  kind: 'function' | 'class' | 'const' | 'method';
  file: string;
  /** removed = declaration line gone with no replacement (rename/delete). */
  change: 'signature' | 'removed';
}

export interface CallerSite {
  file: string;
  line: number;
  callerId: string;
}

export interface ForgottenCallerEntry {
  symbol: string;
  file: string;
  change: ChangedSymbol['change'];
  /** Callers in untouched files that also import the changed file (graph-confirmed). */
  confirmed: CallerSite[];
  /**
   * Untouched-file call sites that only match by name: the graph does not link
   * the file to the change (it may be another symbol of the same name, or an
   * import the graph does not follow: by package name, or of a deleted file).
   */
  nameOnly: CallerSite[];
  /** nameOnly.length (kept for consumers of the first schema). */
  nameOnlyCount: number;
}

export interface ChangeImpactReport {
  schema: 'holoscript.change-impact.v1';
  repoRoot: string;
  graphRoot: string;
  since: string;
  mode: 'graph' | 'package-fallback';
  modeReason: string;
  cacheNote?: string;
  changedFiles: string[];
  touchedPackages: string[];
  affectedFiles: string[];
  affectedCount: number;
  tests: {
    selected: string[];
    /** Every test file in the packages the change or its reach touches. */
    fullSet: string[];
    /**
     * Packages whose whole suite stays selected, with why. `pkg` is the
     * package directory, or `.` (REPO_SCOPE) for a change outside every
     * package, which keeps every test in the repo.
     */
    fullSuitePackages: Array<{ pkg: string; reason: string }>;
    /**
     * Changed files (and, with the graph, files in their reach) that tests
     * name by path, with the tests this adds to the selection: a test that
     * reads, spawns or loads a file by path has no import edge to it.
     */
    namedBy: Array<{ file: string; tests: string[] }>;
    /**
     * Changed data files inside a package (non-code, non-prose). Their package
     * suite is kept, but a test in ANOTHER package that reads one by path is
     * not searched for: data names are not matched across packages.
     */
    untracedDataFiles: string[];
    /**
     * Helpers (test support code the runner does not run alone) that name a
     * changed or reached file by path, or read such files by pattern. With the
     * graph, the tests that reach a helper are selected (`tests`); a helper
     * whose users the graph cannot list keeps its package suite instead.
     * `runsAlone`: a helper nothing imports or names that runs on its own: a
     * `#!` program, or a benchmark run by hand with `vitest bench`. It is
     * listed, keeps no suite and selects nothing (a test that runs it by a
     * computed path is not found).
     */
    viaHelpers: Array<{
      helper: string;
      reason: string;
      tests: string[];
      runsAlone?: 'program' | 'benchmark';
    }>;
  };
  callers: {
    available: boolean;
    reason?: string;
    changedSymbols: ChangedSymbol[];
    forgotten: ForgottenCallerEntry[];
  };
  /** Workspace packages that import a touched package by name — not traced by the graph. */
  untracedDependents: string[];
  brief: string;
}

const TEST_FILE_RE = /(?:^|\/)(?:__tests__\/.*\.[cm]?[jt]sx?|[^/]+\.(?:test|spec)\.[cm]?[jt]sx?)$/;
/** A test file the runner runs on its own; nothing imports one, so it needs no reach. */
const RUNNABLE_TEST_RE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
/**
 * A benchmark (*.bench / *.benchmark): run by hand with `vitest bench`, never
 * by a test run. Not a test to select; a helper like any other when something
 * imports or names it, and listed (not a reason to keep a suite) when nothing does.
 */
const BENCH_FILE_RE = /\.(?:bench|benchmark)\.[cm]?[jt]sx?$/;
const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION_FILE_RE = /\.d\.[cm]?ts$/;
/**
 * Files whose change can alter how a whole package's tests behave although no
 * import edge points at them: manifests, lockfiles, and compiler / test-runner
 * config and setup. The code-extension ones need this rule — the graph holds a
 * vitest.config.ts as a node, but nothing imports it, so its reach is empty.
 */
const PACKAGE_WIDE_FILE_RE =
  /(?:^|\/)(?:package\.json|package-lock\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|yarn\.lock|\.npmrc|tsconfig[^/]*\.json|(?:vite|vitest|jest|tsup|babel)(?:\.[\w-]+)*\.config\.[cm]?[jt]s|vitest\.(?:workspace|setup|shared)[^/]*\.[cm]?[jt]s)$/;
/** Prose. Keeps no whole suite unless it sits where tests keep their inputs (see TEST_DATA_DIR_RE). */
const INERT_FILE_RE = /\.(?:md|mdx|markdown|rst)$/i;
const TEST_DATA_DIR_RE =
  /(?:^|\/)(?:__tests__|__fixtures__|__snapshots__|fixtures?|tests?|testdata|test-data|golden)\//i;
/** Test-runner config: it names the setup files the runner loads by path for every test. */
const RUNNER_CONFIG_RE =
  /(?:^|\/)(?:(?:vite|vitest|jest)(?:\.[\w-]+)*\.config|vitest\.workspace[^/]*)\.[cm]?[jt]s$/;
/**
 * A file name in source text, as `git grep -E` reads it: `cli.ts`, `README.md`,
 * and patterns such as `*.md`, `'.md'` or `${name}.ts`.
 */
const NAMED_FILE_RE = '[A-Za-z0-9_.$*{}-]*\\.(mdx?|markdown|rst|[cm]?[jt]sx?)\\b';
const NAMED_FILE_PARTS_RE = /^(.*)\.(mdx?|markdown|rst|[cm]?[jt]sx?)$/i;
const CODE_EXT_RE = /\.[cm]?[jt]sx?$/i;
/** fullSuitePackages scope for a change outside every package: every test in the repo. */
export const REPO_SCOPE = '.';

export function isTestFile(file: string): boolean {
  return TEST_FILE_RE.test(toPosix(file));
}

/** A test file a test run executes. A benchmark is run by hand with vitest bench instead. */
function runsInTests(file: string): boolean {
  return isTestFile(file) && !BENCH_FILE_RE.test(toPosix(file));
}

/**
 * Prose outside test/fixture directories: its change keeps no whole suite.
 * The tests that name it (or read Markdown by pattern) are still selected.
 */
export function isInertFile(file: string): boolean {
  const posix = toPosix(file);
  return INERT_FILE_RE.test(posix) && !TEST_DATA_DIR_RE.test(posix);
}

/** Code a runner or a test loads by path: a setup file, helper or fixture under a test directory. */
function isTestSupport(file: string): boolean {
  const posix = toPosix(file);
  return CODE_FILE_RE.test(posix) && TEST_DATA_DIR_RE.test(posix) && !RUNNABLE_TEST_RE.test(posix);
}

/** Files that tests and runner configs name by path (see indexNamedFiles). */
export interface NamedFileIndex {
  /** Lower-case Markdown file name -> files that name it. */
  prose: Map<string, string[]>;
  /** Files that read Markdown by pattern (`*.md`, `'.md'`, `${name}.md`). */
  prosePattern: string[];
  /** Lower-case code file name without its extension -> files that name it (`cli.ts`, `dist/cli.js`). */
  code: Map<string, string[]>;
  /** Files that read code files by pattern (`*.ts`, `.endsWith('.js')`). */
  codePattern: string[];
  /**
   * Output lines not in the `path\0name` shape asked for (a git setting such as
   * grep.lineNumber or color.ui=always reshaped them). Any at all means the
   * index cannot be trusted.
   */
  unread: number;
}

/** Index `git grep -z -o -E NAMED_FILE_RE` output (`path\0match` lines). */
export function indexNamedFiles(grepOutput: string): NamedFileIndex {
  const prose = new Map<string, Set<string>>();
  const code = new Map<string, Set<string>>();
  const prosePattern = new Set<string>();
  const codePattern = new Set<string>();
  let unread = 0;
  const add = (map: Map<string, Set<string>>, name: string, reader: string) => {
    if (!map.has(name)) map.set(name, new Set());
    map.get(name)!.add(reader);
  };
  for (const line of grepOutput.split('\n')) {
    if (line.trim() === '') continue;
    const fields = line.split('\0');
    // eslint-disable-next-line no-control-regex
    const colored = /\x1b/.test(line);
    const parts =
      fields.length === 2 && !colored ? NAMED_FILE_PARTS_RE.exec(fields[1].trim()) : null;
    if (!fields[0] || !parts) {
      unread++;
      continue;
    }
    const reader = toPosix(fields[0]);
    const stem = parts[1].toLowerCase();
    const isProse = INERT_FILE_RE.test(`.${parts[2]}`);
    if (stem === '' || /[*{}$]/.test(stem)) {
      (isProse ? prosePattern : codePattern).add(reader);
    } else if (isProse) {
      add(prose, `${stem}.${parts[2].toLowerCase()}`, reader);
    } else {
      add(code, stem, reader);
    }
  }
  const lists = (map: Map<string, Set<string>>) =>
    new Map(Array.from(map, ([name, readers]) => [name, Array.from(readers)]));
  return {
    prose: lists(prose),
    prosePattern: Array.from(prosePattern),
    code: lists(code),
    codePattern: Array.from(codePattern),
    unread,
  };
}

/**
 * File names written in test files and runner configs. Returns null when the
 * search could not run; `git grep` exits 1 when nothing matches. The --no-*
 * flags override settings (grep.lineNumber, grep.column, color.ui=always)
 * that add fields or color codes to every line.
 */
function grepNamedFiles(git: ChangeImpactDeps['git']): string | null {
  try {
    return git([
      'grep',
      '--no-line-number',
      '--no-column',
      '--no-color',
      '-z',
      '-o',
      '-I',
      '-i',
      '-E',
      NAMED_FILE_RE,
      '--',
      '*.test.*',
      '*.spec.*',
      '*__tests__/*',
      '*.config.*',
      '*vitest.workspace*',
    ]);
  } catch (err) {
    return (err as { status?: unknown }).status === 1 ? '' : null;
  }
}

/**
 * Parse `git diff --name-status --no-renames -z`. With --no-renames a rename
 * arrives as `D old` + `A new`, so the old path (which other files may still
 * import) is not hidden behind the new name.
 */
export function parseNameStatus(output: string): Array<{ status: string; file: string }> {
  const parts = output.split('\0');
  const out: Array<{ status: string; file: string }> = [];
  for (let i = 0; i + 1 < parts.length; i += 2) {
    const status = parts[i].trim();
    const file = parts[i + 1];
    if (!status || !file) continue;
    out.push({ status: status[0], file: toPosix(file) });
  }
  return out;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, '/');
}

/** Comparison key: posix separators, lower-case drive-letter paths (Windows is case-insensitive). */
function key(p: string): string {
  const posix = toPosix(p).replace(/\/+$/, '');
  return /^[A-Za-z]:\//.test(posix) ? posix.toLowerCase() : posix;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function diffRangeArgs(since: string): string[] {
  // `a..b` / `a...b` compare two commits; a bare ref compares against the working tree.
  return [since];
}

const KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'function',
  'constructor',
  'super',
  'new',
  'typeof',
  'await',
  'else',
  'do',
  'try',
  'with',
  'get',
  'set',
]);

const EXPORT_DECL_RE =
  /^\s*export\s+(?:default\s+)?(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(function\*?|class|const|let|var)\s+([A-Za-z_$][\w$]*)/;
const METHOD_DECL_RE =
  /^\s+(?:(?:public|protected|static|async|override|readonly)\s+)*([A-Za-z_$][\w$]*)\s*(?:<[^>()]*>)?\s*\(/;
const PRIVATE_METHOD_RE = /^\s+(?:(?:static|async|override)\s+)*(?:private\s|#)/;
const CLASS_CONTEXT_RE = /\bclass\s+([A-Za-z_$][\w$]*)/;

function kindOf(token: string): ChangedSymbol['kind'] {
  if (token.startsWith('function')) return 'function';
  if (token === 'class') return 'class';
  return 'const';
}

/** C escapes git uses in a quoted path, besides octal bytes and the literal \" and \\. */
const GIT_PATH_ESCAPES: Record<string, number> = { a: 7, b: 8, f: 12, n: 10, r: 13, t: 9, v: 11 };

/**
 * Undo git's C-style path quoting. A path with non-ASCII bytes (core.quotePath,
 * on by default) or a quote, backslash or control character arrives quoted:
 * `"b/src/caf\303\251.ts"` is `b/src/café.ts`. Anything unquoted is returned as is.
 */
export function unquoteGitPath(p: string): string {
  if (p.length < 2 || !p.startsWith('"') || !p.endsWith('"')) return p;
  // Work on UTF-8 bytes: a backslash (0x5c) is never part of a multi-byte character.
  const src = Buffer.from(p.slice(1, -1), 'utf8');
  const out: number[] = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== 0x5c || i + 1 >= src.length) {
      out.push(src[i]);
      continue;
    }
    const octal = src.subarray(i + 1, i + 4).toString('latin1');
    if (/^[0-7]{3}$/.test(octal)) {
      out.push(parseInt(octal, 8));
      i += 3;
      continue;
    }
    const next = src[i + 1];
    out.push(GIT_PATH_ESCAPES[String.fromCharCode(next)] ?? next);
    i += 1;
  }
  return Buffer.from(out).toString('utf8');
}

/**
 * Exported symbols whose declaration line changed in a unified diff (`-U0` is
 * enough). A declaration that appears on a removed line is "signature" when a
 * same-named declaration is re-added with different text, "removed" when it is
 * not re-added in the same file. Pure additions are skipped — a new symbol has
 * no callers to forget. Class methods are picked up when git's hunk header
 * names the enclosing class (best effort; private methods are skipped).
 */
export function extractChangedExportedSymbols(diff: string): ChangedSymbol[] {
  type Decl = { name: string; owner?: string; kind: ChangedSymbol['kind']; text: string };
  const removedByFile = new Map<string, Decl[]>();
  const addedByFile = new Map<string, Decl[]>();
  let file: string | null = null;
  let owner: string | undefined;
  let inHunk = false;

  const push = (map: Map<string, Decl[]>, decl: Decl) => {
    if (!file) return;
    if (!map.has(file)) map.set(file, []);
    map.get(file)!.push(decl);
  };

  for (const raw of diff.split(/\r?\n/)) {
    if (raw.startsWith('diff --git ')) {
      file = null;
      owner = undefined;
      inHunk = false;
      continue;
    }
    if (!inHunk && raw.startsWith('+++ ')) {
      const target = unquoteGitPath(raw.slice(4).trim());
      if (target !== '/dev/null') file = target.replace(/^b\//, '');
      continue;
    }
    if (!inHunk && raw.startsWith('--- ')) {
      const source = unquoteGitPath(raw.slice(4).trim());
      if (source !== '/dev/null') file = source.replace(/^a\//, '');
      continue;
    }
    if (raw.startsWith('@@')) {
      inHunk = true;
      const context = raw.replace(/^@@[^@]*@@/, '');
      const cls = CLASS_CONTEXT_RE.exec(context);
      owner = cls ? cls[1] : undefined;
      continue;
    }
    if (!file || !CODE_FILE_RE.test(file) || isTestFile(file) || DECLARATION_FILE_RE.test(file)) {
      continue;
    }
    const sign = raw[0];
    if (sign !== '-' && sign !== '+') continue;
    const body = raw.slice(1);
    const map = sign === '-' ? removedByFile : addedByFile;

    const exp = EXPORT_DECL_RE.exec(body);
    if (exp) {
      push(map, { name: exp[2], kind: kindOf(exp[1]), text: body.trim() });
      continue;
    }
    if (owner && !PRIVATE_METHOD_RE.test(body)) {
      const method = METHOD_DECL_RE.exec(body);
      // A method declaration ends its line with `{` or a return-type annotation;
      // a call statement ends with `;` or `,` and is not a declaration.
      if (method && !KEYWORDS.has(method[1]) && !/[;,]\s*$/.test(body)) {
        push(map, { name: method[1], owner, kind: 'method', text: body.trim() });
      }
    }
  }

  const out: ChangedSymbol[] = [];
  const seen = new Set<string>();
  for (const [changedFile, removed] of removedByFile) {
    const added = addedByFile.get(changedFile) ?? [];
    for (const decl of removed) {
      const id = `${changedFile}::${decl.owner ?? ''}.${decl.name}`;
      if (seen.has(id)) continue;
      const replacement = added.filter((a) => a.name === decl.name && a.owner === decl.owner);
      if (replacement.some((a) => a.text === decl.text)) continue; // moved line, same text
      seen.add(id);
      out.push({
        name: decl.name,
        ...(decl.owner && { owner: decl.owner }),
        kind: decl.kind,
        file: changedFile,
        change: replacement.length > 0 ? 'signature' : 'removed',
      });
    }
  }
  return out;
}

/** Nearest directory holding a package.json, walking up from the file (repo-relative). */
function packageOf(
  relFile: string,
  repoRoot: string,
  fileExists: ChangeImpactDeps['fileExists'],
  cache: Map<string, string | null>
): string | null {
  let dir = path.posix.dirname(toPosix(relFile));
  const visited: string[] = [];
  while (dir && dir !== '.' && dir !== '/') {
    if (cache.has(dir)) {
      const hit = cache.get(dir)!;
      for (const v of visited) cache.set(v, hit);
      return hit;
    }
    visited.push(dir);
    if (fileExists(path.join(repoRoot, dir, 'package.json'))) {
      for (const v of visited) cache.set(v, dir);
      return dir;
    }
    dir = path.posix.dirname(dir);
  }
  for (const v of visited) cache.set(v, null);
  return null;
}

function conventionTestsFor(
  relFile: string,
  repoRoot: string,
  fileExists: ChangeImpactDeps['fileExists']
): string[] {
  const posix = toPosix(relFile);
  const m = /^(.*\/)?([^/]+)\.([cm]?[jt]sx?)$/.exec(posix);
  if (!m) return [];
  const dir = m[1] ?? '';
  const base = m[2];
  const candidates: string[] = [];
  for (const ext of ['ts', 'tsx', 'js', 'mjs']) {
    for (const flavour of ['test', 'spec']) {
      candidates.push(`${dir}${base}.${flavour}.${ext}`);
      candidates.push(`${dir}__tests__/${base}.${flavour}.${ext}`);
    }
  }
  return candidates.filter((c) => fileExists(path.join(repoRoot, c)));
}

function workspaceDependents(
  touchedPackages: string[],
  allPackageDirs: string[],
  repoRoot: string,
  readFile: ChangeImpactDeps['readFile']
): string[] {
  const nameOf = new Map<string, string>();
  const manifests = new Map<string, Record<string, unknown>>();
  for (const dir of allPackageDirs) {
    try {
      const manifest = JSON.parse(readFile(path.join(repoRoot, dir, 'package.json')));
      manifests.set(dir, manifest);
      if (typeof manifest.name === 'string') nameOf.set(dir, manifest.name);
    } catch {
      /* unreadable manifest — not a workspace package we can reason about */
    }
  }
  const touchedNames = new Set(
    touchedPackages.map((p) => nameOf.get(p)).filter((n): n is string => Boolean(n))
  );
  if (touchedNames.size === 0) return [];
  const touched = new Set(touchedPackages);
  const out: string[] = [];
  for (const [dir, manifest] of manifests) {
    if (touched.has(dir)) continue;
    const deps = {
      ...(manifest.dependencies as Record<string, string> | undefined),
      ...(manifest.devDependencies as Record<string, string> | undefined),
      ...(manifest.peerDependencies as Record<string, string> | undefined),
    };
    if (Object.keys(deps).some((dep) => touchedNames.has(dep))) out.push(dir);
  }
  return out.sort();
}

export function renderReviewerBrief(report: Omit<ChangeImpactReport, 'brief'>): string {
  const lines: string[] = [];
  const pkgList = report.touchedPackages.length ? report.touchedPackages.join(', ') : 'no package';
  lines.push(`Change since ${report.since}: ${report.changedFiles.length} file(s) in ${pkgList}.`);
  if (report.mode === 'graph') {
    const scope =
      key(report.graphRoot) === key(report.repoRoot)
        ? 'the codebase graph'
        : `the codebase graph of ${toPosix(path.relative(report.repoRoot, report.graphRoot))}`;
    lines.push(
      `Reach (from ${scope}): ${report.affectedCount} file(s) can be affected through imports.`
    );
    lines.push(
      `Tests: ${report.tests.selected.length} of ${report.tests.fullSet.length} test file(s) in these packages can see this change.`
    );
  } else {
    lines.push(`Reach: not measured — ${report.modeReason}`);
    lines.push(
      `Tests: all ${report.tests.selected.length} test file(s) in the touched packages (no graph to narrow them).`
    );
  }
  for (const full of report.tests.fullSuitePackages) {
    const scope =
      full.pkg === REPO_SCOPE ? 'every package (the change is outside them all)' : full.pkg;
    lines.push(`  Whole suite kept for ${scope}: ${full.reason}`);
  }
  const named = report.tests.namedBy ?? [];
  for (const entry of named.slice(0, 5)) {
    const shown = entry.tests.slice(0, 3).join(', ');
    const more = entry.tests.length > 3 ? ` (+${entry.tests.length - 3} more)` : '';
    lines.push(
      `  Named by path: ${entry.file} — ${entry.tests.length} test file(s) name it and can read or load it with no import: ${shown}${more}`
    );
  }
  if (named.length > 5) {
    lines.push(`  Named by path: ${named.length - 5} more file(s), listed in tests.namedBy.`);
  }
  const helpers = report.tests.viaHelpers ?? [];
  for (const via of helpers.slice(0, 5)) {
    const shown = via.tests.slice(0, 3).join(', ');
    const more = via.tests.length > 3 ? ` (+${via.tests.length - 3} more)` : '';
    const users =
      via.runsAlone === 'program'
        ? 'it is a program run on its own, and no test imports it or names it by name'
        : via.runsAlone === 'benchmark'
          ? 'it is a benchmark run by hand with vitest bench, and no test imports it or names it by name'
          : via.tests.length > 0
            ? `${via.tests.length} test file(s) use it directly: ${shown}${more}`
            : 'its users are reached through other files';
    lines.push(`  Via helper: ${via.helper} ${via.reason}; ${users}`);
  }
  if (helpers.length > 0) {
    lines.push(
      '  Helper users are found through relative imports and file names only; a test that reaches a helper through a path alias, vi.importActual or a computed path is not found.'
    );
  }
  const data = report.tests.untracedDataFiles ?? [];
  if (data.length > 0) {
    const more = data.length > 1 ? ` and ${data.length - 1} more data file(s)` : '';
    lines.push(
      `  Not searched: a test in another package that reads ${data[0]}${more} by path; data names are not matched across packages.`
    );
  }
  if (!report.callers.available) {
    lines.push(`Callers: not checked — ${report.callers.reason ?? 'no graph'}.`);
  } else if (report.callers.changedSymbols.length === 0) {
    lines.push('Callers: no exported function, class or method changed its declaration.');
  } else {
    const sites = (list: CallerSite[], total: number) => {
      const where = list
        .slice(0, 3)
        .map((c) => `${c.file}:${c.line}`)
        .join(', ');
      return total > 3 ? `${where} (+${total - 3} more)` : where;
    };
    const flagged = report.callers.forgotten.filter((f) => f.confirmed.length > 0);
    const nameOnly = report.callers.forgotten.filter((f) => f.nameOnlyCount > 0);
    const possible =
      nameOnly.length > 0 ? `; ${nameOnly.length} have possible callers matched by name only` : '';
    lines.push(
      `Callers: ${report.callers.changedSymbols.length} exported declaration(s) changed; ${flagged.length} still have callers in files this change did not touch${possible}.`
    );
    for (const entry of flagged.slice(0, 10)) {
      lines.push(
        `  CHECK ${entry.symbol} (${entry.change}) — called from ${sites(entry.confirmed, entry.confirmed.length)}`
      );
    }
    for (const entry of nameOnly.slice(0, 10)) {
      lines.push(
        `  NAME-ONLY ${entry.symbol} (${entry.change}) — called by name from ${sites(entry.nameOnly ?? [], entry.nameOnlyCount)}; the graph does not link those files to the change (another symbol of that name, or an import it does not follow: by package name, or of a deleted file)`
      );
    }
  }
  if (report.untracedDependents.length > 0) {
    const shown = report.untracedDependents.slice(0, 8).join(', ');
    const more =
      report.untracedDependents.length > 8
        ? ` and ${report.untracedDependents.length - 8} more`
        : '';
    lines.push(
      `Not traced: ${report.untracedDependents.length} other package(s) use a touched package by name (${shown}${more}); the graph does not follow those imports.`
    );
  }
  return lines.join('\n');
}

/**
 * Absorb `rootDir` (incremental, force:false) and WAIT until the cache is
 * published. A large repo (HoloScript: ~20k git-visible files, over the 1000-file
 * foreground threshold) is auto-backgrounded into a worker thread of THIS
 * process and answers `{ async: true, jobId }` at once; reading the graph
 * before the job completes — or exiting, which kills the worker — finds no
 * graph. `maxFiles` defaults above the absorb default (20000) because a scan
 * truncated at maxFiles is incomplete and so never authoritative.
 */
export async function absorbAndWait(
  handleCodebaseTool: ToolHandler,
  rootDir: string,
  options: { maxFiles?: number; pollMs?: number; timeoutMs?: number } = {}
): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; error: string }> {
  const started = asRecord(
    await handleCodebaseTool('holo_absorb_repo', {
      rootDir,
      force: false,
      outputFormat: 'stats',
      includeBuildArtifacts: false,
      interactive: false,
      maxFiles: options.maxFiles ?? 100_000,
    })
  );
  if (started.error) {
    return { ok: false, error: String(started.message ?? started.error) };
  }
  if (started.async !== true || typeof started.jobId !== 'string') {
    return { ok: true, result: started };
  }
  const pollMs = options.pollMs ?? 2000;
  const deadline = Date.now() + (options.timeoutMs ?? 60 * 60 * 1000);
  for (;;) {
    const status = asRecord(
      await handleCodebaseTool('holo_get_absorb_status', { jobId: started.jobId })
    );
    if (status.status === 'complete') return { ok: true, result: status };
    if (status.status === 'error' || status.status === 'cancelled') {
      return {
        ok: false,
        error: `absorb job ${started.jobId} ${String(status.status)}: ${String(status.error ?? status.phase ?? '')}`,
      };
    }
    if (status.error && status.retryable !== true) {
      return { ok: false, error: String(status.error) };
    }
    if (Date.now() > deadline) {
      return { ok: false, error: `absorb job ${started.jobId} still running at the timeout` };
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
}

function defaultDeps(repoRoot: string): Omit<ChangeImpactDeps, 'handleCodebaseTool'> {
  return {
    git: (args) =>
      execFileSync('git', ['-C', repoRoot, ...args], {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      }),
    fileExists: (p) => fs.existsSync(p),
    readFile: (p) => fs.readFileSync(p, 'utf8'),
  };
}

export async function analyzeChangeImpact(
  options: ChangeImpactOptions,
  injected?: Partial<ChangeImpactDeps>
): Promise<ChangeImpactReport> {
  const repoRoot = path.resolve(options.repoRoot);
  const graphRoot = path.resolve(options.graphRoot ?? options.repoRoot);
  const base = defaultDeps(repoRoot);
  const handleCodebaseTool =
    injected?.handleCodebaseTool ??
    (await import('@holoscript/absorb-service/mcp')).handleCodebaseTool;
  const deps: ChangeImpactDeps = { ...base, ...injected, handleCodebaseTool };
  const range = diffRangeArgs(options.since);

  // ── What changed ──────────────────────────────────────────────────────────
  // --no-renames: a rename is the delete of the old path plus the add of the
  // new one. Under rename detection git lists only the new name, and the files
  // that still import the old path would lose their tests.
  const changes = parseNameStatus(
    deps.git(['diff', '--name-status', '--no-renames', '-z', ...range])
  );
  const changedFiles = Array.from(new Set(changes.map((c) => c.file)));
  const deletedKeys = new Set(changes.filter((c) => c.status === 'D').map((c) => key(c.file)));
  const isDeleted = (f: string) => deletedKeys.has(key(f));
  const present = changedFiles.filter((f) => !isDeleted(f));
  // The --no-* and prefix flags override settings that reshape the patch:
  // color.ui=always (color codes on every line), diff.mnemonicPrefix or
  // diff.noprefix (c/ w/ or no prefixes), diff.external and textconv drivers.
  const diff = deps.git([
    'diff',
    '-U0',
    '--no-renames',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--src-prefix=a/',
    '--dst-prefix=b/',
    ...range,
    '--',
    '*.ts',
    '*.tsx',
    '*.mts',
    '*.cts',
    '*.js',
    '*.mjs',
    '*.cjs',
    '*.jsx',
  ]);

  const pkgCache = new Map<string, string | null>();
  const pkgOf = (f: string) => packageOf(f, repoRoot, deps.fileExists, pkgCache);
  const touchedPackages = Array.from(
    new Set(changedFiles.map(pkgOf).filter((p): p is string => Boolean(p)))
  ).sort();

  // -z: without it core.quotePath (on by default) prints a non-ASCII path as
  // "caf\303\251.test.ts", which matches no test pattern.
  const trackedFiles = deps
    .git(['ls-files', '-z'])
    .split('\0')
    .filter(Boolean)
    .map(toPosix)
    // An unstaged delete is still in the index; never hand the runner a missing file.
    .filter((f) => !isDeleted(f));
  const testsInPackage = (pkg: string) =>
    pkg === REPO_SCOPE
      ? trackedFiles.filter((f) => runsInTests(f))
      : trackedFiles.filter((f) => f.startsWith(`${pkg}/`) && runsInTests(f) && pkgOf(f) === pkg);
  const testsIn = (scopes: Iterable<string>) =>
    Array.from(new Set(Array.from(scopes).flatMap(testsInPackage))).sort();
  const allPackageDirs = Array.from(
    new Set(
      trackedFiles
        .filter((f) => /(?:^|\/)package\.json$/.test(f) && !f.includes('node_modules/'))
        .map((f) => path.posix.dirname(f))
        .filter((d) => d !== '.')
    )
  );
  const untracedDependents = workspaceDependents(
    touchedPackages,
    allPackageDirs,
    repoRoot,
    deps.readFile
  );

  // ── Whole suites the graph cannot narrow (true with or without a graph) ───
  // A test can read a fixture, snapshot or data file, and a manifest, lockfile
  // or runner config changes how every test runs — none of that is an import
  // edge. Such a change keeps its package's whole suite; outside every package
  // it keeps every test in the repo. Unsure means more tests, never fewer.
  const fullSuite = new Map<string, string>();
  const keepScope = (scope: string | null, why: string) => {
    const target = scope ?? REPO_SCOPE;
    if (fullSuite.has(target)) return;
    fullSuite.set(
      target,
      scope ? why : `${why}; it is outside every package, so every test in the repo is kept`
    );
  };
  const keepSuite = (f: string, why: string) => keepScope(pkgOf(f), why);
  const keepChangedSupportSuite = (f: string) =>
    keepSuite(
      f,
      `${f} changed and is test support code (a setup file, helper or fixture): a runner or a test can load it by path, so the tests that use it cannot all be listed`
    );

  // Tests and runner configs that name a file by path depend on it with no
  // import edge. One search covers every test; a failed search keeps everything.
  const grepped = changedFiles.length > 0 ? grepNamedFiles(deps.git) : '';
  const named = indexNamedFiles(grepped ?? '');
  const searchFailed =
    grepped === null
      ? 'git grep failed'
      : named.unread > 0
        ? `${named.unread} line(s) of git grep output were not in the shape asked for`
        : null;
  if (searchFailed) {
    fullSuite.set(
      REPO_SCOPE,
      `the tests could not be searched for the files they name by path (${searchFailed}), so every test in the repo is kept`
    );
  }
  /** Code is named from its own package, or across packages when either side is outside them all. */
  const sharesScope = (a: string, b: string) => {
    const pa = pkgOf(a);
    const pb = pkgOf(b);
    return pa === null || pb === null || pa === pb;
  };
  /**
   * Files that name `f` by path: runnable tests, and helpers (test support code
   * the runner does not run alone), each with how it names `f`.
   */
  const readersNaming = (
    f: string
  ): { tests: string[]; helpers: Array<{ helper: string; why: string }> } => {
    const posix = toPosix(f);
    const base = path.posix.basename(posix).toLowerCase();
    const prose = INERT_FILE_RE.test(posix);
    if (!prose && !CODE_FILE_RE.test(posix)) return { tests: [], helpers: [] };
    const byName =
      (prose ? named.prose.get(base) : named.code.get(base.replace(CODE_EXT_RE, ''))) ?? [];
    const byPattern = prose ? named.prosePattern : named.codePattern;
    const fits = (r: string) => r !== posix && !isDeleted(r) && (prose || sharesScope(r, posix));
    const nameReaders = byName.filter(fits);
    const patternReaders = byPattern.filter((r) => fits(r) && !nameReaders.includes(r));
    const isHelper = (r: string) =>
      !RUNNABLE_TEST_RE.test(r) && (isTestFile(r) || isTestSupport(r));
    return {
      tests: [...nameReaders, ...patternReaders].filter((r) => RUNNABLE_TEST_RE.test(r)),
      helpers: [
        ...nameReaders.filter(isHelper).map((helper) => ({ helper, why: `names ${f} by path` })),
        ...patternReaders.filter(isHelper).map((helper) => ({
          helper,
          why: `reads ${prose ? 'Markdown' : 'code'} files by pattern`,
        })),
      ],
    };
  };
  const testsNaming = (f: string) => readersNaming(f).tests;
  /** Every file (test, helper or runner config) that names `f` by its exact name: evidence it is used. */
  const readersByName = (f: string): string[] => {
    const posix = toPosix(f);
    const base = path.posix.basename(posix).toLowerCase();
    const prose = INERT_FILE_RE.test(posix);
    const byName =
      (prose ? named.prose.get(base) : named.code.get(base.replace(CODE_EXT_RE, ''))) ?? [];
    return byName.filter((r) => r !== posix && !isDeleted(r) && (prose || sharesScope(r, posix)));
  };
  /** A program (`#!` first line) is run on its own, not loaded by tests. */
  const isProgram = (f: string): boolean => {
    try {
      return deps.readFile(path.join(repoRoot, f)).startsWith('#!');
    } catch {
      return false;
    }
  };
  /** Helpers that name any of `files`, each with how (a name wins over a pattern). */
  const helpersNaming = (files: Iterable<string>): Map<string, string> => {
    const out = new Map<string, string>();
    for (const f of files) {
      for (const { helper, why } of readersNaming(f).helpers) {
        const had = out.get(helper);
        if (had === undefined || (had.startsWith('reads') && why.startsWith('names'))) {
          out.set(helper, why);
        }
      }
    }
    return out;
  };
  const keepHelperSuite = (helper: string, why: string, because: string) =>
    keepSuite(
      helper,
      `${helper} ${why} and is test support code; ${because}, so its package suite is kept`
    );
  /**
   * A runner config that names test support code, or a setup/teardown file,
   * loads it for every test in its scope. (Other code a config names, such as
   * an alias to src/index.ts, is reached through imports instead.)
   */
  const keepIfRunnerLoads = (f: string) => {
    const stem = path.posix.basename(toPosix(f)).toLowerCase().replace(CODE_EXT_RE, '');
    if (!isTestSupport(f) && !/setup|teardown/.test(stem)) return;
    for (const config of named.code.get(stem) ?? []) {
      if (!RUNNER_CONFIG_RE.test(config) || !sharesScope(config, f)) continue;
      keepScope(
        pkgOf(config),
        `${f} is named by ${config}, which loads it for every test it runs, and the change reaches it`
      );
    }
  };
  const namedBy = new Map<string, string[]>();
  /** Add the tests that name `files` to `selected`; record the ones it did not hold. */
  const addTestsNaming = (files: Iterable<string>, selected: Set<string>) => {
    const before = new Set(selected);
    for (const f of files) {
      const added = testsNaming(f).filter((t) => !before.has(t));
      if (added.length === 0) continue;
      for (const t of added) selected.add(t);
      namedBy.set(f, Array.from(new Set([...(namedBy.get(f) ?? []), ...added])).sort());
    }
  };
  // Plain code-unit order, the same on every worker locale.
  const namedByEntries = () =>
    Array.from(namedBy, ([file, tests]) => ({ file, tests })).sort((a, b) =>
      a.file < b.file ? -1 : a.file > b.file ? 1 : 0
    );
  // A test in ANOTHER package that reads a changed data file by path is not
  // searched for (data names are not matched across packages); say so.
  const untracedDataFiles = changedFiles.filter(
    (f) => !CODE_FILE_RE.test(f) && !INERT_FILE_RE.test(f) && pkgOf(f) !== null
  );

  for (const f of changedFiles) {
    if (isInertFile(f)) continue;
    if (PACKAGE_WIDE_FILE_RE.test(f)) {
      keepSuite(f, `${f} changed (manifest, lockfile, or test/build config)`);
    } else if (!CODE_FILE_RE.test(f)) {
      keepSuite(
        f,
        `${f} changed and is not code the graph can trace (a test may read it as data, fixture or snapshot)`
      );
    } else if (isTestSupport(f) && !BENCH_FILE_RE.test(f)) {
      keepChangedSupportSuite(f);
    }
    if (CODE_FILE_RE.test(f)) keepIfRunnerLoads(f);
  }
  // An edited benchmark under a test folder is decided with the graph (below):
  // listed when nothing imports or names it, else its importers are reached.
  // Without the graph nobody can say, so it keeps its suite like other support code.
  const changedBenchmarks = changedFiles.filter(
    (f) => isTestSupport(f) && BENCH_FILE_RE.test(f) && !isDeleted(f)
  );
  const fullSuiteEntries = () => Array.from(fullSuite, ([pkg, reason]) => ({ pkg, reason }));

  const fallback = (reason: string, cacheNote?: string): ChangeImpactReport => {
    for (const f of changedBenchmarks) keepChangedSupportSuite(f);
    for (const [helper, why] of helpersNaming(changedFiles)) {
      keepHelperSuite(helper, why, 'without the graph the tests that use it cannot be listed');
    }
    const selected = new Set(testsIn([...touchedPackages, ...fullSuite.keys()]));
    addTestsNaming(changedFiles, selected);
    const fullSet = Array.from(selected).sort();
    const partial: Omit<ChangeImpactReport, 'brief'> = {
      schema: 'holoscript.change-impact.v1',
      repoRoot,
      graphRoot,
      since: options.since,
      mode: 'package-fallback',
      modeReason: reason,
      ...(cacheNote && { cacheNote }),
      changedFiles,
      touchedPackages,
      affectedFiles: [],
      affectedCount: 0,
      tests: {
        selected: fullSet,
        fullSet,
        fullSuitePackages: fullSuiteEntries(),
        namedBy: namedByEntries(),
        untracedDataFiles,
        viaHelpers: [],
      },
      callers: {
        available: false,
        reason: 'needs the codebase graph',
        changedSymbols: extractChangedExportedSymbols(diff),
        forgotten: [],
      },
      untracedDependents,
    };
    return { ...partial, brief: renderReviewerBrief(partial) };
  };

  // ── Graph (cache-only unless --refresh) ───────────────────────────────────
  if (options.refresh) {
    const absorb = await absorbAndWait(deps.handleCodebaseTool, graphRoot, {
      ...(options.absorbPollMs !== undefined && { pollMs: options.absorbPollMs }),
    });
    if (!absorb.ok) return fallback(`absorb refresh failed: ${absorb.error}`);
  }

  if (changedFiles.length === 0) {
    return fallback(`no file changed since ${options.since}`);
  }
  if (changedFiles.length > 1000) {
    return fallback(`${changedFiles.length} changed files exceed the 1000-file impact limit`);
  }

  // Deleted paths are asked too: a graph absorbed before the delete still
  // holds the file, and its reach is exactly the files that imported it.
  const impact = asRecord(
    await deps.handleCodebaseTool('holo_impact_analysis', {
      changedFiles: changedFiles.map((f) => toPosix(path.join(repoRoot, f))),
      maxAffectedFiles: 20_000,
    })
  );
  const cacheNote = typeof impact.cacheNote === 'string' ? impact.cacheNote : undefined;
  if (impact.error) {
    const receipt = asRecord(impact.graphUnavailableReceipt);
    const why = typeof receipt.reason === 'string' ? receipt.reason : String(impact.error);
    return fallback(`no authoritative codebase graph (${why})`);
  }
  const rootKey = key(repoRoot);
  // Graph paths may be absolute or relative to the graph root; report every
  // path relative to the git top level.
  const graphPrefix = toPosix(path.relative(repoRoot, graphRoot));
  const toRel = (p: string): string => {
    const posix = toPosix(p);
    if (!path.isAbsolute(p) && !/^[A-Za-z]:\//.test(posix)) {
      return graphPrefix ? path.posix.join(graphPrefix, posix) : posix;
    }
    const k = key(p);
    return k.startsWith(`${rootKey}/`) ? posix.slice(rootKey.length + 1) : posix;
  };
  /**
   * One holo_impact_analysis answer: the reach (repo paths), the asked files
   * the graph holds no node for (keys), and `cut` when the traversal stopped
   * early. An unindexed input is not a cut (callers handle it per file); any
   * other cut (deadline, depth, size) means the reach is a lower bound.
   */
  const readImpact = (answer: Record<string, unknown>) => {
    const reasons = asRecord(answer.traversal).truncationReasons;
    const unsafe = (Array.isArray(reasons) ? (reasons as string[]) : []).filter(
      (r) => r !== 'changed_file_not_indexed'
    );
    const cut =
      unsafe.length > 0 || answer.communityGroupingComplete === false
        ? unsafe.join(', ') || 'grouping deadline'
        : null;
    const files = new Set<string>();
    for (const list of Object.values(asRecord(answer.impactByCommunity))) {
      if (Array.isArray(list)) for (const f of list) files.add(toRel(String(f)));
    }
    const unplaced = Array.isArray(answer.unresolvedChangedFiles)
      ? answer.unresolvedChangedFiles
      : [];
    return { files, unresolved: new Set(unplaced.map((f) => key(toRel(String(f))))), cut };
  };
  const reach = readImpact(impact);
  if (reach.cut) return fallback(`graph traversal was cut short (${reach.cut})`, cacheNote);
  const affectedRel = reach.files;
  const affectedKeys = new Set(Array.from(affectedRel, (f) => key(f)));

  // Changed code files the graph has no node for: their reach is unknown, so
  // their package keeps its whole suite. A deleted file is the common case — a
  // graph absorbed after the delete has no node for it, and the files that
  // still import it are not linked to anything.
  const unresolved = reach.unresolved;
  for (const f of changedFiles) {
    if (isInertFile(f) || !CODE_FILE_RE.test(f) || PACKAGE_WIDE_FILE_RE.test(f)) continue;
    // A *.test / *.spec file runs on its own when present; nothing imports one.
    if (RUNNABLE_TEST_RE.test(f) || !unresolved.has(key(f))) continue;
    keepSuite(
      f,
      isDeleted(f)
        ? `${f} was deleted and the graph no longer holds it, so the files that imported it cannot be listed`
        : `${f} is not in the graph`
    );
  }

  // ── Helpers: test support code that names a reached file ──────────────────
  // A helper that names a changed or reached file by path (or matches such
  // files by pattern) passes the change on to whatever uses it. Its own reach
  // joins the selection reach, and goes through the same rules as the rest of
  // it below (setup files a runner loads, files tests load by path, further
  // helpers), repeating until no new helper appears. A helper's package suite
  // is kept when the graph cannot list its users, or when nothing imports it
  // or names it by name: then its users cannot be seen. A program (a `#!`
  // first line) is run on its own, so it needs no such fallback. A helper
  // already in the reach is handled like any reached file.
  const selectionReach = new Set(affectedRel);
  const viaHelpers: ChangeImpactReport['tests']['viaHelpers'] = [];
  const followed = new Set<string>();
  let frontier = [...changedFiles, ...affectedRel];
  while (frontier.length > 0) {
    const next: string[] = [];
    const join = (f: string) => {
      if (selectionReach.has(f)) return;
      selectionReach.add(f);
      next.push(f);
    };
    for (const [helper, why] of helpersNaming(frontier)) {
      if (followed.has(helper) || selectionReach.has(helper)) continue;
      followed.add(helper);
      const answer = asRecord(
        await deps.handleCodebaseTool('holo_impact_analysis', {
          changedFiles: [toPosix(path.join(repoRoot, helper))],
          maxAffectedFiles: 20_000,
        })
      );
      const users = answer.error ? null : readImpact(answer);
      if (!users || users.cut) {
        const detail = users ? `traversal cut short: ${users.cut}` : String(answer.error);
        keepHelperSuite(helper, why, `the graph could not list the tests that use it (${detail})`);
        continue;
      }
      if (users.unresolved.size > 0) {
        keepHelperSuite(helper, why, 'it is not in the graph');
        continue;
      }
      const importers = [...users.files].filter((f) => f !== helper && !isDeleted(f));
      const nameReaders = readersByName(helper);
      if (importers.length === 0 && nameReaders.length === 0) {
        // A program or a benchmark runs on its own: listed, not dropped
        // silently (the brief names the computed-path limit), and no suite.
        const runsAlone = isProgram(helper)
          ? ('program' as const)
          : BENCH_FILE_RE.test(helper)
            ? ('benchmark' as const)
            : null;
        if (runsAlone) {
          viaHelpers.push({ helper, reason: why, tests: [], runsAlone });
        } else {
          keepHelperSuite(
            helper,
            why,
            'nothing imports it or names it by name, so the tests that use it cannot be seen'
          );
        }
        continue;
      }
      const direct = [...importers, ...nameReaders].filter((t) => RUNNABLE_TEST_RE.test(t));
      viaHelpers.push({ helper, reason: why, tests: Array.from(new Set(direct)).sort() });
      join(helper);
      for (const f of importers) join(f);
    }
    frontier = next;
  }

  // An edited benchmark is run by hand with vitest bench, never by a test run.
  // If nothing imports it or names it, no test can see the edit: it is listed
  // and keeps no suite. If something imports it, those files are already in
  // the reach. When the graph cannot answer, it keeps its suite.
  for (const bench of changedBenchmarks) {
    const answer = asRecord(
      await deps.handleCodebaseTool('holo_impact_analysis', {
        changedFiles: [toPosix(path.join(repoRoot, bench))],
        maxAffectedFiles: 20_000,
      })
    );
    const benchReach = answer.error ? null : readImpact(answer);
    if (!benchReach || benchReach.cut || benchReach.unresolved.size > 0) {
      keepChangedSupportSuite(bench);
      continue;
    }
    const importers = [...benchReach.files].filter((f) => f !== bench && !isDeleted(f));
    if (importers.length === 0 && readersByName(bench).length === 0) {
      viaHelpers.push({ helper: bench, reason: 'changed', tests: [], runsAlone: 'benchmark' });
    }
  }

  // A setup file the change reaches (it imports a changed file, or a helper
  // that does) runs before every test its runner config covers.
  for (const f of selectionReach) keepIfRunnerLoads(f);

  const affectedPackages = new Set(touchedPackages);
  for (const f of selectionReach) {
    const pkg = pkgOf(f);
    if (pkg) affectedPackages.add(pkg);
  }
  const selected = new Set<string>();
  for (const f of affectedRel) if (runsInTests(f)) selected.add(f);
  // The helpers' reach selects test files by the same rule, the helpers
  // themselves included: a runner config can run more than *.test files
  // (e.g. *.scenario.ts), and such a file can also name files.
  for (const f of selectionReach) if (runsInTests(f)) selected.add(f);
  for (const f of present) {
    if (runsInTests(f)) selected.add(f);
    else for (const t of conventionTestsFor(f, repoRoot, deps.fileExists)) selected.add(t);
  }
  for (const t of testsIn(fullSuite.keys())) selected.add(t);
  // A test that spawns, reads or loads a reached file by path (a CLI, a worker)
  // depends on everything that file imports.
  addTestsNaming([...changedFiles, ...selectionReach], selected);
  // The reach of a deleted file (from a graph absorbed before the delete) can
  // include deleted tests; the runner must not be handed missing files.
  for (const f of Array.from(selected)) if (isDeleted(f)) selected.delete(f);
  const fullSet = Array.from(
    new Set([...testsIn([...affectedPackages, ...fullSuite.keys()]), ...selected])
  ).sort();

  // ── Forgotten callers ─────────────────────────────────────────────────────
  const changedKeys = new Set(changedFiles.map((f) => key(f)));
  const changedSymbols = extractChangedExportedSymbols(diff);
  const forgotten: ForgottenCallerEntry[] = [];
  let callersAvailable = true;
  let callersReason: string | undefined;
  for (const sym of changedSymbols) {
    const result = asRecord(
      await deps.handleCodebaseTool('holo_query_codebase', {
        queryType: 'callers',
        symbolName: sym.name,
        ...(sym.owner && { symbolOwner: sym.owner }),
      })
    );
    if (result.error) {
      callersAvailable = false;
      callersReason = `caller query failed: ${String(result.error)}`;
      break;
    }
    const edges = Array.isArray(result.results) ? result.results : [];
    const confirmed: CallerSite[] = [];
    const nameOnly: CallerSite[] = [];
    const seenSites = new Set<string>();
    for (const raw of edges) {
      const edge = asRecord(raw);
      const rel = toRel(String(edge.filePath ?? ''));
      if (!rel || changedKeys.has(key(rel))) continue;
      const site = `${rel}:${String(edge.line ?? '')}`;
      if (seenSites.has(site)) continue;
      seenSites.add(site);
      (affectedKeys.has(key(rel)) ? confirmed : nameOnly).push({
        file: rel,
        line: Number(edge.line ?? 0),
        callerId: String(edge.callerId ?? ''),
      });
    }
    const bySite = (a: CallerSite, b: CallerSite) =>
      a.file.localeCompare(b.file) || a.line - b.line;
    forgotten.push({
      symbol: sym.owner ? `${sym.owner}.${sym.name}` : sym.name,
      file: sym.file,
      change: sym.change,
      confirmed: confirmed.sort(bySite),
      nameOnly: nameOnly.sort(bySite),
      nameOnlyCount: nameOnly.length,
    });
  }

  const partial: Omit<ChangeImpactReport, 'brief'> = {
    schema: 'holoscript.change-impact.v1',
    repoRoot,
    graphRoot,
    since: options.since,
    mode: 'graph',
    modeReason: 'authoritative codebase graph',
    ...(cacheNote && { cacheNote }),
    changedFiles,
    touchedPackages,
    affectedFiles: Array.from(affectedRel).sort(),
    affectedCount: affectedRel.size,
    tests: {
      selected: Array.from(selected).sort(),
      fullSet,
      fullSuitePackages: fullSuiteEntries(),
      namedBy: namedByEntries(),
      untracedDataFiles,
      viaHelpers,
    },
    callers: {
      available: callersAvailable,
      ...(callersReason && { reason: callersReason }),
      changedSymbols,
      forgotten,
    },
    untracedDependents,
  };
  return { ...partial, brief: renderReviewerBrief(partial) };
}
