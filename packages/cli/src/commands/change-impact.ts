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
 *      back to "every test in the touched packages" and says so.
 *   2. Forgotten callers — for each exported symbol whose declaration line
 *      changed, the call sites in files the change did NOT touch.
 *   3. Reviewer brief — a short plain-text summary of 1 and 2.
 *
 * Known limit, stated in every report: the graph resolves relative imports
 * only. A consumer that imports a package by name (`@holoscript/core`) is not
 * traced, so graph mode covers reach WITHIN each package. The report lists the
 * workspace packages that depend on a touched package so nobody reads
 * "3 tests" as "nothing else can break".
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
  /** Untouched-file call sites that only match by name (could be another symbol). */
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
    /** Packages whose whole suite stays selected, with why. */
    fullSuitePackages: Array<{ pkg: string; reason: string }>;
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
const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/;
const DECLARATION_FILE_RE = /\.d\.[cm]?ts$/;
/** Non-code files whose change can alter how a whole package's tests behave. */
const PACKAGE_WIDE_FILE_RE =
  /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|vitest\.config\.[cm]?[jt]s|vitest\.setup\.[cm]?[jt]s|vite\.config\.[cm]?[jt]s)$/;

export function isTestFile(file: string): boolean {
  return TEST_FILE_RE.test(toPosix(file));
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
      const target = raw.slice(4).trim();
      if (target !== '/dev/null') file = target.replace(/^b\//, '');
      continue;
    }
    if (!inHunk && raw.startsWith('--- ')) {
      const source = raw.slice(4).trim();
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
  const pkgList = report.touchedPackages.length ? report.touchedPackages.join(', ') : 'none';
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
    lines.push(`  Whole suite kept for ${full.pkg}: ${full.reason}`);
  }
  if (!report.callers.available) {
    lines.push(`Callers: not checked — ${report.callers.reason ?? 'no graph'}.`);
  } else if (report.callers.changedSymbols.length === 0) {
    lines.push('Callers: no exported function, class or method changed its declaration.');
  } else {
    const flagged = report.callers.forgotten.filter((f) => f.confirmed.length > 0);
    lines.push(
      `Callers: ${report.callers.changedSymbols.length} exported declaration(s) changed; ${flagged.length} still have callers in files this change did not touch.`
    );
    for (const entry of flagged.slice(0, 10)) {
      const where = entry.confirmed
        .slice(0, 3)
        .map((c) => `${c.file}:${c.line}`)
        .join(', ');
      const more = entry.confirmed.length > 3 ? ` (+${entry.confirmed.length - 3} more)` : '';
      lines.push(`  CHECK ${entry.symbol} (${entry.change}) — called from ${where}${more}`);
    }
  }
  if (report.untracedDependents.length > 0) {
    const shown = report.untracedDependents.slice(0, 8).join(', ');
    const more =
      report.untracedDependents.length > 8 ? ` and ${report.untracedDependents.length - 8} more` : '';
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
  const changedFiles = deps
    .git(['diff', '--name-only', ...range])
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(toPosix);
  const existing = changedFiles.filter((f) => deps.fileExists(path.join(repoRoot, f)));
  const diff = deps.git([
    'diff',
    '-U0',
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

  const trackedFiles = deps
    .git(['ls-files'])
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map(toPosix);
  const testsInPackage = (pkg: string) =>
    trackedFiles.filter((f) => f.startsWith(`${pkg}/`) && isTestFile(f) && pkgOf(f) === pkg);
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

  const fallback = (reason: string, cacheNote?: string): ChangeImpactReport => {
    const fullSet = Array.from(new Set(touchedPackages.flatMap(testsInPackage))).sort();
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
      tests: { selected: fullSet, fullSet, fullSuitePackages: [] },
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

  if (existing.length === 0) {
    return fallback('no changed file exists in the working tree to trace');
  }
  if (existing.length > 1000) {
    return fallback(`${existing.length} changed files exceed the 1000-file impact limit`);
  }

  const impact = asRecord(
    await deps.handleCodebaseTool('holo_impact_analysis', {
      changedFiles: existing.map((f) => toPosix(path.join(repoRoot, f))),
      maxAffectedFiles: 20_000,
    })
  );
  const cacheNote = typeof impact.cacheNote === 'string' ? impact.cacheNote : undefined;
  if (impact.error) {
    const receipt = asRecord(impact.graphUnavailableReceipt);
    const why = typeof receipt.reason === 'string' ? receipt.reason : String(impact.error);
    return fallback(`no authoritative codebase graph (${why})`);
  }
  const traversal = asRecord(impact.traversal);
  const traversalReasons = Array.isArray(traversal.truncationReasons)
    ? (traversal.truncationReasons as string[])
    : [];
  // An unindexed changed file is handled per package below; any other cut
  // (deadline, depth, size) means the reach is a lower bound — unsafe to narrow.
  const unsafeCuts = traversalReasons.filter((r) => r !== 'changed_file_not_indexed');
  if (unsafeCuts.length > 0 || impact.communityGroupingComplete === false) {
    return fallback(
      `graph traversal was cut short (${unsafeCuts.join(', ') || 'grouping deadline'})`,
      cacheNote
    );
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
  const affectedRel = new Set<string>();
  for (const files of Object.values(asRecord(impact.impactByCommunity))) {
    if (Array.isArray(files)) for (const f of files) affectedRel.add(toRel(String(f)));
  }
  const affectedKeys = new Set(Array.from(affectedRel, (f) => key(f)));

  // Changed files the graph has no node for: a changed code/config file we
  // cannot trace keeps its whole package suite.
  const unresolved = new Set(
    (Array.isArray(impact.unresolvedChangedFiles) ? impact.unresolvedChangedFiles : []).map((f) =>
      key(toRel(String(f)))
    )
  );
  const fullSuitePackages = new Map<string, string>();
  for (const f of changedFiles) {
    const pkg = pkgOf(f);
    if (!pkg || isTestFile(f)) continue;
    const exists = deps.fileExists(path.join(repoRoot, f));
    if (PACKAGE_WIDE_FILE_RE.test(f)) {
      if (!fullSuitePackages.has(pkg)) fullSuitePackages.set(pkg, `${f} changed (package-wide file)`);
    } else if (
      exists &&
      CODE_FILE_RE.test(f) &&
      !DECLARATION_FILE_RE.test(f) &&
      unresolved.has(key(f))
    ) {
      if (!fullSuitePackages.has(pkg)) fullSuitePackages.set(pkg, `${f} is not in the graph`);
    }
  }

  const affectedPackages = new Set(touchedPackages);
  for (const f of affectedRel) {
    const pkg = pkgOf(f);
    if (pkg) affectedPackages.add(pkg);
  }
  const fullSet = Array.from(new Set(Array.from(affectedPackages).flatMap(testsInPackage))).sort();
  const selected = new Set<string>();
  for (const f of affectedRel) if (isTestFile(f)) selected.add(f);
  for (const f of existing) {
    if (isTestFile(f)) selected.add(f);
    else for (const t of conventionTestsFor(f, repoRoot, deps.fileExists)) selected.add(t);
  }
  for (const pkg of fullSuitePackages.keys()) for (const t of testsInPackage(pkg)) selected.add(t);

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
    let nameOnlyCount = 0;
    const seenSites = new Set<string>();
    for (const raw of edges) {
      const edge = asRecord(raw);
      const rel = toRel(String(edge.filePath ?? ''));
      if (!rel || changedKeys.has(key(rel))) continue;
      const site = `${rel}:${String(edge.line ?? '')}`;
      if (seenSites.has(site)) continue;
      seenSites.add(site);
      if (affectedKeys.has(key(rel))) {
        confirmed.push({
          file: rel,
          line: Number(edge.line ?? 0),
          callerId: String(edge.callerId ?? ''),
        });
      } else {
        nameOnlyCount++;
      }
    }
    forgotten.push({
      symbol: sym.owner ? `${sym.owner}.${sym.name}` : sym.name,
      file: sym.file,
      change: sym.change,
      confirmed: confirmed.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
      nameOnlyCount,
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
      fullSuitePackages: Array.from(fullSuitePackages, ([pkg, reason]) => ({ pkg, reason })),
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
