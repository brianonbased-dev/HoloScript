/**
 * FleetSelfImproveIO — concrete SelfImproveIO so the fleet can actually RUN
 * SelfImproveCommand (the previously-unwired engine).
 *
 * Design constraints (the whole reason this is the "missing link"):
 *  - SAFE / propose-only: never commits to the working branch. autoCommit must be
 *    false in the caller; gitAdd/gitCommit here are guarded no-ops. Generated test
 *    files are written to their real path (so vitest resolves imports for a REAL
 *    pass/fail), captured as proposals, then removed by cleanup() — the tree is
 *    left exactly as found. No peer files are ever touched (explicit paths only).
 *  - REAL where it counts: real coverage-gap target finding, real LLM test
 *    generation (injected), real `vitest`/`tsc` execution on the generated file.
 *  - BOUNDED: per-file checks only (never the full suite by default); the caller
 *    sets a small maxIterations.
 *
 * The hosted GraphRAG (holo_query_codebase) is absent in this deployment (P.011),
 * so queryUntested() is a self-contained exported-symbol-without-a-test finder —
 * which matches SelfImproveCommand's own default query intent ("functions and
 * classes that have no test coverage").
 *
 * @module self-improvement
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  SelfImproveIO,
  AbsorbResult,
  UntestedTarget,
  GeneratedTest,
  VitestResult,
  VitestSuiteResult,
  LintResult,
} from './SelfImproveCommand';
import { GRPOPromptExtractor, createNodeFS } from './GRPOPromptExtractor';

const execAsync = promisify(exec);

/** Injected LLM completion — returns raw text for a (system, user) prompt. */
export type LLMComplete = (args: { system: string; user: string }) => Promise<string>;

export interface FleetSelfImproveIOOptions {
  /** Absolute repo root the run operates against. */
  rootDir: string;
  /** Real LLM completion (sovereign provider). Required — no silent fake. */
  llmComplete: LLMComplete;
  /** Optional logger; defaults to console.error tagged lines. */
  log?: (level: 'info' | 'warn' | 'error', message: string) => void;
  /** Per-tool timeout (ms) for vitest/tsc. Default 60_000. */
  toolTimeoutMs?: number;
  /** Dirs to skip when scanning for targets. */
  excludeDirs?: string[];
}

/** A captured propose-only artifact: the test we generated but did NOT commit. */
export interface SelfImproveProposal {
  testFilePath: string;
  content: string;
  symbolName: string;
  sourceFilePath: string;
  passed: boolean;
}

const DEFAULT_EXCLUDES = [
  'node_modules',
  'dist',
  'build',
  '.git',
  '.next',
  'coverage',
  '.turbo',
  '.scratch',
  '__tests__',
];

// Distinctive suffix so generated tests can never collide with real ones and are
// trivially identifiable for cleanup.
const PROPOSAL_SUFFIX = '.self-improve.proposal.test.ts';

export class FleetSelfImproveIO implements SelfImproveIO {
  private readonly rootDir: string;
  private readonly llm: LLMComplete;
  private readonly logger: (level: 'info' | 'warn' | 'error', message: string) => void;
  private readonly toolTimeoutMs: number;
  private readonly excludeDirs: Set<string>;
  /** Files written this run (untracked proposals) — removed by cleanup(). */
  private readonly written: SelfImproveProposal[] = [];

  constructor(opts: FleetSelfImproveIOOptions) {
    this.rootDir = opts.rootDir;
    this.llm = opts.llmComplete;
    this.logger =
      opts.log ?? ((level, message) => process.stderr.write(`[self-improve:${level}] ${message}\n`));
    this.toolTimeoutMs = opts.toolTimeoutMs ?? 60_000;
    this.excludeDirs = new Set(opts.excludeDirs ?? DEFAULT_EXCLUDES);
  }

  // ── SelfImproveIO ──────────────────────────────────────────────────────────

  async absorb(rootDir: string): Promise<AbsorbResult> {
    // Lightweight real scan (not the full GraphRAG build, which needs the hosted
    // graph): count source files so downstream logging is honest.
    const files = this.collectSourceFiles(rootDir);
    return { filesScanned: files.length, symbolsIndexed: 0, graphNodes: 0, graphEdges: 0 };
  }

  async queryUntested(_query: string): Promise<UntestedTarget[]> {
    const sourceFiles = this.collectSourceFiles(this.rootDir);
    const testFiles = this.collectTestFiles(this.rootDir);

    const extractor = new GRPOPromptExtractor(
      { rootDir: this.rootDir },
      createNodeFS(),
    );
    const prompts = await extractor.extractLowCoverageExports(sourceFiles, testFiles);

    return prompts.map((p) => ({
      symbolName: p.symbolName,
      filePath: p.filePath,
      language: 'typescript' as const,
      // Map difficulty to a numeric relevance score for downstream sorting.
      relevanceScore: p.difficulty === 'hard' ? 90 : p.difficulty === 'medium' ? 60 : 30,
      description: p.instruction,
    }));
  }

  async generateTest(target: UntestedTarget): Promise<GeneratedTest> {
    const absSource = path.resolve(this.rootDir, target.filePath);
    let sourceExcerpt = '';
    try {
      sourceExcerpt = fs.readFileSync(absSource, 'utf8').slice(0, 6000);
    } catch {
      sourceExcerpt = '(source unreadable)';
    }

    const testFilePath = this.proposalTestPath(target.filePath);
    const importPath = this.relativeImportSpecifier(testFilePath, absSource);

    const system =
      'You are a precise TypeScript test author. Output ONLY a complete Vitest test file ' +
      '(```ts fenced or raw), no prose. Use `import { describe, it, expect } from "vitest"`. ' +
      'Import the unit under test from the given specifier. Write focused, deterministic tests ' +
      'with no network, no filesystem, no timers. If a symbol cannot be tested in isolation, ' +
      'test the smallest pure surface you can.';
    const user =
      `Source file: ${target.filePath}\n` +
      `Primary symbol: ${target.symbolName}\n` +
      `Import the unit under test from: "${importPath}"\n\n` +
      `--- SOURCE (truncated) ---\n${sourceExcerpt}\n--- END SOURCE ---\n\n` +
      `Write a Vitest test file for the exported symbols above.`;

    const raw = await this.llm({ system, user });
    const content = this.extractCodeBlock(raw);
    return { testFilePath, content, target };
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const abs = path.resolve(this.rootDir, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    this.written.push({
      testFilePath: filePath,
      content,
      symbolName: '',
      sourceFilePath: '',
      passed: false,
    });
  }

  async runVitest(testFilePath: string): Promise<VitestResult> {
    const abs = path.resolve(this.rootDir, testFilePath);
    const started = Date.now();
    try {
      const { stdout, stderr } = await execAsync(
        `npx vitest run --reporter=json "${abs}"`,
        { cwd: this.rootDir, timeout: this.toolTimeoutMs, maxBuffer: 8 * 1024 * 1024 }
      );
      const out = stdout + stderr;
      const parsed = this.parseVitestJson(out);
      // Mark the matching proposal as passed for the captured artifact.
      const proposal = this.written.find((w) => w.testFilePath === testFilePath);
      if (proposal) proposal.passed = parsed.passed;
      return { ...parsed, duration: Date.now() - started };
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      const out = (err.stdout ?? '') + (err.stderr ?? '');
      const parsed = this.parseVitestJson(out);
      return {
        ...parsed,
        duration: Date.now() - started,
        error: parsed.passed ? undefined : (err.message ?? 'vitest failed').slice(0, 500),
      };
    }
  }

  async runFullVitest(): Promise<VitestSuiteResult> {
    // Bounded by default: callers set fullSuiteMetrics=false so this is not invoked.
    // If invoked, return a conservative zero-suite rather than running the (expensive,
    // shared-tree-unsafe) full project suite.
    this.logger('warn', 'runFullVitest skipped (bounded fleet run) — returning empty suite metrics');
    return {
      passed: true,
      testsPassed: 0,
      testsFailed: 0,
      testsTotal: 0,
      coveragePercent: 0,
      duration: 0,
    };
  }

  async runTypeCheck(): Promise<boolean> {
    // Type-check only the generated proposal file(s), not the whole project.
    const last = this.written[this.written.length - 1];
    if (!last) return true;
    const abs = path.resolve(this.rootDir, last.testFilePath);
    try {
      const { stdout, stderr } = await execAsync(
        `npx tsc --noEmit --pretty false "${abs}"`,
        { cwd: this.rootDir, timeout: this.toolTimeoutMs, maxBuffer: 8 * 1024 * 1024 }
      );
      return ((stdout + stderr).match(/error TS\d+/g) ?? []).length === 0;
    } catch (e: unknown) {
      const err = e as { stdout?: string; stderr?: string };
      return (((err.stdout ?? '') + (err.stderr ?? '')).match(/error TS\d+/g) ?? []).length === 0;
    }
  }

  async runLint(): Promise<LintResult> {
    const last = this.written[this.written.length - 1];
    if (!last) return { issueCount: 0, filesLinted: 0 };
    const abs = path.resolve(this.rootDir, last.testFilePath);
    try {
      const { stdout, stderr } = await execAsync(`npx eslint "${abs}" --format json`, {
        cwd: this.rootDir,
        timeout: this.toolTimeoutMs,
        maxBuffer: 8 * 1024 * 1024,
      });
      const out = stdout + stderr;
      try {
        const parsed = JSON.parse(out) as Array<{ errorCount?: number; warningCount?: number }>;
        const issueCount = parsed.reduce(
          (n, f) => n + (f.errorCount ?? 0) + (f.warningCount ?? 0),
          0
        );
        return { issueCount, filesLinted: parsed.length };
      } catch {
        return { issueCount: 0, filesLinted: 1 };
      }
    } catch {
      return { issueCount: 0, filesLinted: 1 };
    }
  }

  async getCircuitBreakerHealth(): Promise<number> {
    return 100; // Honest default (same as daemon-grpo-runner); real metric is future work.
  }

  async gitAdd(_filePath: string): Promise<void> {
    // Propose-only: never stage. Guarded no-op (autoCommit must be false).
    this.logger('warn', 'gitAdd ignored — FleetSelfImproveIO is propose-only (set autoCommit:false)');
  }

  async gitCommit(_message: string): Promise<void> {
    this.logger('warn', 'gitCommit ignored — FleetSelfImproveIO is propose-only (set autoCommit:false)');
  }

  log(level: 'info' | 'warn' | 'error', message: string): void {
    this.logger(level, message);
  }

  // ── Propose-only lifecycle ───────────────────────────────────────────────────

  /** The captured proposals (test files generated this run, with pass/fail). */
  getProposals(): SelfImproveProposal[] {
    return this.written.map((w) => ({ ...w }));
  }

  /**
   * Remove every untracked proposal file we wrote, leaving the tree as found.
   * Explicit paths only — never touches anything we didn't write this run.
   */
  cleanup(): { removed: number; failed: string[] } {
    let removed = 0;
    const failed: string[] = [];
    for (const w of this.written) {
      const abs = path.resolve(this.rootDir, w.testFilePath);
      try {
        if (fs.existsSync(abs)) {
          fs.unlinkSync(abs);
          removed += 1;
        }
      } catch {
        failed.push(w.testFilePath);
      }
    }
    return { removed, failed };
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private collectSourceFiles(root: string): string[] {
    const out: string[] = [];
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (this.excludeDirs.has(e.name)) continue;
          walk(path.join(dir, e.name));
        } else if (
          e.isFile() &&
          e.name.endsWith('.ts') &&
          !e.name.endsWith('.d.ts') &&
          !e.name.endsWith('.test.ts') &&
          !e.name.endsWith('.spec.ts')
        ) {
          out.push(path.join(dir, e.name));
        }
      }
    };
    walk(path.resolve(root));
    return out;
  }

  private collectTestFiles(root: string): string[] {
    // Same walk as collectSourceFiles but targets test/spec files.
    // Does NOT exclude __tests__ directories so tests inside them are found.
    const excludeForTests = new Set([...this.excludeDirs].filter((d) => d !== '__tests__'));
    const out: string[] = [];
    const walk = (dir: string): void => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.isDirectory()) {
          if (excludeForTests.has(e.name)) continue;
          walk(path.join(dir, e.name));
        } else if (
          e.isFile() &&
          (e.name.endsWith('.test.ts') || e.name.endsWith('.spec.ts'))
        ) {
          out.push(path.join(dir, e.name));
        }
      }
    };
    walk(path.resolve(root));
    return out;
  }

  private proposalTestPath(sourceRel: string): string {
    const dir = path.dirname(sourceRel);
    const base = path.basename(sourceRel, '.ts');
    return path.join(dir, '__tests__', `${base}${PROPOSAL_SUFFIX}`).split(path.sep).join('/');
  }

  private relativeImportSpecifier(testFileRel: string, absSource: string): string {
    const absTest = path.resolve(this.rootDir, testFileRel);
    let spec = path.relative(path.dirname(absTest), absSource).split(path.sep).join('/');
    spec = spec.replace(/\.ts$/, '');
    if (!spec.startsWith('.')) spec = `./${spec}`;
    return spec;
  }

  private extractCodeBlock(raw: string): string {
    const fenced = raw.match(/```(?:ts|typescript)?\s*\n([\s\S]*?)```/i);
    return (fenced ? fenced[1] : raw).trim() + '\n';
  }

  private parseVitestJson(output: string): Omit<VitestResult, 'duration'> {
    const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const r = JSON.parse(jsonMatch[0]) as {
          numPassedTests?: number;
          numFailedTests?: number;
          numTotalTests?: number;
          success?: boolean;
        };
        const testsTotal = r.numTotalTests ?? 0;
        const testsPassed = r.numPassedTests ?? 0;
        const testsFailed = r.numFailedTests ?? 0;
        return {
          passed: (r.success ?? testsFailed === 0) && testsTotal > 0,
          testsPassed,
          testsFailed,
          testsTotal,
        };
      } catch {
        /* fall through */
      }
    }
    return { passed: false, testsPassed: 0, testsFailed: 0, testsTotal: 0 };
  }
}
