// Shared build-verify runner for compile targets.
//
// The golden-diff gate (golden-diff.mts) proves the emit byte-matches a committed
// reference. This runner takes the next step the compiler farm has been missing
// (F.126: validation IS construction; W.802/W.803): it proves the emitted source
// actually BUILDS with a real toolchain, not just that it matches a string.
//
// A target supplies:
//   - a freshly-emitted path-keyed file map (target compiler compileToFiles()),
//   - a committed, buildable reference skeleton dir (gradle/cargo/etc scaffold +
//     the @generated sources the emit overwrites),
//   - a toolchain command (e.g. ./gradlew assembleDebug, cargo build).
//
// The runner copies the emit OVER the skeleton in a throwaway working tree, runs
// the toolchain, and reports PASS / FAIL with the build's own output. Running
// against a fresh copy of the emit (not the committed reference) is what makes
// this a build-verify of the COMPILER, not of the checked-in artifact.
//
// Designed to degrade gracefully in CI/dev without the toolchain: if the toolchain
// binary is absent and { requireToolchain: false }, it reports SKIPPED (exit 0)
// after a dry-run that still proves the file map writes cleanly over the skeleton.
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';

export interface BuildVerifyConfig {
  /** Short label for the target, e.g. 'android-xr'. Used in log lines. */
  target: string;
  /** Freshly-emitted path-keyed file map (relative path → contents). */
  emitted: Record<string, string>;
  /**
   * Committed, buildable reference skeleton. Copied to a temp dir; the emit is
   * written over it. Must contain the toolchain scaffold (wrapper, build config).
   */
  skeletonDir: string;
  /** Toolchain command + args, run with cwd = the temp build dir. e.g. ['./gradlew','assembleDebug','--no-daemon']. */
  buildCommand: string[];
  /**
   * Optional probe that proves the UNDERLYING toolchain (not just the wrapper
   * script) is usable — e.g. a gradle wrapper is present but needs a JDK, cargo
   * needs rustc. Run as [cmd, ...args] from the build cwd; a non-zero/error result
   * with requireToolchain=false yields SKIPPED instead of a misleading build FAIL.
   * Example: { command: ['java', '-version'] }.
   */
  toolchainProbe?: { command: string[] };
  /** Sub-path under the build dir to run the command in (default: the build dir root). */
  buildCwdRel?: string;
  /**
   * Path(s) (relative to the build cwd) that must exist after a successful build
   * for it to count as a real build (e.g. an APK glob's parent dir). Optional —
   * a zero exit code is the primary success signal.
   */
  expectArtifacts?: string[];
  /**
   * If false (default), a missing toolchain binary reports SKIPPED (exit 0) after
   * the dry write-over. If true, a missing toolchain is a FAIL.
   */
  requireToolchain?: boolean;
  /** Max build time in ms before the runner kills it and FAILs. Default 15min. */
  timeoutMs?: number;
}

export interface BuildVerifyResult {
  target: string;
  status: 'PASS' | 'FAIL' | 'SKIPPED';
  exitCode: number | null;
  message: string;
}

/** Write the emitted file map over a skeleton copy. Returns the temp build dir. */
function materialize(skeletonDir: string, emitted: Record<string, string>): string {
  const workDir = mkdtempSync(join(tmpdir(), 'holo-build-verify-'));
  cpSync(skeletonDir, workDir, { recursive: true });
  for (const [rel, content] of Object.entries(emitted)) {
    const out = join(workDir, rel);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, content);
  }
  return workDir;
}

/** True if `cmd` refers to a local wrapper script (e.g. ./gradlew) rather than a PATH binary. */
function isLocalScript(cmd: string): boolean {
  return cmd.startsWith('./') || cmd.startsWith('.\\') || isAbsolute(cmd);
}

/**
 * Resolve a local wrapper command to the platform-correct absolute path. On
 * Windows a `./gradlew` request is served by the committed `gradlew.bat`; passing
 * a forward-slash relative path to a shell-mode spawn fails on cmd.exe, so we
 * resolve to an absolute, platform-suffixed path here. PATH binaries are returned
 * unchanged (the shell resolves them).
 */
function resolveCommand(buildCwd: string, cmd: string): string {
  if (!isLocalScript(cmd)) return cmd;
  const base = isAbsolute(cmd) ? cmd : join(buildCwd, cmd.replace(/^\.[/\\]/, ''));
  if (process.platform === 'win32') {
    if (existsSync(`${base}.bat`)) return `${base}.bat`;
    if (existsSync(`${base}.cmd`)) return `${base}.cmd`;
    if (base.endsWith('.bat') || base.endsWith('.cmd')) return base;
    if (existsSync(base)) return base;
    // Strip a unix-only suffix expectation: try the .bat sibling of a suffixless name.
    const bat = `${base.replace(/\.(sh)$/, '')}.bat`;
    if (existsSync(bat)) return bat;
  }
  return base;
}

/** Resolve whether the build command's binary is runnable from a cwd. */
function toolchainPresent(buildCwd: string, cmd: string): boolean {
  // Local wrapper script (e.g. ./gradlew, ./mvnw) → check the resolved file exists.
  if (isLocalScript(cmd)) {
    const resolved = resolveCommand(buildCwd, cmd);
    return existsSync(resolved);
  }
  // PATH binary (e.g. gradle, cargo) → probe with --version.
  const probe = spawnSync(cmd, ['--version'], { stdio: 'ignore', shell: process.platform === 'win32' });
  return probe.status === 0 || probe.status === null ? probe.error == null : false;
}

/**
 * Run a target's build-verify. Materializes the emit over the skeleton, runs the
 * toolchain, and returns a structured result. Does not call process.exit — the
 * caller decides (see runBuildVerifyGate for the CLI exit-code wrapper).
 */
export function buildVerify(config: BuildVerifyConfig): BuildVerifyResult {
  const {
    target,
    emitted,
    skeletonDir,
    buildCommand,
    toolchainProbe,
    buildCwdRel = '.',
    expectArtifacts = [],
    requireToolchain = false,
    timeoutMs = 15 * 60 * 1000,
  } = config;

  if (!existsSync(skeletonDir)) {
    return { target, status: 'FAIL', exitCode: null, message: `skeleton dir not found: ${skeletonDir}` };
  }
  if (Object.keys(emitted).length === 0) {
    return { target, status: 'FAIL', exitCode: null, message: 'emit produced 0 files — nothing to build' };
  }

  let workDir = '';
  try {
    workDir = materialize(skeletonDir, emitted);
    const buildCwd = join(workDir, buildCwdRel);
    const [cmd, ...args] = buildCommand;

    const wroteOk = `emit wrote ${Object.keys(emitted).length} file(s) over skeleton cleanly (dry write-over OK)`;

    if (!toolchainPresent(buildCwd, cmd)) {
      const msg = `toolchain '${cmd}' not available; ${wroteOk}`;
      return requireToolchain
        ? { target, status: 'FAIL', exitCode: null, message: `${msg} — requireToolchain=true` }
        : { target, status: 'SKIPPED', exitCode: 0, message: msg };
    }

    // Probe the underlying toolchain prerequisite (e.g. JDK for gradle). A present
    // wrapper with a missing prerequisite is "toolchain absent", not a build FAIL.
    if (toolchainProbe) {
      const [pcmd, ...pargs] = toolchainProbe.command;
      const probe = spawnSync(pcmd, pargs, {
        stdio: 'ignore',
        shell: process.platform === 'win32',
      });
      const probeOk = probe.error == null && (probe.status === 0 || probe.status === null);
      if (!probeOk) {
        const msg = `toolchain prerequisite '${pcmd}' not usable; ${wroteOk}`;
        return requireToolchain
          ? { target, status: 'FAIL', exitCode: null, message: `${msg} — requireToolchain=true` }
          : { target, status: 'SKIPPED', exitCode: 0, message: msg };
      }
    }

    // Windows .bat/.cmd cannot be exec'd directly by Node (EINVAL) — they need a
    // shell. A bare PATH binary on Windows also needs the shell to resolve .cmd
    // shims. POSIX wrapper scripts (./gradlew) exec directly without a shell. We
    // resolve local wrappers to an absolute path first so shell mode (which on
    // Windows would otherwise choke on a './' relative path) gets a clean target.
    const resolved = resolveCommand(buildCwd, cmd);
    const isBatch = /\.(bat|cmd)$/i.test(resolved);
    const useShell = isBatch || (!isLocalScript(cmd) && process.platform === 'win32');
    // When shelling out, pass ONE command string (Node DEP0190: passing an args
    // array with shell:true concatenates unescaped). Quote the resolved binary and
    // each arg. Without a shell, pass the args array directly (the safe path).
    const run = useShell
      ? spawnSync(`"${resolved}" ${args.map((a) => `"${a}"`).join(' ')}`, {
          cwd: buildCwd,
          stdio: 'inherit',
          timeout: timeoutMs,
          shell: true,
        })
      : spawnSync(resolved, args, {
          cwd: buildCwd,
          stdio: 'inherit',
          timeout: timeoutMs,
          shell: false,
        });

    if (run.error) {
      return { target, status: 'FAIL', exitCode: null, message: `build process error: ${run.error.message}` };
    }
    if (run.status !== 0) {
      return { target, status: 'FAIL', exitCode: run.status, message: `build exited ${run.status}` };
    }

    for (const rel of expectArtifacts) {
      if (!existsSync(join(buildCwd, rel))) {
        return {
          target,
          status: 'FAIL',
          exitCode: 0,
          message: `build exited 0 but expected artifact missing: ${rel}`,
        };
      }
    }

    return {
      target,
      status: 'PASS',
      exitCode: 0,
      message: `build succeeded${expectArtifacts.length ? ` (${expectArtifacts.length} artifact(s) present)` : ''}`,
    };
  } finally {
    if (workDir) {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* best-effort temp cleanup */
      }
    }
  }
}

/**
 * CLI wrapper: run buildVerify and exit with the right code.
 * PASS / SKIPPED → 0, FAIL → 1.
 */
export function runBuildVerifyGate(config: BuildVerifyConfig): never {
  const r = buildVerify(config);
  const icon = r.status === 'PASS' ? '✅' : r.status === 'SKIPPED' ? '⏭️ ' : '❌';
  console.log(`${icon} build-verify [${r.target}] ${r.status}: ${r.message}`);
  process.exit(r.status === 'FAIL' ? 1 : 0);
}
