/**
 * Daemon Action Handlers for HoloScript Self-Improvement Daemon
 *
 * Maps BT action names to host operations (shell exec, file I/O, LLM calls).
 * Used by the `holoscript daemon` CLI subcommand.
 *
 * Each handler receives (params, blackboard, context) and returns true/false.
 * The blackboard is the BT's shared state, passed automatically by the
 * native action bridge in BehaviorTreeTrait.
 */

import type { ActionHandler } from '../runtime/profiles/HeadlessRuntime';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface DaemonConfig {
  repoRoot: string;
  commit: boolean;
  model: string;
  verbose: boolean;
  trial?: number;
  focusRotation: string[];
  stateDir: string;
}

export interface DaemonExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface LLMProvider {
  chat(params: {
    system: string;
    prompt: string;
    maxTokens?: number;
  }): Promise<{ text: string; inputTokens: number; outputTokens: number }>;
}

export interface DaemonHost {
  readFile(filePath: string): string;
  writeFile(filePath: string, content: string): void;
  exists(filePath: string): boolean;
  exec(command: string, args?: string[], opts?: { cwd?: string; timeoutMs?: number }): Promise<DaemonExecResult>;
}

// ── Contamination Check ──────────────────────────────────────────────────────

const CONTAMINATION_SIGNATURES = [
  /^\s*(\u2713|\u2717|\u2192|\u2502|\u2500|\u23af|\.{3,})\s/m,
  /^\s*\d+\s+(passing|failing|pending)\b/m,
  /^\s*PASS\s|^\s*FAIL\s/m,
  /^error TS\d{4}:/m,
  /^\s*at\s+\S+\s+\(\S+:\d+:\d+\)/m,
];

function isContaminatedEdit(content: string): boolean {
  return CONTAMINATION_SIGNATURES.some(re => re.test(content));
}

// ── Quality Scorer ───────────────────────────────────────────────────────────

/** Count type errors from tsc output */
function countTypeErrors(output: string): number {
  return output.split('\n').filter(l => /error TS\d{4}:/.test(l)).length;
}

/**
 * Delta-based quality scoring. Measures improvement relative to baseline
 * error count captured at cycle start (not absolute normalization).
 *
 * Score = typeScore * 0.6 + testScore * 0.4
 */
async function computeQuality(
  host: DaemonHost,
  repoRoot: string,
  baselineErrors?: number,
): Promise<{ score: number; typeErrors: number; testsPassed: number; testsTotal: number }> {
  const [tsc, test] = await Promise.all([
    host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], { cwd: repoRoot, timeoutMs: 120_000 }),
    host.exec('npx', ['vitest', 'run', '--reporter=json', '--no-color', '--passWithNoTests'], { cwd: repoRoot, timeoutMs: 120_000 }),
  ]);

  const typeErrors = countTypeErrors(tsc.stdout + tsc.stderr);
  const baseline = baselineErrors ?? typeErrors;
  const typeScore = baseline === 0 ? 1 : Math.max(0, Math.min(1, 1 - typeErrors / Math.max(baseline, 1)));

  let testsPassed = 0;
  let testsTotal = 0;
  let testScore = 0.5;
  try {
    const json = JSON.parse(test.stdout);
    testsTotal = json.numTotalTests || 0;
    testsPassed = json.numPassedTests || 0;
    testScore = testsTotal > 0 ? testsPassed / testsTotal : (test.code === 0 ? 1 : 0.5);
  } catch {
    testScore = test.code === 0 ? 0.8 : 0.3;
  }

  const score = Number((typeScore * 0.6 + testScore * 0.4).toFixed(3));
  return { score, typeErrors, testsPassed, testsTotal };
}

// ── Quarantine ───────────────────────────────────────────────────────────────

const QUARANTINE_THRESHOLD = 2;
const failureCounts = new Map<string, number>();

function quarantineFile(filePath: string): boolean {
  const count = (failureCounts.get(filePath) || 0) + 1;
  failureCounts.set(filePath, count);
  return count >= QUARANTINE_THRESHOLD;
}

// ── Action Handler Factory ───────────────────────────────────────────────────

export function createDaemonActions(
  host: DaemonHost,
  llm: LLMProvider,
  config: DaemonConfig,
): Record<string, ActionHandler> {
  const log = (msg: string) => {
    if (config.verbose) console.log(`[daemon] ${msg}`);
  };

  return {
    // ── Identity & Wisdom ──────────────────────────────────────────────
    identity_intake: async (_params, bb) => {
      const wisdomPath = `${config.stateDir}/accumulated-wisdom.json`;
      if (host.exists(wisdomPath)) {
        try {
          const wisdom = JSON.parse(host.readFile(wisdomPath));
          bb.wisdom = wisdom;
          bb.wisdomCount = Array.isArray(wisdom) ? wisdom.length : 0;
          log(`Loaded ${bb.wisdomCount} wisdom entries`);
        } catch {
          bb.wisdom = [];
          bb.wisdomCount = 0;
        }
      } else {
        bb.wisdom = [];
        bb.wisdomCount = 0;
      }
      bb.identity_ready = true;
      return true;
    },

    // ── Diagnosis ──────────────────────────────────────────────────────
    diagnose: async (_params, bb) => {
      const focus = (bb.focus as string) || 'typefix';
      log(`Diagnosing with focus: ${focus}`);

      let candidates: string[] = [];

      if (focus === 'typefix' || focus === 'all') {
        // Run tsc and collect files with type errors
        const result = await host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const errorLines = (result.stdout + result.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l));

        // Count errors per file for prioritization
        const errorCounts = new Map<string, number>();
        for (const line of errorLines) {
          const match = line.match(/^(.+?)\(\d+,\d+\):\s*error/);
          if (match) {
            errorCounts.set(match[1], (errorCounts.get(match[1]) || 0) + 1);
          }
        }

        // Filter: only packages/core/src/ (skip examples/, benchmarks, external packages)
        // Then remove quarantined files
        const filtered = [...errorCounts.entries()]
          .filter(([f]) => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(([f]) => (failureCounts.get(f) || 0) < QUARANTINE_THRESHOLD);

        // Prioritize files with fewest errors (easiest wins first)
        filtered.sort((a, b) => a[1] - b[1]);

        candidates = filtered.map(([f]) => f);
        bb.typeErrorCount = errorLines.length;
        bb.typeErrorBaseline = errorLines.length;
      } else if (focus === 'coverage') {
        // Find source files that lack corresponding test files
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          const testFile = f.replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/');
          if (!host.exists(testFile) && (failureCounts.get(f) || 0) < QUARANTINE_THRESHOLD) {
            candidates.push(f);
          }
        }
        // Prioritize shorter files (easier to generate tests for)
        candidates.sort((a, b) => {
          try {
            return host.readFile(a).length - host.readFile(b).length;
          } catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'docs') {
        // Find exported functions/classes without JSDoc
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          if ((failureCounts.get(f) || 0) >= QUARANTINE_THRESHOLD) continue;
          try {
            const content = host.readFile(f);
            const hasUndocumented = /^export\s+(function|class|const|interface|type)\s+/m.test(content) &&
              !/\/\*\*[\s\S]*?\*\/\s*\nexport\s/m.test(content);
            if (hasUndocumented) candidates.push(f);
          } catch { /* skip unreadable */ }
        }
        bb.typeErrorCount = 0;
      } else {
        bb.typeErrorCount = 0;
      }

      bb.candidates = candidates;
      bb.candidateIndex = 0;
      bb.has_candidates = candidates.length > 0;
      log(`Found ${candidates.length} candidates (focus: ${focus})`);
      return true;
    },

    // ── Read Candidate ─────────────────────────────────────────────────
    read_candidate: async (_params, bb) => {
      const candidates = bb.candidates as string[];
      const idx = bb.candidateIndex as number;
      if (!candidates || idx >= candidates.length) {
        bb.has_candidates = false;
        return false;
      }
      const filePath = candidates[idx];
      try {
        bb.currentCandidate = filePath;
        bb.candidateContent = host.readFile(filePath);
        log(`Read candidate: ${filePath}`);
        return true;
      } catch (err: unknown) {
        log(`Failed to read ${filePath}: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Generate Fix (LLM Call) ────────────────────────────────────────
    generate_fix: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const content = bb.candidateContent as string;
      const focus = (bb.focus as string) || 'typefix';

      let systemPrompt: string;
      if (focus === 'coverage') {
        systemPrompt = [
          'You are a TypeScript testing expert. Generate a comprehensive test file for the given source.',
          'Use vitest (import { describe, it, expect, vi } from "vitest").',
          'Mock external dependencies with vi.mock(). Test exported functions and classes.',
          'Return ONLY the complete test file content. No markdown fences, no explanations.',
        ].join(' ');
      } else if (focus === 'docs') {
        systemPrompt = [
          'You are a TypeScript documentation expert. Add JSDoc comments to all exported symbols.',
          'Include @param, @returns, @throws, and @example where appropriate.',
          'Return ONLY the complete file content with added JSDoc. No markdown fences, no explanations.',
          'Do NOT change any code logic — only add documentation comments.',
        ].join(' ');
      } else {
        systemPrompt = [
          'You are a TypeScript expert fixing type errors in a HoloScript monorepo.',
          'Fix ONLY the specific type errors listed. Do NOT refactor, rename, or restructure.',
          'Prefer minimal fixes: add type annotations, fix import paths, cast where needed.',
          'Return ONLY the complete corrected file content. No markdown fences, no explanations.',
          'If you cannot fix the issue, return the original content unchanged.',
        ].join(' ');
      }

      // Collect errors specific to THIS file for targeted context
      const compileErrors = (bb.compileErrors as string[]) || [];
      const fileErrors = compileErrors.filter(e => e.includes(file.split(/[/\\]/).pop() || ''));
      const errorContext = fileErrors.length > 0
        ? `\nErrors in this file:\n${fileErrors.join('\n')}`
        : compileErrors.length > 0
          ? `\nCompile errors to fix:\n${compileErrors.slice(0, 10).join('\n')}`
          : '';

      const prompt = `File: ${file}${errorContext}\n\nCurrent content:\n${content}`;

      try {
        const result = await llm.chat({ system: systemPrompt, prompt, maxTokens: 8192 });
        bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
        bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;

        const edited = result.text.trim();

        if (isContaminatedEdit(edited)) {
          log(`Contaminated edit detected for ${file}, skipping`);
          // Advance past this candidate (nothing to rollback)
          const idx = ((bb.candidateIndex as number) || 0) + 1;
          bb.candidateIndex = idx;
          bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);
          return false;
        }

        if (edited !== content && edited.length > 10) {
          if (focus === 'coverage') {
            // Write to test file path, not source
            const testPath = file.replace(/\\/g, '/')
              .replace(/\.ts$/, '.test.ts')
              .replace(/\/src\//, '/src/__tests__/');
            host.writeFile(testPath, edited);
            bb.fileEdited = true;
            bb.generatedTestFile = testPath;
            log(`Generated test: ${testPath.split('/').pop()}`);
          } else {
            host.writeFile(file, edited);
            bb.fileEdited = true;
            log(`Applied fix to ${file}`);
          }
          return true;
        } else {
          bb.fileEdited = false;
          log(`No changes generated for ${file}`);
          // Advance past this candidate (nothing to rollback, skip verify/test pipeline)
          const idx = ((bb.candidateIndex as number) || 0) + 1;
          bb.candidateIndex = idx;
          bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);
          return false;
        }
      } catch (err: unknown) {
        log(`LLM error: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Verify Compilation ─────────────────────────────────────────────
    // Always returns true (check completed). Sets bb.compilation_passed flag
    // for the BT condition node to decide commit vs rollback path.
    verify_compilation: async (_params, bb) => {
      const result = await host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      const errors = (result.stdout + result.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l));
      const baseline = (bb.typeErrorCount as number) ?? Infinity;
      bb.compilation_passed = errors.length === 0 || errors.length <= baseline;
      bb.compileErrors = errors.slice(0, 20);
      log(`Compilation: ${bb.compilation_passed ? 'PASS' : 'FAIL'} (${errors.length} errors)`);
      return true;
    },

    // ── Fix From Compile Errors ────────────────────────────────────────
    fix_from_compile_errors: async (_params, bb, ctx) => {
      const file = bb.currentCandidate as string;
      try {
        bb.candidateContent = host.readFile(file);
      } catch {
        return false;
      }
      // Re-use the generate_fix handler which reads compileErrors from blackboard
      const actions = createDaemonActions(host, llm, config);
      return actions.generate_fix(_params, bb, ctx);
    },

    // ── Run Related Tests ──────────────────────────────────────────────
    run_related_tests: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const normalized = file.replace(/\\/g, '/');

      // Try multiple test file resolution patterns
      const testCandidates = [
        normalized.replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/'),
        normalized.replace(/\.ts$/, '.test.ts'),
        normalized.replace(/\.tsx$/, '.test.tsx').replace(/\/src\//, '/src/__tests__/'),
        normalized.replace(/\.ts$/, '.spec.ts').replace(/\/src\//, '/src/__tests__/'),
      ];

      const testFile = testCandidates.find(t => host.exists(t));

      if (!testFile) {
        // No test file exists — pass (don't block fixes on missing tests)
        log(`Tests: SKIP (no test file for ${normalized.split('/').pop()})`);
        bb.tests_passed = true;
        return true;
      }

      const result = await host.exec('npx', ['vitest', 'run', '--no-color', '--passWithNoTests', testFile], {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      bb.tests_passed = result.code === 0;
      log(`Tests: ${bb.tests_passed ? 'PASS' : 'FAIL'} (${testFile.split('/').pop()})`);
      return bb.tests_passed as boolean;
    },

    // ── Validate Quality ───────────────────────────────────────────────
    validate_quality: async (_params, bb) => {
      const baselineErrors = (bb.typeErrorBaseline as number) || (bb.typeErrorCount as number) || undefined;
      const result = await computeQuality(host, config.repoRoot, baselineErrors);
      const qualityBefore = (bb.quality_before as number) || 0;

      bb.quality_after = result.score;
      bb.quality_typeErrors = result.typeErrors;
      bb.quality_testsPassed = result.testsPassed;
      bb.quality_testsTotal = result.testsTotal;
      bb.quality_improved = result.score > qualityBefore;

      log(`Quality: ${qualityBefore.toFixed(3)} -> ${result.score.toFixed(3)} | ` +
        `types: ${result.typeErrors} errors | tests: ${result.testsPassed}/${result.testsTotal} passed`);
      return bb.quality_improved as boolean;
    },

    // ── Commit Changes ─────────────────────────────────────────────────
    commit_changes: async (_params, bb) => {
      if (!config.commit) {
        log('Dry run — skipping commit');
        // Rollback file changes since we're not committing
        const file = bb.currentCandidate as string;
        const testFile = bb.generatedTestFile as string | undefined;
        if (file) await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        if (testFile) await host.exec('git', ['checkout', '--', testFile], { cwd: config.repoRoot });
        bb.generatedTestFile = undefined;
        // Advance to next candidate for repeater's next iteration
        const idx = ((bb.candidateIndex as number) || 0) + 1;
        bb.candidateIndex = idx;
        bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);
        return true;
      }
      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      const focus = (bb.focus as string) || 'typefix';

      // Stage modified/created files
      const filesToAdd = testFile ? [file, testFile] : [file];
      for (const f of filesToAdd) {
        await host.exec('git', ['add', f], { cwd: config.repoRoot });
      }

      const baseName = file.split(/[/\\]/).pop() || file;
      const commitType = focus === 'coverage' ? 'test' : focus === 'docs' ? 'docs' : 'fix';
      const result = await host.exec('git', [
        'commit', '-m',
        `${commitType}(${focus}): auto-fix ${baseName}\n\nCo-Authored-By: HoloScript Daemon <daemon@holoscript.dev>`,
      ], { cwd: config.repoRoot });
      bb.committed = result.code === 0;
      log(`Commit: ${bb.committed ? 'OK' : 'FAILED'}`);

      // Advance to next candidate for repeater's next iteration
      const idx = ((bb.candidateIndex as number) || 0) + 1;
      bb.candidateIndex = idx;
      bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);

      return bb.committed as boolean;
    },

    // ── Rollback Changes ───────────────────────────────────────────────
    rollback_changes: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      if (file) {
        await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        // Also rollback generated test file if coverage mode created one
        if (testFile) {
          await host.exec('git', ['checkout', '--', testFile], { cwd: config.repoRoot });
        }
        const isQuarantined = quarantineFile(file);
        if (isQuarantined) {
          log(`Quarantined ${file} (${QUARANTINE_THRESHOLD} failures)`);
        }
        log(`Rolled back ${file}`);
      }
      bb.generatedTestFile = undefined;
      return true;
    },

    // ── Advance Candidate ──────────────────────────────────────────────
    advance_candidate: async (_params, bb) => {
      const candidates = bb.candidates as string[];
      const idx = ((bb.candidateIndex as number) || 0) + 1;
      bb.candidateIndex = idx;
      bb.has_candidates = idx < (candidates?.length || 0);
      if (bb.has_candidates) {
        log(`Advanced to candidate ${idx + 1}/${candidates.length}`);
      } else {
        log(`All candidates exhausted`);
      }
      return bb.has_candidates as boolean;
    },

    // ── Reporting ──────────────────────────────────────────────────────
    report_results: async (_params, bb) => {
      const before = (bb.quality_before as number) || 0;
      const after = (bb.quality_after as number) || 0;
      const delta = after - before;
      const iTokens = (bb.inputTokens as number) || 0;
      const oTokens = (bb.outputTokens as number) || 0;
      const typeErrors = (bb.quality_typeErrors as number) ?? '?';
      const testsPassed = (bb.quality_testsPassed as number) ?? '?';
      const testsTotal = (bb.quality_testsTotal as number) ?? '?';
      console.log(
        `[daemon] Cycle complete | quality: ${after.toFixed(3)} (${delta >= 0 ? '+' : ''}${delta.toFixed(3)}) | ` +
        `types: ${typeErrors} errors | tests: ${testsPassed}/${testsTotal} | ` +
        `tokens: ${iTokens}i/${oTokens}o`,
      );
      return true;
    },

    report_no_candidates: async (_params, bb) => {
      const focus = (bb.focus as string) || 'unknown';
      console.log(`[daemon] No candidates for focus: ${focus} — fast-fail`);
      return true;
    },

    // ── Knowledge Compression ──────────────────────────────────────────
    compress_knowledge: async (_params, bb) => {
      const wisdomPath = `${config.stateDir}/accumulated-wisdom.json`;
      const wisdom = (bb.wisdom as unknown[]) || [];
      const delta = ((bb.quality_after as number) || 0) - ((bb.quality_before as number) || 0);

      if (delta !== 0 || bb.fileEdited) {
        wisdom.push({
          cycle: bb.cycleNumber,
          focus: bb.focus,
          delta,
          candidate: bb.currentCandidate,
          timestamp: new Date().toISOString(),
        });
        while (wisdom.length > 200) wisdom.shift();
        host.writeFile(wisdomPath, JSON.stringify(wisdom, null, 2));
        log(`Saved ${wisdom.length} wisdom entries`);
      }
      return true;
    },

    // ── Motivation ─────────────────────────────────────────────────────
    praise_improvement: async (_params, _bb, ctx) => {
      ctx.emit('motivation:cycle_complete', { energy_level: 1.2 });
      return true;
    },

    integrate_shadow: async (_params, _bb, ctx) => {
      ctx.emit('motivation:cycle_complete', { energy_level: 0.9 });
      return true;
    },
  };
}
