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
  /** Current cycle's focus — set by the runner per cycle */
  cycleFocus?: string;
  /** Path to the daemon composition file */
  daemonFile?: string;
  /** Failure count before permanent skip — from composition blackboard */
  quarantineThreshold?: number;
  /** Quality score from previous cycle (carried forward) */
  qualityBefore?: number;
  /** Files already committed in previous cycles (skip in diagnose) */
  committedFiles?: string[];
  /** Failure counts from previous cycles (restore quarantine state) */
  failedFiles?: Record<string, number>;
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

/**
 * Multi-file context: resolve base class and closely related files for coordinated patches.
 * Returns array of { path, content } for files the LLM can patch alongside the candidate.
 */
interface RelatedFile { path: string; content: string; relation: string }

function resolveRelatedFiles(content: string, file: string, host: DaemonHost, errorContext: string): RelatedFile[] {
  const related: RelatedFile[] = [];
  const dir = file.replace(/[/\\][^/\\]+$/, '');

  // 1. Find base class — look for 'extends XXX' in the source
  const extendsMatch = content.match(/class\s+\w+\s+extends\s+(\w+)/);
  if (extendsMatch) {
    const baseClass = extendsMatch[1];
    // Find which import provides this base class
    const importRe = new RegExp(`import[^'"]*['"](\\.[\\/][^'"]+)['"]`);
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.includes(baseClass) && importRe.test(line)) {
        const importMatch = line.match(importRe);
        if (importMatch) {
          for (const ext of ['.ts', '.tsx', '/index.ts']) {
            const resolved = `${dir}/${importMatch[1]}${ext}`.replace(/\\/g, '/');
            try {
              if (host.exists(resolved)) {
                related.push({ path: resolved, content: host.readFile(resolved), relation: `base class (${baseClass})` });
                break;
              }
            } catch { /* skip */ }
          }
        }
        break;
      }
    }
  }

  // 2. If errors mention a type from another file, include that file
  const errorTypeMatch = errorContext.match(/Type '(\w+)' is not assignable|missing.*from type '(\w+)'/);
  if (errorTypeMatch) {
    const typeName = errorTypeMatch[1] || errorTypeMatch[2];
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let im: RegExpExecArray | null;
    while ((im = importRe.exec(content))) {
      for (const ext of ['.ts', '.tsx', '/index.ts']) {
        const resolved = `${dir}/${im[1]}${ext}`.replace(/\\/g, '/');
        try {
          if (host.exists(resolved) && !related.some(r => r.path === resolved)) {
            const depContent = host.readFile(resolved);
            if (depContent.includes(typeName)) {
              related.push({ path: resolved, content: depContent, relation: `defines ${typeName}` });
              break;
            }
          }
        } catch { /* skip */ }
      }
    }
  }

  // Cap at 2 related files to avoid token explosion
  return related.slice(0, 2);
}

// ── Feature Sweep Helpers ───────────────────────────────────────────────────

const SWEEP_TARGETS = ['node', 'python'] as const;
const PROFILE_MATRIX = ['headless', 'minimal', 'full'] as const;

type SweepTarget = (typeof SWEEP_TARGETS)[number];
type RuntimeProfile = (typeof PROFILE_MATRIX)[number];

interface CompilerSweepResult {
  target: SweepTarget;
  ok: boolean;
  output: string;
  error: string;
}

interface RuntimeProfileResult {
  profile: RuntimeProfile;
  ok: boolean;
  error: string;
}

interface AbsorbRoundtripResult {
  sourceFile: string;
  absorbedFile: string;
  compiledFile: string;
  absorbOk: boolean;
  compileOk: boolean;
  error: string;
}

interface TraitCoverageResult {
  sampledFiles: number;
  sampledTraits: number;
  sampledCategories: number;
  categories: string[];
}

function sanitizeName(filePath: string): string {
  return filePath
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .slice(0, 120);
}

function collectTraitCoverage(content: string): TraitCoverageResult {
  const traits = new Set<string>();
  const categories = new Set<string>();

  const inferCategory = (trait: string): string => {
    const t = trait.toLowerCase();
    if (/grab|throw|click|hover|drag|point|hold|equip|consume/.test(t)) return 'interaction';
    if (/collid|physics|rigid|kinematic|trigger|gravity|mass|friction/.test(t)) return 'physics';
    if (/glow|emiss|transparent|reflect|billboard|particle|animat/.test(t)) return 'visual';
    if (/network|sync|replicat|persistent|owned|host/.test(t)) return 'networking';
    if (/npc|path|llm|state_machine|crowd|agent/.test(t)) return 'ai-behavior';
    if (/anchor|track|world_locked|hand|eye|plane/.test(t)) return 'spatial';
    if (/audio|voice|reverb|doppler/.test(t)) return 'audio';
    if (/state|reactive|observable|computed/.test(t)) return 'state';
    if (/iot|digital_twin|mqtt|telemetry|sensor/.test(t)) return 'iot';
    if (/wallet|nft|token|marketplace|zora|economy/.test(t)) return 'economics-web3';
    if (/zero_knowledge|zk_|rsa|audit|security|encrypt/.test(t)) return 'security';
    return 'other';
  };

  const traitRe = /@([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match: RegExpExecArray | null;
  while ((match = traitRe.exec(content))) {
    const trait = match[1];
    traits.add(trait);
    categories.add(inferCategory(trait));
  }

  return {
    sampledFiles: 1,
    sampledTraits: traits.size,
    sampledCategories: categories.size,
    categories: [...categories].sort(),
  };
}

async function runCompilerSweep(
  host: DaemonHost,
  repoRoot: string,
  stateDir: string,
  compositionFile: string,
): Promise<CompilerSweepResult[]> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const safeName = sanitizeName(compositionFile.split(/[/\\]/).pop() || 'composition.hsplus');
  const results: CompilerSweepResult[] = [];

  for (const target of SWEEP_TARGETS) {
    const output = `${stateDir}/sweep-${safeName}.${target === 'python' ? 'py' : 'js'}`;
    const execResult = await host.exec('npx', [
      'tsx',
      runner,
      'compile',
      compositionFile,
      '--target',
      target,
      '--output',
      output,
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    });

    results.push({
      target,
      ok: execResult.code === 0,
      output,
      error: (execResult.stderr || execResult.stdout || '').trim(),
    });
  }

  return results;
}

async function runRuntimeProfileMatrix(
  host: DaemonHost,
  repoRoot: string,
  compositionFile: string,
): Promise<RuntimeProfileResult[]> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const results: RuntimeProfileResult[] = [];

  for (const profile of PROFILE_MATRIX) {
    const execResult = await host.exec('npx', [
      'tsx',
      runner,
      'run',
      compositionFile,
      '--profile',
      profile,
      '--ticks',
      '1',
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    });

    results.push({
      profile,
      ok: execResult.code === 0,
      error: (execResult.stderr || execResult.stdout || '').trim(),
    });
  }

  return results;
}

async function runAbsorbRoundtrip(
  host: DaemonHost,
  repoRoot: string,
  stateDir: string,
  sourceFile: string,
): Promise<AbsorbRoundtripResult> {
  const runner = 'packages/core/src/cli/holoscript-runner.ts';
  const safeName = sanitizeName(sourceFile.split(/[/\\]/).pop() || 'source.ts');
  const absorbedFile = `${stateDir}/roundtrip-${safeName}.hsplus`;
  const compiledFile = `${stateDir}/roundtrip-${safeName}.js`;

  const absorbResult = await host.exec('npx', [
    'tsx',
    runner,
    'absorb',
    sourceFile,
    '--output',
    absorbedFile,
  ], {
    cwd: repoRoot,
    timeoutMs: 120_000,
  });

  const compileResult = absorbResult.code === 0
    ? await host.exec('npx', [
      'tsx',
      runner,
      'compile',
      absorbedFile,
      '--target',
      'node',
      '--output',
      compiledFile,
    ], {
      cwd: repoRoot,
      timeoutMs: 120_000,
    })
    : { code: 1, stdout: '', stderr: 'absorb step failed' };

  return {
    sourceFile,
    absorbedFile,
    compiledFile,
    absorbOk: absorbResult.code === 0,
    compileOk: compileResult.code === 0,
    error: ((absorbResult.stderr || '') + '\n' + (compileResult.stderr || '')).trim(),
  };
}

// ── Patch Types & Helpers ────────────────────────────────────────────────────

interface Patch {
  old: string;
  new: string;
  /** Optional file path for multi-file patches. If omitted, applies to primary candidate. */
  file?: string;
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
        patches.push({ old: p.old, new: p.new, file: typeof p.file === 'string' ? p.file : undefined });
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

/** Threshold read from composition blackboard (default 3) */
let quarantineThreshold = 3;
const failureCounts = new Map<string, number>();
const committedFiles = new Set<string>();

/** Returns true if the file should be permanently skipped */
function quarantineFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const count = (failureCounts.get(normalized) || 0) + 1;
  failureCounts.set(normalized, count);
  return count >= quarantineThreshold;
}

/** Check if a file is already quarantined without incrementing */
function isQuarantined(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  return (failureCounts.get(normalized) || 0) >= quarantineThreshold;
}

/** Check if a file was already committed this daemon run */
function isCommitted(filePath: string): boolean {
  return committedFiles.has(filePath.replace(/\\/g, '/'));
}

/** Get serializable file tracking state for persistence */
export function getDaemonFileState(): { committed: string[]; failures: Record<string, number> } {
  return {
    committed: [...committedFiles],
    failures: Object.fromEntries(failureCounts),
  };
}

// ── Action Handler Factory ───────────────────────────────────────────────────

export function createDaemonActions(
  host: DaemonHost,
  llm: LLMProvider,
  config: DaemonConfig,
): Record<string, ActionHandler> {
  // Apply composition-driven quarantine threshold
  if (config.quarantineThreshold !== undefined) {
    quarantineThreshold = config.quarantineThreshold;
  }

  // Restore persisted file tracking from previous cycles
  if (config.committedFiles) {
    for (const f of config.committedFiles) committedFiles.add(f);
  }
  if (config.failedFiles) {
    for (const [f, count] of Object.entries(config.failedFiles)) {
      failureCounts.set(f, Math.max(failureCounts.get(f) || 0, count));
    }
  }

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
      // Inject cycle focus and daemon file from config (reliable path —
      // AST blackboard injection may not survive parse→clone→materialize)
      if (config.cycleFocus) bb.focus = config.cycleFocus;
      if (config.daemonFile) bb.daemon_file = config.daemonFile;

      bb.identity_ready = true;
      return true;
    },

    // ── Diagnosis ──────────────────────────────────────────────────────
    diagnose: async (_params, bb) => {
      const focus = (bb.focus as string) || 'typefix';
      log(`Diagnosing with focus: ${focus}`);
      const daemonCompositionFile = (bb.daemon_file as string) || '';
      const validationFocuses = new Set(['target-sweep', 'trait-sampling', 'runtime-matrix', 'absorb-roundtrip']);
      bb.validation_focus = validationFocuses.has(focus);
      bb.edit_focus = !bb.validation_focus;

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
          .filter(([f]) => !isCommitted(f))
          .filter(([f]) => !isQuarantined(f));

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
          if (!host.exists(testFile) && !isQuarantined(f) && !isCommitted(f)) {
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
      } else if (focus === 'lint') {
        // Find files with common lint issues: unused imports, any casts, console.log
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          if (isQuarantined(f) || isCommitted(f)) continue;
          try {
            const content = host.readFile(f);
            const hasLintIssues =
              /\bas\s+any\b/.test(content) ||
              /\/\/\s*@ts-ignore/.test(content) ||
              /console\.(log|warn|error)\(/.test(content);
            if (hasLintIssues) candidates.push(f);
          } catch { /* skip unreadable */ }
        }
        // Sort by file size (smaller = easier to lint-fix)
        candidates.sort((a, b) => {
          try { return host.readFile(a).length - host.readFile(b).length; }
          catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'docs') {
        // Find exported functions/classes missing JSDoc descriptions
        const result = await host.exec('npx', ['tsc', '--noEmit', '--listFiles'], {
          cwd: config.repoRoot, timeoutMs: 120_000,
        });
        const sourceFiles = (result.stdout + result.stderr).split('\n')
          .map(l => l.trim())
          .filter(f => /packages\/core\/src\//.test(f.replace(/\\/g, '/')))
          .filter(f => /\.ts$/.test(f) && !f.includes('.test.') && !f.includes('__tests__') && !f.includes('.d.ts'));

        for (const f of sourceFiles) {
          if (isQuarantined(f) || isCommitted(f)) continue;
          try {
            const content = host.readFile(f);
            // Check for undocumented exports (export without preceding JSDoc)
            if (/^export\s+(function|class|const|interface|type|enum)\s/m.test(content) &&
                !/\/\*\*[\s\S]*?\*\/\s*\nexport\s/m.test(content)) {
              candidates.push(f);
            }
          } catch { /* skip unreadable */ }
        }
        candidates.sort((a, b) => {
          try { return host.readFile(a).length - host.readFile(b).length; }
          catch { return 0; }
        });
        bb.typeErrorCount = 0;
      } else if (focus === 'target-sweep') {
        if (!daemonCompositionFile) {
          bb.sweep_results = [];
          bb.sweep_passed = false;
          bb.has_candidates = false;
          log('Target sweep skipped: daemon file not available on blackboard');
          return true;
        }

        const sweepResults = await runCompilerSweep(host, config.repoRoot, config.stateDir, daemonCompositionFile);
        bb.sweep_results = sweepResults;
        bb.sweep_passed = sweepResults.every(r => r.ok);
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'trait-sampling') {
        if (!daemonCompositionFile || !host.exists(daemonCompositionFile)) {
          bb.trait_sampling = {
            sampledFiles: 0,
            sampledTraits: 0,
            sampledCategories: 0,
            categories: [],
          };
          bb.trait_sampling_passed = false;
          bb.has_candidates = false;
          log('Trait sampling skipped: daemon file not available');
          return true;
        }

        const content = host.readFile(daemonCompositionFile);
        const sampling = collectTraitCoverage(content);
        bb.trait_sampling = sampling;
        bb.trait_sampling_passed = sampling.sampledCategories >= 3;
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'runtime-matrix') {
        if (!daemonCompositionFile) {
          bb.runtime_matrix = [];
          bb.runtime_matrix_passed = false;
          bb.has_candidates = false;
          log('Runtime profile matrix skipped: daemon file not available on blackboard');
          return true;
        }

        const matrix = await runRuntimeProfileMatrix(host, config.repoRoot, daemonCompositionFile);
        bb.runtime_matrix = matrix;
        bb.runtime_matrix_passed = matrix.every(r => r.ok);
        candidates = [daemonCompositionFile];
        bb.typeErrorCount = 0;
      } else if (focus === 'absorb-roundtrip') {
        const sourceFile = 'packages/core/src/cli/daemon-actions.ts';
        if (!host.exists(sourceFile)) {
          bb.absorb_roundtrip = undefined;
          bb.absorb_roundtrip_passed = false;
          bb.has_candidates = false;
          log('Absorb roundtrip skipped: source fixture not found');
          return true;
        }

        const roundtrip = await runAbsorbRoundtrip(host, config.repoRoot, config.stateDir, sourceFile);
        bb.absorb_roundtrip = roundtrip;
        bb.absorb_roundtrip_passed = roundtrip.absorbOk && roundtrip.compileOk;
        candidates = [sourceFile];
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
    generate_fix: async (_params, bb, ctx) => {
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
          ctx.emit('economy:spend', { action: 'generate_fix', focus, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
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

      if (focus === 'target-sweep') {
        const sweep = (bb.sweep_results as CompilerSweepResult[]) || [];
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        log(`Target sweep: ${sweep.filter(r => r.ok).length}/${sweep.length} targets passed`);
        return sweep.length > 0 && sweep.every(r => r.ok);
      }

      if (focus === 'trait-sampling') {
        const sampling = bb.trait_sampling as TraitCoverageResult | undefined;
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        if (!sampling) {
          log('Trait sampling: no data');
          return false;
        }
        log(`Trait sampling: ${sampling.sampledTraits} traits across ${sampling.sampledCategories} categories`);
        return sampling.sampledCategories >= 3;
      }

      if (focus === 'runtime-matrix') {
        const matrix = (bb.runtime_matrix as RuntimeProfileResult[]) || [];
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        log(`Runtime matrix: ${matrix.filter(r => r.ok).length}/${matrix.length} profiles passed`);
        return matrix.length > 0 && matrix.every(r => r.ok);
      }

      if (focus === 'absorb-roundtrip') {
        const roundtrip = bb.absorb_roundtrip as AbsorbRoundtripResult | undefined;
        bb.fileEdited = false;
        bb.generatedTestFile = undefined;
        if (!roundtrip) {
          log('Absorb roundtrip: no result');
          return false;
        }
        log(`Absorb roundtrip: absorb=${roundtrip.absorbOk ? 'ok' : 'fail'} compile=${roundtrip.compileOk ? 'ok' : 'fail'}`);
        return roundtrip.absorbOk && roundtrip.compileOk;
      }

      if (focus === 'lint') {
        // Lint focus uses think→patch architecture (same as typefix)
        const lintErrors: string[] = [];
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/\bas\s+any\b/.test(line)) lintErrors.push(`${file}(${i + 1}): lint: unsafe 'as any' cast`);
          if (/\/\/\s*@ts-ignore/.test(line)) lintErrors.push(`${file}(${i + 1}): lint: @ts-ignore suppression`);
          if (/console\.(log|warn|error)\(/.test(line) && !file.includes('cli/')) lintErrors.push(`${file}(${i + 1}): lint: console statement in library code`);
        }
        if (lintErrors.length === 0) {
          advanceCandidate(bb);
          return false;
        }
        const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);
        const compileErrors = bb.compileErrors as string[] | undefined;
        const lintPromptParts = [
          `File: ${file}`,
          '',
          'Lint issues to fix (replace unsafe casts with proper types, remove @ts-ignore, remove console statements from library code):',
          lintErrors.join('\n'),
        ];
        if (compileErrors && compileErrors.length > 0) {
          lintPromptParts.push(
            '',
            'IMPORTANT: A previous fix attempt caused these compile errors (do NOT introduce these again):',
            compileErrors.slice(0, 10).join('\n'),
            '',
            'Only fix lint issues where you can provide a type-safe replacement. Skip issues where removing `as any` would require changes to external type definitions.',
          );
        }
        lintPromptParts.push('', `Source (${lines.length} lines):`, content);
        const lintPrompt = lintPromptParts.join('\n');
        try {
          const result = await llm.chat({ system: systemPrompt, prompt: lintPrompt, maxTokens: 4096 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          ctx.emit('economy:spend', { action: 'generate_fix', focus: 'lint', inputTokens: result.inputTokens, outputTokens: result.outputTokens });
          const patchResponse = parsePatchResponse(result.text);
          if (!patchResponse || patchResponse.patches.length === 0) {
            advanceCandidate(bb);
            return false;
          }
          if (patchResponse.analysis) log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
          const { result: patched, applied } = applyPatches(content, patchResponse.patches);
          if (applied === 0) { advanceCandidate(bb); return false; }
          const safety = validatePatchSafety(content, patched);
          if (!safety.safe) { log(`SAFETY REJECT: ${safety.reason}`); advanceCandidate(bb); return false; }
          if (isContaminatedEdit(patched)) { advanceCandidate(bb); return false; }
          host.writeFile(file, patched);
          bb.fileEdited = true;
          log(`Applied ${applied} lint fixes to ${file.split(/[/\\]/).pop()}`);
          return true;
        } catch (err: unknown) { log(`LLM error: ${(err as Error).message}`); }
        advanceCandidate(bb);
        return false;
      }

      if (focus === 'docs') {
        // Docs focus: add plain JSDoc descriptions via think→patch
        // CRITICAL: Only add /** description */ comments — never @param/@returns
        // with type annotations, as those conflict with TypeScript signatures.
        const lines = content.split('\n');
        const undocumented: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/^export\s+(function|class|const|interface|type|enum)\s/.test(line)) {
            // Check if preceding line has JSDoc
            const prev = i > 0 ? lines[i - 1].trim() : '';
            if (!prev.endsWith('*/')) {
              undocumented.push(`${file}(${i + 1}): missing JSDoc for: ${line.trim().slice(0, 80)}`);
            }
          }
        }
        if (undocumented.length === 0) { advanceCandidate(bb); return false; }

        const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);
        const docsPrompt = [
          `File: ${file}`,
          '',
          'Add brief JSDoc comments (/** one-line description */) above these undocumented exports.',
          'RULES:',
          '- Only add /** description */ comments, nothing else',
          '- Do NOT add @param, @returns, @throws, or any other JSDoc tags',
          '- Do NOT change any code, types, or signatures',
          '- Keep descriptions concise (1 sentence max)',
          '',
          undocumented.join('\n'),
          '',
          `Source (${lines.length} lines):`,
          content,
        ].join('\n');

        try {
          const result = await llm.chat({ system: systemPrompt, prompt: docsPrompt, maxTokens: 4096 });
          bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
          bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
          ctx.emit('economy:spend', { action: 'generate_fix', focus: 'docs', inputTokens: result.inputTokens, outputTokens: result.outputTokens });
          const patchResponse = parsePatchResponse(result.text);
          if (!patchResponse || patchResponse.patches.length === 0) { advanceCandidate(bb); return false; }
          if (patchResponse.analysis) log(`Analysis: ${patchResponse.analysis.slice(0, 200)}`);
          const { result: patched, applied } = applyPatches(content, patchResponse.patches);
          if (applied === 0) { advanceCandidate(bb); return false; }
          const safety = validatePatchSafety(content, patched);
          if (!safety.safe) { log(`SAFETY REJECT: ${safety.reason}`); advanceCandidate(bb); return false; }
          if (isContaminatedEdit(patched)) { advanceCandidate(bb); return false; }
          host.writeFile(file, patched);
          bb.fileEdited = true;
          log(`Applied docs to ${file.split(/[/\\]/).pop()}`);
          return true;
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

      // Multi-file context: resolve base class and related files
      const relatedFiles = resolveRelatedFiles(content, file, host, errorContext);
      const depContext = extractDependencyContext(content, file, host);

      const systemPrompt = getDaemonSystemPrompt('typefix', promptContext);

      // Build prompt — include related file content for coordinated patches
      const promptParts = [
        `Primary file: ${file}`,
        '',
        'Type errors to fix:',
        errorContext || '(no specific errors — check file for type issues)',
        depContext,
        '',
        `Source (${content.split('\n').length} lines):`,
        content,
      ];

      // Add related files (base classes, type definitions)
      if (relatedFiles.length > 0) {
        promptParts.push('', '=== RELATED FILES (you may also patch these) ===');
        for (const rf of relatedFiles) {
          promptParts.push(
            '',
            `Related file (${rf.relation}): ${rf.path}`,
            `Source (${rf.content.split('\n').length} lines):`,
            rf.content,
          );
        }
        promptParts.push('', 'NOTE: To patch a related file, add "file": "<path>" to the patch object. Patches without a "file" field apply to the primary file.');
      }

      const prompt = promptParts.join('\n');

      try {
        const result = await llm.chat({ system: systemPrompt, prompt, maxTokens: relatedFiles.length > 0 ? 6144 : 4096 });
        bb.inputTokens = ((bb.inputTokens as number) || 0) + result.inputTokens;
        bb.outputTokens = ((bb.outputTokens as number) || 0) + result.outputTokens;
        ctx.emit('economy:spend', { action: 'generate_fix', focus, inputTokens: result.inputTokens, outputTokens: result.outputTokens });

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

        // Group patches by file (multi-file support)
        const primaryPatches = patchResponse.patches.filter(p => !p.file);
        const relatedPatchGroups = new Map<string, Patch[]>();
        for (const p of patchResponse.patches) {
          if (p.file) {
            const key = p.file.replace(/\\/g, '/');
            if (!relatedPatchGroups.has(key)) relatedPatchGroups.set(key, []);
            relatedPatchGroups.get(key)!.push(p);
          }
        }

        // Apply primary file patches
        let totalApplied = 0;
        const { result: patched, applied, failed } = applyPatches(content, primaryPatches.length > 0 ? primaryPatches : patchResponse.patches.filter(p => !p.file));
        totalApplied += applied;

        if (applied === 0 && relatedPatchGroups.size === 0) {
          log(`All ${failed.length} patches failed to match in ${baseName}`);
          for (const f of failed.slice(0, 3)) log(`  ${f}`);
          advanceCandidate(bb);
          return false;
        }
        if (failed.length > 0) {
          log(`${applied}/${primaryPatches.length || patchResponse.patches.length} patches applied (${failed.length} failed) in ${baseName}`);
        }

        // Safety validation — reject destructive edits
        const safety = validatePatchSafety(content, patched);
        if (!safety.safe) {
          log(`SAFETY REJECT: ${safety.reason} — skipping ${baseName}`);
          advanceCandidate(bb);
          return false;
        }

        if (isContaminatedEdit(patched)) {
          log(`Contaminated edit detected for ${baseName}, skipping`);
          advanceCandidate(bb);
          return false;
        }

        // Apply related file patches (multi-file)
        const relatedEdits: { path: string; original: string; patched: string }[] = [];
        for (const [relPath, relPatches] of relatedPatchGroups) {
          // Find the related file by matching path
          const rf = relatedFiles.find(r => r.path.replace(/\\/g, '/') === relPath);
          if (!rf) { log(`Related file ${relPath} not found, skipping its patches`); continue; }
          const { result: relPatched, applied: relApplied } = applyPatches(rf.content, relPatches);
          if (relApplied > 0) {
            const relSafety = validatePatchSafety(rf.content, relPatched);
            if (relSafety.safe && !isContaminatedEdit(relPatched)) {
              relatedEdits.push({ path: rf.path, original: rf.content, patched: relPatched });
              totalApplied += relApplied;
              log(`Applied ${relApplied} patches to related file ${rf.path.split(/[/\\]/).pop()}`);
            }
          }
        }

        // Write all files atomically
        if (applied > 0) host.writeFile(file, patched);
        for (const edit of relatedEdits) host.writeFile(edit.path, edit.patched);
        // Track related files for rollback
        bb.relatedEdits = relatedEdits.map(e => ({ path: e.path, original: e.original }));

        bb.fileEdited = true;
        log(`Applied ${totalApplied} patches to ${baseName}${relatedEdits.length > 0 ? ` + ${relatedEdits.length} related file(s)` : ''}`);
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
      const qualityBefore = config.qualityBefore ?? (bb.quality_before as number) ?? 0;

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
      if (!bb.fileEdited) {
        log('No edits produced — skipping commit');
        bb.committed = false;
        advanceCandidate(bb);
        return true;
      }

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
      const msg = `${commitType}(${focus}): auto-fix ${baseName} [daemon]`;
      const result = await host.exec('git', [
        'commit', '--no-verify', '-m', `"${msg}"`,
      ], { cwd: config.repoRoot });
      bb.committed = result.code === 0;
      if (!bb.committed) {
        log(`Commit: FAILED (code=${result.code}, stderr=${(result.stderr || '').trim()})`);
      } else {
        committedFiles.add(file.replace(/\\/g, '/'));
        log(`Commit: OK`);
      }

      advanceCandidate(bb);
      return bb.committed as boolean;
    },

    // ── Rollback Changes ───────────────────────────────────────────────
    rollback_changes: async (_params, bb) => {
      if (!bb.fileEdited) {
        log('No edits produced — skipping rollback');
        return true;
      }

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

        // Rollback related files from multi-file patches
        const relatedEdits = bb.relatedEdits as { path: string; original: string }[] | undefined;
        if (relatedEdits && relatedEdits.length > 0) {
          for (const edit of relatedEdits) {
            host.writeFile(edit.path, edit.original);
            log(`Rolled back related file ${edit.path.split(/[/\\]/).pop()}`);
          }
          bb.relatedEdits = undefined;
        }

        const nowQuarantined = quarantineFile(file);
        if (nowQuarantined) {
          log(`Quarantined ${file} (${quarantineThreshold} failures)`);
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
      ctx.emit('feedback:update_metric', { name: 'positive_energy', value: 1.0 });
      return true;
    },

    integrate_shadow: async (_params, _bb, ctx) => {
      ctx.emit('motivation:cycle_complete', { energy_level: 0.9 });
      ctx.emit('feedback:update_metric', { name: 'positive_energy', value: 0.6 });
      return true;
    },

    // ── Scheduler Job Handlers ──────────────────────────────────────────
    // These fire when @scheduler unpauses and triggers periodic jobs.
    // The scheduler emits the job's `action` event; these handlers
    // are registered via runtime.registerAction() to respond.

    'daemon:quality_heartbeat': async (_params, _bb, ctx) => {
      const tsc = await host.exec('npx', tscCheckArgs(config.stateDir),
        { cwd: config.repoRoot, timeoutMs: 120_000 });
      const errors = (tsc.stdout + tsc.stderr).split('\n')
        .filter(l => /error TS\d{4}:/.test(l)).length;
      ctx.emit('daemon:raw_quality', { value: errors === 0 ? 1 : Math.max(0, 1 - errors / 3500), source: 'heartbeat' });
      log(`Quality heartbeat: ${errors} type errors`);
      return true;
    },

    'daemon:test_watchdog': async (_params, _bb, ctx) => {
      const test = await host.exec('npx',
        ['vitest', 'run', '--reporter=json', '--no-color', '--passWithNoTests'],
        { cwd: config.repoRoot, timeoutMs: 120_000 });
      let passed = 0, total = 0;
      try {
        const json = JSON.parse(test.stdout);
        total = json.numTotalTests || 0;
        passed = json.numPassedTests || 0;
      } catch { /* parse failure */ }
      ctx.emit('daemon:test_watchdog_result', { passed, total, exitCode: test.code });
      log(`Test watchdog: ${passed}/${total} passed`);
      return true;
    },

    'daemon:evaluate_consciousness': async (_params, bb, ctx) => {
      const cycleCount = (bb.cycleNumber as number) || 0;
      const quality = (bb.quality_after as number) || 0;
      ctx.emit('daemon:consciousness_eval_result', {
        cycles: cycleCount,
        quality,
        wisdom_count: Array.isArray(bb.wisdom) ? (bb.wisdom as unknown[]).length : 0,
        timestamp: Date.now(),
      });
      log(`Consciousness eval: cycle=${cycleCount}, quality=${quality.toFixed(3)}`);
      return true;
    },
  };
}
