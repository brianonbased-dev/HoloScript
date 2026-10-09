import { describe, expect, it, vi } from 'vitest';
import {
  absorbAndWait,
  analyzeChangeImpact,
  extractChangedExportedSymbols,
  indexNamedFiles,
  isInertFile,
  isTestFile,
  parseNameStatus,
  unquoteGitPath,
  type ChangeImpactDeps,
} from '../commands/change-impact';
import { parseArgs } from '../args';

const ROOT = 'C:/repo';

/** A tiny two-package repo: pkg-a (changed) and pkg-b (depends on pkg-a by name). */
const FILES = [
  'packages/a/package.json',
  'packages/a/src/math.ts',
  'packages/a/src/uses-math.ts',
  'packages/a/src/unrelated.ts',
  'packages/a/src/__tests__/math.test.ts',
  'packages/a/src/__tests__/uses-math.test.ts',
  'packages/a/src/__tests__/unrelated.test.ts',
  'packages/a/src/__tests__/other.test.ts',
  'packages/b/package.json',
  'packages/b/src/index.ts',
  'packages/b/src/__tests__/b.test.ts',
];

const MANIFESTS: Record<string, string> = {
  'packages/a/package.json': JSON.stringify({ name: '@x/a' }),
  'packages/b/package.json': JSON.stringify({
    name: '@x/b',
    dependencies: { '@x/a': 'workspace:*' },
  }),
};

const DIFF = [
  'diff --git a/packages/a/src/math.ts b/packages/a/src/math.ts',
  '--- a/packages/a/src/math.ts',
  '+++ b/packages/a/src/math.ts',
  '@@ -3 +3 @@ import x',
  '-export function add(a: number, b: number): number {',
  '+export function add(a: number, b: number, c = 0): number {',
  '@@ -9 +9 @@ export class Calc {',
  '-  total(values: number[]): number {',
  '+  total(values: number[], start: number): number {',
  '@@ -20 +20 @@ export class Calc {',
  '-    this.reset();',
  '+    this.reset(true);',
].join('\n');

/**
 * `git ls-files` as git prints it: NUL-separated with -z; otherwise one path
 * per line, with core.quotePath (on by default) quoting a non-ASCII path.
 */
function lsFiles(paths: string[], args: string[]): string {
  const sorted = [...paths].sort();
  if (args.includes('-z')) return sorted.map((p) => `${p}\0`).join('');
  const quote = (p: string) =>
    /[^\x20-\x7e]/.test(p)
      ? `"${Array.from(Buffer.from(p, 'utf8'), (b) =>
          b > 0x7e ? `\\${b.toString(8)}` : String.fromCharCode(b)
        ).join('')}"`
      : p;
  return sorted.map(quote).join('\n');
}

function makeDeps(overrides: Partial<ChangeImpactDeps> = {}): ChangeImpactDeps {
  const existing = new Set(FILES.map((f) => `${ROOT}/${f}`));
  return {
    git: (args) => {
      if (args[0] === 'ls-files') return lsFiles(FILES, args);
      if (args[0] === 'diff' && args[1] === '--name-status') return 'M\0packages/a/src/math.ts\0';
      if (args[0] === 'diff' && args[1] === '--name-only') return 'packages/a/src/math.ts\n';
      if (args[0] === 'diff' && args[1] === '-U0') return DIFF;
      // No test names a file by path here; git grep exits 1 on no match.
      if (args[0] === 'grep') throw Object.assign(new Error('git grep: exit 1'), { status: 1 });
      throw new Error(`unexpected git ${args.join(' ')}`);
    },
    fileExists: (p) => existing.has(p.replace(/\\/g, '/')),
    readFile: (p) => {
      const rel = p.replace(/\\/g, '/').slice(ROOT.length + 1);
      if (MANIFESTS[rel]) return MANIFESTS[rel];
      throw new Error(`no file ${rel}`);
    },
    handleCodebaseTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'holo_impact_analysis') {
        return {
          impactByCommunity: {
            c1: [
              `${ROOT}/packages/a/src/math.ts`,
              `${ROOT}/packages/a/src/uses-math.ts`,
              `${ROOT}/packages/a/src/__tests__/math.test.ts`,
              `${ROOT}/packages/a/src/__tests__/uses-math.test.ts`,
            ],
          },
          unresolvedChangedFiles: [],
          communityGroupingComplete: true,
          traversal: { complete: true, truncationReasons: [] },
          cacheNote: 'auto-loaded from disk cache (3m old)',
        };
      }
      if (name === 'holo_query_codebase') {
        if (args.symbolName === 'add') {
          return {
            results: [
              // In the changed file itself: not forgotten.
              { callerId: 'm', filePath: `${ROOT}/packages/a/src/math.ts`, line: 30 },
              // Untouched file that imports math.ts: a forgotten caller.
              { callerId: 'u', filePath: `${ROOT}/packages/a/src/uses-math.ts`, line: 12 },
              // Untouched file outside the reach: same name, some other `add`.
              { callerId: 'z', filePath: `${ROOT}/packages/a/src/unrelated.ts`, line: 4 },
            ],
          };
        }
        return { results: [] };
      }
      throw new Error(`unexpected tool ${name}`);
    }),
    ...overrides,
  };
}

describe('impact --since: HoloCI change report from the codebase graph', () => {
  it('selects only the tests the change can reach, out of the touched packages', async () => {
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, makeDeps());

    expect(report.mode).toBe('graph');
    expect(report.tests.selected).toEqual([
      'packages/a/src/__tests__/math.test.ts',
      'packages/a/src/__tests__/uses-math.test.ts',
    ]);
    expect(report.tests.fullSet).toHaveLength(4);
    expect(report.affectedCount).toBe(4);
  });

  it('lists callers in untouched files of an export whose signature changed', async () => {
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, makeDeps());

    const add = report.callers.forgotten.find((f) => f.symbol === 'add');
    expect(add?.confirmed).toEqual([
      { file: 'packages/a/src/uses-math.ts', line: 12, callerId: 'u' },
    ]);
    expect(add?.nameOnly).toEqual([
      { file: 'packages/a/src/unrelated.ts', line: 4, callerId: 'z' },
    ]);
    expect(add?.nameOnlyCount).toBe(1);
    expect(report.callers.forgotten.map((f) => f.symbol)).toContain('Calc.total');
  });

  it('writes a plain-text brief a reviewer can read', async () => {
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, makeDeps());

    expect(report.brief).toContain('1 file(s) in packages/a');
    expect(report.brief).toContain('2 of 4 test file(s)');
    expect(report.brief).toContain('CHECK add (signature)');
    expect(report.brief).toContain('packages/a/src/uses-math.ts:12');
    // A same-name call the graph cannot link is shown too, labelled as name-only.
    expect(report.brief).toContain('1 have possible callers matched by name only');
    expect(report.brief).toContain(
      'NAME-ONLY add (signature) — called by name from packages/a/src/unrelated.ts:4'
    );
    // pkg-b imports pkg-a by name — the graph cannot see that; the brief must say so.
    expect(report.untracedDependents).toEqual(['packages/b']);
    expect(report.brief).toContain('Not traced: 1 other package(s)');
  });

  it('falls back to every test in the touched packages when no authoritative graph exists', async () => {
    const deps = makeDeps({
      handleCodebaseTool: vi.fn(async () => ({
        error: 'No codebase graph available',
        graphUnavailableReceipt: { reason: 'cache_stale' },
      })),
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);

    expect(report.mode).toBe('package-fallback');
    expect(report.modeReason).toContain('cache_stale');
    expect(report.tests.selected).toEqual(report.tests.fullSet);
    expect(report.tests.selected).toHaveLength(4);
    expect(report.callers.available).toBe(false);
    expect(report.brief).toContain('Reach: not measured');
  });

  it('falls back when the graph traversal was cut short (reach is only a lower bound)', async () => {
    const base = makeDeps();
    const deps = makeDeps({
      handleCodebaseTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
        const real = (await base.handleCodebaseTool(name, args)) as Record<string, unknown>;
        return name === 'holo_impact_analysis'
          ? { ...real, traversal: { complete: false, truncationReasons: ['deadline'] } }
          : real;
      }),
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);
    expect(report.mode).toBe('package-fallback');
    expect(report.modeReason).toContain('deadline');
  });

  it('keeps the whole package suite when a changed source file is not in the graph', async () => {
    const base = makeDeps();
    const deps = makeDeps({
      handleCodebaseTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
        const real = (await base.handleCodebaseTool(name, args)) as Record<string, unknown>;
        return name === 'holo_impact_analysis'
          ? {
              ...real,
              unresolvedChangedFiles: [`${ROOT}/packages/a/src/math.ts`],
              traversal: { complete: false, truncationReasons: ['changed_file_not_indexed'] },
            }
          : real;
      }),
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);
    expect(report.mode).toBe('graph');
    expect(report.tests.fullSuitePackages).toEqual([
      { pkg: 'packages/a', reason: 'packages/a/src/math.ts is not in the graph' },
    ]);
    expect(report.tests.selected).toHaveLength(4);
  });

  it('maps graph-root-relative paths from a package-scoped graph back to repo paths', async () => {
    const deps = makeDeps({
      handleCodebaseTool: vi.fn(async (name: string) => {
        if (name === 'holo_impact_analysis') {
          return {
            // A graph absorbed at packages/a reports paths relative to that root.
            impactByCommunity: {
              src: ['src/math.ts', 'src/uses-math.ts', 'src/__tests__/uses-math.test.ts'],
            },
            unresolvedChangedFiles: [],
            communityGroupingComplete: true,
            traversal: { complete: true, truncationReasons: [] },
          };
        }
        return { results: [{ callerId: 'u', filePath: 'src/uses-math.ts', line: 7 }] };
      }),
    });
    const report = await analyzeChangeImpact(
      { repoRoot: ROOT, graphRoot: `${ROOT}/packages/a`, since: 'HEAD~1' },
      deps
    );
    expect(report.affectedFiles).toContain('packages/a/src/uses-math.ts');
    expect(report.tests.selected).toEqual([
      'packages/a/src/__tests__/math.test.ts',
      'packages/a/src/__tests__/uses-math.test.ts',
    ]);
    expect(report.callers.forgotten.find((f) => f.symbol === 'add')?.confirmed).toEqual([
      { file: 'packages/a/src/uses-math.ts', line: 7, callerId: 'u' },
    ]);
    expect(report.brief).toContain('codebase graph of packages/a');
  });

  it('git settings that color a diff, rename its prefixes or replace it do not hide changed declarations', async () => {
    const base = makeDeps();
    const deps = makeDeps({
      git: (args) => {
        if (args[0] !== 'diff' || args[1] !== '-U0') return base.git(args);
        // diff.external, diff.mnemonicPrefix and color.ui=always, as git applies
        // them unless the call overrides each one (prefixes measured on git 2.51).
        if (!args.includes('--no-ext-diff')) return 'Files differ\n';
        let out = DIFF;
        if (!args.includes('--src-prefix=a/') || !args.includes('--dst-prefix=b/')) {
          out = out
            .replace(/^diff --git a\/(\S+) b\/(\S+)$/gm, 'diff --git c/$1 w/$2')
            .replace(/^--- a\//gm, '--- c/')
            .replace(/^\+\+\+ b\//gm, '+++ w/');
        }
        if (!args.includes('--no-color')) {
          out = out
            .split('\n')
            .map((l) => `\x1b[1m${l}\x1b[m`)
            .join('\n');
        }
        return out;
      },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);

    expect(
      report.callers.changedSymbols.map((s) => `${s.file} ${s.owner ? `${s.owner}.` : ''}${s.name}`)
    ).toEqual(['packages/a/src/math.ts add', 'packages/a/src/math.ts Calc.total']);
  });

  it('reads the graph cache only — absorbs first just with --refresh', async () => {
    const deps = makeDeps();
    await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);
    const called = (deps.handleCodebaseTool as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    expect(called).not.toContain('holo_absorb_repo');

    const refreshDeps = makeDeps();
    const inner = refreshDeps.handleCodebaseTool;
    refreshDeps.handleCodebaseTool = vi.fn(async (name: string, args: Record<string, unknown>) =>
      name === 'holo_absorb_repo' ? { ok: true } : inner(name, args)
    );
    await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1', refresh: true }, refreshDeps);
    expect(refreshDeps.handleCodebaseTool).toHaveBeenCalledWith(
      'holo_absorb_repo',
      expect.objectContaining({ force: false })
    );
  });
});

/**
 * A second repo whose git mock keeps real git semantics, so a report built on
 * the wrong git output goes red: `diff --name-only` (rename detection on, git's
 * default) lists only a rename's NEW path; `diff --name-status --no-renames -z`
 * lists `D old` + `A new`. The graph mock answers impact queries by walking
 * `importers` from the files the graph holds; every other changed path comes
 * back unresolved, exactly as the absorb handler reports it.
 */
const REPO2 = [
  'package.json',
  'pnpm-lock.yaml',
  'tsconfig.base.json',
  'vitest.workspace.ts',
  'README.md',
  'packages/a/package.json',
  'packages/a/README.md',
  'packages/a/vitest.config.ts',
  'packages/a/src/helper.ts',
  'packages/a/src/uses-helper.ts',
  'packages/a/src/unrelated.ts',
  'packages/a/src/__tests__/fixture.test.ts',
  'packages/a/src/__tests__/fixtures/data.json',
  'packages/a/src/__tests__/fixtures/expected.md',
  'packages/a/src/__tests__/unrelated.test.ts',
  'packages/a/src/__tests__/uses-helper.test.ts',
  'packages/b/package.json',
  'packages/b/src/index.ts',
  'packages/b/src/__tests__/b.test.ts',
];
const A_TESTS = [
  'packages/a/src/__tests__/fixture.test.ts',
  'packages/a/src/__tests__/unrelated.test.ts',
  'packages/a/src/__tests__/uses-helper.test.ts',
];
const ALL_TESTS = [...A_TESTS, 'packages/b/src/__tests__/b.test.ts'].sort();
/** Reverse imports as the graph records them: file -> files that import it. */
const IMPORTERS: Record<string, string[]> = {
  'packages/a/src/helper.ts': ['packages/a/src/uses-helper.ts'],
  'packages/a/src/uses-helper.ts': ['packages/a/src/__tests__/uses-helper.test.ts'],
  'packages/a/src/unrelated.ts': ['packages/a/src/__tests__/unrelated.test.ts'],
};
const CODE_NODES = REPO2.filter((f) => /\.ts$/.test(f));

type Repo2Change =
  { status: 'M' | 'A' | 'D'; file: string } | { status: 'R'; from: string; file: string };

function repo2(opts: {
  changes: Repo2Change[];
  /** Files added to REPO2 before the change. */
  files?: string[];
  /** Extra reverse imports (file -> importers), merged over IMPORTERS. */
  importers?: Record<string, string[]>;
  /** Source text `git grep` searches (tests and runner configs). */
  contents?: Record<string, string>;
  /** Deleted paths the index still lists (an unstaged delete). */
  indexKeeps?: string[];
  /** `git grep` fails for a reason other than "no match". */
  grepFails?: boolean;
  /** User git settings that reshape `git grep` output unless the call turns them off. */
  gitConfig?: { lineNumber?: boolean; column?: boolean; colorAlways?: boolean };
  /** Raw `git grep` stdout, whatever the flags (output this tool cannot read). */
  grepOutput?: string;
  /** Files the graph holds (default: the code files after the change, i.e. a fresh absorb). */
  graphNodes?: string[];
  /** The `git diff -U0` text; `renamedDiff` is what git prints WITHOUT --no-renames. */
  diff?: string;
  renamedDiff?: string;
  callers?: Record<string, Array<{ file: string; line: number }>>;
  noGraph?: boolean;
  /** Impact queries that ask about any of these files stop early (a deadline). */
  cutFor?: string[];
}): ChangeImpactDeps {
  const tree = new Set([...REPO2, ...(opts.files ?? [])]);
  for (const c of opts.changes) {
    if (c.status === 'D') tree.delete(c.file);
    if (c.status === 'A') tree.add(c.file);
    if (c.status === 'R') {
      tree.delete(c.from);
      tree.add(c.file);
    }
  }
  const importers: Record<string, string[]> = { ...IMPORTERS, ...opts.importers };
  const nodes = new Set(
    opts.graphNodes ?? Array.from(tree).filter((f) => /\.[cm]?[jt]sx?$/.test(f))
  );
  const abs = (f: string) => `${ROOT}/${f}`;
  const rel = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:\/repo\//i, '');
  return {
    git: (args) => {
      if (args[0] === 'ls-files') {
        return lsFiles(Array.from(new Set([...tree, ...(opts.indexKeeps ?? [])])), args);
      }
      if (args[0] === 'grep') {
        // `git grep -z -o -E <re> -- <tests and runner configs>`, as git runs it.
        if (opts.grepFails) throw Object.assign(new Error('fatal: grep'), { status: 128 });
        if (opts.grepOutput !== undefined) return opts.grepOutput;
        const cfg = opts.gitConfig ?? {};
        const color = cfg.colorAlways && !args.includes('--no-color');
        const paint = (code: string, s: string) => (color ? `\x1b[${code}m${s}\x1b[m` : s);
        const re = new RegExp(args[args.indexOf('-E') + 1], 'gi');
        const out = Object.entries(opts.contents ?? {})
          .filter(([f]) => tree.has(f) && (isTestFile(f) || /\.config\.|vitest\.workspace/.test(f)))
          .flatMap(([f, text]) =>
            Array.from(text.matchAll(re), (m) => {
              // Measured on git 2.51: each extra field is NUL-separated, and
              // color.ui=always paints the path and the match too.
              let line = paint('35', f);
              if (cfg.lineNumber && !args.includes('--no-line-number'))
                line += `\0${paint('32', '1')}`;
              if (cfg.column && !args.includes('--no-column'))
                line += `\0${paint('32', String(m.index! + 1))}`;
              return `${line}\0${paint('1;31', m[0])}\n`;
            })
          )
          .join('');
        if (!out) throw Object.assign(new Error('git grep: exit 1'), { status: 1 });
        return out;
      }
      if (args[0] === 'diff' && args[1] === '--name-only') {
        return opts.changes.map((c) => `${c.file}\n`).join('');
      }
      if (
        args[0] === 'diff' &&
        args[1] === '--name-status' &&
        args.includes('--no-renames') &&
        args.includes('-z')
      ) {
        return opts.changes
          .map((c) =>
            c.status === 'R' ? `D\0${c.from}\0A\0${c.file}\0` : `${c.status}\0${c.file}\0`
          )
          .join('');
      }
      if (args[0] === 'diff' && args[1] === '-U0') {
        return args.includes('--no-renames')
          ? (opts.diff ?? '')
          : (opts.renamedDiff ?? opts.diff ?? '');
      }
      throw new Error(`unexpected git ${args.join(' ')}`);
    },
    fileExists: (p) => tree.has(rel(p)),
    readFile: (p) => {
      const r = rel(p);
      if (MANIFESTS[r]) return MANIFESTS[r];
      if (opts.contents?.[r] !== undefined) return opts.contents[r];
      throw new Error(`no file ${r}`);
    },
    handleCodebaseTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (opts.noGraph) return { error: 'No codebase graph available' };
      if (name === 'holo_impact_analysis') {
        const requested = (args.changedFiles as string[]).map(rel);
        const unresolved = requested.filter((f) => !nodes.has(f));
        const reach = new Set(requested.filter((f) => nodes.has(f)));
        const queue = Array.from(reach);
        while (queue.length > 0) {
          for (const importer of importers[queue.shift()!] ?? []) {
            if (nodes.has(importer) && !reach.has(importer)) {
              reach.add(importer);
              queue.push(importer);
            }
          }
        }
        const cut = requested.some((f) => opts.cutFor?.includes(f));
        return {
          impactByCommunity: { c1: Array.from(reach, abs) },
          unresolvedChangedFiles: unresolved.map(abs),
          communityGroupingComplete: true,
          traversal: {
            complete: unresolved.length === 0 && !cut,
            truncationReasons: [
              ...(unresolved.length > 0 ? ['changed_file_not_indexed'] : []),
              ...(cut ? ['deadline'] : []),
            ],
          },
        };
      }
      if (name === 'holo_query_codebase') {
        const sites = opts.callers?.[String(args.symbolName)] ?? [];
        return {
          results: sites.map((s, i) => ({
            callerId: `c${i}`,
            filePath: abs(s.file),
            line: s.line,
          })),
        };
      }
      throw new Error(`unexpected tool ${name}`);
    }),
  };
}

const HELPER_DELETED_DIFF = [
  'diff --git a/packages/a/src/helper.ts b/packages/a/src/helper.ts',
  'deleted file mode 100644',
  '--- a/packages/a/src/helper.ts',
  '+++ /dev/null',
  '@@ -1,3 +0,0 @@',
  '-export function helper(): number {',
  '-  return 1;',
  '-}',
].join('\n');

describe('impact --since: a deleted or renamed file keeps the tests of files that still import it', () => {
  it('a deleted file the graph no longer holds keeps its package suite (with the reason)', async () => {
    const deps = repo2({
      changes: [
        { status: 'D', file: 'packages/a/src/helper.ts' },
        { status: 'M', file: 'packages/a/src/unrelated.ts' },
      ],
      diff: HELPER_DELETED_DIFF,
      callers: { helper: [{ file: 'packages/a/src/uses-helper.ts', line: 2 }] },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.mode).toBe('graph');
    // uses-helper.ts still imports ./helper: its test must run.
    expect(report.tests.selected).toContain('packages/a/src/__tests__/uses-helper.test.ts');
    expect(report.tests.selected).toEqual(A_TESTS);
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason:
          'packages/a/src/helper.ts was deleted and the graph no longer holds it, so the files that imported it cannot be listed',
      },
    ]);
    // The caller the graph lost is shown, labelled as name-only.
    expect(report.brief).toContain(
      'NAME-ONLY helper (removed) — called by name from packages/a/src/uses-helper.ts:2'
    );
  });

  it('a graph absorbed before the delete still holds the file: its importers are affected', async () => {
    const deps = repo2({
      changes: [{ status: 'D', file: 'packages/a/src/helper.ts' }],
      graphNodes: CODE_NODES, // includes helper.ts
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.mode).toBe('graph');
    expect(report.affectedFiles).toContain('packages/a/src/uses-helper.ts');
    expect(report.tests.selected).toEqual(['packages/a/src/__tests__/uses-helper.test.ts']);
    expect(report.tests.fullSuitePackages).toEqual([]);
  });

  it('a rename is a delete plus an add: the old path keeps the tests of files importing it', async () => {
    const deps = repo2({
      changes: [
        { status: 'R', from: 'packages/a/src/helper.ts', file: 'packages/a/src/helper2.ts' },
      ],
      // With rename detection git prints no hunks for a pure rename.
      renamedDiff: [
        'diff --git a/packages/a/src/helper.ts b/packages/a/src/helper2.ts',
        'similarity index 100%',
        'rename from packages/a/src/helper.ts',
        'rename to packages/a/src/helper2.ts',
      ].join('\n'),
      diff: [
        HELPER_DELETED_DIFF,
        'diff --git a/packages/a/src/helper2.ts b/packages/a/src/helper2.ts',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/packages/a/src/helper2.ts',
        '@@ -0,0 +1,3 @@',
        '+export function helper(): number {',
        '+  return 1;',
        '+}',
      ].join('\n'),
      callers: { helper: [{ file: 'packages/a/src/uses-helper.ts', line: 2 }] },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.changedFiles).toEqual(['packages/a/src/helper.ts', 'packages/a/src/helper2.ts']);
    expect(report.tests.selected).toEqual(A_TESTS);
    expect(report.tests.fullSuitePackages[0]?.reason).toContain(
      'packages/a/src/helper.ts was deleted'
    );
    expect(report.callers.changedSymbols).toEqual([
      { name: 'helper', kind: 'function', file: 'packages/a/src/helper.ts', change: 'removed' },
    ]);
  });
});

describe('impact --since: what the graph cannot place keeps a whole suite', () => {
  it('a changed fixture (data a test reads, not imports) keeps its package suite', async () => {
    const deps = repo2({
      changes: [{ status: 'M', file: 'packages/a/src/__tests__/fixtures/data.json' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.mode).toBe('graph');
    expect(report.tests.selected).toEqual(A_TESTS);
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason:
          'packages/a/src/__tests__/fixtures/data.json changed and is not code the graph can trace (a test may read it as data, fixture or snapshot)',
      },
    ]);
    // The one reader this cannot find is said out loud.
    expect(report.tests.untracedDataFiles).toEqual(['packages/a/src/__tests__/fixtures/data.json']);
    expect(report.brief).toContain(
      'Not searched: a test in another package that reads packages/a/src/__tests__/fixtures/data.json by path; data names are not matched across packages.'
    );
  });

  it.each(['pnpm-lock.yaml', 'tsconfig.base.json', 'vitest.workspace.ts'])(
    'a root %s (outside every package) keeps every test in the repo',
    async (file) => {
      const deps = repo2({ changes: [{ status: 'M', file }] });
      const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

      expect(report.mode).toBe('graph');
      expect(report.tests.selected).toEqual(ALL_TESTS);
      expect(report.tests.fullSet).toEqual(ALL_TESTS);
      expect(report.tests.fullSuitePackages).toEqual([
        {
          pkg: '.',
          reason: `${file} changed (manifest, lockfile, or test/build config); it is outside every package, so every test in the repo is kept`,
        },
      ]);
      expect(report.brief).toContain('4 of 4 test file(s)');
      expect(report.brief).toContain('Whole suite kept for every package');
      // Outside every package nothing is left unsearched: every test runs.
      expect(report.tests.untracedDataFiles).toEqual([]);
      expect(report.brief).not.toContain('Not searched');
    }
  );

  it('without a graph, a root lockfile change still keeps every test (not "0 of 0")', async () => {
    const deps = repo2({ changes: [{ status: 'M', file: 'pnpm-lock.yaml' }], noGraph: true });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.mode).toBe('package-fallback');
    expect(report.tests.selected).toEqual(ALL_TESTS);
    expect(report.tests.fullSuitePackages.map((f) => f.pkg)).toEqual(['.']);
  });

  it('a runner config the graph holds but nothing imports keeps its package suite', async () => {
    // vitest.config.ts is a graph node with no importers: its reach selects no
    // test. Only the package-wide rule keeps the suite.
    for (const file of ['packages/a/vitest.config.ts', 'packages/a/package.json']) {
      const deps = repo2({ changes: [{ status: 'M', file }] });
      const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

      expect(report.tests.selected).toEqual(A_TESTS);
      expect(report.tests.fullSuitePackages).toEqual([
        { pkg: 'packages/a', reason: `${file} changed (manifest, lockfile, or test/build config)` },
      ]);
    }
  });

  it('prose is inert, unless it sits with test fixtures', async () => {
    const prose = repo2({
      changes: [
        { status: 'M', file: 'README.md' },
        { status: 'M', file: 'packages/a/README.md' },
      ],
    });
    const inert = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, prose);
    expect(inert.tests.fullSuitePackages).toEqual([]);
    expect(inert.tests.selected).toEqual([]);

    const fixture = repo2({
      changes: [{ status: 'M', file: 'packages/a/src/__tests__/fixtures/expected.md' }],
    });
    const kept = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, fixture);
    expect(kept.tests.selected).toEqual(A_TESTS);
    expect(isInertFile('docs/guide.md')).toBe(true);
    expect(isInertFile('packages/a/test/golden/out.md')).toBe(false);
  });
});

const DOCS_TEST = 'packages/a/src/__tests__/docs.test.ts';
const CLI_E2E = 'packages/a/src/__tests__/cli-e2e.test.ts';

describe('impact --since: tests that name a file by path depend on it', () => {
  it('a docs page a test reads by name selects that test, with or without a graph', async () => {
    for (const noGraph of [false, true]) {
      const deps = repo2({
        files: ['docs/guide.md', DOCS_TEST],
        contents: {
          [DOCS_TEST]: "fs.readFileSync(new URL('../../../../docs/guide.md', import.meta.url))",
        },
        changes: [{ status: 'M', file: 'docs/guide.md' }],
        noGraph,
      });
      const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

      expect(report.mode).toBe(noGraph ? 'package-fallback' : 'graph');
      expect(report.tests.selected).toEqual([DOCS_TEST]);
      expect(report.tests.namedBy).toEqual([{ file: 'docs/guide.md', tests: [DOCS_TEST] }]);
      expect(report.tests.fullSuitePackages).toEqual([]);
      expect(report.brief).toContain(
        `Named by path: docs/guide.md — 1 test file(s) name it and can read or load it with no import: ${DOCS_TEST}`
      );
    }
  });

  it('a test that reads Markdown by pattern is selected for any prose change', async () => {
    const lister = 'packages/b/src/__tests__/docs-index.test.ts';
    const deps = repo2({
      files: ['docs/new-page.md', lister],
      contents: { [lister]: "readdirSync(dir).filter((f) => f.endsWith('.md'))" },
      changes: [{ status: 'M', file: 'docs/new-page.md' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);
    expect(report.tests.selected).toEqual([lister]);
  });

  it('a CLI a test spawns by path selects that test, from its own package or outside every package', async () => {
    const otherPkg = 'packages/b/src/__tests__/b-cli.test.ts';
    const rootTest = 'scripts/__tests__/run-cli.test.mjs';
    const deps = repo2({
      files: ['packages/a/src/cli.ts', CLI_E2E, otherPkg, rootTest],
      contents: {
        [CLI_E2E]:
          "execFileSync(process.execPath, [new URL('../cli.ts', import.meta.url).pathname])",
        // Another package's own cli.ts, not packages/a's.
        [otherPkg]: "spawn('tsx', ['../cli.ts'])",
        [rootTest]: "spawnSync('node', ['packages/a/dist/cli.js'])",
      },
      changes: [{ status: 'M', file: 'packages/a/src/cli.ts' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.mode).toBe('graph');
    expect(report.tests.selected).toEqual([CLI_E2E, rootTest]);
    expect(report.tests.namedBy).toEqual([
      { file: 'packages/a/src/cli.ts', tests: [CLI_E2E, rootTest] },
    ]);
  });

  it('a file the change reaches through imports selects the tests that load it by path', async () => {
    const deps = repo2({
      files: ['packages/a/src/cli.ts', CLI_E2E],
      importers: {
        'packages/a/src/helper.ts': ['packages/a/src/uses-helper.ts', 'packages/a/src/cli.ts'],
      },
      // The test runs the BUILT cli: same file, another extension.
      contents: { [CLI_E2E]: "execFileSync('node', ['dist/cli.js', '--help'])" },
      changes: [{ status: 'M', file: 'packages/a/src/helper.ts' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.affectedFiles).toContain('packages/a/src/cli.ts');
    expect(report.tests.selected).toEqual([
      CLI_E2E,
      'packages/a/src/__tests__/uses-helper.test.ts',
    ]);
    expect(report.tests.namedBy).toEqual([{ file: 'packages/a/src/cli.ts', tests: [CLI_E2E] }]);
    expect(report.tests.fullSet).toContain(CLI_E2E);
  });

  it('git settings that number or color grep output do not empty the name index', async () => {
    const deps = repo2({
      files: ['docs/guide.md', DOCS_TEST],
      contents: {
        [DOCS_TEST]: "fs.readFileSync(new URL('../../../../docs/guide.md', import.meta.url))",
      },
      changes: [{ status: 'M', file: 'docs/guide.md' }],
      gitConfig: { lineNumber: true, column: true, colorAlways: true },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([DOCS_TEST]);
    expect(report.tests.fullSuitePackages).toEqual([]);
  });

  it('grep output in a shape this tool cannot read keeps every test, with the reason', async () => {
    const deps = repo2({
      files: ['docs/guide.md'],
      changes: [{ status: 'M', file: 'docs/guide.md' }],
      // A line number git added anyway: the name field is not where it is read.
      grepOutput: `${DOCS_TEST}\0 12\0guide.md\n`,
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual(ALL_TESTS);
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: '.',
        reason:
          'the tests could not be searched for the files they name by path (1 line(s) of git grep output were not in the shape asked for), so every test in the repo is kept',
      },
    ]);
  });

  it('lists namedBy in plain code-unit order, the same on every locale', async () => {
    const deps = repo2({
      files: ['docs/a.md', 'docs/B.md', DOCS_TEST],
      contents: { [DOCS_TEST]: "read('docs/a.md'); read('docs/B.md');" },
      changes: [
        { status: 'M', file: 'docs/a.md' },
        { status: 'M', file: 'docs/B.md' },
      ],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);
    expect(report.tests.namedBy.map((n) => n.file)).toEqual(['docs/B.md', 'docs/a.md']);
  });

  it('when the tests cannot be searched, every test in the repo is kept', async () => {
    const deps = repo2({
      changes: [{ status: 'M', file: 'packages/a/src/unrelated.ts' }],
      grepFails: true,
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual(ALL_TESTS);
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: '.',
        reason:
          'the tests could not be searched for the files they name by path (git grep failed), so every test in the repo is kept',
      },
    ]);
  });
});

describe('impact --since: test support code a runner or a test loads by path', () => {
  const SETUP = 'packages/a/src/__tests__/setup.ts';

  it('a changed setup file keeps its package suite (it is not a test the runner runs alone)', async () => {
    const deps = repo2({ files: [SETUP], changes: [{ status: 'M', file: SETUP }] });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([...A_TESTS, SETUP].sort());
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason: `${SETUP} changed and is test support code (a setup file, helper or fixture): a runner or a test can load it by path, so the tests that use it cannot all be listed`,
      },
    ]);
  });

  it('a changed worker fixture keeps its package suite', async () => {
    const worker = 'packages/a/src/workers/__fixtures__/w.js';
    const deps = repo2({ files: [worker], changes: [{ status: 'M', file: worker }] });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual(A_TESTS);
    expect(report.tests.fullSuitePackages.map((f) => f.pkg)).toEqual(['packages/a']);
  });

  it('a setup file outside a test folder that a runner config names keeps that suite', async () => {
    const setup = 'packages/a/src/setupTests.ts';
    for (const noGraph of [false, true]) {
      const deps = repo2({
        files: [setup],
        contents: {
          'packages/a/vitest.config.ts':
            "export default { test: { setupFiles: ['./src/setupTests.ts'] } };",
        },
        changes: [{ status: 'M', file: setup }],
        noGraph,
      });
      const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

      expect(report.tests.selected).toEqual(A_TESTS);
      expect(report.tests.fullSuitePackages).toEqual([
        {
          pkg: 'packages/a',
          reason: `${setup} is named by packages/a/vitest.config.ts, which loads it for every test it runs, and the change reaches it`,
        },
      ]);
    }
  });

  it('a setup file the change reaches keeps the suite its runner config loads it for', async () => {
    const deps = repo2({
      files: [SETUP, 'packages/a/src/polyfill.ts'],
      importers: { 'packages/a/src/polyfill.ts': [SETUP] },
      contents: {
        'packages/a/vitest.config.ts':
          "export default { test: { setupFiles: ['./src/__tests__/setup.ts'] } };",
      },
      changes: [{ status: 'M', file: 'packages/a/src/polyfill.ts' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.affectedFiles).toContain(SETUP);
    expect(report.tests.selected).toEqual([...A_TESTS, SETUP].sort());
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason: `${SETUP} is named by packages/a/vitest.config.ts, which loads it for every test it runs, and the change reaches it`,
      },
    ]);
  });
});

describe('impact --since: a helper passes a change on to the tests that use it', () => {
  const HELPER = 'packages/a/src/__tests__/helpers/load-docs.ts';
  const USER = 'packages/a/src/__tests__/docs-loader.test.ts';
  const BASE = {
    files: ['docs/guide.md', HELPER, USER],
    importers: { [HELPER]: [USER] },
    contents: {
      [HELPER]: "export const load = () => readFileSync(join(root, 'docs/guide.md'));",
    },
    changes: [{ status: 'M' as const, file: 'docs/guide.md' }],
  };
  const KEPT = [...A_TESTS, HELPER, USER].sort();

  it('with the graph, a helper naming a changed file selects the tests that reach it, not its package', async () => {
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, repo2(BASE));

    expect(report.tests.selected).toEqual([USER]);
    expect(report.tests.fullSuitePackages).toEqual([]);
    expect(report.tests.viaHelpers).toEqual([
      { helper: HELPER, reason: 'names docs/guide.md by path', tests: [USER] },
    ]);
    // The helper is not a test that reads the file: nothing lists it as one.
    expect(report.tests.namedBy).toEqual([]);
    expect(report.brief).toContain(
      `Via helper: ${HELPER} names docs/guide.md by path; 1 test file(s) use it directly: ${USER}`
    );
    expect(report.brief).toContain('a test that reaches a helper through a path alias');
  });

  // The helper's reach goes through the same rules as the change's own reach.
  it('a setup file that imports the helper keeps the suite its runner config loads it for', async () => {
    const setup = 'packages/a/src/__tests__/setup.ts';
    const deps = repo2({
      ...BASE,
      files: ['docs/guide.md', HELPER, setup],
      importers: { [HELPER]: [setup] },
      contents: {
        ...BASE.contents,
        'packages/a/vitest.config.ts':
          "export default { test: { setupFiles: ['./src/__tests__/setup.ts'] } };",
      },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason: `${setup} is named by packages/a/vitest.config.ts, which loads it for every test it runs, and the change reaches it`,
      },
    ]);
    expect(report.tests.selected).toEqual([...A_TESTS, HELPER, setup].sort());
  });

  it('a worker that imports the helper selects the test that starts it by path', async () => {
    const worker = 'packages/a/src/workers/render.ts';
    const starter = 'packages/a/src/__tests__/render-worker.test.ts';
    const deps = repo2({
      ...BASE,
      files: ['docs/guide.md', HELPER, worker, starter],
      importers: { [HELPER]: [worker] },
      contents: {
        ...BASE.contents,
        [starter]: "new Worker(new URL('../workers/render.ts', import.meta.url));",
      },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([starter]);
    expect(report.tests.fullSuitePackages).toEqual([]);
  });

  it('a scenario file that imports the helper is selected, and so is the runner that names it', async () => {
    // A runner config can run *.scenario.ts itself (packages/studio does), and
    // a test can run one by path: both are kept.
    const scenario = 'packages/a/src/__tests__/scenarios/login.scenario.ts';
    const runner = 'packages/a/src/__tests__/scenarios.test.ts';
    const deps = repo2({
      ...BASE,
      files: ['docs/guide.md', HELPER, scenario, runner],
      importers: { [HELPER]: [scenario] },
      contents: {
        ...BASE.contents,
        [runner]: "await runScenario('./scenarios/login.scenario.ts');",
      },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([runner, scenario]);
    expect(report.tests.fullSuitePackages).toEqual([]);
  });

  it('a helper that runs the helper by path passes the change on to its own users', async () => {
    const runs = 'packages/a/src/__tests__/helpers/run-docs.ts';
    const user = 'packages/a/src/__tests__/run-docs.test.ts';
    const deps = repo2({
      ...BASE,
      files: ['docs/guide.md', HELPER, runs, user],
      importers: { [runs]: [user] },
      contents: {
        ...BASE.contents,
        [runs]: "execFileSync('tsx', [join(__dirname, 'load-docs.ts')]);",
      },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([user]);
    expect(report.tests.fullSuitePackages).toEqual([]);
    expect(report.tests.viaHelpers).toEqual([
      { helper: HELPER, reason: 'names docs/guide.md by path', tests: [] },
      { helper: runs, reason: `names ${HELPER} by path`, tests: [user] },
    ]);
    expect(report.brief).toContain(
      `Via helper: ${HELPER} names docs/guide.md by path; its users are reached through other files`
    );
  });

  it('a test that reads code files by pattern does not count as a user of the helper', async () => {
    const globber = 'packages/a/src/__tests__/globber.test.ts';
    const deps = repo2({
      ...BASE,
      files: ['docs/guide.md', HELPER, globber],
      importers: {},
      contents: { ...BASE.contents, [globber]: "files.filter((f) => f.endsWith('.ts'))" },
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.fullSuitePackages.map((f) => f.pkg)).toEqual(['packages/a']);
    expect(report.tests.selected).toEqual([...A_TESTS, HELPER, globber].sort());
  });

  it('a program (#! first line) that nothing runs from a test keeps no suite', async () => {
    const program = 'packages/a/src/__tests__/gen-docs.ts';
    const deps = repo2({
      files: ['docs/guide.md', program],
      contents: {
        [program]: '#!/usr/bin/env node\n// rewrites docs/guide.md from the trait list\n',
      },
      changes: [{ status: 'M', file: 'docs/guide.md' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.fullSuitePackages).toEqual([]);
    expect(report.tests.selected).toEqual([]);
  });

  it('a helper that reads code files by pattern selects its users for a code change, not every test in the package', async () => {
    // Like core's holotorch parity harness, which mentions `*.test.ts` in a comment.
    const harness = 'packages/a/src/__tests__/harness.ts';
    const parity = 'packages/a/src/__tests__/parity.test.ts';
    const deps = repo2({
      files: [harness, parity],
      importers: { [harness]: [parity] },
      contents: { [harness]: '// compares the outputs of every *.test.ts in this package' },
      changes: [{ status: 'M', file: 'packages/a/src/unrelated.ts' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual([parity, 'packages/a/src/__tests__/unrelated.test.ts']);
    expect(report.tests.fullSuitePackages).toEqual([]);
    expect(report.tests.viaHelpers).toEqual([
      { helper: harness, reason: 'reads code files by pattern', tests: [parity] },
    ]);
  });

  it('without a graph the helper keeps its package suite, with the reason', async () => {
    const deps = repo2({ ...BASE, noGraph: true });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.tests.selected).toEqual(KEPT);
    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason: `${HELPER} names docs/guide.md by path and is test support code; without the graph the tests that use it cannot be listed, so its package suite is kept`,
      },
    ]);
  });

  it.each([
    ['the graph does not hold the helper', { graphNodes: CODE_NODES }, 'it is not in the graph'],
    [
      'the walk from the helper is cut short',
      { cutFor: [HELPER] },
      'the graph could not list the tests that use it (traversal cut short: deadline)',
    ],
    [
      'nothing reaches the helper',
      { importers: {} },
      'nothing imports it or names it by name, so the tests that use it cannot be seen',
    ],
  ])('the helper keeps its package suite when %s', async (_label, extra, because) => {
    const report = await analyzeChangeImpact(
      { repoRoot: ROOT, since: 'HEAD' },
      repo2({ ...BASE, ...extra })
    );

    expect(report.tests.fullSuitePackages).toEqual([
      {
        pkg: 'packages/a',
        reason: `${HELPER} names docs/guide.md by path and is test support code; ${because}, so its package suite is kept`,
      },
    ]);
    expect(report.tests.selected).toEqual(KEPT);
  });
});

describe('impact --since: the runner is never handed a deleted file', () => {
  const GONE = 'packages/a/src/__tests__/unrelated.test.ts';

  it('an unstaged delete the index still lists is not selected', async () => {
    for (const noGraph of [false, true]) {
      const deps = repo2({
        changes: [
          { status: 'D', file: GONE },
          { status: 'M', file: 'packages/a/src/__tests__/fixtures/data.json' },
        ],
        indexKeeps: [GONE],
        noGraph,
      });
      const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

      expect(report.tests.selected).not.toContain(GONE);
      expect(report.tests.fullSet).not.toContain(GONE);
      expect(report.tests.selected).toEqual(A_TESTS.filter((t) => t !== GONE));
    }
  });

  it('a test file with a non-ASCII name is found (ls-files -z, not quoted by core.quotePath)', async () => {
    const cafe = 'packages/a/src/__tests__/café.test.ts';
    const deps = repo2({
      files: [cafe],
      changes: [{ status: 'M', file: 'packages/a/src/__tests__/fixtures/data.json' }],
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);
    expect(report.tests.selected).toEqual([...A_TESTS, cafe].sort());
  });

  it('a deleted test in the reach of a deleted file (graph absorbed before) is not selected', async () => {
    const gone = 'packages/a/src/__tests__/uses-helper.test.ts';
    const deps = repo2({
      changes: [
        { status: 'D', file: 'packages/a/src/helper.ts' },
        { status: 'D', file: gone },
      ],
      graphNodes: CODE_NODES, // still holds helper.ts and the deleted test
    });
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD' }, deps);

    expect(report.affectedFiles).toContain(gone);
    expect(report.tests.selected).toEqual([]);
  });
});

describe('indexNamedFiles', () => {
  it('reads file names and patterns out of git grep -z -o output', () => {
    const index = indexNamedFiles(
      [
        't/a.test.ts\0cli.ts',
        't/a.test.ts\0guide.md',
        't/b.test.ts\0Three.js',
        't/b.test.ts\0*.md',
        't/c.test.ts\0.ts',
        't/c.test.ts\0${name}.ts',
        'vitest.config.ts\0setup.ts',
        'not-a-match-line',
      ].join('\n')
    );
    expect(index.code.get('cli')).toEqual(['t/a.test.ts']);
    expect(index.code.get('three')).toEqual(['t/b.test.ts']);
    expect(index.code.get('setup')).toEqual(['vitest.config.ts']);
    expect(index.prose.get('guide.md')).toEqual(['t/a.test.ts']);
    expect(index.prosePattern).toEqual(['t/b.test.ts']);
    expect(index.codePattern).toEqual(['t/c.test.ts']);
    expect(index.unread).toBe(1); // 'not-a-match-line'
  });

  it('counts lines a git setting reshaped (line numbers, columns, color) as unread', () => {
    const index = indexNamedFiles(
      [
        't/a.test.ts\0 12\0guide.md',
        't/a.test.ts\x001\x0019\0cli.ts',
        '\x1b[35mt/a.test.ts\x1b[m\0\x1b[1;31mguide.md\x1b[m',
        't/b.test.ts\0guide.md',
      ].join('\n')
    );
    expect(index.unread).toBe(3);
    expect(index.prose.get('guide.md')).toEqual(['t/b.test.ts']);
    expect(index.code.size).toBe(0);
  });
});

describe('parseNameStatus', () => {
  it('reads -z output, keeping a delete and an add apart', () => {
    expect(parseNameStatus('D\0src/old.ts\0A\0src/new.ts\0M\0a b/c.json\0')).toEqual([
      { status: 'D', file: 'src/old.ts' },
      { status: 'A', file: 'src/new.ts' },
      { status: 'M', file: 'a b/c.json' },
    ]);
  });
});

describe('absorbAndWait', () => {
  it('waits for a backgrounded absorb job before the graph is read', async () => {
    const statuses = ['scanning', 'scanning', 'complete'];
    const handler = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
      if (name === 'holo_absorb_repo') return { accepted: true, async: true, jobId: 'job-1' };
      if (name === 'holo_get_absorb_status') return { jobId: 'job-1', status: statuses.shift() };
      throw new Error(name);
    });
    const result = await absorbAndWait(handler, ROOT, { pollMs: 0 });
    expect(result.ok).toBe(true);
    expect(handler.mock.calls.filter((c) => c[0] === 'holo_get_absorb_status')).toHaveLength(3);
    // A repo over the absorb default (20000 files) must not be truncated into a never-authoritative graph.
    expect(handler.mock.calls[0][1]).toEqual(expect.objectContaining({ maxFiles: 100_000 }));
  });

  it('reports a failed background job instead of reading an empty graph', async () => {
    const handler = vi.fn(async (name: string) =>
      name === 'holo_absorb_repo'
        ? { accepted: true, async: true, jobId: 'job-2' }
        : { jobId: 'job-2', status: 'error', error: 'memory floor' }
    );
    const result = await absorbAndWait(handler, ROOT, { pollMs: 0 });
    expect(result).toEqual({ ok: false, error: 'absorb job job-2 error: memory floor' });
  });

  it('--refresh falls back with the reason when the absorb job fails', async () => {
    const base = makeDeps();
    const deps = makeDeps({
      handleCodebaseTool: vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === 'holo_absorb_repo') return { async: true, jobId: 'j' };
        if (name === 'holo_get_absorb_status') return { status: 'cancelled', phase: 'stopped' };
        return base.handleCodebaseTool(name, args);
      }),
    });
    const report = await analyzeChangeImpact(
      { repoRoot: ROOT, since: 'HEAD~1', refresh: true, absorbPollMs: 0 },
      deps
    );
    expect(report.mode).toBe('package-fallback');
    expect(report.modeReason).toContain('absorb refresh failed');
  });
});

describe('extractChangedExportedSymbols', () => {
  it('finds changed and removed exported declarations, skipping additions and calls', () => {
    const symbols = extractChangedExportedSymbols(
      [
        DIFF,
        'diff --git a/src/gone.ts b/src/gone.ts',
        '--- a/src/gone.ts',
        '+++ b/src/gone.ts',
        '@@ -1 +0,0 @@',
        '-export const removedThing = () => 1;',
        '+export const brandNew = () => 2;',
        '-export async function same(a: string) {',
        '+export async function same(a: string) {',
      ].join('\n')
    );
    expect(symbols).toEqual([
      { name: 'add', kind: 'function', file: 'packages/a/src/math.ts', change: 'signature' },
      {
        name: 'total',
        owner: 'Calc',
        kind: 'method',
        file: 'packages/a/src/math.ts',
        change: 'signature',
      },
      { name: 'removedThing', kind: 'const', file: 'src/gone.ts', change: 'removed' },
    ]);
  });

  it('reads paths git quotes (a non-ASCII name under core.quotePath)', () => {
    // As git 2.51 prints it for src/café.ts.
    const symbols = extractChangedExportedSymbols(
      [
        'diff --git "a/src/caf\\303\\251.ts" "b/src/caf\\303\\251.ts"',
        '--- "a/src/caf\\303\\251.ts"',
        '+++ "b/src/caf\\303\\251.ts"',
        '@@ -1 +1 @@',
        '-export function brew(a: number) {',
        '+export function brew(a: number, b: number) {',
      ].join('\n')
    );
    expect(symbols).toEqual([
      { name: 'brew', kind: 'function', file: 'src/café.ts', change: 'signature' },
    ]);
  });

  it('ignores test files and declaration files', () => {
    const symbols = extractChangedExportedSymbols(
      [
        'diff --git a/src/x.test.ts b/src/x.test.ts',
        '--- a/src/x.test.ts',
        '+++ b/src/x.test.ts',
        '@@ -1 +1 @@',
        '-export function helper() {',
        '+export function helper(a) {',
        'diff --git a/src/y.d.ts b/src/y.d.ts',
        '--- a/src/y.d.ts',
        '+++ b/src/y.d.ts',
        '@@ -1 +1 @@',
        '-export function decl(): void;',
        '+export function decl(a: number): void;',
      ].join('\n')
    );
    expect(symbols).toEqual([]);
  });
});

describe('unquoteGitPath', () => {
  it('undoes git C-style quoting and leaves a plain path alone', () => {
    expect(unquoteGitPath('"b/src/caf\\303\\251.ts"')).toBe('b/src/café.ts');
    expect(unquoteGitPath('"a/we\\"ird\\\\name\\t.ts"')).toBe('a/we"ird\\name\t.ts');
    expect(unquoteGitPath('b/plain.ts')).toBe('b/plain.ts');
  });
});

describe('isTestFile', () => {
  it('recognises test naming conventions', () => {
    expect(isTestFile('packages/a/src/__tests__/x.ts')).toBe(true);
    expect(isTestFile('packages/a/src/x.spec.tsx')).toBe(true);
    expect(isTestFile('packages/a/src/x.ts')).toBe(false);
  });
});

describe('impact --since argument parsing', () => {
  it('parses --since, --refresh and --brief on impact', () => {
    const opts = parseArgs([
      'impact',
      '--since',
      'origin/main',
      '--dir',
      '.',
      '--refresh',
      '--brief',
    ]);
    expect(opts.command).toBe('impact');
    expect(opts.absorbSince).toBe('origin/main');
    expect(opts.impactRefresh).toBe(true);
    expect(opts.impactBrief).toBe(true);
    expect(opts.input).toBeUndefined();
  });
});
