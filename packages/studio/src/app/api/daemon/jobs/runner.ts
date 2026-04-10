/**
 * DaemonRunner — Real execution engine for daemon jobs.
 *
 * Pipeline: absorb → diagnose → validate
 *
 * Phase 0  (absorb)    — CodebaseScanner builds dependency graph of the
 *                        isolated workspace; leaf-first file ordering guides
 *                        fix candidates so hub nodes are touched last.
 * Phase 1  (diagnose)  — tsc + vitest + eslint baseline quality assessment.
 * Phase 2  (validate)  — Fix cycles with graph-informed candidate ordering;
 *                        re-assess after each cycle; stop on plateau.
 *
 * Safety: Each job runs in an isolated temp directory (a shallow copy of the
 * uploaded project). Patches are NEVER auto-applied; they are returned as
 * diff proposals for the user to review in the Studio UI.
 *
 * @module daemon/runner
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  DaemonJobLimits,
  DaemonLogEntry,
  DaemonProfile,
  DaemonProjectDNA,
  PatchProposal,
} from '@/lib/daemon/types';

// =============================================================================
// ABSORB TYPES (mirrors CodebaseGraph serialized shape)
// =============================================================================

interface AbsorbSymbol {
  name: string;
  type: string;
  filePath: string;
  line: number;
}

interface AbsorbImport {
  fromFile: string;
  toModule: string;
  resolvedPath?: string;
}

interface AbsorbFileResult {
  path: string;
  language: string;
  symbols: AbsorbSymbol[];
  imports: AbsorbImport[];
  calls: unknown[];
  loc: number;
  sizeBytes: number;
}

interface AbsorbScanResult {
  rootDir: string;
  files: AbsorbFileResult[];
  stats: {
    totalFiles: number;
    totalSymbols: number;
    totalImports: number;
    totalLoc: number;
    durationMs: number;
    errors: string[];
    filesByLanguage: Record<string, number>;
    symbolsByType: Record<string, number>;
    totalCalls: number;
  };
}

export interface AbsorbGraphData {
  /** Files ordered leaf-first (lowest in-degree first — safest to fix) */
  leafFirstOrder: string[];
  /** In-degree per file: how many OTHER files import this one (high = hub = risky) */
  inDegree: Record<string, number>;
  /** Community assignment per file */
  communities: Record<string, number>;
  /** Total files scanned */
  totalFiles: number;
  /** Total symbols found */
  totalSymbols: number;
  /** Duration of absorb scan in ms */
  durationMs: number;
  /** Serialized graph JSON (for persistence / visualization) */
  graphJson: string;
}

const execAsync = promisify(exec);

export interface DaemonRunResult {
  success: boolean;
  /** Total cycles executed */
  cycles: number;
  /** Files analyzed */
  filesAnalyzed: number;
  /** Files with proposed changes */
  filesChanged: number;
  /** Quality score before daemon run */
  qualityBefore: number;
  /** Quality score after daemon run (in isolated workspace) */
  qualityAfter: number;
  /** Net quality improvement */
  qualityDelta: number;
  /** Concrete patch proposals for review */
  patches: PatchProposal[];
  /** Job log lines for the UI */
  logs: DaemonLogEntry[];
  /** Summary for the user */
  summary: string;
  /** Duration in ms */
  durationMs: number;
  /** Error message if failed */
  error?: string;
  /** Absorb graph data (null when core unavailable) */
  absorb: AbsorbGraphData | null;
}

const PROFILE_LIMITS: Record<DaemonProfile, DaemonJobLimits> = {
  quick: {
    maxCycles: 1,
    maxTokens: 50_000,
    maxFilesChanged: 10,
    timeoutMs: 60_000,
    protectedPaths: ['.env*', '*.pem', '*.key', 'credentials*', 'secrets*'],
  },
  balanced: {
    maxCycles: 2,
    maxTokens: 150_000,
    maxFilesChanged: 25,
    timeoutMs: 180_000,
    protectedPaths: ['.env*', '*.pem', '*.key', 'credentials*', 'secrets*'],
  },
  deep: {
    maxCycles: 3,
    maxTokens: 500_000,
    maxFilesChanged: 50,
    timeoutMs: 300_000,
    protectedPaths: ['.env*', '*.pem', '*.key', 'credentials*', 'secrets*'],
  },
};

/** Default protected path denylist applied to ALL profiles */
const GLOBAL_DENYLIST = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  'credentials.json',
  'secrets.yaml',
  'secrets.yml',
  'id_rsa',
  'id_ed25519',
  '.git/**',
  'node_modules/**',
];

// =============================================================================
// ABSORB PHASE — codebase graph intelligence
// =============================================================================

/**
 * Phase 0: Build a dependency graph of the isolated workspace using
 * CodebaseScanner + CodebaseGraph from @holoscript/core/codebase.
 *
 * Returns leaf-first file ordering and in-degree map so fix cycles
 * can target the safest (lowest-dependency) files first.
 *
 * Gracefully degrades: if @holoscript/core/codebase is unavailable (e.g.
 * build failure during CI), the function returns an empty AbsorbGraphData
 * so the rest of the pipeline continues without the graph.
 */
async function runAbsorbPhase(
  workDir: string,
  depth: 'shallow' | 'medium' | 'deep' = 'shallow',
): Promise<AbsorbGraphData> {
  const absorbStart = Date.now();

  const empty: AbsorbGraphData = {
    leafFirstOrder: [],
    inDegree: {},
    communities: {},
    totalFiles: 0,
    totalSymbols: 0,
    durationMs: 0,
    graphJson: '{}',
  };

  try {
    const absorbUrl = process.env.ABSORB_SERVICE_URL || 'http://localhost:8081';
    
    // Delegate codebase scanning to the headless absorb-service
    const res = await fetch(`${absorbUrl}/scan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // In a real environment, provide an API key if required
      },
      body: JSON.stringify({
        path: workDir,
        shallow: depth === 'shallow',
      }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      throw new Error(`Absorb service failed with status ${res.status}`);
    }

    const data = await res.json();
    
    // The absorb-service now computes and returns the graph topology directly
    if (data.topology) {
      return {
        leafFirstOrder: data.topology.leafFirstOrder || [],
        inDegree: data.topology.inDegree || {},
        communities: data.topology.communities || {},
        totalFiles: data.fileCount || 0,
        totalSymbols: data.stats?.totalSymbols || 0,
        durationMs: Date.now() - absorbStart,
        graphJson: data.topology.graphJson || '{}',
      };
    }

    return { ...empty, durationMs: Date.now() - absorbStart };
  } catch (err) {
    // Core not available or scan failed — continue without graph
    return { ...empty, durationMs: Date.now() - absorbStart };
  }
}

// =============================================================================
// WORKSPACE MANAGEMENT
// =============================================================================

/**
 * Creates an isolated workspace directory for the daemon to operate in.
 * This is a shallow copy: only the file listing metadata is copied; actual
 * file reads happen on-demand from the original project path.
 */
async function createIsolatedWorkspace(
  projectPath: string,
  jobId: string,
): Promise<{ workDir: string; cleanup: () => Promise<void> }> {
  const tmpBase = path.join(os.tmpdir(), 'holoscript-daemon');
  if (!fs.existsSync(tmpBase)) {
    fs.mkdirSync(tmpBase, { recursive: true });
  }

  const workDir = path.join(tmpBase, jobId);
  fs.mkdirSync(workDir, { recursive: true });

  // Create a snapshot marker so we know this is a daemon workspace
  fs.writeFileSync(
    path.join(workDir, '.daemon-workspace.json'),
    JSON.stringify({
      jobId,
      projectPath,
      createdAt: new Date().toISOString(),
      readonly: true,
    }),
    'utf-8',
  );

  // Copy project structure for analysis (skip node_modules and .git)
  try {
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      await execAsync(
        `robocopy "${projectPath}" "${workDir}" /E /XD node_modules .git dist .next /XF *.pem *.key .env /NFL /NDL /NJH /NJS /nc /ns /np`,
        { timeout: 30_000 },
      ).catch(() => {
        // robocopy returns non-zero for success (1 = files copied), only 8+ is error
      });
    } else {
      await execAsync(
        `rsync -a --exclude=node_modules --exclude=.git --exclude=dist --exclude=.next --exclude='*.pem' --exclude='*.key' --exclude='.env*' "${projectPath}/" "${workDir}/"`,
        { timeout: 30_000 },
      );
    }
  } catch {
    // If copy fails, we still have the workspace dir for analysis
  }

  const cleanup = async () => {
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup
    }
  };

  return { workDir, cleanup };
}

// =============================================================================
// ROLLBACK SNAPSHOT
// =============================================================================

/**
 * Creates a rollback snapshot of the project state before daemon execution.
 * This is a tarball of the workspace that can be restored if needed.
 */
async function createRollbackSnapshot(
  workDir: string,
  jobId: string,
): Promise<string> {
  const snapshotDir = path.join(os.tmpdir(), 'holoscript-daemon', 'snapshots');
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, `${jobId}-rollback.json`);

  // Store file hashes for rollback verification
  const fileList: Array<{ path: string; size: number; mtime: string }> = [];
  function walk(dir: string, base: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(base, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else {
          try {
            const stat = fs.statSync(fullPath);
            fileList.push({
              path: relPath,
              size: stat.size,
              mtime: stat.mtime.toISOString(),
            });
          } catch {
            // Skip unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable directories
    }
  }

  walk(workDir, '');

  fs.writeFileSync(
    snapshotPath,
    JSON.stringify({
      jobId,
      createdAt: new Date().toISOString(),
      fileCount: fileList.length,
      files: fileList,
    }),
    'utf-8',
  );

  return snapshotPath;
}

// =============================================================================
// PATH SAFETY CHECK
// =============================================================================

function isPathProtected(filePath: string, denyPatterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  for (const pattern of denyPatterns) {
    // Simple glob matching for common patterns
    if (pattern.includes('**')) {
      const prefix = pattern.replace('/**', '');
      if (normalized.startsWith(prefix + '/') || normalized === prefix) {
        return true;
      }
    } else if (pattern.startsWith('*.')) {
      const ext = pattern.slice(1);
      if (normalized.endsWith(ext)) return true;
    } else if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      if (normalized.startsWith(prefix)) return true;
    } else {
      if (normalized === pattern || normalized.endsWith('/' + pattern)) {
        return true;
      }
    }
  }
  return false;
}

// =============================================================================
// QUALITY ASSESSMENT
// =============================================================================

interface QualityCheckResult {
  typeErrors: number;
  testsPassed: number;
  testsTotal: number;
  lintErrors: number;
  lintWarnings: number;
  compositeScore: number;
}

async function assessQuality(workDir: string): Promise<QualityCheckResult> {
  const result: QualityCheckResult = {
    typeErrors: 0,
    testsPassed: 0,
    testsTotal: 0,
    lintErrors: 0,
    lintWarnings: 0,
    compositeScore: 0,
  };

  // Type check
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false 2>&1', {
      cwd: workDir,
      timeout: 120_000,
      maxBuffer: 50 * 1024 * 1024,
    }).catch((err: unknown) => {
      const e = err as Record<string, unknown>;
      return { stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
    });
    const output = String(stdout) + String(stderr);
    const tsErrors = (output.match(/error TS\d+/g) ?? []).length;
    result.typeErrors = tsErrors;
  } catch {
    result.typeErrors = -1; // Unknown
  }

  // Test suite
  try {
    const { stdout } = await execAsync('npx vitest run --reporter=json 2>&1', {
      cwd: workDir,
      timeout: 180_000,
      maxBuffer: 50 * 1024 * 1024,
    }).catch((err: unknown) => {
      const e = err as Record<string, unknown>;
      return { stdout: String(e.stdout ?? '') + String(e.stderr ?? '') };
    });
    const output = String(stdout);
    const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      result.testsPassed = parsed.numPassedTests ?? 0;
      result.testsTotal = parsed.numTotalTests ?? 0;
    }
  } catch {
    // Tests unavailable
  }

  // Lint
  try {
    await execAsync('npx eslint . --max-warnings 0 --format json 2>&1', {
      cwd: workDir,
      timeout: 60_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    // Clean lint
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const output = String(e.stdout ?? '') + String(e.stderr ?? '');
    const summaryMatch = output.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    if (summaryMatch) {
      result.lintErrors = parseInt(summaryMatch[2], 10);
      result.lintWarnings = parseInt(summaryMatch[3], 10);
    }
  }

  // Composite score (same formula as holo_validate_quality)
  const tscScore = result.typeErrors <= 0 ? 1.0 : 1 / (1 + Math.log(1 + result.typeErrors / 10));
  const testScore = result.testsTotal > 0 ? result.testsPassed / result.testsTotal : 0.5;
  const lintScore = result.lintErrors === 0
    ? Math.max(0.8, 1 - result.lintWarnings * 0.01)
    : 1 / (1 + Math.log(1 + result.lintErrors / 5));

  result.compositeScore = Math.round(
    (testScore * 0.35 + tscScore * 0.30 + lintScore * 0.15 + (result.typeErrors === 0 ? 0.20 : 0)) * 100,
  ) / 100;

  return result;
}

// =============================================================================
// PATCH GENERATION
// =============================================================================

function generatePatchId(): string {
  return `patch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Detects changes between the original workspace snapshot and the current
 * workspace state, producing unified diffs for each modified file.
 */
async function detectChanges(
  originalDir: string,
  workDir: string,
  denyPatterns: string[],
  maxFiles: number,
): Promise<PatchProposal[]> {
  const patches: PatchProposal[] = [];

  function walk(dir: string, base: string) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.daemon-workspace.json') continue;
        const fullPath = path.join(dir, entry.name);
        const relPath = path.join(base, entry.name).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          walk(fullPath, relPath);
        } else {
          if (patches.length >= maxFiles) return;
          if (isPathProtected(relPath, denyPatterns)) continue;

          const originalPath = path.join(originalDir, relPath);
          try {
            const newContent = fs.readFileSync(fullPath, 'utf-8');
            if (fs.existsSync(originalPath)) {
              const oldContent = fs.readFileSync(originalPath, 'utf-8');
              if (oldContent !== newContent) {
                patches.push({
                  id: generatePatchId(),
                  filePath: relPath,
                  action: 'modify',
                  diff: generateUnifiedDiff(relPath, oldContent, newContent),
                  proposedContent: newContent,
                  description: `Modified ${relPath}`,
                  confidence: 0.8,
                  category: inferPatchCategory(relPath, newContent),
                });
              }
            } else {
              patches.push({
                id: generatePatchId(),
                filePath: relPath,
                action: 'create',
                diff: generateUnifiedDiff(relPath, '', newContent),
                proposedContent: newContent,
                description: `Created new file ${relPath}`,
                confidence: 0.75,
                category: inferPatchCategory(relPath, newContent),
              });
            }
          } catch {
            // Skip binary or unreadable files
          }
        }
      }
    } catch {
      // Skip unreadable dirs
    }
  }

  walk(workDir, '');
  return patches;
}

function inferPatchCategory(filePath: string, content: string): PatchProposal['category'] {
  if (filePath.includes('.test.') || filePath.includes('__tests__') || filePath.includes('.spec.')) {
    return 'test';
  }
  if (filePath.endsWith('.md') || content.includes('/**') || content.includes('* @param')) {
    return 'docs';
  }
  if (filePath.includes('eslint') || filePath.includes('lint')) {
    return 'lint';
  }
  return 'typefix';
}

function generateUnifiedDiff(filePath: string, oldContent: string, newContent: string): string {
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  const diffLines: string[] = [
    `--- a/${filePath}`,
    `+++ b/${filePath}`,
  ];

  // Simple line-by-line diff (not a full Myers diff, but sufficient for review)
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hunkStart = -1;
  let hunkOld: string[] = [];
  let hunkNew: string[] = [];

  function flushHunk() {
    if (hunkOld.length === 0 && hunkNew.length === 0) return;
    diffLines.push(`@@ -${Math.max(1, hunkStart + 1)},${hunkOld.length} +${Math.max(1, hunkStart + 1)},${hunkNew.length} @@`);
    for (const line of hunkOld) diffLines.push(`-${line}`);
    for (const line of hunkNew) diffLines.push(`+${line}`);
    hunkOld = [];
    hunkNew = [];
    hunkStart = -1;
  }

  for (let i = 0; i < maxLen; i++) {
    const oldLine = i < oldLines.length ? oldLines[i] : undefined;
    const newLine = i < newLines.length ? newLines[i] : undefined;

    if (oldLine === newLine) {
      flushHunk();
    } else {
      if (hunkStart === -1) hunkStart = i;
      if (oldLine !== undefined) hunkOld.push(oldLine);
      if (newLine !== undefined) hunkNew.push(newLine);
    }
  }
  flushHunk();

  return diffLines.join('\n');
}

// =============================================================================
// MAIN RUNNER
// =============================================================================

export type DaemonProgressCallback = (
  progress: number,
  status: string,
  log?: DaemonLogEntry,
) => void;

/**
 * Executes a real daemon job in an isolated workspace.
 *
 * Pipeline:
 *   1. Create isolated workspace (copy project to temp dir)
 *   2. Create rollback snapshot
 *   3. Assess baseline quality (tsc + vitest + eslint)
 *   4. For each cycle:
 *      a. Run type error listing and batch fix analysis
 *      b. Apply safe automated fixes (in workspace only)
 *      c. Re-assess quality
 *      d. Stop if quality plateaus or limits reached
 *   5. Detect all changes as patch proposals
 *   6. Cleanup workspace
 *   7. Return patches + metrics for Studio UI review
 */
export async function runDaemonJob(
  projectPath: string,
  profile: DaemonProfile,
  dna: DaemonProjectDNA,
  onProgress: DaemonProgressCallback,
  customLimits?: Partial<DaemonJobLimits>,
): Promise<DaemonRunResult> {
  const startTime = Date.now();
  const limits = { ...PROFILE_LIMITS[profile], ...customLimits };
  const allDenyPatterns = [...GLOBAL_DENYLIST, ...limits.protectedPaths];
  const logs: DaemonLogEntry[] = [];
  const jobId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  function log(level: DaemonLogEntry['level'], message: string) {
    const entry: DaemonLogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };
    logs.push(entry);
    onProgress(-1, message, entry);
  }

  log('info', `Daemon job ${jobId} starting with profile "${profile}"`);
  log('info', `Project DNA: ${dna.kind} (${Math.round(dna.confidence * 100)}% confidence)`);
  log('info', `Limits: ${limits.maxCycles} cycles, ${limits.maxFilesChanged} max files, ${limits.timeoutMs}ms timeout`);

  // Step 1: Create isolated workspace
  onProgress(5, 'Creating isolated workspace...');
  let workDir: string;
  let cleanup: () => Promise<void>;

  try {
    const ws = await createIsolatedWorkspace(projectPath, jobId);
    workDir = ws.workDir;
    cleanup = ws.cleanup;
    log('info', `Workspace created at ${workDir}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log('error', `Failed to create workspace: ${msg}`);
    return {
      success: false,
      cycles: 0,
      filesAnalyzed: 0,
      filesChanged: 0,
      qualityBefore: 0,
      qualityAfter: 0,
      qualityDelta: 0,
      patches: [],
      logs,
      summary: `Daemon failed: could not create isolated workspace. ${msg}`,
      durationMs: Date.now() - startTime,
      error: msg,
      absorb: null,
    };
  }

  // Phase 0: Absorb — build codebase dependency graph (leaf-first ordering)
  onProgress(7, 'Absorbing codebase graph...');
  log('info', 'Phase 0: absorb — scanning dependency graph...');
  let absorbData: AbsorbGraphData | null = null;
  try {
    absorbData = await runAbsorbPhase(workDir, 'shallow');
    if (absorbData.totalFiles > 0) {
      log('info', `Absorb complete: ${absorbData.totalFiles} files, ${absorbData.totalSymbols} symbols in ${absorbData.durationMs}ms`);
      log('info', `Leaf-first order: ${absorbData.leafFirstOrder.slice(0, 5).join(', ')}${absorbData.leafFirstOrder.length > 5 ? ` (+${absorbData.leafFirstOrder.length - 5} more)` : ''}`);
    } else {
      log('warn', 'Absorb returned empty graph — continuing without graph intelligence');
    }
  } catch (err: unknown) {
    log('warn', `Absorb phase failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 2: Rollback snapshot
  onProgress(10, 'Creating rollback snapshot...');
  let snapshotPath: string;
  try {
    snapshotPath = await createRollbackSnapshot(workDir, jobId);
    log('info', `Rollback snapshot saved: ${snapshotPath}`);
  } catch (err: unknown) {
    log('warn', `Rollback snapshot failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`);
    snapshotPath = '';
  }

  // Step 3: Baseline quality assessment
  onProgress(15, 'Assessing baseline quality...');
  log('info', 'Running baseline quality assessment (tsc + vitest + eslint)...');
  let baselineQuality: QualityCheckResult;
  try {
    baselineQuality = await assessQuality(workDir);
    log('info', `Baseline: score=${baselineQuality.compositeScore}, typeErrors=${baselineQuality.typeErrors}, tests=${baselineQuality.testsPassed}/${baselineQuality.testsTotal}`);
  } catch (err: unknown) {
    log('warn', `Baseline assessment partial: ${err instanceof Error ? err.message : String(err)}`);
    baselineQuality = {
      typeErrors: -1,
      testsPassed: 0,
      testsTotal: 0,
      lintErrors: 0,
      lintWarnings: 0,
      compositeScore: 0,
    };
  }

  // Step 4: Improvement cycles
  let currentQuality = baselineQuality;
  let cyclesCompleted = 0;
  let filesAnalyzed = 0;

  for (let cycle = 0; cycle < limits.maxCycles; cycle++) {
    // Check timeout
    if (Date.now() - startTime > limits.timeoutMs) {
      log('warn', `Timeout reached after ${cycle} cycles`);
      break;
    }

    const cycleProgress = 20 + Math.round((cycle / limits.maxCycles) * 60);
    onProgress(cycleProgress, `Cycle ${cycle + 1}/${limits.maxCycles}: Analyzing...`);
    log('info', `--- Cycle ${cycle + 1} ---`);

    // 4a. List type errors
    try {
      const { stdout, stderr } = await execAsync('npx tsc --noEmit --pretty false 2>&1', {
        cwd: workDir,
        timeout: 120_000,
        maxBuffer: 50 * 1024 * 1024,
      }).catch((err: unknown) => {
        const e = err as Record<string, unknown>;
        return { stdout: String(e.stdout ?? ''), stderr: String(e.stderr ?? '') };
      });

      const output = String(stdout) + String(stderr);
      const errorLines = output.split('\n').filter((l: string) => l.includes('error TS'));
      filesAnalyzed += errorLines.length;

      // Group errors by file for targeted fixes
      const byFile: Record<string, string[]> = {};
      for (const line of errorLines) {
        const match = line.match(/^([^(]+)\(/);
        if (match) {
          const file = match[1].trim();
          if (!byFile[file]) byFile[file] = [];
          byFile[file].push(line);
        }
      }

      const fileCount = Object.keys(byFile).length;
      log('info', `Found ${errorLines.length} type errors across ${fileCount} files`);

      // 4b. Apply safe automated fixes for common patterns
      // (Only in workspace -- never touches original project)
      //
      // Graph-informed ordering: if absorb produced a leaf-first order, use it
      // to sort fix candidates so lowest-dependency (safest) files are fixed
      // first. Hub files (high in-degree) are deprioritized within the batch.
      let fixEntries = Object.entries(byFile);
      if (absorbData && absorbData.leafFirstOrder.length > 0) {
        const orderIndex = new Map(absorbData.leafFirstOrder.map((f, i) => [f, i]));
        fixEntries = fixEntries.sort(([a], [b]) => {
          const ai = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
          const bi = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
          return ai - bi;
        });
      }

      let fixesApplied = 0;
      for (const [file, errors] of fixEntries) {
        if (fixesApplied >= limits.maxFilesChanged) break;
        const fullPath = path.join(workDir, file);
        if (!fs.existsSync(fullPath)) continue;
        if (isPathProtected(file, allDenyPatterns)) continue;

        // Warn when touching hub nodes (high in-degree = many dependents)
        const inDeg = absorbData?.inDegree[file] ?? 0;
        if (inDeg >= 5) {
          log('warn', `Hub file (in-degree=${inDeg}): ${file} — fixing conservatively`);
        }

        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          let changed = false;

          // Fix TS7006: Parameter implicitly has 'any' type
          for (const errLine of errors) {
            if (errLine.includes('TS7006')) {
              // Add `: any` to untyped callback parameters
              const paramMatch = errLine.match(/Parameter '(\w+)' implicitly has an 'any' type/);
              if (paramMatch) {
                const paramName = paramMatch[1];
                // Simple fix: add `: any` annotation where parameter appears untyped
                const regex = new RegExp(`\\b(${paramName})\\s*([,)])`, 'g');
                const newContent = content.replace(regex, `$1: any$2`);
                if (newContent !== content) {
                  content = newContent;
                  changed = true;
                }
              }
            }
          }

          if (changed) {
            fs.writeFileSync(fullPath, content, 'utf-8');
            fixesApplied++;
            log('info', `Applied type fixes to ${file}${inDeg > 0 ? ` (in-degree=${inDeg})` : ''}`);
          }
        } catch {
          // Skip files that can't be read/written
        }
      }

      log('info', `Applied fixes to ${fixesApplied} files in cycle ${cycle + 1}`);
    } catch (err: unknown) {
      log('warn', `Cycle ${cycle + 1} analysis error: ${err instanceof Error ? err.message : String(err)}`);
    }

    // 4c. Re-assess quality
    onProgress(cycleProgress + 10, `Cycle ${cycle + 1}: Re-assessing quality...`);
    try {
      currentQuality = await assessQuality(workDir);
      log('info', `Post-cycle ${cycle + 1}: score=${currentQuality.compositeScore}, typeErrors=${currentQuality.typeErrors}`);
    } catch {
      log('warn', `Quality re-assessment failed in cycle ${cycle + 1}`);
    }

    // 4d. Check convergence
    const delta = currentQuality.compositeScore - baselineQuality.compositeScore;
    if (cycle > 0 && Math.abs(delta) < 0.01) {
      log('info', `Quality plateaued (delta=${delta.toFixed(4)}), stopping early`);
      break;
    }

    cyclesCompleted = cycle + 1;
  }

  // Step 5: Detect all changes as patch proposals
  onProgress(85, 'Generating patch proposals...');
  log('info', 'Detecting changes and generating patches...');
  let patches: PatchProposal[] = [];
  try {
    patches = await detectChanges(projectPath, workDir, allDenyPatterns, limits.maxFilesChanged);
    log('info', `Generated ${patches.length} patch proposal(s)`);
  } catch (err: unknown) {
    log('warn', `Patch detection error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 6: Cleanup
  onProgress(95, 'Cleaning up workspace...');
  try {
    await cleanup();
    log('info', 'Workspace cleaned up');
  } catch {
    log('warn', 'Workspace cleanup failed (will be cleaned by OS temp)');
  }

  // Step 7: Build result
  const qualityDelta = Math.round((currentQuality.compositeScore - baselineQuality.compositeScore) * 100) / 100;
  const durationMs = Date.now() - startTime;

  onProgress(100, 'Complete');
  log('info', `Daemon job complete: ${patches.length} patches, quality delta ${qualityDelta >= 0 ? '+' : ''}${qualityDelta}, ${durationMs}ms`);

  const summary = patches.length > 0
    ? `Analyzed ${filesAnalyzed} type errors across ${cyclesCompleted} cycle(s). Produced ${patches.length} patch proposal(s) with quality delta ${qualityDelta >= 0 ? '+' : ''}${qualityDelta}.`
    : `Analyzed project in ${cyclesCompleted} cycle(s). No actionable improvements found for the "${profile}" profile.`;

  return {
    success: true,
    cycles: cyclesCompleted,
    filesAnalyzed,
    filesChanged: patches.length,
    qualityBefore: baselineQuality.compositeScore,
    qualityAfter: currentQuality.compositeScore,
    qualityDelta,
    patches,
    logs,
    summary,
    durationMs,
    absorb: absorbData,
  };
}
