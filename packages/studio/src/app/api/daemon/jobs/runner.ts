/**
 * DaemonRunner — Real execution engine for daemon jobs.
 *
 * Pipeline: absorb → diagnose → validate
 *
 * Phase 0  (absorb)    — CodebaseScanner (in-process, from
 *                        @holoscript/absorb-service/engine) builds the
 *                        dependency graph of the isolated workspace; leaf-first
 *                        file ordering guides fix candidates so hub nodes are
 *                        touched last.
 * Phase 1  (diagnose)  — tsc + vitest + eslint baseline quality assessment.
 * Phase 2  (validate)  — Fix cycles with graph-informed candidate ordering;
 *                        re-assess after each cycle; stop on plateau.
 *
 * Phases 1-2 run the repository's own tools, i.e. the user's code (vitest and
 * eslint load repo config and test files). They are OFF unless the operator
 * sets HOLOHEAL_RUN_REPO_TOOLS to exactly "true" or "1"; by default a job ends
 * after Absorb + patch proposal and says "Absorb done, checks skipped (sandbox
 * not enabled)". When on, tools run with `npx --no-install` and a scrubbed
 * environment (no Studio secrets). A real sandbox (separate container) is the
 * follow-up.
 *
 * Confinement: projectPath must resolve (realpath) strictly inside the Studio
 * workspaces root; there is no process.cwd() fallback. Symlinks are never
 * copied or followed. Copy and scan are capped in files, bytes and time.
 *
 * Safety: Each job runs in an isolated temp directory (a copy of the
 * uploaded project). Patches are NEVER auto-applied; they are returned as
 * diff proposals for the user to review in the Studio UI.
 *
 * Failure policy: nothing in this file swallows an error. A step that decides
 * the result (copy, absorb) fails the job with the real error text; a step
 * that is advisory (rollback snapshot, cleanup, one file's fix) logs a warn
 * line carrying the real error text and the job continues.
 *
 * @module daemon/runner
 */

import { execFile } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import picomatch from 'picomatch';
import type {
  DaemonJobLimits,
  DaemonLogEntry,
  DaemonProfile,
  DaemonProjectDNA,
  PatchProposal,
} from '@/lib/daemon/types';
import { absorbEmptyLabel, CHECKS_SKIPPED_LABEL } from '@/lib/daemon/honestyLabels';
import { checkProjectPath } from '@/lib/daemon/projectPathPolicy';
import { confinedReader, readConfinedRegularFile } from '@/lib/daemon/confinedRead';

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

interface _AbsorbScanResult {
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
  /**
   * Files the scanner was handed: every non-ignored file in the workspace copy.
   * Set even when the graph comes back empty, so "empty graph" can say how many
   * files it looked at instead of reading like an empty repo.
   */
  filesScanned: number;
}

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
  /** True when the repo-tool phases were skipped because HOLOHEAL_RUN_REPO_TOOLS is off. */
  checksSkipped?: boolean;
}

const PROFILE_LIMITS: Record<DaemonProfile, DaemonJobLimits> = {
  quick: {
    maxCycles: 1,
    maxTokens: 50_000,
    maxFilesChanged: 10,
    timeoutMs: 60_000,
    protectedPaths: ['**/.env*', '**/*.pem', '**/*.key', '**/credentials*', '**/secrets*'],
  },
  balanced: {
    maxCycles: 2,
    maxTokens: 150_000,
    maxFilesChanged: 25,
    timeoutMs: 180_000,
    protectedPaths: ['**/.env*', '**/*.pem', '**/*.key', '**/credentials*', '**/secrets*'],
  },
  deep: {
    maxCycles: 3,
    maxTokens: 500_000,
    maxFilesChanged: 50,
    timeoutMs: 300_000,
    protectedPaths: ['**/.env*', '**/*.pem', '**/*.key', '**/credentials*', '**/secrets*'],
  },
};

/**
 * Default protected path denylist applied to ALL profiles.
 *
 * SEC-T14: Patterns are compiled by picomatch and applied both to the full
 * relative path and to every path segment, so `src/.env.local` is caught as
 * reliably as top-level `.env`.
 */
const GLOBAL_DENYLIST = [
  '**/.env',
  '**/.env.*',
  '**/*.pem',
  '**/*.key',
  '**/*.p12',
  '**/*.pfx',
  '**/credentials.json',
  '**/secrets.yaml',
  '**/secrets.yml',
  '**/secrets/**',
  '**/id_rsa',
  '**/id_ed25519',
  '.git/**',
  'node_modules/**',
];

// =============================================================================
// REPO TOOLS GATE + LIMITS
// =============================================================================

/**
 * Running tsc / vitest / eslint in a user's repo executes that repo's code
 * (configs, test files, plugins). Off unless the operator sets
 * HOLOHEAL_RUN_REPO_TOOLS to exactly "true" or "1". Not set anywhere by default.
 *
 * KEEP THIS OFF until repo tools run in a separate container. The scrubbed env
 * below only keeps secrets out of the child's own environment: the tools still
 * run as the same uid as Studio, so repo code can read Studio's secrets from
 * /proc/$PPID/environ and can read every user's /data/workspaces. Turning this
 * on in the Studio container is a secrets leak and a cross-tenant read.
 */
export function repoToolsEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.HOLOHEAL_RUN_REPO_TOOLS;
  return v === 'true' || v === '1';
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${Math.round(ms / 1000)} s` : `${ms} ms`;
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Copy and scan caps. Overridable by env (not set anywhere by default). */
export function holoHealLimits() {
  return {
    copyMaxFiles: envPositiveInt('HOLOHEAL_COPY_MAX_FILES', 20_000),
    copyMaxBytes: envPositiveInt('HOLOHEAL_COPY_MAX_BYTES', 500 * 1024 * 1024),
    copyTimeoutMs: envPositiveInt('HOLOHEAL_COPY_TIMEOUT_MS', 120_000),
    scanTimeoutMs: envPositiveInt('HOLOHEAL_SCAN_TIMEOUT_MS', 120_000),
    scanMaxFiles: envPositiveInt('HOLOHEAL_SCAN_MAX_FILES', 10_000),
  };
}

/**
 * Environment for a repo tool when the operator has turned tools on: PATH and
 * nothing secret. The Studio process env (API keys, DATABASE_URL, NEXTAUTH
 * secret, GitHub OAuth secrets, Railway token, ...) is never passed down.
 */
export function scrubbedToolEnv(workDir: string): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin',
    HOME: workDir,
    CI: '1',
    NODE_ENV: 'test',
    NO_UPDATE_NOTIFIER: '1',
    npm_config_update_notifier: 'false',
  };
}

/**
 * Run one repo tool via `npx --no-install` (never downloads a package) with the
 * scrubbed env. Rejects like exec does: the error carries stdout/stderr.
 */
function runRepoTool(
  workDir: string,
  toolArgs: string[],
  timeoutMs: number,
  maxBuffer: number
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      'npx',
      ['--no-install', ...toolArgs],
      { cwd: workDir, env: scrubbedToolEnv(workDir), timeout: timeoutMs, maxBuffer },
      (err, stdout, stderr) => {
        if (err) {
          reject(
            Object.assign(err, { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
          );
        } else {
          resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
        }
      }
    );
  });
}

/**
 * Resolve a file named by tool output (e.g. a tsc error path) to a write target
 * inside workDir, or null. Refuses absolute paths, `..` escapes, symlinks, and
 * anything whose real parent directory is outside the real workDir.
 */
export function safeWorkDirTarget(workDir: string, relFile: string): string | null {
  if (!relFile || path.isAbsolute(relFile)) return null;
  const realWork = fs.realpathSync.native(workDir);
  const target = path.resolve(realWork, relFile);
  const rel = path.relative(realWork, target);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  let st: fs.Stats;
  try {
    st = fs.lstatSync(target);
  } catch {
    return null; // nothing to fix there
  }
  if (!st.isFile()) return null; // symlink, dir, device: never written through
  const realParent = fs.realpathSync.native(path.dirname(target));
  const relParent = path.relative(realWork, realParent);
  if (relParent.startsWith('..') || path.isAbsolute(relParent)) return null;
  return target;
}

// =============================================================================
// ABSORB PHASE — codebase graph intelligence
// =============================================================================

/**
 * Phase 0: Build a dependency graph of the isolated workspace in-process with
 * CodebaseScanner + CodebaseGraph from @holoscript/absorb-service/engine.
 *
 * The scan runs inside the Studio server against the Studio filesystem. Until
 * 2026-10-05 this POSTed the workspace path to `${ABSORB_SERVICE}/scan`. That
 * route does not exist (the absorb service mounts POST /api/absorb/scan, behind
 * auth), and a path on this container is not on the absorb service's disk in
 * any case, so every HoloHeal got a 404, the error was dropped, and the job
 * reported an empty graph. Errors now propagate: the caller fails the job with
 * the real message instead of treating a broken scan as an empty project.
 */
export async function runAbsorbPhase(
  workDir: string,
  filesScanned: number
): Promise<{ graph: AbsorbGraphData; scanErrors: string[] }> {
  const absorbStart = Date.now();
  const limits = holoHealLimits();
  const engine = await import('@holoscript/absorb-service/engine');

  // #483's shared policy, with the daemon temp root as the ONLY allowed root
  // (passed as an argument; no process env is read or changed): the engine is
  // only ever pointed at a server-made workspace copy.
  const refusal = engine.absorbRootRefusal(workDir, { ABSORB_ALLOWED_ROOTS: daemonTmpBase() });
  if (refusal) throw new Error(`refusing to scan outside the daemon workspace root: ${workDir}`);

  // Workers resolve their script next to the package's dist folder, which a
  // bundled server chunk does not have; parse on this thread. The signal is
  // checked between discovery and parse batches.
  const scanner = new engine.CodebaseScanner(undefined, false);
  const signal = AbortSignal.timeout(limits.scanTimeoutMs);
  let scanResult: _AbsorbScanResult;
  try {
    scanResult = (await scanner.scan({
      rootDir: workDir,
      maxFiles: limits.scanMaxFiles,
      signal,
      // B3: every file the scanner reads goes through the confined,
      // no-follow reader (regular files inside workDir only).
      readFile: confinedReader(workDir, 1024 * 1024),
      // The copy has no .git; don't spawn git to look for one.
      respectGitIgnore: false,
    })) as _AbsorbScanResult;
  } catch (err: unknown) {
    if (signal.aborted) {
      throw new Error(
        `scan timed out after ${fmtMs(limits.scanTimeoutMs)} (cap HOLOHEAL_SCAN_TIMEOUT_MS)`
      );
    }
    throw err;
  }

  const graph = new engine.CodebaseGraph();
  graph.buildFromScanResult(scanResult);

  // In-degree: how many OTHER files import this one (high = hub = risky).
  const inDegree: Record<string, number> = {};
  for (const file of scanResult.files) {
    if (!(file.path in inDegree)) inDegree[file.path] = 0;
    for (const imp of file.imports ?? []) {
      if (imp.resolvedPath) {
        inDegree[imp.resolvedPath] = (inDegree[imp.resolvedPath] ?? 0) + 1;
      }
    }
  }
  const leafFirstOrder = scanResult.files
    .map((f) => f.path)
    .sort((a, b) => (inDegree[a] ?? 0) - (inDegree[b] ?? 0));

  const communities: Record<string, number> = {};
  let communityIndex = 0;
  for (const members of graph.detectCommunities().values()) {
    for (const filePath of members) communities[filePath] = communityIndex;
    communityIndex += 1;
  }

  const stats = graph.getStats();
  const scanErrors = (scanResult.stats.errors ?? []).map((e: unknown) =>
    typeof e === 'string' ? e : JSON.stringify(e)
  );

  return {
    graph: {
      leafFirstOrder,
      inDegree,
      communities,
      totalFiles: stats.totalFiles,
      totalSymbols: stats.totalSymbols,
      durationMs: Date.now() - absorbStart,
      graphJson: graph.serialize(),
      filesScanned,
    },
    scanErrors,
  };
}

// =============================================================================
// WORKSPACE MANAGEMENT
// =============================================================================

/** Directory names never copied into a daemon workspace (any depth). */
const WORKSPACE_COPY_EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.next']);

/**
 * Same excludes the old rsync call used: node_modules, .git, dist, .next,
 * *.pem, *.key, .env* (matched on the entry name at any depth).
 */
export function isExcludedFromWorkspaceCopy(name: string): boolean {
  return (
    WORKSPACE_COPY_EXCLUDED_DIRS.has(name) ||
    name.endsWith('.pem') ||
    name.endsWith('.key') ||
    name.startsWith('.env')
  );
}

/** Parent of every daemon workspace copy: <tmp>/holoscript-daemon. */
export function daemonTmpBase(): string {
  return path.join(os.tmpdir(), 'holoscript-daemon');
}

export interface IsolatedWorkspace {
  workDir: string;
  cleanup: () => Promise<void>;
  /** Symlinks found in the project: never copied, never followed ("rel -> target"). */
  skippedSymlinks: string[];
  copiedFiles: number;
  copiedBytes: number;
}

/**
 * Creates an isolated workspace directory for the daemon to operate in and
 * copies the project into it with Node's fs.promises.cp.
 *
 * Until 2026-10-05 the copy shelled out to rsync (robocopy on Windows). The
 * Studio runtime image (node:20-alpine) has no rsync, the ENOENT was swallowed,
 * and every job ran on an empty folder. The copy now uses no external binary,
 * and any copy error rejects (after removing the partial folder) so the job
 * fails with the real error text.
 *
 * Safety (Mapping BLOCK B2, 2026-10-05):
 *  - projectPath is checked with checkProjectPath (realpath strictly inside the
 *    workspaces root) before anything is created, and the copy reads from the
 *    resolved real path;
 *  - symlinks are skipped (lstat in the filter; dereference:false), recorded
 *    in skippedSymlinks, and never followed;
 *  - the copy stops with an honest error past copyMaxFiles / copyMaxBytes /
 *    copyTimeoutMs (checked per entry).
 */
export async function createIsolatedWorkspace(
  projectPath: string,
  jobId: string
): Promise<IsolatedWorkspace> {
  const decision = checkProjectPath(projectPath);
  if (!decision.ok) throw new Error(`projectPath refused: ${decision.reason}`);
  const source = decision.realPath;
  const limits = holoHealLimits();

  const tmpBase = daemonTmpBase();
  fs.mkdirSync(tmpBase, { recursive: true });

  const workDir = path.join(tmpBase, jobId);
  const cleanup = async () => {
    await fs.promises.rm(workDir, { recursive: true, force: true });
  };

  const skippedSymlinks: string[] = [];
  let copiedFiles = 0;
  let copiedBytes = 0;
  const deadline = Date.now() + limits.copyTimeoutMs;

  try {
    const sourceStat = await fs.promises.stat(source);
    if (!sourceStat.isDirectory()) {
      throw new Error(`projectPath is not a directory: ${projectPath}`);
    }

    fs.mkdirSync(workDir, { recursive: true });

    // Copy project for analysis. The source root itself is always copied; the
    // filter drops excluded names and every symlink, and enforces the caps.
    await fs.promises.cp(source, workDir, {
      recursive: true,
      force: true,
      errorOnExist: false,
      dereference: false,
      verbatimSymlinks: true,
      filter: async (src) => {
        if (path.resolve(src) === source) return true;
        if (isExcludedFromWorkspaceCopy(path.basename(src))) return false;
        if (Date.now() > deadline) {
          throw new Error(
            `copy took longer than ${fmtMs(limits.copyTimeoutMs)} (cap HOLOHEAL_COPY_TIMEOUT_MS)`
          );
        }
        const st = await fs.promises.lstat(src);
        if (!st.isSymbolicLink()) {
          // B3: a parent directory swapped for a symlink mid-copy would make
          // `src` resolve outside the project; never copy from there.
          const realSrc = await fs.promises.realpath(src);
          const relReal = path.relative(source, realSrc);
          if (relReal.startsWith('..') || path.isAbsolute(relReal)) {
            skippedSymlinks.push(
              `${path.relative(source, src)} (resolves outside the project; skipped)`
            );
            return false;
          }
        }
        if (st.isSymbolicLink()) {
          let target = '?';
          try {
            target = await fs.promises.readlink(src);
          } catch (err: unknown) {
            target = `unreadable link: ${errText(err)}`;
          }
          skippedSymlinks.push(`${path.relative(source, src)} -> ${target}`);
          return false;
        }
        if (st.isFile()) {
          copiedFiles += 1;
          copiedBytes += st.size;
          if (copiedFiles > limits.copyMaxFiles) {
            throw new Error(
              `project has more than ${limits.copyMaxFiles} files (cap HOLOHEAL_COPY_MAX_FILES)`
            );
          }
          if (copiedBytes > limits.copyMaxBytes) {
            throw new Error(
              `project is larger than ${limits.copyMaxBytes} bytes (cap HOLOHEAL_COPY_MAX_BYTES)`
            );
          }
        } else if (!st.isDirectory()) {
          skippedSymlinks.push(`${path.relative(source, src)} (not a regular file; skipped)`);
          return false;
        }
        return true;
      },
    });

    // B3: the copy must hold only regular files and directories. Anything else
    // that got in (e.g. an entry swapped for a symlink between the filter's
    // lstat and the copy) is removed before anything reads the copy.
    for (const removed of removeNonRegularEntries(workDir)) {
      skippedSymlinks.push(`${removed} (found in the copy; removed)`);
    }

    // Marker written after the copy so a project file of the same name cannot
    // overwrite it.
    fs.writeFileSync(
      path.join(workDir, '.daemon-workspace.json'),
      JSON.stringify({
        jobId,
        projectPath,
        createdAt: new Date().toISOString(),
        readonly: true,
      }),
      'utf-8'
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    try {
      await cleanup();
    } catch (cleanupErr: unknown) {
      const cmsg = cleanupErr instanceof Error ? cleanupErr.message : String(cleanupErr);
      throw new Error(
        `copy ${projectPath} -> ${workDir} failed: ${msg} (and removing the partial copy failed: ${cmsg})`
      );
    }
    throw new Error(`copy ${projectPath} -> ${workDir} failed: ${msg}`);
  }

  return { workDir, cleanup, skippedSymlinks, copiedFiles, copiedBytes };
}

/**
 * Remove every symlink / FIFO / device / socket under `root` (lstat-based;
 * nothing is followed). Returns the relative paths removed.
 */
export function removeNonRegularEntries(root: string): string[] {
  const removed: string[] = [];
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.isFile()) {
        fs.rmSync(full, { force: true });
        removed.push(path.relative(root, full));
      }
    }
  }
  walk(root);
  return removed;
}

// =============================================================================
// ROLLBACK SNAPSHOT
// =============================================================================

/**
 * Creates a rollback snapshot of the project state before daemon execution.
 * This is a tarball of the workspace that can be restored if needed.
 */

/** Count non-ignored source-ish files under a workspace copy (for empty-absorb honesty). */
export function countSourceFiles(root: string, max = 5000): number {
  let count = 0;
  const skip = new Set(['node_modules', '.git', 'dist', '.next', 'coverage', 'build', 'out']);
  function walk(dir: string) {
    if (count >= max) return;
    // An unreadable directory throws: a count that silently skips it would
    // under-report what the scanner was given.
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (count >= max) return;
      if (entry.name.startsWith('.') && entry.name !== '.daemon-workspace.json') {
        if (entry.isDirectory()) continue;
      }
      if (entry.isDirectory()) {
        if (skip.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        if (entry.name === '.daemon-workspace.json') continue;
        count += 1;
      }
    }
  }
  walk(root);
  return count;
}

async function createRollbackSnapshot(workDir: string, jobId: string): Promise<string> {
  const snapshotDir = path.join(os.tmpdir(), 'holoscript-daemon', 'snapshots');
  if (!fs.existsSync(snapshotDir)) {
    fs.mkdirSync(snapshotDir, { recursive: true });
  }

  const snapshotPath = path.join(snapshotDir, `${jobId}-rollback.json`);

  // Store file hashes for rollback verification
  const fileList: Array<{ path: string; size: number; mtime: string }> = [];
  // Errors propagate to the caller, which logs them (the snapshot is advisory).
  function walk(dir: string, base: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        const stat = fs.lstatSync(fullPath);
        fileList.push({
          path: relPath,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
        });
      }
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
    'utf-8'
  );

  return snapshotPath;
}

// =============================================================================
// PATH SAFETY CHECK
// =============================================================================

/**
 * SEC-T14: Compile a denylist into a single picomatch matcher.
 *
 * Old behaviour missed nested forms (`src/.env.production` slipped past the
 * hand-rolled `.env.*` branch because the matcher only checked the full
 * normalized path, and `*`-suffix patterns produced `prefix=''` in some
 * inputs — effectively matching everything or nothing depending on arg
 * order).
 *
 * New behaviour:
 *   - Patterns are compiled once per `isPathProtected` call (caller-provided
 *     list is usually 10-20 entries; negligible overhead).
 *   - `picomatch` is called with `dot: true` so patterns match hidden files
 *     and directories the way operators intuitively expect.
 *   - Match is applied to the full normalized path AND to every path
 *     segment. A pattern like `**&#47;.env.*` covers nested envs; the per-
 *     segment check adds belt-and-braces for basename-only patterns.
 */
function compileDenyMatcher(denyPatterns: string[]): (p: string) => boolean {
  if (denyPatterns.length === 0) return () => false;
  const matcher = picomatch(denyPatterns, { dot: true });
  return (p: string) => matcher(p);
}

function isPathProtected(filePath: string, denyPatterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\.?\/+/, '');
  if (!normalized) return false;
  const match = compileDenyMatcher(denyPatterns);

  // Full relative path
  if (match(normalized)) return true;

  // Every path segment (defends against e.g. `build/.env` hidden behind an
  // unsuspecting prefix when a basename-only pattern is supplied).
  const segments = normalized.split('/');
  for (const seg of segments) {
    if (seg && match(seg)) return true;
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
  /** Checks that could not run or could not be read, with the real error text. */
  issues: string[];
}

/**
 * A tool that exits non-zero because it FOUND problems still printed its report;
 * that output is the result. A tool that could not run at all (not installed,
 * killed by the timeout, spawn failure) printed nothing useful: rethrow so the
 * caller records the failure instead of scoring an empty report as clean.
 */
function outputOrThrow(err: unknown): { stdout: string; stderr: string } {
  const e = (err ?? {}) as Record<string, unknown>;
  const stdout = String(e.stdout ?? '');
  const stderr = String(e.stderr ?? '');
  if (e.killed || e.signal || (stdout.trim() === '' && stderr.trim() === '')) {
    throw err instanceof Error ? err : new Error(String(err));
  }
  return { stdout, stderr };
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function assessQuality(workDir: string): Promise<QualityCheckResult> {
  const result: QualityCheckResult = {
    typeErrors: 0,
    testsPassed: 0,
    testsTotal: 0,
    lintErrors: 0,
    lintWarnings: 0,
    compositeScore: 0,
    issues: [],
  };

  // Type check
  try {
    const { stdout, stderr } = await runRepoTool(
      workDir,
      ['tsc', '--noEmit', '--pretty', 'false'],
      120_000,
      50 * 1024 * 1024
    ).catch(outputOrThrow);
    const output = String(stdout) + String(stderr);
    const tsErrors = (output.match(/error TS\d+/g) ?? []).length;
    result.typeErrors = tsErrors;
  } catch (err: unknown) {
    result.typeErrors = -1; // Unknown
    result.issues.push(`tsc could not run: ${errText(err)}`);
  }

  // Test suite
  try {
    const { stdout, stderr } = await runRepoTool(
      workDir,
      ['vitest', 'run', '--reporter=json'],
      180_000,
      50 * 1024 * 1024
    ).catch(outputOrThrow);
    const output = String(stdout) + String(stderr);
    const jsonMatch = output.match(/\{[\s\S]*"numTotalTests"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      result.testsPassed = parsed.numPassedTests ?? 0;
      result.testsTotal = parsed.numTotalTests ?? 0;
    } else {
      result.issues.push(`vitest printed no JSON report: ${output.trim().slice(0, 200)}`);
    }
  } catch (err: unknown) {
    result.issues.push(`vitest could not run: ${errText(err)}`);
  }

  // Lint
  try {
    await runRepoTool(
      workDir,
      ['eslint', '.', '--max-warnings', '0', '--format', 'json'],
      60_000,
      10 * 1024 * 1024
    );
    // Clean lint
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    const output = String(e.stdout ?? '') + String(e.stderr ?? '');
    const summaryMatch = output.match(/(\d+) problems? \((\d+) errors?, (\d+) warnings?\)/);
    if (summaryMatch) {
      result.lintErrors = parseInt(summaryMatch[2], 10);
      result.lintWarnings = parseInt(summaryMatch[3], 10);
    } else {
      result.issues.push(`eslint failed without a readable summary: ${errText(err).slice(0, 200)}`);
    }
  }

  // Composite score (same formula as holo_validate_quality)
  const tscScore = result.typeErrors <= 0 ? 1.0 : 1 / (1 + Math.log(1 + result.typeErrors / 10));
  const testScore = result.testsTotal > 0 ? result.testsPassed / result.testsTotal : 0.5;
  const lintScore =
    result.lintErrors === 0
      ? Math.max(0.8, 1 - result.lintWarnings * 0.01)
      : 1 / (1 + Math.log(1 + result.lintErrors / 5));

  result.compositeScore =
    Math.round(
      (testScore * 0.35 + tscScore * 0.3 + lintScore * 0.15 + (result.typeErrors === 0 ? 0.2 : 0)) *
        100
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
 * Output the quality checks themselves write into the workspace (vitest's JSON
 * report, eslint cache, tsc build info, coverage). These are not changes to the
 * project. On The-Mending-Box (2026-10-05) the only "patch" a run produced was
 * `.vitest/json/output.json`, labelled a typefix — a heal that changed nothing.
 */
const RUNNER_ARTIFACT_PATTERNS = [
  '.vitest/**',
  '**/.vitest/**',
  '.eslintcache',
  '**/.eslintcache',
  '**/*.tsbuildinfo',
  'coverage/**',
  // npm writes its logs/cache under HOME, which is workDir for repo tools.
  '.npm/**',
  '**/.npm/**',
];

/** True when `relPath` is output the runner's own checks wrote. */
export function isRunnerArtifact(relPath: string): boolean {
  return isPathProtected(relPath, RUNNER_ARTIFACT_PATTERNS);
}

/**
 * Immutable baseline of the workspace copy, taken BEFORE any repo tool runs
 * (Mapping/Release BLOCK B3). Patches are diffs of the copy against this
 * baseline; the live original project (decision.realPath) is never re-read
 * after the copy, because it is user-writable while the job runs.
 */
export interface BaselineSnapshot {
  /** Private directory holding the baseline bytes (outside the copy). */
  dir: string;
  /** relPath -> sha256 of the content at snapshot time (held in memory). */
  hashes: Map<string, string>;
  /** Entries not captured (non-regular, unreadable), with the reason. */
  skipped: string[];
}

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf-8').digest('hex');
}

const SNAPSHOT_SKIP_DIRS = new Set(['node_modules', '.git']);

/**
 * Read every regular file of the copy (lstat-classified, opened O_NOFOLLOW and
 * verified on the handle via readConfinedRegularFile) and store its bytes in
 * `snapshotDir` plus its sha256 in memory. Symlinks and special files are
 * skipped and reported, never followed.
 */
export function takeBaselineSnapshot(workDir: string, snapshotDir: string): BaselineSnapshot {
  const hashes = new Map<string, string>();
  const skipped: string[] = [];
  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  function walk(dir: string, base: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SNAPSHOT_SKIP_DIRS.has(entry.name) || entry.name === '.daemon-workspace.json') continue;
      const relPath = path.join(base, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(path.join(dir, entry.name), relPath);
        continue;
      }
      if (!entry.isFile()) {
        skipped.push(`${relPath}: not a regular file (not captured)`);
        continue;
      }
      const r = readConfinedRegularFile(workDir, relPath);
      if (!r.ok) {
        skipped.push(`${relPath}: ${r.reason}`);
        continue;
      }
      const dest = path.join(snapshotDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true, mode: 0o700 });
      fs.writeFileSync(dest, r.content, { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
      hashes.set(relPath, sha256(r.content));
    }
  }
  walk(workDir, '');
  return { dir: snapshotDir, hashes, skipped };
}

/**
 * Diff the workspace copy against the baseline snapshot taken before the
 * tools ran, producing unified diffs for each modified or created file.
 *
 * - Only lstat-regular files of the copy are compared; symlinks and special
 *   files are reported in `skipped`, never read.
 * - Every read goes through readConfinedRegularFile (confined, O_NOFOLLOW,
 *   verified on the open handle).
 * - Baseline content is accepted only if its sha256 still matches the hash
 *   recorded in memory at snapshot time.
 * - The live original project is not an input: it is never read here.
 */
export async function detectChanges(
  baseline: BaselineSnapshot,
  workDir: string,
  denyPatterns: string[],
  maxFiles: number
): Promise<{ patches: PatchProposal[]; skipped: string[]; artifacts: string[] }> {
  const patches: PatchProposal[] = [];
  /** Files that could not be compared, with the real reason. */
  const skipped: string[] = [];
  /** New files the quality checks wrote (not project changes); reported, not proposed. */
  const artifacts: string[] = [];

  // Directory read errors propagate (the caller logs them); a single file that
  // cannot be read is recorded in `skipped` and reported, not hidden.
  function walk(dir: string, base: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (
        entry.name === 'node_modules' ||
        entry.name === '.git' ||
        entry.name === '.daemon-workspace.json'
      )
        continue;
      const fullPath = path.join(dir, entry.name);
      const relPath = path.join(base, entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
        continue;
      }
      if (!entry.isFile()) {
        skipped.push(`${relPath}: not a regular file in the copy (symlink or special; not read)`);
        continue;
      }
      if (patches.length >= maxFiles) return;
      if (isPathProtected(relPath, denyPatterns)) continue;

      const expected = baseline.hashes.get(relPath);
      if (expected === undefined && isRunnerArtifact(relPath)) {
        artifacts.push(relPath);
        continue;
      }
      const now = readConfinedRegularFile(workDir, relPath);
      if (!now.ok) {
        skipped.push(`${relPath}: copy ${now.reason}`);
        continue;
      }
      const newContent = now.content;
      if (expected === undefined) {
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
        continue;
      }
      if (sha256(newContent) === expected) continue; // unchanged
      const old = readConfinedRegularFile(baseline.dir, relPath);
      if (!old.ok || sha256(old.content) !== expected) {
        skipped.push(
          `${relPath}: baseline snapshot ${!old.ok ? old.reason : 'changed since it was taken (refused)'}`
        );
        continue;
      }
      patches.push({
        id: generatePatchId(),
        filePath: relPath,
        action: 'modify',
        diff: generateUnifiedDiff(relPath, old.content, newContent),
        proposedContent: newContent,
        description: `Modified ${relPath}`,
        confidence: 0.8,
        category: inferPatchCategory(relPath, newContent),
      });
    }
  }

  walk(workDir, '');
  return { patches, skipped, artifacts };
}

function inferPatchCategory(filePath: string, content: string): PatchProposal['category'] {
  if (
    filePath.includes('.test.') ||
    filePath.includes('__tests__') ||
    filePath.includes('.spec.')
  ) {
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

  const diffLines: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  // Simple line-by-line diff (not a full Myers diff, but sufficient for review)
  const maxLen = Math.max(oldLines.length, newLines.length);
  let hunkStart = -1;
  let hunkOld: string[] = [];
  let hunkNew: string[] = [];

  function flushHunk() {
    if (hunkOld.length === 0 && hunkNew.length === 0) return;
    diffLines.push(
      `@@ -${Math.max(1, hunkStart + 1)},${hunkOld.length} +${Math.max(1, hunkStart + 1)},${hunkNew.length} @@`
    );
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
  log?: DaemonLogEntry
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
  customLimits?: Partial<DaemonJobLimits>
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
  log('info', `Scanning projectPath=${projectPath}`);
  log('info', `Project DNA: ${dna.kind} (${Math.round(dna.confidence * 100)}% confidence)`);
  log(
    'info',
    `Limits: ${limits.maxCycles} cycles, ${limits.maxFilesChanged} max files, ${limits.timeoutMs}ms timeout`
  );

  const toolsOn = repoToolsEnabled();
  const hhLimits = holoHealLimits();

  // Step 0: Confinement. Every caller (API route, Brittney, HoloDaemon) passes
  // through here; there is no cwd fallback.
  const decision = checkProjectPath(projectPath);
  if (!decision.ok) {
    const reason = `Blocked: projectPath refused — ${decision.reason}`;
    log('error', reason);
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
      summary: reason,
      durationMs: Date.now() - startTime,
      error: reason,
      absorb: null,
    };
  }

  // Step 1: Create isolated workspace
  onProgress(5, 'Creating isolated workspace...');
  let workDir: string;
  let cleanup: () => Promise<void>;

  try {
    const ws = await createIsolatedWorkspace(projectPath, jobId);
    workDir = ws.workDir;
    cleanup = ws.cleanup;
    log(
      'info',
      `Workspace created at ${workDir} (${ws.copiedFiles} files, ${Math.round(ws.copiedBytes / 1024)} KB copied)`
    );
    if (ws.skippedSymlinks.length > 0) {
      log(
        'warn',
        `Skipped ${ws.skippedSymlinks.length} symlink(s)/special file(s) — not copied, not followed: ${ws.skippedSymlinks.slice(0, 10).join(' | ')}${ws.skippedSymlinks.length > 10 ? ` (+${ws.skippedSymlinks.length - 10} more)` : ''}`
      );
    }
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

  let absorbData: AbsorbGraphData | null = null;

  /** Cleanup is advisory: a failure is logged with its real error, never hidden. */
  async function cleanupLoudly(): Promise<boolean> {
    try {
      await cleanup();
      return true;
    } catch (err: unknown) {
      log('warn', `Workspace cleanup failed for ${workDir}: ${errText(err)}`);
      return false;
    }
  }

  async function blocked(reason: string, error: string = reason): Promise<DaemonRunResult> {
    await cleanupLoudly();
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
      summary: reason,
      durationMs: Date.now() - startTime,
      error,
      absorb: absorbData,
    };
  }

  // Phase 0: Absorb — build codebase dependency graph (leaf-first ordering)
  onProgress(7, 'Absorbing codebase graph...');
  log('info', 'Phase 0: absorb — scanning dependency graph (in-process)...');

  // Files the scanner is handed; also the N in "Absorb empty (N files scanned)".
  let filesScanned: number;
  try {
    filesScanned = countSourceFiles(workDir, hhLimits.scanMaxFiles + 1);
  } catch (err: unknown) {
    const reason = `Blocked: could not read the workspace copy at ${workDir} — ${errText(err)}`;
    log('error', reason);
    return blocked(reason);
  }

  if (filesScanned > hhLimits.scanMaxFiles) {
    const reason = `Blocked: project too large to scan — more than ${hhLimits.scanMaxFiles} files in the copy (cap HOLOHEAL_SCAN_MAX_FILES). Not scanning a partial project.`;
    log('error', reason);
    return blocked(reason);
  }

  if (filesScanned === 0) {
    // The copy has nothing. Say whether the source does, so an empty copy is
    // never reported as an import problem (or the other way round).
    let sourceCount: string;
    try {
      sourceCount = String(countSourceFiles(projectPath));
    } catch (err: unknown) {
      sourceCount = `unreadable (${errText(err)})`;
    }
    const reason =
      sourceCount === '0'
        ? `Blocked: projectPath has 0 source files (projectPath=${projectPath}, workDir=${workDir}). Verify the import landed under HOLOSCRIPT_WORKSPACES_DIR and Assign Agent passed that path.`
        : `Blocked: workspace copy failed — projectPath has ${sourceCount} source files but the copy has 0 (projectPath=${projectPath}, workDir=${workDir}).`;
    log('error', reason);
    return blocked(reason);
  }

  let scanErrors: string[] = [];
  try {
    const scanned = await runAbsorbPhase(workDir, filesScanned);
    absorbData = scanned.graph;
    scanErrors = scanned.scanErrors;
  } catch (err: unknown) {
    const msg = errText(err);
    log('error', `Absorb phase failed: ${msg} (projectPath=${projectPath}, workDir=${workDir})`);
    return blocked(`Blocked: Absorb failed — ${msg}`, msg);
  }

  if (scanErrors.length > 0) {
    log(
      'warn',
      `Absorb scan reported ${scanErrors.length} file error(s): ${scanErrors.slice(0, 3).join(' | ')}`
    );
  }

  if (absorbData.totalFiles === 0 && scanErrors.length > 0) {
    // Every file errored: that is a failed Absorb, not an empty project.
    const msg = `the scanner reported ${scanErrors.length} error(s) and built no graph: ${scanErrors.slice(0, 3).join(' | ')}`;
    log('error', `Absorb phase failed: ${msg}`);
    return blocked(`Blocked: Absorb failed — ${msg}`, msg);
  }

  if (absorbData.totalFiles === 0) {
    const reason = `${absorbEmptyLabel(filesScanned)}. The scanner was handed ${filesScanned} file(s) (the workspace copy), reported 0 errors, and built no graph (workDir=${workDir}, projectPath=${projectPath}). Not claiming heal success.`;
    log('error', reason);
    return blocked(reason);
  }

  log(
    'info',
    `Absorb complete: ${absorbData.totalFiles} files in graph (${filesScanned} scanned), ${absorbData.totalSymbols} symbols in ${absorbData.durationMs}ms`
  );
  log(
    'info',
    `Leaf-first order: ${absorbData.leafFirstOrder.slice(0, 5).join(', ')}${absorbData.leafFirstOrder.length > 5 ? ` (+${absorbData.leafFirstOrder.length - 5} more)` : ''}`
  );

  // B1: without a sandbox, stop here. Phases 1-2 would run the repo's own
  // tools (its code) inside the Studio server.
  if (!toolsOn) {
    log(
      'info',
      "Repo checks skipped: tsc / vitest / eslint and auto-fixes run the repository's own code, and no sandbox is enabled (HOLOHEAL_RUN_REPO_TOOLS is off)."
    );
    // B3: nothing ran that could change the copy, so there is nothing to
    // diff. The original tree is NOT re-read: it is live and user-writable,
    // and comparing against it is how a swapped symlink leaked server files.
    const proposals: PatchProposal[] = [];
    log(
      'info',
      'Patch proposals: none. No check or fix ran, so the copy is unchanged; the original files are not re-read.'
    );
    onProgress(95, 'Cleaning up workspace...');
    if (await cleanupLoudly()) log('info', 'Workspace cleaned up');
    onProgress(100, 'Complete');
    const summary = `${CHECKS_SKIPPED_LABEL}. Absorb built a graph of ${absorbData.totalFiles} file(s) from ${filesScanned} in the copy; repo checks and auto-fixes did not run because they would execute this repository's code on the Studio server. ${proposals.length} patch proposal(s). Not a heal.`;
    log('info', summary);
    return {
      success: true,
      cycles: 0,
      filesAnalyzed: 0,
      filesChanged: proposals.length,
      qualityBefore: 0,
      qualityAfter: 0,
      qualityDelta: 0,
      patches: proposals,
      logs,
      summary,
      durationMs: Date.now() - startTime,
      absorb: absorbData,
      checksSkipped: true,
    };
  }

  // B3: immutable baseline of the copy BEFORE any repo tool runs. Patches are
  // diffs against this, never against the live original project.
  const baselineDir = `${workDir}.baseline`;
  const removeWorkDir = cleanup;
  cleanup = async () => {
    await removeWorkDir();
    await fs.promises.rm(baselineDir, { recursive: true, force: true });
  };
  let baseline: BaselineSnapshot;
  try {
    baseline = takeBaselineSnapshot(workDir, baselineDir);
    log(
      'info',
      `Baseline snapshot of the copy: ${baseline.hashes.size} file(s) captured before any tool ran`
    );
    if (baseline.skipped.length > 0) {
      log(
        'warn',
        `Baseline snapshot skipped ${baseline.skipped.length} entr(y/ies): ${baseline.skipped.slice(0, 10).join(' | ')}`
      );
    }
  } catch (err: unknown) {
    const reason = `Blocked: could not snapshot the workspace copy before running checks — ${errText(err)}`;
    log('error', reason);
    return blocked(reason);
  }

  // Step 2: Rollback snapshot
  onProgress(10, 'Creating rollback snapshot...');
  let snapshotPath: string;
  try {
    snapshotPath = await createRollbackSnapshot(workDir, jobId);
    log('info', `Rollback snapshot saved: ${snapshotPath}`);
  } catch (err: unknown) {
    log(
      'warn',
      `Rollback snapshot failed (non-fatal): ${err instanceof Error ? err.message : String(err)}`
    );
    snapshotPath = '';
  }

  // Step 3: Baseline quality assessment
  onProgress(15, 'Assessing baseline quality...');
  log('info', 'Running baseline quality assessment (tsc + vitest + eslint)...');
  let baselineQuality: QualityCheckResult;
  try {
    baselineQuality = await assessQuality(workDir);
    log(
      'info',
      `Baseline: score=${baselineQuality.compositeScore}, typeErrors=${baselineQuality.typeErrors}, tests=${baselineQuality.testsPassed}/${baselineQuality.testsTotal}`
    );
    for (const issue of baselineQuality.issues) log('warn', `Baseline check: ${issue}`);
  } catch (err: unknown) {
    log('warn', `Baseline assessment partial: ${err instanceof Error ? err.message : String(err)}`);
    baselineQuality = {
      typeErrors: -1,
      testsPassed: 0,
      testsTotal: 0,
      lintErrors: 0,
      lintWarnings: 0,
      compositeScore: 0,
      issues: [errText(err)],
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
      const { stdout, stderr } = await runRepoTool(
        workDir,
        ['tsc', '--noEmit', '--pretty', 'false'],
        120_000,
        50 * 1024 * 1024
      ).catch(outputOrThrow);

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
        if (isPathProtected(file, allDenyPatterns)) continue;
        // Writes stay inside workDir: no absolute / `..` / symlinked targets.
        const fullPath = safeWorkDirTarget(workDir, file);
        if (!fullPath) {
          log(
            'warn',
            `Refused fix target outside the workspace copy (or not a regular file): ${file}`
          );
          continue;
        }

        // Warn when touching hub nodes (high in-degree = many dependents)
        const inDeg = absorbData?.inDegree[file] ?? 0;
        if (inDeg >= 5) {
          log('warn', `Hub file (in-degree=${inDeg}): ${file} — fixing conservatively`);
        }

        try {
          const current = readConfinedRegularFile(workDir, fullPath);
          if (!current.ok) {
            log('warn', `Refused to read fix target ${file}: ${current.reason}`);
            continue;
          }
          let content = current.content;
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
            // O_NOFOLLOW: a symlink swapped in since the check is not written through.
            const wfd = fs.openSync(
              fullPath,
              fs.constants.O_WRONLY | fs.constants.O_TRUNC | (fs.constants.O_NOFOLLOW ?? 0)
            );
            try {
              fs.writeFileSync(wfd, content, 'utf-8');
            } finally {
              fs.closeSync(wfd);
            }
            fixesApplied++;
            log('info', `Applied type fixes to ${file}${inDeg > 0 ? ` (in-degree=${inDeg})` : ''}`);
          }
        } catch (err: unknown) {
          log('warn', `Could not apply fixes to ${file}: ${errText(err)}`);
        }
      }

      log('info', `Applied fixes to ${fixesApplied} files in cycle ${cycle + 1}`);
    } catch (err: unknown) {
      log(
        'warn',
        `Cycle ${cycle + 1} analysis error: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // 4c. Re-assess quality
    onProgress(cycleProgress + 10, `Cycle ${cycle + 1}: Re-assessing quality...`);
    try {
      currentQuality = await assessQuality(workDir);
      log(
        'info',
        `Post-cycle ${cycle + 1}: score=${currentQuality.compositeScore}, typeErrors=${currentQuality.typeErrors}`
      );
      for (const issue of currentQuality.issues) log('warn', `Cycle ${cycle + 1} check: ${issue}`);
    } catch (err: unknown) {
      log('warn', `Quality re-assessment failed in cycle ${cycle + 1}: ${errText(err)}`);
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
    const detected = await detectChanges(
      baseline,
      workDir,
      allDenyPatterns,
      limits.maxFilesChanged
    );
    patches = detected.patches;
    log('info', `Generated ${patches.length} patch proposal(s)`);
    if (detected.artifacts.length > 0) {
      log(
        'info',
        `Ignored ${detected.artifacts.length} file(s) written by the checks themselves: ${detected.artifacts.slice(0, 3).join(', ')}`
      );
    }
    if (detected.skipped.length > 0) {
      log(
        'warn',
        `Could not compare ${detected.skipped.length} file(s): ${detected.skipped.slice(0, 10).join(' | ')}`
      );
    }
  } catch (err: unknown) {
    log('warn', `Patch detection error: ${err instanceof Error ? err.message : String(err)}`);
  }

  // Step 6: Cleanup
  onProgress(95, 'Cleaning up workspace...');
  if (await cleanupLoudly()) {
    log('info', 'Workspace cleaned up');
  }

  // Step 7: Build result
  const qualityDelta =
    Math.round((currentQuality.compositeScore - baselineQuality.compositeScore) * 100) / 100;
  const durationMs = Date.now() - startTime;

  onProgress(100, 'Complete');
  log(
    'info',
    `Daemon job complete: ${patches.length} patches, quality delta ${qualityDelta >= 0 ? '+' : ''}${qualityDelta}, ${durationMs}ms`
  );

  let summary: string;
  if (patches.length > 0) {
    summary = `Analyzed ${filesAnalyzed} type errors across ${cyclesCompleted} cycle(s). Produced ${patches.length} patch proposal(s) with quality delta ${qualityDelta >= 0 ? '+' : ''}${qualityDelta}.`;
  } else if (filesAnalyzed === 0 && qualityDelta === 0) {
    summary = `Finished, nothing examined — not a heal success. (0 files analyzed, 0 patches, delta +0; projectPath=${projectPath})`;
  } else if (qualityDelta === 0) {
    summary = `Finished, nothing to change. (${filesAnalyzed} examined, 0 patches, delta +0)`;
  } else {
    summary = `Analyzed project in ${cyclesCompleted} cycle(s). No actionable improvements found for the "${profile}" profile.`;
  }

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
