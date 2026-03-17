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
import {
  buildDaemonPromptContext,
  getDaemonSystemPrompt,
  type DaemonProvider,
  type DaemonToolProfile,
} from './daemon-prompt-profiles';

// ── Interfaces ───────────────────────────────────────────────────────────────

export interface DaemonConfig {
  repoRoot: string;
  commit: boolean;
  model: string;
  provider?: DaemonProvider;
  toolProfile?: DaemonToolProfile;
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
  stateDir: string,
  baselineErrors?: number,
): Promise<{ score: number; typeErrors: number; testsPassed: number; testsTotal: number }> {
  const [tsc, test] = await Promise.all([
    host.exec('npx', tscCheckArgs(stateDir), { cwd: repoRoot, timeoutMs: 120_000 }),
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

// ── Incremental tsc ──────────────────────────────────────────────────────────

/** tsc args with incremental caching — subsequent runs in same cycle reuse .tsbuildinfo */
function tscCheckArgs(stateDir: string): string[] {
  return ['tsc', '--noEmit', '--pretty', 'false',
    '--incremental', '--tsBuildInfoFile', `${stateDir}/.daemon-tsbuildinfo`];
}

// ── Lightweight Import Graph (GraphRAG-lite) ─────────────────────────────────

/** Count how many candidate files import each candidate (downstream impact) */
function computeDownstreamImpact(
  candidates: Array<[string, number]>,
  host: DaemonHost,
): Map<string, number> {
  const impact = new Map<string, number>();
  for (const [file] of candidates) {
    try {
      const content = host.readFile(file);
      const re = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        const importedBase = m[1].split('/').pop()?.replace(/\.(ts|tsx|js)$/, '') || '';
        for (const [cFile] of candidates) {
          if (cFile === file) continue;
          const cBase = cFile.split(/[/\\]/).pop()?.replace(/\.(ts|tsx)$/, '') || '';
          if (importedBase === cBase) {
            impact.set(cFile, (impact.get(cFile) || 0) + 1);
          }
        }
      }
    } catch { /* skip unreadable */ }
  }
  return impact;
}

/** Extract exported type signatures from imported files for LLM context */
function extractDependencyContext(content: string, file: string, host: DaemonHost): string {
  const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
  let im: RegExpExecArray | null;
  const exports: string[] = [];
  const dir = file.replace(/[/\\][^/\\]+$/, '');
  while ((im = importRe.exec(content))) {
    for (const ext of ['.ts', '.tsx', '/index.ts']) {
      const resolved = `${dir}/${im[1]}${ext}`.replace(/\\/g, '/');
      try {
        if (host.exists(resolved)) {
          const depContent = host.readFile(resolved);
          const exportLines = depContent.split('\n')
            .filter(l => /^export\s/.test(l))
            .slice(0, 10)
            .join('\n');
          if (exportLines) exports.push(`// ${im[1]}:\n${exportLines}`);
          break;
        }
      } catch { /* skip */ }
    }
  }
  return exports.length > 0 ? `\n\nImported type signatures:\n${exports.join('\n')}` : '';
}

// ── Patch Types & Helpers ────────────────────────────────────────────────────

interface Patch {
  old: string;
  new: string;
}

interface PatchResponse {
  analysis: string;
  patches: Patch[];
}

/** Parse LLM JSON response into structured patches */
function parsePatchResponse(text: string): PatchResponse | null {
  let jsonStr = text.trim();
  // Strip markdown code fences if LLM wraps output
  const fenceMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.patches)) return null;

    const patches: Patch[] = [];
    for (const p of parsed.patches) {
      if (typeof p.old === 'string' && typeof p.new === 'string' && p.old !== p.new) {
        patches.push({ old: p.old, new: p.new });
      }
    }

    return {
      analysis: typeof parsed.analysis === 'string' ? parsed.analysis : '',
      patches,
    };
  } catch {
    return null;
  }
}

/** Apply patches to file content via exact string matching (like Edit tool's old→new) */
function applyPatches(content: string, patches: Patch[]): { result: string; applied: number; failed: string[] } {
  let result = content;
  let applied = 0;
  const failed: string[] = [];

  for (const patch of patches) {
    const idx = result.indexOf(patch.old);
    if (idx === -1) {
      failed.push(`Not found: "${patch.old.slice(0, 80)}..."`);
      continue;
    }
    // Require unique match — ambiguous patches are dangerous
    if (result.indexOf(patch.old, idx + 1) !== -1) {
      failed.push(`Ambiguous (2+ matches): "${patch.old.slice(0, 80)}..."`);
      continue;
    }
    result = result.slice(0, idx) + patch.new + result.slice(idx + patch.old.length);
    applied++;
  }

  return { result, applied, failed };
}

/** Safety guards — reject destructive LLM edits */
function validatePatchSafety(original: string, patched: string): { safe: boolean; reason?: string } {
  const origLines = original.split('\n').length;
  const patchedLines = patched.split('\n').length;

  // Guard 1: Reject if >20% of lines deleted
  if (patchedLines < origLines * 0.8) {
    return { safe: false, reason: `Deleted ${origLines - patchedLines} lines (${((1 - patchedLines / origLines) * 100).toFixed(0)}% reduction)` };
  }

  // Guard 2: Reject if too many `as any` added
  const origAsAny = (original.match(/as any/g) || []).length;
  const patchedAsAny = (patched.match(/as any/g) || []).length;
  if (patchedAsAny - origAsAny > 2) {
    return { safe: false, reason: `Added ${patchedAsAny - origAsAny} "as any" casts (max 2 allowed)` };
  }

  // Guard 3: Reject if exported symbols decreased
  const origExports = (original.match(/^export\s/gm) || []).length;
  const patchedExports = (patched.match(/^export\s/gm) || []).length;
  if (patchedExports < origExports - 1) {
    return { safe: false, reason: `Removed ${origExports - patchedExports} exports` };
  }

  return { safe: true };
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

  const promptContext = buildDaemonPromptContext(
    config.provider || 'anthropic',
    config.toolProfile || 'standard',
  );
  const { provider, toolProfile } = promptContext;

  log(`LLM provider=${provider} | toolProfile=${toolProfile} | model=${config.model}`);

  /** Advance blackboard to next candidate (shared by generate_fix skip paths) */
  const advanceCandidate = (bb: Record<string, unknown>) => {
    const idx = ((bb.candidateIndex as number) || 0) + 1;
    bb.candidateIndex = idx;
    bb.has_candidates = idx < ((bb.candidates as string[])?.length || 0);
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
        // Run tsc and collect files with type errors (incremental for speed)
        const result = await host.exec('npx', tscCheckArgs(config.stateDir), {
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

        // Rank by downstream impact × error tractability
        // Files imported by many others AND with few errors = highest value
        const impact = computeDownstreamImpact(filtered, host);
        filtered.sort((a, b) => {
          const scoreA = (1 + (impact.get(a[0]) || 0)) / (1 + a[1]);
          const scoreB = (1 + (impact.get(b[0]) || 0)) / (1 + b[1]);
          return scoreB - scoreA;
        });

        candidates = filtered.map(([f]) => f);
        bb.typeErrorCount = errorLines.length;
        bb.typeErrorBaseline = errorLines.length;

        // Store per-file error lines so generate_fix can filter precisely
        const perFileErrors: Record<string, string[]> = {};
        for (const line of errorLines) {
          const match = line.match(/^(.+?)\(\d+,\d+\):\s*error/);
          if (match) {
            const f = match[1];
            if (!perFileErrors[f]) perFileErrors[f] = [];
            perFileErrors[f].push(line);
          }
        }
        bb.perFileErrors = perFileErrors;
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
    // Think→Patch architecture: LLM reasons about errors, proposes JSON patches,
    // patches are applied programmatically. Prevents file truncation/deletion.
    generate_fix: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const content = bb.candidateContent as string;
      const focus = (bb.focus as string) || 'typefix';

      // ── Coverage/Docs: full-file approach (generating new content) ────
      if (focus === 'coverage') {
        const systemPrompt = getDaemonSystemPrompt('coverage', promptContext);
        try {
          const result = await llm.chat({ system: systemPrompt, prompt: `File: ${file}\n\n${content}`, maxTokens: 8192 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          const edited = result.text.trim();
          if (edited.length > 10 && !isContaminatedEdit(edited)) {
            const testPath = file.replace(/\\/g, '/').replace(/\.ts$/, '.test.ts').replace(/\/src\//, '/src/__tests__/');
            host.writeFile(testPath, edited);
            bb.fileEdited = true;
            bb.generatedTestFile = testPath;
            log(`Generated test: ${testPath.split('/').pop()}`);
            return true;
          }
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      if (focus === 'docs') {
        const systemPrompt = getDaemonSystemPrompt('docs', promptContext);
        try {
          const result = await llm.chat({ system: systemPrompt, prompt: `File: ${file}\n\n${content}`, maxTokens: 8192 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          const edited = result.text.trim();
          if (edited !== content && edited.length > 10 && !isContaminatedEdit(edited)) {
            host.writeFile(file, edited);
            bb.fileEdited = true;
            log(`Applied docs to ${file}`);
            return true;
          }
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      // ── Type fixes: think→patch→apply architecture ────────────────────
      // The LLM reasons about each error, then proposes minimal patches.
      // Patches are applied programmatically — no full-file rewrite.

      // Collect errors specific to THIS file using exact path match
      const perFileErrors = (bb.perFileErrors as Record<string, string[]>) || {};
      const compileErrors = (bb.compileErrors as string[]) || [];
      const baseName = file.split(/[/\\]/).pop() || '';

      // Prefer exact path match from diagnose, fall back to basename match from verify
      const fileErrors = perFileErrors[file]
        || perFileErrors[file.replace(/\\/g, '/')]
        || compileErrors.filter(e => {
          const m = e.match(/^(.+?)\(\d+,\d+\):/);
          return m && m[1].replace(/\\/g, '/') === file.replace(/\\/g, '/');
        });
      const errorContext = fileErrors.length > 0
        ? fileErrors.join('\n')
        : '';

      // Skip LLM call entirely if no errors belong to this file — saves tokens
      if (!errorContext) {
        log(`No errors in ${baseName} (errors are in other files), skipping`);
        advanceCandidate(bb);
        return false;
      }

      // Dependency context from GraphRAG-lite
      const depContext = extractDependencyContext(content, file, host);

      const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);

      const prompt = [
        `File: ${file}`,
        '',
        'Type errors to fix:',
        errorContext || '(no specific errors — check file for type issues)',
        depContext,
        '',
        `Source (${content.split('\n').length} lines):`,
        content,
      ].join('\n');

      try {
        const result = await llm.chat({ system: systemPrompt, prompt, maxTokens: 4096 });
        bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
        bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;

        // Parse structured response
        const patchResponse = parsePatchResponse(result.text);
        if (!patchResponse) {
          log(`Failed to parse LLM JSON for ${baseName}, skipping`);
          advanceCandidate(bb);
          return false;
        }

        if (patchResponse.analysis) {
          log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
        }

        if (patchResponse.patches.length === 0) {
          log(`No patches proposed for ${baseName}`);
          advanceCandidate(bb);
          return false;
        }

        // Apply patches via exact string matching
        const { result: patched, applied, failed } = applyPatches(content, patchResponse.patches);
        if (applied === 0) {
          log(`All ${failed.length} patches failed to match in ${baseName}`);
          for (const f of failed.slice(0, 3)) log(`  ${f}`);
          advanceCandidate(bb);
          return false;
        }
        if (failed.length > 0) {
          log(`${applied}/${patchResponse.patches.length} patches applied (${failed.length} failed) in ${baseName}`);
        }

        // Safety validation — reject destructive edits
        const safety = validatePatchSafety(content, patched);
        if (!safety.safe) {
          log(`SAFETY REJECT: ${safety.reason} — skipping ${baseName}`);
          advanceCandidate(bb);
          return false;
        }

        // Contamination check
        if (isContaminatedEdit(patched)) {
          log(`Contaminated edit detected for ${baseName}, skipping`);
          advanceCandidate(bb);
          return false;
        }

        // Write patched file
        host.writeFile(file, patched);
        bb.fileEdited = true;
        log(`Applied ${applied} patches to ${baseName}`);
        return true;
      } catch (err: unknown) {
        log(`LLM error: ${(err as Error).message}`);
        return false;
      }
    },

    // ── Verify Compilation ─────────────────────────────────────────────
    // Always returns true (check completed). Sets bb.compilation_passed flag
    // for the BT condition node to decide commit vs rollback path.
    verify_compilation: async (_params, bb) => {
      const result = await host.exec('npx', tscCheckArgs(config.stateDir), {
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
      const result = await computeQuality(host, config.repoRoot, config.stateDir, baselineErrors);
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
        advanceCandidate(bb);
        return true;
      }
      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      const focus = (bb.focus as string) || 'typefix';

      // Stage modified/created files
      const filesToAdd = testFile ? [file, testFile] : [file];
      for (const f of filesToAdd) {
        const addResult = await host.exec('git', ['add', f], { cwd: config.repoRoot });
        if (addResult.code !== 0) {
          log(`git add FAILED for ${f} (stderr=${(addResult.stderr || '').trim()})`);
        }
      }

      const baseName = file.split(/[/\\]/).pop() || file;
      const commitType = focus === 'coverage' ? 'test' : focus === 'docs' ? 'docs' : 'fix';
      const result = await host.exec('git', [
        'commit', '--no-verify', '-m',
        `${commitType}(${focus}): auto-fix ${baseName} [daemon]`,
      ], { cwd: config.repoRoot });
      bb.committed = result.code === 0;
      if (!bb.committed) {
        log(`Commit: FAILED (code=${result.code}, stderr=${(result.stderr || '').trim()})`);
      } else {
        log(`Commit: OK`);
      }

      advanceCandidate(bb);
      return bb.committed as boolean;
    },

    // ── Rollback Changes ───────────────────────────────────────────────
    rollback_changes: async (_params, bb) => {
      const file = bb.currentCandidate as string;
      const testFile = bb.generatedTestFile as string | undefined;
      if (file) {
        const rb = await host.exec('git', ['checkout', '--', file], { cwd: config.repoRoot });
        if (rb.code !== 0) {
          log(`Rollback FAILED for ${file} (stderr=${(rb.stderr || '').trim()})`);
        }
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
