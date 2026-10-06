import { describe, expect, it, vi } from 'vitest';
import {
  absorbAndWait,
  analyzeChangeImpact,
  extractChangedExportedSymbols,
  isTestFile,
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
  'packages/b/package.json': JSON.stringify({ name: '@x/b', dependencies: { '@x/a': 'workspace:*' } }),
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

function makeDeps(overrides: Partial<ChangeImpactDeps> = {}): ChangeImpactDeps {
  const existing = new Set(FILES.map((f) => `${ROOT}/${f}`));
  return {
    git: (args) => {
      if (args[0] === 'ls-files') return FILES.join('\n');
      if (args[0] === 'diff' && args[1] === '--name-only') return 'packages/a/src/math.ts\n';
      if (args[0] === 'diff' && args[1] === '-U0') return DIFF;
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
    expect(add?.nameOnlyCount).toBe(1);
    expect(report.callers.forgotten.map((f) => f.symbol)).toContain('Calc.total');
  });

  it('writes a plain-text brief a reviewer can read', async () => {
    const report = await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, makeDeps());

    expect(report.brief).toContain('1 file(s) in packages/a');
    expect(report.brief).toContain('2 of 4 test file(s)');
    expect(report.brief).toContain('CHECK add (signature)');
    expect(report.brief).toContain('packages/a/src/uses-math.ts:12');
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

  it('reads the graph cache only — absorbs first just with --refresh', async () => {
    const deps = makeDeps();
    await analyzeChangeImpact({ repoRoot: ROOT, since: 'HEAD~1' }, deps);
    const called = (deps.handleCodebaseTool as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0]);
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

describe('isTestFile', () => {
  it('recognises test naming conventions', () => {
    expect(isTestFile('packages/a/src/__tests__/x.ts')).toBe(true);
    expect(isTestFile('packages/a/src/x.spec.tsx')).toBe(true);
    expect(isTestFile('packages/a/src/x.ts')).toBe(false);
  });
});

describe('impact --since argument parsing', () => {
  it('parses --since, --refresh and --brief on impact', () => {
    const opts = parseArgs(['impact', '--since', 'origin/main', '--dir', '.', '--refresh', '--brief']);
    expect(opts.command).toBe('impact');
    expect(opts.absorbSince).toBe('origin/main');
    expect(opts.impactRefresh).toBe(true);
    expect(opts.impactBrief).toBe(true);
    expect(opts.input).toBeUndefined();
  });
});
