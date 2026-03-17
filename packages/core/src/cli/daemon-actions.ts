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

async function computeQuality(host: DaemonHost, repoRoot: string): Promise<number> {
  const [tsc, test] = await Promise.all([
    host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], { cwd: repoRoot, timeoutMs: 120_000 }),
    host.exec('npx', ['vitest', 'run', '--reporter=json', '--no-color'], { cwd: repoRoot, timeoutMs: 120_000 }),
  ]);

  // Type error count
  const typeErrors = (tsc.stdout + tsc.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l)).length;
  const typeScore = Math.max(0, 1 - typeErrors / 100);

  // Test pass rate
  let testScore = 0.5;
  try {
    const json = JSON.parse(test.stdout);
    const total = json.numTotalTests || 1;
    const passed = json.numPassedTests || 0;
    testScore = passed / total;
  } catch {
    testScore = test.code === 0 ? 0.8 : 0.3;
  }

  return Number((typeScore * 0.6 + testScore * 0.4).toFixed(3));
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

      const candidates: string[] = [];

      if (focus === 'typefix') {
        const result = await host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const errorLines = (result.stdout + result.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l));
        const fileSet = new Set<string>();
        for (const line of errorLines) {
          const match = line.match(/^(.+?)\(\d+,\d+\):\s*error/);
          if (match) fileSet.add(match[1]);
        }
        for (const f of fileSet) {
          if ((failureCounts.get(f) || 0) < QUARANTINE_THRESHOLD) {
            candidates.push(f);
          }
        }
        bb.typeErrorCount = errorLines.length;
      } else {
        bb.typeErrorCount = 0;
      }

      bb.candidates = candidates;
      bb.candidateIndex = 0;
      bb.has_candidates = candidates.length > 0;
      log(`Found ${candidates.length} candidates`);
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

      const system = [
        `You are a TypeScript expert fixing ${focus} issues in a HoloScript codebase.`,
        'Return ONLY the complete corrected file content. No markdown fences, no explanations.',
        'If you cannot fix the issue, return the original content unchanged.',
      ].join(' ');

      const compileErrors = (bb.compileErrors as string[]) || [];
      const errorContext = compileErrors.length > 0
        ? `\nCompile errors to fix:\n${compileErrors.join('\n')}`
        : '';

      const prompt = `File: ${file}${errorContext}\n\nCurrent content:\n${content}`;

      try {
        const result = await llm.chat({ system, prompt, maxTokens: 8192 });
        bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
        bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;

        const edited = result.text.trim();

        if (isContaminatedEdit(edited)) {
          log(`Contaminated edit detected for ${file}, skipping`);
          return false;
        }

        if (edited !== content && edited.length > 10) {
          host.writeFile(file, edited);
          bb.fileEdited = true;
          log(`Applied fix to ${file}`);
        } else {
          bb.fileEdited = false;
          log(`No changes generated for ${file}`);
        }
        return true;
      } catch (err: unknown) {
        log(`LLM error: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Verify Compilation ─────────────────────────────────────────────
    verify_compilation: async (_params, bb) => {
      const result = await host.exec('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      const errors = (result.stdout + result.stderr).split('\n').filter(l => /error TS\d{4}:/.test(l));
      const baseline = (bb.typeErrorCount as number) ?? Infinity;
      bb.compilation_passed = errors.length === 0 || errors.length <= baseline;
      bb.compileErrors = errors.slice(0, 20);
      log(`Compilation: ${bb.compilation_passed ? 'PASS' : 'FAIL'} (${errors.length} errors)`);
      return bb.compilation_passed as boolean;
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
      const testFile = file
        .replace(/\.ts$/, '.test.ts')
        .replace(/\/src\//, '/src/__tests__/');

      const result = await host.exec('npx', ['vitest', 'run', '--no-color', testFile], {
        cwd: config.repoRoot, timeoutMs: 120_000,
      });
      bb.tests_passed = result.code === 0;
      log(`Tests: ${bb.tests_passed ? 'PASS' : 'FAIL'}`);
      return bb.tests_passed as boolean;
    },

    // ── Validate Quality ───────────────────────────────────────────────
    validate_quality: async (_params, bb) => {
      const qualityBefore = (bb.quality_before as number) || 0;
      const qualityAfter = await computeQuality(host, config.repoRoot);
      bb.quality_after = qualityAfter;
      bb.quality_improved = qualityAfter > qualityBefore;
      log(`Quality: ${qualityBefore.toFixed(3)} -> ${qualityAfter.toFixed(3)} (${bb.quality_improved ? 'improved' : 'regressed'})`);
      return bb.quality_improved as boolean;
    },

    // ── Commit Changes ─────────────────────────────────────────────────
    commit_changes: async (_params, bb) => {
      if (!config.commit) {
        log('Dry run — skipping commit');
        return true;
      }
      const file = bb.currentCandidate as string;
      await host.exec('git', ['add', file], { cwd: config.repoRoot });
      const focus = (bb.focus as string) || 'typefix';
      const baseName = file.split(/[/\\]/).pop() || file;
      const result = await host.exec('git', [
        'commit', '-m',
        `fix(${focus}): auto-fix ${baseName}\n\nCo-Authored-By: HoloScript Daemon <daemon@holoscript.dev>`,
      ], { cwd: config.repoRoot });
      bb.committed = result.code === 0;
      log(`Commit: ${bb.committed ? 'OK' : 'FAILED'}`);
      return bb.committed as boolean;
    },

    // ── Rollback Changes ───────────────────────────────────────────────
    rollback_changes: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      if (file) {
        await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        const isQuarantined = quarantineFile(file);
        if (isQuarantined) {
          log(`Quarantined ${file} (${QUARANTINE_THRESHOLD} failures)`);
        }
        log(`Rolled back ${file}`);
      }
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
      console.log(
        `[daemon] Cycle complete | quality: ${after.toFixed(3)} | ` +
        `delta: ${delta >= 0 ? '+' : ''}${delta.toFixed(3)} | ` +
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
